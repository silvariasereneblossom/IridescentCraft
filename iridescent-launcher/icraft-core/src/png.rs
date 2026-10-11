//! A PNG writer for palette images, just big enough for the Customizer's
//! per-dimension overview maps (one pixel block per chunk). The GUI renders on
//! software OpenGL on the server box, so maps are files, not widgets.

use std::io::Write;

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

/// An 8-bit palette PNG. `pixels` holds one palette index per pixel, row by
/// row from the top; `palette` has at most 256 RGB entries. `None` when the
/// sizes do not agree.
pub fn encode_indexed(width: u32, height: u32, palette: &[[u8; 3]], pixels: &[u8]) -> Option<Vec<u8>> {
    let (w, h) = (width as usize, height as usize);
    if w == 0 || h == 0 || palette.is_empty() || palette.len() > 256 || pixels.len() != w.checked_mul(h)? {
        return None;
    }
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&width.to_be_bytes());
    header.extend_from_slice(&height.to_be_bytes());
    // bit depth 8, colour type 3 (palette), deflate, adaptive filtering, no interlace
    header.extend_from_slice(&[8, 3, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &header);
    chunk(&mut out, b"PLTE", &palette.concat());

    let mut zlib = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    for row in pixels.chunks_exact(w) {
        // Filter type 0 (none) in front of every row.
        zlib.write_all(&[0]).ok()?;
        zlib.write_all(row).ok()?;
    }
    chunk(&mut out, b"IDAT", &zlib.finish().ok()?);
    chunk(&mut out, b"IEND", &[]);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn crc_matches_the_png_specification() {
        // The CRC every PNG ends with: an IEND chunk with no data.
        assert_eq!(crc32(&[&b"IEND"[..]]), 0xAE42_6082);
        assert_eq!(crc32(&[&b"IE"[..], &b"ND"[..], &b""[..]]), 0xAE42_6082);
        assert_eq!(crc32(&[&b"123456789"[..]]), 0xCBF4_3926);
    }

    #[test]
    fn an_image_has_the_right_structure_and_pixels() {
        let palette = [[0, 0, 0], [255, 0, 0], [0, 255, 0]];
        let pixels = [0u8, 1, 2, 2, 1, 0];
        let png = encode_indexed(3, 2, &palette, &pixels).unwrap();
        assert_eq!(&png[..8], &[0x89u8, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A][..]);

        // Walk the chunks: length, type, data, CRC.
        let mut at = 8;
        let mut seen = Vec::new();
        let mut idat = Vec::new();
        while at < png.len() {
            let len = u32::from_be_bytes([png[at], png[at + 1], png[at + 2], png[at + 3]]) as usize;
            let kind = &png[at + 4..at + 8];
            let data = &png[at + 8..at + 8 + len];
            let crc = u32::from_be_bytes([png[at + 8 + len], png[at + 9 + len], png[at + 10 + len], png[at + 11 + len]]);
            assert_eq!(crc, crc32(&[kind, data]));
            if kind == &b"IHDR"[..] {
                assert_eq!(data, &[0u8, 0, 0, 3, 0, 0, 0, 2, 8, 3, 0, 0, 0][..]);
            }
            if kind == &b"PLTE"[..] {
                assert_eq!(data, &[0u8, 0, 0, 255, 0, 0, 0, 255, 0][..]);
            }
            if kind == &b"IDAT"[..] {
                idat.extend_from_slice(data);
            }
            seen.push(String::from_utf8_lossy(kind).into_owned());
            at += 12 + len;
        }
        assert_eq!(seen, vec!["IHDR", "PLTE", "IDAT", "IEND"]);
        let mut rows = Vec::new();
        flate2::read::ZlibDecoder::new(&idat[..]).read_to_end(&mut rows).unwrap();
        assert_eq!(rows, vec![0u8, 0, 1, 2, 0, 2, 1, 0]);
    }

    #[test]
    fn sizes_that_do_not_agree_are_refused() {
        let palette = [[0, 0, 0]];
        assert!(encode_indexed(2, 2, &palette, &[0; 3]).is_none());
        assert!(encode_indexed(0, 2, &palette, &[]).is_none());
        assert!(encode_indexed(1, 1, &[], &[0]).is_none());
        assert!(encode_indexed(1, 1, &palette, &[0]).is_some());
    }
}
