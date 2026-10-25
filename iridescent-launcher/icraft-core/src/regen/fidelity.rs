//! The fidelity harness (H1): what a regeneration run must hold, checked by
//! code that shares no reader with the run.
//!
//! The run ([`super::exec`]) checks its own work (its step 6). This module
//! checks it again, and on its own: its own region-file reader, its own chunk
//! hasher, its own NBT reader and writer, its own list of the files a plan
//! touches and its own derivation of what each mod store must lose. What it
//! shares with the run is the plan file (`plan.json`, whose hash the operator
//! typed) and the definition of "protected" ([`crate::protection::build`],
//! fed from the world as it is now and from this module's own reading of
//! every chunk). Design: internal `design/scope-regen-and-ai-customizer-2026-10-22.md`
//! section 12; operator rulings D1, D6, D9 and D11 of 2026-10-22.
//!
//! | # | Invariant | When |
//! |---|---|---|
//! | F1 | Every chunk the plan does not name is byte-identical in `region/`, `entities/` and `poi/` of every dimension: the same location entry, the same timestamp entry, the same stored record (sha256 over the length field, the compression byte and the data, and the `.mcc` of an oversized chunk). This covers every protected chunk | a manifest before the changes, compared after |
//! | F2 | The plan happened: every chunk it names is gone from all three folders, and so is its `.mcc` | after |
//! | F3 | No chunk the plan names is protected by the protection map derived now: players, claims, waystones and spawn read again, the plan's own settings, and this module's own reading of each chunk's `InhabitedTime` and readability | before |
//! | F4 | Region integrity of every region file the plan touches: entries inside the file, no two sharing a sector, length fields that hold, every chunk decompresses and parses, a `.mcc` wherever one is flagged. A defect that was there before is reported and not blamed on the run; a new one fails it | before, after |
//! | F5 | Every file of the world folder outside the plan's file set has the same size, modified time and sha256, and no file is new; the world's record (`.icraft_world.json`) gained one entry and nothing else | before, after |
//! | F6 | Each mod store is its original minus exactly the entries the plan's chunks own, worked out here | before, after |
//! | F7 | The planted-violation self-test, before every run (see "The self-test") | before |
//! | F8 | After the first start on the result: kept chunks still there and parsing, how many the server saved again, reset positions generated again, a seam sample. A report, not a gate ([`after_first_start`]) | the first launch after a server ran on it |
//! | F9 | One gate for every author: a plan's `author` is a label that no check reads (a test runs one plan under two labels and compares the verdicts byte for byte) | CI |
//! | F10 | The plan's world edits ([`super::edits`]), worked out here: `level.dat` and its copy are their old trees with the new seed (and the spawn's height), the stores they touch are their old trees minus exactly the keys named, the stronghold caches and the files of players who start over are gone, and every kept chunk marked for blending is its old tree with `tectonic:blending_version` 0, in its old place | before, after |
//!
//! A run that fails F3 or F7 is refused before anything is touched. A run
//! that fails F1, F2, F4, F5, F6 or F10 after its changes is put back by the
//! run's own holding folder ([`super::exec`]).
//!
//! # The self-test
//!
//! A harness that cannot fail cannot vouch for anything (the Tetra audit that
//! scanned 0 files and read clean is the precedent). So before every run, and
//! on every check of a plan on the Regenerate page, [`self_test`] builds a
//! small world in the temp folder: synthetic region files with a protected
//! chunk of each kind, oversized chunks, a waystone store and a world record,
//! plus a copy of one real region file of the world (the smallest one that
//! has a chunk to keep and one to reset). It carries a correct run out on it,
//! checks that the harness HOLDS, and then, one fresh fixture at a time,
//! plants one violation and checks that the harness FAILS naming it. If any
//! plant gets through, or the clean fixture does not hold, the run is refused.
//!
//! # Output
//!
//! `fidelity.json` in the run's holding folder (and in the dry-run's folder
//! when the run was refused before it began), with every check's counts and
//! first findings, and `fidelity-kept.tsv` beside it (every chunk record that
//! stayed, for F8). One line, counts only, goes to the run's report and to
//! `logs/regen_execute.log`, which leaves the box: no position, no name.
//! Positions are only in the files under the holding folder, which do not.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::edits::Edits;
use super::exec::ApprovedPlan;
use crate::anvil::{ChunkPos, DimensionScan, END, NETHER, OVERWORLD};
use crate::config::ServerConfig;
use crate::protection::{self, Settings, WaystoneMode};
use crate::worlddata;

/// In a run's holding folder: the verdict. Also in a dry-run's folder when the
/// harness refused a run of it.
pub const FIDELITY_FILE: &str = "fidelity.json";
/// In a run's holding folder: the report on the world after its first start.
pub const AFTER_BOOT_FILE: &str = "fidelity-after-first-boot.json";
/// In a run's holding folder: every chunk record that stayed, as the run left
/// it. Tab-separated: folder, store, x, z, location, timestamp, sha256.
const KEPT_FILE: &str = "fidelity-kept.tsv";

pub const HOLDS: &str = "HOLDS";
pub const FAIL: &str = "FAIL";
/// A check's state.
const HELD: &str = "holds";
const FAILED: &str = "FAIL";
const PENDING: &str = "pending";
const NOT_RUN: &str = "not run";
const IN_CI: &str = "CI";

const FORMAT: &str = "icraft-fidelity";
const VERSION: u32 = 1;
const STORES: [&str; 3] = ["region", "entities", "poi"];
const SECTOR: usize = 4096;
/// Nothing sane is bigger; a bigger region file is hashed, not parsed.
const MAX_REGION_BYTES: u64 = 1 << 30;
/// A chunk's NBT, decompressed.
const MAX_NBT_BYTES: u64 = 256 << 20;
const MAX_DEPTH: u32 = 512;
const IO_BUF: usize = 1 << 20;
/// Findings kept per check (their total is kept too).
const SHOWN: usize = 100;
/// The real region file the self-test copies: the smallest that will do, and
/// none bigger than this.
const MAX_REAL_FILE: u64 = 64 << 20;
/// Region files of the world tried as the self-test's real one.
const REAL_TRIES: usize = 6;

// The facts F10 works from: the same as the run's ([`super::edits`]), written
// down again here, so that the harness decides from its own copy.
const BLEND_TAG: &[u8] = b"tectonic:blending_version";
const STRONGHOLD_CACHE: &str = "mfix_strongholds.dat";
const PUPFISH_FILE: &str = "data/alexsmobs_world_data.dat";
const PUPFISH_KEYS: [&[u8]; 2] = [b"PupfishChunkX", b"PupfishChunkZ"];
const SPAWN_DATA_FILE: &str = "kubejs_persistent_data.nbt";
const SPAWN_SERVER_KEYS: [&[u8]; 2] = [b"icraft_priest_tower_done", b"icraft_priest_tower_attempts"];
const SPAWN_LEVEL: &[u8] = b"minecraft:overworld";
const SPAWN_LEVEL_KEYS: [&[u8]; 5] = [b"icraft_cherry_spawn_set", b"icraft_cherry_spawn_exhausted", b"icraft_cherry_village_x", b"icraft_cherry_village_y", b"icraft_cherry_village_z"];

// =============================================================================
// The plan
// =============================================================================

/// What the harness is told: the dry-run's own plan file, nothing the run
/// worked out.
#[derive(Debug, Clone)]
pub struct Plan {
    pub hash: String,
    /// The protection settings the plan was made with.
    pub settings: Settings,
    /// The chunks it resets, per dimension id.
    pub chunks: BTreeMap<String, BTreeSet<ChunkPos>>,
    /// What it changes besides chunks, as the plan file says (F10).
    pub edits: Edits,
    /// Who wrote it, for the page. No check reads it (F9).
    pub author: String,
}

impl Plan {
    pub fn of(plan: &ApprovedPlan, author: &str) -> Plan {
        Plan {
            hash: plan.hash.clone(),
            settings: plan.spec.settings.clone().unwrap_or_default(),
            chunks: plan.chunks.clone(),
            edits: plan.edits.clone(),
            author: author.to_string(),
        }
    }

    /// A dry-run's plan (its hash checked against its chunks) and its author.
    pub fn load(run_dir: &Path) -> Result<Plan, String> {
        let plan = super::exec::load_plan(run_dir)?;
        Ok(Plan::of(&plan, &author_label(run_dir)))
    }

    fn names(&self, dim: &str, pos: ChunkPos) -> bool {
        self.chunks.get(dim).is_some_and(|set| set.contains(&pos))
    }

    fn total(&self) -> usize {
        self.chunks.values().map(BTreeSet::len).sum()
    }

    /// The plan's chunks per dimension folder.
    fn by_folder(&self) -> Result<BTreeMap<String, BTreeSet<ChunkPos>>, String> {
        let mut out: BTreeMap<String, BTreeSet<ChunkPos>> = BTreeMap::new();
        for (id, set) in &self.chunks {
            let folder = dim_folder(id).ok_or_else(|| format!("the plan names a dimension '{id}' that has no folder this harness knows"))?;
            out.entry(folder).or_default().extend(set.iter().copied());
        }
        Ok(out)
    }
}

/// The plan file's `author` label, when it has one: a dry-run of the launcher
/// writes none, and is the operator's.
pub fn author_label(run_dir: &Path) -> String {
    let v: serde_json::Value = fs::read(run_dir.join(super::PLAN_FILE)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    v["author"].as_str().map(str::to_string).unwrap_or_else(|| "operator (dry-run)".to_string())
}

// =============================================================================
// Paths
// =============================================================================

/// A dimension's folder in the world, as Minecraft names it: empty for the
/// overworld.
fn dim_folder(id: &str) -> Option<String> {
    if id == OVERWORLD {
        return Some(String::new());
    }
    if id == NETHER {
        return Some("DIM-1".to_string());
    }
    if id == END {
        return Some("DIM1".to_string());
    }
    let (ns, path) = id.split_once(':')?;
    let plain = |s: &str| !s.is_empty() && s != "." && s != ".." && !s.contains(|c: char| matches!(c, '\\' | ':' | '/'));
    (plain(ns) && path.split('/').all(plain)).then(|| format!("dimensions/{ns}/{path}"))
}

/// A dimension folder, named as its id.
fn folder_label(folder: &str) -> String {
    match folder {
        "" => OVERWORLD.to_string(),
        "DIM-1" => NETHER.to_string(),
        "DIM1" => END.to_string(),
        _ => match folder.strip_prefix("dimensions/").and_then(|rest| rest.split_once('/')) {
            Some((ns, path)) => format!("{ns}:{path}"),
            None => folder.to_string(),
        },
    }
}

fn join(folder: &str, rest: &str) -> String {
    if folder.is_empty() {
        rest.to_string()
    } else {
        format!("{folder}/{rest}")
    }
}

/// A path relative to the world, with `/`, under the world.
fn at(world: &Path, rel: &str) -> PathBuf {
    rel.split('/').fold(world.to_path_buf(), |path, part| path.join(part))
}

fn parse_region_name(name: &str) -> Option<(i32, i32)> {
    let (x, z) = name.strip_prefix("r.")?.strip_suffix(".mca")?.split_once('.')?;
    let (x, z): (i32, i32) = (x.parse().ok()?, z.parse().ok()?);
    (format!("r.{x}.{z}.mca") == name).then_some((x, z))
}

fn parse_mcc_name(name: &str) -> Option<ChunkPos> {
    let (x, z) = name.strip_prefix("c.")?.strip_suffix(".mcc")?.split_once('.')?;
    let (x, z): (i32, i32) = (x.parse().ok()?, z.parse().ok()?);
    (format!("c.{x}.{z}.mcc") == name).then_some((x, z))
}

/// `DIM-1/poi/r.0.0.mca` -> (`DIM-1`, poi, 0, 0).
fn region_of_rel(rel: &str) -> Option<(String, u8, i32, i32)> {
    let mut parts: Vec<&str> = rel.split('/').collect();
    let (rx, rz) = parse_region_name(parts.pop()?)?;
    let store = parts.pop()?;
    let store = STORES.iter().position(|s| *s == store)? as u8;
    Some((parts.join("/"), store, rx, rz))
}

/// `region/c.3.4.mcc` -> (``, (3, 4)).
fn mcc_of_rel(rel: &str) -> Option<(String, ChunkPos)> {
    let mut parts: Vec<&str> = rel.split('/').collect();
    let pos = parse_mcc_name(parts.pop()?)?;
    let store = parts.pop()?;
    STORES.contains(&store).then(|| (parts.join("/"), pos))
}

/// The region file a chunk is stored in.
fn region_rel(folder: &str, store: u8, pos: ChunkPos) -> String {
    join(folder, &format!("{}/r.{}.{}.mca", STORES[usize::from(store)], pos.0.div_euclid(32), pos.1.div_euclid(32)))
}

fn chunk_in(rx: i32, rz: i32, slot: usize) -> ChunkPos {
    (rx.wrapping_mul(32).wrapping_add((slot % 32) as i32), rz.wrapping_mul(32).wrapping_add((slot / 32) as i32))
}

fn slot_of(pos: ChunkPos) -> usize {
    (pos.1.rem_euclid(32) * 32 + pos.0.rem_euclid(32)) as usize
}

fn chunk_text(pos: ChunkPos) -> String {
    format!("({}, {})", pos.0, pos.1)
}

fn be32(bytes: &[u8], at: usize) -> u32 {
    u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

fn digest(hasher: Sha256) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(&hasher.finalize());
    out
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn num(n: usize) -> String {
    super::num(n)
}

// =============================================================================
// Reading the world: every file, every chunk record
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Stamp {
    size: u64,
    modified: Option<SystemTime>,
    sha256: [u8; 32],
}

/// A chunk as its region file holds it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Image {
    location: u32,
    timestamp: u32,
    sha256: [u8; 32],
}

/// (dimension folder, store, chunk)
type Key = (String, u8, ChunkPos);

/// What decoding a chunk said.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Reading {
    /// It decompresses and parses; its `InhabitedTime`, if it has one.
    Parsed(Option<i64>),
    Damaged(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Defect {
    file: String,
    what: String,
}

#[derive(Debug, Clone, Default)]
struct Survey {
    /// Every file of the world folder (`session.lock` aside).
    files: BTreeMap<String, Stamp>,
    /// Every chunk record of every region file.
    chunks: BTreeMap<Key, Image>,
    /// Chunks of the decoded files.
    readings: BTreeMap<Key, Reading>,
    defects: BTreeSet<Defect>,
    /// Region files whose every chunk was decompressed and parsed.
    decoded: BTreeSet<String>,
}

/// Which region files to decode, chunk by chunk.
enum Decode<'a> {
    /// Those that list a chunk of the plan (per dimension folder).
    Touching(&'a BTreeMap<String, BTreeSet<ChunkPos>>),
    /// These.
    Files(&'a BTreeSet<String>),
}

/// Every file under the world, with `/`, sorted. `session.lock` is the
/// server's lock and is left out.
fn world_files(world: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<(String, PathBuf)>) -> std::io::Result<()> {
        let mut entries = fs::read_dir(dir)?.collect::<std::io::Result<Vec<fs::DirEntry>>>()?;
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            let child = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let kind = e.file_type()?;
            if kind.is_dir() {
                walk(&e.path(), &child, out)?;
            } else if kind.is_file() && name != "session.lock" {
                out.push((child, e.path()));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(world, "", &mut out).map_err(|e| format!("{}: {e}", world.display()))?;
    Ok(out)
}

fn hash_stream(path: &Path) -> Result<[u8; 32], String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; IO_BUF];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(digest(hasher))
}

#[derive(Default)]
struct RegionRead {
    folder: String,
    store: u8,
    listed: Vec<ChunkPos>,
    /// Chunks whose data is flagged as being in a `.mcc`.
    external: Vec<ChunkPos>,
    images: Vec<(ChunkPos, Image)>,
    readings: Vec<(ChunkPos, Reading)>,
    defects: Vec<String>,
    decoded: bool,
}

struct Looked {
    rel: String,
    stamp: Result<Stamp, String>,
    region: Option<RegionRead>,
}

fn look_at(rel: &str, path: &Path, decode: &Decode) -> Looked {
    let failed = |why: String| Looked { rel: rel.to_string(), stamp: Err(why), region: None };
    let meta = match fs::metadata(path) {
        Ok(meta) => meta,
        Err(e) => return failed(e.to_string()),
    };
    let (size, modified) = (meta.len(), meta.modified().ok());
    let Some((folder, store, rx, rz)) = region_of_rel(rel).filter(|_| size <= MAX_REGION_BYTES) else {
        let stamp = hash_stream(path).map(|sha256| Stamp { size, modified, sha256 });
        return Looked { rel: rel.to_string(), stamp, region: None };
    };
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) => return failed(e.to_string()),
    };
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let stamp = Stamp { size, modified, sha256: digest(hasher) };
    let dir = path.parent().unwrap_or(Path::new(""));
    let mut read = read_region(&bytes, dir, rx, rz, |listed| match decode {
        Decode::Touching(plan) => plan.get(&folder).is_some_and(|set| listed.iter().any(|p| set.contains(p))),
        Decode::Files(files) => files.contains(rel),
    });
    read.folder = folder;
    read.store = store;
    Looked { rel: rel.to_string(), stamp: Ok(stamp), region: Some(read) }
}

/// One region file, from its bytes: every chunk's record image, the defects
/// of its header and records, and (if `decide` says so for the chunks it
/// lists) every chunk decompressed and parsed.
fn read_region(bytes: &[u8], dir: &Path, rx: i32, rz: i32, decide: impl Fn(&[ChunkPos]) -> bool) -> RegionRead {
    let mut out = RegionRead::default();
    if bytes.is_empty() {
        // Minecraft's placeholder: a region file nothing was ever written to.
        return out;
    }
    if bytes.len() < 2 * SECTOR {
        out.defects.push(format!("it is {} bytes long, shorter than a region file's 8 KiB header", bytes.len()));
        return out;
    }
    let sectors = bytes.len().div_ceil(SECTOR);
    let entries: Vec<(usize, u32, u32)> = (0..1024)
        .filter_map(|slot| {
            let location = be32(bytes, slot * 4);
            (location != 0).then(|| (slot, location, be32(bytes, SECTOR + slot * 4)))
        })
        .collect();
    out.listed = entries.iter().map(|(slot, _, _)| chunk_in(rx, rz, *slot)).collect();
    out.decoded = decide(&out.listed);
    // The first slot to claim each sector.
    let mut owner: BTreeMap<usize, usize> = BTreeMap::new();
    for &(slot, location, timestamp) in &entries {
        let pos = chunk_in(rx, rz, slot);
        let offset = (location >> 8) as usize;
        let count = (location & 0xff) as usize;
        let mut wrong: Vec<String> = Vec::new();
        if offset < 2 {
            wrong.push("its location points into the header".to_string());
        }
        if count == 0 {
            wrong.push("its sector count is zero".to_string());
        }
        if offset + count > sectors {
            wrong.push(format!("its sectors {offset} to {} run past the end of the file ({sectors} sectors)", offset + count - 1));
        }
        let mut shares: Option<usize> = None;
        for sector in offset.max(2)..(offset + count).min(sectors) {
            match owner.entry(sector) {
                std::collections::btree_map::Entry::Vacant(free) => {
                    free.insert(slot);
                }
                std::collections::btree_map::Entry::Occupied(taken) => {
                    if shares.is_none() {
                        shares = Some(*taken.get());
                    }
                }
            }
        }
        if let Some(other) = shares {
            wrong.push(format!("it shares sectors with the chunk in slot {other}"));
        }

        let start = offset * SECTOR;
        let mut hasher = Sha256::new();
        let mut kind: Option<u8> = None;
        let mut inline: &[u8] = &[];
        if offset >= 2 && start + 5 <= bytes.len() {
            let len = be32(bytes, start) as usize;
            kind = Some(bytes[start + 4]);
            if len == 0 {
                wrong.push("its length field is zero".to_string());
            } else if count > 0 && len + 4 > count * SECTOR {
                wrong.push(format!("its length field says {len} bytes, more than its {count} sector(s) hold"));
            }
            if start + 4 + len > bytes.len() {
                wrong.push("its data runs past the end of the file".to_string());
            }
            let end = (start + 4 + len).min(bytes.len()).max(start + 5);
            hasher.update(&bytes[start..end]);
            inline = &bytes[start + 5..end];
        } else if offset >= 2 {
            wrong.push("its data starts past the end of the file".to_string());
        }
        let mut external: Option<Vec<u8>> = None;
        if let Some(kind) = kind {
            let compression = kind & 0x7f;
            if !(1..=3).contains(&compression) {
                wrong.push(format!("its compression type is {compression}, which Minecraft 1.20.1 does not write"));
            }
            if kind & 0x80 != 0 {
                out.external.push(pos);
                let name = format!("c.{}.{}.mcc", pos.0, pos.1);
                match fs::read(dir.join(&name)) {
                    Ok(data) => {
                        hasher.update(b"+mcc");
                        hasher.update(&data);
                        external = Some(data);
                    }
                    Err(_) => {
                        hasher.update(b"-mcc");
                        wrong.push(format!("its data is in {name}, which is not there"));
                    }
                }
            }
        }
        out.images.push((pos, Image { location, timestamp, sha256: digest(hasher) }));
        if out.decoded {
            let reading = if wrong.is_empty() {
                let data: &[u8] = external.as_deref().unwrap_or(inline);
                match chunk_nbt(kind.unwrap_or(0) & 0x7f, data) {
                    Ok(ticks) => Reading::Parsed(ticks),
                    Err(why) => {
                        wrong.push(format!("its data does not decompress and parse ({why})"));
                        Reading::Damaged(why)
                    }
                }
            } else {
                Reading::Damaged(wrong.join("; "))
            };
            out.readings.push((pos, reading));
        }
        for what in wrong {
            out.defects.push(format!("chunk {} in slot {slot}: {what}", chunk_text(pos)));
        }
    }
    out
}

/// Read the whole world folder: every file's stamp, every chunk record's
/// image, and the chunks of the region files `decode` names, decoded. Files
/// are read on several threads.
fn survey(world: &Path, decode: &Decode) -> Result<Survey, String> {
    let files = world_files(world)?;
    let next = AtomicUsize::new(0);
    let looked: Mutex<Vec<(usize, Looked)>> = Mutex::new(Vec::with_capacity(files.len()));
    let workers = std::thread::available_parallelism().map_or(2, |n| n.get()).clamp(1, 8);
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, Ordering::SeqCst);
                let Some((rel, path)) = files.get(index) else { break };
                let one = look_at(rel, path, decode);
                looked.lock().unwrap_or_else(|e| e.into_inner()).push((index, one));
            });
        }
    });
    let mut looked = looked.into_inner().unwrap_or_else(|e| e.into_inner());
    looked.sort_by_key(|(index, _)| *index);
    let mut s = Survey::default();
    for (_, one) in looked {
        let stamp = one.stamp.map_err(|e| format!("{} does not read ({e})", one.rel))?;
        if let Some(r) = one.region {
            for what in r.defects {
                s.defects.insert(Defect { file: one.rel.clone(), what });
            }
            for (pos, image) in r.images {
                s.chunks.insert((r.folder.clone(), r.store, pos), image);
            }
            for (pos, reading) in r.readings {
                s.readings.insert((r.folder.clone(), r.store, pos), reading);
            }
            if r.decoded {
                s.decoded.insert(one.rel.clone());
            }
        }
        s.files.insert(one.rel, stamp);
    }
    Ok(s)
}

// =============================================================================
// NBT, read and written here (not by `crate::nbt`)
// =============================================================================

const TAG_END: u8 = 0;
const TAG_BYTE: u8 = 1;
const TAG_SHORT: u8 = 2;
const TAG_INT: u8 = 3;
const TAG_LONG: u8 = 4;
const TAG_FLOAT: u8 = 5;
const TAG_DOUBLE: u8 = 6;
const TAG_BYTE_ARRAY: u8 = 7;
const TAG_STRING: u8 = 8;
const TAG_LIST: u8 = 9;
const TAG_COMPOUND: u8 = 10;
const TAG_INT_ARRAY: u8 = 11;
const TAG_LONG_ARRAY: u8 = 12;

struct Cursor<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Cursor<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let end = self.at.checked_add(n).filter(|end| *end <= self.bytes.len()).ok_or_else(|| "it ends in the middle of a tag".to_string())?;
        let out = &self.bytes[self.at..end];
        self.at = end;
        Ok(out)
    }

    fn byte(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn short(&mut self) -> Result<u16, String> {
        let b = self.take(2)?;
        Ok(u16::from_be_bytes([b[0], b[1]]))
    }

    fn int(&mut self) -> Result<i32, String> {
        let b = self.take(4)?;
        Ok(i32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn long(&mut self) -> Result<i64, String> {
        let b = self.take(8)?;
        let mut a = [0u8; 8];
        a.copy_from_slice(b);
        Ok(i64::from_be_bytes(a))
    }

    fn len(&mut self) -> Result<usize, String> {
        let n = self.int()?;
        usize::try_from(n).map_err(|_| format!("a negative length ({n})"))
    }

    fn name(&mut self) -> Result<&'a [u8], String> {
        let n = usize::from(self.short()?);
        self.take(n)
    }
}

fn times(n: usize, size: usize) -> Result<usize, String> {
    n.checked_mul(size).ok_or_else(|| "an array too long to exist".to_string())
}

/// Walk over one tag's payload without keeping it.
fn skip(c: &mut Cursor, tag: u8, depth: u32) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err("nested too deep".to_string());
    }
    match tag {
        TAG_BYTE => {
            c.take(1)?;
        }
        TAG_SHORT => {
            c.take(2)?;
        }
        TAG_INT | TAG_FLOAT => {
            c.take(4)?;
        }
        TAG_LONG | TAG_DOUBLE => {
            c.take(8)?;
        }
        TAG_BYTE_ARRAY => {
            let n = c.len()?;
            c.take(n)?;
        }
        TAG_STRING => {
            c.name()?;
        }
        TAG_LIST => {
            let element = c.byte()?;
            let n = c.len()?;
            if element == TAG_END && n > 0 {
                return Err("a list of TAG_End with a length".to_string());
            }
            for _ in 0..n {
                skip(c, element, depth + 1)?;
            }
        }
        TAG_COMPOUND => loop {
            let t = c.byte()?;
            if t == TAG_END {
                break;
            }
            c.name()?;
            skip(c, t, depth + 1)?;
        },
        TAG_INT_ARRAY => {
            let n = c.len()?;
            c.take(times(n, 4)?)?;
        }
        TAG_LONG_ARRAY => {
            let n = c.len()?;
            c.take(times(n, 8)?)?;
        }
        other => return Err(format!("unknown tag type {other}")),
    }
    Ok(())
}

fn inflate(compression: u8, data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let read = match compression {
        1 => flate2::read::GzDecoder::new(data).take(MAX_NBT_BYTES).read_to_end(&mut out),
        2 => flate2::read::ZlibDecoder::new(data).take(MAX_NBT_BYTES).read_to_end(&mut out),
        3 => {
            out.extend_from_slice(data);
            Ok(data.len())
        }
        other => return Err(format!("compression type {other}")),
    };
    read.map_err(|e| e.to_string())?;
    Ok(out)
}

/// A chunk's NBT: one root compound, read to its end. Gives its
/// `InhabitedTime` (at the root, or under `Level` as before 1.18).
fn chunk_nbt(compression: u8, data: &[u8]) -> Result<Option<i64>, String> {
    let raw = inflate(compression, data)?;
    let mut c = Cursor { bytes: &raw, at: 0 };
    if c.byte()? != TAG_COMPOUND {
        return Err("the root tag is not a compound".to_string());
    }
    c.name()?;
    compound_ticks(&mut c, true, 1)
}

fn compound_ticks(c: &mut Cursor, root: bool, depth: u32) -> Result<Option<i64>, String> {
    let mut found = None;
    loop {
        let t = c.byte()?;
        if t == TAG_END {
            return Ok(found);
        }
        let name = c.name()?;
        if found.is_none() && name == &b"InhabitedTime"[..] && (t == TAG_LONG || t == TAG_INT) {
            found = Some(if t == TAG_LONG { c.long()? } else { i64::from(c.int()?) });
            continue;
        }
        if root && t == TAG_COMPOUND && name == &b"Level"[..] {
            let inner = compound_ticks(c, false, depth + 1)?;
            if found.is_none() {
                found = inner;
            }
            continue;
        }
        skip(c, t, depth)?;
    }
}

/// A tag, kept exactly: entries in file order, names and strings as stored.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Tag {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(u32),
    Double(u64),
    Bytes(Vec<u8>),
    Text(Vec<u8>),
    /// The element type, kept for an empty list too.
    List(u8, Vec<Tag>),
    Compound(Vec<(Vec<u8>, Tag)>),
    Ints(Vec<i32>),
    Longs(Vec<i64>),
}

impl Tag {
    fn id(&self) -> u8 {
        match self {
            Tag::Byte(_) => TAG_BYTE,
            Tag::Short(_) => TAG_SHORT,
            Tag::Int(_) => TAG_INT,
            Tag::Long(_) => TAG_LONG,
            Tag::Float(_) => TAG_FLOAT,
            Tag::Double(_) => TAG_DOUBLE,
            Tag::Bytes(_) => TAG_BYTE_ARRAY,
            Tag::Text(_) => TAG_STRING,
            Tag::List(..) => TAG_LIST,
            Tag::Compound(_) => TAG_COMPOUND,
            Tag::Ints(_) => TAG_INT_ARRAY,
            Tag::Longs(_) => TAG_LONG_ARRAY,
        }
    }

    fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(entries) => entries.iter().find(|(name, _)| name.as_slice() == key.as_bytes()).map(|(_, v)| v),
            _ => None,
        }
    }

    fn get_mut(&mut self, key: &str) -> Option<&mut Tag> {
        match self {
            Tag::Compound(entries) => entries.iter_mut().find(|(name, _)| name.as_slice() == key.as_bytes()).map(|(_, v)| v),
            _ => None,
        }
    }

    fn at(&self, path: &[&str]) -> Option<&Tag> {
        path.iter().try_fold(self, |here, key| here.get(key))
    }

    fn at_mut(&mut self, path: &[&str]) -> Option<&mut Tag> {
        let mut here = self;
        for key in path {
            here = here.get_mut(key)?;
        }
        Some(here)
    }

    fn number(&self) -> Option<i64> {
        match self {
            Tag::Byte(v) => Some(i64::from(*v)),
            Tag::Short(v) => Some(i64::from(*v)),
            Tag::Int(v) => Some(i64::from(*v)),
            Tag::Long(v) => Some(*v),
            _ => None,
        }
    }

    fn text(&self) -> Option<&str> {
        match self {
            Tag::Text(bytes) => std::str::from_utf8(bytes).ok(),
            _ => None,
        }
    }

    fn items(&self) -> Option<&[Tag]> {
        match self {
            Tag::List(_, items) => Some(items),
            _ => None,
        }
    }

    fn items_mut(&mut self) -> Option<&mut Vec<Tag>> {
        match self {
            Tag::List(_, items) => Some(items),
            _ => None,
        }
    }

    fn compound(entries: Vec<(&str, Tag)>) -> Tag {
        Tag::Compound(entries.into_iter().map(|(k, v)| (k.as_bytes().to_vec(), v)).collect())
    }

    fn text_of(s: &str) -> Tag {
        Tag::Text(s.as_bytes().to_vec())
    }
}

fn read_tag(c: &mut Cursor, tag: u8, depth: u32) -> Result<Tag, String> {
    if depth > MAX_DEPTH {
        return Err("nested too deep".to_string());
    }
    Ok(match tag {
        TAG_BYTE => Tag::Byte(c.byte()? as i8),
        TAG_SHORT => Tag::Short(c.short()? as i16),
        TAG_INT => Tag::Int(c.int()?),
        TAG_LONG => Tag::Long(c.long()?),
        TAG_FLOAT => Tag::Float(c.int()? as u32),
        TAG_DOUBLE => Tag::Double(c.long()? as u64),
        TAG_BYTE_ARRAY => {
            let n = c.len()?;
            Tag::Bytes(c.take(n)?.to_vec())
        }
        TAG_STRING => Tag::Text(c.name()?.to_vec()),
        TAG_LIST => {
            let element = c.byte()?;
            let n = c.len()?;
            if element == TAG_END && n > 0 {
                return Err("a list of TAG_End with a length".to_string());
            }
            let mut items = Vec::new();
            for _ in 0..n {
                items.push(read_tag(c, element, depth + 1)?);
            }
            Tag::List(element, items)
        }
        TAG_COMPOUND => {
            let mut entries = Vec::new();
            loop {
                let t = c.byte()?;
                if t == TAG_END {
                    break;
                }
                let name = c.name()?.to_vec();
                entries.push((name, read_tag(c, t, depth + 1)?));
            }
            Tag::Compound(entries)
        }
        TAG_INT_ARRAY => {
            let n = c.len()?;
            let raw = c.take(times(n, 4)?)?;
            Tag::Ints(raw.chunks_exact(4).map(|b| i32::from_be_bytes([b[0], b[1], b[2], b[3]])).collect())
        }
        TAG_LONG_ARRAY => {
            let n = c.len()?;
            let raw = c.take(times(n, 8)?)?;
            Tag::Longs(raw.chunks_exact(8).map(|b| i64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])).collect())
        }
        other => return Err(format!("unknown tag type {other}")),
    })
}

fn put_tag(out: &mut Vec<u8>, tag: &Tag) {
    let put_len = |out: &mut Vec<u8>, n: usize| out.extend_from_slice(&(n as i32).to_be_bytes());
    match tag {
        Tag::Byte(v) => out.push(*v as u8),
        Tag::Short(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Int(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Long(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Float(bits) => out.extend_from_slice(&bits.to_be_bytes()),
        Tag::Double(bits) => out.extend_from_slice(&bits.to_be_bytes()),
        Tag::Bytes(v) => {
            put_len(out, v.len());
            out.extend_from_slice(v);
        }
        Tag::Text(v) => {
            out.extend_from_slice(&(v.len() as u16).to_be_bytes());
            out.extend_from_slice(v);
        }
        Tag::List(element, items) => {
            out.push(*element);
            put_len(out, items.len());
            for item in items {
                put_tag(out, item);
            }
        }
        Tag::Compound(entries) => {
            for (name, value) in entries {
                out.push(value.id());
                out.extend_from_slice(&(name.len() as u16).to_be_bytes());
                out.extend_from_slice(name);
                put_tag(out, value);
            }
            out.push(TAG_END);
        }
        Tag::Ints(v) => {
            put_len(out, v.len());
            for n in v {
                out.extend_from_slice(&n.to_be_bytes());
            }
        }
        Tag::Longs(v) => {
            put_len(out, v.len());
            for n in v {
                out.extend_from_slice(&n.to_be_bytes());
            }
        }
    }
}

/// How a saved-data file is wrapped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Wrap {
    Gzip,
    Zlib,
    Plain,
}

/// A whole NBT file: its wrapping, its root's name and its root.
fn read_file_tree(bytes: &[u8]) -> Result<(Wrap, Vec<u8>, Tag), String> {
    let (wrap, raw) = match bytes.first().copied() {
        Some(0x1f) => (Wrap::Gzip, inflate(1, bytes)?),
        Some(0x78) => (Wrap::Zlib, inflate(2, bytes)?),
        Some(TAG_COMPOUND) => (Wrap::Plain, bytes.to_vec()),
        Some(other) => return Err(format!("not NBT (first byte 0x{other:02x})")),
        None => return Err("an empty file".to_string()),
    };
    let mut c = Cursor { bytes: &raw, at: 0 };
    if c.byte()? != TAG_COMPOUND {
        return Err("the root tag is not a compound".to_string());
    }
    let name = c.name()?.to_vec();
    let root = read_tag(&mut c, TAG_COMPOUND, 1)?;
    Ok((wrap, name, root))
}

fn encode_root(name: &[u8], root: &Tag) -> Vec<u8> {
    let mut out = vec![TAG_COMPOUND];
    out.extend_from_slice(&(name.len() as u16).to_be_bytes());
    out.extend_from_slice(name);
    put_tag(&mut out, root);
    out
}

fn compress(wrap: Wrap, raw: &[u8]) -> Vec<u8> {
    let finish = |w: std::io::Result<Vec<u8>>| w.unwrap_or_default();
    match wrap {
        Wrap::Plain => raw.to_vec(),
        Wrap::Gzip => {
            let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            let _ = enc.write_all(raw);
            finish(enc.finish())
        }
        Wrap::Zlib => {
            let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            let _ = enc.write_all(raw);
            finish(enc.finish())
        }
    }
}

// =============================================================================
// The mod stores (F6): what each must lose, worked out here
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StoreKind {
    Waystones,
    OreDeposits,
    Villages,
    Graveyard,
}

impl StoreKind {
    fn file(self) -> &'static str {
        match self {
            StoreKind::Waystones => "waystones.dat",
            StoreKind::OreDeposits => "large_ore_deposits.dat",
            StoreKind::Villages => "mca_villages.dat",
            StoreKind::Graveyard => "mca_graveyard.dat",
        }
    }

    fn what(self) -> &'static str {
        match self {
            StoreKind::Waystones => "waystone entries",
            StoreKind::OreDeposits => "deposit records",
            StoreKind::Villages => "village records",
            StoreKind::Graveyard => "grave chunk entries",
        }
    }

    /// The entries a file of this kind lists, for saying how far off it is.
    fn count(self, root: &Tag) -> usize {
        let list = |path: &[&str]| root.at(path).and_then(Tag::items).map_or(0, <[Tag]>::len);
        match self {
            StoreKind::Waystones => list(&["data", "Waystones"]),
            StoreKind::OreDeposits => list(&["data", "generated"]),
            StoreKind::Villages => list(&["data", "villages"]),
            StoreKind::Graveyard => match root.get("data") {
                Some(Tag::Compound(states)) => states.iter().map(|(_, s)| if let Tag::Compound(c) = s { c.len() } else { 0 }).sum(),
                _ => 0,
            },
        }
    }
}

/// `{X, Z}` or `{x, z}` of a block position compound.
fn block_xz(t: &Tag) -> Option<(i32, i32)> {
    let pick = |upper: &str, lower: &str| t.get(upper).or_else(|| t.get(lower)).and_then(Tag::number).and_then(|v| i32::try_from(v).ok());
    Some((pick("X", "x")?, pick("Z", "z")?))
}

/// The chunk of a packed block position (x in the top 26 bits, z in the next 26).
fn packed_chunk(v: i64) -> ChunkPos {
    (((v >> 38) as i32) >> 4, (((v << 26) >> 38) as i32) >> 4)
}

/// The chunks a recorded MCA building stands in, or `None` when that cannot
/// be read.
fn building_chunks(b: &Tag) -> Option<BTreeSet<ChunkPos>> {
    let mut chunks = BTreeSet::new();
    if let Some(Tag::Compound(kinds)) = b.get("blocks2") {
        for (_, positions) in kinds {
            for p in positions.items()? {
                let (x, z) = block_xz(p)?;
                chunks.insert((x >> 4, z >> 4));
            }
        }
    }
    if chunks.is_empty() {
        let coord = |key: &str| b.get(key).and_then(Tag::number).and_then(|v| i32::try_from(v).ok());
        chunks.insert((coord("posX")? >> 4, coord("posZ")? >> 4));
    }
    Some(chunks)
}

/// A village every recorded building of which stands in chunks of the plan.
fn village_gone(v: &Tag, planned: Option<&BTreeSet<ChunkPos>>) -> bool {
    let Some(planned) = planned else { return false };
    let Some(buildings) = v.get("buildings").and_then(Tag::items) else { return false };
    let (mut inside, mut outside) = (0, 0);
    for b in buildings {
        let Some(chunks) = building_chunks(b) else { return false };
        for c in &chunks {
            if planned.contains(c) {
                inside += 1;
            } else {
                outside += 1;
            }
        }
    }
    inside > 0 && outside == 0
}

/// The store as it must be after the plan: its root, how many entries go, and
/// of how many. `dim` is the dimension whose `data/` folder holds it.
fn reconcile(kind: StoreKind, root: &Tag, plan: &Plan, dim: &str) -> Result<(Tag, usize, usize), String> {
    let mut root = root.clone();
    match kind {
        StoreKind::Waystones => {
            let list = root.at_mut(&["data", "Waystones"]).and_then(Tag::items_mut).ok_or("no data.Waystones list")?;
            let of = list.len();
            let mut unplaced = 0usize;
            list.retain(|w| {
                let world = w.get("World").and_then(Tag::text).unwrap_or(OVERWORLD);
                match w.get("BlockPos").and_then(block_xz) {
                    Some((x, z)) => !plan.names(world, (x >> 4, z >> 4)),
                    None => {
                        unplaced += 1;
                        true
                    }
                }
            });
            if unplaced > 0 {
                return Err(format!("{unplaced} waystone(s) have no readable position"));
            }
            let removed = of - list.len();
            Ok((root, removed, of))
        }
        StoreKind::OreDeposits => {
            let mut gone: BTreeSet<i64> = BTreeSet::new();
            let (removed, of) = {
                let generated = root.at_mut(&["data", "generated"]).and_then(Tag::items_mut).ok_or("no data.generated list")?;
                let of = generated.len();
                generated.retain(|g| match g.get("pos").and_then(Tag::number) {
                    Some(pos) if plan.names(dim, packed_chunk(pos)) => {
                        gone.insert(pos);
                        false
                    }
                    _ => true,
                });
                (of - generated.len(), of)
            };
            if let Some(points) = root.at_mut(&["data", "points"]).and_then(Tag::items_mut) {
                points.retain(|p| !matches!(p, Tag::Longs(pair) if pair.len() == 2 && gone.contains(&pair[1])));
            }
            Ok((root, removed, of))
        }
        StoreKind::Villages => {
            let planned = plan.chunks.get(dim);
            let villages = root.at_mut(&["data", "villages"]).and_then(Tag::items_mut).ok_or("no data.villages list")?;
            let of = villages.len();
            villages.retain(|v| !village_gone(v, planned));
            let removed = of - villages.len();
            Ok((root, removed, of))
        }
        StoreKind::Graveyard => {
            let (mut of, mut removed) = (0usize, 0usize);
            if let Some(Tag::Compound(states)) = root.get_mut("data") {
                for (_, state) in states.iter_mut() {
                    if let Tag::Compound(by_chunk) = state {
                        of += by_chunk.len();
                        by_chunk.retain(|(key, _)| {
                            // ChunkPos.toLong: x in the low 32 bits, z in the high.
                            let gone = std::str::from_utf8(key)
                                .ok()
                                .and_then(|k| k.parse::<i64>().ok())
                                .is_some_and(|k| plan.names(dim, (k as i32, (k >> 32) as i32)));
                            if gone {
                                removed += 1;
                            }
                            !gone
                        });
                    }
                }
                if removed > 0 {
                    states.retain(|(_, state)| !matches!(state, Tag::Compound(by_chunk) if by_chunk.is_empty()));
                }
            }
            Ok((root, removed, of))
        }
    }
}

/// A store before the run, and what it must be after.
#[derive(Debug, Clone)]
struct StoreBefore {
    rel: String,
    kind: StoreKind,
    existed: bool,
    removed: usize,
    of: usize,
    /// When something goes: the file as it must read afterwards.
    expected: Option<(Wrap, Vec<u8>, Tag)>,
}

/// The stores a plan's dimensions have: the world's waystones, and each
/// dimension's deposits, villages and graves.
fn store_files(by_folder: &BTreeMap<String, BTreeSet<ChunkPos>>) -> Vec<(String, StoreKind, String)> {
    let mut out = vec![("data/waystones.dat".to_string(), StoreKind::Waystones, OVERWORLD.to_string())];
    for folder in by_folder.keys() {
        for kind in [StoreKind::OreDeposits, StoreKind::Villages, StoreKind::Graveyard] {
            out.push((join(folder, &format!("data/{}", kind.file())), kind, folder_label(folder)));
        }
    }
    out
}

fn stores_before(world: &Path, plan: &Plan, by_folder: &BTreeMap<String, BTreeSet<ChunkPos>>) -> Result<Vec<StoreBefore>, String> {
    let mut out = Vec::new();
    for (rel, kind, dim) in store_files(by_folder) {
        let bytes = match fs::read(at(world, &rel)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                out.push(StoreBefore { rel, kind, existed: false, removed: 0, of: 0, expected: None });
                continue;
            }
            Err(e) => return Err(format!("{rel}: {e}")),
        };
        let (wrap, name, root) = read_file_tree(&bytes).map_err(|e| format!("{rel} does not read ({e}), so what it must lose cannot be worked out"))?;
        let (expected, removed, of) = reconcile(kind, &root, plan, &dim).map_err(|e| format!("{rel}: {e}"))?;
        out.push(StoreBefore { rel, kind, existed: true, removed, of, expected: (removed > 0).then_some((wrap, name, expected)) });
    }
    Ok(out)
}

// =============================================================================
// The world edits (F10): what each must make of its file, worked out here
// =============================================================================

#[derive(Debug, Clone)]
enum EditExpect {
    /// The tree it must read as, wrapped as it was, under its old root name.
    Tree(Wrap, Vec<u8>, Tag),
    /// It must be gone from the world.
    Gone,
}

#[derive(Debug, Clone)]
struct EditFile {
    rel: String,
    /// What the edit is, for a finding.
    what: &'static str,
    expect: EditExpect,
}

/// A kept chunk marked for blending: where its record was, and its tree after.
#[derive(Debug, Clone)]
struct BlendExpect {
    location: u32,
    timestamp: u32,
    name: Vec<u8>,
    tree: Tag,
}

fn drop_keys(tag: &mut Tag, keys: &[&[u8]]) -> usize {
    match tag {
        Tag::Compound(entries) => {
            let before = entries.len();
            entries.retain(|(name, _)| !keys.contains(&name.as_slice()));
            before - entries.len()
        }
        _ => 0,
    }
}

/// A chunk record's compression type, from a region file in memory, and its
/// tree: `None` for one whose data is in a `.mcc`.
fn record_tree(bytes: &[u8], location: u32) -> Result<Option<(Vec<u8>, Tag)>, String> {
    let start = (location >> 8) as usize * SECTOR;
    if start < 2 * SECTOR || start + 5 > bytes.len() {
        return Err("its record is not inside the file".to_string());
    }
    let len = be32(bytes, start) as usize;
    let kind = bytes[start + 4];
    if kind & 0x80 != 0 {
        return Ok(None);
    }
    let data = bytes.get(start + 5..start + 4 + len).ok_or("its record runs past the end of the file")?;
    let raw = inflate(kind & 0x7f, data)?;
    let mut c = Cursor { bytes: &raw, at: 0 };
    if c.byte()? != TAG_COMPOUND {
        return Err("its root tag is not a compound".to_string());
    }
    let name = c.name()?.to_vec();
    Ok(Some((name, read_tag(&mut c, TAG_COMPOUND, 1)?)))
}

/// Every file and kept chunk the plan's edits change, and what each must be.
fn edits_before(world: &Path, plan: &Plan, survey: &Survey) -> Result<(Vec<EditFile>, BTreeMap<Key, BlendExpect>), String> {
    let e = &plan.edits;
    let mut files = Vec::new();
    let mut blends = BTreeMap::new();
    if e.is_empty() {
        return Ok((files, blends));
    }
    let tree_of = |rel: &str| -> Result<(Wrap, Vec<u8>, Tag), String> {
        let bytes = fs::read(at(world, rel)).map_err(|e| format!("{rel}: {e}"))?;
        read_file_tree(&bytes).map_err(|e| format!("{rel} does not read ({e}), so what the plan makes of it cannot be worked out"))
    };
    if e.new_seed.is_some() || e.spawn_search {
        for rel in ["level.dat", "level.dat_old"] {
            if !survey.files.contains_key(rel) {
                if rel == "level.dat" {
                    return Err("there is no level.dat".to_string());
                }
                continue;
            }
            let (wrap, name, mut tree) = tree_of(rel)?;
            if let Some(seed) = e.new_seed {
                match tree.at_mut(&["Data", "WorldGenSettings", "seed"]) {
                    Some(Tag::Long(v)) => *v = seed,
                    _ => return Err(format!("{rel} has no Data.WorldGenSettings.seed")),
                }
            }
            if e.spawn_search {
                match tree.at_mut(&["Data", "SpawnY"]) {
                    Some(Tag::Int(v)) => *v = e.spawn_y,
                    _ => return Err(format!("{rel} has no Data.SpawnY")),
                }
            }
            files.push(EditFile { rel: rel.to_string(), what: "the new seed and the spawn's height", expect: EditExpect::Tree(wrap, name, tree) });
        }
    }
    if e.new_seed.is_some() {
        for rel in survey.files.keys() {
            if rel == &format!("data/{STRONGHOLD_CACHE}") || rel.ends_with(&format!("/data/{STRONGHOLD_CACHE}")) {
                files.push(EditFile { rel: rel.clone(), what: "the old seed's stronghold cache", expect: EditExpect::Gone });
            }
        }
        if survey.files.contains_key(PUPFISH_FILE) {
            let (wrap, name, mut tree) = tree_of(PUPFISH_FILE)?;
            let gone = tree.get_mut("data").map_or(0, |data| drop_keys(data, &PUPFISH_KEYS));
            if gone > 0 {
                files.push(EditFile { rel: PUPFISH_FILE.to_string(), what: "the old seed's pupfish chunk removed", expect: EditExpect::Tree(wrap, name, tree) });
            }
        }
    }
    if e.spawn_search && survey.files.contains_key(SPAWN_DATA_FILE) {
        let (wrap, name, mut tree) = tree_of(SPAWN_DATA_FILE)?;
        let mut gone = drop_keys(&mut tree, &SPAWN_SERVER_KEYS);
        if let Some(level) = tree.get_mut(std::str::from_utf8(SPAWN_LEVEL).unwrap_or("")) {
            gone += drop_keys(level, &SPAWN_LEVEL_KEYS);
        }
        if gone > 0 {
            files.push(EditFile { rel: SPAWN_DATA_FILE.to_string(), what: "the spawn markers removed", expect: EditExpect::Tree(wrap, name, tree) });
        }
    }
    for uuid in &e.reset_players {
        let prefix = format!("playerdata/{uuid}.");
        let mine: Vec<&String> = survey.files.keys().filter(|rel| rel.to_ascii_lowercase().starts_with(&prefix)).collect();
        if mine.is_empty() {
            return Err(format!("the file of a player who starts over (playerdata/{}...) is not there", &uuid[..uuid.len().min(8)]));
        }
        for rel in mine {
            files.push(EditFile { rel: rel.clone(), what: "the file of a player who starts over", expect: EditExpect::Gone });
        }
    }
    if e.blend {
        // Every kept overworld terrain chunk that Tectonic tagged 1.
        let planned = plan.chunks.get(OVERWORLD);
        let mut by_file: BTreeMap<String, Vec<(ChunkPos, Image)>> = BTreeMap::new();
        for ((folder, store, pos), image) in &survey.chunks {
            if folder.is_empty() && *store == 0 && !planned.is_some_and(|set| set.contains(pos)) {
                by_file.entry(region_rel("", 0, *pos)).or_default().push((*pos, *image));
            }
        }
        for (rel, chunks) in by_file {
            let bytes = fs::read(at(world, &rel)).map_err(|e| format!("{rel}: {e}"))?;
            for (pos, image) in chunks {
                let Some((name, mut tree)) = record_tree(&bytes, image.location).map_err(|e| format!("{rel}: chunk {}: {e}", chunk_text(pos)))? else { continue };
                let tagged = match &mut tree {
                    Tag::Compound(entries) => entries.iter_mut().find(|(n, _)| n.as_slice() == BLEND_TAG).map(|(_, v)| v),
                    _ => None,
                };
                if let Some(value @ Tag::Int(1)) = tagged {
                    *value = Tag::Int(0);
                    blends.insert((String::new(), 0, pos), BlendExpect { location: image.location, timestamp: image.timestamp, name, tree });
                }
            }
        }
    }
    Ok((files, blends))
}

// =============================================================================
// The verdict
// =============================================================================

/// One invariant's result.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Check {
    /// `F1` to `F9`.
    pub id: String,
    pub name: String,
    /// `holds`, `FAIL`, `pending`, `not run`, `CI`.
    pub state: String,
    /// A few words for the one-line verdict, counts only.
    pub summary: String,
    pub counts: Vec<String>,
    /// The first [`SHOWN`] findings.
    pub findings: Vec<String>,
    pub findings_total: usize,
}

impl Check {
    fn failed(&self) -> bool {
        self.state == FAILED
    }
}

// The test hook "the harness stubbed to holds": a check named here drops its
// findings. Per thread, so a test that blinds a check cannot reach another
// test running beside it.
#[cfg(test)]
thread_local! {
    static BLIND: std::cell::RefCell<Vec<String>> = std::cell::RefCell::new(Vec::new());
}

#[cfg(test)]
pub(crate) fn blind_for_test(ids: &[&str]) {
    BLIND.with(|b| *b.borrow_mut() = ids.iter().map(|s| s.to_string()).collect());
}

#[cfg(test)]
fn blinded(id: &str) -> bool {
    BLIND.with(|b| b.borrow().iter().any(|x| x == id))
}

#[cfg(not(test))]
fn blinded(_id: &str) -> bool {
    false
}

// The test hook "something changed the world after the run's own check":
// called on the world at the start of [`after`].
#[cfg(test)]
thread_local! {
    pub(crate) static TAMPER: std::cell::RefCell<Option<Box<dyn Fn(&Path)>>> = std::cell::RefCell::new(None);
}

fn finish(id: &str, name: &str, summary: String, counts: Vec<String>, mut findings: Vec<String>) -> Check {
    if blinded(id) {
        findings.clear();
    }
    let total = findings.len();
    findings.truncate(SHOWN);
    Check {
        id: id.to_string(),
        name: name.to_string(),
        state: if total == 0 { HELD } else { FAILED }.to_string(),
        summary: if total == 0 { summary } else { format!("{summary}, {} finding(s)", num(total)) },
        counts,
        findings,
        findings_total: total,
    }
}

/// The harness's word on one run.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Verdict {
    pub format: String,
    pub version: u32,
    pub plan_hash: String,
    /// [`HOLDS`] or [`FAIL`].
    pub verdict: String,
    pub checks: Vec<Check>,
    pub self_test: SelfTest,
}

impl Verdict {
    pub fn holds(&self) -> bool {
        self.verdict == HOLDS
    }

    /// One line: the verdict and each check's counts. No position, no name.
    pub fn line(&self) -> String {
        let parts: Vec<String> = self.checks.iter().filter(|c| c.state == HELD || c.state == FAILED).map(|c| format!("{} {}", c.id, c.summary)).collect();
        format!("fidelity harness {}: {}", self.verdict, parts.join("; "))
    }

    fn of(plan_hash: &str, checks: Vec<Check>, self_test: Option<&SelfTest>) -> Verdict {
        let verdict = if checks.iter().any(Check::failed) { FAIL } else { HOLDS };
        Verdict {
            format: FORMAT.to_string(),
            version: VERSION,
            plan_hash: plan_hash.to_string(),
            verdict: verdict.to_string(),
            checks,
            self_test: self_test.cloned().unwrap_or_default(),
        }
    }
}

/// `fidelity.json`: the verdict, and what is not part of it (who wrote the
/// plan, when, how long each part took).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Record {
    pub format: String,
    pub version: u32,
    pub written_utc: String,
    /// The plan's author label (F9: shown, never read by a check).
    pub plan_author: String,
    pub seconds_self_test: f64,
    pub seconds_before: f64,
    pub seconds_after: f64,
    pub verdict: Verdict,
}

/// A holding or dry-run folder's `fidelity.json`.
pub fn load(dir: &Path) -> Option<Record> {
    serde_json::from_slice(&fs::read(dir.join(FIDELITY_FILE)).ok()?).ok()
}

fn round(secs: f64) -> f64 {
    (secs * 10.0).round() / 10.0
}

fn save_record(dir: &Path, plan: &Plan, verdict: &Verdict, seconds: [f64; 3]) -> Result<(), String> {
    let record = Record {
        format: FORMAT.to_string(),
        version: VERSION,
        written_utc: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        plan_author: plan.author.clone(),
        seconds_self_test: round(seconds[0]),
        seconds_before: round(seconds[1]),
        seconds_after: round(seconds[2]),
        verdict: verdict.clone(),
    };
    let mut body = serde_json::to_string_pretty(&record).map_err(|e| e.to_string())?;
    body.push('\n');
    fs::write(dir.join(FIDELITY_FILE), body).map_err(|e| format!("{FIDELITY_FILE} could not be written: {e}"))
}

/// A run the harness refused before anything was touched: what it found, into
/// the dry-run's folder.
pub fn save_refusal(run_dir: &Path, plan: &Plan, self_test: &SelfTest, before: Option<&Before>) -> Result<(), String> {
    let mut checks = Vec::new();
    if let Some(b) = before {
        checks.push(b.f3.clone());
        checks.push(b.f4_before());
    }
    checks.push(check_f7(Some(self_test)));
    let verdict = Verdict::of(&plan.hash, checks, Some(self_test));
    save_record(run_dir, plan, &verdict, [self_test.seconds, before.map_or(0.0, |b| b.seconds), 0.0])
}

// =============================================================================
// Before the changes
// =============================================================================

/// The world as the harness found it before the run, and what it says of the
/// plan already (F3, F4 before).
pub struct Before {
    by_folder: BTreeMap<String, BTreeSet<ChunkPos>>,
    survey: Survey,
    /// Files the run may change: region files listing a chunk of the plan,
    /// `.mcc` files of its chunks, the stores, the world's record.
    plan_files: BTreeSet<String>,
    stores: Vec<StoreBefore>,
    /// The files the plan's world edits change, and what each must be (F10).
    edit_files: Vec<EditFile>,
    /// The kept chunks marked for blending, and what each must be (F10).
    blends: BTreeMap<Key, BlendExpect>,
    /// `.icraft_world.json` as it was.
    record: Option<Vec<u8>>,
    f3: Check,
    pub seconds: f64,
}

impl Before {
    /// Why the run may not go ahead, if it may not.
    pub fn refusal(&self) -> Option<String> {
        self.f3.failed().then(|| {
            format!(
                "the fidelity harness found {} chunk(s) of the plan that the protection map keeps, as derived now ({}): a regeneration may touch no protected chunk, so nothing is done. The chunks are listed in {FIDELITY_FILE}",
                num(self.f3.findings_total),
                self.f3.counts.last().cloned().unwrap_or_default()
            )
        })
    }

    /// F4 as it stands before the changes: never a failure.
    fn f4_before(&self) -> Check {
        let defects: Vec<&Defect> = self.survey.defects.iter().filter(|d| self.survey.decoded.contains(&d.file)).collect();
        let mut check = finish(
            "F4",
            "region integrity",
            format!("{} defect(s) already in the {} region file(s) the plan touches", num(defects.len()), num(self.survey.decoded.len())),
            vec![format!("{} region file(s) the plan touches, every chunk in them decompressed and parsed", num(self.survey.decoded.len()))],
            Vec::new(),
        );
        check.counts.extend(defects.iter().take(SHOWN).map(|d| format!("already there: {}: {}", d.file, d.what)));
        check
    }

    /// One line for the log: counts only.
    pub fn line(&self) -> String {
        let defects = self.survey.defects.iter().filter(|d| self.survey.decoded.contains(&d.file)).count();
        format!(
            "fidelity harness, before the changes: {} file(s) and {} chunk record(s) hashed; {} region file(s) the plan touches decoded ({} defect(s) already there); F3 {}",
            num(self.survey.files.len()),
            num(self.survey.chunks.len()),
            num(self.survey.decoded.len()),
            num(defects),
            self.f3.summary
        )
    }
}

/// F3: the plan's chunks against the protection map, derived now.
fn check_f3(world: &Path, plan: &Plan, survey: &Survey) -> Result<Check, String> {
    let level = worlddata::read_level(world)?;
    // Names only label the layers; none is needed here. A player file that
    // does not read is a bed and a logout spot that cannot be kept.
    let files = worlddata::read_players(world, &BTreeMap::new());
    if !files.unreadable.is_empty() {
        return Err(format!(
            "{} player file(s) do not read, nor their .dat_old, so where those players sleep and logged out cannot be protected",
            files.unreadable.len()
        ));
    }
    // A player who starts over leaves with their file: nothing keeps their
    // bed or logout spot (the plan's own list, F10 checks that they leave).
    let players: Vec<worlddata::Player> = files.players.into_iter().filter(|p| !plan.edits.reset_players.contains(&p.uuid)).collect();
    let claims = match worlddata::read_claims(world) {
        Ok(found) => found.unwrap_or_default(),
        Err(_) if !plan.settings.claims => Vec::new(),
        Err(e) => return Err(format!("Open Parties and Claims data does not read, so claims cannot be protected: {e}")),
    };
    let waystones = match worlddata::read_waystones(world) {
        Ok(found) => found.unwrap_or_default(),
        Err(_) if plan.settings.waystones == WaystoneMode::Off => Vec::new(),
        Err(e) => return Err(format!("waystones.dat does not read, so waystones cannot be protected: {e}")),
    };
    let sources = protection::Sources { level: &level, players: &players, claims: &claims, waystones: &waystones };
    let mut findings = Vec::new();
    let mut by_layers: BTreeMap<String, usize> = BTreeMap::new();
    let mut kept_on_disk = 0usize;
    for (dim, chunks) in &plan.chunks {
        let folder = dim_folder(dim).ok_or_else(|| format!("no folder for {dim}"))?;
        // What protection::build reads of the chunks: which are on disk, and
        // each terrain chunk's InhabitedTime and readability, as read here.
        let mut scan = DimensionScan::default();
        for ((f, store, pos), _) in &survey.chunks {
            if *f != folder {
                continue;
            }
            let entry = scan.chunks.entry(*pos).or_default();
            if *store == 0 {
                match survey.readings.get(&(f.clone(), 0, *pos)) {
                    Some(Reading::Parsed(ticks)) => entry.inhabited = *ticks,
                    Some(Reading::Damaged(why)) => entry.unreadable = Some(why.clone()),
                    None => {}
                }
            }
        }
        let map = protection::build(dim, &sources, &plan.settings, &scan);
        kept_on_disk += scan.chunks.keys().filter(|pos| map.is_protected(**pos)).count();
        for pos in chunks {
            let layers = map.layers_at(*pos);
            if layers != 0 {
                let names = protection::layer_names(layers);
                *by_layers.entry(names.clone()).or_default() += 1;
                findings.push(format!("{dim} {}: protected ({names})", chunk_text(*pos)));
            }
        }
    }
    let total = plan.total();
    let mut counts = vec![
        format!("{} chunk(s) in the plan", num(total)),
        format!("{} chunk(s) on disk in the plan's dimensions are protected (kept) by the map as derived now", num(kept_on_disk)),
    ];
    if !by_layers.is_empty() {
        counts.push(by_layers.iter().map(|(names, n)| format!("{names} {n}")).collect::<Vec<_>>().join(", "));
    }
    Ok(finish("F3", "protected intersection", format!("{} of {} planned chunk(s) protected", num(findings.len()), num(total)), counts, findings))
}

/// Read the world before a run: the manifest (F1, F5), the stores (F6), the
/// region files the plan touches decoded (F4), and the plan against the
/// protection map (F3). `Err`: the harness cannot vouch for a run, because it
/// could not read what it needs.
pub fn before(world: &Path, plan: &Plan) -> Result<Before, String> {
    let started = Instant::now();
    let by_folder = plan.by_folder()?;
    let survey = survey(world, &Decode::Touching(&by_folder))?;
    let stores = stores_before(world, plan, &by_folder)?;
    let record = match fs::read(world.join(crate::overrides::WORLD_MANIFEST)) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("{}: {e}", crate::overrides::WORLD_MANIFEST)),
    };
    let mut plan_files: BTreeSet<String> = survey.decoded.clone();
    for rel in survey.files.keys() {
        if let Some((folder, pos)) = mcc_of_rel(rel) {
            if by_folder.get(&folder).is_some_and(|set| set.contains(&pos)) {
                plan_files.insert(rel.clone());
            }
        }
    }
    plan_files.extend(stores.iter().map(|s| s.rel.clone()));
    plan_files.insert(crate::overrides::WORLD_MANIFEST.to_string());
    let (edit_files, blends) = edits_before(world, plan, &survey)?;
    plan_files.extend(edit_files.iter().map(|f| f.rel.clone()));
    plan_files.extend(blends.keys().map(|(folder, store, pos)| region_rel(folder, *store, *pos)));
    let f3 = check_f3(world, plan, &survey)?;
    Ok(Before { by_folder, survey, plan_files, stores, edit_files, blends, record, f3, seconds: started.elapsed().as_secs_f64() })
}

// =============================================================================
// After the changes
// =============================================================================

fn per_store(counts: &[usize; 3]) -> String {
    format!("{} / {} / {}", num(counts[0]), num(counts[1]), num(counts[2]))
}

fn names(before: &Before, key: &Key) -> bool {
    before.by_folder.get(&key.0).is_some_and(|set| set.contains(&key.2))
}

fn chunk_label(key: &Key) -> String {
    format!("{} {} chunk {}", folder_label(&key.0), STORES[usize::from(key.1)], chunk_text(key.2))
}

/// F1: every chunk record the plan does not name, as it was.
fn check_f1(before: &Before, now: &Survey) -> Check {
    let mut same = [0usize; 3];
    let mut findings = Vec::new();
    for (key, was) in &before.survey.chunks {
        // A chunk marked for blending changes by one tag: F10's to check.
        if names(before, key) || before.blends.contains_key(key) {
            continue;
        }
        match now.chunks.get(key) {
            None => findings.push(format!("{}: not in the plan, and gone", chunk_label(key))),
            Some(is) if is == was => same[usize::from(key.1)] += 1,
            Some(is) => {
                let mut what = Vec::new();
                if is.location != was.location {
                    what.push("its location entry");
                }
                if is.timestamp != was.timestamp {
                    what.push("its timestamp");
                }
                if is.sha256 != was.sha256 {
                    what.push("its stored data");
                }
                findings.push(format!("{}: not in the plan, and {} changed", chunk_label(key), what.join(", ")));
            }
        }
    }
    for key in now.chunks.keys() {
        if !before.survey.chunks.contains_key(key) {
            findings.push(format!("{}: on disk now, and was not before", chunk_label(key)));
        }
    }
    let mut counts = vec![format!("{} chunk record(s) not in the plan, identical after the run (region / entities / poi)", per_store(&same))];
    if !before.blends.is_empty() {
        counts.push(format!("{} kept chunk(s) marked for blending are checked by F10 instead", num(before.blends.len())));
    }
    finish("F1", "unnamed chunks byte-identical", format!("{} kept chunk record(s) identical (region / entities / poi)", per_store(&same)), counts, findings)
}

/// F2: every chunk the plan names is gone, and its `.mcc` with it.
fn check_f2(before: &Before, now: &Survey) -> Check {
    let mut gone = [0usize; 3];
    let mut findings = Vec::new();
    for key in before.survey.chunks.keys() {
        if !names(before, key) {
            continue;
        }
        if now.chunks.contains_key(key) {
            findings.push(format!("{}: named by the plan, and still there", chunk_label(key)));
        } else {
            gone[usize::from(key.1)] += 1;
        }
    }
    for rel in now.files.keys() {
        if let Some((folder, pos)) = mcc_of_rel(rel) {
            if before.by_folder.get(&folder).is_some_and(|set| set.contains(&pos)) {
                findings.push(format!("{rel}: the oversized-chunk file of a chunk the plan names, still there"));
            }
        }
    }
    let on_disk: BTreeSet<(&String, ChunkPos)> = before.survey.chunks.keys().map(|(f, _, pos)| (f, *pos)).collect();
    let mut not_on_disk = 0usize;
    for (folder, set) in &before.by_folder {
        not_on_disk += set.iter().filter(|pos| !on_disk.contains(&(folder, **pos))).count();
    }
    let mut counts = vec![format!("{} chunk record(s) the plan names, gone (region / entities / poi)", per_store(&gone))];
    if not_on_disk > 0 {
        counts.push(format!("{} chunk(s) the plan names were not on disk before the run", num(not_on_disk)));
    }
    finish("F2", "the plan happened", format!("{} reset chunk record(s) gone", per_store(&gone)), counts, findings)
}

/// F4 after: no defect in a region file the plan touched that was not there before.
fn check_f4(before: &Before, now: &Survey) -> Check {
    let already = before.survey.defects.iter().filter(|d| before.survey.decoded.contains(&d.file)).count();
    let present = before.survey.decoded.iter().filter(|rel| now.files.contains_key(*rel)).count();
    let findings: Vec<String> = now
        .defects
        .iter()
        .filter(|d| before.survey.decoded.contains(&d.file) && !before.survey.defects.contains(*d))
        .map(|d| format!("{}: {} (new since the run)", d.file, d.what))
        .collect();
    finish(
        "F4",
        "region integrity",
        format!("{} new defect(s) in the {} rewritten region file(s) ({} already there before)", num(findings.len()), num(present), num(already)),
        vec![
            format!("{} region file(s) the plan touched; {} of them still in the world, every chunk in them decompressed and parsed again", num(before.survey.decoded.len()), num(present)),
            format!("{} defect(s) were already there before the run (not the run's)", num(already)),
        ],
        findings,
    )
}

/// F5: every other file as it was, nothing new, and the world's record grown by one entry.
fn check_f5(plan: &Plan, before: &Before, now: &Survey, record_now: Option<&[u8]>) -> Check {
    let mut same = 0usize;
    let mut findings = Vec::new();
    for (rel, was) in &before.survey.files {
        if before.plan_files.contains(rel) {
            continue;
        }
        match now.files.get(rel) {
            None => findings.push(format!("{rel}: not part of the plan, and gone")),
            Some(is) if is == was => same += 1,
            Some(is) => {
                let mut what = Vec::new();
                if is.size != was.size {
                    what.push("its size");
                }
                if is.modified != was.modified {
                    what.push("its modified time");
                }
                if is.sha256 != was.sha256 {
                    what.push("its content");
                }
                findings.push(format!("{rel}: not part of the plan, and {} changed", what.join(", ")));
            }
        }
    }
    for rel in now.files.keys() {
        if !before.survey.files.contains_key(rel) && !before.plan_files.contains(rel) {
            findings.push(format!("{rel}: a file that was not there before"));
        }
    }
    let manifest = crate::overrides::WORLD_MANIFEST;
    match record_check(plan, before.record.as_deref(), record_now) {
        Ok(()) => {}
        Err(why) => findings.push(format!("{manifest}: {why}")),
    }
    finish(
        "F5",
        "every other file unchanged",
        format!("{} other file(s) identical", num(same)),
        vec![
            format!("{} file(s) outside the plan's set identical in size, modified time and sha256", num(same)),
            format!("{} file(s) in the plan's set (region files it touches, its .mcc files, the stores, the world's record)", num(before.plan_files.len())),
        ],
        findings,
    )
}

/// The world's record: one entry added for this plan, every other key as it was.
fn record_check(plan: &Plan, was: Option<&[u8]>, is: Option<&[u8]>) -> Result<(), String> {
    let parse = |bytes: &[u8]| serde_json::from_slice::<serde_json::Value>(bytes).ok().and_then(|v| v.as_object().cloned());
    let Some(is) = is else { return Err("the run did not record itself".to_string()) };
    let is = parse(is).ok_or("does not parse as a JSON object after the run")?;
    let was = match was {
        Some(bytes) => parse(bytes).ok_or("did not parse as a JSON object before the run")?,
        None => serde_json::Map::new(),
    };
    // A plan that changes the seed adds one entry to `seed_changes` as well.
    let seeds = plan.edits.new_seed.is_some();
    let grows = |key: &str| key == "regenerations" || (seeds && key == "seed_changes");
    for (key, value) in &was {
        if !grows(key) && is.get(key) != Some(value) {
            return Err(format!("'{key}' changed"));
        }
    }
    for key in is.keys() {
        if !grows(key) && !was.contains_key(key) && !(key == "version" && was.is_empty()) {
            return Err(format!("'{key}' was added"));
        }
    }
    if seeds {
        let none = Vec::new();
        let before_list = was.get("seed_changes").and_then(|v| v.as_array()).unwrap_or(&none);
        let after_list = is.get("seed_changes").and_then(|v| v.as_array()).ok_or("has no 'seed_changes' list, and the plan changes the seed")?;
        if after_list.len() != before_list.len() + 1 || after_list[..before_list.len()] != before_list[..] {
            return Err(format!("'seed_changes' went from {} entries to {}, not by one added at the end", before_list.len(), after_list.len()));
        }
        if after_list.last().and_then(|e| e["plan_hash"].as_str()) != Some(plan.hash.as_str()) {
            return Err("its new seed change is not this plan's".to_string());
        }
    }
    let empty = Vec::new();
    let before_list = was.get("regenerations").and_then(|v| v.as_array()).unwrap_or(&empty);
    let after_list = is.get("regenerations").and_then(|v| v.as_array()).ok_or("has no 'regenerations' list")?;
    if after_list.len() != before_list.len() + 1 || after_list[..before_list.len()] != before_list[..] {
        return Err(format!("'regenerations' went from {} entries to {}, not by one added at the end", before_list.len(), after_list.len()));
    }
    if after_list.last().and_then(|e| e["plan_hash"].as_str()) != Some(plan.hash.as_str()) {
        return Err("its new entry is not this plan's".to_string());
    }
    Ok(())
}

/// F6: each store is its original minus exactly the entries of the plan's chunks.
fn check_f6(world: &Path, before: &Before, now: &Survey) -> Check {
    let mut exact = 0usize;
    let mut counts = Vec::new();
    let mut findings = Vec::new();
    for s in &before.stores {
        let was = before.survey.files.get(&s.rel);
        let is = now.files.get(&s.rel);
        match &s.expected {
            None => {
                if is == was {
                    if s.existed {
                        exact += 1;
                        counts.push(format!("{}: none of its {} {} is in a reset chunk: unchanged", s.rel, num(s.of), s.kind.what()));
                    }
                } else {
                    findings.push(format!("{}: none of its {} is in a reset chunk, so it must not change, and it did", s.rel, s.kind.what()));
                }
            }
            Some((wrap, name, expected)) => {
                let read = fs::read(at(world, &s.rel)).map_err(|e| e.to_string()).and_then(|bytes| read_file_tree(&bytes));
                match read {
                    Ok((w, n, tree)) if w == *wrap && n == *name && tree == *expected => {
                        exact += 1;
                        counts.push(format!("{}: {} of {} {} removed, exactly those of reset chunks", s.rel, num(s.removed), num(s.of), s.kind.what()));
                    }
                    Ok((w, _, tree)) => findings.push(format!(
                        "{}: not its original minus exactly the {} {} of reset chunks (expected {} to stay, found {}{})",
                        s.rel,
                        num(s.removed),
                        s.kind.what(),
                        num(s.kind.count(expected)),
                        num(s.kind.count(&tree)),
                        if w != *wrap { ", and wrapped differently" } else { "" }
                    )),
                    Err(why) => findings.push(format!("{}: does not read after the run ({why})", s.rel)),
                }
            }
        }
    }
    let total = before.stores.iter().filter(|s| s.existed).count();
    finish("F6", "stores reconciled exactly", format!("{exact} of {total} store(s) exact"), counts, findings)
}

/// F10: every file the plan's world edits change is what they make of it, and
/// every kept chunk marked for blending is its old self with the tag 0.
fn check_f10(world: &Path, before: &Before, now: &Survey) -> Check {
    let mut findings = Vec::new();
    let mut exact = 0usize;
    for f in &before.edit_files {
        match &f.expect {
            EditExpect::Gone => {
                if now.files.contains_key(&f.rel) {
                    findings.push(format!("{}: was to leave the world ({}), and is still there", f.rel, f.what));
                } else {
                    exact += 1;
                }
            }
            EditExpect::Tree(wrap, name, tree) => match fs::read(at(world, &f.rel)).map_err(|e| e.to_string()).and_then(|bytes| read_file_tree(&bytes)) {
                Ok((w, n, t)) if w == *wrap && n == *name && t == *tree => exact += 1,
                Ok(_) => findings.push(format!("{}: is not its old self with {} and nothing else", f.rel, f.what)),
                Err(why) => findings.push(format!("{}: does not read after the run ({why})", f.rel)),
            },
        }
    }
    let mut marked = 0usize;
    let mut files: BTreeMap<String, Option<Vec<u8>>> = BTreeMap::new();
    for (key, b) in &before.blends {
        let label = chunk_label(key);
        let Some(is) = now.chunks.get(key) else {
            findings.push(format!("{label}: kept and marked for blending, and gone"));
            continue;
        };
        if is.location != b.location || is.timestamp != b.timestamp {
            findings.push(format!("{label}: marked for blending, and moved within its file or given a new timestamp"));
            continue;
        }
        let rel = region_rel(&key.0, key.1, key.2);
        let bytes = files.entry(rel.clone()).or_insert_with(|| fs::read(at(world, &rel)).ok());
        let Some(bytes) = bytes.as_deref() else {
            findings.push(format!("{label}: its region file does not read"));
            continue;
        };
        match record_tree(bytes, is.location) {
            Ok(Some((name, tree))) if name == b.name && tree == b.tree => marked += 1,
            Ok(Some(_)) => findings.push(format!("{label}: is not its old self with the blending tag 0 and nothing else changed")),
            Ok(None) => findings.push(format!("{label}: marked for blending, and its data is in a .mcc now")),
            Err(why) => findings.push(format!("{label}: does not read after the run ({why})")),
        }
    }
    let counts = vec![
        format!("{exact} of {} file(s) as the plan's edits make them (the seed, the spawn, the stores, the files that leave)", before.edit_files.len()),
        format!("{} of {} kept chunk(s) marked for blending, each its old tree with the tag 0 in its old place", num(marked), num(before.blends.len())),
    ];
    let summary = if before.edit_files.is_empty() && before.blends.is_empty() {
        "the plan makes no world edit".to_string()
    } else {
        format!("{exact} edited file(s) exact, {} chunk(s) marked for blending", num(marked))
    };
    finish("F10", "world edits exact", summary, counts, findings)
}

/// F7, from the self-test's result.
fn check_f7(self_test: Option<&SelfTest>) -> Check {
    let Some(t) = self_test else {
        return Check { id: "F7".to_string(), name: "planted-violation self-test".to_string(), state: NOT_RUN.to_string(), summary: "not run (this is the self-test)".to_string(), ..Check::default() };
    };
    let caught = t.plants.iter().filter(|p| p.caught).count();
    let mut findings: Vec<String> = t.plants.iter().filter(|p| !p.caught).map(|p| format!("{} ({}): NOT caught", p.name, p.invariant)).collect();
    if !t.error.is_empty() {
        findings.push(format!("the self-test could not run: {}", t.error));
    }
    if t.control != HOLDS {
        findings.push(format!("on the fixture with nothing planted the harness does not hold: {}", t.control));
    }
    if t.plants.is_empty() && t.error.is_empty() {
        findings.push("no plant was tried".to_string());
    }
    let counts = t.plants.iter().map(|p| format!("{} ({}): {}", p.name, p.invariant, if p.caught { "caught" } else { "NOT caught" })).collect();
    finish("F7", "planted-violation self-test", format!("{caught} of {} planted violation(s) caught", t.plants.len()), counts, findings)
}

fn pending(id: &str, name: &str, summary: &str, state: &str) -> Check {
    Check { id: id.to_string(), name: name.to_string(), state: state.to_string(), summary: summary.to_string(), ..Check::default() }
}

/// What [`after`] found.
pub struct Checked {
    pub verdict: Verdict,
    pub seconds: f64,
    /// [`KEPT_FILE`]'s body.
    kept: String,
}

impl Checked {
    /// `fidelity.json` and `fidelity-kept.tsv` into the run's holding folder.
    pub fn save(&self, dir: &Path, plan: &Plan, self_test_secs: f64, before_secs: f64) -> Result<(), String> {
        save_record(dir, plan, &self.verdict, [self_test_secs, before_secs, self.seconds])?;
        fs::write(dir.join(KEPT_FILE), &self.kept).map_err(|e| format!("{KEPT_FILE} could not be written: {e}"))
    }
}

/// Read the world after the run and hold it against what was there before and
/// what the plan says. `self_test`: the F7 result the run stood on (`None`
/// inside the self-test itself).
pub fn after(world: &Path, plan: &Plan, before: &Before, self_test: Option<&SelfTest>) -> Checked {
    // (A run's check, not one of the self-test's trials.)
    #[cfg(test)]
    TAMPER.with(|t| {
        if let (Some(tamper), true) = (t.borrow().as_ref(), self_test.is_some()) {
            tamper(world);
        }
    });
    let started = Instant::now();
    let tail = vec![
        check_f7(self_test),
        pending("F8", "after the first start", &format!("a report at the first launch after a server ran on the result ({AFTER_BOOT_FILE})"), PENDING),
        pending("F9", "one gate for every author", "a plan's author is a label no check reads (proven in CI)", IN_CI),
    ];
    let now = match survey(world, &Decode::Files(&before.survey.decoded)) {
        Ok(now) => now,
        Err(why) => {
            let mut checks = vec![finish("F5", "every other file unchanged", "the world does not read".to_string(), Vec::new(), vec![format!("the world does not read after the run: {why}")])];
            checks.extend(tail);
            return Checked { verdict: Verdict::of(&plan.hash, checks, self_test), seconds: started.elapsed().as_secs_f64(), kept: String::new() };
        }
    };
    let record_now = fs::read(world.join(crate::overrides::WORLD_MANIFEST)).ok();
    let mut checks = vec![
        check_f1(before, &now),
        check_f2(before, &now),
        before.f3.clone(),
        check_f4(before, &now),
        check_f5(plan, before, &now, record_now.as_deref()),
        check_f6(world, before, &now),
        check_f10(world, before, &now),
    ];
    checks.extend(tail);
    let mut kept = String::from("# folder\tstore\tx\tz\tlocation\ttimestamp\tsha256: every chunk record in the world when the run finished\n");
    for ((folder, store, pos), image) in &now.chunks {
        kept.push_str(&format!("{folder}\t{store}\t{}\t{}\t{:08x}\t{:08x}\t{}\n", pos.0, pos.1, image.location, image.timestamp, hex(&image.sha256)));
    }
    Checked { verdict: Verdict::of(&plan.hash, checks, self_test), seconds: started.elapsed().as_secs_f64(), kept }
}

// =============================================================================
// The self-test (F7)
// =============================================================================

/// One planted violation and what the harness said.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlantResult {
    pub name: String,
    /// The invariant that has to catch it.
    pub invariant: String,
    pub caught: bool,
    /// The finding that named it, or what the harness said instead.
    pub said: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SelfTest {
    /// The real region file the fixture was given, or why none was.
    pub real_file: String,
    /// [`HOLDS`] when the fixture with nothing planted holds; else what was found.
    pub control: String,
    pub plants: Vec<PlantResult>,
    /// Why the self-test could not be carried out at all.
    pub error: String,
    #[serde(skip)]
    pub seconds: f64,
}

impl Eq for SelfTest {}

impl SelfTest {
    pub fn passed(&self) -> bool {
        self.error.is_empty() && self.control == HOLDS && !self.plants.is_empty() && self.plants.iter().all(|p| p.caught)
    }

    /// One line, counts only.
    pub fn line(&self) -> String {
        let caught = self.plants.iter().filter(|p| p.caught).count();
        let real = if self.real_file.starts_with("none") { "a synthetic fixture only".to_string() } else { "a fixture with one real region file of this world".to_string() };
        if self.passed() {
            format!("fidelity harness self-test: {caught} of {} planted violation(s) caught on {real}; with nothing planted it holds", self.plants.len())
        } else if !self.error.is_empty() {
            format!("fidelity harness self-test could not run: {}", self.error)
        } else {
            let missed: Vec<&str> = self.plants.iter().filter(|p| !p.caught).map(|p| p.name.as_str()).collect();
            let control = if self.control == HOLDS { String::new() } else { "; with nothing planted it does not hold".to_string() };
            format!("fidelity harness self-test FAILED: {caught} of {} planted violation(s) caught on {real}{control}{}", self.plants.len(), if missed.is_empty() { String::new() } else { format!("; not caught: {}", missed.join(", ")) })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Plant {
    FlipByte,
    ZeroEntry,
    ExtraReset,
    BlockChange,
    Truncate,
    DropKeptWaystone,
    LeaveReset,
    OutsideFile,
    ProtectedInPlan,
    DropMcc,
    LeaveWaystone,
    SeedPlus,
    PlayerLeft,
    BlendExtra,
    BlendSkipped,
}

impl Plant {
    const ALL: [Plant; 15] = [
        Plant::FlipByte,
        Plant::ZeroEntry,
        Plant::ExtraReset,
        Plant::BlockChange,
        Plant::Truncate,
        Plant::DropKeptWaystone,
        Plant::LeaveReset,
        Plant::OutsideFile,
        Plant::ProtectedInPlan,
        Plant::DropMcc,
        Plant::LeaveWaystone,
        Plant::SeedPlus,
        Plant::PlayerLeft,
        Plant::BlendExtra,
        Plant::BlendSkipped,
    ];

    fn name(self) -> &'static str {
        match self {
            Plant::FlipByte => "a byte flipped in a kept chunk's data",
            Plant::ZeroEntry => "a kept chunk's header entry zeroed",
            Plant::ExtraReset => "a chunk outside the plan reset as well",
            Plant::BlockChange => "a block changed in a kept chunk, re-encoded as a well-formed chunk",
            Plant::Truncate => "a region file cut short",
            Plant::DropKeptWaystone => "a kept waystone removed from the store",
            Plant::LeaveReset => "a chunk the plan names left on disk",
            Plant::OutsideFile => "a file outside the plan changed",
            Plant::ProtectedInPlan => "a protected chunk added to the plan",
            Plant::DropMcc => "a kept oversized chunk's .mcc file removed",
            Plant::LeaveWaystone => "a reset chunk's waystone left in the store",
            Plant::SeedPlus => "level.dat given the new seed and one more change",
            Plant::PlayerLeft => "the file of a player who starts over left in the world",
            Plant::BlendExtra => "a chunk marked for blending with something else changed too",
            Plant::BlendSkipped => "a kept chunk to mark for blending left as it was",
        }
    }

    fn invariant(self) -> &'static str {
        match self {
            Plant::FlipByte | Plant::ZeroEntry | Plant::ExtraReset | Plant::BlockChange => "F1",
            Plant::LeaveReset => "F2",
            Plant::ProtectedInPlan => "F3",
            Plant::Truncate | Plant::DropMcc => "F4",
            Plant::OutsideFile => "F5",
            Plant::DropKeptWaystone | Plant::LeaveWaystone => "F6",
            Plant::SeedPlus | Plant::PlayerLeft | Plant::BlendExtra | Plant::BlendSkipped => "F10",
        }
    }
}

/// The fixture's dimension that holds the real region file.
const REAL_DIM: &str = "icraft:selftest";
const REAL_FOLDER: &str = "dimensions/icraft/selftest";
/// The fixture's overworld: r.0.0 holds chunks 0..=5 x 0..=5. Spawn is in
/// (0, 0) (radius 0), (2, 2) is lived in, a player's waystone stands in
/// (3, 3); (0, 5), (1, 5) and the oversized (1, 4) are outside the plan; the
/// other thirty are reset, among them the oversized (5, 0). r.1.0 holds two
/// chunks, both reset: the file goes whole.
const FIX_LIVED_IN: ChunkPos = (2, 2);
const FIX_WAYSTONE: ChunkPos = (3, 3);
const FIX_RESET_WAYSTONE: ChunkPos = (5, 5);
const FIX_UNNAMED: [ChunkPos; 2] = [(0, 5), (1, 5)];
const FIX_KEPT_MCC: ChunkPos = (1, 4);
const FIX_RESET_MCC: ChunkPos = (5, 0);
const FIX_LEFT: ChunkPos = (4, 4);
const FIX_STAMP: u32 = 1_760_000_000;
/// The fixture's kept chunks that Tectonic tagged: the plan marks them for
/// blending. (2, 2) is the one the blending plants go into.
const FIX_TAGGED: [ChunkPos; 3] = [(0, 0), FIX_LIVED_IN, FIX_WAYSTONE];
const FIX_BLEND_PLANT: ChunkPos = FIX_LIVED_IN;
const FIX_SEED_BEFORE: i64 = 1_019;
const FIX_SEED: i64 = -20_261_025;
/// A player who starts over, and logged out in a chunk the plan resets: the
/// logout layer would keep it, if the harness did not leave them out.
const FIX_PLAYER: &str = "00000000-0000-4000-8000-00000000fe1d";
const FIX_PLAYER_AT: ChunkPos = (4, 2);

static NEXT_FIXTURE: AtomicU32 = AtomicU32::new(0);

/// The real region file the fixture is given.
struct RealFile {
    /// Where it is in the world, for the record.
    shown: String,
    name: String,
    bytes: Vec<u8>,
    mcc: Vec<(String, Vec<u8>)>,
    planned: BTreeSet<ChunkPos>,
    /// A chunk of it outside the plan, stored inline, that parses.
    kept_inline: Option<ChunkPos>,
}

/// The protection settings of the self-test's fixture: the defaults, with the
/// spawn layer on the spawn chunk alone.
fn fixture_settings() -> Settings {
    let mut settings = Settings::default();
    settings.spawn_radius_blocks = Some(0);
    settings
}

fn pick_real_file(world: &Path, plan: &Plan) -> Result<RealFile, String> {
    let by_folder = plan.by_folder()?;
    let mut candidates: Vec<(u64, String, PathBuf)> = Vec::new();
    for folder in by_folder.keys() {
        let dir_rel = join(folder, "region");
        for e in fs::read_dir(at(world, &dir_rel)).into_iter().flatten().filter_map(|e| e.ok()) {
            let Ok(name) = e.file_name().into_string() else { continue };
            if parse_region_name(&name).is_none() {
                continue;
            }
            let size = e.metadata().map_or(0, |m| m.len());
            if size >= (2 * SECTOR) as u64 && size <= MAX_REAL_FILE {
                candidates.push((size, join(&dir_rel, &name), e.path()));
            }
        }
    }
    candidates.sort();
    // The chunks the fixture resets have to be ones the FIXTURE's settings
    // leave unprotected: it is the fixture's protection map they are held
    // against. (Until 2026-10-25 this was the plan's threshold: with the
    // lived-in layer off in the plan and a world whose smallest region file is
    // the base's, the self-test planned lived-in chunks, contradicted itself
    // and refused a correct run.)
    let threshold = fixture_settings().inhabited_min_ticks;
    for (size, rel, path) in candidates.into_iter().take(REAL_TRIES) {
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let Some((rx, rz)) = parse_region_name(&name) else { continue };
        let Ok(bytes) = fs::read(&path) else { continue };
        let dir = path.parent().unwrap_or(Path::new(""));
        let read = read_region(&bytes, dir, rx, rz, |_| true);
        if read.listed.len() < 2 {
            continue;
        }
        let eligible: Vec<ChunkPos> = read
            .readings
            .iter()
            .filter(|(pos, r)| {
                matches!(r, Reading::Parsed(ticks) if threshold.map_or(true, |min| ticks.map_or(true, |t| t < 0 || (t as u64) < min))) && !read.external.contains(pos)
            })
            .map(|(pos, _)| *pos)
            .collect();
        let planned: BTreeSet<ChunkPos> = eligible.iter().step_by(2).copied().collect();
        let kept_inline = read
            .readings
            .iter()
            .find(|(pos, r)| matches!(r, Reading::Parsed(_)) && !planned.contains(pos) && !read.external.contains(pos))
            .map(|(pos, _)| *pos);
        if planned.is_empty() || planned.len() == read.listed.len() {
            continue;
        }
        let mcc = read
            .external
            .iter()
            .filter_map(|pos| {
                let mcc_name = format!("c.{}.{}.mcc", pos.0, pos.1);
                fs::read(dir.join(&mcc_name)).ok().map(|data| (mcc_name, data))
            })
            .collect();
        return Ok(RealFile {
            shown: format!("{rel} ({} chunks, {} bytes; {} of them reset in the fixture)", read.listed.len(), size, planned.len()),
            name,
            bytes,
            mcc,
            planned,
            kept_inline,
        });
    }
    Err("none: the plan's dimensions have no region file with a chunk to keep and a chunk to reset".to_string())
}

/// Chunk NBT laid out as 1.20.1 writes it, small, zlib-compressed; with
/// Tectonic's tag for the chunks in [`FIX_TAGGED`].
fn synthetic_chunk(pos: ChunkPos, inhabited: i64) -> Vec<u8> {
    let block_states = Tag::compound(vec![
        ("palette", Tag::List(TAG_COMPOUND, vec![Tag::compound(vec![("Name", Tag::text_of("minecraft:stone"))]), Tag::compound(vec![("Name", Tag::text_of("minecraft:dirt"))])])),
        ("data", Tag::Longs(vec![0x1111_1111_1111_1111; 16])),
    ]);
    let section = Tag::compound(vec![
        ("Y", Tag::Byte(0)),
        ("block_states", block_states),
        ("biomes", Tag::compound(vec![("palette", Tag::List(TAG_STRING, vec![Tag::text_of("minecraft:plains")]))])),
    ]);
    let root = Tag::compound(vec![
        ("DataVersion", Tag::Int(3465)),
        ("xPos", Tag::Int(pos.0)),
        ("zPos", Tag::Int(pos.1)),
        ("yPos", Tag::Int(-4)),
        ("Status", Tag::text_of("minecraft:full")),
        ("LastUpdate", Tag::Long(1000)),
        ("InhabitedTime", Tag::Long(inhabited)),
        ("sections", Tag::List(TAG_COMPOUND, vec![section])),
        ("block_entities", Tag::List(TAG_COMPOUND, Vec::new())),
    ]);
    let root = match root {
        Tag::Compound(mut entries) if FIX_TAGGED.contains(&pos) => {
            entries.push((BLEND_TAG.to_vec(), Tag::Int(1)));
            Tag::Compound(entries)
        }
        other => other,
    };
    compress(Wrap::Zlib, &encode_root(b"", &root))
}

/// A region file of these chunks: (chunk, compression byte, data).
fn region_bytes(chunks: &[(ChunkPos, u8, Vec<u8>)]) -> Vec<u8> {
    let mut out = vec![0u8; SECTOR * 2];
    for (pos, kind, data) in chunks {
        let slot = slot_of(*pos);
        let offset = out.len() / SECTOR;
        out.extend_from_slice(&(data.len() as u32 + 1).to_be_bytes());
        out.push(*kind);
        out.extend_from_slice(data);
        while out.len() % SECTOR != 0 {
            out.push(0);
        }
        let count = out.len() / SECTOR - offset;
        out[slot * 4..slot * 4 + 4].copy_from_slice(&(((offset as u32) << 8) | count as u32).to_be_bytes());
        out[SECTOR + slot * 4..SECTOR + slot * 4 + 4].copy_from_slice(&(FIX_STAMP + slot as u32).to_be_bytes());
    }
    out
}

/// Take slots out of a region file the way a correct run does: the location
/// and timestamp entries zeroed, and the sectors no other entry claims.
fn clear_slots(bytes: &mut [u8], slots: &[usize]) {
    let mut claims: BTreeMap<usize, usize> = BTreeMap::new();
    for slot in 0..1024 {
        let location = be32(bytes, slot * 4);
        let (offset, count) = ((location >> 8) as usize, (location & 0xff) as usize);
        for sector in offset..offset + count {
            *claims.entry(sector).or_default() += 1;
        }
    }
    for &slot in slots {
        let location = be32(bytes, slot * 4);
        let (offset, count) = ((location >> 8) as usize, (location & 0xff) as usize);
        bytes[slot * 4..slot * 4 + 4].fill(0);
        bytes[SECTOR + slot * 4..SECTOR + slot * 4 + 4].fill(0);
        for sector in offset.max(2)..offset + count {
            if claims.get(&sector) == Some(&1) {
                let from = sector * SECTOR;
                let to = (from + SECTOR).min(bytes.len());
                if from < to {
                    bytes[from..to].fill(0);
                }
            }
        }
    }
}

fn waystone(uid: i32, at: ChunkPos, origin: &str) -> Tag {
    Tag::compound(vec![
        ("Type", Tag::text_of("waystones:waystone")),
        ("BlockPos", Tag::compound(vec![("X", Tag::Int(at.0 * 16 + 8)), ("Y", Tag::Int(64)), ("Z", Tag::Int(at.1 * 16 + 8))])),
        ("World", Tag::text_of(OVERWORLD)),
        ("Name", Tag::text_of("")),
        ("IsGlobal", Tag::Byte(0)),
        ("WaystoneUid", Tag::Ints(vec![uid, 2, 3, 4])),
        ("Origin", Tag::text_of(origin)),
    ])
}

fn waystones_file(list: Vec<Tag>) -> Vec<u8> {
    let root = Tag::compound(vec![("DataVersion", Tag::Int(3465)), ("data", Tag::compound(vec![("Waystones", Tag::List(TAG_COMPOUND, list))]))]);
    compress(Wrap::Gzip, &encode_root(b"", &root))
}

/// The self-test's world and plan, kept in memory and written afresh for
/// every trial.
struct Fixture {
    files: Vec<(String, Vec<u8>)>,
    plan: Plan,
    /// The kept chunk the byte flip and the block change go into: its file,
    /// its position, and the dimension label the findings use.
    target: (String, ChunkPos),
    real: Option<String>,
}

impl Fixture {
    fn new(real: Option<RealFile>) -> Fixture {
        let mut files: Vec<(String, Vec<u8>)> = Vec::new();
        let level = Tag::compound(vec![(
            "Data",
            Tag::compound(vec![
                ("SpawnX", Tag::Int(8)),
                ("SpawnY", Tag::Int(-64)),
                ("SpawnZ", Tag::Int(8)),
                ("DataVersion", Tag::Int(3465)),
                ("WorldGenSettings", Tag::compound(vec![("seed", Tag::Long(FIX_SEED_BEFORE)), ("generate_features", Tag::Byte(1))])),
            ]),
        )]);
        files.push(("level.dat".to_string(), compress(Wrap::Gzip, &encode_root(b"", &level))));
        files.push(("level.dat_old".to_string(), compress(Wrap::Gzip, &encode_root(b"", &level))));
        // What the world edits touch.
        let kubejs = Tag::compound(vec![
            ("icraft_priest_tower_done", Tag::Int(1)),
            ("icraft_chunky_pregen_started", Tag::Int(1)),
            ("minecraft:overworld", Tag::compound(vec![("icraft_cherry_spawn_exhausted", Tag::Int(1)), ("icraft_mobgriefing_default_set", Tag::Int(1))])),
        ]);
        files.push((SPAWN_DATA_FILE.to_string(), compress(Wrap::Gzip, &encode_root(b"", &kubejs))));
        let pupfish = Tag::compound(vec![("data", Tag::compound(vec![("PupfishChunkX", Tag::Int(3)), ("PupfishChunkZ", Tag::Int(-2)), ("beachedCachalotSpawnDelay", Tag::Int(9))]))]);
        files.push((PUPFISH_FILE.to_string(), compress(Wrap::Gzip, &encode_root(b"", &pupfish))));
        let cache = Tag::compound(vec![("data", Tag::compound(vec![("Positions", Tag::Longs(vec![1, 2, 3]))]))]);
        files.push((format!("data/{STRONGHOLD_CACHE}"), compress(Wrap::Gzip, &encode_root(b"", &cache))));
        let at_x = f64::from(FIX_PLAYER_AT.0 * 16 + 8);
        let at_z = f64::from(FIX_PLAYER_AT.1 * 16 + 8);
        let player = Tag::compound(vec![
            ("DataVersion", Tag::Int(3465)),
            ("Pos", Tag::List(TAG_DOUBLE, vec![Tag::Double(at_x.to_bits()), Tag::Double(64.0f64.to_bits()), Tag::Double(at_z.to_bits())])),
            ("Dimension", Tag::text_of(OVERWORLD)),
        ]);
        for ext in ["dat", "dat_old"] {
            files.push((format!("playerdata/{FIX_PLAYER}.{ext}"), compress(Wrap::Gzip, &encode_root(b"", &player))));
        }
        files.push((format!("playerdata/{FIX_PLAYER}.cosarmor"), compress(Wrap::Gzip, &encode_root(b"", &Tag::compound(vec![("CosArmor", Tag::List(TAG_COMPOUND, Vec::new()))])))));
        let raids = Tag::compound(vec![("data", Tag::compound(vec![("Raids", Tag::List(TAG_COMPOUND, Vec::new()))]))]);
        files.push(("data/raids.dat".to_string(), compress(Wrap::Gzip, &encode_root(b"", &raids))));
        files.push(("data/waystones.dat".to_string(), waystones_file(vec![waystone(1, FIX_WAYSTONE, "PLAYER"), waystone(5, FIX_RESET_WAYSTONE, "VILLAGE")])));
        files.push((crate::overrides::WORLD_MANIFEST.to_string(), b"{\n  \"version\": 1,\n  \"note\": \"the fidelity harness's self-test fixture\"\n}\n".to_vec()));

        let mut overworld: BTreeSet<ChunkPos> = BTreeSet::new();
        let mut chunks: Vec<(ChunkPos, u8, Vec<u8>)> = Vec::new();
        for z in 0..=5 {
            for x in 0..=5 {
                let pos = (x, z);
                let ticks = if pos == FIX_LIVED_IN { 20_000 } else { 0 };
                if pos == FIX_KEPT_MCC || pos == FIX_RESET_MCC {
                    chunks.push((pos, 0x82, Vec::new()));
                    files.push((format!("region/c.{x}.{z}.mcc"), synthetic_chunk(pos, ticks)));
                } else {
                    chunks.push((pos, 2, synthetic_chunk(pos, ticks)));
                }
                let kept = pos == (0, 0) || pos == FIX_LIVED_IN || pos == FIX_WAYSTONE || pos == FIX_KEPT_MCC || FIX_UNNAMED.contains(&pos);
                if !kept {
                    overworld.insert(pos);
                }
            }
        }
        files.push(("region/r.0.0.mca".to_string(), region_bytes(&chunks)));
        files.push(("region/r.1.0.mca".to_string(), region_bytes(&[((32, 0), 2, synthetic_chunk((32, 0), 0)), ((33, 0), 2, synthetic_chunk((33, 0), 0))])));
        overworld.extend([(32, 0), (33, 0)]);
        let small = |pos: ChunkPos| compress(Wrap::Zlib, &encode_root(b"", &Tag::compound(vec![("DataVersion", Tag::Int(3465)), ("Position", Tag::Ints(vec![pos.0, pos.1]))])));
        files.push(("entities/r.0.0.mca".to_string(), region_bytes(&[(FIX_LIVED_IN, 2, small(FIX_LIVED_IN)), (FIX_LEFT, 2, small(FIX_LEFT))])));
        files.push(("poi/r.0.0.mca".to_string(), region_bytes(&[(FIX_LIVED_IN, 2, small(FIX_LIVED_IN)), (FIX_RESET_WAYSTONE, 2, small(FIX_RESET_WAYSTONE))])));

        let settings = fixture_settings();
        let mut plan_chunks = BTreeMap::new();
        plan_chunks.insert(OVERWORLD.to_string(), overworld);
        let mut target = ("region/r.0.0.mca".to_string(), FIX_UNNAMED[0]);
        let mut shown = None;
        if let Some(real) = real {
            let dir = format!("{REAL_FOLDER}/region");
            files.push((format!("{dir}/{}", real.name), real.bytes));
            for (name, data) in real.mcc {
                files.push((format!("{dir}/{name}"), data));
            }
            plan_chunks.insert(REAL_DIM.to_string(), real.planned);
            if let Some(pos) = real.kept_inline {
                target = (format!("{dir}/{}", real.name), pos);
            }
            shown = Some(real.shown);
        }
        let edits = Edits {
            seed_before: Some(FIX_SEED_BEFORE),
            new_seed: Some(FIX_SEED),
            blend: true,
            spawn_search: true,
            spawn_y: 64,
            reset_players: vec![FIX_PLAYER.to_string()],
        };
        Fixture { files, plan: Plan { hash: "self-test".to_string(), settings, chunks: plan_chunks, edits, author: "self-test".to_string() }, target, real: shown }
    }

    /// The text a finding has to contain to name what was planted.
    fn needle(&self, plant: Plant) -> String {
        match plant {
            Plant::FlipByte | Plant::BlockChange => chunk_text(self.target.1),
            Plant::ZeroEntry => chunk_text(FIX_UNNAMED[1]),
            Plant::ExtraReset => chunk_text(FIX_UNNAMED[0]),
            Plant::Truncate => "region/r.0.0.mca".to_string(),
            Plant::DropKeptWaystone | Plant::LeaveWaystone => "data/waystones.dat".to_string(),
            Plant::LeaveReset => chunk_text(FIX_LEFT),
            Plant::OutsideFile => "data/raids.dat".to_string(),
            Plant::ProtectedInPlan => chunk_text(FIX_LIVED_IN),
            Plant::DropMcc => format!("c.{}.{}.mcc", FIX_KEPT_MCC.0, FIX_KEPT_MCC.1),
            Plant::SeedPlus => "level.dat:".to_string(),
            Plant::PlayerLeft => format!("playerdata/{FIX_PLAYER}"),
            Plant::BlendExtra | Plant::BlendSkipped => chunk_text(FIX_BLEND_PLANT),
        }
    }

    /// Write the fixture, carry a correct run out on it with one violation
    /// planted (or none), and return what the harness said.
    fn trial(&self, root: &Path, plant: Option<Plant>) -> Result<Vec<Check>, String> {
        let world = root.join("world");
        if world.exists() {
            fs::remove_dir_all(&world).map_err(|e| format!("{}: {e}", world.display()))?;
        }
        for (rel, bytes) in &self.files {
            let path = at(&world, rel);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("{}: {e}", parent.display()))?;
            }
            fs::write(&path, bytes).map_err(|e| format!("{}: {e}", path.display()))?;
        }
        let mut plan = self.plan.clone();
        if plant == Some(Plant::ProtectedInPlan) {
            plan.chunks.entry(OVERWORLD.to_string()).or_default().insert(FIX_LIVED_IN);
        }
        let before = before(&world, &plan)?;
        if before.f3.failed() {
            return Ok(vec![before.f3.clone()]);
        }
        let skip = (plant == Some(Plant::LeaveReset)).then_some(FIX_LEFT);
        simulate_run(&world, &before.by_folder, skip)?;
        let waystones = match plant {
            Some(Plant::DropKeptWaystone) => Some(waystones_file(Vec::new())),
            Some(Plant::LeaveWaystone) => None,
            _ => Some(waystones_file(vec![waystone(1, FIX_WAYSTONE, "PLAYER")])),
        };
        if let Some(bytes) = waystones {
            fs::write(at(&world, "data/waystones.dat"), bytes).map_err(|e| e.to_string())?;
        }
        simulate_edits(&world, &plan, plant)?;
        let record = format!(
            "{{\n  \"version\": 1,\n  \"note\": \"the fidelity harness's self-test fixture\",\n  \"regenerations\": [{{\"plan_hash\": \"{0}\"}}],\n  \"seed_changes\": [{{\"plan_hash\": \"{0}\"}}]\n}}\n",
            plan.hash
        );
        fs::write(world.join(crate::overrides::WORLD_MANIFEST), record).map_err(|e| e.to_string())?;
        if let Some(plant) = plant {
            self.plant(&world, plant)?;
        }
        Ok(after(&world, &plan, &before, None).verdict.checks)
    }

    fn plant(&self, world: &Path, plant: Plant) -> Result<(), String> {
        let region = at(world, "region/r.0.0.mca");
        let edit = |path: &Path, change: &dyn Fn(&mut Vec<u8>) -> Result<(), String>| -> Result<(), String> {
            let mut bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
            change(&mut bytes)?;
            fs::write(path, bytes).map_err(|e| format!("{}: {e}", path.display()))
        };
        match plant {
            Plant::FlipByte => edit(&at(world, &self.target.0), &|bytes| {
                let start = ((be32(bytes, slot_of(self.target.1) * 4) >> 8) as usize) * SECTOR;
                let len = be32(bytes, start) as usize;
                let at = start + 5 + (len.saturating_sub(1)) / 2;
                *bytes.get_mut(at).ok_or("the target chunk has no data")? ^= 0xFF;
                Ok(())
            }),
            Plant::BlockChange => edit(&at(world, &self.target.0), &|bytes| change_a_block(bytes, self.target.1)),
            Plant::ZeroEntry => edit(&region, &|bytes| {
                let slot = slot_of(FIX_UNNAMED[1]);
                bytes[slot * 4..slot * 4 + 4].fill(0);
                Ok(())
            }),
            Plant::ExtraReset => edit(&region, &|bytes| {
                clear_slots(bytes, &[slot_of(FIX_UNNAMED[0])]);
                Ok(())
            }),
            Plant::Truncate => edit(&region, &|bytes| {
                let last = (0..1024).map(|slot| (be32(bytes, slot * 4) >> 8) as usize).max().unwrap_or(2);
                bytes.truncate(last * SECTOR + 10);
                Ok(())
            }),
            Plant::OutsideFile => edit(&at(world, "data/raids.dat"), &|bytes| {
                bytes.push(b'!');
                Ok(())
            }),
            Plant::DropMcc => fs::remove_file(at(world, &format!("region/c.{}.{}.mcc", FIX_KEPT_MCC.0, FIX_KEPT_MCC.1))).map_err(|e| e.to_string()),
            // Planted before or during the simulated run.
            Plant::DropKeptWaystone
            | Plant::LeaveWaystone
            | Plant::LeaveReset
            | Plant::ProtectedInPlan
            | Plant::SeedPlus
            | Plant::PlayerLeft
            | Plant::BlendExtra
            | Plant::BlendSkipped => Ok(()),
        }
    }
}

/// A file's tree changed by `change`, written back wrapped as it was.
fn edit_tree(path: &Path, change: impl FnOnce(&mut Tag) -> Result<(), String>) -> Result<(), String> {
    let (wrap, name, mut tree) = read_file_tree(&fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?)?;
    change(&mut tree)?;
    fs::write(path, compress(wrap, &encode_root(&name, &tree))).map_err(|e| format!("{}: {e}", path.display()))
}

/// Rewrite one chunk of a region file in its own sectors, its tree changed
/// by `change`, as the run does for the blending mark.
fn rewrite_chunk(bytes: &mut [u8], pos: ChunkPos, change: impl FnOnce(&mut Tag)) -> Result<(), String> {
    let location = be32(bytes, slot_of(pos) * 4);
    let (name, mut tree) = record_tree(bytes, location)?.ok_or("the chunk is in a .mcc")?;
    change(&mut tree);
    let packed = compress(Wrap::Zlib, &encode_root(&name, &tree));
    let start = (location >> 8) as usize * SECTOR;
    let room = (location & 0xff) as usize * SECTOR;
    if packed.len() + 5 > room {
        return Err("the rewritten chunk does not fit its sectors".to_string());
    }
    bytes[start..start + room].fill(0);
    bytes[start..start + 4].copy_from_slice(&((packed.len() + 1) as u32).to_be_bytes());
    bytes[start + 4] = 2;
    bytes[start + 5..start + 5 + packed.len()].copy_from_slice(&packed);
    Ok(())
}

/// The world edits of a correct run, as the fixture needs them, with the
/// edit plants of `plant`.
fn simulate_edits(world: &Path, plan: &Plan, plant: Option<Plant>) -> Result<(), String> {
    let e = &plan.edits;
    let set = |tag: &mut Tag, path: &[&str], value: Tag| -> Result<(), String> {
        *tag.at_mut(path).ok_or_else(|| format!("no {}", path.join(".")))? = value;
        Ok(())
    };
    for rel in ["level.dat", "level.dat_old"] {
        edit_tree(&at(world, rel), |tree| {
            set(tree, &["Data", "WorldGenSettings", "seed"], Tag::Long(e.new_seed.unwrap_or(FIX_SEED)))?;
            set(tree, &["Data", "SpawnY"], Tag::Int(e.spawn_y))?;
            if plant == Some(Plant::SeedPlus) && rel == "level.dat" {
                set(tree, &["Data", "SpawnX"], Tag::Int(9))?;
            }
            Ok(())
        })?;
    }
    edit_tree(&at(world, SPAWN_DATA_FILE), |tree| {
        drop_keys(tree, &SPAWN_SERVER_KEYS);
        if let Some(level) = tree.get_mut("minecraft:overworld") {
            drop_keys(level, &SPAWN_LEVEL_KEYS);
        }
        Ok(())
    })?;
    edit_tree(&at(world, PUPFISH_FILE), |tree| {
        if let Some(data) = tree.get_mut("data") {
            drop_keys(data, &PUPFISH_KEYS);
        }
        Ok(())
    })?;
    fs::remove_file(at(world, &format!("data/{STRONGHOLD_CACHE}"))).map_err(|e| e.to_string())?;
    if plant != Some(Plant::PlayerLeft) {
        for ext in ["dat", "dat_old", "cosarmor"] {
            fs::remove_file(at(world, &format!("playerdata/{FIX_PLAYER}.{ext}"))).map_err(|e| e.to_string())?;
        }
    }
    let region = at(world, "region/r.0.0.mca");
    let mut bytes = fs::read(&region).map_err(|e| e.to_string())?;
    let planned = plan.chunks.get(OVERWORLD);
    for pos in FIX_TAGGED {
        // A chunk the plan resets is gone (the protected-chunk plant puts one
        // in the plan): there is nothing to mark.
        if planned.is_some_and(|set| set.contains(&pos)) || (pos == FIX_BLEND_PLANT && plant == Some(Plant::BlendSkipped)) {
            continue;
        }
        let extra = pos == FIX_BLEND_PLANT && plant == Some(Plant::BlendExtra);
        rewrite_chunk(&mut bytes, pos, |tree| {
            if let Tag::Compound(entries) = tree {
                for (name, value) in entries.iter_mut() {
                    if name.as_slice() == BLEND_TAG {
                        *value = Tag::Int(0);
                    }
                    if extra && name.as_slice() == b"LastUpdate" {
                        *value = Tag::Long(2000);
                    }
                }
            }
        })?;
    }
    fs::write(&region, bytes).map_err(|e| e.to_string())
}

/// Change one value of a kept chunk's block data and write the chunk back as
/// the game would: re-encoded, recompressed, the record well-formed, the
/// header pointing at it. Only its stored bytes say anything changed.
fn change_a_block(bytes: &mut Vec<u8>, pos: ChunkPos) -> Result<(), String> {
    let slot = slot_of(pos);
    let location = be32(bytes, slot * 4);
    let (offset, count) = ((location >> 8) as usize, (location & 0xff) as usize);
    let start = offset * SECTOR;
    if offset < 2 || start + 5 > bytes.len() {
        return Err("the target chunk is not where its header says".to_string());
    }
    let len = be32(bytes, start) as usize;
    let kind = bytes[start + 4];
    let data = bytes.get(start + 5..start + 4 + len).ok_or("the target chunk's data runs past the file")?;
    let raw = inflate(kind & 0x7f, data)?;
    let mut c = Cursor { bytes: &raw, at: 0 };
    if c.byte()? != TAG_COMPOUND {
        return Err("the target chunk's root is not a compound".to_string());
    }
    let name = c.name()?.to_vec();
    let mut root = read_tag(&mut c, TAG_COMPOUND, 1)?;
    // The first section's block states if it has any, else any long array.
    fn flip(tag: &mut Tag) -> bool {
        match tag {
            Tag::Longs(v) if !v.is_empty() => {
                v[0] ^= 1;
                true
            }
            Tag::List(_, items) => items.iter_mut().any(flip),
            Tag::Compound(entries) => entries.iter_mut().any(|(_, v)| flip(v)),
            _ => false,
        }
    }
    let mut changed = false;
    if let Some(sections) = root.get_mut("sections").and_then(Tag::items_mut) {
        for section in sections.iter_mut() {
            if let Some(Tag::Longs(data)) = section.get_mut("block_states").and_then(|states| states.get_mut("data")) {
                if !data.is_empty() {
                    data[0] ^= 1;
                    changed = true;
                    break;
                }
            }
        }
    }
    if !changed && !flip(&mut root) {
        return Err("the target chunk has no block data to change".to_string());
    }
    let packed = compress(Wrap::Zlib, &encode_root(&name, &root));
    let mut record = (packed.len() as u32 + 1).to_be_bytes().to_vec();
    record.push(2);
    record.extend_from_slice(&packed);
    let need = record.len().div_ceil(SECTOR);
    if need <= count {
        record.resize(count * SECTOR, 0);
        let end = (start + record.len()).min(bytes.len());
        bytes[start..end].copy_from_slice(&record[..end - start]);
    } else {
        while bytes.len() % SECTOR != 0 {
            bytes.push(0);
        }
        let at = bytes.len() / SECTOR;
        record.resize(need * SECTOR, 0);
        bytes.extend_from_slice(&record);
        bytes[slot * 4..slot * 4 + 4].copy_from_slice(&(((at as u32) << 8) | need as u32).to_be_bytes());
    }
    Ok(())
}

/// A correct run, as the fixture needs one: region files that keep chunks
/// rewritten with the plan's chunks cleared, files that keep none removed,
/// the plan's `.mcc` files removed. `skip`: a chunk of `region/` it forgets.
fn simulate_run(world: &Path, by_folder: &BTreeMap<String, BTreeSet<ChunkPos>>, skip: Option<ChunkPos>) -> Result<(), String> {
    for (rel, path) in world_files(world)? {
        if let Some((folder, store, rx, rz)) = region_of_rel(&rel) {
            let Some(planned) = by_folder.get(&folder) else { continue };
            let mut bytes = fs::read(&path).map_err(|e| format!("{rel}: {e}"))?;
            if bytes.len() < 2 * SECTOR {
                continue;
            }
            let listed: Vec<usize> = (0..1024usize).filter(|slot| be32(&bytes, slot * 4) != 0).collect();
            let cleared: Vec<usize> = listed
                .iter()
                .copied()
                .filter(|slot| {
                    let pos = chunk_in(rx, rz, *slot);
                    planned.contains(&pos) && !(store == 0 && Some(pos) == skip)
                })
                .collect();
            if cleared.is_empty() {
                continue;
            }
            if cleared.len() == listed.len() {
                fs::remove_file(&path).map_err(|e| format!("{rel}: {e}"))?;
            } else {
                clear_slots(&mut bytes, &cleared);
                fs::write(&path, &bytes).map_err(|e| format!("{rel}: {e}"))?;
            }
        } else if let Some((folder, pos)) = mcc_of_rel(&rel) {
            if by_folder.get(&folder).is_some_and(|set| set.contains(&pos)) && Some(pos) != skip {
                fs::remove_file(&path).map_err(|e| format!("{rel}: {e}"))?;
            }
        }
    }
    Ok(())
}

/// F7: build the fixture (with a copy of one real region file of `world`),
/// check that a correct run on it holds, then plant each violation in turn
/// and check that it is caught, named. Writes only in the temp folder, and
/// removes what it wrote; reads one region file of the world, sharing it.
pub fn self_test(world: &Path, plan: &Plan) -> SelfTest {
    let started = Instant::now();
    let root = std::env::temp_dir().join(format!("icraft-fidelity-{}-{}", std::process::id(), NEXT_FIXTURE.fetch_add(1, Ordering::SeqCst)));
    let (real, real_file) = match pick_real_file(world, plan) {
        Ok(real) => {
            let shown = real.shown.clone();
            (Some(real), shown)
        }
        Err(why) => (None, why),
    };
    let fixture = Fixture::new(real);
    let mut out = SelfTest { real_file: fixture.real.clone().unwrap_or(real_file), ..SelfTest::default() };
    let ran = (|| -> Result<(), String> {
        let control = fixture.trial(&root, None)?;
        let failed: Vec<String> = control.iter().filter(|c| c.failed()).flat_map(|c| c.findings.iter().map(move |f| format!("{} {f}", c.id))).collect();
        out.control = if failed.is_empty() { HOLDS.to_string() } else { failed.into_iter().take(5).collect::<Vec<_>>().join(" | ") };
        for plant in Plant::ALL {
            let checks = fixture.trial(&root, Some(plant))?;
            let needle = fixture.needle(plant);
            let named = checks
                .iter()
                .filter(|c| c.id == plant.invariant() && c.failed())
                .flat_map(|c| c.findings.iter())
                .find(|f| f.contains(&needle))
                .cloned();
            let said = match &named {
                Some(finding) => finding.clone(),
                None => {
                    let other: Vec<String> = checks.iter().filter(|c| c.failed()).map(|c| format!("{} {}", c.id, c.summary)).collect();
                    if other.is_empty() {
                        "the harness held".to_string()
                    } else {
                        format!("not named by {}; the harness said: {}", plant.invariant(), other.join("; "))
                    }
                }
            };
            out.plants.push(PlantResult { name: plant.name().to_string(), invariant: plant.invariant().to_string(), caught: named.is_some(), said });
        }
        Ok(())
    })();
    if let Err(why) = ran {
        out.error = why;
    }
    let _ = fs::remove_dir_all(&root);
    out.seconds = started.elapsed().as_secs_f64();
    out
}

// =============================================================================
// After the first start (F8)
// =============================================================================

/// What the world looks like once a server has run on the result.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AfterBoot {
    pub format: String,
    pub version: u32,
    pub written_utc: String,
    pub plan_hash: String,
    /// Chunk records that stayed after the run, in all three folders.
    pub kept: usize,
    pub kept_unchanged: usize,
    /// Saved again by the server (loaded, so written back).
    pub kept_saved_again: usize,
    pub kept_gone: usize,
    /// Terrain chunks that stayed and do not decompress and parse now.
    pub kept_unreadable: usize,
    pub reset_positions: usize,
    /// Reset positions with a terrain chunk on disk again.
    pub reset_generated: usize,
    /// Kept terrain chunks next to a reset position, and of those, how many
    /// have the reset side generated again.
    pub seams: usize,
    pub seams_generated: usize,
    /// With a plan that marked kept chunks for blending: the kept overworld
    /// terrain chunks, how many are still old to Tectonic (its tag not 1, or
    /// vanilla `blending_data` saved), and of those how many carry the
    /// `blending_data`. Tectonic gives a marked chunk `blending_data` each time
    /// it reads it; the chunk keeps its mark on disk until the server saves it
    /// again, and then keeps the `blending_data` (rig, 2026-10-25: none of 289
    /// marked chunks was saved again in a boot that generated the land around
    /// them, and the land blended). A chunk that is neither lost its mark.
    pub blend_kept: usize,
    pub blend_old: usize,
    pub blend_data: usize,
    pub seam_sample: Vec<String>,
    pub findings: Vec<String>,
    pub error: String,
    pub line: String,
}

fn read_kept(path: &Path) -> Result<BTreeMap<Key, Image>, String> {
    let body = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut out = BTreeMap::new();
    for line in body.lines().filter(|l| !l.starts_with('#') && !l.is_empty()) {
        let f: Vec<&str> = line.split('\t').collect();
        let bad = || format!("{KEPT_FILE}: a line does not read: {line}");
        if f.len() != 7 {
            return Err(bad());
        }
        let hex_u32 = |s: &str| u32::from_str_radix(s, 16).map_err(|_| bad());
        let mut sha = [0u8; 32];
        if f[6].len() != 64 {
            return Err(bad());
        }
        for (i, byte) in sha.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&f[6][i * 2..i * 2 + 2], 16).map_err(|_| bad())?;
        }
        let store: u8 = f[1].parse().map_err(|_| bad())?;
        let pos: ChunkPos = (f[2].parse().map_err(|_| bad())?, f[3].parse().map_err(|_| bad())?);
        out.insert((f[0].to_string(), store, pos), Image { location: hex_u32(f[4])?, timestamp: hex_u32(f[5])?, sha256: sha });
    }
    Ok(out)
}

/// The report on a regenerated world after a server has run on it, from the
/// run's holding folder. Reads only.
pub fn first_start_report(world: &Path, holding: &Path) -> Result<AfterBoot, String> {
    let plan = Plan::load(holding)?;
    let by_folder = plan.by_folder()?;
    let kept = read_kept(&holding.join(KEPT_FILE))?;
    let mut files: BTreeSet<String> = kept.keys().map(|(folder, store, pos)| region_rel(folder, *store, *pos)).collect();
    let mut seams: Vec<(String, ChunkPos, ChunkPos)> = Vec::new();
    for (folder, store, pos) in kept.keys() {
        if *store != 0 {
            continue;
        }
        let Some(planned) = by_folder.get(folder) else { continue };
        for (dx, dz) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let side = (pos.0 + dx, pos.1 + dz);
            if planned.contains(&side) {
                seams.push((folder.clone(), *pos, side));
            }
        }
    }
    files.extend(seams.iter().map(|(folder, _, side)| region_rel(folder, 0, *side)));
    let now = survey(world, &Decode::Files(&files))?;

    let mut r = AfterBoot { format: FORMAT.to_string(), version: VERSION, plan_hash: plan.hash.clone(), kept: kept.len(), ..AfterBoot::default() };
    r.written_utc = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    for (key, image) in &kept {
        match now.chunks.get(key) {
            None => {
                r.kept_gone += 1;
                r.findings.push(format!("{}: stayed in the run, and is gone now", chunk_label(key)));
            }
            Some(is) if is == image => r.kept_unchanged += 1,
            Some(_) => r.kept_saved_again += 1,
        }
        if key.1 == 0 {
            if let Some(Reading::Damaged(why)) = now.readings.get(key) {
                r.kept_unreadable += 1;
                r.findings.push(format!("{}: does not decompress and parse now ({why})", chunk_label(key)));
            }
        }
    }
    for (folder, set) in &by_folder {
        r.reset_positions += set.len();
        r.reset_generated += set.iter().filter(|pos| now.chunks.contains_key(&(folder.clone(), 0, **pos))).count();
    }
    r.seams = seams.len();
    let parses = |key: &Key| match now.readings.get(key) {
        Some(Reading::Parsed(_)) => "parses",
        Some(Reading::Damaged(_)) => "DOES NOT PARSE",
        None => "not read",
    };
    for (folder, kept_pos, side) in &seams {
        let side_key = (folder.clone(), 0u8, *side);
        if now.chunks.contains_key(&side_key) {
            r.seams_generated += 1;
            if r.seam_sample.len() < 12 {
                let kept_key = (folder.clone(), 0u8, *kept_pos);
                r.seam_sample.push(format!(
                    "{}: kept {} {}, reset {} generated again and {}",
                    folder_label(folder),
                    chunk_text(*kept_pos),
                    parses(&kept_key),
                    chunk_text(*side),
                    parses(&side_key)
                ));
            }
        }
    }
    if plan.edits.blend {
        let mut bytes: BTreeMap<String, Option<Vec<u8>>> = BTreeMap::new();
        for key in kept.keys().filter(|(folder, store, _)| folder.is_empty() && *store == 0) {
            let Some(image) = now.chunks.get(key) else { continue };
            r.blend_kept += 1;
            let rel = region_rel(&key.0, key.1, key.2);
            let file = bytes.entry(rel.clone()).or_insert_with(|| fs::read(at(world, &rel)).ok());
            if let Some(Ok(Some((_, tree)))) = file.as_deref().map(|b| record_tree(b, image.location)) {
                let data = tree.get("blending_data").is_some();
                if data || !matches!(tree.get("tectonic:blending_version"), Some(Tag::Int(1))) {
                    r.blend_old += 1;
                }
                if data {
                    r.blend_data += 1;
                }
            }
        }
    }
    r.findings.truncate(SHOWN);
    let blending = if plan.edits.blend {
        format!(
            "; blending: {} of {} kept overworld chunk(s) still old to Tectonic ({} with blending data saved)",
            num(r.blend_old),
            num(r.blend_kept),
            num(r.blend_data)
        )
    } else {
        String::new()
    };
    r.line = format!(
        "fidelity harness, after the first start: {} kept chunk record(s): {} unchanged, {} saved again by the server, {} gone, {} unreadable; {} of {} reset position(s) generated again; seams: {} of {} generated on the reset side{blending}",
        num(r.kept),
        num(r.kept_unchanged),
        num(r.kept_saved_again),
        num(r.kept_gone),
        num(r.kept_unreadable),
        num(r.reset_generated),
        num(r.reset_positions),
        num(r.seams_generated),
        num(r.seams)
    );
    Ok(r)
}

/// The newest holding folder of a server.
fn newest_holding(server_dir: &Path) -> Option<PathBuf> {
    fs::read_dir(server_dir.join(super::exec::HOLDING_DIR))
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .max_by_key(|e| e.file_name())
        .map(|e| e.path())
}

/// Called before every server start (`run::launch_server_inner`, inside the
/// launch gate): once a server has run on a regenerated world (its fingerprint
/// is no longer the one the run left), write F8's report into the run's
/// holding folder. Once per run; reads only; never stops a start. Returns the
/// report's line when it wrote one.
pub fn after_first_start(cfg: &ServerConfig) -> Option<String> {
    let dir = newest_holding(&cfg.server_dir)?;
    if !dir.join(FIDELITY_FILE).is_file() || dir.join(AFTER_BOOT_FILE).exists() {
        return None;
    }
    let holding: serde_json::Value = serde_json::from_slice(&fs::read(dir.join(super::exec::HOLDING_FILE)).ok()?).ok()?;
    if holding["state"] != "complete" {
        return None;
    }
    let end = holding["end_fingerprint"].as_str().unwrap_or("");
    let now = crate::backup::world_fingerprint(cfg).ok()?;
    if end.is_empty() || now == end {
        return None;
    }
    Some(write_after_boot(&cfg.world_dir(), &dir))
}

/// F8 for a holding folder now, whatever has happened since: the report's line.
pub fn write_after_boot(world: &Path, holding: &Path) -> String {
    let report = match first_start_report(world, holding) {
        Ok(report) => report,
        Err(why) => AfterBoot {
            format: FORMAT.to_string(),
            version: VERSION,
            written_utc: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            line: format!("fidelity harness, after the first start: the report could not be made ({why})"),
            error: why,
            ..AfterBoot::default()
        },
    };
    if let Ok(mut body) = serde_json::to_string_pretty(&report) {
        body.push('\n');
        if let Err(e) = fs::write(holding.join(AFTER_BOOT_FILE), body) {
            log::warn!("[regen] {AFTER_BOOT_FILE} could not be written: {e}");
        }
    }
    report.line
}

/// A holding folder's F8 report.
pub fn load_after_boot(dir: &Path) -> Option<AfterBoot> {
    serde_json::from_slice(&fs::read(dir.join(AFTER_BOOT_FILE)).ok()?).ok()
}

#[cfg(test)]
mod tests;
