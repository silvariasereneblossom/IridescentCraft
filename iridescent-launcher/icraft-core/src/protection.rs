//! The protection map: the chunks a world regeneration must never touch.
//!
//! Operator decision 2026-10-11 (Server Customizer, design draft section 4a):
//! protection is the **union of layers**, and every layer is reported on its
//! own so the operator can see what each one keeps.
//!
//! | Layer | What it keeps | Default |
//! |---|---|---|
//! | bed | each player's respawn chunk and the chunks around it | radius 1 = 3x3 |
//! | logout | the chunk each player logged out in and the chunks around it, in that dimension | radius 1 = 3x3 |
//! | claim | every chunk claimed in Open Parties and Claims, server and expired claims included | on |
//! | spawn | the square of chunks within N blocks of world spawn (overworld) | 128 blocks |
//! | waystone | chunks holding a waystone a player has activated or placed | `used` |
//! | lived-in | chunks whose `InhabitedTime` is at least N ticks | 12,000 = 10 min |
//! | manual | boxes listed in the policy file | none |
//! | unreadable | chunks whose data could not be read | always: unknown is kept |
//!
//! Every default is the operator's (rulings of 2026-10-11, the last three
//! relayed through the planning session the same day), and each can be changed
//! per run or in the policy file. Why they are what they are:
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
//!   - **Waystones a player has activated or placed.** `waystones.dat` lists
//!     every waystone the server ever generated: 345 in 210 chunks on the live
//!     world, 3 of them placed by a player and 12 activated by anyone. Keeping
//!     all of them (`waystones=all`, still available) leaves 200 single-chunk
//!     islands of old terrain; keeping the ones players use does not.
//!   - **Logout spots 3x3** (operator ruling 2026-10-22, backlog G5: "Each
//!     player's logout chunk and the 3x3 around it are kept automatically").
//!     A player who logged out in reset terrain would come back inside fresh
//!     terrain, possibly inside stone. Until this layer the run was refused
//!     for it, which cost a new dry-run and a new code at the box; the
//!     refusal stays in `regen::exec` as the backstop (the layer off, or an
//!     `unprotect` box over the spot). The position is the player file's
//!     `Pos` and `Dimension`, read for nothing else: the layer names no one.
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
/// logout_radius=1           # chunks around each logout chunk (1 = 3x3) | off
/// claims=on                 # on | off
/// spawn_radius_blocks=128   # blocks around world spawn | off
/// waystones=used            # used (activated or placed by a player) | all | off
/// waystone_radius=0         # chunks around each kept waystone
/// inhabited_min_ticks=12000 # lived-in threshold | off
/// inhabited_warn_ticks=1200 # report unprotected chunks at or above this
/// protect=42,67                            # always keep: one chunk,
/// protect=32,40..52,70                     #   a box of chunks (inclusive),
/// protect=10,12@minecraft:the_nether       #   in another dimension,
/// protect_blocks=652,1040..752,1140        #   or in block coordinates
/// unprotect=37,60                          # never keep, whatever the layers say
/// ```
pub const POLICY_FILE: &str = ".icraft_regen_policy";

/// Bed chunk + its 8 neighbours (operator decision 2026-10-11).
pub const BED_RADIUS: u32 = 1;
/// Logout chunk + its 8 neighbours (operator ruling 2026-10-22, G5).
pub const LOGOUT_RADIUS: u32 = 1;
/// Operator decision 2026-10-11: see the module docs.
pub const SPAWN_RADIUS_BLOCKS: u32 = 128;
/// Operator decision 2026-10-11: see the module docs.
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
    Logout,
    Claim,
    Spawn,
    Waystone,
    LivedIn,
    Manual,
    Unreadable,
}

impl Layer {
    /// One bit each in a `u8`: eight is all there is room for.
    pub const COUNT: usize = 8;
    pub const ALL: [Layer; Layer::COUNT] = [
        Layer::Bed,
        Layer::Logout,
        Layer::Claim,
        Layer::Spawn,
        Layer::Waystone,
        Layer::LivedIn,
        Layer::Manual,
        Layer::Unreadable,
    ];

    pub fn bit(self) -> u8 {
        1 << (self as u8)
    }

    pub fn name(self) -> &'static str {
        match self {
            Layer::Bed => "bed",
            Layer::Logout => "logout",
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
    /// Waystones a player has activated or placed, and global ones. The
    /// default (operator decision 2026-10-11).
    Used,
    /// Every waystone in `waystones.dat`, generated ones included.
    All,
    Off,
}

impl WaystoneMode {
    /// The word the policy file uses.
    pub fn keyword(self) -> &'static str {
        match self {
            WaystoneMode::Used => "used",
            WaystoneMode::All => "all",
            WaystoneMode::Off => "off",
        }
    }
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
    /// Chunks around each logout chunk. `None` = the layer is off.
    pub logout_radius: Option<u32>,
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
            logout_radius: Some(LOGOUT_RADIUS),
            claims: true,
            spawn_radius_blocks: Some(SPAWN_RADIUS_BLOCKS),
            waystones: WaystoneMode::Used,
            waystone_radius: WAYSTONE_RADIUS,
            inhabited_min_ticks: Some(INHABITED_MIN_TICKS),
            inhabited_warn_ticks: INHABITED_WARN_TICKS,
            protect: Vec::new(),
            unprotect: Vec::new(),
        }
    }
}

/// A list of boxes, one per line (`x,z` or `x1,z1..x2,z2`, optionally
/// `@<dimension>`). Blank lines and `#` comments are skipped.
pub fn parse_boxes(text: &str) -> Result<Vec<ChunkBox>, String> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if !line.is_empty() {
            out.push(ChunkBox::parse(line, false)?);
        }
    }
    Ok(out)
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
            "logout_radius" => {
                self.logout_radius = number_or_off(&key, &lower, u64::from(MAX_RADIUS_CHUNKS))?.map(|n| n as u32);
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
                    // "activated" is what the first build called this mode.
                    "used" | "activated" => WaystoneMode::Used,
                    "all" => WaystoneMode::All,
                    "off" => WaystoneMode::Off,
                    _ => return Err(format!("{key}={value}: used, all or off")),
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

    /// These settings as the text of a policy file.
    pub fn to_policy_text(&self) -> String {
        let mut out = String::from(
            "# IridescentCraft regeneration policy: what a world regeneration must keep.\n\
             # Read by the launcher's protection report / regeneration dry-run at every run.\n\
             # A line that does not parse makes the run fail; delete the file to return to the defaults.\n",
        );
        for (key, value) in self.to_pairs() {
            out.push_str(&format!("{key}={value}\n"));
        }
        out
    }

    /// Write [`POLICY_FILE`] next to server.properties. (The server folder,
    /// never the world: this is the operator's own settings file.)
    pub fn save(&self, server_dir: &Path) -> std::io::Result<()> {
        std::fs::write(server_dir.join(POLICY_FILE), self.to_policy_text())
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
        let claims = if self.claims { "on" } else { "off" };
        let mut out = vec![
            ("bed_radius".to_string(), or_off(self.bed_radius.map(u64::from))),
            ("logout_radius".to_string(), or_off(self.logout_radius.map(u64::from))),
            ("claims".to_string(), claims.to_string()),
            ("spawn_radius_blocks".to_string(), or_off(self.spawn_radius_blocks.map(u64::from))),
            ("waystones".to_string(), self.waystones.keyword().to_string()),
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
            (
                "logout_radius",
                self.logout_radius
                    .map_or("off".to_string(), |r| format!("{r} chunk(s): {0}x{0} around each player's logout chunk", 2 * r + 1)),
                self.logout_radius == d.logout_radius,
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
                    WaystoneMode::Used => "used (waystones a player has activated or placed, and global ones)",
                    WaystoneMode::All => "all (every waystone the server knows, generated ones included)",
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

    // Where each player logged out, in the dimension they were in then. No
    // `why`: the layer says what it is, and it names no one.
    if let Some(radius) = settings.logout_radius {
        for (_, pos) in sources.players.iter().filter_map(|p| p.last_pos.as_ref()).filter(|(d, _)| d == dim) {
            add_square(&mut chunks, pos.chunk(), radius, Layer::Logout, None);
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
            if settings.waystones == WaystoneMode::All || w.is_used(&activated) {
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

    fn waystone(uid: &str, dim: &str, at: (i32, i32), origin: &str) -> Waystone {
        Waystone {
            uid: uid.to_string(),
            name: String::new(),
            dim: dim.to_string(),
            pos: BlockPos { x: at.0, y: 64, z: at.1 },
            origin: origin.to_string(),
            global: false,
        }
    }

    /// `player(..)` who logged out at block `(x, z)` of `dim`.
    fn logged_out(mut p: Player, dim: &str, at: (i32, i32)) -> Player {
        p.last_pos = Some((dim.to_string(), BlockPos { x: at.0, y: 64, z: at.1 }));
        p
    }

    fn only(layer: Layer) -> Settings {
        let mut s = Settings {
            bed_radius: None,
            logout_radius: None,
            claims: false,
            spawn_radius_blocks: None,
            waystones: WaystoneMode::Off,
            inhabited_min_ticks: None,
            ..Settings::default()
        };
        match layer {
            Layer::Bed => s.bed_radius = Some(1),
            Layer::Logout => s.logout_radius = Some(1),
            Layer::Claim => s.claims = true,
            Layer::Spawn => s.spawn_radius_blocks = Some(128),
            Layer::Waystone => s.waystones = WaystoneMode::Used,
            Layer::LivedIn => s.inhabited_min_ticks = Some(12_000),
            Layer::Manual | Layer::Unreadable => {}
        }
        s
    }

    #[test]
    fn the_defaults_are_the_operators_decisions_and_the_flagged_proposals() {
        let s = Settings::default();
        assert_eq!(s.bed_radius, Some(1));
        assert_eq!(s.logout_radius, Some(1), "G5, ruled 2026-10-22: the logout chunk and the 3x3 around it");
        assert!(s.claims);
        assert_eq!(s.spawn_radius_blocks, Some(128));
        assert_eq!(s.waystones, WaystoneMode::Used);
        assert_eq!(s.inhabited_min_ticks, Some(12_000));
        assert!(s.protect.is_empty() && s.unprotect.is_empty());
        assert!(s.describe().iter().all(|(_, _, is_default)| *is_default));
        // Every layer has its own bit, and together they fill the u8.
        assert_eq!(Layer::ALL.iter().map(|l| u32::from(l.bit())).sum::<u32>(), 255);
        assert_eq!(Layer::ALL.len(), Layer::COUNT);
        assert_eq!(layer_names(Layer::Bed.bit() | Layer::LivedIn.bit() | Layer::Spawn.bit()), "bed+spawn+lived-in");
        assert_eq!(layer_names(Layer::Logout.bit() | Layer::Bed.bit() | Layer::Unreadable.bit()), "bed+logout+unreadable");
        assert_eq!((fmt_ticks(800), fmt_ticks(12_000), fmt_ticks(6_166_097)), ("40 s".to_string(), "10.0 min".to_string(), "85.6 h".to_string()));
    }

    #[test]
    fn policy_lines_set_every_knob() {
        let mut s = Settings::default();
        s.apply_policy(
            "\u{feff}# regen policy\r\n\
             bed_radius = 2\r\n\
             logout_radius=Off\r\n\
             claims=OFF   # for a test\r\n\
             spawn_radius_blocks=off\n\
             waystones=Activated\n\
             waystone_radius=1\n\
             inhabited_min_ticks=72000\n\
             inhabited_warn_ticks=6000\n\
             \n\
             protect=42,67\n\
             protect=52,70..32,40\n\
             protect=10,12@minecraft:the_nether\n\
             protect_blocks=652,1040..752,1140\n\
             unprotect=-5,-6\n\
             unprotect_blocks=-1,-1\n",
        )
        .unwrap();
        assert_eq!(s.bed_radius, Some(2));
        assert_eq!(s.logout_radius, None);
        assert!(!s.claims);
        assert_eq!(s.spawn_radius_blocks, None);
        assert_eq!(s.waystones, WaystoneMode::Used, "the first build's name for the mode still reads");
        assert_eq!(s.waystone_radius, 1);
        assert_eq!(s.inhabited_min_ticks, Some(72_000));
        assert_eq!(s.inhabited_warn_ticks, 6_000);
        let shown: Vec<String> = s.protect.iter().map(ChunkBox::to_string).collect();
        assert_eq!(shown, vec!["42,67", "32,40..52,70", "10,12@minecraft:the_nether", "40,65..47,71"]);
        let shown: Vec<String> = s.unprotect.iter().map(ChunkBox::to_string).collect();
        assert_eq!(shown, vec!["-5,-6", "-1,-1"]);
        assert!(s.validate().is_ok());
        assert!(s.protect[1].contains(OVERWORLD, (32, 70)) && !s.protect[1].contains(OVERWORLD, (31, 70)));
        assert!(!s.protect[1].contains(NETHER, (42, 50)));
        assert!(s.protect[2].contains(NETHER, (10, 12)));
        assert!(s.describe().iter().filter(|(_, _, is_default)| !*is_default).count() >= 7);

        // What a plan records reproduces the settings exactly.
        let mut again = Settings::default();
        for (key, value) in s.to_pairs() {
            again.set(&key, &value).unwrap();
        }
        assert_eq!(again, s);

        let mut s = Settings::default();
        s.set("inhabited_min_ticks", "off").unwrap();
        s.set("bed_radius", "off").unwrap();
        s.set("logout_radius", "3").unwrap();
        assert_eq!((s.inhabited_min_ticks, s.bed_radius, s.logout_radius), (None, None, Some(3)));
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
            "logout_radius=65",
            "logout_radius=near",
            "logout=on",
            "spawn_radius_blocks=999999",
            "claims=maybe",
            "waystones=some",
            "inhabited_min_ticks=10 minutes",
            "protect=42",
            "protect=42,67..",
            "protect=1,2@",
            "protect=a,b",
            "unprotect=1.5,2",
            "radius=3",
        ] {
            assert!(Settings::default().apply_policy(bad).is_err(), "{bad}");
        }
        // Box lists, as the launcher window takes them: one per line.
        let boxes = parse_boxes("42,67\n\n  32,40..52,70   # the base\n# a comment\n10,12@minecraft:the_nether\n").unwrap();
        let shown: Vec<String> = boxes.iter().map(ChunkBox::to_string).collect();
        assert_eq!(shown, vec!["42,67", "32,40..52,70", "10,12@minecraft:the_nether"]);
        assert_eq!(parse_boxes(""), Ok(vec![]));
        assert!(parse_boxes("42,67\nnonsense").is_err());

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

        // What the launcher window saves is what the next run loads.
        let mut wanted = Settings::default();
        wanted.apply_policy("bed_radius=2\nwaystones=all\nspawn_radius_blocks=off\nprotect=1,2..3,4\nunprotect=9,9@minecraft:the_nether").unwrap();
        wanted.save(&dir).unwrap();
        let (loaded, body) = Settings::load(&dir).unwrap();
        assert_eq!(loaded, wanted);
        let body = body.unwrap();
        assert!(body.starts_with("# IridescentCraft regeneration policy") && body.contains("\nwaystones=all\n"), "{body}");
        Settings::default().save(&dir).unwrap();
        assert_eq!(Settings::load(&dir).unwrap().0, Settings::default());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_bed_layer_is_the_bed_chunk_and_its_neighbours() {
        // Three beds the way a live world has them (two of them close).
        let players = [
            player("Player_One", Some((OVERWORLD, (687, 1080))), &[]),
            player("Player_Two", Some((OVERWORLD, (622, 1081))), &[]),
            player("Player_Three", Some((OVERWORLD, (724, 780))), &[]),
            player("visitor", None, &[]),
            player("netherite", Some((NETHER, (5, 5))), &[]),
        ];
        let lv = level((0, 0));
        let sources = Sources { level: &lv, players: &players, claims: &[], waystones: &[] };
        let scan = DimensionScan::default();
        let map = build(OVERWORLD, &sources, &only(Layer::Bed), &scan);
        assert_eq!(map.chunks.len(), 27);
        for centre in [(42, 67), (38, 67), (45, 48)] {
            for dx in -1..=1 {
                for dz in -1..=1 {
                    assert_eq!(map.layers_at((centre.0 + dx, centre.1 + dz)), Layer::Bed.bit());
                }
            }
            assert!(!map.is_protected((centre.0 + 2, centre.1)) && !map.is_protected((centre.0, centre.1 - 2)));
        }
        assert!(!map.is_protected((40, 67)), "between two 3x3 squares, in neither");
        assert_eq!(map.chunks[&(42, 67)].why, vec!["bed of Player_One".to_string()]);
        // Radius 0 = the bed chunk alone; radius 2 = 5x5; the Nether bed is the Nether's.
        let mut s = only(Layer::Bed);
        s.bed_radius = Some(0);
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.len(), 3);
        s.bed_radius = Some(2);
        let wide = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(wide.chunks.len(), 25 + 25 + 25 - 5, "Player_One's and Player_Two's 5x5 share one column");
        assert_eq!(wide.chunks[&(40, 67)].why.len(), 2);
        let nether = build(NETHER, &sources, &only(Layer::Bed), &scan);
        assert_eq!(nether.chunks.len(), 9);
        assert!(nether.is_protected((0, 0)) && nether.is_protected((-1, -1)) && !nether.is_protected((2, 2)));
    }

    #[test]
    fn the_logout_layer_is_the_logout_chunk_and_its_neighbours_in_that_dimension() {
        let players = [
            // Logged out in the frame, far from their bed: block (88, 90) = chunk (5, 5).
            logged_out(player("Player_One", Some((OVERWORLD, (200, 200))), &[]), OVERWORLD, (88, 90)),
            // At negative coordinates, on a chunk border: block (-1, -16) = chunk (-1, -1).
            logged_out(player("Player_Two", None, &[]), OVERWORLD, (-1, -16)),
            // In the Nether, at the same chunk numbers as Player_One.
            logged_out(player("Player_Three", None, &[]), NETHER, (80, 95)),
            // A file with no position: nothing to keep for them.
            player("Player_Four", None, &[]),
        ];
        let lv = level((0, 0));
        let sources = Sources { level: &lv, players: &players, claims: &[], waystones: &[] };
        let scan = DimensionScan::default();

        let over = build(OVERWORLD, &sources, &only(Layer::Logout), &scan);
        assert_eq!(over.chunks.len(), 18);
        for centre in [(5, 5), (-1, -1)] {
            for dx in -1..=1 {
                for dz in -1..=1 {
                    assert_eq!(over.layers_at((centre.0 + dx, centre.1 + dz)), Layer::Logout.bit());
                }
            }
        }
        assert!(!over.is_protected((7, 5)) && !over.is_protected((5, 3)) && !over.is_protected((1, -1)));
        assert!(over.chunks.values().all(|p| p.why.is_empty()), "the layer names no one");
        assert!(!over.is_protected((12, 12)), "the bed is the bed layer's, not this one's");

        // Another dimension's logout protects that dimension only.
        let nether = build(NETHER, &sources, &only(Layer::Logout), &scan);
        let square: BTreeSet<ChunkPos> = (4..=6).flat_map(|x| (4..=6).map(move |z| (x, z))).collect();
        assert_eq!(nether.chunks.keys().copied().collect::<BTreeSet<ChunkPos>>(), square);
        assert_eq!(build("minecraft:the_end", &sources, &only(Layer::Logout), &scan).chunks.len(), 0);

        // The radius is the operator's; off is off.
        let mut s = only(Layer::Logout);
        s.logout_radius = Some(0);
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.keys().copied().collect::<Vec<_>>(), vec![(-1, -1), (5, 5)]);
        s.logout_radius = Some(2);
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.len(), 50);
        s.logout_radius = None;
        assert!(build(OVERWORLD, &sources, &s, &scan).chunks.is_empty());

        // With every layer at its default the logout square adds to the bed's, and an
        // unprotect box still wins over it (the run's own refusal is the backstop then).
        let mut s = Settings::default();
        s.spawn_radius_blocks = None;
        let map = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(map.chunks.len(), 9 + 18);
        assert_eq!(layer_names(map.layers_at((12, 12))), "bed");
        assert_eq!(layer_names(map.layers_at((5, 5))), "logout");
        s.set("unprotect", "5,5").unwrap();
        let map = build(OVERWORLD, &sources, &s, &scan);
        assert!(!map.is_protected((5, 5)) && map.is_protected((5, 6)));
        assert_eq!(layer_names(map.overridden[&(5, 5)].layers), "logout");
    }

    #[test]
    fn claims_spawn_and_waystones() {
        let lv = level((672, 1072));
        let owners = [
            ClaimOwner {
                uuid: "u1".to_string(),
                name: "Player_One".to_string(),
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
        let players = [player("Player_One", None, &["way-b"])];
        // way-a: generated, nobody has used it. way-b: generated, activated by Player_One.
        // way-d: placed by a player, activated by nobody. way-e: generated, made global.
        let mut global = waystone("way-e", OVERWORLD, (160, 160), "WILDERNESS");
        global.global = true;
        let waystones = [
            waystone("way-a", OVERWORLD, (-783, -1838), "VILLAGE"),
            waystone("way-b", OVERWORLD, (40, 40), "VILLAGE"),
            waystone("way-c", NETHER, (0, 0), "VILLAGE"),
            waystone("way-d", OVERWORLD, (80, 80), "PLAYER"),
            global,
        ];
        let sources = Sources { level: &lv, players: &players, claims: &owners, waystones: &waystones };
        let scan = DimensionScan::default();

        let claims = build(OVERWORLD, &sources, &only(Layer::Claim), &scan);
        assert_eq!(claims.chunks.len(), 1);
        assert_eq!(claims.chunks[&(10, 10)].why, vec!["claim: Player_One".to_string(), "claim: server claims".to_string()]);
        assert_eq!(build(NETHER, &sources, &only(Layer::Claim), &scan).chunks.len(), 1);

        // Spawn at block (672, 1072) = chunk (42, 67); 128 blocks = 8 chunks each way.
        let spawn = build(OVERWORLD, &sources, &only(Layer::Spawn), &scan);
        assert_eq!(spawn.chunks.len(), 17 * 17);
        assert!(spawn.is_protected((34, 59)) && spawn.is_protected((50, 75)));
        assert!(!spawn.is_protected((33, 67)) && !spawn.is_protected((42, 76)));
        assert_eq!(build(NETHER, &sources, &only(Layer::Spawn), &scan).chunks.len(), 0, "world spawn is an overworld thing");
        assert_eq!(block_square_chunks(672, 1072, 96), ((36, 61), (48, 73)));
        assert_eq!(block_square_chunks(0, 0, 32), ((-2, -2), (2, 2)));
        assert_eq!(block_square_chunks(-1, 15, 0), ((-1, 0), (-1, 0)));

        // The default: what a player has activated or placed, and global ones.
        let used = build(OVERWORLD, &sources, &only(Layer::Waystone), &scan);
        assert_eq!(used.chunks.keys().copied().collect::<Vec<_>>(), vec![(2, 2), (5, 5), (10, 10)]);
        assert_eq!(build(NETHER, &sources, &only(Layer::Waystone), &scan).chunks.len(), 0, "nobody uses the Nether one");
        let mut s = only(Layer::Waystone);
        s.waystones = WaystoneMode::All;
        let all = build(OVERWORLD, &sources, &s, &scan);
        assert_eq!(all.chunks.keys().copied().collect::<Vec<_>>(), vec![(-49, -115), (2, 2), (5, 5), (10, 10)]);
        assert_eq!(build(NETHER, &sources, &s, &scan).chunks.len(), 1);
        s.waystones = WaystoneMode::Used;
        s.waystone_radius = 1;
        assert_eq!(build(OVERWORLD, &sources, &s, &scan).chunks.len(), 27);
        s.waystones = WaystoneMode::Off;
        assert!(build(OVERWORLD, &sources, &s, &scan).chunks.is_empty());
    }

    #[test]
    fn lived_in_unreadable_manual_and_the_union() {
        let lv = level((0, 0));
        let players = [player("Player_One", Some((OVERWORLD, (8, 8))), &[])];
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
