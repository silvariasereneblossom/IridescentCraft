//! Chunk regeneration: the protection report and the DRY-RUN (Phase B). The
//! part that carries a plan out is the submodule [`exec`] (Phase C).
//!
//! **Nothing in this file touches the world folder.** It reads the world (see
//! [`crate::anvil`] for why that is safe while the server runs), works out what
//! a regeneration would keep and what it would reset, and writes that down
//! next to the server. The only thing it ever deletes is its own oldest report
//! folders ([`prune_reports`]):
//!
//! ```text
//! <server dir>/regen-reports/<YYYYmmdd-HHMMSS>-<scope>/
//!     report.txt     the whole story, for a person
//!     chunks.csv     one row per chunk on disk: kept or regenerated, and why
//!     warnings.csv   every warning, one row each
//!     structures.csv one row per structure: kept whole, regenerated whole, or
//!                    cut by the plan (see "Structures" below)
//!     plan.json      the chunks to regenerate, per dimension, and their hash
//!     summary.json   what report.txt says, as data: the launcher window reads it
//!     map-<dim>.png  an overview, one pixel block per chunk
//! ```
//!
//! What gets kept is [`crate::protection`]'s business. What gets selected is
//! the run's [`Scope`], chosen every time (operator decision 2026-10-11):
//!
//!   - `report`   nothing: the protection map on its own
//!   - `ring:N`   every chunk within N chunks of a bed chunk
//!   - `all`      every chunk of the selected dimensions
//!   - `box:x1,z1,x2,z2`  a box of chunks
//!
//! A chunk is regenerated when the scope selects it and no layer protects it.
//!
//! `plan.json` is what the execution ([`exec`]) is handed: it recomputes the
//! plan with the server stopped and does nothing unless the hash is the one
//! the operator approved. A dry-run taken while the server runs is therefore
//! safe to take and to read, but it is the stopped recomputation that counts.
//!
//! [`chunk_info`] answers for one chunk: what is in it, and what a dry-run's
//! plan does with it and with its structures (`icraft chunk-info`,
//! `icraft-gui.exe --chunk-info`, a click on the Customizer's map).
//!
//! Triggers: the launcher's Customizer tab, which sets everything on screen and
//! shows the result ([`run_logged`], [`list_runs`], [`load_view`]);
//! [`REQUEST_FILE`], same shape as the Cycle and backup requests so it can be
//! driven over WinRM ([`poll_request`]); and `icraft regen-dryrun`, which also
//! takes any server folder path, a share included. Nothing here is called from
//! `serve()` or a Cycle.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::anvil::{self, ChunkPos, Dimension, DimensionScan, Store, OVERWORLD};
use crate::config::ServerConfig;
use crate::protection::{self, fmt_ticks, layer_names, DimProtection, Layer, Settings, Sources, WaystoneMode};
use crate::restart_policy::fmt_span;
use crate::worlddata::{self, BlockPos, ClaimOwner, LevelInfo, Player, Waystone};

pub mod edits;
pub mod exec;
pub mod fidelity;

/// `<unix-secs> <reason> [key=value ...]`: run a report now. Keys: `scope`,
/// `dims`, `png`, and any setting of [`protection::POLICY_FILE`].
pub const REQUEST_FILE: &str = ".icraft_regen_request";
/// `<unix-secs> <answer>`: started / done / rejected / FAILED.
pub const RESULT_FILE: &str = ".icraft_regen_request.result";
/// Audit log of requested runs, in the server's `logs/`.
pub const LOG_FILE: &str = "regen_dryrun.log";
/// Under the server dir: one folder per run.
pub const REPORTS_DIR: &str = "regen-reports";
/// Run folders kept there. A run is about 6 MB (one row per chunk on disk),
/// and until 2026-10-12 nothing ever removed one.
pub const REPORTS_KEPT: usize = 12;
pub const PLAN_FILE: &str = "plan.json";
/// In a run's folder: one row per structure (since 2026-10-24).
pub const STRUCTURES_FILE: &str = "structures.csv";

const PLAN_VERSION: u32 = 1;
const LOG_ROLL_BYTES: u64 = 1024 * 1024;
/// A request is run as soon as it is seen; an older one is a leftover.
const REQUEST_MAX_AGE: Duration = Duration::from_secs(10 * 60);
const MAX_RING: u32 = 256;
/// Chunks around a bed summarised per player when the scope is not a ring.
const NEIGHBOURHOOD: u32 = 8;
/// `level.dat` is rewritten at every autosave (5 min): younger than this, a
/// server is almost certainly running on the world.
const RECENT_SAVE: Duration = Duration::from_secs(10 * 60);
/// A map wider or taller than this many chunks is not drawn.
const MAX_MAP_CHUNKS: i64 = 8192;

macro_rules! wl {
    ($out:expr) => { $out.push('\n') };
    ($out:expr, $($arg:tt)*) => {{ $out.push_str(&format!($($arg)*)); $out.push('\n'); }};
}

// =============================================================================
// What to run
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    /// Select nothing: the protection map only.
    Report,
    /// Every chunk within this many chunks of a bed chunk (a square).
    Ring(u32),
    /// Every chunk of the selected dimensions.
    All,
    /// An inclusive box of chunks.
    Box { x1: i32, z1: i32, x2: i32, z2: i32 },
}

impl Scope {
    /// `report`, `ring:8`, `all`, `box:32,40,52,70` (or `box:32,40..52,70`).
    pub fn parse(text: &str) -> Result<Self, String> {
        let t = text.trim().to_ascii_lowercase();
        match t.as_str() {
            "report" | "none" => return Ok(Scope::Report),
            "all" => return Ok(Scope::All),
            _ => {}
        }
        if let Some(n) = t.strip_prefix("ring:") {
            let n: u32 = n.parse().map_err(|_| format!("scope={text}: ring:N takes a whole number of chunks"))?;
            if n == 0 || n > MAX_RING {
                return Err(format!("scope={text}: the ring is 1 to {MAX_RING} chunks"));
            }
            return Ok(Scope::Ring(n));
        }
        if let Some(rest) = t.strip_prefix("box:") {
            let fields: Vec<Option<i32>> = rest.replace("..", ",").split(',').map(|v| v.trim().parse::<i32>().ok()).collect();
            if let [Some(a), Some(b), Some(c), Some(d)] = fields.as_slice() {
                let (a, b, c, d) = (*a, *b, *c, *d);
                return Ok(Scope::Box { x1: a.min(c), z1: b.min(d), x2: a.max(c), z2: b.max(d) });
            }
            return Err(format!("scope={text}: box:x1,z1,x2,z2 takes four whole numbers (chunk coordinates)"));
        }
        Err(format!("scope={text}: use report, ring:N, all or box:x1,z1,x2,z2"))
    }

    /// The form [`Scope::parse`] reads.
    pub fn token(&self) -> String {
        match self {
            Scope::Report => "report".to_string(),
            Scope::Ring(n) => format!("ring:{n}"),
            Scope::All => "all".to_string(),
            Scope::Box { x1, z1, x2, z2 } => format!("box:{x1},{z1},{x2},{z2}"),
        }
    }

    /// For the report folder's name.
    fn slug(&self) -> String {
        match self {
            Scope::Ring(n) => format!("ring{n}"),
            Scope::Box { .. } => "box".to_string(),
            other => other.token(),
        }
    }

    pub fn describe(&self) -> String {
        match self {
            Scope::Report => "nothing is selected: this is the protection map on its own".to_string(),
            Scope::Ring(n) => format!(
                "every chunk within {n} chunks of a bed chunk (a {0}x{0} square of chunks around each bed), minus protected chunks",
                2 * n + 1
            ),
            Scope::All => "every chunk of the selected dimensions, minus protected chunks".to_string(),
            Scope::Box { x1, z1, x2, z2 } => {
                format!("the box of chunks ({x1}, {z1}) to ({x2}, {z2}) in each selected dimension, minus protected chunks")
            }
        }
    }

    fn selects(&self, pos: ChunkPos, beds: &[ChunkPos]) -> bool {
        match self {
            Scope::Report => false,
            Scope::All => true,
            Scope::Ring(n) => beds.iter().any(|b| chebyshev(*b, pos) <= i64::from(*n)),
            Scope::Box { x1, z1, x2, z2 } => (*x1..=*x2).contains(&pos.0) && (*z1..=*z2).contains(&pos.1),
        }
    }
}

fn chebyshev(a: ChunkPos, b: ChunkPos) -> i64 {
    (i64::from(a.0) - i64::from(b.0)).abs().max((i64::from(a.1) - i64::from(b.1)).abs())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunSpec {
    pub scope: Scope,
    /// Dimension ids to analyse. Ignored when `all_dims` is set.
    pub dims: Vec<String>,
    /// Every dimension that has chunks on disk.
    pub all_dims: bool,
    /// Protection settings for this run only, on top of the policy file.
    pub overrides: Vec<(String, String)>,
    /// The whole of the protection settings, as the launcher window shows
    /// them. With this the policy file is not read: what is on screen is what
    /// is used, and it is recorded in the plan.
    pub settings: Option<Settings>,
    /// What the plan changes besides chunks ([`edits`]): never part of the
    /// policy file.
    pub edits: edits::WorldEdits,
    /// Where the run's folder goes. `None` = `<server dir>/regen-reports`.
    pub out_root: Option<PathBuf>,
    pub png: bool,
}

impl Default for RunSpec {
    fn default() -> Self {
        RunSpec {
            scope: Scope::Report,
            dims: vec![OVERWORLD.to_string()],
            all_dims: false,
            overrides: Vec::new(),
            settings: None,
            edits: edits::WorldEdits::default(),
            out_root: None,
            png: true,
        }
    }
}

impl RunSpec {
    /// One `key=value`: `scope`, `dims` (comma-separated ids, or `all`), `png`
    /// (on/off), one of [`edits::WorldEdits`] (`new_seed`, `blend`,
    /// `spawn_search`, `reset_players`), or a protection setting.
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        if self.edits.set(&key, value)? {
            return Ok(());
        }
        match key.as_str() {
            "scope" => self.scope = Scope::parse(value)?,
            "dims" => {
                if value.eq_ignore_ascii_case("all") {
                    self.all_dims = true;
                } else {
                    let ids: Vec<String> = value.split(',').map(|d| d.trim().to_string()).filter(|d| !d.is_empty()).collect();
                    if ids.is_empty() {
                        return Err("dims=: name at least one dimension, or all".to_string());
                    }
                    self.all_dims = false;
                    self.dims = ids;
                }
            }
            "png" => {
                self.png = match value.to_ascii_lowercase().as_str() {
                    "on" | "1" | "true" => true,
                    "off" | "0" | "false" => false,
                    _ => return Err(format!("png={value}: on or off")),
                }
            }
            _ => {
                // Checked now, so a typo is refused before the world is read.
                Settings::default().set(&key, value)?;
                self.overrides.push((key.clone(), value.to_string()));
            }
        }
        Ok(())
    }

    /// `scope=ring:8 dims=minecraft:overworld inhabited_min_ticks=72000`
    pub fn parse_tokens<'a>(tokens: impl IntoIterator<Item = &'a str>) -> Result<Self, String> {
        let mut spec = RunSpec::default();
        for token in tokens {
            let (key, value) = token.split_once('=').ok_or_else(|| format!("'{token}' is not key=value"))?;
            spec.set(key, value)?;
        }
        Ok(spec)
    }

    /// The tokens [`RunSpec::parse_tokens`] reads back (without `out_root`).
    pub fn tokens(&self) -> String {
        let mut out = vec![format!("scope={}", self.scope.token())];
        out.push(format!("dims={}", if self.all_dims { "all".to_string() } else { self.dims.join(",") }));
        for (k, v) in &self.overrides {
            out.push(format!("{k}={v}"));
        }
        if self.settings.is_some() {
            out.push("settings=window".to_string());
        }
        out.extend(self.edits.tokens());
        if !self.png {
            out.push("png=off".to_string());
        }
        out.join(" ")
    }

    /// [`RunSpec::tokens`] for the log, which leaves the box: a new seed and
    /// the players who start over by count only.
    pub fn log_text(&self) -> String {
        let mut shown = self.clone();
        shown.edits = edits::WorldEdits::default();
        let mut out = shown.tokens();
        match self.edits.new_seed {
            edits::SeedChoice::Keep => {}
            edits::SeedChoice::Random => out.push_str(" new_seed=random"),
            edits::SeedChoice::Value(_) => out.push_str(" new_seed=<a number>"),
        }
        if self.edits.blend {
            out.push_str(" blend=on");
        }
        if self.edits.spawn_search {
            out.push_str(" spawn_search=on");
        }
        if !self.edits.reset_players.is_empty() {
            out.push_str(&format!(" reset_players=<{} player(s)>", self.edits.reset_players.len()));
        }
        out
    }
}

// =============================================================================
// Analysis
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Warning {
    pub kind: &'static str,
    pub dim: String,
    pub chunk: Option<ChunkPos>,
    pub pos: Option<BlockPos>,
    pub detail: String,
}

/// One analysed dimension.
struct DimResult {
    dim: Dimension,
    scan: DimensionScan,
    protection: DimProtection,
    /// Chunks on disk that the scope selects, protected or not.
    selected: BTreeSet<ChunkPos>,
    /// Chunks that would be regenerated: selected and not protected.
    targets: BTreeSet<ChunkPos>,
    /// Its structures, when the scan read them (a dry-run's; not an
    /// execution's recomputation, which needs only the plan).
    structures: Vec<Structure>,
}

#[derive(Default, Clone)]
struct FileStats {
    with_chunks: usize,
    /// Every chunk in the file is a target: the file would go.
    whole: Vec<String>,
    whole_bytes: u64,
    partial: usize,
    untouched: usize,
    /// No chunks in it (Minecraft's zero-byte placeholders): left alone.
    empty: usize,
}

struct DimStats {
    on_disk: usize,
    per_store: [usize; 3],
    protected_on_disk: usize,
    protected_not_on_disk: usize,
    /// Per [`Layer::ALL`]: chunks on disk the layer keeps / keeps alone.
    layer: [usize; Layer::COUNT],
    layer_alone: [usize; Layer::COUNT],
    selected: usize,
    kept_in_scope: usize,
    targets: usize,
    /// Per [`Store::ALL`].
    files: [FileStats; 3],
}

impl DimResult {
    fn stats(&self) -> DimStats {
        let on_disk: Vec<ChunkPos> = self.scan.chunks.keys().copied().collect();
        let mut layer = [0usize; Layer::COUNT];
        let mut layer_alone = [0usize; Layer::COUNT];
        let mut protected_on_disk = 0;
        for pos in &on_disk {
            let bits = self.protection.layers_at(*pos);
            if bits != 0 {
                protected_on_disk += 1;
            }
            for (i, l) in Layer::ALL.iter().enumerate() {
                if bits & l.bit() != 0 {
                    layer[i] += 1;
                }
                if bits == l.bit() {
                    layer_alone[i] += 1;
                }
            }
        }
        let mut files: [FileStats; 3] = Default::default();
        for f in &self.scan.files {
            let i = Store::ALL.iter().position(|s| *s == f.store).unwrap_or(0);
            let hit = f.chunks.iter().filter(|c| self.targets.contains(*c)).count();
            if f.chunks.is_empty() {
                files[i].empty += 1;
                continue;
            }
            files[i].with_chunks += 1;
            if hit == f.chunks.len() {
                files[i].whole.push(f.name.clone());
                files[i].whole_bytes += f.bytes;
            } else if hit > 0 {
                files[i].partial += 1;
            } else {
                files[i].untouched += 1;
            }
        }
        DimStats {
            on_disk: on_disk.len(),
            per_store: [self.scan.chunk_count(Store::Region), self.scan.chunk_count(Store::Entities), self.scan.chunk_count(Store::Poi)],
            protected_on_disk,
            protected_not_on_disk: self.protection.chunks.keys().filter(|p| !self.scan.chunks.contains_key(*p)).count(),
            layer,
            layer_alone,
            selected: self.selected.len(),
            kept_in_scope: self.selected.len() - self.targets.len(),
            targets: self.targets.len(),
            files,
        }
    }
}

// =============================================================================
// Structures
// =============================================================================
//
// What a plan does to the structures in its chunks. Read from the chunks
// themselves (see "Structures" in [`crate::anvil`]): a structure is a start
// (the chunk it begins in) and the chunks whose References name that start.
// A plan resets one whole, keeps one whole, or CUTS one: some of its chunks
// kept, some regenerated. Nothing here changes the plan; it is the report.

/// One structure of a dimension.
struct Structure {
    /// `minecraft:village_plains`
    id: String,
    /// The chunk its start is in.
    start: ChunkPos,
    /// The start as its chunk records it. `None`: that chunk is not on disk,
    /// or does not hold the start (only pieces of it are on disk).
    record: Option<anvil::StructureStart>,
    /// Chunks on disk that hold its start or a piece of it.
    chunks: BTreeSet<ChunkPos>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StructureFate {
    KeptWhole,
    ResetWhole,
    Cut,
}

impl Structure {
    fn regenerated(&self, targets: &BTreeSet<ChunkPos>) -> usize {
        self.chunks.iter().filter(|c| targets.contains(*c)).count()
    }

    fn fate(&self, targets: &BTreeSet<ChunkPos>) -> StructureFate {
        match self.regenerated(targets) {
            0 => StructureFate::KeptWhole,
            n if n == self.chunks.len() => StructureFate::ResetWhole,
            _ => StructureFate::Cut,
        }
    }

    /// `kept`, `regenerated` or `not on disk`: its start chunk.
    fn start_word(&self, targets: &BTreeSet<ChunkPos>) -> &'static str {
        if self.record.is_none() {
            "not on disk"
        } else if targets.contains(&self.start) {
            "regenerated"
        } else {
            "kept"
        }
    }
}

impl StructureFate {
    fn word(self) -> &'static str {
        match self {
            StructureFate::KeptWhole => "kept",
            StructureFate::ResetWhole => "regenerated",
            StructureFate::Cut => "cut",
        }
    }
}

/// Every structure a scan's chunks record, by id then start chunk.
fn structures_of(scan: &DimensionScan) -> Vec<Structure> {
    fn entry<'m>(found: &'m mut BTreeMap<(String, ChunkPos), Structure>, id: &str, start: ChunkPos) -> &'m mut Structure {
        found.entry((id.to_string(), start)).or_insert_with(|| Structure { id: id.to_string(), start, record: None, chunks: BTreeSet::new() })
    }
    let mut found: BTreeMap<(String, ChunkPos), Structure> = BTreeMap::new();
    for (pos, here) in &scan.structures {
        for s in &here.starts {
            let e = entry(&mut found, &s.id, *pos);
            e.record = Some(s.clone());
            e.chunks.insert(*pos);
        }
        for (id, start) in &here.references {
            entry(&mut found, id, *start).chunks.insert(*pos);
        }
    }
    found.into_values().collect()
}

/// Every structure of a dimension with the chunks on disk that hold it
/// (exactly as the dry-run counts them: the start chunk and every chunk whose
/// References name the start), as JSON lines: `{"id", "start": [x, z],
/// "start_on_disk", "chunks": [[x, z], ...]}`. Reads the world only. For
/// working out keep / never-keep boxes outside the launcher
/// (`icraft structure-footprints`).
pub fn structure_footprints(cfg: &ServerConfig, dim: &str) -> Result<String, String> {
    let dims = anvil::discover_dimensions(&cfg.world_dir());
    let d = dims.iter().find(|d| d.id == dim).ok_or_else(|| format!("dimension {dim} is not in this world"))?;
    let scan = anvil::scan_dimension_with_structures(d);
    let mut out = String::new();
    for s in structures_of(&scan) {
        let chunks: Vec<String> = s.chunks.iter().map(|(x, z)| format!("[{x},{z}]")).collect();
        wl!(
            out,
            "{{\"id\":{},\"start\":[{},{}],\"start_on_disk\":{},\"chunks\":[{}]}}",
            json_str(&s.id),
            s.start.0,
            s.start.1,
            s.record.is_some(),
            chunks.join(",")
        );
    }
    Ok(out)
}

impl DimResult {
    /// The regenerated chunks of the structures the plan cuts.
    fn cut_chunks(&self) -> BTreeSet<ChunkPos> {
        let mut out = BTreeSet::new();
        for s in self.structures.iter().filter(|s| s.fate(&self.targets) == StructureFate::Cut) {
            out.extend(s.chunks.iter().filter(|c| self.targets.contains(*c)));
        }
        out
    }
}

/// What a run would do with one chunk position.
enum Fate {
    /// Its dimension is not part of the run.
    NotSelected,
    /// Nothing on disk there (with the layers that would keep it).
    NotOnDisk(u8),
    Kept(u8),
    Regenerate,
    /// Not protected, and the scope does not select it.
    Untouched,
}

struct Analysis {
    server_dir: PathBuf,
    world_dir: PathBuf,
    level_name: String,
    spec: RunSpec,
    settings: Settings,
    policy_text: Option<String>,
    /// The settings came with the request; the policy file was not read.
    settings_from_caller: bool,
    level: LevelInfo,
    players: Vec<Player>,
    /// Player files that do not read, `.dat_old` included: bed and logout
    /// spot unknown. Reported by number, never by name or UUID.
    unreadable_players: Vec<worlddata::UnreadablePlayer>,
    /// Players who start over (`reset_players`): not in `players`, so no
    /// layer keeps their bed or logout spot and nothing stops on them.
    reset_players: Vec<Player>,
    /// What the plan changes besides chunks, as concrete values.
    edits: edits::Edits,
    /// With `blend`: the kept overworld chunks Tectonic tagged.
    blend: Option<edits::BlendScan>,
    claims: Option<Vec<ClaimOwner>>,
    waystones: Option<Vec<Waystone>>,
    all_dims: Vec<Dimension>,
    dims: Vec<DimResult>,
    warnings: Vec<Warning>,
    /// Things worth saying that are not warnings.
    notes: Vec<String>,
    online_mode: Option<String>,
    /// Age of `level.dat` when the run started.
    last_save: Option<Duration>,
}

impl Analysis {
    fn dim(&self, id: &str) -> Option<&DimResult> {
        self.dims.iter().find(|d| d.dim.id == id)
    }

    fn fate(&self, dim: &str, pos: ChunkPos) -> Fate {
        let Some(d) = self.dim(dim) else { return Fate::NotSelected };
        let layers = d.protection.layers_at(pos);
        if !d.scan.chunks.contains_key(&pos) {
            Fate::NotOnDisk(layers)
        } else if layers != 0 {
            Fate::Kept(layers)
        } else if d.targets.contains(&pos) {
            Fate::Regenerate
        } else {
            Fate::Untouched
        }
    }

    fn fate_text(&self, dim: &str, pos: ChunkPos) -> String {
        match self.fate(dim, pos) {
            Fate::NotSelected => "its dimension is not part of this run".to_string(),
            Fate::NotOnDisk(0) => "not generated (nothing on disk)".to_string(),
            Fate::NotOnDisk(l) => format!("not generated yet (would be kept: {})", layer_names(l)),
            Fate::Kept(l) => format!("kept ({})", layer_names(l)),
            Fate::Regenerate => "WOULD BE REGENERATED".to_string(),
            Fate::Untouched => "not protected, but outside this run's scope (untouched)".to_string(),
        }
    }

    fn sources(&self) -> Sources<'_> {
        Sources {
            level: &self.level,
            players: &self.players,
            claims: self.claims.as_deref().unwrap_or(&[]),
            waystones: self.waystones.as_deref().unwrap_or(&[]),
        }
    }

    fn total_targets(&self) -> usize {
        self.dims.iter().map(|d| d.targets.len()).sum()
    }

    /// Every file in `playerdata/`, read or not.
    fn player_files(&self) -> usize {
        self.players.len() + self.unreadable_players.len() + self.reset_players.len()
    }

    /// A player file's number among all of them sorted by file name, from 1:
    /// how a line points at a file without naming anyone.
    fn file_no(&self, uuid: &str) -> usize {
        let mut all: Vec<&str> = self
            .players
            .iter()
            .chain(self.reset_players.iter())
            .map(|p| p.uuid.as_str())
            .chain(self.unreadable_players.iter().map(|u| u.uuid.as_str()))
            .collect();
        all.sort_unstable();
        all.iter().position(|u| *u == uuid).map_or(0, |i| i + 1)
    }

    fn server_probably_running(&self) -> bool {
        self.last_save.is_some_and(|age| age < RECENT_SAVE)
    }
}

/// The plan and everything said about it, as an execution recomputes it: the
/// chunks' structures are not read (see [`analyse_with_structures`]).
fn analyse(cfg: &ServerConfig, spec: &RunSpec) -> Result<Analysis, String> {
    analyse_inner(cfg, spec, false)
}

/// [`analyse`], with each dimension's structures for the dry-run's report.
/// Reading them inflates every chunk to its end; the plan is the same.
fn analyse_with_structures(cfg: &ServerConfig, spec: &RunSpec) -> Result<Analysis, String> {
    analyse_inner(cfg, spec, true)
}

fn analyse_inner(cfg: &ServerConfig, spec: &RunSpec, with_structures: bool) -> Result<Analysis, String> {
    let server_dir = cfg.server_dir.clone();
    let level_name = cfg.level_name();
    let world = cfg.world_dir();
    if !world.join("level.dat").is_file() && !world.join("level.dat_old").is_file() {
        return Err(format!("there is no world at {} (no level.dat)", world.display()));
    }
    let last_save = fs::metadata(world.join("level.dat"))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| SystemTime::now().duration_since(t).ok());

    let (mut settings, policy_text) = match &spec.settings {
        Some(given) => (given.clone(), None),
        None => Settings::load(&server_dir)?,
    };
    for (key, value) in &spec.overrides {
        settings.set(key, value)?;
    }
    settings.validate()?;

    let mut notes = Vec::new();
    let level = worlddata::read_level(&world)?;
    if level.from_old {
        notes.push("level.dat did not read; world spawn comes from level.dat_old".to_string());
    }
    let names = worlddata::read_usercache(&server_dir);
    let worlddata::PlayerFiles { mut players, unreadable: unreadable_players } = worlddata::read_players(&world, &names);
    let claims = match worlddata::read_claims(&world) {
        Ok(c) => c,
        Err(e) if !settings.claims => {
            notes.push(format!("claims are off for this run, and the claim files do not read ({e})"));
            None
        }
        Err(e) => return Err(format!("Open Parties and Claims data does not read, so claims cannot be protected: {e}")),
    };
    // Players the usercache has forgotten are still named in their claim file.
    if let Some(owners) = &claims {
        for p in players.iter_mut().filter(|p| p.name.is_none()) {
            p.name = owners.iter().find(|o| o.uuid == p.uuid && !o.name.is_empty()).map(|o| o.name.clone());
        }
    }
    // Players who start over leave the analysis here: nothing keeps their bed
    // or logout spot, and their files go in the run ([`edits`]).
    let reset_uuids = edits::resolve_players(&spec.edits.reset_players, &players)?;
    let reset_players: Vec<Player> = players.iter().filter(|p| reset_uuids.contains(&p.uuid)).cloned().collect();
    players.retain(|p| !reset_uuids.contains(&p.uuid));
    for (key, list) in [("bed_players", &settings.bed_players), ("logout_players", &settings.logout_players)] {
        if let Some(p) = reset_players.iter().find(|p| list.iter().any(|e| e.eq_ignore_ascii_case(&p.uuid) || p.name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(e)))) {
            return Err(format!("playerdata/{}... starts over (reset_players) and is on {key} too: one or the other", edits::short(&p.uuid)));
        }
    }
    // Whose bed / logout spot: names become UUIDs here, so the plan records
    // UUIDs and the fidelity harness (which reads no names) builds the same map.
    settings.resolve_players(&players)?;
    let waystones = match worlddata::read_waystones(&world) {
        Ok(w) => w,
        Err(e) if settings.waystones == WaystoneMode::Off => {
            notes.push(format!("waystones are off for this run, and waystones.dat does not read ({e})"));
            None
        }
        Err(e) => return Err(format!("waystones.dat does not read, so waystones cannot be protected: {e}")),
    };

    let all_dims = anvil::discover_dimensions(&world);
    let selected: Vec<Dimension> = if spec.all_dims {
        all_dims.iter().filter(|d| d.has_chunk_storage()).cloned().collect()
    } else {
        let mut picked: Vec<Dimension> = Vec::new();
        for id in &spec.dims {
            let found = all_dims.iter().find(|d| &d.id == id).ok_or_else(|| {
                let known: Vec<&str> = all_dims.iter().filter(|d| d.has_chunk_storage()).map(|d| d.id.as_str()).collect();
                format!("dimension {id} is not in this world (with chunks on disk: {})", known.join(", "))
            })?;
            if !picked.iter().any(|d| d.id == found.id) {
                picked.push(found.clone());
            }
        }
        picked
    };

    let new_seed = match spec.edits.new_seed {
        edits::SeedChoice::Keep => None,
        edits::SeedChoice::Random => Some(edits::random_seed()),
        edits::SeedChoice::Value(n) => Some(n),
    };
    if let Some(seed) = new_seed {
        match level.seed {
            None => return Err("new_seed: level.dat has no seed to change (Data.WorldGenSettings.seed)".to_string()),
            // No numbers in these: a failed dry-run goes to the log, which leaves the box.
            Some(now) if now == seed => return Err("new_seed: that is the world's seed already".to_string()),
            Some(_) => {}
        }
        if spec.scope != Scope::All {
            return Err(format!(
                "new_seed: only a plan with scope 'all' may change the seed (this one is '{}'): every chunk that is not kept has to be reset, or old-seed land is left beside new-seed land outside the keep list",
                spec.scope.token()
            ));
        }
    }
    if spec.edits.blend && new_seed.is_none() {
        return Err("blend: the blending mark is for a new seed (new_seed); with the world's own seed the land around kept chunks comes back as it was".to_string());
    }
    let edits = edits::Edits {
        seed_before: new_seed.and(level.seed),
        new_seed,
        blend: spec.edits.blend,
        spawn_search: spec.edits.spawn_search,
        spawn_y: if spec.edits.spawn_search { edits::SPAWN_SEARCH_Y } else { 0 },
        reset_players: reset_uuids,
    };

    let mut analysis = Analysis {
        online_mode: worlddata::server_property(&server_dir, "online-mode"),
        server_dir,
        world_dir: world,
        level_name,
        spec: spec.clone(),
        settings,
        policy_text,
        settings_from_caller: spec.settings.is_some(),
        level,
        players,
        unreadable_players,
        reset_players,
        edits,
        blend: None,
        claims,
        waystones,
        all_dims,
        dims: Vec::new(),
        warnings: Vec::new(),
        notes,
        last_save,
    };

    for dim in selected {
        let scan = if with_structures { anvil::scan_dimension_with_structures(&dim) } else { anvil::scan_dimension(&dim) };
        if let Some(f) = scan.files.iter().find(|f| f.error.is_some()) {
            return Err(format!(
                "{} in {} does not read ({}): without it the chunks it holds cannot be told apart",
                dim.store_dir(f.store).join(&f.name).display(),
                dim.id,
                f.error.as_deref().unwrap_or("?")
            ));
        }
        let protection = protection::build(&dim.id, &analysis.sources(), &analysis.settings, &scan);
        let beds: Vec<ChunkPos> = analysis
            .players
            .iter()
            .filter_map(|p| p.bed.as_ref())
            .filter(|b| b.dim == dim.id)
            .map(|b| b.pos.chunk())
            .collect();
        let selected: BTreeSet<ChunkPos> = scan.chunks.keys().copied().filter(|pos| spec.scope.selects(*pos, &beds)).collect();
        let targets: BTreeSet<ChunkPos> = selected.iter().copied().filter(|pos| !protection.is_protected(*pos)).collect();
        let structures = structures_of(&scan);
        analysis.dims.push(DimResult { dim, scan, protection, selected, targets, structures });
    }
    analysis.dims.sort_by(|a, b| a.dim.id.cmp(&b.dim.id));
    if analysis.edits.new_seed.is_some() {
        // Every dimension with land has to be in the run: the seed is the world's.
        let left_out: Vec<String> = analysis
            .all_dims
            .iter()
            .filter(|d| anvil::store_summary(&d.store_dir(Store::Region)).0 > 0 && analysis.dim(&d.id).is_none())
            .map(|d| d.id.clone())
            .collect();
        if !left_out.is_empty() {
            return Err(format!(
                "new_seed: the seed is the world's, so every dimension with land has to be in the run; not in it: {}",
                left_out.join(", ")
            ));
        }
    }
    if analysis.edits.blend {
        if let Some(d) = analysis.dim(OVERWORLD) {
            let kept: BTreeSet<ChunkPos> = d.scan.chunks.iter().filter(|(pos, c)| c.in_store(Store::Region) && !d.targets.contains(*pos)).map(|(pos, _)| *pos).collect();
            analysis.blend = Some(edits::blend_scan(&d.dim, &kept).map_err(|e| format!("blend: the kept chunks do not read ({e})"))?);
        }
    }
    collect_warnings(&mut analysis);
    Ok(analysis)
}

// =============================================================================
// Warnings
// =============================================================================

fn collect_warnings(a: &mut Analysis) {
    let mut out: Vec<Warning> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let warn = |out: &mut Vec<Warning>, kind: &'static str, dim: &str, chunk: Option<ChunkPos>, pos: Option<BlockPos>, detail: String| {
        out.push(Warning { kind, dim: dim.to_string(), chunk, pos, detail });
    };

    if a.server_probably_running() {
        warn(&mut out, "server-running", "", None, None, format!(
            "level.dat was saved {} ago, so the server is probably running: chunk data on disk can be one autosave behind the live world. This report is safe to take and to read; an execution must recompute the plan with the server stopped.",
            fmt_span(a.last_save.unwrap_or_default())
        ));
    }

    // online-mode: every protection keyed by a player's UUID hangs on it.
    let offline = a.players.iter().filter(|p| worlddata::uuid_version(&p.uuid) == Some(3)).count();
    let online = a.players.iter().filter(|p| worlddata::uuid_version(&p.uuid) == Some(4)).count();
    let mode = a.online_mode.clone().unwrap_or_else(|| "not set".to_string());
    let mismatch = match mode.as_str() {
        "true" if offline > 0 => " MISMATCH: online-mode is true but these are offline UUIDs, so the players' current UUIDs are not the ones in playerdata.",
        "false" if online > 0 => " MISMATCH: online-mode is false but some player files carry Mojang UUIDs.",
        _ => "",
    };
    warn(&mut out, "online-mode", "", None, None, format!(
        "online-mode={mode}; {offline} of {} player files carry offline (version 3) UUIDs, {online} Mojang (version 4) ones. Beds, claims and player data are keyed by UUID: switching online-mode gives every player a new UUID and orphans the bed and claim layers. Treat a switch as a migration, never as a setting.{mismatch}",
        a.players.len()
    ));

    for p in &a.players {
        let Some(bed) = &p.bed else {
            let at = p.last_pos.as_ref().map_or("unknown".to_string(), |(dim, pos)| {
                format!("chunk {:?} in {dim}: {}", pos.chunk(), a.fate_text(dim, pos.chunk()))
            });
            warn(&mut out, "player-no-bed", "", None, None, format!(
                "{} has no bed or respawn point: the bed layer keeps nothing for them. Last seen at {at}",
                p.label()
            ));
            continue;
        };
        if a.dim(&bed.dim).is_none() {
            warn(&mut out, "bed-outside-scope", &bed.dim, Some(bed.pos.chunk()), Some(bed.pos), format!(
                "{}'s bed is in {}, which is not one of this run's dimensions: nothing there is analysed or touched",
                p.label(),
                bed.dim
            ));
        }
    }
    for p in &a.players {
        if let Some((dim, pos)) = &p.last_pos {
            if matches!(a.fate(dim, pos.chunk()), Fate::Regenerate) {
                warn(&mut out, "logout-position-in-target", dim, Some(pos.chunk()), Some(*pos), format!(
                    "{} logged out in a chunk that would be regenerated: they would come back into fresh terrain",
                    p.label()
                ));
            }
        }
    }
    // What the bed and logout layers cannot see. By file number only: these
    // lines name no one (the files are named by UUID).
    let files = a.player_files();
    for u in &a.unreadable_players {
        warn(&mut out, "player-file-unreadable", "", None, None, format!(
            "player file #{} of {files} in playerdata/ (sorted by file name) does not read, and neither does its .dat_old ({}): this player's bed and logout spot are unknown, so neither the bed layer nor the logout layer keeps anything for them. A regeneration is refused until the file reads.",
            a.file_no(&u.uuid),
            u.why
        ));
    }
    if a.settings.logout_radius.is_some() {
        for p in a.players.iter().filter(|p| p.last_pos.is_none()) {
            warn(&mut out, "logout-unknown", "", None, None, format!(
                "player file #{} of {files} in playerdata/ reads but holds no position (Pos): the logout layer keeps nothing for this player",
                a.file_no(&p.uuid)
            ));
        }
    }

    let tracks = match worlddata::read_create_tracks(&a.world_dir) {
        Ok(Some(nodes)) => nodes,
        Ok(None) => {
            notes.push("Create: no data/create_tracks.dat (no train track has been laid), nothing to check".to_string());
            Vec::new()
        }
        Err(e) => {
            warn(&mut out, "mod-data-unreadable", "", None, None, format!("Create track graphs were NOT checked: {e}"));
            Vec::new()
        }
    };

    for d in &a.dims {
        let id = d.dim.id.as_str();
        for file in &d.scan.changed_during_scan {
            warn(&mut out, "files-changed-during-scan", id, None, None, format!(
                "{file} was written by the server while it was being read: what was read may mix two saves (chunks in it that did not parse were read again)"
            ));
        }
        if d.scan.external_chunk_files > 0 {
            notes.push(format!(
                "{id}: {} oversized chunk file(s) (c.x.z.mcc) sit next to the region files; an execution has to remove those of regenerated chunks too",
                d.scan.external_chunk_files
            ));
        }
        for (pos, entry) in &d.scan.chunks {
            if let Some(why) = &entry.unreadable {
                let fate = if d.protection.is_protected(*pos) { "kept, because unknown is kept" } else { "unprotected by the policy file" };
                warn(&mut out, "unreadable-chunk", id, Some(*pos), None, format!("its terrain data could not be read ({why}); {fate}"));
            }
        }
        for (pos, was) in &d.protection.overridden {
            let outcome = if d.targets.contains(pos) { "it WOULD BE REGENERATED" } else { "it is outside this run's scope" };
            let why = if was.why.is_empty() { String::new() } else { format!(" [{}]", was.why.join("; ")) };
            warn(&mut out, "unprotect-overrides-a-layer", id, Some(*pos), None, format!(
                "an unprotect= line removes the protection of {}{why}; {outcome}",
                layer_names(was.layers)
            ));
        }
        let warn_at = a.settings.inhabited_warn_ticks;
        for pos in &d.targets {
            let ticks = d.scan.chunks.get(pos).and_then(|c| c.inhabited).unwrap_or(0);
            if ticks > 0 && ticks as u64 >= warn_at {
                warn(&mut out, "lived-in-not-protected", id, Some(*pos), None, format!("InhabitedTime {ticks} ticks ({})", fmt_ticks(ticks)));
            }
        }
        for w in a.waystones.iter().flatten().filter(|w| w.dim == id && d.targets.contains(&w.pos.chunk())) {
            let by = activated_by(&a.players, &w.uid);
            let by = if by.is_empty() { "nobody".to_string() } else { by.join(", ") };
            warn(&mut out, "waystone-in-target", id, Some(w.pos.chunk()), Some(w.pos), format!(
                "waystone '{}' ({}, origin {}, activated by {by}): its waystones.dat entry would outlive the block",
                w.label(),
                w.uid,
                w.origin
            ));
        }
        for owner in a.claims.iter().flatten() {
            for claim in owner.claims.iter().filter(|c| c.dim == id && d.targets.contains(&c.chunk)) {
                warn(&mut out, "claim-in-target", id, Some(claim.chunk), None, format!("claimed by {} in Open Parties and Claims", owner.label()));
            }
        }
        let mut per_chunk: BTreeMap<(usize, ChunkPos), usize> = BTreeMap::new();
        for node in tracks.iter().filter(|n| n.dim == id && d.targets.contains(&n.pos.chunk())) {
            *per_chunk.entry((node.graph, node.pos.chunk())).or_default() += 1;
        }
        for ((graph, chunk), nodes) in per_chunk {
            warn(&mut out, "create-track-in-target", id, Some(chunk), None, format!("{nodes} node(s) of Create track graph #{graph}: the saved graph would point at track that is gone"));
        }
        match worlddata::read_mca_villages(&d.dim.data_dir()) {
            Ok(Some(villages)) => {
                for v in &villages {
                    let hit: Vec<&(String, BlockPos)> = v.buildings.iter().filter(|(_, pos)| d.targets.contains(&pos.chunk())).collect();
                    if let Some((_, first)) = hit.first() {
                        warn(&mut out, "mca-village-in-target", id, Some(first.chunk()), Some(*first), format!(
                            "MCA village '{}' (id {}): {} of its {} recorded building(s) stand in chunks that would be regenerated",
                            v.name,
                            v.id,
                            hit.len(),
                            v.buildings.len()
                        ));
                    }
                }
            }
            Ok(None) => {}
            Err(e) => warn(&mut out, "mod-data-unreadable", id, None, None, format!("MCA villages were NOT checked: {e}")),
        }
        match worlddata::read_ore_deposits(&d.dim.data_dir()) {
            Ok(Some(deposits)) => {
                for dep in deposits.iter().filter(|dep| d.targets.contains(&dep.pos.chunk())) {
                    warn(&mut out, "ore-deposit-in-target", id, Some(dep.pos.chunk()), Some(dep.pos), format!(
                        "large ore deposit '{}': recorded as generated, so the mod may not place it again",
                        dep.name
                    ));
                }
            }
            Ok(None) => {}
            Err(e) => warn(&mut out, "mod-data-unreadable", id, None, None, format!("large ore deposits were NOT checked: {e}")),
        }
    }

    let lootr = fs::read_dir(a.world_dir.join("data").join("lootr")).map(|rd| rd.count()).unwrap_or(0);
    if lootr > 0 {
        notes.push(format!(
            "Lootr: {lootr} entries in data/lootr. Chests in regenerated chunks come back fresh; their old entries are harmless orphans"
        ));
    }
    a.warnings = out;
    a.notes.extend(notes);
}

/// The players who have activated a waystone.
fn activated_by<'p>(players: &'p [Player], uid: &str) -> Vec<&'p str> {
    players.iter().filter(|p| p.waystones.iter().any(|w| w.as_str() == uid)).map(|p| p.label()).collect()
}

/// Warning kinds in the order the report lists them, with their headings.
const WARNING_KINDS: [(&str, &str, usize); 17] = [
    ("server-running", "The server is probably running", 5),
    ("player-file-unreadable", "Player files that do NOT read (their bed and logout spot are unknown)", 20),
    ("mod-data-unreadable", "Mod data that could NOT be checked", 20),
    ("unprotect-overrides-a-layer", "Protection removed by an unprotect= line in the policy file", 40),
    ("unreadable-chunk", "Chunks whose terrain data could not be read", 40),
    ("files-changed-during-scan", "Region files the server wrote to during the scan", 10),
    ("lived-in-not-protected", "Lived-in chunks that are NOT protected (they would be regenerated)", 40),
    ("logout-position-in-target", "Players who logged out in a chunk that would be regenerated", 40),
    ("logout-unknown", "Players whose logout spot is unknown (the logout layer keeps nothing for them)", 20),
    ("claim-in-target", "Claimed chunks that would be regenerated", 40),
    ("waystone-in-target", "Waystones in chunks that would be regenerated", 40),
    ("create-track-in-target", "Create train track in chunks that would be regenerated", 40),
    ("mca-village-in-target", "MCA villages with buildings in chunks that would be regenerated", 40),
    ("ore-deposit-in-target", "Large ore deposits in chunks that would be regenerated", 15),
    ("player-no-bed", "Players with no bed", 40),
    ("bed-outside-scope", "Beds in a dimension this run does not cover", 40),
    ("online-mode", "online-mode and player UUIDs", 5),
];

// =============================================================================
// Plan
// =============================================================================

/// SHA-256 over the plan's substance, as text:
///
/// ```text
/// icraft-regen-plan v1
/// level=<level-name>
/// dim=<dimension id>            (every analysed dimension, sorted by id)
/// <chunk x>,<chunk z>           (its chunks to regenerate, sorted by x then z)
/// ```
///
/// Each line ends with `\n`. Two plans have the same hash exactly when they
/// would regenerate the same chunks of the same dimensions of the same world
/// folder.
pub fn plan_hash<'a>(level_name: &str, dims: impl IntoIterator<Item = (&'a str, &'a BTreeSet<ChunkPos>)>) -> String {
    plan_hash_with(level_name, dims, &[])
}

/// [`plan_hash`], then one line per change the plan makes besides chunks
/// ([`edits::Edits::hash_lines`]): with none, the same hash.
pub fn plan_hash_with<'a>(level_name: &str, dims: impl IntoIterator<Item = (&'a str, &'a BTreeSet<ChunkPos>)>, edit_lines: &[String]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("icraft-regen-plan v{PLAN_VERSION}\nlevel={level_name}\n"));
    for (id, targets) in dims {
        hasher.update(format!("dim={id}\n"));
        for (x, z) in targets {
            hasher.update(format!("{x},{z}\n"));
        }
    }
    for line in edit_lines {
        hasher.update(format!("{line}\n"));
    }
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

fn plan_json(a: &Analysis, hash: &str, created_utc: &str) -> String {
    let mut out = String::new();
    wl!(out, "{{");
    wl!(out, "  \"format\": \"icraft-regen-plan\",");
    wl!(out, "  \"version\": {PLAN_VERSION},");
    wl!(out, "  \"dry_run\": true,");
    wl!(out, "  \"note\": \"Produced by a dry-run: nothing was deleted. An execution must recompute this plan with the server stopped and refuse to act unless its hash equals plan_hash.\",");
    wl!(out, "  \"created_utc\": {},", json_str(created_utc));
    wl!(out, "  \"launcher\": {},", json_str(env!("CARGO_PKG_VERSION")));
    wl!(out, "  \"server_dir\": {},", json_str(&a.server_dir.display().to_string()));
    wl!(out, "  \"server_probably_running\": {},", a.server_probably_running());
    wl!(out, "  \"world\": {{");
    wl!(out, "    \"level_name\": {},", json_str(&a.level_name));
    // As text: a seed does not fit the doubles most JSON readers use.
    wl!(out, "    \"seed\": {},", a.level.seed.map_or("null".to_string(), |s| json_str(&s.to_string())));
    wl!(out, "    \"minecraft\": {},", a.level.version_name.as_deref().map_or("null".to_string(), json_str));
    wl!(out, "    \"data_version\": {},", a.level.data_version.map_or("null".to_string(), |v| v.to_string()));
    wl!(out, "    \"last_played_ms\": {},", a.level.last_played_ms.map_or("null".to_string(), |v| v.to_string()));
    wl!(out, "    \"spawn_block\": [{}, {}, {}]", a.level.spawn.x, a.level.spawn.y, a.level.spawn.z);
    wl!(out, "  }},");
    wl!(out, "  \"scope\": {},", json_str(&a.spec.scope.token()));
    let settings: Vec<String> = a.settings.to_pairs().iter().map(|(k, v)| format!("[{}, {}]", json_str(k), json_str(v))).collect();
    wl!(out, "  \"settings\": [{}],", settings.join(", "));
    wl!(out, "  \"settings_source\": {},", json_str(if a.settings_from_caller { "the launcher window (the policy file was not read)" } else { "defaults, then the policy file, then this run's overrides" }));
    wl!(out, "  \"policy_file\": {},", a.policy_text.as_deref().map_or("null".to_string(), json_str));
    wl!(out, "  \"plan_hash\": {},", json_str(hash));
    wl!(out, "  \"hash_recipe\": \"sha256 of the UTF-8 text: 'icraft-regen-plan v{PLAN_VERSION}' LF, 'level=<level_name>' LF, then per dimension (sorted by id) 'dim=<id>' LF followed by '<x>,<z>' LF for each chunk (sorted by x, then z), then one line LF per world edit: 'seed_from=<old>' and 'seed=<new>', 'blend=kept-chunks', 'spawn=search y=<y>', 'reset_player=<uuid>' (sorted)\",");
    wl!(out, "  \"world_edits\": {},", a.edits.to_json());
    wl!(out, "  \"total_chunks\": {},", a.total_targets());
    wl!(out, "  \"dimensions\": [");
    for (i, d) in a.dims.iter().enumerate() {
        let stats = d.stats();
        wl!(out, "    {{");
        wl!(out, "      \"id\": {},", json_str(&d.dim.id));
        wl!(out, "      \"folder\": {},", json_str(&d.dim.rel));
        wl!(out, "      \"chunks_on_disk\": {},", stats.on_disk);
        wl!(out, "      \"protected_on_disk\": {},", stats.protected_on_disk);
        wl!(out, "      \"chunks\": {},", stats.targets);
        wl!(out, "      \"delete_files\": {{");
        for (s, store) in Store::ALL.iter().enumerate() {
            let names: Vec<String> = stats.files[s].whole.iter().map(|n| json_str(n)).collect();
            wl!(out, "        \"{}\": [{}]{}", store.dir_name(), names.join(", "), if s + 1 < Store::ALL.len() { "," } else { "" });
        }
        wl!(out, "      }},");
        let mut regions: BTreeMap<(i32, i32), Vec<ChunkPos>> = BTreeMap::new();
        for pos in &d.targets {
            regions.entry(anvil::region_of(*pos)).or_default().push(*pos);
        }
        wl!(out, "      \"regions\": [");
        for (j, ((rx, rz), chunks)) in regions.iter().enumerate() {
            let list: Vec<String> = chunks.iter().map(|(x, z)| format!("[{x},{z}]")).collect();
            wl!(out, "        {{\"rx\": {rx}, \"rz\": {rz}, \"chunks\": [{}]}}{}", list.join(","), if j + 1 < regions.len() { "," } else { "" });
        }
        wl!(out, "      ]");
        wl!(out, "    }}{}", if i + 1 < a.dims.len() { "," } else { "" });
    }
    wl!(out, "  ]");
    wl!(out, "}}");
    out
}

// =============================================================================
// The run, as data
// =============================================================================
//
// Everything a person is shown about a run -- report.txt, the launcher's
// Customizer tab -- is drawn from one [`RunView`], which is also written into
// the run's folder as summary.json. The text report and the window therefore
// cannot disagree, and the window can show a run it did not make (one asked
// for over WinRM, or last week's).

/// In a run's folder: the [`RunView`], for the launcher window.
pub const SUMMARY_FILE: &str = "summary.json";
const VIEW_FORMAT: &str = "icraft-regen-summary";
const VIEW_VERSION: u32 = 1;

/// One protection setting as it was for the run.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SettingRow {
    pub name: String,
    pub value: String,
    pub is_default: bool,
}

/// A dimension that has chunks on disk: files and size per chunk folder.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct FoundDimension {
    pub id: String,
    pub folder: String,
    pub region: String,
    pub entities: String,
    pub poi: String,
    pub in_run: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LayerRow {
    pub name: String,
    /// Chunks on disk the layer keeps.
    pub kept: usize,
    /// Of those, the ones no other layer keeps.
    pub alone: usize,
    /// What the layer was built from, when that is worth a line (the logout
    /// layer: how many players logged out here, and how many spots are
    /// unknown). Counts only.
    pub note: String,
}

/// A count of region files, per chunk folder.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct FileRow {
    pub label: String,
    pub region: usize,
    pub entities: usize,
    pub poi: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CountRow {
    pub label: String,
    pub count: usize,
}

/// What the lived-in layer would keep at one threshold.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ThresholdRow {
    pub ticks: i64,
    pub time: String,
    pub count: usize,
    pub this_run: bool,
}

/// Where a dimension's overview map is and how its pixels map to chunks:
/// pixel (px, py) shows chunk (`origin_x + px / pixels_per_chunk`,
/// `origin_z + py / pixels_per_chunk`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MapInfo {
    pub file: String,
    pub origin_x: i64,
    pub origin_z: i64,
    pub pixels_per_chunk: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct DimView {
    pub id: String,
    pub folder: String,
    pub on_disk: usize,
    pub terrain: usize,
    pub entities: usize,
    pub poi: usize,
    pub protected: usize,
    pub protected_not_on_disk: usize,
    pub layers: Vec<LayerRow>,
    pub selected: usize,
    pub kept_in_scope: usize,
    pub targets: usize,
    /// On disk, not protected, not selected.
    pub untouched: usize,
    pub files: Vec<FileRow>,
    /// Size of the region files that would be removed entirely.
    pub freed_bytes: u64,
    pub without_inhabited_time: usize,
    pub inhabited: Vec<CountRow>,
    pub thresholds: Vec<ThresholdRow>,
    pub longest_ticks: i64,
    pub map: Option<MapInfo>,
    /// `None`: this run did not read structures (a launcher before
    /// 2026-10-24 made it).
    pub structures: Option<StructuresView>,
}

/// What a plan does to the structures of a dimension.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StructuresView {
    /// Structures: a start and the chunks that hold its pieces.
    pub total: usize,
    pub kept_whole: usize,
    pub reset_whole: usize,
    pub cut: usize,
    /// Of the cut ones, those whose start chunk is regenerated.
    pub cut_start_reset: usize,
    /// Of the cut ones, those with no start on disk.
    pub cut_no_start: usize,
    /// Structures whose start is not on disk: pieces only.
    pub without_start: usize,
    /// Terrain chunks whose structures did not read (planned as usual).
    pub unreadable: usize,
    /// Terrain chunks with no `structures` compound.
    pub without_tag: usize,
    pub types: Vec<StructureTypeRow>,
    /// The cut ones, the most chunks first (local positions: this file stays
    /// on the server).
    pub cut_lines: Vec<String>,
    pub cut_more: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StructureTypeRow {
    pub id: String,
    pub total: usize,
    pub kept_whole: usize,
    pub reset_whole: usize,
    pub cut: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlayerView {
    pub name: String,
    pub uuid: String,
    /// `offline UUID`, `Mojang UUID` or `UUID`.
    pub uuid_kind: String,
    pub from_old: bool,
    /// Bed, bed area, neighbourhood, logout position, claims, waystones.
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct WarningGroup {
    pub kind: String,
    pub title: String,
    pub count: usize,
    /// The first of them; all are in warnings.csv.
    pub lines: Vec<String>,
    /// How many are not in `lines`.
    pub more: usize,
}

/// A finished run, as the facts a person is shown.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct RunView {
    pub format: String,
    pub version: u32,
    pub created_local: String,
    pub created_utc: String,
    pub elapsed_secs: f64,
    pub server_dir: String,
    pub level_name: String,
    /// `Minecraft 1.20.1, data version 3465, seed ...`
    pub world: String,
    pub spawn: String,
    pub server: String,
    pub server_probably_running: bool,
    /// `ring:8`
    pub scope: String,
    pub scope_text: String,
    pub plan_hash: String,
    /// Over all analysed dimensions.
    pub on_disk: usize,
    pub protected: usize,
    pub selected: usize,
    pub targets: usize,
    pub warnings: usize,
    pub policy_file: String,
    /// `key=value` settings given for this run only.
    pub overrides: Vec<String>,
    pub settings: Vec<SettingRow>,
    pub found: Vec<FoundDimension>,
    /// Dimension folders that hold no chunks.
    pub bare_dimensions: Vec<String>,
    pub dimensions: Vec<DimView>,
    pub players: Vec<PlayerView>,
    pub claims: String,
    /// Empty when the world has no waystones.dat.
    pub waystones_title: String,
    pub waystones: Vec<String>,
    pub warning_groups: Vec<WarningGroup>,
    pub notes: Vec<String>,
    pub files: Vec<String>,
    /// What the plan changes besides chunks, in words (since 2026-10-25).
    pub edits: Vec<String>,
}

/// `71,791`
pub fn num(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn csv(field: &str) -> String {
    if field.contains(|c: char| matches!(c, ',' | '"' | '\n' | '\r')) {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

fn heading(out: &mut String, title: &str) {
    wl!(out);
    wl!(out, "{title}");
    wl!(out, "{}", "-".repeat(title.chars().count()));
}

fn file_row(label: &str, files: &[FileStats; 3], count: fn(&FileStats) -> usize) -> FileRow {
    FileRow { label: label.to_string(), region: count(&files[0]), entities: count(&files[1]), poi: count(&files[2]) }
}

const INHABITED_BUCKETS: [(&str, i64, i64); 8] = [
    ("never", 0, 0),
    ("under 1 min", 1, 1_199),
    ("1 to 5 min", 1_200, 5_999),
    ("5 to 10 min", 6_000, 11_999),
    ("10 to 30 min", 12_000, 35_999),
    ("30 to 60 min", 36_000, 71_999),
    ("1 to 10 h", 72_000, 719_999),
    ("10 h and more", 720_000, i64::MAX),
];
const INHABITED_THRESHOLDS: [i64; 7] = [1_200, 6_000, 12_000, 24_000, 36_000, 72_000, 720_000];

fn dim_view(a: &Analysis, d: &DimResult, map: Option<MapInfo>) -> DimView {
    let s = d.stats();
    let times: Vec<i64> = d.scan.chunks.values().filter(|c| c.in_store(Store::Region)).map(|c| c.inhabited.unwrap_or(0)).collect();
    DimView {
        id: d.dim.id.clone(),
        folder: d.dim.rel.clone(),
        on_disk: s.on_disk,
        terrain: s.per_store[0],
        entities: s.per_store[1],
        poi: s.per_store[2],
        protected: s.protected_on_disk,
        protected_not_on_disk: s.protected_not_on_disk,
        layers: Layer::ALL
            .iter()
            .enumerate()
            .map(|(i, l)| LayerRow { name: l.name().to_string(), kept: s.layer[i], alone: s.layer_alone[i], note: layer_note(a, &d.dim.id, *l) })
            .collect(),
        selected: s.selected,
        kept_in_scope: s.kept_in_scope,
        targets: s.targets,
        untouched: s.on_disk - s.protected_on_disk - s.targets,
        files: vec![
            file_row("holding chunks", &s.files, |f| f.with_chunks),
            file_row("REMOVED ENTIRELY", &s.files, |f| f.whole.len()),
            file_row("partly cleared", &s.files, |f| f.partial),
            file_row("untouched", &s.files, |f| f.untouched),
            file_row("empty placeholders", &s.files, |f| f.empty),
        ],
        freed_bytes: s.files.iter().map(|f| f.whole_bytes).sum(),
        without_inhabited_time: d.scan.without_inhabited_time,
        inhabited: INHABITED_BUCKETS
            .iter()
            .map(|(label, lo, hi)| CountRow { label: label.to_string(), count: times.iter().filter(|t| (*lo..=*hi).contains(*t)).count() })
            .collect(),
        thresholds: INHABITED_THRESHOLDS
            .iter()
            .map(|at| ThresholdRow {
                ticks: *at,
                time: fmt_ticks(*at),
                count: times.iter().filter(|t| **t >= *at).count(),
                this_run: a.settings.inhabited_min_ticks == Some(*at as u64),
            })
            .collect(),
        longest_ticks: times.iter().copied().max().unwrap_or(0),
        map,
        structures: d.scan.structures_read.then(|| structures_view(d)),
    }
}

/// Cut structures listed by name in the report; the rest are in structures.csv.
const CUT_LISTED: usize = 200;

fn structures_view(d: &DimResult) -> StructuresView {
    let mut v = StructuresView {
        total: d.structures.len(),
        unreadable: d.scan.structures_unreadable.len(),
        without_tag: d.scan.without_structures,
        ..StructuresView::default()
    };
    let mut types: BTreeMap<&str, StructureTypeRow> = BTreeMap::new();
    let mut cut: Vec<&Structure> = Vec::new();
    for s in &d.structures {
        let row = types.entry(s.id.as_str()).or_insert_with(|| StructureTypeRow { id: s.id.clone(), ..StructureTypeRow::default() });
        row.total += 1;
        if s.record.is_none() {
            v.without_start += 1;
        }
        match s.fate(&d.targets) {
            StructureFate::KeptWhole => {
                v.kept_whole += 1;
                row.kept_whole += 1;
            }
            StructureFate::ResetWhole => {
                v.reset_whole += 1;
                row.reset_whole += 1;
            }
            StructureFate::Cut => {
                v.cut += 1;
                row.cut += 1;
                cut.push(s);
                match s.start_word(&d.targets) {
                    "regenerated" => v.cut_start_reset += 1,
                    "not on disk" => v.cut_no_start += 1,
                    _ => {}
                }
            }
        }
    }
    v.types = types.into_values().collect();
    v.types.sort_by(|a, b| b.total.cmp(&a.total).then_with(|| a.id.cmp(&b.id)));
    cut.sort_by(|a, b| b.chunks.len().cmp(&a.chunks.len()).then_with(|| a.id.cmp(&b.id)).then_with(|| a.start.cmp(&b.start)));
    v.cut_more = cut.len().saturating_sub(CUT_LISTED);
    v.cut_lines = cut
        .iter()
        .take(CUT_LISTED)
        .map(|s| {
            let reset = s.regenerated(&d.targets);
            let start = match s.start_word(&d.targets) {
                "kept" => "start kept: the regenerated part is rebuilt from it",
                "regenerated" => "start REGENERATED: made anew by today's worldgen",
                _ => "no start on disk: the regenerated part comes back without it",
            };
            format!("{}  start chunk {:?}: {} chunk(s), {} kept, {} regenerated; {start}", s.id, s.start, s.chunks.len(), s.chunks.len() - reset, reset)
        })
        .collect();
    v
}

/// [`LayerRow::note`].
fn layer_note(a: &Analysis, dim: &str, layer: Layer) -> String {
    // Whose: the players a per-player list keeps (local labels: report.txt and
    // summary.json stay on the server, and already name every player).
    let whose = |list: &[String]| {
        let names: Vec<&str> = a.players.iter().filter(|p| list.contains(&p.uuid)).map(|p| p.label()).collect();
        format!("only {} of {} player(s): {}", names.len(), a.player_files(), names.join(", "))
    };
    match layer {
        Layer::Bed if a.settings.bed_radius.is_some() && !a.settings.bed_players.is_empty() => whose(&a.settings.bed_players),
        Layer::Logout => {
            if a.settings.logout_radius.is_none() {
                return "the layer is off".to_string();
            }
            let here = a.players.iter().filter(|p| p.last_pos.as_ref().is_some_and(|(d, _)| d == dim)).count();
            let unknown = a.players.iter().filter(|p| p.last_pos.is_none()).count() + a.unreadable_players.len();
            let mut note = format!("{here} of {} player file(s) logged out in this dimension", a.player_files());
            if !a.settings.logout_players.is_empty() {
                note.push_str(&format!("; {}", whose(&a.settings.logout_players)));
            }
            if unknown > 0 {
                note.push_str(&format!("; {unknown} logout spot(s) UNKNOWN, see the warnings"));
            }
            note
        }
        _ => String::new(),
    }
}

fn player_view(a: &Analysis, p: &Player, around: u32) -> PlayerView {
    let mut lines = Vec::new();
    match &p.bed {
        None => lines.push("bed          none".to_string()),
        Some(bed) => {
            let c = bed.pos.chunk();
            lines.push(format!("bed          block {} in {} = chunk {:?}{}", bed.pos, bed.dim, c, if bed.forced { "  (set by command)" } else { "" }));
            match a.dim(&bed.dim) {
                None => lines.push(format!("bed area     {} is not part of this run", bed.dim)),
                Some(d) => {
                    match a.settings.bed_radius {
                        Some(r) => lines.push(format!("bed area     {0}x{0} chunks: {1}", 2 * r + 1, tally_square(d, c, r).sentence())),
                        None => lines.push(format!("bed area     the bed layer is off: {}", a.fate_text(&bed.dim, c))),
                    }
                    lines.push(format!("within {around:<2}    {0}x{0} chunks: {1}", 2 * around + 1, tally_square(d, c, around).sentence()));
                }
            }
        }
    }
    match &p.last_pos {
        Some((dim, pos)) => lines.push(format!("logged out   block {} in {} = chunk {:?}: {}", pos, dim, pos.chunk(), a.fate_text(dim, pos.chunk()))),
        None => lines.push("logged out   unknown".to_string()),
    }
    let claimed: Vec<&worlddata::Claim> = a.claims.iter().flatten().filter(|o| o.uuid == p.uuid).flat_map(|o| o.claims.iter()).collect();
    if claimed.is_empty() {
        lines.push("claims       none".to_string());
    } else {
        let lost = claimed.iter().filter(|c| matches!(a.fate(&c.dim, c.chunk), Fate::Regenerate)).count();
        lines.push(format!("claims       {} chunk(s), {} would be regenerated", claimed.len(), lost));
    }
    if let Some(all) = &a.waystones {
        let mine: Vec<&Waystone> = all.iter().filter(|w| p.waystones.contains(&w.uid)).collect();
        let lost = mine.iter().filter(|w| matches!(a.fate(&w.dim, w.pos.chunk()), Fate::Regenerate)).count();
        lines.push(format!(
            "waystones    {} activated ({} of them still in waystones.dat), {} would be regenerated",
            p.waystones.len(),
            mine.len(),
            lost
        ));
    }
    let uuid_kind = match worlddata::uuid_version(&p.uuid) {
        Some(3) => "offline UUID",
        Some(4) => "Mojang UUID",
        _ => "UUID",
    };
    PlayerView { name: p.label().to_string(), uuid: p.uuid.clone(), uuid_kind: uuid_kind.to_string(), from_old: p.from_old, lines }
}

fn waystone_lines(a: &Analysis, all: &[Waystone]) -> Vec<String> {
    let activated = a.sources().activated_waystones();
    let mut by_origin: BTreeMap<&str, usize> = BTreeMap::new();
    for w in all {
        *by_origin.entry(w.origin.as_str()).or_default() += 1;
    }
    let origins: Vec<String> = by_origin.iter().map(|(o, n)| format!("{o} {n}")).collect();
    let chunks: BTreeSet<(&str, ChunkPos)> = all.iter().map(|w| (w.dim.as_str(), w.pos.chunk())).collect();
    let used = all.iter().filter(|w| w.is_used(&activated)).count();
    let lost = all.iter().filter(|w| matches!(a.fate(&w.dim, w.pos.chunk()), Fate::Regenerate)).count();
    vec![
        format!("in {} chunk(s); by origin: {}", chunks.len(), origins.join(", ")),
        format!(
            "used by players: {used} (activated by somebody: {}; placed by a player: {}); generated and never used: {}",
            all.iter().filter(|w| activated.contains(w.uid.as_str())).count(),
            all.iter().filter(|w| w.placed_by_player()).count(),
            all.len() - used
        ),
        format!("the waystone layer is set to '{}' for this run", a.settings.waystones.keyword()),
        format!("in chunks that would be regenerated: {lost}"),
        "A regenerated waystone is a new one: its old entry in waystones.dat has to be pruned when a plan is carried out.".to_string(),
    ]
}

fn warning_groups(a: &Analysis) -> Vec<WarningGroup> {
    let mut out = Vec::new();
    for (kind, title, show) in WARNING_KINDS {
        let mut of_kind: Vec<&Warning> = a.warnings.iter().filter(|w| w.kind == kind).collect();
        if of_kind.is_empty() {
            continue;
        }
        if kind == "lived-in-not-protected" {
            // Longest-inhabited first: those are the ones to look at.
            of_kind.sort_by_key(|w| std::cmp::Reverse(a.dim(&w.dim).and_then(|d| w.chunk.and_then(|c| d.scan.chunks.get(&c))).and_then(|c| c.inhabited).unwrap_or(0)));
        }
        let lines: Vec<String> = of_kind
            .iter()
            .take(show)
            .map(|w| {
                let place = match (w.chunk, w.dim.is_empty()) {
                    (Some(c), false) => format!("chunk {c:?} in {}: ", w.dim),
                    (None, false) => format!("{}: ", w.dim),
                    _ => String::new(),
                };
                format!("{place}{}", w.detail)
            })
            .collect();
        out.push(WarningGroup { kind: kind.to_string(), title: title.to_string(), count: of_kind.len(), more: of_kind.len().saturating_sub(show), lines });
    }
    out
}

fn build_view(a: &Analysis, hash: &str, when_local: &str, when_utc: &str, elapsed: Duration, files: Vec<String>, maps: &BTreeMap<String, MapInfo>) -> RunView {
    let around = match a.spec.scope {
        Scope::Ring(n) => n,
        _ => NEIGHBOURHOOD,
    };
    let server = match a.last_save {
        Some(age) if a.server_probably_running() => format!("level.dat saved {} ago: probably RUNNING (see the first warning)", fmt_span(age)),
        Some(age) => format!("level.dat saved {} ago: probably stopped", fmt_span(age)),
        None => "unknown (level.dat has no readable timestamp)".to_string(),
    };
    let policy_file = if a.settings_from_caller {
        format!("not consulted: the settings below came with the request (the launcher window), {} was not read", protection::POLICY_FILE)
    } else if a.policy_text.is_some() {
        format!("{} is in effect", protection::POLICY_FILE)
    } else {
        format!("none ({} next to server.properties would be read)", protection::POLICY_FILE)
    };
    let mut found = Vec::new();
    let mut bare_dimensions = Vec::new();
    for dim in &a.all_dims {
        if !dim.has_chunk_storage() {
            bare_dimensions.push(dim.id.clone());
            continue;
        }
        let cell = |store: Store| {
            let (files, bytes) = anvil::store_summary(&dim.store_dir(store));
            if files == 0 { "-".to_string() } else { format!("{files} / {}", crate::backup::fmt_bytes(bytes)) }
        };
        found.push(FoundDimension {
            id: dim.id.clone(),
            folder: if dim.rel.is_empty() { "(world root)".to_string() } else { dim.rel.clone() },
            region: cell(Store::Region),
            entities: cell(Store::Entities),
            poi: cell(Store::Poi),
            in_run: a.dim(&dim.id).is_some(),
        });
    }
    let dimensions: Vec<DimView> = a.dims.iter().map(|d| dim_view(a, d, maps.get(&d.dim.id).cloned())).collect();
    let reserved: Vec<String> = a
        .claims
        .iter()
        .flatten()
        .filter(|o| o.uuid == worlddata::OPAC_SERVER_UUID || o.uuid == worlddata::OPAC_EXPIRED_UUID)
        .map(|o| format!("{}: {} chunk(s)", o.label(), o.claims.len()))
        .collect();
    let claims = match &a.claims {
        None => "Open Parties and Claims: no player-claims folder in this world".to_string(),
        Some(owners) => format!(
            "Open Parties and Claims: {} owner file(s), {} claimed chunk(s) in all{}",
            owners.len(),
            owners.iter().map(|o| o.claims.len()).sum::<usize>(),
            if reserved.is_empty() { String::new() } else { format!(" ({})", reserved.join("; ")) }
        ),
    };
    RunView {
        format: VIEW_FORMAT.to_string(),
        version: VIEW_VERSION,
        created_local: when_local.to_string(),
        created_utc: when_utc.to_string(),
        elapsed_secs: (elapsed.as_secs_f64() * 10.0).round() / 10.0,
        server_dir: a.server_dir.display().to_string(),
        level_name: a.level_name.clone(),
        world: format!(
            "Minecraft {}, data version {}, seed {}",
            a.level.version_name.as_deref().unwrap_or("?"),
            a.level.data_version.map_or("?".to_string(), |v| v.to_string()),
            a.level.seed.map_or("?".to_string(), |v| v.to_string())
        ),
        spawn: format!("block {} = chunk {:?}", a.level.spawn, a.level.spawn.chunk()),
        server,
        server_probably_running: a.server_probably_running(),
        scope: a.spec.scope.token(),
        scope_text: a.spec.scope.describe(),
        plan_hash: hash.to_string(),
        on_disk: dimensions.iter().map(|d| d.on_disk).sum(),
        protected: dimensions.iter().map(|d| d.protected).sum(),
        selected: dimensions.iter().map(|d| d.selected).sum(),
        targets: dimensions.iter().map(|d| d.targets).sum(),
        warnings: a.warnings.len(),
        policy_file,
        overrides: a.spec.overrides.iter().map(|(k, v)| format!("{k}={v}")).collect(),
        settings: a.settings.describe().into_iter().map(|(name, value, is_default)| SettingRow { name: name.to_string(), value, is_default }).collect(),
        found,
        bare_dimensions,
        dimensions,
        players: a.players.iter().map(|p| player_view(a, p, around)).collect(),
        claims,
        waystones_title: a.waystones.as_ref().map_or(String::new(), |all| format!("WAYSTONES ({})", all.len())),
        waystones: a.waystones.as_deref().map_or(Vec::new(), |all| waystone_lines(a, all)),
        warning_groups: warning_groups(a),
        notes: a.notes.clone(),
        files,
        edits: edit_lines(a),
    }
}

/// [`RunView::edits`]: what the plan does besides chunks, with the counts.
fn edit_lines(a: &Analysis) -> Vec<String> {
    let mut out = a.edits.describe(&a.reset_players);
    if let Some(b) = &a.blend {
        out.push(format!(
            "  blending: {} kept overworld chunk(s) carry Tectonic's tag and are marked; {} are old to Tectonic already; {} are stored as oversized chunks and are left as they are",
            num(b.tagged),
            num(b.untagged),
            num(b.external)
        ));
    } else if a.edits.blend {
        out.push("  blending: the overworld is not part of this run, so nothing is marked".to_string());
    }
    if a.edits.new_seed.is_some() {
        let caches = edits::stronghold_caches(&a.world_dir).len();
        out.push(format!("  {caches} stronghold cache file(s) (ModernFix) go to the holding folder"));
    }
    for p in &a.reset_players {
        let files = edits::player_files(&a.world_dir, &p.uuid).len();
        out.push(format!("  {}: {files} file(s) in playerdata/ move", p.label()));
        let other = edits::other_player_records(&a.world_dir, &p.uuid);
        if !other.is_empty() {
            out.push(format!(
                "  {}: NOT moved, and still theirs when they come back (quests, skills, stages, advancements and the like): {}",
                p.label(),
                other.join("; ")
            ));
        }
    }
    out
}

/// `report.txt`: the view, as text.
fn report_text(v: &RunView) -> String {
    let mut out = String::new();
    wl!(out, "IridescentCraft Server Customizer -- protection map + regeneration DRY-RUN");
    wl!(out, "Nothing was deleted or modified. This run only read files.");
    wl!(out);
    wl!(out, "when         {} local ({}), took {:.1} s", v.created_local, v.created_utc, v.elapsed_secs);
    wl!(out, "server dir   {}", v.server_dir);
    wl!(out, "world        {}  ({})", v.level_name, v.world);
    wl!(out, "world spawn  {}", v.spawn);
    wl!(out, "server       {}", v.server);
    wl!(out, "scope        {} -- {}", v.scope, v.scope_text);
    let ids: Vec<&str> = v.dimensions.iter().map(|d| d.id.as_str()).collect();
    wl!(out, "dimensions   {}", if ids.is_empty() { "none".to_string() } else { ids.join(", ") });
    wl!(out, "plan         {PLAN_FILE}: {} chunk(s) to regenerate, sha256 {}", num(v.targets), v.plan_hash);
    wl!(out, "warnings     {}", v.warnings);

    heading(&mut out, "SETTINGS");
    wl!(out, "policy file  {}", v.policy_file);
    if !v.overrides.is_empty() {
        wl!(out, "this run     {}", v.overrides.join(" "));
    }
    for row in &v.settings {
        wl!(out, "  {:<22} {}{}", row.name, row.value, if row.is_default { "" } else { "   [not the default]" });
    }
    wl!(out, "  The defaults are the operator's decisions of 2026-10-11: beds 3x3, claims, {} blocks around world", protection::SPAWN_RADIUS_BLOCKS);
    wl!(out, "  spawn, waystones a player has activated or placed, and lived-in from {} ticks (ten minutes", num(protection::INHABITED_MIN_TICKS as usize));
    wl!(out, "  with a player within 128 blocks). Logout spots 3x3: the operator's ruling of 2026-10-22.");

    if !v.edits.is_empty() {
        heading(&mut out, "WORLD EDITS (besides the chunks; the plan's hash covers them)");
        for line in &v.edits {
            wl!(out, "  {line}");
        }
    }

    heading(&mut out, "DIMENSIONS FOUND");
    wl!(out, "  {:<40} {:<34} {:>18} {:>18} {:>18}", "id", "folder", "region", "entities", "poi");
    for dim in &v.found {
        let mark = if dim.in_run { "" } else { "   (not part of this run)" };
        wl!(out, "  {:<40} {:<34} {:>18} {:>18} {:>18}{mark}", dim.id, dim.folder, dim.region, dim.entities, dim.poi);
    }
    wl!(out, "  (files / size per folder)");
    if !v.bare_dimensions.is_empty() {
        wl!(out, "  {} more dimension folder(s) hold no chunks (nobody has been there): {}", v.bare_dimensions.len(), v.bare_dimensions.join(", "));
    }

    for d in &v.dimensions {
        heading(&mut out, &format!("RESULT: {}", d.id));
        wl!(out, "  chunks on disk          {:>9}   (terrain {} | entities {} | poi {})", num(d.on_disk), num(d.terrain), num(d.entities), num(d.poi));
        let not_generated = if d.protected_not_on_disk > 0 {
            format!(" (+{} protected position(s) not generated yet)", num(d.protected_not_on_disk))
        } else {
            String::new()
        };
        wl!(out, "  protected               {:>9}   kept whatever the scope{not_generated}", num(d.protected));
        for l in &d.layers {
            let note = if l.note.is_empty() { String::new() } else { format!("   ({})", l.note) };
            wl!(out, "    {:<10}            {:>9}   only this layer: {}{note}", l.name, num(l.kept), num(l.alone));
        }
        wl!(out, "  selected by the scope   {:>9}", num(d.selected));
        wl!(out, "    kept (protected)      {:>9}", num(d.kept_in_scope));
        wl!(out, "    TO REGENERATE         {:>9}", num(d.targets));
        wl!(out, "  not selected, unprotected {:>7}   untouched by this run", num(d.untouched));
        wl!(out, "  region files            {:>12} {:>12} {:>12}", "region", "entities", "poi");
        for f in &d.files {
            wl!(out, "    {:<21} {:>12} {:>12} {:>12}", f.label, num(f.region), num(f.entities), num(f.poi));
        }
        if d.freed_bytes > 0 {
            wl!(out, "    files removed entirely add up to {}", crate::backup::fmt_bytes(d.freed_bytes));
        }
        if d.without_inhabited_time > 0 {
            wl!(out, "  {} terrain chunk(s) carry no InhabitedTime tag and count as 0", num(d.without_inhabited_time));
        }
    }

    for d in &v.dimensions {
        if let Some(st) = &d.structures {
            structures_text(&mut out, &d.id, st);
        }
    }

    heading(&mut out, &format!("PLAYERS ({})", v.players.len()));
    for p in &v.players {
        wl!(out, "  {}  ({} {}){}", p.name, p.uuid_kind, p.uuid, if p.from_old { "  [read from .dat_old]" } else { "" });
        for line in &p.lines {
            wl!(out, "    {line}");
        }
    }
    wl!(out, "  {}", v.claims);

    if !v.waystones_title.is_empty() {
        heading(&mut out, &v.waystones_title);
        for line in &v.waystones {
            wl!(out, "  {line}");
        }
    }

    heading(&mut out, &format!("WARNINGS ({})", v.warnings));
    if v.warning_groups.is_empty() {
        wl!(out, "  none");
    }
    for group in &v.warning_groups {
        wl!(out, "  [{}] {}", group.count, group.title);
        for line in &group.lines {
            wl!(out, "      {line}");
        }
        if group.more > 0 {
            wl!(out, "      ... and {} more: all of them are in warnings.csv", group.more);
        }
    }

    for d in &v.dimensions {
        heading(&mut out, &format!("INHABITED TIME: {}", d.id));
        wl!(out, "  A chunk's InhabitedTime counts the ticks it was loaded with a player within 128 blocks of it.");
        for row in &d.inhabited {
            wl!(out, "    {:<14} {:>9}", row.label, num(row.count));
        }
        wl!(out, "  What the lived-in layer would keep at other thresholds (inhabited_min_ticks):");
        for row in &d.thresholds {
            let mark = if row.this_run { "   <- this run" } else { "" };
            wl!(out, "    {:>7} ticks {:<10} {:>9} chunk(s){mark}", row.ticks, format!("({})", row.time), num(row.count));
        }
        wl!(out, "  longest: {} ticks ({})", d.longest_ticks, fmt_ticks(d.longest_ticks));
    }

    if !v.notes.is_empty() {
        heading(&mut out, "NOTES");
        for note in &v.notes {
            wl!(out, "  {note}");
        }
    }

    heading(&mut out, "FILES");
    for f in &v.files {
        wl!(out, "  {f}");
    }
    wl!(out, "  Map colours: white bed, pink logout, purple claim, blue manual, yellow spawn, cyan waystone, green lived-in,");
    wl!(out, "  magenta unreadable, ORANGE = would be regenerated, RED = would be regenerated and cuts a structure, grey =");
    wl!(out, "  on disk and untouched. North is up; faint lines mark region files (32 chunks).");
    wl!(out);
    wl!(out, "This was a dry-run. Executing a plan is a later phase: it will take a verified backup first, need the");
    wl!(out, "server stopped, recompute this plan, and refuse unless the hash matches the one above.");
    out
}

fn structures_text(out: &mut String, dim: &str, st: &StructuresView) {
    heading(out, &format!("STRUCTURES: {dim}"));
    wl!(out, "  structures              {:>9}   in {} type(s); a structure is a start and the chunks holding its pieces", num(st.total), st.types.len());
    wl!(out, "    kept whole            {:>9}   no chunk of it is regenerated", num(st.kept_whole));
    wl!(out, "    regenerated whole     {:>9}   every chunk of it is: today's worldgen decides what stands there", num(st.reset_whole));
    wl!(out, "    CUT by the plan       {:>9}   some chunks kept, some regenerated (start regenerated: {}, no start on disk: {})", num(st.cut), num(st.cut_start_reset), num(st.cut_no_start));
    wl!(out, "  pieces only             {:>9}   structures whose start chunk is not on disk", num(st.without_start));
    if st.unreadable > 0 {
        wl!(out, "  {} terrain chunk(s) whose structures did NOT read: planned as usual, missing from this section", num(st.unreadable));
    }
    if st.without_tag > 0 {
        wl!(out, "  {} terrain chunk(s) carry no structures tag", num(st.without_tag));
    }
    if !st.types.is_empty() {
        wl!(out, "  {:<48} {:>7} {:>11} {:>12} {:>7}", "by type", "all", "kept whole", "regenerated", "CUT");
        for t in &st.types {
            wl!(out, "    {:<46} {:>7} {:>11} {:>12} {:>7}", t.id, num(t.total), num(t.kept_whole), num(t.reset_whole), num(t.cut));
        }
    }
    if !st.cut_lines.is_empty() {
        wl!(out, "  cut structures, the most chunks first:");
        for line in &st.cut_lines {
            wl!(out, "    {line}");
        }
        if st.cut_more > 0 {
            wl!(out, "    ... and {} more: all of them are in structures.csv", num(st.cut_more));
        }
    }
    wl!(out, "  A regenerated chunk takes back the pieces of every start within 8 chunks that reaches into it. So a cut");
    wl!(out, "  structure whose start is KEPT is rebuilt in its regenerated chunks as it was generated (loot and mobs are");
    wl!(out, "  new, and what players changed there is gone). One whose start is REGENERATED gets a new start from the");
    wl!(out, "  worldgen of the day: it joins up with its kept part only if that places it there the same way.");
}

/// What a run does with the chunks of a square around a centre.
#[derive(Default)]
struct Tally {
    on_disk: usize,
    kept: usize,
    regenerate: usize,
    untouched: usize,
    layer: [usize; Layer::COUNT],
}

impl Tally {
    fn sentence(&self) -> String {
        let layers: Vec<String> = Layer::ALL
            .iter()
            .enumerate()
            .filter(|(i, _)| self.layer[*i] > 0)
            .map(|(i, l)| format!("{} {}", l.name(), self.layer[i]))
            .collect();
        let mut s = format!("{} on disk, {} kept", self.on_disk, self.kept);
        if !layers.is_empty() {
            s.push_str(&format!(" ({})", layers.join(", ")));
        }
        s.push_str(&format!(", {} WOULD BE REGENERATED", self.regenerate));
        if self.untouched > 0 {
            s.push_str(&format!(", {} unprotected but outside the scope", self.untouched));
        }
        s
    }
}

fn tally_square(d: &DimResult, centre: ChunkPos, radius: u32) -> Tally {
    let mut t = Tally::default();
    let r = radius.min(MAX_RING) as i32;
    for dx in -r..=r {
        for dz in -r..=r {
            let pos = (centre.0.saturating_add(dx), centre.1.saturating_add(dz));
            if !d.scan.chunks.contains_key(&pos) {
                continue;
            }
            t.on_disk += 1;
            let bits = d.protection.layers_at(pos);
            if bits != 0 {
                t.kept += 1;
                for (i, l) in Layer::ALL.iter().enumerate() {
                    if bits & l.bit() != 0 {
                        t.layer[i] += 1;
                    }
                }
            } else if d.targets.contains(&pos) {
                t.regenerate += 1;
            } else {
                t.untouched += 1;
            }
        }
    }
    t
}

fn chunks_csv(a: &Analysis) -> String {
    let mut out = String::from("dimension,chunk_x,chunk_z,block_x,block_z,region_file,terrain,entities,poi,inhabited_ticks,protected,layers,why,selected,action,structure_starts,structures\n");
    for d in &a.dims {
        for (pos, entry) in &d.scan.chunks {
            let (rx, rz) = anvil::region_of(*pos);
            let protected = d.protection.chunks.get(pos);
            let action = if d.targets.contains(pos) {
                "regenerate"
            } else if protected.is_some() {
                "keep"
            } else {
                "untouched"
            };
            let flag = |b: bool| if b { "1" } else { "0" };
            // Starts here, and every structure with a piece here (by id).
            let here = d.scan.structures.get(pos);
            let starts: Vec<&str> = here.map_or(Vec::new(), |h| h.starts.iter().map(|s| s.id.as_str()).collect());
            let pieces: BTreeSet<&str> = here.map_or(BTreeSet::new(), |h| h.references.iter().map(|(id, _)| id.as_str()).collect());
            wl!(
                out,
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
                csv(&d.dim.id),
                pos.0,
                pos.1,
                i64::from(pos.0) * 16,
                i64::from(pos.1) * 16,
                anvil::region_name(rx, rz),
                flag(entry.in_store(Store::Region)),
                flag(entry.in_store(Store::Entities)),
                flag(entry.in_store(Store::Poi)),
                entry.inhabited.map_or(String::new(), |t| t.to_string()),
                flag(protected.is_some()),
                protected.map_or(String::new(), |p| layer_names(p.layers)),
                csv(&protected.map_or(String::new(), |p| p.why.join("; "))),
                flag(d.selected.contains(pos)),
                action,
                csv(&starts.join(";")),
                csv(&pieces.into_iter().collect::<Vec<_>>().join(";"))
            );
        }
    }
    out
}

/// `structures.csv`: one row per structure, with what the plan does to it.
fn structures_csv(a: &Analysis) -> String {
    let mut out = String::from("dimension,structure,start_chunk_x,start_chunk_z,start_block_x,start_block_z,start,pieces,box,chunks,kept,regenerated,fate\n");
    for d in &a.dims {
        for s in &d.structures {
            let reset = s.regenerated(&d.targets);
            let (pieces, bbox) = match &s.record {
                Some(r) => (r.pieces.to_string(), r.bbox.map_or(String::new(), |b| format!("{} {} {} .. {} {} {}", b[0], b[1], b[2], b[3], b[4], b[5]))),
                None => (String::new(), String::new()),
            };
            wl!(
                out,
                "{},{},{},{},{},{},{},{},{},{},{},{},{}",
                csv(&d.dim.id),
                csv(&s.id),
                s.start.0,
                s.start.1,
                i64::from(s.start.0) * 16,
                i64::from(s.start.1) * 16,
                s.start_word(&d.targets),
                pieces,
                bbox,
                s.chunks.len(),
                s.chunks.len() - reset,
                reset,
                s.fate(&d.targets).word()
            );
        }
    }
    out
}

fn warnings_csv(a: &Analysis) -> String {
    let mut out = String::from("kind,dimension,chunk_x,chunk_z,block_x,block_y,block_z,detail\n");
    let n = |v: Option<i32>| v.map_or(String::new(), |v| v.to_string());
    for w in &a.warnings {
        wl!(
            out,
            "{},{},{},{},{},{},{},{}",
            w.kind,
            csv(&w.dim),
            n(w.chunk.map(|c| c.0)),
            n(w.chunk.map(|c| c.1)),
            n(w.pos.map(|p| p.x)),
            n(w.pos.map(|p| p.y)),
            n(w.pos.map(|p| p.z)),
            csv(&w.detail)
        );
    }
    out
}

/// The map's colours. A pixel holds an index into this.
const MAP_PALETTE: [[u8; 3]; 13] = [
    [16, 16, 20],    // 0 nothing on disk
    [28, 28, 38],    // 1 region-file grid line
    [72, 72, 84],    // 2 on disk, untouched
    [230, 110, 40],  // 3 would be regenerated
    [70, 170, 80],   // 4 lived-in
    [50, 200, 215],  // 5 waystone
    [240, 210, 60],  // 6 spawn
    [90, 140, 240],  // 7 manual
    [185, 95, 215],  // 8 claim
    [255, 255, 255], // 9 bed
    [255, 0, 255],   // 10 unreadable
    [250, 160, 185], // 11 logout
    [205, 25, 35],   // 12 would be regenerated, and cuts a structure
];

/// What the map's colours mean, for a legend. A chunk kept by several layers
/// is drawn in the colour of the first of them in this order.
pub const MAP_LEGEND: [(&str, [u8; 3]); 11] = [
    ("bed", MAP_PALETTE[9]),
    ("logout", MAP_PALETTE[11]),
    ("claim", MAP_PALETTE[8]),
    ("manual", MAP_PALETTE[7]),
    ("spawn", MAP_PALETTE[6]),
    ("waystone", MAP_PALETTE[5]),
    ("lived-in", MAP_PALETTE[4]),
    ("unreadable", MAP_PALETTE[10]),
    ("WOULD BE REGENERATED", MAP_PALETTE[3]),
    ("regenerated, cuts a structure", MAP_PALETTE[12]),
    ("on disk, untouched", MAP_PALETTE[2]),
];

/// `cut`: [`DimResult::cut_chunks`].
fn map_colour(d: &DimResult, pos: ChunkPos, cut: &BTreeSet<ChunkPos>) -> u8 {
    if !d.scan.chunks.contains_key(&pos) {
        return if pos.0.rem_euclid(32) == 0 || pos.1.rem_euclid(32) == 0 { 1 } else { 0 };
    }
    let bits = d.protection.layers_at(pos);
    let has = |l: Layer| bits & l.bit() != 0;
    if has(Layer::Bed) {
        9
    } else if has(Layer::Logout) {
        11
    } else if has(Layer::Claim) {
        8
    } else if has(Layer::Manual) {
        7
    } else if has(Layer::Spawn) {
        6
    } else if has(Layer::Waystone) {
        5
    } else if has(Layer::LivedIn) {
        4
    } else if has(Layer::Unreadable) {
        10
    } else if cut.contains(&pos) {
        12
    } else if d.targets.contains(&pos) {
        3
    } else {
        2
    }
}

/// The dimension's overview map, to be saved as `file`. `None`: nothing on
/// disk, or too far-flung.
fn map_png(d: &DimResult, file: &str) -> Option<(Vec<u8>, MapInfo)> {
    let (mut x0, mut x1, mut z0, mut z1) = (i32::MAX, i32::MIN, i32::MAX, i32::MIN);
    for pos in d.scan.chunks.keys() {
        x0 = x0.min(pos.0);
        x1 = x1.max(pos.0);
        z0 = z0.min(pos.1);
        z1 = z1.max(pos.1);
    }
    if x0 > x1 {
        return None;
    }
    // A margin, so the picture does not end on the outermost chunk.
    let (x0, x1, z0, z1) = (i64::from(x0) - 2, i64::from(x1) + 2, i64::from(z0) - 2, i64::from(z1) + 2);
    let (w, h) = (x1 - x0 + 1, z1 - z0 + 1);
    if w > MAX_MAP_CHUNKS || h > MAX_MAP_CHUNKS {
        return None;
    }
    let scale: i64 = if w.max(h) <= 1024 { 2 } else { 1 };
    let (pw, ph) = ((w * scale) as usize, (h * scale) as usize);
    let mut pixels = vec![0u8; pw * ph];
    let cut = d.cut_chunks();
    for cz in 0..h {
        for cx in 0..w {
            let colour = map_colour(d, ((x0 + cx) as i32, (z0 + cz) as i32), &cut);
            for sy in 0..scale {
                let row = ((cz * scale + sy) as usize) * pw;
                for sx in 0..scale {
                    pixels[row + (cx * scale + sx) as usize] = colour;
                }
            }
        }
    }
    let png = crate::png::encode_indexed(pw as u32, ph as u32, &MAP_PALETTE, &pixels)?;
    let info = MapInfo { file: file.to_string(), origin_x: x0, origin_z: z0, pixels_per_chunk: scale as u32, width: pw as u32, height: ph as u32 };
    Some((png, info))
}

// =============================================================================
// Running
// =============================================================================

/// What a finished run produced.
#[derive(Debug, Clone)]
pub struct Summary {
    pub out_dir: PathBuf,
    pub plan_hash: String,
    /// Chunks that would be regenerated, over all analysed dimensions.
    pub targets: usize,
    pub protected: usize,
    pub on_disk: usize,
    pub warnings: usize,
    pub elapsed: Duration,
    /// One line for a log or a result file.
    pub line: String,
    /// The full text of `report.txt`.
    pub report: String,
    /// The same facts as data (what `summary.json` holds).
    pub view: RunView,
}

static LOCK: Mutex<()> = Mutex::new(());
static RUNNING: AtomicBool = AtomicBool::new(false);

/// A report is being computed right now (GUI).
pub fn in_progress() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

struct RunningFlag;

impl Drop for RunningFlag {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Is `path` (which may not exist yet) inside the world folder?
fn inside_world(path: &Path, world: &Path) -> bool {
    if path.starts_with(world) {
        return true;
    }
    let Ok(world) = fs::canonicalize(world) else { return false };
    let mut probe = Some(path);
    while let Some(p) = probe {
        if let Ok(real) = fs::canonicalize(p) {
            return real.starts_with(&world);
        }
        probe = p.parent();
    }
    false
}

/// Create this run's folder: `<root>/<stamp>-<scope>`.
fn make_out_dir(a: &Analysis, stamp: &str) -> Result<PathBuf, String> {
    let root = a.spec.out_root.clone().unwrap_or_else(|| a.server_dir.join(REPORTS_DIR));
    if inside_world(&root, &a.world_dir) {
        return Err(format!("{} is inside the world folder: reports are never written there", root.display()));
    }
    let base = format!("{stamp}-{}", a.spec.scope.slug());
    for n in 1..100 {
        let dir = root.join(if n == 1 { base.clone() } else { format!("{base}-{n}") });
        if dir.exists() {
            continue;
        }
        fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        return Ok(dir);
    }
    Err(format!("cannot find a free folder name under {}", root.display()))
}

fn put(dir: &Path, name: &str, bytes: &[u8]) -> Result<(), String> {
    fs::write(dir.join(name), bytes).map_err(|e| format!("cannot write {}: {e}", dir.join(name).display()))
}

/// Analyse the world and write the report. Reads the world, writes only under
/// the report folder. One run at a time: a second caller waits.
pub fn run(cfg: &ServerConfig, spec: &RunSpec) -> Result<Summary, String> {
    let _lock = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    RUNNING.store(true, Ordering::SeqCst);
    let _flag = RunningFlag;
    let started = Instant::now();
    let now_local = chrono::Local::now();
    let when_utc = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let a = analyse_with_structures(cfg, spec)?;
    let hash = plan_hash_with(&a.level_name, a.dims.iter().map(|d| (d.dim.id.as_str(), &d.targets)), &a.edits.hash_lines());
    let out_dir = make_out_dir(&a, &now_local.format("%Y%m%d-%H%M%S").to_string())?;

    let mut files = vec![
        "report.txt     this report".to_string(),
        "chunks.csv     one row per chunk on disk: kept, regenerated or untouched, and why".to_string(),
        "warnings.csv   every warning, one row each".to_string(),
        format!("{STRUCTURES_FILE} one row per structure: where it starts, its chunks, and whether the plan keeps, regenerates or cuts it"),
        format!("{PLAN_FILE}      the chunks to regenerate per dimension, with their hash"),
        format!("{SUMMARY_FILE}   what this report says, as data (the launcher window reads it)"),
    ];
    put(&out_dir, "chunks.csv", chunks_csv(&a).as_bytes())?;
    put(&out_dir, "warnings.csv", warnings_csv(&a).as_bytes())?;
    put(&out_dir, STRUCTURES_FILE, structures_csv(&a).as_bytes())?;
    put(&out_dir, PLAN_FILE, plan_json(&a, &hash, &when_utc).as_bytes())?;
    let mut maps: BTreeMap<String, MapInfo> = BTreeMap::new();
    if spec.png {
        for d in &a.dims {
            let name = format!("map-{}.png", d.dim.id.replace(|c: char| !c.is_ascii_alphanumeric(), "_"));
            match map_png(d, &name) {
                Some((png, info)) => {
                    put(&out_dir, &name, &png)?;
                    files.push(format!("{name}   overview of {}, one block of pixels per chunk", d.dim.id));
                    maps.insert(d.dim.id.clone(), info);
                }
                None => files.push(format!("(no map for {}: nothing on disk, or its chunks are too far apart to draw)", d.dim.id)),
            }
        }
    }

    let elapsed = started.elapsed();
    let view = build_view(&a, &hash, &now_local.format("%Y-%m-%d %H:%M:%S").to_string(), &when_utc, elapsed, files, &maps);
    let report = report_text(&view);
    put(&out_dir, "report.txt", report.as_bytes())?;
    let summary = serde_json::to_vec_pretty(&view).map_err(|e| format!("cannot encode {SUMMARY_FILE}: {e}"))?;
    put(&out_dir, SUMMARY_FILE, &summary)?;
    // Only the server's own report folder is kept tidy, never one given with --out.
    if spec.out_root.is_none() {
        let gone = prune_reports(&cfg.server_dir, REPORTS_KEPT, &[&out_dir]);
        if !gone.is_empty() {
            log::info!("[regen] removed {} old dry-run folder(s) from {REPORTS_DIR} (the newest {REPORTS_KEPT} are kept)", gone.len());
        }
    }

    let line = format!(
        "scope {}: {} of {} chunk(s) on disk would be regenerated, {} protected, {} warning(s); plan sha256 {}; report in {} ({:.1} s; nothing was modified)",
        view.scope,
        num(view.targets),
        num(view.on_disk),
        num(view.protected),
        view.warnings,
        &hash[..16],
        out_dir.display(),
        elapsed.as_secs_f64()
    );
    Ok(Summary {
        out_dir,
        plan_hash: hash,
        targets: view.targets,
        protected: view.protected,
        on_disk: view.on_disk,
        warnings: view.warnings,
        elapsed,
        line,
        report,
        view,
    })
}

/// [`run`], on the record: the start and the outcome go to
/// `logs/regen_dryrun.log` and to [`RESULT_FILE`]. What the request file and
/// the launcher window both call; `who` names the asker.
pub fn run_logged(cfg: &ServerConfig, spec: &RunSpec, who: &str) -> Result<Summary, String> {
    let dir = &cfg.server_dir;
    audit(dir, log::Level::Info, &format!("request '{who}': {} -- reading the world (read-only)", spec.log_text()));
    write_result(dir, "started: reading the world (nothing is modified)");
    let outcome = run(cfg, spec);
    match &outcome {
        Ok(summary) => {
            audit(dir, log::Level::Info, &summary.line);
            write_result(dir, &format!("done: {}", summary.line));
        }
        Err(why) => {
            audit(dir, log::Level::Error, &format!("dry-run FAILED: {why}"));
            write_result(dir, &format!("FAILED: {why}"));
        }
    }
    outcome
}

/// A run's folder under `regen-reports`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunEntry {
    /// `20261011-121049-ring8`
    pub name: String,
    pub dir: PathBuf,
}

/// The runs kept under `<server dir>/regen-reports`, newest first.
pub fn list_runs(server_dir: &Path) -> Vec<RunEntry> {
    let mut runs: Vec<RunEntry> = fs::read_dir(server_dir.join(REPORTS_DIR))
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().join("report.txt").is_file())
        .filter_map(|e| e.file_name().into_string().ok().map(|name| RunEntry { name, dir: e.path() }))
        .collect();
    runs.sort_by(|a, b| b.name.cmp(&a.name));
    runs
}

/// `20261011-121049-ring8`, `20261011-121049-all-2`: the names [`run`] gives
/// its folders, and the only ones [`prune_reports`] will remove.
fn is_run_name(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() > 16
        && b[..8].iter().all(u8::is_ascii_digit)
        && b[8] == b'-'
        && b[9..15].iter().all(u8::is_ascii_digit)
        && b[15] == b'-'
        && b[16..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'-')
}

/// Remove the oldest dry-run folders under `<server dir>/regen-reports`,
/// keeping the newest `keep` and every folder in `spare`. Only a folder that
/// carries a run's name and a run's `report.txt` is ever removed; anything
/// else somebody put there stays. Returns the names removed.
pub fn prune_reports(server_dir: &Path, keep: usize, spare: &[&Path]) -> Vec<String> {
    let mut gone = Vec::new();
    for old in list_runs(server_dir).into_iter().filter(|r| is_run_name(&r.name)).skip(keep) {
        if spare.iter().any(|s| *s == old.dir.as_path()) || old.dir.parent() != Some(server_dir.join(REPORTS_DIR).as_path()) {
            continue;
        }
        match fs::remove_dir_all(&old.dir) {
            Ok(()) => gone.push(old.name),
            Err(e) => log::warn!("[regen] could not remove the old dry-run folder {}: {e}", old.dir.display()),
        }
    }
    gone
}

/// The [`RunView`] a run left in its folder. A run made before the launcher
/// wrote one has only its `report.txt`.
pub fn load_view(run_dir: &Path) -> Result<RunView, String> {
    let raw = fs::read(run_dir.join(SUMMARY_FILE)).map_err(|e| format!("{SUMMARY_FILE}: {e}"))?;
    let view: RunView = serde_json::from_slice(&raw).map_err(|e| format!("{SUMMARY_FILE}: {e}"))?;
    if view.format != VIEW_FORMAT || view.version > VIEW_VERSION {
        return Err(format!("{SUMMARY_FILE}: written by a newer launcher (format '{}' v{})", view.format, view.version));
    }
    Ok(view)
}

/// The players of the world, for a picker: UUID and name (the UUID when the
/// name is not known), by name.
pub fn player_choices(cfg: &ServerConfig) -> Vec<(String, String)> {
    let names = worlddata::read_usercache(&cfg.server_dir);
    let mut out: Vec<(String, String)> =
        worlddata::read_players(&cfg.world_dir(), &names).players.into_iter().map(|p| (p.uuid.clone(), p.label().to_string())).collect();
    out.sort_by(|a, b| a.1.to_ascii_lowercase().cmp(&b.1.to_ascii_lowercase()));
    out
}

/// The dimensions that hold chunks, for a picker: id, and what is there.
pub fn dimension_choices(cfg: &ServerConfig) -> Vec<(String, String)> {
    anvil::discover_dimensions(&cfg.world_dir())
        .into_iter()
        .filter(|d| d.has_chunk_storage())
        .map(|d| {
            let (region, _) = anvil::store_summary(&d.store_dir(Store::Region));
            let hint = if region > 0 { format!("{region} region files") } else { "no terrain, entities or POI only".to_string() };
            (d.id, hint)
        })
        .collect()
}

// =============================================================================
// One chunk: what is in it (chunk-info)
// =============================================================================
//
// The chunk itself and the start chunks of the structures that reach into it,
// read straight from the world ([`anvil::read_chunk`]: a few region files),
// and what a dry-run's plan does with them, from that run's chunks.csv and
// structures.csv. Reads only; safe while the server runs. The command line
// (`icraft chunk-info`, `icraft-gui.exe --chunk-info`) and the Customizer's
// map both show it.

/// Block coordinates (what F3 shows) or chunk coordinates.
pub fn chunk_of(x: i64, z: i64, chunk_coordinates: bool) -> Result<ChunkPos, String> {
    let (cx, cz) = if chunk_coordinates { (x, z) } else { (x.div_euclid(16), z.div_euclid(16)) };
    match (i32::try_from(cx), i32::try_from(cz)) {
        (Ok(cx), Ok(cz)) => Ok((cx, cz)),
        _ => Err(format!("{x}, {z} is outside any world")),
    }
}

/// What is in one chunk, and what the dry-run in `run` (default: the newest)
/// does with it, as lines of text.
pub fn chunk_info(cfg: &ServerConfig, dim: &str, pos: ChunkPos, run: Option<&Path>) -> Result<Vec<String>, String> {
    let world = cfg.world_dir();
    if !world.join("level.dat").is_file() && !world.join("level.dat_old").is_file() {
        return Err(format!("there is no world at {} (no level.dat)", world.display()));
    }
    let dims = anvil::discover_dimensions(&world);
    let d = dims.iter().find(|d| d.id == dim).ok_or_else(|| {
        let known: Vec<&str> = dims.iter().filter(|d| d.has_chunk_storage()).map(|d| d.id.as_str()).collect();
        format!("dimension {dim} is not in this world (with chunks on disk: {})", known.join(", "))
    })?;
    let mut out = Vec::new();
    let (bx, bz) = (i64::from(pos.0) * 16, i64::from(pos.1) * 16);
    let (rx, rz) = anvil::region_of(pos);
    out.push(format!("chunk ({}, {}) in {dim} = blocks x {bx}..{}, z {bz}..{}; {}", pos.0, pos.1, bx + 15, bz + 15, anvil::region_name(rx, rz)));
    let here = anvil::read_chunk(d, pos);
    let stores: Vec<&str> = Store::ALL.iter().zip(here.in_store).filter(|(_, on)| *on).map(|(s, _)| s.dir_name()).collect();
    out.push(if stores.is_empty() { "on disk      no: nothing has been generated here".to_string() } else { format!("on disk      {}", stores.join(", ")) });
    if let Some(why) = &here.unreadable {
        out.push(format!("terrain      does NOT read: {why}"));
    } else if here.in_store[0] {
        let ticks = here.inhabited.unwrap_or(0);
        out.push(format!("lived in     {ticks} ticks ({}) with a player within 128 blocks", fmt_ticks(ticks)));
    }

    // (id, start chunk) of every structure in this chunk.
    let mut found: Vec<(String, ChunkPos)> = Vec::new();
    match &here.structures {
        Err(why) => out.push(format!("structures   do NOT read: {why}")),
        Ok(None) if here.in_store[0] && here.unreadable.is_none() => out.push("structures   none recorded (the chunk has no structures tag)".to_string()),
        Ok(None) => {}
        Ok(Some(s)) => {
            for st in &s.starts {
                out.push(format!("starts here  {}: {}", st.id, start_text(st)));
                found.push((st.id.clone(), pos));
            }
            let mut refs: Vec<&(String, ChunkPos)> = s.references.iter().filter(|(id, at)| !(*at == pos && s.starts.iter().any(|st| &st.id == id))).collect();
            refs.sort();
            refs.dedup();
            for (id, start) in refs {
                let record = anvil::read_chunk(d, *start).structures.ok().flatten().and_then(|c| c.starts.into_iter().find(|st| &st.id == id));
                match record {
                    Some(st) => out.push(format!("piece here   {id}, which starts in chunk {start:?}: {}", start_text(&st))),
                    None => out.push(format!("piece here   {id}, which starts in chunk {start:?}: that start is NOT on disk")),
                }
                found.push((id.clone(), *start));
            }
            if found.is_empty() {
                out.push("structures   none".to_string());
            }
        }
    }

    let run_dir = match run {
        Some(dir) => Some(dir.to_path_buf()),
        None => list_runs(&cfg.server_dir).into_iter().next().map(|r| r.dir),
    };
    let Some(run_dir) = run_dir else {
        out.push("plan         no dry-run has been made yet".to_string());
        return Ok(out);
    };
    let name = run_dir.file_name().map_or_else(|| run_dir.display().to_string(), |n| n.to_string_lossy().into_owned());
    match csv_row(&run_dir.join("chunks.csv"), &[("dimension", dim), ("chunk_x", &pos.0.to_string()), ("chunk_z", &pos.1.to_string())]) {
        Err(why) => out.push(format!("plan         {name}: {why}")),
        Ok(None) => out.push(format!("plan         {name}: not in it (its dimension was not part of that run, or nothing was on disk here then)")),
        Ok(Some(row)) => {
            let get = |k: &str| row.get(k).map(String::as_str).unwrap_or("");
            out.push(match get("action") {
                "regenerate" => format!("plan         {name}: WOULD BE REGENERATED"),
                "keep" => format!("plan         {name}: kept ({}){}", get("layers"), if get("why").is_empty() { String::new() } else { format!(": {}", get("why")) }),
                _ => format!("plan         {name}: not protected, outside that run's scope (untouched)"),
            });
        }
    }
    if found.is_empty() {
        return Ok(out);
    }
    let file = run_dir.join(STRUCTURES_FILE);
    if !file.is_file() {
        out.push(format!("             that run did not read structures (it has no {STRUCTURES_FILE}: a launcher before 2026-10-24 made it)"));
        return Ok(out);
    }
    for (id, start) in &found {
        let key = [("dimension", dim), ("structure", id.as_str()), ("start_chunk_x", &start.0.to_string()), ("start_chunk_z", &start.1.to_string())];
        let text = match csv_row(&file, &key) {
            Ok(Some(r)) => {
                let get = |k: &str| r.get(k).map(String::as_str).unwrap_or("?");
                match get("fate") {
                    "cut" => format!("CUT: {} of its {} chunk(s) kept, {} regenerated; start {}", get("kept"), get("chunks"), get("regenerated"), get("start")),
                    "regenerated" => format!("regenerated whole ({} chunk(s))", get("chunks")),
                    "kept" => format!("kept whole ({} chunk(s))", get("chunks")),
                    other => other.to_string(),
                }
            }
            Ok(None) => "not in that run (written since, or outside its dimensions)".to_string(),
            Err(why) => why,
        };
        out.push(format!("  {id} (start {start:?}): {text}"));
    }
    Ok(out)
}

fn start_text(st: &anvil::StructureStart) -> String {
    match st.bbox {
        Some(b) => format!(
            "{} piece(s), blocks {} {} {} to {} {} {} (chunks ({}, {}) to ({}, {}))",
            st.pieces,
            b[0],
            b[1],
            b[2],
            b[3],
            b[4],
            b[5],
            b[0].div_euclid(16),
            b[2].div_euclid(16),
            b[3].div_euclid(16),
            b[5].div_euclid(16)
        ),
        None => format!("{} piece(s), no box recorded", st.pieces),
    }
}

/// The first row of a CSV file this module wrote whose named columns hold
/// these values, as column -> value.
fn csv_row(path: &Path, key: &[(&str, &str)]) -> Result<Option<BTreeMap<String, String>>, String> {
    use std::io::BufRead;
    let file = fs::File::open(path).map_err(|e| format!("{} does not read ({e})", path.display()))?;
    let mut lines = std::io::BufReader::new(file).lines();
    let header = csv_fields(&lines.next().transpose().map_err(|e| e.to_string())?.unwrap_or_default());
    let mut at = Vec::new();
    for (k, v) in key {
        let i = header.iter().position(|h| h == k).ok_or_else(|| format!("{} has no column {k}", path.display()))?;
        at.push((i, *v));
    }
    for line in lines {
        let line = line.map_err(|e| e.to_string())?;
        // Cheap test first: every value has to be somewhere in the line.
        if !key.iter().all(|(_, v)| line.contains(v)) {
            continue;
        }
        let fields = csv_fields(&line);
        if at.iter().all(|(i, v)| fields.get(*i).map(String::as_str) == Some(*v)) {
            return Ok(Some(header.iter().cloned().zip(fields).collect()));
        }
    }
    Ok(None)
}

/// One line of CSV as [`csv`] writes it: fields that hold a comma or a quote
/// are quoted, with quotes doubled.
fn csv_fields(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            ('"', _) => quoted = !quoted,
            (',', false) => out.push(std::mem::take(&mut field)),
            _ => field.push(c),
        }
    }
    out.push(field);
    out
}

// =============================================================================
// Request file
// =============================================================================

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Append one line to `logs/regen_dryrun.log` (and the launcher log).
fn audit(server_dir: &Path, level: log::Level, msg: &str) {
    log::log!(level, "[regen] {msg}");
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

fn write_result(server_dir: &Path, answer: &str) {
    let _ = fs::write(server_dir.join(RESULT_FILE), format!("{} {answer}\n", unix_now()));
}

/// The newest answer in [`RESULT_FILE`]: when (unix seconds) and what.
pub fn last_answer(server_dir: &Path) -> Option<(u64, String)> {
    let body = fs::read_to_string(server_dir.join(RESULT_FILE)).ok()?;
    let (stamp, answer) = body.trim().split_once(' ')?;
    Some((stamp.parse().ok()?, answer.to_string()))
}

/// `<unix-secs> [reason] [key=value ...]` -> the reason and what to run.
fn parse_request(body: &str, now: u64) -> Result<(String, RunSpec), String> {
    let mut parts = body.trim_start_matches('\u{feff}').split_whitespace();
    let stamp: u64 = parts.next().and_then(|s| s.parse().ok()).ok_or_else(|| "no timestamp in the request".to_string())?;
    let age = now.saturating_sub(stamp);
    if age > REQUEST_MAX_AGE.as_secs() {
        return Err(format!("stale request ({} old)", fmt_span(Duration::from_secs(age))));
    }
    let rest: Vec<&str> = parts.collect();
    let reason = rest.iter().find(|t| !t.contains('=')).copied().unwrap_or("manual").to_string();
    let spec = RunSpec::parse_tokens(rest.iter().copied().filter(|t| t.contains('=')))?;
    Ok((reason, spec))
}

/// Ask for a report (the GUI button; `request_regen_report.ps1` writes the
/// same file). `options` are `key=value` tokens, e.g. `scope=ring:8`.
pub fn write_request(server_dir: &Path, reason: &str, options: &str) -> std::io::Result<()> {
    let reason: String = reason.split_whitespace().collect::<Vec<_>>().join("-").replace('=', "-");
    let reason = if reason.is_empty() { "manual".to_string() } else { reason };
    fs::write(server_dir.join(REQUEST_FILE), format!("{} {reason} {}\n", unix_now(), options.trim()))
}

/// Called every few seconds by the GUI. A request file is taken and run at
/// once, whether or not the server is up: the analysis only reads.
pub fn poll_request(cfg: &ServerConfig) {
    let dir = &cfg.server_dir;
    let path = dir.join(REQUEST_FILE);
    let Ok(body) = fs::read_to_string(&path) else { return };
    let _ = fs::remove_file(&path);
    let handled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handle_request(cfg, &body)));
    if handled.is_err() {
        audit(dir, log::Level::Error, "the dry-run PANICKED -- abandoned (please report this); nothing was modified");
        write_result(dir, "FAILED: the analysis panicked");
    }
}

fn handle_request(cfg: &ServerConfig, body: &str) {
    let dir = &cfg.server_dir;
    let (reason, spec) = match parse_request(body, unix_now()) {
        Ok(parsed) => parsed,
        Err(why) => {
            audit(dir, log::Level::Warn, &format!("request rejected: {why}"));
            write_result(dir, &format!("rejected: {why}"));
            return;
        }
    };
    let _ = run_logged(cfg, &spec, &reason);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::anvil::testing::write_region;
    use crate::worlddata::testing::{player_nbt, write_claims, write_level, write_player, write_waystones};
    use std::sync::atomic::AtomicU32;

    const NETHER: &str = "minecraft:the_nether";
    const P1: &str = "0e0c6371-8599-3a43-a117-30cb7e62c579"; // offline UUIDs of the three names below
    const P2: &str = "270bd0d1-69ee-3638-9c35-5040c29ee961";
    const P3: &str = "bc24d5cc-490a-3d10-94be-7dad4e728856";

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    /// A server folder with a small world:
    ///
    ///   - world spawn at chunk (0,0); the tests run with `spawn_radius_blocks=16`
    ///     (chunks -1..1)
    ///   - terrain: every chunk 0..=20 x 0..=20, plus (-1,-1), (-20,-20) and,
    ///     alone in its region file, (100,100)
    ///   - (12,12) lived in for 100,000 ticks, (15,15) for 12,000, (16,16) for 5,000
    ///   - an entity chunk with no terrain at (25,25); a zero-byte r.5.5.mca
    ///   - Player_One: bed in chunk (12,12), logged out in chunk (5,5)
    ///   - Player_Two: no bed. Player_Three: bed in the Nether (which has no chunks)
    ///   - a waystone a player placed (and nobody activated) at chunk (18,18);
    ///     a claim at (19,19)
    struct Fixture {
        root: PathBuf,
        cfg: ServerConfig,
    }

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "icraft-regen-test-{}-{}",
                std::process::id(),
                NEXT_DIR.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&root);
            let world = root.join("testworld");
            fs::create_dir_all(&world).unwrap();
            fs::write(root.join("server.properties"), "level-name=testworld\nonline-mode=false\n").unwrap();
            fs::write(
                root.join("usercache.json"),
                format!(r#"[{{"name":"Player_One","uuid":"{P1}"}},{{"name":"Player_Two","uuid":"{P2}"}},{{"name":"Player_Three","uuid":"{P3}"}}]"#),
            )
            .unwrap();
            write_level(&world, (0, 64, 0));

            let mut grid: Vec<(ChunkPos, i64)> = Vec::new();
            for x in 0..=20 {
                for z in 0..=20 {
                    let ticks = match (x, z) {
                        (12, 12) => 100_000,
                        (15, 15) => 12_000,
                        (16, 16) => 5_000,
                        _ => 0,
                    };
                    grid.push(((x, z), ticks));
                }
            }
            write_region(&world, Store::Region, 0, 0, &grid);
            write_region(&world, Store::Region, -1, -1, &[((-1, -1), 0), ((-20, -20), 0)]);
            write_region(&world, Store::Region, 3, 3, &[((100, 100), 0)]);
            fs::write(world.join("region").join("r.5.5.mca"), b"").unwrap();
            write_region(&world, Store::Entities, 0, 0, &[((12, 12), 0), ((25, 25), 0)]);
            write_region(&world, Store::Poi, 0, 0, &[((12, 12), 0)]);
            fs::create_dir_all(world.join("DIM-1").join("data")).unwrap();

            write_player(&world, P1, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (88.5, 64.0, 90.5)), &[]));
            write_player(&world, P2, &player_nbt(None, (OVERWORLD, (0.5, 64.0, 0.5)), &[]));
            write_player(&world, P3, &player_nbt(Some((NETHER, (8, 64, 8))), (NETHER, (8.0, 64.0, 8.0)), &[]));
            write_waystones(&world, &[([1, 2, 3, 4], "", OVERWORLD, (18 * 16 + 3, 70, 18 * 16 + 4), "PLAYER")]);
            write_claims(&world, P1, "Player_One", &[(OVERWORLD, false, &[(19, 19)])]);
            Fixture { cfg: ServerConfig::from_path(&root), root }
        }

        /// The tests' own settings come first, so a test's tokens win over them.
        /// The logout layer (G5) is off here: the counts below were worked out
        /// without it, and it has its own test that switches it back on
        /// (`the_logout_layer_keeps_where_players_logged_out`).
        fn spec(&self, tokens: &str) -> RunSpec {
            RunSpec::parse_tokens(["spawn_radius_blocks=16", "logout_radius=off"].into_iter().chain(tokens.split_whitespace())).unwrap()
        }

        fn run(&self, tokens: &str) -> Summary {
            run(&self.cfg, &self.spec(tokens)).unwrap()
        }

        /// Every file under the world: path, content, modified time.
        fn world_state(&self) -> Vec<(PathBuf, Vec<u8>, Option<SystemTime>)> {
            fn walk(dir: &Path, out: &mut Vec<(PathBuf, Vec<u8>, Option<SystemTime>)>) {
                for e in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
                    let path = e.path();
                    if path.is_dir() {
                        walk(&path, out);
                    } else {
                        let modified = e.metadata().ok().and_then(|m| m.modified().ok());
                        out.push((path.clone(), fs::read(&path).unwrap(), modified));
                    }
                }
            }
            let mut out = Vec::new();
            walk(&self.root.join("testworld"), &mut out);
            out.sort();
            out
        }

        fn plan(&self, s: &Summary) -> serde_json::Value {
            serde_json::from_slice(&fs::read(s.out_dir.join(PLAN_FILE)).unwrap()).unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    /// The chunks a plan lists for a dimension.
    fn plan_chunks(plan: &serde_json::Value, dim: &str) -> BTreeSet<ChunkPos> {
        let mut out = BTreeSet::new();
        for d in plan["dimensions"].as_array().unwrap().iter().filter(|d| d["id"] == dim) {
            for region in d["regions"].as_array().unwrap() {
                for c in region["chunks"].as_array().unwrap() {
                    let pos = (c[0].as_i64().unwrap() as i32, c[1].as_i64().unwrap() as i32);
                    assert_eq!(anvil::region_of(pos), (region["rx"].as_i64().unwrap() as i32, region["rz"].as_i64().unwrap() as i32));
                    assert!(out.insert(pos), "{pos:?} listed twice");
                }
            }
        }
        out
    }

    /// A report with every run of whitespace reduced to one space.
    fn flat(report: &str) -> String {
        report.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// The fixture's protected chunks that exist on disk (17 of them).
    fn protected() -> BTreeSet<ChunkPos> {
        let mut p = BTreeSet::new();
        for x in 11..=13 {
            for z in 11..=13 {
                p.insert((x, z)); // Player_One's bed, 3x3
            }
        }
        p.extend([(0, 0), (0, 1), (1, 0), (1, 1), (-1, -1)]); // spawn, where generated
        p.extend([(15, 15), (18, 18), (19, 19)]); // lived-in, waystone, claim
        p
    }

    #[test]
    fn scopes_parse_and_print() {
        assert_eq!(Scope::parse("report"), Ok(Scope::Report));
        assert_eq!(Scope::parse(" ALL "), Ok(Scope::All));
        assert_eq!(Scope::parse("ring:8"), Ok(Scope::Ring(8)));
        assert_eq!(Scope::parse("box:52,70,32,40"), Ok(Scope::Box { x1: 32, z1: 40, x2: 52, z2: 70 }));
        assert_eq!(Scope::parse("box:-5,-6..7,8"), Ok(Scope::Box { x1: -5, z1: -6, x2: 7, z2: 8 }));
        for bad in ["", "ring", "ring:0", "ring:257", "ring:x", "box:1,2,3", "box:1,2,3,4,5", "box:a,b,c,d", "everything"] {
            assert!(Scope::parse(bad).is_err(), "{bad}");
        }
        for scope in [Scope::Report, Scope::All, Scope::Ring(12), Scope::Box { x1: -1, z1: -2, x2: 3, z2: 4 }] {
            assert_eq!(Scope::parse(&scope.token()), Ok(scope));
        }
        assert!(Scope::Ring(3).selects((15, 9), &[(12, 12)]));
        assert!(!Scope::Ring(3).selects((16, 12), &[(12, 12)]));
        assert!(!Scope::Ring(3).selects((12, 12), &[]));
        assert!(Scope::Box { x1: 0, z1: 0, x2: 2, z2: 2 }.selects((2, 0), &[]));
    }

    #[test]
    fn run_specs_round_trip_through_tokens() {
        let spec = RunSpec::parse_tokens("scope=ring:8 dims=minecraft:overworld,minecraft:the_nether inhabited_min_ticks=72000 waystones=activated png=off".split_whitespace()).unwrap();
        assert_eq!(spec.scope, Scope::Ring(8));
        assert_eq!(spec.dims, vec![OVERWORLD.to_string(), NETHER.to_string()]);
        assert_eq!(spec.overrides, vec![("inhabited_min_ticks".to_string(), "72000".to_string()), ("waystones".to_string(), "activated".to_string())]);
        assert!(!spec.png && !spec.all_dims);
        assert_eq!(RunSpec::parse_tokens(spec.tokens().split_whitespace()), Ok(spec));
        let all = RunSpec::parse_tokens(["dims=all"]).unwrap();
        assert!(all.all_dims);
        assert_eq!(all.tokens(), "scope=report dims=all");
        assert_eq!(RunSpec::default().tokens(), "scope=report dims=minecraft:overworld");
        for bad in ["scope", "scope=sideways", "dims=", "png=maybe", "bed_radius=lots", "colour=blue"] {
            assert!(RunSpec::parse_tokens([bad]).is_err(), "{bad}");
        }
    }

    #[test]
    fn the_plan_hash_is_the_documented_recipe() {
        use sha2::{Digest, Sha256};
        let over: BTreeSet<ChunkPos> = [(5, -3), (-20, 7), (5, -10)].into();
        let nether: BTreeSet<ChunkPos> = BTreeSet::new();
        let text = "icraft-regen-plan v1\nlevel=world\ndim=minecraft:overworld\n-20,7\n5,-10\n5,-3\ndim=minecraft:the_nether\n";
        let want: String = Sha256::digest(text.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(plan_hash("world", [(OVERWORLD, &over), (NETHER, &nether)]), want);
        // Any difference in substance is a different hash.
        let fewer: BTreeSet<ChunkPos> = [(5, -3), (-20, 7)].into();
        assert_ne!(plan_hash("world", [(OVERWORLD, &fewer), (NETHER, &nether)]), want);
        assert_ne!(plan_hash("world2", [(OVERWORLD, &over), (NETHER, &nether)]), want);
        assert_ne!(plan_hash("world", [(OVERWORLD, &over)]), want);
        assert_ne!(plan_hash("world", [(NETHER, &over), (OVERWORLD, &nether)]), want);
    }

    #[test]
    fn everything_unprotected_is_selected_and_nothing_protected_is() {
        let fx = Fixture::new();
        let before = fx.world_state();
        let s = fx.run("scope=all");
        // 441 + (-1,-1) + (-20,-20) + (100,100) + the entity-only chunk.
        assert_eq!(s.on_disk, 445);
        assert_eq!(s.protected, 17);
        assert_eq!(s.targets, 428);

        let plan = fx.plan(&s);
        let chunks = plan_chunks(&plan, OVERWORLD);
        assert_eq!(chunks.len(), 428);
        for kept in protected() {
            assert!(!chunks.contains(&kept), "{kept:?} is protected and must not be in the plan");
        }
        for gone in [(16, 16), (10, 10), (14, 14), (20, 20), (-20, -20), (100, 100), (25, 25)] {
            assert!(chunks.contains(&gone), "{gone:?} should be in the plan");
        }
        // The plan says what it is, and its hash is the recipe applied to its own chunk list.
        assert_eq!(plan["format"], "icraft-regen-plan");
        assert_eq!(plan["dry_run"], true);
        assert_eq!(plan["scope"], "all");
        assert_eq!(plan["total_chunks"], 428);
        assert_eq!(plan["world"]["level_name"], "testworld");
        assert_eq!(plan["world"]["seed"], "4242424242424242424");
        assert_eq!(plan["plan_hash"], s.plan_hash.as_str());
        assert_eq!(plan_hash("testworld", [(OVERWORLD, &chunks)]), s.plan_hash);
        // Whole files: only the region file whose every chunk goes.
        let files = &plan["dimensions"][0]["delete_files"];
        assert_eq!(files["region"], serde_json::json!(["r.3.3.mca"]));
        assert_eq!(files["entities"], serde_json::json!([]));
        assert_eq!(files["poi"], serde_json::json!([]));
        // The settings in the plan reproduce the run's settings.
        let mut again = Settings::default();
        again.spawn_radius_blocks = None; // overwritten below, or the test proves nothing
        for pair in plan["settings"].as_array().unwrap() {
            again.set(pair[0].as_str().unwrap(), pair[1].as_str().unwrap()).unwrap();
        }
        assert_eq!((again.spawn_radius_blocks, again.logout_radius), (Some(16), None));
        assert_eq!(
            Settings { spawn_radius_blocks: Some(protection::SPAWN_RADIUS_BLOCKS), logout_radius: Some(protection::LOGOUT_RADIUS), ..again },
            Settings::default()
        );

        // The report says the same, and the per-chunk CSV agrees with the plan.
        assert!(flat(&s.report).contains("TO REGENERATE 428"), "{}", s.report);
        assert!(flat(&s.report).contains("REMOVED ENTIRELY 1 0 0"), "{}", s.report);
        assert!(flat(&s.report).contains("empty placeholders 1 0 0"), "{}", s.report);
        assert!(s.report.contains("Nothing was deleted or modified"));
        assert_eq!(fs::read_to_string(s.out_dir.join("report.txt")).unwrap(), s.report);
        let csv = fs::read_to_string(s.out_dir.join("chunks.csv")).unwrap();
        assert_eq!(csv.lines().count(), 1 + 445);
        assert_eq!(csv.lines().filter(|l| l.ends_with(",regenerate,,")).count(), 428);
        assert_eq!(csv.lines().filter(|l| l.ends_with(",keep,,")).count(), 17);
        assert!(csv.lines().any(|l| l == "minecraft:overworld,12,12,192,192,r.0.0.mca,1,1,1,100000,1,bed+lived-in,bed of Player_One,1,keep,,"), "{csv}");
        assert!(csv.lines().any(|l| l == "minecraft:overworld,25,25,400,400,r.0.0.mca,0,1,0,,0,,,1,regenerate,,"));
        assert!(csv.lines().any(|l| l == "minecraft:overworld,-1,-1,-16,-16,r.-1.-1.mca,1,0,0,0,1,spawn,,1,keep,,"));
        let png = fs::read(s.out_dir.join("map-minecraft_overworld.png")).unwrap();
        assert_eq!(&png[1..4], b"PNG");

        // The warnings that matter here.
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        let of = |kind: &str| warnings.lines().filter(|l| l.starts_with(&format!("{kind},"))).count();
        assert_eq!(of("lived-in-not-protected"), 1);
        assert!(warnings.contains("lived-in-not-protected,minecraft:overworld,16,16,,,,InhabitedTime 5000 ticks (4.2 min)"), "{warnings}");
        assert_eq!(of("logout-position-in-target"), 1); // Player_One, in chunk (5,5)
        assert_eq!(of("player-no-bed"), 1); // Player_Two
        assert_eq!(of("bed-outside-scope"), 1); // Player_Three's Nether bed
        assert_eq!(of("online-mode"), 1);
        assert_eq!(of("waystone-in-target") + of("claim-in-target"), 0);
        assert_eq!(s.warnings, warnings.lines().count() - 1);

        // summary.json holds what the report says, and reads back as the same view.
        let view = load_view(&s.out_dir).unwrap();
        assert_eq!(view, s.view);
        assert_eq!((view.on_disk, view.protected, view.selected, view.targets, view.warnings), (445, 17, 445, 428, s.warnings));
        assert_eq!(view.plan_hash, s.plan_hash);
        assert_eq!(view.scope, "all");
        let over = &view.dimensions[0];
        assert_eq!((over.id.as_str(), over.terrain, over.entities, over.poi), (OVERWORLD, 444, 2, 1));
        let layer = |name: &str| over.layers.iter().find(|l| l.name == name).map(|l| (l.kept, l.alone)).unwrap();
        assert_eq!(layer("bed"), (9, 8));
        assert_eq!(layer("spawn"), (5, 5));
        assert_eq!(layer("waystone"), (1, 1));
        assert_eq!(layer("claim"), (1, 1));
        assert_eq!(layer("lived-in"), (2, 1));
        let removed = over.files.iter().find(|f| f.label == "REMOVED ENTIRELY").unwrap();
        assert_eq!((removed.region, removed.entities, removed.poi), (1, 0, 0));
        assert_eq!(view.players.len(), 3);
        assert_eq!(view.players[0].name, "Player_One");
        assert!(view.players[0].lines.iter().any(|l| l.starts_with("bed area     3x3 chunks: 9 on disk, 9 kept")), "{:?}", view.players[0].lines);
        assert!(view.warning_groups.iter().any(|g| g.kind == "lived-in-not-protected" && g.count == 1 && g.more == 0));
        assert_eq!(view.warning_groups.iter().map(|g| g.count).sum::<usize>(), view.warnings);
        assert!(view.waystones.iter().any(|l| l.starts_with("used by players: 1 (activated by somebody: 0; placed by a player: 1)")), "{:?}", view.waystones);
        // The map is where the view says, is ours to read back, and paints a target orange and the bed white.
        let map = over.map.clone().unwrap();
        assert_eq!((map.file.as_str(), map.pixels_per_chunk, map.origin_x, map.origin_z), ("map-minecraft_overworld.png", 2, -22, -22));
        let image = crate::png::decode_indexed(&fs::read(s.out_dir.join(&map.file)).unwrap()).unwrap();
        assert_eq!((image.width, image.height), (map.width, map.height));
        let colour_at = |chunk: ChunkPos| {
            let (px, py) = ((i64::from(chunk.0) - map.origin_x) * 2, (i64::from(chunk.1) - map.origin_z) * 2);
            image.palette[usize::from(image.pixels[(py * i64::from(map.width) + px) as usize])]
        };
        assert_eq!(colour_at((5, 5)), MAP_LEGEND[8].1, "a target is orange");
        assert_eq!(colour_at((12, 12)), MAP_LEGEND[0].1, "the bed chunk is white");
        assert_eq!(colour_at((18, 18)), MAP_LEGEND[5].1, "the waystone is cyan");
        assert_eq!(colour_at((50, 50)), [16, 16, 20], "nothing on disk there");
        assert_eq!(MAP_LEGEND[8].0, "WOULD BE REGENERATED");
        assert_eq!(layer("logout"), (0, 0), "off in this fixture");

        // The run is listed, newest first.
        let runs = list_runs(&fx.root);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].dir, s.out_dir);
        assert!(runs[0].name.ends_with("-all"));

        // And the world is exactly as it was: every file, every byte, every timestamp.
        assert_eq!(fx.world_state(), before);
        assert!(!fx.root.join("testworld").join("regen-reports").exists());
        assert!(s.out_dir.starts_with(fx.root.join(REPORTS_DIR)));
    }

    #[test]
    fn a_ring_a_box_and_a_report() {
        let fx = Fixture::new();
        let before = fx.world_state();

        // Ring 3 around the bed chunk (12,12): 7x7 = 49 chunks, minus the 3x3
        // bed area and the lived-in (15,15).
        let ring = fx.run("scope=ring:3");
        assert_eq!((ring.on_disk, ring.protected, ring.targets), (445, 17, 39));
        let chunks = plan_chunks(&fx.plan(&ring), OVERWORLD);
        assert!(chunks.iter().all(|c| chebyshev(*c, (12, 12)) <= 3 && chebyshev(*c, (12, 12)) >= 2));
        assert!(!chunks.contains(&(15, 15)) && chunks.contains(&(15, 14)) && chunks.contains(&(9, 9)));
        assert!(flat(&ring.report).contains("7x7 chunks: 49 on disk, 10 kept (bed 9, lived-in 2), 39 WOULD BE REGENERATED"), "{}", ring.report);
        assert!(flat(&ring.report).contains("3x3 chunks: 9 on disk, 9 kept (bed 9, lived-in 1), 0 WOULD BE REGENERATED"));
        // Nothing outside the ring is touched, however unprotected.
        let csv = fs::read_to_string(ring.out_dir.join("chunks.csv")).unwrap();
        assert!(csv.lines().any(|l| l == "minecraft:overworld,16,16,256,256,r.0.0.mca,1,0,0,5000,0,,,0,untouched,,"));

        // A box over the waystone and the claim: 5x5 = 25, both kept.
        let boxed = fx.run("scope=box:16,16,20,20");
        assert_eq!(boxed.targets, 23);
        let chunks = plan_chunks(&fx.plan(&boxed), OVERWORLD);
        assert!(!chunks.contains(&(18, 18)) && !chunks.contains(&(19, 19)) && chunks.contains(&(16, 16)));

        // A report selects nothing; its plan is empty but still a plan.
        let report = fx.run("scope=report");
        assert_eq!((report.on_disk, report.protected, report.targets), (445, 17, 0));
        let plan = fx.plan(&report);
        assert_eq!(plan["total_chunks"], 0);
        assert!(plan_chunks(&plan, OVERWORLD).is_empty());
        assert_ne!(report.plan_hash, ring.plan_hash);
        assert_ne!(ring.plan_hash, boxed.plan_hash);
        // Same question, same answer: the hash does not depend on when it is asked.
        assert_eq!(fx.run("scope=ring:3").plan_hash, ring.plan_hash);

        // Four runs, four folders (newest first in the listing), and still nothing changed in the world.
        assert_eq!(fs::read_dir(fx.root.join(REPORTS_DIR)).unwrap().count(), 4);
        let runs = list_runs(&fx.root);
        assert_eq!(runs.len(), 4);
        assert!(runs.windows(2).all(|pair| pair[0].name > pair[1].name));
        assert!(runs.iter().all(|r| load_view(&r.dir).is_ok()));
        // A folder without a summary (a run by an older launcher) is listed, and says why it has no view.
        fs::remove_file(runs[3].dir.join(SUMMARY_FILE)).unwrap();
        assert_eq!(list_runs(&fx.root).len(), 4);
        assert!(load_view(&runs[3].dir).unwrap_err().contains(SUMMARY_FILE));
        assert_eq!(fx.world_state(), before);
    }

    #[test]
    fn layers_switched_off_show_up_as_warnings() {
        let fx = Fixture::new();
        let s = fx.run("scope=all waystones=off claims=off inhabited_min_ticks=off");
        // Without those three layers: (15,15), (18,18), (19,19) lose protection;
        // (12,12) is still the bed's.
        assert_eq!((s.protected, s.targets), (14, 431));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        let of = |kind: &str| warnings.lines().filter(|l| l.starts_with(&format!("{kind},"))).count();
        assert_eq!(of("waystone-in-target"), 1);
        assert_eq!(of("claim-in-target"), 1);
        assert_eq!(of("lived-in-not-protected"), 2); // (15,15) and (16,16)
        assert!(warnings.contains("waystone-in-target,minecraft:overworld,18,18,291,70,292,"), "{warnings}");
        assert!(warnings.contains("claimed by Player_One"));
        assert!(s.report.contains("[not the default]"));

        // unprotect= beats every layer and says so; protect= adds one.
        fs::write(fx.root.join(protection::POLICY_FILE), "unprotect=12,12\nprotect=16,16\n").unwrap();
        let s = fx.run("scope=all");
        assert_eq!((s.protected, s.targets), (17, 428)); // one out, one in
        let chunks = plan_chunks(&fx.plan(&s), OVERWORLD);
        assert!(chunks.contains(&(12, 12)) && !chunks.contains(&(16, 16)));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        assert!(warnings.contains("unprotect-overrides-a-layer,minecraft:overworld,12,12,,,,an unprotect= line removes the protection of bed+lived-in [bed of Player_One]; it WOULD BE REGENERATED"), "{warnings}");
        assert!(s.report.contains(".icraft_regen_policy is in effect"));
        assert_eq!(fx.plan(&s)["policy_file"], "unprotect=12,12\nprotect=16,16\n");

        // A policy file that does not parse stops the run: no plan from a policy nobody wrote.
        fs::write(fx.root.join(protection::POLICY_FILE), "inhabited_min_ticks=ten minutes\n").unwrap();
        let err = run(&fx.cfg, &fx.spec("scope=all")).unwrap_err();
        assert!(err.contains(protection::POLICY_FILE), "{err}");

        // Settings handed over whole (the launcher window) are used as they are: the
        // policy file is not read, and the plan says where its settings came from.
        let mut on_screen = Settings::default();
        on_screen.spawn_radius_blocks = Some(16);
        on_screen.set("waystones", "off").unwrap();
        let spec = RunSpec { scope: Scope::All, settings: Some(on_screen.clone()), ..RunSpec::default() };
        assert_eq!(spec.tokens(), "scope=all dims=minecraft:overworld settings=window");
        let s = run(&fx.cfg, &spec).unwrap();
        // The waystone chunk is no longer kept; the logout layer is on (the window's
        // settings are the defaults) and keeps Player_One's 3x3 around chunk (5,5).
        assert_eq!((s.protected, s.targets), (16 + 9, 429 - 9));
        assert!(s.view.policy_file.starts_with("not consulted"), "{}", s.view.policy_file);
        let plan = fx.plan(&s);
        assert!(plan["settings_source"].as_str().unwrap().starts_with("the launcher window"));
        assert_eq!(plan["policy_file"], serde_json::Value::Null);
        let mut again = Settings::default();
        for pair in plan["settings"].as_array().unwrap() {
            again.set(pair[0].as_str().unwrap(), pair[1].as_str().unwrap()).unwrap();
        }
        assert_eq!(again, on_screen);
    }

    #[test]
    fn the_logout_layer_keeps_where_players_logged_out() {
        // G5 (ruled 2026-10-22): on by default, the logout chunk and the 3x3 around it.
        // This run uses the defaults, not the fixture's `spec` (which turns the layer off).
        let fx = Fixture::new();
        let world = fx.root.join("testworld");
        write_region(&world.join("DIM-1"), Store::Region, 0, 0, &[((0, 0), 0), ((1, 1), 0), ((5, 5), 0), ((9, 9), 0)]);
        // Player_Three: bed in the Nether at chunk (0,0) as before, logged out in the Nether at chunk (8,8).
        write_player(&world, P3, &player_nbt(Some((NETHER, (8, 64, 8))), (NETHER, (129.5, 70.0, 129.5)), &[]));
        let spec = RunSpec::parse_tokens(["scope=all", "dims=all", "spawn_radius_blocks=16"]).unwrap();
        let before = fx.world_state();
        let s = run(&fx.cfg, &spec).unwrap();

        // Overworld: the 17 of the fixture, plus Player_One's 3x3 around chunk (5,5) (Player_Two's,
        // around (0,0), is spawn already). Nether: the bed's (0,0) and (1,1), and the logout's (9,9).
        assert_eq!((s.on_disk, s.protected, s.targets), (445 + 4, 17 + 9 + 3, 428 - 9 + 1));
        let plan = fx.plan(&s);
        let over = plan_chunks(&plan, OVERWORLD);
        for x in 4..=6 {
            for z in 4..=6 {
                assert!(!over.contains(&(x, z)), "({x},{z}) is in Player_One's logout square");
            }
        }
        assert!(over.contains(&(3, 5)) && over.contains(&(7, 5)) && over.contains(&(5, 7)));
        // A Nether logout keeps Nether chunks only: the same numbers in the overworld are reset.
        assert!(over.contains(&(8, 8)) && over.contains(&(9, 9)));
        assert_eq!(plan_chunks(&plan, NETHER), BTreeSet::from([(5, 5)]));
        assert_eq!(plan_hash("testworld", [(OVERWORLD, &over), (NETHER, &plan_chunks(&plan, NETHER))]), s.plan_hash);

        // Reported on its own: a row of the layer table per dimension, with what it was built from.
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        let of = |w: &str, kind: &str| w.lines().filter(|l| l.starts_with(&format!("{kind},"))).count();
        assert_eq!(of(&warnings, "logout-position-in-target"), 0, "nobody logged out in a chunk to be reset any more");
        assert_eq!(of(&warnings, "logout-unknown") + of(&warnings, "player-file-unreadable"), 0);
        let row = |view: &RunView, dim: &str| {
            let d = view.dimensions.iter().find(|d| d.id == dim).unwrap();
            let l = d.layers.iter().find(|l| l.name == "logout").unwrap();
            (l.kept, l.alone, l.note.clone())
        };
        assert_eq!(row(&s.view, OVERWORLD), (9 + 5, 9, "2 of 3 player file(s) logged out in this dimension".to_string()));
        assert_eq!(row(&s.view, NETHER), (1, 1, "1 of 3 player file(s) logged out in this dimension".to_string()));
        assert!(flat(&s.report).contains("logout 14 only this layer: 9 (2 of 3 player file(s) logged out in this dimension)"), "{}", s.report);
        assert!(flat(&s.report).contains("logout_radius 1 chunk(s): 3x3 around each player's logout chunk "), "{}", s.report);
        assert!(!flat(&s.report).contains("logout chunk [not the default]"), "{}", s.report);
        assert!(s.view.players[0].lines.iter().any(|l| l == "logged out   block 88, 64, 90 in minecraft:overworld = chunk (5, 5): kept (logout)"), "{:?}", s.view.players[0].lines);
        assert_eq!(load_view(&s.out_dir).unwrap(), s.view);
        // The layer names no one: no reason in the CSV, and the map has a colour for it.
        let csv = fs::read_to_string(s.out_dir.join("chunks.csv")).unwrap();
        assert!(csv.lines().any(|l| l == "minecraft:overworld,5,5,80,80,r.0.0.mca,1,0,0,0,1,logout,,1,keep,,"), "{csv}");
        assert!(csv.lines().any(|l| l == "minecraft:the_nether,9,9,144,144,r.0.0.mca,1,0,0,0,1,logout,,1,keep,,"), "{csv}");
        assert_eq!(MAP_LEGEND[1].0, "logout");
        let map = s.view.dimensions.iter().find(|d| d.id == OVERWORLD).unwrap().map.clone().unwrap();
        let image = crate::png::decode_indexed(&fs::read(s.out_dir.join(&map.file)).unwrap()).unwrap();
        let (px, py) = ((5 - map.origin_x) * 2, (5 - map.origin_z) * 2);
        assert_eq!(image.palette[usize::from(image.pixels[(py * i64::from(map.width) + px) as usize])], MAP_LEGEND[1].1);

        // A player file that does not read, .dat_old included, is a warning and not a failed
        // run; the layer still keeps the others' spots and says what it could not see.
        fs::write(world.join("playerdata").join(format!("{P2}.dat")), b"\x1f\x8b\x08 torn").unwrap();
        // And a file that reads but holds no position (Player_Three's, keeping the Nether bed).
        let mut no_pos = player_nbt(Some((NETHER, (8, 64, 8))), (NETHER, (0.0, 0.0, 0.0)), &[]);
        if let crate::nbt::Value::Compound(map) = &mut no_pos {
            assert!(map.remove("Pos").is_some());
        }
        write_player(&world, P3, &no_pos);
        let s = run(&fx.cfg, &spec).unwrap();
        // Player_Two's spot was spawn's anyway; Player_Three's Nether (9,9) is now reset.
        assert_eq!((s.protected, s.targets), (17 + 9 + 2, 428 - 9 + 2));
        assert!(!plan_chunks(&fx.plan(&s), OVERWORLD).contains(&(5, 5)), "Player_One's square is still kept");
        assert_eq!(plan_chunks(&fx.plan(&s), NETHER), BTreeSet::from([(5, 5), (9, 9)]));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        assert_eq!(of(&warnings, "player-file-unreadable"), 1);
        assert_eq!(of(&warnings, "logout-unknown"), 1);
        assert!(warnings.contains("player file #2 of 3 in playerdata/ (sorted by file name) does not read, and neither does its .dat_old"), "{warnings}");
        assert!(warnings.contains("player file #3 of 3 in playerdata/ reads but holds no position (Pos)"), "{warnings}");
        assert_eq!(
            row(&s.view, OVERWORLD).2,
            "1 of 3 player file(s) logged out in this dimension; 2 logout spot(s) UNKNOWN, see the warnings"
        );
        assert!(s.view.warning_groups.iter().any(|g| g.kind == "player-file-unreadable" && g.count == 1));
        // Nothing written names the unreadable file's player.
        for file in ["report.txt", "warnings.csv", "chunks.csv", SUMMARY_FILE, PLAN_FILE] {
            let body = fs::read_to_string(s.out_dir.join(file)).unwrap();
            assert!(!body.contains(P2) && !body.contains("Player_Two"), "{file}");
        }
        assert_eq!(s.view.players.len(), 2);

        // Switched off, the layer keeps nothing, and the old warning is back for Player_One.
        let mut off = spec.clone();
        off.set("logout_radius", "off").unwrap();
        let s = run(&fx.cfg, &off).unwrap();
        assert!(plan_chunks(&fx.plan(&s), OVERWORLD).contains(&(5, 5)));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        assert_eq!(of(&warnings, "logout-position-in-target"), 1);
        assert_eq!(of(&warnings, "logout-unknown"), 0, "nothing to say about a layer that is off");
        assert_eq!(row(&s.view, OVERWORLD), (0, 0, "the layer is off".to_string()));
        assert!(flat(&s.report).contains("logout_radius off [not the default]"), "{}", s.report);

        assert_eq!(
            fx.world_state().into_iter().filter(|(p, _, _)| !p.starts_with(world.join("playerdata"))).collect::<Vec<_>>(),
            before.into_iter().filter(|(p, _, _)| !p.starts_with(world.join("playerdata"))).collect::<Vec<_>>(),
            "nothing but the files this test wrote changed"
        );
    }

    #[test]
    fn only_waystones_players_use_are_kept_by_default() {
        let fx = Fixture::new();
        let world = fx.root.join("testworld");
        let p1_way = "00000005-0000-0006-0000-000700000008";
        write_waystones(&world, &[
            ([1, 2, 3, 4], "", OVERWORLD, (18 * 16 + 3, 70, 18 * 16 + 4), "PLAYER"),       // placed by a player
            ([5, 6, 7, 8], "Hearthome", OVERWORLD, (3 * 16, 70, 10 * 16), "VILLAGE"),      // generated, activated by Player_One
            ([9, 9, 9, 9], "", OVERWORLD, (7 * 16, 70, 7 * 16), "WILDERNESS"),             // generated, used by nobody
        ]);
        write_player(&world, P1, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (88.5, 64.0, 90.5)), &[p1_way]));

        let s = fx.run("scope=all");
        // 17 as before, plus the activated one at (3,10); the unused one at (7,7) goes.
        assert_eq!((s.protected, s.targets), (18, 427));
        let chunks = plan_chunks(&fx.plan(&s), OVERWORLD);
        assert!(!chunks.contains(&(18, 18)) && !chunks.contains(&(3, 10)) && chunks.contains(&(7, 7)));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        assert_eq!(warnings.lines().filter(|l| l.starts_with("waystone-in-target,")).count(), 1);
        assert!(warnings.contains("waystone-in-target,minecraft:overworld,7,7,112,70,112,"), "{warnings}");
        assert!(s.view.waystones.iter().any(|l| l.starts_with("used by players: 2 (activated by somebody: 1; placed by a player: 1); generated and never used: 1")), "{:?}", s.view.waystones);
        assert!(s.view.players[0].lines.iter().any(|l| l.starts_with("waystones    1 activated (1 of them still in waystones.dat), 0 would be regenerated")));

        // waystones=all keeps every one of them.
        let s = fx.run("scope=all waystones=all");
        assert_eq!((s.protected, s.targets), (19, 426));
        assert!(!fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap().contains("waystone-in-target"));
    }

    #[test]
    fn dimensions_are_chosen_per_run() {
        let fx = Fixture::new();
        let world = fx.root.join("testworld");
        write_region(&world.join("DIM-1"), Store::Region, 0, 0, &[((0, 0), 0), ((1, 1), 0), ((9, 9), 50_000)]);
        // Both dimensions: Player_Three's Nether bed (chunk 0,0) keeps its 3x3, and the lived-in chunk stays.
        let s = fx.run("scope=all dims=all");
        assert_eq!(s.on_disk, 445 + 3);
        assert_eq!(s.targets, 428);
        let plan = fx.plan(&s);
        assert!(plan_chunks(&plan, NETHER).is_empty());
        assert_eq!(plan["dimensions"].as_array().unwrap().len(), 2);
        assert_eq!(plan["dimensions"][1]["id"], NETHER);
        assert_eq!(plan["dimensions"][1]["folder"], "DIM-1");
        assert!(!fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap().contains("bed-outside-scope"));
        // The Nether alone, without its bed layer: both unprotected chunks go. (9,9) is lived-in,
        // so the region file is only partly cleared.
        let s = fx.run("scope=all dims=minecraft:the_nether bed_radius=off");
        assert_eq!((s.on_disk, s.protected, s.targets), (3, 1, 2));
        assert_eq!(plan_chunks(&fx.plan(&s), NETHER), BTreeSet::from([(0, 0), (1, 1)]));
        assert_eq!(fx.plan(&s)["dimensions"][0]["delete_files"]["region"], serde_json::json!([]));
        // A dimension the world does not have is an error that names the ones it has.
        let err = run(&fx.cfg, &fx.spec("dims=minecraft:the_moon")).unwrap_err();
        assert!(err.contains("minecraft:the_moon") && err.contains(OVERWORLD), "{err}");
    }

    #[test]
    fn reports_are_never_written_into_the_world() {
        let fx = Fixture::new();
        let before = fx.world_state();
        let mut spec = fx.spec("scope=all");
        spec.out_root = Some(fx.root.join("testworld").join("reports"));
        let err = run(&fx.cfg, &spec).unwrap_err();
        assert!(err.contains("inside the world folder"), "{err}");
        spec.out_root = Some(fx.root.join("testworld"));
        assert!(run(&fx.cfg, &spec).is_err());
        assert_eq!(fx.world_state(), before);
        // Anywhere else is fine.
        spec.out_root = Some(fx.root.join("elsewhere").join("deep"));
        let s = run(&fx.cfg, &spec).unwrap();
        assert!(s.out_dir.starts_with(fx.root.join("elsewhere").join("deep")));
        assert!(!fx.root.join(REPORTS_DIR).exists());
        // No world at all.
        let empty = ServerConfig::from_path(fx.root.join("elsewhere"));
        assert!(run(&empty, &RunSpec::default()).unwrap_err().contains("no world"));
    }

    #[test]
    fn old_report_folders_are_pruned_and_nothing_else_is() {
        let fx = Fixture::new();
        let reports = fx.root.join(REPORTS_DIR);
        // Fifteen earlier runs, by name; and things that are not runs.
        for n in 0..15 {
            let dir = reports.join(format!("20260101-0000{n:02}-ring8"));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("report.txt"), b"an old report").unwrap();
        }
        fs::create_dir_all(reports.join("my notes")).unwrap();
        fs::write(reports.join("my notes").join("report.txt"), b"mine").unwrap();
        fs::create_dir_all(reports.join("20260101-000000-ring8-keep me")).unwrap();
        fs::write(reports.join("20260101-000000-ring8-keep me").join("report.txt"), b"mine").unwrap();
        fs::create_dir_all(reports.join("20250101-000000-all")).unwrap(); // a run's name, but no report in it
        fs::write(reports.join("readme.txt"), b"x").unwrap();
        assert!(is_run_name("20261011-121049-ring8") && is_run_name("20261011-121049-all-2") && is_run_name("20261011-121049-box"));
        for not_a_run in ["my notes", "20261011-121049", "20261011-121049-", "2026101-121049-all", "20261011_121049-all", "20261011-121049-all two", ""] {
            assert!(!is_run_name(not_a_run), "{not_a_run}");
        }

        // A run of today: the newest. The oldest four of the fifteen go.
        let s = fx.run("scope=report");
        let names: Vec<String> = list_runs(&fx.root).into_iter().map(|r| r.name).collect();
        assert_eq!(names.iter().filter(|n| is_run_name(n)).count(), REPORTS_KEPT);
        assert!(s.out_dir.is_dir());
        for n in 0..4 {
            assert!(!reports.join(format!("20260101-0000{n:02}-ring8")).exists(), "run {n} should be gone");
        }
        for n in 4..15 {
            assert!(reports.join(format!("20260101-0000{n:02}-ring8")).join("report.txt").is_file(), "run {n} should be kept");
        }
        assert!(reports.join("my notes").join("report.txt").is_file());
        assert!(reports.join("20260101-000000-ring8-keep me").join("report.txt").is_file());
        assert!(reports.join("20250101-000000-all").is_dir());
        assert!(reports.join("readme.txt").is_file());

        // A spared folder stays however old it is; a run written elsewhere prunes nothing here.
        let oldest = reports.join("20260101-000004-ring8");
        assert_eq!(prune_reports(&fx.root, 3, &[&oldest]).len(), REPORTS_KEPT - 3 - 1);
        assert!(oldest.is_dir() && s.out_dir.is_dir());
        let mut spec = fx.spec("scope=report");
        spec.out_root = Some(fx.root.join("elsewhere"));
        for _ in 0..3 {
            run(&fx.cfg, &spec).unwrap();
        }
        assert_eq!(list_runs(&fx.root).into_iter().filter(|r| is_run_name(&r.name)).count(), 4);
        assert_eq!(fs::read_dir(fx.root.join("elsewhere")).unwrap().count(), 3);
    }

    #[test]
    fn a_request_file_is_answered() {
        let fx = Fixture::new();
        let before = fx.world_state();
        poll_request(&fx.cfg); // no request: nothing happens
        assert!(last_answer(&fx.root).is_none());

        write_request(&fx.root, "pre rebalance", "scope=ring:3 spawn_radius_blocks=16").unwrap();
        let body = fs::read_to_string(fx.root.join(REQUEST_FILE)).unwrap();
        assert!(body.contains(" pre-rebalance scope=ring:3 "), "{body}");
        poll_request(&fx.cfg);
        assert!(!fx.root.join(REQUEST_FILE).exists());
        let (when, answer) = last_answer(&fx.root).unwrap();
        assert!(when > 1_700_000_000);
        // A request runs on the defaults: the logout layer is on, and keeps Player_One's
        // 3x3 around chunk (5,5) on top of the fixture's 17 (outside the ring either way).
        assert!(answer.starts_with("done: scope ring:3: 39 of 445 chunk(s) on disk would be regenerated, 26 protected"), "{answer}");
        let log = fs::read_to_string(fx.root.join("logs").join(LOG_FILE)).unwrap();
        assert!(log.contains("request 'pre-rebalance': scope=ring:3") && log.contains("nothing was modified"), "{log}");

        // Stale, malformed and impossible requests are refused and say why.
        fs::write(fx.root.join(REQUEST_FILE), "1000 old scope=all\n").unwrap();
        poll_request(&fx.cfg);
        assert!(last_answer(&fx.root).unwrap().1.starts_with("rejected: stale request"));
        fs::write(fx.root.join(REQUEST_FILE), format!("{} oops scope=sideways\n", unix_now())).unwrap();
        poll_request(&fx.cfg);
        assert!(last_answer(&fx.root).unwrap().1.starts_with("rejected: scope=sideways"));
        fs::write(fx.root.join(REQUEST_FILE), "whenever\n").unwrap();
        poll_request(&fx.cfg);
        assert!(last_answer(&fx.root).unwrap().1.starts_with("rejected: no timestamp"));
        fs::write(fx.root.join(REQUEST_FILE), format!("{} x dims=minecraft:the_moon\n", unix_now())).unwrap();
        poll_request(&fx.cfg);
        assert!(last_answer(&fx.root).unwrap().1.starts_with("FAILED: dimension minecraft:the_moon"));
        // A bare timestamp is the default: a protection report of the overworld.
        fs::write(fx.root.join(REQUEST_FILE), format!("\u{feff}{}\n", unix_now())).unwrap();
        poll_request(&fx.cfg);
        assert!(last_answer(&fx.root).unwrap().1.starts_with("done: scope report: 0 of 445"));
        assert_eq!(fx.world_state(), before);
    }

    /// Five structures in r.2.0, kept or not by manual boxes:
    ///
    ///   village_plains  start (64,0), pieces in (64,0) (65,0) (66,0); (64,0) kept  -> CUT, start kept
    ///   mineshaft       start (68,0), pieces in (68,0) (69,0)                      -> regenerated whole
    ///   small_dungeon   start (70,2), pieces in (70,2) (70,3); both kept            -> kept whole
    ///   ancient_city    start (66,4), pieces in (65,4) (66,4); (65,4) kept          -> CUT, start regenerated
    ///   stronghold      start (90,90), not on disk; a piece in (67,5)              -> pieces only, regenerated
    fn with_structures(f: &Fixture) {
        use crate::anvil::testing::{structures_value as sv, write_region_with};
        const V: &str = "minecraft:village_plains";
        const M: &str = "minecraft:mineshaft";
        const D: &str = "betterdungeons:small_dungeon";
        const A: &str = "minecraft:ancient_city";
        const S: &str = "minecraft:stronghold";
        let bb = |c: ChunkPos| [c.0 * 16, 50, c.1 * 16, c.0 * 16 + 15, 70, c.1 * 16 + 15];
        write_region_with(
            &f.root.join("testworld"),
            2,
            0,
            &[
                ((64, 0), 0, Some(sv(&[(V, (64, 0), &[bb((64, 0)), bb((65, 0)), bb((66, 0))])], &[(V, &[(64, 0)])]))),
                ((65, 0), 0, Some(sv(&[], &[(V, &[(64, 0)])]))),
                ((66, 0), 0, Some(sv(&[], &[(V, &[(64, 0)])]))),
                ((68, 0), 0, Some(sv(&[(M, (68, 0), &[bb((68, 0)), bb((69, 0))])], &[(M, &[(68, 0)])]))),
                ((69, 0), 0, Some(sv(&[], &[(M, &[(68, 0)])]))),
                ((70, 2), 0, Some(sv(&[(D, (70, 2), &[bb((70, 2)), bb((70, 3))])], &[(D, &[(70, 2)])]))),
                ((70, 3), 0, Some(sv(&[], &[(D, &[(70, 2)])]))),
                ((65, 4), 0, Some(sv(&[], &[(A, &[(66, 4)])]))),
                ((66, 4), 0, Some(sv(&[(A, (66, 4), &[bb((65, 4)), bb((66, 4))])], &[(A, &[(66, 4)])]))),
                ((67, 5), 0, Some(sv(&[], &[(S, &[(90, 90)])]))),
                ((71, 7), 0, None),
            ],
        );
    }

    #[test]
    fn the_dry_run_says_which_structures_the_plan_keeps_regenerates_or_cuts() {
        let f = Fixture::new();
        with_structures(&f);
        let before = f.world_state();
        let tokens = "scope=all protect=64,0 protect=70,2..70,3 protect=65,4";
        let s = f.run(tokens);

        let st = s.view.dimensions[0].structures.clone().expect("a dry-run reads structures");
        assert_eq!(
            (st.total, st.kept_whole, st.reset_whole, st.cut, st.cut_start_reset, st.cut_no_start, st.without_start),
            (5, 1, 2, 2, 1, 0, 1)
        );
        assert_eq!(st.unreadable, 0);
        assert_eq!(st.without_tag, 445, "the fixture's 444 terrain chunks and (71,7) have no structures tag");
        let city = st.types.iter().find(|t| t.id == "minecraft:ancient_city").unwrap();
        assert_eq!((city.total, city.kept_whole, city.reset_whole, city.cut), (1, 0, 0, 1));
        assert_eq!(st.cut_lines.len(), 2);
        assert!(st.cut_lines[0].starts_with("minecraft:village_plains  start chunk (64, 0): 3 chunk(s), 1 kept, 2 regenerated; start kept"), "{:?}", st.cut_lines);
        assert!(st.cut_lines[1].starts_with("minecraft:ancient_city  start chunk (66, 4): 2 chunk(s), 1 kept, 1 regenerated; start REGENERATED"), "{:?}", st.cut_lines);
        let report = flat(&s.report);
        assert!(report.contains("STRUCTURES: minecraft:overworld"), "{report}");
        assert!(report.contains("CUT by the plan 2 some chunks kept, some regenerated (start regenerated: 1, no start on disk: 0)"), "{report}");
        assert!(report.contains("minecraft:mineshaft 1 0 1 0"), "{report}");

        // structures.csv: one row each.
        let rows = fs::read_to_string(s.out_dir.join(STRUCTURES_FILE)).unwrap();
        let rows: Vec<Vec<String>> = rows.lines().skip(1).map(csv_fields).collect();
        assert_eq!(rows.len(), 5);
        let row = |id: &str| rows.iter().find(|r| r[1] == id).unwrap().clone();
        assert_eq!(row("minecraft:village_plains")[6..].to_vec(), ["kept", "3", "1024 50 0 .. 1071 70 15", "3", "1", "2", "cut"]);
        assert_eq!(row("minecraft:mineshaft")[6..].to_vec(), ["regenerated", "2", "1088 50 0 .. 1119 70 15", "2", "0", "2", "regenerated"]);
        assert_eq!(row("betterdungeons:small_dungeon")[12], "kept");
        assert_eq!(row("minecraft:ancient_city")[6], "regenerated");
        assert_eq!(row("minecraft:stronghold")[6..].to_vec(), ["not on disk", "", "", "1", "0", "1", "regenerated"]);
        // chunks.csv: what starts in a chunk and what has a piece there.
        let starts_here = csv_row(&s.out_dir.join("chunks.csv"), &[("chunk_x", "64"), ("chunk_z", "0")]).unwrap().unwrap();
        assert_eq!((starts_here["structure_starts"].as_str(), starts_here["structures"].as_str(), starts_here["action"].as_str()), ("minecraft:village_plains", "minecraft:village_plains", "keep"));
        let piece = csv_row(&s.out_dir.join("chunks.csv"), &[("chunk_x", "67"), ("chunk_z", "5")]).unwrap().unwrap();
        assert_eq!((piece["structure_starts"].as_str(), piece["structures"].as_str()), ("", "minecraft:stronghold"));

        // The map: a regenerated chunk of a cut structure is red; a kept one keeps its layer's colour.
        let a = analyse_with_structures(&f.cfg, &f.spec(tokens)).unwrap();
        let d = a.dim(OVERWORLD).unwrap();
        let cut = d.cut_chunks();
        assert_eq!(cut, BTreeSet::from([(65, 0), (66, 0), (66, 4)]));
        assert_eq!([(65, 0), (66, 4), (68, 0), (64, 0), (70, 2)].map(|c| map_colour(d, c, &cut)), [12, 12, 3, 7, 7]);

        // Structures are the report's: the plan is the one an execution recomputes.
        let plain = analyse(&f.cfg, &f.spec(tokens)).unwrap();
        assert!(plain.dims.iter().all(|d| d.structures.is_empty() && !d.scan.structures_read));
        assert_eq!(plan_hash(&plain.level_name, plain.dims.iter().map(|d| (d.dim.id.as_str(), &d.targets))), s.plan_hash);
        // The footprints, as `icraft structure-footprints` prints them.
        let lines = structure_footprints(&f.cfg, OVERWORLD).unwrap();
        assert_eq!(lines.lines().count(), 5);
        assert!(lines.contains(r#"{"id":"minecraft:village_plains","start":[64,0],"start_on_disk":true,"chunks":[[64,0],[65,0],[66,0]]}"#), "{lines}");
        assert!(lines.contains(r#"{"id":"minecraft:stronghold","start":[90,90],"start_on_disk":false,"chunks":[[67,5]]}"#), "{lines}");
        assert_eq!(f.world_state(), before, "a dry-run writes nothing in the world");
    }

    #[test]
    fn chunk_info_says_what_is_in_a_chunk_and_what_the_plan_does_with_it() {
        let f = Fixture::new();
        with_structures(&f);
        let none = chunk_info(&f.cfg, OVERWORLD, (65, 0), None).unwrap().join("\n");
        assert!(none.contains("plan         no dry-run has been made yet"), "{none}");
        let s = f.run("scope=all protect=64,0 protect=70,2..70,3 protect=65,4");
        let before = f.world_state();

        let at = |pos: ChunkPos| chunk_info(&f.cfg, OVERWORLD, pos, None).unwrap().join("\n");
        let piece = at((65, 0));
        assert!(piece.contains("chunk (65, 0) in minecraft:overworld = blocks x 1040..1055, z 0..15; r.2.0.mca"), "{piece}");
        assert!(piece.contains("on disk      region"), "{piece}");
        assert!(piece.contains("piece here   minecraft:village_plains, which starts in chunk (64, 0): 3 piece(s), blocks 1024 50 0 to 1071 70 15 (chunks (64, 0) to (66, 0))"), "{piece}");
        assert!(piece.contains(&format!("plan         {}: WOULD BE REGENERATED", s.out_dir.file_name().unwrap().to_string_lossy())), "{piece}");
        assert!(piece.contains("minecraft:village_plains (start (64, 0)): CUT: 1 of its 3 chunk(s) kept, 2 regenerated; start kept"), "{piece}");

        let start = at((64, 0));
        assert!(start.contains("starts here  minecraft:village_plains: 3 piece(s)"), "{start}");
        assert!(!start.contains("piece here"), "its own reference is not listed twice: {start}");
        assert!(start.contains(": kept (manual)"), "{start}");

        let lost = at((67, 5));
        assert!(lost.contains("piece here   minecraft:stronghold, which starts in chunk (90, 90): that start is NOT on disk"), "{lost}");
        assert!(lost.contains("minecraft:stronghold (start (90, 90)): regenerated whole (1 chunk(s))"), "{lost}");

        let bare = at((71, 7));
        assert!(bare.contains("structures   none recorded (the chunk has no structures tag)"), "{bare}");
        let nothing = at((500, 500));
        assert!(nothing.contains("on disk      no: nothing has been generated here") && nothing.contains("not in it"), "{nothing}");
        assert!(chunk_info(&f.cfg, "minecraft:the_moon", (0, 0), None).unwrap_err().contains("is not in this world"));

        // Block coordinates (F3) or chunk coordinates.
        assert_eq!(chunk_of(1047, -1, false), Ok((65, -1)));
        assert_eq!(chunk_of(65, -1, true), Ok((65, -1)));
        assert!(chunk_of(i64::MAX, 0, true).is_err());
        assert_eq!(f.world_state(), before, "chunk-info writes nothing in the world");
    }

    #[test]
    fn a_per_player_bed_list_keeps_those_beds_only_and_the_harness_agrees() {
        let f = Fixture::new();
        // Player_Three's bed is in the Nether, which has no chunks: with only
        // Player_Three on the list, no overworld bed is kept.
        let s = f.run("scope=all bed_players=player_three");
        let chunks = s.out_dir.join("chunks.csv");
        let row = |x: i32, z: i32| csv_row(&chunks, &[("chunk_x", &x.to_string()), ("chunk_z", &z.to_string())]).unwrap().unwrap();
        assert_eq!(row(11, 11)["action"], "regenerate", "Player_One's bed square");
        assert_eq!((row(12, 12)["action"].as_str(), row(12, 12)["layers"].as_str()), ("keep", "lived-in"), "kept by the lived-in layer alone");
        let plan = f.plan(&s);
        assert!(plan["settings"].as_array().unwrap().iter().any(|p| p[0] == "bed_players" && p[1] == P3), "the plan records the UUID: {}", plan["settings"]);
        assert!(flat(&s.report).contains("only 1 of 3 player(s): Player_Three"), "{}", s.report);
        // Every player's: the square is kept.
        let all = f.run("scope=all");
        let all_chunks = all.out_dir.join("chunks.csv");
        assert_eq!(csv_row(&all_chunks, &[("chunk_x", "11"), ("chunk_z", "11")]).unwrap().unwrap()["action"], "keep");

        // The harness builds its map from the plan's own settings, and agrees.
        let world = f.root.join("testworld");
        let fplan = fidelity::Plan::load(&s.out_dir).unwrap();
        assert_eq!(fplan.settings.bed_players, [P3]);
        assert_eq!(fidelity::before(&world, &fplan).unwrap().refusal(), None);
        // Told it was every player's bed, it catches the plan resetting Player_One's.
        let mut wrong = fplan.clone();
        wrong.settings.bed_players.clear();
        assert!(fidelity::before(&world, &wrong).unwrap().refusal().is_some());

        // A name that is no player of the world fails the dry-run.
        let typo = run(&f.cfg, &f.spec("scope=all bed_players=Nobody")).unwrap_err();
        assert!(typo.contains("no player file is 'Nobody'"), "{typo}");
    }

    #[test]
    fn csv_fields_read_what_csv_writes() {
        let line = ["plain", "a,b", "say \"hi\"", "", "x;y"].map(csv).join(",");
        assert_eq!(csv_fields(&line), ["plain", "a,b", "say \"hi\"", "", "x;y"]);
    }
}
