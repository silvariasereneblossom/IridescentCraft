//! Phases -1 / 0 — repo sync.
//!
//! Phase -1 (`z_mirror_or_zip`): copy `server_distribution/` from a
//! Z: drive (dev PC working tree). Falls back to the Phase 0 zip
//! download. The current bat impl is in `sync_from_repo.bat`. v0.1
//! shells out for this; v0.2 leaves it as-is since the Z: detection is
//! already trivial in the bat and not worth a port until Linux needs it.
//!
//! Phase 0 (`github_diff`): native GitHub diff sync — replaces
//! `phase0_sync.ps1` (~280 LoC of PowerShell).
//!
//! Algorithm:
//!   1. Read `.icraft_last_sha` for the local SHA.
//!   2. GET /repos/{o}/{r}/commits/{branch} for remote HEAD.
//!   3. If equal: log "up to date", return.
//!   4. Else GET /compare/{local}...{remote}; if 1..299 files: diff
//!      sync; else fall back to full zip.
//!   5. Diff: per file under `.minecraft/server_distribution/`,
//!      skip excluded dirs, handle `removed`, stage self-update
//!      files as `<file>.new`, write everything else to disk.
//!   6. SHA only written if zero errors -- forces retry on next run
//!      when something failed.
//!   7. Full zip: download branch zip, extract, mirror into install
//!      dir (special-case mods/.index, self-update files, datapacks).

use anyhow::{anyhow, Context, Result};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
// std::process::Command/Stdio dropped along with the bat-shell-out
// path in z_mirror_or_zip; sync now stays in-Rust via ureq.

use crate::config::{ServerConfig, GITHUB_REPO_BRANCH, GITHUB_REPO_NAME, GITHUB_REPO_OWNER, REPO_SERVER_PATH};
use crate::github;

const EXCLUDED_DIRS: &[&str] = &["world", "logs", "crash-reports", "backups", "libraries", ".cache"];
const SELF_UPDATE_FILES: &[&str] = &[
    "iridescentserver.bat",
    "iridescentserver.sh",
    "phase0_sync.ps1",
    // The Rust binary swaps in Phase 0.5 too. We stage these as .new
    // so the next icraft run picks them up.
    "icraft.exe",
    "icraft",
];

// =============================================================================
// Phase -1 — formerly Z: mirror / dev PC source. Now a thin wrapper
// around github_diff so the launcher pulls everything from the
// GitHub remote, not from a network drive that may serve stale data.
// =============================================================================

/// Bulk-pull the modpack tree from the GitHub remote.
///
/// This used to shell out to `sync_from_repo.bat` (or .sh), which
/// preferred a `Z:` network mapping pointing at the dev box's
/// PrismLauncher instance and only fell back to GitHub if the drive
/// was missing. That meant a stale dev-side clone produced stale
/// jars on the server, with no obvious failure (Phase -1 succeeded,
/// just copied old content).
///
/// New behavior: always route through `github_diff` with
/// `force = true`, so every Phase -1 invocation walks the GitHub
/// compare API and fetches files via raw URLs directly. No network
/// drive dependency. Same auth path as the rest of our HTTP traffic
/// (ureq + optional PAT).
///
/// Function name + signature kept stable -- the GUI's `Sync repo`
/// button, the CLI's `sync` subcommand, and `serve()`'s phase -1
/// step all keep working.
pub fn z_mirror_or_zip(cfg: &ServerConfig) -> Result<()> {
    log::info!("[sync] phase -1: github_diff (bulk pull from origin/main; legacy Z: bat path retired)");
    github_diff(cfg, true)
}

// =============================================================================
// Phase 0 — native GitHub diff sync
// =============================================================================

pub fn github_diff(cfg: &ServerConfig, force: bool) -> Result<()> {
    if force {
        let sha_file = cfg.last_sha();
        if sha_file.exists() {
            fs::remove_file(&sha_file).ok();
            log::info!("[sync] --force: cleared {}", sha_file.display());
        }
    }

    let local_sha = read_local_sha(&cfg.last_sha());

    // Remote HEAD; failure here is non-fatal (offline / API down) — we
    // continue with whatever the install already has.
    let remote_sha = match github::head_sha(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("[sync] GitHub API unreachable: {e:#}");
            log::warn!("[sync] continuing with existing files");
            return Ok(());
        }
    };

    if local_sha.as_deref() == Some(remote_sha.as_str()) {
        log::info!("[sync] up to date (commit {})", short_sha(&remote_sha));
        return Ok(());
    }

    // Decide: diff vs full zip.
    let diff_result = local_sha.as_ref().and_then(|local| {
        if local.len() != 40 { return None; }   // not a real SHA
        match github::compare(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, local, &remote_sha) {
            Ok(cmp) => Some(cmp),
            Err(e) => {
                log::warn!("[sync] compare API failed ({e:#}) — falling back to full zip");
                None
            }
        }
    });

    let use_diff = match &diff_result {
        Some(cmp) if !cmp.files.is_empty() && cmp.files.len() < github::COMPARE_FILES_CAP => true,
        Some(cmp) if cmp.files.len() >= github::COMPARE_FILES_CAP => {
            log::warn!(
                "[sync] {} files changed (API cap = {}, response truncated) — full zip fallback",
                cmp.files.len(), github::COMPARE_FILES_CAP
            );
            false
        }
        Some(_) => {
            log::warn!("[sync] compare returned no files — full zip fallback");
            false
        }
        None => false,
    };

    if use_diff {
        let cmp = diff_result.unwrap();
        diff_sync(cfg, &cmp.files, &remote_sha, &local_sha)
    } else {
        if local_sha.is_none() {
            log::info!("[sync] first run — downloading full repository zip");
        }
        full_zip_sync(cfg, &remote_sha)
    }
}

// =============================================================================
// Phase 0 — diff fast path
// =============================================================================

fn diff_sync(
    cfg: &ServerConfig,
    files: &[github::ChangedFile],
    remote_sha: &str,
    local_sha: &Option<String>,
) -> Result<()> {
    log::info!(
        "[sync] new commit {} (was {}) -- {} file(s) changed",
        short_sha(remote_sha),
        local_sha.as_deref().map(short_sha).unwrap_or_else(|| "(none)".to_string()),
        files.len()
    );

    let prefix = REPO_SERVER_PATH.trim_end_matches('/');
    let mut synced = 0usize;
    let mut removed = 0usize;
    let mut staged = 0usize;
    let mut skipped = 0usize;
    let mut errors = 0usize;

    for f in files {
        let Some(rel) = f.filename.strip_prefix(&format!("{prefix}/")) else {
            skipped += 1; continue;
        };
        if is_excluded(rel) { skipped += 1; continue; }

        let target = cfg.server_dir.join(rel);

        if f.status == "removed" {
            if target.exists() {
                if let Err(e) = fs::remove_file(&target) {
                    log::warn!("[sync]   [FAIL] remove {}: {}", rel, e);
                    errors += 1;
                } else {
                    removed += 1;
                    log::debug!("[sync]   [removed] {}", rel);
                }
            }
            continue;
        }

        // Self-update files: stage as <target>.new so the running .bat /
        // exe doesn't get overwritten while in use.
        let dest = if SELF_UPDATE_FILES.iter().any(|s| s == &rel) {
            log::info!("[sync]   [staged] {}", rel);
            staged += 1;
            target.with_file_name(format!(
                "{}.new",
                target.file_name().unwrap_or_default().to_string_lossy()
            ))
        } else {
            target
        };

        if let Err(e) = ensure_parent(&dest) {
            log::warn!("[sync]   [FAIL] mkdir for {}: {}", rel, e);
            errors += 1;
            continue;
        }
        match github::fetch_raw(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, remote_sha, &f.filename) {
            Ok(body) => {
                if let Err(e) = fs::write(&dest, &body) {
                    log::warn!("[sync]   [FAIL] write {}: {}", rel, e);
                    errors += 1;
                } else if !SELF_UPDATE_FILES.iter().any(|s| s == &rel) {
                    synced += 1;
                    log::debug!("[sync]   [synced] {}", rel);
                }
            }
            Err(e) => {
                log::warn!("[sync]   [FAIL] download {}: {:#}", rel, e);
                errors += 1;
            }
        }
    }

    // Match phase0_sync.ps1: only write SHA when ALL files succeeded.
    // A partial sync that updates the SHA leaves the install in a
    // half-applied state with no way to retry.
    if errors == 0 {
        write_sha(&cfg.last_sha(), remote_sha)?;
    } else {
        log::warn!(
            "[sync] {} file(s) failed -- NOT writing SHA marker, next run will retry",
            errors
        );
    }

    log::info!(
        "[sync] done: synced={}, removed={}, staged={}, skipped={}, errors={}",
        synced, removed, staged, skipped, errors
    );
    Ok(())
}

// =============================================================================
// Phase 0 — full zip fallback
// =============================================================================

fn full_zip_sync(cfg: &ServerConfig, remote_sha: &str) -> Result<()> {
    let tmp_dir = std::env::temp_dir();
    let zip_path = tmp_dir.join("IridescentCraft-server-update.zip");
    let extract_dir = tmp_dir.join("IridescentCraft-server-update");

    // Cleanup leftovers from a prior failed run.
    let _ = fs::remove_file(&zip_path);
    let _ = fs::remove_dir_all(&extract_dir);

    log::info!("[sync] downloading full repository zip...");
    {
        let mut f = fs::File::create(&zip_path)
            .with_context(|| format!("create {}", zip_path.display()))?;
        github::fetch_zip(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH, &mut f)?;
        f.flush().ok();
    }
    let zip_size = fs::metadata(&zip_path)?.len();
    if zip_size < 100_000 {
        anyhow::bail!("downloaded zip too small ({zip_size} bytes) — likely failed");
    }
    log::info!("[sync] zip downloaded ({} MB), extracting", zip_size / (1024 * 1024));

    fs::create_dir_all(&extract_dir)?;
    extract_zip(&zip_path, &extract_dir)?;

    // The zip's top-level dir is `IridescentCraft-<branch>/`. Find it.
    let top_level = fs::read_dir(&extract_dir)?
        .filter_map(|e| e.ok())
        .find(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .ok_or_else(|| anyhow!("no top-level dir in extracted zip"))?
        .path();

    let src = top_level.join(REPO_SERVER_PATH.replace('\\', "/"));
    if !src.exists() {
        anyhow::bail!("expected {} inside extracted zip", src.display());
    }

    log::info!("[sync] mirroring {} -> {}", src.display(), cfg.server_dir.display());
    mirror_distro(&src, &cfg.server_dir)?;

    write_sha(&cfg.last_sha(), remote_sha)?;
    let _ = fs::remove_file(&zip_path);
    let _ = fs::remove_dir_all(&extract_dir);
    log::info!("[sync] full sync to {}", short_sha(remote_sha));
    Ok(())
}

/// Mirror the zip's `server_distribution/` into the install dir. Three
/// special cases match phase0_sync.ps1 Step 3B:
///   - `mods/.index/`: copy new + delete stale `.pw.toml`
///   - `mods/`: per-jar copy with delete-then-write retry
///   - self-update files: stage as `<file>.new` if hash differs
///
/// Excluded dirs (world/logs/etc.) are skipped at the top level.
fn mirror_distro(src: &Path, dest: &Path) -> Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        let from = entry.path();
        let ft = entry.file_type()?;

        if ft.is_dir() && EXCLUDED_DIRS.contains(&name_str.as_str()) {
            log::debug!("[sync]   skip excluded dir: {}", name_str);
            continue;
        }

        if name_str == "mods" && ft.is_dir() {
            mirror_mods(&from, &dest.join("mods"))?;
            continue;
        }

        if SELF_UPDATE_FILES.iter().any(|s| s == &name_str) && ft.is_file() {
            let target = dest.join(&name_str);
            if files_differ(&from, &target).unwrap_or(true) {
                let staged = target.with_file_name(format!("{name_str}.new"));
                fs::copy(&from, &staged)
                    .with_context(|| format!("stage {} -> {}", from.display(), staged.display()))?;
                log::info!("[sync]   [staged] {}", name_str);
            }
            continue;
        }

        let to = dest.join(&name_str);
        if ft.is_dir() {
            mirror_recursive(&from, &to)?;
            log::debug!("[sync]   [dir]  {}", name_str);
        } else {
            ensure_parent(&to)?;
            // delete-then-write to bypass intermittent AV locks on
            // bytecode-patched jars (Patchouli, ars_nouveau).
            let _ = fs::remove_file(&to);
            copy_with_retry(&from, &to, 3)?;
            log::debug!("[sync]   [file] {}", name_str);
        }
    }
    Ok(())
}

fn mirror_mods(src_mods: &Path, dest_mods: &Path) -> Result<()> {
    let dest_index = dest_mods.join(".index");
    fs::create_dir_all(&dest_index)?;

    // Copy .index/* (the packwiz manifest) and delete stale pw.toml.
    let src_index = src_mods.join(".index");
    if src_index.is_dir() {
        // Copy new entries
        for e in fs::read_dir(&src_index)? {
            let e = e?;
            let to = dest_index.join(e.file_name());
            if e.file_type()?.is_file() {
                fs::copy(e.path(), &to)?;
            }
        }
        // Delete stale .pw.toml not present in src
        if let Ok(rd) = fs::read_dir(&dest_index) {
            for e in rd.flatten() {
                let n = e.file_name();
                if !n.to_string_lossy().ends_with(".pw.toml") { continue; }
                if !src_index.join(&n).exists() {
                    let _ = fs::remove_file(e.path());
                    log::info!("[sync]   [cleanup] removed stale: {}", n.to_string_lossy());
                }
            }
        }
    }

    // Copy custom jars (any .jar at top level of mods/).
    fs::create_dir_all(dest_mods)?;
    for e in fs::read_dir(src_mods)? {
        let e = e?;
        if !e.file_type()?.is_file() { continue; }
        let n = e.file_name();
        if !n.to_string_lossy().ends_with(".jar") { continue; }
        let to = dest_mods.join(&n);
        let _ = fs::remove_file(&to);
        copy_with_retry(&e.path(), &to, 3)?;
    }
    Ok(())
}

// =============================================================================
// Helpers
// =============================================================================

fn is_excluded(rel: &str) -> bool {
    EXCLUDED_DIRS.iter().any(|d| {
        rel == *d || rel.starts_with(&format!("{d}/")) || rel.starts_with(&format!("{d}\\"))
    })
}

fn read_local_sha(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn write_sha(path: &Path, sha: &str) -> Result<()> {
    // Match phase0_sync.ps1: ASCII, no trailing newline.
    fs::write(path, sha.as_bytes()).with_context(|| format!("write {}", path.display()))
}

fn short_sha(s: &str) -> String {
    s.chars().take(7).collect()
}

fn ensure_parent(p: &Path) -> Result<()> {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("mkdir {}", parent.display()))?;
    }
    Ok(())
}

fn copy_with_retry(from: &Path, to: &Path, attempts: u32) -> Result<()> {
    let mut last_err = None;
    for i in 1..=attempts {
        match fs::copy(from, to) {
            Ok(_) => return Ok(()),
            Err(e) => {
                if i < attempts {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
                last_err = Some(e);
            }
        }
    }
    Err(anyhow!(
        "copy {} -> {} failed after {} attempts: {}",
        from.display(), to.display(), attempts,
        last_err.map(|e| e.to_string()).unwrap_or_default()
    ))
}

fn files_differ(a: &Path, b: &Path) -> std::io::Result<bool> {
    if !b.exists() { return Ok(true); }
    Ok(hash_file(a)? != hash_file(b)?)
}

fn hash_file(p: &Path) -> std::io::Result<u64> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::Hasher;
    let mut hasher = DefaultHasher::new();
    let mut f = fs::File::open(p)?;
    let mut buf = [0u8; 8192];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 { break; }
        hasher.write(&buf[..n]);
    }
    Ok(hasher.finish())
}

fn mirror_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)? {
        let e = e?;
        let from = e.path();
        let to = dst.join(e.file_name());
        if e.file_type()?.is_dir() {
            mirror_recursive(&from, &to)?;
        } else {
            ensure_parent(&to)?;
            let _ = fs::remove_file(&to);
            copy_with_retry(&from, &to, 3)?;
        }
    }
    Ok(())
}

fn extract_zip(zip_path: &Path, into: &Path) -> Result<()> {
    let f = fs::File::open(zip_path).with_context(|| format!("open {}", zip_path.display()))?;
    let mut archive = zip::ZipArchive::new(f).context("read zip")?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).context("zip entry")?;
        let Some(rel) = entry.enclosed_name().map(PathBuf::from) else { continue };
        let out = into.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            ensure_parent(&out)?;
            let mut sink = fs::File::create(&out)
                .with_context(|| format!("create {}", out.display()))?;
            std::io::copy(&mut entry, &mut sink)?;
        }
    }
    Ok(())
}
