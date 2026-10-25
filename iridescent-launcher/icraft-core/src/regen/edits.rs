//! What a regeneration changes besides its chunks: the world's seed, the
//! Tectonic blending mark on the kept chunks, the pack's spawn markers, and the
//! player files of players who start over (operator decisions D1 to D9 of
//! 2026-10-25; internal `design/scope-new-seed-2026-10-25.md`, section 5a).
//!
//! Each is asked for on the dry-run page (or as `key=value`, like a protection
//! setting) and is written into the dry-run's `plan.json` as a concrete value:
//! `new_seed=random` becomes the number the dry-run drew. The plan's hash
//! covers them ([`Edits::hash_lines`]), so the eight characters the operator
//! types approve the seed and the player files as well as the chunks. None of
//! them is a protection setting, and none goes into the policy file: a policy
//! saved with a seed in it would change the seed again at every later run, and
//! one with a player in it would wipe that player's new file.
//!
//! | Edit | What the run does |
//! |---|---|
//! | `new_seed` | `Data.WorldGenSettings.seed` in `level.dat` and `level.dat_old`; ModernFix's `mfix_strongholds.dat` of every dimension moved to the holding folder (it keeps the old seed's ring positions forever); Alex's Mobs' `PupfishChunkX/Z` removed (the one chunk pupfish may spawn in, picked from the old seed) |
//! | `blend` | every kept overworld terrain chunk that Tectonic tagged `tectonic:blending_version = 1` rewritten in place with 0: Tectonic then gives it vanilla `blending_data`, and new land generated next to it bends toward it |
//! | `spawn_search` | `Data.SpawnY` set to [`SPAWN_SEARCH_Y`] and the spawn scripts' one-shot markers removed from `kubejs_persistent_data.nbt`, so `cherry_spawn_biome.js` looks for a cherry river valley village again and `spawn_priest_tower.js` places its tower there |
//! | `reset_players` | each player's `playerdata/<uuid>.*` moved to the holding folder; no layer keeps that player's bed or logout spot |
//!
//! Only a plan that resets every chunk it does not keep, in every dimension
//! that has land (`scope all`), may change the seed: anything narrower would
//! leave old-seed land beside new-seed land outside the keep list.
//!
//! The readers and writers here are the run's (they use [`crate::nbt`] and
//! [`crate::anvil`]). The fidelity harness works the same edits out on its own.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::anvil::{self, ChunkPos, Dimension, Store, SECTOR_BYTES};
use crate::nbt::{Container, Doc, Node};
use crate::worlddata::Player;

/// The world spawn's height after `spawn_search`. The pack stored the spawn
/// with Y = -64 (the heightmap of an unloaded chunk), and the cherry search
/// samples no Y at all from there (`findClosestBiome3d` walks from the
/// origin's Y within the build height). One above sea level, where the biome
/// is. Players are placed by the surface whatever this is.
pub const SPAWN_SEARCH_Y: i32 = 64;
/// Tectonic 3.0.17 writes this into every chunk it saves, with
/// [`TECTONIC_SAVED`]; a chunk read with any other value is old to it.
pub const TECTONIC_TAG: &str = "tectonic:blending_version";
pub const TECTONIC_SAVED: i32 = 1;
pub const TECTONIC_OLD: i32 = 0;
/// ModernFix 5.26.2 (`perf.cache_strongholds`), in a dimension's `data/`.
pub const STRONGHOLD_CACHE: &str = "mfix_strongholds.dat";
/// Alex's Mobs' world data, under the world: `data.PupfishChunkX/Z`.
pub const PUPFISH_STORE: &str = "data/alexsmobs_world_data.dat";
pub const PUPFISH_KEYS: [&str; 2] = ["PupfishChunkX", "PupfishChunkZ"];
/// KubeJS 6's persistent data, under the world: the server's keys at the
/// root, each level's under its id.
pub const KUBEJS_DATA: &str = "kubejs_persistent_data.nbt";
/// `spawn_priest_tower.js` (server data).
pub const SERVER_SPAWN_KEYS: [&str; 2] = ["icraft_priest_tower_done", "icraft_priest_tower_attempts"];
/// `cherry_spawn_biome.js` (the overworld's data).
pub const LEVEL_SPAWN_KEYS: [&str; 5] =
    ["icraft_cherry_spawn_set", "icraft_cherry_spawn_exhausted", "icraft_cherry_village_x", "icraft_cherry_village_y", "icraft_cherry_village_z"];
pub const LEVEL_DATA_KEY: &str = "minecraft:overworld";

// =============================================================================
// What is asked for, and what a plan records
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SeedChoice {
    #[default]
    Keep,
    /// Drawn by the dry-run, which records the number.
    Random,
    Value(i64),
}

/// The edits as asked for: from the window, a request file or the command line.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorldEdits {
    pub new_seed: SeedChoice,
    pub blend: bool,
    pub spawn_search: bool,
    /// Names or UUIDs as given.
    pub reset_players: Vec<String>,
}

fn on_off(key: &str, value: &str) -> Result<bool, String> {
    match value.to_ascii_lowercase().as_str() {
        "on" | "1" | "true" => Ok(true),
        "off" | "0" | "false" => Ok(false),
        _ => Err(format!("{key}={value}: on or off")),
    }
}

impl WorldEdits {
    pub fn is_empty(&self) -> bool {
        self.new_seed == SeedChoice::Keep && !self.blend && !self.spawn_search && self.reset_players.is_empty()
    }

    /// One `key=value` of ours: `Ok(false)` when the key is not one.
    pub fn set(&mut self, key: &str, value: &str) -> Result<bool, String> {
        let value = value.trim();
        match key {
            "new_seed" => {
                self.new_seed = match value.to_ascii_lowercase().as_str() {
                    "" | "keep" | "off" => SeedChoice::Keep,
                    "random" => SeedChoice::Random,
                    _ => SeedChoice::Value(value.parse().map_err(|_| format!("new_seed={value}: keep, random or a whole number (a Java long)"))?),
                }
            }
            "blend" => self.blend = on_off(key, value)?,
            "spawn_search" => self.spawn_search = on_off(key, value)?,
            "reset_players" => {
                let mut list: Vec<String> = Vec::new();
                for entry in value.split(',').map(str::trim).filter(|e| !e.is_empty() && !e.eq_ignore_ascii_case("none")) {
                    let entry = if crate::worlddata::is_uuid(entry) { entry.to_ascii_lowercase() } else { entry.to_string() };
                    if !list.iter().any(|e| e.eq_ignore_ascii_case(&entry)) {
                        list.push(entry);
                    }
                }
                self.reset_players = list;
            }
            _ => return Ok(false),
        }
        Ok(true)
    }

    /// The tokens [`WorldEdits::set`] reads back; none when nothing is asked.
    pub fn tokens(&self) -> Vec<String> {
        let mut out = Vec::new();
        match self.new_seed {
            SeedChoice::Keep => {}
            SeedChoice::Random => out.push("new_seed=random".to_string()),
            SeedChoice::Value(n) => out.push(format!("new_seed={n}")),
        }
        if self.blend {
            out.push("blend=on".to_string());
        }
        if self.spawn_search {
            out.push("spawn_search=on".to_string());
        }
        if !self.reset_players.is_empty() {
            out.push(format!("reset_players={}", self.reset_players.join(",")));
        }
        out
    }
}

/// What a plan does besides its chunks, as `plan.json` records it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Edits {
    /// The seed in `level.dat` when the dry-run was made (with a new seed).
    pub seed_before: Option<i64>,
    pub new_seed: Option<i64>,
    pub blend: bool,
    pub spawn_search: bool,
    /// [`SPAWN_SEARCH_Y`] when `spawn_search`.
    pub spawn_y: i32,
    /// UUIDs, lowercase, sorted.
    pub reset_players: Vec<String>,
}

impl Edits {
    pub fn is_empty(&self) -> bool {
        self.new_seed.is_none() && !self.blend && !self.spawn_search && self.reset_players.is_empty()
    }

    /// The lines the plan's hash takes after its chunks, in this order:
    /// `seed_from=<old>` and `seed=<new>`, `blend=kept-chunks`,
    /// `spawn=search y=<y>`, `reset_player=<uuid>` (sorted). None for a plan
    /// that only resets chunks, so its hash is what it always was.
    pub fn hash_lines(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(seed) = self.new_seed {
            out.push(format!("seed_from={}", self.seed_before.map_or("none".to_string(), |s| s.to_string())));
            out.push(format!("seed={seed}"));
        }
        if self.blend {
            out.push("blend=kept-chunks".to_string());
        }
        if self.spawn_search {
            out.push(format!("spawn=search y={}", self.spawn_y));
        }
        out.extend(self.reset_players.iter().map(|u| format!("reset_player={u}")));
        out
    }

    /// The run that reproduces these edits: the seed as a number, the players
    /// as UUIDs.
    pub fn as_asked(&self) -> WorldEdits {
        WorldEdits {
            new_seed: self.new_seed.map_or(SeedChoice::Keep, SeedChoice::Value),
            blend: self.blend,
            spawn_search: self.spawn_search,
            reset_players: self.reset_players.clone(),
        }
    }

    /// `plan.json`'s `world_edits`. Seeds as text: they do not fit a double.
    pub fn to_json(&self) -> serde_json::Value {
        let seed = |s: Option<i64>| s.map_or(serde_json::Value::Null, |s| serde_json::Value::String(s.to_string()));
        serde_json::json!({
            "new_seed": seed(self.new_seed),
            "seed_before": seed(self.seed_before),
            "blend": self.blend,
            "spawn_search": self.spawn_search,
            "spawn_y": self.spawn_y,
            "reset_players": self.reset_players,
        })
    }

    /// Back from `plan.json`. A plan written before 2026-10-25 has none.
    pub fn from_json(v: &serde_json::Value) -> Result<Edits, String> {
        if v.is_null() {
            return Ok(Edits::default());
        }
        let seed = |key: &str| -> Result<Option<i64>, String> {
            match &v[key] {
                serde_json::Value::Null => Ok(None),
                serde_json::Value::String(s) => s.parse().map(Some).map_err(|_| format!("world_edits.{key} is not a whole number")),
                _ => Err(format!("world_edits.{key} is not a number as text")),
            }
        };
        let flag = |key: &str| v[key].as_bool().unwrap_or(false);
        let mut reset_players: Vec<String> = Vec::new();
        for u in v["reset_players"].as_array().map_or(&[][..], Vec::as_slice) {
            let u = u.as_str().filter(|u| crate::worlddata::is_uuid(u)).ok_or("world_edits.reset_players holds something that is not a UUID")?;
            reset_players.push(u.to_ascii_lowercase());
        }
        reset_players.sort();
        reset_players.dedup();
        let spawn_search = flag("spawn_search");
        let spawn_y = match v["spawn_y"].as_i64() {
            Some(y) => i32::try_from(y).map_err(|_| "world_edits.spawn_y is out of range".to_string())?,
            None if spawn_search => return Err("world_edits.spawn_y is missing".to_string()),
            None => 0,
        };
        Ok(Edits { seed_before: seed("seed_before")?, new_seed: seed("new_seed")?, blend: flag("blend"), spawn_search, spawn_y, reset_players })
    }

    /// What the plan does, in words, for the report and the page.
    pub fn describe(&self, players: &[Player]) -> Vec<String> {
        let mut out = Vec::new();
        if let Some(seed) = self.new_seed {
            out.push(format!(
                "NEW SEED {seed} (was {}): every chunk this plan resets comes back as DIFFERENT land; the kept chunks keep theirs. Strongholds, slime chunks and the spawn's surroundings follow the new seed. ModernFix's stronghold caches and Alex's Mobs' pupfish chunk are removed with the old seed.",
                self.seed_before.map_or("unknown".to_string(), |s| s.to_string())
            ));
        }
        if self.blend {
            out.push("BLEND: the kept overworld chunks are marked for Tectonic's blending (tectonic:blending_version 1 -> 0, nothing else in them changes): new land generated beside them bends toward them for about four chunks.".to_string());
        }
        if self.spawn_search {
            out.push(format!(
                "SPAWN SEARCH: the world spawn's height is set to {} and the spawn scripts' markers are removed, so at the next start the pack looks for a cherry river valley village again and moves the spawn there (the priest tower follows). The spawn may end up far from the kept chunks.",
                self.spawn_y
            ));
        }
        for uuid in &self.reset_players {
            let name = players.iter().find(|p| p.uuid == *uuid).map_or(uuid.as_str(), |p| p.label());
            out.push(format!(
                "STARTS OVER: {name}: their player file (playerdata/{}.*: inventory, position, bed, mod data kept on the player) leaves the world, into the holding folder. They join again as a new player at world spawn. No layer keeps their bed or logout spot.",
                short(uuid)
            ));
        }
        out
    }
}

/// The first characters of a UUID: enough to find the file, and not a name.
pub fn short(uuid: &str) -> &str {
    &uuid[..uuid.len().min(8)]
}

static DRAWS: AtomicU64 = AtomicU64::new(0);

/// A seed for `new_seed=random`: 64 bits from the clock, the process and a
/// counter, through SHA-256. (Minecraft draws its own from a `Random`; any
/// long will do.)
pub fn random_seed() -> i64 {
    use sha2::{Digest, Sha256};
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    let mut h = Sha256::new();
    h.update(nanos.to_le_bytes());
    h.update(std::process::id().to_le_bytes());
    h.update(DRAWS.fetch_add(1, Ordering::SeqCst).to_le_bytes());
    let d = h.finalize();
    i64::from_le_bytes([d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]])
}

/// `reset_players` (names or UUIDs) as the UUIDs of these player files,
/// sorted. `Err` names one that is no player of the world.
pub fn resolve_players(list: &[String], players: &[Player]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for entry in list {
        let found = players.iter().find(|p| p.uuid.eq_ignore_ascii_case(entry) || p.name.as_deref().is_some_and(|n| n.eq_ignore_ascii_case(entry)));
        match found {
            Some(p) if !out.contains(&p.uuid) => out.push(p.uuid.clone()),
            Some(_) => {}
            // Not the list of who is there: a failed dry-run goes to the log.
            None => return Err(format!("reset_players: '{entry}' is no player of this world (no player file has that name or UUID)")),
        }
    }
    out.sort();
    Ok(out)
}

// =============================================================================
// The files the edits touch
// =============================================================================

/// Every `mfix_strongholds.dat` in a `data/` folder of the world, sorted.
pub fn stronghold_caches(world: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()) {
            let path = entry.path();
            match entry.file_type() {
                Ok(kind) if kind.is_dir() && depth < 6 => walk(&path, depth + 1, out),
                Ok(kind) if kind.is_file() && entry.file_name() == STRONGHOLD_CACHE && dir.file_name().is_some_and(|n| n == "data") => out.push(path),
                _ => {}
            }
        }
    }
    let mut out = Vec::new();
    walk(world, 0, &mut out);
    out.sort();
    out
}

/// A player's files in `playerdata/`: `<uuid>.dat`, `.dat_old`, and what mods
/// keep beside them (`.cosarmor`), sorted.
pub fn player_files(world: &Path, uuid: &str) -> Vec<PathBuf> {
    let prefix = format!("{}.", uuid.to_ascii_lowercase());
    let mut out: Vec<PathBuf> = fs::read_dir(world.join("playerdata"))
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter(|e| e.file_name().to_string_lossy().to_ascii_lowercase().starts_with(&prefix))
        .map(|e| e.path())
        .collect();
    out.sort();
    out
}

/// What else the world keeps of a player, outside `playerdata/`: files named
/// after them, and saved-data files that hold their UUID as text. For the
/// report: the run moves none of these (the operator named the player file).
pub fn other_player_records(world: &Path, uuid: &str) -> Vec<String> {
    fn walk(dir: &Path, rel: &str, uuid: &str, out: &mut Vec<String>) {
        let mut entries: Vec<fs::DirEntry> = fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            let child = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let Ok(kind) = e.file_type() else { continue };
            let lower = name.to_ascii_lowercase();
            if matches!(lower.as_str(), "region" | "entities" | "poi" | "playerdata") {
                continue;
            }
            if lower.contains(uuid) {
                out.push(format!("{} (named after them)", child.replace(uuid, &format!("{}...", short(uuid)))));
                continue;
            }
            if kind.is_dir() {
                walk(&e.path(), &child, uuid, out);
            } else if kind.is_file() && (lower.ends_with(".dat") || lower.ends_with(".nbt") || lower.ends_with(".json")) {
                if e.metadata().is_ok_and(|m| m.len() <= 64 << 20) && mentions(&e.path(), uuid) {
                    out.push(format!("{child} (holds their UUID)"));
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(world, "", &uuid.to_ascii_lowercase(), &mut out);
    out
}

fn mentions(path: &Path, uuid: &str) -> bool {
    let Ok(raw) = fs::read(path) else { return false };
    let text = match crate::nbt::unwrap_container(&raw) {
        Ok((_, payload)) => payload,
        Err(_) => raw,
    };
    String::from_utf8_lossy(&text).to_ascii_lowercase().contains(uuid)
}

// =============================================================================
// The saved-data edits (in memory: the run writes them)
// =============================================================================

/// `level.dat` (or `level.dat_old`) with the new seed and the spawn height.
/// Every other entry stays as it was. `Err`: a field to change is not there.
pub fn edit_level(raw: &[u8], new_seed: Option<i64>, spawn_y: Option<i32>) -> Result<Doc, String> {
    let mut doc = Doc::parse(raw).map_err(|e| e.to_string())?;
    if let Some(seed) = new_seed {
        match doc.root.at_mut(&["Data", "WorldGenSettings", "seed"]) {
            Some(Node::Long(v)) => *v = seed,
            _ => return Err("it has no Data.WorldGenSettings.seed (a long)".to_string()),
        }
    }
    if let Some(y) = spawn_y {
        match doc.root.at_mut(&["Data", "SpawnY"]) {
            Some(Node::Int(v)) => *v = y,
            _ => return Err("it has no Data.SpawnY (an int)".to_string()),
        }
    }
    Ok(doc)
}

fn remove_keys(node: &mut Node, keys: &[&str]) -> Vec<String> {
    let mut gone = Vec::new();
    if let Node::Compound(entries) = node {
        entries.retain(|(name, _)| {
            let hit = keys.iter().any(|k| k.as_bytes() == name.as_slice());
            if hit {
                gone.push(String::from_utf8_lossy(name).into_owned());
            }
            !hit
        });
    }
    gone
}

/// `kubejs_persistent_data.nbt` without the spawn scripts' markers, and which
/// were there. `None`: none was.
pub fn edit_spawn_markers(raw: &[u8]) -> Result<Option<(Doc, Vec<String>)>, String> {
    let mut doc = Doc::parse(raw).map_err(|e| e.to_string())?;
    let mut gone = remove_keys(&mut doc.root, &SERVER_SPAWN_KEYS);
    if let Some(level) = doc.root.get_mut(LEVEL_DATA_KEY) {
        gone.extend(remove_keys(level, &LEVEL_SPAWN_KEYS).into_iter().map(|k| format!("{LEVEL_DATA_KEY}.{k}")));
    }
    Ok((!gone.is_empty()).then_some((doc, gone)))
}

/// Alex's Mobs' world data without its pupfish chunk. `None`: it has none.
pub fn edit_pupfish(raw: &[u8]) -> Result<Option<Doc>, String> {
    let mut doc = Doc::parse(raw).map_err(|e| e.to_string())?;
    let gone = match doc.root.get_mut("data") {
        Some(data) => remove_keys(data, &PUPFISH_KEYS),
        None => Vec::new(),
    };
    Ok((!gone.is_empty()).then_some(doc))
}

// =============================================================================
// The blending mark (in memory: the run writes it)
// =============================================================================

/// The kept terrain chunks of one region file that carry Tectonic's tag with
/// [`TECTONIC_SAVED`]: what blending rewrites.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BlendScan {
    /// Region file name -> the slots to rewrite.
    pub files: BTreeMap<String, BTreeSet<u16>>,
    pub tagged: usize,
    /// Kept chunks already old to Tectonic (no tag, or another value).
    pub untagged: usize,
    /// Kept chunks stored in a `.mcc` beside the region file: left as they are.
    pub external: usize,
}

/// A chunk record's compression type and its compressed bytes (not for a
/// chunk whose data is in a `.mcc`).
fn record_of(file: &[u8], slot: anvil::Slot) -> Result<(u8, &[u8]), String> {
    let start = slot.offset_sectors as usize * SECTOR_BYTES;
    if slot.offset_sectors < 2 {
        return Err(format!("the chunk in slot {} points into the header", slot.index));
    }
    let head = file.get(start..start + 5).ok_or_else(|| format!("the chunk in slot {} starts past the end of the file", slot.index))?;
    let len = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as usize;
    if len == 0 {
        return Err(format!("the chunk in slot {} has length zero", slot.index));
    }
    let data = file.get(start + 5..start + 4 + len).ok_or_else(|| format!("the chunk in slot {} runs past the end of the file", slot.index))?;
    Ok((head[4], data))
}

/// The value of Tectonic's tag in a chunk's root, if it is an int.
fn tag_of(doc: &Doc) -> Option<i32> {
    match doc.root.get(TECTONIC_TAG) {
        Some(Node::Int(v)) => Some(*v),
        _ => None,
    }
}

/// Which `kept` terrain chunks of `dim` carry the tag (reads their region files).
pub fn blend_scan(dim: &Dimension, kept: &BTreeSet<ChunkPos>) -> Result<BlendScan, String> {
    let mut by_file: BTreeMap<(i32, i32), BTreeSet<u16>> = BTreeMap::new();
    for pos in kept {
        by_file.entry(anvil::region_of(*pos)).or_default().insert(anvil::slot_index(*pos));
    }
    let dir = dim.store_dir(Store::Region);
    let mut out = BlendScan::default();
    for ((rx, rz), wanted) in by_file {
        let name = anvil::region_name(rx, rz);
        let path = dir.join(&name);
        let Ok(bytes) = anvil::read_shared(&path, 1 << 30) else { continue };
        for slot in anvil::header_slots(&bytes).into_iter().filter(|s| wanted.contains(&s.index)) {
            let (kind, data) = record_of(&bytes, slot).map_err(|e| format!("{name}: {e}"))?;
            if kind & 0x80 != 0 {
                out.external += 1;
                continue;
            }
            let doc = Doc::parse(data).map_err(|e| format!("{name}: the chunk in slot {} does not parse ({e})", slot.index))?;
            if tag_of(&doc) == Some(TECTONIC_SAVED) {
                out.tagged += 1;
                out.files.entry(name.clone()).or_default().insert(slot.index);
            } else {
                out.untagged += 1;
            }
        }
    }
    Ok(out)
}

fn compress(kind: u8, payload: &[u8], level: u32) -> std::io::Result<Vec<u8>> {
    let level = flate2::Compression::new(level);
    match kind & 0x7f {
        1 => {
            let mut enc = flate2::write::GzEncoder::new(Vec::new(), level);
            enc.write_all(payload)?;
            enc.finish()
        }
        2 => {
            let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), level);
            enc.write_all(payload)?;
            enc.finish()
        }
        3 => Ok(payload.to_vec()),
        other => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("compression type {other}"))),
    }
}

/// `file` with the chunks in `slots` given [`TECTONIC_OLD`], each in its own
/// sectors: the header, every other chunk and every other byte of these
/// chunks' trees stay as they were. `Err` when a chunk would not fit its
/// sectors at any compression level, or is not tagged [`TECTONIC_SAVED`].
pub fn retag(file: &[u8], slots: &BTreeSet<u16>) -> Result<Vec<u8>, String> {
    let mut out = file.to_vec();
    let listed = anvil::header_slots(file);
    for slot in listed.iter().copied().filter(|s| slots.contains(&s.index)) {
        let (kind, data) = record_of(file, slot)?;
        if kind & 0x80 != 0 {
            return Err(format!("the chunk in slot {} is stored in a .mcc file", slot.index));
        }
        let mut doc = Doc::parse(data).map_err(|e| format!("the chunk in slot {} does not parse ({e})", slot.index))?;
        match doc.root.get_mut(TECTONIC_TAG) {
            Some(Node::Int(v)) if *v == TECTONIC_SAVED => *v = TECTONIC_OLD,
            _ => return Err(format!("the chunk in slot {} does not carry {TECTONIC_TAG} = {TECTONIC_SAVED}", slot.index)),
        }
        let payload = doc.payload().map_err(|e| e.to_string())?;
        let room = usize::from(slot.sector_count) * SECTOR_BYTES;
        // Minecraft compresses at zlib's default; another level is tried when
        // the default comes out a few bytes too long for the sectors.
        let packed = [6u32, 9, 8, 7, 5, 4, 3, 2, 1]
            .iter()
            .filter_map(|level| compress(kind, &payload, *level).ok())
            .find(|p| p.len() + 5 <= room)
            .ok_or_else(|| format!("the chunk in slot {} does not fit its {} sector(s) once rewritten", slot.index, slot.sector_count))?;
        let start = slot.offset_sectors as usize * SECTOR_BYTES;
        let record = &mut out[start..start + room];
        record.fill(0);
        record[..4].copy_from_slice(&((packed.len() + 1) as u32).to_be_bytes());
        record[4] = kind;
        record[5..5 + packed.len()].copy_from_slice(&packed);
    }
    Ok(out)
}

/// Is `after` `before` with the chunks in `slots` retagged, and nothing else?
/// The header and every byte outside those chunks' sectors the same; each of
/// those chunks the same tree with the tag [`TECTONIC_OLD`]. The count.
pub fn check_retagged(before: &[u8], after: &[u8], slots: &BTreeSet<u16>) -> Result<usize, String> {
    if before.len() != after.len() {
        return Err(format!("its length changed ({} -> {} bytes)", before.len(), after.len()));
    }
    if before[..2 * SECTOR_BYTES] != after[..2 * SECTOR_BYTES] {
        return Err("its header changed".to_string());
    }
    let listed = anvil::header_slots(before);
    let mut inside = vec![false; before.len().div_ceil(SECTOR_BYTES)];
    let mut done = 0;
    for slot in listed.iter().copied().filter(|s| slots.contains(&s.index)) {
        let (_, was) = record_of(before, slot)?;
        let (kind, is) = record_of(after, slot)?;
        let mut expected = Doc::parse(was).map_err(|e| format!("the chunk in slot {} did not parse before ({e})", slot.index))?;
        match expected.root.get_mut(TECTONIC_TAG) {
            Some(Node::Int(v)) => *v = TECTONIC_OLD,
            _ => return Err(format!("the chunk in slot {} had no {TECTONIC_TAG}", slot.index)),
        }
        let now = Doc::parse(is).map_err(|e| format!("the chunk in slot {} does not parse ({e})", slot.index))?;
        if now.root != expected.root || now.root_name != expected.root_name || kind & 0x80 != 0 {
            return Err(format!("the chunk in slot {} is not what it was with {TECTONIC_TAG} = {TECTONIC_OLD}", slot.index));
        }
        for sector in slot.offset_sectors as usize..slot.offset_sectors as usize + usize::from(slot.sector_count) {
            if let Some(s) = inside.get_mut(sector) {
                *s = true;
            }
        }
        done += 1;
    }
    if done != slots.len() {
        return Err(format!("{} of {} chunk(s) to retag are listed in it", done, slots.len()));
    }
    for (sector, retagged) in inside.iter().enumerate() {
        let from = sector * SECTOR_BYTES;
        let to = (from + SECTOR_BYTES).min(before.len());
        if !retagged && before[from..to] != after[from..to] {
            return Err(format!("sector {sector}, outside the retagged chunks, changed"));
        }
    }
    Ok(done)
}

/// A doc's container, for a line.
pub fn container_name(doc: &Doc) -> &'static str {
    match doc.container {
        Container::Gzip => "gzip",
        Container::Zlib => "zlib",
        Container::Plain => "plain",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbt::testing::{encode_ordered, gzip};
    use crate::nbt::Value;

    fn chunk(tag: Option<i32>) -> Vec<u8> {
        let mut entries = vec![("DataVersion", Value::Int(3465)), ("Status", Value::String("minecraft:full".into())), ("InhabitedTime", Value::Long(5))];
        if let Some(t) = tag {
            entries.push((TECTONIC_TAG, Value::Int(t)));
        }
        crate::nbt::testing::zlib(&encode_ordered(&entries))
    }

    fn region(chunks: &[(u16, Vec<u8>)]) -> Vec<u8> {
        let mut out = vec![0u8; SECTOR_BYTES * 2];
        for (slot, data) in chunks {
            let offset = out.len() / SECTOR_BYTES;
            out.extend_from_slice(&(data.len() as u32 + 1).to_be_bytes());
            out.push(2);
            out.extend_from_slice(data);
            while out.len() % SECTOR_BYTES != 0 {
                out.push(0);
            }
            let count = out.len() / SECTOR_BYTES - offset;
            let i = usize::from(*slot) * 4;
            out[i..i + 4].copy_from_slice(&(((offset as u32) << 8) | count as u32).to_be_bytes());
            out[SECTOR_BYTES + i..SECTOR_BYTES + i + 4].copy_from_slice(&(1_700_000_000u32 + u32::from(*slot)).to_be_bytes());
        }
        out
    }

    #[test]
    fn retagging_changes_the_tag_and_nothing_else() {
        let file = region(&[(0, chunk(Some(1))), (1, chunk(Some(1))), (5, chunk(None))]);
        let slots: BTreeSet<u16> = [0].into_iter().collect();
        let after = retag(&file, &slots).unwrap();
        assert_eq!(check_retagged(&file, &after, &slots).unwrap(), 1);
        // The other tagged chunk and the untagged one did not move or change.
        let untouched: BTreeSet<u16> = BTreeSet::new();
        assert!(check_retagged(&file, &after, &untouched).is_err(), "the retagged chunk's sectors changed");
        let (_, data) = record_of(&after, anvil::header_slots(&after)[0]).unwrap();
        assert_eq!(tag_of(&Doc::parse(data).unwrap()), Some(TECTONIC_OLD));
        // A chunk without the tag is refused, not invented.
        let none: BTreeSet<u16> = [5].into_iter().collect();
        assert!(retag(&file, &none).unwrap_err().contains("does not carry"));
    }

    #[test]
    fn a_second_change_in_a_retagged_chunk_is_caught() {
        let file = region(&[(0, chunk(Some(1)))]);
        let slots: BTreeSet<u16> = [0].into_iter().collect();
        let mut after = retag(&file, &slots).unwrap();
        // Re-encode the chunk with InhabitedTime changed as well.
        let slot = anvil::header_slots(&after)[0];
        let (_, data) = record_of(&after, slot).unwrap();
        let mut doc = Doc::parse(data).unwrap();
        *doc.root.get_mut("InhabitedTime").unwrap() = Node::Long(6);
        let packed = compress(2, &doc.payload().unwrap(), 6).unwrap();
        let start = slot.offset_sectors as usize * SECTOR_BYTES;
        after[start..start + 4].copy_from_slice(&((packed.len() + 1) as u32).to_be_bytes());
        after[start + 5..start + 5 + packed.len()].copy_from_slice(&packed);
        assert!(check_retagged(&file, &after, &slots).unwrap_err().contains("is not what it was"));
    }

    #[test]
    fn level_edit_changes_the_seed_and_the_spawn_height_only() {
        let raw = gzip(&encode_ordered(&[(
            "Data",
            Value::Compound(
                [
                    ("SpawnX".to_string(), Value::Int(10)),
                    ("SpawnY".to_string(), Value::Int(-64)),
                    ("WorldGenSettings".to_string(), Value::Compound([("seed".to_string(), Value::Long(7))].into_iter().collect())),
                ]
                .into_iter()
                .collect(),
            ),
        )]));
        let doc = edit_level(&raw, Some(42), Some(SPAWN_SEARCH_Y)).unwrap();
        let mut expected = Doc::parse(&raw).unwrap();
        *expected.root.at_mut(&["Data", "WorldGenSettings", "seed"]).unwrap() = Node::Long(42);
        *expected.root.at_mut(&["Data", "SpawnY"]).unwrap() = Node::Int(SPAWN_SEARCH_Y);
        assert_eq!(doc, expected);
        assert!(edit_level(&gzip(&encode_ordered(&[("Data", Value::Compound(Default::default()))])), Some(1), None).is_err());
    }

    #[test]
    fn spawn_markers_and_pupfish_come_out_by_name() {
        let raw = encode_ordered(&[
            ("icraft_priest_tower_done", Value::Int(1)),
            ("icraft_chunky_pregen_started", Value::Int(1)),
            (
                LEVEL_DATA_KEY,
                Value::Compound(
                    [("icraft_cherry_spawn_exhausted".to_string(), Value::Int(1)), ("icraft_mobgriefing_default_set".to_string(), Value::Int(1))].into_iter().collect(),
                ),
            ),
        ]);
        let (doc, gone) = edit_spawn_markers(&raw).unwrap().unwrap();
        assert_eq!(gone, vec!["icraft_priest_tower_done".to_string(), format!("{LEVEL_DATA_KEY}.icraft_cherry_spawn_exhausted")]);
        assert!(doc.root.get("icraft_chunky_pregen_started").is_some(), "the pregeneration flag stays");
        assert!(doc.root.at(&[LEVEL_DATA_KEY, "icraft_mobgriefing_default_set"]).is_some());
        assert!(edit_spawn_markers(&encode_ordered(&[("other", Value::Int(1))])).unwrap().is_none());

        let am = gzip(&encode_ordered(&[(
            "data",
            Value::Compound([("PupfishChunkX".to_string(), Value::Int(3)), ("PupfishChunkZ".to_string(), Value::Int(4)), ("beachedCachalotSpawnDelay".to_string(), Value::Int(9))].into_iter().collect()),
        )]));
        let doc = edit_pupfish(&am).unwrap().unwrap();
        assert!(doc.root.at(&["data", "PupfishChunkX"]).is_none() && doc.root.at(&["data", "beachedCachalotSpawnDelay"]).is_some());
    }

    #[test]
    fn the_hash_lines_are_empty_for_a_plan_of_chunks_only() {
        assert!(Edits::default().hash_lines().is_empty());
        let e = Edits { seed_before: Some(1), new_seed: Some(2), blend: true, spawn_search: true, spawn_y: 64, reset_players: vec!["a".into()] };
        assert_eq!(e.hash_lines(), vec!["seed_from=1", "seed=2", "blend=kept-chunks", "spawn=search y=64", "reset_player=a"]);
        let back = Edits::from_json(&Edits { reset_players: vec!["00000000-0000-4000-8000-000000000001".into()], ..e.clone() }.to_json()).unwrap();
        assert_eq!(back.new_seed, Some(2));
        assert_eq!(back.reset_players, vec!["00000000-0000-4000-8000-000000000001".to_string()]);
    }

    #[test]
    fn asked_edits_read_back_from_their_tokens() {
        let mut w = WorldEdits::default();
        for t in ["new_seed=-5", "blend=on", "spawn_search=on", "reset_players=Someone, someone ,Other"] {
            let (k, v) = t.split_once('=').unwrap();
            assert!(w.set(k, v).unwrap());
        }
        assert_eq!(w.reset_players, vec!["Someone".to_string(), "Other".to_string()]);
        let mut again = WorldEdits::default();
        for t in w.tokens() {
            let (k, v) = t.split_once('=').unwrap();
            again.set(k, v).unwrap();
        }
        assert_eq!(again, w);
        assert!(!w.set("bed_radius", "1").unwrap());
        assert!(w.set("new_seed", "soon").is_err());
    }
}
