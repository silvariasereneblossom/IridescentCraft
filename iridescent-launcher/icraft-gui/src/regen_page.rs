//! The Customizer's third page: carrying a regeneration plan out.
//!
//! This page is the only place a regeneration of the live world can be started
//! from, and what starts it is typed: the first characters of the plan's hash,
//! as shown on screen, into a field. A click alone starts nothing, a preview
//! (which can photograph but not type) starts nothing, and nothing outside
//! this window can fill the field. The check itself is not made here: the
//! typed text is handed to `regen::exec::execute`, which compares it with the
//! hash of the plan it is about to carry out.
//!
//! Nothing on this page decides anything about the world either. It picks a
//! dry-run, asks `regen::exec::preflight` what stands in the way and shows the
//! answer, and hands over the approval. The run, the backup and a rollback all
//! happen on a worker thread: they hold the launch gate, which a backup can
//! keep for minutes, and the window must never wait on that.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use eframe::egui::{self, RichText};
use icraft_core::backup;
use icraft_core::config::ServerConfig;
use icraft_core::regen::exec::{self, Approval, HoldingEntry, Mark, Outcome, Preflight, Pregen};
use icraft_core::regen::{self, fidelity, RunEntry};

use crate::customizer::{mono_line, open_path, section, BAD, GOOD, WARN};

/// The colour of "would be regenerated" on the map, and of the button here.
const REGEN: egui::Color32 = egui::Color32::from_rgb(230, 110, 40);

/// A dry-run that could be carried out: one that selects something.
struct RunRow {
    entry: RunEntry,
    scope: String,
    targets: usize,
    on_disk: usize,
    hash: String,
    when: String,
}

/// What a worker thread brings back.
enum Finished {
    Checked(String, Result<Preflight, String>),
    BackedUp(Result<backup::Pinned, String>),
    Ran(Outcome),
    RolledBack(Result<String, String>),
}

pub struct RegenPage {
    loaded_for: Option<PathBuf>,
    runs: Vec<RunRow>,
    /// Every run folder seen at the last scan, to tell when the list changed.
    seen: Vec<String>,
    /// The picked dry-run's folder name.
    selected: Option<String>,
    last_scan: Option<Instant>,
    /// What the check said, and for which dry-run.
    checked: Option<(String, Result<Preflight, String>)>,
    /// The approval field. Only the keyboard writes to it.
    typed: String,
    job: Arc<Mutex<Option<Finished>>>,
    busy: Option<(Instant, &'static str)>,
    /// How the last run, backup or rollback ended: (went well, what to show).
    result: Option<(bool, String)>,
    holdings: Vec<HoldingEntry>,
    /// Per holding folder: the fidelity harness's verdict (holds, its line)
    /// and its report after the first start, read at each scan.
    harness: Vec<(Option<(bool, String)>, Option<String>)>,
    rollback_typed: String,
    /// Set by a preview: check the newest dry-run once the folder is loaded.
    want_check: bool,
    pub expand_all: bool,
}

impl RegenPage {
    pub fn new() -> Self {
        RegenPage {
            loaded_for: None,
            runs: Vec::new(),
            seen: Vec::new(),
            selected: None,
            last_scan: None,
            checked: None,
            typed: String::new(),
            job: Arc::new(Mutex::new(None)),
            busy: None,
            result: None,
            holdings: Vec::new(),
            harness: Vec::new(),
            rollback_typed: String::new(),
            want_check: false,
            expand_all: false,
        }
    }

    pub fn busy(&self) -> bool {
        self.busy.is_some()
    }

    /// For a preview: check the newest dry-run as soon as there is one, so the
    /// photograph shows what stands before a run. (A preview cannot type, so
    /// that is as far as it gets.)
    pub fn preview(&mut self) {
        self.want_check = true;
    }

    fn rescan(&mut self, server_dir: &Path) {
        // A run's summary is read once, when its folder first shows up.
        let found = regen::list_runs(server_dir);
        let names: Vec<String> = found.iter().map(|r| r.name.clone()).collect();
        if names != self.seen {
            self.seen = names;
            self.runs = found
                .into_iter()
                .filter_map(|entry| {
                    let view = regen::load_view(&entry.dir).ok()?;
                    (view.targets > 0).then(|| RunRow {
                        entry,
                        scope: view.scope,
                        targets: view.targets,
                        on_disk: view.on_disk,
                        hash: view.plan_hash,
                        when: view.created_local,
                    })
                })
                .collect();
        }
        if !self.selected.as_ref().is_some_and(|name| self.runs.iter().any(|r| &r.entry.name == name)) {
            self.selected = self.runs.first().map(|r| r.entry.name.clone());
            self.typed.clear();
        }
        self.holdings = exec::holdings(server_dir);
        self.harness = self
            .holdings
            .iter()
            .map(|h| {
                let verdict = fidelity::load(&h.dir).map(|r| (r.verdict.holds(), r.verdict.line()));
                (verdict, fidelity::load_after_boot(&h.dir).map(|r| r.line))
            })
            .collect();
        self.last_scan = Some(Instant::now());
    }

    fn picked(&self) -> Option<&RunRow> {
        let name = self.selected.as_ref()?;
        self.runs.iter().find(|r| &r.entry.name == name)
    }

    /// What the check said about the picked dry-run, if it was made for it.
    fn check_of_picked(&self) -> Option<&Result<Preflight, String>> {
        let (name, result) = self.checked.as_ref()?;
        (Some(name) == self.selected.as_ref()).then_some(result)
    }

    fn start(&mut self, what: &'static str, work: impl FnOnce() -> Finished + Send + 'static) {
        if self.busy.is_some() {
            return;
        }
        *self.job.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let slot = Arc::clone(&self.job);
        self.busy = Some((Instant::now(), what));
        self.result = None;
        std::thread::spawn(move || {
            let finished = work();
            *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(finished);
        });
    }

    fn start_check(&mut self, server_dir: &Path) {
        let Some(row) = self.picked() else { return };
        let (name, dir) = (row.entry.name.clone(), row.entry.dir.clone());
        let cfg = ServerConfig::from_path(server_dir);
        self.start("reading the world to check the plan against it (nothing is modified)", move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| exec::preflight(&cfg, &dir)))
                .unwrap_or_else(|_| Err("the check panicked (nothing was modified; please report this)".to_string()));
            Finished::Checked(name, result)
        });
    }

    fn take(&mut self, server_dir: &Path) {
        let Some(finished) = self.job.lock().unwrap_or_else(|e| e.into_inner()).take() else { return };
        self.busy = None;
        match finished {
            Finished::Checked(name, result) => {
                // A plan that changed comes with a fresh dry-run: show that one next.
                self.checked = Some((name, result));
            }
            Finished::BackedUp(Ok(pinned)) => {
                self.result = Some((true, format!(
                    "Backup: backups\\{} ({}, sha256 {}){}. It is pinned: nothing deletes it but you.",
                    pinned.entry.file,
                    backup::fmt_bytes(pinned.entry.size),
                    pinned.entry.sha256,
                    if pinned.reused { ", already there for the world as it is and verified again" } else { ", taken and verified" }
                )));
                self.checked = None;
            }
            Finished::BackedUp(Err(why)) => self.result = Some((false, format!("No backup: {why}"))),
            Finished::Ran(outcome) => {
                self.typed.clear();
                self.result = Some((outcome.is_done(), outcome.line()));
                if let Outcome::PlanChanged(preflight) = outcome {
                    self.checked = Some((preflight.run_name.clone(), Ok(*preflight)));
                } else {
                    self.checked = None;
                }
            }
            Finished::RolledBack(result) => {
                self.rollback_typed.clear();
                self.checked = None;
                self.result = Some(match result {
                    Ok(said) => (true, said),
                    Err(why) => (false, format!("Not rolled back: {why}")),
                });
            }
        }
        self.last_scan = None;
        let _ = server_dir;
    }

    pub fn ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        if self.loaded_for.as_deref() != Some(server_dir) {
            self.loaded_for = Some(server_dir.to_path_buf());
            self.runs.clear();
            self.seen.clear();
            self.selected = None;
            self.checked = None;
            self.typed.clear();
            self.rollback_typed.clear();
            self.result = None;
            self.last_scan = None;
        }
        if self.busy.is_some() {
            self.take(server_dir);
            // No spinner and no undelayed repaint: a frame costs ~0.2 s of CPU
            // on the server's software renderer.
            ui.ctx().request_repaint_after(Duration::from_millis(1000));
        }
        if self.last_scan.map_or(true, |t| t.elapsed() >= Duration::from_secs(5)) {
            self.rescan(server_dir);
        }
        if self.want_check && self.busy.is_none() && self.picked().is_some() {
            self.want_check = false;
            self.start_check(server_dir);
        }

        ui.heading("World regeneration: carrying a plan out");
        ui.label(
            RichText::new(
                "This resets chunks: the ones the picked dry-run shows in orange are taken out of the world, and Minecraft generates them again the next time somebody goes there. It runs only with the server stopped, only from this page, and only after you type the plan's code below. Before it changes anything it takes a pinned backup of the world and checks it; what it takes out is kept in a holding folder, from which 'Roll back' puts everything back exactly as it was.",
            )
            .small()
            .weak(),
        );
        ui.add_space(6.0);

        self.plan_ui(ui, server_dir);
        ui.add_space(8.0);
        self.check_ui(ui);
        ui.add_space(8.0);
        self.approve_ui(ui, server_dir);
        ui.add_space(10.0);
        self.holding_ui(ui, server_dir);
        ui.add_space(8.0);
    }

    fn plan_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        ui.label(RichText::new("1. The plan").strong());
        if self.runs.is_empty() {
            ui.label("No dry-run that would regenerate anything has been made yet. Make one on the 'Backups and world refresh' page (choose what would be regenerated, then 'Run the dry-run'), look at its map, and come back.");
            return;
        }
        let current = self.selected.clone().unwrap_or_else(|| "pick a dry-run".to_string());
        let mut pick: Option<String> = None;
        let mut check = false;
        ui.horizontal_wrapped(|ui| {
            ui.label("Dry-run:");
            egui::ComboBox::from_id_source("regen-exec-run").selected_text(current.as_str()).width(250.0).show_ui(ui, |ui| {
                for row in &self.runs {
                    let text = format!("{}   ({}, {} chunks)", row.entry.name, row.scope, regen::num(row.targets));
                    if ui.selectable_label(self.selected.as_ref() == Some(&row.entry.name), text).clicked() {
                        pick = Some(row.entry.name.clone());
                    }
                }
            });
            if let Some(row) = self.picked() {
                if ui.button("Open its folder").clicked() {
                    open_path(&row.entry.dir);
                }
            }
            check = ui.add_enabled(self.busy.is_none() && self.picked().is_some(), egui::Button::new("Check it against the world now")).clicked();
        });
        if let Some(name) = pick {
            if self.selected.as_ref() != Some(&name) {
                self.selected = Some(name);
                self.typed.clear();
            }
        }
        if let Some(row) = self.picked() {
            ui.label(format!(
                "Made {}. Scope {}: {} of {} chunks on disk would be reset, {} kept.",
                row.when,
                row.scope,
                regen::num(row.targets),
                regen::num(row.on_disk),
                regen::num(row.on_disk.saturating_sub(row.targets))
            ));
            ui.horizontal_wrapped(|ui| {
                ui.label(RichText::new("plan sha256").small());
                ui.label(RichText::new(row.hash.as_str()).small().monospace());
            });
            ui.label(RichText::new("Its map is on the 'Backups and world refresh' page, under Results: pick the same run there. Orange is what goes.").small().weak());
        }
        if check {
            self.start_check(server_dir);
        }
    }

    fn check_ui(&mut self, ui: &mut egui::Ui) {
        ui.label(RichText::new("2. What stands before it").strong());
        if let Some((since, what)) = self.busy {
            ui.label(format!("{what}... {} s", since.elapsed().as_secs()));
            for step in exec::progress().iter().rev().take(6).rev() {
                mono_line(ui, step);
            }
        }
        if let Some((good, text)) = &self.result {
            ui.colored_label(if *good { GOOD } else { BAD }, text.as_str());
        }
        let mut pick_fresh: Option<String> = None;
        match self.check_of_picked() {
            None if self.busy.is_none() => {
                ui.weak("Not checked yet. 'Check it against the world now' reads the world (it changes nothing, and works while the server runs) and lists what a run would do and what would stop it.");
            }
            None => {}
            Some(Err(why)) => {
                ui.colored_label(BAD, format!("The plan could not be checked: {why}"));
            }
            Some(Ok(p)) => {
                if p.same_plan {
                    ui.colored_label(GOOD, format!(
                        "The plan is still the one this dry-run shows: {} chunk(s) to reset, {} to keep.",
                        regen::num(p.targets),
                        regen::num(p.kept)
                    ));
                } else {
                    ui.colored_label(BAD, format!(
                        "The world is not what this dry-run saw: {} chunk(s) would be reset now that it does not list, and {} that it lists would not be. Nothing can be carried out from this dry-run.",
                        regen::num(p.added),
                        regen::num(p.removed)
                    ));
                    if !p.added_sample.is_empty() {
                        ui.label(format!("New in the plan, the first of them: {}", p.added_sample.join("; ")));
                    }
                    if !p.removed_sample.is_empty() {
                        ui.label(format!("No longer in the plan, the first of them: {}", p.removed_sample.join("; ")));
                    }
                    match &p.new_run {
                        Some(name) => {
                            ui.label(format!("A fresh dry-run of the same question was written: {name}. Look at its map, then approve that one."));
                            if ui.button("Pick the fresh dry-run").clicked() {
                                pick_fresh = Some(name.clone());
                            }
                        }
                        None => {
                            ui.label("Make the dry-run again on the 'Backups and world refresh' page, look at its map, then approve that one.");
                        }
                    }
                }
                let stops = p.stops().len();
                if stops > 0 {
                    ui.colored_label(BAD, format!("{stops} thing(s) stop a run as things stand:"));
                }
                for l in &p.lines {
                    let (colour, mark) = match l.mark {
                        Mark::Ok => (GOOD, "ok   "),
                        Mark::Stop => (BAD, "STOP "),
                        Mark::Note => (ui.visuals().text_color(), "note "),
                    };
                    ui.horizontal_top(|ui| {
                        ui.label(RichText::new(mark).monospace().color(colour));
                        ui.add(egui::Label::new(RichText::new(l.text.as_str()).color(colour)).wrap(true));
                    });
                }
            }
        }
        if let Some(name) = pick_fresh {
            self.selected = Some(name);
            self.typed.clear();
            self.last_scan = None;
        }
    }

    fn approve_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        ui.label(RichText::new("3. The backup, and your go").strong());
        let Some(row) = self.picked() else { return };
        let (run_dir, hash, targets) = (row.entry.dir.clone(), row.hash.clone(), row.targets);
        let code: String = hash.chars().take(exec::APPROVAL_CHARS).collect();
        let ready = matches!(self.check_of_picked(), Some(Ok(p)) if p.ready());
        let stopped = !icraft_core::run::jvm_active();
        let idle = self.busy.is_none();

        ui.label(
            RichText::new(
                "The run takes a pinned backup first and goes no further unless it verifies. To see that backup on your own PC before you approve: take it now, then on your PC run the pull (it also runs by itself every two hours) and look for the same file name and sha256 in its status line.",
            )
            .small()
            .weak(),
        );
        let mut backup_now = false;
        ui.horizontal_wrapped(|ui| {
            backup_now = ui
                .add_enabled(idle && stopped, egui::Button::new("Take the backup now"))
                .on_hover_text("Takes a pinned backup of the world as it is (or finds the one already taken of it) and verifies it. The run then uses that one, as long as the world has not changed.")
                .clicked();
            if !stopped {
                ui.colored_label(WARN, "The server is running: stop it first (Server tab).");
            }
        });
        section(ui, self.expand_all, "regen-offbox", "How to see the backup on your own PC", false, |ui| {
            mono_line(ui, "powershell -NoProfile -ExecutionPolicy Bypass -File \"$env:USERPROFILE\\IridescentCraft-ServerBackups\\pull-server-backups.ps1\"");
            mono_line(ui, "powershell -NoProfile -ExecutionPolicy Bypass -File \"$env:USERPROFILE\\IridescentCraft-ServerBackups\\pull-server-backups.ps1\" -Status");
            ui.label("The first copies the newest backups and checks each against its sha256; the second says what is there. The file is then in %USERPROFILE%\\IridescentCraft-ServerBackups, and pulled.json beside it lists it with the sha256 shown here. That folder keeps only the newest two backups: to keep this one there for longer, copy it to another name.");
        });

        ui.add_space(6.0);
        ui.horizontal_wrapped(|ui| {
            ui.label("To carry this plan out, type its code");
            ui.label(RichText::new(code.as_str()).monospace().strong().color(REGEN));
            ui.label("here:");
            ui.add(egui::TextEdit::singleline(&mut self.typed).desired_width(110.0).font(egui::TextStyle::Monospace).char_limit(exec::APPROVAL_CHARS).hint_text("type it"));
        });
        let matches = self.typed.trim().eq_ignore_ascii_case(&code);
        let mut go = false;
        ui.horizontal_wrapped(|ui| {
            let button = egui::Button::new(RichText::new(format!("Regenerate {} chunks", regen::num(targets))).strong().color(REGEN)).min_size(egui::vec2(220.0, 32.0));
            go = ui.add_enabled(idle && ready && stopped && matches, button).clicked();
            if !idle {
                ui.weak("working...");
            } else if !ready {
                ui.weak("Check the plan first (step 1); it has to come out as the same plan with nothing stopping it.");
            } else if !stopped {
                ui.weak("The server has to be stopped.");
            } else if !matches {
                ui.weak("The code is the first eight characters of the plan's sha256, shown in step 1.");
            } else {
                ui.colored_label(WARN, "This resets the chunks. The run checks everything again first, and the fidelity harness checks the world on its own before and after; its verdict is on the done line and under 'Holding folders' below.");
            }
        });
        ui.label(RichText::new("Afterwards nothing is pregenerated: the reset chunks are generated when a player first goes there. Pregenerating them is switched off in this build.").small().weak());

        let cfg = ServerConfig::from_path(server_dir);
        if backup_now {
            self.start("taking the backup (the world is zipped and read back)", move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| exec::backup_now(&cfg, &hash)))
                    .unwrap_or_else(|_| Err("the backup panicked (please report this)".to_string()));
                Finished::BackedUp(result)
            });
        } else if go {
            let approval = Approval { run_dir, typed: self.typed.clone(), by: "window".to_string(), pregen: Pregen::Off };
            log::info!("[regen] a regeneration was approved in the window ({} chunks, plan {})", regen::num(targets), code);
            self.start("regenerating: checking, backing up, then resetting the chunks", move || Finished::Ran(exec::execute(&cfg, &approval)));
        }
    }

    fn holding_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        ui.label(RichText::new("Holding folders, and rolling back").strong());
        if self.holdings.is_empty() {
            ui.weak("None: no regeneration has been carried out on this server.");
            return;
        }
        ui.label(
            RichText::new(
                "Each run keeps what it took out of the world in regen-holding\\. 'Roll back' puts every file back where it was and checks each against the sha256 taken before the run. That is exact for as long as the server has not been started on the regenerated world; after that the way back is the pinned backup. Nothing deletes a holding folder: delete it yourself once the new world has been looked at.",
            )
            .small()
            .weak(),
        );
        let stopped = !icraft_core::run::jvm_active();
        let idle = self.busy.is_none();
        let mut undo: Option<PathBuf> = None;
        let newest = self.holdings.first().map(|h| h.name.clone());
        for (index, held) in self.holdings.iter().enumerate() {
            let Some(record) = &held.record else {
                mono_line(ui, &format!("{}   {}   (no readable record)", held.name, backup::fmt_bytes(held.bytes)));
                continue;
            };
            mono_line(ui, &format!(
                "{}   {}   {}   {} reset, {} kept   backup {}",
                held.name,
                record.state,
                backup::fmt_bytes(held.bytes),
                regen::num(record.chunks_reset),
                regen::num(record.chunks_kept),
                record.backup_file
            ));
            if let Some((verdict, after_boot)) = self.harness.get(index) {
                match verdict {
                    Some((holds, line)) => {
                        ui.add(egui::Label::new(RichText::new(line.as_str()).small().color(if *holds { GOOD } else { BAD })).wrap(true));
                    }
                    None => {
                        ui.label(RichText::new("No fidelity harness verdict in this folder (a run from before the harness, or one cut off).").small().weak());
                    }
                }
                if let Some(line) = after_boot {
                    ui.add(egui::Label::new(RichText::new(line.as_str()).small()).wrap(true));
                } else if verdict.as_ref().is_some_and(|(holds, _)| *holds) && record.state == "complete" {
                    ui.label(RichText::new("After the first start on this world the launcher adds the harness's report on it here (kept chunks, chunks the server saved again, seams).").small().weak());
                }
            }
            let can_undo = matches!(record.state.as_str(), "complete" | "started");
            if Some(&held.name) == newest.as_ref() && can_undo {
                let code: String = record.plan_hash.chars().take(exec::APPROVAL_CHARS).collect();
                ui.horizontal_wrapped(|ui| {
                    ui.label("To roll this run back, type its code");
                    ui.label(RichText::new(code.as_str()).monospace().strong());
                    ui.label("here:");
                    ui.add(egui::TextEdit::singleline(&mut self.rollback_typed).desired_width(110.0).font(egui::TextStyle::Monospace).char_limit(exec::APPROVAL_CHARS).hint_text("type it"));
                    let matches = self.rollback_typed.trim().eq_ignore_ascii_case(&code);
                    if ui.add_enabled(idle && stopped && matches, egui::Button::new("Roll back")).clicked() {
                        undo = Some(held.dir.clone());
                    }
                    if ui.button("Open the folder").clicked() {
                        open_path(&held.dir);
                    }
                });
                if record.state == "started" {
                    ui.colored_label(BAD, "This run did not finish. The server is not started until it is rolled back.");
                }
            }
        }
        if let Some(dir) = undo {
            let cfg = ServerConfig::from_path(server_dir);
            let typed = self.rollback_typed.clone();
            log::info!("[regen] a rollback was approved in the window");
            self.start("rolling back: putting every file back and checking it", move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| exec::rollback(&cfg, &dir, &typed, "window")))
                    .unwrap_or_else(|_| Err("the rollback panicked (please report this)".to_string()));
                Finished::RolledBack(result)
            });
        }
    }
}
