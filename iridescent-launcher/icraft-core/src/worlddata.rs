//! The small files a world keeps positions in: `level.dat`, player data, and
//! the saved data of the mods whose state is tied to places.
//!
//! Each reader turns one file into plain structs. Where the format came from:
//!
//! | File | Format established from |
//! |---|---|
//! | `level.dat`, `playerdata/<uuid>.dat` | vanilla; checked against the live world |
//! | `data/waystones.dat` (Waystones 14.1.20) | the live world's 345 entries; every waystone a player has activated resolves against it |
//! | `data/mca_villages.dat` (MCA Reborn 7.6.15) | the live world's 9 villages |
//! | `data/large_ore_deposits.dat` (Large Ore Deposits 8.1.9) | the live world's 668 entries |
//! | `data/openpartiesandclaims/player-claims/<uuid>.nbt` (OPAC 0.25.10) | the mod's serializer classes, read and write side. **Not checked against a populated file: nobody on the live world has claimed a chunk.** Container (uncompressed NBT, `username`, an empty `dimensions`) matches the five real files. |
//! | `data/create_tracks.dat` (Create 6.0.8) | the mod's classes only. **No such file exists on the live world** (no train track has been laid). |
//!
//! Like the rest of the Customizer's analysis this only reads, through
//! [`anvil::read_shared`], and is safe while the server runs. Minecraft
//! replaces these files by writing a new one and renaming, so a read sees one
//! version or the other; a read that still fails is tried again before it is
//! reported.

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Duration;

use crate::anvil::{self, ChunkPos, OVERWORLD};
use crate::nbt::{self, Value};

/// No file read here is anywhere near this (`level.dat` is under 1 MiB).
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
const READ_ATTEMPTS: u32 = 3;
const READ_RETRY_PAUSE: Duration = Duration::from_millis(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct BlockPos {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

impl BlockPos {
    pub fn chunk(&self) -> ChunkPos {
        (self.x >> 4, self.z >> 4)
    }

    /// Minecraft's packed position (1.14+): x in the top 26 bits, z in the
    /// next 26, y in the low 12, each signed.
    pub fn from_long(v: i64) -> Self {
        BlockPos { x: (v >> 38) as i32, y: ((v << 52) >> 52) as i32, z: ((v << 26) >> 38) as i32 }
    }

    /// `{X, Y, Z}` or `{x, y, z}` in a compound.
    fn from_compound(v: &Value) -> Option<Self> {
        let pick = |upper: &str, lower: &str| v.get(upper).or_else(|| v.get(lower)).and_then(Value::as_i32);
        Some(BlockPos { x: pick("X", "x")?, y: pick("Y", "y")?, z: pick("Z", "z")? })
    }
}

impl std::fmt::Display for BlockPos {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}, {}, {}", self.x, self.y, self.z)
    }
}

/// Four ints, most significant first: how Minecraft stores a UUID in NBT.
fn uuid_from_ints(ints: &[i32]) -> Option<String> {
    let [a, b, c, d] = <[i32; 4]>::try_from(ints).ok()?;
    let hex = format!("{:08x}{:08x}{:08x}{:08x}", a as u32, b as u32, c as u32, d as u32);
    Some(format!("{}-{}-{}-{}-{}", &hex[..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..]))
}

/// `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
pub fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

/// 3 = derived from the player's name (an `online-mode=false` server);
/// 4 = issued by Mojang (an `online-mode=true` server).
pub fn uuid_version(uuid: &str) -> Option<u32> {
    uuid.chars().nth(14).and_then(|c| c.to_digit(16))
}

/// Read and parse an NBT file. `Ok(None)` = the file is not there. Tried a few
/// times, so a file caught in the instant the server replaces it still reads.
pub fn read_nbt(path: &Path) -> Result<Option<Value>, String> {
    let mut last = String::new();
    for attempt in 0..READ_ATTEMPTS {
        if attempt > 0 {
            std::thread::sleep(READ_RETRY_PAUSE);
        }
        match anvil::read_shared(path, MAX_FILE_BYTES) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => last = e.to_string(),
            Ok(raw) => match nbt::parse_bytes(&raw) {
                Ok(v) => return Ok(Some(v)),
                Err(e) => last = e.to_string(),
            },
        }
    }
    Err(format!("{}: {last}", path.display()))
}

/// `SavedData` files wrap their content in a `data` compound.
fn saved_data(path: &Path) -> Result<Option<Value>, String> {
    match read_nbt(path)? {
        None => Ok(None),
        Some(root) => match root.get("data") {
            Some(data) => Ok(Some(data.clone())),
            None => Err(format!("{}: no 'data' compound", path.display())),
        },
    }
}

// =============================================================================
// server.properties, usercache.json
// =============================================================================

/// One key of server.properties, trimmed. `None`: no file or no such key.
pub fn server_property(server_dir: &Path, key: &str) -> Option<String> {
    let raw = anvil::read_shared(&server_dir.join("server.properties"), MAX_FILE_BYTES).ok()?;
    let text = String::from_utf8_lossy(&raw);
    text.lines().find_map(|line| {
        let line = line.trim_start_matches('\u{feff}').trim();
        if line.starts_with('#') || line.starts_with('!') {
            return None;
        }
        let (k, v) = line.split_once('=')?;
        (k.trim() == key).then(|| v.trim().to_string())
    })
}

/// uuid (lowercase) -> last known name, from the server's `usercache.json`.
/// Best-effort: names only label the report.
pub fn read_usercache(server_dir: &Path) -> BTreeMap<String, String> {
    let mut names = BTreeMap::new();
    let Ok(raw) = anvil::read_shared(&server_dir.join("usercache.json"), MAX_FILE_BYTES) else { return names };
    let Ok(serde_json::Value::Array(entries)) = serde_json::from_slice::<serde_json::Value>(&raw) else { return names };
    for e in entries {
        if let (Some(uuid), Some(name)) = (e.get("uuid").and_then(|v| v.as_str()), e.get("name").and_then(|v| v.as_str())) {
            names.insert(uuid.to_ascii_lowercase(), name.to_string());
        }
    }
    names
}

// =============================================================================
// level.dat
// =============================================================================

#[derive(Debug, Clone, PartialEq)]
pub struct LevelInfo {
    /// World spawn (always in the overworld on 1.20.1).
    pub spawn: BlockPos,
    pub seed: Option<i64>,
    pub data_version: Option<i64>,
    pub version_name: Option<String>,
    /// Epoch milliseconds of the last save.
    pub last_played_ms: Option<i64>,
    /// `level.dat` did not read and `level.dat_old` was used.
    pub from_old: bool,
}

fn level_from(root: &Value) -> Option<LevelInfo> {
    let data = root.get("Data")?;
    let coord = |k: &str| data.get(k).and_then(Value::as_i32);
    Some(LevelInfo {
        spawn: BlockPos { x: coord("SpawnX")?, y: coord("SpawnY").unwrap_or(0), z: coord("SpawnZ")? },
        seed: data.at(&["WorldGenSettings", "seed"]).and_then(Value::as_i64),
        data_version: data.get("DataVersion").and_then(Value::as_i64),
        version_name: data.at(&["Version", "Name"]).and_then(Value::as_str).map(str::to_string),
        last_played_ms: data.get("LastPlayed").and_then(Value::as_i64),
        from_old: false,
    })
}

/// World spawn and identity. An unreadable `level.dat` falls back to
/// `level.dat_old`; with neither, there is no world to analyse.
pub fn read_level(world: &Path) -> Result<LevelInfo, String> {
    let primary = match read_nbt(&world.join("level.dat")) {
        Ok(Some(root)) => match level_from(&root) {
            Some(info) => return Ok(info),
            None => "level.dat has no Data.SpawnX / SpawnZ".to_string(),
        },
        Ok(None) => "there is no level.dat".to_string(),
        Err(e) => e,
    };
    match read_nbt(&world.join("level.dat_old")) {
        Ok(Some(root)) => match level_from(&root) {
            Some(info) => Ok(LevelInfo { from_old: true, ..info }),
            None => Err(primary),
        },
        _ => Err(primary),
    }
}

// =============================================================================
// playerdata
// =============================================================================

/// A player's respawn point: `SpawnX/Y/Z` + `SpawnDimension` in their data.
/// Set by sleeping in a bed, by a respawn anchor, or by `/spawnpoint`
/// (`forced`).
#[derive(Debug, Clone, PartialEq)]
pub struct Bed {
    pub dim: String,
    pub pos: BlockPos,
    pub forced: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Player {
    pub uuid: String,
    pub name: Option<String>,
    pub bed: Option<Bed>,
    /// Where they logged out: dimension and block position.
    pub last_pos: Option<(String, BlockPos)>,
    /// Waystones they have activated (waystone UUIDs).
    pub waystones: Vec<String>,
    /// `<uuid>.dat` did not read and `<uuid>.dat_old` was used.
    pub from_old: bool,
}

impl Player {
    /// Name if known, else the UUID.
    pub fn label(&self) -> &str {
        self.name.as_deref().unwrap_or(&self.uuid)
    }
}

fn player_from(uuid: &str, root: &Value) -> Player {
    let int = |k: &str| root.get(k).and_then(Value::as_i32);
    let bed = match (int("SpawnX"), int("SpawnZ")) {
        (Some(x), Some(z)) => Some(Bed {
            // Vanilla leaves SpawnDimension out for the overworld on old saves.
            dim: root.get("SpawnDimension").and_then(Value::as_str).unwrap_or(OVERWORLD).to_string(),
            pos: BlockPos { x, y: int("SpawnY").unwrap_or(0), z },
            forced: root.get("SpawnForced").and_then(Value::as_i64).unwrap_or(0) != 0,
        }),
        _ => None,
    };
    let last_pos = root.get("Pos").and_then(Value::as_list).and_then(|p| {
        let c: Vec<f64> = p.iter().filter_map(Value::as_f64).collect();
        (c.len() == 3 && c.iter().all(|v| v.is_finite())).then(|| {
            let dim = root.get("Dimension").and_then(Value::as_str).unwrap_or(OVERWORLD).to_string();
            (dim, BlockPos { x: c[0].floor() as i32, y: c[1].floor() as i32, z: c[2].floor() as i32 })
        })
    });
    // Waystones (via Balm) keeps the list under the player's persisted Forge
    // data; one player on the live world also has a stale top-level copy.
    let mut waystones: Vec<String> = Vec::new();
    for path in [&["ForgeData", "PlayerPersisted", "BalmData", "WaystonesData", "Waystones"][..], &["BalmData", "WaystonesData", "Waystones"][..]] {
        for id in root.at(path).and_then(Value::as_list).unwrap_or(&[]) {
            if let Some(id) = id.as_str() {
                let id = id.to_ascii_lowercase();
                if !waystones.contains(&id) {
                    waystones.push(id);
                }
            }
        }
    }
    Player { uuid: uuid.to_string(), name: None, bed, last_pos, waystones, from_old: false }
}

/// Every player with a file in `playerdata/`, sorted by UUID. A `.dat` that
/// does not read falls back to its `.dat_old`; if that fails too the whole
/// read is an error, because a player whose bed is unknown cannot be protected.
pub fn read_players(world: &Path, names: &BTreeMap<String, String>) -> Result<Vec<Player>, String> {
    let dir = world.join("playerdata");
    let mut uuids: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&dir).into_iter().flatten().filter_map(|e| e.ok()) {
        let Ok(name) = entry.file_name().into_string() else { continue };
        if let Some(stem) = name.strip_suffix(".dat") {
            if is_uuid(stem) {
                uuids.push(stem.to_ascii_lowercase());
            }
        }
    }
    uuids.sort();
    let mut players = Vec::new();
    for uuid in uuids {
        let mut player = match read_nbt(&dir.join(format!("{uuid}.dat"))) {
            Ok(Some(root)) => player_from(&uuid, &root),
            other => {
                let why = match other {
                    Err(e) => e,
                    _ => format!("{uuid}.dat vanished while it was being read"),
                };
                match read_nbt(&dir.join(format!("{uuid}.dat_old"))) {
                    Ok(Some(root)) => Player { from_old: true, ..player_from(&uuid, &root) },
                    _ => return Err(format!("player data does not read, and neither does its .dat_old ({why})")),
                }
            }
        };
        player.name = names.get(&uuid).cloned();
        players.push(player);
    }
    Ok(players)
}

// =============================================================================
// Open Parties and Claims
// =============================================================================

/// The owner OPAC files server claims under.
pub const OPAC_SERVER_UUID: &str = "00000000-0000-0000-0000-000000000000";
/// The owner OPAC moves expired claims to.
pub const OPAC_EXPIRED_UUID: &str = "00000000-0000-0000-0000-000000000001";

#[derive(Debug, Clone, PartialEq)]
pub struct Claim {
    pub dim: String,
    pub chunk: ChunkPos,
    pub forceloaded: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClaimOwner {
    pub uuid: String,
    /// As OPAC recorded it (`"Server"` and `"Expiration"`, quotes included,
    /// for the two reserved owners).
    pub name: String,
    pub claims: Vec<Claim>,
}

impl ClaimOwner {
    pub fn label(&self) -> String {
        match self.uuid.as_str() {
            OPAC_SERVER_UUID => "server claims".to_string(),
            OPAC_EXPIRED_UUID => "expired claims".to_string(),
            _ if self.name.is_empty() => self.uuid.clone(),
            _ => self.name.clone(),
        }
    }
}

/// From `PlayerClaimInfoNbtSerializer` / `PlayerDimensionClaimsNbtSerializer` /
/// `PlayerChunkClaimNbtSerializer` (OPAC 0.25.10):
///
/// ```text
/// username: String, confirmedActivity: Long,
/// dimensions: { "<namespace:path>": { claims: [ {
///     state: { subConfigIndex: Int, forceloaded: Byte },
///     positions: [ { x: Int, z: Int }, ... ]        <- chunk coordinates
/// } ] } }
/// ```
fn claims_from(uuid: &str, root: &Value) -> Result<ClaimOwner, String> {
    let mut claims = Vec::new();
    let dims = match root.get("dimensions") {
        Some(Value::Compound(dims)) => dims,
        Some(_) => return Err("'dimensions' is not a compound".to_string()),
        None => return Err("no 'dimensions' compound".to_string()),
    };
    for (dim, entry) in dims {
        for group in entry.get("claims").and_then(Value::as_list).unwrap_or(&[]) {
            let forceloaded = group.at(&["state", "forceloaded"]).and_then(Value::as_i64).unwrap_or(0) != 0;
            for pos in group.get("positions").and_then(Value::as_list).unwrap_or(&[]) {
                match (pos.get("x").and_then(Value::as_i32), pos.get("z").and_then(Value::as_i32)) {
                    (Some(x), Some(z)) => claims.push(Claim { dim: dim.clone(), chunk: (x, z), forceloaded }),
                    // A position this reader cannot place must not be dropped
                    // silently: it is a chunk somebody claimed.
                    _ => return Err(format!("a claim position in {dim} has no x/z")),
                }
            }
        }
    }
    claims.sort_by(|a, b| (&a.dim, a.chunk).cmp(&(&b.dim, b.chunk)));
    Ok(ClaimOwner {
        uuid: uuid.to_string(),
        name: root.get("username").and_then(Value::as_str).unwrap_or("").to_string(),
        claims,
    })
}

/// Every owner file in `data/openpartiesandclaims/player-claims/`: players,
/// plus the two reserved owners. `Ok(None)` = the folder is not there (the mod
/// has never run on this world). Any file that does not read is an error: a
/// claim that cannot be seen cannot be protected.
pub fn read_claims(world: &Path) -> Result<Option<Vec<ClaimOwner>>, String> {
    let dir = world.join("data").join("openpartiesandclaims").join("player-claims");
    if !dir.is_dir() {
        return Ok(None);
    }
    let mut uuids: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| format!("{}: {e}", dir.display()))?;
        let Ok(name) = entry.file_name().into_string() else { continue };
        if let Some(stem) = name.strip_suffix(".nbt") {
            if is_uuid(stem) {
                uuids.push(stem.to_string());
            }
        }
    }
    uuids.sort();
    let mut owners = Vec::new();
    for uuid in uuids {
        let path = dir.join(format!("{uuid}.nbt"));
        // A file deleted between the listing and the read has no claims left.
        if let Some(root) = read_nbt(&path)? {
            owners.push(claims_from(&uuid.to_ascii_lowercase(), &root).map_err(|e| format!("{}: {e}", path.display()))?);
        }
    }
    Ok(Some(owners))
}

// =============================================================================
// Waystones
// =============================================================================

#[derive(Debug, Clone, PartialEq)]
pub struct Waystone {
    pub uid: String,
    pub name: String,
    pub dim: String,
    pub pos: BlockPos,
    /// `VILLAGE`, `WILDERNESS`, `PLAYER`, `UNKNOWN`, ...
    pub origin: String,
    pub global: bool,
}

impl Waystone {
    /// Placed by a player rather than generated with a village or a tower.
    pub fn placed_by_player(&self) -> bool {
        self.origin.eq_ignore_ascii_case("PLAYER")
    }

    /// Does a player use it: activated by somebody (`activated` holds the
    /// UUIDs players have in their data), placed by a player, or made global?
    pub fn is_used(&self, activated: &std::collections::BTreeSet<&str>) -> bool {
        self.global || self.placed_by_player() || activated.contains(self.uid.as_str())
    }

    /// Its name, or `unnamed <first 8 of the uid>`: most generated waystones
    /// have no name until somebody activates them.
    pub fn label(&self) -> String {
        if self.name.is_empty() {
            format!("unnamed {}", &self.uid[..self.uid.len().min(8)])
        } else {
            self.name.clone()
        }
    }
}

/// `data/waystones.dat`: every waystone the server knows, generated and
/// player-placed alike. `Ok(None)` = no such file.
pub fn read_waystones(world: &Path) -> Result<Option<Vec<Waystone>>, String> {
    let path = world.join("data").join("waystones.dat");
    let Some(data) = saved_data(&path)? else { return Ok(None) };
    let mut out = Vec::new();
    for w in data.get("Waystones").and_then(Value::as_list).unwrap_or(&[]) {
        let (Some(pos), Some(uid)) = (
            w.get("BlockPos").and_then(BlockPos::from_compound),
            w.get("WaystoneUid").and_then(Value::as_ints).and_then(uuid_from_ints),
        ) else {
            return Err(format!("{}: a waystone has no BlockPos or WaystoneUid", path.display()));
        };
        let text = |k: &str| w.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        out.push(Waystone {
            uid,
            name: text("Name"),
            dim: w.get("World").and_then(Value::as_str).unwrap_or(OVERWORLD).to_string(),
            pos,
            origin: text("Origin"),
            global: w.get("IsGlobal").and_then(Value::as_i64).unwrap_or(0) != 0,
        });
    }
    Ok(Some(out))
}

// =============================================================================
// Create train tracks
// =============================================================================

/// One node of a Create track graph.
#[derive(Debug, Clone, PartialEq)]
pub struct TrackNode {
    /// Which graph (network) it belongs to, numbered in file order.
    pub graph: usize,
    pub dim: String,
    pub pos: BlockPos,
}

/// `data/create_tracks.dat`, from `RailwaySavedData` / `TrackGraph` /
/// `TrackNodeLocation` / `DimensionPalette` (Create 6.0.8):
///
/// ```text
/// RailGraphs: [ { Nodes: [ { Location: { X, Y, Z, D? } } ] } ]
/// DimensionPalette: [ { Id: "<namespace:path>" } ]
/// ```
///
/// A node's X/Y/Z are **twice** the block coordinates (nodes sit on half
/// blocks); `D` indexes the palette, and a missing or out-of-range `D` means
/// the overworld. `Ok(None)` = no such file.
pub fn read_create_tracks(world: &Path) -> Result<Option<Vec<TrackNode>>, String> {
    let path = world.join("data").join("create_tracks.dat");
    let Some(data) = saved_data(&path)? else { return Ok(None) };
    let palette: Vec<&str> = data
        .get("DimensionPalette")
        .and_then(Value::as_list)
        .unwrap_or(&[])
        .iter()
        .map(|d| d.get("Id").and_then(Value::as_str).unwrap_or(OVERWORLD))
        .collect();
    let mut out = Vec::new();
    for (graph, g) in data.get("RailGraphs").and_then(Value::as_list).unwrap_or(&[]).iter().enumerate() {
        for node in g.get("Nodes").and_then(Value::as_list).unwrap_or(&[]) {
            let Some(loc) = node.get("Location") else { continue };
            let Some(doubled) = BlockPos::from_compound(loc) else { continue };
            let dim = loc
                .get("D")
                .and_then(Value::as_i64)
                .and_then(|d| usize::try_from(d).ok())
                .and_then(|d| palette.get(d).copied())
                .unwrap_or(OVERWORLD);
            out.push(TrackNode {
                graph,
                dim: dim.to_string(),
                pos: BlockPos { x: doubled.x >> 1, y: doubled.y >> 1, z: doubled.z >> 1 },
            });
        }
    }
    Ok(Some(out))
}

// =============================================================================
// MCA villages, large ore deposits (per-dimension saved data)
// =============================================================================

#[derive(Debug, Clone, PartialEq)]
pub struct Village {
    pub id: i64,
    pub name: String,
    /// Each building: its type and a block that stands for it (its centre).
    pub buildings: Vec<(String, BlockPos)>,
}

/// `<dimension>/data/mca_villages.dat`. `Ok(None)` = no such file.
pub fn read_mca_villages(data_dir: &Path) -> Result<Option<Vec<Village>>, String> {
    let Some(data) = saved_data(&data_dir.join("mca_villages.dat"))? else { return Ok(None) };
    let mut out = Vec::new();
    for v in data.get("villages").and_then(Value::as_list).unwrap_or(&[]) {
        let mut buildings = Vec::new();
        for b in v.get("buildings").and_then(Value::as_list).unwrap_or(&[]) {
            let coord = |k: &str| b.get(k).and_then(Value::as_i32);
            if let (Some(x), Some(z)) = (coord("posX"), coord("posZ")) {
                let kind = b.get("type").and_then(Value::as_str).unwrap_or("building").to_string();
                buildings.push((kind, BlockPos { x, y: coord("posY").unwrap_or(0), z }));
            }
        }
        out.push(Village {
            id: v.get("id").and_then(Value::as_i64).unwrap_or(-1),
            name: v.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
            buildings,
        });
    }
    Ok(Some(out))
}

#[derive(Debug, Clone, PartialEq)]
pub struct OreDeposit {
    pub name: String,
    pub pos: BlockPos,
}

/// `<dimension>/data/large_ore_deposits.dat`: the deposits the mod has
/// generated (`generated[].pos`, a packed block position). `Ok(None)` = no
/// such file.
pub fn read_ore_deposits(data_dir: &Path) -> Result<Option<Vec<OreDeposit>>, String> {
    let Some(data) = saved_data(&data_dir.join("large_ore_deposits.dat"))? else { return Ok(None) };
    let mut out = Vec::new();
    for d in data.get("generated").and_then(Value::as_list).unwrap_or(&[]) {
        if let Some(pos) = d.get("pos").and_then(Value::as_i64) {
            out.push(OreDeposit {
                name: d.get("name").and_then(Value::as_str).unwrap_or("?").to_string(),
                pos: BlockPos::from_long(pos),
            });
        }
    }
    Ok(Some(out))
}

/// Test worlds' small files. Not compiled into the launcher.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use crate::nbt::testing::{compound, encode, gzip, string};
    use std::fs;

    pub fn write_gz(path: &Path, root: &Value) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, gzip(&encode(root))).unwrap();
    }

    pub fn write_level(world: &Path, spawn: (i32, i32, i32)) {
        let data = compound(vec![
            ("SpawnX", Value::Int(spawn.0)),
            ("SpawnY", Value::Int(spawn.1)),
            ("SpawnZ", Value::Int(spawn.2)),
            ("DataVersion", Value::Int(3465)),
            ("LastPlayed", Value::Long(1_791_728_884_631)),
            ("Version", compound(vec![("Name", string("1.20.1")), ("Id", Value::Int(3465))])),
            ("WorldGenSettings", compound(vec![("seed", Value::Long(4_242_424_242_424_242_424))])),
        ]);
        write_gz(&world.join("level.dat"), &compound(vec![("Data", data)]));
    }

    /// A player with a bed (block position + dimension), standing at `at`.
    pub fn player_nbt(bed: Option<(&str, (i32, i32, i32))>, at: (&str, (f64, f64, f64)), waystones: &[&str]) -> Value {
        let mut entries = vec![
            ("Dimension", string(at.0)),
            ("Pos", Value::List(vec![Value::Double(at.1 .0), Value::Double(at.1 .1), Value::Double(at.1 .2)])),
        ];
        if let Some((dim, (x, y, z))) = bed {
            entries.push(("SpawnX", Value::Int(x)));
            entries.push(("SpawnY", Value::Int(y)));
            entries.push(("SpawnZ", Value::Int(z)));
            entries.push(("SpawnDimension", string(dim)));
            entries.push(("SpawnForced", Value::Byte(0)));
        }
        let list = Value::List(waystones.iter().map(|w| string(w)).collect());
        let balm = compound(vec![("WaystonesData", compound(vec![("Waystones", list)]))]);
        entries.push(("ForgeData", compound(vec![("PlayerPersisted", compound(vec![("BalmData", balm)]))])));
        compound(entries)
    }

    pub fn write_player(world: &Path, uuid: &str, nbt: &Value) {
        write_gz(&world.join("playerdata").join(format!("{uuid}.dat")), nbt);
    }

    /// An OPAC owner file, laid out as the mod's serializer writes it.
    pub fn write_claims(world: &Path, uuid: &str, username: &str, claims: &[(&str, bool, &[ChunkPos])]) {
        let mut dims: BTreeMap<String, Vec<Value>> = BTreeMap::new();
        for (dim, forceloaded, positions) in claims {
            let positions: Vec<Value> =
                positions.iter().map(|(x, z)| compound(vec![("x", Value::Int(*x)), ("z", Value::Int(*z))])).collect();
            let state = compound(vec![("subConfigIndex", Value::Int(-1)), ("forceloaded", Value::Byte(*forceloaded as i8))]);
            dims.entry(dim.to_string())
                .or_default()
                .push(compound(vec![("state", state), ("positions", Value::List(positions))]));
        }
        let dims: BTreeMap<String, Value> =
            dims.into_iter().map(|(dim, groups)| (dim, compound(vec![("claims", Value::List(groups))]))).collect();
        let root = compound(vec![
            ("username", string(username)),
            ("confirmedActivity", Value::Long(3_516_471_659)),
            ("dimensions", Value::Compound(dims)),
        ]);
        let path = world.join("data").join("openpartiesandclaims").join("player-claims").join(format!("{uuid}.nbt"));
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        // OPAC writes these uncompressed.
        fs::write(path, encode(&root)).unwrap();
    }

    /// `(uid ints, name, dimension, block position, origin)`
    pub fn write_waystones(world: &Path, waystones: &[([i32; 4], &str, &str, (i32, i32, i32), &str)]) {
        let list: Vec<Value> = waystones
            .iter()
            .map(|(uid, name, dim, (x, y, z), origin)| {
                compound(vec![
                    ("Type", string("waystones:waystone")),
                    ("BlockPos", compound(vec![("X", Value::Int(*x)), ("Y", Value::Int(*y)), ("Z", Value::Int(*z))])),
                    ("World", string(dim)),
                    ("Name", string(name)),
                    ("IsGlobal", Value::Byte(0)),
                    ("WaystoneUid", Value::IntArray(uid.to_vec())),
                    ("Origin", string(origin)),
                ])
            })
            .collect();
        let root = compound(vec![("DataVersion", Value::Int(3465)), ("data", compound(vec![("Waystones", Value::List(list))]))]);
        write_gz(&world.join("data").join("waystones.dat"), &root);
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use crate::nbt::testing::{compound, encode, string};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    fn temp_world() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "icraft-worlddata-test-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const P1: &str = "0e0c6371-8599-3a43-a117-30cb7e62c579"; // offline UUID of "Player_One"
    const P3: &str = "bc24d5cc-490a-3d10-94be-7dad4e728856"; // offline UUID of "Player_Three"

    #[test]
    fn packed_positions_and_uuids_decode_like_the_live_world() {
        // Values and their meaning as in a real world's files (the ore deposit and waystone ones from the live world).
        assert_eq!(BlockPos::from_long(-498_903_396_511_719), BlockPos { x: -1815, y: 25, z: 1121 });
        assert_eq!(BlockPos::from_long(-530_239_484_657_651), BlockPos { x: -1930, y: 13, z: -528 });
        assert_eq!(BlockPos::from_long(188_841_126_498_371), BlockPos { x: 687, y: 67, z: 1081 });
        assert_eq!(BlockPos { x: 687, y: 67, z: 1080 }.chunk(), (42, 67));
        assert_eq!(BlockPos { x: -1, y: 0, z: -17 }.chunk(), (-1, -2));
        assert_eq!(
            uuid_from_ints(&[-901_396_754, 1_764_246_887, -1_678_078_288, -154_478_235]).as_deref(),
            Some("ca45c6ee-6928-4567-9bfa-8eb0f6cad965")
        );
        assert_eq!(uuid_from_ints(&[1, 2, 3]), None);
        assert!(is_uuid(P1));
        assert!(!is_uuid("0e0c6371-8599-3a43-a117-30cb7e62c57")); // short
        assert!(!is_uuid("0e0c6371x8599-3a43-a117-30cb7e62c579"));
        assert_eq!(uuid_version(P1), Some(3)); // offline-mode UUID
        assert_eq!(uuid_version("ca45c6ee-6928-4567-9bfa-8eb0f6cad965"), Some(4));
    }

    #[test]
    fn level_dat_gives_the_spawn_and_falls_back_to_the_old_copy() {
        let world = temp_world();
        assert!(read_level(&world).is_err());
        write_level(&world, (672, -64, 1072));
        let level = read_level(&world).unwrap();
        assert_eq!(level.spawn, BlockPos { x: 672, y: -64, z: 1072 });
        assert_eq!(level.spawn.chunk(), (42, 67));
        assert_eq!(level.seed, Some(4_242_424_242_424_242_424));
        assert_eq!(level.version_name.as_deref(), Some("1.20.1"));
        assert!(!level.from_old);
        // A torn level.dat: the previous save is used, and says so.
        fs::copy(world.join("level.dat"), world.join("level.dat_old")).unwrap();
        fs::write(world.join("level.dat"), b"\x1f\x8b\x08 torn").unwrap();
        let level = read_level(&world).unwrap();
        assert!(level.from_old);
        assert_eq!(level.spawn.chunk(), (42, 67));
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn players_beds_positions_and_waystones() {
        let world = temp_world();
        assert_eq!(read_players(&world, &BTreeMap::new()), Ok(vec![])); // no playerdata folder
        let way = "4ffd3f52-e39d-469d-a935-3497b58ac3cd";
        write_player(&world, P1, &player_nbt(Some((OVERWORLD, (687, 67, 1080))), (OVERWORLD, (656.9, 65.0, 863.1)), &[way]));
        // No bed, standing in the Nether at negative coordinates.
        write_player(&world, P3, &player_nbt(None, ("minecraft:the_nether", (-0.5, 70.0, -16.2)), &[]));
        // Files Minecraft and mods keep next to them.
        fs::write(world.join("playerdata").join(format!("{P1}.dat_old")), b"old").unwrap();
        fs::write(world.join("playerdata").join(format!("{P1}.cosarmor")), b"mod").unwrap();
        fs::write(world.join("playerdata").join("notes.dat"), b"x").unwrap();

        let names: BTreeMap<String, String> = [(P1.to_string(), "Player_One".to_string())].into();
        let players = read_players(&world, &names).unwrap();
        assert_eq!(players.len(), 2);
        let p1 = &players[0];
        assert_eq!(p1.label(), "Player_One");
        let bed = p1.bed.as_ref().unwrap();
        assert_eq!((bed.dim.as_str(), bed.pos.chunk(), bed.forced), (OVERWORLD, (42, 67), false));
        assert_eq!(p1.last_pos, Some((OVERWORLD.to_string(), BlockPos { x: 656, y: 65, z: 863 })));
        assert_eq!(p1.waystones, vec![way.to_string()]);
        let p3 = &players[1];
        assert_eq!(p3.label(), P3);
        assert_eq!(p3.bed, None);
        assert_eq!(p3.last_pos, Some(("minecraft:the_nether".to_string(), BlockPos { x: -1, y: 70, z: -17 })));

        // A torn .dat with a good .dat_old is read from the old one...
        let good = fs::read(world.join("playerdata").join(format!("{P1}.dat"))).unwrap();
        fs::write(world.join("playerdata").join(format!("{P1}.dat_old")), &good).unwrap();
        fs::write(world.join("playerdata").join(format!("{P1}.dat")), b"").unwrap();
        let players = read_players(&world, &names).unwrap();
        assert!(players[0].from_old);
        assert_eq!(players[0].bed.as_ref().unwrap().pos.chunk(), (42, 67));
        // ...and with neither, the read fails rather than lose a player's bed.
        fs::write(world.join("playerdata").join(format!("{P1}.dat_old")), b"").unwrap();
        assert!(read_players(&world, &names).is_err());
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn opac_claims_read_per_owner_and_dimension() {
        let world = temp_world();
        assert_eq!(read_claims(&world), Ok(None)); // the mod never ran here
        write_claims(&world, P1, "Player_One", &[
            (OVERWORLD, false, &[(42, 67), (43, 67)]),
            (OVERWORLD, true, &[(-3, -4)]),
            ("minecraft:the_nether", false, &[(21, 28)]),
        ]);
        write_claims(&world, OPAC_SERVER_UUID, "\"Server\"", &[(OVERWORLD, false, &[(0, 0)])]);
        write_claims(&world, OPAC_EXPIRED_UUID, "\"Expiration\"", &[]);
        fs::write(world.join("data/openpartiesandclaims/player-claims").join("readme.txt"), b"x").unwrap();

        let owners = read_claims(&world).unwrap().unwrap();
        assert_eq!(owners.len(), 3);
        assert_eq!(owners[0].label(), "server claims");
        assert_eq!(owners[0].claims, vec![Claim { dim: OVERWORLD.to_string(), chunk: (0, 0), forceloaded: false }]);
        assert_eq!(owners[1].label(), "expired claims");
        assert!(owners[1].claims.is_empty());
        let p1 = &owners[2];
        assert_eq!(p1.label(), "Player_One");
        let got: Vec<(&str, ChunkPos, bool)> = p1.claims.iter().map(|c| (c.dim.as_str(), c.chunk, c.forceloaded)).collect();
        assert_eq!(got, vec![
            (OVERWORLD, (-3, -4), true),
            (OVERWORLD, (42, 67), false),
            (OVERWORLD, (43, 67), false),
            ("minecraft:the_nether", (21, 28), false),
        ]);

        // A file that is not what the reader expects is an error, never "no claims".
        let dir = world.join("data/openpartiesandclaims/player-claims");
        fs::write(dir.join(format!("{P3}.nbt")), b"not nbt").unwrap();
        assert!(read_claims(&world).is_err());
        fs::write(dir.join(format!("{P3}.nbt")), encode(&compound(vec![("username", string("x"))]))).unwrap();
        assert!(read_claims(&world).is_err());
        let odd = compound(vec![(
            "dimensions",
            compound(vec![(OVERWORLD, compound(vec![("claims", Value::List(vec![compound(vec![(
                "positions",
                Value::List(vec![compound(vec![("x", Value::Int(1))])]),
            )])]))]))]),
        )]);
        fs::write(dir.join(format!("{P3}.nbt")), encode(&odd)).unwrap();
        assert!(read_claims(&world).is_err());
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn waystones_read_with_their_identity() {
        let world = temp_world();
        assert_eq!(read_waystones(&world), Ok(None));
        write_waystones(&world, &[
            ([-901_396_754, 1_764_246_887, -1_678_078_288, -154_478_235], "", OVERWORLD, (-783, 67, -1838), "VILLAGE"),
            ([1, 2, 3, 4], "Hearthome", "minecraft:the_nether", (10, 64, 20), "PLAYER"),
        ]);
        let ws = read_waystones(&world).unwrap().unwrap();
        assert_eq!(ws.len(), 2);
        assert_eq!(ws[0].uid, "ca45c6ee-6928-4567-9bfa-8eb0f6cad965");
        assert_eq!(ws[0].label(), "unnamed ca45c6ee");
        assert_eq!((ws[0].pos.chunk(), ws[0].origin.as_str()), ((-49, -115), "VILLAGE"));
        assert_eq!((ws[1].label().as_str(), ws[1].dim.as_str()), ("Hearthome", "minecraft:the_nether"));
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn create_track_nodes_are_halved_and_mapped_through_the_palette() {
        let world = temp_world();
        assert_eq!(read_create_tracks(&world), Ok(None));
        let loc = |x: i32, y: i32, z: i32, d: Option<i32>| {
            let mut e = vec![("X", Value::Int(x)), ("Y", Value::Int(y)), ("Z", Value::Int(z))];
            if let Some(d) = d {
                e.push(("D", Value::Int(d)));
            }
            compound(vec![("Location", compound(e))])
        };
        let graphs = Value::List(vec![
            compound(vec![("Nodes", Value::List(vec![loc(1374, 134, 2161, Some(0)), loc(-33, 128, -1, Some(1))]))]),
            compound(vec![("Nodes", Value::List(vec![loc(64, 130, 64, None), loc(1, 1, 1, Some(9))]))]),
        ]);
        let palette = Value::List(vec![compound(vec![("Id", string(OVERWORLD))]), compound(vec![("Id", string("minecraft:the_nether"))])]);
        let root = compound(vec![("data", compound(vec![("RailGraphs", graphs), ("DimensionPalette", palette)]))]);
        write_gz(&world.join("data").join("create_tracks.dat"), &root);

        let nodes = read_create_tracks(&world).unwrap().unwrap();
        let got: Vec<(usize, &str, BlockPos)> = nodes.iter().map(|n| (n.graph, n.dim.as_str(), n.pos)).collect();
        assert_eq!(got, vec![
            (0, OVERWORLD, BlockPos { x: 687, y: 67, z: 1080 }),
            (0, "minecraft:the_nether", BlockPos { x: -17, y: 64, z: -1 }),
            (1, OVERWORLD, BlockPos { x: 32, y: 65, z: 32 }),
            (1, OVERWORLD, BlockPos { x: 0, y: 0, z: 0 }), // D out of range = overworld, as Create decodes it
        ]);
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn villages_and_ore_deposits_read_from_a_dimensions_data_folder() {
        let world = temp_world();
        let data_dir = world.join("data");
        assert_eq!(read_mca_villages(&data_dir), Ok(None));
        assert_eq!(read_ore_deposits(&data_dir), Ok(None));
        let building = compound(vec![
            ("posX", Value::Int(757)),
            ("posY", Value::Int(67)),
            ("posZ", Value::Int(993)),
            ("type", string("town_center")),
        ]);
        let village = compound(vec![("id", Value::Int(0)), ("name", string("Moongulf")), ("buildings", Value::List(vec![building]))]);
        write_gz(&data_dir.join("mca_villages.dat"), &compound(vec![("data", compound(vec![("villages", Value::List(vec![village]))]))]));
        let villages = read_mca_villages(&data_dir).unwrap().unwrap();
        assert_eq!(villages.len(), 1);
        assert_eq!((villages[0].id, villages[0].name.as_str()), (0, "Moongulf"));
        assert_eq!(villages[0].buildings, vec![("town_center".to_string(), BlockPos { x: 757, y: 67, z: 993 })]);

        let deposit = compound(vec![("name", string("silver")), ("pos", Value::Long(-498_903_396_511_719)), ("size", Value::Int(746))]);
        write_gz(&data_dir.join("large_ore_deposits.dat"), &compound(vec![("data", compound(vec![("generated", Value::List(vec![deposit]))]))]));
        let deposits = read_ore_deposits(&data_dir).unwrap().unwrap();
        assert_eq!(deposits, vec![OreDeposit { name: "silver".to_string(), pos: BlockPos { x: -1815, y: 25, z: 1121 } }]);

        // Saved data without its 'data' wrapper is an error, not "nothing there".
        write_gz(&data_dir.join("mca_villages.dat"), &compound(vec![("villages", Value::List(vec![]))]));
        assert!(read_mca_villages(&data_dir).is_err());
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn server_properties_and_usercache() {
        let dir = temp_world();
        assert_eq!(server_property(&dir, "online-mode"), None);
        assert!(read_usercache(&dir).is_empty());
        fs::write(dir.join("server.properties"), "#Minecraft server properties\r\nonline-mode=false\r\nlevel-name = world \r\n#online-mode=true\r\n").unwrap();
        assert_eq!(server_property(&dir, "online-mode").as_deref(), Some("false"));
        assert_eq!(server_property(&dir, "level-name").as_deref(), Some("world"));
        assert_eq!(server_property(&dir, "motd"), None);
        fs::write(
            dir.join("usercache.json"),
            r#"[{"name":"Player_One","uuid":"0E0C6371-8599-3a43-a117-30cb7e62c579","expiresOn":"2030-01-01 00:00:00 +0000"},{"name":"x"}]"#,
        )
        .unwrap();
        let names = read_usercache(&dir);
        assert_eq!(names.len(), 1);
        assert_eq!(names.get(P1).map(String::as_str), Some("Player_One"));
        fs::write(dir.join("usercache.json"), "not json").unwrap();
        assert!(read_usercache(&dir).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
