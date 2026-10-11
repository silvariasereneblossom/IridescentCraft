//! A small reader for Minecraft's NBT (Java edition: big-endian, named tags).
//!
//! Why this is not a crate: the launcher has one compiler (CI) and ships to a
//! box nobody can debug on, so every dependency is a build that can break out
//! of reach. What the Server Customizer needs from NBT is narrow and is all
//! here in ~250 lines:
//!
//!   - [`parse_bytes`]: a whole small file (`level.dat`, `playerdata/*.dat`,
//!     `data/*.dat`, Open Parties and Claims' `*.nbt`) into a [`Value`] tree.
//!     Gzip, zlib and uncompressed are told apart by their first byte.
//!   - [`scan_root_long`]: one top-level number out of a chunk, read straight
//!     off the decompressor and stopping at the tag. A chunk is ~70 KiB of NBT
//!     and `InhabitedTime` sits in front of the block data, so the 72,000
//!     chunks of the live world cost a few hundred bytes of inflate each
//!     instead of 5 GiB in total. A serde-based crate has to read every chunk
//!     to its end.
//!
//! It only reads. Names and strings are decoded lossily (Java's "modified
//! UTF-8" differs from UTF-8 for NUL and for characters outside the BMP):
//! every name this module is asked about is ASCII.
//!
//! Corrupt or half-written input is an `Err`, never a panic and never a large
//! allocation: lengths are not trusted (bytes are pulled through `take`), and
//! nesting is capped at Minecraft's own limit.

use std::collections::BTreeMap;
use std::io::{self, BufReader, Read};

pub const TAG_END: u8 = 0;
pub const TAG_BYTE: u8 = 1;
pub const TAG_SHORT: u8 = 2;
pub const TAG_INT: u8 = 3;
pub const TAG_LONG: u8 = 4;
pub const TAG_FLOAT: u8 = 5;
pub const TAG_DOUBLE: u8 = 6;
pub const TAG_BYTE_ARRAY: u8 = 7;
pub const TAG_STRING: u8 = 8;
pub const TAG_LIST: u8 = 9;
pub const TAG_COMPOUND: u8 = 10;
pub const TAG_INT_ARRAY: u8 = 11;
pub const TAG_LONG_ARRAY: u8 = 12;

/// Minecraft refuses NBT nested deeper than this.
const MAX_DEPTH: u32 = 512;
/// Ceiling on the decompressed size of a file parsed into a tree. The largest
/// real one (`level.dat`, with every dimension's worldgen in it) is ~10 MiB.
pub const MAX_TREE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<u8>),
    String(String),
    List(Vec<Value>),
    Compound(BTreeMap<String, Value>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

impl Value {
    /// A compound's entry.
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Compound(map) => map.get(key),
            _ => None,
        }
    }

    /// Nested compound entries: `v.at(&["Data", "SpawnX"])`.
    pub fn at(&self, path: &[&str]) -> Option<&Value> {
        let mut here = self;
        for key in path {
            here = here.get(key)?;
        }
        Some(here)
    }

    /// Any of the integer tags.
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Byte(v) => Some(i64::from(*v)),
            Value::Short(v) => Some(i64::from(*v)),
            Value::Int(v) => Some(i64::from(*v)),
            Value::Long(v) => Some(*v),
            _ => None,
        }
    }

    /// An integer tag that fits a block or chunk coordinate.
    pub fn as_i32(&self) -> Option<i32> {
        self.as_i64().and_then(|v| i32::try_from(v).ok())
    }

    /// Any numeric tag.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Float(v) => Some(f64::from(*v)),
            Value::Double(v) => Some(*v),
            other => other.as_i64().map(|v| v as f64),
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_list(&self) -> Option<&[Value]> {
        match self {
            Value::List(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_compound(&self) -> Option<&BTreeMap<String, Value>> {
        match self {
            Value::Compound(map) => Some(map),
            _ => None,
        }
    }

    pub fn as_ints(&self) -> Option<&[i32]> {
        match self {
            Value::IntArray(v) => Some(v),
            _ => None,
        }
    }

    pub fn as_longs(&self) -> Option<&[i64]> {
        match self {
            Value::LongArray(v) => Some(v),
            _ => None,
        }
    }
}

fn bad(msg: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, msg.into())
}

fn read_array<R: Read, const N: usize>(r: &mut R) -> io::Result<[u8; N]> {
    let mut buf = [0u8; N];
    r.read_exact(&mut buf)?;
    Ok(buf)
}

fn read_u8<R: Read>(r: &mut R) -> io::Result<u8> {
    Ok(read_array::<R, 1>(r)?[0])
}

fn read_u16<R: Read>(r: &mut R) -> io::Result<u16> {
    Ok(u16::from_be_bytes(read_array(r)?))
}

fn read_i32<R: Read>(r: &mut R) -> io::Result<i32> {
    Ok(i32::from_be_bytes(read_array(r)?))
}

fn read_i64<R: Read>(r: &mut R) -> io::Result<i64> {
    Ok(i64::from_be_bytes(read_array(r)?))
}

/// An array or list length. Negative is corrupt.
fn read_len<R: Read>(r: &mut R) -> io::Result<u64> {
    u64::try_from(read_i32(r)?).map_err(|_| bad("negative length"))
}

/// `n` bytes, without believing `n` before the bytes have actually arrived.
fn read_bytes<R: Read>(r: &mut R, n: u64) -> io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    let got = (&mut *r).take(n).read_to_end(&mut buf)?;
    if got as u64 != n {
        return Err(io::ErrorKind::UnexpectedEof.into());
    }
    Ok(buf)
}

fn skip<R: Read>(r: &mut R, n: u64) -> io::Result<()> {
    let copied = io::copy(&mut (&mut *r).take(n), &mut io::sink())?;
    if copied != n {
        return Err(io::ErrorKind::UnexpectedEof.into());
    }
    Ok(())
}

fn read_name<R: Read>(r: &mut R) -> io::Result<Vec<u8>> {
    let n = read_u16(r)?;
    read_bytes(r, u64::from(n))
}

fn read_string<R: Read>(r: &mut R) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&read_name(r)?).into_owned())
}

fn read_payload<R: Read>(r: &mut R, tag: u8, depth: u32) -> io::Result<Value> {
    if depth > MAX_DEPTH {
        return Err(bad("nested too deep"));
    }
    Ok(match tag {
        TAG_BYTE => Value::Byte(read_u8(r)? as i8),
        TAG_SHORT => Value::Short(read_u16(r)? as i16),
        TAG_INT => Value::Int(read_i32(r)?),
        TAG_LONG => Value::Long(read_i64(r)?),
        TAG_FLOAT => Value::Float(f32::from_bits(read_i32(r)? as u32)),
        TAG_DOUBLE => Value::Double(f64::from_bits(read_i64(r)? as u64)),
        TAG_BYTE_ARRAY => {
            let n = read_len(r)?;
            Value::ByteArray(read_bytes(r, n)?)
        }
        TAG_STRING => Value::String(read_string(r)?),
        TAG_LIST => {
            let element = read_u8(r)?;
            let n = read_len(r)?;
            if element == TAG_END && n > 0 {
                return Err(bad("a list of TAG_End with a length"));
            }
            let mut items = Vec::new();
            for _ in 0..n {
                items.push(read_payload(r, element, depth + 1)?);
            }
            Value::List(items)
        }
        TAG_COMPOUND => {
            let mut map = BTreeMap::new();
            loop {
                let entry = read_u8(r)?;
                if entry == TAG_END {
                    break;
                }
                let name = read_string(r)?;
                let value = read_payload(r, entry, depth + 1)?;
                map.insert(name, value);
            }
            Value::Compound(map)
        }
        TAG_INT_ARRAY => {
            let n = read_len(r)?;
            let raw = read_bytes(r, n * 4)?;
            Value::IntArray(raw.chunks_exact(4).map(|c| i32::from_be_bytes([c[0], c[1], c[2], c[3]])).collect())
        }
        TAG_LONG_ARRAY => {
            let n = read_len(r)?;
            let raw = read_bytes(r, n * 8)?;
            Value::LongArray(
                raw.chunks_exact(8)
                    .map(|c| i64::from_be_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]))
                    .collect(),
            )
        }
        other => return Err(bad(format!("unknown tag {other}"))),
    })
}

fn skip_payload<R: Read>(r: &mut R, tag: u8, depth: u32) -> io::Result<()> {
    if depth > MAX_DEPTH {
        return Err(bad("nested too deep"));
    }
    match tag {
        TAG_BYTE => skip(r, 1),
        TAG_SHORT => skip(r, 2),
        TAG_INT | TAG_FLOAT => skip(r, 4),
        TAG_LONG | TAG_DOUBLE => skip(r, 8),
        TAG_BYTE_ARRAY => {
            let n = read_len(r)?;
            skip(r, n)
        }
        TAG_STRING => {
            let n = read_u16(r)?;
            skip(r, u64::from(n))
        }
        TAG_LIST => {
            let element = read_u8(r)?;
            let n = read_len(r)?;
            let fixed = match element {
                TAG_BYTE => Some(1),
                TAG_SHORT => Some(2),
                TAG_INT | TAG_FLOAT => Some(4),
                TAG_LONG | TAG_DOUBLE => Some(8),
                _ => None,
            };
            if let Some(size) = fixed {
                return skip(r, n * size);
            }
            if element == TAG_END && n > 0 {
                return Err(bad("a list of TAG_End with a length"));
            }
            for _ in 0..n {
                skip_payload(r, element, depth + 1)?;
            }
            Ok(())
        }
        TAG_COMPOUND => loop {
            let entry = read_u8(r)?;
            if entry == TAG_END {
                return Ok(());
            }
            let n = read_u16(r)?;
            skip(r, u64::from(n))?;
            skip_payload(r, entry, depth + 1)?;
        },
        TAG_INT_ARRAY => {
            let n = read_len(r)?;
            skip(r, n * 4)
        }
        TAG_LONG_ARRAY => {
            let n = read_len(r)?;
            skip(r, n * 8)
        }
        other => Err(bad(format!("unknown tag {other}"))),
    }
}

/// The root compound of an uncompressed NBT stream.
pub fn read_root<R: Read>(r: &mut R) -> io::Result<Value> {
    if read_u8(r)? != TAG_COMPOUND {
        return Err(bad("the root tag is not a compound"));
    }
    read_name(r)?;
    read_payload(r, TAG_COMPOUND, 0)
}

/// A whole NBT file held in memory: gzip (`level.dat`, playerdata, `data/*.dat`),
/// zlib, or uncompressed (Open Parties and Claims writes its files that way).
pub fn parse_bytes(raw: &[u8]) -> io::Result<Value> {
    match raw.first().copied() {
        Some(0x1f) => read_root(&mut BufReader::new(flate2::bufread::GzDecoder::new(raw).take(MAX_TREE_BYTES))),
        Some(0x78) => read_root(&mut BufReader::new(flate2::bufread::ZlibDecoder::new(raw).take(MAX_TREE_BYTES))),
        Some(TAG_COMPOUND) => read_root(&mut &raw[..]),
        Some(other) => Err(bad(format!("not NBT (first byte 0x{other:02x})"))),
        None => Err(bad("empty file")),
    }
}

/// The integer named `key` directly under the root compound, or -- for chunks
/// saved before Minecraft 1.18, which kept everything one level down -- under
/// the root's `legacy_parent` compound. Reads the stream only as far as that
/// tag; `Ok(None)` means the whole compound was read and the key is not there.
pub fn scan_root_long<R: Read>(r: &mut R, key: &str, legacy_parent: &str) -> io::Result<Option<i64>> {
    if read_u8(r)? != TAG_COMPOUND {
        return Err(bad("the root tag is not a compound"));
    }
    read_name(r)?;
    scan_compound_long(r, key, Some(legacy_parent), 0)
}

fn scan_compound_long<R: Read>(r: &mut R, key: &str, descend_into: Option<&str>, depth: u32) -> io::Result<Option<i64>> {
    loop {
        let tag = read_u8(r)?;
        if tag == TAG_END {
            return Ok(None);
        }
        let name = read_name(r)?;
        if name == key.as_bytes() {
            match tag {
                TAG_LONG => return Ok(Some(read_i64(r)?)),
                TAG_INT => return Ok(Some(i64::from(read_i32(r)?))),
                _ => {}
            }
        }
        if tag == TAG_COMPOUND && descend_into.is_some_and(|parent| name == parent.as_bytes()) {
            if let Some(found) = scan_compound_long(r, key, None, depth + 1)? {
                return Ok(Some(found));
            }
            continue;
        }
        skip_payload(r, tag, depth + 1)?;
    }
}

/// An NBT writer, for building test worlds. Not compiled into the launcher:
/// nothing here may ever write NBT.
#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    fn tag_of(v: &Value) -> u8 {
        match v {
            Value::Byte(_) => TAG_BYTE,
            Value::Short(_) => TAG_SHORT,
            Value::Int(_) => TAG_INT,
            Value::Long(_) => TAG_LONG,
            Value::Float(_) => TAG_FLOAT,
            Value::Double(_) => TAG_DOUBLE,
            Value::ByteArray(_) => TAG_BYTE_ARRAY,
            Value::String(_) => TAG_STRING,
            Value::List(_) => TAG_LIST,
            Value::Compound(_) => TAG_COMPOUND,
            Value::IntArray(_) => TAG_INT_ARRAY,
            Value::LongArray(_) => TAG_LONG_ARRAY,
        }
    }

    fn put_name(out: &mut Vec<u8>, name: &str) {
        out.extend_from_slice(&(name.len() as u16).to_be_bytes());
        out.extend_from_slice(name.as_bytes());
    }

    fn put(out: &mut Vec<u8>, v: &Value) {
        match v {
            Value::Byte(x) => out.push(*x as u8),
            Value::Short(x) => out.extend_from_slice(&x.to_be_bytes()),
            Value::Int(x) => out.extend_from_slice(&x.to_be_bytes()),
            Value::Long(x) => out.extend_from_slice(&x.to_be_bytes()),
            Value::Float(x) => out.extend_from_slice(&x.to_bits().to_be_bytes()),
            Value::Double(x) => out.extend_from_slice(&x.to_bits().to_be_bytes()),
            Value::ByteArray(x) => {
                out.extend_from_slice(&(x.len() as i32).to_be_bytes());
                out.extend_from_slice(x);
            }
            Value::String(x) => put_name(out, x),
            Value::List(items) => {
                out.push(items.first().map_or(TAG_END, tag_of));
                out.extend_from_slice(&(items.len() as i32).to_be_bytes());
                for item in items {
                    put(out, item);
                }
            }
            Value::Compound(map) => put_entries(out, map.iter().map(|(k, v)| (k.as_str(), v))),
            Value::IntArray(x) => {
                out.extend_from_slice(&(x.len() as i32).to_be_bytes());
                for n in x {
                    out.extend_from_slice(&n.to_be_bytes());
                }
            }
            Value::LongArray(x) => {
                out.extend_from_slice(&(x.len() as i32).to_be_bytes());
                for n in x {
                    out.extend_from_slice(&n.to_be_bytes());
                }
            }
        }
    }

    fn put_entries<'a>(out: &mut Vec<u8>, entries: impl Iterator<Item = (&'a str, &'a Value)>) {
        for (name, value) in entries {
            out.push(tag_of(value));
            put_name(out, name);
            put(out, value);
        }
        out.push(TAG_END);
    }

    /// `[("SpawnX", Value::Int(5)), ...]` as a compound.
    pub fn compound(entries: Vec<(&str, Value)>) -> Value {
        Value::Compound(entries.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    }

    pub fn string(s: &str) -> Value {
        Value::String(s.to_string())
    }

    /// Uncompressed bytes of a root compound, entries sorted by name.
    pub fn encode(root: &Value) -> Vec<u8> {
        let mut out = vec![TAG_COMPOUND];
        put_name(&mut out, "");
        put(&mut out, root);
        out
    }

    /// Uncompressed bytes of a root compound with its entries in the order
    /// given (a chunk's entries come in Java's hash order, not sorted).
    pub fn encode_ordered(entries: &[(&str, Value)]) -> Vec<u8> {
        let mut out = vec![TAG_COMPOUND];
        put_name(&mut out, "");
        put_entries(&mut out, entries.iter().map(|(k, v)| (*k, v)));
        out
    }

    pub fn gzip(raw: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(raw).unwrap();
        enc.finish().unwrap()
    }

    pub fn zlib(raw: &[u8]) -> Vec<u8> {
        use std::io::Write;
        let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(raw).unwrap();
        enc.finish().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::*;
    use super::*;

    fn sample() -> Value {
        compound(vec![
            ("byte", Value::Byte(-3)),
            ("short", Value::Short(-300)),
            ("int", Value::Int(2_735)),
            ("long", Value::Long(-498_903_396_511_719)),
            ("float", Value::Float(1.5)),
            ("double", Value::Double(-2.25)),
            ("bytes", Value::ByteArray(vec![1, 2, 255])),
            ("name", string("Moongulf")),
            ("ints", Value::IntArray(vec![-901_396_754, 1_764_246_887])),
            ("longs", Value::LongArray(vec![i64::MIN, 7])),
            ("empty", Value::List(vec![])),
            ("list", Value::List(vec![compound(vec![("x", Value::Int(1))]), compound(vec![("x", Value::Int(2))])])),
            ("nested", compound(vec![("deep", compound(vec![("z", Value::Int(-9))]))])),
        ])
    }

    #[test]
    fn a_tree_survives_every_container() {
        let v = sample();
        let raw = encode(&v);
        assert_eq!(parse_bytes(&raw).unwrap(), v);
        assert_eq!(parse_bytes(&gzip(&raw)).unwrap(), v);
        assert_eq!(parse_bytes(&zlib(&raw)).unwrap(), v);
    }

    #[test]
    fn accessors_read_what_the_customizer_asks_for() {
        let v = sample();
        assert_eq!(v.at(&["nested", "deep", "z"]).and_then(Value::as_i32), Some(-9));
        assert_eq!(v.get("long").and_then(Value::as_i64), Some(-498_903_396_511_719));
        assert_eq!(v.get("long").and_then(Value::as_i32), None); // does not fit
        assert_eq!(v.get("name").and_then(Value::as_str), Some("Moongulf"));
        assert_eq!(v.get("double").and_then(Value::as_f64), Some(-2.25));
        assert_eq!(v.get("list").and_then(Value::as_list).map(<[Value]>::len), Some(2));
        assert_eq!(v.get("ints").and_then(Value::as_ints).map(<[i32]>::len), Some(2));
        assert_eq!(v.get("missing"), None);
        assert_eq!(v.at(&["name", "x"]), None); // not a compound
    }

    #[test]
    fn damaged_input_is_an_error_not_a_panic() {
        let raw = encode(&sample());
        for cut in [0, 1, 2, 3, 10, raw.len() / 2, raw.len() - 1] {
            assert!(parse_bytes(&raw[..cut]).is_err(), "cut at {cut}");
        }
        // A byte array claiming 2 GiB in a 12-byte file must not allocate it.
        let mut lie = vec![TAG_COMPOUND, 0, 0, TAG_BYTE_ARRAY, 0, 1, b'a'];
        lie.extend_from_slice(&i32::MAX.to_be_bytes());
        assert!(parse_bytes(&lie).is_err());
        // Negative lengths, unknown tags, a gzip header with nothing behind it.
        let mut negative = vec![TAG_COMPOUND, 0, 0, TAG_INT_ARRAY, 0, 1, b'a'];
        negative.extend_from_slice(&(-1i32).to_be_bytes());
        assert!(parse_bytes(&negative).is_err());
        assert!(parse_bytes(&[TAG_COMPOUND, 0, 0, 99, 0, 1, b'a', 0]).is_err());
        assert!(parse_bytes(&[0x1f, 0x8b, 8, 0]).is_err());
        assert!(parse_bytes(b"").is_err());
        assert!(parse_bytes(b"level-name=world").is_err());
    }

    #[test]
    fn nesting_is_capped() {
        // 600 lists inside each other.
        let mut raw = vec![TAG_COMPOUND, 0, 0, TAG_LIST, 0, 1, b'a'];
        for _ in 0..600 {
            raw.push(TAG_LIST);
            raw.extend_from_slice(&1i32.to_be_bytes());
        }
        assert!(parse_bytes(&raw).is_err());
        assert!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").is_err());
    }

    /// A chunk the way 1.20.1 writes it: the number sits before the block data.
    fn chunk(inhabited: i64) -> Vec<(&'static str, Value)> {
        vec![
            ("xPos", Value::Int(170)),
            ("yPos", Value::Int(-4)),
            ("block_ticks", Value::List(vec![])),
            ("isLightOn", Value::Byte(1)),
            ("InhabitedTime", Value::Long(inhabited)),
            ("sections", Value::List(vec![compound(vec![("data", Value::LongArray(vec![0; 4096]))])])),
            ("zPos", Value::Int(227)),
            ("Status", string("minecraft:full")),
        ]
    }

    #[test]
    fn the_scan_finds_the_number_wherever_it_sits() {
        let entries = chunk(6_166_097);
        let raw = encode_ordered(&entries);
        assert_eq!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").unwrap(), Some(6_166_097));
        // Last in the compound: everything before it has to be skipped right.
        let mut moved = chunk(42);
        let wanted = moved.remove(4);
        moved.push(wanted);
        let raw = encode_ordered(&moved);
        assert_eq!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").unwrap(), Some(42));
        // Every tag type in front of it.
        let mut all = sample().as_compound().unwrap().clone();
        all.insert("zz_InhabitedTime".to_string(), Value::Long(7));
        let raw = encode(&Value::Compound(all));
        assert_eq!(scan_root_long(&mut &raw[..], "zz_InhabitedTime", "Level").unwrap(), Some(7));
        // Absent.
        let raw = encode(&sample());
        assert_eq!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").unwrap(), None);
    }

    #[test]
    fn the_scan_stops_at_the_tag() {
        // Cut the stream right after the number: block data and all that
        // follows are gone, and the scan must not have needed them.
        let raw = encode_ordered(&chunk(12_000));
        let needle = b"InhabitedTime";
        let at = raw.windows(needle.len()).position(|w| w == needle).unwrap();
        let cut = &raw[..at + needle.len() + 8];
        assert_eq!(scan_root_long(&mut &cut[..], "InhabitedTime", "Level").unwrap(), Some(12_000));
        // One byte short of the number is an error.
        let short = &raw[..at + needle.len() + 7];
        assert!(scan_root_long(&mut &short[..], "InhabitedTime", "Level").is_err());
    }

    #[test]
    fn the_scan_reads_a_pre_1_18_chunk() {
        let raw = encode_ordered(&[
            ("DataVersion", Value::Int(2586)),
            ("Level", compound(vec![("InhabitedTime", Value::Long(900)), ("xPos", Value::Int(1))])),
        ]);
        assert_eq!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").unwrap(), Some(900));
        // Only the legacy parent is looked into, and only one level down.
        let raw = encode_ordered(&[
            ("Other", compound(vec![("InhabitedTime", Value::Long(1))])),
            ("Level", compound(vec![("Deeper", compound(vec![("InhabitedTime", Value::Long(2))]))])),
        ]);
        assert_eq!(scan_root_long(&mut &raw[..], "InhabitedTime", "Level").unwrap(), None);
    }
}
