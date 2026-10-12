---
name: dedicated-server-triage
description: >-
  Diagnose and fix the IridescentCraft DEDICATED SERVER when it crashes on load,
  won't boot, stays down behind a running launcher, won't pick up a fix, or
  lets the wrong people in. Covers the crash-report -> classify -> fix at the
  repo source -> push -> re-sync -> restart -> verify loop, remote control of
  the box, the uptime restart policy that deploys HEAD, "launcher up, JVM
  down", server access (whitelist, server-owned identity files, a refused
  start, adding a tester), the legacy service-mode trap, and the
  client-only-mod crash class (embeddium/rubidium/oculus). USE THIS SKILL
  whenever the user says the server crashed, the server box is down, "check the
  server", a fix "didn't re-sync out", a jar shows stale on the server, a
  client-only mod broke the server, or a player can't join or needs
  whitelisting — even if they just say "we got a crash on server load". The
  live server is DOWNSTREAM of pushed HEAD and only pulls when it restarts, so
  check what actually reached the box before declaring a fix shipped.
---

# Dedicated-server triage (IridescentCraft)

## Mental model (read first)

The dev repo's `.minecraft\server_distribution\` is the **source**. The live server runs on a separate Windows box (`Sereneblossomns`) and is downstream of pushed repo HEAD. **Production runs under `icraft-gui.exe`** (the Rust launcher; the NSSM service `IridescentMC` was retired in 2026-09):

- **Every start is a sync, then a put-back.** Serve (full) and Cycle both run the GitHub diff sync (`.icraft_last_sha` vs `origin/main`), the custom-jar hash-verify and the mod hygiene; then, directly before the JVM is spawned, the launcher writes this server's own config values (`.icraft_config_overrides.json`) back into whatever the sync rewrote, and **refuses to start** if a whitelist or online-mode switch this server turned on is still off after that (the start guard, see Access). A Cycle additionally applies a staged launcher update (`icraft-gui.exe.new`) and relaunches the GUI. There is no restart-without-sync path.
- **The server only pulls when it restarts.** Three things restart it, and all three are Cycles (so all three deploy HEAD):
  - **the uptime restart policy** (since 2026-10-10): 4 h of uptime when nobody is online (empty for 5 min, no warnings), 12 h when players are on (60 s / 10 s in-game countdown). Uptime counts from the "Done" line, so every restart resets it. Audit log: `logs\restart_policy.log`. Runtime override: `.icraft_restart_policy` next to `server.properties` (`mode=live|dry-run|off`, re-read every minute);
  - **the heartbeat** — auto-Cycle on a non-zero exit or a dead listener (3 tries / 30 min);
  - **an on-demand Cycle** — the GUI's Cycle button, or `request_cycle.ps1` from anywhere (see Remote control).
- So a push reaches an idle server within ~4 h on its own, and at once if you ask for a Cycle. **Do not push half-finished server-side work to `main` expecting it to wait for a nightly window** — the fixed 05:00 restart is gone.
- **The log push is not part of a restart** (since 2026-10-11). Logs are copied aside at JVM exit and pushed by a background thread once the server is `Started` again, through the GitHub API: no git, no clone, nothing between the stop and the start. A failed push holds nothing up; the files go out after the next exit.

**Legacy launch paths** (`iridescentserver.bat` / `.sh`, `run.bat` / `run.sh`: bootstrap and non-GUI hosts). **Never start the LIVE server with them.** The put-back exists only in the launcher: these scripts start the JVM with whatever `server.properties` holds, and `iridescentserver`'s own sync has just put the pack's copy there (`white-list=false`), so the public server would start open. On the live box a start is a Cycle. What they do, on a host that does use them:

- **Normal (interactive) launch** runs phases each boot: Phase -1 `sync_from_repo.bat` (robocopy `/MIR` mirror from the Z: repo share), Phase 0 `phase0_sync.ps1` (GitHub-API diff vs `.icraft_last_sha`), then mod hygiene (`strip_client_mods` -> `update_mods.ps1` -> `cleanup_stale_jars.ps1`).
- **Service mode (`ICRAFT_SERVICE_MODE=1`)** **SKIPS Phase -1, Phase 0, AND mod-sync** — "deployed state is authoritative." A `git push` does **NOT** reach a service-mode server on its own. If a box is ever run this way again, this is the "I pushed the fix but it still crashes" trap.

**Always fix at the repo source, never the live runtime** — the runtime is overwritten on the next sync. The exception is what belongs to the server itself: its identity files and its override list (see Access). The repo does not hold them and no sync touches them.

## Paths (this pack)

- Repo source: `<repo>\.minecraft\server_distribution\` (call `<repo>` = `C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft`).
- Live runtime (server box, via Z: share): `Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\` (mods at `…\mods`).
- Launcher (production): `icraft-gui.exe` in the runtime root (Mesa OpenGL DLLs alongside on GPU-less VMs). It self-updates during a **Cycle** (and via its **Sync** / **Update Launcher** buttons) from the canonical `server_distribution\icraft-gui.exe`, checked against the `icraft-gui.exe.sha256` sidecar. Source: `<repo>\iridescent-launcher\`; CI (`build-icraft-gui.yml`) is the only compiler and commits the exe one commit after the source.
- Launcher (legacy, never on the live box): `iridescentserver.bat` / `iridescentserver.sh`; bare Forge launch `run.bat` / `run.sh`; env flag `ICRAFT_SERVICE_MODE=1`; force flag `iridescentserver.bat /force`. The NSSM service `IridescentMC` no longer exists.
- Launcher status: `.icraft_launcher_status` (rewritten whole every 15 s: state, restart phase and since when, whether a JVM exists, `stuck=`, `heartbeat=`, `log_push=`). `verify-server.ps1` reads it.
- Restart machinery: `request_cycle.ps1` (ask the GUI for a Cycle; logs to `logs\cycle_requests.log`), `.icraft_cycle_request` / `.icraft_cycle_request.result` (the request file it writes and the GUI's answer), `.icraft_restart_policy` (optional policy override), `logs\restart_policy.log` (policy audit trail, and the watchdog's `WATCHDOG: STUCK` lines).
- Access (the server's own, not in the repo): `whitelist.json`, `ops.json`, `banned-ips.json`, `banned-players.json`, `usercache.json`; `.icraft_config_overrides.json` (the override list) and `config-overrides\history.log` (every value the launcher wrote into a config file, and every `START REFUSED`); `.icraft_start_refused` (there only while a start stands refused: `refused=` when, `why=`; the next start the launcher allows removes it); `manage_whitelist.ps1` (synced from the pack).
- World backups (launcher, since 2026-10-11 — there is no backup mod): `backups\world-YYYYmmdd-HHMM.zip` (scheduled: taken in a Cycle's stopped window once the newest is 12 h old, newest 2 kept), `backups\manual-YYYYmmdd-HHMM.zip` (pinned: asked for, never pruned), `backups\backups.json` (the verified backups of both kinds), `logs\backup.log` (every decision and failure), `.icraft_backup_policy` (optional override), `request_backup.ps1` + `.icraft_backup_request` / `.icraft_backup_request.result` (ask for a pinned backup).
- Logs: `logs\latest.log`, `logs\debug.log`. Crashes: `crash-reports\crash-*.txt` (Forge). Both folders are mirrored by the launcher to `<repo>\.minecraft\server_distribution\TesterLogs\Server Logs\` (commits named `server logs auto-mirror`), two to three minutes after each restart. `crash-<date>_<time>.log` in the runtime root (written on a non-zero exit) is not mirrored: the Forge report it quotes is.
- Mod hygiene: `strip_client_mods.bat`/`.sh`, `cleanup_stale_jars.ps1`, `update_mods.ps1`, `client_only_mods.txt`, `custom_jars_manifest.json`.
- Sync marker: `.icraft_last_sha`. Legacy sync scripts: `sync_from_repo.bat`/`.sh`, `phase0_sync.ps1`.
- Preflight: `diagnose.bat` / `diagnose.ps1` (Java, RAM, disk, mod count, custom-jar SHA, recent crashes).
- Health check: `<repo>\.minecraft\dev\verify-server.ps1` (live vs freshly fetched `origin/main`). Exit 0 parity · 1 drift · 5 server down · 6 access RED (whitelist off, or a refused start) · 3 backups RED · 4 boot log RED (reported in that order when several apply) · 2 could not run. Any commit the server has not synced yet counts as drift, a docs or skill commit included: it clears at the next restart.
- Internal runbooks: `IridescentCraft-internal\dev\deployment-and-utility-guide.md` (§8 verify-server, §9 restarts and remote control, §11 backups, §13 override layer, §14 log push and launcher status, §15 access), `dev\failure-modes.md` (§8 to §11), `dev\lessons-learned.md`.

## Remote control (the box is NOT file-only)

Verified 2026-10-09 from the dev PC, as `sereneblossom\silvariazemaitis` (admin on the box). Earlier docs and briefs assumed only the Z: file share worked; that was wrong. Do the work yourself over remoting instead of handing the operator manual steps.

- **Files:** `Z:` = `\\Sereneblossomns\c$` (admin share) — read logs, crash reports, markers and the launcher status; write the small runtime control files (`.icraft_cycle_request`, `.icraft_restart_policy`) and, through `manage_whitelist.ps1` only, `whitelist.json`. Never edit synced content there.
- **Commands:** `Invoke-Command -ComputerName Sereneblossomns -ScriptBlock { ... }` (WinRM) — `Get-Process java,icraft-gui`, `Get-ScheduledTask`, `jcmd <pid> GC.class_histogram` (the server JDK ships `jcmd`), and running the runtime's own scripts. **Never print a process's `CommandLine` from the box** (an older launcher put its GitHub token on git's command line): names, pids, start times and CPU answer the question.
- **Scheduled tasks:** `schtasks /S Sereneblossomns ...` connects too; from PowerShell prefer `Get-ScheduledTask` / `Unregister-ScheduledTask` inside `Invoke-Command` (a task name with spaces is easy to mis-quote through `schtasks` and comes back "path not found").
- **What remoting can't do:** type into the server console (`whitelist reload` included) or click the GUI — the GUI process owns the JVM's stdin and lives in the interactive session. Use the file-based requests below.
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

A Cycle request is only accepted while the server is fully up. With the server down or mid-restart it answers `skipped` (exit 2), so it cannot unstick a restart.

`.icraft_restart_policy` keys: `mode=live|dry-run|off`, `empty_after_min`, `busy_after_min`, `empty_debounce_min`, `busy_warn_sec`. A line that doesn't parse **suspends** the policy (it never falls back to live) and says so in `restart_policy.log`. The policy never acts in the first 10 min after boot. Leftover test thresholds in this file are a restart loop waiting to happen — remove the file when done.

**World backups** ride on those same Cycles: the launcher zips the world just before it starts the JVM, when the newest scheduled backup is 12 h old. Nothing to run by hand for the routine ones.

```powershell
# Are backups healthy? (newest scheduled backup's age; also part of verify-server.ps1)
Get-Content 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\logs\backup.log' -Tail 15
Get-Content 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\backups\backups.json'

# A pinned backup before a risky change. Exit 0 done / 3 queued (server is up: taken at the next Cycle) / 2 failed / 1 no answer.
Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
    & 'C:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\request_backup.ps1' -Reason pre-update
}
```

`.icraft_backup_policy` keys: `mode=live|off` (off stops the scheduled ones only), `interval_hours`, `keep`, `max_minutes`. A line that doesn't parse does **not** stop backups: the launcher backs up on the defaults, **prunes nothing**, and turns the Backup badge red until the file is fixed or removed. Retention only ever deletes `world-YYYYmmdd-HHMM.zip`; a `manual-*.zip` stays until someone deletes it (each is the size of the world). A backup failure never keeps the server down — it is in `backup.log` and on the badge. Restoring one: deployment guide §11.

## Launcher up, JVM down

No JVM, no fresh crash report, and `icraft-gui` is still running. `verify-server.ps1` section 6 calls it: YELLOW while a restart is under 10 min old, **RED from 10 minutes (`=== SERVER DOWN ===`, exit 5)**. Read the status file first, then the launcher's child processes.

```powershell
# 1. What the launcher says it is doing (rewritten every 15 s)
Get-Content 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\.icraft_launcher_status'

# 2. What it is waiting on. Names, pids, start times, CPU: NEVER CommandLine. Run it twice, a minute apart.
Invoke-Command -ComputerName Sereneblossomns -ScriptBlock {
    $all = Get-CimInstance Win32_Process
    $ids = @((Get-Process icraft-gui -ErrorAction SilentlyContinue).Id)
    do { $n = $ids.Count; $ids = @($ids + @($all | Where-Object { $ids -contains $_.ParentProcessId }).ProcessId | Select-Object -Unique) } while ($ids.Count -gt $n)
    $all | Where-Object { $ids -contains $_.ProcessId } |
        Select-Object Name, ProcessId, ParentProcessId, CreationDate, @{ n = 'CpuSec'; e = { [math]::Round(($_.KernelModeTime + $_.UserModeTime) / 1e7, 1) } }
}
```

Reading the status file:

- `written` older than ~3 min: the launcher itself is closed or hung, or the box is off. The file cannot say what the JVM is doing; use `Get-Process`.
- `phase=` names the step: `cycle: content sync from GitHub`, `cycle: launcher self-update`, `pre-launch: sync check, mod verify, backup` (then `logs\backup.log`), `starting: JVM booting` (there IS a JVM: read `logs\latest.log` for where the boot stopped), `stopping: …`, `post-exit: …`, `auto-restart backoff`.
- `phase=no supervised server`: nobody is running the server. With `heartbeat=GAVE UP -- crash loop` the three auto-Cycles are spent: newest crash report, then the Triage flow. Otherwise it was stopped on purpose, exited cleanly, or auto-restart is off (`heartbeat=DOWN …`).
- **`.icraft_start_refused` exists next to it: the server is down on purpose.** The start guard found a whitelist or online-mode switch off and started no JVM (no crash report, nothing in `latest.log`). `why=` in that file is the cause; the heartbeat retries three times, then `GAVE UP`. Causes and fixes: Access, and guide §15j.
- `stuck=` set: the launcher's own watchdog, a phase past 10 min (also `WATCHDOG: STUCK in '<phase>'` in `logs\restart_policy.log`). It reports and does nothing else.
- `log_push=`: how the last log push went. It is never the reason the server is down.

**A stalled `git` is no longer the expected cause.** The 39-minute outage of 2026-10-11 was a restart waiting on the log push's git; that push now runs no git and sits after the start. `git.exe` under the launcher means someone clicked Sync, Apply Self-Update or Rebuild + Push GUI, and those calls are killed after 5 min. Look instead for the child with an old start time and no CPU between the two samples (a `java.exe` during `pre-launch` is the Java check or the Forge installer, not the server), or for no child at all, which leaves the step `phase=` names: the network to GitHub, a mod download, the backup.

**Then:** tell the planning session before touching anything on the box. The request file cannot restart a server that is not up, and after `GAVE UP` nothing restarts it remotely: the way out is at the box's desktop (Stop if a run is still live, then Cycle). **Do not start a second launcher over WinRM** (its window is in no session anyone can see, and the first one is still there), and do not reach for the `.bat` scripts. Stage timings and the forensic record: deployment guide §14e, failure-modes §9.

## Access: who can join

The live server is public (through the relay) and runs `online-mode=false`, so the whitelist is the door. Since 2026-10-11 none of it is pack content:

- **The identity files are the server's own:** `whitelist.json`, `ops.json`, `banned-ips.json`, `banned-players.json`, `usercache.json`. Untracked and ignored in the repo; no sync path writes or deletes them (the launcher's `SERVER_OWNED_FILES`, and the legacy sync scripts skip them too). **Do not "restore" one from the repo** (history holds only the empty lists that used to wipe them) **and do not expect a sync to repair one.** `ops.json` is empty on purpose (operator ruling 2026-10-11: operator status stays off for now): not a fault to fix.
- **The switch is pinned.** `white-list` and `enforce-whitelist` are two entries on the override list (`.icraft_config_overrides.json`). The launcher puts both back before every JVM start; each time it has to write, `config-overrides\history.log` gets a `PUT BACK` line (no line when the file still held the values).
- **`white-list=false` on disk right after a sync is expected.** The tracked `server.properties` carries the pack default, so every sync that rewrites the file leaves `false` there for a few seconds, with no JVM running (9 s when measured). A running JVM keeps what it read at start. Do not "repair" a pinned value back to the pack's, and do not expect a hand edit to last: the list decides.
- **The start guard** (since 2026-10-11). After the put-back, every `white-list`, `enforce-whitelist` or `online-mode` the list switches ON must read `true` in `server.properties`. If one does not, or the file or the list cannot be read, **no JVM is started**: `.icraft_start_refused` says when and why, `history.log` gets `START REFUSED`, the heartbeat's three auto-Cycles each retry the put-back, then it gives up and the server stays down until Cycle is pressed at the box. A pass leaves no trace. `icraft settings start-check` repeats the check read-only, over the share too (the CLI is a CI artifact, not on the box; exit 0 = it would start).
- **The check:** `verify-server.ps1` section 7 (counts only, never a name). **RED, exit 6** = the whitelist is off on the public server (the file says `false` and no pin puts it back), `server.properties` is unreadable, or `THE LAUNCHER REFUSED TO START THE SERVER` (with the launcher's reason; exit 5 once the server has been down 10 min). YELLOW covers the expected cases (file `false` with the pin in place; on but not pinned; on and empty). What to do on RED: guide §15j.
- **Someone joining under a listed player's name** (offline mode checks the name, not an account) cannot be banned on their own: the UUID is the real player's and every relay connection has the same address. Take the name off the whitelist. The operator has accepted this risk for now.

Adding or removing a player:

```powershell
# From the dev PC, over the share. ExactName = the in-game name, capitals included. Also: -Remove ExactName, -List, -Check.
powershell -ExecutionPolicy Bypass -File '<repo>\.minecraft\server_distribution\manage_whitelist.ps1' -ServerRoot 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server' -Add ExactName
```

Then the server has to re-read the file: `whitelist reload` typed in the launcher's console box (at the box), or the next restart. `-Check` compares every entry's UUID with its name and exits 1 on a bad one. `-List` and `-Check` print player names: keep their output out of the public repo, the wiki and commit messages.

**Never `whitelist add <name>` or `op <name>` while the server is in offline mode.** Both look the name up with Mojang first and store the account's UUID, which the player never has in offline mode: the command reports success and the player is still refused ("You are not white-listed on this server!"). Why, and the rest (pins, limits, a new server): guide §15.

## Triage flow

1. **Get the signal.** Read the NEWEST `crash-reports\crash-*.txt` (not the rolled `latest.log`) and tail `logs\latest.log`. If you only have the pushed copies, look in `<repo>\.minecraft\server_distribution\TesterLogs\Server Logs\` (pull first; the newest run arrives a few minutes after the restart). No crash report and no JVM: see Launcher up, JVM down.
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

- **Production (icraft-gui):** push to `main`, then either wait for the next policy restart (within 4 h when empty) or ask for a Cycle now (`request_cycle.ps1`, see Remote control). A launcher change needs CI's exe commit on `main` first — check `gh run list --workflow build-icraft-gui.yml` — and that same Cycle applies it. Confirm with `pwsh .minecraft\dev\verify-server.ps1` (live vs freshly-fetched `origin/main`) rather than the GUI badge. A full clean re-pull is the GUI's `Sync (--force)` button, not the bat's `/force`.
- The two legacy bullets below are for a bat-launched host that is **not** the live box (see Mental model).
- **Legacy service mode** (`ICRAFT_SERVICE_MODE=1` under the bat launcher): a push does NOT auto-arrive. Deploy to the **Z: live mirror**:
  - jar fix → `./wsl-build.sh --live-only` from the relevant mod (writes straight to the Z: server `mods`), or the full `./wsl-build.sh` (3 distros + Z:).
  - config / datapack / kubejs fix → copy into the Z: server tree (a non-service launch's `sync_from_repo.bat` `/MIR` mirrors it; in service mode you place it on Z: yourself).
  - then restart the server.
- **Legacy non-service (interactive):** just relaunch `iridescentserver.bat` — Phase -1/0 pull HEAD (Z: robocopy mirror, then GitHub diff). Force a full clean re-pull with **`iridescentserver.bat /force`** (deletes `.icraft_last_sha` → full repo zip next boot).
- **"Jar shows stale on the server right after a rebuild" = WORKING AS DESIGNED** — same filename + new content ⇒ `cleanup_stale_jars.ps1` hash-verify removes the old copy so it re-fetches. The restart re-syncs it. (Same mechanic as the **custom-jar-release** skill; see it for the manifest side.)

## Footguns (each has cost a session)

- **Editing the Z: live runtime instead of the repo source** — overwritten on the next sync. Fix the repo, push, then deploy. (The server's own files are the exception: Access.)
- **Starting the live server with `iridescentserver.bat`, `run.bat` or a `.sh` script** — they skip the override put-back and the start guard, so the public server starts with the pack's `white-list=false`. Use the launcher (a Cycle), also when it has refused a start.
- **Starting a second launcher over WinRM to get a down server going** — nobody can see or click it, and it is a second supervisor on the same server. The fix is Cycle at the box.
- **"Restoring" `whitelist.json` / `ops.json` / a ban list / `usercache.json` from the repo, or waiting for a sync to fix one** — they are the server's own; the repo's old copies were empty lists. An empty `ops.json` is the operator's choice.
- **`whitelist add` / `op` in offline mode** — stores the wrong UUID and reports success. `manage_whitelist.ps1`, then `whitelist reload`.
- **Reading `white-list=false` in the file right after a sync as a breach** — expected for seconds with no JVM. Look for the `PUT BACK` in `config-overrides\history.log` and run `verify-server.ps1` once the server is up.
- **Looking for a stuck `git` (or the log push) when a restart hangs** — neither is on the restart path any more. Read `.icraft_launcher_status`.
- **Assuming the box is file-only** — it isn't (see Remote control). Briefs that hand the operator "run this on the box" steps for things `Invoke-Command` can do are stale.
- **Forgetting that every restart deploys HEAD** — policy restarts land whatever is on `main` up to every 4 h. A broken server script pushed at noon is live by mid-afternoon, not at 05:00 tomorrow. The flip side: "I pushed but it still crashes" within the first hours usually just means no restart has happened yet — check `restart_policy.log` / `.icraft_last_sha`, then Cycle.
- **Forgetting legacy service mode** — on a bat-launched box with `ICRAFT_SERVICE_MODE=1`, service mode skips GitHub sync. Deploy to Z: or do one non-service launch.
- **`side='client'` alone** — does not keep a mod off the server; its `.pw.toml` must be absent from `server_distribution\mods\.index\`.
- **Reading a stale `latest.log`** — the crash you want is the newest `crash-reports\crash-*.txt`; `latest.log` may have rolled past it.
- **Bytecode-patched mods** (Patchouli, ars_nouveau) need the `-noverify` JVM flag, which the launcher passes — one more reason not to hand-roll a launch.
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

# Deploy, liveness, access, backups and boot log in one run (exit codes under Paths)
pwsh '<repo>\.minecraft\dev\verify-server.ps1'

# Legacy bat launcher on another host only (never the live box): force a clean full re-sync on next boot
& '<repo>\.minecraft\server_distribution\iridescentserver.bat' /force
```

Once the server is up, validate the specific fix in-game with the real IDs (e.g. summon the boss that crashed, or join with the previously-offending client to confirm the side split). For a relic/boss fix, cross-reference the give/summon checklist from the relevant content skill.
