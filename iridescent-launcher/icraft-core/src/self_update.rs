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
