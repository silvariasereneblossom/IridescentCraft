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
