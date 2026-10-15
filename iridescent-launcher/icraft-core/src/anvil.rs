//! Reading a world's chunk storage: dimension folders and Anvil region files.
//!
//! Since Minecraft 1.17 a chunk is stored three times over, in three folders of
//! its dimension, each holding `r.<x>.<z>.mca` files of 32x32 chunks:
//!
//!   - `region/`    terrain, block entities, and `InhabitedTime`
//!   - `entities/`  the entities standing in the chunk
//!   - `poi/`       points of interest (beds, job sites, portals)
//!
//! A dimension lives in the world folder itself (the overworld), in `DIM-1`
//! (the Nether), `DIM1` (the End), or `dimensions/<namespace>/<path>/`.
//!
//! A region file starts with 1,024 four-byte location entries, slot `z*32+x`:
//! three bytes of offset and one of length, both in 4 KiB sectors; zero means
//! the chunk is not there. At the offset: four bytes of length, one byte of
//! compression type (1 gzip, 2 zlib, 3 none; bit 0x80 = the data is in a
//! separate `c.<x>.<z>.mcc` file), then the chunk's NBT.
//!
//! Things the live world taught this module (2026-10-11):
//!
//!   - 236 of the overworld's 331 `region/*.mca` are **zero bytes**. Minecraft
//!     creates the file when anything asks whether a chunk exists there (a
//!     structure search is enough) and writes the header only with the first
//!     chunk. A file count is not a count of regions with terrain.
//!   - `entities/` and `poi/` hold chunks that `region/` does not (29 and 776
//!     of them). "The chunks on disk" is the union of the three folders.
//!
//! **Everything here but the last section only reads, and is safe while the
//! server runs.** Files are
//! opened sharing read, write and delete ([`open_shared`]), so the server can
//! go on writing, renaming and deleting them; no lock is ever taken; and a
//! region file is read into memory in one pass, then parsed from the copy. A
//! chunk that does not parse (the server was in the middle of writing it) is
//! tried once more from a fresh read and otherwise reported as unreadable --
//! the caller treats unreadable as protected.
//!
//! The last section, "Clearing chunks", is the regeneration run's: it builds
//! the bytes of a region file with some chunks taken out, and puts a file in
//! another's place. Its one caller (`regen::exec`) holds the launch gate with
//! the JVM down.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

use crate::nbt;

pub const SECTOR_BYTES: usize = 4096;
/// Chunks per region file side.
pub const REGION_SIDE: i32 = 32;
/// Nothing sane is bigger; a region file read is capped here.
const MAX_REGION_BYTES: u64 = 1 << 30;
/// Before a second look at something that did not read: the server may have
/// been in the middle of writing it.
const RETRY_PAUSE: std::time::Duration = std::time::Duration::from_millis(200);

/// Chunk coordinates, `(x, z)`.
pub type ChunkPos = (i32, i32);

// =============================================================================
// Read-only file access
// =============================================================================

/// Open for reading while letting every other process read, write, rename and
/// delete the file. That is already what Rust asks Windows for by default; it
/// is spelled out because this is the property the whole module stands on.
/// Never use `File::create`, `OpenOptions::write` or an exclusive share mode
/// on anything under the world folder.
pub fn open_shared(path: &Path) -> io::Result<fs::File> {
    let mut opts = fs::OpenOptions::new();
    opts.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 0x1;
        const FILE_SHARE_WRITE: u32 = 0x2;
        const FILE_SHARE_DELETE: u32 = 0x4;
        opts.share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE);
    }
    opts.open(path)
}

/// The first `limit` bytes of a file (all of it, if it is shorter).
pub fn read_shared(path: &Path, limit: u64) -> io::Result<Vec<u8>> {
    Ok(read_observed(path, limit)?.bytes)
}

/// What one read saw of a file.
pub struct Observed {
    pub bytes: Vec<u8>,
    /// The file's size.
    pub len: u64,
    /// Its size or modified time moved between the first byte and the last:
    /// somebody wrote to it meanwhile. Both readings come from the handle the
    /// bytes were read through. (Asked by path instead, over the share, this
    /// once reported a region file of the live world as written during a scan
    /// in which no file's size, timestamp or SHA-256 had moved: 2026-10-11,
    /// cause not pinned down.) A write that moves neither goes unnoticed,
    /// which is why a chunk that fails to parse is read again whatever this
    /// says.
    pub changed: bool,
}

/// [`read_shared`], with what the file looked like before and after.
pub fn read_observed(path: &Path, limit: u64) -> io::Result<Observed> {
    let mut file = open_shared(path)?;
    let stamp = |f: &fs::File| f.metadata().ok().map(|m| (m.len(), m.modified().ok()));
    let before = stamp(&file);
    let mut bytes = Vec::new();
    (&mut file).take(limit).read_to_end(&mut bytes)?;
    let after = stamp(&file);
    Ok(Observed { bytes, len: after.or(before).map_or(0, |s| s.0), changed: before != after })
}

// =============================================================================
// Dimensions
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Store {
    Region,
    Entities,
    Poi,
}

impl Store {
    pub const ALL: [Store; 3] = [Store::Region, Store::Entities, Store::Poi];

    pub fn dir_name(self) -> &'static str {
        match self {
            Store::Region => "region",
            Store::Entities => "entities",
            Store::Poi => "poi",
        }
    }

    fn bit(self) -> u8 {
        match self {
            Store::Region => 1,
            Store::Entities => 2,
            Store::Poi => 4,
        }
    }
}

pub const OVERWORLD: &str = "minecraft:overworld";
pub const NETHER: &str = "minecraft:the_nether";
pub const END: &str = "minecraft:the_end";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dimension {
    /// `minecraft:overworld`, `twilightforest:twilight_forest`, ...
    pub id: String,
    /// Folder relative to the world, with `/`: empty for the overworld,
    /// `DIM-1`, `dimensions/aether/the_aether`.
    pub rel: String,
    pub dir: PathBuf,
}

impl Dimension {
    pub fn store_dir(&self, store: Store) -> PathBuf {
        self.dir.join(store.dir_name())
    }

    /// Does it have any of the three chunk folders? (Most modded dimensions on
    /// the live world have only a `data/` folder: nobody has been there.)
    pub fn has_chunk_storage(&self) -> bool {
        Store::ALL.iter().any(|s| self.store_dir(*s).is_dir())
    }

    /// The dimension's own `data/` folder (per-dimension saved data).
    pub fn data_dir(&self) -> PathBuf {
        self.dir.join("data")
    }
}

/// Folders inside a dimension folder that are never a nested dimension.
const DIMENSION_CONTENT: [&str; 4] = ["region", "entities", "poi", "data"];
const MAX_DIMENSION_DEPTH: usize = 8;

/// Every dimension folder of a world: the overworld always, the Nether and the
/// End when their folders exist, and whatever is under `dimensions/`. Sorted
/// by id after the three vanilla ones.
pub fn discover_dimensions(world: &Path) -> Vec<Dimension> {
    let mut found = vec![Dimension { id: OVERWORLD.to_string(), rel: String::new(), dir: world.to_path_buf() }];
    for (folder, id) in [("DIM-1", NETHER), ("DIM1", END)] {
        let dir = world.join(folder);
        if dir.is_dir() {
            found.push(Dimension { id: id.to_string(), rel: folder.to_string(), dir });
        }
    }
    let mut custom = Vec::new();
    for (namespace, dir) in subdirs(&world.join("dimensions")) {
        for (name, dir) in subdirs(&dir) {
            walk_dimension(&namespace, &name, &dir, 1, &mut custom);
        }
    }
    custom.sort_by(|a, b| a.id.cmp(&b.id));
    found.extend(custom);
    found
}

fn walk_dimension(namespace: &str, path: &str, dir: &Path, depth: usize, out: &mut Vec<Dimension>) {
    if DIMENSION_CONTENT.iter().any(|c| dir.join(c).is_dir()) {
        out.push(Dimension {
            id: format!("{namespace}:{path}"),
            rel: format!("dimensions/{namespace}/{path}"),
            dir: dir.to_path_buf(),
        });
    }
    if depth >= MAX_DIMENSION_DEPTH {
        return;
    }
    for (name, sub) in subdirs(dir) {
        if !DIMENSION_CONTENT.contains(&name.as_str()) {
            walk_dimension(namespace, &format!("{path}/{name}"), &sub, depth + 1, out);
        }
    }
}

/// Subfolders with a UTF-8 name, sorted. A missing or unreadable folder is empty.
fn subdirs(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut out: Vec<(String, PathBuf)> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map_or(false, |t| t.is_dir()))
        .filter_map(|e| e.file_name().into_string().ok().map(|name| (name, e.path())))
        .collect();
    out.sort();
    out
}

// =============================================================================
// Region files
// =============================================================================

/// `r.<x>.<z>.mca` -> `(x, z)`. Anything Minecraft would not have written
/// (`r.+1.2.mca`, `r.1.2.mca.bak`) is not a region file.
pub fn parse_region_name(name: &str) -> Option<(i32, i32)> {
    let (x, z) = name.strip_prefix("r.")?.strip_suffix(".mca")?.split_once('.')?;
    let (x, z): (i32, i32) = (x.parse().ok()?, z.parse().ok()?);
    (region_name(x, z) == name).then_some((x, z))
}

pub fn region_name(rx: i32, rz: i32) -> String {
    format!("r.{rx}.{rz}.mca")
}

/// The region file a chunk is stored in.
pub fn region_of(chunk: ChunkPos) -> (i32, i32) {
    (chunk.0.div_euclid(REGION_SIDE), chunk.1.div_euclid(REGION_SIDE))
}

/// One present chunk in a region header: its slot (`z*32+x` within the file),
/// where its data starts and how many sectors it has.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Slot {
    pub index: u16,
    pub offset_sectors: u32,
    pub sector_count: u8,
}

impl Slot {
    pub fn chunk(&self, rx: i32, rz: i32) -> ChunkPos {
        (rx * REGION_SIDE + i32::from(self.index % 32), rz * REGION_SIDE + i32::from(self.index / 32))
    }
}

/// The chunks a region header lists. A file shorter than its location table
/// (the zero-byte placeholders included) lists none.
pub fn header_slots(header: &[u8]) -> Vec<Slot> {
    if header.len() < SECTOR_BYTES {
        return Vec::new();
    }
    (0..1024usize)
        .filter_map(|i| {
            let entry = u32::from_be_bytes([header[i * 4], header[i * 4 + 1], header[i * 4 + 2], header[i * 4 + 3]]);
            (entry != 0).then_some(Slot { index: i as u16, offset_sectors: entry >> 8, sector_count: (entry & 0xff) as u8 })
        })
        .collect()
}

/// A chunk's compression type and compressed bytes, from a region file held in
/// memory. `Err` says what is wrong with the entry.
fn chunk_payload(file: &[u8], slot: Slot) -> Result<(u8, &[u8]), String> {
    if slot.offset_sectors < 2 {
        return Err("its data offset points into the header".to_string());
    }
    let start = slot.offset_sectors as usize * SECTOR_BYTES;
    let Some(head) = file.get(start..start + 5) else {
        return Err("its data offset is past the end of the file".to_string());
    };
    let len = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as usize;
    let kind = head[4];
    if len == 0 {
        return Err("its length is zero".to_string());
    }
    if kind & 0x80 != 0 {
        // The data is in a `.mcc` file next to the region file.
        return Ok((kind, &file[..0]));
    }
    match file.get(start + 5..start + 4 + len) {
        Some(data) => Ok((kind, data)),
        None => Err("its data runs past the end of the file".to_string()),
    }
}

/// `InhabitedTime` out of a chunk's compressed NBT: the ticks during which a
/// player was within 128 blocks of the loaded chunk. `Ok(None)` = the chunk
/// has no such tag.
pub fn inhabited_time(kind: u8, data: &[u8]) -> Result<Option<i64>, String> {
    const KEY: &str = "InhabitedTime";
    const LEGACY_PARENT: &str = "Level";
    let found = match kind & 0x7f {
        1 => nbt::scan_root_long(&mut BufReader::with_capacity(4096, flate2::bufread::GzDecoder::new(data)), KEY, LEGACY_PARENT),
        2 => nbt::scan_root_long(&mut BufReader::with_capacity(4096, flate2::bufread::ZlibDecoder::new(data)), KEY, LEGACY_PARENT),
        3 => nbt::scan_root_long(&mut &data[..], KEY, LEGACY_PARENT),
        other => return Err(format!("compression type {other} is not one this launcher knows")),
    };
    found.map_err(|e| format!("its NBT does not read ({e})"))
}

// =============================================================================
// Scanning a dimension
// =============================================================================

/// A region file as found on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegionFile {
    pub store: Store,
    pub rx: i32,
    pub rz: i32,
    pub name: String,
    pub bytes: u64,
    /// Chunks its header lists.
    pub chunks: Vec<ChunkPos>,
    /// Why it could not be read at all (then `chunks` is empty and nothing in
    /// it may be assumed absent).
    pub error: Option<String>,
}

/// What is known about one chunk position that exists on disk.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChunkEntry {
    stores: u8,
    /// From the `region/` chunk. `None`: no terrain chunk, no such tag, or
    /// unreadable.
    pub inhabited: Option<i64>,
    /// Why the terrain chunk could not be read.
    pub unreadable: Option<String>,
}

impl ChunkEntry {
    pub fn in_store(&self, store: Store) -> bool {
        self.stores & store.bit() != 0
    }
}

#[derive(Debug, Clone, Default)]
pub struct DimensionScan {
    /// Every `r.x.z.mca` in the three folders, sorted by folder then position.
    pub files: Vec<RegionFile>,
    /// Every chunk position at least one folder holds.
    pub chunks: BTreeMap<ChunkPos, ChunkEntry>,
    /// `c.x.z.mcc` files (chunks too big for a region file).
    pub external_chunk_files: usize,
    /// Region files the server wrote to while they were being read
    /// (`region/r.1.2.mca`).
    pub changed_during_scan: Vec<String>,
    /// Terrain chunks without an `InhabitedTime` tag.
    pub without_inhabited_time: usize,
}

impl DimensionScan {
    pub fn files_of(&self, store: Store) -> impl Iterator<Item = &RegionFile> {
        self.files.iter().filter(move |f| f.store == store)
    }

    pub fn chunk_count(&self, store: Store) -> usize {
        self.chunks.values().filter(|c| c.in_store(store)).count()
    }
}

/// Size and count of the region files in one chunk folder, without opening any.
pub fn store_summary(dir: &Path) -> (usize, u64) {
    let mut files = 0;
    let mut bytes = 0;
    for entry in fs::read_dir(dir).into_iter().flatten().filter_map(|e| e.ok()) {
        let is_region = entry.file_name().to_str().and_then(parse_region_name).is_some();
        if is_region {
            files += 1;
            bytes += entry.metadata().map_or(0, |m| m.len());
        }
    }
    (files, bytes)
}

/// Read every region file of a dimension: which chunks exist in which of the
/// three folders, and each terrain chunk's `InhabitedTime`.
pub fn scan_dimension(dim: &Dimension) -> DimensionScan {
    let mut scan = DimensionScan::default();
    for store in Store::ALL {
        let dir = dim.store_dir(store);
        let mut names: Vec<(i32, i32, String)> = Vec::new();
        for entry in fs::read_dir(&dir).into_iter().flatten().filter_map(|e| e.ok()) {
            let Ok(name) = entry.file_name().into_string() else { continue };
            if let Some((rx, rz)) = parse_region_name(&name) {
                names.push((rx, rz, name));
            } else if name.ends_with(".mcc") {
                scan.external_chunk_files += 1;
            }
        }
        names.sort();
        for (rx, rz, name) in names {
            let path = dir.join(&name);
            let read = |scan: &mut DimensionScan| {
                if store == Store::Region {
                    scan_terrain_file(&path, &dir, rx, rz, scan)
                } else {
                    scan_header_only(&path, rx, rz)
                }
            };
            let mut file = read(&mut scan);
            if file.is_err() {
                std::thread::sleep(RETRY_PAUSE);
                file = read(&mut scan);
            }
            let (chunks, bytes, error) = match file {
                Ok(seen) => {
                    if seen.changed {
                        scan.changed_during_scan.push(format!("{}/{name}", store.dir_name()));
                    }
                    (seen.chunks, seen.len, None)
                }
                Err(e) => (Vec::new(), fs::metadata(&path).map_or(0, |m| m.len()), Some(e)),
            };
            for pos in &chunks {
                scan.chunks.entry(*pos).or_default().stores |= store.bit();
            }
            scan.files.push(RegionFile { store, rx, rz, name, bytes, chunks, error });
        }
    }
    scan
}

/// What a scan saw of one region file.
struct FileSeen {
    chunks: Vec<ChunkPos>,
    len: u64,
    changed: bool,
}

fn scan_header_only(path: &Path, rx: i32, rz: i32) -> Result<FileSeen, String> {
    let header = read_observed(path, SECTOR_BYTES as u64).map_err(|e| e.to_string())?;
    let chunks = header_slots(&header.bytes).iter().map(|s| s.chunk(rx, rz)).collect();
    Ok(FileSeen { chunks, len: header.len, changed: header.changed })
}

/// A `region/` file: its chunks, with each one's `InhabitedTime` recorded in
/// `scan.chunks`. A chunk that fails is tried once more from a fresh read of
/// the file, in case the server was writing it.
fn scan_terrain_file(path: &Path, dir: &Path, rx: i32, rz: i32, scan: &mut DimensionScan) -> Result<FileSeen, String> {
    let first = read_observed(path, MAX_REGION_BYTES).map_err(|e| e.to_string())?;
    let bytes = &first.bytes;
    let slots = header_slots(bytes);
    let mut failed: Vec<(Slot, String)> = Vec::new();
    for slot in &slots {
        let pos = slot.chunk(rx, rz);
        match terrain_chunk(bytes, *slot, dir, pos) {
            Ok(ticks) => record(scan, pos, ticks),
            Err(why) => failed.push((*slot, why)),
        }
    }
    if !failed.is_empty() {
        std::thread::sleep(RETRY_PAUSE);
        // If the second read fails outright, the first read's verdicts stand.
        let again = read_shared(path, MAX_REGION_BYTES).unwrap_or_default();
        let fresh = header_slots(&again);
        for (old, first_error) in failed {
            let pos = old.chunk(rx, rz);
            // The chunk may have been moved within the file since the first read.
            let retried = match fresh.iter().copied().find(|s| s.index == old.index) {
                Some(slot) => terrain_chunk(&again, slot, dir, pos),
                None => Err(first_error),
            };
            match retried {
                Ok(ticks) => record(scan, pos, ticks),
                Err(why) => scan.chunks.entry(pos).or_default().unreadable = Some(why),
            }
        }
    }
    Ok(FileSeen { chunks: slots.iter().map(|s| s.chunk(rx, rz)).collect(), len: first.len, changed: first.changed })
}

fn record(scan: &mut DimensionScan, pos: ChunkPos, ticks: Option<i64>) {
    if ticks.is_none() {
        scan.without_inhabited_time += 1;
    }
    scan.chunks.entry(pos).or_default().inhabited = ticks;
}

fn terrain_chunk(file: &[u8], slot: Slot, dir: &Path, pos: ChunkPos) -> Result<Option<i64>, String> {
    let (kind, data) = chunk_payload(file, slot)?;
    if kind & 0x80 != 0 {
        let external = dir.join(format!("c.{}.{}.mcc", pos.0, pos.1));
        let data = read_shared(&external, MAX_REGION_BYTES).map_err(|e| format!("its external .mcc file does not read ({e})"))?;
        return inhabited_time(kind, &data);
    }
    inhabited_time(kind, data)
}

// =============================================================================
// Clearing chunks (the regeneration run)
// =============================================================================
//
// A chunk is taken out of a region file by zeroing its location entry and its
// timestamp entry in the header. That is all Minecraft looks at to decide that
// a chunk is not there and that its sectors are free. No chunk is moved, so
// every chunk that stays is where it was, bit for bit, and "the chunks that
// were to stay did not change" can be checked by comparing bytes
// ([`check_cleared`]). The sectors of the removed chunks are zeroed as well,
// unless another entry claims them too (a damaged file: those are left).
//
// The new bytes are built in memory from the old ones. The caller keeps a copy
// of the original and puts the new file in its place with [`replace_file`].

/// The slot of a chunk within its region file: `z*32+x`, each within the file.
pub fn slot_index(chunk: ChunkPos) -> u16 {
    (chunk.1.rem_euclid(REGION_SIDE) * REGION_SIDE + chunk.0.rem_euclid(REGION_SIDE)) as u16
}

/// A region file with some of its chunks taken out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cleared {
    /// The file as it should now be: the same length as before.
    pub bytes: Vec<u8>,
    /// The slots that were listed and no longer are.
    pub removed: Vec<u16>,
    /// Of those, the ones whose data is in a `c.<x>.<z>.mcc` beside the file,
    /// which has to go with them.
    pub external: Vec<u16>,
    /// Chunks still listed.
    pub kept: usize,
}

/// `file` without the chunks in the slots `drop`. A slot that lists no chunk
/// is not an error: there is nothing to take out.
pub fn clear_chunks(file: &[u8], drop: &BTreeSet<u16>) -> Result<Cleared, String> {
    if file.len() < SECTOR_BYTES * 2 {
        return Err("it is shorter than a region file's header".to_string());
    }
    let slots = header_slots(file);
    // How many entries claim each sector: one, in a sound file.
    let mut claims = vec![0u8; file.len().div_ceil(SECTOR_BYTES)];
    for slot in &slots {
        let start = slot.offset_sectors as usize;
        for sector in start..start + usize::from(slot.sector_count) {
            if let Some(count) = claims.get_mut(sector) {
                *count = count.saturating_add(1);
            }
        }
    }
    let mut bytes = file.to_vec();
    let mut removed = Vec::new();
    let mut external = Vec::new();
    for slot in slots.iter().filter(|s| drop.contains(&s.index)) {
        let entry = usize::from(slot.index) * 4;
        let start = slot.offset_sectors as usize;
        // The fifth byte of a chunk's data is its compression type; bit 0x80
        // says the data itself is in a .mcc file.
        if start >= 2 && file.get(start * SECTOR_BYTES + 4).is_some_and(|kind| kind & 0x80 != 0) {
            external.push(slot.index);
        }
        bytes[entry..entry + 4].fill(0);
        bytes[SECTOR_BYTES + entry..SECTOR_BYTES + entry + 4].fill(0);
        for sector in start..start + usize::from(slot.sector_count) {
            if sector >= 2 && claims.get(sector) == Some(&1) {
                let from = sector * SECTOR_BYTES;
                let to = (from + SECTOR_BYTES).min(bytes.len());
                bytes[from..to].fill(0);
            }
        }
        removed.push(slot.index);
    }
    Ok(Cleared { bytes, kept: slots.len() - removed.len(), removed, external })
}

/// Is `after` what `before` was to become: the chunks in `dropped` no longer
/// listed, and every other chunk listed where it was, with the timestamp and
/// the bytes it had? Returns how many chunks stayed. This is the check the
/// regeneration run makes on every file it rewrites, before the rewritten file
/// goes anywhere near the world.
pub fn check_cleared(before: &[u8], after: &[u8], dropped: &BTreeSet<u16>) -> Result<usize, String> {
    if before.len() != after.len() {
        return Err(format!("its length changed ({} -> {} bytes)", before.len(), after.len()));
    }
    if before.len() < SECTOR_BYTES * 2 {
        return Err("it is shorter than a region file's header".to_string());
    }
    let stay: Vec<Slot> = header_slots(before).into_iter().filter(|s| !dropped.contains(&s.index)).collect();
    if header_slots(after) != stay {
        return Err("the chunks it lists are not exactly the ones that were to stay".to_string());
    }
    for slot in &stay {
        let stamp = SECTOR_BYTES + usize::from(slot.index) * 4;
        if before[stamp..stamp + 4] != after[stamp..stamp + 4] {
            return Err(format!("the timestamp of the chunk in slot {} changed", slot.index));
        }
        let from = slot.offset_sectors as usize * SECTOR_BYTES;
        let to = (from + usize::from(slot.sector_count) * SECTOR_BYTES).min(before.len());
        if from < to && before[from..to] != after[from..to] {
            return Err(format!("the data of the chunk in slot {} changed", slot.index));
        }
    }
    Ok(stay.len())
}

/// What [`replace_file`] calls the file it writes before the rename. Not a
/// region file name ([`parse_region_name`]), so a leftover is invisible to
/// Minecraft and to a scan.
pub const REPLACE_SUFFIX: &str = ".icraft-new";

/// `fs::rename`, tried again for two seconds: Windows refuses while a virus
/// scanner has the file it just saw being closed.
pub fn rename_retrying(from: &Path, to: &Path) -> io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(_) if attempt < 10 => {
                attempt += 1;
                std::thread::sleep(RETRY_PAUSE);
            }
            Err(e) => return Err(e),
        }
    }
}

/// Put `bytes` where `path` is: written beside it, flushed to disk, renamed
/// over it. A reader, or a power cut, finds the old file or the new one and
/// never half of either.
pub fn replace_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!("{name}{REPLACE_SUFFIX}"));
    let written = (|| {
        let mut file = fs::File::create(&tmp)?;
        io::Write::write_all(&mut file, bytes)?;
        file.sync_all()?;
        drop(file);
        rename_retrying(&tmp, path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written
}

/// A region file, for building test worlds. Not compiled into the launcher.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;
    use crate::nbt::testing::{encode_ordered, zlib};
    use crate::nbt::Value;

    /// Chunk NBT the way 1.20.1 lays it out, zlib-compressed.
    pub fn chunk_nbt(pos: ChunkPos, inhabited: i64) -> Vec<u8> {
        zlib(&encode_ordered(&[
            ("xPos", Value::Int(pos.0)),
            ("InhabitedTime", Value::Long(inhabited)),
            ("sections", Value::List(vec![Value::LongArray(vec![0x0102_0304_0506_0708; 300])])),
            ("zPos", Value::Int(pos.1)),
            ("Status", Value::String("minecraft:full".to_string())),
        ]))
    }

    /// A region file holding the given chunks (compression type, payload).
    pub fn region_bytes(rx: i32, rz: i32, chunks: &[(ChunkPos, u8, Vec<u8>)]) -> Vec<u8> {
        let mut out = vec![0u8; SECTOR_BYTES * 2];
        for (pos, kind, payload) in chunks {
            assert_eq!(region_of(*pos), (rx, rz), "chunk {pos:?} is not in r.{rx}.{rz}");
            let index = (pos.1.rem_euclid(32) * 32 + pos.0.rem_euclid(32)) as usize;
            let offset = out.len() / SECTOR_BYTES;
            out.extend_from_slice(&(payload.len() as u32 + 1).to_be_bytes());
            out.push(*kind);
            out.extend_from_slice(payload);
            while out.len() % SECTOR_BYTES != 0 {
                out.push(0);
            }
            let sectors = out.len() / SECTOR_BYTES - offset;
            let entry = ((offset as u32) << 8) | sectors as u32;
            out[index * 4..index * 4 + 4].copy_from_slice(&entry.to_be_bytes());
        }
        out
    }

    /// A scan result without a world behind it: terrain chunks with their
    /// `InhabitedTime` and, optionally, a reason they could not be read.
    pub fn scan_of(chunks: &[(ChunkPos, Option<i64>, Option<&str>)]) -> DimensionScan {
        let mut scan = DimensionScan::default();
        for (pos, inhabited, unreadable) in chunks {
            scan.chunks.insert(*pos, ChunkEntry {
                stores: Store::Region.bit(),
                inhabited: *inhabited,
                unreadable: unreadable.map(str::to_string),
            });
        }
        scan
    }

    /// Write `r.<rx>.<rz>.mca` into `<dim>/<store>/` with these chunks, each
    /// with the given `InhabitedTime`.
    pub fn write_region(dim_dir: &Path, store: Store, rx: i32, rz: i32, chunks: &[(ChunkPos, i64)]) {
        let dir = dim_dir.join(store.dir_name());
        fs::create_dir_all(&dir).unwrap();
        let chunks: Vec<(ChunkPos, u8, Vec<u8>)> = chunks.iter().map(|(pos, t)| (*pos, 2, chunk_nbt(*pos, *t))).collect();
        fs::write(dir.join(region_name(rx, rz)), region_bytes(rx, rz, &chunks)).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    fn temp_world() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "icraft-anvil-test-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn overworld(world: &Path) -> Dimension {
        discover_dimensions(world).remove(0)
    }

    #[test]
    fn region_names() {
        assert_eq!(parse_region_name("r.0.0.mca"), Some((0, 0)));
        assert_eq!(parse_region_name("r.-5.12.mca"), Some((-5, 12)));
        assert_eq!(parse_region_name("r.9.-1.mca"), Some((9, -1)));
        for not_ours in ["r.1.2.mca.bak", "r.+1.2.mca", "r.01.2.mca", "r.1.mca", "r.1.2.3.mca", "c.1.2.mcc", "r.a.b.mca", "r..1.mca", ""] {
            assert_eq!(parse_region_name(not_ours), None, "{not_ours}");
        }
        assert_eq!(region_of((42, 67)), (1, 2));
        assert_eq!(region_of((-1, -32)), (-1, -1));
        assert_eq!(region_of((-33, 31)), (-2, 0));
        // A slot's chunk, both ways round, in a negative region.
        let slot = Slot { index: 31 * 32 + 5, offset_sectors: 2, sector_count: 1 };
        assert_eq!(slot.chunk(-1, -2), (-27, -33));
        assert_eq!(region_of(slot.chunk(-1, -2)), (-1, -2));
    }

    #[test]
    fn dimensions_are_found_wherever_minecraft_puts_them() {
        let world = temp_world();
        fs::create_dir_all(world.join("region")).unwrap();
        fs::create_dir_all(world.join("DIM-1").join("data")).unwrap();
        fs::create_dir_all(world.join("DIM1").join("entities")).unwrap();
        // Modded: one visited, one with only a data folder, one nested path,
        // and the junk folders mods drop into every dimension.
        fs::create_dir_all(world.join("dimensions/twilightforest/twilight_forest/region")).unwrap();
        fs::create_dir_all(world.join("dimensions/ad_astra/moon/data")).unwrap();
        fs::create_dir_all(world.join("dimensions/ad_astra/moon/idas")).unwrap();
        fs::create_dir_all(world.join("dimensions/mymod/caves/deep/poi")).unwrap();
        fs::create_dir_all(world.join("dimensions/emptyns")).unwrap();
        fs::write(world.join("dimensions/stray.txt"), b"x").unwrap();

        let dims = discover_dimensions(&world);
        let ids: Vec<&str> = dims.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, vec![
            "minecraft:overworld",
            "minecraft:the_nether",
            "minecraft:the_end",
            "ad_astra:moon",
            "mymod:caves/deep",
            "twilightforest:twilight_forest",
        ]);
        assert_eq!(dims[0].rel, "");
        assert_eq!(dims[1].rel, "DIM-1");
        assert_eq!(dims[4].rel, "dimensions/mymod/caves/deep");
        assert_eq!(dims[4].dir, world.join("dimensions").join("mymod").join("caves").join("deep"));
        let with_chunks: Vec<&str> = dims.iter().filter(|d| d.has_chunk_storage()).map(|d| d.id.as_str()).collect();
        assert_eq!(with_chunks, vec!["minecraft:overworld", "minecraft:the_end", "mymod:caves/deep", "twilightforest:twilight_forest"]);
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn a_dimension_scan_reads_all_three_folders() {
        let world = temp_world();
        write_region(&world, Store::Region, 1, 2, &[((42, 67), 6_166_097), ((32, 64), 0), ((63, 95), 12_000)]);
        write_region(&world, Store::Region, -1, -1, &[((-1, -1), 33)]);
        // The placeholders Minecraft leaves behind, and things that are not region files.
        fs::write(world.join("region").join("r.9.9.mca"), b"").unwrap();
        fs::write(world.join("region").join("r.9.9.mca.bak"), b"junk").unwrap();
        fs::write(world.join("region").join("c.1.2.mcc"), b"junk").unwrap();
        // An entity chunk and a POI chunk with no terrain chunk.
        write_region(&world, Store::Entities, 1, 2, &[((42, 67), 0), ((33, 64), 0)]);
        write_region(&world, Store::Poi, 0, 0, &[((3, 4), 0)]);
        fs::write(world.join("poi").join("r.1.1.mca"), b"").unwrap();

        let scan = scan_dimension(&overworld(&world));
        assert_eq!(scan.files_of(Store::Region).count(), 3);
        assert_eq!(scan.files_of(Store::Entities).count(), 1);
        assert_eq!(scan.files_of(Store::Poi).count(), 2);
        assert_eq!(scan.external_chunk_files, 1);
        assert!(scan.changed_during_scan.is_empty());
        let real = scan.files_of(Store::Region).find(|f| f.name == "r.1.2.mca").unwrap();
        assert_eq!(real.bytes, fs::metadata(world.join("region").join("r.1.2.mca")).unwrap().len());
        assert_eq!(scan.without_inhabited_time, 0);
        assert!(scan.files.iter().all(|f| f.error.is_none()));
        let placeholder = scan.files_of(Store::Region).find(|f| f.name == "r.9.9.mca").unwrap();
        assert_eq!((placeholder.bytes, placeholder.chunks.len()), (0, 0));

        assert_eq!(scan.chunks.len(), 6);
        assert_eq!((scan.chunk_count(Store::Region), scan.chunk_count(Store::Entities), scan.chunk_count(Store::Poi)), (4, 2, 1));
        assert_eq!(scan.chunks[&(42, 67)].inhabited, Some(6_166_097));
        assert_eq!(scan.chunks[&(32, 64)].inhabited, Some(0));
        assert_eq!(scan.chunks[&(63, 95)].inhabited, Some(12_000));
        assert_eq!(scan.chunks[&(-1, -1)].inhabited, Some(33));
        assert!(scan.chunks[&(42, 67)].in_store(Store::Region) && scan.chunks[&(42, 67)].in_store(Store::Entities));
        // No terrain chunk: present, with no InhabitedTime to go by.
        let orphan = &scan.chunks[&(33, 64)];
        assert!(orphan.in_store(Store::Entities) && !orphan.in_store(Store::Region));
        assert_eq!((orphan.inhabited, orphan.unreadable.clone()), (None, None));
        assert!(scan.chunks[&(3, 4)].in_store(Store::Poi));
        assert_eq!(store_summary(&world.join("region")).0, 3);
        assert_eq!(store_summary(&world.join("nowhere")), (0, 0));
        let _ = fs::remove_dir_all(&world);
    }

    #[test]
    fn every_compression_type_reads() {
        let raw = crate::nbt::testing::encode_ordered(&[("InhabitedTime", crate::nbt::Value::Long(77))]);
        assert_eq!(inhabited_time(1, &crate::nbt::testing::gzip(&raw)), Ok(Some(77)));
        assert_eq!(inhabited_time(2, &crate::nbt::testing::zlib(&raw)), Ok(Some(77)));
        assert_eq!(inhabited_time(3, &raw), Ok(Some(77)));
        assert!(inhabited_time(4, &raw).is_err()); // LZ4 arrived in 1.20.5
        assert!(inhabited_time(2, &raw).is_err()); // not zlib
        let no_tag = crate::nbt::testing::encode_ordered(&[("xPos", crate::nbt::Value::Int(1))]);
        assert_eq!(inhabited_time(3, &no_tag), Ok(None));
    }

    #[test]
    fn a_damaged_chunk_is_unreadable_and_the_rest_still_read() {
        let world = temp_world();
        let dir = world.join("region");
        fs::create_dir_all(&dir).unwrap();
        let good = chunk_nbt((1, 1), 500);
        let mut bytes = region_bytes(0, 0, &[
            ((0, 0), 2, good.clone()),
            ((1, 1), 2, good.clone()),
            ((2, 2), 2, b"this is not zlib".to_vec()),
            ((3, 3), 9, good.clone()),
            ((4, 4), 2, good.clone()),
            ((5, 5), 0x82, Vec::new()), // external, and the .mcc is missing
        ]);
        // (4,4): point its location entry past the end of the file.
        let index = 4 * 32 + 4;
        bytes[index * 4..index * 4 + 4].copy_from_slice(&((9_000u32 << 8) | 1).to_be_bytes());
        // (0,0): cut its length field down to zero.
        let offset = u32::from_be_bytes([0, bytes[0], bytes[1], bytes[2]]) as usize * SECTOR_BYTES;
        bytes[offset..offset + 4].copy_from_slice(&0u32.to_be_bytes());
        fs::write(dir.join("r.0.0.mca"), &bytes).unwrap();
        // A file that ends inside its header lists nothing.
        fs::write(dir.join("r.1.0.mca"), vec![1u8; 100]).unwrap();

        let scan = scan_dimension(&overworld(&world));
        assert_eq!(scan.chunks.len(), 6);
        assert_eq!(scan.chunks[&(1, 1)].inhabited, Some(500));
        assert_eq!(scan.chunks[&(1, 1)].unreadable, None);
        for bad in [(0, 0), (2, 2), (3, 3), (4, 4), (5, 5)] {
            let c = &scan.chunks[&bad];
            assert!(c.unreadable.is_some(), "{bad:?} should be unreadable");
            assert_eq!(c.inhabited, None);
            assert!(c.in_store(Store::Region));
        }
        assert_eq!(scan.files_of(Store::Region).find(|f| f.name == "r.1.0.mca").unwrap().chunks.len(), 0);

        // With the .mcc in place the external chunk reads.
        fs::write(dir.join("c.5.5.mcc"), chunk_nbt((5, 5), 900)).unwrap();
        let scan = scan_dimension(&overworld(&world));
        assert_eq!(scan.chunks[&(5, 5)].inhabited, Some(900));
        assert_eq!(scan.chunks[&(5, 5)].unreadable, None);
        let _ = fs::remove_dir_all(&world);
    }

    /// The property the feature is sold on: a scan leaves no trace.
    #[test]
    fn a_scan_changes_nothing_on_disk() {
        let world = temp_world();
        write_region(&world, Store::Region, 0, 0, &[((0, 0), 1), ((31, 31), 2)]);
        write_region(&world, Store::Entities, 0, 0, &[((0, 0), 0)]);
        fs::write(world.join("region").join("r.2.2.mca"), b"").unwrap();
        let snapshot = |dir: &Path| -> Vec<(PathBuf, Vec<u8>, Option<std::time::SystemTime>)> {
            let mut out = Vec::new();
            for store in Store::ALL {
                for e in fs::read_dir(dir.join(store.dir_name())).into_iter().flatten().filter_map(|e| e.ok()) {
                    let modified = e.metadata().ok().and_then(|m| m.modified().ok());
                    out.push((e.path(), fs::read(e.path()).unwrap(), modified));
                }
            }
            out.sort();
            out
        };
        let before = snapshot(&world);
        assert_eq!(before.len(), 3);
        let scan = scan_dimension(&overworld(&world));
        assert_eq!(scan.chunks.len(), 2);
        assert_eq!(snapshot(&world), before);
        let _ = fs::remove_dir_all(&world);
    }

    #[cfg(windows)]
    #[test]
    fn reading_does_not_get_in_a_writers_way() {
        let world = temp_world();
        let path = world.join("r.0.0.mca");
        fs::write(&path, vec![0u8; SECTOR_BYTES * 2]).unwrap();
        let held = open_shared(&path).unwrap();
        // While this module holds the file: another process can still write it,
        // rename it and delete it. (An exclusive open here would make all
        // three fail with a sharing violation.)
        fs::OpenOptions::new().write(true).open(&path).unwrap();
        let moved = world.join("r.0.0.mca.moved");
        fs::rename(&path, &moved).unwrap();
        fs::remove_file(&moved).unwrap();
        drop(held);
        let _ = fs::remove_dir_all(&world);
    }

    /// Four chunks in r.0.0: two plain ones, one of four sectors, one whose
    /// data is in a .mcc file. Each with a timestamp of its own.
    fn four_chunks() -> Vec<u8> {
        let mut bytes = region_bytes(0, 0, &[
            ((0, 0), 2, chunk_nbt((0, 0), 1)),
            ((5, 0), 3, vec![7u8; SECTOR_BYTES * 3 + 100]),
            ((31, 31), 2, chunk_nbt((31, 31), 9)),
            ((7, 7), 0x82, Vec::new()),
        ]);
        for (n, pos) in [(0, 0), (5, 0), (31, 31), (7, 7)].into_iter().enumerate() {
            let at = SECTOR_BYTES + usize::from(slot_index(pos)) * 4;
            bytes[at..at + 4].copy_from_slice(&(1_700_000_000u32 + n as u32).to_be_bytes());
        }
        bytes
    }

    #[test]
    fn clearing_takes_out_the_chunks_asked_for_and_touches_no_other() {
        assert_eq!(slot_index((5, 0)), 5);
        assert_eq!(slot_index((31, 31)), 31 * 32 + 31);
        assert_eq!(slot_index((-27, -33)), 31 * 32 + 5); // in r.-1.-2, as `region_names` has it
        assert_eq!(slot_index((42, 67)), (67 - 2 * 32) * 32 + (42 - 1 * 32));

        let before = four_chunks();
        // The big one, the external one, and a slot that holds nothing.
        let drop: BTreeSet<u16> = [slot_index((5, 0)), slot_index((7, 7)), slot_index((9, 9))].into();
        let cleared = clear_chunks(&before, &drop).unwrap();
        assert_eq!(cleared.bytes.len(), before.len());
        assert_eq!(cleared.removed, vec![slot_index((5, 0)), slot_index((7, 7))]);
        assert_eq!(cleared.external, vec![slot_index((7, 7))]);
        assert_eq!(cleared.kept, 2);
        assert_eq!(check_cleared(&before, &cleared.bytes, &drop), Ok(2));

        // The readers see the two that stayed, with the bytes they had.
        let after = &cleared.bytes;
        let left: Vec<ChunkPos> = header_slots(after).iter().map(|s| s.chunk(0, 0)).collect();
        assert_eq!(left, vec![(0, 0), (31, 31)]);
        for slot in header_slots(after) {
            assert_eq!(chunk_payload(after, slot), chunk_payload(&before, slot));
            assert!(inhabited_time(2, chunk_payload(after, slot).unwrap().1).unwrap().is_some());
        }
        // Outside the header entries and the removed chunks' own sectors,
        // not one byte differs; inside them, every byte is zero.
        let gone: Vec<Slot> = header_slots(&before).into_iter().filter(|s| drop.contains(&s.index)).collect();
        assert_eq!(gone.len(), 2);
        for (at, (old, new)) in before.iter().zip(after.iter()).enumerate() {
            let in_entry = gone.iter().any(|s| {
                let entry = usize::from(s.index) * 4;
                (entry..entry + 4).contains(&at) || (SECTOR_BYTES + entry..SECTOR_BYTES + entry + 4).contains(&at)
            });
            let in_sectors = gone.iter().any(|s| {
                let from = s.offset_sectors as usize * SECTOR_BYTES;
                (from..from + usize::from(s.sector_count) * SECTOR_BYTES).contains(&at)
            });
            if in_entry || in_sectors {
                assert_eq!(*new, 0, "byte {at} belongs to a removed chunk");
            } else {
                assert_eq!(old, new, "byte {at} belongs to nothing that was removed");
            }
        }
        assert!(gone.iter().any(|s| s.sector_count == 4)); // the big one really was four sectors

        // Nothing to take out: the same bytes. Everything: an empty file of the same size.
        assert_eq!(clear_chunks(&before, &BTreeSet::new()).unwrap().bytes, before);
        let all: BTreeSet<u16> = (0..1024).collect();
        let emptied = clear_chunks(&before, &all).unwrap();
        assert_eq!((emptied.removed.len(), emptied.kept), (4, 0));
        assert!(header_slots(&emptied.bytes).is_empty());
        assert!(emptied.bytes.iter().all(|b| *b == 0));
        assert_eq!(check_cleared(&before, &emptied.bytes, &all), Ok(0));
        // Not a region file at all.
        assert!(clear_chunks(&before[..SECTOR_BYTES], &drop).is_err());
        assert!(clear_chunks(b"", &drop).is_err());
    }

    #[test]
    fn the_check_catches_every_way_a_rewrite_could_be_wrong() {
        let before = four_chunks();
        let drop: BTreeSet<u16> = [slot_index((5, 0))].into();
        let good = clear_chunks(&before, &drop).unwrap().bytes;
        assert_eq!(check_cleared(&before, &good, &drop), Ok(3));

        // A chunk that was to go is still listed.
        assert!(check_cleared(&before, &before, &drop).unwrap_err().contains("lists"));
        // A chunk that was to stay is gone.
        let too_many: BTreeSet<u16> = [slot_index((5, 0)), slot_index((0, 0))].into();
        let overdone = clear_chunks(&before, &too_many).unwrap().bytes;
        assert!(check_cleared(&before, &overdone, &drop).unwrap_err().contains("lists"));
        // One byte of a kept chunk's data.
        let kept = header_slots(&good)[0];
        let mut flipped = good.clone();
        flipped[kept.offset_sectors as usize * SECTOR_BYTES + 20] ^= 0xFF;
        assert!(check_cleared(&before, &flipped, &drop).unwrap_err().contains("data of the chunk"));
        // A kept chunk's timestamp.
        let mut restamped = good.clone();
        restamped[SECTOR_BYTES + usize::from(kept.index) * 4 + 3] ^= 1;
        assert!(check_cleared(&before, &restamped, &drop).unwrap_err().contains("timestamp"));
        // A kept chunk moved to another sector.
        let mut moved = good.clone();
        let entry = usize::from(kept.index) * 4;
        moved[entry + 2] ^= 0x40;
        assert!(check_cleared(&before, &moved, &drop).is_err());
        // A file that grew or shrank.
        assert!(check_cleared(&before, &good[..good.len() - SECTOR_BYTES], &drop).unwrap_err().contains("length"));
    }

    #[test]
    fn a_sector_two_entries_claim_is_not_zeroed() {
        let mut before = region_bytes(0, 0, &[((0, 0), 2, chunk_nbt((0, 0), 1)), ((1, 0), 2, chunk_nbt((1, 0), 2))]);
        // A damaged header: (1,0) points at (0,0)'s sectors.
        let first = before[0..4].to_vec();
        before[4..8].copy_from_slice(&first);
        let drop: BTreeSet<u16> = [1].into();
        let cleared = clear_chunks(&before, &drop).unwrap();
        assert_eq!(check_cleared(&before, &cleared.bytes, &drop), Ok(1));
        let stayed = header_slots(&cleared.bytes)[0];
        assert_eq!(stayed.index, 0);
        assert_eq!(chunk_payload(&cleared.bytes, stayed), chunk_payload(&before, stayed));
        assert_eq!(inhabited_time(2, chunk_payload(&cleared.bytes, stayed).unwrap().1), Ok(Some(1)));
    }

    #[test]
    fn a_file_is_replaced_whole_or_not_at_all() {
        let world = temp_world();
        let path = world.join("r.0.0.mca");
        fs::write(&path, b"old").unwrap();
        replace_file(&path, b"new and longer").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new and longer");
        // Where there was no file, there is one now; and nothing is left beside either.
        let fresh = world.join("r.1.0.mca");
        replace_file(&fresh, b"x").unwrap();
        assert_eq!(fs::read(&fresh).unwrap(), b"x");
        let names: Vec<String> = fs::read_dir(&world).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        assert!(names.iter().all(|n| !n.ends_with(REPLACE_SUFFIX)), "{names:?}");
        // A folder that is not there: an error, and the old file is untouched.
        assert!(replace_file(&world.join("nowhere").join("r.0.0.mca"), b"y").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"new and longer");
        assert_eq!(parse_region_name(&format!("r.0.0.mca{REPLACE_SUFFIX}")), None);
        let _ = fs::remove_dir_all(&world);
    }
}
