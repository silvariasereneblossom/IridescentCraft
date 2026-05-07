//! Phase 1 / 2 — Java check, Forge install, mod bulk download.
//!
//! TRANSITION: mod download shells out to `server_install.ps1` (220 LoC
//! of packwiz-aware download + tier-skip + parallel fetch). Forge
//! installer download + java -jar runs natively here. Java check is
//! native.

use anyhow::{anyhow, Result};
use std::process::Command;

use crate::config::{ServerConfig, FORGE_INSTALLER_URL};

pub fn check_java() -> Result<()> {
    let out = Command::new("java").arg("-version").output();
    match out {
        Ok(o) if o.status.success() || !o.stderr.is_empty() => {
            // `java -version` writes to stderr and returns 0; some JDKs
            // ship an unusual exit code, so we accept either path
            // provided we got recognisable output.
            log::info!("[install] java found: {}",
                String::from_utf8_lossy(&o.stderr).lines().next().unwrap_or("(unknown)"));
            Ok(())
        }
        _ => Err(anyhow!(
            "Java not found on PATH. Install Adoptium / Temurin JDK 17 from https://adoptium.net/"
        )),
    }
}

pub fn ensure_forge(cfg: &ServerConfig) -> Result<()> {
    if cfg.forge_dir().exists() {
        log::debug!("[install] forge already present");
        return Ok(());
    }
    log::info!("[install] forge missing — installing {}", crate::config::FORGE_VERSION);

    if !cfg.forge_installer().exists() {
        log::info!("[install] downloading forge installer");
        download(FORGE_INSTALLER_URL, &cfg.forge_installer())?;
    }

    // Run the installer with --installServer in the server dir.
    let st = Command::new("java")
        .arg("-jar")
        .arg(cfg.forge_installer())
        .arg("--installServer")
        .current_dir(&cfg.server_dir)
        .status()?;
    if !st.success() {
        return Err(anyhow!("forge installer exit {}", st.code().unwrap_or(-1)));
    }
    Ok(())
}

pub fn ensure_mods(cfg: &ServerConfig) -> Result<()> {
    let need_mods = !cfg.mods_dir().exists() || jar_count(&cfg.mods_dir()) < 10;
    if !need_mods {
        log::debug!("[install] mods/ already populated");
        return Ok(());
    }
    if !cfg.mods_index().exists() {
        log::warn!("[install] mods/.index missing — skipping bulk install");
        return Ok(());
    }

    let ps1 = cfg.server_dir.join("server_install.ps1");
    let sh  = cfg.server_dir.join("server_install.sh");
    if cfg!(target_os = "windows") && ps1.exists() {
        log::info!("[install] running server_install.ps1");
        let st = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-File"])
            .arg(&ps1)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("server_install.ps1 exit {}", st.code().unwrap_or(-1))); }
    } else if sh.exists() {
        log::info!("[install] running server_install.sh");
        let st = Command::new("bash").arg(&sh)
            .current_dir(&cfg.server_dir)
            .status()?;
        if !st.success() { return Err(anyhow!("server_install.sh exit {}", st.code().unwrap_or(-1))); }
    } else {
        log::warn!("[install] no server_install script available — skipping bulk mod download");
    }
    Ok(())
}

fn jar_count(p: &std::path::Path) -> usize {
    std::fs::read_dir(p)
        .map(|rd| rd.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jar"))
            .count())
        .unwrap_or(0)
}

/// Minimal HTTP download via the system `curl`. Avoids pulling in
/// reqwest/ureq for the v0; the platforms we run on (Win10+ and any
/// modern Linux) ship curl. Switch to a real HTTP client when we
/// implement the GitHub diff sync natively.
fn download(url: &str, dest: &std::path::Path) -> Result<()> {
    let st = Command::new("curl")
        .args(["-fL", "--retry", "3", "-o"])
        .arg(dest)
        .arg(url)
        .status()?;
    if !st.success() {
        return Err(anyhow!("curl {} exit {}", url, st.code().unwrap_or(-1)));
    }
    Ok(())
}
