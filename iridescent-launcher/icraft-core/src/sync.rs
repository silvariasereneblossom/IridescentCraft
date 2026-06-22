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
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
// std::process::Command/Stdio dropped along with the bat-shell-out
// path in z_mirror_or_zip; sync now stays in-Rust via ureq.

use crate::config::{ServerConfig, GITHUB_REPO_BRANCH, GITHUB_REPO_NAME, GITHUB_REPO_OWNER, REPO_SERVER_PATH};
use crate::github;

// =============================================================================
// Visible sync status — surfaced as a GUI badge so a fail-open / stale-launch
// can't hide in scrolling log output (the operator complaint: "Cycle doesn't
// sync consistently"). Mirrors run::ServerState; the GUI reads sync_status()
// each frame and colours the badge red on the not-ok states.
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncStatus {
    /// No sync attempted yet this session.
    Idle,
    /// A sync is in flight (HEAD fetch / diff / download).
    Checking,
    /// Marker already == remote HEAD; on-disk git content current. (The
    /// independent-of-SHA verifies — jar hash + expected-state — still run.)
    Current,
    /// A diff or full-zip sync applied changes and advanced the marker.
    Updated,
    /// GitHub API HEAD fetch failed after retries — proceeding with the files
    /// currently on disk as an explicit, LOUD last resort (NOT silent success).
    ApiUnreachable,
    /// A sync ran but some files failed to write (marker NOT advanced; next run
    /// retries).
    PartialFailure,
}

static SYNC_STATUS: Mutex<SyncStatus> = Mutex::new(SyncStatus::Idle);

/// Current visible sync status (read by the GUI badge).
pub fn sync_status() -> SyncStatus {
    *SYNC_STATUS.lock().unwrap()
}

fn set_sync_status(s: SyncStatus) {
    let mut g = SYNC_STATUS.lock().unwrap();
    if *g != s {
        log::info!("[sync] *** sync status: {:?} -> {:?} ***", *g, s);
        *g = s;
    }
}

/// HEAD-fetch retry schedule for the fail-loud path (item: don't fail open).
/// Sleeps BETWEEN attempts, so N entries = N+1 total tries. Short + bounded:
/// the common transient cause is the unauth 60/hr bucket momentarily drained,
/// which a few seconds' backoff can ride out without stalling a Cycle for long.
const HEAD_FETCH_BACKOFF: &[Duration] =
    &[Duration::from_secs(2), Duration::from_secs(4)];

const EXCLUDED_DIRS: &[&str] = &["world", "logs", "crash-reports", "backups", "libraries", ".cache"];
const SELF_UPDATE_FILES: &[&str] = &[
    "iridescentserver.bat",
    "iridescentserver.sh",
    "phase0_sync.ps1",
    // The Rust binary swaps in Phase 0.5 too. We stage these as .new
    // so the next icraft run picks them up.
    "icraft.exe",
    "icraft",
    // GUI variant (added 2026-05-29): the launcher swapped from CLI
    // (icraft.exe) to GUI (icraft-gui.exe) but this list wasn't
    // updated -- mirror_distro was treating the running .exe as a
    // regular file and hitting "being used by another process" on
    // Windows. STAGED_FILES in self_update.rs MUST match this list.
    "icraft-gui.exe",
    "icraft-gui",
];

// =============================================================================
// Phase -1 — formerly Z: mirror / dev PC source. Now a thin wrapper
// around github_diff so the launcher pulls everything from the
// GitHub remote, not from a network drive that may serve stale data.
// =============================================================================

/// Incremental sync from the GitHub remote.
///
/// Historically this was Phase -1 — a `Z:` drive mirror copy from a
/// dev-box working tree, with a Phase 0 zip fallback if the drive
/// wasn't present. After the Z: dependency was retired, the function
/// briefly hardcoded `force = true` here, which **cleared the local
/// SHA marker on every invocation** and forced a full repo zip
/// download instead of the diff fast-path. That made every
/// `Run (full)` and every `Sync repo` press redownload the entire
/// repo, behaving worse than the bat it replaced.
///
/// Current behavior: `force = false`. Reads `.icraft_last_sha`,
/// hits the GitHub compare API for changed files only, and downloads
/// just those via raw URLs. Matches the incremental semantics of
/// `sync_from_repo.bat`. The "force a full pull" path is reachable
/// via the GUI's `Sync (--force)` button or `icraft sync --force`,
/// both of which call `github_diff(cfg, true)` directly.
///
/// Function name + signature kept stable so the GUI's `Sync repo`
/// button, the CLI's `sync` subcommand, and `serve()`'s phase -1
/// step keep working without churn.
pub fn z_mirror_or_zip(cfg: &ServerConfig) -> Result<()> {
    log::info!("[sync] incremental sync (origin/main, GitHub compare API)");
    github_diff(cfg, false)
}

// =============================================================================
// Phase 0 — native GitHub diff sync
// =============================================================================

pub fn github_diff(cfg: &ServerConfig, force: bool) -> Result<()> {
    set_sync_status(SyncStatus::Checking);
    if force {
        let sha_file = cfg.last_sha();
        if sha_file.exists() {
            fs::remove_file(&sha_file).ok();
            log::info!("[sync] --force: cleared {}", sha_file.display());
        }
    }

    let local_sha = read_local_sha(&cfg.last_sha());

    // Remote HEAD. A failure here used to immediately `return Ok(())` —
    // fail-OPEN: the server launched on whatever stale files were on disk with
    // no visible signal, and the badge could even keep claiming "(in sync)"
    // against a marker that no longer matched origin. That is exactly the
    // inconsistency the operator hit.
    //
    // Don't fail open silently. RETRY with a short backoff first (the
    // head_sha_cdn helper already does CDN x2 -> API, and the API client
    // already retries unauthenticated on a revoked-token 401/403; this outer
    // loop rides out a momentarily-drained 60/hr unauth bucket). Only after the
    // retries are exhausted do we proceed-stale — and then LOUDLY, with a
    // visible ApiUnreachable badge state, not a silent Ok. Setting
    // GITHUB_TOKEN lifts the limit to 5000/hr and is the durable fix.
    let remote_sha = match head_sha_with_retry() {
        Ok(s) => s,
        Err(e) => {
            set_sync_status(SyncStatus::ApiUnreachable);
            log::error!("[sync] !!! GitHub HEAD fetch FAILED after retries: {e:#}");
            log::error!("[sync] !!! PROCEEDING STALE (last resort) -- server will start with the files currently on disk.");
            log::error!("[sync] !!! These may NOT match origin/main. The 'Repo HEAD' badge is now unverifiable.");
            log::error!("[sync] !!! Most common cause: GitHub unauth rate limit (60/hr per IP).");
            log::error!("[sync] !!! FIX: save a GitHub PAT in the launcher (GitHub auth -> Token -> Save) -- it now");
            log::error!("[sync] !!!      authenticates the SYNC too (5000/hr), not just pushes. Or set GITHUB_TOKEN.");
            log::error!("[sync] !!!      Then Cycle again.");
            // Soft-return so serve()'s later phases (jar hash-verify,
            // expected-state) still run against on-disk state; the badge +
            // error banner carry the warning.
            return Ok(());
        }
    };

    if local_sha.as_deref() == Some(remote_sha.as_str()) {
        log::info!("[sync] up to date (commit {})", short_sha(&remote_sha));
        set_sync_status(SyncStatus::Current);
        // Item 1a: the custom-jar manifest verify drifts INDEPENDENTLY of the
        // git SHA (a rebuilt same-filename jar that didn't deploy), so run it
        // even on the marker short-circuit — repairing in place before launch
        // instead of blind-trusting "up to date".
        verify_custom_jars(cfg, &remote_sha);
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

    let result = if use_diff {
        let cmp = diff_result.unwrap();
        diff_sync(cfg, &cmp.files, &remote_sha, &local_sha)
    } else {
        if local_sha.is_none() {
            log::info!("[sync] first run — downloading full repository zip");
        }
        full_zip_sync(cfg, &remote_sha)
    };
    // Item 1a: verify customs against the manifest after the content sync too —
    // catches out-of-band drift the commit-diff wouldn't have re-listed.
    verify_custom_jars(cfg, &remote_sha);
    result
}

/// Verify deployed custom jars against `custom_jars_manifest.json` and RE-FETCH,
/// IN PLACE, any that are present but content-drifted from the manifest's
/// SHA-256 — pulling the canonical bytes from GitHub raw @ `remote_sha`.
///
/// This is the heart of the "manifest-aware custom-jar check that runs even when
/// the marker == HEAD" (item 1a). The registry-desync bug is a rebuilt
/// SAME-FILENAME jar whose content drifted (e.g.
/// `iridescent_tetra_expansion-1.0.0.jar` gaining new item registrations while
/// keeping its `1.0.0` string). github_diff's marker short-circuit never noticed
/// it — the SHA matched, so it returned. Now we hash every deployed manifest jar
/// each sync and repair drift BEFORE the server launches, so one Cycle brings a
/// drifted install fully current (the verify-server.ps1 "STALE" finding).
///
/// Scope: PRESENT-but-drifted only. A manifest jar that is ABSENT is left alone
/// — the manifest is a 3-distro SUPERSET that also lists client-only jars
/// (`mek_walkable_cables`, `offlineskins`) which are legitimately not on a
/// server, and the normal diff/full sync handles genuine server-jar adds.
/// Soft-fails per jar (logs); `mods::cleanup_stale_jars` is the offline backstop
/// when a re-fetch isn't possible (it removes the drifted copy + clears the
/// marker so the next online sync re-adds).
fn verify_custom_jars(cfg: &ServerConfig, remote_sha: &str) {
    let manifest = crate::mods::load_custom_jar_hashes(&cfg.custom_jars_manifest());
    if manifest.is_empty() {
        return;
    }
    let mods_dir = cfg.mods_dir();
    let prefix = REPO_SERVER_PATH.trim_end_matches('/');
    let mut ok = 0usize;
    let mut repaired = 0usize;
    let mut failed = 0usize;

    for (name, expected) in &manifest {
        let target = mods_dir.join(name);
        if !target.exists() {
            continue; // absent -> maybe client-only superset entry; leave to sync
        }
        match sha256_file(&target) {
            Ok(h) if &h == expected => {
                ok += 1;
                continue;
            }
            Ok(_) => { /* drifted -> repair below */ }
            Err(e) => {
                log::warn!("[sync] custom-jar verify: can't hash {name}: {e} (skipping)");
                continue;
            }
        }

        let repo_path = format!("{prefix}/mods/{name}");
        log::warn!(
            "[sync] custom jar {name}: content drift vs manifest -- re-fetching in place @ {}",
            short_sha(remote_sha)
        );
        match github::fetch_raw(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, remote_sha, &repo_path) {
            Ok(body) => {
                // Guard: only commit bytes that actually match the manifest, so
                // a truncated/wrong response can't swap one bad jar for another.
                let got = sha256_bytes(&body);
                if &got != expected {
                    failed += 1;
                    log::error!(
                        "[sync] custom jar {name}: re-fetched bytes ({}..) still != manifest ({}..) -- left as-is",
                        &got[..got.len().min(16)], &expected[..expected.len().min(16)]
                    );
                    continue;
                }
                // Write to a temp sibling, then atomic-rename over the target.
                // NEVER delete-then-write: if the write failed after the delete,
                // the jar would be left MISSING, and a missing jar with marker
                // == HEAD is invisible to this verify next Cycle (we only repair
                // PRESENT-drifted). Tmp-then-rename means a failed repair leaves
                // the original drifted jar in place -> cleanup_stale_jars removes
                // it + clears the marker -> the next sync re-adds it. No
                // permanently-missing window.
                let tmp = target.with_file_name(format!("{name}.icrafttmp"));
                let _ = fs::remove_file(&tmp);
                if let Err(e) = fs::write(&tmp, &body) {
                    failed += 1;
                    log::error!("[sync] custom jar {name}: temp write failed: {e} (drifted copy left for cleanup)");
                    let _ = fs::remove_file(&tmp);
                    continue;
                }
                match fs::rename(&tmp, &target) {
                    Ok(()) => {
                        repaired += 1;
                        log::info!("[sync] custom jar {name}: repaired in place ({} bytes)", body.len());
                    }
                    Err(e) => {
                        failed += 1;
                        let _ = fs::remove_file(&tmp);
                        log::error!("[sync] custom jar {name}: rename into place failed: {e} (drifted copy left for cleanup)");
                    }
                }
            }
            Err(e) => {
                failed += 1;
                log::error!(
                    "[sync] custom jar {name}: re-fetch failed: {e:#} (cleanup_stale_jars will remove the drifted copy as a backstop)"
                );
            }
        }
    }

    if repaired > 0 || failed > 0 {
        log::info!("[sync] custom-jar verify: ok={ok} repaired={repaired} failed={failed}");
    } else {
        log::debug!("[sync] custom-jar verify: all {ok} present jar(s) match manifest");
    }
}

/// Fetch remote HEAD with a bounded backoff (see [`HEAD_FETCH_BACKOFF`]). The
/// underlying `head_sha_cdn` already degrades CDN -> API and retries a revoked
/// token anonymously; this outer loop rides out a transient rate-limit/offline
/// blip so a single hiccup doesn't drop the whole Cycle to proceed-stale.
fn head_sha_with_retry() -> Result<String> {
    let mut last_err = None;
    for attempt in 0..=HEAD_FETCH_BACKOFF.len() {
        match github::head_sha_cdn(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH) {
            Ok(s) => return Ok(s),
            Err(e) => {
                if let Some(delay) = HEAD_FETCH_BACKOFF.get(attempt) {
                    log::warn!(
                        "[sync] HEAD fetch attempt {} failed ({e:#}); retrying in {}s...",
                        attempt + 1, delay.as_secs()
                    );
                    std::thread::sleep(*delay);
                }
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("HEAD fetch failed (no error captured)")))
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
        set_sync_status(SyncStatus::Updated);
    } else {
        set_sync_status(SyncStatus::PartialFailure);
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

    // Expected-state deletion/repair pass: runs AFTER the non-deleting overlay
    // and BEFORE the extract dir is removed (repairs source from `src`). Closes
    // the strand-on-delete gap (repo deletions left orphaned files on disk after
    // a full-zip overlay forever -- the diff path already handles `removed`).
    // Mirrors phase0_sync.ps1 `Invoke-ExpectedStatePass`. Soft-fails: never
    // aborts the sync.
    //
    // This is the ONE path that can repair from a freshly-extracted source.
    // serve() ALSO runs a (delete-only) verify_expected_state on every launch
    // regardless of sync path, so the gap is closed on the diff + short-circuit
    // paths too -- but here we still run it with the extract source so a
    // lock-failed overlay copy can be repaired in place rather than deferred.
    expected_state_pass(&cfg.server_dir, Some(&src), "[sync] ");

    write_sha(&cfg.last_sha(), remote_sha)?;
    set_sync_status(SyncStatus::Updated);
    let _ = fs::remove_file(&zip_path);
    let _ = fs::remove_dir_all(&extract_dir);
    log::info!("[sync] full sync to {}", short_sha(remote_sha));
    Ok(())
}

// =============================================================================
// Public entry point for the every-launch expected-state verify (item: run the
// drift verify even when the marker == HEAD, on the diff path, not only on
// full-zip). Called by serve() as an explicit phase so it runs regardless of
// which sync path github_diff took (or whether it short-circuited / failed
// open). `extract_src` is None here: there's no fresh zip to repair from, so
// repairs degrade to "fetch-needed" (logged; the next real sync overlays them),
// while DELETIONS of repo-dropped files still apply (when live). See
// `expected_state_pass` for the dry-run / live gating + safety notes.
// =============================================================================

/// Run the expected-state verify/repair pass against the live install, with no
/// extract source (delete + report; repairs become fetch-needed). Soft-fails.
pub fn verify_expected_state(cfg: &ServerConfig) {
    expected_state_pass(&cfg.server_dir, None, "[verify] ");
}

// =============================================================================
// Phase 0 — expected-state deletion/repair pass (full-zip overlay closer)
// =============================================================================
//
// The full-zip overlay above (`mirror_distro`) is NON-DELETING: it copies
// new/changed files over the live install but never removes files the repo
// dropped. Repo deletions therefore strand on consumers forever (the 8 stale
// affixes that aborted the live magic_weapon pool; packetfixer/tier_skip/probe;
// censused 2026-06-06). The DIFF path already handles status==removed; this pass
// closes the same gap for the full-zip path, using `expected_state.json` --
// generated from the repo tree over the managed roots -- as the single source of
// truth for what should exist.
//
// Mirrors `Invoke-ExpectedStatePass` in phase0_sync.ps1 (same log wording so
// operator greps work across the PS1 + Rust legs). Behavior after a full-zip
// overlay, per managed roots (kubejs/, config/, mods/.index/):
//   - on disk but NOT in manifest             -> DELETE (respecting volatile dirs)
//   - in manifest, hash MISMATCH, not volatile -> REPAIR from the extract copy
//                                                 (mismatch after overlay means a
//                                                 local write-protect/lock failure)
//   - in manifest, MISSING on disk            -> REPAIR (copy from extract), log
//   - in manifest, hash MISMATCH, volatile     -> KEEP LOCAL (mod rewrites this
//                                                 config at runtime)
//
// FAIL-KEEP: manifest missing/unparseable/empty -> delete NOTHING, warn loudly.
//
// DRY-RUN (default) — STILL DRY, deliberately. Item 1 wired this pass to run on
// EVERY serve()/Cycle (not just the rare full-zip), so the would-delete report
// is now produced every launch. But DELETION stays report-only until the
// operator signs off, for a concrete safety reason confirmed 2026-06-19:
// `expected_state.json` lags HEAD by the regen two-step (on disk it was at
// generated_from=09a7706a while HEAD had moved to 338bbb76, with three
// mods/.index `.pw.toml` already hash-drifted). A stale manifest that is MISSING
// a file added since its generated_from would flag that (legitimately-synced)
// file as "delete". So: review one Cycle's `would-delete` lines, confirm they're
// all genuine repo-deletions (not new content), THEN set ICRAFT_EXPECTED_STATE_DRY=0
// (or flip the const) to go live. REPAIRS are already safe on the serve() path:
// extract_src=None there, so a hash-mismatch becomes "fetch-needed" (logged, NOT
// applied), which is why a stale manifest can't revert the drifted `.pw.toml`.

/// Dry-run default. Deletions are report-only until an operator confirms the
/// `would-delete` report (see the block comment above for why this is NOT yet
/// auto-live). Going live: set `ICRAFT_EXPECTED_STATE_DRY=0` in the environment
/// (preferred — no rebuild) or flip this to `false`. Mirrors
/// `$ExpectedStateDryRun = $true` in phase0_sync.ps1.
const EXPECTED_STATE_DRY: bool = true;

/// Volatile runtime DIRS under managed roots: present only at runtime on a
/// consumer, never authored in the repo (so never in the manifest). The delete
/// pass MUST NOT touch them even though they are absent from the manifest. Keep
/// in lockstep with `$ExpectedStateVolatileDirs` in phase0_sync.ps1 and
/// `$VolatileDirs` in generate_expected_state.ps1.
const EXPECTED_STATE_VOLATILE_DIRS: &[&str] =
    &["kubejs/exported", "kubejs/logs", "kubejs/libraries", "kubejs/.cache"];

/// Any path segment equal to this is treated as a volatile dir (mirrors
/// `$ExpectedStateCacheDirName` in phase0_sync.ps1).
const EXPECTED_STATE_CACHE_DIR: &str = ".cache";

/// Manifest filename, sat at each distro root (here: `cfg.server_dir`).
const EXPECTED_STATE_FILE: &str = "expected_state.json";

#[derive(serde::Deserialize)]
struct ExpectedState {
    // version / generated_from are provenance only; deserialized so a malformed
    // shape is caught, but not otherwise consumed by the pass.
    #[allow(dead_code)]
    version: Option<u32>,
    #[allow(dead_code)]
    generated_from: Option<String>,
    roots: Option<Vec<String>>,
    files: Option<BTreeMap<String, ExpectedEntry>>,
}

#[derive(serde::Deserialize)]
struct ExpectedEntry {
    sha256: String,
    #[allow(dead_code)]
    size: Option<u64>,
    /// LIST but keep-local on hash mismatch (mod rewrites the config at runtime).
    /// serde defaults a missing key to false.
    #[serde(default)]
    volatile: bool,
}

/// True if `rel` (forward-slash relpath) is inside a volatile runtime dir.
fn is_volatile_dir(rel: &str) -> bool {
    for v in EXPECTED_STATE_VOLATILE_DIRS {
        if rel == *v || rel.starts_with(&format!("{v}/")) {
            return true;
        }
    }
    rel.split('/').any(|seg| seg == EXPECTED_STATE_CACHE_DIR)
}

/// Resolve dry-run: in-script default, overridable by ICRAFT_EXPECTED_STATE_DRY
/// (0 = live, 1 = dry). Mirrors the PS1 env override semantics.
fn expected_state_dry() -> bool {
    match std::env::var("ICRAFT_EXPECTED_STATE_DRY").ok().as_deref() {
        Some("1") => true,
        Some("0") => false,
        _ => EXPECTED_STATE_DRY,
    }
}

/// Post-overlay deletion/repair pass against `<dest_root>/expected_state.json`.
///
/// `dest_root` is the live distro root on disk (deletions/repairs land here, and
/// where the manifest is read from). `extract_src` is the freshly-extracted
/// distro root used as the repair source (`None` if it's already gone -> repairs
/// are reported as fetch-needed). `log_prefix` matches the PS1 `$LogPrefix`.
///
/// Soft-fails throughout (FAIL-KEEP): any problem -> log + delete nothing. Never
/// returns an error; the caller's sync must not abort because of this pass.
fn expected_state_pass(dest_root: &Path, extract_src: Option<&Path>, log_prefix: &str) {
    let dry = expected_state_dry();
    if dry {
        log::info!(
            "{}[expected-state] DRY-RUN mode (report-only). To go live: flip EXPECTED_STATE_DRY=false in sync.rs (or ICRAFT_EXPECTED_STATE_DRY=0).",
            log_prefix
        );
    } else {
        log::info!(
            "{}[expected-state] LIVE mode (deletions/repairs WILL be applied).",
            log_prefix
        );
    }

    let manifest_path = dest_root.join(EXPECTED_STATE_FILE);
    if !manifest_path.exists() {
        log::warn!(
            "{}[expected-state] manifest missing - skipping deletion pass",
            log_prefix
        );
        return;
    }

    let raw = match fs::read_to_string(&manifest_path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!(
                "{}[expected-state] manifest unparseable ({}) - skipping deletion pass",
                log_prefix, e
            );
            return;
        }
    };
    if raw.trim().is_empty() {
        log::warn!(
            "{}[expected-state] manifest unparseable (empty manifest) - skipping deletion pass",
            log_prefix
        );
        return;
    }
    let manifest: ExpectedState = match serde_json::from_str(&raw) {
        Ok(m) => m,
        Err(e) => {
            log::warn!(
                "{}[expected-state] manifest unparseable ({}) - skipping deletion pass",
                log_prefix, e
            );
            return;
        }
    };

    let files = manifest.files.unwrap_or_default();
    let roots = manifest.roots.unwrap_or_default();
    if files.is_empty() || roots.is_empty() {
        log::warn!(
            "{}[expected-state] manifest empty/malformed (no files/roots) - skipping deletion pass",
            log_prefix
        );
        return;
    }

    // -- Pass 1: walk the live managed roots; find on-disk files NOT in manifest --
    let mut to_delete: Vec<String> = Vec::new();
    for root in &roots {
        // `root` may contain a forward slash (mods/.index); join segment-wise so
        // it works on Windows (the consumer's actual target).
        let root_path = join_rel(dest_root, root);
        if !root_path.exists() {
            continue;
        }
        let mut on_disk: Vec<String> = Vec::new();
        if let Err(e) = collect_rel_files(&root_path, dest_root, &mut on_disk) {
            // A walk error means we can't be sure what's on disk -> FAIL-KEEP for
            // this root rather than risk a wrong delete set.
            log::warn!(
                "{}[expected-state] walk failed under {} ({}) - skipping this root",
                log_prefix, root, e
            );
            continue;
        }
        for rel in on_disk {
            if is_volatile_dir(&rel) {
                continue; // never delete runtime dirs
            }
            if !files.contains_key(&rel) {
                to_delete.push(rel);
            }
        }
    }

    // -- Pass 2: walk the manifest; find missing-on-disk + hash-mismatch --
    let mut to_repair: Vec<String> = Vec::new();
    let mut kept_volatile = 0usize;
    for (rel, entry) in &files {
        let target = join_rel(dest_root, rel);
        if !target.exists() {
            to_repair.push(rel.clone());
            continue;
        }
        let local_hash = match sha256_file(&target) {
            Ok(h) => h,
            Err(e) => {
                // Can't hash -> treat as needing repair rather than silently
                // trusting a possibly-corrupt file.
                log::warn!("{}[expected-state]   hash failed {}: {}", log_prefix, rel, e);
                to_repair.push(rel.clone());
                continue;
            }
        };
        if local_hash != entry.sha256.to_lowercase() {
            if entry.volatile {
                // Mod rewrites this config in place at runtime - the divergence is
                // expected. KEEP the local copy; do NOT overwrite from the zip.
                kept_volatile += 1;
            } else {
                to_repair.push(rel.clone());
            }
        }
    }

    // -- Apply deletions --
    for rel in &to_delete {
        let target = join_rel(dest_root, rel);
        if dry {
            log::info!("{}[expected-state]   would-delete {}", log_prefix, rel);
        } else if let Err(e) = fs::remove_file(&target) {
            log::warn!("{}[expected-state]   [FAIL] delete {}: {}", log_prefix, rel, e);
        } else {
            log::info!("{}[expected-state]   deleted {}", log_prefix, rel);
        }
    }

    // -- Apply repairs (source from the just-extracted copy) --
    let mut fetch_needed = 0usize;
    for rel in &to_repair {
        let target = join_rel(dest_root, rel);
        let src_file = extract_src.map(|s| join_rel(s, rel));
        if dry {
            log::info!("{}[expected-state]   would-repair {}", log_prefix, rel);
        } else if let Some(src_file) = src_file.filter(|p| p.exists()) {
            let ok = ensure_parent(&target).is_ok() && fs::copy(&src_file, &target).is_ok();
            if ok {
                log::info!("{}[expected-state]   repaired {}", log_prefix, rel);
            } else {
                log::warn!("{}[expected-state]   [FAIL] repair {}", log_prefix, rel);
            }
        } else {
            fetch_needed += 1;
            log::warn!(
                "{}[expected-state]   fetch-needed {} (not in extract; re-run sync)",
                log_prefix, rel
            );
        }
    }

    // Summary line: wording matched to phase0_sync.ps1 so cross-leg greps work.
    let (verb, verb2) = if dry {
        ("would-delete", "would-repair")
    } else {
        ("deleted", "repaired")
    };
    let mut summary = format!(
        "{}expected-state: {} {}, {} {}",
        log_prefix, verb, to_delete.len(), verb2, to_repair.len()
    );
    if kept_volatile > 0 {
        summary.push_str(&format!(", kept-volatile {kept_volatile}"));
    }
    if fetch_needed > 0 {
        summary.push_str(&format!(", fetch-needed {fetch_needed}"));
    }
    log::info!("{}", summary);
}

/// Join a forward-slash relpath onto a base path, one segment at a time so it
/// resolves correctly on Windows (where the consumer actually runs). Mirrors the
/// PS1 `$rel -replace '/', '\'` + Join-Path.
fn join_rel(base: &Path, rel: &str) -> PathBuf {
    let mut p = base.to_path_buf();
    for seg in rel.split('/') {
        if !seg.is_empty() {
            p.push(seg);
        }
    }
    p
}

/// Recursively collect files under `dir`, pushing each one's path RELATIVE TO
/// `base` (forward-slash separated, matching manifest relpaths). Hand-rolled
/// recursion (no walkdir dep) consistent with `mirror_recursive`.
fn collect_rel_files(dir: &Path, base: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for e in fs::read_dir(dir)? {
        let e = e?;
        let path = e.path();
        let ft = e.file_type()?;
        if ft.is_dir() {
            collect_rel_files(&path, base, out)?;
        } else if ft.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                // Normalise to forward slashes (manifest keys use '/').
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                out.push(rel_str);
            }
        }
    }
    Ok(())
}

/// Lowercase hex SHA-256 of a file, streamed in 8 KiB chunks. Matches the
/// manifest's digest format (and PS1 `Get-FileHash -Algorithm SHA256` lowered).
/// Note: this is the cryptographic hash for manifest verification -- distinct
/// from `hash_file()` (a cheap non-crypto DefaultHasher used for the
/// self-update files_differ check).
fn sha256_file(p: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let mut f = fs::File::open(p)?;
    let mut buf = [0u8; 8192];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    Ok(hex)
}

/// Lowercase hex SHA-256 of an in-memory byte buffer (used to validate a
/// re-fetched custom jar against the manifest before committing it to disk).
fn sha256_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let mut hex = String::with_capacity(64);
    for b in hasher.finalize() {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
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
