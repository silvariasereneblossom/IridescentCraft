# Iridescent Launcher (`icraft`)

> **Status: in production.** The launcher's GUI runs the live dedicated server: it syncs the server to the pack before every start, restarts it on a schedule and after a crash, takes and checks the world backups, and holds the Customizer (regeneration and worldgen settings) and the access guard. The existing `iridescentserver.bat` chain still installs and starts a server on other hosts, but it has none of the launcher's start guards, so the live server is never started with it.

The launcher is a single Rust binary that replaces the `.bat` / `.ps1` / `.sh` scripts under `.minecraft/server_distribution/`. It has a headless CLI for service-mode operation (NSSM, systemd) and an egui GUI with one button per subcommand and a live log pane.

The source is in `iridescent-launcher/` at the project root.

## What it replaces

| Phase | Original script | Subcommand |
|---|---|---|
| -1 (Z mirror / GitHub zip) | `sync_from_repo.bat` | `icraft sync` (also full orchestration) |
| 0 (diff sync) | `phase0_sync.ps1` (~280 LoC) | `icraft sync` (native, no shell-out) |
| 0.5 (self-update swap) | inline bat block | `icraft self-update` |
| 1 (java check) | inline bat block | `icraft check-java` |
| 2 (Forge install) | inline + `server_install.ps1` | `icraft install-forge` |
| 2.5 (mod download) | `server_install.ps1` (~220 LoC) | `icraft install-mods` |
| 2.6 (strip client mods) | `strip_client_mods.bat` | `icraft strip-client-mods` |
| 2.7 (sync mod jars) | `update_mods.ps1` (~275 LoC) | `icraft update-mods` |
| 2.8 (cleanup stale jars) | `cleanup_stale_jars.ps1` | `icraft cleanup-jars` |
| 3 (EULA) | inline bat block | `icraft accept-eula` |
| 4 (java exec) | inline `java @argfile` | `icraft run` |
| 5 (post-exit + log push) | `push_crash_logs.bat` | `icraft push-crash-logs` |
| diag | `diagnose.ps1` | `icraft diagnose` |
| firewall | `firewall_audit.bat` | `icraft firewall-audit` |

`icraft serve` runs the whole sequence from Phase -1 to Phase 5.

## Architecture

The Rust workspace has three crates:

- `icraft-core`: the library, one module per phase. Pure logic, no UI.
- `icraft-cli`: the `icraft` binary, with clap-based subcommands; headless. NSSM, systemd and scheduled tasks use it.
- `icraft-gui`: the `icraft-gui` binary. An eframe/egui window with one button per subcommand and a scrolling log pane fed by a custom `log` appender and an mpsc channel. It keeps the install dir between launches in eframe's storage and has a native folder picker on Windows (`rfd`).

With `default-members = ["icraft-core", "icraft-cli"]`, `cargo build --release` on a Linux dev host produces only the CLI (about 3.8 MB). The GUI's eframe dependency tree is heavy (about 600-800 MB of target/); CI builds it on a Windows runner and commits the exe to the repo after every change to the launcher's source.

## Capabilities

**Native, no shell-out:**
- GitHub diff-based repo sync (it replaces the GitHub compare API and raw.githubusercontent.com fetches of `phase0_sync.ps1`, and falls back to the full zip at ≥300 changed files)
- Packwiz `.pw.toml` parser (strict TOML, with a line-regex fallback for the edge case of an apostrophe in a name)
- Mod download that follows redirects, validates sizes, walks fallback URLs and retries each URL
- Full-zip download and extraction with the `zip` crate
- Mod-folder hygiene: strip client mods, update against the allowlist, clean up stale jars
- Forge installer download and the `--installServer` run
- EULA write
- Java spawn with Aikar flags
- Crash-report capture and the tail of latest.log; the server's logs and crash reports are pushed to a private log repository, never to this public one
- PAT auth through the `ICRAFT_GH_TOKEN` env var or the `.icraft_token` file
- Hang-detection watchdog: it polls the mtime of `logs/latest.log` and kills the server on `boot_timeout` (default 15 min) or `idle_timeout` (default 15 min, after boot), with a graceful SIGTERM equivalent so worlds flush. Both can be set per launch with `--boot-timeout` / `--idle-timeout`.
- Crash detection (since 2026-10-15): when the game writes its own fatal log lines, the run counts as a crash whatever exit code the JVM returns. A server whose tick loop had died could exit with code 0 and pass for a clean stop, so it was never restarted, or its JVM stayed alive for minutes with the status still saying "up". Now a crashed run is restarted, a JVM still alive 30 seconds after a failed stop is killed, and after three restarts in 30 minutes that did not bring the server up, the launcher gives up and says so. A Cycle request (not only the button at the server) then starts it again.
- A restart never waits on the log push, and git can never stop the launcher with a prompt (since 2026-10-11).

**World backups (since 2026-10):**
- Every restart the launcher makes has a moment when the server is stopped and the world files are closed. If the newest scheduled backup is 12 hours old, the launcher uses that moment to zip the whole world folder into `backups/`. Restarts already happen every 4 to 12 hours, so this gives two backups a day without any restarts of its own.
- Each new zip is reopened and read back in full (every file's checksum and size) before it counts. Only then is the oldest one removed; the newest two scheduled backups are kept. A backup that fails its check is thrown away and the older ones stay.
- A backup problem never keeps the server down: it is logged and shown in red on the launcher's Backup badge, and the server starts anyway.
- Back up now (a button, or a request file for remote use) takes an extra *pinned* backup that is never removed automatically, for use before a risky change. If the server is running, it waits for the next restart.
- `icraft backup` and `icraft backup-status` do the same from the command line.
- A second copy is kept on another machine. Every two hours a separate computer fetches the newest two backups from the server. Each copy is read back and compared with the checksum the launcher recorded for it, and only then is the oldest copy there removed. A copy that does not match is thrown away and reported, and the older ones stay. A failed disk on the server no longer takes the backups with it.
- A backup holds more than the world. The files a server keeps for itself and that exist nowhere else travel with it, in a `server-state` folder inside the zip: who may join (whitelist, operators, bans), the server's own config values and their history, and its restart, backup and regeneration settings. They sit beside the world instead of over the live files, so restoring a world never puts an old whitelist over the current one; taking one of those files back is a separate, deliberate step.

**World regeneration dry-run (since 2026-10):**
- Without changing anything, the launcher can work out which parts of the world a future terrain regeneration would keep and which it would reset. Kept: every player's bed chunk and the chunks around it, claimed chunks (Open Parties and Claims), the area around world spawn, chunks holding a waystone a player has activated or placed, and chunks players have spent real time in. The server operator can add or remove areas by hand.
- It writes a report (what is kept and why, per player; what would be reset; warnings such as a lived-in chunk that would be lost), a per-chunk spreadsheet, an overview map and a plan file. It only reads the world, so it can run while the server is up.
- Nothing is deleted. Carrying a plan out is a separate step with its own page (below).
- It has its own Customizer tab in the launcher window, next to the world backups. What would be regenerated, which dimensions and every protection rule are set on screen; a run is one click; and the result is shown as totals, per-player lines, warnings and a map. Earlier runs can be picked from a list. `icraft regen-dryrun` does the same from the command line. The launcher keeps the newest twelve reports and removes older ones.

**Carrying a regeneration out (since 2026-10):**
- The Customizer tab's Regenerate page resets the chunks a dry-run marked, so that Minecraft generates them again the next time somebody goes there. Everything the dry-run marked as kept stays exactly as it is.
- Only the server operator can start it, and only by typing: the page shows a short code taken from the plan, and the operator types that code into a field. No button does it alone, and there is no remote request and no timer.
- It checks everything again first. The server must be stopped. The plan is worked out afresh from the world as it is at that moment; if it is not the plan the operator looked at, nothing happens, the difference is shown and a new report is written for the operator to look at. A run is also refused if a player last logged out inside an area that would be reset, if a claimed chunk or train track would be reset, or if a mod's saved data cannot be read.
- A verified backup comes first. The run takes a pinned backup of the world exactly as it stands, reads it back in full, and goes no further without it. The operator can take that backup beforehand and wait until it has reached the second machine.
- Nothing is thrown away. What a run takes out of the world is kept in a holding folder, with a checksum for every file. A rollback puts every file back where it was and checks each one; it is exact for as long as the server has not been started on the regenerated world. After that, the way back is the pinned backup.
- Mod records are kept in step. Waystones, recorded ore deposits and villages that stood in reset chunks are taken off their mods' lists, so the land that comes back does not carry records of things that are gone. Records of anything in kept chunks are untouched.
- Nothing is generated in advance: reset chunks are generated when a player first walks there.
- If the launcher itself is interrupted in the middle of a run, it will not start the server on a half-reset world; the operator rolls the run back first.

**Server-side worldgen settings (since 2026-10):**
- The Customizer tab has a second page, Worldgen settings. It lists the pack's world-generation settings file by file: biome layout (TerraBlender, Biomes O' Plenty, the Aether), terrain shape (Tectonic) and ore generation (Mekanism, Large Ore Deposits, Thermal, Create, Create Ore Excavation). Every setting shows the mod's own description and allowed range next to it.
- A change made there belongs to that server only. The launcher keeps it in a list of its own and writes it back into the mod's config file before every server start, so a pack update cannot undo it. One click gives a setting back the pack's value, and one table shows all of a server's own values together.
- Config files are only written while the server is stopped. A change saved while it is running waits for the next restart.
- These settings shape terrain as it is generated. Chunks that already exist keep what they were generated with until they are regenerated, and changing the biome layout or the terrain shape of a world in use leaves a visible seam where new chunks meet old ones.
- The ordinary ore veins are on the page too: how many veins of vanilla iron and copper, ancient debris, Create zinc and Thermal tin, lead, silver and nickel are tried per chunk, and between which heights. The pack sets these in a datapack instead of a config file; the page edits the numbers inside it and nothing else.
- A few settings are shown but locked, because they are not server-only: the world's build height, and one snow setting that every player's game reads from its own copy. How often the pack's own cherry biomes appear is shown as a fixed number, because it is built into the pack's biome mod and cannot be changed from the launcher.
- Every change that reaches a config file is logged, and each file is kept as it was before the first change to it. `icraft settings` does the same from the command line.

**Who may join (since 2026-10):**
- A server's whitelist, operator list, ban lists and name cache are that server's own. They are not part of the pack, and the launcher's sync never writes or deletes them, whatever the pack repository holds.
- Whether the whitelist is on is a setting of the server too. It is kept on the same list as the worldgen settings above, so the launcher writes it back before every server start and a pack update cannot switch it off. A value that was already edited into the file can be adopted as it stands (`icraft settings pin`).
- The launcher will not start a server with its door open by accident. If a server switched its whitelist (or account checking) on and the launcher cannot put that setting back before a start, it does not start the server at all. It leaves the reason in a file next to `server.properties` and tries again on its next automatic restart attempts. A server that is down is better than one anybody can join. `icraft settings start-check` runs the same check without starting anything.
- On a server that does not check accounts (`online-mode=false`), the game's own `whitelist add` command stores an ID the player never has, so the player stays locked out. The server folder carries a small script, `manage_whitelist.ps1`, that adds, removes, lists and checks entries correctly; `whitelist reload` in the launcher's console box, or the next restart, makes a change take effect.
- A player who is not on the list sees *"You are not white-listed on this server!"*. Names are case-sensitive there.
- On every run, the operator's server check reports whether accounts are checked, whether the whitelist is on and how many players are listed, and it turns red when a public server has its whitelist off.

**GUI extras:**
- A row of status badges: Forge present, EULA, mod count, last sync SHA, backup age
- Color-coded log lines per level (red ERROR / orange WARN / blue INFO / gray DEBUG)
- An "Update Launcher" button: it pulls a fresh `icraft-gui.exe` from the repo, applies it through the existing self-update flow, starts the new instance and exits cleanly. This is the Path A flow (the binary is committed to the repo, where CI builds it); GitHub Releases (Path B) are later polish.

## Install + launch

[BUILD.md](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/iridescent-launcher/BUILD.md) is the canonical reference for building, cross-compiling and code signing.

**Linux dev host:**
```sh
cd iridescent-launcher
cargo build --release
# → target/release/icraft  (CLI only)
```

**Windows server box (CLI + GUI):**
```pwsh
cd iridescent-launcher
cargo build --release
cargo build -p icraft-gui --release
# → target\release\icraft.exe + target\release\icraft-gui.exe
```

**Headless service mode (NSSM):**
```cmd
nssm install IridescentCraft "C:\path\to\icraft.exe" serve
nssm set IridescentCraft AppDirectory "C:\path\to\.minecraft\server_distribution"
nssm set IridescentCraft AppEnvironmentExtra ICRAFT_GH_TOKEN=github_pat_xxx...
nssm start IridescentCraft
```

## Roadmap

- v0.6: replace the existing `iridescentserver.bat` with a 2-line shim (`icraft.exe serve`). The bats stay alongside as a fallback for one release.
- v0.7: GitHub Releases and a CI-built `icraft-gui.exe` (Path B); the GUI updates itself without operator intervention.
- v0.8: port the client-side launcher scripts (PrismLauncher pre/post hooks). This is out of scope for now, and the client flow stays unchanged.
- v0.9: port build_mod.sh (×7 mods), extract_mobdiag, validate_datapack_references and build_codex.

For tracking, see the commit log under the `iridescent-launcher: ...` prefix. Lessons-learned entries on the implementation are in the internal repo.

## Caveats

- The live server runs only under the launcher. The existing `iridescentserver.bat` still works for installing and starting a server elsewhere, but it does not put back a server's own settings or check its whitelist before a start: it starts the server with the pack's settings as they stand, whitelist off.
- CI builds the Windows GUI, so no host needs the Rust toolchain. The `Update Launcher` button, and every Cycle, installs a new build in place.
- Log auto-push needs a PAT; see [PAT_SETUP.md](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/server_distribution/PAT_SETUP.md). The launcher discovers the PAT the same way as the .bat path, from an env var or a file.
- The first mod download is sequential, as in `server_install.ps1`. The server's 428 mods on a fresh install take about 10-20 minutes, depending on bandwidth. Parallel download through rayon is a v0.3.1 follow-up.
- The launcher does not pre-generate terrain. Its worldgen pages (above) change settings and reset chunks, and a regeneration run only checks that no Chunky task is left unfinished; the operator still runs pre-generation through `/chunky`.

## Why bother

The .bat/.ps1 stack grew to about 2000 LoC across 12 scripts, with cross-shell dependencies (cmd → PowerShell → bash on the Linux mirror), Sinytra Connector mixin-loader interactions, a `pause` deadlock in unattended mode, silent stderr redirects that hid real failures, and no way to observe hangs. The Rust binary replaces all of that with a single artifact that has structured logging, real error surfaces, configurable timeouts and graceful service-mode operation. It matters only if you run a dedicated server box; single-player and LAN sessions never see any of the underlying scripts.
