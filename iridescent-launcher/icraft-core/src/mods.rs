//! Mod-folder hygiene — strip client mods, update_mods, cleanup.
//!
//! v0.3: native ports of the three PowerShell scripts.
//!   - `update_mods`        — diff TOML allowlist vs disk, download new
//!                            versions, remove old versions of same mod
//!   - `cleanup_stale_jars` — strict allowlist enforcement: any jar
//!                            not in TOMLs and not in customJars gets
//!                            deleted
//!   - `strip_client_mods`  — substring-match against the client-only
//!                            list and delete any matches that snuck in
//!                            (e.g. accidentally synced from a client
//!                            distro)

use anyhow::{Context, Result};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::config::{ServerConfig, CUSTOM_JARS};
use crate::http;
use crate::packwiz::{self, PackwizMod, Side, FORCE_SKIP_PATTERNS};

const USER_AGENT: &str = "Mozilla/5.0 IridescentCraft-Updater";

// =============================================================================
// strip_client_mods
// =============================================================================

/// Toggle for the destructive flows. `dry_run = true` logs what
/// would be removed/downloaded without touching disk or the network.
#[derive(Debug, Clone, Copy)]
pub struct ModSyncOpts { pub dry_run: bool }

impl ModSyncOpts {
    pub fn live() -> Self { Self { dry_run: false } }
    pub fn dry()  -> Self { Self { dry_run: true  } }
}

/// Delete any jar in `mods/` whose filename matches a FORCE_SKIP
/// pattern (rendering mods, FTB suite, etc.). Defensive cleanup for
/// the case where a client-distro sync accidentally landed here.
pub fn strip_client_mods(cfg: &ServerConfig) -> Result<()> {
    let mods_dir = cfg.mods_dir();
    if !mods_dir.is_dir() { return Ok(()); }

    let mut removed = 0;
    for entry in fs::read_dir(&mods_dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() { continue; }
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        if !name_str.ends_with(".jar") { continue; }
        let lc = name_str.to_lowercase();
        if FORCE_SKIP_PATTERNS.iter().any(|p| lc.contains(&p.to_lowercase())) {
            log::info!("[strip-client] removing {}", name_str);
            let _ = fs::remove_file(entry.path());
            removed += 1;
        }
    }
    if removed > 0 {
        log::info!("[strip-client] removed {removed} client-only jar(s)");
    } else {
        log::debug!("[strip-client] no client-only jars present");
    }
    Ok(())
}

// =============================================================================
// update_mods — diff TOML allowlist vs disk
// =============================================================================

pub fn update_mods(cfg: &ServerConfig) -> Result<()> {
    update_mods_with(cfg, ModSyncOpts::live())
}

pub fn update_mods_with(cfg: &ServerConfig, opts: ModSyncOpts) -> Result<()> {
    let index = cfg.mods_index();
    if !index.is_dir() {
        log::debug!("[update] mods/.index missing -- skip");
        return Ok(());
    }

    let mods = packwiz::parse_index(&index).context("parse mods/.index")?;
    log::info!("[update] {} TOML entries", mods.len());

    // Filter to server-side, non-force-skipped entries; keyed by filename.
    let expected: HashMap<String, &PackwizMod> = mods.iter()
        .filter(|m| m.side != Side::Client && !m.is_force_skipped())
        .map(|m| (m.filename.clone(), m))
        .collect();
    log::info!("[update] {} server-side mods expected", expected.len());

    // Index existing jars on disk.
    let existing: Vec<String> = list_jars(&cfg.mods_dir())?;
    let existing_set: std::collections::HashSet<&str> =
        existing.iter().map(String::as_str).collect();

    let mut to_download: Vec<&PackwizMod> = Vec::new();
    let mut to_remove: Vec<String> = Vec::new();
    let mut up_to_date = 0;

    for (filename, m) in &expected {
        if existing_set.contains(filename.as_str()) {
            up_to_date += 1;
            continue;
        }
        to_download.push(*m);
        // Find old versions of the same mod by base-name match.
        let base = packwiz::strip_version(filename);
        if base.len() > 3 {
            for jar in &existing {
                if jar == filename { continue; }
                if packwiz::strip_version(jar) == base && !to_remove.contains(jar) {
                    to_remove.push(jar.clone());
                }
            }
        }
    }

    // Orphans: on-disk jars with no TOML entry and not a customJar.
    let custom: std::collections::HashSet<&str> = CUSTOM_JARS.iter().copied().collect();
    let orphans: Vec<String> = existing.iter()
        .filter(|j| !expected.contains_key(j.as_str())
                 && !custom.contains(j.as_str())
                 && !to_remove.contains(*j))
        .cloned()
        .collect();

    log::info!(
        "[update] up-to-date: {up_to_date}, to-download: {}, to-remove: {}, orphans: {}",
        to_download.len(), to_remove.len(), orphans.len()
    );
    if !orphans.is_empty() {
        log::warn!("[update] orphaned jars (no TOML, not custom):");
        for o in orphans.iter().take(20) {
            log::warn!("[update]   ? {o}");
        }
        if orphans.len() > 20 {
            log::warn!("[update]   ... and {} more", orphans.len() - 20);
        }
        log::warn!("[update] run 'icraft cleanup-jars' to remove these");
    }

    if to_download.is_empty() && to_remove.is_empty() {
        log::info!("[update] all mods up to date");
        return Ok(());
    }

    if opts.dry_run {
        for old in &to_remove { log::info!("[update] DRY-RUN would remove: {old}"); }
        for m in &to_download { log::info!("[update] DRY-RUN would download: {}", m.filename); }
        return Ok(());
    }

    // Apply: remove old first, then download.
    for old in &to_remove {
        let path = cfg.mods_dir().join(old);
        if path.exists() {
            let _ = fs::remove_file(&path);
            log::info!("[update] REMOVED: {old}");
        }
    }

    let mut dl_success = 0;
    let mut dl_failed  = 0;
    for m in &to_download {
        let dest = cfg.mods_dir().join(&m.filename);
        let urls = m.download_urls();
        if urls.is_empty() {
            log::warn!("[update]   SKIP (no URL): {}", m.filename);
            dl_failed += 1;
            continue;
        }
        match http::fetch_with_fallbacks(&urls, &dest, USER_AGENT, 2) {
            Ok((url, bytes)) => {
                log::info!("[update]   downloaded: {} ({} bytes from {})", m.filename, bytes, host_of(&url));
                dl_success += 1;
            }
            Err(e) => {
                log::warn!("[update]   FAILED: {} -- {e:#}", m.filename);
                dl_failed += 1;
            }
        }
    }

    log::info!("[update] summary: downloaded={dl_success}, removed={}, failed={dl_failed}", to_remove.len());
    if dl_failed > 0 {
        log::warn!("[update] {dl_failed} download(s) failed -- restart server when investigating");
    }
    Ok(())
}

// =============================================================================
// cleanup_stale_jars — strict allowlist enforcement
// =============================================================================

pub fn cleanup_stale_jars(cfg: &ServerConfig) -> Result<()> {
    cleanup_stale_jars_with(cfg, ModSyncOpts::live())
}

pub fn cleanup_stale_jars_with(cfg: &ServerConfig, opts: ModSyncOpts) -> Result<()> {
    let index = cfg.mods_index();
    if !index.is_dir() {
        log::warn!("[cleanup] mods/.index not found -- skipping");
        return Ok(());
    }

    let mods = packwiz::parse_index(&index)?;
    let mut allowed: std::collections::HashSet<String> = mods.iter()
        .map(|m| m.filename.clone())
        .collect();
    let toml_count = allowed.len();
    for c in CUSTOM_JARS { allowed.insert((*c).to_string()); }

    log::info!(
        "[cleanup] {} from .pw.toml + {} custom = {} expected entries",
        toml_count, CUSTOM_JARS.len(), allowed.len()
    );

    let mut kept = 0usize;
    let mut removed = 0usize;
    for entry in fs::read_dir(cfg.mods_dir())? {
        let entry = entry?;
        if entry.file_type()?.is_dir() { continue; }
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        if !name_str.ends_with(".jar") { continue; }
        if allowed.contains(&name_str) {
            kept += 1;
        } else if opts.dry_run {
            log::warn!("[cleanup] DRY-RUN would remove: {name_str}");
            removed += 1;
        } else {
            log::warn!("[cleanup] removing stale: {name_str}");
            let _ = fs::remove_file(entry.path());
            removed += 1;
        }
    }
    if removed > 0 {
        log::info!("[cleanup] removed {removed} stale jar(s); kept {kept}");
    } else {
        log::info!("[cleanup] no stale jars; kept {kept}");
    }
    Ok(())
}

// =============================================================================
// helpers
// =============================================================================

fn list_jars(dir: &Path) -> Result<Vec<String>> {
    if !dir.is_dir() { return Ok(vec![]); }
    let mut out = Vec::new();
    for e in fs::read_dir(dir)? {
        let e = e?;
        if e.file_type()?.is_dir() { continue; }
        let n = e.file_name().to_string_lossy().to_string();
        if n.ends_with(".jar") { out.push(n); }
    }
    out.sort();
    Ok(out)
}

fn host_of(url: &str) -> &str {
    url.strip_prefix("https://").unwrap_or(url)
       .split('/').next().unwrap_or(url)
}
