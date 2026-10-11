//! A PNG writer (and a reader for its own palette output), just big enough for
//! the Customizer: per-dimension overview maps, one pixel block per chunk, and
//! the launcher window's own screenshots. The launcher renders on software
//! OpenGL on the server box, so a map is a file first and a picture in the
//! window second, never a live widget.

use std::io::{Read, Write};

const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
/// Colour type 2: three bytes per pixel.
const TRUECOLOUR: u8 = 2;
/// Colour type 3: one palette index per pixel.
const PALETTE: u8 = 3;
/// Nothing this module writes or shows is anywhere near this many pixels.
const MAX_PIXELS: u64 = 1 << 28;

fn crc32(parts: &[&[u8]]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for part in parts {
        for &byte in *part {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
            }
        }
    }
    !crc
}

fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc32(&[&kind[..], data]).to_be_bytes());
}

/// An 8-bit PNG of `height` rows of `row_bytes` bytes each.
fn encode(width: u32, height: u32, colour: u8, palette: Option<&[[u8; 3]]>, data: &[u8], row_bytes: usize) -> Option<Vec<u8>> {
    if width == 0 || height == 0 || row_bytes == 0 || data.len() != row_bytes.checked_mul(height as usize)? {
        return None;
    }
    let mut out = SIGNATURE.to_vec();
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    // bit depth 8, colour type, deflate, adaptive filtering, no interlace
    header.extend_from_slice(&[8, colour, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &header);
    if let Some(palette) = palette {
        chunk(&mut out, b"PLTE", &palette.concat());
    }
    let mut zlib = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    for row in data.chunks_exact(row_bytes) {
        // Filter type 0 (none) in front of every row.
        zlib.write_all(&[0]).ok()?;
        zlib.write_all(row).ok()?;
    }
    chunk(&mut out, b"IDAT", &zlib.finish().ok()?);
    chunk(&mut out, b"IEND", &[]);
    Some(out)
}

/// An 8-bit palette PNG. `pixels` holds one palette index per pixel, row by
/// row from the top; `palette` has at most 256 RGB entries. `None` when the
/// sizes do not agree.
pub fn encode_indexed(width: u32, height: u32, palette: &[[u8; 3]], pixels: &[u8]) -> Option<Vec<u8>> {
    if palette.is_empty() || palette.len() > 256 {
        return None;
    }
    encode(width, height, PALETTE, Some(palette), pixels, width as usize)
}

/// A 24-bit PNG from `width * height * 3` bytes of RGB, row by row from the top.
pub fn encode_rgb(width: u32, height: u32, rgb: &[u8]) -> Option<Vec<u8>> {
    encode(width, height, TRUECOLOUR, None, rgb, (width as usize).checked_mul(3)?)
}

/// A palette image read back from a PNG.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Indexed {
    pub width: u32,
    pub height: u32,
    pub palette: Vec<[u8; 3]>,
    /// One palette index per pixel, row by row from the top.
    pub pixels: Vec<u8>,
}

impl Indexed {
    /// `width * height * 3` bytes of RGB. An index past the palette is black.
    pub fn to_rgb(&self) -> Vec<u8> {
        self.pixels.iter().flat_map(|i| self.palette.get(usize::from(*i)).copied().unwrap_or([0, 0, 0])).collect()
    }
}

/// Read a PNG that [`encode_indexed`] wrote: 8-bit palette, unfiltered rows,
/// not interlaced. Anything else (a PNG from elsewhere, a damaged file) is
/// `None`: this is how the launcher shows its own maps again, not a PNG
/// decoder.
pub fn decode_indexed(png: &[u8]) -> Option<Indexed> {
    let mut rest = png.strip_prefix(&SIGNATURE[..])?;
    let (mut size, mut palette, mut data) = (None, Vec::new(), Vec::new());
    loop {
        let len = u32::from_be_bytes(rest.get(..4)?.try_into().ok()?) as usize;
        let kind = rest.get(4..8)?;
        let body = rest.get(8..8 + len)?;
        let crc = u32::from_be_bytes(rest.get(8 + len..12 + len)?.try_into().ok()?);
        if crc != crc32(&[kind, body]) {
            return None;
        }
        match kind {
            b"IHDR" => {
                if body.len() != 13 || body[8..] != [8, PALETTE, 0, 0, 0] {
                    return None;
                }
                let width = u32::from_be_bytes(body[..4].try_into().ok()?);
                let height = u32::from_be_bytes(body[4..8].try_into().ok()?);
                if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
                    return None;
                }
                size = Some((width, height));
            }
            b"PLTE" => palette = body.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect(),
            b"IDAT" => data.extend_from_slice(body),
            b"IEND" => break,
            _ => {}
        }
        rest = &rest[12 + len..];
    }
    let (width, height) = size?;
    let (w, h) = (width as usize, height as usize);
    let mut raw = Vec::new();
    flate2::read::ZlibDecoder::new(&data[..]).take(((w + 1) * h) as u64 + 1).read_to_end(&mut raw).ok()?;
    if palette.is_empty() || raw.len() != (w + 1) * h {
        return None;
    }
    let mut pixels = Vec::with_capacity(w * h);
    for row in raw.chunks_exact(w + 1) {
        if row[0] != 0 {
            return None;
        }
        pixels.extend_from_slice(&row[1..]);
    }
    Some(Indexed { width, height, palette, pixels })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_matches_the_png_specification() {
        // The CRC every PNG ends with: an IEND chunk with no data.
        assert_eq!(crc32(&[&b"IEND"[..]]), 0xAE42_6082);
        assert_eq!(crc32(&[&b"IE"[..], &b"ND"[..], &b""[..]]), 0xAE42_6082);
        assert_eq!(crc32(&[&b"123456789"[..]]), 0xCBF4_3926);
    }

    /// (type, data) of every chunk, with each CRC checked.
    fn chunks(png: &[u8]) -> Vec<(String, Vec<u8>)> {
        assert_eq!(&png[..8], &SIGNATURE[..]);
        let mut at = 8;
        let mut out = Vec::new();
        while at < png.len() {
            let len = u32::from_be_bytes([png[at], png[at + 1], png[at + 2], png[at + 3]]) as usize;
            let kind = &png[at + 4..at + 8];
            let data = &png[at + 8..at + 8 + len];
            let crc = u32::from_be_bytes([png[at + 8 + len], png[at + 9 + len], png[at + 10 + len], png[at + 11 + len]]);
            assert_eq!(crc, crc32(&[kind, data]));
            out.push((String::from_utf8_lossy(kind).into_owned(), data.to_vec()));
            at += 12 + len;
        }
        out
    }

    fn inflate(data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        flate2::read::ZlibDecoder::new(data).read_to_end(&mut out).unwrap();
        out
    }

    #[test]
    fn a_palette_image_has_the_right_structure_and_pixels() {
        let palette = [[0u8, 0, 0], [255, 0, 0], [0, 255, 0]];
        let pixels = [0u8, 1, 2, 2, 1, 0];
        let png = encode_indexed(3, 2, &palette, &pixels).unwrap();
        let chunks = chunks(&png);
        let kinds: Vec<&str> = chunks.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(kinds, vec!["IHDR", "PLTE", "IDAT", "IEND"]);
        assert_eq!(chunks[0].1, vec![0u8, 0, 0, 3, 0, 0, 0, 2, 8, 3, 0, 0, 0]);
        assert_eq!(chunks[1].1, vec![0u8, 0, 0, 255, 0, 0, 0, 255, 0]);
        assert_eq!(inflate(&chunks[2].1), vec![0u8, 0, 1, 2, 0, 2, 1, 0]);
    }

    #[test]
    fn a_truecolour_image_has_the_right_structure_and_pixels() {
        let rgb = [10u8, 20, 30, 40, 50, 60];
        let png = encode_rgb(2, 1, &rgb).unwrap();
        let chunks = chunks(&png);
        let kinds: Vec<&str> = chunks.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(kinds, vec!["IHDR", "IDAT", "IEND"]);
        assert_eq!(chunks[0].1, vec![0u8, 0, 0, 2, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
        assert_eq!(inflate(&chunks[1].1), vec![0u8, 10, 20, 30, 40, 50, 60]);
        assert!(encode_rgb(2, 1, &rgb[..5]).is_none());
        assert!(encode_rgb(0, 1, &[]).is_none());
    }

    #[test]
    fn sizes_that_do_not_agree_are_refused() {
        let palette = [[0u8, 0, 0]];
        assert!(encode_indexed(2, 2, &palette, &[0; 3]).is_none());
        assert!(encode_indexed(0, 2, &palette, &[]).is_none());
        assert!(encode_indexed(1, 1, &[], &[0]).is_none());
        assert!(encode_indexed(1, 1, &palette, &[0]).is_some());
    }

    #[test]
    fn its_own_palette_images_read_back() {
        let palette = vec![[16u8, 16, 20], [230, 110, 40], [255, 255, 255]];
        let pixels: Vec<u8> = (0..7 * 5).map(|i| (i % 3) as u8).collect();
        let png = encode_indexed(7, 5, &palette, &pixels).unwrap();
        let image = decode_indexed(&png).unwrap();
        assert_eq!(image, Indexed { width: 7, height: 5, palette: palette.clone(), pixels: pixels.clone() });
        let rgb = image.to_rgb();
        assert_eq!(rgb.len(), 7 * 5 * 3);
        assert_eq!(&rgb[..9], &[16u8, 16, 20, 230, 110, 40, 255, 255, 255][..]);

        // Not ours, or damaged: refused, never a panic.
        assert!(decode_indexed(&encode_rgb(1, 1, &[1, 2, 3]).unwrap()).is_none());
        assert!(decode_indexed(b"not a png").is_none());
        assert!(decode_indexed(&[]).is_none());
        for cut in [8, 20, png.len() / 2, png.len() - 1] {
            assert!(decode_indexed(&png[..cut]).is_none(), "cut at {cut}");
        }
        let mut flipped = png.clone();
        let last = flipped.len() - 20;
        flipped[last] ^= 0xFF;
        assert!(decode_indexed(&flipped).is_none(), "a CRC must catch a flipped byte");
    }
}
