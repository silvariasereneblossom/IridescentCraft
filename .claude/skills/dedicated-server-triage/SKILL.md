---
name: dedicated-server-triage
description: >-
  Diagnose and fix the IridescentCraft DEDICATED SERVER when it crashes on load,
  won't boot, or won't pick up a fix. Covers the crash-report -> classify -> fix
  at the repo source -> push -> re-sync -> restart -> verify loop, remote control
  of the server box (Invoke-Command / the Z: admin share), the uptime restart
  policy that deploys HEAD by itself, the legacy service-mode "my push didn't
  reach the server" trap, and the recurring client-only-mod-on-a-server crash
  class (embeddium/rubidium/oculus). USE THIS
  SKILL whenever the user says the server crashed, the server box is down, "check
  the server", a fix "didn't re-sync out", the server is out of sync with the
  repo, a jar shows stale on the server, or a client-only mod broke the server —
  even if they just say "we got a crash on server load". The live server is
  DOWNSTREAM of pushed HEAD and only pulls when it restarts, so always check what
  actually reached the box before declaring a fix shipped.
---

# Dedicated-server triage (IridescentCraft)

## Mental model (read first)

The dev repo's `.minecraft\server_distribution\` is the **source**. The live server runs on a separate Windows box (`Sereneblossomns`) and is downstream of pushed repo HEAD. **Production runs under `icraft-gui.exe`** (the Rust launcher; the NSSM service `IridescentMC` was retired in 2026-09):

- **Every start is a sync.** Serve (full) and Cycle both run the GitHub diff sync (`.icraft_last_sha` vs `origin/main`), the custom-jar hash-verify and the mod hygiene before launching the JVM. A Cycle additionally applies a staged launcher update (`icraft-gui.exe.new`) and relaunches the GUI. There is no restart-without-sync path.
- **The server only pulls when it restarts.** Three things restart it, and all three are Cycles (so all three deploy HEAD):
  - **the uptime restart policy** (since 2026-10-10): 4 h of uptime when nobody is online (empty for 5 min, no warnings), 12 h when players are on (60 s / 10 s in-game countdown). Uptime counts from the "Done" line, so every restart resets it. Audit log: `logs\restart_policy.log`. Runtime override: `.icraft_restart_policy` next to `server.properties` (`mode=live|dry-run|off`, re-read every minute);
  - **the heartbeat** — auto-Cycle on a non-zero exit or a dead listener (3 tries / 30 min);
  - **an on-demand Cycle** — the GUI's Cycle button, or `request_cycle.ps1` from anywhere (see Remote control).
- So a push reaches an idle server within ~4 h on its own, and at once if you ask for a Cycle. **Do not push half-finished server-side work to `main` expecting it to wait for a nightly window** — the fixed 05:00 restart is gone.

**Legacy launch paths** (`iridescentserver.bat` / `.sh`, kept for bootstrap and non-GUI hosts — NOT what production runs):

- **Normal (interactive) launch** runs phases each boot: Phase -1 `sync_from_repo.bat` (robocopy `/MIR` mirror from the Z: repo share), Phase 0 `phase0_sync.ps1` (GitHub-API diff vs `.icraft_last_sha`), Phase 3 mod hygiene (`strip_client_mods` -> `cleanup_stale_jars.ps1` -> `update_mods.ps1`).
- **Service mode (`ICRAFT_SERVICE_MODE=1`)** **SKIPS Phase -1, Phase 0, AND mod-sync** — "deployed state is authoritative." A `git push` does **NOT** reach a service-mode server on its own. If a box is ever run this way again, this is the "I pushed the fix but it still crashes" trap.

**Always fix at the repo source, never the live runtime** — the runtime is overwritten on the next sync.

## Paths (this pack)

- Repo source: `<repo>\.minecraft\server_distribution\` (call `<repo>` = `C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft`).
- Live runtime (server box, via Z: share): `Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\` (mods at `…\mods`).
- Launcher (production): `icraft-gui.exe` in the runtime root (Mesa OpenGL DLLs alongside on GPU-less VMs). It self-updates during a **Cycle** (and via its **Sync** / **Update Launcher** buttons) from the canonical `server_distribution\icraft-gui.exe`, checked against the `icraft-gui.exe.sha256` sidecar. Source: `<repo>\iridescent-launcher\`; CI (`build-icraft-gui.yml`) is the only compiler and commits the exe one commit after the source.
- Launcher (legacy): `iridescentserver.bat` / `iridescentserver.sh`; bare Forge launch `run.bat` / `run.sh`; env flag `ICRAFT_SERVICE_MODE=1`; force flag `iridescentserver.bat /force`. The NSSM service `IridescentMC` no longer exists.
- Restart machinery: `request_cycle.ps1` (ask the GUI for a Cycle; logs to `logs\cycle_requests.log`), `.icraft_cycle_request` / `.icraft_cycle_request.result` (the request file it writes and the GUI's answer), `.icraft_restart_policy` (optional policy override), `logs\restart_policy.log` (policy audit trail).
- Logs: `logs\latest.log`, `logs\debug.log`. Crashes: `crash-reports\crash-*.txt` (Forge). Post-exit snapshot: `crash-<date>_<time>.log`, pushed by `push_crash_logs.bat` to `<repo>\.minecraft\TesterLogs\Server Logs\`.
- Mod hygiene: `strip_client_mods.bat`/`.sh`, `cleanup_stale_jars.ps1`, `update_mods.ps1`, `client_only_mods.txt`, `custom_jars_manifest.json`.
- Sync: `sync_from_repo.bat`/`.sh`, `phase0_sync.ps1`, marker `.icraft_last_sha`.
- Preflight: `diagnose.bat` / `diagnose.ps1` (Java, RAM, disk, mod count, custom-jar SHA, recent crashes).
- Internal runbooks: `IridescentCraft-internal\dev\deployment-and-utility-guide.md`, `dev\lessons-learned.md`.

## Remote control (the box is NOT file-only)

Verified 2026-10-09 from the dev PC, as `sereneblossom\silvariazemaitis` (admin on the box). Earlier docs and briefs assumed only the Z: file share worked; that was wrong. Do the work yourself over remoting instead of handing the operator manual steps.

- **Files:** `Z:` = `\\Sereneblossomns\c$` (admin share) — read logs, crash reports and markers; write the small runtime control files (`.icraft_cycle_request`, `.icraft_restart_policy`). Never edit synced content there.
- **Commands:** `Invoke-Command -ComputerName Sereneblossomns -ScriptBlock { ... }` (WinRM) — `Get-Process java,icraft-gui`, `Get-ScheduledTask`, `jcmd <pid> GC.class_histogram` (the server JDK ships `jcmd`), and running the runtime's own scripts.
- **Scheduled tasks:** `schtasks /S Sereneblossomns ...` connects too; from PowerShell prefer `Get-ScheduledTask` / `Unregister-ScheduledTask` inside `Invoke-Command` (a task name with spaces is easy to mis-quote through `schtasks` and comes back "path not found").
- **What remoting can't do:** type into the server console or click the GUI — the GUI process owns the JVM's stdin and lives in the interactive session. Use the file-based requests below.
- **Clocks:** the box runs Pacific time. File times read through `Z:` and `DateTime` values returned by `Invoke-Command` are shown in the dev PC's zone (Eastern, +3 h); the server's own logs are box-local.

```powershell
# Is it up, and since when? (JVM start + the policy's own view)
Invoke-Command -ComputerName Sereneblossomns -ScriptBlock { Get-Process java,icraft-gui | Select-Object Name,Id,StartTime }
Get-Content 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\logs\restart_policy.log' -Tail 20

# Cycle now (60 s / 10 s in-game countdown, 120 s save grace, then sync + start). Exit 0 accepted / 2 skipped / 1 no answer.
Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
    & 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\request_cycle.ps1' -Reason deploy
}

# Pause the uptime restarts (e.g. for a long soak on one JVM); delete the file to resume.
Set-Content 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\.icraft_restart_policy' 'mode=off' -Encoding ascii
```

`.icraft_restart_policy` keys: `mode=live|dry-run|off`, `empty_after_min`, `busy_after_min`, `empty_debounce_min`, `busy_warn_sec`. A line that doesn't parse **suspends** the policy (it never falls back to live) and says so in `restart_policy.log`. The policy never acts in the first 10 min after boot. Leftover test thresholds in this file are a restart loop waiting to happen — remove the file when done.

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

- **Production (icraft-gui):** push to `main`, then either wait for the next policy restart (within 4 h when empty) or ask for a Cycle now (`request_cycle.ps1`, see Remote control). A launcher change needs CI's exe commit on `main` first — check `gh run list --workflow build-icraft-gui.yml` — and that same Cycle applies it. Confirm with `pwsh .minecraft\dev\verify-server.ps1` (live vs freshly-fetched `origin/main`) rather than the GUI badge.
- **Legacy service mode** (`ICRAFT_SERVICE_MODE=1` under the bat launcher): a push does NOT auto-arrive. Deploy to the **Z: live mirror**:
  - jar fix → `./wsl-build.sh --live-only` from the relevant mod (writes straight to the Z: server `mods`), or the full `./wsl-build.sh` (3 distros + Z:).
  - config / datapack / kubejs fix → copy into the Z: server tree (a non-service launch's `sync_from_repo.bat` `/MIR` mirrors it; in service mode you place it on Z: yourself).
  - then restart the server.
- **Legacy non-service (interactive):** just relaunch `iridescentserver.bat` — Phase -1/0 pull HEAD (Z: robocopy mirror, then GitHub diff). Force a full clean re-pull with **`iridescentserver.bat /force`** (deletes `.icraft_last_sha` → full repo zip next boot).
- **"Jar shows stale on the server right after a rebuild" = WORKING AS DESIGNED** — same filename + new content ⇒ `cleanup_stale_jars.ps1` hash-verify removes the old copy so it re-fetches. The restart re-syncs it. (Same mechanic as the **custom-jar-release** skill; see it for the manifest side.)

## Footguns (each has cost a session)

- **Editing the Z: live runtime instead of the repo source** — overwritten on the next sync. Fix the repo, push, then deploy.
- **Assuming the box is file-only** — it isn't (see Remote control). Briefs that hand the operator "run this on the box" steps for things `Invoke-Command` can do are stale.
- **Forgetting that every restart deploys HEAD** — policy restarts land whatever is on `main` up to every 4 h. A broken server script pushed at noon is live by mid-afternoon, not at 05:00 tomorrow. The flip side: "I pushed but it still crashes" within the first hours usually just means no restart has happened yet — check `restart_policy.log` / `.icraft_last_sha`, then Cycle.
- **Forgetting legacy service mode** — on a bat-launched box with `ICRAFT_SERVICE_MODE=1`, service mode skips GitHub sync. Deploy to Z: or do one non-service launch.
- **`side='client'` alone** — does not keep a mod off the server; its `.pw.toml` must be absent from `server_distribution\mods\.index\`.
- **Reading a stale `latest.log`** — the crash you want is the newest `crash-reports\crash-*.txt`; `latest.log` may have rolled past it.
- **Bytecode-patched mods** (Patchouli, ars_nouveau) need the launcher's `-noverify` JVM flag — if you hand-roll a launch, keep it.
- **A rebuilt `icraft-gui.exe` reaching only `server_distribution\`** — the GUI launcher RUNS from the `IridescentCraft Dedicated Server\` runtime subfolder, but CI commits the exe to `server_distribution\icraft-gui.exe` ONLY. It's delivered down into the subfolder by the GUI's own Sync/Update-Launcher (pulls that same canonical copy) + the `iridescentserver.bat` bootstrap seed — do NOT hand-commit a second copy into the subfolder (CI never refreshes it → goes stale, and it misdirects the GUI's own self-update into a nested/stale path).

## Triage commands (paste-ready; from the dev PC swap `<repo>\.minecraft\server_distribution` for the `Z:\…\IridescentCraft Dedicated Server` runtime root)

```powershell
# Tail the live log and follow it
Get-Content '<repo>\.minecraft\server_distribution\logs\latest.log' -Tail 120 -Wait

# Read the newest Forge crash report
Get-ChildItem '<repo>\.minecraft\server_distribution\crash-reports\crash-*.txt' |
  Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content

# Preflight: Java / RAM / disk / mod count / custom-jar SHA / recent crashes
& '<repo>\.minecraft\server_distribution\diagnose.ps1'

# Restart production now (asks icraft-gui to Cycle: countdown, save, sync HEAD, start)
& '<runtime root>\request_cycle.ps1' -Reason triage

# Legacy bat launcher only: force a clean full re-sync on next boot
& '<repo>\.minecraft\server_distribution\iridescentserver.bat' /force
```

Once the server is up, validate the specific fix in-game with the real IDs (e.g. summon the boss that crashed, or join with the previously-offending client to confirm the side split). For a relic/boss fix, cross-reference the give/summon checklist from the relevant content skill.
