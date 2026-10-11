//! World backups, taken while the server is stopped (operator policy
//! 2026-10-11: one every 12 hours, newest 2 kept).
//!
//! Why this lives in the launcher: the pack's backup mod (FastBack, git-based)
//! never ran on the box -- there is no git there -- and nothing noticed for six
//! months. The launcher already owns the one moment a world can be copied
//! safely: the stopped window inside every Cycle (JVM down, world files
//! closed). The uptime restart policy opens that window at least every 12 h,
//! so backups need no restarts of their own.
//!
//!   - when:     [`stopped_window`], called by `serve()` just before the JVM is
//!               launched, backs up when the newest verified scheduled backup
//!               is older than the interval (or there is none). Restarts happen
//!               ~6x a day, so most calls do nothing.
//!   - what:     the whole `<level-name>/` folder ->
//!               `backups/world-YYYYmmdd-HHMM.zip`. Region files are stored
//!               uncompressed (they are already zlib'd, and this is downtime);
//!               `session.lock` is skipped.
//!   - verify:   the zip is reopened and every entry read back (CRC + size)
//!               before it gets its final name. Only then are older scheduled
//!               backups pruned. A zip that fails is deleted and the old ones
//!               are kept.
//!   - on demand: a request file ([`REQUEST_FILE`], same shape as the Cycle
//!               request) takes a PINNED backup, `backups/manual-YYYYmmdd-HHMM.zip`,
//!               which is never pruned: it is the operator's to delete. With
//!               the JVM down it runs at once; with the server up it waits for
//!               the next stopped window.
//!   - manifest: `backups/backups.json` lists the verified backups of both
//!               kinds (name, kind, size, sha256, UTC time, file count). The
//!               off-box pull job copies only what it lists, so it can never
//!               mirror a half-written zip.
//!
//! Two rules everything here is built around:
//!   1. A backup never blocks a launch. Every failure is logged loudly, shown
//!      on the GUI's Backup badge, and the server starts anyway.
//!   2. The only files ever deleted are `world-YYYYmmdd-HHMM.zip` (retention)
//!      and this module's own `.partial-*` temp files, and the candidates come
//!      from a directory scan, never from the manifest. Nothing named
//!      `manual-*` or `pre-regen-*` is ever removed, nor the old FTB zip, nor
//!      anything else in `backups/`.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use crate::config::ServerConfig;
use crate::restart_policy::fmt_span;

/// Back up when the newest verified scheduled backup is at least this old.
pub const INTERVAL: Duration = Duration::from_secs(12 * 3600);
/// Verified scheduled backups kept after a new one is verified.
pub const KEEP: usize = 2;
/// A backup still running after this long is abandoned so the server can start.
pub const MAX_DURATION: Duration = Duration::from_secs(20 * 60);

/// Optional `key=value` overrides, next to server.properties. Runtime-only (not
/// in the repo, not touched by the sync), read at every backup decision:
///
/// ```text
/// mode=off            # live (default) | off (no scheduled backups; requests still run)
/// interval_hours=12
/// keep=2
/// max_minutes=20
/// ```
pub const POLICY_FILE: &str = ".icraft_backup_policy";
/// `<unix-secs> <reason>`: take a pinned backup at the next chance.
pub const REQUEST_FILE: &str = ".icraft_backup_request";
/// `<unix-secs> <answer>`: queued / started / done / skipped / rejected / FAILED.
pub const RESULT_FILE: &str = ".icraft_backup_request.result";
/// In `backups/`: the verified backups, for the badge and the off-box pull job.
pub const MANIFEST_FILE: &str = "backups.json";
/// Audit log, in the server's `logs/` (mirrored to TesterLogs with the rest).
pub const LOG_FILE: &str = "backup.log";

const MANIFEST_VERSION: u32 = 1;
const LOG_ROLL_BYTES: u64 = 1024 * 1024;
/// Temp files are `.partial-<final name>`: a prefix, so that nothing this
/// module creates-then-deletes ever starts with `manual-`.
const PARTIAL_PREFIX: &str = ".partial-";
/// A queued request waits for the next Cycle (at most ~12 h away); anything
/// older is a leftover.
const REQUEST_MAX_AGE: Duration = Duration::from_secs(24 * 3600);
/// Free space needed before writing, as a multiple of the world's size.
const FREE_SPACE_FACTOR: u64 = 2;
/// Files this big get ZIP64 headers (the format's plain limit is 4 GiB).
const ZIP64_FILE_BYTES: u64 = 3 << 30;
const IO_BUF: usize = 1 << 20;

// =============================================================================
// Policy
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Live,
    /// No scheduled backups. Request-file backups still run.
    Off,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    pub mode: Mode,
    pub interval: Duration,
    pub keep: usize,
    pub max_duration: Duration,
}

impl Default for Policy {
    fn default() -> Self {
        Self { mode: Mode::Live, interval: INTERVAL, keep: KEEP, max_duration: MAX_DURATION }
    }
}

impl Policy {
    /// The defaults, with [`POLICY_FILE`] applied when it exists. `Err` = the
    /// file is unreadable or has a line that doesn't parse.
    pub fn load(server_dir: &Path) -> Result<Self, String> {
        match fs::read_to_string(server_dir.join(POLICY_FILE)) {
            Ok(body) => Self::parse(&body).map_err(|e| format!("{POLICY_FILE}: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("{POLICY_FILE}: unreadable ({e})")),
        }
    }

    fn parse(body: &str) -> Result<Self, String> {
        let mut p = Self::default();
        for raw in body.lines() {
            // A BOM survives `read_to_string`; PowerShell 5.1 writes one.
            let line = raw.trim_start_matches('\u{feff}').split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let (key, value) = line
                .split_once('=')
                .ok_or_else(|| format!("'{line}' is not key=value"))?;
            let (key, value) = (key.trim().to_ascii_lowercase(), value.trim().to_ascii_lowercase());
            let number = || value.parse::<u64>().map_err(|_| format!("'{line}': not a whole number"));
            match key.as_str() {
                "mode" => {
                    p.mode = match value.as_str() {
                        "live" | "on" => Mode::Live,
                        "off" => Mode::Off,
                        _ => return Err(format!("'{line}': mode is live or off")),
                    }
                }
                "interval_hours" => p.interval = Duration::from_secs(number()?.saturating_mul(3600)),
                "keep" => {
                    let n = number()?;
                    if n == 0 {
                        return Err(format!("'{line}': keep must be at least 1"));
                    }
                    p.keep = usize::try_from(n).unwrap_or(usize::MAX);
                }
                "max_minutes" => {
                    let n = number()?;
                    if n == 0 {
                        return Err(format!("'{line}': max_minutes must be at least 1"));
                    }
                    p.max_duration = Duration::from_secs(n.saturating_mul(60));
                }
                _ => return Err(format!("'{line}': unknown key")),
            }
        }
        Ok(p)
    }

    /// One line for the audit log and reports.
    pub fn describe(&self) -> String {
        let overridden = if *self == Self::default() { "" } else { " [policy file in effect]" };
        format!(
            "{}one every {}, newest {} kept, {} time limit{overridden}",
            if self.mode == Mode::Off { "scheduled backups OFF; " } else { "" },
            fmt_span(self.interval),
            self.keep,
            fmt_span(self.max_duration),
        )
    }
}

/// The policy to act on. A file that doesn't parse must not stop backups (they
/// are the safe action), and must not prune on thresholds the operator did not
/// mean: the caller backs up on the defaults and deletes nothing until the
/// file is fixed or removed.
fn effective_policy(server_dir: &Path) -> (Policy, Option<String>) {
    match Policy::load(server_dir) {
        Ok(p) => (p, None),
        Err(e) => (Policy::default(), Some(e)),
    }
}

// =============================================================================
// Names + time
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// `world-*.zip`: taken on the schedule, rotated by retention.
    Scheduled,
    /// `manual-*.zip`: asked for, pinned -- never pruned here.
    Manual,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Scheduled => "scheduled",
            Kind::Manual => "manual",
        }
    }

    fn prefix(self) -> &'static str {
        match self {
            Kind::Scheduled => "world-",
            Kind::Manual => "manual-",
        }
    }
}

/// `YYYYmmdd-HHMM.zip`, exactly.
fn is_stamp_zip(rest: &str) -> bool {
    let b = rest.as_bytes();
    b.len() == 17
        && b[..8].iter().all(u8::is_ascii_digit)
        && b[8] == b'-'
        && b[9..13].iter().all(u8::is_ascii_digit)
        && rest.ends_with(".zip")
}

/// Which kind of backup a file name in `backups/` is, if it is one of ours.
/// Strict on purpose: `world-before-update.zip` or a `manual-live-...` folder
/// is somebody else's.
pub fn kind_of(name: &str) -> Option<Kind> {
    [Kind::Scheduled, Kind::Manual]
        .into_iter()
        .find(|k| name.strip_prefix(k.prefix()).map_or(false, is_stamp_zip))
}

/// `world-YYYYmmdd-HHMM.zip`: the only backups retention may delete.
pub fn is_scheduled_name(name: &str) -> bool {
    kind_of(name) == Some(Kind::Scheduled)
}

/// Local time, to the minute: scheduled backups are 12 h apart.
fn file_name_for(kind: Kind, unix: i64) -> String {
    let t: chrono::DateTime<chrono::Local> =
        (UNIX_EPOCH + Duration::from_secs(u64::try_from(unix).unwrap_or(0))).into();
    format!("{}{}.zip", kind.prefix(), t.format("%Y%m%d-%H%M"))
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// `2026-10-11T09:15:02Z`
fn utc_stamp(unix: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(unix, 0)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_default()
}

fn parse_utc(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp())
}

fn span_since(now: i64, then: i64) -> Duration {
    Duration::from_secs(u64::try_from(now - then).unwrap_or(0))
}

/// `1.16 GiB` / `512.0 MiB` / `3 KiB`
pub fn fmt_bytes(n: u64) -> String {
    const KIB: f64 = 1024.0;
    let f = n as f64;
    if f >= KIB * KIB * KIB {
        format!("{:.2} GiB", f / (KIB * KIB * KIB))
    } else if f >= KIB * KIB {
        format!("{:.1} MiB", f / (KIB * KIB))
    } else {
        format!("{:.0} KiB", f / KIB)
    }
}

// =============================================================================
// Manifest (backups/backups.json)
// =============================================================================

/// One verified backup. The pull job relies on `file`, `kind`, `size`,
/// `sha256`, `created_utc` and `world_files`; the rest is for people.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub file: String,
    /// `scheduled` (rotated: gone from here once pruned) or `manual` (pinned).
    #[serde(default)]
    pub kind: String,
    /// Bytes on disk.
    pub size: u64,
    /// Lowercase hex, of the zip.
    pub sha256: String,
    /// RFC 3339, UTC, to the second.
    pub created_utc: String,
    /// Files inside (directories not counted).
    pub world_files: u64,
    #[serde(default)]
    pub world_bytes: u64,
    #[serde(default)]
    pub duration_secs: u64,
    /// What asked for it: `cycle`, `request '<reason>'`, `cli`.
    #[serde(default)]
    pub trigger: String,
}

/// How the newest attempt went, so a failure shows up without reading logs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Attempt {
    pub at_utc: String,
    pub ok: bool,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub updated_utc: String,
    #[serde(default)]
    pub level_name: String,
    #[serde(default)]
    pub last_attempt: Option<Attempt>,
    /// Newest first, both kinds.
    #[serde(default)]
    pub backups: Vec<Entry>,
}

impl Manifest {
    fn of_kind(&self, kind: Kind) -> impl Iterator<Item = &Entry> {
        self.backups.iter().filter(move |e| e.kind == kind.as_str())
    }
}

fn read_manifest(backups_dir: &Path) -> Result<Manifest, String> {
    match fs::read_to_string(backups_dir.join(MANIFEST_FILE)) {
        Ok(body) => serde_json::from_str(body.trim_start_matches('\u{feff}'))
            .map_err(|e| format!("{MANIFEST_FILE} does not parse ({e})")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Manifest::default()),
        Err(e) => Err(format!("{MANIFEST_FILE} is unreadable ({e})")),
    }
}

/// Temp file + rename, so a reader sees the old manifest or the new one, never
/// half of either.
fn save_manifest(backups_dir: &Path, m: &mut Manifest) -> Result<()> {
    m.version = MANIFEST_VERSION;
    m.updated_utc = utc_stamp(unix_now());
    let mut body = serde_json::to_string_pretty(&*m).context("serializing the manifest")?;
    body.push('\n');
    let tmp = backups_dir.join(format!("{MANIFEST_FILE}.tmp"));
    {
        let mut f = File::create(&tmp).with_context(|| format!("creating {}", tmp.display()))?;
        f.write_all(body.as_bytes())?;
        f.sync_all()?;
    }
    let dest = backups_dir.join(MANIFEST_FILE);
    if let Err(e) = rename_with_retry(&tmp, &dest) {
        let _ = fs::remove_file(&tmp);
        return Err(e).with_context(|| format!("replacing {}", dest.display()));
    }
    Ok(())
}

/// Windows refuses to rename a file, or to replace one, while another process
/// has it open: the pull job reading the manifest over the share, a virus
/// scanner looking at a zip that was just closed. Those last milliseconds.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(_) if attempt < 10 => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(e),
        }
    }
}

/// Drop entries that no longer describe a file on disk (gone, resized, not a
/// backup name, or with an unreadable time), take each entry's kind from its
/// file name, and sort newest first. Returns the names dropped.
fn reconcile(m: &mut Manifest, backups_dir: &Path) -> Vec<String> {
    let mut dropped = Vec::new();
    m.backups.retain(|e| {
        let ok = kind_of(&e.file).is_some()
            && parse_utc(&e.created_utc).is_some()
            && fs::metadata(backups_dir.join(&e.file)).map_or(false, |md| md.is_file() && md.len() == e.size);
        if !ok {
            dropped.push(e.file.clone());
        }
        ok
    });
    for e in &mut m.backups {
        if let Some(kind) = kind_of(&e.file) {
            e.kind = kind.as_str().to_string();
        }
    }
    m.backups.sort_by_key(|e| std::cmp::Reverse(parse_utc(&e.created_utc).unwrap_or(0)));
    dropped
}

/// Backup zips of `kind` actually in `backups/`: (name, mtime as unix seconds).
fn scan(backups_dir: &Path, kind: Kind) -> Vec<(String, i64)> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(backups_dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if kind_of(&name) != Some(kind) {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        if !md.is_file() {
            continue;
        }
        let mtime = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs() as i64);
        out.push((name, mtime));
    }
    out
}

/// Which scheduled zips to delete so that the newest `keep` VERIFIED ones
/// remain. `zips` = (name, unix time, verified). An unverified zip (one the
/// manifest doesn't list -- e.g. the launcher was killed between the rename and
/// the manifest write) never counts toward `keep` and never pushes a verified
/// one out; it is only removed once it is older than every backup being kept.
fn prune_plan(zips: &[(String, i64, bool)], keep: usize) -> Vec<String> {
    let mut verified: Vec<i64> = zips.iter().filter(|z| z.2).map(|z| z.1).collect();
    verified.sort_unstable_by(|a, b| b.cmp(a));
    if keep == 0 || verified.len() < keep {
        return Vec::new();
    }
    let cutoff = verified[keep - 1];
    zips.iter().filter(|z| z.1 < cutoff).map(|z| z.0.clone()).collect()
}

/// Scheduled backups only: a pinned one is never a candidate.
fn retention_plan(backups_dir: &Path, manifest: &Manifest, keep: usize) -> Vec<String> {
    let verified: HashMap<&str, i64> = manifest
        .of_kind(Kind::Scheduled)
        .filter_map(|e| parse_utc(&e.created_utc).map(|t| (e.file.as_str(), t)))
        .collect();
    let zips: Vec<(String, i64, bool)> = scan(backups_dir, Kind::Scheduled)
        .into_iter()
        .map(|(name, mtime)| {
            let listed = verified.get(name.as_str()).copied();
            match listed {
                Some(t) => (name, t, true),
                None => (name, mtime, false),
            }
        })
        .collect();
    prune_plan(&zips, keep)
}

/// Newest verified scheduled backup still on disk: (file, created unix
/// seconds). Pinned backups don't count: the schedule runs on its own clock.
fn newest_scheduled(backups_dir: &Path) -> Option<(String, i64)> {
    let mut m = read_manifest(backups_dir).ok()?;
    reconcile(&mut m, backups_dir);
    let e = m.of_kind(Kind::Scheduled).next()?;
    Some((e.file.clone(), parse_utc(&e.created_utc)?))
}

/// Is a scheduled backup due? `newest` = when the newest verified one was
/// made. A time from the future (the clock was wrong when it was taken) can't
/// be trusted to age, so it counts as due.
fn is_due(newest: Option<i64>, now: i64, interval: Duration) -> bool {
    match newest {
        None => true,
        Some(at) => {
            let age = now - at;
            age < -300 || u64::try_from(age).unwrap_or(0) >= interval.as_secs()
        }
    }
}

// =============================================================================
// Audit log
// =============================================================================

/// Append one line to `logs/backup.log` (and the launcher log). Best-effort.
pub fn audit(server_dir: &Path, level: log::Level, msg: &str) {
    log::log!(level, "[backup] {msg}");
    let dir = server_dir.join("logs");
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(LOG_FILE);
    if fs::metadata(&path).map_or(false, |m| m.len() > LOG_ROLL_BYTES) {
        let _ = fs::rename(&path, dir.join(format!("{LOG_FILE}.1")));
    }
    let tag = match level {
        log::Level::Error => "ERROR: ",
        log::Level::Warn => "WARN: ",
        _ => "",
    };
    let line = format!("[{}] {tag}{msg}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

// =============================================================================
// Mutual exclusion with the JVM
// =============================================================================

/// Held for the whole of a backup, and by `run::launch_server_inner` across the
/// JVM spawn: a launch waits for a backup in progress, and no backup can start
/// in the gap before the child's PID is published.
static LOCK: Mutex<()> = Mutex::new(());
/// A backup is being written/verified right now (GUI badge).
static RUNNING: AtomicBool = AtomicBool::new(false);
/// The newest failure, per server dir, in case the manifest couldn't record it
/// (a full disk is exactly when it can't).
static LAST_FAILURE: Mutex<Option<(PathBuf, String)>> = Mutex::new(None);
/// The request body last answered "queued", so the watcher says it once.
static QUEUED_ANSWERED: Mutex<Option<String>> = Mutex::new(None);

// A panic inside a backup must not wedge every later launch on a poisoned lock.
fn lock() -> MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// For `run::launch_server_inner`: waits for a backup in progress, then keeps
/// backups out until the guard is dropped.
pub fn launch_guard() -> MutexGuard<'static, ()> {
    if RUNNING.load(Ordering::SeqCst) {
        log::info!("[backup] a world backup is in progress -- the launch waits for it to finish");
    }
    lock()
}

pub fn in_progress() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

struct RunningFlag;

impl RunningFlag {
    fn raise() -> Self {
        RUNNING.store(true, Ordering::SeqCst);
        RunningFlag
    }
}

impl Drop for RunningFlag {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Does another process have the world open? Minecraft keeps `session.lock`
/// open for as long as it has the world, so asking for the file with no
/// sharing fails with a sharing violation while any server is running on it --
/// including one this launcher did not start (an orphaned JVM). Checked on the
/// live box 2026-10-11: reading the file does NOT fail there, so a read probe
/// would have been a silent no-op; the exclusive open is refused (error 32).
///
/// Asked three times, half a second apart: a virus scanner can hold the file
/// for an instant, a server holds it for as long as it runs.
fn world_open_elsewhere(world_dir: &Path) -> bool {
    for attempt in 0..3 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(500));
        }
        if !session_lock_held(world_dir) {
            return false;
        }
    }
    true
}

/// The same question for the other writer that must stay out while a server
/// runs: the config override layer ([`crate::overrides`]).
pub fn world_in_use(cfg: &ServerConfig) -> bool {
    world_open_elsewhere(&cfg.world_dir())
}

#[cfg(windows)]
fn session_lock_held(world_dir: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    const ERROR_SHARING_VIOLATION: i32 = 32;
    match fs::OpenOptions::new().read(true).share_mode(0).open(world_dir.join("session.lock")) {
        Ok(_) => false,
        Err(e) => e.raw_os_error() == Some(ERROR_SHARING_VIOLATION),
    }
}

// No equivalent without a locking dependency; the in-process check stands alone.
#[cfg(not(windows))]
fn session_lock_held(_world_dir: &Path) -> bool {
    false
}

#[cfg(windows)]
fn free_space(dir: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut free: u64 = 0;
    // SAFETY: `wide` is NUL-terminated and outlives the call; the out-pointer
    // is a live u64 and the two unused ones may be null.
    let ok = unsafe {
        GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut())
    };
    (ok != 0).then_some(free)
}

#[cfg(not(windows))]
fn free_space(_dir: &Path) -> Option<u64> {
    None
}

// =============================================================================
// Walk + zip + verify
// =============================================================================

struct WorldFile {
    /// Entry name in the zip: `<world folder>/region/r.0.0.mca`.
    name: String,
    path: PathBuf,
    size: u64,
    mtime: Option<SystemTime>,
}

#[derive(Default)]
struct Walk {
    /// Every directory, empty ones included, as `<world folder>/.../`.
    dirs: Vec<String>,
    files: Vec<WorldFile>,
    bytes: u64,
    /// `session.lock`, plus anything that is neither a file nor a directory.
    skipped: Vec<String>,
}

fn walk_world(world_dir: &Path, top: &str) -> std::io::Result<Walk> {
    let mut w = Walk::default();
    w.dirs.push(format!("{top}/"));
    walk_into(world_dir, top, &mut w)?;
    Ok(w)
}

fn walk_into(dir: &Path, rel: &str, w: &mut Walk) -> std::io::Result<()> {
    let mut entries = fs::read_dir(dir)?.collect::<std::io::Result<Vec<fs::DirEntry>>>()?;
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        let child = format!("{rel}/{name}");
        // `file_type` does not follow links, so a junction is neither branch
        // below and can't send the walk in a circle.
        let ft = e.file_type()?;
        if ft.is_dir() {
            w.dirs.push(format!("{child}/"));
            walk_into(&e.path(), &child, w)?;
        } else if ft.is_file() {
            if name == "session.lock" {
                w.skipped.push(child);
                continue;
            }
            let md = e.metadata()?;
            w.bytes += md.len();
            w.files.push(WorldFile { name: child, path: e.path(), size: md.len(), mtime: md.modified().ok() });
        } else {
            w.skipped.push(child);
        }
    }
    Ok(())
}

/// Region (`.mca`) and oversized-chunk (`.mcc`) files are zlib-compressed by
/// Minecraft already: deflating them again buys nothing and costs downtime.
fn is_precompressed(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".mca") || lower.ends_with(".mcc")
}

fn zip_time(t: SystemTime) -> Option<zip::DateTime> {
    use chrono::{Datelike, Timelike};
    let dt: chrono::DateTime<chrono::Local> = t.into();
    zip::DateTime::from_date_and_time(
        u16::try_from(dt.year()).ok()?,
        dt.month() as u8,
        dt.day() as u8,
        dt.hour() as u8,
        dt.minute() as u8,
        dt.second().min(59) as u8,
    )
    .ok()
}

fn file_options(f: &WorldFile) -> zip::write::FileOptions {
    let method = if is_precompressed(&f.name) {
        zip::CompressionMethod::Stored
    } else {
        zip::CompressionMethod::Deflated
    };
    let mut o = zip::write::FileOptions::default()
        .compression_method(method)
        .large_file(f.size >= ZIP64_FILE_BYTES);
    if let Some(t) = f.mtime.and_then(zip_time) {
        o = o.last_modified_time(t);
    }
    o
}

/// An antivirus scan can hold a file for a moment; anything longer is a failure.
fn open_with_retry(path: &Path) -> std::io::Result<File> {
    let mut attempt = 0;
    loop {
        match File::open(path) {
            Ok(f) => return Ok(f),
            Err(_) if attempt < 2 => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(e) => return Err(e),
        }
    }
}

fn check_deadline(deadline: Instant) -> Result<()> {
    if Instant::now() >= deadline {
        bail!("ran past its time limit (max_minutes in {POLICY_FILE})");
    }
    Ok(())
}

fn write_zip(walk: &Walk, dest: &Path, deadline: Instant) -> Result<()> {
    let out = File::create(dest).with_context(|| format!("creating {}", dest.display()))?;
    let mut zip = zip::ZipWriter::new(BufWriter::with_capacity(IO_BUF, out));
    let mut buf = vec![0u8; IO_BUF];
    for d in &walk.dirs {
        zip.add_directory(d.as_str(), zip::write::FileOptions::default())
            .with_context(|| format!("adding {d}"))?;
    }
    for f in &walk.files {
        zip.start_file(f.name.as_str(), file_options(f))
            .with_context(|| format!("adding {}", f.name))?;
        let mut src = open_with_retry(&f.path).with_context(|| format!("opening {}", f.path.display()))?;
        let mut copied: u64 = 0;
        loop {
            let n = src.read(&mut buf).with_context(|| format!("reading {}", f.path.display()))?;
            if n == 0 {
                break;
            }
            zip.write_all(&buf[..n]).with_context(|| format!("writing {}", f.name))?;
            copied += n as u64;
            check_deadline(deadline)?;
        }
        if copied != f.size {
            bail!(
                "{} changed size while it was being read ({} -> {} bytes): is something writing to the world?",
                f.name, f.size, copied
            );
        }
    }
    let mut out = zip.finish().context("finishing the zip")?;
    out.flush().context("flushing the zip")?;
    out.get_ref().sync_all().context("syncing the zip to disk")?;
    Ok(())
}

/// Reopen the zip and read every entry to its end. The zip reader checks each
/// entry's CRC-32 as the last byte is read; on top of that the entry set and
/// every size must match what the walk found.
fn verify_zip(path: &Path, walk: &Walk, deadline: Instant) -> Result<()> {
    let f = File::open(path).with_context(|| format!("reopening {}", path.display()))?;
    let mut archive = zip::ZipArchive::new(BufReader::with_capacity(IO_BUF, f)).context("reading the zip index")?;
    let mut expected: HashMap<&str, u64> = walk.files.iter().map(|f| (f.name.as_str(), f.size)).collect();
    let mut buf = vec![0u8; IO_BUF];
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).with_context(|| format!("opening entry #{i}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let Some(want) = expected.remove(name.as_str()) else {
            bail!("unexpected entry {name}");
        };
        let mut got: u64 = 0;
        loop {
            let n = entry.read(&mut buf).with_context(|| format!("reading back {name}"))?;
            if n == 0 {
                break;
            }
            got += n as u64;
            check_deadline(deadline)?;
        }
        if got != want || entry.size() != want {
            bail!("{name} is {got} bytes in the zip, {want} in the world");
        }
    }
    if let Some(missing) = expected.keys().next() {
        bail!("{} file(s) are missing from the zip (e.g. {missing})", expected.len());
    }
    Ok(())
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let mut f = File::open(path)?;
    let mut buf = vec![0u8; IO_BUF];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let mut hex = String::with_capacity(64);
    for b in hasher.finalize() {
        hex.push_str(&format!("{b:02x}"));
    }
    Ok(hex)
}

/// Remove this module's own temp files (`.partial-<backup name>`) left behind
/// by a backup that was killed.
fn sweep_partials(server_dir: &Path, backups_dir: &Path) {
    let Ok(rd) = fs::read_dir(backups_dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some(base) = name.strip_prefix(PARTIAL_PREFIX) else { continue };
        if kind_of(base).is_none() {
            continue;
        }
        match fs::remove_file(e.path()) {
            Ok(()) => audit(server_dir, log::Level::Warn, &format!("removed {name}, left by a backup that was cut short")),
            Err(err) => audit(server_dir, log::Level::Warn, &format!("could not remove leftover {name}: {err}")),
        }
    }
}

// =============================================================================
// One backup
// =============================================================================

#[derive(Debug, Clone)]
pub enum Outcome {
    /// Written, verified, listed in the manifest. `pruned` = older scheduled
    /// zips removed (always empty for a pinned backup).
    Created { entry: Entry, pruned: Vec<String> },
    NotDue { newest: String, age: Duration },
    /// Scheduled backups are switched off in the policy file.
    Off,
    /// Nothing to do, and that is fine (no world yet).
    Skipped(String),
    Failed(String),
}

impl Outcome {
    pub fn is_failure(&self) -> bool {
        matches!(self, Outcome::Failed(_))
    }

    /// One line for the request's result file and the CLI.
    pub fn answer(&self) -> String {
        match self {
            Outcome::Created { entry, pruned } => format!(
                "done: {} ({} files, {}, {}s, sha256 {}; {})",
                entry.file,
                entry.world_files,
                fmt_bytes(entry.size),
                entry.duration_secs,
                &entry.sha256[..entry.sha256.len().min(12)],
                if entry.kind == Kind::Manual.as_str() {
                    "pinned: never pruned, delete it yourself when done".to_string()
                } else {
                    format!("{} pruned", pruned.len())
                },
            ),
            Outcome::NotDue { newest, age } => format!("skipped: {newest} is only {} old", fmt_span(*age)),
            Outcome::Off => format!("skipped: scheduled backups are off ({POLICY_FILE})"),
            Outcome::Skipped(why) => format!("skipped: {why}"),
            Outcome::Failed(why) => format!("FAILED: {why}"),
        }
    }
}

/// Take one backup now. The caller holds [`LOCK`]. `prune` is false while the
/// policy file is invalid.
fn run_backup(cfg: &ServerConfig, policy: &Policy, prune: bool, kind: Kind, trigger: &str) -> Outcome {
    run_backup_at(cfg, policy, prune, kind, trigger, unix_now())
}

fn run_backup_at(cfg: &ServerConfig, policy: &Policy, prune: bool, kind: Kind, trigger: &str, now: i64) -> Outcome {
    let dir = &cfg.server_dir;
    let _flag = RunningFlag::raise();
    let outcome = match backup_steps(cfg, policy, prune, kind, trigger, now) {
        Ok(o) => o,
        Err(e) => Outcome::Failed(format!("{e:#}")),
    };
    match &outcome {
        Outcome::Failed(why) => {
            audit(dir, log::Level::Error, &format!(
                "BACKUP FAILED ({trigger}): {why} -- existing backups were left alone; the server is not held up"
            ));
            *LAST_FAILURE.lock().unwrap_or_else(|e| e.into_inner()) = Some((dir.clone(), why.clone()));
            record_failure(&cfg.backups_dir(), trigger, why, now);
        }
        Outcome::Created { .. } => {
            let mut last = LAST_FAILURE.lock().unwrap_or_else(|e| e.into_inner());
            if last.as_ref().map_or(false, |(d, _)| d == dir) {
                *last = None;
            }
        }
        Outcome::Skipped(why) => audit(dir, log::Level::Info, &format!("{trigger}: skipped -- {why}")),
        Outcome::NotDue { .. } | Outcome::Off => {}
    }
    outcome
}

/// Best-effort: note the failure in the manifest so the badge and
/// `verify-server.ps1` see it even after the launcher restarts.
fn record_failure(backups_dir: &Path, trigger: &str, why: &str, now: i64) {
    if !backups_dir.is_dir() {
        return;
    }
    let Ok(mut m) = read_manifest(backups_dir) else { return };
    reconcile(&mut m, backups_dir);
    m.last_attempt = Some(Attempt {
        at_utc: utc_stamp(now),
        ok: false,
        trigger: trigger.to_string(),
        note: why.to_string(),
    });
    if let Err(e) = save_manifest(backups_dir, &mut m) {
        log::warn!("[backup] could not record the failure in {MANIFEST_FILE}: {e:#}");
    }
}

fn backup_steps(cfg: &ServerConfig, policy: &Policy, prune: bool, kind: Kind, trigger: &str, now: i64) -> Result<Outcome> {
    let started = Instant::now();
    let dir = &cfg.server_dir;
    let level = cfg.level_name();
    let world = cfg.world_dir();
    let backups = cfg.backups_dir();

    if !world.join("level.dat").is_file() {
        return Ok(Outcome::Skipped(format!("no world to back up yet (no {level}/level.dat)")));
    }
    if crate::run::jvm_active() {
        bail!("the server is running; a backup needs it stopped");
    }
    // Reason first, path last: the badge shows only the start of this.
    if world_open_elsewhere(&world) {
        bail!("the world is open in another process -- is a server still running on it? ({})", world.display());
    }
    if backups.starts_with(&world) {
        bail!("the backups folder is inside the world folder ({})", world.display());
    }
    fs::create_dir_all(&backups).with_context(|| format!("creating {}", backups.display()))?;
    sweep_partials(dir, &backups);

    let top = world
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| level.clone());
    let walk = walk_world(&world, &top).with_context(|| format!("reading {}", world.display()))?;

    match free_space(&backups) {
        Some(free) if free < walk.bytes.saturating_mul(FREE_SPACE_FACTOR) => bail!(
            "not enough free disk space: {} free, {} needed ({FREE_SPACE_FACTOR}x the {} world)",
            fmt_bytes(free),
            fmt_bytes(walk.bytes.saturating_mul(FREE_SPACE_FACTOR)),
            fmt_bytes(walk.bytes),
        ),
        Some(_) => {}
        None => log::warn!("[backup] free disk space could not be read -- going ahead without that check"),
    }

    let name = file_name_for(kind, now);
    let dest = backups.join(&name);
    if dest.exists() {
        bail!("{name} already exists (a backup was taken this very minute)");
    }
    let partial = backups.join(format!("{PARTIAL_PREFIX}{name}"));
    let deadline = started + policy.max_duration;

    audit(dir, log::Level::Info, &format!(
        "{trigger}: backing up {top}/ ({} files, {}) -> backups/{name}",
        walk.files.len(),
        fmt_bytes(walk.bytes),
    ));

    // Write under the temp name, verify, hash, and only then give it the name
    // retention and the manifest recognise.
    let made = (|| -> Result<(u64, String, [Duration; 3])> {
        let t = Instant::now();
        write_zip(&walk, &partial, deadline)?;
        let wrote = t.elapsed();
        let t = Instant::now();
        verify_zip(&partial, &walk, deadline).context("verification failed")?;
        let verified = t.elapsed();
        let t = Instant::now();
        let sha = sha256_file(&partial).context("hashing the new zip")?;
        let hashed = t.elapsed();
        let size = fs::metadata(&partial).context("sizing the new zip")?.len();
        rename_with_retry(&partial, &dest).with_context(|| format!("renaming {PARTIAL_PREFIX}{name} into place"))?;
        Ok((size, sha, [wrote, verified, hashed]))
    })();
    let (size, sha256, phases) = match made {
        Ok(v) => v,
        Err(e) => {
            let _ = fs::remove_file(&partial);
            return Err(e);
        }
    };

    let entry = Entry {
        file: name.clone(),
        kind: kind.as_str().to_string(),
        size,
        sha256,
        created_utc: utc_stamp(now),
        world_files: walk.files.len() as u64,
        world_bytes: walk.bytes,
        duration_secs: started.elapsed().as_secs(),
        trigger: trigger.to_string(),
    };

    let mut manifest = read_manifest(&backups).unwrap_or_else(|e| {
        audit(dir, log::Level::Warn, &format!("{e} -- rebuilding it from this backup"));
        Manifest::default()
    });
    for gone in reconcile(&mut manifest, &backups) {
        audit(dir, log::Level::Warn, &format!("{gone} is listed in {MANIFEST_FILE} but no longer matches a file on disk -- unlisted"));
    }
    manifest.backups.retain(|e| e.file != entry.file);
    manifest.backups.insert(0, entry.clone());
    manifest.backups.sort_by_key(|e| std::cmp::Reverse(parse_utc(&e.created_utc).unwrap_or(0)));
    manifest.level_name = level;
    manifest.last_attempt = Some(Attempt {
        at_utc: entry.created_utc.clone(),
        ok: true,
        trigger: trigger.to_string(),
        note: format!("{name} verified"),
    });

    // A pinned backup leaves the rotation exactly as it was.
    let doomed = if prune && kind == Kind::Scheduled {
        retention_plan(&backups, &manifest, policy.keep)
    } else {
        Vec::new()
    };
    manifest.backups.retain(|e| !doomed.contains(&e.file));
    // Unlist first, delete second: a kill in between leaves a zip nobody lists
    // (the next prune removes it), never a listed zip that is gone.
    save_manifest(&backups, &mut manifest).context("the zip is good, but writing backups.json failed")?;

    let mut pruned = Vec::new();
    for old in doomed {
        if !is_scheduled_name(&old) {
            continue; // can't happen (the scan filters), and must never matter
        }
        let path = backups.join(&old);
        let old_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        match fs::remove_file(&path) {
            Ok(()) => {
                audit(dir, log::Level::Info, &format!("pruned {old} ({}) -- keeping the newest {}", fmt_bytes(old_size), policy.keep));
                pruned.push(old);
            }
            // Most likely the pull job is copying it. It is unlisted now, so
            // the next prune takes it.
            Err(e) => audit(dir, log::Level::Warn, &format!("could not prune {old}: {e} -- will retry at the next backup")),
        }
    }

    let kept = match kind {
        Kind::Scheduled => format!(
            "{} scheduled backup(s) kept{}",
            manifest.of_kind(Kind::Scheduled).count(),
            if prune { "" } else { " (pruning is suspended: fix or remove the policy file)" },
        ),
        Kind::Manual => format!(
            "PINNED, never pruned ({} pinned in all, {})",
            manifest.of_kind(Kind::Manual).count(),
            fmt_bytes(manifest.of_kind(Kind::Manual).map(|e| e.size).sum()),
        ),
    };
    audit(dir, log::Level::Info, &format!(
        "{trigger}: backups/{name} verified -- {} files, {} -> {} in {:.1}s (write {:.1}s, verify {:.1}s, sha256 {:.1}s); {kept}{}",
        entry.world_files,
        fmt_bytes(entry.world_bytes),
        fmt_bytes(entry.size),
        started.elapsed().as_secs_f64(),
        phases[0].as_secs_f64(),
        phases[1].as_secs_f64(),
        phases[2].as_secs_f64(),
        if walk.skipped.len() > 1 { format!("; skipped {}", walk.skipped.join(", ")) } else { String::new() },
    ));
    Ok(Outcome::Created { entry, pruned })
}

/// The scheduled path: back up only if the newest verified scheduled backup is
/// old enough.
fn scheduled_at(cfg: &ServerConfig, policy: &Policy, prune: bool, trigger: &str, now: i64) -> Outcome {
    let dir = &cfg.server_dir;
    if policy.mode == Mode::Off {
        audit(dir, log::Level::Info, &format!("{trigger}: scheduled backups are OFF ({POLICY_FILE}) -- skipped"));
        return Outcome::Off;
    }
    let newest = newest_scheduled(&cfg.backups_dir());
    if !is_due(newest.as_ref().map(|n| n.1), now, policy.interval) {
        // `is_due` is only false with a newest backup in hand.
        let (name, at) = newest.unwrap_or_default();
        let age = span_since(now, at);
        audit(dir, log::Level::Info, &format!(
            "{trigger}: {name} is {} old -- not due (one every {})",
            fmt_span(age),
            fmt_span(policy.interval),
        ));
        return Outcome::NotDue { newest: name, age };
    }
    run_backup_at(cfg, policy, prune, Kind::Scheduled, trigger, now)
}

// =============================================================================
// Request file
// =============================================================================

struct Request {
    reason: String,
}

/// `<unix-secs> <reason>`; the reason is optional.
fn parse_request(body: &str, now: i64) -> Result<Request, String> {
    let mut parts = body.trim_start_matches('\u{feff}').split_whitespace();
    let stamp: i64 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "no timestamp in the request".to_string())?;
    let age = now - stamp;
    if age > REQUEST_MAX_AGE.as_secs() as i64 {
        return Err(format!("stale request ({} old)", fmt_span(span_since(now, stamp))));
    }
    Ok(Request { reason: parts.next().unwrap_or("manual").to_string() })
}

/// Read and remove the request file. `None` = there is none.
fn take_request(server_dir: &Path) -> Option<Result<Request, String>> {
    let path = server_dir.join(REQUEST_FILE);
    let body = fs::read_to_string(&path).ok()?;
    let _ = fs::remove_file(&path);
    Some(parse_request(&body, unix_now()))
}

fn write_result(server_dir: &Path, answer: &str) {
    let _ = fs::write(server_dir.join(RESULT_FILE), format!("{} {answer}\n", unix_now()));
}

/// Ask for a pinned backup at the next chance (the GUI button;
/// `request_backup.ps1` writes the same file).
pub fn write_request(server_dir: &Path, reason: &str) -> std::io::Result<()> {
    let reason: String = reason.split_whitespace().collect::<Vec<_>>().join("-");
    let reason = if reason.is_empty() { "manual".to_string() } else { reason };
    fs::write(server_dir.join(REQUEST_FILE), format!("{} {reason}\n", unix_now()))
}

fn reject_request(server_dir: &Path, why: &str) {
    audit(server_dir, log::Level::Warn, &format!("backup request rejected: {why}"));
    write_result(server_dir, &format!("rejected: {why}"));
}

fn note_invalid_policy(server_dir: &Path, error: &Option<String>) {
    if let Some(e) = error {
        audit(server_dir, log::Level::Warn, &format!(
            "{e} -- using the defaults and NOT pruning until the file is fixed or removed"
        ));
    }
}

// =============================================================================
// Entry points
// =============================================================================

/// Called by `serve()` just before the JVM is launched, so on every Cycle
/// (operator, restart policy, crash recovery) and on a CLI `serve`. Takes the
/// pinned backup a queued request asked for, then the scheduled one if it is
/// due. Never fails and never panics: the launch goes ahead whatever happens
/// here.
pub fn stopped_window(cfg: &ServerConfig) {
    let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| stopped_window_inner(cfg)));
    if run.is_err() {
        audit(&cfg.server_dir, log::Level::Error, "BACKUP PANICKED -- abandoned; the server is not held up (please report this)");
    }
}

fn stopped_window_inner(cfg: &ServerConfig) {
    let dir = &cfg.server_dir;
    let _lock = lock();
    let (policy, policy_error) = effective_policy(dir);
    note_invalid_policy(dir, &policy_error);
    match take_request(dir) {
        Some(Ok(req)) => {
            let outcome = run_backup(cfg, &policy, false, Kind::Manual, &format!("request '{}'", req.reason));
            write_result(dir, &outcome.answer());
        }
        Some(Err(why)) => reject_request(dir, &why),
        None => {}
    }
    // The schedule keeps its own clock: a pinned backup neither satisfies nor
    // delays it.
    scheduled_at(cfg, &policy, policy_error.is_none(), "cycle", unix_now());
}

/// Called every few seconds by the GUI. With the JVM down, a request file is
/// run at once; with the server up it is left in place for the next stopped
/// window and answered "queued" (once).
pub fn poll_request(cfg: &ServerConfig) {
    let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| poll_request_inner(cfg)));
    if run.is_err() {
        let _ = fs::remove_file(cfg.server_dir.join(REQUEST_FILE));
        audit(&cfg.server_dir, log::Level::Error, "BACKUP PANICKED while handling a request -- request dropped (please report this)");
        write_result(&cfg.server_dir, "FAILED: the backup panicked");
    }
}

fn poll_request_inner(cfg: &ServerConfig) {
    let dir = &cfg.server_dir;
    let Ok(body) = fs::read_to_string(dir.join(REQUEST_FILE)) else { return };
    if crate::run::jvm_active() {
        let mut answered = QUEUED_ANSWERED.lock().unwrap_or_else(|e| e.into_inner());
        if answered.as_deref() == Some(body.as_str()) {
            return;
        }
        match parse_request(&body, unix_now()) {
            Ok(req) => {
                audit(dir, log::Level::Info, &format!(
                    "request '{}': the server is running -- queued for the next Cycle's stopped window",
                    req.reason
                ));
                write_result(dir, "queued: the server is running; the backup is taken in the next Cycle's stopped window");
            }
            Err(why) => {
                let _ = fs::remove_file(dir.join(REQUEST_FILE));
                reject_request(dir, &why);
            }
        }
        *answered = Some(body);
        return;
    }
    let _lock = lock();
    if crate::run::jvm_active() {
        return; // a launch got in first; the next poll answers "queued"
    }
    let req = match take_request(dir) {
        Some(Ok(req)) => req,
        Some(Err(why)) => return reject_request(dir, &why),
        None => return, // the stopped window took it while we waited for the lock
    };
    write_result(dir, "started: backing up now");
    let (policy, policy_error) = effective_policy(dir);
    note_invalid_policy(dir, &policy_error);
    let outcome = run_backup(cfg, &policy, false, Kind::Manual, &format!("request '{}'", req.reason));
    write_result(dir, &outcome.answer());
}

/// CLI `icraft backup`: a pinned backup right now, or with `if_due` the
/// scheduled one when the schedule says so. Refused while a server has the
/// world open.
pub fn run_now(cfg: &ServerConfig, if_due: bool) -> Outcome {
    let _lock = lock();
    let (policy, policy_error) = effective_policy(&cfg.server_dir);
    note_invalid_policy(&cfg.server_dir, &policy_error);
    if if_due {
        scheduled_at(cfg, &policy, policy_error.is_none(), "cli", unix_now())
    } else {
        run_backup(cfg, &policy, false, Kind::Manual, "cli")
    }
}

// =============================================================================
// Status (GUI badge, reports)
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Health {
    Good,
    Stale,
    Bad,
}

#[derive(Debug, Clone, Default)]
pub struct Status {
    /// Newest verified scheduled backup: (file, created unix seconds).
    pub newest: Option<(String, i64)>,
    /// Verified scheduled backups on disk.
    pub kept: usize,
    /// Pinned (manual) backups on disk, and what they add up to: nothing
    /// removes these but the operator, so the badge keeps them in view.
    pub pinned: usize,
    pub pinned_bytes: u64,
    /// Why the newest attempt failed, if it did.
    pub failure: Option<String>,
    pub policy_error: Option<String>,
    pub auto_off: bool,
    pub interval: Duration,
}

/// Cheap enough to call every few seconds: two small files and a stat per backup.
pub fn status(server_dir: &Path) -> Status {
    let (policy, policy_error) = effective_policy(server_dir);
    let backups = server_dir.join("backups");
    let mut manifest = read_manifest(&backups).unwrap_or_default();
    reconcile(&mut manifest, &backups);
    let newest = manifest
        .of_kind(Kind::Scheduled)
        .next()
        .and_then(|e| parse_utc(&e.created_utc).map(|t| (e.file.clone(), t)));
    let in_memory = LAST_FAILURE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .filter(|(d, _)| d == server_dir)
        .map(|(_, why)| why.clone());
    let failure = in_memory.or_else(|| {
        manifest.last_attempt.as_ref().filter(|a| !a.ok).map(|a| a.note.clone())
    });
    Status {
        newest,
        kept: manifest.of_kind(Kind::Scheduled).count(),
        pinned: manifest.of_kind(Kind::Manual).count(),
        pinned_bytes: manifest.of_kind(Kind::Manual).map(|e| e.size).sum(),
        failure,
        policy_error,
        auto_off: policy.mode == Mode::Off,
        interval: policy.interval,
    }
}

impl Status {
    /// Good while the newest verified scheduled backup is under interval + 1 h
    /// old, Stale up to twice the interval, Bad beyond that or with none. On
    /// the default policy that is green < 13 h, yellow < 24 h, red after. A
    /// failed attempt or an invalid policy file is Bad at once.
    pub fn health(&self, now: i64) -> Health {
        if self.failure.is_some() || self.policy_error.is_some() {
            return Health::Bad;
        }
        let Some((_, at)) = &self.newest else { return Health::Bad };
        let age = u64::try_from(now - at).unwrap_or(0);
        let good_below = self.interval.as_secs() + 3600;
        let stale_below = (self.interval.as_secs() * 2).max(good_below);
        let by_age = if age < good_below {
            Health::Good
        } else if age < stale_below {
            Health::Stale
        } else {
            Health::Bad
        };
        if self.auto_off && by_age == Health::Good { Health::Stale } else { by_age }
    }

    pub fn label(&self, now: i64) -> String {
        let last = match &self.newest {
            Some((_, at)) => format!("{} ago", fmt_span(span_since(now, *at))),
            None => "none yet".to_string(),
        };
        let pinned = if self.pinned > 0 {
            format!("; {} pinned, {}", self.pinned, fmt_bytes(self.pinned_bytes))
        } else {
            String::new()
        };
        if let Some(why) = &self.failure {
            let short: String = why.chars().take(70).collect();
            return format!("FAILED ({short}) -- last good: {last}{pinned}");
        }
        if self.policy_error.is_some() {
            return format!("POLICY FILE INVALID (not pruning) -- last: {last}{pinned}");
        }
        let tail = if self.auto_off { " [scheduled OFF]" } else { "" };
        match &self.newest {
            Some(_) => format!("{last} ({} kept{pinned}){tail}", self.kept),
            None => format!("none yet -- taken on the next Cycle{pinned}{tail}"),
        }
    }
}

/// Plain-text report for `icraft backup-status` and Diagnose.
pub fn report(cfg: &ServerConfig) -> String {
    let dir = &cfg.server_dir;
    let backups = cfg.backups_dir();
    let now = unix_now();
    let mut out = String::new();
    out.push_str(&format!("world:    {}\n", cfg.world_dir().display()));
    out.push_str(&format!("backups:  {}\n", backups.display()));
    match Policy::load(dir) {
        Ok(p) => out.push_str(&format!("policy:   {}\n", p.describe())),
        Err(e) => out.push_str(&format!("policy:   INVALID ({e}) -- defaults in force, pruning suspended\n")),
    }
    let st = status(dir);
    out.push_str(&format!("status:   {:?} -- {}\n", st.health(now), st.label(now)));
    let mut manifest = read_manifest(&backups).unwrap_or_default();
    reconcile(&mut manifest, &backups);
    for e in &manifest.backups {
        out.push_str(&format!(
            "  {:<27} {:<9} {}  {} files  {}  sha256 {}\n",
            e.file, e.kind, e.created_utc, e.world_files, fmt_bytes(e.size), e.sha256
        ));
    }
    let listed: Vec<&str> = manifest.backups.iter().map(|e| e.file.as_str()).collect();
    for kind in [Kind::Scheduled, Kind::Manual] {
        for (name, _) in scan(&backups, kind) {
            if !listed.contains(&name.as_str()) {
                out.push_str(&format!("  {name}  (not in {MANIFEST_FILE}: unverified)\n"));
            }
        }
    }
    if let Some(a) = &manifest.last_attempt {
        out.push_str(&format!(
            "last attempt: {} {} ({}) {}\n",
            a.at_utc, if a.ok { "ok" } else { "FAILED" }, a.trigger, a.note
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;

    const H: i64 = 3600;
    /// 2026-10-11 09:00:00 UTC.
    const T0: i64 = 1_791_709_200;
    const SCHEDULED: Kind = Kind::Scheduled;

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    /// A throwaway server dir: `level-name=testworld`, a small world, and a
    /// `backups/` folder that already holds things this module must not touch.
    struct Fixture {
        root: PathBuf,
        cfg: ServerConfig,
    }

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "icraft-backup-test-{}-{}",
                std::process::id(),
                NEXT_DIR.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&root);
            let world = root.join("testworld");
            fs::create_dir_all(world.join("region")).unwrap();
            fs::create_dir_all(world.join("data")).unwrap();
            fs::create_dir_all(world.join("poi")).unwrap(); // stays empty
            fs::write(root.join("server.properties"), "#Minecraft server properties\nlevel-name=testworld\nserver-port=25565\n").unwrap();
            fs::write(world.join("level.dat"), b"level data, small and compressible ".repeat(64)).unwrap();
            fs::write(world.join("session.lock"), "\u{2603}").unwrap();
            fs::write(world.join("data").join("raids.dat"), b"raids").unwrap();
            fs::write(world.join("data").join("empty.dat"), b"").unwrap();
            fs::write(world.join("region").join("r.0.0.mca"), noise(300_000, 7)).unwrap();
            fs::write(world.join("region").join("r.0.-1.mca"), noise(70_000, 11)).unwrap();

            let backups = root.join("backups");
            fs::create_dir_all(backups.join("manual-live-20261011-0138").join("region")).unwrap();
            fs::write(backups.join("manual-live-20261011-0138").join("level.dat"), b"stopgap copy").unwrap();
            for decoy in DECOYS {
                fs::write(backups.join(decoy), b"not ours").unwrap();
            }
            Fixture { cfg: ServerConfig::from_path(&root), root }
        }

        fn backups(&self) -> PathBuf {
            self.root.join("backups")
        }

        /// Scheduled zips on disk.
        fn scheduled(&self) -> Vec<String> {
            let mut names: Vec<String> = scan(&self.backups(), SCHEDULED).into_iter().map(|z| z.0).collect();
            names.sort();
            names
        }

        fn decoys_intact(&self) -> bool {
            DECOYS.iter().all(|d| fs::read(self.backups().join(d)).map_or(false, |b| b == b"not ours"))
                && self.backups().join("manual-live-20261011-0138").join("level.dat").is_file()
        }

        fn backup_at(&self, kind: Kind, now: i64) -> Outcome {
            run_backup_at(&self.cfg, &Policy::default(), true, kind, "test", now)
        }

        fn created(&self, outcome: Outcome) -> (Entry, Vec<String>) {
            match outcome {
                Outcome::Created { entry, pruned } => (entry, pruned),
                other => panic!("expected a backup, got {other:?}"),
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    /// Everything in a real `backups/` that is not this module's to delete,
    /// plus near-misses of its name patterns. The two dated 2025 are real
    /// backup NAMES that the manifest has never listed: retention must not
    /// touch the pinned one even so. (2025, so that no test backup -- all are
    /// stamped October 2026 -- can land on the same name in any time zone.)
    const DECOYS: &[&str] = &[
        "2026-3-19_2-0-0.zip",
        "pre-regen-20250101-0000.zip",
        "manual-20250101-0000.zip",
        "manual-notes.zip",
        "world-before-update.zip",
        "world-20261011-090.zip",
        "world-20261011-0900.zip.bak",
        "World-20261011-0900.ZIP.txt",
        ".partial-someone-elses.zip",
        "world-20261011-0900.zip.partial",
        "notes.txt",
    ];

    /// Incompressible-ish bytes, standing in for region data.
    fn noise(len: usize, seed: u64) -> Vec<u8> {
        let mut x = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
        (0..len)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                (x >> 24) as u8
            })
            .collect()
    }

    fn entry_names(zip_path: &Path) -> Vec<(String, zip::CompressionMethod, u64)> {
        let mut ar = zip::ZipArchive::new(File::open(zip_path).unwrap()).unwrap();
        (0..ar.len())
            .map(|i| {
                let e = ar.by_index(i).unwrap();
                (e.name().to_string(), e.compression(), e.size())
            })
            .collect()
    }

    #[test]
    fn only_exact_backup_names_are_recognised() {
        assert_eq!(kind_of("world-20261011-0215.zip"), Some(Kind::Scheduled));
        assert_eq!(kind_of("manual-20261011-0215.zip"), Some(Kind::Manual));
        assert!(is_scheduled_name("world-20261011-0215.zip"));
        // Retention's own test: nothing pinned or foreign is ever "scheduled".
        assert!(!is_scheduled_name("manual-20261011-0215.zip"));
        for other in DECOYS {
            assert!(!is_scheduled_name(other), "{other}");
        }
        for other in [
            "manual-live-20261011-0138",
            "2026-3-19_2-0-0.zip",
            "pre-regen-20261011-0215.zip",
            ".partial-world-20261011-0215.zip",
            "world-2026101a-0215.zip",
            "world-20261011_0215.zip",
            "xworld-20261011-0215.zip",
            "world-20261011-0215.zipx",
            "world-20261011-0215.ZIP",
            "world-",
            "",
        ] {
            assert_eq!(kind_of(other), None, "{other}");
        }
        assert_eq!(kind_of(&file_name_for(Kind::Scheduled, T0)), Some(Kind::Scheduled));
        assert_eq!(kind_of(&file_name_for(Kind::Manual, T0)), Some(Kind::Manual));
    }

    #[test]
    fn policy_file_parses_and_rejects_nonsense() {
        assert_eq!(Policy::parse("").unwrap(), Policy::default());
        let p = Policy::parse("\u{feff}mode = OFF  # paused\n\ninterval_hours=6\nkeep=3\nmax_minutes=5\n").unwrap();
        assert_eq!(p.mode, Mode::Off);
        assert_eq!(p.interval, Duration::from_secs(6 * 3600));
        assert_eq!(p.keep, 3);
        assert_eq!(p.max_duration, Duration::from_secs(300));
        assert_eq!(Policy::parse("interval_hours=0").unwrap().interval, Duration::ZERO);
        assert!(Policy::parse("keep=0").is_err());
        assert!(Policy::parse("max_minutes=0").is_err());
        assert!(Policy::parse("keep=two").is_err());
        assert!(Policy::parse("mode=dry-run").is_err());
        assert!(Policy::parse("retain=2").is_err());
        assert!(Policy::parse("keep 2").is_err());
    }

    #[test]
    fn due_after_the_interval_or_with_no_backup() {
        let i = INTERVAL;
        assert!(is_due(None, T0, i));
        assert!(!is_due(Some(T0), T0, i));
        assert!(!is_due(Some(T0), T0 + 12 * H - 1, i));
        assert!(is_due(Some(T0), T0 + 12 * H, i));
        // The three empty-server Cycles after a backup: 4 h, 8 h, 12 h (+ boots).
        assert!(!is_due(Some(T0), T0 + 4 * H + 180, i));
        assert!(!is_due(Some(T0), T0 + 8 * H + 360, i));
        assert!(is_due(Some(T0), T0 + 12 * H + 540, i));
        // A little clock skew is not "the future"; a day ahead is.
        assert!(!is_due(Some(T0 + 60), T0, i));
        assert!(is_due(Some(T0 + 24 * H), T0, i));
    }

    #[test]
    fn retention_never_trades_a_verified_backup_for_an_unverified_one() {
        let z = |name: &str, t: i64, verified: bool| (name.to_string(), t, verified);
        let (a, b, c, d) = ("a", "b", "c", "d");

        // Plain rotation: the third verified backup pushes out the oldest.
        assert_eq!(prune_plan(&[z(a, 10, true), z(b, 20, true), z(c, 30, true)], 2), vec![a]);
        // Fewer than `keep` verified: nothing goes, strays included.
        assert!(prune_plan(&[z(a, 10, false), z(b, 20, false), z(c, 30, true)], 2).is_empty());
        // A stray newer than the oldest kept backup is left for a later round...
        assert_eq!(prune_plan(&[z(a, 10, true), z(b, 20, true), z(c, 30, false), z(d, 40, true)], 2), vec![a]);
        // ...and removed once it is older than everything being kept.
        assert_eq!(prune_plan(&[z(b, 20, true), z(c, 30, false), z(d, 40, true), z("e", 50, true)], 2), vec![b, c]);
        // Exactly `keep` verified: only older strays go.
        assert_eq!(prune_plan(&[z(a, 5, false), z(b, 20, true), z(d, 40, true)], 2), vec![a]);
        assert!(prune_plan(&[z(b, 20, true), z(d, 40, true)], 2).is_empty());
        assert!(prune_plan(&[], 2).is_empty());
        assert!(prune_plan(&[z(a, 10, true)], 0).is_empty());
    }

    #[test]
    fn request_file_parsing() {
        assert_eq!(parse_request(&format!("{T0} pre-update\n"), T0 + 5).unwrap().reason, "pre-update");
        assert_eq!(parse_request(&format!("\u{feff}{T0}"), T0).unwrap().reason, "manual");
        // Still good after a long wait for the next Cycle, not after a day.
        assert!(parse_request(&format!("{T0} x"), T0 + 13 * H).is_ok());
        assert!(parse_request(&format!("{T0} x"), T0 + 25 * H).is_err());
        assert!(parse_request("backup please", T0).is_err());
        assert!(parse_request("", T0).is_err());
    }

    #[test]
    fn backup_zips_the_whole_world_and_lists_it() {
        let fx = Fixture::new();
        let (entry, pruned) = fx.created(fx.backup_at(SCHEDULED, T0));
        assert!(pruned.is_empty());
        assert_eq!(entry.file, file_name_for(SCHEDULED, T0));
        assert_eq!(entry.kind, "scheduled");
        assert_eq!(entry.world_files, 5); // level.dat, 2 data, 2 region; not session.lock
        assert_eq!(entry.created_utc, "2026-10-11T09:00:00Z");

        let zip_path = fx.backups().join(&entry.file);
        assert_eq!(fs::metadata(&zip_path).unwrap().len(), entry.size);
        assert_eq!(sha256_file(&zip_path).unwrap(), entry.sha256);
        assert!(!fx.backups().join(format!("{PARTIAL_PREFIX}{}", entry.file)).exists());

        let names = entry_names(&zip_path);
        let find = |n: &str| names.iter().find(|e| e.0 == n).unwrap_or_else(|| panic!("{n} not in the zip"));
        // Restoring = unzip into the server dir: entries carry the world folder.
        assert_eq!(find("testworld/region/r.0.0.mca").1, zip::CompressionMethod::Stored);
        assert_eq!(find("testworld/region/r.0.0.mca").2, 300_000);
        assert_eq!(find("testworld/level.dat").1, zip::CompressionMethod::Deflated);
        assert_eq!(find("testworld/data/empty.dat").2, 0);
        find("testworld/poi/"); // an empty directory survives the round trip
        assert!(!names.iter().any(|e| e.0.contains("session.lock")));
        assert_eq!(names.iter().filter(|e| !e.0.ends_with('/')).count(), 5);

        let manifest = read_manifest(&fx.backups()).unwrap();
        assert_eq!(manifest.version, MANIFEST_VERSION);
        assert_eq!(manifest.level_name, "testworld");
        assert_eq!(manifest.backups, vec![entry.clone()]);
        assert!(manifest.last_attempt.unwrap().ok);
        assert!(!fx.backups().join(format!("{MANIFEST_FILE}.tmp")).exists());

        let st = status(&fx.root);
        assert_eq!(st.newest, Some((entry.file, T0)));
        assert_eq!((st.kept, st.pinned), (1, 0));
        assert_eq!(st.health(T0 + 12 * H), Health::Good);
        assert_eq!(st.health(T0 + 13 * H), Health::Stale);
        assert_eq!(st.health(T0 + 24 * H), Health::Bad);
        assert!(fx.decoys_intact());
    }

    #[test]
    fn a_cycle_backs_up_only_when_one_is_due() {
        let fx = Fixture::new();
        let p = Policy::default();
        fx.created(scheduled_at(&fx.cfg, &p, true, "cycle", T0));
        // The restarts in between find it fresh and do nothing.
        for later in [T0 + 60, T0 + 4 * H, T0 + 8 * H, T0 + 12 * H - 1] {
            assert!(matches!(scheduled_at(&fx.cfg, &p, true, "cycle", later), Outcome::NotDue { .. }));
        }
        assert_eq!(fx.scheduled().len(), 1);
        fx.created(scheduled_at(&fx.cfg, &p, true, "cycle", T0 + 12 * H + 9 * 60));
        assert_eq!(fx.scheduled().len(), 2);

        let off = Policy { mode: Mode::Off, ..Policy::default() };
        assert!(matches!(scheduled_at(&fx.cfg, &off, true, "cycle", T0 + 48 * H), Outcome::Off));
        assert_eq!(fx.scheduled().len(), 2);
    }

    #[test]
    fn retention_keeps_the_newest_two_and_touches_nothing_else() {
        let fx = Fixture::new();
        let (first, _) = fx.created(fx.backup_at(SCHEDULED, T0));
        let (second, pruned) = fx.created(fx.backup_at(SCHEDULED, T0 + 12 * H));
        assert!(pruned.is_empty());
        let (third, pruned) = fx.created(fx.backup_at(SCHEDULED, T0 + 24 * H));
        assert_eq!(pruned, vec![first.file.clone()]);

        let mut want = vec![second.file.clone(), third.file.clone()];
        want.sort();
        assert_eq!(fx.scheduled(), want);
        let manifest = read_manifest(&fx.backups()).unwrap();
        assert_eq!(manifest.backups, vec![third, second]); // newest first
        assert!(fx.decoys_intact());

        // keep=1 from the policy file's side.
        let one = Policy { keep: 1, ..Policy::default() };
        let (fourth, pruned) = fx.created(run_backup_at(&fx.cfg, &one, true, SCHEDULED, "test", T0 + 36 * H));
        assert_eq!(pruned.len(), 2);
        assert_eq!(fx.scheduled(), vec![fourth.file]);
        assert!(fx.decoys_intact());
    }

    #[test]
    fn a_manual_backup_is_pinned_and_leaves_the_schedule_alone() {
        let fx = Fixture::new();
        let p = Policy::default();
        let (pinned, pruned) = fx.created(fx.backup_at(Kind::Manual, T0));
        assert_eq!(pinned.file, file_name_for(Kind::Manual, T0));
        assert_eq!(pinned.kind, "manual");
        assert!(pruned.is_empty());
        assert!(fx.created_answer_says_pinned(&pinned));

        // It does not count as the scheduled backup: one is still due...
        assert!(fx.scheduled().is_empty());
        let st = status(&fx.root);
        assert_eq!(st.newest, None);
        assert_eq!((st.kept, st.pinned, st.pinned_bytes), (0, 1, pinned.size));
        assert_eq!(st.health(T0), Health::Bad);
        assert!(st.label(T0).contains("1 pinned"), "{}", st.label(T0));
        fx.created(scheduled_at(&fx.cfg, &p, true, "cycle", T0 + 60));

        // ...and no amount of rotation, at any `keep`, ever removes it.
        for i in 1..=4 {
            fx.created(fx.backup_at(SCHEDULED, T0 + i * 12 * H));
        }
        let one = Policy { keep: 1, ..Policy::default() };
        fx.created(run_backup_at(&fx.cfg, &one, true, SCHEDULED, "test", T0 + 60 * H));
        assert_eq!(fx.scheduled().len(), 1);
        let pinned_path = fx.backups().join(&pinned.file);
        assert_eq!(sha256_file(&pinned_path).unwrap(), pinned.sha256);

        // A second pinned backup, taken between scheduled ones, prunes nothing.
        let (second, pruned) = fx.created(fx.backup_at(Kind::Manual, T0 + 61 * H));
        assert!(pruned.is_empty());
        assert_eq!(fx.scheduled().len(), 1);
        let manifest = read_manifest(&fx.backups()).unwrap();
        let kinds: Vec<&str> = manifest.backups.iter().map(|e| e.kind.as_str()).collect();
        assert_eq!(kinds, vec!["manual", "scheduled", "manual"]); // newest first
        assert_eq!(manifest.backups[2], pinned);
        let st = status(&fx.root);
        assert_eq!((st.kept, st.pinned, st.pinned_bytes), (1, 2, pinned.size + second.size));
        assert!(fx.decoys_intact());
    }

    impl Fixture {
        fn created_answer_says_pinned(&self, entry: &Entry) -> bool {
            Outcome::Created { entry: entry.clone(), pruned: Vec::new() }.answer().contains("pinned")
        }
    }

    #[test]
    fn an_invalid_policy_file_backs_up_but_never_prunes() {
        let fx = Fixture::new();
        fs::write(fx.root.join(POLICY_FILE), "keep=lots\n").unwrap();
        let (policy, error) = effective_policy(&fx.root);
        assert_eq!(policy, Policy::default());
        assert!(error.is_some());
        for i in 0..3 {
            fx.created(run_backup_at(&fx.cfg, &policy, error.is_none(), SCHEDULED, "test", T0 + i * 12 * H));
        }
        assert_eq!(fx.scheduled().len(), 3);
        assert_eq!(status(&fx.root).health(T0 + 24 * H), Health::Bad);
    }

    #[test]
    fn a_failed_backup_leaves_no_partial_and_keeps_the_old_ones() {
        let fx = Fixture::new();
        let (good, _) = fx.created(fx.backup_at(SCHEDULED, T0));

        // A zero time limit trips on the first chunk written.
        let rushed = Policy { max_duration: Duration::ZERO, ..Policy::default() };
        let outcome = run_backup_at(&fx.cfg, &rushed, true, SCHEDULED, "test", T0 + 12 * H);
        assert!(outcome.is_failure(), "{outcome:?}");
        assert!(outcome.answer().starts_with("FAILED: "));

        assert_eq!(fx.scheduled(), vec![good.file.clone()]);
        let leftovers: Vec<_> = fs::read_dir(fx.backups())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(PARTIAL_PREFIX) && n != ".partial-someone-elses.zip")
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");

        let manifest = read_manifest(&fx.backups()).unwrap();
        assert_eq!(manifest.backups, vec![good.clone()]);
        assert!(!manifest.last_attempt.unwrap().ok);
        let st = status(&fx.root);
        assert_eq!(st.health(T0 + 12 * H), Health::Bad);
        assert!(st.label(T0 + 12 * H).starts_with("FAILED"));
        assert!(fx.decoys_intact());

        // The next good one clears the failure.
        fx.created(fx.backup_at(SCHEDULED, T0 + 13 * H));
        assert_eq!(status(&fx.root).health(T0 + 13 * H), Health::Good);
    }

    #[test]
    fn verification_catches_a_damaged_zip() {
        let fx = Fixture::new();
        let far = Instant::now() + Duration::from_secs(600);
        let walk = walk_world(&fx.cfg.world_dir(), "testworld").unwrap();
        let good = fx.root.join("good.zip");
        write_zip(&walk, &good, far).unwrap();
        verify_zip(&good, &walk, far).unwrap();

        // One flipped byte inside the stored region data: only the CRC can tell.
        let mut bytes = fs::read(&good).unwrap();
        let needle = noise(300_000, 7);
        let at = bytes.windows(64).position(|w| w == &needle[1000..1064]).expect("stored region bytes");
        bytes[at + 10] ^= 0xFF;
        let flipped = fx.root.join("flipped.zip");
        fs::write(&flipped, &bytes).unwrap();
        let err = verify_zip(&flipped, &walk, far).unwrap_err();
        assert!(format!("{err:#}").contains("r.0.0.mca"), "{err:#}");

        // Cut short: the index at the end is gone.
        let cut = fx.root.join("cut.zip");
        fs::write(&cut, &fs::read(&good).unwrap()[..200_000]).unwrap();
        assert!(verify_zip(&cut, &walk, far).is_err());

        // A world file the zip doesn't have.
        fs::write(fx.cfg.world_dir().join("data").join("late.dat"), b"x").unwrap();
        let bigger = walk_world(&fx.cfg.world_dir(), "testworld").unwrap();
        assert!(verify_zip(&good, &bigger, far).is_err());
    }

    #[test]
    fn leftover_partials_are_swept_and_stray_zips_wait_their_turn() {
        let fx = Fixture::new();
        let b = fx.backups();
        fs::write(b.join(".partial-world-20261001-0100.zip"), b"cut short").unwrap();
        fs::write(b.join(".partial-manual-20261001-0100.zip"), b"cut short").unwrap();
        // A scheduled-looking zip the manifest has never heard of, newer than T0.
        let stray = file_name_for(SCHEDULED, T0 + 6 * H);
        fs::write(b.join(&stray), b"unverified").unwrap();

        let (first, _) = fx.created(fx.backup_at(SCHEDULED, T0));
        assert!(!b.join(".partial-world-20261001-0100.zip").exists());
        assert!(!b.join(".partial-manual-20261001-0100.zip").exists());
        // Unverified: not in the manifest, not the "newest backup", not deleted yet.
        assert_eq!(read_manifest(&b).unwrap().backups.len(), 1);
        assert_eq!(status(&fx.root).newest, Some((first.file, T0)));
        assert!(b.join(&stray).exists());

        // A listed zip that vanished is unlisted, not resurrected.
        fx.created(fx.backup_at(SCHEDULED, T0 + 12 * H));
        fs::remove_file(b.join(file_name_for(SCHEDULED, T0))).unwrap();
        let manifest = {
            let mut m = read_manifest(&b).unwrap();
            assert_eq!(reconcile(&mut m, &b), vec![file_name_for(SCHEDULED, T0)]);
            m
        };
        assert_eq!(manifest.backups.len(), 1);
        assert!(fx.decoys_intact());
    }

    #[test]
    fn a_world_that_does_not_exist_yet_is_not_a_failure() {
        let fx = Fixture::new();
        fs::remove_file(fx.cfg.world_dir().join("level.dat")).unwrap();
        let outcome = fx.backup_at(SCHEDULED, T0);
        assert!(matches!(outcome, Outcome::Skipped(_)), "{outcome:?}");
        assert!(fx.scheduled().is_empty());
        assert!(!fx.backups().join(MANIFEST_FILE).exists());
    }

    #[test]
    fn a_second_backup_in_the_same_minute_never_overwrites_the_first() {
        let fx = Fixture::new();
        let (first, _) = fx.created(fx.backup_at(SCHEDULED, T0));
        let outcome = fx.backup_at(SCHEDULED, T0 + 20);
        assert!(outcome.is_failure(), "{outcome:?}");
        assert!(outcome.answer().contains("already exists"), "{}", outcome.answer());
        assert_eq!(fx.scheduled(), vec![first.file.clone()]);
        assert_eq!(sha256_file(&fx.backups().join(&first.file)).unwrap(), first.sha256);
        // The other kind has its own name, so the same minute is no clash.
        fx.created(fx.backup_at(Kind::Manual, T0 + 40));
    }

    #[test]
    fn a_queued_request_is_taken_in_the_stopped_window() {
        let fx = Fixture::new();
        // A verified scheduled backup from two hours ago: nothing is due.
        fx.created(fx.backup_at(SCHEDULED, unix_now() - 2 * H));
        stopped_window(&fx.cfg);
        assert_eq!(fx.scheduled().len(), 1);
        let log = fs::read_to_string(fx.root.join("logs").join(LOG_FILE)).unwrap();
        assert!(log.contains("not due"), "{log}");

        // A request gets its pinned backup whatever the schedule says, and an answer.
        write_request(&fx.root, "pre update").unwrap();
        stopped_window(&fx.cfg);
        assert!(!fx.root.join(REQUEST_FILE).exists());
        let answer = fs::read_to_string(fx.root.join(RESULT_FILE)).unwrap();
        assert!(answer.contains(" done: manual-") && answer.contains("pinned"), "{answer}");
        assert_eq!(scan(&fx.backups(), Kind::Manual).len(), 2); // + the 2025 decoy
        assert_eq!(fx.scheduled().len(), 1);
        let log = fs::read_to_string(fx.root.join("logs").join(LOG_FILE)).unwrap();
        assert!(log.contains("request 'pre-update'"), "{log}");

        // A request too old to be meant is dropped; the schedule still gets its say.
        fs::write(fx.root.join(REQUEST_FILE), format!("{} stale\n", unix_now() - 2 * 24 * H)).unwrap();
        stopped_window(&fx.cfg);
        assert!(!fx.root.join(REQUEST_FILE).exists());
        assert!(fs::read_to_string(fx.root.join(RESULT_FILE)).unwrap().contains("rejected: stale request"));
        assert_eq!(fx.scheduled().len(), 1);
        assert!(fx.decoys_intact());
    }

    #[test]
    fn a_request_with_the_server_down_is_run_by_the_watcher() {
        let fx = Fixture::new();
        poll_request(&fx.cfg); // no request file: nothing happens
        assert!(!fx.root.join(RESULT_FILE).exists());

        write_request(&fx.root, "before-update").unwrap();
        poll_request(&fx.cfg);
        assert!(!fx.root.join(REQUEST_FILE).exists());
        let answer = fs::read_to_string(fx.root.join(RESULT_FILE)).unwrap();
        assert!(answer.contains(" done: manual-") && answer.contains("pinned"), "{answer}");
        // The watcher only ever takes the pinned backup; the schedule is serve()'s.
        assert!(fx.scheduled().is_empty());
        assert_eq!(status(&fx.root).pinned, 1);

        // Garbage is answered and removed, not retried every ten seconds.
        fs::write(fx.root.join(REQUEST_FILE), "now please").unwrap();
        poll_request(&fx.cfg);
        assert!(!fx.root.join(REQUEST_FILE).exists());
        assert!(fs::read_to_string(fx.root.join(RESULT_FILE)).unwrap().contains("rejected: no timestamp"));
        assert!(fx.decoys_intact());
    }

    #[cfg(windows)]
    #[test]
    fn a_world_held_open_by_a_server_is_not_backed_up() {
        let fx = Fixture::new();
        let lock_path = fx.cfg.world_dir().join("session.lock");
        assert!(!world_open_elsewhere(&fx.cfg.world_dir()));
        {
            // What the JVM does: keep session.lock open, sharing everything.
            let _held = fs::OpenOptions::new().write(true).open(&lock_path).unwrap();
            assert!(world_open_elsewhere(&fx.cfg.world_dir()));
            let outcome = fx.backup_at(SCHEDULED, T0);
            assert!(outcome.is_failure(), "{outcome:?}");
            assert!(outcome.answer().contains("open in another process"), "{}", outcome.answer());
            assert!(fx.scheduled().is_empty());
        }
        assert!(!world_open_elsewhere(&fx.cfg.world_dir()));
        fx.created(fx.backup_at(SCHEDULED, T0));
    }

    #[cfg(windows)]
    #[test]
    fn free_space_is_readable() {
        let free = free_space(&std::env::temp_dir()).expect("GetDiskFreeSpaceExW on the temp dir");
        assert!(free > 0);
    }
}
