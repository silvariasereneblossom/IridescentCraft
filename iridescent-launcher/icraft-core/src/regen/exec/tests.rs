//! A small world with one of everything a run has to get right, carried out
//! for real in a temp folder: region files that go whole, files that keep some
//! chunks, an oversized chunk in each kind, the three chunk folders disagreeing
//! about what exists, a zero-byte placeholder, and every store that refers to
//! chunks.
//!
//!   - world spawn at chunk (0,0); the dry-runs use `spawn_radius_blocks=16`
//!   - `region/r.0.0`: every chunk 0..=20 x 0..=20; (12,12) and (15,15) lived in
//!   - `region/r.-1.-1`: (-1,-1) (kept, spawn) and (-20,-20)
//!   - `region/r.3.3`: (100,100) and the oversized (101,100): the file goes whole
//!   - `region/r.1.0`: the oversized (40,5), and (41,5), lived in: rewritten
//!   - `entities/r.0.0`: (12,12), and (25,25) which has no terrain chunk
//!   - `entities/r.3.3`, `poi/r.3.3`: (100,100). `poi/r.0.0`: (12,12) only
//!   - a player with their bed and their logout position in chunk (12,12)
//!   - waystones: a player-placed one at (18,18), generated ones at (7,7) and
//!     (100,100)
//!
//! With scope `all` that is 448 chunks on disk, 17 kept, 431 reset.

use super::*;
use crate::anvil::testing::{chunk_nbt, region_bytes, write_region};
use crate::nbt::testing::{compound, encode_ordered, gzip, string};
use crate::worlddata::testing::{player_nbt, write_claims, write_gz, write_level, write_player, write_waystones};
use std::sync::atomic::AtomicU32;

const PLAYER: &str = "0e0c6371-8599-3a43-a117-30cb7e62c579"; // offline UUID of PLAYER_NAME
const PLAYER_NAME: &str = "Player_One";

static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

/// A block position the way Minecraft packs one into a long.
fn pack(x: i32, y: i32, z: i32) -> i64 {
    ((i64::from(x) & 0x3FF_FFFF) << 38) | ((i64::from(z) & 0x3FF_FFFF) << 12) | (i64::from(y) & 0xFFF)
}

/// A chunk position the way MCA keys its graveyard: `ChunkPos.toLong`.
fn chunk_key(x: i32, z: i32) -> String {
    ((i64::from(x) & 0xFFFF_FFFF) | ((i64::from(z) & 0xFFFF_FFFF) << 32)).to_string()
}

/// A block in the middle of a chunk.
fn mid(chunk: i32) -> i32 {
    chunk * 16 + 8
}

fn ore_file(generated: &[(&str, i64)], points: &[Vec<i64>]) -> Vec<u8> {
    let generated: Vec<Value> = generated
        .iter()
        .map(|(name, pos)| {
            compound(vec![
                ("size", Value::Int(700)),
                ("target", string("Deposit")),
                ("pos", Value::Long(*pos)),
                ("indicator", Value::Byte(0)),
                ("deferred", Value::Int(12)),
                ("name", string(name)),
            ])
        })
        .collect();
    let points: Vec<Value> = points.iter().map(|p| Value::LongArray(p.clone())).collect();
    // The root as it is on the live world: other mods' version keys, and not sorted.
    gzip(&encode_ordered(&[
        ("DataVersion", Value::Int(3465)),
        ("Railways_DataVersion", Value::Int(11)),
        ("brewinandchewin:data_version", Value::Int(2)),
        ("data", compound(vec![("generated", Value::List(generated)), ("points", Value::List(points))])),
    ]))
}

/// A town centre: its recorded blocks are the village's bells.
fn building(id: i32, bells: &[(i32, i32)]) -> Value {
    let positions: Vec<Value> =
        bells.iter().map(|(x, z)| compound(vec![("z", Value::Int(mid(*z))), ("x", Value::Int(mid(*x))), ("y", Value::Int(67))])).collect();
    compound(vec![
        ("id", Value::Int(id)),
        ("type", string("town_center")),
        ("posX", Value::Int(mid(bells[0].0))),
        ("posY", Value::Int(67)),
        ("posZ", Value::Int(mid(bells[0].1))),
        ("blocks2", compound(vec![("minecraft:bell", Value::List(positions))])),
    ])
}

fn village(id: i32, name: &str, buildings: Vec<Value>) -> Value {
    compound(vec![
        ("id", Value::Int(id)),
        ("name", string(name)),
        ("buildings", Value::List(buildings)),
        ("residentNames", compound(vec![("9e5ae5f7-0907-429b-98e9-6d96b77e4db4", string("Vilija"))])),
    ])
}

fn villages_file(villages: Vec<Value>) -> Vec<u8> {
    gzip(&encode_ordered(&[
        ("DataVersion", Value::Int(3465)),
        ("data", compound(vec![("lastBuildingId", Value::Int(9)), ("lastVillageId", Value::Int(3)), ("villages", Value::List(villages))])),
    ]))
}

fn graveyard_file(states: &[(&str, &[(i32, i32)])]) -> Vec<u8> {
    let states: BTreeMap<String, Value> = states
        .iter()
        .map(|(state, chunks)| {
            let by_chunk: BTreeMap<String, Value> =
                chunks.iter().map(|(x, z)| (chunk_key(*x, *z), Value::List(vec![Value::Long(pack(mid(*x), 64, mid(*z)))]))).collect();
            (state.to_string(), Value::Compound(by_chunk))
        })
        .collect();
    gzip(&encode_ordered(&[("DataVersion", Value::Int(3465)), ("data", Value::Compound(states))]))
}

/// The uncompressed NBT of a file on disk.
fn payload_of(path: &Path) -> Vec<u8> {
    nbt::unwrap_container(&fs::read(path).unwrap()).unwrap().1
}

fn payload(bytes: &[u8]) -> Vec<u8> {
    nbt::unwrap_container(bytes).unwrap().1
}

struct Server {
    root: PathBuf,
    cfg: ServerConfig,
}

impl Server {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("icraft-exec-test-{}-{}", std::process::id(), NEXT_DIR.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&root);
        let world = root.join("testworld");
        fs::create_dir_all(&world).unwrap();
        fs::write(root.join("server.properties"), "level-name=testworld\nonline-mode=false\n").unwrap();
        fs::write(root.join("usercache.json"), format!(r#"[{{"name":"{PLAYER_NAME}","uuid":"{PLAYER}"}}]"#)).unwrap();
        write_level(&world, (0, 64, 0));

        let mut grid: Vec<(ChunkPos, i64)> = Vec::new();
        for x in 0..=20 {
            for z in 0..=20 {
                let ticks = match (x, z) {
                    (12, 12) => 100_000,
                    (15, 15) => 12_000,
                    _ => 0,
                };
                grid.push(((x, z), ticks));
            }
        }
        write_region(&world, Store::Region, 0, 0, &grid);
        write_region(&world, Store::Region, -1, -1, &[((-1, -1), 0), ((-20, -20), 0)]);
        let region = world.join("region");
        fs::write(region.join("r.3.3.mca"), region_bytes(3, 3, &[((100, 100), 2, chunk_nbt((100, 100), 0)), ((101, 100), 0x82, Vec::new())])).unwrap();
        fs::write(region.join("c.101.100.mcc"), chunk_nbt((101, 100), 0)).unwrap();
        fs::write(region.join("r.1.0.mca"), region_bytes(1, 0, &[((40, 5), 0x82, Vec::new()), ((41, 5), 2, chunk_nbt((41, 5), 50_000))])).unwrap();
        fs::write(region.join("c.40.5.mcc"), chunk_nbt((40, 5), 0)).unwrap();
        fs::write(region.join("r.5.5.mca"), b"").unwrap();
        fs::write(region.join("r.0.0.mca.bak"), b"somebody's copy").unwrap();
        write_region(&world, Store::Entities, 0, 0, &[((12, 12), 0), ((25, 25), 0)]);
        write_region(&world, Store::Entities, 3, 3, &[((100, 100), 0)]);
        write_region(&world, Store::Poi, 0, 0, &[((12, 12), 0)]);
        write_region(&world, Store::Poi, 3, 3, &[((100, 100), 0)]);

        write_player(&world, PLAYER, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (200.5, 64.0, 200.5)), &[]));
        write_waystones(&world, &[
            ([1, 2, 3, 4], "", OVERWORLD, (mid(18), 70, mid(18)), "PLAYER"),
            ([5, 6, 7, 8], "", OVERWORLD, (mid(7), 64, mid(7)), "VILLAGE"),
            ([9, 9, 9, 9], "", OVERWORLD, (mid(100), 64, mid(100)), "WILDERNESS"),
        ]);
        let data = world.join("data");
        let (a, b, c) = (pack(mid(7), 20, mid(7)), pack(mid(12), 30, mid(12)), pack(mid(100), 10, mid(100)));
        fs::write(data.join("large_ore_deposits.dat"), ore_file(&[("silver", a), ("tin", b), ("lead", c)], &[vec![pack(144, 20, 120), a], vec![pack(224, 30, 200), b], vec![1, 2, 3]])).unwrap();
        fs::write(
            data.join("mca_villages.dat"),
            villages_file(vec![
                village(0, "Gone", vec![building(0, &[(7, 7)])]),
                village(1, "Kept", vec![building(1, &[(12, 12)])]),
                village(2, "Both", vec![building(2, &[(12, 13)]), building(3, &[(5, 5)])]),
            ]),
        )
        .unwrap();
        fs::write(data.join("mca_graveyard.dat"), graveyard_file(&[("FILLED", &[(7, 7), (12, 12)]), ("EMPTY", &[(100, 100)])])).unwrap();
        for (id, chunk) in [("011bcf30-92aa-46a9-860f-263499ba0fbc", 7), ("0499ba0f-92aa-46a9-860f-2634011bcf30", 12)] {
            let position = compound(vec![("X", Value::Int(mid(chunk))), ("Y", Value::Int(60)), ("Z", Value::Int(mid(chunk)))]);
            let container = compound(vec![("dimension", string(OVERWORLD)), ("position", position), ("size", Value::Int(27))]);
            write_gz(&data.join("lootr").join(&id[..1]).join(&id[..2]).join(format!("{id}.dat")), &compound(vec![("data", container)]));
        }
        fs::write(world.join(crate::overrides::WORLD_MANIFEST), "{\n  \"version\": 1,\n  \"custom\": \"kept\",\n  \"config_changes\": [{\"key\": \"x\"}]\n}\n").unwrap();
        Server { cfg: ServerConfig::from_path(&root), root }
    }

    fn world(&self) -> PathBuf {
        self.root.join("testworld")
    }

    /// A dry-run: its folder and its plan's hash.
    fn dry_run(&self, tokens: &str) -> (PathBuf, String) {
        let mut spec = RunSpec::parse_tokens(tokens.split_whitespace()).unwrap();
        spec.set("spawn_radius_blocks", "16").unwrap();
        let summary = crate::regen::run(&self.cfg, &spec).unwrap();
        (summary.out_dir, summary.plan_hash)
    }

    fn approval(&self, run_dir: &Path, hash: &str) -> Approval {
        Approval { run_dir: run_dir.to_path_buf(), typed: hash[..APPROVAL_CHARS].to_string(), by: "test".to_string(), pregen: Pregen::Off }
    }

    fn run(&self, run_dir: &Path, hash: &str) -> Outcome {
        execute(&self.cfg, &self.approval(run_dir, hash))
    }

    /// Every file of the world: path with `/`, and bytes.
    fn snapshot(&self) -> BTreeMap<String, Vec<u8>> {
        fn walk(dir: &Path, rel: &str, out: &mut BTreeMap<String, Vec<u8>>) {
            for e in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
                let name = e.file_name().into_string().unwrap();
                let child = if rel.is_empty() { name } else { format!("{rel}/{name}") };
                if e.path().is_dir() {
                    walk(&e.path(), &child, out);
                } else {
                    out.insert(child, fs::read(e.path()).unwrap());
                }
            }
        }
        let mut out = BTreeMap::new();
        walk(&self.world(), "", &mut out);
        out
    }

    /// Every chunk the three folders list: its location entry, its timestamp
    /// and the bytes of its sectors.
    fn chunk_images(&self) -> BTreeMap<(&'static str, ChunkPos), Vec<u8>> {
        let mut out = BTreeMap::new();
        for store in Store::ALL {
            for e in fs::read_dir(self.world().join(store.dir_name())).into_iter().flatten().filter_map(|e| e.ok()) {
                let name = e.file_name().into_string().unwrap();
                let Some((rx, rz)) = anvil::parse_region_name(&name) else { continue };
                let bytes = fs::read(e.path()).unwrap();
                for slot in anvil::header_slots(&bytes) {
                    let entry = usize::from(slot.index) * 4;
                    let from = slot.offset_sectors as usize * anvil::SECTOR_BYTES;
                    let to = (from + usize::from(slot.sector_count) * anvil::SECTOR_BYTES).min(bytes.len());
                    let mut image = bytes[entry..entry + 4].to_vec();
                    image.extend_from_slice(&bytes[anvil::SECTOR_BYTES + entry..anvil::SECTOR_BYTES + entry + 4]);
                    image.extend_from_slice(&bytes[from..to]);
                    out.insert((store.dir_name(), slot.chunk(rx, rz)), image);
                }
            }
        }
        out
    }

    fn holding(&self) -> HoldingEntry {
        holdings(&self.root).into_iter().next().expect("a holding folder")
    }

    fn log(&self) -> String {
        fs::read_to_string(self.root.join("logs").join(LOG_FILE)).unwrap_or_default()
    }

    fn manual_backups(&self) -> usize {
        fs::read_dir(self.root.join("backups")).into_iter().flatten().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with("manual-")).count()
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

/// The 17 chunks scope `all` keeps.
fn kept() -> BTreeSet<ChunkPos> {
    let mut kept = BTreeSet::new();
    for x in 11..=13 {
        for z in 11..=13 {
            kept.insert((x, z)); // the bed, 3x3
        }
    }
    kept.extend([(0, 0), (0, 1), (1, 0), (1, 1), (-1, -1)]); // spawn, where generated
    kept.extend([(15, 15), (41, 5), (18, 18)]); // lived-in twice, the placed waystone
    kept
}

fn done(outcome: Outcome) -> Report {
    match outcome {
        Outcome::Done(report) => *report,
        other => panic!("expected a finished run, got: {}", other.line()),
    }
}

fn refused(outcome: Outcome) -> String {
    match outcome {
        Outcome::Refused(why) => why,
        other => panic!("expected a refusal, got: {}", other.line()),
    }
}

#[test]
fn the_fixtures_helpers_pack_as_minecraft_does() {
    for (x, y, z) in [(687, 67, 1081), (-1815, 25, 1121), (-1930, 13, -528), (0, -64, 0)] {
        assert_eq!(BlockPos::from_long(pack(x, y, z)), BlockPos { x, y, z });
    }
    assert_eq!(pack(-1815, 25, 1121), -498_903_396_511_719); // a value from the live world
    assert_eq!(chunk_key(47, 63), "270582939695"); // and a graveyard key like the live world's
    assert_eq!(parse_external_name("c.101.100.mcc"), Some((101, 100)));
    assert_eq!(parse_external_name("c.-3.7.mcc"), Some((-3, 7)));
    for not_one in ["r.1.2.mca", "c.1.mcc", "c.a.b.mcc", "c.1.2.mca", ""] {
        assert_eq!(parse_external_name(not_one), None, "{not_one}");
    }
}

#[test]
fn a_run_resets_what_the_plan_says_and_a_rollback_gives_it_all_back() {
    let sv = Server::new();
    let world = sv.world();
    let before = sv.snapshot();
    let images = sv.chunk_images();
    let fingerprint = backup::world_fingerprint(&sv.cfg).unwrap();
    let (run_dir, hash) = sv.dry_run("scope=all");
    assert_eq!(sv.snapshot(), before, "a dry-run changes nothing");

    // Looked over first, without touching anything.
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.same_plan && look.ready(), "{:?}", look.stops());
    assert_eq!((look.on_disk, look.targets, look.kept), (448, 431, 17));
    assert_eq!(look.approval_text(), &hash[..8]);
    let said = |needle: &str| look.lines.iter().any(|l| l.text.contains(needle));
    assert!(said("The server is stopped"));
    assert!(said("1 / 1 / 1 (region / entities / poi) hold only chunks that are reset"), "{:#?}", look.lines);
    assert!(said("3 / 1 / 0 keep some chunks"), "{:#?}", look.lines);
    assert!(said("2 oversized-chunk file(s)"));
    assert!(said("Waystones: 2 of the 3"));
    assert!(said("2 of the 3 recorded deposits"));
    assert!(said("1 of the 3 recorded villages stand wholly"));
    assert!(said("1 village record(s) have buildings both in kept and in reset chunks"));
    assert!(said("MCA graveyard (minecraft:overworld): 2 of 3"));
    assert!(said("Lootr: 1 of the 2"));
    assert!(said("no pinned backup of the world as it is now exists yet"));
    assert!(said("Pregeneration: off"));
    assert!(said("0 worldgen value(s) of this server's own in 0 file(s) are in force, and 1 change(s) of value are on this world's record"));
    assert_eq!(sv.snapshot(), before, "a preflight changes nothing");

    // The run.
    let report = done(sv.run(&run_dir, &hash));
    assert_eq!((report.chunks_reset, report.chunks_kept), (431, 17));
    assert_eq!((report.files_moved, report.files_rewritten, report.external_moved), ([1, 1, 1], [3, 1, 0], 2));
    assert_eq!(report.plan_hash, hash);
    assert!(!report.backup_reused);
    assert_eq!(report.stores.len(), 4, "{:?}", report.stores);
    assert!(!sv.root.join(MARKER_FILE).exists());

    // Every chunk that was to stay is where it was, in the folders it was in,
    // with its location entry, its timestamp and its bytes. Every other chunk
    // is gone from all three folders.
    let after = sv.chunk_images();
    let stay: BTreeMap<(&'static str, ChunkPos), Vec<u8>> = images.iter().filter(|((_, pos), _)| kept().contains(pos)).map(|(k, v)| (*k, v.clone())).collect();
    assert_eq!(stay.len(), 17 + 1 + 1); // 17 terrain chunks, and (12,12) in entities and poi
    assert_eq!(after, stay);
    assert_eq!(images.len() - after.len(), 431 + 2); // (100,100) was in all three folders

    // Files: the whole ones and the oversized chunks left the world; the rest
    // of the world's files are the ones that were there, byte for byte, apart
    // from the files the run rewrote.
    let now = sv.snapshot();
    let moved = ["region/r.3.3.mca", "region/c.101.100.mcc", "region/c.40.5.mcc", "entities/r.3.3.mca", "poi/r.3.3.mca"];
    let rewritten = [
        "region/r.0.0.mca",
        "region/r.-1.-1.mca",
        "region/r.1.0.mca",
        "entities/r.0.0.mca",
        "data/waystones.dat",
        "data/large_ore_deposits.dat",
        "data/mca_villages.dat",
        "data/mca_graveyard.dat",
        ".icraft_world.json",
    ];
    for (name, bytes) in &before {
        if moved.contains(&name.as_str()) {
            assert!(!now.contains_key(name), "{name} should have left the world");
        } else if rewritten.contains(&name.as_str()) {
            assert_ne!(now.get(name), Some(bytes), "{name} should have been rewritten");
            if name.ends_with(".mca") {
                assert_eq!(now[name].len(), bytes.len(), "{name}: a region file keeps its length");
            }
        } else {
            assert_eq!(now.get(name), Some(bytes), "{name} is not part of the plan");
        }
    }
    assert_eq!(now.len(), before.len() - moved.len());
    for untouched in ["poi/r.0.0.mca", "region/r.5.5.mca", "region/r.0.0.mca.bak", "level.dat", "data/lootr/0/01/011bcf30-92aa-46a9-860f-263499ba0fbc.dat"] {
        assert_eq!(now[untouched], before[untouched], "{untouched}");
    }

    // The stores: exactly the entries of reset chunks are gone, and the rest of
    // each file is the NBT it was, in the order it was.
    let (a, b, c) = (pack(mid(7), 20, mid(7)), pack(mid(12), 30, mid(12)), pack(mid(100), 10, mid(100)));
    let _ = (a, c);
    assert_eq!(payload_of(&world.join("data").join("large_ore_deposits.dat")), payload(&ore_file(&[("tin", b)], &[vec![pack(224, 30, 200), b], vec![1, 2, 3]])));
    assert_eq!(
        payload_of(&world.join("data").join("mca_villages.dat")),
        payload(&villages_file(vec![village(1, "Kept", vec![building(1, &[(12, 12)])]), village(2, "Both", vec![building(2, &[(12, 13)]), building(3, &[(5, 5)])])]))
    );
    assert_eq!(payload_of(&world.join("data").join("mca_graveyard.dat")), payload(&graveyard_file(&[("FILLED", &[(12, 12)])])));
    let waystones = worlddata::read_waystones(&world).unwrap().unwrap();
    assert_eq!(waystones.len(), 1);
    assert_eq!((waystones[0].origin.as_str(), waystones[0].pos.chunk()), ("PLAYER", (18, 18)));

    // The world's own record: what was there is kept, and the run is on it.
    let record: serde_json::Value = serde_json::from_slice(&now[".icraft_world.json"]).unwrap();
    assert_eq!(record["custom"], "kept");
    assert_eq!(record["config_changes"].as_array().unwrap().len(), 1);
    let runs = record["regenerations"].as_array().unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0]["plan_hash"], hash.as_str());
    assert_eq!((runs[0]["chunks_reset"].as_u64(), runs[0]["chunks_kept"].as_u64()), (Some(431), Some(17)));
    assert_eq!(runs[0]["backup"], report.backup_file.as_str());
    // Its bitmaps, read back, are the reset chunks.
    let mut from_bitmaps = BTreeSet::new();
    for (name, bits) in runs[0]["dimensions"][0]["reset_chunks"].as_object().unwrap() {
        let (rx, rz) = anvil::parse_region_name(&format!("{name}.mca")).unwrap();
        let bits = bits.as_str().unwrap();
        assert_eq!(bits.len(), 256);
        for slot in 0..1024usize {
            let byte = u8::from_str_radix(&bits[slot / 8 * 2..slot / 8 * 2 + 2], 16).unwrap();
            if byte & (0x80 >> (slot % 8)) != 0 {
                from_bitmaps.insert((rx * 32 + (slot % 32) as i32, rz * 32 + (slot / 32) as i32));
            }
        }
    }
    let reset: BTreeSet<ChunkPos> = images.keys().map(|(_, pos)| *pos).filter(|pos| !kept().contains(pos)).collect();
    assert_eq!(from_bitmaps, reset);
    assert_eq!(reset.len(), 431);

    // The backup it stood on: pinned, verified, of the world as it was.
    let manifest: serde_json::Value = serde_json::from_slice(&fs::read(sv.root.join("backups").join("backups.json")).unwrap()).unwrap();
    assert_eq!(manifest["backups"][0]["file"], report.backup_file.as_str());
    assert_eq!(manifest["backups"][0]["kind"], "manual");
    assert_eq!(manifest["backups"][0]["world_fingerprint"], fingerprint.as_str());
    assert_eq!(manifest["backups"][0]["sha256"], report.backup_sha256.as_str());
    assert_eq!(manifest["backups"][0]["trigger"], format!("pre-regen {}", &hash[..8]).as_str());

    // The holding folder: everything that left, as it was, with the plan.
    let held = sv.holding();
    let record = held.record.clone().unwrap();
    assert_eq!((record.state.as_str(), record.plan_hash.as_str()), ("complete", hash.as_str()));
    assert_eq!((record.chunks_reset, record.chunks_kept), (431, 17));
    assert_eq!(record.files.len(), moved.len() + rewritten.len());
    assert_eq!(record.end_fingerprint, backup::world_fingerprint(&sv.cfg).unwrap());
    for name in moved.iter().chain(rewritten.iter()) {
        let rel = format!("testworld/{name}");
        let entry = record.files.iter().find(|f| f.rel == rel).unwrap_or_else(|| panic!("{rel} is not on the holding record"));
        assert_eq!(entry.sha256, sha256_bytes(&before[*name]), "{rel}");
        assert_eq!(fs::read(under(&held.dir.join(HELD_FILES_DIR), &rel).unwrap()).unwrap(), before[*name], "{rel}");
    }
    assert!(held.dir.join(PLAN_FILE).is_file());
    assert!(held.bytes > 0);

    // The log leaves the box: no name, and nothing of the player but the start of a file name.
    let log = sv.log();
    assert!(log.contains("done: scope all: 431 chunk(s) reset, 17 kept"), "{log}");
    assert!(!log.contains(PLAYER_NAME) && !log.contains(PLAYER), "{log}");

    // A finished run is not run again from the same approval: the plan is no
    // longer what the world gives.
    match sv.run(&run_dir, &hash) {
        Outcome::PlanChanged(p) => assert_eq!((p.added, p.removed, p.targets), (0, 431, 0)),
        other => panic!("{}", other.line()),
    }

    // Rolling back: every file is where it was, as it was, and the world's
    // fingerprint is the one the backup was taken of.
    assert!(rollback(&sv.cfg, &held.dir, "00000000", "test").unwrap_err().contains("approval"));
    let said = rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap();
    assert!(said.contains("14 file(s) put back"), "{said}");
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.chunk_images(), images);
    assert_eq!(backup::world_fingerprint(&sv.cfg).unwrap(), fingerprint);
    assert!(!sv.root.join(MARKER_FILE).exists());
    assert_eq!(sv.holding().record.unwrap().state, "rolled-back");
    assert!(rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap_err().contains("already undone"));

    // And the same plan can be carried out again, on the backup already taken.
    let again = done(sv.run(&run_dir, &hash));
    assert!(again.backup_reused);
    assert_eq!(again.backup_file, report.backup_file);
    assert_eq!(sv.manual_backups(), 1);
    assert_eq!(sv.chunk_images(), stay);
    // Once the world has moved on, the holding folder no longer undoes it exactly.
    fs::write(world.join("level.dat_old"), b"a server ran").unwrap();
    let held = sv.holding();
    let why = rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap_err();
    assert!(why.contains("has changed since") && why.contains(&report.backup_file), "{why}");
    assert_eq!(sv.chunk_images(), stay);
}

#[test]
fn nothing_runs_without_the_typed_hash_of_the_plan() {
    let sv = Server::new();
    let before = sv.snapshot();
    let (run_dir, hash) = sv.dry_run("scope=all");
    for typed in ["", "yes", "regenerate", &hash[..7], &hash[1..9], &hash[..16], "ZZZZZZZZ"] {
        let outcome = execute(&sv.cfg, &Approval { typed: typed.to_string(), ..sv.approval(&run_dir, &hash) });
        assert!(refused(outcome).contains("approval"), "typed '{typed}'");
    }
    assert!(approves(&hash[..8].to_ascii_uppercase(), &hash) && approves(&format!("  {}\n", &hash[..8]), &hash));
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.manual_backups(), 0);
    assert!(holdings(&sv.root).is_empty());

    // A plan that was edited is not a plan: its hash no longer covers its chunks.
    let plan_path = run_dir.join(PLAN_FILE);
    let text = fs::read_to_string(&plan_path).unwrap();
    assert!(text.contains("[5,5],"));
    fs::write(&plan_path, text.replace("[5,5],", "[12,12],")).unwrap();
    assert!(load_plan(&run_dir).unwrap_err().contains("not the hash of the chunks"));
    assert!(refused(sv.run(&run_dir, &hash)).contains("not the hash of the chunks"));
    fs::write(&plan_path, text.replace("icraft-regen-plan", "something-else")).unwrap();
    assert!(load_plan(&run_dir).is_err());
    fs::remove_file(&plan_path).unwrap();
    assert!(load_plan(&run_dir).is_err());

    // Pregeneration afterwards cannot be asked for in this build.
    let (run_dir, hash) = sv.dry_run("scope=all");
    assert!(!PREGEN_REARM_AVAILABLE);
    let why = refused(execute(&sv.cfg, &Approval { pregen: Pregen::Rearm, ..sv.approval(&run_dir, &hash) }));
    assert!(why.contains("not available in this build"), "{why}");
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.manual_backups(), 0);
}

#[test]
fn a_world_that_changed_since_the_dry_run_is_shown_and_not_touched() {
    let sv = Server::new();
    let (run_dir, hash) = sv.dry_run("scope=all");
    // The server ran once more before it was stopped: two chunks are new, and
    // somebody stayed long enough in a third for it to be kept now.
    write_region(&sv.world(), Store::Region, 7, 7, &[((230, 230), 0), ((231, 230), 0)]);
    let mut grid: Vec<(ChunkPos, i64)> = Vec::new();
    for x in 0..=20 {
        for z in 0..=20 {
            let ticks = match (x, z) {
                (12, 12) => 100_000,
                (15, 15) | (3, 9) => 12_000,
                _ => 0,
            };
            grid.push(((x, z), ticks));
        }
    }
    write_region(&sv.world(), Store::Region, 0, 0, &grid);
    let before = sv.snapshot();

    let changed = match sv.run(&run_dir, &hash) {
        Outcome::PlanChanged(p) => *p,
        other => panic!("{}", other.line()),
    };
    assert!(!changed.same_plan && !changed.ready());
    assert_eq!((changed.added, changed.removed), (2, 1));
    assert_eq!(changed.added_sample, vec!["minecraft:overworld (230, 230)", "minecraft:overworld (231, 230)"]);
    assert_eq!(changed.removed_sample, vec!["minecraft:overworld (3, 9)"]);
    assert_eq!(changed.approved_hash, hash);
    assert_ne!(changed.current_hash, hash);
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.manual_backups(), 0);
    assert!(holdings(&sv.root).is_empty());

    // The fresh dry-run it wrote is the plan as it is now; that one can be approved.
    let fresh = sv.root.join(crate::regen::REPORTS_DIR).join(changed.new_run.clone().unwrap());
    let plan = load_plan(&fresh).unwrap();
    assert_eq!(plan.hash, changed.current_hash);
    assert!(refused(sv.run(&fresh, &hash)).contains("approval")); // not with the old approval
    let report = done(sv.run(&fresh, &plan.hash));
    assert_eq!((report.chunks_reset, report.chunks_kept), (432, 18));
    // The preflight says the same thing about the old dry-run, without running.
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(!look.same_plan && look.new_run.is_some());
}

#[test]
fn what_the_run_cannot_answer_for_refuses_it() {
    let sv = Server::new();
    let world = sv.world();

    // A player who logged out in a chunk that is to be reset. The logout layer keeps
    // that chunk and the 3x3 around it by default (G5); with the layer off, this
    // refusal is the backstop.
    write_player(&world, PLAYER, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (88.5, 64.0, 90.5)), &[]));
    let before = sv.snapshot();
    let (run_dir, _) = sv.dry_run("scope=all");
    assert!(preflight(&sv.cfg, &run_dir).unwrap().ready(), "the logout layer keeps chunk (5, 5)");
    assert!(!load_plan(&run_dir).unwrap().chunks[OVERWORLD].contains(&(5, 5)));
    let (run_dir, hash) = sv.dry_run("scope=all logout_radius=off");
    let why = refused(sv.run(&run_dir, &hash));
    assert!(why.contains("Player file #1 (playerdata/0e0c6371...) logged out in chunk (5, 5)"), "{why}");
    assert!(!why.contains(PLAYER_NAME) && !why.contains(PLAYER), "{why}");
    assert!(!sv.log().contains(PLAYER_NAME) && !sv.log().contains(PLAYER));
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.same_plan && !look.ready());
    assert_eq!(look.stops().len(), 1);
    // Keeping the chunk settles it.
    let (run_dir, hash) = sv.dry_run("scope=all logout_radius=off protect=5,5");
    assert!(preflight(&sv.cfg, &run_dir).unwrap().ready());
    write_player(&world, PLAYER, &player_nbt(Some((OVERWORLD, (200, 64, 200))), (OVERWORLD, (200.5, 64.0, 200.5)), &[]));
    let _ = (run_dir, hash);

    // A claim in the target set (the claims layer switched off).
    write_claims(&world, PLAYER, PLAYER_NAME, &[(OVERWORLD, false, &[(6, 6)])]);
    let (run_dir, hash) = sv.dry_run("scope=all claims=off");
    assert!(refused(sv.run(&run_dir, &hash)).contains("1 claimed chunk(s)"));
    let (run_dir, hash) = sv.dry_run("scope=all");
    assert!(preflight(&sv.cfg, &run_dir).unwrap().ready(), "with the layer on the claim is kept");

    // A Chunky task that would resume by itself.
    let tasks = sv.root.join("config").join("chunky").join("tasks").join("minecraft");
    fs::create_dir_all(&tasks).unwrap();
    fs::write(tasks.join("overworld.properties"), "world=minecraft:overworld\ncancelled=false\nradius=2500.0\n").unwrap();
    let why = refused(sv.run(&run_dir, &hash));
    assert!(why.contains("Chunky has an unfinished pregeneration task (config/chunky/tasks/minecraft/overworld.properties)"), "{why}");
    fs::write(tasks.join("overworld.properties"), "world=minecraft:overworld\ncancelled=true\nradius=2500.0\n").unwrap();
    assert!(preflight(&sv.cfg, &run_dir).unwrap().ready());

    // The pack's first-load pregeneration, not yet run on this world.
    let script = sv.root.join("kubejs").join("server_scripts").join("pregen");
    fs::create_dir_all(&script).unwrap();
    fs::write(script.join("auto_chunky.js"), "// the pack's script").unwrap();
    let why = refused(sv.run(&run_dir, &hash));
    assert!(why.contains("first-load pregeneration has not run"), "{why}");
    write_gz(&world.join(KUBEJS_DATA), &compound(vec![(PREGEN_FLAG, Value::Byte(0))]));
    let (run_dir, hash) = sv.dry_run("scope=all");
    assert!(refused(sv.run(&run_dir, &hash)).contains("first-load pregeneration has not run"));
    write_gz(&world.join(KUBEJS_DATA), &compound(vec![(PREGEN_FLAG, Value::Byte(1))]));
    let (run_dir, _) = sv.dry_run("scope=all");
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.ready(), "{:?}", look.stops());
    assert!(look.lines.iter().any(|l| l.mark == Mark::Ok && l.text.starts_with("Pregeneration: off")));

    // A store that does not read stops it before anything is touched.
    let ore = world.join("data").join("large_ore_deposits.dat");
    let good = fs::read(&ore).unwrap();
    fs::write(&ore, b"\x1f\x8b\x08 torn").unwrap();
    let (run_dir, hash) = sv.dry_run("scope=all");
    assert!(refused(sv.run(&run_dir, &hash)).contains("Mod data could not be read"));
    fs::write(&ore, &good).unwrap();

    // A player file that does not read, .dat_old included: the dry-run finishes (with a
    // warning), and the run is refused, by file number and naming no one.
    let file = world.join("playerdata").join(format!("{PLAYER}.dat"));
    let good = fs::read(&file).unwrap();
    fs::write(&file, b"\x1f\x8b\x08 torn").unwrap();
    let (run_dir, hash) = sv.dry_run("scope=all");
    let why = refused(sv.run(&run_dir, &hash));
    assert!(why.contains("Player file #1 of 1 in playerdata/ (sorted by file name) does not read"), "{why}");
    assert!(!why.contains(&PLAYER[..8]) && !why.contains(PLAYER_NAME), "{why}");
    assert!(!sv.log().contains(PLAYER) && !sv.log().contains(PLAYER_NAME));
    fs::write(&file, &good).unwrap();

    // A plan that resets nothing.
    let (run_dir, hash) = sv.dry_run("scope=report");
    assert!(refused(sv.run(&run_dir, &hash)).contains("regenerates no chunk"));

    // An earlier run left unfinished.
    let (run_dir, hash) = sv.dry_run("scope=all");
    fs::write(sv.root.join(MARKER_FILE), "started_unix=1\n").unwrap();
    assert!(refused(sv.run(&run_dir, &hash)).contains("left unfinished"));
    assert!(!preflight(&sv.cfg, &run_dir).unwrap().ready());
    fs::remove_file(sv.root.join(MARKER_FILE)).unwrap();

    // Through all of that nothing in the world moved, and no backup or holding folder was made.
    let now = sv.snapshot();
    for (name, bytes) in &before {
        if name.starts_with("playerdata/") {
            continue;
        }
        assert_eq!(now.get(name), Some(bytes), "{name}");
    }
    assert_eq!(sv.manual_backups(), 0);
    assert!(holdings(&sv.root).is_empty());
    // With every one of them settled, it runs.
    assert_eq!(done(sv.run(&run_dir, &hash)).chunks_reset, 430); // (6,6) is claimed, and kept
}

#[test]
fn a_failure_half_way_puts_everything_back() {
    let sv = Server::new();
    // A store file cannot be replaced: its temp name is taken by a folder. By
    // then the region files are rewritten and moved.
    let in_the_way = sv.world().join("data").join(format!("waystones.dat{}", anvil::REPLACE_SUFFIX));
    fs::create_dir_all(&in_the_way).unwrap();
    let before = sv.snapshot();
    let images = sv.chunk_images();
    let fingerprint = backup::world_fingerprint(&sv.cfg).unwrap();
    let (run_dir, hash) = sv.dry_run("scope=all");

    let (why, restored, holding) = match sv.run(&run_dir, &hash) {
        Outcome::Failed { why, restored, holding } => (why, restored, holding),
        other => panic!("{}", other.line()),
    };
    assert!(why.contains("waystones.dat") && why.contains("could not be rewritten"), "{why}");
    assert_eq!(restored, Ok(()));
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.chunk_images(), images);
    assert_eq!(backup::world_fingerprint(&sv.cfg).unwrap(), fingerprint);
    assert!(!sv.root.join(MARKER_FILE).exists(), "everything is back, so the server may start");
    assert_eq!(start_guard(&sv.cfg), Ok(()));
    let record = load_holding(&holding).unwrap();
    assert_eq!(record.state, "failed");
    assert!(record.note.contains("put back and checked"), "{}", record.note);
    assert_eq!(sv.manual_backups(), 1); // the backup was taken, and stays
    let log = sv.log();
    assert!(log.contains("FAILED") && log.contains("The world is as it was"), "{log}");

    // With the obstacle gone the same approval carries the plan out.
    fs::remove_dir_all(&in_the_way).unwrap();
    assert_eq!(done(sv.run(&run_dir, &hash)).chunks_reset, 431);
}

#[test]
fn a_run_that_was_cut_off_keeps_the_server_down_until_it_is_rolled_back() {
    let sv = Server::new();
    let before = sv.snapshot();
    let (run_dir, hash) = sv.dry_run("scope=all");
    done(sv.run(&run_dir, &hash));
    // As the launcher would have left things had it died before the end: the
    // record still says "started", the marker is there.
    let held = sv.holding();
    let mut record = held.record.clone().unwrap();
    record.state = "started".to_string();
    record.end_fingerprint.clear();
    save_holding(&held.dir, &record).unwrap();
    fs::write(sv.root.join(MARKER_FILE), "started_unix=1\n").unwrap();
    // A server "ran" meanwhile is not the case here, but the world's files
    // need not match any fingerprint for an unfinished run to be undone.
    fs::write(sv.world().join("data").join("raids.dat"), b"written by nobody").unwrap();

    let why = start_guard(&sv.cfg).unwrap_err();
    assert!(why.contains("left unfinished"), "{why}");
    let refused_file = fs::read_to_string(sv.root.join(crate::overrides::REFUSED_FILE)).unwrap();
    assert!(refused_file.contains("why=a world regeneration was left unfinished"), "{refused_file}");

    let said = rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap();
    assert!(said.contains("rolled back"), "{said}");
    assert_eq!(start_guard(&sv.cfg), Ok(()));
    let mut now = sv.snapshot();
    assert_eq!(now.remove("data/raids.dat").as_deref(), Some(&b"written by nobody"[..]));
    assert_eq!(now, before);
}

#[test]
fn a_ring_touches_only_its_ring() {
    let sv = Server::new();
    let images = sv.chunk_images();
    // Three chunks around the bed chunk (12,12): 7x7 = 49, minus the 3x3 bed
    // area and the lived-in (15,15).
    let (run_dir, hash) = sv.dry_run("scope=ring:3");
    let report = done(sv.run(&run_dir, &hash));
    assert_eq!((report.chunks_reset, report.chunks_kept), (39, 409));
    assert_eq!((report.files_moved, report.files_rewritten, report.external_moved), ([0, 0, 0], [1, 0, 0], 0));
    // No store lists anything in the ring: none is rewritten.
    assert!(report.stores.is_empty(), "{:?}", report.stores);
    let after = sv.chunk_images();
    assert_eq!(images.len() - after.len(), 39);
    for (key, image) in &after {
        assert_eq!(Some(image), images.get(key), "{key:?}");
    }
    for ((store, pos), _) in &images {
        let in_ring = (pos.0 - 12).abs().max((pos.1 - 12).abs()) <= 3;
        let reset = *store == "region" && in_ring && !kept().contains(pos);
        assert_eq!(after.contains_key(&(*store, *pos)), !reset, "{store} {pos:?}");
    }
    let record = sv.holding().record.unwrap();
    let rels: Vec<&str> = record.files.iter().map(|f| f.rel.as_str()).collect();
    assert_eq!(rels, vec!["testworld/region/r.0.0.mca", "testworld/.icraft_world.json"]);
}

#[test]
fn the_command_line_runs_only_on_a_marked_scratch_copy() {
    let sv = Server::new();
    // No marker: this could be a live server.
    assert!(sandbox_check(&sv.cfg).unwrap_err().contains(SANDBOX_FILE));
    // A marker that came along with a copied folder names the folder it was written for.
    let other = Server::new();
    fs::write(sv.root.join(SANDBOX_FILE), format!("{}\n", other.root.display())).unwrap();
    assert!(sandbox_check(&sv.cfg).unwrap_err().contains("is not this folder"));
    fs::write(sv.root.join(SANDBOX_FILE), "\n").unwrap();
    assert!(sandbox_check(&sv.cfg).is_err());
    // Written for this folder: accepted, and it says how it told.
    fs::write(sv.root.join(SANDBOX_FILE), format!("\u{feff}{}\r\n", sv.root.display())).unwrap();
    assert!(sandbox_check(&sv.cfg).unwrap().contains("names this folder"));
    // But not while a launcher is serving the folder, whatever the marker says.
    fs::write(sv.root.join(".icraft_launcher_status"), "written_unix=1\n").unwrap();
    assert!(sandbox_check(&sv.cfg).unwrap_err().contains("is being served"));
}

// =============================================================================
// The fidelity harness, wired into the run (regen/fidelity.rs)
// =============================================================================

/// A chunk written at the end of a region file, its header entry pointing at
/// it: what a server does when it saves a chunk that no longer fits, or
/// generates one.
fn put_chunk(bytes: &mut Vec<u8>, pos: ChunkPos, data: &[u8]) {
    let sector = anvil::SECTOR_BYTES;
    let offset = bytes.len().div_ceil(sector);
    bytes.resize(offset * sector, 0);
    bytes.extend_from_slice(&(data.len() as u32 + 1).to_be_bytes());
    bytes.push(2);
    bytes.extend_from_slice(data);
    bytes.resize(bytes.len().div_ceil(sector) * sector, 0);
    let count = bytes.len() / sector - offset;
    let at = usize::from(anvil::slot_index(pos)) * 4;
    bytes[at..at + 4].copy_from_slice(&(((offset as u32) << 8) | count as u32).to_be_bytes());
}

fn harness_check(record: &fidelity::Record, id: &str) -> fidelity::Check {
    record.verdict.checks.iter().find(|c| c.id == id).cloned().unwrap_or_else(|| panic!("no {id} in the verdict"))
}

#[test]
fn the_fidelity_harness_holds_on_a_run_and_keeps_its_verdict() {
    let sv = Server::new();
    let (run_dir, hash) = sv.dry_run("scope=all");

    // The check of the plan runs the harness's self-test and its record, and says so.
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.ready(), "{:?}", look.stops());
    let ok = |needle: &str| look.lines.iter().any(|l| l.mark == Mark::Ok && l.text.contains(needle));
    assert!(
        ok("Fidelity harness self-test: 15 of 15 planted violation(s) caught on a fixture with one real region file of this world; with nothing planted it holds"),
        "{:#?}",
        look.lines
    );
    assert!(ok("Fidelity harness, before the changes:") && ok("F3 0 of 431 planned chunk(s) protected"), "{:#?}", look.lines);

    let report = done(sv.run(&run_dir, &hash));
    let line = report.fidelity.clone();
    assert!(line.starts_with("fidelity harness HOLDS: F1 17 / 1 / 1 kept chunk record(s) identical (region / entities / poi)"), "{line}");
    for part in ["F2 430 / 2 / 1 reset chunk record(s) gone", "F3 0 of 431 planned chunk(s) protected", "F4 0 new defect(s)", "F6 4 of 4 store(s) exact", "F7 15 of 15 planted violation(s) caught", "F10 the plan makes no world edit"] {
        assert!(line.contains(part), "{part} -- {line}");
    }
    assert!(report.line().contains(&line));
    let log = sv.log();
    assert!(log.contains("fidelity harness HOLDS") && log.contains("fidelity harness self-test: 15 of 15"), "{log}");
    assert!(!log.contains(PLAYER_NAME) && !log.contains(PLAYER));

    // The verdict, in the holding folder, check by check.
    let held = sv.holding();
    let record = fidelity::load(&held.dir).expect("fidelity.json in the holding folder");
    assert!(record.verdict.holds());
    assert_eq!(record.verdict.plan_hash, hash);
    assert_eq!(record.plan_author, "operator (dry-run)");
    let states: Vec<(String, String)> = record.verdict.checks.iter().map(|c| (c.id.clone(), c.state.clone())).collect();
    let want: Vec<(String, String)> = [("F1", "holds"), ("F2", "holds"), ("F3", "holds"), ("F4", "holds"), ("F5", "holds"), ("F6", "holds"), ("F10", "holds"), ("F7", "holds"), ("F8", "pending"), ("F9", "CI")]
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
    assert_eq!(states, want);
    let f6 = harness_check(&record, "F6");
    for store in [
        "data/waystones.dat: 2 of 3 waystone entries removed",
        "data/large_ore_deposits.dat: 2 of 3 deposit records removed",
        "data/mca_villages.dat: 1 of 3 village records removed",
        "data/mca_graveyard.dat: 2 of 3 grave chunk entries removed",
    ] {
        assert!(f6.counts.iter().any(|c| c.starts_with(store)), "{store}: {:?}", f6.counts);
    }
    assert_eq!(record.verdict.self_test.plants.len(), 15);
    assert!(record.verdict.self_test.plants.iter().all(|p| p.caught));
    assert!(record.verdict.self_test.real_file.starts_with("region/r.-1.-1.mca (2 chunks"), "{}", record.verdict.self_test.real_file);
    // Every chunk record that stayed, for the report after the first start.
    let kept = fs::read_to_string(held.dir.join("fidelity-kept.tsv")).unwrap();
    assert_eq!(kept.lines().filter(|l| !l.starts_with('#')).count(), 17 + 1 + 1);
    // The harness wrote nothing into the world: the rollback is as exact as before.
    assert!(rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap().contains("14 file(s) put back"));
}

#[test]
fn a_run_is_refused_when_the_harness_cannot_catch_a_planted_violation() {
    let sv = Server::new();
    let before = sv.snapshot();
    let (run_dir, hash) = sv.dry_run("scope=all");
    // The store check stubbed to "holds": the two plants in the stores get through.
    fidelity::blind_for_test(&["F6"]);
    let why = refused(sv.run(&run_dir, &hash));
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    fidelity::blind_for_test(&[]);
    assert!(why.contains("could not catch a planted violation"), "{why}");
    assert!(why.contains("not caught: a kept waystone removed from the store, a reset chunk's waystone left in the store"), "{why}");
    assert!(!look.ready() && look.stops().iter().any(|s| s.contains("cannot vouch for a run")), "{:?}", look.stops());
    // Nothing touched: no backup, no holding folder.
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.manual_backups(), 0);
    assert!(holdings(&sv.root).is_empty());
    // What it found is in the dry-run's folder.
    let record = fidelity::load(&run_dir).expect("fidelity.json in the dry-run's folder");
    assert!(!record.verdict.holds());
    let missed: Vec<&str> = record.verdict.self_test.plants.iter().filter(|p| !p.caught).map(|p| p.invariant.as_str()).collect();
    assert_eq!(missed, vec!["F6", "F6"]);
    assert_eq!(harness_check(&record, "F7").state, "FAIL");
    // The harness whole again: the same approval runs.
    assert!(done(sv.run(&run_dir, &hash)).fidelity.starts_with("fidelity harness HOLDS"));
}

#[test]
fn what_the_harness_finds_after_the_changes_puts_everything_back() {
    let sv = Server::new();
    let before = sv.snapshot();
    let images = sv.chunk_images();
    let (run_dir, hash) = sv.dry_run("scope=all");
    // After the run's own check, something writes the waystone store back as
    // it was: the run's check does not look again, the harness does.
    let original = fs::read(sv.world().join("data").join("waystones.dat")).unwrap();
    fidelity::TAMPER.with(|t| *t.borrow_mut() = Some(Box::new(move |world: &Path| fs::write(world.join("data").join("waystones.dat"), &original).unwrap())));
    let outcome = sv.run(&run_dir, &hash);
    fidelity::TAMPER.with(|t| *t.borrow_mut() = None);
    let (why, restored, holding) = match outcome {
        Outcome::Failed { why, restored, holding } => (why, restored, holding),
        other => panic!("{}", other.line()),
    };
    assert!(why.contains("fidelity harness FAIL") && why.contains("F6 3 of 4 store(s) exact, 1 finding(s)"), "{why}");
    assert_eq!(restored, Ok(()));
    assert_eq!(sv.snapshot(), before);
    assert_eq!(sv.chunk_images(), images);
    assert!(!sv.root.join(MARKER_FILE).exists());
    assert_eq!(load_holding(&holding).unwrap().state, "failed");
    let record = fidelity::load(&holding).unwrap();
    assert!(!record.verdict.holds());
    let f6 = harness_check(&record, "F6");
    assert_eq!(f6.state, "FAIL");
    assert!(
        f6.findings[0].starts_with("data/waystones.dat: not its original minus exactly the 2 waystone entries of reset chunks (expected 1 to stay, found 3)"),
        "{:?}",
        f6.findings
    );
    for id in ["F1", "F2", "F3", "F4", "F5"] {
        assert_eq!(harness_check(&record, id).state, "holds", "{id}");
    }
    assert!(sv.log().contains("fidelity harness FAIL"));
}

#[test]
fn the_plans_author_changes_nothing_about_the_gates() {
    let mut seen: Vec<(String, String)> = Vec::new();
    for author in ["operator", "model:claude-opus-5-5"] {
        let sv = Server::new();
        let (run_dir, hash) = sv.dry_run("scope=all");
        // A label in the plan file; the plan's hash does not cover it.
        let path = run_dir.join(PLAN_FILE);
        let mut plan: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        plan["author"] = serde_json::Value::String(author.to_string());
        fs::write(&path, serde_json::to_vec_pretty(&plan).unwrap()).unwrap();
        assert!(preflight(&sv.cfg, &run_dir).unwrap().ready());
        let report = done(sv.run(&run_dir, &hash));
        let record = fidelity::load(&sv.holding().dir).unwrap();
        assert_eq!(record.plan_author, author);
        seen.push((serde_json::to_string(&record.verdict).unwrap(), report.fidelity));
    }
    assert_eq!(seen[0].0, seen[1].0, "one plan under two labels: the verdicts are not byte-identical");
    assert_eq!(seen[0].1, seen[1].1);
}

#[test]
fn a_defect_already_in_a_region_file_is_reported_and_not_blamed_on_the_run() {
    let sv = Server::new();
    // r.4.4: (130,130) to be reset, and (131,130), which does not read: kept
    // (the unreadable layer), damaged before the run and after it.
    let region = sv.world().join("region");
    fs::write(region.join("r.4.4.mca"), region_bytes(4, 4, &[((130, 130), 2, chunk_nbt((130, 130), 0)), ((131, 130), 2, b"this is not zlib".to_vec())])).unwrap();
    let (run_dir, hash) = sv.dry_run("scope=all");
    let report = done(sv.run(&run_dir, &hash));
    assert!(report.fidelity.contains("F4 0 new defect(s)") && report.fidelity.contains("(1 already there before)"), "{}", report.fidelity);
    let record = fidelity::load(&sv.holding().dir).unwrap();
    let f4 = harness_check(&record, "F4");
    assert!(f4.counts.iter().any(|c| c == "1 defect(s) were already there before the run (not the run's)"), "{:?}", f4.counts);
}

#[test]
fn after_the_first_start_the_harness_reports_on_the_world() {
    let sv = Server::new();
    let (run_dir, hash) = sv.dry_run("scope=all");
    done(sv.run(&run_dir, &hash));
    // No server has run on it yet: nothing to say.
    assert_eq!(fidelity::after_first_start(&sv.cfg), None);
    // A server ran: it saved the bed chunk again, generated a reset position
    // next to the bed area, and wrote its level data.
    let world = sv.world();
    let path = world.join("region").join("r.0.0.mca");
    let mut bytes = fs::read(&path).unwrap();
    put_chunk(&mut bytes, (12, 12), &chunk_nbt((12, 12), 100_600));
    put_chunk(&mut bytes, (10, 12), &chunk_nbt((10, 12), 0));
    fs::write(&path, &bytes).unwrap();
    fs::write(world.join("level.dat_old"), b"a server ran").unwrap();
    let line = fidelity::after_first_start(&sv.cfg).expect("a report");
    assert!(line.contains("19 kept chunk record(s): 18 unchanged, 1 saved again by the server, 0 gone, 0 unreadable"), "{line}");
    assert!(line.contains("1 of 431 reset position(s) generated again"), "{line}");
    let report = fidelity::load_after_boot(&sv.holding().dir).unwrap();
    assert!(report.seam_sample.iter().any(|s| s.contains("kept (11, 12) parses, reset (10, 12) generated again and parses")), "{:?}", report.seam_sample);
    assert!(report.findings.is_empty(), "{:?}", report.findings);
    // Once per run.
    assert_eq!(fidelity::after_first_start(&sv.cfg), None);
}

// =============================================================================
// World edits: a new seed, the blending mark, the spawn search, a player who
// starts over (2026-10-25)
// =============================================================================

const PLAYER_TWO: &str = "5d2c8f0e-1a3b-3c4d-9e8f-7a6b5c4d3e2f";
const PLAYER_TWO_NAME: &str = "Player_Two";
const NEW_SEED: i64 = 20_261_025_000;
const OLD_SEED: i64 = 4_242_424_242_424_242_424;

fn tagged_chunk(pos: ChunkPos, inhabited: i64) -> Vec<u8> {
    crate::nbt::testing::zlib(&encode_ordered(&[
        ("xPos", Value::Int(pos.0)),
        ("InhabitedTime", Value::Long(inhabited)),
        ("sections", Value::List(vec![Value::LongArray(vec![0x0102_0304_0506_0708; 300])])),
        ("zPos", Value::Int(pos.1)),
        ("Status", Value::String("minecraft:full".to_string())),
        (edits::TECTONIC_TAG, Value::Int(1)),
    ]))
}

/// [`Server::new`], plus what the world edits touch: Tectonic's tag on every
/// chunk of `region/r.0.0`, `level.dat_old`, the spawn scripts' markers, the
/// pupfish chunk, two stronghold caches, and a second player who logged out
/// in chunk (4, 4) and starts over.
fn server_with_edits() -> Server {
    let sv = Server::new();
    let world = sv.world();
    let mut grid: Vec<(ChunkPos, u8, Vec<u8>)> = Vec::new();
    for x in 0..=20 {
        for z in 0..=20 {
            let ticks = match (x, z) {
                (12, 12) => 100_000,
                (15, 15) => 12_000,
                _ => 0,
            };
            grid.push(((x, z), 2, tagged_chunk((x, z), ticks)));
        }
    }
    fs::write(world.join("region").join("r.0.0.mca"), region_bytes(0, 0, &grid)).unwrap();
    fs::copy(world.join("level.dat"), world.join("level.dat_old")).unwrap();
    fs::write(
        world.join(edits::KUBEJS_DATA),
        gzip(&encode_ordered(&[
            ("icraft_priest_tower_done", Value::Int(1)),
            ("icraft_chunky_pregen_started", Value::Int(1)),
            (edits::LEVEL_DATA_KEY, compound(vec![("icraft_cherry_spawn_exhausted", Value::Int(1)), ("icraft_mobgriefing_default_set", Value::Int(1))])),
        ])),
    )
    .unwrap();
    let pupfish = compound(vec![("PupfishChunkX", Value::Int(3)), ("PupfishChunkZ", Value::Int(-9)), ("beachedCachalotSpawnDelay", Value::Int(1))]);
    fs::write(world.join("data").join("alexsmobs_world_data.dat"), gzip(&encode_ordered(&[("DataVersion", Value::Int(3465)), ("data", pupfish)]))).unwrap();
    let cache = gzip(&encode_ordered(&[("data", compound(vec![("Positions", Value::LongArray(vec![1, 2]))]))]));
    fs::write(world.join("data").join(edits::STRONGHOLD_CACHE), &cache).unwrap();
    let abyss = world.join("dimensions").join("theabyss").join("the_abyss").join("data");
    fs::create_dir_all(&abyss).unwrap();
    fs::write(abyss.join(edits::STRONGHOLD_CACHE), &cache).unwrap();
    let playerdata = world.join("playerdata");
    write_player(&world, PLAYER_TWO, &player_nbt(None, (OVERWORLD, (f64::from(mid(4)), 64.0, f64::from(mid(4)))), &[]));
    fs::copy(playerdata.join(format!("{PLAYER_TWO}.dat")), playerdata.join(format!("{PLAYER_TWO}.dat_old"))).unwrap();
    fs::write(playerdata.join(format!("{PLAYER_TWO}.cosarmor")), gzip(&encode_ordered(&[("CosArmor", Value::List(Vec::new()))]))).unwrap();
    let advancements = world.join("advancements");
    fs::create_dir_all(&advancements).unwrap();
    fs::write(advancements.join(format!("{PLAYER_TWO}.json")), "{}").unwrap();
    // Their quest progress beside another player's; a store that is not theirs to lose.
    let quests = compound(vec![(PLAYER_TWO, compound(vec![("first_blood", Value::Byte(1))])), (PLAYER, compound(vec![("codex_root", Value::Byte(1))]))]);
    fs::write(world.join("data").join("heracles_quest_progress.dat"), gzip(&encode_ordered(&[("DataVersion", Value::Int(3465)), ("data", quests)]))).unwrap();
    fs::write(world.join("data").join("TitaniumReward.dat"), gzip(&encode_ordered(&[("data", compound(vec![("ConfiguredPlayers", compound(vec![(PLAYER_TWO, Value::Int(1))]))]))]))).unwrap();
    let cache_json = format!("[{{\"name\":\"{PLAYER_NAME}\",\"uuid\":\"{PLAYER}\"}},{{\"name\":\"{PLAYER_TWO_NAME}\",\"uuid\":\"{PLAYER_TWO}\"}}]");
    fs::write(sv.root.join("usercache.json"), cache_json).unwrap();
    sv
}

fn tree(path: &Path) -> nbt::Doc {
    nbt::Doc::parse(&fs::read(path).unwrap()).unwrap()
}

const EDITS: &str = "scope=all new_seed=20261025000 blend=on spawn_search=on reset_players=Player_Two";

#[test]
fn a_new_seed_run_makes_every_edit_and_a_rollback_undoes_every_one() {
    let sv = server_with_edits();
    let world = sv.world();
    let before = sv.snapshot();
    let (run_dir, hash) = sv.dry_run(EDITS);

    // The plan records the edits, and its hash covers them.
    let plan = load_plan(&run_dir).unwrap();
    assert_eq!(plan.edits.new_seed, Some(NEW_SEED));
    assert_eq!(plan.edits.seed_before, Some(OLD_SEED));
    assert_eq!(plan.edits.reset_players, vec![PLAYER_TWO.to_string()]);
    assert_eq!(plan.seed, Some(OLD_SEED));
    let mut v: serde_json::Value = serde_json::from_slice(&fs::read(run_dir.join(PLAN_FILE)).unwrap()).unwrap();
    v["world_edits"]["spawn_search"] = serde_json::Value::Bool(false);
    let edited = std::env::temp_dir().join(format!("icraft-exec-edited-{}-{}", std::process::id(), NEXT_DIR.fetch_add(1, Ordering::SeqCst)));
    fs::create_dir_all(&edited).unwrap();
    fs::write(edited.join(PLAN_FILE), serde_json::to_vec(&v).unwrap()).unwrap();
    assert!(load_plan(&edited).unwrap_err().contains("plan_hash is not the hash"), "an edit taken out of the plan file changes its hash");
    let _ = fs::remove_dir_all(&edited);
    // The player who starts over logged out in (4, 4): it is reset, and nothing stops on it.
    assert!(plan.chunks[OVERWORLD].contains(&(4, 4)));
    let report = fs::read_to_string(run_dir.join("report.txt")).unwrap();
    assert!(report.contains("WORLD EDITS") && report.contains(&format!("NEW SEED {NEW_SEED}")) && report.contains("STARTS OVER: Player_Two"), "{report}");
    assert!(report.contains("NOT moved") && report.contains("data/TitaniumReward.dat (holds their UUID)") && !report.contains("advancements/5d2c8f0e..."), "{report}");

    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.ready(), "{:?}", look.stops());
    let note = |needle: &str| look.lines.iter().any(|l| l.text.contains(needle));
    assert!(note("Worldgen: this plan changes the seed") && note("ModernFix: 2 stronghold cache file(s)") && note("Blending:"), "{:#?}", look.lines);

    let done_report = done(sv.run(&run_dir, &hash));
    let kept_in_file: usize = anvil::header_slots(&fs::read(world.join("region").join("r.0.0.mca")).unwrap()).len();
    let marked = format!("{kept_in_file} kept chunk(s) marked for blending");
    for part in ["seed changed", "2 stronghold cache(s) moved", "1 spawn marker(s) removed", "4 player file(s) of 1 player(s) moved", "data/heracles_quest_progress.dat: 1 entry(ies) removed", marked.as_str()] {
        assert!(done_report.edits.iter().any(|e| e == part), "{part}: {:?}", done_report.edits);
    }
    assert!(done_report.fidelity.contains(&format!("F10 11 edited file(s) exact, {kept_in_file} chunk(s) marked for blending")), "{}", done_report.fidelity);

    // level.dat and its copy: the new seed, the spawn's height, nothing else.
    for name in ["level.dat", "level.dat_old"] {
        let doc = tree(&world.join(name));
        assert_eq!(doc.root.at(&["Data", "WorldGenSettings", "seed"]), Some(&nbt::Node::Long(NEW_SEED)), "{name}");
        assert_eq!(doc.root.at(&["Data", "SpawnY"]), Some(&nbt::Node::Int(edits::SPAWN_SEARCH_Y)), "{name}");
        assert_eq!(doc.root.at(&["Data", "SpawnX"]), Some(&nbt::Node::Int(0)), "{name}");
    }
    let kubejs = tree(&world.join(edits::KUBEJS_DATA));
    assert!(kubejs.root.get("icraft_priest_tower_done").is_some(), "the tower stays done: no tower at the new spawn");
    assert!(kubejs.root.get("icraft_chunky_pregen_started").is_some());
    assert!(kubejs.root.at(&[edits::LEVEL_DATA_KEY, "icraft_cherry_spawn_exhausted"]).is_none());
    assert!(kubejs.root.at(&[edits::LEVEL_DATA_KEY, "icraft_mobgriefing_default_set"]).is_some());
    let am = tree(&world.join("data").join("alexsmobs_world_data.dat"));
    assert!(am.root.at(&["data", "PupfishChunkX"]).is_none() && am.root.at(&["data", "beachedCachalotSpawnDelay"]).is_some());
    assert!(!world.join("data").join(edits::STRONGHOLD_CACHE).exists());
    assert!(!world.join("dimensions/theabyss/the_abyss/data").join(edits::STRONGHOLD_CACHE).exists());
    assert!(edits::player_files(&world, PLAYER_TWO).is_empty());
    assert!(world.join("playerdata").join(format!("{PLAYER}.dat")).is_file(), "the other player's file stays");
    assert!(!world.join("advancements").join(format!("{PLAYER_TWO}.json")).exists(), "their advancements leave with them");
    let quests = tree(&world.join("data").join("heracles_quest_progress.dat"));
    assert!(quests.root.at(&["data", PLAYER_TWO]).is_none() && quests.root.at(&["data", PLAYER]).is_some(), "their quests go, the other player's stay");
    assert!(world.join("data").join("TitaniumReward.dat").is_file());
    // Every kept chunk of r.0.0 carries the old-chunk mark now.
    let file = fs::read(world.join("region").join("r.0.0.mca")).unwrap();
    for slot in anvil::header_slots(&file) {
        let start = slot.offset_sectors as usize * anvil::SECTOR_BYTES;
        let len = u32::from_be_bytes(file[start..start + 4].try_into().unwrap()) as usize;
        let doc = nbt::Doc::parse(&file[start + 5..start + 4 + len]).unwrap();
        assert_eq!(doc.root.get(edits::TECTONIC_TAG), Some(&nbt::Node::Int(edits::TECTONIC_OLD)));
    }
    // The world's record: the run, the seed it came back under, the seed change.
    let record: serde_json::Value = serde_json::from_slice(&fs::read(world.join(crate::overrides::WORLD_MANIFEST)).unwrap()).unwrap();
    assert_eq!(record["regenerations"].as_array().unwrap().last().unwrap()["seed"], NEW_SEED.to_string());
    let change = &record[SEED_RECORD_KEY][0];
    assert_eq!(change["before"].as_str(), Some(OLD_SEED.to_string().as_str()));
    assert_eq!(change["after"].as_str(), Some(NEW_SEED.to_string().as_str()));
    assert_eq!(change["plan_hash"].as_str(), Some(hash.as_str()));
    assert_eq!(record["custom"], "kept");
    // The log names no player and gives no seed.
    let log = sv.log();
    for secret in [PLAYER_TWO.to_string(), PLAYER_TWO_NAME.to_string(), NEW_SEED.to_string(), OLD_SEED.to_string()] {
        assert!(!log.contains(&secret), "{secret} in the log: {log}");
    }
    // F8 reports the blending once a server has run on it (here: at once).
    let held = sv.holding();
    let line = fidelity::write_after_boot(&world, &held.dir);
    // All 17 kept overworld chunks are old to Tectonic: r.0.0's marked, the two
    // elsewhere never tagged. None has blending data saved: no server read them.
    assert!(line.contains("blending: 17 of 17 kept overworld chunk(s) still old to Tectonic (0 with blending data saved)"), "{line}");
    let _ = fs::remove_file(held.dir.join(fidelity::AFTER_BOOT_FILE));

    // The way back: every edit undone, every byte as it was.
    rollback(&sv.cfg, &held.dir, &hash[..8], "test").unwrap();
    assert_eq!(sv.snapshot(), before, "the rollback put the world back exactly");
}

#[test]
fn a_plan_made_under_another_seed_is_refused() {
    let sv = Server::new();
    let (run_dir, hash) = sv.dry_run("scope=all");
    // The seed changed by hand after the dry-run.
    let mut doc = tree(&sv.world().join("level.dat"));
    *doc.root.at_mut(&["Data", "WorldGenSettings", "seed"]).unwrap() = nbt::Node::Long(7);
    fs::write(sv.world().join("level.dat"), doc.to_bytes().unwrap()).unwrap();
    let look = preflight(&sv.cfg, &run_dir).unwrap();
    assert!(look.stops().iter().any(|s| s.contains("not the one this plan was made under")), "{:?}", look.stops());
    assert!(refused(sv.run(&run_dir, &hash)).contains("not the one this plan was made under"));
}

#[test]
fn a_new_seed_needs_scope_all_and_blending_needs_a_new_seed() {
    let sv = server_with_edits();
    let refusal = |tokens: &str| {
        let mut spec = RunSpec::parse_tokens(tokens.split_whitespace()).unwrap();
        spec.set("spawn_radius_blocks", "16").unwrap();
        crate::regen::run(&sv.cfg, &spec).unwrap_err()
    };
    assert!(refusal("scope=ring:2 new_seed=5").contains("only a plan with scope 'all' may change the seed"));
    assert!(refusal("scope=all blend=on").contains("blending mark is for a new seed"));
    assert!(refusal(&format!("scope=all new_seed={OLD_SEED}")).contains("that is the world's seed already"));
    assert!(refusal("scope=all reset_players=Nobody").contains("'Nobody' is no player of this world"));
    assert!(refusal("scope=all reset_players=Player_One logout_players=Player_One").contains("starts over (reset_players) and is on logout_players too"));
    // What the log is told of a run: no seed, no player.
    let spec = RunSpec::parse_tokens(EDITS.split_whitespace()).unwrap();
    assert_eq!(spec.log_text(), "scope=all dims=minecraft:overworld new_seed=<a number> blend=on spawn_search=on reset_players=<1 player(s)>");
    // A random seed is drawn once, by the dry-run, and recorded.
    let (run_dir, _) = sv.dry_run("scope=all new_seed=random");
    let plan = load_plan(&run_dir).unwrap();
    assert!(plan.edits.new_seed.is_some() && plan.edits.new_seed != plan.seed);
}
