//! The protection map: the chunks a world regeneration must never touch.
//!
//! Operator decision 2026-10-11 (Server Customizer, design draft section 4a):
//! protection is the **union of layers**, and every layer is reported on its
//! own so the operator can see what each one keeps.
//!
//! | Layer | What it keeps | Default |
//! |---|---|---|
//! | bed | each player's respawn chunk and the chunks around it | radius 1 = 3x3 (decided) |
//! | claim | every chunk claimed in Open Parties and Claims, server and expired claims included | on (decided) |
//! | spawn | the square of chunks within N blocks of world spawn (overworld) | 128 blocks (**proposed**) |
//! | waystone | chunks holding a waystone | every waystone the server knows (as briefed; see below) |
//! | lived-in | chunks whose `InhabitedTime` is at least N ticks | 12,000 = 10 min (**proposed**) |
//! | manual | boxes listed in the policy file | none |
//! | unreadable | chunks whose data could not be read | always: unknown is kept |
//!
//! The two proposed defaults, and why:
//!
//!   - **Spawn 128 blocks.** The pack treats 96 blocks around world spawn as
//!     "the village" (`spawn_village_protection.js`), blocks are protected
//!     within 32 (`spawn_protection.js`), and the priest tower is placed 30 to
//!     39 blocks out. 128 is that 96-block zone plus two chunks of margin:
//!     17x17 = 289 chunks.
//!   - **Lived-in 12,000 ticks.** `InhabitedTime` counts the ticks a chunk was
//!     loaded with a player **within 128 blocks** of it, not the time someone
//!     stood in it. Walking past adds about a minute, so ten minutes means
//!     someone stayed. On the live world that is 964 chunks; one hour would be
//!     303, one minute 5,082. The report prints this table for every run.
//!
//! One more thing to decide, flagged in the report: the live world's
//! `waystones.dat` lists 345 waystones in 210 chunks, 342 of them generated
//! with villages and towers. Keeping all of them (the default, as briefed)
//! leaves 210 single-chunk islands; `waystones=activated` keeps only the ones
//! a player has activated.
//!
//! Settings come from the defaults, then [`POLICY_FILE`] next to
//! server.properties (untracked, like `.icraft_restart_policy`), then the
//! run's own overrides. **A policy file that does not parse fails the run.**
//! Acting on a protection policy the operator did not write is the dangerous
//! side, so there is no falling back to defaults here.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use crate::anvil::{self, ChunkPos, DimensionScan, OVERWORLD};
use crate::worlddata::{ClaimOwner, LevelInfo, Player, Waystone};

/// Optional `key=value` lines, next to server.properties:
///
/// ```text
/// bed_radius=1              # chunks around each bed chunk (1 = 3x3) | off
/// claims=on                 # on | off
/// spawn_radius_blocks=128   # blocks around world spawn | off
/// waystones=all             # all | activated | off
/// waystone_radius=0         # chunks around each kept waystone
/// inhabited_min_ticks=12000 # lived-in threshold | off
/// inhabited_warn_ticks=1200 # report unprotected chunks at or above this
/// protect=170,227                          # always keep: one chunk,
/// protect=160,200..180,230                 #   a box of chunks (inclusive),
/// protect=10,12@minecraft:the_nether       #   in another dimension,
/// protect_blocks=2700,3600..2800,3700      #   or in block coordinates
/// unprotect=165,220                        # never keep, whatever the layers say
/// ```
pub const POLICY_FILE: &str = ".icraft_regen_policy";

/// Bed chunk + its 8 neighbours (operator decision 2026-10-11).
pub const BED_RADIUS: u32 = 1;
/// Proposed, flagged for the operator: see the module docs.
pub const SPAWN_RADIUS_BLOCKS: u32 = 128;
/// Proposed, flagged for the operator: see the module docs.
pub const INHABITED_MIN_TICKS: u64 = 12_000;
/// Unprotected chunks with at least this much `InhabitedTime` are listed as
/// warnings (one minute: more than walking past).
pub const INHABITED_WARN_TICKS: u64 = 1_200;
pub const WAYSTONE_RADIUS: u32 = 0;

const MAX_RADIUS_CHUNKS: u32 = 64;
const MAX_SPAWN_RADIUS_BLOCKS: u32 = 4096;

// =============================================================================
// Layers
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Layer {
    Bed,
    Claim,
    Spawn,
    Waystone,
    LivedIn,
    Manual,
    Unreadable,
}

impl Layer {
    pub const ALL: [Layer; 7] =
        [Layer::Bed, Layer::Claim, Layer::Spawn, Layer::Waystone, Layer::LivedIn, Layer::Manual, Layer::Unreadable];

    pub fn bit(self) -> u8 {
        1 << (self as u8)
    }

    pub fn name(self) -> &'static str {
        match self {
            Layer::Bed => "bed",
            Layer::Claim => "claim",
            Layer::Spawn => "spawn",
            Layer::Waystone => "waystone",
            Layer::LivedIn => "lived-in",
            Layer::Manual => "manual",
            Layer::Unreadable => "unreadable",
        }
    }
}

/// `bed+spawn+lived-in`
pub fn layer_names(bits: u8) -> String {
    let names: Vec<&str> = Layer::ALL.iter().filter(|l| bits & l.bit() != 0).map(|l| l.name()).collect();
    names.join("+")
}

// =============================================================================
// Settings
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaystoneMode {
    /// Every waystone in `waystones.dat`.
    All,
    /// Only waystones at least one player has activated, and global ones.
    Activated,
    Off,
}

/// An inclusive box of chunks in one dimension.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChunkBox {
    pub dim: String,
    pub x1: i32,
    pub z1: i32,
    pub x2: i32,
    pub z2: i32,
}

impl ChunkBox {
    /// `x,z` or `x1,z1..x2,z2`, optionally followed by `@<dimension>` (the
    /// overworld otherwise). With `blocks`, the numbers are block coordinates
    /// and the box is every chunk they touch.
    pub fn parse(text: &str, blocks: bool) -> Result<Self, String> {
        let (coords, dim) = match text.split_once('@') {
            Some((c, d)) if !d.trim().is_empty() => (c, d.trim()),
            Some(_) => return Err(format!("'{text}': nothing after '@'")),
            None => (text, OVERWORLD),
        };
        let pair = |s: &str| -> Result<(i32, i32), String> {
            let (x, z) = s.split_once(',').ok_or_else(|| format!("'{text}': expected x,z"))?;
            let n = |v: &str| v.trim().parse::<i32>().map_err(|_| format!("'{text}': '{}' is not a whole number", v.trim()));
            let (x, z) = (n(x)?, n(z)?);
            Ok(if blocks { (x >> 4, z >> 4) } else { (x, z) })
        };
        let (a, b) = match coords.split_once("..") {
            Some((a, b)) => (pair(a)?, pair(b)?),
            None => (pair(coords)?, pair(coords)?),
        };
        Ok(ChunkBox { dim: dim.to_string(), x1: a.0.min(b.0), z1: a.1.min(b.1), x2: a.0.max(b.0), z2: a.1.max(b.1) })
    }

    pub fn contains(&self, dim: &str, pos: ChunkPos) -> bool {
        self.dim == dim && (self.x1..=self.x2).contains(&pos.0) && (self.z1..=self.z2).contains(&pos.1)
    }

    fn overlaps(&self, other: &ChunkBox) -> bool {
        self.dim == other.dim && self.x1 <= other.x2 && other.x1 <= self.x2 && self.z1 <= other.z2 && other.z1 <= self.z2
    }
}

impl std::fmt::Display for ChunkBox {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{},{}", self.x1, self.z1)?;
        if (self.x1, self.z1) != (self.x2, self.z2) {
            write!(f, "..{},{}", self.x2, self.z2)?;
        }
        if self.dim != OVERWORLD {
            write!(f, "@{}", self.dim)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    /// Chunks around each bed chunk. `None` = the layer is off.
    pub bed_radius: Option<u32>,
    pub claims: bool,
    /// Blocks around world spawn. `None` = the layer is off.
    pub spawn_radius_blocks: Option<u32>,
    pub waystones: WaystoneMode,
    pub waystone_radius: u32,
    /// `InhabitedTime` at or above which a chunk is kept. `None` = off.
    pub inhabited_min_ticks: Option<u64>,
    pub inhabited_warn_ticks: u64,
    pub protect: Vec<ChunkBox>,
    pub unprotect: Vec<ChunkBox>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            bed_radius: Some(BED_RADIUS),
            claims: true,
            spawn_radius_blocks: Some(SPAWN_RADIUS_BLOCKS),
            waystones: WaystoneMode::All,
            waystone_radius: WAYSTONE_RADIUS,
            inhabited_min_ticks: Some(INHABITED_MIN_TICKS),
            inhabited_warn_ticks: INHABITED_WARN_TICKS,
            protect: Vec::new(),
            unprotect: Vec::new(),
        }
    }
}

fn number(key: &str, value: &str, max: u64) -> Result<u64, String> {
    let n: u64 = value.parse().map_err(|_| format!("{key}={value}: not a whole number"))?;
    if n > max {
        return Err(format!("{key}={value}: the most this takes is {max}"));
    }
    Ok(n)
}

fn number_or_off(key: &str, value: &str, max: u64) -> Result<Option<u64>, String> {
    if value == "off" {
        return Ok(None);
    }
    number(key, value, max).map(Some)
}

impl Settings {
    /// Set one `key=value`. The keys of [`POLICY_FILE`]; also what a request
    /// file and the CLI's `--set` pass through.
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        let lower = value.to_ascii_lowercase();
        match key.as_str() {
            "bed_radius" => {
                self.bed_radius = number_or_off(&key, &lower, u64::from(MAX_RADIUS_CHUNKS))?.map(|n| n as u32);
            }
            "claims" => {
                self.claims = match lower.as_str() {
                    "on" => true,
                    "off" => false,
                    _ => return Err(format!("{key}={value}: on or off")),
                }
            }
            "spawn_radius_blocks" => {
                self.spawn_radius_blocks = number_or_off(&key, &lower, u64::from(MAX_SPAWN_RADIUS_BLOCKS))?.map(|n| n as u32);
            }
            "waystones" => {
                self.waystones = match lower.as_str() {
                    "all" => WaystoneMode::All,
                    "activated" => WaystoneMode::Activated,
                    "off" => WaystoneMode::Off,
                    _ => return Err(format!("{key}={value}: all, activated or off")),
                }
            }
            "waystone_radius" => self.waystone_radius = number(&key, &lower, u64::from(MAX_RADIUS_CHUNKS))? as u32,
            "inhabited_min_ticks" => self.inhabited_min_ticks = number_or_off(&key, &lower, i64::MAX as u64)?,
            "inhabited_warn_ticks" => self.inhabited_warn_ticks = number(&key, &lower, i64::MAX as u64)?,
            "protect" => self.protect.push(ChunkBox::parse(value, false)?),
            "protect_blocks" => self.protect.push(ChunkBox::parse(value, true)?),
            "unprotect" => self.unprotect.push(ChunkBox::parse(value, false)?),
            "unprotect_blocks" => self.unprotect.push(ChunkBox::parse(value, true)?),
            _ => return Err(format!("{key}: unknown setting")),
        }
        Ok(())
    }

    /// Apply the lines of a policy file.
    pub fn apply_policy(&mut self, body: &str) -> Result<(), String> {
        for raw in body.lines() {
            // A BOM survives the read; PowerShell 5.1 writes one.
            let line = raw.trim_start_matches('\u{feff}').split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let (key, value) = line.split_once('=').ok_or_else(|| format!("'{line}' is not key=value"))?;
            self.set(key, value)?;
        }
        Ok(())
    }

    /// The defaults with [`POLICY_FILE`] applied, and the file's text when
    /// there is one. `Err` = the file is unreadable or has a line that does
    /// not parse.
    pub fn load(server_dir: &Path) -> Result<(Self, Option<String>), String> {
        let mut settings = Self::default();
        match anvil::read_shared(&server_dir.join(POLICY_FILE), 1 << 20) {
            Ok(raw) => {
                let body = String::from_utf8_lossy(&raw).into_owned();
                settings.apply_policy(&body).map_err(|e| format!("{POLICY_FILE}: {e}"))?;
                Ok((settings, Some(body)))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok((settings, None)),
            Err(e) => Err(format!("{POLICY_FILE}: unreadable ({e})")),
        }
    }

    /// A chunk cannot be on both manual lists: which one was meant?
    pub fn validate(&self) -> Result<(), String> {
        for keep in &self.protect {
            if let Some(drop) = self.unprotect.iter().find(|u| keep.overlaps(u)) {
                return Err(format!("protect={keep} and unprotect={drop} overlap: a chunk cannot be on both lists"));
            }
        }
        Ok(())
    }

    /// The settings as the `key=value` pairs [`Settings::set`] reads back, so
    /// a plan can record exactly what it was computed with.
    pub fn to_pairs(&self) -> Vec<(String, String)> {
        let or_off = |v: Option<u64>| v.map_or("off".to_string(), |n| n.to_string());
        let waystones = match self.waystones {
            WaystoneMode::All => "all",
            WaystoneMode::Activated => "activated",
            WaystoneMode::Off => "off",
        };
        let claims = if self.claims { "on" } else { "off" };
        let mut out = vec![
            ("bed_radius".to_string(), or_off(self.bed_radius.map(u64::from))),
            ("claims".to_string(), claims.to_string()),
            ("spawn_radius_blocks".to_string(), or_off(self.spawn_radius_blocks.map(u64::from))),
            ("waystones".to_string(), waystones.to_string()),
            ("waystone_radius".to_string(), self.waystone_radius.to_string()),
            ("inhabited_min_ticks".to_string(), or_off(self.inhabited_min_ticks)),
            ("inhabited_warn_ticks".to_string(), self.inhabited_warn_ticks.to_string()),
        ];
        out.extend(self.protect.iter().map(|b| ("protect".to_string(), b.to_string())));
        out.extend(self.unprotect.iter().map(|b| ("unprotect".to_string(), b.to_string())));
        out
    }

    /// `(setting, value, is it the default)` rows for the report.
    pub fn describe(&self) -> Vec<(&'static str, String, bool)> {
        let d = Self::default();
        let or_off = |v: Option<u64>, unit: &str| v.map_or("off".to_string(), |n| format!("{n} {unit}"));
        let boxes = |b: &[ChunkBox]| {
            if b.is_empty() {
                "none".to_string()
            } else {
                b.iter().map(ChunkBox::to_string).collect::<Vec<_>>().join("  ")
            }
        };
        vec![
            (
                "bed_radius",
                self.bed_radius.map_or("off".to_string(), |r| format!("{r} chunk(s): {0}x{0} around each bed chunk", 2 * r + 1)),
                self.bed_radius == d.bed_radius,
            ),
            ("claims", if self.claims { "on" } else { "off" }.to_string(), self.claims == d.claims),
            (
                "spawn_radius_blocks",
                or_off(self.spawn_radius_blocks.map(u64::from), "blocks around world spawn"),
                self.spawn_radius_blocks == d.spawn_radius_blocks,
            ),
            (
                "waystones",
                match self.waystones {
                    WaystoneMode::All => "all (every waystone the server knows)",
                    WaystoneMode::Activated => "activated (only waystones a player has activated, and global ones)",
                    WaystoneMode::Off => "off",
                }
                .to_string(),
                self.waystones == d.waystones,
            ),
            ("waystone_radius", format!("{} chunk(s)", self.waystone_radius), self.waystone_radius == d.waystone_radius),
            (
                "inhabited_min_ticks",
                self.inhabited_min_ticks.map_or("off".to_string(), |t| format!("{t} ticks ({})", fmt_ticks(t as i64))),
                self.inhabited_min_ticks == d.inhabited_min_ticks,
            ),
            (
                "inhabited_warn_ticks",
                format!("{} ticks ({})", self.inhabited_warn_ticks, fmt_ticks(self.inhabited_warn_ticks as i64)),
                self.inhabited_warn_ticks == d.inhabited_warn_ticks,
            ),
            ("protect", boxes(&self.protect), self.protect.is_empty()),
            ("unprotect", boxes(&self.unprotect), self.unprotect.is_empty()),
        ]
    }
}

/// Game ticks as time: `40 s`, `12.5 min`, `85.6 h` (20 ticks a second).
pub fn fmt_ticks(ticks: i64) -> String {
    let secs = ticks as f64 / 20.0;
    if secs >= 3600.0 {
        format!("{:.1} h", secs / 3600.0)
    } else if secs >= 60.0 {
        format!("{:.1} min", secs / 60.0)
    } else {
        format!("{secs:.0} s")
    }
}

// =============================================================================
// The map
// =============================================================================

/// Why one chunk is kept.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Protected {
    /// [`Layer::bit`]s.
    pub layers: u8,
    /// Whose bed, whose claim, which waystone.
    pub why: Vec<String>,
}

impl Protected {
    pub fn has(&self, layer: Layer) -> bool {
        self.layers & layer.bit() != 0
    }
}

#[derive(Debug, Clone, Default)]
pub struct DimProtection {
    /// Every protected chunk position of the dimension, on disk or not.
    pub chunks: BTreeMap<ChunkPos, Protected>,
    /// Positions an `unprotect` box took back out, with what had kept them.
    pub overridden: BTreeMap<ChunkPos, Protected>,
}

impl DimProtection {
    pub fn is_protected(&self, pos: ChunkPos) -> bool {
        self.chunks.contains_key(&pos)
    }

    pub fn layers_at(&self, pos: ChunkPos) -> u8 {
        self.chunks.get(&pos).map_or(0, |p| p.layers)
    }
}

/// What the layers are computed from.
pub struct Sources<'a> {
    pub level: &'a LevelInfo,
    pub players: &'a [Player],
    pub claims: &'a [ClaimOwner],
    pub waystones: &'a [Waystone],
}

impl<'a> Sources<'a> {
    /// UUIDs of the waystones at least one player has activated.
    pub fn activated_waystones(&self) -> BTreeSet<&'a str> {
        self.players.iter().flat_map(|p| p.waystones.iter().map(String::as_str)).collect()
    }
}

fn add(map: &mut BTreeMap<ChunkPos, Protected>, pos: ChunkPos, layer: Layer, why: Option<&str>) {
    let entry = map.entry(pos).or_default();
    entry.layers |= layer.bit();
    if let Some(why) = why {
        if !entry.why.iter().any(|w| w == why) {
            entry.why.push(why.to_string());
        }
    }
}

fn add_square(map: &mut BTreeMap<ChunkPos, Protected>, centre: ChunkPos, radius: u32, layer: Layer, why: Option<&str>) {
    let r = radius.min(MAX_RADIUS_CHUNKS) as i32;
    for dx in -r..=r {
        for dz in -r..=r {
            add(map, (centre.0.saturating_add(dx), centre.1.saturating_add(dz)), layer, why);
        }
    }
}

/// The chunks a square of `radius` blocks around a block position touches.
pub fn block_square_chunks(x: i32, z: i32, radius: u32) -> (ChunkPos, ChunkPos) {
    let clamp = |v: i64| v.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
    let (x, z, r) = (i64::from(x), i64::from(z), i64::from(radius));
    ((clamp((x - r) >> 4), clamp((z - r) >> 4)), (clamp((x + r) >> 4), clamp((z + r) >> 4)))
}

/// Build one dimension's protection map.
pub fn build(dim: &str, sources: &Sources, settings: &Settings, scan: &DimensionScan) -> DimProtection {
    let mut chunks: BTreeMap<ChunkPos, Protected> = BTreeMap::new();

    if let Some(radius) = settings.bed_radius {
        for player in sources.players {
            if let Some(bed) = player.bed.as_ref().filter(|b| b.dim == dim) {
                add_square(&mut chunks, bed.pos.chunk(), radius, Layer::Bed, Some(&format!("bed of {}", player.label())));
            }
        }
    }

    if settings.claims {
        for owner in sources.claims {
            let why = format!("claim: {}", owner.label());
            for claim in owner.claims.iter().filter(|c| c.dim == dim) {
                add(&mut chunks, claim.chunk, Layer::Claim, Some(&why));
            }
        }
    }

    if let (Some(radius), true) = (settings.spawn_radius_blocks, dim == OVERWORLD) {
        let (min, max) = block_square_chunks(sources.level.spawn.x, sources.level.spawn.z, radius.min(MAX_SPAWN_RADIUS_BLOCKS));
        for x in min.0..=max.0 {
            for z in min.1..=max.1 {
                add(&mut chunks, (x, z), Layer::Spawn, None);
            }
        }
    }

    if settings.waystones != WaystoneMode::Off {
        let activated = sources.activated_waystones();
        for w in sources.waystones.iter().filter(|w| w.dim == dim) {
            if settings.waystones == WaystoneMode::All || w.global || activated.contains(w.uid.as_str()) {
                add_square(&mut chunks, w.pos.chunk(), settings.waystone_radius, Layer::Waystone, Some(&format!("waystone {}", w.label())));
            }
        }
    }

    for (pos, entry) in &scan.chunks {
        if let (Some(min), Some(ticks)) = (settings.inhabited_min_ticks, entry.inhabited) {
            if ticks >= 0 && ticks as u64 >= min {
                add(&mut chunks, *pos, Layer::LivedIn, None);
            }
        }
        // A chunk that cannot be read cannot be shown to be empty of anything.
        if entry.unreadable.is_some() {
            add(&mut chunks, *pos, Layer::Unreadable, None);
        }
        if settings.protect.iter().any(|b| b.contains(dim, *pos)) {
            add(&mut chunks, *pos, Layer::Manual, None);
        }
    }

    let mut overridden = BTreeMap::new();
    if !settings.unprotect.is_empty() {
        let hit: Vec<ChunkPos> =
            chunks.keys().copied().filter(|pos| settings.unprotect.iter().any(|b| b.contains(dim, *pos))).collect();
        for pos in hit {
            if let Some(was) = chunks.remove(&pos) {
                overridden.insert(pos, was);
            }
        }
    }
    DimProtection { chunks, overridden }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worlddata::{Bed, BlockPos, Claim};

    const NETHER: &str = "minecraft:the_nether";

    fn level(spawn: (i32, i32)) -> LevelInfo {
        LevelInfo {
            spawn: BlockPos { x: spawn.0, y: 64, z: spawn.1 },
            seed: None,
            data_version: None,
            version_name: None,
            last_played_ms: None,
            from_old: false,
        }
    }

    fn player(name: &str, bed: Option<(&str, (i32, i32))>, waystones: &[&str]) -> Player {
        Player {
            uuid: format!("uuid-of-{name}"),
            name: Some(name.to_string()),
            bed: bed.map(|(dim, (x, z))| Bed { dim: dim.to_string(), pos: BlockPos { x, y: 64, z }, forced: false }),
            last_pos: None,
            waystones: waystones.iter().map(|w| w.to_string()).collect(),
            from_old: false,
        }
    }

    fn waystone(uid: &str, dim: &str, at: (i32, i32)) -> Waystone {
        Waystone {
            uid: uid.to_string(),
            name: String::new(),
            dim: dim.to_string(),
            pos: BlockPos { x: at.0, y: 64, z: at.1 },
            origin: "VILLAGE".to_string(),
            global: false,
        }
    }

    fn only(layer: Layer) -> Settings {
        let mut s = Settings {
            bed_radius: None,
            claims: false,
            spawn_radius_blocks: None,
            waystones: WaystoneMode::Off,
            inhabited_min_ticks: None,
            ..Settings::default()
        };
        match layer {
            Layer::Bed => s.bed_radius = Some(1),
            Layer::Claim => s.claims = true,
            Layer::Spawn => s.spawn_radius_blocks = Some(128),
            Layer::Waystone => s.waystones = WaystoneMode::All,
            Layer::LivedIn => s.inhabited_min_ticks = Some(12_000),
            Layer::Manual | Layer::Unreadable => {}
        }
        s
    }

    #[test]
    fn the_defaults_are_the_operators_decisions_and_the_flagged_proposals() {
        let s = Settings::default();
        assert_eq!(s.bed_radius, Some(1));
        assert!(s.claims);
        assert_eq!(s.spawn_radius_blocks, Some(128));
        assert_eq!(s.waystones, WaystoneMode::All);
        assert_eq!(s.inhabited_min_ticks, Some(12_000));
        assert!(s.protect.is_empty() && s.unprotect.is_empty());
        assert!(s.describe().iter().all(|(_, _, is_default)| *is_default));
        assert_eq!(Layer::ALL.iter().map(|l| l.bit()).sum::<u8>(), 127);
        assert_eq!(layer_names(Layer::Bed.bit() | Layer::LivedIn.bit() | Layer::Spawn.bit()), "bed+spawn+lived-in");
        assert_eq!((fmt_ticks(800), fmt_ticks(12_000), fmt_ticks(6_166_097)), ("40 s".to_string(), "10.0 min".to_string(), "85.6 h".to_string()));
    }

    #[test]
    fn policy_lines_set_every_knob() {
        let mut s = Settings::default();
        s.apply_policy(
            "\u{feff}# regen policy\r\n\
             bed_radius = 2\r\n\
             claims=OFF   # for a test\r\n\
             spawn_radius_blocks=off\n\
             waystones=Activated\n\
             waystone_radius=1\n\
             inhabited_min_ticks=72000\n\
             inhabited_warn_ticks=6000\n\
             \n\
             protect=170,227\n\
             protect=180,230..160,200\n\
             protect=10,12@minecraft:the_nether\n\
             protect_blocks=2700,3600..2800,3700\n\
             unprotect=-5,-6\n\
             unprotect_blocks=-1,-1\n",
        )
        .unwrap();
        assert_eq!(s.bed_radius, Some(2));
        assert!(!s.claims);
        assert_eq!(s.spawn_radius_blocks, None);
        assert_eq!(s.waystones, WaystoneMode::Activated);
        assert_eq!(s.waystone_radius, 1);
        assert_eq!(s.inhabited_min_ticks, Some(72_000));
        assert_eq!(s.inhabited_warn_ticks, 6_000);
        let shown: Vec<String> = s.protect.iter().map(ChunkBox::to_string).collect();
        assert_eq!(shown, vec!["170,227", "160,200..180,230", "10,12@minecraft:the_nether", "168,225..175,231"]);
        let shown: Vec<String> = s.unprotect.iter().map(ChunkBox::to_string).collect();
        assert_eq!(shown, vec!["-5,-6", "-1,-1"]);
        assert!(s.validate().is_ok());
        assert!(s.protect[1].contains(OVERWORLD, (160, 230)) && !s.protect[1].contains(OVERWORLD, (159, 230)));
        assert!(!s.protect[1].contains(NETHER, (170, 210)));
        assert!(s.protect[2].contains(NETHER, (10, 12)));
        assert!(s.describe().iter().filter(|(_, _, is_default)| !*is_default).count() >= 8);

        // What a plan records reproduces the settings exactly.
        let mut again = Settings::default();
        for (key, value) in s.to_pairs() {
            again.set(&key, &value).unwrap();
        }
        assert_eq!(again, s);

        let mut s = Settings::default();
        s.set("inhabited_min_ticks", "off").unwrap();
        s.set("bed_radius", "off").unwrap();
        assert_eq!((s.inhabited_min_ticks, s.bed_radius), (None, None));
        let mut again = Settings::default();
        for (key, value) in s.to_pairs() {
            again.set(&key, &value).unwrap();
        }
        assert_eq!(again, s);
    }

    #[test]
    fn a_policy_that_does_not_parse_is_refused() {
        for bad in [
            "bed_radius",
            "bed_radius=two",
            "bed_radius=-1",
            "bed_radius=65",
            "spawn_radius_blocks=999999",
            "claims=maybe",
            "waystones=some",
            "inhabited_min_ticks=10 minutes",
            "protect=170",
            "protect=170,227..",
            "protect=1,2@",
            "protect=a,b",
            "unprotect=1.5,2",
            "radius=3",
        ] {
            assert!(Settings::default().apply_policy(bad).is_err(), "{bad}");
        }
        // A chunk on both manual lists.
        let mut s = Settings::default();
        s.apply_policy("protect=0,0..10,10\nunprotect=10,10..20,20").unwrap();
        assert!(s.validate().is_err());
        let mut s = Settings::default();
        s.apply_policy("protect=0,0..10,10\nunprotect=10,10..20,20@minecraft:the_nether\nunprotect=11,0").unwrap();
        assert!(s.validate().is_ok());
    }

    #[test]
    fn the_policy_file_is_optional_and_strict() {
        let dir = std::env::temp_dir().join(format!("icraft-protection-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(Settings::load(&dir), Ok((Settings::default(), None)));
        std::fs::write(dir.join(POLICY_FILE), "inhabited_min_ticks=72000\n").unwrap();
        let (s, body) = Settings::load(&dir).unwrap();
        assert_eq!(s.inhabited_min_ticks, Some(72_000));
        assert_eq!(body.as_deref(), Some("inhabited_min_ticks=72000\n"));
        std::fs::write(dir.join(POLICY_FILE), "inhabited_min_ticks=lots\n").unwrap();
        let err = Settings::load(&dir).unwrap_err();
        assert!(err.contains(POLICY_FILE) && err.contains("lots"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bed_layer_is_the_bed_chunk_and_its_neighbours() {
        // The live world's three beds.
        let players = [
            player("Aria_Steele", Some((OVERWORLD, (2735, 3640))), &[]),
            player("Falendria", Some((OVERWORLD, (2670, 3641))), &[]),
            player("silvieserene", Some((OVERWORLD, (2772, 3340))), &[]),
            player("visitor", None, &[]),
            player("netherite", Some((NETHER, (5, 5))), &[]),
        ];
        let lv = level((0, 0));
        let sources = Sources { level: &lv, players: &players, claims: &[], waystones: &[] };
        let scan = DimensionScan::default();
        let map = build(OVERWORLD, &sources, &only(Layer::Bed), &scan);
        assert_eq!(map.chunks.len(), 27);
        for centre in [(170, 227), (166, 227), (173, 208)] {
            for dx in -1..=1 {
                for dz in -1..=1 {
                    assert_eq!(map.layers_at((centre.0 + dx, centre.1 + dz)), Layer::Bed.bit());
                }
            }
            assert!(!map.is_protected((centre.0 + 2, centre.1)) && !map.is_protected((centre.0, centre.1 - 2)));
        }
        assert!(!map.is_protected((168, 227)), "between two 3x3 squares, in neither");
        assert_eq!(map.chunks[&(170, 227)].why, vec!["bed of Aria_Steele".to_string()]);
        // Radius 0 = the bed chunk alone; radius 2 = 5x5; the Nether bed is the Nether's.
        let mut s = only(Layer::Bed);
        s.bed_radius = Some(0);
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.len(), 3);
        s.bed_radius = Some(2);
        let wide = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(wide.chunks.len(), 25 + 25 + 25 - 5, "Aria's and Falendria's 5x5 share one column");
        assert_eq!(wide.chunks[&(168, 227)].why.len(), 2);
        let nether = build(NETHER, &sources, &only(Layer::Bed), &scan);
        assert_eq!(nether.chunks.len(), 9);
        assert!(nether.is_protected((0, 0)) && nether.is_protected((-1, -1)) && !nether.is_protected((2, 2)));
    }

    #[test]
    fn claims_spawn_and_waystones() {
        let lv = level((2720, 3632));
        let owners = [
            ClaimOwner {
                uuid: "u1".to_string(),
                name: "Aria_Steele".to_string(),
                claims: vec![
                    Claim { dim: OVERWORLD.to_string(), chunk: (10, 10), forceloaded: false },
                    Claim { dim: NETHER.to_string(), chunk: (1, 1), forceloaded: true },
                ],
            },
            ClaimOwner {
                uuid: crate::worlddata::OPAC_SERVER_UUID.to_string(),
                name: "\"Server\"".to_string(),
                claims: vec![Claim { dim: OVERWORLD.to_string(), chunk: (10, 10), forceloaded: false }],
            },
        ];
        let players = [player("Aria_Steele", None, &["way-b"])];
        let waystones = [waystone("way-a", OVERWORLD, (-783, -1838)), waystone("way-b", OVERWORLD, (40, 40)), waystone("way-c", NETHER, (0, 0))];
        let sources = Sources { level: &lv, players: &players, claims: &owners, waystones: &waystones };
        let scan = DimensionScan::default();

        let claims = build(OVERWORLD, &sources, &only(Layer::Claim), &scan);
        assert_eq!(claims.chunks.len(), 1);
        assert_eq!(claims.chunks[&(10, 10)].why, vec!["claim: Aria_Steele".to_string(), "claim: server claims".to_string()]);
        assert_eq!(build(NETHER, &sources, &only(Layer::Claim), &scan).chunks.len(), 1);

        // Spawn at block (2720, 3632) = chunk (170, 227); 128 blocks = 8 chunks each way.
        let spawn = build(OVERWORLD, &sources, &only(Layer::Spawn), &scan);
        assert_eq!(spawn.chunks.len(), 17 * 17);
        assert!(spawn.is_protected((162, 219)) && spawn.is_protected((178, 235)));
        assert!(!spawn.is_protected((161, 227)) && !spawn.is_protected((170, 236)));
        assert_eq!(build(NETHER, &sources, &only(Layer::Spawn), &scan).chunks.len(), 0, "world spawn is an overworld thing");
        assert_eq!(block_square_chunks(2720, 3632, 96), ((164, 221), (176, 233)));
        assert_eq!(block_square_chunks(0, 0, 32), ((-2, -2), (2, 2)));
        assert_eq!(block_square_chunks(-1, 15, 0), ((-1, 0), (-1, 0)));

        let all = build(OVERWORLD, &sources, &only(Layer::Waystone), &scan);
        assert_eq!(all.chunks.keys().copied().collect::<Vec<_>>(), vec![(-49, -115), (2, 2)]);
        let mut s = only(Layer::Waystone);
        s.waystones = WaystoneMode::Activated;
        let activated = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(activated.chunks.keys().copied().collect::<Vec<_>>(), vec![(2, 2)]);
        s.waystone_radius = 1;
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.len(), 9);
        s.waystones = WaystoneMode::Off;
        assert!(build(OVERWORLD, &sources, &s, &scan).chunks.is_empty());
    }

    #[test]
    fn lived_in_unreadable_manual_and_the_union() {
        let lv = level((0, 0));
        let players = [player("Aria_Steele", Some((OVERWORLD, (8, 8))), &[])];
        let sources = Sources { level: &lv, players: &players, claims: &[], waystones: &[] };
        let scan = anvil::testing::scan_of(&[
            ((0, 0), Some(6_166_097), None),
            ((5, 5), Some(12_000), None),
            ((5, 6), Some(11_999), None),
            ((5, 7), None, None),
            ((9, 9), Some(0), Some("its NBT does not read")),
            ((20, 20), Some(0), None),
            ((21, 20), Some(50_000), None),
        ]);

        let lived = build(OVERWORLD, &sources, &only(Layer::LivedIn), &scan);
        assert_eq!(lived.chunks.keys().copied().collect::<Vec<_>>(), vec![(0, 0), (5, 5), (9, 9), (21, 20)]);
        assert_eq!(lived.layers_at((5, 5)), Layer::LivedIn.bit());
        assert_eq!(lived.layers_at((9, 9)), Layer::Unreadable.bit(), "unknown is kept, whatever the settings");
        let mut hour = only(Layer::LivedIn);
        hour.inhabited_min_ticks = Some(72_000);
        assert_eq!(build(OVERWORLD, &sources, &hour, &scan).chunks.keys().copied().collect::<Vec<_>>(), vec![(0, 0), (9, 9)]);

        // Everything on: layers add up on a chunk, and each is still visible.
        let mut s = Settings::default();
        s.spawn_radius_blocks = Some(16);
        s.set("protect", "20,20..30,30").unwrap();
        let map = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(layer_names(map.layers_at((0, 0))), "bed+spawn+lived-in");
        assert_eq!(layer_names(map.layers_at((1, 1))), "bed+spawn");
        assert_eq!(layer_names(map.layers_at((20, 20))), "manual");
        assert_eq!(layer_names(map.layers_at((21, 20))), "lived-in+manual");
        assert!(!map.is_protected((22, 20)), "a protect box only covers chunks that exist");
        assert!(!map.is_protected((5, 6)));
        assert!(map.overridden.is_empty());

        // unprotect wins over every layer, and what it overrode is kept on record.
        s.set("unprotect", "0,0").unwrap();
        s.set("unprotect", "9,9").unwrap();
        let map = build(OVERWORLD, &sources, &s, &scan);
        assert!(!map.is_protected((0, 0)) && !map.is_protected((9, 9)));
        assert!(map.is_protected((1, 1)));
        assert_eq!(layer_names(map.overridden[&(0, 0)].layers), "bed+spawn+lived-in");
        assert_eq!(layer_names(map.overridden[&(9, 9)].layers), "unreadable");
        assert_eq!(map.overridden.len(), 2);
    }
}
