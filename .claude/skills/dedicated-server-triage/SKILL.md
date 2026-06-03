---
name: dedicated-server-triage
description: >-
  Diagnose and fix the IridescentCraft DEDICATED SERVER when it crashes on load,
  won't boot, or won't pick up a fix. Covers the crash-report -> classify -> fix
  at the repo source -> push -> re-sync -> restart -> verify loop, the
  service-mode "my push didn't reach the server" trap, and the recurring
  client-only-mod-on-a-server crash class (embeddium/rubidium/oculus). USE THIS
  SKILL whenever the user says the server crashed, the server box is down, "check
  the server", a fix "didn't re-sync out", the server is out of sync with the
  repo, a jar shows stale on the server, or a client-only mod broke the server —
  even if they just say "we got a crash on server load". The live server is
  DOWNSTREAM of pushed HEAD but does NOT always pull on its own, so always reason
  about the sync mode before declaring a fix shipped.
---

# Dedicated-server triage (IridescentCraft)

## Mental model (read first)

The dev repo's `.minecraft\server_distribution\` is the **source**. The live server runs on a separate Windows box, launched by `iridescentserver.bat` (usually under an NSSM service named `IridescentMC`). It is downstream of pushed repo HEAD, but **how** it pulls depends on the mode:

- **Normal (interactive) launch** runs phases each boot: Phase -1 `sync_from_repo.bat` (robocopy `/MIR` mirror from the Z: repo share), Phase 0 `phase0_sync.ps1` (GitHub-API diff vs `.icraft_last_sha`), Phase 3 mod hygiene (`strip_client_mods` -> `cleanup_stale_jars.ps1` -> `update_mods.ps1`).
- **Service mode (`ICRAFT_SERVICE_MODE=1`, the production config)** **SKIPS Phase -1, Phase 0, AND mod-sync** — "deployed state is authoritative." A `git push` therefore does **NOT** reach a service-mode server on its own. This is the single most common "I pushed the fix but it still crashes" trap.

**Always fix at the repo source, never the live runtime** — the runtime is overwritten on the next sync.

## Paths (this pack)

- Repo source: `<repo>\.minecraft\server_distribution\` (call `<repo>` = `C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft`).
- Live runtime (server box, via Z: share): `Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\` (mods at `…\mods`).
- Launcher: `iridescentserver.bat` / `iridescentserver.sh`; bare Forge launch `run.bat` / `run.sh`. Service: NSSM `IridescentMC`, env flag `ICRAFT_SERVICE_MODE=1`, force flag `iridescentserver.bat /force`. Experimental GUI launcher `icraft-gui.exe` runs from the `IridescentCraft Dedicated Server\` runtime subfolder (Mesa OpenGL DLLs alongside on GPU-less VMs); it self-updates via its **Sync** / **Update Launcher** buttons, which pull the canonical `server_distribution\icraft-gui.exe`.
- Logs: `logs\latest.log`, `logs\debug.log`. Crashes: `crash-reports\crash-*.txt` (Forge). Post-exit snapshot: `crash-<date>_<time>.log`, pushed by `push_crash_logs.bat` to `<repo>\.minecraft\TesterLogs\Server Logs\`.
- Mod hygiene: `strip_client_mods.bat`/`.sh`, `cleanup_stale_jars.ps1`, `update_mods.ps1`, `client_only_mods.txt`, `custom_jars_manifest.json`.
- Sync: `sync_from_repo.bat`/`.sh`, `phase0_sync.ps1`, marker `.icraft_last_sha`.
- Preflight: `diagnose.bat` / `diagnose.ps1` (Java, RAM, disk, mod count, custom-jar SHA, recent crashes).
- Internal runbooks: `IridescentCraft-internal\dev\deployment-and-utility-guide.md`, `dev\lessons-learned.md`.

## Triage flow

1. **Get the signal.** Read the NEWEST `crash-reports\crash-*.txt` (not the rolled `latest.log`) and tail `logs\latest.log`. If you only have the pushed copies, look in `<repo>\.minecraft\TesterLogs\Server Logs\`.
2. **Classify** against the signatures below.
3. **Fix at the repo source** under `<repo>\.minecraft\…` (or the relevant mod's resources). Never edit the Z: runtime.
4. **Push** (standing auto-push to main).
5. **Re-sync the server (mode-aware, below) + restart.**
6. **Verify:** watch `logs\latest.log` for "Done preparing level"/"For help, type \"help\"" and confirm no new `crash-reports\crash-*.txt`.

## Crash signatures (known)

- **Client-only mod loaded on the server (#19-20, embeddium).** Crash during mod load referencing a rendering/client class (embeddium / rubidium / oculus / Prism / a UI mod). ROOT: the mod's `.pw.toml` was **present in `server_distribution\mods\.index\`**, and `cleanup_stale_jars.ps1` gates on `.pw.toml` PRESENCE, not the `side` field — so the server downloaded and loaded it. FIX: (a) **DELETE that mod's `.pw.toml` from `server_distribution\mods\.index\`** (absent from the index ⇒ never downloaded); (b) add the jar name to `client_only_mods.txt` and the `strip_client_mods.bat`/`.sh` patterns; (c) keep its client-distro `.pw.toml` at `side='client'`. **`side='client'` ALONE does not protect the server** — the index entry must be gone.
- **Both-sides mod dropped from the server → the CLIENT now DCs on join (registry NPE).** After you remove a `side='both'` mod from the server to fix a server crash (delete its `.pw.toml` from the distro `mods\.index\`), the **client must drop it too** — otherwise the client still registers that mod's content and the join handshake fails with `NullPointerException: Registry Object not present: <namespace>:<id>` (real case: `soulsweapons:ghostly` after Marium's Soulslike was dropped, `902f1e9`). The client purge only lands if the **test instance actually synced to origin** — a stale/diverged instance keeps the removed jar (the prelaunch sync used to silently stick on a stray local commit and drift 120 commits behind; fixed 2026-06-03 with force-sync + index reconcile, see lessons-learned). **FIRST check the instance is at origin HEAD:** `git -C <instance> rev-list --count HEAD..origin/main` must be `0` (non-zero = stale → `git -C <instance> fetch origin; git -C <instance> reset --hard origin/main`, then relaunch). Even after a sync, the instance's overlaid `mods\.index\` can keep the removed mod as an **untracked leftover** — `prism_prelaunch.bat`'s Phase-2 `reconcile_client_index.ps1` purges that (drops untracked tomls absent from origin's main index + the client-distro index, while preserving the client-only overlay). The standalone twin of this is the server case below; the principle is symmetric — a side change isn't shipped until BOTH sides actually re-synced.
- **Reload-unsafe Forge listener (#60).** `java.lang.IllegalStateException: null` in `rhino…enterActivation…` during "Ticking entity" (after a `/reload` or on a mob attack). ROOT: a raw `MinecraftForge.EVENT_BUS.addListener` registered from a KubeJS server script captures a Rhino scope that dies on reload. FIX: route through the mod-owned dispatcher or a KubeJS `EventGroup` (see `kubejs\server_scripts\relic_boss_drops.js` + `strip_anomalous_drops.js`); never raw-register from a server script.
- **Biome feature-order cycle (#64).** Crash on world load: `Feature order cycle found, involved sources: [...]` from `ModdedBiomeSlicesManager`. ROOT: a custom biome injects a feature out of order vs TerraBlender region init. FIX: reorder the feature deps; validate with `iridescent-biomes-mod\tools\check_feature_cycles.py`.

## Re-sync the server (mode-aware) + restart

First answer: **is the service in service mode?** (NSSM `IridescentMC` with `ICRAFT_SERVICE_MODE=1`.)

- **Service mode (production):** a push does NOT auto-arrive. Deploy to the **Z: live mirror**:
  - jar fix → `./wsl-build.sh --live-only` from the relevant mod (writes straight to the Z: server `mods`), or the full `./wsl-build.sh` (3 distros + Z:).
  - config / datapack / kubejs fix → copy into the Z: server tree (a non-service launch's `sync_from_repo.bat` `/MIR` mirrors it; in service mode you place it on Z: yourself).
  - then **restart the service** (`nssm restart IridescentMC`).
- **Non-service (interactive):** just relaunch `iridescentserver.bat` — Phase -1/0 pull HEAD (Z: robocopy mirror, then GitHub diff). Force a full clean re-pull with **`iridescentserver.bat /force`** (deletes `.icraft_last_sha` → full repo zip next boot).
- **"Jar shows stale on the server right after a rebuild" = WORKING AS DESIGNED** — same filename + new content ⇒ `cleanup_stale_jars.ps1` hash-verify removes the old copy so it re-fetches. The restart re-syncs it. (Same mechanic as the **custom-jar-release** skill; see it for the manifest side.)

## Footguns (each has cost a session)

- **Editing the Z: live runtime instead of the repo source** — overwritten on the next sync. Fix the repo, push, then deploy.
- **Forgetting service mode** — "I pushed but it still crashes": service mode skips GitHub sync. Deploy to Z: or do one non-service launch.
- **`side='client'` alone** — does not keep a mod off the server; its `.pw.toml` must be absent from `server_distribution\mods\.index\`.
- **Reading a stale `latest.log`** — the crash you want is the newest `crash-reports\crash-*.txt`; `latest.log` may have rolled past it.
- **Bytecode-patched mods** (Patchouli, ars_nouveau) need the launcher's `-noverify` JVM flag — if you hand-roll a launch, keep it.
- **A rebuilt `icraft-gui.exe` reaching only `server_distribution\`** — the GUI launcher RUNS from the `IridescentCraft Dedicated Server\` runtime subfolder, but CI commits the exe to `server_distribution\icraft-gui.exe` ONLY. It's delivered down into the subfolder by the GUI's own Sync/Update-Launcher (pulls that same canonical copy) + the `iridescentserver.bat` bootstrap seed — do NOT hand-commit a second copy into the subfolder (CI never refreshes it → goes stale, and it misdirects the GUI's own self-update into a nested/stale path).

## Triage commands (paste-ready, run on the server box)

```powershell
# Tail the live log and follow it
Get-Content '<repo>\.minecraft\server_distribution\logs\latest.log' -Tail 120 -Wait

# Read the newest Forge crash report
Get-ChildItem '<repo>\.minecraft\server_distribution\crash-reports\crash-*.txt' |
  Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content

# Preflight: Java / RAM / disk / mod count / custom-jar SHA / recent crashes
& '<repo>\.minecraft\server_distribution\diagnose.ps1'

# Force a clean full re-sync on next boot (non-service)
& '<repo>\.minecraft\server_distribution\iridescentserver.bat' /force

# Restart the production service
nssm restart IridescentMC
```

Once the server is up, validate the specific fix in-game with the real IDs (e.g. summon the boss that crashed, or join with the previously-offending client to confirm the side split). For a relic/boss fix, cross-reference the give/summon checklist from the relevant content skill.
