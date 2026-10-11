//! The server's logs, mirrored to the repo -- never between a stop and a start.
//!
//! Until 2026-10-11 `serve()` pushed the logs inline after the JVM exited, with
//! git, from a clone under `%LOCALAPPDATA%\icraft-launcher\push`. Every restart
//! therefore waited for a fetch, a `reset --hard` and a push, and on 10-11 one
//! of them waited 39 minutes (a stalled `git repack`; see `subprocess.rs`).
//!
//! Now the work is split in two:
//!
//!   1. **At exit: stage.** [`stage`] copies `logs/` and `crash-reports/` into
//!      `<server>/TesterLogs/Server Logs/` -- local files, changed ones only,
//!      no network and no child process. This is all the restart path does.
//!   2. **Later, on a thread of its own: push.** [`defer`] hands the staged
//!      files to a background worker, which waits until the server is back up
//!      (or until [`release`] says no restart is coming, or [`MAX_DEFER`]) and
//!      then commits them through the GitHub API. No git, no clone, no
//!      console: blobs for the files that differ from the repo, one tree, one
//!      commit, and a fast-forward of the branch that is retried on the new
//!      tip when someone else pushed meanwhile. Bounded by
//!      [`PUSH_DEADLINE`]; a failure is logged, shown on the Logs badge, and
//!      left for the next exit.
//!
//! A marker file ([`PENDING_MARKER`]) outlives the launcher, so staged logs
//! still go out when a Cycle replaces the launcher binary before the push ran.

use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, Local};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::config::{ServerConfig, GITHUB_REPO_BRANCH, GITHUB_REPO_NAME, GITHUB_REPO_OWNER};
use crate::github::GitData;
use crate::run::{server_state, ServerState};

/// Where the mirror lives in the repo.
pub const REPO_LOG_DIR: &str = ".minecraft/server_distribution/TesterLogs/Server Logs";
/// Present in the server folder from the moment logs are staged until a push
/// attempt has finished.
pub const PENDING_MARKER: &str = ".icraft_log_push_pending";
/// Limit for one whole push. Past it the push is abandoned until the next exit.
pub const PUSH_DEADLINE: Duration = crate::subprocess::STEP_LIMIT;
/// A deferred push goes ahead after this long even if the server never came
/// back up (a crash loop must not hold crash reports back for good).
pub const MAX_DEFER: Duration = Duration::from_secs(10 * 60);
/// GitHub refuses blobs of 100 MB; a log that big is not worth the memory.
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
/// How often the push is rebuilt on a branch that moved under it.
const FAST_FORWARD_ATTEMPTS: usize = 5;

fn stage_dir(cfg: &ServerConfig) -> PathBuf {
    cfg.server_dir.join("TesterLogs").join("Server Logs")
}

/// `2026-10-11 12:16:47`, in this machine's own zone: the pending marker and
/// the launcher's status file.
pub fn local_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn write_marker(cfg: &ServerConfig) -> std::io::Result<()> {
    fs::write(cfg.server_dir.join(PENDING_MARKER), format!("{}\n", local_timestamp()))
}

/// `ICRAFT_LOG_PUSH_BRANCH` sends the mirror to another branch (testing).
fn target_branch() -> String {
    std::env::var("ICRAFT_LOG_PUSH_BRANCH")
        .ok()
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| GITHUB_REPO_BRANCH.to_string())
}

// =============================================================================
// Stage: local copies only
// =============================================================================

/// What [`stage`] did.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Staged {
    pub copied: usize,
    pub unchanged: usize,
    pub failed: usize,
}

/// Copy `logs/` and `crash-reports/` into the staging folder: files that are
/// new or changed, never a heap dump. Local and quick; safe on the restart
/// path. Never fails the caller.
pub fn stage(cfg: &ServerConfig) -> Staged {
    let started = Instant::now();
    let to = stage_dir(cfg);
    let mut staged = Staged::default();
    for from in [cfg.logs_dir(), cfg.crash_reports()] {
        if from.is_dir() {
            mirror_dir(&from, &to, &mut staged);
        }
    }
    log::info!(
        "[logs] staged for the next push: {} file(s) copied, {} unchanged{} ({} ms)",
        staged.copied,
        staged.unchanged,
        if staged.failed > 0 { format!(", {} FAILED", staged.failed) } else { String::new() },
        started.elapsed().as_millis()
    );
    staged
}

/// Heap dumps (`crash-reports/heapdumps/`, any `*.hprof`) are roughly
/// heap-sized. One in the mirror would be refused by GitHub on every push
/// from then on, after minutes spent copying gigabytes. They stay local for
/// the operator to analyse in place.
fn is_heap_dump(path: &Path, is_dir: bool) -> bool {
    if is_dir {
        return path.file_name().map_or(false, |n| n.to_string_lossy().eq_ignore_ascii_case("heapdumps"));
    }
    path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("hprof"))
}

fn mirror_dir(src: &Path, dst: &Path, staged: &mut Staged) {
    if let Err(e) = fs::create_dir_all(dst) {
        log::warn!("[logs] cannot create {}: {e}", dst.display());
        staged.failed += 1;
        return;
    }
    let entries = match fs::read_dir(src) {
        Ok(entries) => entries,
        Err(e) => {
            log::warn!("[logs] cannot read {}: {e}", src.display());
            staged.failed += 1;
            return;
        }
    };
    for entry in entries.flatten() {
        let from = entry.path();
        let Ok(kind) = entry.file_type() else {
            staged.failed += 1;
            continue;
        };
        if is_heap_dump(&from, kind.is_dir()) {
            continue;
        }
        let to = dst.join(entry.file_name());
        if kind.is_dir() {
            mirror_dir(&from, &to, staged);
        } else if kind.is_file() {
            match copy_if_changed(&from, &to) {
                Ok(true) => staged.copied += 1,
                Ok(false) => staged.unchanged += 1,
                Err(e) => {
                    log::warn!("[logs] cannot stage {}: {e}", from.display());
                    staged.failed += 1;
                }
            }
        }
    }
}

/// Copy unless the staged copy already has the same length and is not older.
/// (Most of `logs/` is rotated `.gz` files that never change again.)
fn copy_if_changed(from: &Path, to: &Path) -> std::io::Result<bool> {
    let src = fs::metadata(from)?;
    if let Ok(dst) = fs::metadata(to) {
        let not_older = matches!((dst.modified(), src.modified()), (Ok(d), Ok(s)) if d >= s);
        if dst.len() == src.len() && not_older {
            return Ok(false);
        }
    }
    fs::copy(from, to)?;
    Ok(true)
}

// =============================================================================
// Push: the staged files against the repo, through the GitHub API
// =============================================================================

/// How a push ended when it did not fail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// Every staged file is already in the repo.
    UpToDate { files: usize },
    Pushed { files: usize, commit: String, too_big: usize },
}

struct LocalFile {
    /// Path below the staging folder, with forward slashes.
    rel: String,
    path: PathBuf,
    size: u64,
}

fn scan(root: &Path) -> Vec<LocalFile> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<LocalFile>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else { continue };
            if is_heap_dump(&path, kind.is_dir()) {
                continue;
            }
            if kind.is_dir() {
                walk(root, &path, out);
            } else if kind.is_file() {
                let Ok(rel) = path.strip_prefix(root) else { continue };
                let rel = rel.to_string_lossy().replace('\\', "/");
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(LocalFile { rel, path, size });
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out
}

/// Blob ids of what the repo holds under [`REPO_LOG_DIR`] at tree `root_tree`,
/// keyed like [`LocalFile::rel`]. Empty when the folder does not exist yet.
fn remote_listing(api: &GitData, root_tree: &str) -> Result<HashMap<String, String>> {
    let mut tree = root_tree.to_string();
    for part in REPO_LOG_DIR.split('/') {
        let entries = api.tree(&tree, false)?;
        match entries.into_iter().find(|e| e.kind == "tree" && e.path == part) {
            Some(entry) => tree = entry.sha,
            None => return Ok(HashMap::new()),
        }
    }
    Ok(api.tree(&tree, true)?.into_iter().filter(|e| e.kind == "blob").map(|e| (e.path, e.sha)).collect())
}

// -----------------------------------------------------------------------------
// Line endings: store what `git add` would store
// -----------------------------------------------------------------------------
//
// The repo's `.gitattributes` normalises text to LF (`* text=auto eol=lf`,
// `*.txt text`, `*.gz binary`, ...). The git-based push got that for free;
// the API takes bytes as they are. Uploading a Windows log raw would put CRLF
// into the repo: every old crash report would be re-uploaded once for nothing
// but its line endings (46 files in the first trial), and from then on every
// clone would show those files as modified. So the same rules are applied
// here before a file is hashed or uploaded. The two extension lists mirror
// `.gitattributes`; a unit test reads that file and fails when they drift.

/// How git stores a file of a given name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Eol {
    /// `text`: every CRLF becomes LF.
    Text,
    /// `binary`: stored byte for byte.
    Binary,
    /// `text=auto`: CRLF becomes LF when the content looks like text.
    Auto,
}

const TEXT_EXTENSIONS: &[&str] = &[
    "bat", "cmd", "ps1", "psm1", "psd1", "sh", "js", "json", "toml", "yml", "yaml", "md", "txt", "lang", "mcmeta",
    "snbt", "java", "kt", "kts", "gradle", "properties",
];
const BINARY_EXTENSIONS: &[&str] = &[
    "jar", "zip", "gz", "tar", "png", "jpg", "jpeg", "gif", "webp", "ico", "ogg", "wav", "mp3", "mp4", "webm", "dat",
    "nbt", "mca", "mcstructure", "schem", "schematic", "psd", "blend", "pdf",
];

fn eol_rule(rel: &str) -> Eol {
    let name = rel.rsplit('/').next().unwrap_or(rel);
    if name == "gradlew" {
        return Eol::Text;
    }
    let Some((_, ext)) = name.rsplit_once('.') else { return Eol::Auto };
    let ext = ext.to_ascii_lowercase();
    if TEXT_EXTENSIONS.contains(&ext.as_str()) {
        Eol::Text
    } else if BINARY_EXTENSIONS.contains(&ext.as_str()) {
        Eol::Binary
    } else {
        Eol::Auto
    }
}

/// git's own test for `text=auto` (convert.c, `gather_stats` +
/// `convert_is_binary`): no NUL byte, no CR without an LF, and control
/// characters make up less than 1 byte in 128.
fn looks_like_text(content: &[u8]) -> bool {
    let (mut printable, mut nonprintable) = (0u64, 0u64);
    let mut i = 0;
    while i < content.len() {
        match content[i] {
            b'\r' => {
                if content.get(i + 1) != Some(&b'\n') {
                    return false;
                }
                i += 1;
            }
            b'\n' => {}
            0 => return false,
            // BS, HT, FF and ESC count as text; DEL and the other controls do not.
            8 | 9 | 12 | 27 => printable += 1,
            127 => nonprintable += 1,
            c if c < 32 => nonprintable += 1,
            _ => printable += 1,
        }
        i += 1;
    }
    // A trailing end-of-file mark is not held against the file.
    if content.last() == Some(&0x1a) {
        nonprintable = nonprintable.saturating_sub(1);
    }
    (printable >> 7) >= nonprintable
}

/// The bytes git would store for staged file `rel`.
fn as_stored(rel: &str, content: Vec<u8>) -> Vec<u8> {
    let convert = match eol_rule(rel) {
        Eol::Binary => false,
        Eol::Text => true,
        Eol::Auto => looks_like_text(&content),
    };
    if !convert || !content.windows(2).any(|pair| pair == b"\r\n") {
        return content;
    }
    let mut out = Vec::with_capacity(content.len());
    let mut i = 0;
    while i < content.len() {
        if content[i] == b'\r' && content.get(i + 1) == Some(&b'\n') {
            i += 1;
            continue;
        }
        out.push(content[i]);
        i += 1;
    }
    out
}

fn past(deadline: Instant) -> Result<()> {
    if Instant::now() >= deadline {
        bail!("not finished within {}s -- abandoned until the next server exit", PUSH_DEADLINE.as_secs());
    }
    Ok(())
}

/// Bring `branch` up to date with the files under `staged`. Only files whose
/// content differs from the repo are uploaded; nothing is ever removed there.
fn push_with(api: &GitData, branch: &str, staged: &Path, deadline: Instant) -> Result<Outcome> {
    let local = scan(staged);
    if local.is_empty() {
        return Ok(Outcome::UpToDate { files: 0 });
    }
    let (mut head, mut root_tree) = api.branch_head(branch)?;
    let remote = remote_listing(api, &root_tree)?;

    let mut changed: Vec<(String, String)> = Vec::new();
    let mut too_big = 0usize;
    for file in &local {
        past(deadline)?;
        if file.size > MAX_FILE_BYTES {
            log::warn!("[logs] {} is {} MB -- over the {} MB limit, not pushed", file.rel, file.size / 1_048_576, MAX_FILE_BYTES / 1_048_576);
            too_big += 1;
            continue;
        }
        let content = match fs::read(&file.path) {
            Ok(content) => content,
            Err(e) => {
                log::warn!("[logs] cannot read {}: {e} -- left for the next push", file.path.display());
                continue;
            }
        };
        let content = as_stored(&file.rel, content);
        if remote.get(&file.rel) == Some(&git_blob_id(&content)) {
            continue;
        }
        let blob = api.create_blob(&content)?;
        changed.push((format!("{REPO_LOG_DIR}/{}", file.rel), blob));
    }
    if changed.is_empty() {
        return Ok(Outcome::UpToDate { files: local.len() });
    }

    let message = format!("server logs auto-mirror {}", Local::now().format("%Y-%m-%d %H:%M"));
    for attempt in 1..=FAST_FORWARD_ATTEMPTS {
        past(deadline)?;
        let tree = api.create_tree(&root_tree, &changed)?;
        let commit = api.create_commit(&message, &tree, &head)?;
        if api.fast_forward(branch, &commit)? {
            return Ok(Outcome::Pushed { files: changed.len(), commit, too_big });
        }
        log::info!("[logs] {branch} moved while the push was being built (attempt {attempt}) -- rebuilding on the new tip");
        (head, root_tree) = api.branch_head(branch)?;
    }
    bail!("{branch} kept moving: gave up after {FAST_FORWARD_ATTEMPTS} attempts")
}

fn push(cfg: &ServerConfig) -> Result<Outcome> {
    let token = crate::crash::read_pat(cfg).ok_or_else(|| {
        anyhow!("no GitHub token saved (GitHub auth section) -- the logs stay staged in {}", stage_dir(cfg).display())
    })?;
    let deadline = Instant::now() + PUSH_DEADLINE;
    let api = GitData::new(GITHUB_REPO_OWNER, GITHUB_REPO_NAME, &token).deadline(deadline);
    push_with(&api, &target_branch(), &stage_dir(cfg), deadline)
}

// =============================================================================
// State: what the Logs badge and the status file show
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PushState {
    /// Nothing staged since this launcher started.
    Idle,
    /// Staged; the push starts when the server is back up.
    Waiting { since: Instant },
    Pushing { since: Instant },
    UpToDate { at: DateTime<Local> },
    Pushed { at: DateTime<Local>, files: usize, commit: String, took: Duration },
    Failed { at: DateTime<Local>, why: String },
}

/// Badge colour.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Health {
    Good,
    Busy,
    Bad,
}

impl PushState {
    pub fn health(&self) -> Health {
        match self {
            PushState::Idle | PushState::UpToDate { .. } | PushState::Pushed { .. } => Health::Good,
            PushState::Waiting { .. } | PushState::Pushing { .. } => Health::Busy,
            PushState::Failed { .. } => Health::Bad,
        }
    }

    pub fn label(&self) -> String {
        match self {
            PushState::Idle => "nothing to push".to_string(),
            PushState::Waiting { since } => {
                format!("staged {}s ago; pushing once the server is back up", since.elapsed().as_secs())
            }
            PushState::Pushing { since } => format!("pushing logs... ({}s)", since.elapsed().as_secs()),
            PushState::UpToDate { at } => format!("up to date {}", at.format("%H:%M")),
            PushState::Pushed { at, files, commit, took } => format!(
                "pushed {} ({files} file(s), {}, {:.1}s)",
                at.format("%H:%M"),
                &commit[..commit.len().min(7)],
                took.as_secs_f32()
            ),
            PushState::Failed { at, why } => format!("FAILED {}: {why}", at.format("%H:%M")),
        }
    }
}

struct Control {
    state: PushState,
    /// Logs were staged and no push has taken them yet.
    requested: bool,
    /// No restart is coming: push without waiting for the server.
    released: bool,
    worker_running: bool,
}

static CONTROL: Mutex<Control> =
    Mutex::new(Control { state: PushState::Idle, requested: false, released: false, worker_running: false });

pub fn state() -> PushState {
    CONTROL.lock().unwrap().state.clone()
}

/// A push is waiting for the server or under way.
pub fn in_progress() -> bool {
    matches!(state(), PushState::Waiting { .. } | PushState::Pushing { .. })
}

fn set_state(state: PushState) {
    CONTROL.lock().unwrap().state = state;
}

// =============================================================================
// Entry points
// =============================================================================

/// The JVM-exit hook of a supervised run: stage now, push later. Returns as
/// soon as the local copies are done.
pub fn stage_and_defer(cfg: &ServerConfig) {
    stage(cfg);
    defer(cfg);
}

/// Hand what is staged to the background worker. It pushes once the server is
/// `Started` again, when [`release`] is called, or after [`MAX_DEFER`].
pub fn defer(cfg: &ServerConfig) {
    if let Err(e) = write_marker(cfg) {
        log::warn!("[logs] cannot write {PENDING_MARKER}: {e} (the push still runs; it just would not survive a launcher restart)");
    }
    let mut control = CONTROL.lock().unwrap();
    control.requested = true;
    if !control.worker_running {
        control.worker_running = true;
        let cfg = cfg.clone();
        std::thread::spawn(move || worker(cfg));
    }
}

/// No restart is coming (the server was stopped on purpose, a run-only launch
/// ended, the operator clicked "Push crash logs"): a waiting push goes now.
pub fn release() {
    let mut control = CONTROL.lock().unwrap();
    if control.requested || control.worker_running {
        control.released = true;
    }
}

/// On launcher start: logs staged by a previous instance that never got
/// pushed (it was replaced mid-Cycle, or closed) are picked up again.
pub fn resume_pending(cfg: &ServerConfig) {
    if cfg.server_dir.join(PENDING_MARKER).is_file() {
        log::info!("[logs] logs staged before this launcher started are still unpushed -- queued");
        defer(cfg);
    }
}

/// Stage and push on the calling thread, bounded by [`PUSH_DEADLINE`]. For the
/// CLI, whose process ends when its command does. `Err` = the push failed.
pub fn push_now(cfg: &ServerConfig) -> Result<Outcome> {
    stage(cfg);
    let _ = write_marker(cfg);
    run_push(cfg)
}

fn worker(cfg: ServerConfig) {
    loop {
        {
            let mut control = CONTROL.lock().unwrap();
            if !control.requested {
                control.worker_running = false;
                control.released = false;
                return;
            }
            control.requested = false;
        }
        let waiting = Instant::now();
        set_state(PushState::Waiting { since: waiting });
        let why = loop {
            if CONTROL.lock().unwrap().released {
                break "no restart pending";
            }
            if server_state() == ServerState::Started {
                break "the server is up";
            }
            if waiting.elapsed() >= MAX_DEFER {
                break "the server did not come back up in time";
            }
            std::thread::sleep(Duration::from_millis(500));
        };
        CONTROL.lock().unwrap().released = false;
        log::info!("[logs] pushing logs now ({why}; staged {}s ago)", waiting.elapsed().as_secs());
        let _ = run_push(&cfg);
    }
}

/// One bounded attempt, with the state, the log lines and the marker kept in
/// step. A failure is not retried here: the next exit stages and tries again.
fn run_push(cfg: &ServerConfig) -> Result<Outcome> {
    let started = Instant::now();
    set_state(PushState::Pushing { since: started });
    let result = push(cfg);
    let at = Local::now();
    match &result {
        Ok(Outcome::UpToDate { files }) => {
            log::info!("[logs] nothing new to push ({files} staged file(s) already in the repo, {:.1}s)", started.elapsed().as_secs_f32());
            set_state(PushState::UpToDate { at });
        }
        Ok(Outcome::Pushed { files, commit, too_big }) => {
            log::info!(
                "[logs] pushed {files} file(s) as {} in {:.1}s{}",
                &commit[..commit.len().min(7)],
                started.elapsed().as_secs_f32(),
                if *too_big > 0 { format!(" ({too_big} too big, skipped)") } else { String::new() }
            );
            set_state(PushState::Pushed { at, files: *files, commit: commit.clone(), took: started.elapsed() });
        }
        Err(e) => {
            log::error!(
                "[logs] log push FAILED after {:.1}s: {e:#}. The server is not affected; the logs stay staged and the next server exit tries again.",
                started.elapsed().as_secs_f32()
            );
            set_state(PushState::Failed { at, why: format!("{e:#}") });
        }
    }
    let _ = fs::remove_file(cfg.server_dir.join(PENDING_MARKER));
    if result.is_ok() {
        retire_push_clone();
    }
    result
}

// =============================================================================
// The retired git push clone
// =============================================================================

/// `%LOCALAPPDATA%\icraft-launcher\push` (`~/.cache/icraft-launcher/push`):
/// the sparse clone the log push used until 2026-10-11.
fn legacy_push_clone() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        PathBuf::from(std::env::var_os("LOCALAPPDATA")?)
    } else {
        PathBuf::from(std::env::var_os("HOME")?).join(".cache")
    };
    Some(base.join("icraft-launcher").join("push"))
}

/// Remove that clone once a push has gone through without it. Nothing in it
/// is unpushed work: it was reset to the remote before every use, and what it
/// would have pushed is the staging folder, which has just been pushed (or
/// found identical to the repo). On the server box it had grown 310 `.idx`
/// files for 17 packs, because pack deletes kept failing there.
fn retire_push_clone() {
    let Some(dir) = legacy_push_clone() else { return };
    if !dir.join(".git").is_dir() {
        return;
    }
    let (removed, left) = remove_tree(&dir);
    if left == 0 {
        log::info!("[logs] removed the retired git push clone {} ({removed} entries); logs go through the GitHub API now", dir.display());
    } else {
        log::warn!(
            "[logs] the retired git push clone {} is only partly removed ({removed} entries gone, {left} still in use); it is unused, and the next push tries again",
            dir.display()
        );
    }
}

/// Delete a directory tree, read-only files included (git marks its pack files
/// read-only). Links are removed, never followed. Returns (removed, left).
fn remove_tree(dir: &Path) -> (usize, usize) {
    let (mut removed, mut left) = (0usize, 0usize);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else {
                left += 1;
                continue;
            };
            if meta.is_dir() && !meta.file_type().is_symlink() {
                let (r, l) = remove_tree(&path);
                removed += r;
                left += l;
                continue;
            }
            let mut permissions = meta.permissions();
            if permissions.readonly() {
                #[allow(clippy::permissions_set_readonly_false)]
                permissions.set_readonly(false);
                let _ = fs::set_permissions(&path, permissions);
            }
            match fs::remove_file(&path).or_else(|_| fs::remove_dir(&path)) {
                Ok(()) => removed += 1,
                Err(_) => left += 1,
            }
        }
    }
    match fs::remove_dir(dir) {
        Ok(()) => removed += 1,
        Err(_) => left += 1,
    }
    (removed, left)
}

// =============================================================================
// git blob ids (SHA-1), to tell which staged files the repo already has
// =============================================================================

/// The id git gives a file: SHA-1 over `blob <length>\0` and the content.
fn git_blob_id(content: &[u8]) -> String {
    let mut sha = Sha1::new();
    sha.update(format!("blob {}\0", content.len()).as_bytes());
    sha.update(content);
    sha.finish().iter().map(|byte| format!("{byte:02x}")).collect()
}

/// SHA-1 (FIPS 180-4). Used only to compare with ids GitHub reports, never
/// for anything security-relevant; small enough not to be worth a crate.
struct Sha1 {
    state: [u32; 5],
    block: [u8; 64],
    filled: usize,
    length: u64,
}

impl Sha1 {
    fn new() -> Self {
        Sha1 { state: [0x6745_2301, 0xEFCD_AB89, 0x98BA_DCFE, 0x1032_5476, 0xC3D2_E1F0], block: [0; 64], filled: 0, length: 0 }
    }

    fn update(&mut self, mut data: &[u8]) {
        self.length = self.length.wrapping_add(data.len() as u64);
        if self.filled > 0 {
            let take = (64 - self.filled).min(data.len());
            self.block[self.filled..self.filled + take].copy_from_slice(&data[..take]);
            self.filled += take;
            data = &data[take..];
            if self.filled < 64 {
                return;
            }
            let block = self.block;
            self.compress(&block);
            self.filled = 0;
        }
        while data.len() >= 64 {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[..64]);
            self.compress(&block);
            data = &data[64..];
        }
        self.block[..data.len()].copy_from_slice(data);
        self.filled = data.len();
    }

    fn finish(mut self) -> [u8; 20] {
        let bits = self.length.wrapping_mul(8);
        // 0x80, zeros up to 56 mod 64, then the length in bits.
        let used = (self.filled + 1) % 64;
        let zeros = if used <= 56 { 56 - used } else { 120 - used };
        let mut padding = vec![0u8; 1 + zeros];
        padding[0] = 0x80;
        padding.extend_from_slice(&bits.to_be_bytes());
        self.update(&padding);
        let mut digest = [0u8; 20];
        for (i, word) in self.state.iter().enumerate() {
            digest[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
        }
        digest
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }
        let [mut a, mut b, mut c, mut d, mut e] = self.state;
        for (i, word) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A82_7999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
                _ => (b ^ c ^ d, 0xCA62_C1D6),
            };
            let next = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(*word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = next;
        }
        for (slot, value) in self.state.iter_mut().zip([a, b, c, d, e]) {
            *slot = slot.wrapping_add(value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::Arc;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("icraft-logpush-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sha1_hex(data: &[u8]) -> String {
        let mut sha = Sha1::new();
        sha.update(data);
        sha.finish().iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn sha1_matches_reference_digests_across_the_padding_boundaries() {
        // Digests from .NET's SHA1 for 'a' repeated n times.
        for (n, expected) in [
            (0usize, "da39a3ee5e6b4b0d3255bfef95601890afd80709"),
            (1, "86f7e437faa5a7fce15d1ddcb9eaeaea377667b8"),
            (55, "c1c8bbdc22796e28c0e15163d20899b65621d65a"),
            (56, "c2db330f6083854c99d4b5bfb6e8f29f201be699"),
            (63, "03f09f5b158a7a8cdad920bddc29b81c18a551f5"),
            (64, "0098ba824b5c16427bd7a1122a5a442a25ec644d"),
            (65, "11655326c708d70319be2610e8a57d9a5b959d3b"),
            (119, "ee971065aaa017e0632a8ca6c77bb3bf8b1dfc56"),
            (120, "f34c1488385346a55709ba056ddd08280dd4c6d6"),
            (1000, "291e9a6c66994949b57ba5e650361e98fc36b1ba"),
        ] {
            assert_eq!(sha1_hex(&vec![b'a'; n]), expected, "{n} bytes");
        }
        assert_eq!(sha1_hex(b"abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
        // Fed in pieces of awkward sizes, the digest is the same.
        let data = vec![b'a'; 1000];
        let mut sha = Sha1::new();
        for piece in data.chunks(37) {
            sha.update(piece);
        }
        let pieced: String = sha.finish().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(pieced, "291e9a6c66994949b57ba5e650361e98fc36b1ba");
    }

    #[test]
    fn blob_ids_are_the_ones_git_computes() {
        // `git hash-object` of the same bytes.
        assert_eq!(git_blob_id(b""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
        assert_eq!(git_blob_id(b"hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
        assert_eq!(git_blob_id(b"test content\n"), "d670460b4b4aece5915caf5c68d12f560a9fe3e4");
    }

    #[test]
    fn text_is_stored_with_lf_and_binary_as_it_is() {
        // A Windows log: auto-detected as text, CRLF -> LF.
        assert_eq!(as_stored("latest.log", b"one\r\ntwo\r\n".to_vec()), b"one\ntwo\n");
        assert_eq!(as_stored("kubejs/server.log", b"a\r\nb".to_vec()), b"a\nb");
        // Already LF, or no line ends at all: untouched.
        assert_eq!(as_stored("latest.log", b"one\ntwo\n".to_vec()), b"one\ntwo\n");
        assert_eq!(as_stored("latest.log", Vec::new()), b"");
        // UTF-8 beyond ASCII is still text.
        assert_eq!(as_stored("latest.log", "caf\u{e9} \u{2014} ok\r\n".as_bytes().to_vec()), "caf\u{e9} \u{2014} ok\n".as_bytes());
        // Auto: a NUL byte or a CR on its own makes it binary, stored as is.
        assert_eq!(as_stored("odd.log", b"a\r\n\0b\r\n".to_vec()), b"a\r\n\0b\r\n");
        assert_eq!(as_stored("odd.log", b"progress\rdone\r\n".to_vec()), b"progress\rdone\r\n");
        // Auto: too many control characters (more than 1 in 128) is binary.
        assert_eq!(as_stored("odd.log", b"\x01\x02\x03 x\r\n".to_vec()), b"\x01\x02\x03 x\r\n");
        // `*.txt text`: converted whatever the content looks like; a lone CR stays.
        assert_eq!(as_stored("crash-2026-10-11_11.37.00-server.txt", b"a\r\n\0b\rc\r\n".to_vec()), b"a\n\0b\rc\n");
        assert_eq!(as_stored("CRASH.TXT", b"a\r\n".to_vec()), b"a\n");
        // `*.gz binary`: never touched, even if it happened to look like text.
        assert_eq!(as_stored("2026-10-11-1.log.gz", b"a\r\nb\r\n".to_vec()), b"a\r\nb\r\n");
        assert_eq!(eol_rule("debug-1.log.gz"), Eol::Binary);
        assert_eq!(eol_rule("restart_policy.log.1"), Eol::Auto);
        assert_eq!(eol_rule("no-extension"), Eol::Auto);
    }

    /// The tables above are a copy of the repo's `.gitattributes`. This reads
    /// the real file and fails when a rule there is not mirrored here, so the
    /// log mirror can never start storing line endings git would not.
    #[test]
    fn the_line_ending_rules_match_the_repos_gitattributes() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join(".gitattributes");
        let Ok(text) = fs::read_to_string(&path) else {
            eprintln!("no {} (built outside the repo) -- skipped", path.display());
            return;
        };
        let mut rules = 0;
        for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
            let mut words = line.split_whitespace();
            let pattern = words.next().unwrap();
            let attributes: Vec<&str> = words.collect();
            let expected = if attributes.contains(&"binary") || attributes.contains(&"-text") {
                Eol::Binary
            } else if attributes.contains(&"text") {
                Eol::Text
            } else if attributes.contains(&"text=auto") {
                Eol::Auto
            } else {
                continue; // a rule about something other than line endings
            };
            let sample = match pattern {
                "*" => "anything.unlisted".to_string(),
                p if p.starts_with("*.") && !p[2..].contains(['*', '/', '?', '[']) => format!("sample.{}", &p[2..]),
                p if !p.contains(['*', '/', '?', '[']) => p.to_string(),
                p => panic!(".gitattributes pattern '{p}' is of a kind logpush::eol_rule does not know: teach it"),
            };
            assert_eq!(
                eol_rule(&sample),
                expected,
                ".gitattributes says `{line}`; add it to TEXT_EXTENSIONS / BINARY_EXTENSIONS in logpush.rs"
            );
            rules += 1;
        }
        assert!(rules >= 40, "only {rules} line-ending rules read from {}", path.display());
    }

    #[test]
    fn the_mirror_lives_under_the_server_distribution_path() {
        assert!(REPO_LOG_DIR.starts_with(crate::config::REPO_SERVER_PATH));
        assert_eq!(PUSH_DEADLINE, Duration::from_secs(300));
    }

    #[test]
    fn staging_copies_what_changed_and_never_a_heap_dump() {
        let root = scratch("stage");
        let cfg = ServerConfig::from_path(&root);
        fs::create_dir_all(cfg.logs_dir().join("kubejs")).unwrap();
        fs::create_dir_all(cfg.crash_reports().join("heapdumps")).unwrap();
        fs::write(cfg.logs_dir().join("latest.log"), "one").unwrap();
        fs::write(cfg.logs_dir().join("kubejs").join("server.log"), "kube").unwrap();
        fs::write(cfg.logs_dir().join("stray.hprof"), "dump").unwrap();
        fs::write(cfg.crash_reports().join("crash-2026-10-11_11.37.00-server.txt"), "boom").unwrap();
        fs::write(cfg.crash_reports().join("heapdumps").join("heap_1.hprof"), "dump").unwrap();

        assert_eq!(stage(&cfg), Staged { copied: 3, unchanged: 0, failed: 0 });
        let staged = stage_dir(&cfg);
        assert_eq!(fs::read_to_string(staged.join("latest.log")).unwrap(), "one");
        assert_eq!(fs::read_to_string(staged.join("kubejs").join("server.log")).unwrap(), "kube");
        assert!(staged.join("crash-2026-10-11_11.37.00-server.txt").is_file());
        assert!(!staged.join("stray.hprof").exists());
        assert!(!staged.join("heapdumps").exists());

        // Nothing changed: nothing is copied again.
        assert_eq!(stage(&cfg), Staged { copied: 0, unchanged: 3, failed: 0 });
        // One file grew: that one is copied.
        fs::write(cfg.logs_dir().join("latest.log"), "one, and more").unwrap();
        assert_eq!(stage(&cfg), Staged { copied: 1, unchanged: 2, failed: 0 });
        assert_eq!(fs::read_to_string(staged.join("latest.log")).unwrap(), "one, and more");

        let names: Vec<String> = scan(&staged).into_iter().map(|f| f.rel).collect();
        assert_eq!(names, ["crash-2026-10-11_11.37.00-server.txt", "kubejs/server.log", "latest.log"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_read_only_tree_can_be_removed() {
        let root = scratch("retire");
        let pack = root.join("clone").join(".git").join("objects").join("pack");
        fs::create_dir_all(&pack).unwrap();
        let idx = pack.join("pack-1.idx");
        fs::write(&idx, "x").unwrap();
        let mut permissions = fs::metadata(&idx).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&idx, permissions).unwrap();
        fs::write(root.join("clone").join("file.txt"), "y").unwrap();

        let (removed, left) = remove_tree(&root.join("clone"));
        assert_eq!(left, 0);
        assert_eq!(removed, 6, "2 files + pack, objects, .git, clone");
        assert!(!root.join("clone").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_badge_tells_waiting_from_pushing_from_failed() {
        let now = Local::now();
        assert_eq!(PushState::Idle.health(), Health::Good);
        assert_eq!(PushState::Waiting { since: Instant::now() }.health(), Health::Busy);
        let pushing = PushState::Pushing { since: Instant::now() };
        assert_eq!(pushing.health(), Health::Busy);
        assert!(pushing.label().starts_with("pushing logs..."));
        let pushed = PushState::Pushed { at: now, files: 5, commit: "0123456789abcdef".into(), took: Duration::from_millis(2500) };
        assert_eq!(pushed.health(), Health::Good);
        assert!(pushed.label().contains("5 file(s), 0123456, 2.5s"), "{}", pushed.label());
        let failed = PushState::Failed { at: now, why: "HTTP 401: Bad credentials".into() };
        assert_eq!(failed.health(), Health::Bad);
        assert!(failed.label().starts_with("FAILED "));
    }

    // -------------------------------------------------------------------------
    // The whole push against a stand-in for api.github.com
    // -------------------------------------------------------------------------

    #[derive(Debug, Clone)]
    struct Seen {
        method: String,
        path: String,
        body: serde_json::Value,
        auth: Option<String>,
    }

    /// Answers Git Data calls from memory, records every request, and refuses
    /// the first `refusals` branch updates as "not a fast forward" (moving the
    /// branch to `c1`, as a concurrent push would).
    struct FakeGitHub {
        url: String,
        seen: Arc<Mutex<Vec<Seen>>>,
    }

    impl FakeGitHub {
        fn start(remote_files: Vec<(&'static str, &'static str)>, refusals: usize) -> FakeGitHub {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let seen = Arc::new(Mutex::new(Vec::<Seen>::new()));
            let log = Arc::clone(&seen);
            std::thread::spawn(move || {
                let mut head = "c0".to_string();
                let mut refusals_left = refusals;
                let mut made = 0usize;
                for stream in listener.incoming() {
                    let Ok(mut stream) = stream else { continue };
                    let Some(req) = read_request(&mut stream) else { continue };
                    let path = req.path.trim_start_matches("/repos/o/r").to_string();
                    let (code, answer) = match (req.method.as_str(), path.as_str()) {
                        ("GET", "/git/ref/heads/main") => (200, serde_json::json!({ "object": { "sha": head } })),
                        ("GET", "/git/commits/c0") => (200, serde_json::json!({ "tree": { "sha": "t0" } })),
                        ("GET", "/git/commits/c1") => (200, serde_json::json!({ "tree": { "sha": "t1" } })),
                        ("GET", "/git/trees/t0") | ("GET", "/git/trees/t1") => dir_listing(".minecraft", "m0"),
                        ("GET", "/git/trees/m0") => dir_listing("server_distribution", "s0"),
                        ("GET", "/git/trees/s0") => dir_listing("TesterLogs", "l0"),
                        ("GET", "/git/trees/l0") => dir_listing("Server Logs", "g0"),
                        ("GET", "/git/trees/g0?recursive=1") => {
                            let mut tree = vec![serde_json::json!({ "path": "kubejs", "type": "tree", "sha": "k0", "mode": "040000" })];
                            for (name, content) in &remote_files {
                                tree.push(serde_json::json!({ "path": name, "type": "blob", "sha": git_blob_id(content.as_bytes()), "mode": "100644" }));
                            }
                            (200, serde_json::json!({ "tree": tree, "truncated": false }))
                        }
                        ("POST", "/git/blobs") => {
                            use base64::Engine;
                            let content = base64::engine::general_purpose::STANDARD
                                .decode(req.body["content"].as_str().unwrap_or_default())
                                .unwrap_or_default();
                            (201, serde_json::json!({ "sha": git_blob_id(&content) }))
                        }
                        ("POST", "/git/trees") => {
                            made += 1;
                            (201, serde_json::json!({ "sha": format!("newtree{made}") }))
                        }
                        ("POST", "/git/commits") => {
                            made += 1;
                            (201, serde_json::json!({ "sha": format!("newcommit{made}") }))
                        }
                        ("PATCH", "/git/refs/heads/main") if refusals_left > 0 => {
                            refusals_left -= 1;
                            head = "c1".to_string();
                            (422, serde_json::json!({ "message": "Update is not a fast forward", "status": "422" }))
                        }
                        ("PATCH", "/git/refs/heads/main") => {
                            head = req.body["sha"].as_str().unwrap_or_default().to_string();
                            (200, serde_json::json!({ "object": { "sha": head } }))
                        }
                        _ => (404, serde_json::json!({ "message": "Not Found" })),
                    };
                    log.lock().unwrap().push(Seen { path, ..req });
                    let body = answer.to_string();
                    let _ = write!(
                        stream,
                        "HTTP/1.1 {code} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                }
            });
            FakeGitHub { url, seen }
        }

        fn api(&self) -> GitData {
            GitData::at(&self.url, "o", "r", "test-token")
        }

        fn seen(&self, method: &str, path: &str) -> Vec<Seen> {
            self.seen.lock().unwrap().iter().filter(|s| s.method == method && s.path == path).cloned().collect()
        }
    }

    fn dir_listing(name: &str, sha: &str) -> (u16, serde_json::Value) {
        (200, serde_json::json!({ "tree": [{ "path": name, "type": "tree", "sha": sha, "mode": "040000" }, { "path": "README.md", "type": "blob", "sha": "ffff", "mode": "100644" }], "truncated": false }))
    }

    fn read_request(stream: &mut TcpStream) -> Option<Seen> {
        let mut reader = BufReader::new(stream.try_clone().ok()?);
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        let mut parts = line.split_whitespace();
        let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
        let (mut length, mut auth) = (0usize, None);
        loop {
            let mut header = String::new();
            reader.read_line(&mut header).ok()?;
            let header = header.trim_end();
            if header.is_empty() {
                break;
            }
            if let Some((name, value)) = header.split_once(':') {
                match name.to_ascii_lowercase().as_str() {
                    "content-length" => length = value.trim().parse().ok()?,
                    "authorization" => auth = Some(value.trim().to_string()),
                    _ => {}
                }
            }
        }
        let mut body = vec![0u8; length];
        reader.read_exact(&mut body).ok()?;
        let body = if body.is_empty() { serde_json::Value::Null } else { serde_json::from_slice(&body).ok()? };
        Some(Seen { method, path, body, auth })
    }

    fn staged_folder(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let dir = scratch(name);
        for (rel, content) in files {
            let path = dir.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    #[test]
    fn a_push_uploads_only_what_differs_and_rebuilds_when_the_branch_moved() {
        // In the repo: latest.log (older content), an old gz, a kubejs log.
        let github = FakeGitHub::start(
            vec![("latest.log", "old run\n"), ("2026-10-10-1.log.gz", "gz-bytes"), ("kubejs/server.log", "kube\n")],
            1,
        );
        // Staged: latest.log changed, the gz and the kubejs log unchanged, a crash report new.
        let staged = staged_folder(
            "push",
            &[
                ("latest.log", "new run\n"),
                ("2026-10-10-1.log.gz", "gz-bytes"),
                ("kubejs/server.log", "kube\n"),
                ("crash-2026-10-11_11.37.00-server.txt", "boom\n"),
            ],
        );
        let outcome = push_with(&github.api(), "main", &staged, Instant::now() + Duration::from_secs(60)).unwrap();
        assert_eq!(outcome, Outcome::Pushed { files: 2, commit: "newcommit4".to_string(), too_big: 0 });

        // Two blobs, in path order, each the staged content.
        let blobs = github.seen("POST", "/git/blobs");
        assert_eq!(blobs.len(), 2);
        assert!(blobs.iter().all(|b| b.body["encoding"] == "base64"));
        // Two trees (the first attempt was refused): same two files, full repo
        // paths, first on the old root tree, then on the new one.
        let trees = github.seen("POST", "/git/trees");
        assert_eq!(trees.len(), 2);
        assert_eq!(trees[0].body["base_tree"], "t0");
        assert_eq!(trees[1].body["base_tree"], "t1");
        for tree in &trees {
            let entries = tree.body["tree"].as_array().unwrap();
            assert_eq!(entries.len(), 2);
            assert_eq!(entries[0]["path"], ".minecraft/server_distribution/TesterLogs/Server Logs/crash-2026-10-11_11.37.00-server.txt");
            assert_eq!(entries[0]["sha"], git_blob_id(b"boom\n"));
            assert_eq!(entries[1]["path"], ".minecraft/server_distribution/TesterLogs/Server Logs/latest.log");
            assert_eq!(entries[1]["sha"], git_blob_id(b"new run\n"));
            assert_eq!(entries[1]["mode"], "100644");
        }
        // Two commits: parent c0, then (after the refusal) the new tip c1.
        let commits = github.seen("POST", "/git/commits");
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].body["parents"][0], "c0");
        assert_eq!(commits[1].body["parents"][0], "c1");
        assert_eq!(commits[1].body["tree"], "newtree3");
        assert!(commits[1].body["message"].as_str().unwrap().starts_with("server logs auto-mirror 20"));
        assert_eq!(commits[1].body["author"]["name"], "icraft-launcher");
        // The branch is only ever fast-forwarded.
        let updates = github.seen("PATCH", "/git/refs/heads/main");
        assert_eq!(updates.len(), 2);
        assert!(updates.iter().all(|u| u.body["force"] == false));
        assert_eq!(updates[1].body["sha"], "newcommit4");
        // Every request carried the token, as a header.
        let all = github.seen.lock().unwrap().clone();
        assert!(all.iter().all(|s| s.auth.as_deref() == Some("Bearer test-token")));
        assert!(all.iter().all(|s| !s.path.contains("test-token")));
        let _ = fs::remove_dir_all(&staged);
    }

    #[test]
    fn nothing_is_written_when_the_repo_already_has_every_staged_file() {
        let github = FakeGitHub::start(vec![("latest.log", "same\n"), ("kubejs/server.log", "kube\n")], 0);
        let staged = staged_folder("uptodate", &[("latest.log", "same\n"), ("kubejs/server.log", "kube\n")]);
        let outcome = push_with(&github.api(), "main", &staged, Instant::now() + Duration::from_secs(60)).unwrap();
        assert_eq!(outcome, Outcome::UpToDate { files: 2 });
        let writes = github.seen.lock().unwrap().iter().filter(|s| s.method != "GET").count();
        assert_eq!(writes, 0);
        let _ = fs::remove_dir_all(&staged);
    }

    #[test]
    fn a_push_past_its_deadline_stops_and_says_so() {
        let github = FakeGitHub::start(vec![], 0);
        let staged = staged_folder("deadline", &[("latest.log", "x\n")]);
        let err = push_with(&github.api(), "main", &staged, Instant::now()).unwrap_err();
        assert!(err.to_string().contains("abandoned until the next server exit"), "{err}");
        assert!(github.seen("PATCH", "/git/refs/heads/main").is_empty());
        let _ = fs::remove_dir_all(&staged);
    }

    #[test]
    fn a_rejected_token_is_reported_without_the_token() {
        // Nothing listens for this repo: every call is a 404 from the fake.
        let github = FakeGitHub::start(vec![], 0);
        let api = GitData::at(&github.url, "someone", "else", "secret-token-value");
        let staged = staged_folder("rejected", &[("latest.log", "x\n")]);
        let err = push_with(&api, "main", &staged, Instant::now() + Duration::from_secs(60)).unwrap_err();
        let text = format!("{err:#}");
        assert!(text.contains("HTTP 404"), "{text}");
        assert!(!text.contains("secret-token-value"), "{text}");
        let _ = fs::remove_dir_all(&staged);
    }
}
