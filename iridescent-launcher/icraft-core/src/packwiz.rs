//! Packwiz `.pw.toml` parser.
//!
//! Each .pw.toml in `mods/.index/` describes one mod:
//!
//! ```toml
//! filename = 'mod-1.2.3.jar'
//! name = '...'
//! side = 'both'                       # both | client | server
//!
//! [download]
//! hash = '<hex>'
//! hash-format = 'sha1' | 'sha256' | 'sha512' | 'murmur2'
//! mode = 'metadata:curseforge' | 'url'
//! url = ''                            # populated when mode = 'url'
//!
//! [update.curseforge]                 # when mode = metadata:curseforge
//! file-id = 5443206
//! project-id = 1012437
//!
//! [update.modrinth]                   # when source = modrinth (mode = 'url')
//! mod-id = '1Z4JHpyZ'
//! version = 'qZGw4bNN'
//! ```
//!
//! We use the `toml` crate to parse rather than line-regex like the
//! original PS1 -- safer against unexpected quoting and string escapes.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side { Both, Client, Server }

impl Side {
    fn parse(s: &str) -> Self {
        match s {
            "client" => Self::Client,
            "server" => Self::Server,
            _ => Self::Both,
        }
    }
}

/// Force-skip substring list -- mods marked `side = both` in their
/// .pw.toml that nonetheless break or are useless on a dedicated
/// server. Matches by case-insensitive substring on the filename.
/// Mirror of the `forceSkip` arrays in server_install.ps1 / update_mods.ps1.
pub const FORCE_SKIP_PATTERNS: &[&str] = &[
    "embeddium", "oculus", "immediatelyfast", "rubidium-extra",
    "kubejsoffline", "light-overlay", "equipment-compare", "chat_heads",
    "BetterAnimations", "transmog", "probejs", "irons_spells_js",
    "gh_classes", "cherryvillage", "rechiseled", "supermartijn642",
    "connectedglass", "trashcans",
    "ftbbackups", "ftbchunks", "ftbessentials", "ftblibrary",
    "ftbquests", "ftbranks", "ftbteams", "ftbultimine",
    "mca-social",
    "starlight",
];

/// Parsed and resolved mod entry.
#[derive(Debug, Clone)]
pub struct PackwizMod {
    pub filename: String,
    pub side: Side,
    pub mode: String,
    pub url: Option<String>,
    pub project_id: Option<u64>,
    pub file_id: Option<u64>,
    pub modrinth_id: Option<String>,
    pub source_toml: PathBuf,
}

impl PackwizMod {
    /// Stable identifier used to detect "old version" of the same mod
    /// when the filename has been bumped (e.g. when packwiz updates a
    /// mod the filename changes but the modrinth/cf id is stable).
    pub fn mod_key(&self) -> String {
        if let Some(m) = &self.modrinth_id { return format!("mr:{m}"); }
        if let Some(p) = self.project_id   { return format!("cf:{p}"); }
        format!("file:{}", self.source_toml.file_stem().unwrap_or_default().to_string_lossy())
    }

    /// Candidate download URLs in priority order.
    /// - `mode = url`        -> the literal url field
    /// - `mode = metadata:curseforge` -> build forgecdn URL from file-id,
    ///                          fall back to curseforge api/v1
    pub fn download_urls(&self) -> Vec<String> {
        let mut out = Vec::new();
        match self.mode.as_str() {
            "url" => {
                if let Some(u) = &self.url { if !u.is_empty() { out.push(u.clone()); } }
            }
            "metadata:curseforge" => {
                if let Some(file_id) = self.file_id {
                    let id = file_id.to_string();
                    let part1 = &id[..id.len().min(4)];
                    let rest = id.get(4..).unwrap_or("0").trim_start_matches('0');
                    let part2 = if rest.is_empty() { "0" } else { rest };
                    out.push(format!(
                        "https://edge.forgecdn.net/files/{}/{}/{}",
                        part1, part2, percent_encode(&self.filename)
                    ));
                    if let Some(pid) = self.project_id {
                        out.push(format!(
                            "https://www.curseforge.com/api/v1/mods/{}/files/{}/download",
                            pid, file_id
                        ));
                    }
                }
            }
            _ => {}
        }
        out
    }

    /// Returns true if the filename matches any FORCE_SKIP pattern.
    pub fn is_force_skipped(&self) -> bool {
        let needle = self.filename.to_lowercase();
        FORCE_SKIP_PATTERNS.iter().any(|p| needle.contains(&p.to_lowercase()))
    }
}

// ---------------------------------------------------------------------------
// TOML deserialization shape -- matches the .pw.toml layout exactly.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct RawToml {
    filename: Option<String>,
    #[serde(default = "default_side")]
    side: String,
    download: Option<RawDownload>,
    update: Option<RawUpdate>,
}

fn default_side() -> String { "both".to_string() }

#[derive(Debug, Deserialize)]
struct RawDownload {
    #[serde(default)]
    mode: String,
    #[serde(default)]
    url: String,
}

#[derive(Debug, Deserialize)]
struct RawUpdate {
    curseforge: Option<RawCurseforge>,
    modrinth: Option<RawModrinth>,
}

#[derive(Debug, Deserialize)]
struct RawCurseforge {
    #[serde(rename = "file-id")]
    file_id: Option<u64>,
    #[serde(rename = "project-id")]
    project_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawModrinth {
    #[serde(rename = "mod-id")]
    mod_id: Option<String>,
}

/// Parse a single .pw.toml file. Returns `Ok(None)` for files that
/// lack the required `filename` field (malformed / placeholder); these
/// are skipped at the call site.
///
/// Falls back to a line-regex parse when strict TOML parsing fails --
/// some packwiz `name` fields contain unescaped apostrophes inside
/// single-quoted literals (`name = 'YUNG's Better Mineshafts'`) which
/// are technically malformed TOML but ship in real .pw.toml files.
/// The regex path mirrors the original PowerShell behavior.
pub fn parse_one(path: &Path) -> Result<Option<PackwizMod>> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("read {}", path.display()))?;
    match toml::from_str::<RawToml>(&text) {
        Ok(raw) => Ok(build_from_raw(raw, path)),
        Err(e) => {
            log::debug!("[packwiz] {} strict parse failed ({}), trying line-regex", path.display(), e);
            Ok(parse_line_regex(&text, path))
        }
    }
}

fn build_from_raw(raw: RawToml, path: &Path) -> Option<PackwizMod> {
    let filename = raw.filename?;
    let side = Side::parse(&raw.side);
    let dl = raw.download.unwrap_or(RawDownload { mode: String::new(), url: String::new() });
    let url = if dl.url.is_empty() { None } else { Some(dl.url) };
    let cf = raw.update.as_ref().and_then(|u| u.curseforge.as_ref());
    let mr = raw.update.as_ref().and_then(|u| u.modrinth.as_ref());
    Some(PackwizMod {
        filename,
        side,
        mode: dl.mode,
        url,
        project_id: cf.and_then(|c| c.project_id),
        file_id: cf.and_then(|c| c.file_id),
        modrinth_id: mr.and_then(|m| m.mod_id.clone()),
        source_toml: path.to_path_buf(),
    })
}

/// Tolerant fallback: extract the fields we care about via line-by-line
/// regex matching. Mirrors the PowerShell parser. Used when strict TOML
/// parsing fails (e.g. unescaped apostrophes in name fields).
fn parse_line_regex(text: &str, path: &Path) -> Option<PackwizMod> {
    let mut filename: Option<String> = None;
    let mut side = "both".to_string();
    let mut mode = String::new();
    let mut url = String::new();
    let mut project_id: Option<u64> = None;
    let mut file_id: Option<u64> = None;
    let mut modrinth_id: Option<String> = None;

    for line in text.lines() {
        let l = line.trim();
        if let Some(v) = capture_str(l, "filename") { filename = Some(v); continue; }
        if let Some(v) = capture_str(l, "side")     { side = v; continue; }
        if let Some(v) = capture_str(l, "mode")     { mode = v; continue; }
        if let Some(v) = capture_str(l, "url")      { url = v; continue; }
        if let Some(v) = capture_int(l, "project-id") { project_id = Some(v); continue; }
        if let Some(v) = capture_int(l, "file-id")    { file_id = Some(v); continue; }
        if let Some(v) = capture_str(l, "mod-id")     { modrinth_id = Some(v); continue; }
    }

    let filename = filename?;
    let url_opt = if url.is_empty() { None } else { Some(url) };
    Some(PackwizMod {
        filename, side: Side::parse(&side), mode,
        url: url_opt, project_id, file_id, modrinth_id,
        source_toml: path.to_path_buf(),
    })
}

/// Match `key = 'value'` or `key = "value"`. Tolerates internal
/// apostrophes by greedy-matching to the LAST quote-of-same-kind on
/// the line. The PS1 uses regex with the same forgiving behavior.
fn capture_str(line: &str, key: &str) -> Option<String> {
    let prefix = format!("{key} = ");
    let rest = line.strip_prefix(&prefix)?;
    let q = rest.chars().next()?;
    if q != '\'' && q != '"' { return None; }
    // Find the LAST matching quote; tolerates inner apostrophes.
    let inner = rest.trim_start_matches(q);
    let last = inner.rfind(q)?;
    Some(inner[..last].to_string())
}

fn capture_int(line: &str, key: &str) -> Option<u64> {
    let prefix = format!("{key} = ");
    line.strip_prefix(&prefix)?.trim().parse::<u64>().ok()
}

/// Parse every .pw.toml in `index_dir`. Files that fail to parse are
/// logged at warn and skipped -- one bad TOML shouldn't block the
/// whole sync.
pub fn parse_index(index_dir: &Path) -> Result<Vec<PackwizMod>> {
    let mut mods = Vec::new();
    if !index_dir.is_dir() {
        anyhow::bail!("index dir not found: {}", index_dir.display());
    }
    for entry in std::fs::read_dir(index_dir)? {
        let entry = entry?;
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("toml") { continue; }
        if !p.file_name().and_then(|s| s.to_str()).map(|n| n.ends_with(".pw.toml")).unwrap_or(false) {
            continue;
        }
        match parse_one(&p) {
            Ok(Some(m)) => mods.push(m),
            Ok(None) => log::debug!("[packwiz] {} -- no filename, skip", p.display()),
            Err(e) => log::warn!("[packwiz] {} parse failed: {e:#}", p.display()),
        }
    }
    Ok(mods)
}

/// Strip a typical `mod-1.2.3.jar` to its base name `mod`. Used to
/// detect old versions of the same mod when the filename has been
/// bumped. Mirrors the regex `'-[\d\.]+.*\.jar$' -> ''` from
/// update_mods.ps1.
pub fn strip_version(filename: &str) -> String {
    // Find the first `-<digit>` boundary; everything from there to the
    // end is treated as version+suffix. If none, return the stem.
    let stem = filename.strip_suffix(".jar").unwrap_or(filename);
    let bytes = stem.as_bytes();
    let mut cut = stem.len();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'-' && i + 1 < bytes.len() && bytes[i+1].is_ascii_digit() {
            cut = i;
            break;
        }
        i += 1;
    }
    stem[..cut].to_string()
}

/// Minimal URL percent-encoding for filenames going into a URL path.
/// Encodes the bytes that are unsafe inside a path segment per RFC 3986;
/// stops short of pulling in a full url crate for this single use.
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let safe = b.is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'~' | b'/' | b'(' | b')' | b'!' | b'*' | b'\'' | b';' | b':' | b'@' | b'&' | b'=' | b'+' | b'$' | b',');
        if safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_version_simple() {
        assert_eq!(strip_version("absolutely_stuffed-1.20.1-47.3.1-1.1.jar"), "absolutely_stuffed");
        assert_eq!(strip_version("ad_astra_more_structures-1.0.0.jar"), "ad_astra_more_structures");
        assert_eq!(strip_version("ars_nouveau-1.20.1-4.12.7-all.jar"), "ars_nouveau");
        assert_eq!(strip_version("Patchouli-1.20.1-85-FORGE.jar"), "Patchouli");
        assert_eq!(strip_version("no_version.jar"), "no_version");
    }

    #[test]
    fn force_skip_matches() {
        let m = PackwizMod {
            filename: "embeddium-0.4.0.jar".into(),
            side: Side::Both, mode: "url".into(), url: None,
            project_id: None, file_id: None, modrinth_id: None,
            source_toml: PathBuf::new(),
        };
        assert!(m.is_force_skipped());

        let m2 = PackwizMod { filename: "regular-mod.jar".into(), ..m };
        assert!(!m2.is_force_skipped());
    }

    #[test]
    fn forgecdn_url_construction() {
        let m = PackwizMod {
            filename: "absolutely_stuffed.jar".into(),
            side: Side::Both,
            mode: "metadata:curseforge".into(),
            url: None,
            project_id: Some(1012437),
            file_id: Some(5443206),
            modrinth_id: None,
            source_toml: PathBuf::new(),
        };
        let urls = m.download_urls();
        assert_eq!(urls.len(), 2);
        assert_eq!(urls[0], "https://edge.forgecdn.net/files/5443/206/absolutely_stuffed.jar");
        assert_eq!(urls[1], "https://www.curseforge.com/api/v1/mods/1012437/files/5443206/download");
    }
}
