# Build instructions

Three crates, two binaries, two target platforms.

## Linux (CLI / headless service)

```sh
cd iridescent-launcher
cargo build --release
# → target/release/icraft
```

The default workspace members are `icraft-core` + `icraft-cli`. The
GUI is excluded from the default build because its eframe + wayland
+ x11rb dep tree is heavy and not needed on a headless server.

For a Linux service install:

```sh
sudo install -m 755 target/release/icraft /usr/local/bin/
sudo cp ../docs/icraft.service /etc/systemd/system/    # (TODO: ship one)
sudo systemctl enable --now icraft
```

## Windows (CLI + GUI)

On the Windows server box (or a beefier dev machine), with Rust + the
MSVC toolchain installed:

```pwsh
cd iridescent-launcher
cargo build --release                       # CLI -> target\release\icraft.exe
cargo build -p icraft-gui --release         # GUI -> target\release\icraft-gui.exe
```

The GUI binary launches a native window with one button per CLI
subcommand, a folder picker for the install dir, status badges
(forge / EULA / mod count / last sync SHA), and a scrolling log pane
fed from icraft-core via a custom `log` appender.

## Cross-compile (Linux host → Windows binary)

For the CLI only (the GUI's wayland/x11 deps don't cross-compile
cleanly without MinGW + extra Win32 SDK plumbing):

```sh
rustup target add x86_64-pc-windows-gnu
sudo apt install gcc-mingw-w64-x86-64                    # Debian/Ubuntu
cargo build --release --target x86_64-pc-windows-gnu
# → target/x86_64-pc-windows-gnu/release/icraft.exe
```

For the GUI cross-compile, the recommended path is to build directly
on Windows. Cross-compiling eframe from Linux to Windows is doable
but requires shipping additional dlls and is fragile across egui
releases.

## Code-signing (optional)

Unsigned `icraft.exe` triggers Windows SmartScreen on first launch.
Three options:

1. Buy a code-signing cert (~$200/yr) and sign the binary with
   `signtool sign /tr ... /td sha256 /fd sha256 /a icraft.exe`.
2. Wrap with NSSM/WinSW for service-mode operation -- service installs
   are exempt from SmartScreen.
3. Tell users to "More info → Run anyway" once. Acceptable for
   internal distribution.

## Disk budget (Linux dev)

- `cargo build --release` (CLI only): ~250 MB target/ after build,
  ~3.8 MB stripped binary.
- `cargo build -p icraft-gui --release`: adds ~600-800 MB target/
  during compile (eframe + wayland + x11rb + xkbcommon), ~10-15 MB
  binary. Plan disk accordingly.
