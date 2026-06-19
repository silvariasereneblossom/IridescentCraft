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
use std::io::Read;
use std::path::Path;

use crate::config::{ServerConfig, CUSTOM_JARS, DENY_LIST_PATTERNS};
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
// cleanup_stale_jars — manifest-aware allowlist enforcement
// =============================================================================
//
// Faithful port of the four-layer hygiene in `cleanup_stale_jars.ps1`. The
// server runs THIS (Rust serve()), never the PS1, so any layer left out is a
// gap only the (un-run) PS1 would have caught. Pre-2026-06-19 the Rust port did
// Layer 3 only — it was manifest-BLIND, so a rebuilt same-filename custom jar
// (e.g. `iridescent_tetra_expansion-1.0.0.jar` with new registrations but the
// old version string) was never detected, and a Cycle re-launched the drifted
// jar. That is the "STALE" finding verify-server.ps1 reports.
//
//   Layer 1 — DENY-LIST   : substring force-remove (retired mods). Highest prio.
//   Layer 2 — HASH-VERIFY : a jar whose name is in the manifest but whose
//                           SHA-256 differs is REMOVED, so the next sync
//                           re-fetches the canonical bytes. Catches
//                           same-version content drift.
//   Layer 2.5 MANIFEST-KEEP: every manifest jar name is an "expected" entry, so
//                           a hash-matching custom jar is kept even if its
//                           packwiz/$customJars entry was missed on this distro.
//   Layer 3 — ALLOWLIST   : a jar not in packwiz .pw.toml AND not in the
//                           manifest AND not in the CUSTOM_JARS fallback is
//                           removed as stale.
//
// FAIL-KEEP: a missing/unparseable manifest skips Layers 2 + 2.5 only; deny-list
// + packwiz markers + the CUSTOM_JARS fallback still run, so a manifest-less box
// never purges a known custom jar.

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

    // Layer 2 / 2.5: load the manifest (keep-authority + hash source). Missing
    // or unparseable -> FAIL-KEEP (no hash-verify, no manifest-keep; fall back
    // to packwiz + CUSTOM_JARS).
    let manifest = load_custom_jar_hashes(&cfg.custom_jars_manifest());
    let manifest_count = manifest.len();
    for jar in manifest.keys() { allowed.insert(jar.clone()); }
    // CUSTOM_JARS fallback (manifest-missing / non-manifest jars).
    for c in CUSTOM_JARS { allowed.insert((*c).to_string()); }

    log::info!(
        "[cleanup] {} packwiz + {} manifest + {} fallback = {} expected | {} hashed | {} deny-patterns",
        toml_count, manifest_count, CUSTOM_JARS.len(), allowed.len(),
        manifest_count, DENY_LIST_PATTERNS.len()
    );

    let mut kept = 0usize;
    let mut denied = 0usize;
    let mut drifted = 0usize;
    let mut stale = 0usize;
    for entry in fs::read_dir(cfg.mods_dir())? {
        let entry = entry?;
        if entry.file_type()?.is_dir() { continue; }
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        if !name_str.ends_with(".jar") { continue; }
        let path = entry.path();
        let lower = name_str.to_lowercase();

        // --- Layer 1: DENY-LIST (substring, case-insensitive, highest prio) ---
        if let Some(pat) = DENY_LIST_PATTERNS.iter().find(|p| lower.contains(**p)) {
            if opts.dry_run {
                log::warn!("[cleanup] DRY-RUN would DENY-remove: {name_str} (matched '{pat}')");
            } else {
                log::warn!("[cleanup] DENY-LIST removing: {name_str} (matched '{pat}')");
                let _ = fs::remove_file(&path);
            }
            denied += 1;
            continue;
        }

        // --- Layer 2: HASH-VERIFY custom jars present in the manifest ---
        if let Some(expected_hash) = manifest.get(&name_str) {
            match sha256_file(&path) {
                Ok(actual) if &actual != expected_hash => {
                    if opts.dry_run {
                        log::warn!(
                            "[cleanup] DRY-RUN would HASH-remove: {name_str} (local {}.. != manifest {}..)",
                            short16(&actual), short16(expected_hash)
                        );
                    } else {
                        log::warn!(
                            "[cleanup] HASH MISMATCH removing: {name_str} (local {}.. != manifest {}..; next sync re-fetches)",
                            short16(&actual), short16(expected_hash)
                        );
                        let _ = fs::remove_file(&path);
                    }
                    drifted += 1;
                    continue;
                }
                Ok(_) => { /* hash matches — fall through to keep */ }
                Err(e) => {
                    // Can't hash -> don't trust it, but don't delete blindly
                    // either: log and let the allowlist decide (keeps it, since
                    // it's a manifest jar). A re-run after the lock clears will
                    // hash it properly.
                    log::warn!("[cleanup] could not hash {name_str}: {e} (keeping; will re-verify next run)");
                }
            }
        }

        // --- Layer 3: ALLOWLIST or purge (manifest + packwiz + fallback) ---
        if allowed.contains(&name_str) {
            kept += 1;
        } else if opts.dry_run {
            log::warn!("[cleanup] DRY-RUN would remove stale: {name_str}");
            stale += 1;
        } else {
            log::warn!("[cleanup] removing stale: {name_str}");
            let _ = fs::remove_file(&path);
            stale += 1;
        }
    }

    let removed = denied + drifted + stale;
    if removed > 0 {
        log::info!(
            "[cleanup] removed {removed} (deny={denied} drift={drifted} stale={stale}); kept {kept}"
        );
    } else {
        log::info!("[cleanup] no removals needed; kept {kept}");
    }

    // If we deleted a HASH-DRIFTED custom jar, the correct bytes aren't on disk
    // anymore. Online, sync::verify_custom_jars (Phase 0) repairs drift in place
    // BEFORE this runs, so reaching here with drifted>0 means the API was
    // unreachable and the in-place repair didn't happen — this is the offline
    // backstop. Clear the SHA marker so the NEXT (hopefully online) sync can't
    // short-circuit and is forced to re-fetch the jar. (Deny/stale removals are
    // intended-absent files; only a drift-delete leaves a wanted jar missing.)
    if drifted > 0 && !opts.dry_run {
        let marker = cfg.last_sha();
        if marker.exists() {
            match fs::remove_file(&marker) {
                Ok(()) => log::warn!(
                    "[cleanup] cleared {} after a custom-jar drift-delete -- next sync will re-fetch the correct jar(s)",
                    marker.display()
                ),
                Err(e) => log::warn!("[cleanup] could not clear marker {}: {e}", marker.display()),
            }
        }
    }
    Ok(())
}

/// Load `custom_jars_manifest.json` into a `filename -> lowercase sha256` map.
/// FAIL-KEEP semantics: any problem (missing / unreadable / malformed JSON /
/// no `jars` object) returns an EMPTY map and logs, so the caller silently
/// degrades to the packwiz + CUSTOM_JARS allowlist instead of purging customs.
/// Shared with `sync::verify_custom_jars` (the in-place re-fetch repair).
pub(crate) fn load_custom_jar_hashes(path: &Path) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if !path.exists() {
        log::warn!(
            "[cleanup] manifest {} not found -- hash-verify + manifest-keep skipped (deny-list + packwiz + fallback still run)",
            path.display()
        );
        return out;
    }
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("[cleanup] manifest unreadable ({e}) -- hash-verify skipped");
            return out;
        }
    };
    let json: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[cleanup] manifest unparseable ({e}) -- hash-verify skipped");
            return out;
        }
    };
    let Some(jars) = json.get("jars").and_then(|j| j.as_object()) else {
        log::warn!("[cleanup] manifest has no 'jars' object -- hash-verify skipped");
        return out;
    };
    for (name, entry) in jars {
        if let Some(sha) = entry.get("sha256").and_then(|s| s.as_str()) {
            out.insert(name.clone(), sha.to_lowercase());
        }
    }
    out
}

/// Lowercase hex SHA-256 of a file, streamed in 8 KiB chunks — matches the
/// manifest's digest format (`Get-FileHash -Algorithm SHA256` lowered).
fn sha256_file(p: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let mut f = fs::File::open(p)?;
    let mut buf = [0u8; 8192];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    let mut hex = String::with_capacity(64);
    for b in hasher.finalize() {
        hex.push_str(&format!("{b:02x}"));
    }
    Ok(hex)
}

/// First 16 hex chars of a digest, for log lines.
fn short16(s: &str) -> &str {
    if s.len() >= 16 { &s[..16] } else { s }
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
