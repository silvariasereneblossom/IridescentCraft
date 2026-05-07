//! Phase 0.5 — apply staged self-updates.
//!
//! `phase0_sync.ps1` writes new versions of files as `<file>.new` so
//! that Windows file locks on the running .bat / .ps1 don't block the
//! download. After the diff sync, we move-overwrite each `.new` onto
//! its target; on success the orchestrator relaunches.
//!
//! For the new Rust binary the same staging applies: the binary itself
//! cannot be overwritten while running on Windows, so the updater
//! drops `icraft.exe.new` and we apply + relaunch.

use anyhow::Result;
use std::fs;
use std::path::{Path, PathBuf};

use crate::config::ServerConfig;

const STAGED_FILES: &[&str] = &[
    "iridescentserver.bat",
    "phase0_sync.ps1",
    "iridescentserver.sh",
    "icraft.exe",
    "icraft",
];

/// Returns true if at least one staged file was applied (caller should
/// then relaunch). Failures on individual files are logged but don't
/// abort the loop -- we apply what we can and continue.
pub fn apply_staged(cfg: &ServerConfig) -> Result<bool> {
    let mut any_swap = false;
    for f in STAGED_FILES {
        let staged = cfg.server_dir.join(format!("{f}.new"));
        if !staged.exists() { continue; }
        let target = cfg.server_dir.join(f);
        match fs::rename(&staged, &target) {
            Ok(_) => {
                log::info!("[self-update] applied {} -> {}", staged.display(), target.display());
                any_swap = true;
            }
            Err(e) => {
                log::warn!("[self-update] failed to apply {}: {} (file may be locked)",
                    staged.display(), e);
            }
        }
    }
    Ok(any_swap)
}

/// Re-exec the orchestrator. On success this never returns; on Linux
/// we use [`std::os::unix::process::CommandExt::exec`]. On Windows we
/// spawn a detached child and exit with code 0.
#[allow(clippy::needless_return)]
pub fn relaunch(cfg: &ServerConfig) -> Result<i32> {
    let exe = std::env::current_exe()?;
    log::info!("[self-update] relaunch: {}", exe.display());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = std::process::Command::new(&exe)
            .current_dir(&cfg.server_dir)
            .arg("serve")
            .exec();
        // exec only returns on failure
        return Err(err.into());
    }

    #[cfg(windows)]
    {
        let _child = std::process::Command::new(&exe)
            .current_dir(&cfg.server_dir)
            .arg("serve")
            .spawn()?;
        // Caller exits 0; the spawned child takes over.
        return Ok(0);
    }
}

/// Path A self-update for the GUI: apply staged .new files and spawn
/// the new binary. Caller should `std::process::exit(0)` immediately
/// after this returns Ok(true) to release the old binary's file lock
/// and let the new instance take over.
///
/// The binary self-update target is `current_exe()`, not
/// `cfg.server_dir`, so the GUI can live in a different dir from the
/// modpack tree if the user prefers. We check both locations for the
/// `.new` files and apply whichever is present.
pub fn apply_and_relaunch_gui(cfg: &ServerConfig) -> Result<bool> {
    use std::fs;
    let exe = std::env::current_exe()?;
    let exe_name = exe.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("current_exe has no filename: {}", exe.display()))?
        .to_string();

    // Two candidate `.new` locations: (1) next to the running binary,
    // (2) inside the modpack server_dir. The sync flow drops .new
    // files into server_dir; if the GUI binary itself sits there too,
    // both paths point at the same file.
    let here = exe.with_file_name(format!("{exe_name}.new"));
    let there = cfg.server_dir.join(format!("{exe_name}.new"));

    let staged = if here.exists() {
        Some(here)
    } else if there.exists() && there != exe.with_file_name(&exe_name) {
        Some(there)
    } else {
        None
    };

    let Some(staged) = staged else {
        log::info!("[self-update] no {exe_name}.new staged; nothing to apply");
        return Ok(false);
    };

    log::info!("[self-update] applying {} -> {}", staged.display(), exe.display());

    // Windows can't overwrite the running binary. Workaround: rename
    // the running exe to .old, then rename .new to the live name. The
    // OS allows this because we're moving a held-open file to a new
    // path, then placing a new file at the now-vacated path.
    #[cfg(windows)]
    {
        let backup = exe.with_extension("exe.old");
        let _ = fs::remove_file(&backup);
        fs::rename(&exe, &backup)
            .map_err(|e| anyhow::anyhow!("rename running exe -> .old: {e}"))?;
        if let Err(e) = fs::rename(&staged, &exe) {
            // Try to restore the backup before bubbling
            let _ = fs::rename(&backup, &exe);
            return Err(anyhow::anyhow!("rename .new -> live: {e}"));
        }
    }

    #[cfg(not(windows))]
    {
        fs::rename(&staged, &exe)
            .map_err(|e| anyhow::anyhow!("rename .new -> live: {e}"))?;
    }

    // Spawn the new binary as a detached child. Caller exits.
    log::info!("[self-update] spawning new instance: {}", exe.display());
    std::process::Command::new(&exe)
        .current_dir(&cfg.server_dir)
        .spawn()?;
    Ok(true)
}

/// Pull source from the repo, build the GUI in release mode, stage the
/// resulting binary as `<live>.new`, then apply + relaunch.
///
/// Source location: `ICRAFT_LAUNCHER_SRC` env var if set, otherwise
/// walks up from the running exe's dir for an `iridescent-launcher\`
/// folder containing `Cargo.toml` + `icraft-gui\`.
///
/// Returns Ok(true) if a fresh build was applied + the new instance was
/// spawned (caller must `std::process::exit(0)` to release the file
/// lock). Ok(false) if no source dir was located -- caller can fall
/// back to other update paths.
///
/// Requires `git` and `cargo` on PATH. Build output streams into the
/// log pane (lines tagged `[cargo]`) so the operator gets real-time
/// progress instead of a silent multi-minute hang on first build.
pub fn pull_build_apply_gui(cfg: &ServerConfig) -> Result<bool> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    let Some(src_dir) = find_launcher_src() else {
        log::info!(
            "[self-update] no iridescent-launcher source located -- skipping pull+build. \
             Set ICRAFT_LAUNCHER_SRC to the launcher source path to enable."
        );
        return Ok(false);
    };
    log::info!("[self-update] launcher source: {}", src_dir.display());

    // Repo root for git pull -- the launcher dir's parent. (For a
    // standalone iridescent-launcher checkout, the launcher dir IS
    // the repo root, so use it directly when there's no parent .git.)
    let repo_root: PathBuf = match src_dir.parent() {
        Some(p) if p.join(".git").exists() => p.to_path_buf(),
        _ => src_dir.clone(),
    };

    log::info!("[self-update] git pull --ff-only in {}", repo_root.display());
    let pull = Command::new("git")
        .current_dir(&repo_root)
        .args(["pull", "--ff-only"])
        .status()
        .map_err(|e| anyhow::anyhow!("running `git pull` failed (is git on PATH?): {e}"))?;
    if !pull.success() {
        anyhow::bail!("git pull failed (resolve conflicts and retry)");
    }

    log::info!("[self-update] cargo build -p icraft-gui --release ...");
    let mut child = Command::new("cargo")
        .current_dir(&src_dir)
        .args(["build", "-p", "icraft-gui", "--release"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| anyhow::anyhow!("running `cargo build` failed (is cargo on PATH?): {e}"))?;
    // Stream both stdout (rare for cargo) and stderr (where status
    // diagnostics go) into the log pane line-by-line.
    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");
    let t1 = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            log::info!("[cargo] {line}");
        }
    });
    let t2 = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            log::info!("[cargo] {line}");
        }
    });
    let status = child.wait()?;
    let _ = t1.join();
    let _ = t2.join();
    if !status.success() {
        anyhow::bail!("cargo build failed (see [cargo] lines above)");
    }

    // Find the produced exe. Fast path = target/release; slow path
    // walks the target tree (handles a custom default-target triple
    // adding a target/<triple>/release/ subdir).
    let target_dir = cargo_target_dir(&src_dir).unwrap_or_else(|_| src_dir.join("target"));
    let exe_name = current_exe_name();
    let built = find_built_exe(&target_dir, &exe_name)
        .ok_or_else(|| anyhow::anyhow!(
            "build succeeded but {exe_name} not found under {}",
            target_dir.display()
        ))?;
    log::info!("[self-update] built: {}", built.display());

    // Stage as <running>.new next to the running binary.
    let live = std::env::current_exe()?;
    let staged = live.with_file_name(format!("{exe_name}.new"));
    fs::copy(&built, &staged)
        .map_err(|e| anyhow::anyhow!("staging copy {} -> {}: {e}", built.display(), staged.display()))?;
    log::info!("[self-update] staged: {}", staged.display());

    // apply_and_relaunch_gui handles the rename + spawn dance.
    apply_and_relaunch_gui(cfg)
}

fn current_exe_name() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_owned))
        .unwrap_or_else(|| if cfg!(windows) { "icraft-gui.exe".into() } else { "icraft-gui".into() })
}

fn find_launcher_src() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ICRAFT_LAUNCHER_SRC") {
        let pb = PathBuf::from(p);
        if is_launcher_src(&pb) { return Some(pb); }
    }
    // Walk up from the running exe's directory.
    let exe = std::env::current_exe().ok()?;
    let mut cur = exe.parent();
    while let Some(c) = cur {
        let candidate = c.join("iridescent-launcher");
        if is_launcher_src(&candidate) { return Some(candidate); }
        // Also check `c` itself, in case the exe is sitting inside the
        // launcher source tree (e.g. running directly from target/release/).
        if is_launcher_src(c) { return Some(c.to_path_buf()); }
        cur = c.parent();
    }
    None
}

fn is_launcher_src(p: &Path) -> bool {
    p.join("Cargo.toml").exists() && p.join("icraft-gui").join("Cargo.toml").exists()
}

fn cargo_target_dir(launcher_dir: &Path) -> Result<PathBuf> {
    let out = std::process::Command::new("cargo")
        .current_dir(launcher_dir)
        .args(["metadata", "--format-version=1", "--no-deps"])
        .output()?;
    if !out.status.success() {
        anyhow::bail!("cargo metadata exited with {:?}", out.status.code());
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    let dir = v.get("target_directory").and_then(|d| d.as_str())
        .ok_or_else(|| anyhow::anyhow!("no target_directory in cargo metadata"))?;
    Ok(PathBuf::from(dir))
}

fn find_built_exe(target_dir: &Path, name: &str) -> Option<PathBuf> {
    // Fast path: <target>/release/<name>
    let direct = target_dir.join("release").join(name);
    if direct.exists() { return Some(direct); }
    // Slow path: recursively walk for the freshest match.
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    let mut stack = vec![target_dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for entry in rd.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(p);
            } else if p.file_name().and_then(|n| n.to_str()) == Some(name) {
                if let Ok(m) = entry.metadata() {
                    if let Ok(t) = m.modified() {
                        if newest.as_ref().map_or(true, |(prev, _)| t > *prev) {
                            newest = Some((t, p));
                        }
                    }
                }
            }
        }
    }
    newest.map(|(_, p)| p)
}
