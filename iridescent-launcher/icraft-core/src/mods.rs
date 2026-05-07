//! Mod-folder hygiene — strip client mods, update_mods, cleanup.
//!
//! TRANSITION: each function checks for the matching .ps1/.sh next to
//! the orchestrator and shells out. Native ports follow once the v0
//! shell-out version proves stable.

use anyhow::{anyhow, Result};
use std::process::Command;

use crate::config::ServerConfig;

pub fn strip_client_mods(cfg: &ServerConfig) -> Result<()> {
    let bat = cfg.server_dir.join("strip_client_mods.bat");
    let sh  = cfg.server_dir.join("strip_client_mods.sh");
    if cfg!(target_os = "windows") && bat.exists() {
        log::debug!("[mods] strip_client_mods.bat");
        let _ = Command::new("cmd").args(["/c", &bat.to_string_lossy()])
            .current_dir(&cfg.server_dir)
            .status()?;
    } else if sh.exists() {
        log::debug!("[mods] strip_client_mods.sh");
        let _ = Command::new("bash").arg(&sh)
            .current_dir(&cfg.server_dir)
            .status()?;
    }
    Ok(())
}

pub fn update_mods(cfg: &ServerConfig) -> Result<()> {
    if !cfg.mods_index().exists() { return Ok(()); }
    let ps1 = cfg.server_dir.join("update_mods.ps1");
    let sh  = cfg.server_dir.join("update_mods.sh");
    if cfg!(target_os = "windows") && ps1.exists() {
        log::info!("[mods] update_mods.ps1");
        let st = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ps1)
            .args(["-ModsDir", "mods"])
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("update_mods.ps1 exit {}", st.code().unwrap_or(-1))); }
    } else if sh.exists() {
        log::info!("[mods] update_mods.sh");
        let st = Command::new("bash").arg(&sh)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("update_mods.sh exit {}", st.code().unwrap_or(-1))); }
    } else {
        log::debug!("[mods] no update_mods script available — skip");
    }
    Ok(())
}

pub fn cleanup_stale_jars(cfg: &ServerConfig) -> Result<()> {
    let ps1 = cfg.server_dir.join("cleanup_stale_jars.ps1");
    if cfg!(target_os = "windows") && ps1.exists() {
        log::info!("[mods] cleanup_stale_jars.ps1");
        let st = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ps1)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("cleanup_stale_jars.ps1 exit {}", st.code().unwrap_or(-1))); }
    } else {
        log::debug!("[mods] cleanup_stale_jars: skip (no PS1 or not Windows)");
    }
    Ok(())
}
