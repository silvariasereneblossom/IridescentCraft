# Iridescent Launcher (`icraft`)

> **Status: EXPERIMENTAL** — shipped for early-adopter testing; not the canonical launch path yet. The existing `iridescentserver.bat` chain continues to work and remains supported. Promote to canonical only after a sustained period of real-world testing on the dedicated server box.

Single-binary Rust replacement for the `.bat` / `.ps1` / `.sh` scripts under `.minecraft/server_distribution/`. Headless CLI for service-mode operation (NSSM, systemd) plus an egui GUI with one button per subcommand and a live log pane.

Repo: `iridescent-launcher/` at the project root.

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

`icraft serve` runs the full Phase -1 → Phase 5 sequence end-to-end.

## Architecture

Rust workspace with three crates:

- `icraft-core` — library, one module per phase. Pure logic; no UI.
- `icraft-cli` — `icraft` binary. clap-based subcommands; headless. Used by NSSM / systemd / scheduled tasks.
- `icraft-gui` — `icraft-gui` binary. eframe/egui window, one button per subcommand, scrolling log pane fed via a custom `log` appender + mpsc channel. Persists the install dir between launches via eframe's storage. Native folder picker on Windows (`rfd`).

`default-members = ["icraft-core", "icraft-cli"]` — `cargo build --release` from a Linux dev host produces just the CLI (~3.8 MB). The GUI's eframe dep tree is heavy (~600-800 MB target/) and intended to be built directly on the Windows server box where disk isn't constrained.

## Capabilities

**Native, no shell-out:**
- GitHub diff-based repo sync (replaces `phase0_sync.ps1`'s GitHub compare API + raw.githubusercontent.com fetches; full-zip fallback when ≥300 changed files)
- Packwiz `.pw.toml` parser (strict TOML + line-regex fallback for the apostrophe-in-name edge case)
- Mod download with redirect-following + size validation + URL-fallback walking + per-URL retry
- Full-zip download + extract via the `zip` crate
- Mod-folder hygiene: strip client mods, update against allowlist, cleanup stale jars
- Forge installer download + `--installServer` invocation
- EULA write
- Java spawn with Aikar flags
- Crash-report capture + tail-of-latest.log + git push to TesterLogs
- PAT auth via `ICRAFT_GH_TOKEN` env var or `.icraft_token` file
- Hang-detection watchdog: polls `logs/latest.log` mtime; kills on `boot_timeout` (default 15 min) or `idle_timeout` (default 15 min, post-boot) with graceful SIGTERM-equivalent so worlds flush. Configurable per-launch via `--boot-timeout` / `--idle-timeout`.

**World backups (since 2026-10):**
- Every restart the launcher makes has a moment where the server is stopped and the world files are closed. If the newest scheduled backup is 12 hours old, the launcher uses that moment to zip the whole world folder into `backups/`. Restarts already happen every 4 to 12 hours, so this gives two backups a day with no restarts of its own.
- Each new zip is reopened and read back in full (every file's checksum and size) before it counts. Only then is the oldest one removed; the newest two scheduled backups are kept. A backup that fails its check is thrown away and the older ones stay.
- A backup problem never keeps the server down: it is logged, shown in red on the launcher's **Backup** badge, and the server starts anyway.
- **Back up now** (button, or a request file for remote use) takes an extra *pinned* backup that is never removed automatically, for use before a risky change. If the server is running it waits for the next restart.
- `icraft backup` and `icraft backup-status` do the same from the command line.
- **A second copy is kept on another machine.** Every two hours a separate computer fetches the newest two backups from the server. Each copy is read back and compared with the checksum the launcher recorded for it, and only after that does the oldest copy there get removed. A copy that does not match is thrown away and reported, and the older ones stay. A failed disk on the server no longer takes the backups with it.

**World regeneration dry-run (since 2026-10):**
- The launcher can work out, without changing anything, which parts of the world a future terrain regeneration would keep and which it would reset. Kept: every player's bed chunk and the chunks around it, claimed chunks (Open Parties and Claims), the area around world spawn, chunks holding a waystone a player has activated or placed, and chunks players have spent real time in. The server operator can add or remove areas by hand.
- It writes a report (what is kept and why, per player; what would be reset; warnings such as a lived-in chunk that would be lost), a per-chunk spreadsheet, an overview map, and a plan file. It only reads the world, so it can be run while the server is up.
- Nothing is deleted. Carrying a plan out is a separate, later step: it will need a fresh verified backup, the server stopped, and the operator's sign-off on that exact plan.
- It has its own **Customizer** tab in the launcher window, next to the world backups: what would be regenerated, which dimensions and every protection rule are set on screen, a run is one click, and the result is shown as totals, per-player lines, warnings and a map. Earlier runs can be picked from a list. `icraft regen-dryrun` does the same from the command line.

**Server-side worldgen settings (since 2026-10):**
- The Customizer tab has a second page, **Worldgen settings**. It lists the pack's world-generation settings file by file: biome layout (TerraBlender, Biomes O' Plenty, the Aether), terrain shape (Tectonic) and ore generation (Mekanism, Large Ore Deposits, Thermal, Create, Create Ore Excavation). Every setting shows the mod's own description and allowed range next to it.
- A change made there belongs to that server only. The launcher keeps it in a list of its own and writes it back into the mod's config file before every server start, so a pack update cannot undo it. One click gives a setting back the pack's value, and all of a server's own values are shown together in one table.
- Config files are only written while the server is stopped. A change saved while it is running waits for the next restart.
- These settings shape terrain as it is generated. Chunks that already exist keep what they were generated with until they are regenerated, and changing the biome layout or the terrain shape of a world in use leaves a visible seam where new chunks meet old ones.
- A few settings are shown but locked, because they are not server-only: the world's build height, and one snow setting that every player's game reads from its own copy. Not covered yet: the ore amounts the pack sets through its datapacks, and how often the pack's own cherry biomes appear.
- Every change that reaches a config file is logged, and each file is kept as it was before the first change to it. `icraft settings` does the same from the command line.

**Who may join (since 2026-10):**
- A server's whitelist, operator list, ban lists and name cache are that server's own. They are not part of the pack, and the launcher's sync never writes or deletes them, whatever the pack repository holds.
- Whether the whitelist is on is a setting of the server too. It is kept on the same list as the worldgen settings above, so the launcher writes it back before every server start and a pack update cannot switch it off. A value that was already edited into the file can be adopted as it stands (`icraft settings pin`).
- On a server that does not check accounts (`online-mode=false`), the game's own `whitelist add` command stores an ID the player never has, so the player stays locked out. The server folder carries a small script, `manage_whitelist.ps1`, that adds, removes, lists and checks entries correctly; `whitelist reload` in the launcher's console box, or the next restart, makes a change take effect.
- A player who is not on the list sees *"You are not white-listed on this server!"*. Names are case-sensitive there.
- The operator's server check reports on every run whether accounts are checked, whether the whitelist is on and how many players are listed, and turns red when a public server has its whitelist off.

**GUI extras:**
- Status badges row: Forge present, EULA, mod count, last sync SHA, backup age
- Color-coded log lines per level (red ERROR / orange WARN / blue INFO / gray DEBUG)
- "Update Launcher" button — pulls a fresh `icraft-gui.exe` from the repo, applies via the existing self-update flow, spawns the new instance, exits cleanly. Path A flow (binary committed to repo); GitHub Releases / CI-built artifacts (Path B) is a future polish.

## Install + launch

See [BUILD.md](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/iridescent-launcher/BUILD.md) for the canonical build / cross-compile / code-signing reference.

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

- v0.6 — replace the existing `iridescentserver.bat` with a 2-line shim (`icraft.exe serve`) once the canonical promotion happens. Bats live alongside as fallback for one release.
- v0.7 — GitHub Releases + CI-built `icraft-gui.exe` (Path B); GUI auto-updates without operator intervention.
- v0.8 — port client-side launcher scripts (PrismLauncher pre/post hooks). Currently out of scope; client flow stays unchanged.
- v0.9 — port build_mod.sh (×7 mods), extract_mobdiag, validate_datapack_references, build_codex.

Tracking issues: see commit log under `iridescent-launcher: ...` prefix. Lessons-learned entries on the implementation are in the internal repo.

## Caveats while EXPERIMENTAL

- **Not the canonical path yet.** Existing `iridescentserver.bat` continues to work and is the supported flow until this section's status is upgraded.
- **Windows GUI requires the Rust toolchain on the build host** for the initial build. After that, `Update Launcher` button handles in-place upgrades.
- **PAT setup is required for log auto-push** — see [PAT_SETUP.md](https://github.com/silvariasereneblossom/IridescentCraft/blob/main/.minecraft/server_distribution/PAT_SETUP.md). The launcher inherits the same env-var or file-based PAT discovery as the .bat path.
- **First-time mod download is sequential, not parallel** — matches `server_install.ps1`'s behavior. ~450 mods on a fresh install takes ~10-20 minutes depending on bandwidth. Parallel via rayon is a v0.3.1 follow-up.
- **No worldgen / chunky / pre-gen integration** — those are still operator-driven via `/chunky` and not represented in the launcher. Out of scope.

## Why bother

The .bat/.ps1 stack accumulated ~2000 LoC across 12 scripts with cross-shell dependencies (cmd → PowerShell → bash on Linux mirror), Sinytra Connector mixin-loader interactions, a `pause` deadlock in unattended mode, silent stderr redirects hiding real failures, and no observability for hangs. The Rust binary collapses all of that into a single artifact with structured logging, real error surfaces, configurable timeouts, and graceful service-mode operation. **Meaningful only if you run a dedicated server box** — single-player / LAN sessions don't see any of the underlying scripts.
