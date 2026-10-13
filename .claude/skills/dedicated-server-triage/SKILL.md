---
name: dedicated-server-triage
description: >-
  Diagnose and fix the IridescentCraft DEDICATED SERVER when it crashes on load,
  won't boot, stays down behind a running launcher, won't pick up a fix, or
  lets the wrong people in. Covers the crash-report -> classify -> fix at the
  repo source -> push -> re-sync -> restart -> verify loop, remote control of
  the box, the restart policy that deploys HEAD, "launcher up, JVM down", a
  refused start (access switch or unfinished regeneration), server access
  (whitelist, server-owned identity files, adding a tester), the legacy
  service-mode trap, and the client-only-mod crash class
  (embeddium/rubidium/oculus). USE THIS SKILL whenever the user says the server
  crashed, the server box is down, "check the server", a fix "didn't re-sync
  out", a jar shows stale on the server, a client-only mod broke the server, or
  a player can't join or needs whitelisting — even if they just say "we got a
  crash on server load". The live server only pulls pushed HEAD when it
  restarts: check what reached the box before calling a fix shipped.
---

# Dedicated-server triage (IridescentCraft)

## Mental model (read first)

The dev repo's `.minecraft\server_distribution\` is the **source**. The live server runs on a separate Windows box (`Sereneblossomns`) and is downstream of pushed repo HEAD. **Production runs under `icraft-gui.exe`** (the Rust launcher; the NSSM service `IridescentMC` was retired in 2026-09):

- **Every start is a sync, then a put-back between two guards.** Serve (full) and Cycle both run the GitHub diff sync (`.icraft_last_sha` vs `origin/main`), the custom-jar hash-verify and the mod hygiene. Then, directly before the JVM is spawned, in this order: (1) the launcher **refuses to start** on a world a regeneration left half done (`.icraft_regen_in_progress` exists); (2) it writes this server's own config values (`.icraft_config_overrides.json`) back into whatever the sync rewrote; (3) it **refuses to start** if a whitelist or online-mode switch this server turned on is still off after that. Either refusal leaves `.icraft_start_refused` with the reason (see A refused start). A Cycle additionally applies a staged launcher update (`icraft-gui.exe.new`) and relaunches the GUI. There is no restart-without-sync path.
- **The server only pulls when it restarts.** Three things restart it, and all three are Cycles (so all three deploy HEAD):
  - **the uptime restart policy** (since 2026-10-10): 4 h of uptime when nobody is online (empty for 5 min, no warnings), 12 h when players are on (60 s / 10 s in-game countdown). Uptime counts from the "Done" line, so every restart resets it. Audit log: `logs\restart_policy.log`. Runtime override: `.icraft_restart_policy` next to `server.properties` (`mode=live|dry-run|off`, re-read every minute);
  - **the heartbeat** — auto-Cycle on a non-zero exit or a dead listener (3 tries / 30 min);
  - **an on-demand Cycle** — the GUI's Cycle button, or `request_cycle.ps1` from anywhere (see Remote control).
- So a push reaches an idle server within ~4 h on its own, and at once if you ask for a Cycle. **Do not push half-finished server-side work to `main` expecting it to wait for a nightly window** — the fixed 05:00 restart is gone.
- **The log push is not part of a restart** (since 2026-10-11), **and it no longer goes to this repo** (since 2026-10-12). Logs are copied aside at JVM exit (`.icraft_log_stage\`) and pushed by a background thread once the server is `Started` again, through the GitHub API, to the private repository `IridescentCraft-logs`: no git, no clone, nothing between the stop and the start. A failed push holds nothing up; the files go out after the next exit. No `server logs auto-mirror` commit lands on this repo's `main` any more.

**Legacy launch paths** (`iridescentserver.bat` / `.sh`, `run.bat` / `run.sh`: bootstrap and non-GUI hosts). **Never start the LIVE server with them.** The put-back and both start guards exist only in the launcher: these scripts start the JVM with whatever `server.properties` holds, and `iridescentserver`'s own sync has just put the pack's copy there (`white-list=false`), so the public server would start open. On the live box a start is a Cycle. What they do, on a host that does use them:

- **Normal (interactive) launch** runs phases each boot: Phase -1 `sync_from_repo.bat` (robocopy `/MIR` mirror from the Z: repo share), Phase 0 `phase0_sync.ps1` (GitHub-API diff vs `.icraft_last_sha`), then mod hygiene (`strip_client_mods` -> `update_mods.ps1` -> `cleanup_stale_jars.ps1`).
- **Service mode (`ICRAFT_SERVICE_MODE=1`)** **SKIPS Phase -1, Phase 0, AND mod-sync** — "deployed state is authoritative." A `git push` does **NOT** reach a service-mode server on its own. If a box is ever run this way again, this is the "I pushed the fix but it still crashes" trap.

**Always fix at the repo source, never the live runtime** — the runtime is overwritten on the next sync. The exception is what belongs to the server itself: its identity files and its override list (see Access). The repo does not hold them and no sync touches them. A config value on that list (the whitelist switches, a worldgen setting from the launcher's Customizer tab) makes its file differ from the pack's **on purpose**: `verify-server.ps1` lists each one as INTENTIONAL, and the launcher writes it back before every start, so "repairing" the file undoes nothing (guide §13). Since 2026-10-12 such a value can also sit **inside a Paxi datapack zip** (the ore counts in `config\paxi\datapacks\icraft_worldgen_overrides.zip`; the list names the member as `<pack>.zip!/data/….json`). The launcher rewrites the zip with that one member changed, so the server's zip differs from the pack's on purpose: INTENTIONAL, never to be overwritten by hand. Compare such a zip member by member, never by hash: it is not byte-equal to the pack's again even after every value is reset, and the launcher then prints a report-only `would-repair` line for it at each launch until a sync replaces the file. Neither is drift (guide §13k).

## Paths (this pack)

- Repo source: `<repo>\.minecraft\server_distribution\` (call `<repo>` = `C:\Users\silvariazemaitis\IridescentcraftDev\IridescentCraft`).
- Live runtime (server box, via Z: share): `Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server\` (mods at `…\mods`).
- Launcher (production): `icraft-gui.exe` in the runtime root (Mesa OpenGL DLLs alongside on GPU-less VMs). It self-updates during a **Cycle** (and via its **Sync** / **Update Launcher** buttons) from the canonical `server_distribution\icraft-gui.exe`, checked against the `icraft-gui.exe.sha256` sidecar. Source: `<repo>\iridescent-launcher\`; CI (`build-icraft-gui.yml`) is the only compiler and commits the exe one commit after the source.
- Launcher (legacy, never on the live box): `iridescentserver.bat` / `iridescentserver.sh`; bare Forge launch `run.bat` / `run.sh`; env flag `ICRAFT_SERVICE_MODE=1`; force flag `iridescentserver.bat /force`. The NSSM service `IridescentMC` no longer exists.
- Launcher status: `.icraft_launcher_status` (rewritten whole every 15 s: state, restart phase and since when, whether a JVM exists, `stuck=`, `heartbeat=`, `log_push=`). `verify-server.ps1` reads it.
- Restart machinery: `request_cycle.ps1` (ask the GUI for a Cycle; logs to `logs\cycle_requests.log`), `.icraft_cycle_request` / `.icraft_cycle_request.result` (the request file it writes and the GUI's answer), `.icraft_restart_policy` (optional policy override), `logs\restart_policy.log` (policy audit trail, and the watchdog's `WATCHDOG: STUCK` lines).
- Access (the server's own, not in the repo): `whitelist.json`, `ops.json`, `banned-ips.json`, `banned-players.json`, `usercache.json`; `.icraft_config_overrides.json` (the override list) and `config-overrides\history.log` (every value the launcher wrote into a config file, and every `START REFUSED` of the access guard); `manage_whitelist.ps1` (synced from the pack).
- Start refusal: `.icraft_start_refused` (there only while a start stands refused, for either cause: `refused=` when, `why=` which cause; the next start the launcher allows removes it).
- World backups (launcher, since 2026-10-11 — there is no backup mod): `backups\world-YYYYmmdd-HHMM.zip` (scheduled: taken in a Cycle's stopped window once the newest is 12 h old, newest 2 kept), `backups\manual-YYYYmmdd-HHMM.zip` (pinned: asked for, or taken by a regeneration run before it changes anything; never pruned), `backups\backups.json` (the verified backups of both kinds), `logs\backup.log` (every decision and failure), `.icraft_backup_policy` (optional override), `request_backup.ps1` + `.icraft_backup_request` / `.icraft_backup_request.result` (ask for a pinned backup). Since 2026-10-12 every zip also holds the server's own files under `server-state\` (see World backups).
- World regeneration (launcher, since 2026-10-12): `.icraft_regen_in_progress` (there only while a run or a rollback is changing the world; left behind = unfinished, and no JVM starts), `regen-holding\<stamp>-<code>\` (what a run took out of the world, with `holding.json`: its way back; never pruned), `logs\regen_execute.log` (every run, refusal and rollback), `regen-reports\` (dry-runs: maps, read-only).
- Logs: `logs\latest.log`, `logs\debug.log`. Crashes: `crash-reports\crash-*.txt` (Forge). The launcher stages both folders in `<runtime root>\.icraft_log_stage\` and mirrors them to the **private** repository `IridescentCraft-logs`, folder `server/`, two to three minutes after each restart. `debug.log` and `debug-1.log.gz` are mirrored only after a crash exit (JVM exit code not 0); they are always on the box. `crash-<date>_<time>.log` in the runtime root (written on a non-zero exit) is not mirrored: the Forge report it quotes is. Guide §14, current state in §14i.
- Where dev tools find those logs: `<repo>\.minecraft\dev\server_logs.py` (`$ICRAFT_SERVER_LOGS`, then the live share's `logs\`, then a clone of the logs repository beside the pack clone, `..\IridescentCraft-logs\server`). The old public mirror, `server_distribution\TesterLogs\Server Logs\`, is gone from this repo's tip (not from its history) and, as a staging folder, from the box: it carried player names and chat. Log lines still do, so quote them in the internal repo only, never here.
- Mod hygiene: `strip_client_mods.bat`/`.sh`, `cleanup_stale_jars.ps1`, `update_mods.ps1`, `client_only_mods.txt`, `custom_jars_manifest.json`.
- Sync marker: `.icraft_last_sha`. Legacy sync scripts: `sync_from_repo.bat`/`.sh`, `phase0_sync.ps1`.
- Preflight: `diagnose.bat` / `diagnose.ps1` (Java, RAM, disk, mod count, custom-jar SHA, recent crashes).
- Health check: `<repo>\.minecraft\dev\verify-server.ps1` (live vs freshly fetched `origin/main`). Exit 0 parity · 1 drift · 5 server down · 6 access RED (whitelist off, or a refused start of either cause) · 3 backups RED · 4 boot log RED (reported in that order when several apply) · 2 could not run. AMBER (boot-log lines nobody has accepted) and INTENTIONAL (this server's own config values) are printed and never change the exit code. Any commit the server has not synced yet counts as drift, a docs or skill commit included: it clears at the next restart.
- Boot-log checker behind it: `<repo>\.minecraft\dev\loud\loud-check.ps1`, with `baseline.json` (what was read and accepted, and the known defects) and `liveness_manifest.json`. The manifest is GENERATED from the scripts by `dev\loud\gen_liveness.js` and never edited by hand: every registration the scripts make, as an id (`<name>@<event>`, `<name>@tick.server` / `tick.player`, `<key>@hurt`, and `<script>@<Registry>.<method>` for a function put straight on a Java registry), with a count and a digest per script type, plus the hand-kept lines of `dev\loud\liveness_lines.json` that prove what a registration cannot.
- Internal runbooks: `IridescentCraft-internal\dev\deployment-and-utility-guide.md` (§8 verify-server, §9 restarts and remote control, §11 backups, §12 regeneration dry-run, §13 override layer and worldgen settings, §14 log push and launcher status, §15 access, §16 regeneration), `dev\failure-modes.md` (§8 to §11), `dev\lessons-learned.md`.

## Remote control (the box is NOT file-only)

Verified 2026-10-09 from the dev PC, as `sereneblossom\silvariazemaitis` (admin on the box). Earlier docs and briefs assumed only the Z: file share worked; that was wrong. Do the work yourself over remoting instead of handing the operator manual steps.

- **Files:** `Z:` = `\\Sereneblossomns\c$` (admin share) — read logs, crash reports, markers and the launcher status; write the small runtime control files (`.icraft_cycle_request`, `.icraft_restart_policy`) and, through `manage_whitelist.ps1` only, `whitelist.json`. Never edit synced content there, and never touch `.icraft_regen_in_progress`, `.icraft_start_refused` or `regen-holding\`: they are the launcher's.
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

`.icraft_backup_policy` keys: `mode=live|off` (off stops the scheduled ones only), `interval_hours`, `keep`, `max_minutes`. A line that doesn't parse does **not** stop backups: the launcher backs up on the defaults, **prunes nothing**, and turns the Backup badge red until the file is fixed or removed. Retention only ever deletes `world-YYYYmmdd-HHMM.zip`; a `manual-*.zip` stays until someone deletes it (each is the size of the world). A backup failure never keeps the server down — it is in `backup.log` and on the badge. Restoring one: deployment guide §11f.

**Every zip also carries the server's own state** (since 2026-10-12), under `server-state\`: the five identity files, the override list, `config-overrides\` and the `.icraft_*_policy` files that exist. `backup.log` says `… N files + M of the server's own state`; `WARN: server state NOT in this backup -- <file>` = that file was left out, the world part is still good.

- **Extracting a zip in the server folder restores the world only.** `server-state\` lands as a folder beside `world\` that nothing reads: the live whitelist, bans and overrides stay as they are. Do not copy it over the live files to "finish" a restore: that puts the lists of the backup's day over today's. Taking one of those files back is a decision of its own, with the server stopped: guide §11j.
- The bundle is names, UUIDs and banned addresses: list a zip (`tar -tf`), never print or commit what is in it.
- A regeneration run takes a pinned `manual-*.zip` first (trigger `pre-regen <code>` in `backups.json`) unless one already matches the world, and does not run without it.

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
- **`.icraft_start_refused` exists next to it: the server is down on purpose.** The launcher started no JVM (no crash report, nothing in `latest.log`); the heartbeat retries three times, then `GAVE UP`. There are two causes with different fixes, and `why=` in that file says which: see A refused start.
- **A `java.exe` that is alive is not proof of a server that runs.** A crash whose own stop throws (`Exception stopping the server` right after a crash report) leaves the JVM up with no `Server thread`: the process is there, nobody can join, and with `max-tick-time=-1` the game's own watchdog never ends it. Seen in the boot rig on 2026-10-13 (a chunk asked for in a dimension whose feature order had a cycle; fixed `82735071`). What the launcher's status file and heartbeat show for such a process has NOT been tested. Tell: a `crash-reports\crash-*.txt` newer than the JVM's start time and no further lines in `latest.log`; `jcmd <pid> Thread.print` has no `Server thread`.
- `stuck=` set: the launcher's own watchdog, a phase past 10 min (also `WATCHDOG: STUCK in '<phase>'` in `logs\restart_policy.log`). It reports and does nothing else.
- `log_push=`: how the last log push went. It is never the reason the server is down. `FAILED … the saved token cannot use the private repository …` = the token on the box has no access to `IridescentCraft-logs`; the logs stay staged and go out once it has (guide §14).

**A stalled `git` is no longer the expected cause.** The 39-minute outage of 2026-10-11 was a restart waiting on the log push's git; that push now runs no git and sits after the start. `git.exe` under the launcher means someone clicked Sync, Apply Self-Update or Rebuild + Push GUI, and those calls are killed after 5 min. Look instead for the child with an old start time and no CPU between the two samples (a `java.exe` during `pre-launch` is the Java check or the Forge installer, not the server), or for no child at all, which leaves the step `phase=` names: the network to GitHub, a mod download, the backup.

**Then:** tell the planning session before touching anything on the box. The request file cannot restart a server that is not up, and after `GAVE UP` nothing restarts it remotely: the way out is at the box's desktop (Stop if a run is still live, then Cycle; after an unfinished regeneration, Roll back first). **Do not start a second launcher over WinRM** (its window is in no session anyone can see, and the first one is still there), and do not reach for the `.bat` scripts. Stage timings and the forensic record: deployment guide §14e, failure-modes §9.

## A refused start (two causes)

`.icraft_start_refused` next to `server.properties` means the launcher started no JVM, on purpose. **Read its `why=` line before anything else**: it names the cause, and the fixes differ.

| | Unfinished regeneration | Access switch not restored |
|---|---|---|
| `why=` | `a world regeneration was left unfinished (.icraft_regen_in_progress is there) …` | `white-list=false in server.properties …`, `… is missing from server.properties`, or `.icraft_config_overrides.json does not parse` |
| What happened | The launcher died or failed part-way through a regeneration run or its rollback: some chunks are reset, some are not | A pinned `white-list`, `enforce-whitelist` or `online-mode` could not be put back, or the list or the file cannot be read |
| Checked | First, before the put-back | Last, after the put-back |
| The auto-Cycles | Cure nothing: **every Cycle is refused again** until the run is rolled back | Each retries the put-back, which often cures it |
| `config-overrides\history.log` | No line. The record is `logs\regen_execute.log` | A `START REFUSED` line |
| Fix, at the box | Customizer -> **Regenerate** -> **Roll back** on the run marked `This run did not finish` (type its code), then Cycle | Put the value into `server.properties` or repair the list, then Cycle |
| Detail | guide §16f | guide §15j |

- **`verify-server.ps1` prints its access-case notes under ANY refusal.** Both causes show as RED under its access heading, `THE LAUNCHER REFUSED TO START THE SERVER (<when>): <why>`, exit 6 (5 once the server has been down 10 min). The quoted `why` is right. For a regeneration refusal the lines after it are not: "it would have run with its whitelist or online mode off", "put the value into server.properties … then press Cycle", the pointer to §15j. Go by `why=` and §16f.
- `icraft settings start-check` repeats the access check only: it knows nothing of a regeneration, and a worldgen or datapack value on the list guards nothing.
- During a regeneration refusal `server.properties` may read `white-list=false` (the put-back comes after that guard): no JVM, nothing open.
- **Never delete `.icraft_regen_in_progress` to get the server going**: it would start on a half-reset world. The one exception is the launcher saying so itself (`… could not be removed …: delete it by hand`).
- After `GAVE UP` neither cause clears remotely: tell the planning session; the operator acts at the box.

## World regeneration (the Regenerate page)

Customizer -> **Regenerate** resets chunks so that the game generates them again: the one part of the launcher that deletes world data (on the box since 2026-10-12, not run on the live world as of that date).

- **Only a code typed into the launcher window starts a run**, at the box, with the server stopped. **Nothing remote can**: no request file, flag or environment variable. The CLI's `regen-execute` / `regen-rollback` work on a marked scratch copy only; `request_regen_report.ps1` only writes a map to `regen-reports\`. A brief that asks for a run, a rollback or a "finish" from the dev PC is wrong: report it.
- **It can:** take (or re-verify) a pinned backup, move what it resets into `regen-holding\<run>\`, prune the mod records that pointed there, check the result, and put everything back by itself when a step fails. **Roll back** on the same page undoes a run exactly, for as long as the server has not run on the result.
- **It cannot:** run while a JVM has the world; reset a chunk that holds a player's logout position, a claim or Create track (the run is refused, nothing touched); start a pregeneration; be rolled back after a server start (the way back is then the pinned backup, guide §11f).
- **Markers:** `.icraft_regen_in_progress` = the world is being changed right now, or a run died part-way (then: A refused start). `regen-holding\<run>\` = a run's way back: as big as what it reset, never pruned, the operator's to delete. Neither is drift. The server is stopped on purpose during a run (`phase=no supervised server`).

The operator's steps: guide §16b. An unfinished run: §16f. What a run does to each mod's data: §16e.

## Access: who can join

The live server is public (through the relay) and runs `online-mode=false`, so the whitelist is the door. Since 2026-10-11 none of it is pack content:

- **The identity files are the server's own:** `whitelist.json`, `ops.json`, `banned-ips.json`, `banned-players.json`, `usercache.json`. Untracked and ignored in the repo; no sync path writes or deletes them (the launcher's `SERVER_OWNED_FILES`, and the legacy sync scripts skip them too). **Do not "restore" one from the repo** (history holds only the empty lists that used to wipe them) **and do not expect a sync to repair one.** `ops.json` is empty on purpose (operator ruling 2026-10-11: operator status stays off for now): not a fault to fix.
- **The switch is pinned.** `white-list` and `enforce-whitelist` are two entries on the override list (`.icraft_config_overrides.json`). The launcher puts both back before every JVM start; each time it has to write, `config-overrides\history.log` gets a `PUT BACK` line (no line when the file still held the values).
- **`white-list=false` on disk right after a sync is expected.** The tracked `server.properties` carries the pack default, so every sync that rewrites the file leaves `false` there for a few seconds, with no JVM running (9 s when measured). A running JVM keeps what it read at start. Do not "repair" a pinned value back to the pack's, and do not expect a hand edit to last: the list decides.
- **The access start guard** (since 2026-10-11). After the put-back, every `white-list`, `enforce-whitelist` or `online-mode` the list switches ON must read `true` in `server.properties`. If one does not, or the file or the list cannot be read, **no JVM is started**: `.icraft_start_refused` says when and why, `history.log` gets `START REFUSED`, the heartbeat's three auto-Cycles each retry the put-back, then it gives up and the server stays down until Cycle is pressed at the box. A pass leaves no trace. `icraft settings start-check` repeats the check read-only, over the share too (the CLI is a CI artifact, not on the box; exit 0 = this guard would pass). The other thing that refuses a start, an unfinished regeneration, has nothing to do with access: A refused start.
- **The check:** `verify-server.ps1` section 7 (counts only, never a name). **RED, exit 6** = the whitelist is off on the public server (the file says `false` and no pin puts it back), `server.properties` is unreadable, or `THE LAUNCHER REFUSED TO START THE SERVER` (with the launcher's reason; exit 5 once the server has been down 10 min). YELLOW covers the expected cases (file `false` with the pin in place; on but not pinned; on and empty). What to do on RED: guide §15j, unless the reason is a regeneration (then A refused start: the script's notes do not apply).
- **Someone joining under a listed player's name** (offline mode checks the name, not an account) cannot be banned on their own: the UUID is the real player's and every relay connection has the same address. Take the name off the whitelist. The operator has accepted this risk for now.

Adding or removing a player:

```powershell
# From the dev PC, over the share. ExactName = the in-game name, capitals included. Also: -Remove ExactName, -List, -Check.
powershell -ExecutionPolicy Bypass -File '<repo>\.minecraft\server_distribution\manage_whitelist.ps1' -ServerRoot 'Z:\Users\silvariazemaitis\Desktop\IridescentCraft Dedicated Server' -Add ExactName
```

Then the server has to re-read the file: `whitelist reload` typed in the launcher's console box (at the box), or the next restart. `-Check` compares every entry's UUID with its name and exits 1 on a bad one. `-List` and `-Check` print player names: keep their output out of the public repo, the wiki and commit messages.

**Never `whitelist add <name>` or `op <name>` while the server is in offline mode.** Both look the name up with Mojang first and store the account's UUID, which the player never has in offline mode: the command reports success and the player is still refused ("You are not white-listed on this server!"). Why, and the rest (pins, limits, a new server): guide §15.

## Triage flow

1. **Get the signal.** Read the NEWEST `crash-reports\crash-*.txt` (not the rolled `latest.log`) and tail `logs\latest.log`. If the share is out of reach, the pushed copies are in a clone of the private `IridescentCraft-logs` repository, under `server\` (pull first; the newest run arrives a few minutes after the restart, `debug.log` only after a crash exit). No crash report and no JVM: see Launcher up, JVM down.
2. **Classify** against the signatures below.
3. **Fix at the repo source** under `<repo>\.minecraft\…` (or the relevant mod's resources). Never edit the Z: runtime.
4. **Push** (standing auto-push to main).
5. **Re-sync the server (mode-aware, below) + restart.**
6. **Verify:** watch `logs\latest.log` for "Done preparing level"/"For help, type \"help\"" and confirm no new `crash-reports\crash-*.txt`. Then `verify-server.ps1`: exit 0, and read its AMBER lines (A boot that did not crash, below).

## Crash signatures (known)

- **Client-only mod loaded on the server (#19-20, embeddium).** Crash during mod load referencing a rendering/client class (embeddium / rubidium / oculus / Prism / a UI mod). ROOT in 2026-06: the mod's `.pw.toml` was in the server index, and the clean-up keeps any jar a metafile names, whatever its `side`. Since 2026-10-12 the indexes have ONE source: `.minecraft\mods\.index\` (the root index). `server_distribution\mods\.index\`, `distribution\client\mods\.index\`, `client_only_mods.txt` and the skip lists inside the server scripts are GENERATED from it by `.minecraft\dev\mods\mod_index.py generate`; a mod whose root metafile says `side = 'client'` is absent from the server index, so the server never downloads it and its clean-up removes the jar if it is found there. FIX: change the side at the source, `python -I .minecraft\dev\mods\intake.py decide <mod> side client` (it edits the root metafile, regenerates and checks, and keeps the mod's intake record in step), or edit `side` in the root metafile and run `mod_index.py generate`; commit everything it wrote. **Never edit a file under the two generated indexes, or a block between `>>> mod_index.py` and `<<< mod_index.py`**: `mod_index.py check` (pre-push hook and CI) refuses the push. A mod that has to leave both sides: `intake.py remove <mod>` (the report first, then `--apply`).
- **Both-sides mod dropped from the server → the CLIENT now DCs on join (registry NPE).** After you remove a `side='both'` mod from the server to fix a server crash (with `intake.py remove <mod> --apply`, or by setting its side at the root index: never by deleting a file from a generated index), the **client must drop it too** — otherwise the client still registers that mod's content and the join handshake fails with `NullPointerException: Registry Object not present: <namespace>:<id>` (real case: `soulsweapons:ghostly` after Marium's Soulslike was dropped, `902f1e9`). The client purge only lands if the **test instance actually synced to origin** — a stale/diverged instance keeps the removed jar (the prelaunch sync used to silently stick on a stray local commit and drift 120 commits behind; fixed 2026-06-03 with force-sync + index reconcile, see lessons-learned). **FIRST check the instance is at origin HEAD:** `git -C <instance> rev-list --count HEAD..origin/main` must be `0` (non-zero = stale → `git -C <instance> fetch origin; git -C <instance> reset --hard origin/main`, then relaunch). Even after a sync, the instance's overlaid `mods\.index\` can keep the removed mod as an **untracked leftover** — `prism_prelaunch.bat`'s Phase-2 `reconcile_client_index.ps1` purges that (drops untracked tomls absent from origin's main index + the client-distro index, while preserving the client-only overlay). The standalone twin of this is the server case below; the principle is symmetric — a side change isn't shipped until BOTH sides actually re-synced.
- **Reload-unsafe Forge listener (#60).** `java.lang.IllegalStateException: null` in `rhino…enterActivation…` during "Ticking entity" (after a `/reload` or on a mob attack). ROOT: a raw `MinecraftForge.EVENT_BUS.addListener` registered from a KubeJS server script captures a Rhino scope that dies on reload. FIX: route through the mod-owned dispatcher or a KubeJS `EventGroup` (see `kubejs\server_scripts\relic_boss_drops.js` + `strip_anomalous_drops.js`); never raw-register from a server script.
- **Biome feature-order cycle (#64).** Crash on world load: `Feature order cycle found, involved sources: [...]` from `ModdedBiomeSlicesManager`. ROOT: a custom biome injects a feature out of order vs TerraBlender region init. FIX: reorder the feature deps; validate with `iridescent-biomes-mod\tools\check_feature_cycles.py`. **A cycle can also sit in a dimension nobody has entered**: nothing fails at world load, and the server goes down when the first chunk there is generated (the End, found 2026-10-13, fixed `82735071`: two placed features of the pack's own datapack were one feature to the game; the message names one biome and no feature). The boot gate finds it before a push: every `boot.ps1` run reads the feature order of all dimensions, names the step, the features and the biomes of a cycle, and generates one new chunk per dimension (`<repo>\.minecraft\dev\boot\README.md`, "The worldgen check").

## A boot that did not crash: the boot-log check

`verify-server.ps1` runs `loud-check.ps1` over the box's `logs\`:

- **RED, exit 4:** a KubeJS error or handler abort, a script that did not load or is stale, a registration the scripts make that this boot did not make (`armed:<name>@<group>`, `NOT ARMED`; also `armed:set:<type>` when the count or the digest of a script type is not the manifest's, and `armed:summary:<type>` when the `[icraft.live] ARMED <type>: ...` line itself is missing), one of the manifest's hand-kept lines missing, a mixin / dependency / tick-loop / OOM pattern. Also when the boot has no `Done` line (`boot-incomplete`): still starting (wait, run it again), or it died on the way. A `latest.log` the game rolled at the box's midnight is read together with the rotated log before it, so an uptime across midnight is judged as one boot; where that earlier log is not at hand the check says `boot not judgeable: log rolled` under NOT RUN and nothing turns red.
- **AMBER, exit code unchanged:** ERROR lines of `latest.log` (WARN in the KubeJS logs) that nobody has accepted in `baseline.json`.
  - `KNOWN DEFECT, reviewed and not baselined (…)` is expected. Today, nine lines at most: the dead `cataclysm_ut` add-on (6), `chunky_player_pause` (2), Crust's `default_game_rules.toml` (1: upstream; Crust rewrites the file in a form it cannot read back, so a fix holds one boot. Leave it).
  - **`not in the baseline, xN: …` is NEW: this boot logged an error that no accepted boot did.** A change that landed without crashing anything shows here first. Read the line, find the push that brought it (`.icraft_last_sha` against `git log`), fix it at the source. Accept it in `baseline.json` only once it is understood and harmless, with the reason; never to quiet the output. `baselined at xN, now xM` (three times as often) gets the same treatment.
  - Nothing forces anyone to look at AMBER: report the count, and whether any line was new.
- **AMBER as well: `notfired:<name>@<group>`.** A registration whose event runs on every boot with nobody online (recipes, loot modifiers, tags, commands, `ServerEvents.loaded`, the startup registries) and that did not run to its end in a finished boot: the event was not posted, or the handler never got to its end. Read in the first second after `Done` it is not judged yet (the game prints what fired once a second): run the check again.
- **The checker's `FIRED`, `AT BOOT` and `NEVER` lines are a report, never a finding**: what ran in this boot, which every-boot registrations ran, and which names have never fired in the last boots that had a player online. Only `notfired:` above is a finding.
- `STALE DEFECT <id>` / `STALE ACCEPTED <id>` after the findings is not a finding: a line the baseline lists was absent from two complete boots in a row, so its entry can be deleted. No verdict or exit code moves.

Lines to know:

- `logs\latest.log`, seconds after `Done`: **`[empty-level-prune] active: … N of N levels … (Forge's fresh lists).`** = the backstop against the empty-level chunk leak (`iridescent_durability_clamp`) is on. `ABSENT` = it did not apply; `ABSENT (part)` = only its second part (Forge's fresh lists) did not. **Either way the server is fine: no restart.** What is missing is the protection (chunks loaded in a level without players pile up again: the nightly out-of-memory of 2026-10), so report it and look for a mixin warning naming `LevelEmpty…PruneMixin`. `OFF` = a JVM switch, on purpose. The checker does not look for `ABSENT`.
- `logs\kubejs\server.log`: **`0_lib_core loaded -- global.icraft.core`**. All script-applied mob and boss scaling depends on `0_lib_core.js` loading: the `scaling\*.js` handlers return silently without it, other scripts log `0_lib_core.js did not load -- … OFF`. The line is in the liveness manifest, so missing = RED. Fix that file before chasing anything that looks like a balance bug.
- `logs\kubejs\server.log` and `logs\kubejs\startup.log`: **`[icraft.live] ARMED server: 316 registrations (...), digest ...; against the expected list: 0 not armed, 0 unlisted`** and **`[icraft.live] ARMED startup: 23 registrations ...`**. The counts are those of pack `fba05cd5` (`liveness_manifest.json` has today's). `N not armed` above zero means the scripts make a registration this boot did not: the checker names each as `armed:<name>@<group>`, RED. An id looks like `<name>@<event>`, `<name>@tick.server`, `<key>@hurt`, or `<script>@<Registry>.<method>` for a function put straight on a Java registry.
- `logs\kubejs\server.log`: a WARN that starts **`[icraft.core]`** and ends **`(logged once per script load)`** is the core library saying one of its helpers failed and answered a neutral value (`false`, no attacker, no tag): every script that asked got the degraded answer. No accepted boot has such a line, so the checker shows it as `not in the baseline`: treat it as NEW and find the helper the line names. The same ending at INFO is good news (a path ran).

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
- **Starting the live server with `iridescentserver.bat`, `run.bat` or a `.sh` script** — they skip the override put-back and both start guards, so the public server starts with the pack's `white-list=false`, and on a half-regenerated world if that is why the launcher refused. Use the launcher, also when it has refused a start.
- **Answering a refused start with "press Cycle" before reading `why=`** — an unfinished regeneration is refused again until it is rolled back, and `verify-server.ps1` prints the access advice either way.
- **Deleting `.icraft_regen_in_progress`, or clearing `regen-holding\`, to get a server going or free disk space** — a start on a half-reset world; the exact way back gone.
- **Copying a backup's `server-state\` over the live files** — the whitelist, bans and overrides of the backup's day over today's. Extracting a zip restores the world only (guide §11j).
- **Reading AMBER as green** — the exit code does not move. A `not in the baseline` line is new and needs reading.
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
