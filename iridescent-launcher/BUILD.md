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

### Mesa3D for GPU-less server VMs

The GUI uses eframe's `glow` (OpenGL) renderer, which needs OpenGL 2.0+
at runtime. Server VMs without GPU passthrough (RDP basic display
driver, headless KVM) only expose OpenGL 1.1, so glow exits at init
and the GUI silently fails.

Fix: drop Mesa3D's pure-CPU `opengl32.dll` + `libgallium_wgl.dll` next
to `icraft-gui.exe`. Windows resolves `opengl32.dll` from the exe dir
before `system32`, so Mesa intercepts; llvmpipe renders on CPU.

```pwsh
cd iridescent-launcher
.\fetch-mesa.ps1 -Dest "C:\Users\<you>\Desktop\IridescentCraft Dedicated Server"
```

The DLLs are *not* committed to the repo (libgallium_wgl.dll is 59 MB
per Mesa release). Run `fetch-mesa.ps1` once per server install; Mesa
itself doesn't need updating unless a future eframe version raises the
OpenGL floor.

On dev boxes with a real GPU, skip this step -- the system OpenGL ICD
handles us natively.

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

## Path A self-update flow

The GUI's "Update Launcher" button pulls a fresh `icraft-gui.exe`
from the repo and re-execs in place. Workflow on the dev side after
making a GUI change:

1. On the Windows build host, rebuild:
   ```pwsh
   cd iridescent-launcher
   cargo build -p icraft-gui --release
   ```
2. Copy the binary into the modpack tree:
   ```pwsh
   copy target\release\icraft-gui.exe ..\.minecraft\server_distribution\icraft-gui.exe
   ```
3. Commit + push:
   ```pwsh
   cd ..
   git add .minecraft/server_distribution/icraft-gui.exe
   git commit -m "icraft-gui: rebuild"
   git push
   ```

On the server box, the operator clicks "Update Launcher" in the GUI:
the existing GitHub diff sync drops `icraft-gui.exe.new` next to the
running binary, then `apply_and_relaunch_gui` renames the live exe to
`.old`, swaps the new one in, and spawns the new instance. The old
process exits so its file lock on `icraft-gui.exe` releases.

> **Why a `.exe.old` backup?** Windows can't overwrite a running
> binary. The rename-old / rename-new dance is the standard
> workaround — `icraft-gui.exe.old` lingers on disk after each update
> and is safe to delete on next launch.

The same flow handles `icraft.exe` (the headless CLI), since both are
listed in `SELF_UPDATE_FILES` and treated as staged updates by the
sync code.

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
