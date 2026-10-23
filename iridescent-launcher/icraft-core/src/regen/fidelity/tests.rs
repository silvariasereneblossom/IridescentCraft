//! The harness on its own: its reader, its self-test, and a self-test that
//! must fail when a check is stubbed to "holds". The harness wired into a run
//! is tested with the run (`regen/exec/tests.rs`).

use super::*;
use crate::anvil::testing::write_region;
use crate::anvil::Store;
use crate::worlddata::testing::write_level;

static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

struct TempWorld(PathBuf);

impl TempWorld {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("icraft-fidelity-test-{}-{}", std::process::id(), NEXT_DIR.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        write_level(&dir, (0, 64, 0));
        TempWorld(dir)
    }
}

impl Drop for TempWorld {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn plan_of(chunks: &[ChunkPos]) -> Plan {
    let mut by_dim = BTreeMap::new();
    by_dim.insert(OVERWORLD.to_string(), chunks.iter().copied().collect::<BTreeSet<ChunkPos>>());
    Plan { hash: "0".repeat(64), settings: Settings::default(), chunks: by_dim, author: "test".to_string() }
}

fn said(test: &SelfTest) -> String {
    let mut out = format!("control: {}\nreal: {}\nerror: {}\n", test.control, test.real_file, test.error);
    for p in &test.plants {
        out.push_str(&format!("{} ({}): caught={} said: {}\n", p.name, p.invariant, p.caught, p.said));
    }
    out
}

#[test]
fn the_self_test_catches_every_plant_on_a_synthetic_fixture() {
    let w = TempWorld::new();
    let test = self_test(&w.0, &plan_of(&[(0, 0)]));
    assert!(test.passed(), "{}", said(&test));
    assert_eq!(test.plants.len(), Plant::ALL.len());
    assert!(test.real_file.starts_with("none"), "{}", test.real_file);
    assert_eq!(test.control, HOLDS);
    for (plant, result) in Plant::ALL.iter().zip(&test.plants) {
        assert_eq!(result.invariant, plant.invariant());
        assert!(result.said.contains(&Fixture::new(None).needle(*plant)), "{}", said(&test));
    }
    // Each invariant F1 to F6 has a plant of its own.
    let covered: BTreeSet<&str> = test.plants.iter().map(|p| p.invariant.as_str()).collect();
    assert_eq!(covered, ["F1", "F2", "F3", "F4", "F5", "F6"].into_iter().collect::<BTreeSet<&str>>());
    assert!(test.line().contains("11 of 11 planted violation(s) caught on a synthetic fixture only"), "{}", test.line());
}

#[test]
fn the_self_test_copies_a_real_region_file_and_plants_in_it() {
    let w = TempWorld::new();
    // A bigger file and a smaller one: the smaller is taken. In it a chunk
    // somebody lived in (kept) and four that may be reset.
    write_region(&w.0, Store::Region, 0, 0, &[((0, 0), 0), ((1, 0), 0), ((2, 0), 0), ((3, 0), 0), ((4, 0), 0), ((5, 0), 0), ((6, 0), 0)]);
    write_region(&w.0, Store::Region, -1, 0, &[((-1, 0), 50_000), ((-2, 0), 0), ((-3, 0), 0), ((-4, 0), 0), ((-5, 0), 0)]);
    let before: Vec<u8> = fs::read(w.0.join("region").join("r.-1.0.mca")).unwrap();
    let test = self_test(&w.0, &plan_of(&[(1, 0)]));
    assert!(test.passed(), "{}", said(&test));
    assert!(test.real_file.starts_with("region/r.-1.0.mca (5 chunks"), "{}", test.real_file);
    assert!(test.line().contains("one real region file of this world"));
    // The byte flip and the block change went into a chunk of the real file
    // that is kept in the fixture, and were named by its position.
    let flip = &test.plants[0];
    assert!(flip.said.contains("icraft:selftest region chunk ("), "{}", flip.said);
    let block = &test.plants[3];
    assert!(block.said.contains("icraft:selftest region chunk (") && block.said.contains("its stored data changed"), "{}", block.said);
    // The world's own file was only read.
    assert_eq!(fs::read(w.0.join("region").join("r.-1.0.mca")).unwrap(), before);
}

#[test]
fn a_check_stubbed_to_hold_lets_its_plants_through_and_the_self_test_fails() {
    let w = TempWorld::new();
    let plan = plan_of(&[(0, 0)]);
    for id in ["F1", "F2", "F3", "F4", "F5", "F6"] {
        blind_for_test(&[id]);
        let test = self_test(&w.0, &plan);
        blind_for_test(&[]);
        assert!(!test.passed(), "{id} blinded and the self-test still passed: {}", said(&test));
        for p in &test.plants {
            assert_eq!(p.caught, p.invariant != id, "{id} blinded: {}", said(&test));
        }
        assert!(test.line().contains("FAILED") && test.line().contains("not caught"), "{}", test.line());
        let check = check_f7(Some(&test));
        assert!(check.failed() && check.findings.iter().all(|f| f.contains("NOT caught")), "{check:?}");
    }
    assert!(self_test(&w.0, &plan).passed());
}

#[test]
fn the_nbt_reader_and_writer_agree_and_find_inhabited_time() {
    let root = Tag::compound(vec![
        ("DataVersion", Tag::Int(3465)),
        ("Status", Tag::text_of("minecraft:full")),
        ("InhabitedTime", Tag::Long(1234)),
        ("f", Tag::Float(0x7fc0_0001)),
        ("d", Tag::Double(1)),
        ("s", Tag::Short(-2)),
        ("b", Tag::Bytes(vec![1, 2, 3])),
        ("i", Tag::Ints(vec![-1, 7])),
        ("empty", Tag::List(TAG_COMPOUND, Vec::new())),
        ("nested", Tag::List(TAG_LIST, vec![Tag::List(TAG_BYTE, vec![Tag::Byte(-1)])])),
    ]);
    let raw = encode_root(b"", &root);
    for wrap in [Wrap::Gzip, Wrap::Zlib, Wrap::Plain] {
        let (w, name, back) = read_file_tree(&compress(wrap, &raw)).unwrap();
        assert_eq!((w, name.as_slice(), &back), (wrap, &b""[..], &root));
    }
    assert_eq!(chunk_nbt(2, &compress(Wrap::Zlib, &raw)), Ok(Some(1234)));
    assert_eq!(chunk_nbt(1, &compress(Wrap::Gzip, &raw)), Ok(Some(1234)));
    assert_eq!(chunk_nbt(3, &raw), Ok(Some(1234)));
    // Before 1.18 the chunk lived under "Level".
    let legacy = encode_root(b"", &Tag::compound(vec![("DataVersion", Tag::Int(1)), ("Level", Tag::compound(vec![("InhabitedTime", Tag::Int(77))]))]));
    assert_eq!(chunk_nbt(3, &legacy), Ok(Some(77)));
    assert_eq!(chunk_nbt(3, &encode_root(b"", &Tag::compound(vec![("x", Tag::Int(1))]))), Ok(None));
    // Every way of being unreadable.
    assert!(chunk_nbt(2, &raw).is_err(), "not zlib");
    assert!(chunk_nbt(4, &raw).is_err(), "LZ4 is 1.20.5's");
    assert!(chunk_nbt(3, &raw[..raw.len() - 1]).is_err(), "cut short");
    let mut bad_tag = raw.clone();
    let at = 3; // the first entry's type byte
    bad_tag[at] = 13;
    assert!(chunk_nbt(3, &bad_tag).unwrap_err().contains("unknown tag type 13"));
    assert!(chunk_nbt(3, &[TAG_LIST, 0, 0]).unwrap_err().contains("not a compound"));
    let mut flipped = compress(Wrap::Zlib, &raw);
    let mid = flipped.len() / 2;
    flipped[mid] ^= 0xff;
    assert!(chunk_nbt(2, &flipped).is_err());
}

#[test]
fn the_region_reader_names_every_defect() {
    let good = synthetic_chunk((0, 0), 5);
    let mut bytes = region_bytes(&[
        ((0, 0), 2, good.clone()),
        ((1, 0), 2, good.clone()),
        ((2, 0), 2, good.clone()),
        ((3, 0), 9, good.clone()),
        ((4, 0), 0x82, Vec::new()),
        ((5, 0), 2, b"not zlib".to_vec()),
        ((6, 0), 2, good.clone()),
    ]);
    // (1, 0) points into the header; (2, 0) shares (0, 0)'s sector; (6, 0)
    // says it is longer than its sector.
    bytes[4..8].copy_from_slice(&((1u32 << 8) | 1).to_be_bytes());
    let first = bytes[0..4].to_vec();
    bytes[8..12].copy_from_slice(&first);
    let six = ((be32(&bytes, 6 * 4) >> 8) as usize) * SECTOR;
    bytes[six..six + 4].copy_from_slice(&(SECTOR as u32 * 2).to_be_bytes());
    let dir = std::env::temp_dir();
    let read = read_region(&bytes, &dir.join("icraft-fidelity-no-such-dir"), 0, 0, |_| true);
    let all = read.defects.join("\n");
    assert!(all.contains("chunk (1, 0) in slot 1: its location points into the header"), "{all}");
    assert!(all.contains("chunk (2, 0) in slot 2: it shares sectors with the chunk in slot 0"), "{all}");
    assert!(all.contains("chunk (3, 0) in slot 3: its compression type is 9"), "{all}");
    assert!(all.contains("chunk (4, 0) in slot 4: its data is in c.4.0.mcc, which is not there"), "{all}");
    assert!(all.contains("chunk (5, 0) in slot 5: its data does not decompress and parse"), "{all}");
    assert!(all.contains("chunk (6, 0) in slot 6: its length field says 8192 bytes, more than its 1 sector(s) hold"), "{all}");
    assert!(!all.contains("chunk (0, 0)"), "{all}");
    let readings: BTreeMap<ChunkPos, Reading> = read.readings.into_iter().collect();
    assert_eq!(readings[&(0, 0)], Reading::Parsed(Some(5)));
    for bad in [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0)] {
        assert!(matches!(readings[&bad], Reading::Damaged(_)), "{bad:?}");
    }
    assert_eq!(read.external, vec![(4, 0)]);
    // Not decoded: the header and record checks still run, nothing is decompressed.
    let shallow = read_region(&bytes, &dir, 0, 0, |_| false);
    assert!(shallow.readings.is_empty() && !shallow.decoded);
    assert!(!shallow.defects.join("\n").contains("decompress"));
    // The record image covers the length, the type and the data, nothing past them.
    let mut padded = region_bytes(&[((0, 0), 2, good.clone())]);
    let image = read_region(&padded, &dir, 0, 0, |_| false).images[0].1;
    let last = padded.len() - 1;
    padded[last] ^= 1; // padding after the data, inside the sector
    assert_eq!(read_region(&padded, &dir, 0, 0, |_| false).images[0].1, image);
    padded[2 * SECTOR + 10] ^= 1;
    assert_ne!(read_region(&padded, &dir, 0, 0, |_| false).images[0].1.sha256, image.sha256);
    // A placeholder is nothing; a file shorter than a header is a defect.
    assert!(read_region(&[], &dir, 0, 0, |_| true).defects.is_empty());
    assert!(read_region(&[1u8; 100], &dir, 0, 0, |_| true).defects[0].contains("shorter than a region file's 8 KiB header"));
}

#[test]
fn paths_and_dimensions_read_as_minecraft_writes_them() {
    assert_eq!(dim_folder(OVERWORLD).as_deref(), Some(""));
    assert_eq!(dim_folder(NETHER).as_deref(), Some("DIM-1"));
    assert_eq!(dim_folder(END).as_deref(), Some("DIM1"));
    assert_eq!(dim_folder("mymod:caves/deep").as_deref(), Some("dimensions/mymod/caves/deep"));
    for not_one in ["nocolon", "a:", ":b", "a:../b", "a:b//c", "a\\b:c", "a:b:c"] {
        assert_eq!(dim_folder(not_one), None, "{not_one}");
    }
    for id in [OVERWORLD, NETHER, END, "twilightforest:twilight_forest", "mymod:caves/deep"] {
        assert_eq!(folder_label(&dim_folder(id).unwrap()), id);
    }
    assert_eq!(region_of_rel("region/r.1.-2.mca"), Some((String::new(), 0, 1, -2)));
    assert_eq!(region_of_rel("DIM-1/poi/r.0.0.mca"), Some(("DIM-1".to_string(), 2, 0, 0)));
    assert_eq!(region_of_rel("dimensions/a/b/entities/r.3.4.mca"), Some(("dimensions/a/b".to_string(), 1, 3, 4)));
    for not_one in ["region/r.1.2.mca.bak", "data/r.0.0.mca", "r.0.0.mca", "region/r.01.2.mca", "region/c.1.2.mcc"] {
        assert_eq!(region_of_rel(not_one), None, "{not_one}");
    }
    assert_eq!(mcc_of_rel("region/c.-3.7.mcc"), Some((String::new(), (-3, 7))));
    assert_eq!(mcc_of_rel("data/c.1.1.mcc"), None);
    assert_eq!(region_rel("", 0, (-1, 33)), "region/r.-1.1.mca");
    assert_eq!(region_rel("DIM1", 2, (40, -1)), "DIM1/poi/r.1.-1.mca");
    assert_eq!(packed_chunk(-498_903_396_511_719), (-1815 >> 4, 1121 >> 4)); // a live world's value, as the run's tests have it
    for slot in [0usize, 31, 32, 1023] {
        assert_eq!(slot_of(chunk_in(-2, 5, slot)), slot);
    }
}

#[test]
fn the_plan_is_read_from_the_dry_run_with_its_author_label_and_nothing_else() {
    let dir = std::env::temp_dir().join(format!("icraft-fidelity-plan-{}-{}", std::process::id(), NEXT_DIR.fetch_add(1, Ordering::SeqCst)));
    fs::create_dir_all(&dir).unwrap();
    assert_eq!(author_label(&dir), "operator (dry-run)");
    fs::write(dir.join(crate::regen::PLAN_FILE), r#"{"author": "model:claude-opus-5-5"}"#).unwrap();
    assert_eq!(author_label(&dir), "model:claude-opus-5-5");
    assert!(Plan::load(&dir).is_err(), "a plan file without a valid plan is refused");
    let _ = fs::remove_dir_all(&dir);
}
