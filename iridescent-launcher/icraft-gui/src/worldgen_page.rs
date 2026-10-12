//! The Customizer's "Worldgen settings" page: the pack's worldgen config
//! files, every setting a widget, the operator's own values kept apart from
//! the pack's.
//!
//! This file draws and collects; it decides nothing. Which files are listed
//! comes from [`worldgen`]'s catalog, what a setting is and may be comes from
//! the config file itself ([`cfgedit`]), and a change goes onto the override
//! list ([`overrides`]), which is what writes config files, only ever while no
//! server has the world.
//!
//! A value typed here is "not saved" until Save is pressed. Saved, it is "in
//! the file" if the server was stopped, or "waiting for the next server start"
//! if it was running.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use eframe::egui::{self, RichText};
use icraft_core::cfgedit::{same_value, Document, Entry, Kind};
use icraft_core::config::ServerConfig;
use icraft_core::overrides::{self, Listed, State};
use icraft_core::worldgen::{self, CatalogFile, Source, Target};

use crate::customizer::{mono_line, open_path, section, BAD, GOOD, WARN};

type Id = (String, String);

/// The file list's width, and the width of a setting's name and description.
const FILES_WIDTH: f32 = 250.0;
const NAME_WIDTH: f32 = 300.0;

enum Action {
    Select(String),
    Edit { key: String, value: String },
    Undo(String),
    Reset { file: String, key: String },
    Save,
    Discard,
}

pub struct WorldgenPage {
    loaded_for: Option<PathBuf>,
    files: Vec<CatalogFile>,
    /// The open file (relative path), and what was read from it.
    selected: Option<String>,
    doc: Option<Result<Document, String>>,
    /// Typed and not saved: (file, key) -> the value as typed.
    edits: BTreeMap<Id, String>,
    /// Why a typed value was not accepted at the last Save.
    refused: BTreeMap<Id, String>,
    listed: Vec<Listed>,
    list_error: Option<String>,
    history: Vec<String>,
    refreshed: Option<Instant>,
    filter: String,
    only_mine: bool,
    note: String,
    note_bad: bool,
    /// Set by a preview: the file to open and values to type, once loaded.
    want_file: Option<String>,
    want_edits: Vec<(String, String)>,
    pub expand_all: bool,
}

impl WorldgenPage {
    pub fn new() -> Self {
        WorldgenPage {
            loaded_for: None,
            files: Vec::new(),
            selected: None,
            doc: None,
            edits: BTreeMap::new(),
            refused: BTreeMap::new(),
            listed: Vec::new(),
            list_error: None,
            history: Vec::new(),
            refreshed: None,
            filter: String::new(),
            only_mine: false,
            note: String::new(),
            note_bad: false,
            want_file: None,
            want_edits: Vec::new(),
            expand_all: false,
        }
    }

    /// For a preview: open `file` (a catalog name or a path) and type
    /// `key=value;key=value` into it, as if by hand. Nothing is saved.
    pub fn preview(&mut self, file: Option<&str>, edits: Option<&str>) {
        self.want_file = file.map(str::to_string);
        self.want_edits = edits
            .unwrap_or("")
            .split(';')
            .filter_map(|pair| pair.split_once('='))
            .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            .collect();
    }

    fn mine(&self, file: &str, key: &str) -> Option<&Listed> {
        self.listed.iter().find(|l| l.item.file == file && l.item.key == key)
    }

    fn read_selected(&mut self, cfg: &ServerConfig) {
        self.doc = self.selected.as_ref().map(|rel| overrides::read_document(cfg, rel));
    }

    /// The overrides, the open file and the history, as they are on disk now.
    /// Another thread or process may have changed any of them (a server start
    /// writes the waiting overrides; the command line edits the list).
    fn refresh(&mut self, cfg: &ServerConfig) {
        match overrides::status(cfg) {
            Ok(listed) => {
                self.listed = listed;
                self.list_error = None;
            }
            Err(why) => {
                self.listed.clear();
                self.list_error = Some(why);
            }
        }
        self.read_selected(cfg);
        self.history = overrides::history_tail(&cfg.server_dir, 8);
        self.refreshed = Some(Instant::now());
    }

    fn select(&mut self, cfg: &ServerConfig, rel: String) {
        self.selected = Some(rel);
        self.filter.clear();
        self.read_selected(cfg);
    }

    /// What a setting shows before anything is typed: the override's value if
    /// there is one, else the file's.
    fn baseline(&self, file: &str, e: &Entry) -> String {
        match self.mine(file, &e.key) {
            Some(l) if !l.item.revert => e.show(&l.item.value),
            _ => e.value(),
        }
    }

    /// Write the list into the config files if nothing stands in the way, and
    /// say what happened either way.
    fn write_out(&mut self, cfg: &ServerConfig, done: &str) {
        // Never wait on the launch gate from the window's own thread: a
        // backup can hold it for minutes.
        let outcome = if icraft_core::run::jvm_active() {
            Err("the server is running".to_string())
        } else if icraft_core::backup::in_progress() {
            Err("a world backup is running".to_string())
        } else if icraft_core::regen::exec::in_progress() {
            Err("a world regeneration is running".to_string())
        } else {
            overrides::apply_when_stopped(cfg, "window")
        };
        match outcome {
            Ok(report) => {
                self.note_bad = report.failed() > 0;
                self.note = format!("{done} {}.", capitalised(&report.line()));
            }
            Err(why) => {
                self.note_bad = false;
                self.note = format!("{done} Not written into the config files yet, because {why}: that happens before the next server start.");
            }
        }
        self.refresh(cfg);
    }

    fn save(&mut self, cfg: &ServerConfig) {
        let edits = std::mem::take(&mut self.edits);
        self.refused.clear();
        let mut saved = 0;
        for ((file, key), value) in edits {
            let source = self.files.iter().find(|f| f.rel == file).map(|f| f.source);
            let target = Target { rel: file.clone(), source, label: String::new() };
            match worldgen::stage(cfg, &target, &key, &value, "window") {
                Ok(_) => saved += 1,
                Err(why) => {
                    self.refused.insert((file.clone(), key.clone()), why);
                    self.edits.insert((file, key), value);
                }
            }
        }
        log::info!("[overrides] {saved} setting(s) saved from the Customizer tab, {} refused", self.refused.len());
        let done = if self.refused.is_empty() {
            format!("Saved {saved}.")
        } else {
            format!("Saved {saved}; {} could not be saved (marked below).", self.refused.len())
        };
        self.write_out(cfg, &done);
        if !self.refused.is_empty() {
            self.note_bad = true;
        }
    }

    pub fn ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        let cfg = ServerConfig::from_path(server_dir);
        if self.loaded_for.as_deref() != Some(server_dir) {
            self.loaded_for = Some(server_dir.to_path_buf());
            self.files = worldgen::files(&cfg);
            self.edits.clear();
            self.refused.clear();
            self.note.clear();
            self.selected = self.files.first().map(|f| f.rel.clone());
            self.refresh(&cfg);
        }
        if let Some(name) = self.want_file.take() {
            let rel = worldgen::target(&cfg, &name).rel;
            self.select(&cfg, rel);
        }
        if !self.want_edits.is_empty() {
            if let Some(rel) = self.selected.clone() {
                for (key, value) in std::mem::take(&mut self.want_edits) {
                    self.edits.insert((rel.clone(), key), value);
                }
            }
        }
        if self.refreshed.map_or(true, |t| t.elapsed() >= Duration::from_secs(5)) {
            self.refresh(&cfg);
        }

        let mut actions: Vec<Action> = Vec::new();
        ui.heading("Worldgen settings");
        ui.label(
            RichText::new(format!(
                "Biome layout, terrain shape and ore veins, as this pack's mods read them. What you change here is this server's own: it is kept in {} next to server.properties, and the launcher writes it back into the config files before every server start, so a pack update cannot undo it. The config files are only written while the server is stopped.",
                overrides::FILE
            ))
            .small()
            .weak(),
        );
        ui.label(RichText::new(worldgen::NEW_CHUNKS_NOTE).small().color(WARN));
        ui.add_space(4.0);

        self.save_bar(ui, &mut actions);
        self.mine_ui(ui, server_dir, &mut actions);
        ui.add_space(8.0);

        if self.files.is_empty() {
            ui.colored_label(BAD, "None of the pack's worldgen config files is in this install dir (is this a server folder that has synced?).");
        } else {
            // Two panes, each as tall as the tab's own view and each with its
            // own scrolling: scrolled down to them, the file list stays put
            // while the settings of the open file move.
            let pane_height = (ui.clip_rect().height() - 6.0).max(280.0);
            ui.horizontal_top(|ui| {
                ui.vertical(|ui| {
                    ui.set_width(FILES_WIDTH);
                    self.files_ui(ui, pane_height, &mut actions);
                });
                ui.separator();
                ui.vertical(|ui| {
                    let top = ui.cursor().top();
                    self.header_ui(ui);
                    ui.horizontal_wrapped(|ui| {
                        ui.label("Find");
                        ui.add(egui::TextEdit::singleline(&mut self.filter).desired_width(170.0).hint_text("part of a name"));
                        ui.checkbox(&mut self.only_mine, "only what I changed");
                    });
                    ui.add_space(2.0);
                    let rows_height = (pane_height - (ui.cursor().top() - top)).max(180.0);
                    egui::ScrollArea::vertical()
                        .id_source("worldgen-rows")
                        .max_height(rows_height)
                        .min_scrolled_height(rows_height)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            self.rows_ui(ui, &mut actions);
                        });
                });
            });
        }

        for action in actions {
            match action {
                Action::Select(rel) => self.select(&cfg, rel),
                Action::Edit { key, value } => {
                    let Some(rel) = self.selected.clone() else { continue };
                    let baseline = match &self.doc {
                        Some(Ok(doc)) => doc.get(&key).map(|e| self.baseline(&rel, e)),
                        _ => None,
                    };
                    let id = (rel, key);
                    self.refused.remove(&id);
                    if baseline.map_or(false, |b| same_value(&b, &value)) {
                        self.edits.remove(&id);
                    } else {
                        self.edits.insert(id, value);
                    }
                }
                Action::Undo(key) => {
                    if let Some(rel) = self.selected.clone() {
                        let id = (rel, key);
                        self.edits.remove(&id);
                        self.refused.remove(&id);
                    }
                }
                Action::Reset { file, key } => match overrides::reset(&cfg, &file, &key) {
                    Ok(_) => {
                        log::info!("[overrides] {file} :: {key} reset to the pack's value from the Customizer tab");
                        self.write_out(&cfg, "Reset.");
                    }
                    Err(why) => {
                        self.note = why;
                        self.note_bad = true;
                    }
                },
                Action::Save => self.save(&cfg),
                Action::Discard => {
                    self.edits.clear();
                    self.refused.clear();
                    self.note.clear();
                }
            }
        }
    }

    fn save_bar(&self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        if !self.edits.is_empty() {
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.colored_label(WARN, format!("{} change(s) not saved", self.edits.len()));
                    if ui.add(egui::Button::new(RichText::new("Save").strong()).min_size(egui::vec2(90.0, 26.0))).clicked() {
                        actions.push(Action::Save);
                    }
                    if ui.button("Discard").clicked() {
                        actions.push(Action::Discard);
                    }
                    if icraft_core::run::jvm_active() {
                        ui.weak("The server is running: what you save is written into the config files before its next start.");
                    } else {
                        ui.weak("What you save is written into the config files at once if no server is running.");
                    }
                });
            });
        }
        if !self.note.is_empty() {
            ui.colored_label(if self.note_bad { BAD } else { GOOD }, self.note.as_str());
        }
    }

    /// Every override in one place, whatever file it is in.
    fn mine_ui(&self, ui: &mut egui::Ui, server_dir: &Path, actions: &mut Vec<Action>) {
        let title = format!("Your changes ({})", self.listed.len());
        section(ui, self.expand_all, "worldgen-mine", title, !self.listed.is_empty() || self.list_error.is_some(), |ui| {
            if let Some(why) = &self.list_error {
                ui.colored_label(BAD, format!("{why}. Nothing is applied until that file is repaired or removed."));
            }
            if self.listed.is_empty() && self.list_error.is_none() {
                ui.weak("None: every config file is as the pack ships it.");
            }
            if !self.listed.is_empty() {
                egui::Grid::new("worldgen-mine-grid").striped(true).spacing([14.0, 4.0]).show(ui, |ui| {
                    for head in ["file", "setting", "yours", "the pack's", "", ""] {
                        ui.strong(head);
                    }
                    ui.end_row();
                    for l in &self.listed {
                        ui.label(RichText::new(l.item.file.as_str()).small());
                        ui.label(l.item.key.as_str());
                        ui.label(RichText::new(plain(&l.item.value)).strong());
                        ui.label(l.item.base.as_deref().map_or("?".to_string(), plain));
                        let colour = match l.state {
                            State::InFile => GOOD,
                            State::Waiting | State::WaitingReset => WARN,
                            State::MissingFile | State::MissingKey => BAD,
                        };
                        ui.colored_label(colour, l.state.text());
                        if !l.item.revert && ui.small_button("reset").on_hover_text("Give this setting back the pack's value").clicked() {
                            actions.push(Action::Reset { file: l.item.file.clone(), key: l.item.key.clone() });
                        }
                        ui.end_row();
                    }
                });
            }
            ui.add_space(2.0);
            ui.horizontal_wrapped(|ui| {
                let folder = server_dir.join(overrides::DIR);
                if ui.add_enabled(folder.is_dir(), egui::Button::new("Open the history folder")).clicked() {
                    open_path(&folder);
                }
                ui.weak(format!(
                    "{0}\\{1}: every change that reached a file. {0}\\{2}: each file as it was before your first change to it.",
                    overrides::DIR,
                    overrides::HISTORY_FILE,
                    overrides::ORIGINALS_DIR
                ));
            });
            if !self.history.is_empty() {
                let title = format!("The last {} changes that reached a file", self.history.len());
                section(ui, self.expand_all, "worldgen-history", title, false, |ui| {
                    for line in &self.history {
                        mono_line(ui, line);
                    }
                });
            }
        });
    }

    fn files_ui(&self, ui: &mut egui::Ui, height: f32, actions: &mut Vec<Action>) {
        egui::ScrollArea::vertical().id_source("worldgen-files").max_height(height).min_scrolled_height(height).auto_shrink([false, false]).show(ui, |ui| {
            for group in worldgen::GROUPS {
                ui.label(RichText::new(*group).strong());
                let mut heading: Option<&str> = None;
                for f in self.files.iter().filter(|f| f.source.group == *group) {
                    let in_folder = f.name.contains('/');
                    if in_folder && heading != Some(f.source.id) {
                        ui.label(RichText::new(f.source.title).small());
                    }
                    heading = Some(f.source.id);
                    let changed = self.listed.iter().filter(|l| l.item.file == f.rel).count() + self.edits.keys().filter(|(file, _)| *file == f.rel).count();
                    let mut text = if in_folder { format!("    {}", f.label) } else { f.label.clone() };
                    if changed > 0 {
                        text.push_str(&format!("   [{changed}]"));
                    }
                    let selected = self.selected.as_deref() == Some(f.rel.as_str());
                    let text = if changed > 0 { RichText::new(text).color(WARN) } else { RichText::new(text) };
                    if ui.selectable_label(selected, text).clicked() {
                        actions.push(Action::Select(f.rel.clone()));
                    }
                }
                ui.add_space(6.0);
            }
        });
    }

    /// The open file: what it is, and what to know before touching it.
    fn header_ui(&self, ui: &mut egui::Ui) {
        let Some(file) = self.selected.as_ref().and_then(|rel| self.files.iter().find(|f| &f.rel == rel)) else {
            if let Some(rel) = &self.selected {
                ui.label(RichText::new(rel.as_str()).monospace());
            }
            return;
        };
        let source: &Source = file.source;
        let title = if file.name.contains('/') { format!("{}: {}", source.title, file.label) } else { source.title.to_string() };
        ui.label(RichText::new(title).strong().size(16.0));
        ui.label(RichText::new(file.rel.as_str()).monospace().small());
        ui.label(source.about);
        if let Some(text) = source.file_caution() {
            ui.colored_label(WARN, text);
        }
    }

    fn rows_ui(&self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let Some(rel) = &self.selected else { return };
        let doc = match &self.doc {
            Some(Ok(doc)) => doc,
            Some(Err(why)) => {
                ui.colored_label(BAD, why.as_str());
                return;
            }
            None => return,
        };
        let source = self.files.iter().find(|f| &f.rel == rel).map(|f| f.source);
        for problem in &doc.problems {
            ui.colored_label(WARN, format!("Part of this file could not be read ({problem}); what was read is shown."));
        }

        let needle = self.filter.trim().to_ascii_lowercase();
        let touched = |e: &Entry| self.mine(rel, &e.key).is_some() || self.edits.contains_key(&(rel.clone(), e.key.clone()));
        let mut sections: Vec<(&str, Vec<&Entry>)> = Vec::new();
        for e in &doc.entries {
            if !source.map_or(true, |s| s.shows(&e.key)) {
                continue;
            }
            if self.only_mine && !touched(e) {
                continue;
            }
            if !needle.is_empty() && !e.key.to_ascii_lowercase().contains(&needle) && !e.comment.to_ascii_lowercase().contains(&needle) {
                continue;
            }
            let section = e.section.as_str();
            if sections.last().map_or(false, |last| last.0 == section) {
                if let Some(last) = sections.last_mut() {
                    last.1.push(e);
                }
            } else {
                sections.push((section, vec![e]));
            }
        }
        if sections.is_empty() {
            ui.weak(if needle.is_empty() && !self.only_mine { "This file has no settings of that kind." } else { "Nothing matches." });
            return;
        }

        let force_open = self.expand_all || !needle.is_empty() || self.only_mine;
        let few = sections.len() <= 6;
        for (name, entries) in &sections {
            let title = if name.is_empty() { "(top of the file)".to_string() } else { name.to_string() };
            let about = doc.sections.iter().find(|(path, _)| path.as_str() == *name).map_or("", |(_, comment)| comment.as_str());
            let changed = entries.iter().filter(|e| touched(**e)).count();
            let title = if changed > 0 { RichText::new(format!("{title}   [{changed}]")).monospace().color(WARN) } else { RichText::new(title).monospace() };
            egui::CollapsingHeader::new(title)
                .id_source(("worldgen-section", rel.as_str(), *name))
                .default_open(few || changed > 0)
                .open(if force_open { Some(true) } else { None })
                .show(ui, |ui| {
                    if !about.is_empty() {
                        ui.label(RichText::new(about).small().weak());
                    }
                    egui::Grid::new(("worldgen-grid", rel.as_str(), *name)).num_columns(3).striped(true).spacing([14.0, 5.0]).show(ui, |ui| {
                        for e in entries {
                            self.row_ui(ui, rel, source, e, actions);
                            ui.end_row();
                        }
                    });
                });
        }
    }

    fn row_ui(&self, ui: &mut egui::Ui, rel: &str, source: Option<&'static Source>, e: &Entry, actions: &mut Vec<Action>) {
        let id: Id = (rel.to_string(), e.key.clone());
        let mine = self.mine(rel, &e.key);
        let typed = self.edits.get(&id);
        let locked = source.and_then(|s| s.locked(&e.key));
        let caution = source.and_then(|s| s.caution(&e.key));
        let current: String = typed.cloned().unwrap_or_else(|| self.baseline(rel, e));

        // 1. The name, and what the file says about it. A fixed width: left to
        // itself a grid squeezes a wrapping label down to one letter a line.
        ui.vertical(|ui| {
            ui.set_width(NAME_WIDTH);
            let name = ui.add(egui::Label::new(e.name.as_str()).wrap(false));
            if !e.comment.is_empty() {
                name.on_hover_text(e.comment.as_str());
            }
            let about = describe(e);
            if !about.is_empty() {
                ui.add(egui::Label::new(RichText::new(about).small().weak()).wrap(true));
            }
            if let Some(text) = caution {
                ui.add(egui::Label::new(RichText::new(text).small().color(WARN)).wrap(true));
            }
        });

        // 2. The value.
        let mut new_value: Option<String> = None;
        if locked.is_some() || !e.editable() {
            ui.label(RichText::new(shorten(&current, 48)).monospace().weak());
        } else {
            match e.kind {
                Kind::Bool => {
                    let mut on = current == "true";
                    let label = if on { "on" } else { "off" };
                    if ui.checkbox(&mut on, label).changed() {
                        new_value = Some(on.to_string());
                    }
                }
                Kind::Int => {
                    let mut n: i64 = current.parse().unwrap_or(0);
                    let lo = e.min.map_or(-9.0e15, |m| m.max(-9.0e15)) as i64;
                    let hi = e.max.map_or(9.0e15, |m| m.min(9.0e15)) as i64;
                    if ui.add(egui::DragValue::new(&mut n).clamp_range(lo..=hi)).changed() {
                        new_value = Some(n.to_string());
                    }
                }
                Kind::Float => {
                    let mut f: f64 = current.parse().unwrap_or(0.0);
                    let span = match (e.min, e.max) {
                        (Some(a), Some(b)) => b - a,
                        _ => f.abs().max(1.0) * 4.0,
                    };
                    let speed = (span / 400.0).clamp(0.001, 1.0);
                    let lo = e.min.unwrap_or(f64::MIN);
                    let hi = e.max.unwrap_or(f64::MAX);
                    if ui.add(egui::DragValue::new(&mut f).speed(speed).clamp_range(lo..=hi).max_decimals(5)).changed() {
                        let rounded = (f * 1.0e5).round() / 1.0e5;
                        new_value = Some(format!("{rounded}"));
                    }
                }
                Kind::Text if !e.allowed.is_empty() => {
                    egui::ComboBox::from_id_source(("worldgen-choice", rel, e.key.as_str())).selected_text(current.as_str()).show_ui(ui, |ui| {
                        for choice in &e.allowed {
                            if ui.selectable_label(*choice == current, choice.as_str()).clicked() {
                                new_value = Some(choice.clone());
                            }
                        }
                    });
                }
                _ => {
                    let mut text = current.clone();
                    if ui.add(egui::TextEdit::singleline(&mut text).desired_width(190.0)).changed() {
                        new_value = Some(text);
                    }
                }
            }
        }

        // 3. Where it stands.
        ui.horizontal(|ui| {
            let range = e.range_text();
            if !range.is_empty() {
                ui.label(RichText::new(range).small().weak());
            }
            if let Some(why) = locked {
                ui.label(RichText::new("locked").small().color(WARN)).on_hover_text(why);
            } else if !e.editable() {
                ui.label(RichText::new("a list: edit the file").small().weak());
            } else if typed.is_some() {
                ui.colored_label(WARN, "not saved");
                ui.label(RichText::new(format!("now: {}", self.baseline(rel, e))).small().weak());
                if ui.small_button("undo").clicked() {
                    actions.push(Action::Undo(e.key.clone()));
                }
            } else if let Some(l) = mine {
                let colour = match l.state {
                    State::InFile => GOOD,
                    State::Waiting | State::WaitingReset => WARN,
                    State::MissingFile | State::MissingKey => BAD,
                };
                ui.colored_label(colour, if l.state == State::InFile { "yours" } else { l.state.text() });
                ui.label(RichText::new(format!("the pack's: {}", l.item.base.as_deref().map_or("?".to_string(), |b| e.show(b)))).small().weak());
                if !l.item.revert && ui.small_button("reset").on_hover_text("Give this setting back the pack's value").clicked() {
                    actions.push(Action::Reset { file: rel.to_string(), key: e.key.clone() });
                }
            }
            if let Some(why) = self.refused.get(&id) {
                ui.colored_label(BAD, why.as_str());
            }
        });

        if let Some(value) = new_value {
            actions.push(Action::Edit { key: e.key.clone(), value });
        }
    }
}

/// A raw value without its quotes, for a table.
fn plain(raw: &str) -> String {
    let t = raw.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        t[1..t.len() - 1].to_string()
    } else {
        t.to_string()
    }
}

fn shorten(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        let cut: String = text.chars().take(max).collect();
        format!("{cut}...")
    }
}

fn capitalised(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// The first line of a key's comment that describes it, without the range and
/// default the editor already shows.
fn describe(e: &Entry) -> String {
    for line in e.comment.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("range:") || lower.starts_with("allowed values:") {
            continue;
        }
        let text = match lower.find("[range:").or_else(|| lower.find("[default:")) {
            Some(cut) => line[..cut].trim(),
            None => line.trim(),
        };
        if !text.is_empty() {
            return shorten(text, 170);
        }
    }
    String::new()
}
