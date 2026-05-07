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

**GUI extras:**
- Status badges row: Forge present, EULA, mod count, last sync SHA
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
