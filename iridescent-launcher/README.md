# icraft — IridescentCraft server launcher

Single-binary replacement for the `.bat` / `.ps1` / `.sh` scripts under
`.minecraft/server_distribution/`. Native Rust, no webview, no JS toolchain,
~2 MB Linux binary, ~5 MB Windows binary (signed once we have a cert).

## Layout

```
iridescent-launcher/
  icraft-core/   library: actual logic per phase
  icraft-cli/    binary `icraft`         (CLI / headless)
  icraft-gui/    binary `icraft-gui`     (Phase 2: egui buttons + log pane)
```

## Subcommands → existing scripts

| `icraft <cmd>`        | Replaces                                      |
|-----------------------|-----------------------------------------------|
| `serve`               | the whole `iridescentserver.bat` orchestrator |
| `sync [--force]`      | `sync_from_repo.bat` + `phase0_sync.ps1`      |
| `self-update`         | Phase 0.5 `.new` swap block                   |
| `check-java`          | Phase 1 java probe                            |
| `install-forge`       | Phase 2 Forge installer                       |
| `install-mods`        | `server_install.ps1`                          |
| `strip-client-mods`   | `strip_client_mods.bat`                       |
| `update-mods`         | `update_mods.ps1`                             |
| `cleanup-jars`        | `cleanup_stale_jars.ps1`                      |
| `accept-eula`         | Phase 3 EULA write                            |
| `run`                 | Phase 4 java exec (Aikar flags)               |
| `push-crash-logs`     | `push_crash_logs.bat`                         |
| `diagnose`            | `diagnose.ps1`                                |
| `firewall-audit`      | `firewall_audit.bat` (Win-only)               |

Every command accepts `--server-dir <path>` to override the install dir
(defaults to cwd) and `-v / --verbose` for debug logging.

## Build

```
cargo build --release
```

Produces `target/release/icraft` (Linux). For Windows cross-compile:

```
rustup target add x86_64-pc-windows-gnu
cargo build --release --target x86_64-pc-windows-gnu
```

## Phasing

- **v0.1:** native Rust orchestration; eula/run/crash/diagnose/firewall
  ported natively; sync/install/mods shell out to the existing PS1/bat
  scripts.
- **v0.2:** native GitHub diff sync — replaces `phase0_sync.ps1`
  end-to-end.
- **v0.3 (current):** native mod download via packwiz parsing —
  replaces `server_install.ps1` + `update_mods.ps1` +
  `cleanup_stale_jars.ps1`. Handles strict TOML + line-regex fallback
  for the apostrophe-in-name edge cases. `--dry-run` flag on
  `update-mods` and `cleanup-jars` so testing never touches disk.
- **v0.4:** `icraft-gui` egui shell with one button per subcommand and a
  scrolling log pane.

## Headless / service mode

Designed to run unattended under NSSM, systemd, or Windows scheduled
tasks. Logs to stderr via `env_logger` (no console UI required), exits
with the server's code on `serve` so wrappers see crashes correctly.
