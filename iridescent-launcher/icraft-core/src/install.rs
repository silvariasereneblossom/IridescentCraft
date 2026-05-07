//! Phase 1 / 2 — Java check, Forge install, mod bulk download.
//!
//! All three flows are native in v0.3:
//!   - `check_java`      — probe `java -version`
//!   - `ensure_forge`    — download installer if missing, run --installServer
//!   - `ensure_mods`     — bulk download from packwiz .pw.toml metadata
//!
//! Mirrors `server_install.ps1`. Sequential download (matches PS1).
//! User-agent header set to keep CurseForge from 403'ing the api/v1
//! fallback URLs.

use anyhow::{anyhow, Context, Result};
use std::process::Command;

use crate::config::{ServerConfig, FORGE_INSTALLER_URL, FORGE_VERSION};
use crate::http;
use crate::packwiz::{self, Side};

const USER_AGENT: &str = "Mozilla/5.0 IridescentCraft-Installer";

pub fn check_java() -> Result<()> {
    let out = Command::new("java").arg("-version").output();
    match out {
        Ok(o) if o.status.success() || !o.stderr.is_empty() => {
            // `java -version` writes to stderr and returns 0.
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
    log::info!("[install] forge missing — installing {}", FORGE_VERSION);

    if !cfg.forge_installer().exists() {
        log::info!("[install] downloading forge installer");
        let bytes = http::fetch_to_file(FORGE_INSTALLER_URL, &cfg.forge_installer(), USER_AGENT)?;
        log::info!("[install] forge installer: {} bytes", bytes);
    }

    let st = Command::new("java")
        .arg("-jar").arg(cfg.forge_installer())
        .arg("--installServer")
        .current_dir(&cfg.server_dir)
        .status()?;
    if !st.success() {
        return Err(anyhow!("forge installer exit {}", st.code().unwrap_or(-1)));
    }
    Ok(())
}

/// Bulk download every mod referenced from `mods/.index/*.pw.toml`,
/// skipping client-only and force-skipped entries. Idempotent: skips
/// files that already exist on disk.
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

    crate::banner::installer_banner();

    let mods = packwiz::parse_index(&cfg.mods_index())
        .context("parse mods/.index")?;
    log::info!("[install] {} packwiz entries found", mods.len());

    std::fs::create_dir_all(cfg.mods_dir())?;

    let total = mods.len();
    let mut downloaded = 0;
    let mut skipped_client = 0;
    let mut skipped_exists = 0;
    let mut failed = 0;

    for (i, m) in mods.iter().enumerate() {
        let pct = ((i as f64 + 1.0) / total as f64 * 100.0) as u32;

        if m.side == Side::Client { skipped_client += 1; continue; }
        if m.is_force_skipped()    { skipped_client += 1; continue; }

        let dest = cfg.mods_dir().join(&m.filename);
        if dest.exists() { skipped_exists += 1; continue; }

        let urls = m.download_urls();
        if urls.is_empty() {
            log::warn!("[install] {pct}% [WARN] no URL for {}", m.filename);
            failed += 1;
            continue;
        }

        log::info!("[install] {pct:>3}% downloading: {}", m.filename);
        match http::fetch_with_fallbacks(&urls, &dest, USER_AGENT, 1) {
            Ok((url, bytes)) => {
                log::debug!("[install]   ok ({} bytes from {})", bytes, url);
                downloaded += 1;
            }
            Err(e) => {
                log::warn!("[install]   FAILED: {e:#}");
                failed += 1;
            }
        }
    }

    log::info!("[install] downloaded: {downloaded}");
    log::info!("[install] skipped (client/forced): {skipped_client}");
    log::info!("[install] skipped (already present): {skipped_exists}");
    if failed > 0 {
        log::warn!("[install] failed: {failed} mod(s) — may need manual download");
        // Match PS1: non-zero exit when downloads failed so the
        // orchestrator surfaces the failure.
        return Err(anyhow!("{failed} mod(s) failed to download"));
    }
    log::info!("[install] mod download complete");
    Ok(())
}

fn jar_count(p: &std::path::Path) -> usize {
    std::fs::read_dir(p)
        .map(|rd| rd.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jar"))
            .count())
        .unwrap_or(0)
}
