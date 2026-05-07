//! Phases -1 / 0 — repo sync.
//!
//! Phase -1 (`z_mirror_or_zip`): copy the whole `server_distribution/`
//! tree from a Z: drive (dev PC's working tree mirror) when reachable.
//! Falls back to a GitHub zip download. The current bat impl is in
//! `sync_from_repo.bat`.
//!
//! Phase 0 (`github_diff`): diff-based update. Reads
//! `.icraft_last_sha`, calls GitHub compare API, downloads only changed
//! files via raw.githubusercontent.com. Current impl is `phase0_sync.ps1`
//! (~280 lines of PowerShell with GitHub auth + truncated-diff fallback).
//!
//! TRANSITION: this v0 shells out to the existing PS1/bat scripts so
//! the orchestrator works end-to-end immediately. Native ports of the
//! diff logic (using ureq + serde_json) land in a follow-up commit.

use anyhow::{anyhow, Result};
use std::process::Command;

use crate::config::ServerConfig;

pub fn z_mirror_or_zip(cfg: &ServerConfig) -> Result<()> {
    let bat = cfg.server_dir.join("sync_from_repo.bat");
    let sh  = cfg.server_dir.join("sync_from_repo.sh");
    if cfg!(target_os = "windows") && bat.exists() {
        log::info!("[sync] phase -1: sync_from_repo.bat");
        let st = Command::new("cmd").args(["/c", &bat.to_string_lossy()])
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("sync_from_repo.bat exit {}", st.code().unwrap_or(-1))); }
    } else if sh.exists() {
        log::info!("[sync] phase -1: sync_from_repo.sh");
        let st = Command::new("bash").arg(&sh)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("sync_from_repo.sh exit {}", st.code().unwrap_or(-1))); }
    } else {
        log::debug!("[sync] phase -1: no sync_from_repo script -- skip");
    }
    Ok(())
}

pub fn github_diff(cfg: &ServerConfig, force: bool) -> Result<()> {
    if force {
        let sha = cfg.last_sha();
        if sha.exists() {
            std::fs::remove_file(&sha)?;
            log::info!("[sync] phase 0: --force cleared {}", sha.display());
        }
    }
    let ps1 = cfg.server_dir.join("phase0_sync.ps1");
    if !ps1.exists() {
        log::warn!("[sync] phase 0: phase0_sync.ps1 not found -- skipping diff sync");
        return Ok(());
    }
    if cfg!(target_os = "windows") {
        let st = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ps1)
            .arg("-ServerDir").arg(&cfg.server_dir)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("phase0_sync.ps1 exit {}", st.code().unwrap_or(-1))); }
    } else {
        // On Linux dev hosts the PS1 isn't applicable — diff sync only
        // matters on the Windows server box. No-op here.
        log::debug!("[sync] phase 0: not Windows, skipping ps1 diff sync");
    }
    Ok(())
}
