//! Phase 3 — accept the Mojang EULA by writing `eula=true` to
//! `eula.txt`. Idempotent: only writes if the file is missing or
//! doesn't already contain the acceptance line.

use anyhow::{Context, Result};
use std::fs;

use crate::config::ServerConfig;

pub fn accept(cfg: &ServerConfig) -> Result<()> {
    let path = cfg.eula();
    let already = match fs::read_to_string(&path) {
        Ok(s) => s.lines().any(|l| l.trim() == "eula=true"),
        Err(_) => false,
    };
    if already {
        log::debug!("[eula] already accepted");
        return Ok(());
    }
    fs::write(&path, "eula=true\n")
        .with_context(|| format!("write {}", path.display()))?;
    log::info!("[eula] accepted -> {}", path.display());
    Ok(())
}
