//! Chunk regeneration, Phase B: the protection report and the DRY-RUN.
//!
//! **This module deletes nothing and never writes inside the world folder.**
//! It reads the world (see [`crate::anvil`] for why that is safe while the
//! server runs), works out what a regeneration would keep and what it would
//! reset, and writes that down next to the server:
//!
//! ```text
//! <server dir>/regen-reports/<YYYYmmdd-HHMMSS>-<scope>/
//!     report.txt     the whole story, for a person
//!     chunks.csv     one row per chunk on disk: kept or regenerated, and why
//!     warnings.csv   every warning, one row each
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
//! `plan.json` is what the execution phase (Phase C, not built) will ask for:
//! it must recompute the plan with the server stopped and refuse to act unless
//! the hash matches the one the operator approved. A dry-run taken while the
//! server runs is therefore safe to take and to read, but it is the stopped
//! recomputation that counts.
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

/// `<unix-secs> <reason> [key=value ...]`: run a report now. Keys: `scope`,
/// `dims`, `png`, and any setting of [`protection::POLICY_FILE`].
pub const REQUEST_FILE: &str = ".icraft_regen_request";
/// `<unix-secs> <answer>`: started / done / rejected / FAILED.
pub const RESULT_FILE: &str = ".icraft_regen_request.result";
/// Audit log of requested runs, in the server's `logs/`.
pub const LOG_FILE: &str = "regen_dryrun.log";
/// Under the server dir: one folder per run.
pub const REPORTS_DIR: &str = "regen-reports";
pub const PLAN_FILE: &str = "plan.json";

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
    /// `report`, `ring:8`, `all`, `box:160,200,180,230` (or `box:160,200..180,230`).
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
            out_root: None,
            png: true,
        }
    }
}

impl RunSpec {
    /// One `key=value`: `scope`, `dims` (comma-separated ids, or `all`), `png`
    /// (on/off), or a protection setting.
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
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
        if !self.png {
            out.push("png=off".to_string());
        }
        out.join(" ")
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
    layer: [usize; 7],
    layer_alone: [usize; 7],
    selected: usize,
    kept_in_scope: usize,
    targets: usize,
    /// Per [`Store::ALL`].
    files: [FileStats; 3],
}

impl DimResult {
    fn stats(&self) -> DimStats {
        let on_disk: Vec<ChunkPos> = self.scan.chunks.keys().copied().collect();
        let mut layer = [0usize; 7];
        let mut layer_alone = [0usize; 7];
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

    fn server_probably_running(&self) -> bool {
        self.last_save.is_some_and(|age| age < RECENT_SAVE)
    }
}

fn analyse(cfg: &ServerConfig, spec: &RunSpec) -> Result<Analysis, String> {
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
    let mut players = worlddata::read_players(&world, &names)?;
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
        claims,
        waystones,
        all_dims,
        dims: Vec::new(),
        warnings: Vec::new(),
        notes,
        last_save,
    };

    for dim in selected {
        let scan = anvil::scan_dimension(&dim);
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
        analysis.dims.push(DimResult { dim, scan, protection, selected, targets });
    }
    analysis.dims.sort_by(|a, b| a.dim.id.cmp(&b.dim.id));
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
const WARNING_KINDS: [(&str, &str, usize); 15] = [
    ("server-running", "The server is probably running", 5),
    ("mod-data-unreadable", "Mod data that could NOT be checked", 20),
    ("unprotect-overrides-a-layer", "Protection removed by an unprotect= line in the policy file", 40),
    ("unreadable-chunk", "Chunks whose terrain data could not be read", 40),
    ("files-changed-during-scan", "Region files the server wrote to during the scan", 10),
    ("lived-in-not-protected", "Lived-in chunks that are NOT protected (they would be regenerated)", 40),
    ("logout-position-in-target", "Players who logged out in a chunk that would be regenerated", 40),
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
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("icraft-regen-plan v{PLAN_VERSION}\nlevel={level_name}\n"));
    for (id, targets) in dims {
        hasher.update(format!("dim={id}\n"));
        for (x, z) in targets {
            hasher.update(format!("{x},{z}\n"));
        }
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
    wl!(out, "  \"hash_recipe\": \"sha256 of the UTF-8 text: 'icraft-regen-plan v{PLAN_VERSION}' LF, 'level=<level_name>' LF, then per dimension (sorted by id) 'dim=<id>' LF followed by '<x>,<z>' LF for each chunk (sorted by x, then z)\",");
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
            .map(|(i, l)| LayerRow { name: l.name().to_string(), kept: s.layer[i], alone: s.layer_alone[i] })
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
    }
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
    wl!(out, "  with a player within 128 blocks).");

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
            wl!(out, "    {:<10}            {:>9}   only this layer: {}", l.name, num(l.kept), num(l.alone));
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
    wl!(out, "  Map colours: white bed, purple claim, blue manual, yellow spawn, cyan waystone, green lived-in,");
    wl!(out, "  magenta unreadable, ORANGE = would be regenerated, grey = on disk and untouched. North is up;");
    wl!(out, "  faint lines mark region files (32 chunks).");
    wl!(out);
    wl!(out, "This was a dry-run. Executing a plan is a later phase: it will take a verified backup first, need the");
    wl!(out, "server stopped, recompute this plan, and refuse unless the hash matches the one above.");
    out
}

/// What a run does with the chunks of a square around a centre.
#[derive(Default)]
struct Tally {
    on_disk: usize,
    kept: usize,
    regenerate: usize,
    untouched: usize,
    layer: [usize; 7],
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
    let mut out = String::from("dimension,chunk_x,chunk_z,block_x,block_z,region_file,terrain,entities,poi,inhabited_ticks,protected,layers,why,selected,action\n");
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
            wl!(
                out,
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
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
                action
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
const MAP_PALETTE: [[u8; 3]; 11] = [
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
];

/// What the map's colours mean, for a legend. A chunk kept by several layers
/// is drawn in the colour of the first of them in this order.
pub const MAP_LEGEND: [(&str, [u8; 3]); 9] = [
    ("bed", MAP_PALETTE[9]),
    ("claim", MAP_PALETTE[8]),
    ("manual", MAP_PALETTE[7]),
    ("spawn", MAP_PALETTE[6]),
    ("waystone", MAP_PALETTE[5]),
    ("lived-in", MAP_PALETTE[4]),
    ("unreadable", MAP_PALETTE[10]),
    ("WOULD BE REGENERATED", MAP_PALETTE[3]),
    ("on disk, untouched", MAP_PALETTE[2]),
];

fn map_colour(d: &DimResult, pos: ChunkPos) -> u8 {
    if !d.scan.chunks.contains_key(&pos) {
        return if pos.0.rem_euclid(32) == 0 || pos.1.rem_euclid(32) == 0 { 1 } else { 0 };
    }
    let bits = d.protection.layers_at(pos);
    let has = |l: Layer| bits & l.bit() != 0;
    if has(Layer::Bed) {
        9
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
    for cz in 0..h {
        for cx in 0..w {
            let colour = map_colour(d, ((x0 + cx) as i32, (z0 + cz) as i32));
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

    let a = analyse(cfg, spec)?;
    let hash = plan_hash(&a.level_name, a.dims.iter().map(|d| (d.dim.id.as_str(), &d.targets)));
    let out_dir = make_out_dir(&a, &now_local.format("%Y%m%d-%H%M%S").to_string())?;

    let mut files = vec![
        "report.txt     this report".to_string(),
        "chunks.csv     one row per chunk on disk: kept, regenerated or untouched, and why".to_string(),
        "warnings.csv   every warning, one row each".to_string(),
        format!("{PLAN_FILE}      the chunks to regenerate per dimension, with their hash"),
        format!("{SUMMARY_FILE}   what this report says, as data (the launcher window reads it)"),
    ];
    put(&out_dir, "chunks.csv", chunks_csv(&a).as_bytes())?;
    put(&out_dir, "warnings.csv", warnings_csv(&a).as_bytes())?;
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
    audit(dir, log::Level::Info, &format!("request '{who}': {} -- reading the world (read-only)", spec.tokens()));
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
    const ARIA: &str = "2336b337-85a7-37bc-bccb-30eb11749442";
    const FALENDRIA: &str = "5468e8b0-f28f-38c0-bae5-f2f4fc64e097";
    const SILVIE: &str = "7f115983-f49f-3639-abb2-bc6bdb6e831e";

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    /// A server folder with a small world:
    ///
    ///   - world spawn at chunk (0,0); the tests run with `spawn_radius_blocks=16`
    ///     (chunks -1..1)
    ///   - terrain: every chunk 0..=20 x 0..=20, plus (-1,-1), (-20,-20) and,
    ///     alone in its region file, (100,100)
    ///   - (12,12) lived in for 100,000 ticks, (15,15) for 12,000, (16,16) for 5,000
    ///   - an entity chunk with no terrain at (25,25); a zero-byte r.5.5.mca
    ///   - Aria: bed in chunk (12,12), logged out in chunk (5,5)
    ///   - Falendria: no bed. Silvie: bed in the Nether (which has no chunks)
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
                format!(r#"[{{"name":"Aria_Steele","uuid":"{ARIA}"}},{{"name":"Falendria","uuid":"{FALENDRIA}"}},{{"name":"silvieserene","uuid":"{SILVIE}"}}]"#),
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

            write_player(&world, ARIA, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (88.5, 64.0, 90.5)), &[]));
            write_player(&world, FALENDRIA, &player_nbt(None, (OVERWORLD, (0.5, 64.0, 0.5)), &[]));
            write_player(&world, SILVIE, &player_nbt(Some((NETHER, (8, 64, 8))), (NETHER, (8.0, 64.0, 8.0)), &[]));
            write_waystones(&world, &[([1, 2, 3, 4], "", OVERWORLD, (18 * 16 + 3, 70, 18 * 16 + 4), "PLAYER")]);
            write_claims(&world, ARIA, "Aria_Steele", &[(OVERWORLD, false, &[(19, 19)])]);
            Fixture { cfg: ServerConfig::from_path(&root), root }
        }

        fn spec(&self, tokens: &str) -> RunSpec {
            let mut spec = RunSpec::parse_tokens(tokens.split_whitespace()).unwrap();
            spec.set("spawn_radius_blocks", "16").unwrap();
            spec
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
                p.insert((x, z)); // Aria's bed, 3x3
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
        assert_eq!(Scope::parse("box:180,230,160,200"), Ok(Scope::Box { x1: 160, z1: 200, x2: 180, z2: 230 }));
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
        assert_eq!(plan["world"]["seed"], "5436401472302240754");
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
        assert_eq!(again.spawn_radius_blocks, Some(16));
        assert_eq!(Settings { spawn_radius_blocks: Some(protection::SPAWN_RADIUS_BLOCKS), ..again }, Settings::default());

        // The report says the same, and the per-chunk CSV agrees with the plan.
        assert!(flat(&s.report).contains("TO REGENERATE 428"), "{}", s.report);
        assert!(flat(&s.report).contains("REMOVED ENTIRELY 1 0 0"), "{}", s.report);
        assert!(flat(&s.report).contains("empty placeholders 1 0 0"), "{}", s.report);
        assert!(s.report.contains("Nothing was deleted or modified"));
        assert_eq!(fs::read_to_string(s.out_dir.join("report.txt")).unwrap(), s.report);
        let csv = fs::read_to_string(s.out_dir.join("chunks.csv")).unwrap();
        assert_eq!(csv.lines().count(), 1 + 445);
        assert_eq!(csv.lines().filter(|l| l.ends_with(",regenerate")).count(), 428);
        assert_eq!(csv.lines().filter(|l| l.ends_with(",keep")).count(), 17);
        assert!(csv.lines().any(|l| l == "minecraft:overworld,12,12,192,192,r.0.0.mca,1,1,1,100000,1,bed+lived-in,bed of Aria_Steele,1,keep"), "{csv}");
        assert!(csv.lines().any(|l| l == "minecraft:overworld,25,25,400,400,r.0.0.mca,0,1,0,,0,,,1,regenerate"));
        assert!(csv.lines().any(|l| l == "minecraft:overworld,-1,-1,-16,-16,r.-1.-1.mca,1,0,0,0,1,spawn,,1,keep"));
        let png = fs::read(s.out_dir.join("map-minecraft_overworld.png")).unwrap();
        assert_eq!(&png[1..4], b"PNG");

        // The warnings that matter here.
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        let of = |kind: &str| warnings.lines().filter(|l| l.starts_with(&format!("{kind},"))).count();
        assert_eq!(of("lived-in-not-protected"), 1);
        assert!(warnings.contains("lived-in-not-protected,minecraft:overworld,16,16,,,,InhabitedTime 5000 ticks (4.2 min)"), "{warnings}");
        assert_eq!(of("logout-position-in-target"), 1); // Aria, in chunk (5,5)
        assert_eq!(of("player-no-bed"), 1); // Falendria
        assert_eq!(of("bed-outside-scope"), 1); // Silvie's Nether bed
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
        assert_eq!(view.players[0].name, "Aria_Steele");
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
        assert_eq!(colour_at((5, 5)), MAP_LEGEND[7].1, "a target is orange");
        assert_eq!(colour_at((12, 12)), MAP_LEGEND[0].1, "the bed chunk is white");
        assert_eq!(colour_at((18, 18)), MAP_LEGEND[4].1, "the waystone is cyan");
        assert_eq!(colour_at((50, 50)), [16, 16, 20], "nothing on disk there");
        assert_eq!(MAP_LEGEND[7].0, "WOULD BE REGENERATED");

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
        assert!(csv.lines().any(|l| l == "minecraft:overworld,16,16,256,256,r.0.0.mca,1,0,0,5000,0,,,0,untouched"));

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
        assert!(warnings.contains("claimed by Aria_Steele"));
        assert!(s.report.contains("[not the default]"));

        // unprotect= beats every layer and says so; protect= adds one.
        fs::write(fx.root.join(protection::POLICY_FILE), "unprotect=12,12\nprotect=16,16\n").unwrap();
        let s = fx.run("scope=all");
        assert_eq!((s.protected, s.targets), (17, 428)); // one out, one in
        let chunks = plan_chunks(&fx.plan(&s), OVERWORLD);
        assert!(chunks.contains(&(12, 12)) && !chunks.contains(&(16, 16)));
        let warnings = fs::read_to_string(s.out_dir.join("warnings.csv")).unwrap();
        assert!(warnings.contains("unprotect-overrides-a-layer,minecraft:overworld,12,12,,,,an unprotect= line removes the protection of bed+lived-in [bed of Aria_Steele]; it WOULD BE REGENERATED"), "{warnings}");
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
        assert_eq!((s.protected, s.targets), (16, 429)); // the waystone chunk is no longer kept
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
    fn only_waystones_players_use_are_kept_by_default() {
        let fx = Fixture::new();
        let world = fx.root.join("testworld");
        let aria_way = "00000005-0000-0006-0000-000700000008";
        write_waystones(&world, &[
            ([1, 2, 3, 4], "", OVERWORLD, (18 * 16 + 3, 70, 18 * 16 + 4), "PLAYER"),       // placed by a player
            ([5, 6, 7, 8], "Hearthome", OVERWORLD, (3 * 16, 70, 10 * 16), "VILLAGE"),      // generated, activated by Aria
            ([9, 9, 9, 9], "", OVERWORLD, (7 * 16, 70, 7 * 16), "WILDERNESS"),             // generated, used by nobody
        ]);
        write_player(&world, ARIA, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (88.5, 64.0, 90.5)), &[aria_way]));

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
        // Both dimensions: Silvie's Nether bed (chunk 0,0) keeps its 3x3, and the lived-in chunk stays.
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
        assert!(answer.starts_with("done: scope ring:3: 39 of 445 chunk(s) on disk would be regenerated, 17 protected"), "{answer}");
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
}
