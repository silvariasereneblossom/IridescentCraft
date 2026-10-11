//! Local config overrides: this server's own values for keys in the pack's
//! config files.
//!
//! The pack's sync owns the config files. A full-zip sync rewrites all of them
//! and a diff sync rewrites any the pack changed, so a value an operator edits
//! in place is silently gone some restart later. The override layer is where
//! such a value lives instead:
//!
//!   * `.icraft_config_overrides.json`, next to `server.properties` and never
//!     synced, lists each override: file, key, the value wanted, and the pack's
//!     value it replaces (`base`).
//!   * [`apply_at_start`] runs before every JVM start (from
//!     `run::launch_server_inner`, so after whatever sync preceded it) and puts
//!     every override back into its file. Without the file it does nothing.
//!   * Config files are only ever written while no JVM has the world: Forge
//!     watches them, reloads on change, and answers a half-written file by
//!     resetting it to defaults. A change made while the server runs is kept
//!     in the list and lands at the next start.
//!   * An override is dropped by writing `base` back, so "reset to the pack's
//!     value" works without the network.
//!   * Only `config/`, `defaultconfigs/`, `<world>/serverconfig/` and
//!     `server.properties` can be named. Nothing here can reach a region file.
//!
//! Every change that reaches a file is appended to
//! `config-overrides/history.log`, and the file as it was before its first
//! override is kept under `config-overrides/originals/`. Changes of value (not
//! re-applications) are also recorded in `<world>/.icraft_world.json`, because
//! most of these settings shape newly generated chunks only: a later
//! regeneration needs to know when the rules changed.
//!
//! The layer is general (TOML, `.cfg`, JSON, `.properties`). The worldgen page
//! of the Customizer tab is its first user; see [`crate::worldgen`].

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::cfgedit::{same_value, Document, Format};
use crate::config::ServerConfig;

/// The list of overrides, next to `server.properties`.
pub const FILE: &str = ".icraft_config_overrides.json";
/// History and kept originals, in the server dir.
pub const DIR: &str = "config-overrides";
pub const HISTORY_FILE: &str = "history.log";
pub const ORIGINALS_DIR: &str = "originals";
/// Per-world record (shared with later Customizer phases: other keys in it are
/// preserved).
pub const WORLD_MANIFEST: &str = ".icraft_world.json";

const ABOUT: &str = "This server's own config values, kept apart from the pack's files. The launcher writes them back into the config files before every server start. Edit them on the Customizer tab or with `icraft settings`; `base` is the pack's value each one replaces.";

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Override {
    /// Relative to the server dir, `/`-separated.
    pub file: String,
    pub key: String,
    /// The value wanted, as it stands in the file (a TOML string with quotes).
    pub value: String,
    /// The pack's value, as last seen in the file when it did not hold ours.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    /// The value this layer last wrote to the file. `None` until the first
    /// time; differs from `value` while a change waits for a stopped server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub written: Option<String>,
    /// Waiting to be put back to `base`, after which the entry goes.
    #[serde(default, skip_serializing_if = "is_false")]
    pub revert: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub set_at: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub by: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Store {
    #[serde(default)]
    pub version: u32,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub about: String,
    #[serde(default)]
    pub overrides: Vec<Override>,
}

impl Store {
    /// No file is an empty list. A file that does not parse is an error: the
    /// caller must not act as if there were no overrides.
    pub fn load(server_dir: &Path) -> Result<Store, String> {
        let bytes = match fs::read(server_dir.join(FILE)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Store::default()),
            Err(e) => return Err(format!("{FILE} cannot be read: {e}")),
        };
        let text = String::from_utf8_lossy(&bytes);
        let mut store: Store =
            serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| format!("{FILE} does not parse: {e}"))?;
        for o in &mut store.overrides {
            o.file = normalize(&o.file);
        }
        Ok(store)
    }

    /// An empty list removes the file.
    pub fn save(&self, server_dir: &Path) -> Result<(), String> {
        let path = server_dir.join(FILE);
        if self.overrides.is_empty() {
            return match fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(format!("{FILE} could not be removed: {e}")),
            };
        }
        let mut out = self.clone();
        out.version = 1;
        out.about = ABOUT.to_string();
        out.overrides.sort_by(|a, b| (a.file.as_str(), a.key.as_str()).cmp(&(b.file.as_str(), b.key.as_str())));
        let json = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
        write_atomic(&path, format!("{json}\n").as_bytes()).map_err(|e| format!("{FILE} could not be written: {e}"))
    }

    pub fn get(&self, file: &str, key: &str) -> Option<&Override> {
        self.overrides.iter().find(|o| o.file == file && o.key == key)
    }
}

/// `config\Mekanism\world.toml` and `/config/Mekanism/world.toml` name the
/// same file.
pub fn normalize(rel: &str) -> String {
    rel.trim().replace('\\', "/").trim_matches('/').to_string()
}

/// The file an override may name, or why it may not.
pub fn resolve(cfg: &ServerConfig, rel: &str) -> Result<(PathBuf, Format), String> {
    let rel = normalize(rel);
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.iter().any(|p| p.is_empty() || *p == "." || *p == ".." || p.contains(':')) {
        return Err(format!("`{rel}` is not a plain path inside the server folder"));
    }
    let lower = rel.to_ascii_lowercase();
    let serverconfig = format!("{}/serverconfig/", normalize(&cfg.level_name()).to_ascii_lowercase());
    let allowed = lower == "server.properties"
        || (parts.len() >= 2 && (lower.starts_with("config/") || lower.starts_with("defaultconfigs/")))
        || lower.starts_with(&serverconfig);
    if !allowed {
        return Err(format!(
            "`{rel}` is not under config/, defaultconfigs/ or <world>/serverconfig/, and is not server.properties: overrides are not written there"
        ));
    }
    let format = Format::of_path(&rel).ok_or_else(|| format!("`{rel}`: only .toml, .cfg, .json and .properties files can carry overrides"))?;
    let mut path = cfg.server_dir.clone();
    for part in &parts {
        path.push(part);
    }
    Ok((path, format))
}

fn read_text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "the file does not exist".to_string()
        } else {
            format!("cannot be read: {e}")
        }
    })?;
    String::from_utf8(bytes).map_err(|_| "is not UTF-8 text".to_string())
}

/// Read and parse a file overrides may name.
pub fn read_document(cfg: &ServerConfig, rel: &str) -> Result<Document, String> {
    let (path, format) = resolve(cfg, rel)?;
    let text = read_text(&path).map_err(|why| format!("{}: {why}", normalize(rel)))?;
    Ok(Document::parse(format, &text))
}

/// Write beside the target and rename over it: a reader sees the old file or
/// the new one, never half of either.
fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!("{name}.icraft-tmp"));
    let written = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written
}

fn now_text() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S %:z").to_string()
}

// =============================================================================
// Changing the list
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Staged {
    /// The override is in the list (new, or with a new value).
    Saved,
    /// Already that value: nothing changed.
    Unchanged,
    /// The value asked for is the pack's own: the override is being dropped.
    BackToPack,
}

/// Put `input` (as a person types it) on the list for `file` / `key`. The
/// config file is not touched: [`apply_when_stopped`] does that.
pub fn stage(cfg: &ServerConfig, file: &str, key: &str, input: &str, by: &str) -> Result<Staged, String> {
    let file = normalize(file);
    let doc = read_document(cfg, &file)?;
    let entry = doc.get(key).ok_or_else(|| format!("{file} has no key `{key}`"))?;
    let raw = entry.encode(input)?;
    let mut store = Store::load(&cfg.server_dir)?;
    let at = store.overrides.iter().position(|o| o.file == file && o.key == key);
    let outcome = match at {
        Some(i) => {
            let pack = store.overrides[i].base.clone().unwrap_or_else(|| entry.raw.clone());
            if same_value(&raw, &pack) {
                if store.overrides[i].written.is_some() {
                    store.overrides[i].revert = true;
                } else {
                    store.overrides.remove(i);
                }
                Staged::BackToPack
            } else if !store.overrides[i].revert && same_value(&raw, &store.overrides[i].value) {
                Staged::Unchanged
            } else {
                let o = &mut store.overrides[i];
                o.value = raw;
                o.revert = false;
                o.set_at = now_text();
                o.by = by.to_string();
                Staged::Saved
            }
        }
        None if same_value(&raw, &entry.raw) => Staged::Unchanged,
        None => {
            store.overrides.push(Override {
                file,
                key: key.to_string(),
                value: raw,
                base: Some(entry.raw.clone()),
                written: None,
                revert: false,
                set_at: now_text(),
                by: by.to_string(),
            });
            Staged::Saved
        }
    };
    if outcome != Staged::Unchanged {
        store.save(&cfg.server_dir)?;
    }
    Ok(outcome)
}

/// Ask for the pack's value back. `Ok(false)` when there was no override.
/// An override that never reached the file just leaves the list; one that did
/// is marked, and [`apply_when_stopped`] writes the pack's value back.
pub fn reset(cfg: &ServerConfig, file: &str, key: &str) -> Result<bool, String> {
    let file = normalize(file);
    let mut store = Store::load(&cfg.server_dir)?;
    let Some(i) = store.overrides.iter().position(|o| o.file == file && o.key == key) else {
        return Ok(false);
    };
    if store.overrides[i].written.is_some() {
        store.overrides[i].revert = true;
    } else {
        store.overrides.remove(i);
    }
    store.save(&cfg.server_dir)?;
    Ok(true)
}

// =============================================================================
// Where each override stands
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum State {
    /// The file holds the value.
    InFile,
    /// The file holds something else: written before the next server start.
    Waiting,
    /// Being dropped: the pack's value goes back before the next server start.
    WaitingReset,
    MissingFile,
    MissingKey,
}

impl State {
    pub fn text(self) -> &'static str {
        match self {
            State::InFile => "in the file",
            State::Waiting => "waiting for the next server start",
            State::WaitingReset => "being reset at the next server start",
            State::MissingFile => "THE FILE IS MISSING",
            State::MissingKey => "THE FILE HAS NO SUCH KEY",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Listed {
    pub item: Override,
    pub state: State,
    /// What the file holds for the key right now.
    pub in_file: Option<String>,
}

/// Every override with where it stands. Reads the config files; writes nothing.
pub fn status(cfg: &ServerConfig) -> Result<Vec<Listed>, String> {
    let store = Store::load(&cfg.server_dir)?;
    let mut docs: BTreeMap<String, Option<Document>> = BTreeMap::new();
    let mut out = Vec::new();
    for o in store.overrides {
        let doc = docs.entry(o.file.clone()).or_insert_with(|| read_document(cfg, &o.file).ok());
        let (state, in_file) = match doc {
            None => (State::MissingFile, None),
            Some(doc) => match doc.get(&o.key) {
                None => (State::MissingKey, None),
                Some(entry) => {
                    let state = if o.revert {
                        State::WaitingReset
                    } else if same_value(&entry.raw, &o.value) {
                        State::InFile
                    } else {
                        State::Waiting
                    };
                    (state, Some(entry.raw.clone()))
                }
            },
        };
        out.push(Listed { item: o, state, in_file });
    }
    Ok(out)
}

/// The files that carry an override, lowercased, for deploy-parity checks: a
/// hash mismatch on one of these is intended, not drift.
pub fn overridden_files(server_dir: &Path) -> BTreeSet<String> {
    Store::load(server_dir).map(|s| s.overrides.iter().map(|o| o.file.to_ascii_lowercase()).collect()).unwrap_or_default()
}

/// "3 local config override(s) in 2 file(s)", or `None` without any.
pub fn headline(server_dir: &Path) -> Option<String> {
    let store = Store::load(server_dir).ok()?;
    if store.overrides.is_empty() {
        return None;
    }
    let files: BTreeSet<&str> = store.overrides.iter().map(|o| o.file.as_str()).collect();
    Some(format!("{} local config override(s) in {} file(s)", store.overrides.len(), files.len()))
}

// =============================================================================
// Writing the files
// =============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Outcome {
    /// A value the server has not run with before went into the file.
    Set,
    /// Something had rewritten the file (a sync, a hand); the value went back.
    Reapplied,
    /// The file already held the value.
    InPlace,
    /// The pack's value went back and the override left the list.
    Reset,
    /// A reset where the file already held the pack's value.
    Dropped,
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Change {
    pub file: String,
    pub key: String,
    pub from: String,
    pub to: String,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Report {
    pub changes: Vec<Change>,
    pub files_written: usize,
    /// The list itself could not be read or rewritten.
    pub error: Option<String>,
    pub notes: Vec<String>,
}

impl Report {
    pub fn count(&self, what: impl Fn(&Outcome) -> bool) -> usize {
        self.changes.iter().filter(|c| what(&c.outcome)).count()
    }

    pub fn failed(&self) -> usize {
        self.count(|o| matches!(o, Outcome::Failed(_))) + usize::from(self.error.is_some())
    }

    /// One line for a log or a status label.
    pub fn line(&self) -> String {
        if let Some(why) = &self.error {
            return format!("local config overrides NOT applied: {why}");
        }
        let mut parts = Vec::new();
        for (n, what) in [
            (self.count(|o| *o == Outcome::Set), "set"),
            (self.count(|o| *o == Outcome::Reapplied), "put back after a rewrite"),
            (self.count(|o| *o == Outcome::InPlace), "already in place"),
            (self.count(|o| matches!(o, Outcome::Reset | Outcome::Dropped)), "reset to the pack's value"),
            (self.count(|o| matches!(o, Outcome::Failed(_))), "FAILED"),
        ] {
            if n > 0 {
                parts.push(format!("{n} {what}"));
            }
        }
        if parts.is_empty() {
            "no local config overrides".to_string()
        } else {
            format!("local config overrides: {} ({} file(s) written)", parts.join(", "), self.files_written)
        }
    }

    fn log(&self) {
        for c in &self.changes {
            match &c.outcome {
                Outcome::Set => log::info!("[overrides] set {} :: {}  {} -> {}", c.file, c.key, c.from, c.to),
                Outcome::Reapplied => log::info!("[overrides] put back {} :: {}  {} -> {}", c.file, c.key, c.from, c.to),
                Outcome::Reset => log::info!("[overrides] reset {} :: {}  {} -> {}", c.file, c.key, c.from, c.to),
                Outcome::Dropped | Outcome::InPlace => {}
                Outcome::Failed(why) => log::warn!("[overrides] NOT applied: {} :: {} = {}  ({why})", c.file, c.key, c.to),
            }
        }
        for note in &self.notes {
            log::warn!("[overrides] {note}");
        }
        if self.failed() > 0 {
            log::warn!("[overrides] {}", self.line());
        } else {
            log::info!("[overrides] {}", self.line());
        }
    }
}

struct Step {
    index: usize,
    change: Change,
    base: Option<String>,
    written: Option<String>,
    drop: bool,
    /// The step edited the document, so it stands or falls with the write.
    edits: bool,
    commit: bool,
}

fn fail_all(store: &Store, indexes: &[usize], report: &mut Report, why: &str) {
    for &i in indexes {
        let o = &store.overrides[i];
        report.changes.push(Change {
            file: o.file.clone(),
            key: o.key.clone(),
            from: String::new(),
            to: o.value.clone(),
            outcome: Outcome::Failed(why.to_string()),
        });
    }
}

fn apply_file(cfg: &ServerConfig, file: &str, store: &mut Store, dropped: &mut BTreeSet<usize>, report: &mut Report) {
    let indexes: Vec<usize> = store.overrides.iter().enumerate().filter(|(_, o)| o.file == file).map(|(i, _)| i).collect();
    let (path, format) = match resolve(cfg, file) {
        Ok(found) => found,
        Err(why) => return fail_all(store, &indexes, report, &why),
    };
    let text = match read_text(&path) {
        Ok(text) => text,
        Err(why) => return fail_all(store, &indexes, report, &why),
    };
    let mut doc = Document::parse(format, &text);
    // None of our values in it: the file is as the pack (or the mod) left it.
    let pristine = indexes.iter().all(|&i| {
        let o = &store.overrides[i];
        match (doc.get(&o.key), &o.written) {
            (Some(entry), Some(w)) => !same_value(&entry.raw, w),
            _ => true,
        }
    });

    let mut steps: Vec<Step> = Vec::new();
    for &index in &indexes {
        let o = &store.overrides[index];
        let change = |from: &str, to: &str, outcome: Outcome| Change {
            file: o.file.clone(),
            key: o.key.clone(),
            from: from.to_string(),
            to: to.to_string(),
            outcome,
        };
        let untouched = |change: Change| Step {
            index,
            change,
            base: o.base.clone(),
            written: o.written.clone(),
            drop: false,
            edits: false,
            commit: true,
        };
        let Some(entry) = doc.get(&o.key) else {
            let why = "the file has no such key (a pack update may have renamed or removed it)".to_string();
            steps.push(untouched(change("", &o.value, Outcome::Failed(why))));
            continue;
        };
        let cur = entry.raw.clone();
        // Does the file still hold what this layer last wrote?
        let ours = o.written.as_ref().map_or(false, |w| same_value(&cur, w));

        if o.revert {
            let base = o.base.clone().unwrap_or_else(|| cur.clone());
            let step = if ours && !same_value(&cur, &base) {
                match doc.set(&o.key, &base) {
                    Ok(_) => Step { index, change: change(&cur, &base, Outcome::Reset), base: None, written: None, drop: true, edits: true, commit: true },
                    Err(why) => untouched(change(&cur, &base, Outcome::Failed(why))),
                }
            } else {
                Step { index, change: change(&cur, &cur, Outcome::Dropped), base: None, written: None, drop: true, edits: false, commit: true }
            };
            steps.push(step);
            continue;
        }

        // Whenever the file does not hold ours, what it holds is the pack's.
        let base = if ours { o.base.clone() } else { Some(cur.clone()) };
        let step = if same_value(&cur, &o.value) {
            Step { index, change: change(&cur, &o.value, Outcome::InPlace), base, written: Some(o.value.clone()), drop: false, edits: false, commit: true }
        } else {
            // New to the server, or a value it ran with before the file was rewritten?
            let fresh = !o.written.as_ref().map_or(false, |w| same_value(w, &o.value));
            let ran_with = o.written.clone().unwrap_or_else(|| cur.clone());
            match doc.set(&o.key, &o.value) {
                Ok(_) => {
                    let change = if fresh { change(&ran_with, &o.value, Outcome::Set) } else { change(&cur, &o.value, Outcome::Reapplied) };
                    Step { index, change, base, written: Some(o.value.clone()), drop: false, edits: true, commit: true }
                }
                Err(why) => untouched(change(&cur, &o.value, Outcome::Failed(why))),
            }
        };
        steps.push(step);
    }

    if doc.text() != text {
        if pristine {
            keep_original(cfg, file, &text, report);
        }
        match write_atomic(&path, doc.text().as_bytes()) {
            Ok(()) => report.files_written += 1,
            Err(e) => {
                // Nothing reached the disk: every edit of this file failed,
                // and the list keeps what it knew.
                let why = format!("{file} could not be written: {e}");
                for step in steps.iter_mut().filter(|s| s.edits) {
                    step.change.outcome = Outcome::Failed(why.clone());
                    step.commit = false;
                }
            }
        }
    }

    for step in steps {
        if step.commit {
            let o = &mut store.overrides[step.index];
            o.base = step.base;
            o.written = step.written;
            if step.drop {
                dropped.insert(step.index);
            }
        }
        report.changes.push(step.change);
    }
}

/// The file as it was before its first override (or as a sync last left it),
/// under `config-overrides/originals/`. Best effort.
fn keep_original(cfg: &ServerConfig, file: &str, text: &str, report: &mut Report) {
    let mut path = cfg.server_dir.join(DIR).join(ORIGINALS_DIR);
    for part in file.split('/') {
        path.push(part);
    }
    let kept = path.parent().map_or(Ok(()), fs::create_dir_all).and_then(|()| fs::write(&path, text));
    if let Err(e) = kept {
        report.notes.push(format!("the original of {file} could not be kept under {DIR}/{ORIGINALS_DIR}: {e}"));
    }
}

fn append_history(cfg: &ServerConfig, by: &str, report: &mut Report) {
    let mut lines = String::new();
    let now = now_text();
    for c in &report.changes {
        let what = match &c.outcome {
            Outcome::Set => "SET",
            Outcome::Reapplied => "PUT BACK",
            Outcome::Reset => "RESET",
            Outcome::Dropped => "RESET (the file already held the pack's value)",
            Outcome::Failed(_) => "FAILED",
            Outcome::InPlace => continue,
        };
        let tail = match &c.outcome {
            Outcome::Failed(why) => format!("  ({why})"),
            _ => String::new(),
        };
        lines.push_str(&format!("{now} | {by} | {what} | {} | {} | {} -> {}{tail}\n", c.file, c.key, c.from, c.to));
    }
    if lines.is_empty() {
        return;
    }
    let dir = cfg.server_dir.join(DIR);
    let appended = fs::create_dir_all(&dir)
        .and_then(|()| fs::OpenOptions::new().create(true).append(true).open(dir.join(HISTORY_FILE)))
        .and_then(|mut f| f.write_all(lines.as_bytes()));
    if let Err(e) = appended {
        report.notes.push(format!("{DIR}/{HISTORY_FILE} could not be appended to: {e}"));
    }
}

/// Changes of value, into `<world>/.icraft_world.json` -> `config_changes`.
/// Only for a world that exists; other keys of the file are left as they are.
fn record_in_world(cfg: &ServerConfig, by: &str, report: &Report) -> Result<(), String> {
    let changes: Vec<&Change> = report.changes.iter().filter(|c| matches!(c.outcome, Outcome::Set | Outcome::Reset)).collect();
    let world = cfg.world_dir();
    if changes.is_empty() || !world.join("level.dat").is_file() {
        return Ok(());
    }
    let path = world.join(WORLD_MANIFEST);
    let mut root: serde_json::Value = match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("{WORLD_MANIFEST} does not parse ({e}); it was left alone"))?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => serde_json::json!({ "version": 1 }),
        Err(e) => return Err(format!("{WORLD_MANIFEST} cannot be read: {e}")),
    };
    let Some(object) = root.as_object_mut() else {
        return Err(format!("{WORLD_MANIFEST} is not a JSON object; it was left alone"));
    };
    let list = object.entry("config_changes").or_insert_with(|| serde_json::Value::Array(Vec::new()));
    let Some(list) = list.as_array_mut() else {
        return Err(format!("{WORLD_MANIFEST}: `config_changes` is not a list; it was left alone"));
    };
    let at = chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
    for c in changes {
        let what = if c.outcome == Outcome::Reset { "reset" } else { "set" };
        list.push(serde_json::json!({
            "at": at,
            "by": by,
            "what": what,
            "file": c.file,
            "key": c.key,
            "from": c.from,
            "to": c.to,
        }));
    }
    let json = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    write_atomic(&path, format!("{json}\n").as_bytes()).map_err(|e| format!("{WORLD_MANIFEST} could not be written: {e}"))
}

/// Put every override into its file. The caller has made sure no JVM has the
/// world (see [`apply_when_stopped`] and [`apply_at_start`]).
fn apply(cfg: &ServerConfig, by: &str) -> Report {
    let mut report = Report::default();
    let mut store = match Store::load(&cfg.server_dir) {
        Ok(store) => store,
        Err(why) => {
            report.error = Some(why);
            return report;
        }
    };
    if store.overrides.is_empty() {
        return report;
    }
    let before = store.clone();
    let files: BTreeSet<String> = store.overrides.iter().map(|o| o.file.clone()).collect();
    let mut dropped = BTreeSet::new();
    for file in &files {
        apply_file(cfg, file, &mut store, &mut dropped, &mut report);
    }
    let mut index = 0;
    store.overrides.retain(|_| {
        let keep = !dropped.contains(&index);
        index += 1;
        keep
    });
    if store != before {
        if let Err(why) = store.save(&cfg.server_dir) {
            report.error = Some(format!("the config files were updated, but {why}"));
        }
    }
    append_history(cfg, by, &mut report);
    if let Err(why) = record_in_world(cfg, by, &report) {
        report.notes.push(why);
    }
    report
}

/// For the tab and the command line: write the overrides now if no server has
/// the world, or say why not. The launch gate is held meanwhile, so this
/// launcher cannot start a JVM half-way through.
pub fn apply_when_stopped(cfg: &ServerConfig, by: &str) -> Result<Report, String> {
    let _gate = crate::backup::launch_guard();
    if crate::run::jvm_active() {
        return Err("the server is running".to_string());
    }
    if crate::backup::world_in_use(cfg) {
        return Err("a server has the world open".to_string());
    }
    let report = apply(cfg, by);
    report.log();
    Ok(report)
}

/// Before every JVM start (`run::launch_server_inner`, inside the launch
/// gate): put the overrides back into the files a sync may have rewritten.
/// Nothing at all without the list; never fatal, never a panic: the server
/// starts either way, and a failure is in the log in capitals.
pub fn apply_at_start(cfg: &ServerConfig) {
    if !cfg.server_dir.join(FILE).exists() {
        return;
    }
    let ran = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if crate::backup::world_in_use(cfg) {
            log::warn!("[overrides] a server already has the world open: local config overrides NOT re-applied before this launch");
            return;
        }
        apply(cfg, "server start").log();
    }));
    if ran.is_err() {
        log::error!("[overrides] applying the local config overrides panicked; the server starts with the config files as they are");
    }
}

/// The last lines of the change history, newest last.
pub fn history_tail(server_dir: &Path, lines: usize) -> Vec<String> {
    let text = fs::read_to_string(server_dir.join(DIR).join(HISTORY_FILE)).unwrap_or_default();
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].iter().map(|l| l.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORLD: &str = "\n[world_generation]\n\t#Range: > 0\n\tuserWorldGenVersion = 0\n\n\t[world_generation.osmium]\n\t\t#Chance that osmium veins generate in a chunk.\n\t\t#Range: 1 ~ 256\n\t\tperChunk = 55\n\t\t#Allowed Values: TRAPEZOID, UNIFORM\n\t\tshape = \"TRAPEZOID\"\n\n\t[world_generation.tin]\n\t\t#Range: 1 ~ 256\n\t\tperChunk = 12\n";
    const MEK: &str = "config/Mekanism/world.toml";
    const OSMIUM: &str = "world_generation.osmium.perChunk";

    struct Fx {
        dir: PathBuf,
        cfg: ServerConfig,
    }

    impl Fx {
        fn new(name: &str) -> Fx {
            let dir = std::env::temp_dir().join(format!("icraft-overrides-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(dir.join("config").join("Mekanism")).unwrap();
            fs::write(dir.join("server.properties"), "level-name=world\nmax-tick-time=60000\n").unwrap();
            let fx = Fx { cfg: ServerConfig::from_path(&dir), dir };
            fx.write(MEK, WORLD);
            fx
        }

        fn path(&self, rel: &str) -> PathBuf {
            rel.split('/').fold(self.dir.clone(), |p, part| p.join(part))
        }

        fn read(&self, rel: &str) -> String {
            fs::read_to_string(self.path(rel)).unwrap()
        }

        fn write(&self, rel: &str, text: &str) {
            let path = self.path(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }

        fn exists(&self, rel: &str) -> bool {
            self.path(rel).exists()
        }

        fn outcomes(&self, by: &str) -> Vec<(String, Outcome, String, String)> {
            apply(&self.cfg, by).changes.into_iter().map(|c| (c.key, c.outcome, c.from, c.to)).collect()
        }

        fn states(&self) -> Vec<State> {
            status(&self.cfg).unwrap().into_iter().map(|l| l.state).collect()
        }

        fn history(&self) -> Vec<String> {
            history_tail(&self.dir, 100)
        }
    }

    impl Drop for Fx {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    fn change(key: &str, outcome: Outcome, from: &str, to: &str) -> (String, Outcome, String, String) {
        (key.to_string(), outcome, from.to_string(), to.to_string())
    }

    #[test]
    fn an_override_survives_a_sync_and_resets_to_the_pack_value() {
        let fx = Fx::new("lifecycle");
        let originals = format!("{DIR}/{ORIGINALS_DIR}/{MEK}");

        // Staging touches the list, not the config file.
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "40", "test"), Ok(Staged::Saved));
        assert_eq!(fx.read(MEK), WORLD);
        assert_eq!(fx.states(), [State::Waiting]);
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "40", "test"), Ok(Staged::Unchanged));

        // Applying changes that value and nothing else, and keeps the original.
        assert_eq!(fx.outcomes("test"), [change(OSMIUM, Outcome::Set, "55", "40")]);
        let edited = WORLD.replace("perChunk = 55", "perChunk = 40");
        assert_eq!(fx.read(MEK), edited);
        assert_eq!(fx.read(&originals), WORLD);
        assert_eq!(fx.states(), [State::InFile]);
        assert_eq!(fx.history().len(), 1);
        assert!(fx.history()[0].contains("| test | SET | config/Mekanism/world.toml | world_generation.osmium.perChunk | 55 -> 40"), "{:?}", fx.history());
        // No world yet: nothing is written into a world folder.
        assert!(!fx.exists("world"));

        // Again: nothing to do, nothing written, nothing logged.
        let again = apply(&fx.cfg, "test");
        assert_eq!((again.files_written, again.count(|o| *o == Outcome::InPlace), again.failed()), (0, 1, 0));
        assert_eq!(fx.history().len(), 1);

        // A sync rewrites the file with the pack's new values: ours goes back,
        // the pack's other change stays, and the pack's new value is the base.
        let pack2 = WORLD.replace("perChunk = 55", "perChunk = 50").replace("perChunk = 12", "perChunk = 13");
        fx.write(MEK, &pack2);
        assert_eq!(fx.states(), [State::Waiting]);
        assert_eq!(fx.outcomes("server start"), [change(OSMIUM, Outcome::Reapplied, "50", "40")]);
        assert_eq!(fx.read(MEK), pack2.replace("perChunk = 50", "perChunk = 40"));
        assert_eq!(fx.read(&originals), pack2);
        let store = Store::load(&fx.dir).unwrap();
        assert_eq!(store.get(MEK, OSMIUM).unwrap().base.as_deref(), Some("50"));
        assert_eq!(store.get(MEK, OSMIUM).unwrap().written.as_deref(), Some("40"));

        // A new value while the old one is in the file: the file's 40 is ours,
        // not the pack's, so the base stays 50.
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "45", "test"), Ok(Staged::Saved));
        assert_eq!(fx.states(), [State::Waiting]);
        assert_eq!(fx.outcomes("test"), [change(OSMIUM, Outcome::Set, "40", "45")]);
        assert_eq!(Store::load(&fx.dir).unwrap().get(MEK, OSMIUM).unwrap().base.as_deref(), Some("50"));

        // Reset: the pack's value goes back and the list is gone.
        assert_eq!(reset(&fx.cfg, MEK, OSMIUM), Ok(true));
        assert_eq!(fx.read(MEK), pack2.replace("perChunk = 50", "perChunk = 45"));
        assert_eq!(fx.states(), [State::WaitingReset]);
        assert_eq!(fx.outcomes("test"), [change(OSMIUM, Outcome::Reset, "45", "50")]);
        assert_eq!(fx.read(MEK), pack2);
        assert!(!fx.exists(FILE));
        assert_eq!(reset(&fx.cfg, MEK, OSMIUM), Ok(false));
        assert_eq!(fx.history().len(), 4);
        assert!(apply(&fx.cfg, "test").changes.is_empty());
    }

    #[test]
    fn staging_validates_and_knows_the_pack_value() {
        let fx = Fx::new("staging");
        assert!(stage(&fx.cfg, MEK, OSMIUM, "300", "t").unwrap_err().contains("more than 256"));
        assert!(stage(&fx.cfg, MEK, OSMIUM, "lots", "t").is_err());
        assert!(stage(&fx.cfg, MEK, "world_generation.osmium.nope", "1", "t").unwrap_err().contains("no key"));
        assert!(stage(&fx.cfg, "config/absent.toml", "a", "1", "t").unwrap_err().contains("does not exist"));
        assert!(stage(&fx.cfg, MEK, "world_generation.osmium.shape", "ROUND", "t").is_err());
        assert!(!fx.exists(FILE));
        // The pack's own value is not an override.
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "55", "t"), Ok(Staged::Unchanged));
        assert!(!fx.exists(FILE));

        // Never applied, then reset or set back to the pack's value: it just leaves.
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "40", "t"), Ok(Staged::Saved));
        assert_eq!(reset(&fx.cfg, MEK, OSMIUM), Ok(true));
        assert!(!fx.exists(FILE));
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "40", "t"), Ok(Staged::Saved));
        assert_eq!(stage(&fx.cfg, MEK, OSMIUM, "55", "t"), Ok(Staged::BackToPack));
        assert!(!fx.exists(FILE));
        assert_eq!(fx.read(MEK), WORLD);

        // Applied, then set back to the pack's value: a reset that waits for
        // the next apply. Changing one's mind before then keeps the override.
        assert_eq!(stage(&fx.cfg, MEK, "world_generation.osmium.shape", "UNIFORM", "t"), Ok(Staged::Saved));
        assert_eq!(apply(&fx.cfg, "t").files_written, 1);
        assert!(fx.read(MEK).contains("shape = \"UNIFORM\""));
        assert_eq!(stage(&fx.cfg, MEK, "world_generation.osmium.shape", "TRAPEZOID", "t"), Ok(Staged::BackToPack));
        assert_eq!(fx.states(), [State::WaitingReset]);
        assert_eq!(stage(&fx.cfg, MEK, "world_generation.osmium.shape", "UNIFORM", "t"), Ok(Staged::Saved));
        assert_eq!(fx.states(), [State::InFile]);
        assert_eq!(stage(&fx.cfg, MEK, "world_generation.osmium.shape", "TRAPEZOID", "t"), Ok(Staged::BackToPack));
        let outcomes = fx.outcomes("t");
        assert_eq!(outcomes, [change("world_generation.osmium.shape", Outcome::Reset, "\"UNIFORM\"", "\"TRAPEZOID\"")]);
        assert_eq!(fx.read(MEK), WORLD);
    }

    #[test]
    fn a_reset_after_a_sync_has_nothing_to_write() {
        let fx = Fx::new("reset-after-sync");
        stage(&fx.cfg, MEK, OSMIUM, "40", "t").unwrap();
        apply(&fx.cfg, "t");
        fx.write(MEK, WORLD); // the sync put the pack's file back
        assert_eq!(reset(&fx.cfg, MEK, OSMIUM), Ok(true));
        assert_eq!(fx.outcomes("t"), [change(OSMIUM, Outcome::Dropped, "55", "55")]);
        assert_eq!(fx.read(MEK), WORLD);
        assert!(!fx.exists(FILE));
    }

    #[test]
    fn only_config_files_can_be_named() {
        let fx = Fx::new("paths");
        for bad in [
            "world/region/r.0.0.mca",
            "world/level.dat",
            "../outside.toml",
            "config/../../outside.toml",
            "C:/Windows/win.toml",
            "mods/a.toml",
            "kubejs/server_scripts/a.json",
            "config",
            "config/readme.txt",
            "eula.txt",
            "",
        ] {
            assert!(resolve(&fx.cfg, bad).is_err(), "{bad} was accepted");
        }
        for (good, format) in [
            ("config\\Mekanism\\world.toml", Format::Toml),
            ("/config/adlods/Deposits/osmium.cfg", Format::Cfg),
            ("config/tectonic.json", Format::Json),
            ("server.properties", Format::Properties),
            ("defaultconfigs/x-server.toml", Format::Toml),
            ("world/serverconfig/createoreexcavation-server.toml", Format::Toml),
        ] {
            let (path, found) = resolve(&fx.cfg, good).unwrap_or_else(|e| panic!("{good}: {e}"));
            assert_eq!(found, format);
            assert!(path.starts_with(&fx.dir));
        }
        // The world folder is the one server.properties names.
        fx.write("server.properties", "level-name=alpha\n");
        assert!(resolve(&fx.cfg, "world/serverconfig/x-server.toml").is_err());
        assert!(resolve(&fx.cfg, "alpha/serverconfig/x-server.toml").is_ok());
    }

    #[test]
    fn a_failure_is_reported_and_stops_nothing_else() {
        let fx = Fx::new("failures");
        fx.write("config/tectonic.json", "{\n  \"continents\": {\n    \"erosion_scale\": 0.4\n  }\n}\n");
        fx.write("config/adlods/Deposits/osmium.cfg", "Deposit {\n    #  [range: 0 ~ 256000, default: 0]\n    I:rarity=1829\n}\n");
        stage(&fx.cfg, MEK, OSMIUM, "40", "t").unwrap();
        stage(&fx.cfg, MEK, "world_generation.tin.perChunk", "20", "t").unwrap();
        stage(&fx.cfg, "config/tectonic.json", "continents.erosion_scale", "0.5", "t").unwrap();
        stage(&fx.cfg, "config/adlods/Deposits/osmium.cfg", "Deposit.rarity", "1500", "t").unwrap();
        stage(&fx.cfg, "server.properties", "max-tick-time", "-1", "t").unwrap();
        assert_eq!(headline(&fx.dir).as_deref(), Some("5 local config override(s) in 4 file(s)"));
        assert_eq!(overridden_files(&fx.dir).into_iter().collect::<Vec<_>>(), ["config/adlods/deposits/osmium.cfg", "config/mekanism/world.toml", "config/tectonic.json", "server.properties"]);

        // A pack update drops one key and removes one file.
        fx.write(MEK, &WORLD.replace("\t\t#Range: 1 ~ 256\n\t\tperChunk = 12\n", ""));
        fs::remove_file(fx.path("config/tectonic.json")).unwrap();
        let report = apply(&fx.cfg, "server start");
        assert_eq!(report.failed(), 2);
        assert_eq!(report.count(|o| *o == Outcome::Set), 3);
        assert_eq!(report.files_written, 3);
        assert!(fx.read(MEK).contains("perChunk = 40"));
        assert!(fx.read("config/adlods/Deposits/osmium.cfg").contains("I:rarity=1500"));
        assert_eq!(fx.read("server.properties"), "level-name=world\nmax-tick-time=-1\n");
        assert!(report.line().contains("3 set") && report.line().contains("2 FAILED"), "{}", report.line());
        // Both stay on the list, visibly broken, and are tried again next time.
        let states = fx.states();
        assert_eq!(states.iter().filter(|s| **s == State::MissingKey).count(), 1);
        assert_eq!(states.iter().filter(|s| **s == State::MissingFile).count(), 1);
        assert_eq!(states.iter().filter(|s| **s == State::InFile).count(), 3);

        // A list that does not parse: nothing is applied, and it says so.
        fx.write(FILE, "{ not json");
        let report = apply(&fx.cfg, "server start");
        assert!(report.error.as_deref().unwrap_or("").contains("does not parse"));
        assert!(report.changes.is_empty());
        assert!(status(&fx.cfg).is_err());
        assert!(overridden_files(&fx.dir).is_empty());
    }

    #[test]
    fn changes_of_value_are_recorded_in_the_world() {
        let fx = Fx::new("world-record");
        fx.write("world/level.dat", "x");
        fx.write("world/.icraft_world.json", "{\n  \"seed\": \"kept\"\n}\n");
        stage(&fx.cfg, MEK, OSMIUM, "40", "window").unwrap();
        apply(&fx.cfg, "window");
        fx.write(MEK, WORLD); // a sync
        apply(&fx.cfg, "server start"); // put back: not a change of value
        reset(&fx.cfg, MEK, OSMIUM).unwrap();
        apply(&fx.cfg, "window");

        let manifest: serde_json::Value = serde_json::from_str(&fx.read("world/.icraft_world.json")).unwrap();
        assert_eq!(manifest["seed"], "kept");
        let changes = manifest["config_changes"].as_array().unwrap();
        assert_eq!(changes.len(), 2, "{manifest}");
        assert_eq!((changes[0]["what"].as_str(), changes[0]["from"].as_str(), changes[0]["to"].as_str()), (Some("set"), Some("55"), Some("40")));
        assert_eq!((changes[1]["what"].as_str(), changes[1]["from"].as_str(), changes[1]["to"].as_str()), (Some("reset"), Some("40"), Some("55")));
        assert_eq!(changes[0]["file"], MEK);
        assert_eq!(changes[0]["by"], "window");
        // The history has all three.
        assert_eq!(fx.history().len(), 3);
        assert!(fx.history()[1].contains("PUT BACK"));

        // A manifest that is not ours to rewrite is left alone.
        fx.write("world/.icraft_world.json", "[1, 2]");
        stage(&fx.cfg, MEK, OSMIUM, "41", "window").unwrap();
        let report = apply(&fx.cfg, "window");
        assert_eq!(report.count(|o| *o == Outcome::Set), 1);
        assert_eq!(report.notes.len(), 1);
        assert_eq!(fx.read("world/.icraft_world.json"), "[1, 2]");
    }

    #[test]
    fn the_list_round_trips_and_tolerates_a_bom() {
        let fx = Fx::new("store");
        stage(&fx.cfg, "config\\Mekanism\\world.toml", OSMIUM, "40", "cli").unwrap();
        let text = fx.read(FILE);
        assert!(text.contains("\"file\": \"config/Mekanism/world.toml\""), "{text}");
        assert!(text.contains("\"base\": \"55\"") && !text.contains("\"written\"") && !text.contains("\"revert\""), "{text}");
        fx.write(FILE, &format!("\u{feff}{text}"));
        let store = Store::load(&fx.dir).unwrap();
        assert_eq!(store.overrides.len(), 1);
        assert_eq!((store.version, store.overrides[0].by.as_str()), (1, "cli"));
    }
}
