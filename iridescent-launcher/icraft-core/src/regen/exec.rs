//! Chunk regeneration, Phase C: carrying a plan out.
//!
//! **This is the one part of the Server Customizer that deletes world data.**
//! Everything else reads. So this file is written around what has to be true
//! before the first byte changes, and around getting back.
//!
//! What a run is given: a dry-run's folder (its `plan.json`: the scope, the
//! settings, the chunk list and its hash) and what the operator typed, the
//! first [`APPROVAL_CHARS`] characters of that hash. There is no other way in:
//! no request file, no flag, no timer. The launcher's window calls
//! [`execute`] when its typed field matches; the command line may call it only
//! on a folder that [`sandbox_check`] accepts as a scratch copy.
//!
//! What a run does, in this order, on one thread that holds the launch gate
//! ([`backup::launch_guard`]) from the first check to the last, so that no
//! Cycle, no restart policy and no button can start a JVM half-way:
//!
//!   1. **Refuse** unless the typed text is the plan's hash, no JVM of ours is
//!      up, nobody has the world open (`session.lock`), and no earlier run was
//!      left unfinished.
//!   2. **Recompute the plan** from the world as it is now, with the plan's own
//!      settings. A dry-run made while the server ran can be one autosave
//!      behind; this one cannot. If the hash differs, nothing is touched: the
//!      difference is shown, a fresh dry-run is written, and the operator has
//!      to look at THAT one and approve ITS hash ([`Outcome::PlanChanged`]).
//!   3. **Refuse** on anything the run cannot answer for: a world whose seed is
//!      not the one the plan was made under, a player whose logout
//!      position is in a chunk to be reset, a player file that does not read,
//!      a claim or a train track in the target set, mod data that does not
//!      read, a pregeneration that would start by itself afterwards ([`Line`]s
//!      marked [`Mark::Stop`]).
//!   3a. **The fidelity harness, before** ([`super::fidelity`], code that
//!      shares no reader with this file): its self-test (a violation of each
//!      kind planted in a fixture world in the temp folder, every one of
//!      which it has to catch), its own record of the world as it stands, and
//!      the plan against the protection map as derived now. If it cannot
//!      catch a planted violation, or the plan names a protected chunk,
//!      nothing is done.
//!   4. **A pinned backup of the world exactly as it stands**, verified
//!      ([`backup::pinned_of_current_world`]). No backup, no run.
//!   5. **The changes**, each one recorded first in the holding folder
//!      (`regen-holding/<time>-<hash>/holding.json`):
//!      - a region file whose every chunk goes is MOVED there, whole;
//!      - a region file that keeps some chunks is copied there and replaced by
//!        a copy with the chunks' header entries cleared
//!        ([`anvil::clear_chunks`]); the chunks that stay do not move;
//!      - the oversized-chunk files (`c.x.z.mcc`) of reset chunks are moved;
//!      - the mod stores that list things in reset chunks are copied there and
//!        rewritten without those entries (see "Stores");
//!      - what the plan changes besides chunks ([`super::edits`]: the seed in
//!        `level.dat`, the blending mark on kept chunks, the spawn markers,
//!        the player files of players who start over), each original kept
//!        there first, so a rollback puts the old seed back too.
//!   6. **Check**: the world is read again from disk. Every chunk that was to
//!      stay is still there, in the same folders, with the same bytes; every
//!      chunk that was to go is gone from all three folders; no file the run
//!      did not mean to touch has changed. Any failure from step 5 on puts
//!      everything back from the holding folder and checks that too.
//!   7. **Record** the run in `<world>/.icraft_world.json` (`regenerations`),
//!      next to the override layer's `config_changes`, so a later run can say
//!      which chunks predate which worldgen change.
//!   7a. **The fidelity harness, after**: the world read again by the
//!      harness's own reader and held against its record and the plan (every
//!      chunk the plan does not name byte-identical, every chunk it names
//!      gone, the region files it touched sound, every other file unchanged,
//!      the stores reconciled exactly). Its verdict goes into the holding
//!      folder (`fidelity.json`) and onto the run's done line; a FAIL puts
//!      everything back, as a failure in step 6 does.
//!
//! The holding folder is the way back: [`rollback`] returns every file to
//! where it was and checks each against the SHA-256 taken before it moved. It
//! is exact for as long as the world has not changed since the run (no server
//! start in between); after that the way back is the pinned backup.
//!
//! Between steps 5 and 7 [`MARKER_FILE`] exists next to `server.properties`,
//! and [`start_guard`] (called from `run::launch_server_inner`) starts no JVM
//! while it does. It outlives the run only if the launcher died in the middle.
//!
//! # Stores
//!
//! What refers to chunks from outside them, and what a run does about it. Each
//! was read from the mod's own classes (2026-10-12, deployment guide):
//!
//! | Store | What the run does |
//! |---|---|
//! | `data/waystones.dat` | removes the entries of waystones standing in reset chunks |
//! | `<dim>/data/large_ore_deposits.dat` | removes `generated` entries whose origin is in a reset chunk, and the `points` that name them. Tidiness, not need: the mod places a deposit again whether or not it is listed |
//! | `<dim>/data/mca_villages.dat` | removes a village whose every recorded building stands in reset chunks. One that straddles kept terrain is left as it is |
//! | `<dim>/data/mca_graveyard.dat` | removes the reset chunks' keys |
//! | `data/lootr/` | nothing: a regenerated chest is a new container with a new id; the old files are orphans nobody reads |
//! | claims, Create track | the run is refused while any is in the target set |
//!
//! `logs/regen_execute.log` is mirrored off the box with the other logs: it
//! holds counts, file names and hashes, and never a player's name.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::{analyse, edits, fidelity, num, plan_hash_with, Analysis, DimResult, Fate, RunSpec, Scope, PLAN_FILE, PLAN_VERSION};
use crate::anvil::{self, ChunkPos, Store, OVERWORLD};
use crate::backup;
use crate::config::ServerConfig;
use crate::nbt::{self, Doc, Node, Value};
use crate::protection::Settings;
use crate::worlddata::{self, BlockPos};

/// Next to `server.properties` while a run is changing the world. No JVM is
/// started while it exists ([`start_guard`]).
pub const MARKER_FILE: &str = ".icraft_regen_in_progress";
/// Under the server dir: one folder per run, holding what the run took out of
/// the world. Never pruned by the launcher: it is the operator's to delete
/// once the regenerated world has been looked at.
pub const HOLDING_DIR: &str = "regen-holding";
/// In a run's holding folder: what was moved and rewritten, with hashes.
pub const HOLDING_FILE: &str = "holding.json";
/// In a server folder that is a scratch copy: its own full path. The command
/// line carries a plan out only there (see [`sandbox_check`]).
pub const SANDBOX_FILE: &str = ".icraft_regen_sandbox";
/// Audit log, in the server's `logs/`. Counts and hashes only.
pub const LOG_FILE: &str = "regen_execute.log";
/// How much of the plan's hash the operator types to approve it.
pub const APPROVAL_CHARS: usize = 8;
/// Pregenerating the reset area afterwards needs the empty-level prune
/// backstop (unattended chunk loading in a level with no players leaks
/// otherwise: the 2026-10 server OOMs). Until that is live this stays `false`
/// and [`Pregen::Rearm`] is refused; nobody can switch it on from the window
/// or the command line.
pub const PREGEN_REARM_AVAILABLE: bool = false;

const HOLDING_FORMAT: &str = "icraft-regen-holding";
const HOLDING_VERSION: u32 = 1;
const HELD_FILES_DIR: &str = "files";
const LOG_ROLL_BYTES: u64 = 1024 * 1024;
const IO_BUF: usize = 1 << 20;
/// Free space wanted beyond what the holding folder's copies need.
const FREE_SPACE_MARGIN: u64 = 256 * 1024 * 1024;
/// A launcher rewrites `.icraft_launcher_status` every 15 s: one younger than
/// this means a launcher is running on the folder.
const LIVE_STATUS_AGE: Duration = Duration::from_secs(10 * 60);
/// In `<world>/.icraft_world.json` (shared with the override layer).
const WORLD_RECORD_KEY: &str = "regenerations";
/// There too: every seed change a run made.
pub const SEED_RECORD_KEY: &str = "seed_changes";

/// The pack's first-load pregeneration (`auto_chunky.js`): it starts a
/// 2,500-block Chunky task once per world and remembers that in KubeJS's
/// per-world data under this key.
const PREGEN_SCRIPT: &str = "kubejs/server_scripts/pregen/auto_chunky.js";
const PREGEN_FLAG: &str = "icraft_chunky_pregen_started";
const KUBEJS_DATA: &str = "kubejs_persistent_data.nbt";
/// Chunky's saved tasks, one `.properties` per dimension.
const CHUNKY_TASKS: &str = "config/chunky/tasks";

// =============================================================================
// What a run is told, and what it says back
// =============================================================================

/// Whether the reset area is pregenerated afterwards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Pregen {
    /// Nothing regenerates until a player goes there. The run makes sure of
    /// it: it is refused if a pregeneration would start by itself.
    #[default]
    Off,
    /// Clear the pack's "pregeneration has run" flag so it runs again at the
    /// next start. Refused while [`PREGEN_REARM_AVAILABLE`] is `false`.
    Rearm,
}

/// The operator's go for one plan.
#[derive(Debug, Clone)]
pub struct Approval {
    /// The dry-run folder they looked at.
    pub run_dir: PathBuf,
    /// What they typed: the first [`APPROVAL_CHARS`] of that plan's hash.
    pub typed: String,
    /// Who asked, for the record: `window`, `command line (sandbox)`.
    pub by: String,
    pub pregen: Pregen,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mark {
    /// As it should be.
    Ok,
    /// The run is refused while this stands.
    Stop,
    /// Something the run will do, or leave, that the operator should know.
    Note,
}

/// One line of what stands before a run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Line {
    pub mark: Mark,
    pub text: String,
}

fn line(mark: Mark, text: impl Into<String>) -> Line {
    Line { mark, text: text.into() }
}

/// Everything that can be said about a plan without touching anything: what
/// [`preflight`] returns, and what a run that found the plan changed returns
/// instead of running.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Preflight {
    pub run_name: String,
    pub scope: String,
    /// The hash in the dry-run's `plan.json`.
    pub approved_hash: String,
    /// The hash of the plan computed just now, from the world as it is.
    pub current_hash: String,
    pub same_plan: bool,
    /// Chunks in the plan now that the approved one did not have, and the
    /// other way round.
    pub added: usize,
    pub removed: usize,
    /// The first few of each: `minecraft:overworld (12, -3)`.
    pub added_sample: Vec<String>,
    pub removed_sample: Vec<String>,
    /// A dry-run written because the plan changed: the one to look at now.
    pub new_run: Option<String>,
    pub on_disk: usize,
    pub targets: usize,
    pub kept: usize,
    pub lines: Vec<Line>,
}

impl Preflight {
    /// The reasons the run would be refused as things stand.
    pub fn stops(&self) -> Vec<&str> {
        self.lines.iter().filter(|l| l.mark == Mark::Stop).map(|l| l.text.as_str()).collect()
    }

    pub fn ready(&self) -> bool {
        self.same_plan && self.stops().is_empty()
    }

    /// The characters the operator has to type for this plan.
    pub fn approval_text(&self) -> &str {
        &self.approved_hash[..self.approved_hash.len().min(APPROVAL_CHARS)]
    }
}

/// A finished run.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Report {
    pub run_name: String,
    pub scope: String,
    pub plan_hash: String,
    pub chunks_reset: usize,
    pub chunks_kept: usize,
    /// Region files that left the world whole, per folder (region, entities, poi).
    pub files_moved: [usize; 3],
    pub files_rewritten: [usize; 3],
    pub external_moved: usize,
    pub bytes_moved: u64,
    /// One line per store: what was removed, or why nothing was.
    pub stores: Vec<String>,
    pub backup_file: String,
    pub backup_sha256: String,
    pub backup_reused: bool,
    /// The holding folder, relative to the server dir.
    pub holding: String,
    /// The fidelity harness's verdict, one line ([`fidelity::Verdict::line`]).
    pub fidelity: String,
    /// What was changed besides chunks, counts only ([`super::edits`]).
    pub edits: Vec<String>,
    pub elapsed_secs: f64,
}

impl Report {
    /// One line for the log and the command line. Counts and hashes only.
    pub fn line(&self) -> String {
        let harness = if self.fidelity.is_empty() { String::new() } else { format!(". {}", self.fidelity) };
        let edits = if self.edits.is_empty() { String::new() } else { format!("; world edits: {}", self.edits.join(", ")) };
        let done = format!(
            "done: scope {}: {} chunk(s) reset, {} kept; region files moved whole {}/{}/{} (region/entities/poi), rewritten {}/{}/{}, {} moved to {}{edits}; backup {} (sha256 {}{}); plan sha256 {} ({:.1} s)",
            self.scope,
            num(self.chunks_reset),
            num(self.chunks_kept),
            self.files_moved[0],
            self.files_moved[1],
            self.files_moved[2],
            self.files_rewritten[0],
            self.files_rewritten[1],
            self.files_rewritten[2],
            backup::fmt_bytes(self.bytes_moved),
            self.holding,
            self.backup_file,
            &self.backup_sha256[..self.backup_sha256.len().min(12)],
            if self.backup_reused { ", taken earlier of this same world" } else { "" },
            &self.plan_hash[..self.plan_hash.len().min(16)],
            self.elapsed_secs
        );
        format!("{done}{harness}")
    }
}

#[derive(Debug, Clone)]
pub enum Outcome {
    Done(Box<Report>),
    /// Nothing was touched: the world is not what the approved dry-run saw.
    /// The difference is in here, and so is the name of a fresh dry-run.
    PlanChanged(Box<Preflight>),
    /// Nothing was touched, and why.
    Refused(String),
    /// Something failed after the first change. `restored` says whether the
    /// world was put back as it was (and checked), or why it could not be: in
    /// that case [`MARKER_FILE`] stays and no server starts.
    Failed { why: String, restored: Result<(), String>, holding: PathBuf },
}

impl Outcome {
    pub fn is_done(&self) -> bool {
        matches!(self, Outcome::Done(_))
    }

    /// One line for the log and the command line.
    pub fn line(&self) -> String {
        match self {
            Outcome::Done(report) => report.line(),
            Outcome::PlanChanged(p) => format!(
                "NOT RUN, nothing was touched: the world has changed since dry-run {} was made ({} chunk(s) more, {} fewer; plan sha256 now {}). {}",
                p.run_name,
                num(p.added),
                num(p.removed),
                &p.current_hash[..p.current_hash.len().min(16)],
                match &p.new_run {
                    Some(name) => format!("A fresh dry-run was written: {name}. Look at it and approve its hash."),
                    None => "Run the dry-run again and approve the new plan.".to_string(),
                }
            ),
            Outcome::Refused(why) => format!("NOT RUN, nothing was touched: {why}"),
            Outcome::Failed { why, restored: Ok(()), .. } => {
                format!("FAILED: {why}. Everything was put back as it was and checked against the hashes taken before; the world is unchanged")
            }
            Outcome::Failed { why, restored: Err(back), holding } => format!(
                "FAILED: {why}. PUTTING IT BACK ALSO FAILED: {back}. The server will not be started ({MARKER_FILE}). What was taken out is in {}; the pinned backup taken before the run is intact",
                holding.display()
            ),
        }
    }
}

// =============================================================================
// Progress and the audit log
// =============================================================================

static EXEC_LOCK: Mutex<()> = Mutex::new(());
static RUNNING: AtomicBool = AtomicBool::new(false);
static PROGRESS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// A run or a rollback is under way (the window keeps painting; nothing else
/// should wait on the launch gate from the window's thread meanwhile).
pub fn in_progress() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

/// The steps of the run under way, or of the last one.
pub fn progress() -> Vec<String> {
    PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

struct RunningFlag;

impl RunningFlag {
    fn raise() -> Self {
        RUNNING.store(true, Ordering::SeqCst);
        PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).clear();
        RunningFlag
    }
}

impl Drop for RunningFlag {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn utc_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// One line to `logs/regen_execute.log`, the launcher log and the progress
/// list. Never a player's name: this log leaves the box.
fn audit(server_dir: &Path, level: log::Level, msg: &str) {
    log::log!(level, "[regen] {msg}");
    PROGRESS.lock().unwrap_or_else(|e| e.into_inner()).push(msg.to_string());
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

fn sha256_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; IO_BUF];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// A file's bytes, or `None` when there is no such file.
fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

/// `world/region/r.0.0.mca`: a path inside the server dir, with `/`.
fn rel_of(server_dir: &Path, path: &Path) -> Result<String, String> {
    let rel = path.strip_prefix(server_dir).map_err(|_| format!("{} is not inside the server folder", path.display()))?;
    let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    if parts.is_empty() || !parts.iter().all(|p| plain_part(p)) {
        return Err(format!("{} is not a plain path inside the server folder", path.display()));
    }
    Ok(parts.join("/"))
}

fn plain_part(part: &str) -> bool {
    !part.is_empty() && part != "." && part != ".." && !part.contains(|c: char| matches!(c, '/' | '\\' | ':'))
}

/// A relative path out of a holding record, under `base`. The record is a file
/// on disk: it is not trusted to stay inside the folder.
fn under(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut path = base.to_path_buf();
    let mut any = false;
    for part in rel.split('/') {
        if !plain_part(part) {
            return Err(format!("'{rel}' is not a plain relative path"));
        }
        path.push(part);
        any = true;
    }
    if any {
        Ok(path)
    } else {
        Err("an empty path".to_string())
    }
}

// =============================================================================
// The approved plan
// =============================================================================

/// What a dry-run's `plan.json` says, as far as carrying it out needs.
#[derive(Debug, Clone)]
pub struct ApprovedPlan {
    /// The dry-run folder's name.
    pub run_name: String,
    pub run_dir: PathBuf,
    pub hash: String,
    pub level_name: String,
    /// `ring:8`, `all`, ...
    pub scope: String,
    /// The run that reproduces it: its scope, its dimensions, and its settings
    /// whole, so that no policy file is read on the way.
    pub spec: RunSpec,
    /// Its chunks, per dimension id.
    pub chunks: BTreeMap<String, BTreeSet<ChunkPos>>,
    pub total: usize,
    /// The seed in `level.dat` when the dry-run was made (`world.seed`).
    pub seed: Option<i64>,
    /// What it changes besides chunks; its hash covers them.
    pub edits: edits::Edits,
}

/// Read a dry-run's plan. A plan whose hash is not the hash of its own chunk
/// list (edited, cut short) is refused here.
pub fn load_plan(run_dir: &Path) -> Result<ApprovedPlan, String> {
    let path = run_dir.join(PLAN_FILE);
    let raw = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let v: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| format!("{PLAN_FILE} does not parse ({e})"))?;
    if v["format"] != "icraft-regen-plan" || v["version"] != PLAN_VERSION {
        return Err(format!("{PLAN_FILE} is not a version {PLAN_VERSION} regeneration plan"));
    }
    let text = |value: &serde_json::Value, what: &str| value.as_str().map(str::to_string).ok_or_else(|| format!("{PLAN_FILE} has no {what}"));
    let hash = text(&v["plan_hash"], "plan_hash")?.to_ascii_lowercase();
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(format!("{PLAN_FILE}: plan_hash is not a SHA-256"));
    }
    let scope_token = text(&v["scope"], "scope")?;
    let scope = Scope::parse(&scope_token)?;
    let level_name = text(&v["world"]["level_name"], "world.level_name")?;

    // Every scalar setting is in the plan, and the two lists start empty.
    let mut settings = Settings::default();
    for pair in v["settings"].as_array().ok_or_else(|| format!("{PLAN_FILE} has no settings"))? {
        let (Some(key), Some(value)) = (pair[0].as_str(), pair[1].as_str()) else {
            return Err(format!("{PLAN_FILE}: a setting is not a [key, value] pair"));
        };
        settings.set(key, value).map_err(|e| format!("{PLAN_FILE}: {e}"))?;
    }
    settings.validate().map_err(|e| format!("{PLAN_FILE}: {e}"))?;

    let coord = |value: &serde_json::Value| {
        value.as_i64().and_then(|n| i32::try_from(n).ok()).ok_or_else(|| format!("{PLAN_FILE}: a chunk coordinate is not a whole number"))
    };
    let mut chunks: BTreeMap<String, BTreeSet<ChunkPos>> = BTreeMap::new();
    for d in v["dimensions"].as_array().ok_or_else(|| format!("{PLAN_FILE} has no dimensions"))? {
        let id = text(&d["id"], "dimension id")?;
        let set = chunks.entry(id).or_default();
        for region in d["regions"].as_array().ok_or_else(|| format!("{PLAN_FILE}: a dimension has no regions list"))? {
            for c in region["chunks"].as_array().ok_or_else(|| format!("{PLAN_FILE}: a region has no chunks list"))? {
                let pos = (coord(&c[0])?, coord(&c[1])?);
                if !set.insert(pos) {
                    return Err(format!("{PLAN_FILE}: chunk {pos:?} is listed twice"));
                }
            }
        }
    }
    if chunks.is_empty() {
        return Err(format!("{PLAN_FILE} covers no dimension"));
    }
    let edits = edits::Edits::from_json(&v["world_edits"]).map_err(|e| format!("{PLAN_FILE}: {e}"))?;
    let seed = match &v["world"]["seed"] {
        serde_json::Value::String(s) => Some(s.parse::<i64>().map_err(|_| format!("{PLAN_FILE}: world.seed is not a whole number"))?),
        _ => None,
    };
    if plan_hash_with(&level_name, chunks.iter().map(|(id, set)| (id.as_str(), set)), &edits.hash_lines()) != hash {
        return Err(format!("{PLAN_FILE}: plan_hash is not the hash of the chunks the file lists (edited, or cut short): run the dry-run again"));
    }
    let total: usize = chunks.values().map(BTreeSet::len).sum();
    let spec = RunSpec {
        scope,
        dims: chunks.keys().cloned().collect(),
        all_dims: false,
        overrides: Vec::new(),
        settings: Some(settings),
        edits: edits.as_asked(),
        out_root: None,
        png: true,
    };
    let run_name = run_dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(ApprovedPlan { run_name, run_dir: run_dir.to_path_buf(), hash, level_name, scope: scope_token, spec, chunks, total, seed, edits })
}

fn hash_of(a: &Analysis) -> String {
    plan_hash_with(&a.level_name, a.dims.iter().map(|d| (d.dim.id.as_str(), &d.targets)), &a.edits.hash_lines())
}

/// Does `typed` approve this hash?
fn approves(typed: &str, hash: &str) -> bool {
    let typed = typed.trim();
    typed.len() == APPROVAL_CHARS && hash.len() >= APPROVAL_CHARS && typed.eq_ignore_ascii_case(&hash[..APPROVAL_CHARS])
}

// =============================================================================
// What stands in the way (read-only)
// =============================================================================

/// The first characters of a player file's name: enough to find the file,
/// and not a name.
fn short(uuid: &str) -> &str {
    &uuid[..uuid.len().min(8)]
}

/// The reasons a plan cannot be carried out that come from what is IN the
/// target set. Each is something only the operator can settle, by keeping the
/// chunk or by changing what stands in it, and then making a new dry-run.
///
/// (A player's logout position: the `logout` layer of `protection` keeps that
/// chunk and the 3x3 around it by default (G5, 2026-10-22), so the dry-run
/// shows it and the plan has no such chunk. This refusal stays as the
/// backstop: the layer switched off, or an `unprotect` box over the spot.)
fn target_stops(a: &Analysis) -> Vec<String> {
    let mut out = Vec::new();
    if a.total_targets() == 0 {
        out.push("The plan regenerates no chunk: there is nothing to do.".to_string());
    }
    // By number only: the files are named by their player's UUID.
    for u in &a.unreadable_players {
        out.push(format!(
            "Player file #{} of {} in playerdata/ (sorted by file name) does not read, and neither does its .dat_old: that player's bed and logout spot are unknown, so nothing can keep them. Put the file back from a world backup (each holds playerdata/) with the server stopped, then make a new dry-run.",
            a.file_no(&u.uuid),
            a.player_files()
        ));
    }
    for (index, p) in a.players.iter().enumerate() {
        if let Some((dim, pos)) = &p.last_pos {
            if matches!(a.fate(dim, pos.chunk()), Fate::Regenerate) {
                out.push(format!(
                    "Player file #{} (playerdata/{}...) logged out in chunk {:?} of {dim}, which is to be reset: they would come back inside fresh terrain, possibly inside stone. Keep that chunk (an 'Always keep' box on the dry-run page) or have them log in and move, then make a new dry-run.",
                    index + 1,
                    short(&p.uuid),
                    pos.chunk()
                ));
            }
        }
    }
    let count = |kind: &str| a.warnings.iter().filter(|w| w.kind == kind).count();
    let claims = count("claim-in-target");
    if claims > 0 {
        out.push(format!(
            "{claims} claimed chunk(s) (Open Parties and Claims) are to be reset: a claim would be left on terrain its owner never saw. Keep them (switch the claims layer on, or an 'Always keep' box), then make a new dry-run."
        ));
    }
    let tracks = count("create-track-in-target");
    if tracks > 0 {
        out.push(format!(
            "Create train track is recorded in {tracks} chunk(s) that are to be reset: the saved track graph would point at track that is gone, and nothing here repairs it. Keep those chunks, then make a new dry-run."
        ));
    }
    for w in a.warnings.iter().filter(|w| w.kind == "mod-data-unreadable") {
        out.push(format!("Mod data could not be read, so what it refers to cannot be reconciled: {}", w.detail));
    }
    if count("files-changed-during-scan") > 0 {
        out.push("A region file changed while it was being read: something is writing to the world. Nothing is done while that is so.".to_string());
    }
    out
}

/// Saved Chunky tasks that are not cancelled: Chunky resumes those at the next
/// server start (`continueOnRestart`), and the pack's script resumes them
/// whenever the server empties. `chunky continue` skips a cancelled task
/// (Chunky 1.3.146, `ContinueCommand`).
fn unfinished_chunky_tasks(server_dir: &Path) -> Vec<String> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<String>) {
        for entry in fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().into_owned();
            let child = format!("{rel}/{name}");
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_dir() {
                walk(&entry.path(), &child, out);
            } else if name.ends_with(".properties") {
                // A task file that cannot be read is treated as live.
                let cancelled = fs::read_to_string(entry.path()).map_or(false, |body| {
                    body.lines().any(|l| l.split_once('=').is_some_and(|(k, v)| k.trim() == "cancelled" && v.trim().eq_ignore_ascii_case("true")))
                });
                if !cancelled {
                    out.push(child);
                }
            }
        }
    }
    let mut out = Vec::new();
    let mut dir = server_dir.to_path_buf();
    for part in CHUNKY_TASKS.split('/') {
        dir.push(part);
    }
    walk(&dir, CHUNKY_TASKS, &mut out);
    out.sort();
    out
}

/// Would a pregeneration start by itself once the server is up again? With
/// [`Pregen::Off`] that refuses the run: tens of thousands of chunks would be
/// generated unattended, in a level that may have no player in it.
fn pregen_lines(cfg: &ServerConfig, pregen: Pregen) -> Vec<Line> {
    let mut out = Vec::new();
    if pregen == Pregen::Rearm {
        if !PREGEN_REARM_AVAILABLE {
            out.push(line(Mark::Stop, "Pregenerating the reset area afterwards is not available in this build: it waits for the empty-level prune backstop."));
        }
        return out;
    }
    let mut clear = true;
    for task in unfinished_chunky_tasks(&cfg.server_dir) {
        clear = false;
        out.push(line(Mark::Stop, format!(
            "Chunky has an unfinished pregeneration task ({task}): it would resume by itself after the run and generate the reset area unattended. Cancel it first: start the server, type 'chunky cancel' and then 'chunky confirm' in the console box, stop the server."
        )));
    }
    let mut script = cfg.server_dir.clone();
    for part in PREGEN_SCRIPT.split('/') {
        script.push(part);
    }
    if script.is_file() {
        let started = match worlddata::read_nbt(&cfg.world_dir().join(KUBEJS_DATA)) {
            Ok(Some(root)) => Ok(root.get(PREGEN_FLAG).and_then(Value::as_i64).unwrap_or(0) != 0),
            Ok(None) => Ok(false),
            Err(e) => Err(e),
        };
        match started {
            Ok(true) => {}
            Ok(false) => {
                clear = false;
                out.push(line(Mark::Stop, format!(
                    "The pack's first-load pregeneration has not run on this world yet ({PREGEN_FLAG} is not set in {KUBEJS_DATA}): it would start at the next server start and generate the reset area unattended. Let it run and finish first, or cancel it in game."
                )));
            }
            Err(e) => {
                clear = false;
                out.push(line(Mark::Stop, format!("Whether the pack's pregeneration has run cannot be read ({e}), so it cannot be ruled out that it starts by itself.")));
            }
        }
    }
    if clear {
        out.push(line(Mark::Ok, "Pregeneration: off. Nothing regenerates until a player goes there: no Chunky task is waiting and the pack's first-load pregeneration has already run."));
    }
    out
}

// =============================================================================
// The files
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
enum FileKind {
    /// Every chunk in the file goes: the file is moved.
    Whole,
    /// These slots are cleared; the rest of the file stays as it is.
    Partial(BTreeSet<u16>),
    /// The `c.x.z.mcc` of a chunk that goes: moved.
    External,
}

#[derive(Debug, Clone)]
struct FileOp {
    path: PathBuf,
    rel: String,
    store: Store,
    kind: FileKind,
    bytes: u64,
    /// Chunks of the target set in it, and chunks it lists.
    hit: usize,
    of: usize,
}

fn store_slot(store: Store) -> usize {
    Store::ALL.iter().position(|s| *s == store).unwrap_or(0)
}

/// `c.<x>.<z>.mcc` -> the chunk.
fn parse_external_name(name: &str) -> Option<ChunkPos> {
    let (x, z) = name.strip_prefix("c.")?.strip_suffix(".mcc")?.split_once('.')?;
    Some((x.parse().ok()?, z.parse().ok()?))
}

/// Every file the plan touches, from the scan the plan was computed from.
fn plan_files(a: &Analysis) -> Result<Vec<FileOp>, String> {
    let mut ops = Vec::new();
    for d in &a.dims {
        for f in &d.scan.files {
            let hit: Vec<ChunkPos> = f.chunks.iter().copied().filter(|c| d.targets.contains(c)).collect();
            if hit.is_empty() {
                continue;
            }
            let path = d.dim.store_dir(f.store).join(&f.name);
            let kind = if hit.len() == f.chunks.len() {
                FileKind::Whole
            } else {
                FileKind::Partial(hit.iter().map(|c| anvil::slot_index(*c)).collect())
            };
            ops.push(FileOp { rel: rel_of(&a.server_dir, &path)?, path, store: f.store, kind, bytes: f.bytes, hit: hit.len(), of: f.chunks.len() });
        }
        for store in Store::ALL {
            let dir = d.dim.store_dir(store);
            let mut external = Vec::new();
            for entry in fs::read_dir(&dir).into_iter().flatten().filter_map(|e| e.ok()) {
                let Ok(name) = entry.file_name().into_string() else { continue };
                if parse_external_name(&name).is_some_and(|pos| d.targets.contains(&pos)) {
                    external.push((name, entry.metadata().map_or(0, |m| m.len())));
                }
            }
            external.sort();
            for (name, bytes) in external {
                let path = dir.join(&name);
                ops.push(FileOp { rel: rel_of(&a.server_dir, &path)?, path, store, kind: FileKind::External, bytes, hit: 1, of: 1 });
            }
        }
    }
    Ok(ops)
}

// =============================================================================
// The stores
// =============================================================================

/// A saved-data file as it is and as it is to be.
#[derive(Debug, Clone)]
struct StoreEdit {
    path: PathBuf,
    rel: String,
    original: Vec<u8>,
    /// When the original was last written, for the copy kept of it.
    modified: Option<SystemTime>,
    updated: Vec<u8>,
    detail: String,
}

#[derive(Default)]
struct Stores {
    edits: Vec<StoreEdit>,
    lines: Vec<Line>,
}

/// `{X, Y, Z}` or `{x, y, z}` (Waystones writes the first, MCA the second).
fn node_block_pos(v: &Node) -> Option<BlockPos> {
    let pick = |upper: &str, lower: &str| v.get(upper).or_else(|| v.get(lower)).and_then(Node::as_i32);
    Some(BlockPos { x: pick("X", "x")?, y: pick("Y", "y").unwrap_or(0), z: pick("Z", "z")? })
}

/// The edited file's bytes, after they have been read back twice: by the
/// launcher's ordinary reader, and without loss, giving the tree they were
/// written from.
fn finish_edit(a: &Analysis, path: PathBuf, original: Vec<u8>, doc: &Doc, detail: String) -> Result<StoreEdit, String> {
    let shown = path.display().to_string();
    let updated = doc.to_bytes().map_err(|e| format!("{shown}: {e}"))?;
    nbt::parse_bytes(&updated).map_err(|e| format!("{shown}: what would be written does not read back ({e})"))?;
    if Doc::parse(&updated).map_err(|e| format!("{shown}: what would be written does not read back ({e})"))? != *doc {
        return Err(format!("{shown}: what would be written does not read back as what was meant"));
    }
    let modified = fs::metadata(&path).and_then(|md| md.modified()).ok();
    Ok(StoreEdit { rel: rel_of(&a.server_dir, &path)?, path, original, modified, updated, detail })
}

/// `data/waystones.dat` lists every waystone the server ever generated. One
/// whose chunk is reset is gone with its block; the village that comes back
/// brings a new one, with a new id. Its entry is removed.
fn plan_waystones(a: &Analysis, out: &mut Stores) -> Result<(), String> {
    let path = a.world_dir.join("data").join("waystones.dat");
    let Some(raw) = read_optional(&path)? else { return Ok(()) };
    let shown = path.display().to_string();
    let mut doc = Doc::parse(&raw).map_err(|e| format!("{shown}: {e}"))?;
    let items = doc.root.at_mut(&["data", "Waystones"]).and_then(Node::items_mut).ok_or_else(|| format!("{shown}: no data.Waystones list"))?;
    let before = items.len();
    let mut unplaced = 0;
    items.retain(|w| {
        let dim = w.get("World").and_then(Node::as_str).unwrap_or(OVERWORLD);
        match w.get("BlockPos").and_then(node_block_pos) {
            Some(pos) => !a.dim(dim).is_some_and(|d| d.targets.contains(&pos.chunk())),
            None => {
                unplaced += 1;
                true
            }
        }
    });
    let removed = before - items.len();
    if unplaced > 0 {
        return Err(format!("{shown}: {unplaced} waystone(s) have no readable position"));
    }
    // The analysis found them with the other reader. Two readers, one answer.
    let expected = a.waystones.iter().flatten().filter(|w| a.dim(&w.dim).is_some_and(|d| d.targets.contains(&w.pos.chunk()))).count();
    if removed != expected {
        return Err(format!("{shown}: {removed} waystones would be removed, but the analysis counted {expected} in the target set"));
    }
    if removed == 0 {
        out.lines.push(line(Mark::Ok, format!("Waystones: none of the {before} recorded waystones stands in a chunk that is reset. waystones.dat is not touched.")));
        return Ok(());
    }
    let detail = format!("{removed} of {before} waystones removed");
    out.lines.push(line(Mark::Note, format!(
        "Waystones: {removed} of the {before} recorded waystones stand in chunks that are reset. Their entries are removed from waystones.dat; a village that comes back brings a new waystone with a new id. A player who had activated one of them loses that entry from their list."
    )));
    out.edits.push(finish_edit(a, path, raw, &doc, detail)?);
    Ok(())
}

/// `large_ore_deposits.dat` (Large Ore Deposits 8.1.9): `generated` is the
/// mod's record of where it put a deposit, read by its list and locate
/// commands and by the code that continues a deposit across a chunk border;
/// `points` are those pending continuations, as [entry block, origin block].
/// Placement itself never consults either (read in the mod's bytecode: a
/// deposit is rolled from the seed and placed again whether or not it is
/// listed). So this is tidiness: the entries of deposits whose origin chunk is
/// reset are removed, with the points that name them, so the commands stay
/// truthful and no stale remainder is continued into fresh terrain.
fn plan_ore_deposits(a: &Analysis, d: &DimResult, out: &mut Stores) -> Result<(), String> {
    let path = d.dim.data_dir().join("large_ore_deposits.dat");
    let Some(raw) = read_optional(&path)? else { return Ok(()) };
    let shown = path.display().to_string();
    let mut doc = Doc::parse(&raw).map_err(|e| format!("{shown}: {e}"))?;
    let generated = doc.root.at_mut(&["data", "generated"]).and_then(Node::items_mut).ok_or_else(|| format!("{shown}: no data.generated list"))?;
    let before = generated.len();
    let mut gone: BTreeSet<i64> = BTreeSet::new();
    generated.retain(|g| match g.get("pos").and_then(Node::as_i64) {
        Some(pos) if d.targets.contains(&BlockPos::from_long(pos).chunk()) => {
            gone.insert(pos);
            false
        }
        _ => true,
    });
    let removed = before - generated.len();
    let expected = worlddata::read_ore_deposits(&d.dim.data_dir())?.unwrap_or_default().iter().filter(|dep| d.targets.contains(&dep.pos.chunk())).count();
    if removed != expected {
        return Err(format!("{shown}: {removed} deposits would be removed, but the analysis counted {expected} in the target set"));
    }
    let mut points_removed = 0;
    if let Some(points) = doc.root.at_mut(&["data", "points"]).and_then(Node::items_mut) {
        let all = points.len();
        points.retain(|p| !matches!(p, Node::LongArray(pair) if pair.len() == 2 && gone.contains(&pair[1])));
        points_removed = all - points.len();
    }
    if removed == 0 {
        out.lines.push(line(Mark::Ok, format!("Large ore deposits ({}): none of the {before} recorded deposits has its origin in a chunk that is reset. The file is not touched.", d.dim.id)));
        return Ok(());
    }
    let detail = format!("{removed} of {before} deposit records removed, with {points_removed} continuation point(s)");
    out.lines.push(line(Mark::Note, format!(
        "Large ore deposits ({}): {removed} of the {before} recorded deposits have their origin in chunks that are reset. Their records are removed ({points_removed} pending continuation point(s) with them). The mod places deposits from the seed whether or not they are recorded, so the new terrain gets its deposits either way; a deposit next to kept terrain comes out thinner, because the part that would reach into a kept chunk is not placed.",
        d.dim.id
    )));
    out.edits.push(finish_edit(a, path, raw, &doc, detail)?);
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VillageFate {
    /// No recorded building stands in a reset chunk.
    Kept,
    /// Every recorded building stands in reset chunks.
    Gone,
    /// Some of it is in kept terrain, or it cannot be told where it is.
    Straddles,
}

/// The chunks a recorded MCA building stands in: the blocks the mod remembers
/// for it (`blocks2`: block id -> positions; a village's town centre is its
/// bells), or its centre when it remembers none. `None`: not readable.
fn building_chunks(b: &Node) -> Option<BTreeSet<ChunkPos>> {
    let mut chunks = BTreeSet::new();
    if let Some(Node::Compound(kinds)) = b.get("blocks2") {
        for (_, positions) in kinds {
            for p in positions.as_list()? {
                chunks.insert(node_block_pos(p)?.chunk());
            }
        }
    }
    if chunks.is_empty() {
        let coord = |key: &str| b.get(key).and_then(Node::as_i32);
        chunks.insert(BlockPos { x: coord("posX")?, y: 0, z: coord("posZ")? }.chunk());
    }
    Some(chunks)
}

fn village_fate(v: &Node, targets: &BTreeSet<ChunkPos>) -> VillageFate {
    let Some(buildings) = v.get("buildings").and_then(Node::as_list) else { return VillageFate::Straddles };
    let (mut inside, mut outside) = (0, 0);
    for b in buildings {
        let Some(chunks) = building_chunks(b) else { return VillageFate::Straddles };
        for c in &chunks {
            if targets.contains(c) {
                inside += 1;
            } else {
                outside += 1;
            }
        }
    }
    match (inside, outside) {
        (0, _) => VillageFate::Kept,
        (_, 0) => VillageFate::Gone,
        _ => VillageFate::Straddles,
    }
}

/// MCA Reborn 7.6.15. A village record is made when a villager claims a bell
/// and is never checked again by the mod unless something lands on it, so a
/// record whose bells are in reset chunks would outlive the village: it keeps
/// its name and its residents (who no longer exist and still count as
/// population, which stops the village that comes back from growing) and wins
/// the merge against the fresh record. Such a village is removed whole, which
/// is what `/mca-admin removeVillageWithId` does. The id counters are left as
/// they are: the mod hands out `counter++`, and a reused id would inherit the
/// old village's registry file. A village with buildings on both sides of the
/// line is left as it is.
fn plan_mca(a: &Analysis, d: &DimResult, out: &mut Stores) -> Result<(), String> {
    let path = d.dim.data_dir().join("mca_villages.dat");
    if let Some(raw) = read_optional(&path)? {
        let shown = path.display().to_string();
        let mut doc = Doc::parse(&raw).map_err(|e| format!("{shown}: {e}"))?;
        let villages = doc.root.at_mut(&["data", "villages"]).and_then(Node::items_mut).ok_or_else(|| format!("{shown}: no data.villages list"))?;
        let before = villages.len();
        let mut straddling = 0;
        villages.retain(|v| match village_fate(v, &d.targets) {
            VillageFate::Gone => false,
            VillageFate::Straddles => {
                straddling += 1;
                true
            }
            VillageFate::Kept => true,
        });
        let removed = before - villages.len();
        if straddling > 0 {
            out.lines.push(line(Mark::Note, format!(
                "MCA villages ({}): {straddling} village record(s) have buildings both in kept and in reset chunks (or a building whose place cannot be read). They are left as they are: the buildings that are gone stay on record until a blueprint scan in game, or '/mca-admin removeVillageWithId <id>'.",
                d.dim.id
            )));
        }
        if removed == 0 {
            if straddling == 0 {
                out.lines.push(line(Mark::Ok, format!("MCA villages ({}): none of the {before} recorded villages stands in chunks that are reset. The file is not touched.", d.dim.id)));
            }
        } else {
            out.lines.push(line(Mark::Note, format!(
                "MCA villages ({}): {removed} of the {before} recorded villages stand wholly in chunks that are reset. Their records are removed (name, reputation and resident list go with them); a village that comes back registers itself anew when a villager claims its bell. Villagers of a kept village who lived in a reset chunk stay on its resident list as names without a villager: '/mca-admin assumeNameDead <name>' clears one.",
                d.dim.id
            )));
            let detail = format!("{removed} of {before} village records removed");
            out.edits.push(finish_edit(a, path, raw, &doc, detail)?);
        }
    }

    // mca_graveyard.dat: {EMPTY|FILLED: {"<chunk as a long>": [positions]}}.
    // A stale EMPTY entry makes the mod skip placing a gravestone nearby.
    let path = d.dim.data_dir().join("mca_graveyard.dat");
    let Some(raw) = read_optional(&path)? else { return Ok(()) };
    let shown = path.display().to_string();
    let mut doc = Doc::parse(&raw).map_err(|e| format!("{shown}: {e}"))?;
    let (mut before, mut removed) = (0, 0);
    if let Some(Node::Compound(states)) = doc.root.get_mut("data") {
        for (_, state) in states.iter_mut() {
            if let Node::Compound(by_chunk) = state {
                before += by_chunk.len();
                by_chunk.retain(|(key, _)| {
                    // ChunkPos.toLong: x in the low 32 bits, z in the high.
                    let gone = std::str::from_utf8(key).ok().and_then(|k| k.parse::<i64>().ok()).is_some_and(|k| d.targets.contains(&(k as i32, (k >> 32) as i32)));
                    if gone {
                        removed += 1;
                    }
                    !gone
                });
            }
        }
        if removed > 0 {
            // The mod writes no state it has nothing under.
            states.retain(|(_, state)| !matches!(state, Node::Compound(by_chunk) if by_chunk.is_empty()));
        }
    }
    if removed > 0 {
        out.lines.push(line(Mark::Note, format!("MCA graveyard ({}): {removed} of {before} recorded grave chunk(s) are reset; their entries are removed.", d.dim.id)));
        let detail = format!("{removed} of {before} grave chunk entries removed");
        out.edits.push(finish_edit(a, path, raw, &doc, detail)?);
    }
    Ok(())
}

/// `data/lootr/<h>/<hh>/<id>.dat`: one file per loot container a player has
/// opened, with its position. Nothing is done to them: the count of those in
/// the target set is reported, so that "left on purpose" comes with a number.
fn lootr_line(a: &Analysis) -> Option<Line> {
    fn walk(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()) {
            let path = entry.path();
            match entry.file_type() {
                Ok(kind) if kind.is_dir() && depth < 4 => walk(&path, depth + 1, out),
                Ok(kind) if kind.is_file() && depth > 0 => out.push(path),
                _ => {}
            }
        }
    }
    let root = a.world_dir.join("data").join("lootr");
    let mut files = Vec::new();
    walk(&root, 0, &mut files);
    if files.is_empty() {
        return None;
    }
    let (mut inside, mut unread) = (0, 0);
    for path in &files {
        let Ok(Some(root)) = worlddata::read_nbt(path) else {
            unread += 1;
            continue;
        };
        let dim = root.at(&["data", "dimension"]).and_then(Value::as_str).unwrap_or(OVERWORLD);
        let coord = |key: &str| root.at(&["data", "position", key]).and_then(Value::as_i32);
        match (coord("X"), coord("Z")) {
            (Some(x), Some(z)) if a.dim(dim).is_some_and(|d| d.targets.contains(&(x >> 4, z >> 4))) => inside += 1,
            (Some(_), Some(_)) => {}
            _ => unread += 1,
        }
    }
    let unread = if unread > 0 { format!(" ({unread} could not be placed)") } else { String::new() };
    Some(line(Mark::Note, format!(
        "Lootr: {inside} of the {} opened loot containers on record are in chunks that are reset{unread}. Their files in data/lootr are left: a chest that comes back is a new container with its own id, so everyone can loot it again, and the old files are orphans nothing reads.",
        files.len()
    )))
}

/// What the run does to each store. `Err`: a store that lists things in reset
/// chunks cannot be reconciled, so the run does not start.
fn plan_stores(a: &Analysis) -> Result<Stores, String> {
    let mut out = Stores::default();
    plan_waystones(a, &mut out)?;
    for d in &a.dims {
        plan_ore_deposits(a, d, &mut out)?;
        plan_mca(a, d, &mut out)?;
    }
    out.lines.extend(lootr_line(a));
    Ok(out)
}

// =============================================================================
// The world edits ([`super::edits`])
// =============================================================================

/// A file that leaves the world whole for an edit (a stronghold cache, a
/// player's file).
#[derive(Debug, Clone)]
struct EditMove {
    path: PathBuf,
    rel: String,
    detail: String,
}

/// A region file whose kept chunks are marked for blending.
#[derive(Debug, Clone)]
struct Blend {
    path: PathBuf,
    /// The slots to retag.
    slots: BTreeSet<u16>,
}

#[derive(Default)]
struct WorldEdits {
    stores: Vec<StoreEdit>,
    moves: Vec<EditMove>,
    blends: Vec<Blend>,
    lines: Vec<Line>,
    /// Counts only, for the run's done line.
    summary: Vec<String>,
}

/// The seed the plan was made under, against the world's now.
fn seed_lines(plan: &ApprovedPlan, a: &Analysis) -> Vec<Line> {
    match (plan.seed, a.level.seed) {
        // No numbers: a refusal goes to the audit log, which leaves the box.
        (Some(was), Some(is)) if was != is => vec![line(
            Mark::Stop,
            "The world's seed is not the one this plan was made under: what it says about the land is about another seed (a seed changed by hand, or a world put back). Make a new dry-run.",
        )],
        (Some(_), None) => vec![line(Mark::Stop, "level.dat has no seed now, and the plan was made under one: make a new dry-run.")],
        _ => Vec::new(),
    }
}

/// What the plan changes besides chunks, worked out in memory. `Err`: an edit
/// that cannot be made as the plan says, so the run does not start.
fn plan_edits(a: &Analysis) -> Result<WorldEdits, String> {
    let e = &a.edits;
    let mut out = WorldEdits::default();
    if e.is_empty() {
        return Ok(out);
    }
    for text in e.describe(&a.reset_players) {
        out.lines.push(line(Mark::Note, text));
    }
    // level.dat and its copy: the seed, the spawn's height.
    let spawn_y = e.spawn_search.then_some(e.spawn_y);
    if e.new_seed.is_some() || spawn_y.is_some() {
        for name in ["level.dat", "level.dat_old"] {
            let path = a.world_dir.join(name);
            let Some(raw) = read_optional(&path)? else {
                if name == "level.dat" {
                    return Err("there is no level.dat".to_string());
                }
                continue;
            };
            let doc = edits::edit_level(&raw, e.new_seed, spawn_y).map_err(|why| format!("{name}: {why}"))?;
            // No seed in the detail: it goes to the audit log, which leaves the box.
            let mut what = Vec::new();
            if e.new_seed.is_some() {
                what.push("seed changed".to_string());
            }
            if let Some(y) = spawn_y {
                what.push(format!("SpawnY -> {y}"));
            }
            out.stores.push(finish_edit(a, path, raw, &doc, what.join(", "))?);
        }
        out.summary.push(if e.new_seed.is_some() { "seed changed".to_string() } else { "spawn height set".to_string() });
    }
    if e.new_seed.is_some() {
        let caches = edits::stronghold_caches(&a.world_dir);
        for path in &caches {
            out.moves.push(EditMove { rel: rel_of(&a.server_dir, path)?, path: path.clone(), detail: "ModernFix's stronghold positions of the old seed".to_string() });
        }
        out.lines.push(line(Mark::Note, format!("ModernFix: {} stronghold cache file(s) of the old seed move to the holding folder; the game works the rings out again from the new seed.", caches.len())));
        let path = a.world_dir.join(edits::PUPFISH_STORE);
        match read_optional(&path)? {
            Some(raw) => match edits::edit_pupfish(&raw).map_err(|why| format!("{}: {why}", edits::PUPFISH_STORE))? {
                Some(doc) => {
                    out.stores.push(finish_edit(a, path, raw, &doc, "PupfishChunkX/Z removed".to_string())?);
                    out.lines.push(line(Mark::Note, "Alex's Mobs: the pupfish chunk of the old seed is removed; the mod picks one again from the new seed."));
                }
                None => out.lines.push(line(Mark::Ok, "Alex's Mobs: no pupfish chunk on record.")),
            },
            None => {}
        }
        out.summary.push(format!("{} stronghold cache(s) moved", caches.len()));
    }
    if e.spawn_search {
        let path = a.world_dir.join(edits::KUBEJS_DATA);
        match read_optional(&path)? {
            Some(raw) => match edits::edit_spawn_markers(&raw).map_err(|why| format!("{}: {why}", edits::KUBEJS_DATA))? {
                Some((doc, gone)) => {
                    out.lines.push(line(Mark::Note, format!("Spawn: the markers {} are removed from {}; the pack's spawn search runs again at the next start.", gone.join(", "), edits::KUBEJS_DATA)));
                    out.stores.push(finish_edit(a, path, raw, &doc, format!("{} spawn marker(s) removed", gone.len()))?);
                    out.summary.push(format!("{} spawn marker(s) removed", gone.len()));
                }
                None => out.lines.push(line(Mark::Note, format!("Spawn: no spawn marker is set in {}; the search runs at the next start anyway.", edits::KUBEJS_DATA))),
            },
            None => out.lines.push(line(Mark::Note, format!("Spawn: there is no {}; the search runs at the next start anyway.", edits::KUBEJS_DATA))),
        }
    }
    if !e.reset_players.is_empty() {
        let mut moved = 0;
        for uuid in &e.reset_players {
            let files = edits::player_files(&a.world_dir, uuid);
            if files.is_empty() {
                return Err(format!("the player file playerdata/{}... of a player who starts over is not there", edits::short(uuid)));
            }
            for path in files {
                out.moves.push(EditMove { rel: rel_of(&a.server_dir, &path)?, path, detail: "the file of a player who starts over".to_string() });
                moved += 1;
            }
        }
        out.summary.push(format!("{moved} player file(s) of {} player(s) moved", e.reset_players.len()));
        for (rel, path) in edits::PLAYER_STORES {
            let file = rel.split('/').fold(a.world_dir.clone(), |p, part| p.join(part));
            let Some(raw) = read_optional(&file)? else { continue };
            if let Some((doc, gone)) = edits::edit_player_store(&raw, path, &e.reset_players).map_err(|why| format!("{rel}: {why}"))? {
                out.stores.push(finish_edit(a, file, raw, &doc, format!("{gone} entry(ies) of players who start over removed"))?);
                out.summary.push(format!("{rel}: {gone} entry(ies) removed"));
            }
        }
    }
    if e.blend {
        let dir = a.dim(OVERWORLD).map(|d| d.dim.store_dir(Store::Region));
        match (&a.blend, dir) {
            (Some(scan), Some(dir)) => {
                for (name, slots) in &scan.files {
                    out.blends.push(Blend { path: dir.join(name), slots: slots.clone() });
                }
                out.lines.push(line(Mark::Note, format!(
                    "Blending: {} kept overworld chunk(s) in {} region file(s) are rewritten in place with {} = {} (every other byte of them as it was); {} kept chunk(s) are old to Tectonic already{}.",
                    num(scan.tagged),
                    scan.files.len(),
                    edits::TECTONIC_TAG,
                    edits::TECTONIC_OLD,
                    num(scan.untagged),
                    if scan.external > 0 { format!(", {} oversized ones are left as they are", scan.external) } else { String::new() }
                )));
                out.summary.push(format!("{} kept chunk(s) marked for blending", scan.tagged));
            }
            _ => out.lines.push(line(Mark::Note, "Blending: the overworld is not part of this run, so nothing is marked.")),
        }
    }
    Ok(out)
}

// =============================================================================
// Looking a plan over (read-only)
// =============================================================================

/// Everything a run needs to know before it starts, and everything the
/// operator is shown: the lines, the files, the store edits.
struct Inspection {
    lines: Vec<Line>,
    files: Vec<FileOp>,
    stores: Vec<StoreEdit>,
    edits: WorldEdits,
}

fn inspect(cfg: &ServerConfig, a: &Analysis, pregen: Pregen, plan: &ApprovedPlan) -> Inspection {
    let mut lines: Vec<Line> = seed_lines(plan, a);
    lines.extend(target_stops(a).into_iter().map(|why| line(Mark::Stop, why)));
    lines.extend(pregen_lines(cfg, pregen));

    let files = match plan_files(a) {
        Ok(files) => files,
        Err(why) => {
            lines.push(line(Mark::Stop, why));
            Vec::new()
        }
    };
    let (mut whole, mut partial, mut external, mut moved_bytes) = ([0usize; 3], [0usize; 3], 0usize, 0u64);
    let mut copy_bytes = 0u64;
    for op in &files {
        match op.kind {
            FileKind::Whole => {
                whole[store_slot(op.store)] += 1;
                moved_bytes += op.bytes;
            }
            FileKind::Partial(_) => {
                partial[store_slot(op.store)] += 1;
                copy_bytes += op.bytes;
            }
            FileKind::External => {
                external += 1;
                moved_bytes += op.bytes;
            }
        }
    }
    if !files.is_empty() {
        lines.push(line(Mark::Note, format!(
            "Region files: {} / {} / {} (region / entities / poi) hold only chunks that are reset and are moved whole to the holding folder ({}); {} / {} / {} keep some chunks and are rewritten with the reset chunks cleared, the original copied to the holding folder first ({}).{}",
            whole[0], whole[1], whole[2],
            backup::fmt_bytes(moved_bytes),
            partial[0], partial[1], partial[2],
            backup::fmt_bytes(copy_bytes),
            if external > 0 { format!(" {external} oversized-chunk file(s) (.mcc) of reset chunks are moved with them.") } else { String::new() }
        )));
    }

    let stores = match plan_stores(a) {
        Ok(stores) => {
            lines.extend(stores.lines);
            stores.edits
        }
        Err(why) => {
            lines.push(line(Mark::Stop, format!("A mod's saved data cannot be reconciled, so the run does not start: {why}")));
            Vec::new()
        }
    };
    copy_bytes += stores.iter().map(|s| s.original.len() as u64).sum::<u64>();

    let edits = match plan_edits(a) {
        Ok(edits) => {
            lines.extend(edits.lines.iter().cloned());
            edits
        }
        Err(why) => {
            lines.push(line(Mark::Stop, format!("A world edit of the plan cannot be made, so the run does not start: {why}")));
            WorldEdits::default()
        }
    };
    copy_bytes += edits.stores.iter().map(|s| s.original.len() as u64).sum::<u64>();
    for b in &edits.blends {
        if !files.iter().any(|op| op.path == b.path) {
            copy_bytes += fs::metadata(&b.path).map_or(0, |m| m.len());
        }
    }

    if let Some(free) = backup::free_space(&cfg.server_dir) {
        if free < copy_bytes + FREE_SPACE_MARGIN {
            lines.push(line(Mark::Stop, format!(
                "Not enough free disk space for the holding folder: {} free, {} needed.",
                backup::fmt_bytes(free),
                backup::fmt_bytes(copy_bytes + FREE_SPACE_MARGIN)
            )));
        }
    }
    Inspection { lines, files, stores, edits }
}

/// What the worldgen settings are, as far as the launcher knows: a
/// regeneration only shows a rebalance if they were changed first.
fn worldgen_lines(cfg: &ServerConfig, plan: &ApprovedPlan) -> Vec<Line> {
    let mut out = Vec::new();
    let overrides = match crate::overrides::Store::load(&cfg.server_dir) {
        Ok(store) => store.overrides,
        Err(why) => {
            out.push(line(Mark::Note, format!("Worldgen settings: the override list does not read ({why}).")));
            Vec::new()
        }
    };
    let record: serde_json::Value = fs::read(cfg.world_dir().join(crate::overrides::WORLD_MANIFEST))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(serde_json::Value::Null);
    let changes = record["config_changes"].as_array().map_or(0, Vec::len);
    let last_regen = record[WORLD_RECORD_KEY].as_array().and_then(|list| list.last()).and_then(|r| r["at"].as_str()).map(str::to_string);
    // Only the files that shape terrain: a whitelist switch is an override too.
    let catalog: BTreeSet<String> = crate::worldgen::files(cfg).into_iter().map(|f| f.rel.to_ascii_lowercase()).collect();
    let own: Vec<&crate::overrides::Override> = overrides.iter().filter(|o| catalog.contains(&o.file.to_ascii_lowercase())).collect();
    let files: BTreeSet<&str> = own.iter().map(|o| o.file.as_str()).collect();
    let mut since = match &last_regen {
        Some(at) => format!(" The last regeneration of this world was {at}."),
        None => " This world has not been regenerated before.".to_string(),
    };
    if let Some(last) = record[SEED_RECORD_KEY].as_array().and_then(|list| list.last()) {
        since.push_str(&format!(
            " Its seed was changed by the launcher on {}: chunks generated before that come back as different land.",
            last["at"].as_str().unwrap_or("?")
        ));
    }
    if let Some(seed) = plan.edits.new_seed {
        out.push(line(Mark::Note, format!(
            "Worldgen: this plan changes the seed to {seed}. The reset chunks are generated from the NEW seed at the next server start: different land, rivers, biomes and structures; the kept chunks keep theirs, and where the two meet is a seam (blending {}).{since}",
            if plan.edits.blend { "on: Tectonic bends the new land toward the kept chunks" } else { "off: expect steps and cut rivers at the line" }
        )));
        return out;
    }
    if own.is_empty() && changes == 0 {
        out.push(line(Mark::Note, format!(
            "Worldgen settings: this server has NO worldgen value of its own (Worldgen settings page), and none has been changed through the launcher since the world was made. Unless the pack's own worldgen files changed since these chunks were generated, they will come back by the SAME rules: same seed, same terrain, no rebalance to see. If a rebalance is the point, set its values first.{since}"
        )));
    } else {
        out.push(line(Mark::Note, format!(
            "Worldgen settings: {} worldgen value(s) of this server's own in {} file(s) are in force, and {changes} change(s) of value are on this world's record. The reset chunks are generated by the rules as they stand at the next server start; kept chunks keep the terrain they have, so a border shows where the rules differ.{since}",
            own.len(),
            files.len()
        )));
    }
    out
}

fn sample(list: &[(String, ChunkPos)]) -> Vec<String> {
    list.iter().take(12).map(|(dim, (x, z))| format!("{dim} ({x}, {z})")).collect()
}

/// The approved plan against the plan as it comes out now.
fn compare(plan: &ApprovedPlan, a: &Analysis, lines: Vec<Line>) -> Preflight {
    let mut added: Vec<(String, ChunkPos)> = Vec::new();
    let mut removed: Vec<(String, ChunkPos)> = Vec::new();
    let empty = BTreeSet::new();
    for d in &a.dims {
        let approved = plan.chunks.get(&d.dim.id).unwrap_or(&empty);
        added.extend(d.targets.difference(approved).map(|c| (d.dim.id.clone(), *c)));
        removed.extend(approved.difference(&d.targets).map(|c| (d.dim.id.clone(), *c)));
    }
    for (id, approved) in &plan.chunks {
        if a.dim(id).is_none() {
            removed.extend(approved.iter().map(|c| (id.clone(), *c)));
        }
    }
    let current_hash = hash_of(a);
    let on_disk: usize = a.dims.iter().map(|d| d.scan.chunks.len()).sum();
    let targets = a.total_targets();
    Preflight {
        run_name: plan.run_name.clone(),
        scope: plan.scope.clone(),
        approved_hash: plan.hash.clone(),
        same_plan: current_hash == plan.hash,
        current_hash,
        added: added.len(),
        removed: removed.len(),
        added_sample: sample(&added),
        removed_sample: sample(&removed),
        new_run: None,
        on_disk,
        targets,
        kept: on_disk - targets,
        lines,
    }
}

/// When the plan changed: a fresh dry-run of the same question, so there is a
/// map and a report of the plan as it is now. Its folder's name.
fn fresh_dry_run(cfg: &ServerConfig, plan: &ApprovedPlan) -> Option<String> {
    match super::run(cfg, &plan.spec) {
        Ok(summary) => summary.out_dir.file_name().map(|n| n.to_string_lossy().into_owned()),
        Err(why) => {
            log::warn!("[regen] the fresh dry-run could not be written: {why}");
            None
        }
    }
}

fn sentence(text: String) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => text,
    }
}

/// What the fidelity harness says of a plan before a run: its self-test, and
/// (with the server stopped, when what is on disk is what a run would meet)
/// the plan against the protection map as it derives it now.
fn fidelity_lines(cfg: &ServerConfig, plan: &ApprovedPlan, running: bool) -> Vec<Line> {
    let mut out = Vec::new();
    let checked = fidelity::Plan::of(plan, &fidelity::author_label(&plan.run_dir));
    let world = cfg.world_dir();
    let test = fidelity::self_test(&world, &checked);
    out.push(if test.passed() {
        line(Mark::Ok, format!("{}. The run repeats it before it begins.", sentence(test.line())))
    } else {
        line(Mark::Stop, format!("{}. A harness that cannot catch a planted violation cannot vouch for a run, so the run is refused.", sentence(test.line())))
    });
    if running {
        out.push(line(Mark::Note, "The fidelity harness holds the plan against the protection map, and records the world chunk by chunk, once the server is stopped."));
        return out;
    }
    out.push(match fidelity::before(&world, &checked) {
        Ok(before) => match before.refusal() {
            None => line(Mark::Ok, format!("{}. After the changes it reads the world again and holds it against this record; a FAIL puts everything back.", sentence(before.line()))),
            Some(why) => line(Mark::Stop, sentence(why)),
        },
        Err(why) => line(Mark::Stop, format!("The fidelity harness cannot read what it needs, so it cannot vouch for a run: {why}")),
    });
    out
}

/// Look a dry-run's plan over against the world as it is now. Reads only, and
/// is safe while the server runs (then it says so: a run needs it stopped).
/// If the plan has changed, a fresh dry-run is written and named.
pub fn preflight(cfg: &ServerConfig, run_dir: &Path) -> Result<Preflight, String> {
    let plan = load_plan(run_dir)?;
    let a = analyse(cfg, &plan.spec)?;
    if a.level_name != plan.level_name {
        return Err(format!("the plan was made for the world '{}', and this server's world is '{}'", plan.level_name, a.level_name));
    }
    let mut lines = Vec::new();
    let running = crate::run::jvm_active() || backup::world_in_use(cfg);
    if running {
        lines.push(line(Mark::Stop, "The server is running. Stop it first (Server tab: Stop, and wait for 'idle'): a regeneration needs the world closed, and what is on disk now may be one autosave behind."));
    } else {
        lines.push(line(Mark::Ok, "The server is stopped and nothing has the world open."));
    }
    if marker_present(&cfg.server_dir) {
        lines.push(line(Mark::Stop, format!("An earlier regeneration was left unfinished ({MARKER_FILE}). Roll it back first.")));
    }
    let inspection = inspect(cfg, &a, Pregen::Off, &plan);
    lines.extend(inspection.lines);
    lines.extend(fidelity_lines(cfg, &plan, running));
    lines.push(match backup::pinned_candidate(cfg) {
        Some(entry) => line(Mark::Ok, format!(
            "Backup: {} (sha256 {}) is a pinned backup of the world exactly as it is now. The run verifies it again and uses it.",
            entry.file, entry.sha256
        )),
        None => line(Mark::Note, "Backup: no pinned backup of the world as it is now exists yet. The run takes one first and does not go on unless it verifies. To see it on your own PC before approving, take it now ('Take the backup now')."),
    });
    lines.extend(worldgen_lines(cfg, &plan));
    let mut out = compare(&plan, &a, lines);
    if !out.same_plan {
        out.new_run = fresh_dry_run(cfg, &plan);
    }
    Ok(out)
}

// =============================================================================
// The holding folder
// =============================================================================

/// One file a run took out of the world or changed in it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct HeldFile {
    /// `move`: the file left the world and is in the holding folder.
    /// `replace`: it was rewritten in place and its original is there.
    /// `create`: the run made a file that was not there before.
    pub kind: String,
    /// Relative to the server dir, with `/`.
    pub rel: String,
    /// Of the original (nothing for `create`).
    pub size: u64,
    pub sha256: String,
    /// Of what the run wrote in its place (`replace`, `create`).
    pub new_sha256: String,
    pub detail: String,
}

/// `holding.json`: the record a rollback works from.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Holding {
    pub format: String,
    pub version: u32,
    /// `started`, `complete`, `failed` (and put back), `rolled-back`.
    pub state: String,
    pub started_utc: String,
    pub finished_utc: String,
    pub by: String,
    pub run_name: String,
    pub plan_hash: String,
    pub scope: String,
    pub level_name: String,
    pub chunks_reset: usize,
    pub chunks_kept: usize,
    pub backup_file: String,
    pub backup_sha256: String,
    pub backup_reused: bool,
    pub files: Vec<HeldFile>,
    /// The world's fingerprint when the run finished. A rollback is exact for
    /// as long as it still holds.
    pub end_fingerprint: String,
    pub note: String,
}

fn save_holding(dir: &Path, holding: &Holding) -> Result<(), String> {
    let mut body = serde_json::to_string_pretty(holding).map_err(|e| e.to_string())?;
    body.push('\n');
    anvil::replace_file(&dir.join(HOLDING_FILE), body.as_bytes()).map_err(|e| format!("{HOLDING_FILE} could not be written: {e}"))
}

fn load_holding(dir: &Path) -> Result<Holding, String> {
    let raw = fs::read(dir.join(HOLDING_FILE)).map_err(|e| format!("{HOLDING_FILE}: {e}"))?;
    let holding: Holding = serde_json::from_slice(&raw).map_err(|e| format!("{HOLDING_FILE} does not parse ({e})"))?;
    if holding.format != HOLDING_FORMAT || holding.version != HOLDING_VERSION {
        return Err(format!("{HOLDING_FILE} is not a version {HOLDING_VERSION} holding record"));
    }
    Ok(holding)
}

/// A holding folder, for a list.
#[derive(Debug, Clone)]
pub struct HoldingEntry {
    /// `20261012-031500-5a903c26`
    pub name: String,
    pub dir: PathBuf,
    /// `None`: the folder has no readable record.
    pub record: Option<Holding>,
    /// Bytes of what it holds.
    pub bytes: u64,
}

fn dir_bytes(dir: &Path) -> u64 {
    let mut total = 0;
    for entry in fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()) {
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => total += dir_bytes(&entry.path()),
            Ok(kind) if kind.is_file() => total += entry.metadata().map_or(0, |m| m.len()),
            _ => {}
        }
    }
    total
}

/// The holding folders under `<server dir>/regen-holding`, newest first.
pub fn holdings(server_dir: &Path) -> Vec<HoldingEntry> {
    let mut out: Vec<HoldingEntry> = fs::read_dir(server_dir.join(HOLDING_DIR))
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map_or(false, |t| t.is_dir()))
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            let dir = e.path();
            Some(HoldingEntry { record: load_holding(&dir).ok(), bytes: dir_bytes(&dir), name, dir })
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

fn marker_present(server_dir: &Path) -> bool {
    fs::metadata(server_dir.join(MARKER_FILE)).is_ok()
}

/// Called before every JVM start (`run::launch_server_inner`, inside the
/// launch gate): `Err` means do not start. Only an unfinished regeneration
/// refuses, that is, the launcher died or failed half-way through one; the
/// run itself holds the launch gate, so a start can never meet one in flight.
/// The reason goes where the other start refusal goes
/// ([`crate::overrides::REFUSED_FILE`]), so `verify-server.ps1` shows it.
pub fn start_guard(cfg: &ServerConfig) -> Result<(), String> {
    if !marker_present(&cfg.server_dir) {
        return Ok(());
    }
    let why = format!(
        "a world regeneration was left unfinished ({MARKER_FILE} is there): some chunks are reset and some are not. Roll it back on the Customizer tab (Regenerate page), then start the server"
    );
    log::error!("[regen] !!! THE SERVER IS NOT STARTED: {why}");
    let body = format!(
        "# The launcher refused to start the server. Removed by the next start it allows.\nrefused_unix={}\nrefused={}\nwhy={why}\n",
        unix_now(),
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S %:z")
    );
    if let Err(e) = fs::write(cfg.server_dir.join(crate::overrides::REFUSED_FILE), body) {
        log::warn!("[regen] {} could not be written: {e}", crate::overrides::REFUSED_FILE);
    }
    Err(why)
}

// =============================================================================
// Carrying it out
// =============================================================================

/// Size and modified time of every region file of the analysed dimensions.
fn region_stamps(a: &Analysis) -> BTreeMap<PathBuf, (u64, Option<SystemTime>)> {
    let mut out = BTreeMap::new();
    for d in &a.dims {
        for f in &d.scan.files {
            let path = d.dim.store_dir(f.store).join(&f.name);
            if let Ok(md) = fs::metadata(&path) {
                out.insert(path, (md.len(), md.modified().ok()));
            }
        }
    }
    out
}

fn write_synced(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

/// A region file rewritten in place: the plan's chunks cleared from it, its
/// kept chunks marked for blending, or both. The original, and what replaces it.
struct Rewrite {
    /// Its entry in the holding record's file list.
    held: usize,
    path: PathBuf,
    rel: String,
    original: Vec<u8>,
    modified: Option<SystemTime>,
    /// The original with the plan's chunks cleared (the original itself for a
    /// file the plan only marks for blending).
    cleared: Vec<u8>,
    /// `cleared` with the blending mark: what is written.
    updated: Vec<u8>,
    /// The plan's slots in it.
    drop: BTreeSet<u16>,
    /// The kept slots marked for blending.
    retag: BTreeSet<u16>,
    /// Chunks that stay in it.
    kept: usize,
}

/// `cleared` with the blending mark on `slots`, checked by the run's own
/// re-reading before anything relies on it.
fn retagged(rel: &str, cleared: &[u8], slots: &BTreeSet<u16>) -> Result<Vec<u8>, String> {
    if slots.is_empty() {
        return Ok(cleared.to_vec());
    }
    let updated = edits::retag(cleared, slots).map_err(|e| format!("{rel}: the blending mark cannot be set ({e})"))?;
    edits::check_retagged(cleared, &updated, slots).map_err(|e| format!("{rel}: the file with the blending mark is not right ({e})"))?;
    Ok(updated)
}

/// The work of one run, prepared in memory before anything is changed.
struct Prepared {
    record: Holding,
    rewrites: Vec<Rewrite>,
}

/// Hash what will move, build what will replace, and list it all. Nothing is
/// changed yet. The order of `record.files`: the plan's files, then the store
/// edits, then the world record.
fn prepare(cfg: &ServerConfig, plan: &ApprovedPlan, a: &Analysis, inspection: &Inspection, pinned: &backup::Pinned, by: &str) -> Result<Prepared, String> {
    let mut files = Vec::new();
    let mut rewrites = Vec::new();
    let blend_of = |path: &Path| inspection.edits.blends.iter().find(|b| b.path == path).map(|b| b.slots.clone()).unwrap_or_default();
    for (index, op) in inspection.files.iter().enumerate() {
        match &op.kind {
            FileKind::Whole | FileKind::External => {
                let sha256 = sha256_file(&op.path).map_err(|e| format!("{}: {e}", op.rel))?;
                let size = fs::metadata(&op.path).map_err(|e| format!("{}: {e}", op.rel))?.len();
                let detail = if op.kind == FileKind::External { "the data of an oversized chunk that is reset".to_string() } else { format!("all {} chunk(s) in it are reset", op.of) };
                files.push(HeldFile { kind: "move".to_string(), rel: op.rel.clone(), size, sha256, new_sha256: String::new(), detail });
            }
            FileKind::Partial(drop) => {
                let original = fs::read(&op.path).map_err(|e| format!("{}: {e}", op.rel))?;
                let cleared = anvil::clear_chunks(&original, drop).map_err(|e| format!("{}: {e}", op.rel))?;
                if cleared.removed.len() != op.hit || cleared.kept != op.of - op.hit {
                    return Err(format!(
                        "{}: clearing would remove {} chunk(s) and keep {}, where the plan has {} and {}",
                        op.rel,
                        cleared.removed.len(),
                        cleared.kept,
                        op.hit,
                        op.of - op.hit
                    ));
                }
                anvil::check_cleared(&original, &cleared.bytes, drop).map_err(|e| format!("{}: the rewritten file is not right ({e})", op.rel))?;
                let retag = blend_of(&op.path);
                let updated = retagged(&op.rel, &cleared.bytes, &retag)?;
                let marked = if retag.is_empty() { String::new() } else { format!(", {} kept chunk(s) marked for blending", retag.len()) };
                files.push(HeldFile {
                    kind: "replace".to_string(),
                    rel: op.rel.clone(),
                    size: original.len() as u64,
                    sha256: sha256_bytes(&original),
                    new_sha256: sha256_bytes(&updated),
                    detail: format!("{} of {} chunk(s) cleared{marked}", op.hit, op.of),
                });
                let modified = fs::metadata(&op.path).and_then(|md| md.modified()).ok();
                rewrites.push(Rewrite {
                    held: index,
                    path: op.path.clone(),
                    rel: op.rel.clone(),
                    original,
                    modified,
                    cleared: cleared.bytes,
                    updated,
                    drop: drop.clone(),
                    retag,
                    kept: op.of - op.hit,
                });
            }
        }
    }
    for store in inspection.stores.iter().chain(inspection.edits.stores.iter()) {
        files.push(HeldFile {
            kind: "replace".to_string(),
            rel: store.rel.clone(),
            size: store.original.len() as u64,
            sha256: sha256_bytes(&store.original),
            new_sha256: sha256_bytes(&store.updated),
            detail: store.detail.clone(),
        });
    }
    for m in &inspection.edits.moves {
        let sha256 = sha256_file(&m.path).map_err(|e| format!("{}: {e}", m.rel))?;
        let size = fs::metadata(&m.path).map_err(|e| format!("{}: {e}", m.rel))?.len();
        files.push(HeldFile { kind: "move".to_string(), rel: m.rel.clone(), size, sha256, new_sha256: String::new(), detail: m.detail.clone() });
    }
    // Region files the plan does not touch but whose kept chunks are marked.
    for b in inspection.edits.blends.iter().filter(|b| !inspection.files.iter().any(|op| op.path == b.path)) {
        let rel = rel_of(&cfg.server_dir, &b.path)?;
        let original = fs::read(&b.path).map_err(|e| format!("{rel}: {e}"))?;
        let kept = anvil::header_slots(&original).len();
        let updated = retagged(&rel, &original, &b.slots)?;
        files.push(HeldFile {
            kind: "replace".to_string(),
            rel: rel.clone(),
            size: original.len() as u64,
            sha256: sha256_bytes(&original),
            new_sha256: sha256_bytes(&updated),
            detail: format!("{} kept chunk(s) marked for blending", b.slots.len()),
        });
        let modified = fs::metadata(&b.path).and_then(|md| md.modified()).ok();
        rewrites.push(Rewrite {
            held: files.len() - 1,
            path: b.path.clone(),
            rel,
            cleared: original.clone(),
            original,
            modified,
            updated,
            drop: BTreeSet::new(),
            retag: b.slots.clone(),
            kept,
        });
    }
    // The run's own entry in the world's record: written last, listed now.
    let record_path = cfg.world_dir().join(crate::overrides::WORLD_MANIFEST);
    let record_rel = rel_of(&cfg.server_dir, &record_path)?;
    files.push(match read_optional(&record_path)? {
        Some(original) => HeldFile {
            kind: "replace".to_string(),
            rel: record_rel,
            size: original.len() as u64,
            sha256: sha256_bytes(&original),
            new_sha256: String::new(),
            detail: "this run added to its 'regenerations' list".to_string(),
        },
        None => HeldFile { kind: "create".to_string(), rel: record_rel, detail: "the world's record, started by this run".to_string(), ..HeldFile::default() },
    });

    let targets = a.total_targets();
    let on_disk: usize = a.dims.iter().map(|d| d.scan.chunks.len()).sum();
    let record = Holding {
        format: HOLDING_FORMAT.to_string(),
        version: HOLDING_VERSION,
        state: "started".to_string(),
        started_utc: utc_now(),
        finished_utc: String::new(),
        by: by.to_string(),
        run_name: plan.run_name.clone(),
        plan_hash: plan.hash.clone(),
        scope: plan.scope.clone(),
        level_name: plan.level_name.clone(),
        chunks_reset: targets,
        chunks_kept: on_disk - targets,
        backup_file: pinned.entry.file.clone(),
        backup_sha256: pinned.entry.sha256.clone(),
        backup_reused: pinned.reused,
        files,
        end_fingerprint: String::new(),
        note: String::new(),
    };
    Ok(Prepared { record, rewrites })
}

/// The original of a file about to be rewritten, into the holding folder, and
/// read back before anything relies on it. The copy is given the original's
/// modified time: put back, the file is then the old one in every way the
/// world's fingerprint looks at, and a backup taken before the run still
/// stands for the world after a rollback.
fn hold_copy(holding: &Path, held: &HeldFile, original: &[u8], modified: Option<SystemTime>) -> Result<(), String> {
    let copy = under(&holding.join(HELD_FILES_DIR), &held.rel)?;
    write_synced(&copy, original).map_err(|e| format!("{}: its original could not be kept ({e})", held.rel))?;
    if let Some(when) = modified {
        let stamped = fs::OpenOptions::new().write(true).open(&copy).and_then(|file| file.set_modified(when));
        if let Err(e) = stamped {
            log::warn!("[regen] the copy kept of {} could not be given its original's time ({e})", held.rel);
        }
    }
    match sha256_file(&copy) {
        Ok(sha) if sha == held.sha256 => Ok(()),
        Ok(_) => Err(format!("{}: the copy kept of its original does not read back the same", held.rel)),
        Err(e) => Err(format!("{}: the copy kept of its original does not read back ({e})", held.rel)),
    }
}

/// Step 5: change the world. Each file's original is in the holding folder
/// before the file is touched.
fn apply(cfg: &ServerConfig, holding: &Path, inspection: &Inspection, prepared: &Prepared) -> Result<(), String> {
    let dir = &cfg.server_dir;
    let files = &prepared.record.files;
    // Rewrites first, while the least has changed: they are the delicate part.
    for rewrite in &prepared.rewrites {
        let held = &files[rewrite.held];
        hold_copy(holding, held, &rewrite.original, rewrite.modified)?;
        anvil::replace_file(&rewrite.path, &rewrite.updated).map_err(|e| format!("{}: could not be rewritten ({e})", rewrite.rel))?;
    }
    audit(dir, log::Level::Info, &format!("{} region file(s) rewritten with their reset chunks cleared", prepared.rewrites.len()));
    let mut moved = 0;
    for (index, op) in inspection.files.iter().enumerate() {
        if matches!(op.kind, FileKind::Partial(_)) {
            continue;
        }
        let to = under(&holding.join(HELD_FILES_DIR), &files[index].rel)?;
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        anvil::rename_retrying(&op.path, &to).map_err(|e| format!("{}: could not be moved to the holding folder ({e})", op.rel))?;
        moved += 1;
    }
    audit(dir, log::Level::Info, &format!("{moved} file(s) moved whole to the holding folder"));
    for (n, store) in inspection.stores.iter().chain(inspection.edits.stores.iter()).enumerate() {
        let held = &files[inspection.files.len() + n];
        hold_copy(holding, held, &store.original, store.modified)?;
        anvil::replace_file(&store.path, &store.updated).map_err(|e| format!("{}: could not be rewritten ({e})", store.rel))?;
        audit(dir, log::Level::Info, &format!("{}: {}", store.rel, store.detail));
    }
    // Files that leave the world for an edit. Counts only in the log: a
    // player's file is named after the player's UUID.
    let first = inspection.files.len() + inspection.stores.len() + inspection.edits.stores.len();
    for (n, m) in inspection.edits.moves.iter().enumerate() {
        let to = under(&holding.join(HELD_FILES_DIR), &files[first + n].rel)?;
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
        }
        anvil::rename_retrying(&m.path, &to).map_err(|e| format!("a file moved for a world edit could not be moved ({e})"))?;
    }
    if !inspection.edits.moves.is_empty() {
        audit(dir, log::Level::Info, &format!("{} file(s) moved to the holding folder for the world edits", inspection.edits.moves.len()));
    }
    Ok(())
}

/// Step 6: read the world again and hold it against what was meant.
fn verify(a: &Analysis, holding: &Path, inspection: &Inspection, prepared: &Prepared, stamps: &BTreeMap<PathBuf, (u64, Option<SystemTime>)>) -> Result<(), String> {
    // The chunk lists, through the same reader the plan was made with.
    for d in &a.dims {
        let now = anvil::scan_dimension(&d.dim);
        if let Some(f) = now.files.iter().find(|f| f.error.is_some()) {
            return Err(format!("{} in {} does not read after the run", f.name, d.dim.id));
        }
        for (pos, was) in &d.scan.chunks {
            match (d.targets.contains(pos), now.chunks.get(pos)) {
                (true, Some(_)) => return Err(format!("chunk {pos:?} of {} was to be reset and is still on disk", d.dim.id)),
                (true, None) => {}
                (false, None) => return Err(format!("chunk {pos:?} of {} was to stay and is gone", d.dim.id)),
                (false, Some(is)) => {
                    let same_folders = Store::ALL.iter().all(|s| was.in_store(*s) == is.in_store(*s));
                    if !same_folders || was.inhabited != is.inhabited || was.unreadable.is_some() != is.unreadable.is_some() {
                        return Err(format!("chunk {pos:?} of {} was to stay and does not read as it did", d.dim.id));
                    }
                }
            }
        }
        if let Some(pos) = now.chunks.keys().find(|pos| !d.scan.chunks.contains_key(*pos)) {
            return Err(format!("chunk {pos:?} of {} is on disk and was not before", d.dim.id));
        }
    }
    // The rewritten files, from disk, against their originals in the holding folder.
    for rewrite in &prepared.rewrites {
        let kept_copy = fs::read(under(&holding.join(HELD_FILES_DIR), &rewrite.rel)?).map_err(|e| format!("{}: its original in the holding folder does not read ({e})", rewrite.rel))?;
        let on_disk = fs::read(&rewrite.path).map_err(|e| format!("{}: {e}", rewrite.rel))?;
        if on_disk != rewrite.updated {
            return Err(format!("{} is not what was written", rewrite.rel));
        }
        let kept = anvil::check_cleared(&kept_copy, &rewrite.cleared, &rewrite.drop).map_err(|e| format!("{}: {e}", rewrite.rel))?;
        if kept != rewrite.kept {
            return Err(format!("{}: {kept} chunk(s) stayed, where {} were to", rewrite.rel, rewrite.kept));
        }
        if !rewrite.retag.is_empty() {
            edits::check_retagged(&rewrite.cleared, &on_disk, &rewrite.retag).map_err(|e| format!("{}: {e}", rewrite.rel))?;
        }
    }
    // What was moved is in the holding folder, whole, and not in the world.
    for (index, op) in inspection.files.iter().enumerate() {
        if matches!(op.kind, FileKind::Partial(_)) {
            continue;
        }
        if op.path.exists() {
            return Err(format!("{} was to be moved and is still in the world", op.rel));
        }
        let held = &prepared.record.files[index];
        let there = sha256_file(&under(&holding.join(HELD_FILES_DIR), &held.rel)?).map_err(|e| format!("{}: not readable in the holding folder ({e})", held.rel))?;
        if there != held.sha256 {
            return Err(format!("{} is not in the holding folder as it was in the world", held.rel));
        }
    }
    for store in inspection.stores.iter().chain(inspection.edits.stores.iter()) {
        if fs::read(&store.path).map_err(|e| format!("{}: {e}", store.rel))? != store.updated {
            return Err(format!("{} is not what was written", store.rel));
        }
    }
    let first = inspection.files.len() + inspection.stores.len() + inspection.edits.stores.len();
    for (n, m) in inspection.edits.moves.iter().enumerate() {
        if m.path.exists() {
            return Err("a file moved for a world edit is still in the world".to_string());
        }
        let held = &prepared.record.files[first + n];
        let there = sha256_file(&under(&holding.join(HELD_FILES_DIR), &held.rel)?).map_err(|e| format!("a file moved for a world edit is not readable in the holding folder ({e})"))?;
        if there != held.sha256 {
            return Err("a file moved for a world edit is not in the holding folder as it was in the world".to_string());
        }
    }
    // And nothing else: every region file the plan does not name is as it was.
    let named: BTreeSet<&Path> = inspection.files.iter().map(|op| op.path.as_path()).chain(prepared.rewrites.iter().map(|r| r.path.as_path())).collect();
    for (path, was) in stamps {
        if named.contains(path.as_path()) {
            continue;
        }
        let is = fs::metadata(path).ok().map(|md| (md.len(), md.modified().ok()));
        if is.as_ref() != Some(was) {
            return Err(format!("{} is not part of the plan and has changed", path.display()));
        }
    }
    Ok(())
}

/// The run's entry for `<world>/.icraft_world.json`. Per dimension and region
/// file, the reset chunks as a bitmap (1,024 bits in hex, slot `z*32+x`, the
/// lowest slot in the first character's high bit): whatever the scope, that
/// is exact and stays small. A later run reads it to say which chunks on disk
/// were generated before which change of the worldgen settings.
fn world_record_entry(a: &Analysis, record: &Holding, report: &Report) -> serde_json::Value {
    let mut dims = Vec::new();
    for d in &a.dims {
        let mut regions: BTreeMap<(i32, i32), [u8; 128]> = BTreeMap::new();
        for pos in &d.targets {
            let slot = usize::from(anvil::slot_index(*pos));
            regions.entry(anvil::region_of(*pos)).or_insert([0u8; 128])[slot / 8] |= 0x80 >> (slot % 8);
        }
        let regions: serde_json::Map<String, serde_json::Value> = regions
            .iter()
            .map(|((rx, rz), bits)| (format!("r.{rx}.{rz}"), serde_json::Value::String(bits.iter().map(|b| format!("{b:02x}")).collect())))
            .collect();
        dims.push(serde_json::json!({
            "id": d.dim.id,
            "reset": d.targets.len(),
            "kept": d.scan.chunks.len() - d.targets.len(),
            "reset_chunks": regions,
        }));
    }
    let settings: Vec<serde_json::Value> = a.settings.to_pairs().into_iter().map(|(k, v)| serde_json::json!([k, v])).collect();
    serde_json::json!({
        "at": chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false),
        "by": record.by,
        "plan_hash": record.plan_hash,
        "scope": record.scope,
        "settings": settings,
        "chunks_reset": record.chunks_reset,
        "chunks_kept": record.chunks_kept,
        "dimensions": dims,
        "stores": report.stores,
        "backup": record.backup_file,
        "backup_sha256": record.backup_sha256,
        "holding": report.holding,
        "pregeneration": "off",
        "bitmap": "per region file r.<x>.<z>: 1024 bits in hex, slot z*32+x within the file, the first slot in the highest bit of the first byte; a set bit is a chunk this run reset",
        // The seed the reset chunks come back under (the world's, unless changed).
        "seed": a.edits.new_seed.or(a.level.seed).map_or(serde_json::Value::Null, |s| serde_json::Value::String(s.to_string())),
        "world_edits": a.edits.to_json(),
    })
}

/// The run's entry in the world's `seed_changes`, when it changed the seed.
fn seed_change_entry(a: &Analysis, record: &Holding) -> Option<serde_json::Value> {
    let seed = a.edits.new_seed?;
    let text = |s: Option<i64>| s.map_or(serde_json::Value::Null, |s| serde_json::Value::String(s.to_string()));
    Some(serde_json::json!({
        "at": chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false),
        "by": record.by,
        "plan_hash": record.plan_hash,
        "before": text(a.edits.seed_before),
        "after": text(Some(seed)),
        "backup": record.backup_file,
        "note": "level.dat and level.dat_old were given the new seed by a regeneration run; the chunks it kept carry the old seed's land",
    }))
}

/// Add the run to the world's record, keeping every other key of the file
/// (and its seed change, if it made one). Returns the SHA-256 of what was
/// written.
fn write_world_record(cfg: &ServerConfig, entry: serde_json::Value, seed_change: Option<serde_json::Value>) -> Result<String, String> {
    let name = crate::overrides::WORLD_MANIFEST;
    let path = cfg.world_dir().join(name);
    let mut root: serde_json::Value = match read_optional(&path)? {
        Some(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("{name} does not parse ({e}); it was left alone"))?,
        None => serde_json::json!({ "version": 1 }),
    };
    let Some(object) = root.as_object_mut() else {
        return Err(format!("{name} is not a JSON object; it was left alone"));
    };
    let list = object.entry(WORLD_RECORD_KEY).or_insert_with(|| serde_json::Value::Array(Vec::new()));
    let Some(list) = list.as_array_mut() else {
        return Err(format!("{name}: `{WORLD_RECORD_KEY}` is not a list; it was left alone"));
    };
    list.push(entry);
    if let Some(change) = seed_change {
        let list = object.entry(SEED_RECORD_KEY).or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let Some(list) = list.as_array_mut() else {
            return Err(format!("{name}: `{SEED_RECORD_KEY}` is not a list; it was left alone"));
        };
        list.push(change);
    }
    let mut body = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    body.push('\n');
    anvil::replace_file(&path, body.as_bytes()).map_err(|e| format!("{name} could not be written: {e}"))?;
    Ok(sha256_bytes(body.as_bytes()))
}

/// Put everything a run changed back from its holding folder, and check each
/// file against the hash taken before it was touched. Safe to run again after
/// it was interrupted: each file is looked at as it is.
fn restore(cfg: &ServerConfig, holding: &Path, record: &Holding) -> Result<usize, String> {
    let mut restored = 0;
    let mut failures: Vec<String> = Vec::new();
    for held in record.files.iter().rev() {
        let outcome = (|| -> Result<bool, String> {
            let world = under(&cfg.server_dir, &held.rel)?;
            let copy = under(&holding.join(HELD_FILES_DIR), &held.rel)?;
            let world_sha = match sha256_file(&world) {
                Ok(sha) => Some(sha),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(format!("cannot be read ({e})")),
            };
            if held.kind == "create" {
                return match world_sha {
                    None => Ok(false),
                    Some(_) => fs::remove_file(&world).map(|()| true).map_err(|e| format!("was made by the run and could not be removed ({e})")),
                };
            }
            if world_sha.as_deref() == Some(held.sha256.as_str()) {
                return Ok(false); // as it was: never changed, or already back
            }
            if !copy.is_file() {
                return Err("is not as it was, and its original is not in the holding folder".to_string());
            }
            if sha256_file(&copy).map_err(|e| format!("its original in the holding folder cannot be read ({e})"))? != held.sha256 {
                return Err("its original in the holding folder is not what was put there".to_string());
            }
            if held.kind == "move" && world_sha.is_some() {
                return Err("was moved out by the run, and another file is in its place now".to_string());
            }
            if let Some(parent) = world.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            anvil::rename_retrying(&copy, &world).map_err(|e| format!("could not be put back ({e})"))?;
            match sha256_file(&world) {
                Ok(sha) if sha == held.sha256 => Ok(true),
                _ => Err("was put back and does not read as it did".to_string()),
            }
        })();
        match outcome {
            Ok(true) => restored += 1,
            Ok(false) => {}
            Err(why) => failures.push(format!("{} {why}", held.rel)),
        }
    }
    // A rewrite that was cut off between its write and its rename.
    for held in &record.files {
        if let Ok(world) = under(&cfg.server_dir, &held.rel) {
            let name = world.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let _ = fs::remove_file(world.with_file_name(format!("{name}{}", anvil::REPLACE_SUFFIX)));
        }
    }
    if failures.is_empty() {
        Ok(restored)
    } else {
        Err(format!("{} file(s) could not be put back: {}", failures.len(), failures.join("; ")))
    }
}

/// After a failure: put the world back, close the record, lift the marker if
/// (and only if) everything is back.
fn back_out(cfg: &ServerConfig, holding: &Path, record: &mut Holding, why: &str) -> Result<(), String> {
    let dir = &cfg.server_dir;
    audit(dir, log::Level::Error, &format!("the run FAILED after it had begun: {why} -- putting everything back"));
    let restored = restore(cfg, holding, record);
    record.finished_utc = utc_now();
    match &restored {
        Ok(n) => {
            record.state = "failed".to_string();
            record.note = format!("failed ({why}); {n} file(s) put back and checked");
            let _ = save_holding(holding, record);
            let _ = fs::remove_file(dir.join(MARKER_FILE));
            audit(dir, log::Level::Warn, &format!("{n} file(s) put back; each one checked against the hash taken before the run. The world is as it was"));
        }
        Err(back) => {
            record.note = format!("failed ({why}); putting back failed too ({back})");
            let _ = save_holding(holding, record);
            audit(dir, log::Level::Error, &format!("PUTTING BACK FAILED: {back}. {MARKER_FILE} stays: the server will not be started. The holding folder and the pinned backup {} are intact", record.backup_file));
        }
    }
    restored.map(|_| ())
}

/// Carry a plan out. See the module's head for the order of things and what
/// is refused. The calling thread holds the launch gate for the whole of it:
/// never call this from the window's own thread.
pub fn execute(cfg: &ServerConfig, approval: &Approval) -> Outcome {
    let _one = EXEC_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let _flag = RunningFlag::raise();
    let dir = &cfg.server_dir;
    let outcome = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| execute_inner(cfg, approval))) {
        Ok(outcome) => outcome,
        Err(_) => Outcome::Refused(format!(
            "the run PANICKED (please report this). If {MARKER_FILE} exists next to server.properties it stopped half-way: roll it back before starting the server"
        )),
    };
    let level = if outcome.is_done() { log::Level::Info } else { log::Level::Error };
    audit(dir, level, &outcome.line());
    outcome
}

fn execute_inner(cfg: &ServerConfig, approval: &Approval) -> Outcome {
    let started = Instant::now();
    let dir = &cfg.server_dir;
    let refused = |why: String| Outcome::Refused(why);

    // 1. The approval, and the state of things.
    let plan = match load_plan(&approval.run_dir) {
        Ok(plan) => plan,
        Err(why) => return refused(why),
    };
    if !approves(&approval.typed, &plan.hash) {
        return refused(format!(
            "the approval is not the first {APPROVAL_CHARS} characters of the plan's hash (dry-run {})",
            plan.run_name
        ));
    }
    audit(dir, log::Level::Info, &format!(
        "regeneration asked for by '{}': dry-run {}, scope {}, {} chunk(s), plan sha256 {}",
        approval.by,
        plan.run_name,
        plan.scope,
        num(plan.total),
        plan.hash
    ));
    if backup::in_progress() {
        audit(dir, log::Level::Info, "a world backup is running: waiting for it");
    }
    let gate = backup::launch_guard();
    if crate::run::jvm_active() {
        return refused("the server is running: stop it first".to_string());
    }
    if backup::world_in_use(cfg) {
        return refused("a server has the world open (session.lock is held): stop it first".to_string());
    }
    if marker_present(dir) {
        return refused(format!("an earlier regeneration was left unfinished ({MARKER_FILE}): roll it back first"));
    }

    // 2. The plan again, from the world as it is now, with the JVM down.
    audit(dir, log::Level::Info, "the server is stopped; computing the plan again from the world as it is now");
    let a = match analyse(cfg, &plan.spec) {
        Ok(a) => a,
        Err(why) => return refused(format!("the world could not be analysed: {why}")),
    };
    if a.level_name != plan.level_name {
        return refused(format!("the plan was made for the world '{}', and this server's world is '{}'", plan.level_name, a.level_name));
    }
    let inspection = inspect(cfg, &a, approval.pregen, &plan);
    let mut preflight = compare(&plan, &a, inspection.lines.clone());
    if !preflight.same_plan {
        audit(dir, log::Level::Warn, &format!(
            "the plan has changed since the dry-run: {} chunk(s) more, {} fewer (sha256 now {})",
            num(preflight.added),
            num(preflight.removed),
            preflight.current_hash
        ));
        preflight.new_run = fresh_dry_run(cfg, &plan);
        return Outcome::PlanChanged(Box::new(preflight));
    }
    audit(dir, log::Level::Info, &format!("the plan is the approved one: {} chunk(s) to reset, {} to keep", num(preflight.targets), num(preflight.kept)));

    // 3. What the run cannot answer for.
    let stops = preflight.stops();
    if !stops.is_empty() {
        return refused(stops.join(" | "));
    }

    // 3a. The fidelity harness. It has to catch every violation planted in
    // its fixture; then the plan has to stand against the protection map as
    // the harness derives it now. Its record of the world, taken here, is what
    // the changes are held against afterwards (step 7a).
    let checked_plan = fidelity::Plan::of(&plan, &fidelity::author_label(&plan.run_dir));
    let world = cfg.world_dir();
    audit(dir, log::Level::Info, "fidelity harness: its self-test (a violation of each kind planted in a fixture world in the temp folder)");
    let self_test = fidelity::self_test(&world, &checked_plan);
    if !self_test.passed() {
        let _ = fidelity::save_refusal(&plan.run_dir, &checked_plan, &self_test, None);
        return refused(format!(
            "{}: the harness could not catch a planted violation, so it cannot vouch for a run (details in {}/{})",
            self_test.line(),
            plan.run_name,
            fidelity::FIDELITY_FILE
        ));
    }
    audit(dir, log::Level::Info, &self_test.line());
    let harness = match fidelity::before(&world, &checked_plan) {
        Ok(before) => before,
        Err(why) => return refused(format!("the fidelity harness could not read what it needs, so it cannot vouch for a run: {why}")),
    };
    if let Some(why) = harness.refusal() {
        let _ = fidelity::save_refusal(&plan.run_dir, &checked_plan, &self_test, Some(&harness));
        return refused(why);
    }
    audit(dir, log::Level::Info, &harness.line());

    // 4. The backup.
    audit(dir, log::Level::Info, "taking, or finding, a pinned backup of the world exactly as it is");
    let pinned = match backup::pinned_of_current_world(&gate, cfg, &format!("pre-regen {}", &plan.hash[..APPROVAL_CHARS])) {
        Ok(pinned) => pinned,
        Err(why) => return refused(format!("there is no verified backup of the world as it is, so nothing is done: {why}")),
    };
    audit(dir, log::Level::Info, &format!(
        "backup: backups/{} ({}, sha256 {}){}",
        pinned.entry.file,
        backup::fmt_bytes(pinned.entry.size),
        pinned.entry.sha256,
        if pinned.reused { ", taken earlier of this same world and verified again" } else { ", taken now and verified" }
    ));

    // 5. Everything the run will do, worked out and written down first.
    let stamps = region_stamps(&a);
    let mut prepared = match prepare(cfg, &plan, &a, &inspection, &pinned, &approval.by) {
        Ok(prepared) => prepared,
        Err(why) => return refused(format!("the changes could not be prepared: {why}")),
    };
    // `<time>-<start of the plan's hash>`, with a number after it if two runs
    // of one plan fall in the same second (a run, a rollback, a run).
    let stamp = format!("{}-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"), &plan.hash[..APPROVAL_CHARS]);
    let free = (1..100).map(|n| if n == 1 { stamp.clone() } else { format!("{stamp}-{n}") }).find(|name| !dir.join(HOLDING_DIR).join(name).exists());
    let Some(holding_name) = free else {
        return refused(format!("no free folder name under {HOLDING_DIR}"));
    };
    let holding = dir.join(HOLDING_DIR).join(&holding_name);
    let set_up = fs::create_dir_all(holding.join(HELD_FILES_DIR))
        .map_err(|e| format!("{}: {e}", holding.display()))
        .and_then(|()| fs::copy(plan.run_dir.join(PLAN_FILE), holding.join(PLAN_FILE)).map(|_| ()).map_err(|e| format!("the plan could not be copied: {e}")))
        .and_then(|()| save_holding(&holding, &prepared.record))
        .and_then(|()| {
            let body = format!("# A world regeneration is changing the world. Removed when it has finished.\nstarted_unix={}\nholding={HOLDING_DIR}/{holding_name}\nplan_hash={}\n", unix_now(), plan.hash);
            write_synced(&dir.join(MARKER_FILE), body.as_bytes()).map_err(|e| format!("{MARKER_FILE} could not be written: {e}"))
        });
    if let Err(why) = set_up {
        let _ = fs::remove_file(dir.join(MARKER_FILE));
        return refused(format!("the holding folder could not be set up: {why}"));
    }
    audit(dir, log::Level::Info, &format!("holding folder {HOLDING_DIR}/{holding_name}: {} file(s) listed with their hashes. Changing the world now", prepared.record.files.len()));

    let mut report = Report {
        run_name: plan.run_name.clone(),
        scope: plan.scope.clone(),
        plan_hash: plan.hash.clone(),
        chunks_reset: preflight.targets,
        chunks_kept: preflight.kept,
        backup_file: pinned.entry.file.clone(),
        backup_sha256: pinned.entry.sha256.clone(),
        backup_reused: pinned.reused,
        holding: format!("{HOLDING_DIR}/{holding_name}"),
        stores: inspection.stores.iter().map(|s| format!("{}: {}", s.rel, s.detail)).collect(),
        edits: inspection.edits.summary.clone(),
        ..Report::default()
    };
    for op in &inspection.files {
        match op.kind {
            FileKind::Whole => {
                report.files_moved[store_slot(op.store)] += 1;
                report.bytes_moved += op.bytes;
            }
            FileKind::Partial(_) => report.files_rewritten[store_slot(op.store)] += 1,
            FileKind::External => {
                report.external_moved += 1;
                report.bytes_moved += op.bytes;
            }
        }
    }

    // 5 and 6. Change, then check. From here on a failure puts it all back.
    let changed = apply(cfg, &holding, &inspection, &prepared).and_then(|()| {
        audit(dir, log::Level::Info, "reading the world again to check it");
        verify(&a, &holding, &inspection, &prepared, &stamps)
    });
    // 7. The world's own record of the run.
    let recorded = changed.and_then(|()| {
        let last = prepared.record.files.len() - 1;
        let held = prepared.record.files[last].clone();
        if held.kind == "replace" {
            let path = under(dir, &held.rel)?;
            let original = fs::read(&path).map_err(|e| format!("{}: {e}", held.rel))?;
            hold_copy(&holding, &held, &original, fs::metadata(&path).and_then(|md| md.modified()).ok())?;
        }
        let entry = world_record_entry(&a, &prepared.record, &report);
        let seed_change = seed_change_entry(&a, &prepared.record).map(|mut change| {
            change["holding"] = serde_json::Value::String(report.holding.clone());
            change
        });
        prepared.record.files[last].new_sha256 = write_world_record(cfg, entry, seed_change)?;
        Ok(())
    });
    if let Err(why) = recorded {
        let restored = back_out(cfg, &holding, &mut prepared.record, &why);
        return Outcome::Failed { why, restored, holding };
    }

    // 7a. The fidelity harness, after. What it finds puts the world back.
    audit(dir, log::Level::Info, "fidelity harness: reading the world again with its own reader");
    let checked = fidelity::after(&world, &checked_plan, &harness, Some(&self_test));
    if let Err(why) = checked.save(&holding, &checked_plan, self_test.seconds, harness.seconds) {
        audit(dir, log::Level::Warn, &format!("the harness's verdict could not be kept in the holding folder: {why}"));
    }
    let holds = checked.verdict.holds();
    audit(dir, if holds { log::Level::Info } else { log::Level::Error }, &checked.verdict.line());
    if !holds {
        let why = format!("{} (the findings are in {}/{})", checked.verdict.line(), report.holding, fidelity::FIDELITY_FILE);
        let restored = back_out(cfg, &holding, &mut prepared.record, &why);
        return Outcome::Failed { why, restored, holding };
    }
    report.fidelity = checked.verdict.line();

    prepared.record.state = "complete".to_string();
    prepared.record.finished_utc = utc_now();
    prepared.record.end_fingerprint = backup::world_fingerprint(cfg).unwrap_or_default();
    if let Err(why) = save_holding(&holding, &prepared.record) {
        // The world is right and checked; only the record of it is not closed.
        audit(dir, log::Level::Warn, &format!("the run is done, but its holding record could not be closed ({why}): a rollback will ask for the pinned backup instead"));
    }
    if let Err(e) = fs::remove_file(dir.join(MARKER_FILE)) {
        audit(dir, log::Level::Error, &format!("{MARKER_FILE} could not be removed ({e}): delete it by hand, the run is complete and checked"));
    }
    drop(gate);
    report.elapsed_secs = (started.elapsed().as_secs_f64() * 10.0).round() / 10.0;
    Outcome::Done(Box::new(report))
}

/// Take, or find, the pinned backup a run would stand on, without running
/// anything: so the operator can see it arrive on their own PC first. Holds
/// the launch gate while it works; not for the window's own thread.
pub fn backup_now(cfg: &ServerConfig, plan_hash: &str) -> Result<backup::Pinned, String> {
    let _one = EXEC_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let _flag = RunningFlag::raise();
    let gate = backup::launch_guard();
    if crate::run::jvm_active() || backup::world_in_use(cfg) {
        return Err("the server is running: a backup of the world as it stands needs it stopped".to_string());
    }
    let tag = &plan_hash[..plan_hash.len().min(APPROVAL_CHARS)];
    let pinned = backup::pinned_of_current_world(&gate, cfg, &format!("pre-regen {tag}"))?;
    audit(&cfg.server_dir, log::Level::Info, &format!(
        "backup ahead of a regeneration: backups/{} (sha256 {}){}",
        pinned.entry.file,
        pinned.entry.sha256,
        if pinned.reused { ", already there for this same world and verified again" } else { ", taken and verified" }
    ));
    Ok(pinned)
}

// =============================================================================
// Rolling back
// =============================================================================

/// Undo a run from its holding folder. `typed` is the first
/// [`APPROVAL_CHARS`] characters of the run's plan hash, as for the run.
///
/// A finished run is undone only while the world is exactly as the run left it
/// (its fingerprint): once a server has run on it, putting the old region
/// files back would also throw away what was built in kept chunks since, and
/// that is a restore from the pinned backup, decided as such. A run that was
/// cut off half-way is always undone.
pub fn rollback(cfg: &ServerConfig, holding: &Path, typed: &str, by: &str) -> Result<String, String> {
    let _one = EXEC_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let _flag = RunningFlag::raise();
    let dir = &cfg.server_dir;
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| rollback_inner(cfg, holding, typed, by)))
        .unwrap_or_else(|_| Err("the rollback PANICKED (please report this)".to_string()));
    match &outcome {
        Ok(done) => audit(dir, log::Level::Info, done),
        Err(why) => audit(dir, log::Level::Error, &format!("rollback NOT done: {why}")),
    }
    outcome
}

fn rollback_inner(cfg: &ServerConfig, holding: &Path, typed: &str, by: &str) -> Result<String, String> {
    let dir = &cfg.server_dir;
    if holding.parent() != Some(dir.join(HOLDING_DIR).as_path()) {
        return Err(format!("{} is not a holding folder of this server", holding.display()));
    }
    let mut record = load_holding(holding)?;
    if !approves(typed, &record.plan_hash) {
        return Err(format!("the approval is not the first {APPROVAL_CHARS} characters of that run's plan hash"));
    }
    if record.state == "rolled-back" || record.state == "failed" {
        return Err(format!("that run is already undone (its record says '{}')", record.state));
    }
    let _gate = backup::launch_guard();
    if crate::run::jvm_active() || backup::world_in_use(cfg) {
        return Err("the server is running: stop it first".to_string());
    }
    let interrupted = record.state != "complete";
    if !interrupted {
        let now = backup::world_fingerprint(cfg)?;
        if record.end_fingerprint.is_empty() || now != record.end_fingerprint {
            return Err(format!(
                "the world has changed since that run finished (a server has run on it, or files were edited), so the holding folder no longer undoes it exactly: putting the old region files back would also discard what happened in kept chunks since. To go back anyway, restore the pinned backup {} taken before the run",
                record.backup_file
            ));
        }
    }
    audit(dir, log::Level::Info, &format!(
        "rollback asked for by '{by}': run of {} (plan sha256 {}), {}",
        record.started_utc,
        record.plan_hash,
        if interrupted { "which was left unfinished" } else { "the world untouched since" }
    ));
    // From here the world is in between again until it is all back.
    let body = format!("# A world regeneration is being rolled back. Removed when it has finished.\nstarted_unix={}\n", unix_now());
    write_synced(&dir.join(MARKER_FILE), body.as_bytes()).map_err(|e| format!("{MARKER_FILE} could not be written: {e}"))?;
    let restored = restore(cfg, holding, &record)?;
    record.state = "rolled-back".to_string();
    record.finished_utc = utc_now();
    record.note = format!("rolled back by '{by}': {restored} file(s) put back and checked");
    save_holding(holding, &record)?;
    fs::remove_file(dir.join(MARKER_FILE)).map_err(|e| format!("everything is back, but {MARKER_FILE} could not be removed ({e}): delete it by hand"))?;
    Ok(format!(
        "rolled back: {restored} file(s) put back where they were, each checked against the SHA-256 taken before the run. The world is as it was before the regeneration of {}",
        record.started_utc
    ))
}

// =============================================================================
// The command line: scratch copies only
// =============================================================================

fn same_folder(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy()),
        _ => false,
    }
}

/// May the command line carry a plan out on this folder? Only on a scratch
/// copy, and this is how it tells one from a live server:
///
///   1. the folder holds [`SANDBOX_FILE`], and the first line of that file is
///      the folder's own full path. Somebody wrote that by hand for this
///      folder; a live server has no such file, and one copied along with a
///      server folder names the folder it was copied from, not this one;
///   2. no launcher is running on it: `.icraft_launcher_status` is absent, or
///      older than ten minutes (a launcher rewrites it every 15 s).
///
/// `Ok` carries a sentence saying what was found, for the output.
pub fn sandbox_check(cfg: &ServerConfig) -> Result<String, String> {
    let dir = &cfg.server_dir;
    let marker = dir.join(SANDBOX_FILE);
    let body = fs::read_to_string(&marker).map_err(|_| {
        format!(
            "{} has no {SANDBOX_FILE}. The command line carries a regeneration out only on a scratch copy of a server folder, marked as one by a file of that name holding the folder's own full path. On the live server it is started from the launcher's window, by the operator",
            dir.display()
        )
    })?;
    let named = body.lines().map(|l| l.trim_start_matches('\u{feff}').trim()).find(|l| !l.is_empty()).unwrap_or("");
    if named.is_empty() || !same_folder(Path::new(named), dir) {
        return Err(format!("{SANDBOX_FILE} names '{named}', which is not this folder ({}): it was copied here with the folder, not written for it", dir.display()));
    }
    let status = dir.join(".icraft_launcher_status");
    match fs::metadata(&status).and_then(|md| md.modified()) {
        Err(_) => Ok(format!("{SANDBOX_FILE} names this folder, and no launcher has ever written a status file here")),
        Ok(written) => {
            let age = SystemTime::now().duration_since(written).unwrap_or(Duration::ZERO);
            if age < LIVE_STATUS_AGE {
                Err(format!("a launcher wrote .icraft_launcher_status here {} s ago: this folder is being served, whatever {SANDBOX_FILE} says", age.as_secs()))
            } else {
                Ok(format!("{SANDBOX_FILE} names this folder, and the launcher status file here is {} min old (nothing is serving it)", age.as_secs() / 60))
            }
        }
    }
}

#[cfg(test)]
mod tests;
