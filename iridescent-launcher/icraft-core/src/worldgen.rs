//! The worldgen catalog: which of the pack's config files shape newly
//! generated terrain, and what an operator should know before changing them.
//!
//! The Customizer's worldgen page and `icraft settings` list these files and
//! let single values be overridden through [`crate::overrides`]. Nothing here
//! knows a mod's keys: every setting, its description and its allowed range
//! are read from the file itself ([`crate::cfgedit`]), so a mod update that
//! adds a key needs no launcher change. The catalog only says which files
//! belong on the page, which part of a shared file is worldgen, and where
//! the sharp edges are.
//!
//! One source is not a config file: the placed features inside the pack's
//! worldgen datapack zip (`config/paxi/datapacks`), where the pack sets how
//! many veins of vanilla, Create and Thermal ore are tried per chunk. JSON has
//! no comments, so for those the catalog supplies what a config file would
//! say itself: which values are settings ([`NUMBERS_ONLY`]) and what they may
//! be ([`RANGES`]).
//!
//! What is deliberately NOT here: anything compiled into a jar (the
//! `iridescent_biomes` region weight, shown as a fixed line: [`FIXED`]), and
//! settings that change what a mod registers rather than what it generates.

use std::path::Path;

use crate::cfgedit::{same_value, Document, Entry, Kind};
use crate::config::ServerConfig;
use crate::overrides;

/// Shown wherever these settings are edited.
pub const NEW_CHUNKS_NOTE: &str = "These settings shape chunks as they are generated. Terrain that already exists keeps what it was generated with until it is regenerated; changing the biome layout or the terrain shape of a world in use leaves a visible seam where new chunks meet old ones.";

pub struct Source {
    /// Short name for the command line: `mekanism`, `adlods-deposits`.
    pub id: &'static str,
    pub group: &'static str,
    pub title: &'static str,
    /// `/`-separated, relative to the server dir. `{world}` is the level
    /// folder; a last part of `*.cfg` means every such file in the folder.
    pub path: &'static str,
    /// Only keys that start with one of these belong to worldgen (every key
    /// when empty).
    pub keys: &'static [&'static str],
    pub about: &'static str,
    /// (key prefix, warning). An empty prefix covers the whole file.
    pub cautions: &'static [(&'static str, &'static str)],
}

impl Source {
    pub fn shows(&self, key: &str) -> bool {
        self.keys.is_empty() || self.keys.iter().any(|prefix| key.starts_with(*prefix))
    }

    /// Is this entry one of the file's settings? As [`Source::shows`], and in a
    /// datapack file only the numbers are.
    pub fn shows_entry(&self, e: &Entry) -> bool {
        self.shows(&e.key) && (!NUMBERS_ONLY.contains(&self.id) || matches!(e.kind, Kind::Int | Kind::Float))
    }

    pub fn caution(&self, key: &str) -> Option<&'static str> {
        self.cautions.iter().find(|(prefix, _)| !prefix.is_empty() && key.starts_with(*prefix)).map(|(_, text)| *text)
    }

    /// A warning about the file as a whole.
    pub fn file_caution(&self) -> Option<&'static str> {
        self.cautions.iter().find(|(prefix, _)| prefix.is_empty()).map(|(_, text)| *text)
    }

    /// Why a setting is shown but not offered for change here.
    pub fn locked(&self, key: &str) -> Option<&'static str> {
        LOCKED.iter().find(|(id, prefix, _)| *id == self.id && key.starts_with(*prefix)).map(|(_, _, why)| *why)
    }
}

pub const GROUPS: &[&str] = &["Biome layout", "Terrain shape", "Ores"];

const RETROGEN: &str = "Retrogen. With enableRegeneration on, Mekanism adds its ores to chunks that ALREADY exist as they load, once per userWorldGenVersion. Ore it has added cannot be taken out again.";
const BUILD_HEIGHT: &str = "The overworld's build height, not terrain shape: it changes the dimension itself, for chunks that already exist too.";
const LAYOUT: &str = "Changes where every biome region falls: new chunks will not continue the biomes of the chunks beside them.";

/// Settings in catalog files that are shown but not offered for change:
/// (source id, key prefix, why). Checked against each mod's code 2026-10-11:
/// everything else in the catalog only changes how new chunks generate, or is
/// sent to players by the mod when they join. A server-only change to these
/// would not be one.
const LOCKED: &[(&str, &str, &str)] = &[
    ("tectonic", "global_terrain.min_y", BUILD_HEIGHT),
    ("tectonic", "global_terrain.max_y", BUILD_HEIGHT),
    ("tectonic", "general.snow_start_offset", "Each player's game reads its own copy of this to decide where snow falls, so it has to match the pack the players run. It is not a server-only setting."),
    ("tectonic", "minor_version", "The file's own format version."),
];

/// Catalog files where only the numbers are settings. The rest of a datapack
/// file is structure (`"type": "minecraft:count"`, `"feature": ...`): changing
/// it changes what the file is, and a file the game cannot read stops the
/// datapack from loading.
const NUMBERS_ONLY: &[&str] = &["datapack-ores"];

/// Ranges a file does not state itself: (source id, the end of the key, lowest,
/// highest). These are the game's own limits for a placed feature (a `count`
/// placement takes 0 to 256; a vertical anchor takes -2032 to 2031). NOT
/// checked by starting a server with a value outside them: the game is
/// expected to refuse the whole file.
const RANGES: &[(&str, &str, f64, f64)] = &[
    ("datapack-ores", ".count", 0.0, 256.0),
    ("datapack-ores", ".absolute", -2032.0, 2031.0),
    ("datapack-ores", ".above_bottom", -2032.0, 2031.0),
    ("datapack-ores", ".below_top", -2032.0, 2031.0),
];

/// A worldgen number that is in no file and cannot be changed from here, shown
/// so that nobody looks for it.
pub struct Fixed {
    pub group: &'static str,
    pub title: &'static str,
    pub value: &'static str,
    pub why: &'static str,
}

pub const FIXED: &[Fixed] = &[Fixed {
    group: "Biome layout",
    title: "The pack's cherry biomes: region weight",
    value: "7",
    why: "Compiled into the iridescent_biomes jar. This is the number in the pack's source when this launcher was built; it is not read from the jar. It is weighed against TerraBlender's vanilla weight and the Biomes O' Plenty weights. Changing it means rebuilding the jar.",
}];

pub const SOURCES: &[Source] = &[
    Source {
        id: "terrablender",
        group: "Biome layout",
        title: "TerraBlender: region size, vanilla share",
        path: "config/terrablender.toml",
        keys: &["generation_settings."],
        about: "How large each mod's patches of biomes are, and how much of the overworld and the Nether stays vanilla. A higher vanilla weight means more plains, forests and the other vanilla biomes; Biomes O' Plenty and the pack's own biomes share what is left.",
        cautions: &[("", LAYOUT)],
    },
    Source {
        id: "bop-weights",
        group: "Biome layout",
        title: "Biomes O' Plenty: region weights",
        path: "config/biomesoplenty/generation.toml",
        keys: &[],
        about: "How often Biomes O' Plenty regions come up, against the vanilla weight in TerraBlender's file.",
        cautions: &[("", LAYOUT)],
    },
    Source {
        id: "bop-biomes",
        group: "Biome layout",
        title: "Biomes O' Plenty: biomes on and off",
        path: "config/biomesoplenty/biome_toggles.json",
        keys: &[],
        about: "Which Biomes O' Plenty biomes generate at all. A biome switched off stops appearing in new chunks; where it already exists it stays.",
        cautions: &[],
    },
    Source {
        id: "aether-regions",
        group: "Biome layout",
        title: "The Aether: region size and weight",
        path: "config/aeroblender-common.toml",
        keys: &[],
        about: "The same two dials as TerraBlender's, for the Aether dimension.",
        cautions: &[("", LAYOUT)],
    },
    Source {
        id: "deep-aether",
        group: "Biome layout",
        title: "Deep Aether: biome weights",
        path: "config/deep_aether-common.toml",
        keys: &["Biomes."],
        about: "How much of the Aether is Deep Aether's, and which of its biomes generate.",
        cautions: &[("", LAYOUT)],
    },
    Source {
        id: "ars-archwood",
        group: "Biome layout",
        title: "Ars Nouveau: archwood forest weight",
        path: "config/ars_nouveau-common.toml",
        keys: &["general.archwoodForest"],
        about: "How often the archwood forest comes up.",
        cautions: &[],
    },
    Source {
        id: "tectonic",
        group: "Terrain shape",
        title: "Tectonic: continents, mountains, caves",
        path: "config/tectonic.json",
        keys: &[],
        about: "The shape of the land itself: how tall mountains are, how big continents and oceans are, which cave types carve.",
        cautions: &[("", "New chunks will not line up with old ones: expect cliffs where they meet.")],
    },
    Source {
        id: "mekanism",
        group: "Ores",
        title: "Mekanism: ore veins",
        path: "config/Mekanism/world.toml",
        keys: &[],
        about: "Tin, osmium, uranium, fluorite, lead and salt: whether each generates, how many veins per chunk, how big, and between which heights. Tin and lead also come from Thermal, and all of them again as Large Ore Deposits.",
        cautions: &[("world_generation.enableRegeneration", RETROGEN), ("world_generation.userWorldGenVersion", RETROGEN)],
    },
    Source {
        id: "adlods",
        group: "Ores",
        title: "Large Ore Deposits: global",
        path: "config/adlods-common.toml",
        keys: &[],
        about: "Multipliers for the size and frequency of every large deposit, and switches for whole classes of deposits and veins.",
        cautions: &[],
    },
    Source {
        id: "adlods-deposits",
        group: "Ores",
        title: "Large Ore Deposits: each deposit",
        path: "config/adlods/Deposits/*.cfg",
        keys: &[],
        about: "One file per large deposit. rarity is in chunks: 1000 means about one deposit per 1000 chunks, so a HIGHER number is rarer.",
        cautions: &[],
    },
    Source {
        id: "adlods-vanilla",
        group: "Ores",
        title: "Large Ore Deposits: ordinary veins",
        path: "config/adlods/VanillaOres/*.cfg",
        keys: &[],
        about: "One file per ordinary ore vein. Each is set to `vanilla` here, which leaves the vein to the game and to the pack's datapack; the numbers in a file only count once its generation is set to CUSTOM.",
        cautions: &[],
    },
    Source {
        id: "adlods-geodes",
        group: "Ores",
        title: "Large Ore Deposits: geodes",
        path: "config/adlods/Geodes/*.cfg",
        keys: &[],
        about: "One file per geode.",
        cautions: &[],
    },
    Source {
        id: "thermal",
        group: "Ores",
        title: "Thermal: which ores and features generate",
        path: "config/thermal-common.toml",
        keys: &["World."],
        about: "On / off for Thermal's tin, lead, silver, nickel, apatite, cinnabar, niter, sulfur, oil sand and rubberwood. How much of each generates is set in the pack's datapack, not here.",
        cautions: &[],
    },
    Source {
        id: "create",
        group: "Ores",
        title: "Create: worldgen on or off",
        path: "config/create-common.toml",
        keys: &["worldgen."],
        about: "One switch for everything Create generates (zinc ore, the decorative stones).",
        cautions: &[],
    },
    Source {
        id: "datapack-ores",
        group: "Ores",
        title: "Pack datapack: ordinary ore veins",
        path: "config/paxi/datapacks/icraft_worldgen_overrides.zip!/data/*/worldgen/placed_feature/*.json",
        keys: &[],
        about: "Vanilla iron, copper and ancient debris, Create zinc, and Thermal tin, lead, silver and nickel: how many veins are tried per chunk and between which heights. `count` is the tries per chunk. Under the height step, `max_inclusive` is the top of the band and `min_inclusive` the bottom; `absolute` is a Y level, `above_bottom` and `below_top` count from the world's floor and ceiling. The pack sets these in a datapack, which is read when the server starts.",
        cautions: &[],
    },
    Source {
        id: "ore-excavation",
        group: "Ores",
        title: "Create Ore Excavation: drill veins",
        path: "{world}/serverconfig/createoreexcavation-server.toml",
        keys: &[],
        about: "The veins the drilling machine works: whether they run out, how much a finite one holds, how many machines may share one. This file belongs to the world, and the pack does not ship it.",
        cautions: &[("", "Not a new-chunks setting: the mod reads these while the server runs, so veins that already exist follow the new values from the next start.")],
    },
];

/// A catalog file that exists in this install.
pub struct CatalogFile {
    pub source: &'static Source,
    /// Relative to the server dir, `/`-separated.
    pub rel: String,
    /// The source's title, or the file's own name where a source is a folder.
    pub label: String,
    /// What the command line calls it: `mekanism`, `adlods-deposits/osmium`.
    pub name: String,
}

/// Every catalog file present under `cfg`, in catalog order.
pub fn files(cfg: &ServerConfig) -> Vec<CatalogFile> {
    let level = overrides::normalize(&cfg.level_name());
    let mut out = Vec::new();
    for source in SOURCES {
        let path = source.path.replace("{world}", &level);
        if let Some(at) = path.to_ascii_lowercase().find(overrides::ZIP_SEPARATOR) {
            // Files inside a datapack zip: `data/<namespace>/.../<name>.json`.
            let zip = &path[..at + 4];
            let pattern = &path[at + overrides::ZIP_SEPARATOR.len()..];
            for inner in zip_members(&join(&cfg.server_dir, zip), pattern) {
                let parts: Vec<&str> = inner.split('/').collect();
                let stem = parts.last().map_or("", |file| file.trim_end_matches(".json"));
                let namespace = parts.get(1).copied().unwrap_or("");
                out.push(CatalogFile {
                    source,
                    rel: format!("{zip}!/{inner}"),
                    label: format!("{namespace}: {stem}"),
                    name: format!("{}/{namespace}/{stem}", source.id),
                });
            }
            continue;
        }
        match path.rsplit_once('/') {
            Some((folder, pattern)) if pattern.starts_with("*.") => {
                let ext = pattern[1..].to_ascii_lowercase();
                let mut names: Vec<String> = std::fs::read_dir(join(&cfg.server_dir, folder))
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|e| e.file_type().map_or(false, |t| t.is_file()))
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.to_ascii_lowercase().ends_with(&ext))
                    .collect();
                names.sort_by_key(|n| n.to_ascii_lowercase());
                for file in names {
                    let stem = file[..file.len() - ext.len()].to_string();
                    out.push(CatalogFile { source, rel: format!("{folder}/{file}"), name: format!("{}/{stem}", source.id), label: stem });
                }
            }
            _ => {
                if join(&cfg.server_dir, &path).is_file() {
                    out.push(CatalogFile { source, rel: path, label: source.title.to_string(), name: source.id.to_string() });
                }
            }
        }
    }
    out
}

/// The files of a zip whose path matches `pattern`, sorted. A `*` part of the
/// pattern is any one folder; a last part of `*.json` is any such file. A zip
/// that is missing or unreadable has none.
fn zip_members(zip: &Path, pattern: &str) -> Vec<String> {
    let wanted: Vec<&str> = pattern.split('/').collect();
    let matches = |name: &str| {
        let parts: Vec<&str> = name.split('/').collect();
        parts.len() == wanted.len()
            && parts.iter().zip(&wanted).all(|(part, want)| match want.strip_prefix('*') {
                Some(end) => !part.is_empty() && part.ends_with(end),
                None => part == want,
            })
    };
    let Ok(file) = std::fs::File::open(zip) else { return Vec::new() };
    let Ok(archive) = zip::ZipArchive::new(file) else { return Vec::new() };
    let mut found: Vec<String> = archive.file_names().filter(|name| matches(name)).map(str::to_string).collect();
    found.sort();
    found
}

fn join(base: &Path, rel: &str) -> std::path::PathBuf {
    rel.split('/').fold(base.to_path_buf(), |p, part| p.join(part))
}

/// What a command line names: a catalog file, or any file overrides may touch.
pub struct Target {
    pub rel: String,
    pub source: Option<&'static Source>,
    pub label: String,
}

/// `mekanism`, `adlods-deposits/osmium`, or a path such as
/// `config/Mekanism/world.toml` or `server.properties`.
pub fn target(cfg: &ServerConfig, name: &str) -> Target {
    let wanted = overrides::normalize(name);
    let found = files(cfg).into_iter().find(|f| f.name.eq_ignore_ascii_case(&wanted) || f.rel.eq_ignore_ascii_case(&wanted));
    match found {
        Some(f) => Target { rel: f.rel, source: Some(f.source), label: format!("{} ({})", f.source.title, f.name) },
        None => Target { rel: wanted.clone(), source: None, label: wanted },
    }
}

/// Put a new value on the override list ([`overrides::stage`]), unless the
/// catalog locks that setting.
pub fn stage(cfg: &ServerConfig, target: &Target, key: &str, input: &str, by: &str) -> Result<overrides::Staged, String> {
    if let Some(why) = target.source.and_then(|s| s.locked(key)) {
        return Err(format!("`{key}` is not changed from here. {why}"));
    }
    if let Some(source) = target.source {
        // What only the catalog knows: which values of a datapack file are
        // settings, and the ranges such a file cannot state.
        let doc = read(cfg, target)?;
        if let Some(e) = doc.get(key) {
            if !source.shows_entry(e) && source.shows(key) {
                return Err(format!("`{key}` is part of the file's structure, not a setting: only its numbers are changed from here"));
            }
            e.encode(input)?;
        }
    }
    overrides::stage(cfg, &target.rel, key, input, by)
}

/// Read a file as the page and the command line show it: as
/// [`overrides::read_document`] does, with the ranges only the catalog knows.
pub fn read(cfg: &ServerConfig, target: &Target) -> Result<Document, String> {
    let mut doc = overrides::read_document(cfg, &target.rel)?;
    if let Some(source) = target.source {
        for e in &mut doc.entries {
            if let Some((_, _, min, max)) = RANGES.iter().find(|(id, end, _, _)| *id == source.id && e.key.ends_with(*end)) {
                e.min = Some(*min);
                e.max = Some(*max);
            }
        }
    }
    Ok(doc)
}

/// `icraft settings files`: the catalog, as text.
pub fn files_text(cfg: &ServerConfig) -> String {
    let found = files(cfg);
    let store = overrides::Store::load(&cfg.server_dir).unwrap_or_default();
    let mut out = String::new();
    for group in GROUPS {
        out.push_str(&format!("{group}\n"));
        for source in SOURCES.iter().filter(|s| s.group == *group) {
            let mine: Vec<&CatalogFile> = found.iter().filter(|f| std::ptr::eq(f.source, source)).collect();
            if mine.is_empty() {
                out.push_str(&format!("  {:<28} (not in this install: {})\n", source.id, source.path));
                continue;
            }
            for f in mine {
                let settings = overrides::read_document(cfg, &f.rel).map_or(0, |d| d.entries.iter().filter(|e| e.editable() && source.shows_entry(e)).count());
                let yours = store.overrides.iter().filter(|o| o.file == f.rel).count();
                let yours = if yours > 0 { format!("   {yours} of yours") } else { String::new() };
                out.push_str(&format!("  {:<28} {settings:>3} setting(s){yours}   {}\n", f.name, f.rel));
            }
        }
    }
    for fixed in FIXED {
        out.push_str(&format!("\nFixed, not a setting: {} = {} ({})\n", fixed.title, fixed.value, fixed.why));
    }
    out.push_str("\nAny other file under config/, defaultconfigs/ or <world>/serverconfig/, and server.properties, can be named by its path.\n");
    out
}

/// One line for a setting: value, range, and how it stands if overridden.
fn entry_line(e: &Entry, yours: Option<&overrides::Override>, caution: Option<&str>, locked: Option<&str>) -> String {
    let mut line = format!("  {} = {}", e.name, e.value());
    let range = e.range_text();
    if !range.is_empty() {
        line.push_str(&format!("   ({range})"));
    } else if !e.allowed.is_empty() {
        line.push_str(&format!("   ({})", e.allowed.join(" | ")));
    }
    if !e.editable() {
        line.push_str("   [list: edit the file]");
    }
    if let Some(why) = locked {
        line.push_str(&format!("   [locked]\n      - {why}"));
    }
    if let Some(o) = yours {
        let pack = o.base.as_deref().map_or("?".to_string(), |b| e.show(b));
        if o.revert {
            line.push_str(&format!("   <- being reset to the pack's {pack} at the next server start"));
        } else if same_value(&e.raw, &o.value) {
            line.push_str(&format!("   <- YOURS (the pack's: {pack})"));
        } else {
            line.push_str(&format!("   <- YOURS = {} at the next server start (the pack's: {pack})", e.show(&o.value)));
        }
    }
    if let Some(text) = caution {
        line.push_str(&format!("\n      ! {text}"));
    }
    line
}

/// `icraft settings show`: every setting of one file. `all` ignores the
/// catalog's "worldgen keys only" filter.
pub fn show_text(cfg: &ServerConfig, target: &Target, all: bool) -> Result<String, String> {
    let doc = read(cfg, target)?;
    let store = overrides::Store::load(&cfg.server_dir)?;
    let mut out = format!("{}\n{}\n", target.rel, target.label);
    if let Some(source) = target.source {
        out.push_str(&format!("{}\n", source.about));
        if let Some(text) = source.file_caution() {
            out.push_str(&format!("! {text}\n"));
        }
    }
    for problem in &doc.problems {
        out.push_str(&format!("! not read: {problem}\n"));
    }
    let mut section: Option<&str> = None;
    let mut shown = 0;
    for e in &doc.entries {
        if !all && !target.source.map_or(true, |s| s.shows_entry(e)) {
            continue;
        }
        if section != Some(e.section.as_str()) {
            section = Some(e.section.as_str());
            // A JSON section is a position in a list: say what stands there.
            let about = doc.sections.iter().find(|(path, _)| path == &e.section).map_or("", |(_, text)| text.as_str());
            if doc.format == crate::cfgedit::Format::Json && !about.is_empty() {
                out.push_str(&format!("\n[{}]   {about}\n", e.section));
            } else {
                out.push_str(&format!("\n[{}]\n", e.section));
            }
        }
        let caution = target.source.and_then(|s| s.caution(&e.key));
        let locked = target.source.and_then(|s| s.locked(&e.key));
        out.push_str(&entry_line(e, store.get(&target.rel, &e.key), caution, locked));
        out.push('\n');
        shown += 1;
    }
    out.push_str(&format!("\n{shown} setting(s). The key to pass to `settings set` is the [section] and the name joined by a dot.\n"));
    Ok(out)
}

/// The same settings as JSON (one object per setting), for scripts.
pub fn show_json(cfg: &ServerConfig, target: &Target, all: bool) -> Result<String, String> {
    let doc = read(cfg, target)?;
    let entries: Vec<&Entry> = doc.entries.iter().filter(|e| all || target.source.map_or(true, |s| s.shows_entry(e))).collect();
    serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())
}

/// `icraft settings status`: the overrides and where each stands.
pub fn status_text(cfg: &ServerConfig) -> String {
    let listed = match overrides::status(cfg) {
        Ok(listed) => listed,
        Err(why) => return format!("{why}\nNothing is applied until that file is repaired or removed.\n"),
    };
    if listed.is_empty() {
        return "No local config overrides: every config file is as the pack ships it.\n".to_string();
    }
    let mut out = format!("{}   ({})\n", overrides::headline(&cfg.server_dir).unwrap_or_default(), overrides::FILE);
    let mut file = "";
    for l in &listed {
        if l.item.file != file {
            file = &l.item.file;
            out.push_str(&format!("  {file}\n"));
        }
        let pack = l.item.base.as_deref().unwrap_or("?");
        let detail = match (l.state, l.in_file.as_deref()) {
            (overrides::State::Waiting, Some(now)) => format!("{} (the file has {now})", l.state.text()),
            _ => l.state.text().to_string(),
        };
        out.push_str(&format!("    {} = {}   (the pack's: {pack})   {detail}\n", l.item.key, l.item.value));
    }
    let guarded = overrides::guarded_keys(cfg);
    if !guarded.is_empty() {
        out.push_str(&format!(
            "Guarded: the launcher does not start the server unless server.properties holds {} = true.\n",
            guarded.join(", ")
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::fs;

    fn fixture(name: &str) -> (std::path::PathBuf, ServerConfig) {
        let dir = std::env::temp_dir().join(format!("icraft-worldgen-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let write = |rel: &str, text: &str| {
            let path = join(&dir, rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        };
        write("server.properties", "level-name=world\n");
        write("config/Mekanism/world.toml", "[world_generation]\n\tenableRegeneration = false\n\n\t[world_generation.tin]\n\t\t#Range: 1 ~ 256\n\t\tperChunk = 12\n");
        write("config/thermal-common.toml", "[World]\n\t[World.Features.Tin]\n\t\tEnable = true\n[Other]\n\tThing = 4\n");
        write("config/adlods/Deposits/tin.cfg", "Deposit {\n    #  [range: 0 ~ 256000, default: 0]\n    I:rarity=2496\n}\n");
        write("config/adlods/Deposits/Osmium.cfg", "Deposit {\n    #  [range: 0 ~ 256000, default: 0]\n    I:rarity=1829\n}\n");
        write("config/adlods/Deposits/notes.txt", "not a deposit");
        write("world/serverconfig/createoreexcavation-server.toml", "#Range: > 1\nfiniteAmountBase = 1000\n");
        let cfg = ServerConfig::from_path(&dir);
        (dir, cfg)
    }

    #[test]
    fn the_catalog_is_well_formed() {
        let ids: BTreeSet<&str> = SOURCES.iter().map(|s| s.id).collect();
        assert_eq!(ids.len(), SOURCES.len(), "duplicate ids");
        let cfg = ServerConfig::from_path(std::env::temp_dir().join("icraft-worldgen-no-such-dir"));
        for s in SOURCES {
            assert!(GROUPS.contains(&s.group), "{}: group {}", s.id, s.group);
            assert!(!s.id.contains('/') && !s.about.is_empty());
            // Every catalog path is one the override layer agrees to write.
            let sample = s.path.replace("{world}", "world").replace("*.cfg", "x.cfg");
            assert!(overrides::resolve(&cfg, &sample).is_ok(), "{}: {sample}", s.id);
        }
    }

    #[test]
    fn files_found_named_and_filtered() {
        let (dir, cfg) = fixture("files");
        let found = files(&cfg);
        let names: Vec<&str> = found.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["mekanism", "adlods-deposits/Osmium", "adlods-deposits/tin", "thermal", "ore-excavation"]);
        assert_eq!(found[1].rel, "config/adlods/Deposits/Osmium.cfg");
        assert_eq!(found[1].label, "Osmium");
        assert_eq!(found[4].rel, "world/serverconfig/createoreexcavation-server.toml");

        // By catalog name, by path, or any other config file by path.
        assert_eq!(target(&cfg, "MEKANISM").rel, "config/Mekanism/world.toml");
        assert_eq!(target(&cfg, "adlods-deposits/tin").rel, "config/adlods/Deposits/tin.cfg");
        assert!(target(&cfg, "config\\Mekanism\\world.toml").source.is_some());
        let other = target(&cfg, "server.properties");
        assert!(other.source.is_none());
        assert_eq!(other.rel, "server.properties");

        // Thermal's file is shared: only its World table is worldgen.
        let thermal = target(&cfg, "thermal");
        let text = show_text(&cfg, &thermal, false).unwrap();
        assert!(text.contains("Enable = true") && !text.contains("Thing = 4"), "{text}");
        assert!(show_text(&cfg, &thermal, true).unwrap().contains("Thing = 4"));
        let json: serde_json::Value = serde_json::from_str(&show_json(&cfg, &thermal, false).unwrap()).unwrap();
        assert_eq!(json.as_array().unwrap().len(), 1);
        assert_eq!(json[0]["key"], "World.Features.Tin.Enable");

        // The retrogen switch carries its warning.
        let mek = show_text(&cfg, &target(&cfg, "mekanism"), false).unwrap();
        assert!(mek.contains("enableRegeneration = false\n      ! Retrogen"), "{mek}");
        assert!(mek.contains("perChunk = 12   (1 to 256)"), "{mek}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn locked_settings_are_shown_and_refused() {
        let (dir, cfg) = fixture("locked");
        fs::write(join(&dir, "config/tectonic.json"), "{\n  \"global_terrain\": {\n    \"max_y\": 320,\n    \"vertical_scale\": 0.38\n  }\n}\n").unwrap();
        let tectonic = target(&cfg, "tectonic");
        assert!(stage(&cfg, &tectonic, "global_terrain.max_y", "384", "t").unwrap_err().contains("build height"));
        assert_eq!(stage(&cfg, &tectonic, "global_terrain.vertical_scale", "0.5", "t"), Ok(overrides::Staged::Saved));
        let text = show_text(&cfg, &tectonic, false).unwrap();
        assert!(text.contains("max_y = 320   [locked]"), "{text}");
        assert!(text.contains("vertical_scale = 0.38   <- YOURS = 0.5 at the next server start (the pack's: 0.38)"), "{text}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn datapack_ore_counts_are_files_of_numbers_with_the_games_ranges() {
        use std::io::Write;
        let (dir, cfg) = fixture("datapack");
        let iron = "{\r\n  \"feature\": \"minecraft:ore_iron\",\r\n  \"placement\": [\r\n    {\r\n      \"type\": \"minecraft:count\",\r\n      \"count\": 113\r\n    },\r\n    {\r\n      \"type\": \"minecraft:height_range\",\r\n      \"height\": {\r\n        \"type\": \"minecraft:trapezoid\",\r\n        \"max_inclusive\": {\r\n          \"absolute\": 384\r\n        },\r\n        \"min_inclusive\": {\r\n          \"above_bottom\": 0\r\n        }\r\n      }\r\n    }\r\n  ]\r\n}";
        let folder = join(&dir, "config/paxi/datapacks");
        fs::create_dir_all(&folder).unwrap();
        let mut zip = zip::ZipWriter::new(fs::File::create(folder.join("icraft_worldgen_overrides.zip")).unwrap());
        for (name, text) in [
            ("pack.mcmeta", "{}"),
            ("data/thermal/worldgen/placed_feature/tin_ore.json", "{\"placement\": [{\"type\": \"minecraft:count\", \"count\": 5}]}"),
            ("data/minecraft/worldgen/placed_feature/ore_iron_upper.json", iron),
            ("data/icraft/worldgen/structure_set/cherry_villages.json", "{\"spacing\": 10}"),
            ("data/minecraft/worldgen/placed_feature/deeper/nested.json", "{\"count\": 1}"),
        ] {
            zip.start_file(name, zip::write::FileOptions::default()).unwrap();
            zip.write_all(text.as_bytes()).unwrap();
        }
        zip.finish().unwrap();

        // Only the placed features, by namespace and name.
        let found = files(&cfg);
        let names: Vec<&str> = found.iter().map(|f| f.name.as_str()).filter(|n| n.starts_with("datapack-ores")).collect();
        assert_eq!(names, ["datapack-ores/minecraft/ore_iron_upper", "datapack-ores/thermal/tin_ore"]);
        let file = found.iter().find(|f| f.name == "datapack-ores/minecraft/ore_iron_upper").unwrap();
        assert_eq!(file.rel, "config/paxi/datapacks/icraft_worldgen_overrides.zip!/data/minecraft/worldgen/placed_feature/ore_iron_upper.json");
        assert_eq!(file.label, "minecraft: ore_iron_upper");

        // The numbers, with the game's ranges; none of the structure.
        let iron_file = target(&cfg, "datapack-ores/minecraft/ore_iron_upper");
        let text = show_text(&cfg, &iron_file, false).unwrap();
        assert!(text.contains("[placement[0]]   minecraft:count\n  count = 113   (0 to 256)"), "{text}");
        assert!(text.contains("absolute = 384   (-2032 to 2031)") && text.contains("above_bottom = 0   (-2032 to 2031)"), "{text}");
        assert!(!text.contains("type =") && !text.contains("feature ="), "{text}");
        assert!(text.contains("3 setting(s)"), "{text}");
        assert!(show_text(&cfg, &iron_file, true).unwrap().contains("feature = minecraft:ore_iron"));

        // Refused before anything is saved: out of the game's range, not a
        // number, and the structure of the file.
        assert!(stage(&cfg, &iron_file, "placement[0].count", "300", "t").unwrap_err().contains("more than 256"));
        assert!(stage(&cfg, &iron_file, "placement[0].count", "9.5", "t").is_err());
        assert!(stage(&cfg, &iron_file, "placement[0].type", "minecraft:other", "t").unwrap_err().contains("structure"));
        assert!(stage(&cfg, &iron_file, "feature", "minecraft:ore_gold", "t").unwrap_err().contains("structure"));
        assert!(status_text(&cfg).starts_with("No local config overrides"));
        assert_eq!(stage(&cfg, &iron_file, "placement[0].count", "90", "t"), Ok(overrides::Staged::Saved));
        let text = show_text(&cfg, &iron_file, false).unwrap();
        assert!(text.contains("count = 113   (0 to 256)   <- YOURS = 90 at the next server start (the pack's: 113)"), "{text}");

        let listing = files_text(&cfg);
        assert!(listing.contains("datapack-ores/minecraft/ore_iron_upper") && listing.contains("3 setting(s)   1 of yours"), "{listing}");
        assert!(listing.contains("Fixed, not a setting: The pack's cherry biomes: region weight = 7"), "{listing}");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn overrides_show_in_the_listings() {
        let (dir, cfg) = fixture("listings");
        assert!(status_text(&cfg).starts_with("No local config overrides"));
        overrides::stage(&cfg, "config/Mekanism/world.toml", "world_generation.tin.perChunk", "20", "test").unwrap();
        let status = status_text(&cfg);
        assert!(status.contains("1 local config override(s) in 1 file(s)"), "{status}");
        assert!(status.contains("world_generation.tin.perChunk = 20   (the pack's: 12)   waiting for the next server start (the file has 12)"), "{status}");
        let mek = show_text(&cfg, &target(&cfg, "mekanism"), false).unwrap();
        assert!(mek.contains("perChunk = 12   (1 to 256)   <- YOURS = 20 at the next server start (the pack's: 12)"), "{mek}");
        assert!(files_text(&cfg).contains("1 of yours"));
        assert!(files_text(&cfg).contains("(not in this install: config/tectonic.json)"));
        let _ = fs::remove_dir_all(dir);
    }
}
