//! The Customizer tab: world backups, and the protection map / regeneration
//! dry-run with everything on screen.
//!
//! What `icraft regen-dryrun` takes as flags is set here with widgets (what
//! would be regenerated, which dimensions, every protection layer, the manual
//! keep / never-keep lists), and what it writes to `regen-reports\` is shown
//! here: the headline numbers, each layer, the region files, players,
//! warnings, the map. Nothing in this file decides anything about the world.
//! It builds a [`RunSpec`], hands it to [`regen::run_logged`] on a worker
//! thread, and draws the [`RunView`] the run left in its folder, so a run made
//! over WinRM or last week reads the same as one made here.
//!
//! The dry-run only reads the world. The one thing this tab writes is the
//! operator's own policy file, and only when "Save as the standing policy" is
//! clicked.
//!
//! The tab has three pages. This file is the first, "Backups and world
//! refresh"; the second, "Worldgen settings", is `worldgen_page.rs`; the
//! third, "Regenerate", is `regen_page.rs`: the one place a plan made here can
//! be carried out from. All are hosted from [`Customizer::ui`]. A further page
//! is a struct with a `ui(&mut self, ui, server_dir)` of its own and one more
//! entry in [`Page`].
//!
//! The tab draws itself from a server folder path and nothing else of the
//! launcher's, so it can be hosted in a window of its own later.
//!
//! Drawing cost matters on the server box (software OpenGL, one thread): a
//! run's files are read once when it is picked, never per frame, and the long
//! report is laid out row by row.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use eframe::egui::{self, Color32, RichText};
use icraft_core::backup;
use icraft_core::config::ServerConfig;
use icraft_core::protection::{self, Settings, WaystoneMode};
use icraft_core::anvil::ChunkPos;
use icraft_core::regen::{self, DimView, MapInfo, RunEntry, RunSpec, RunView, Scope, StructuresView};

pub(crate) const GOOD: Color32 = Color32::from_rgb(120, 200, 140);
pub(crate) const WARN: Color32 = Color32::from_rgb(220, 170, 60);
pub(crate) const BAD: Color32 = Color32::from_rgb(220, 140, 140);
/// The map's colour for "would be regenerated".
const REGEN: Color32 = Color32::from_rgb(230, 110, 40);

/// The pages of the tab.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    /// World backups, the protection map and the regeneration dry-run.
    Refresh,
    /// The pack's worldgen config files (`worldgen_page.rs`).
    Worldgen,
    /// Carrying a regeneration plan out (`regen_page.rs`).
    Regenerate,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ScopeKind {
    Report,
    Ring,
    All,
    Box,
}

struct DimChoice {
    id: String,
    hint: String,
    on: bool,
}

/// What the policy file was when it was last read.
enum Policy {
    Absent,
    InEffect,
    Invalid(String),
}

struct MapTexture {
    dim: String,
    texture: egui::TextureHandle,
    info: MapInfo,
}

/// A run, loaded for display.
struct Shown {
    dir: PathBuf,
    view: Option<RunView>,
    /// Why there is no view (a run by an older launcher, a damaged file).
    view_error: Option<String>,
    report: Vec<String>,
    maps: Vec<MapTexture>,
    map_notes: Vec<String>,
}

/// "What is in a chunk": a chunk clicked on a run's map, or typed in, looked
/// up on a worker thread ([`regen::chunk_info`]: a few region files and the
/// run's CSV files; nothing is written).
struct ChunkLookup {
    x: String,
    z: String,
    /// The two fields are chunk coordinates (the map's), not block ones (F3's).
    chunks: bool,
    /// The dimension of the last lookup: its answer is shown under that map.
    dim: String,
    job: Arc<Mutex<Option<Result<Vec<String>, String>>>>,
    busy: bool,
    answer: Option<Result<Vec<String>, String>>,
}

impl ChunkLookup {
    fn new() -> Self {
        ChunkLookup { x: String::new(), z: String::new(), chunks: false, dim: String::new(), job: Arc::new(Mutex::new(None)), busy: false, answer: None }
    }

    fn start(&mut self, ctx: &egui::Context, server_dir: &Path, run: &Path, dim: &str, pos: ChunkPos) {
        if self.busy {
            return;
        }
        self.dim = dim.to_string();
        self.busy = true;
        self.answer = None;
        *self.job.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let (slot, ctx, cfg, run, dim) = (Arc::clone(&self.job), ctx.clone(), ServerConfig::from_path(server_dir), run.to_path_buf(), dim.to_string());
        std::thread::spawn(move || {
            let answer = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| regen::chunk_info(&cfg, &dim, pos, Some(&run))))
                .unwrap_or_else(|_| Err("the lookup panicked (nothing was modified; please report this)".to_string()));
            *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(answer);
            ctx.request_repaint();
        });
    }

    /// A chunk clicked on the map.
    fn clicked(&mut self, ctx: &egui::Context, server_dir: &Path, run: &Path, dim: &str, pos: ChunkPos) {
        self.x = pos.0.to_string();
        self.z = pos.1.to_string();
        self.chunks = true;
        self.start(ctx, server_dir, run, dim, pos);
    }

    fn ui(&mut self, ui: &mut egui::Ui, server_dir: &Path, run: &Path, dim: &str) {
        if self.busy {
            if let Some(answer) = self.job.lock().unwrap_or_else(|e| e.into_inner()).take() {
                self.answer = Some(answer);
                self.busy = false;
            }
        }
        ui.horizontal_wrapped(|ui| {
            ui.label("x");
            ui.add(egui::TextEdit::singleline(&mut self.x).desired_width(70.0));
            ui.label("z");
            ui.add(egui::TextEdit::singleline(&mut self.z).desired_width(70.0));
            ui.checkbox(&mut self.chunks, "chunk coordinates")
                .on_hover_text("Off: block coordinates, as F3 shows them. On: chunk coordinates, as the map shows them.");
            if ui.add_enabled(!self.busy, egui::Button::new("Look up")).clicked() {
                match (self.x.trim().parse::<i64>(), self.z.trim().parse::<i64>()) {
                    (Ok(x), Ok(z)) => match regen::chunk_of(x, z, self.chunks) {
                        Ok(pos) => self.start(ui.ctx(), server_dir, run, dim, pos),
                        Err(why) => {
                            self.dim = dim.to_string();
                            self.answer = Some(Err(why));
                        }
                    },
                    _ => {
                        self.dim = dim.to_string();
                        self.answer = Some(Err("x and z take whole numbers".to_string()));
                    }
                }
            }
            if self.busy {
                ui.spinner();
            }
        });
        ui.weak("Or click a chunk on the map. Reads that chunk and the starts of the structures in it, and says what this run's plan does with them. Nothing is written.");
        if self.dim == dim {
            match &self.answer {
                Some(Ok(lines)) => {
                    for line in lines {
                        mono_line(ui, line);
                    }
                }
                Some(Err(why)) => {
                    ui.colored_label(BAD, why.as_str());
                }
                None => {}
            }
        }
    }
}

pub struct Customizer {
    page: Page,
    worldgen: crate::worldgen_page::WorldgenPage,
    regenerate: crate::regen_page::RegenPage,

    /// The install dir the fields below were loaded for.
    loaded_for: Option<PathBuf>,

    scope: ScopeKind,
    ring: u32,
    box_chunks: [i32; 4],
    dims: Vec<DimChoice>,

    bed_on: bool,
    bed_radius: u32,
    logout_on: bool,
    logout_radius: u32,
    claims: bool,
    spawn_on: bool,
    spawn_radius: u32,
    waystones: WaystoneMode,
    waystone_radius: u32,
    lived_on: bool,
    lived_ticks: u64,
    warn_ticks: u64,
    protect_text: String,
    unprotect_text: String,
    policy: Policy,
    /// What the policy file gives (the defaults when there is none).
    saved: Settings,
    note: String,

    /// Where the worker thread leaves a finished run's folder, or why it failed.
    job: Arc<Mutex<Option<Result<PathBuf, String>>>>,
    running_since: Option<Instant>,
    error: Option<String>,

    runs: Vec<RunEntry>,
    last_scan: Option<Instant>,
    shown: Option<Shown>,
    lookup: ChunkLookup,

    backups: String,
    backups_at: Option<Instant>,

    /// A run started here has just finished: scroll its results into view.
    reveal_results: bool,
    /// Every section open (for the preview's screenshots).
    pub expand_all: bool,
}

impl Customizer {
    pub fn new() -> Self {
        let mut tab = Customizer {
            page: Page::Refresh,
            worldgen: crate::worldgen_page::WorldgenPage::new(),
            regenerate: crate::regen_page::RegenPage::new(),
            loaded_for: None,
            scope: ScopeKind::Report,
            ring: 8,
            box_chunks: [0; 4],
            dims: Vec::new(),
            bed_on: true,
            bed_radius: 0,
            logout_on: true,
            logout_radius: 0,
            claims: true,
            spawn_on: true,
            spawn_radius: 0,
            waystones: WaystoneMode::Used,
            waystone_radius: 0,
            lived_on: true,
            lived_ticks: 0,
            warn_ticks: 0,
            protect_text: String::new(),
            unprotect_text: String::new(),
            policy: Policy::Absent,
            saved: Settings::default(),
            note: String::new(),
            job: Arc::new(Mutex::new(None)),
            running_since: None,
            error: None,
            runs: Vec::new(),
            last_scan: None,
            shown: None,
            lookup: ChunkLookup::new(),
            backups: String::new(),
            backups_at: None,
            reveal_results: false,
            expand_all: false,
        };
        tab.set_fields(&Settings::default());
        tab
    }

    pub fn busy(&self) -> bool {
        self.running_since.is_some() || self.regenerate.busy()
    }

    pub fn failed(&self) -> bool {
        self.error.is_some()
    }

    /// A name for the page on screen, for the window to keep a scroll position
    /// per page (they differ a lot in length).
    pub fn page_name(&self) -> &'static str {
        match self.page {
            Page::Refresh => "tab-customizer",
            Page::Worldgen => "tab-customizer-worldgen",
            Page::Regenerate => "tab-customizer-regenerate",
        }
    }

    /// For a preview: show the Regenerate page and check the newest dry-run
    /// there. A preview cannot type, so it can show the page and no more.
    pub fn show_regenerate(&mut self) {
        self.page = Page::Regenerate;
        self.regenerate.preview();
    }

    /// For a preview: show the worldgen page, open `file` there and type
    /// `key=value;key=value` into it (nothing is saved).
    pub fn show_worldgen(&mut self, file: Option<&str>, edits: Option<&str>) {
        self.page = Page::Worldgen;
        self.worldgen.preview(file, edits);
    }

    /// Choose what would be regenerated from a scope token (`ring:8`, `all`,
    /// ...), as if the radio buttons had been clicked.
    pub fn set_scope(&mut self, token: &str) -> Result<(), String> {
        match Scope::parse(token)? {
            Scope::Report => self.scope = ScopeKind::Report,
            Scope::All => self.scope = ScopeKind::All,
            Scope::Ring(n) => {
                self.scope = ScopeKind::Ring;
                self.ring = n;
            }
            Scope::Box { x1, z1, x2, z2 } => {
                self.scope = ScopeKind::Box;
                self.box_chunks = [x1, z1, x2, z2];
            }
        }
        Ok(())
    }

    fn set_fields(&mut self, s: &Settings) {
        let d = Settings::default();
        self.bed_on = s.bed_radius.is_some();
        self.bed_radius = s.bed_radius.or(d.bed_radius).unwrap_or(1);
        self.logout_on = s.logout_radius.is_some();
        self.logout_radius = s.logout_radius.or(d.logout_radius).unwrap_or(1);
        self.claims = s.claims;
        self.spawn_on = s.spawn_radius_blocks.is_some();
        self.spawn_radius = s.spawn_radius_blocks.or(d.spawn_radius_blocks).unwrap_or(128);
        self.waystones = s.waystones;
        self.waystone_radius = s.waystone_radius;
        self.lived_on = s.inhabited_min_ticks.is_some();
        self.lived_ticks = s.inhabited_min_ticks.or(d.inhabited_min_ticks).unwrap_or(12_000);
        self.warn_ticks = s.inhabited_warn_ticks;
        let lines = |boxes: &[protection::ChunkBox]| boxes.iter().map(|b| b.to_string()).collect::<Vec<_>>().join("\n");
        self.protect_text = lines(&s.protect);
        self.unprotect_text = lines(&s.unprotect);
    }

    /// The settings on screen, or what is wrong with them.
    fn settings(&self) -> Result<Settings, String> {
        let settings = Settings {
            bed_radius: self.bed_on.then_some(self.bed_radius),
            logout_radius: self.logout_on.then_some(self.logout_radius),
            claims: self.claims,
            spawn_radius_blocks: self.spawn_on.then_some(self.spawn_radius),
            waystones: self.waystones,
            waystone_radius: self.waystone_radius,
            inhabited_min_ticks: self.lived_on.then_some(self.lived_ticks),
            inhabited_warn_ticks: self.warn_ticks,
            protect: protection::parse_boxes(&self.protect_text).map_err(|e| format!("Always keep: {e}"))?,
            unprotect: protection::parse_boxes(&self.unprotect_text).map_err(|e| format!("Never keep: {e}"))?,
        };
        settings.validate()?;
        Ok(settings)
    }

    fn spec(&self) -> Result<RunSpec, String> {
        let scope = match self.scope {
            ScopeKind::Report => Scope::Report,
            ScopeKind::Ring => Scope::Ring(self.ring),
            ScopeKind::All => Scope::All,
            ScopeKind::Box => {
                let [a, b, c, d] = self.box_chunks;
                Scope::Box { x1: a.min(c), z1: b.min(d), x2: a.max(c), z2: b.max(d) }
            }
        };
        let dims: Vec<String> = self.dims.iter().filter(|d| d.on).map(|d| d.id.clone()).collect();
        if dims.is_empty() {
            return Err("Tick at least one dimension.".to_string());
        }
        Ok(RunSpec { scope, dims, settings: Some(self.settings()?), ..RunSpec::default() })
    }

    fn reload_policy(&mut self, server_dir: &Path) {
        let (settings, policy) = match Settings::load(server_dir) {
            Ok((s, Some(_))) => (s, Policy::InEffect),
            Ok((s, None)) => (s, Policy::Absent),
            Err(e) => (Settings::default(), Policy::Invalid(e)),
        };
        self.set_fields(&settings);
        self.saved = settings;
        self.policy = policy;
    }

    fn rescan_dimensions(&mut self, server_dir: &Path) {
        let ticked: Vec<String> = self.dims.iter().filter(|d| d.on).map(|d| d.id.clone()).collect();
        self.dims = regen::dimension_choices(&ServerConfig::from_path(server_dir))
            .into_iter()
            .map(|(id, hint)| {
                let on = if ticked.is_empty() { id == "minecraft:overworld" } else { ticked.contains(&id) };
                DimChoice { id, hint, on }
            })
            .collect();
    }

    fn rescan_runs(&mut self, server_dir: &Path) {
        self.runs = regen::list_runs(server_dir);
        self.last_scan = Some(Instant::now());
    }

    /// Start a dry-run with what is on screen. The world is read on a worker
    /// thread; [`Customizer::ui`] picks the result up.
    pub fn start_run(&mut self, server_dir: &Path) {
        if self.busy() {
            return;
        }
        let spec = match self.spec() {
            Ok(spec) => spec,
            Err(why) => {
                self.error = Some(why);
                return;
            }
        };
        self.error = None;
        *self.job.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let slot = Arc::clone(&self.job);
        let cfg = ServerConfig::from_path(server_dir);
        self.running_since = Some(Instant::now());
        std::thread::spawn(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| regen::run_logged(&cfg, &spec, "window")))
                .unwrap_or_else(|_| Err("the analysis panicked (nothing was modified; please report this)".to_string()));
            *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(outcome.map(|summary| summary.out_dir));
        });
    }

    /// Read a run's folder into memory, once.
    fn show(&mut self, ctx: &egui::Context, dir: PathBuf) {
        let (view, view_error) = match regen::load_view(&dir) {
            Ok(view) => (Some(view), None),
            Err(e) => (None, Some(e)),
        };
        let report: Vec<String> =
            std::fs::read_to_string(dir.join("report.txt")).unwrap_or_default().lines().map(str::to_string).collect();
        let max_side = ctx.input(|i| i.max_texture_side);
        let mut maps = Vec::new();
        let mut map_notes = Vec::new();
        for d in view.iter().flat_map(|v| v.dimensions.iter()) {
            let Some(info) = &d.map else { continue };
            let image = std::fs::read(dir.join(&info.file)).ok().and_then(|bytes| icraft_core::png::decode_indexed(&bytes));
            match image {
                Some(image) if image.width as usize <= max_side && image.height as usize <= max_side => {
                    let pixels = egui::ColorImage::from_rgb([image.width as usize, image.height as usize], &image.to_rgb());
                    let texture = ctx.load_texture(format!("regen-map {} {}", dir.display(), d.id), pixels, egui::TextureOptions::NEAREST);
                    maps.push(MapTexture { dim: d.id.clone(), texture, info: info.clone() });
                }
                Some(_) => map_notes.push(format!("{}: the map is too large to draw here; open {} from the run's folder.", d.id, info.file)),
                None => map_notes.push(format!("{}: {} could not be read.", d.id, info.file)),
            }
        }
        self.shown = Some(Shown { dir, view, view_error, report, maps, map_notes });
        // An answer was about the run shown before.
        self.lookup.answer = None;
    }

    /// Draw the tab. Returns `true` when "Back up now" was clicked.
    pub fn ui(&mut self, ui: &mut egui::Ui, server_dir: &Path, backup_status: &backup::Status) -> bool {
        if self.loaded_for.as_deref() != Some(server_dir) {
            self.loaded_for = Some(server_dir.to_path_buf());
            self.dims.clear();
            self.rescan_dimensions(server_dir);
            self.reload_policy(server_dir);
            self.rescan_runs(server_dir);
            self.note.clear();
            self.error = None;
            self.backups_at = None;
            match self.runs.first().map(|r| r.dir.clone()) {
                Some(dir) => self.show(ui.ctx(), dir),
                None => self.shown = None,
            }
        }

        // A run of ours that has finished: show it.
        if self.running_since.is_some() {
            let finished = self.job.lock().unwrap_or_else(|e| e.into_inner()).take();
            match finished {
                Some(result) => {
                    self.running_since = None;
                    self.rescan_runs(server_dir);
                    match result {
                        Ok(dir) => {
                            self.show(ui.ctx(), dir);
                            self.reveal_results = true;
                        }
                        Err(why) => self.error = Some(why),
                    }
                }
                None => ui.ctx().request_repaint_after(Duration::from_millis(500)),
            }
        }
        // Runs made elsewhere (a request file, the command line) turn up in the list.
        if self.last_scan.map_or(true, |t| t.elapsed() >= Duration::from_secs(5)) {
            self.rescan_runs(server_dir);
        }

        ui.horizontal(|ui| {
            ui.selectable_value(&mut self.page, Page::Refresh, "  Backups and world refresh  ");
            ui.selectable_value(&mut self.page, Page::Worldgen, "  Worldgen settings  ");
            ui.selectable_value(&mut self.page, Page::Regenerate, "  Regenerate  ");
        });
        ui.add_space(6.0);
        if self.page == Page::Worldgen {
            self.worldgen.expand_all = self.expand_all;
            self.worldgen.ui(ui, server_dir);
            return false;
        }
        if self.page == Page::Regenerate {
            self.regenerate.expand_all = self.expand_all;
            self.regenerate.ui(ui, server_dir);
            return false;
        }

        let backup_now = self.backups_ui(ui, server_dir, backup_status);
        ui.add_space(12.0);
        self.inputs_ui(ui, server_dir);
        ui.add_space(12.0);
        self.results_ui(ui, server_dir);
        ui.add_space(8.0);
        backup_now
    }

    fn backups_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path, status: &backup::Status) -> bool {
        let mut backup_now = false;
        ui.heading("World backups");
        ui.label(
            RichText::new(
                "Scheduled: the world is zipped to backups\\world-YYYYmmdd-HHMM.zip in a Cycle's stopped window once the newest one is 12 h old, and the newest 2 are kept. 'Back up now' takes a PINNED backups\\manual-YYYYmmdd-HHMM.zip that is never pruned (delete it yourself once it has served its purpose): at once if the server is stopped, otherwise in the next Cycle's stopped window -- click Cycle on the Server tab to take it right away.",
            )
            .small()
            .weak(),
        );
        ui.add_space(2.0);
        ui.horizontal_wrapped(|ui| {
            // Not gated on a running task: it has to work while the server is up.
            if ui.add(egui::Button::new("Back up now").min_size(egui::vec2(140.0, 28.0))).clicked() {
                backup_now = true;
            }
            let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            let (colour, text) = if backup::in_progress() {
                (WARN, "running...".to_string())
            } else {
                let colour = match status.health(now) {
                    backup::Health::Good => GOOD,
                    backup::Health::Stale => WARN,
                    backup::Health::Bad => BAD,
                };
                (colour, status.label(now))
            };
            ui.colored_label(colour, format!("Latest scheduled backup: {text}"));
        });
        if self.backups_at.map_or(true, |t| t.elapsed() >= Duration::from_secs(10)) {
            self.backups = backup::report(&ServerConfig::from_path(server_dir));
            self.backups_at = Some(Instant::now());
        }
        let backups = &self.backups;
        section(ui, self.expand_all, "backups-list", "Policy and verified backups", false, |ui| {
            for line in backups.lines() {
                mono_line(ui, line);
            }
        });
        backup_now
    }

    fn inputs_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        ui.heading("World regeneration: dry-run");
        ui.label(
            RichText::new(
                "Works out which chunks a regeneration would keep and which it would reset, and shows it below. It only READS the world: nothing is deleted or changed, and it is safe while the server is running. Carrying a plan out is a separate step with its own page, 'Regenerate', and its own approval.",
            )
            .small()
            .weak(),
        );
        ui.add_space(4.0);

        ui.label(RichText::new("What would be regenerated").strong());
        ui.radio_value(&mut self.scope, ScopeKind::Report, "Nothing: only show what is protected");
        ui.horizontal_wrapped(|ui| {
            ui.radio_value(&mut self.scope, ScopeKind::Ring, "A ring around each bed:");
            ui.add(egui::DragValue::new(&mut self.ring).clamp_range(1..=256));
            ui.label(format!("chunks from the bed chunk each way (a {0}x{0} square)", 2 * self.ring + 1));
        });
        ui.radio_value(&mut self.scope, ScopeKind::All, "Everything that is not protected");
        ui.horizontal_wrapped(|ui| {
            ui.radio_value(&mut self.scope, ScopeKind::Box, "A box of chunks: from x");
            ui.add(egui::DragValue::new(&mut self.box_chunks[0]));
            ui.label("z");
            ui.add(egui::DragValue::new(&mut self.box_chunks[1]));
            ui.label("to x");
            ui.add(egui::DragValue::new(&mut self.box_chunks[2]));
            ui.label("z");
            ui.add(egui::DragValue::new(&mut self.box_chunks[3]));
            ui.weak("(chunk coordinates = block coordinates / 16)");
        });

        ui.add_space(6.0);
        ui.label(RichText::new("In which dimensions").strong());
        let mut rescan = false;
        ui.horizontal_wrapped(|ui| {
            for d in &mut self.dims {
                ui.checkbox(&mut d.on, format!("{}  ({})", d.id, d.hint));
            }
            if self.dims.is_empty() {
                ui.colored_label(BAD, "No world with chunks in this install dir.");
            }
            rescan = ui.small_button("Rescan").clicked();
        });
        if rescan {
            self.rescan_dimensions(server_dir);
        }

        ui.add_space(6.0);
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new("What is always kept").strong());
            match &self.policy {
                Policy::Absent => ui.weak("(no policy file: these are the defaults)"),
                Policy::InEffect => ui.weak(format!("(read from {})", protection::POLICY_FILE)),
                Policy::Invalid(e) => ui.colored_label(BAD, format!("The policy file does not parse ({e}). Showing the defaults.")),
            };
        });
        ui.horizontal_wrapped(|ui| {
            ui.checkbox(&mut self.bed_on, "Beds: each player's bed chunk and");
            ui.add_enabled(self.bed_on, egui::DragValue::new(&mut self.bed_radius).clamp_range(0..=64));
            ui.label(format!("chunks around it ({0}x{0})", 2 * self.bed_radius + 1));
        });
        ui.horizontal_wrapped(|ui| {
            ui.checkbox(&mut self.logout_on, "Logout spots: the chunk each player logged out in and");
            ui.add_enabled(self.logout_on, egui::DragValue::new(&mut self.logout_radius).clamp_range(0..=64));
            ui.label(format!("chunks around it ({0}x{0}), in that dimension", 2 * self.logout_radius + 1));
        });
        ui.checkbox(&mut self.claims, "Claims: every chunk claimed in Open Parties and Claims");
        ui.horizontal_wrapped(|ui| {
            ui.checkbox(&mut self.spawn_on, "World spawn: everything within");
            ui.add_enabled(self.spawn_on, egui::DragValue::new(&mut self.spawn_radius).clamp_range(0..=4096).speed(4));
            ui.label("blocks of it");
        });
        ui.horizontal_wrapped(|ui| {
            ui.label("Waystones:");
            ui.radio_value(&mut self.waystones, WaystoneMode::Used, "those a player has activated or placed");
            ui.radio_value(&mut self.waystones, WaystoneMode::All, "all, generated ones included");
            ui.radio_value(&mut self.waystones, WaystoneMode::Off, "none");
            ui.label("  and");
            ui.add(egui::DragValue::new(&mut self.waystone_radius).clamp_range(0..=64));
            ui.label("chunks around each");
        });
        ui.horizontal_wrapped(|ui| {
            ui.checkbox(&mut self.lived_on, "Lived-in: chunks a player has been within 128 blocks of for at least");
            ui.add_enabled(self.lived_on, egui::DragValue::new(&mut self.lived_ticks).clamp_range(0..=100_000_000u64).speed(100));
            ui.label(format!("ticks ({})", protection::fmt_ticks(self.lived_ticks as i64)));
        });
        ui.horizontal_wrapped(|ui| {
            ui.label("Warn about unprotected chunks from");
            ui.add(egui::DragValue::new(&mut self.warn_ticks).clamp_range(0..=100_000_000u64).speed(100));
            ui.label(format!("ticks ({})", protection::fmt_ticks(self.warn_ticks as i64)));
        });
        ui.add_space(2.0);
        ui.label("Always keep (one box per line: x,z or x1,z1..x2,z2 in chunk coordinates; add @dimension for another dimension)");
        ui.add(
            egui::TextEdit::multiline(&mut self.protect_text)
                .desired_rows(2)
                .desired_width(f32::INFINITY)
                .font(egui::TextStyle::Monospace)
                .hint_text("32,40..52,70"),
        );
        ui.label("Never keep, whatever the layers above say (same form)");
        ui.add(
            egui::TextEdit::multiline(&mut self.unprotect_text)
                .desired_rows(2)
                .desired_width(f32::INFINITY)
                .font(egui::TextStyle::Monospace),
        );

        let current = self.settings();
        let busy = self.busy();
        let (mut save, mut reload, mut defaults, mut run) = (false, false, false, false);
        ui.add_space(2.0);
        ui.horizontal_wrapped(|ui| {
            save = ui
                .add_enabled(current.is_ok(), egui::Button::new("Save as the standing policy"))
                .on_hover_text("Writes .icraft_regen_policy next to server.properties. Request-file and command-line runs use it too.")
                .clicked();
            reload = ui.button("Reload the policy file").clicked();
            defaults = ui.button("Defaults").clicked();
            match &current {
                Err(why) => ui.colored_label(BAD, why.as_str()),
                Ok(s) if *s != self.saved => ui.colored_label(WARN, "Changed and not saved: used for the runs you start here, not for request-file runs."),
                Ok(_) => ui.weak(if matches!(self.policy, Policy::InEffect) { "Same as the policy file." } else { "These are the defaults." }),
            };
            if !self.note.is_empty() {
                ui.label(self.note.as_str());
            }
        });
        ui.add_space(6.0);
        ui.horizontal_wrapped(|ui| {
            let button = egui::Button::new(RichText::new("Run the dry-run").strong()).min_size(egui::vec2(180.0, 30.0));
            run = ui.add_enabled(!busy && current.is_ok(), button).clicked();
            if let Some(since) = self.running_since {
                // No spinner: an animated widget repaints every frame, and a
                // frame costs ~0.2 s of CPU on the server's software renderer.
                ui.label(format!("reading the world... {} s (nothing is modified)", since.elapsed().as_secs()));
            } else if let Some(why) = &self.error {
                ui.colored_label(BAD, format!("Not done: {why}"));
            }
        });

        if save {
            if let Ok(settings) = &current {
                match settings.save(server_dir) {
                    Ok(()) => {
                        self.note = format!("Saved to {}.", protection::POLICY_FILE);
                        self.saved = settings.clone();
                        self.policy = Policy::InEffect;
                        log::info!("[regen] policy saved to {} from the Customizer tab", protection::POLICY_FILE);
                    }
                    Err(e) => self.note = format!("Could not write {}: {e}", protection::POLICY_FILE),
                }
            }
        }
        if reload {
            self.reload_policy(server_dir);
            self.note = "Reloaded.".to_string();
        }
        if defaults {
            self.set_fields(&Settings::default());
            self.note = "Defaults shown (not saved).".to_string();
        }
        if run {
            self.note.clear();
            self.start_run(server_dir);
        }
    }

    fn results_ui(&mut self, ui: &mut egui::Ui, server_dir: &Path) {
        if std::mem::take(&mut self.reveal_results) {
            ui.scroll_to_cursor(Some(egui::Align::TOP));
        }
        ui.heading("Results");
        if self.runs.is_empty() && self.shown.is_none() {
            ui.weak("No dry-run has been made for this server yet.");
            return;
        }
        let current = self
            .shown
            .as_ref()
            .and_then(|s| s.dir.file_name())
            .map_or("pick a run".to_string(), |name| name.to_string_lossy().into_owned());
        let mut pick: Option<PathBuf> = None;
        ui.horizontal_wrapped(|ui| {
            ui.label("Run:");
            egui::ComboBox::from_id_source("regen-run").selected_text(current.as_str()).width(250.0).show_ui(ui, |ui| {
                for run in &self.runs {
                    let selected = self.shown.as_ref().map_or(false, |s| s.dir == run.dir);
                    if ui.selectable_label(selected, run.name.as_str()).clicked() {
                        pick = Some(run.dir.clone());
                    }
                }
            });
            if let Some(shown) = &self.shown {
                if ui.button("Open folder").clicked() {
                    open_path(&shown.dir);
                }
                if ui.button("Open report.txt").clicked() {
                    open_path(&shown.dir.join("report.txt"));
                }
                if let Some(view) = &shown.view {
                    if ui.button("Copy plan hash").clicked() {
                        ui.ctx().copy_text(view.plan_hash.clone());
                    }
                }
            }
        });
        if let Some(dir) = pick {
            self.show(ui.ctx(), dir);
        }
        if let Some(shown) = &self.shown {
            view_ui(ui, self.expand_all, shown, &mut self.lookup, server_dir);
        }
    }
}

// =============================================================================
// Drawing a run
// =============================================================================

/// A collapsible section. `expand_all` forces it open.
pub(crate) fn section(ui: &mut egui::Ui, expand_all: bool, id: &str, title: impl Into<egui::WidgetText>, open: bool, body: impl FnOnce(&mut egui::Ui)) {
    egui::CollapsingHeader::new(title)
        .id_source(id)
        .default_open(open)
        .open(if expand_all { Some(true) } else { None })
        .show(ui, body);
}

/// One line of fixed-width text, never wrapped.
pub(crate) fn mono_line(ui: &mut egui::Ui, line: &str) {
    ui.add(egui::Label::new(RichText::new(line).monospace()).wrap(false));
}

fn card(ui: &mut egui::Ui, label: &str, value: &str, colour: Color32) {
    egui::Frame::group(ui.style()).show(ui, |ui| {
        ui.vertical(|ui| {
            ui.label(RichText::new(value).size(22.0).strong().color(colour));
            ui.label(RichText::new(label).small());
        });
    });
}

pub(crate) fn open_path(path: &Path) {
    #[cfg(windows)]
    let opened = std::process::Command::new("explorer").arg(path).spawn();
    #[cfg(not(windows))]
    let opened = std::process::Command::new("xdg-open").arg(path).spawn();
    if let Err(e) = opened {
        log::warn!("[regen] could not open {}: {e}", path.display());
    }
}

fn view_ui(ui: &mut egui::Ui, expand: bool, shown: &Shown, lookup: &mut ChunkLookup, server_dir: &Path) {
    if let Some(why) = &shown.view_error {
        ui.colored_label(WARN, format!("This run has no summary to draw as tables ({why}). Its report is at the bottom."));
    }
    if let Some(v) = &shown.view {
        ui.add_space(2.0);
        ui.label(RichText::new(format!("{} -- {}", v.scope, v.scope_text)).strong());
        let plain = ui.visuals().strong_text_color();
        ui.horizontal_wrapped(|ui| {
            card(ui, "chunks on disk", &regen::num(v.on_disk), plain);
            card(ui, "protected (always kept)", &regen::num(v.protected), GOOD);
            card(ui, "selected by the scope", &regen::num(v.selected), plain);
            card(ui, "WOULD BE REGENERATED", &regen::num(v.targets), REGEN);
            card(ui, "warnings", &regen::num(v.warnings), if v.warnings > 0 { WARN } else { GOOD });
        });
        ui.label(RichText::new(format!("{} local, took {:.1} s. Server: {}", v.created_local, v.elapsed_secs, v.server)).small());
        ui.horizontal_wrapped(|ui| {
            ui.label(RichText::new("plan sha256").small());
            ui.label(RichText::new(v.plan_hash.as_str()).small().monospace());
        });
        if v.server_probably_running {
            ui.colored_label(WARN, "The server was running: files on disk can be one autosave behind the live world. Fine for a dry-run; an execution recomputes with the server stopped.");
        }
        ui.add_space(4.0);

        for d in &v.dimensions {
            section(ui, expand, &format!("dim-{}", d.id), RichText::new(d.id.as_str()).strong(), true, |ui| dimension_ui(ui, expand, d, shown, lookup, server_dir));
        }
        section(ui, expand, "players", format!("Players ({})", v.players.len()), true, |ui| {
            for p in &v.players {
                ui.label(RichText::new(format!("{}  ({} {})", p.name, p.uuid_kind, p.uuid)).strong());
                for line in &p.lines {
                    mono_line(ui, line);
                }
                ui.add_space(2.0);
            }
            ui.label(v.claims.as_str());
        });
        if !v.waystones_title.is_empty() {
            let title = format!("Waystones{}", v.waystones_title.trim_start_matches("WAYSTONES"));
            section(ui, expand, "waystones", title, false, |ui| {
                for line in &v.waystones {
                    ui.label(line.as_str());
                }
            });
        }
        section(ui, expand, "warnings", format!("Warnings ({})", v.warnings), true, |ui| {
            if v.warning_groups.is_empty() {
                ui.colored_label(GOOD, "none");
            }
            for group in &v.warning_groups {
                let title = RichText::new(format!("[{}] {}", regen::num(group.count), group.title)).color(WARN);
                section(ui, expand, &format!("warning-{}", group.kind), title, group.count <= 3, |ui| {
                    for line in &group.lines {
                        ui.label(line.as_str());
                    }
                    if group.more > 0 {
                        ui.weak(format!("... and {} more: all of them are in warnings.csv in the run's folder.", regen::num(group.more)));
                    }
                });
            }
        });
        section(ui, expand, "settings", "Settings this run used", false, |ui| {
            ui.label(format!("Policy file: {}", v.policy_file));
            egui::Grid::new("settings-grid").striped(true).num_columns(2).show(ui, |ui| {
                for row in &v.settings {
                    ui.label(row.name.as_str());
                    if row.is_default {
                        ui.label(row.value.as_str());
                    } else {
                        ui.colored_label(WARN, format!("{}   (not the default)", row.value));
                    }
                    ui.end_row();
                }
            });
        });
        section(ui, expand, "found", "Dimensions found in the world", false, |ui| {
            egui::Grid::new("found-grid").striped(true).show(ui, |ui| {
                for head in ["dimension", "folder", "region", "entities", "poi"] {
                    ui.strong(head);
                }
                ui.end_row();
                for f in &v.found {
                    ui.label(if f.in_run { f.id.clone() } else { format!("{} (not in this run)", f.id) });
                    ui.label(f.folder.as_str());
                    ui.label(f.region.as_str());
                    ui.label(f.entities.as_str());
                    ui.label(f.poi.as_str());
                    ui.end_row();
                }
            });
            ui.weak("files / size per folder");
            if !v.bare_dimensions.is_empty() {
                ui.label(format!("{} more dimension folder(s) hold no chunks (nobody has been there): {}", v.bare_dimensions.len(), v.bare_dimensions.join(", ")));
            }
        });
        if !v.notes.is_empty() {
            section(ui, expand, "notes", "Notes", false, |ui| {
                for note in &v.notes {
                    ui.label(note.as_str());
                }
            });
        }
        section(ui, expand, "files", "Files in the run's folder", false, |ui| {
            for f in &v.files {
                mono_line(ui, f);
            }
        });
    }
    // The preview keeps this one closed: it is the same facts again, as text.
    egui::CollapsingHeader::new("The full report (report.txt)").id_source("report-text").default_open(shown.view.is_none()).show(ui, |ui| {
        let row_height = ui.text_style_height(&egui::TextStyle::Monospace);
        egui::ScrollArea::both().id_source("report-scroll").max_height(360.0).auto_shrink([false, true]).show_rows(
            ui,
            row_height,
            shown.report.len(),
            |ui, rows| {
                for i in rows {
                    if let Some(line) = shown.report.get(i) {
                        mono_line(ui, line);
                    }
                }
            },
        );
    });
}

fn dimension_ui(ui: &mut egui::Ui, expand: bool, d: &DimView, shown: &Shown, lookup: &mut ChunkLookup, server_dir: &Path) {
    egui::Grid::new(format!("totals-{}", d.id)).show(ui, |ui| {
        ui.label("chunks on disk");
        ui.label(format!("{}   (terrain {}, entities {}, poi {})", regen::num(d.on_disk), regen::num(d.terrain), regen::num(d.entities), regen::num(d.poi)));
        ui.end_row();
        ui.label("protected");
        let extra = if d.protected_not_on_disk > 0 {
            format!("   (+{} protected positions not generated yet)", regen::num(d.protected_not_on_disk))
        } else {
            String::new()
        };
        ui.colored_label(GOOD, format!("{}{extra}", regen::num(d.protected)));
        ui.end_row();
        ui.label("selected by the scope");
        ui.label(format!("{}   ({} of them protected and kept)", regen::num(d.selected), regen::num(d.kept_in_scope)));
        ui.end_row();
        ui.label("WOULD BE REGENERATED");
        ui.label(RichText::new(regen::num(d.targets)).color(REGEN).strong());
        ui.end_row();
        ui.label("not selected, unprotected");
        ui.label(format!("{}   (untouched by this run)", regen::num(d.untouched)));
        ui.end_row();
    });
    ui.add_space(4.0);
    ui.horizontal_wrapped(|ui| {
        ui.vertical(|ui| {
            ui.label(RichText::new("Kept by each layer").strong());
            egui::Grid::new(format!("layers-{}", d.id)).striped(true).show(ui, |ui| {
                ui.strong("layer");
                ui.strong("chunks");
                ui.strong("only this layer");
                ui.end_row();
                for l in &d.layers {
                    ui.label(l.name.as_str());
                    ui.label(regen::num(l.kept));
                    ui.label(regen::num(l.alone));
                    ui.end_row();
                }
            });
            // What a layer was built from, where it says (the logout layer's counts).
            for l in d.layers.iter().filter(|l| !l.note.is_empty()) {
                let text = format!("{}: {}", l.name, l.note);
                if l.note.contains("UNKNOWN") {
                    ui.colored_label(WARN, text);
                } else {
                    ui.weak(text);
                }
            }
        });
        ui.add_space(24.0);
        ui.vertical(|ui| {
            ui.label(RichText::new("Region files").strong());
            egui::Grid::new(format!("files-{}", d.id)).striped(true).show(ui, |ui| {
                for head in ["", "region", "entities", "poi"] {
                    ui.strong(head);
                }
                ui.end_row();
                for f in &d.files {
                    let emphasised = f.label == "REMOVED ENTIRELY" && f.region + f.entities + f.poi > 0;
                    let cell = |n: usize| if emphasised { RichText::new(regen::num(n)).color(REGEN) } else { RichText::new(regen::num(n)) };
                    ui.label(f.label.as_str());
                    ui.label(cell(f.region));
                    ui.label(cell(f.entities));
                    ui.label(cell(f.poi));
                    ui.end_row();
                }
            });
            if d.freed_bytes > 0 {
                ui.weak(format!("Files removed entirely add up to {}.", backup::fmt_bytes(d.freed_bytes)));
            }
        });
    });

    if let Some(st) = &d.structures {
        let title = if st.cut > 0 {
            RichText::new(format!("Structures ({}; {} CUT by this plan)", regen::num(st.total), regen::num(st.cut))).color(WARN)
        } else {
            RichText::new(format!("Structures ({})", regen::num(st.total)))
        };
        section(ui, expand, &format!("structures-{}", d.id), title, st.cut > 0, |ui| structures_ui(ui, expand, &d.id, st));
    }
    for map in shown.maps.iter().filter(|m| m.dim == d.id) {
        section(ui, expand, &format!("map-{}", d.id), "Map", true, |ui| {
            if let Some(pos) = map_ui(ui, map) {
                lookup.clicked(ui.ctx(), server_dir, &shown.dir, &d.id, pos);
            }
        });
    }
    for note in shown.map_notes.iter().filter(|n| n.starts_with(&format!("{}:", d.id))) {
        ui.weak(note.as_str());
    }
    section(ui, expand, &format!("lookup-{}", d.id), "What is in a chunk", true, |ui| lookup.ui(ui, server_dir, &shown.dir, &d.id));
    section(ui, expand, &format!("inhabited-{}", d.id), "InhabitedTime: how long players have been near each chunk", false, |ui| {
        ui.weak("A chunk's InhabitedTime counts the ticks it was loaded with a player within 128 blocks of it.");
        ui.horizontal_wrapped(|ui| {
            ui.vertical(|ui| {
                egui::Grid::new(format!("buckets-{}", d.id)).striped(true).show(ui, |ui| {
                    ui.strong("InhabitedTime");
                    ui.strong("terrain chunks");
                    ui.end_row();
                    for row in &d.inhabited {
                        ui.label(row.label.as_str());
                        ui.label(regen::num(row.count));
                        ui.end_row();
                    }
                });
            });
            ui.add_space(24.0);
            ui.vertical(|ui| {
                egui::Grid::new(format!("thresholds-{}", d.id)).striped(true).show(ui, |ui| {
                    ui.strong("lived-in threshold");
                    ui.strong("chunks it would keep");
                    ui.end_row();
                    for row in &d.thresholds {
                        let text = format!("{} ticks ({})", row.ticks, row.time);
                        if row.this_run {
                            ui.colored_label(GOOD, format!("{text}  <- this run"));
                        } else {
                            ui.label(text);
                        }
                        ui.label(regen::num(row.count));
                        ui.end_row();
                    }
                });
            });
        });
        ui.label(format!("Longest: {} ticks ({}).", d.longest_ticks, protection::fmt_ticks(d.longest_ticks)));
        if d.without_inhabited_time > 0 {
            ui.label(format!("{} terrain chunk(s) carry no InhabitedTime tag and count as 0.", regen::num(d.without_inhabited_time)));
        }
    });
}

fn structures_ui(ui: &mut egui::Ui, expand: bool, dim: &str, st: &StructuresView) {
    egui::Grid::new(format!("structures-grid-{dim}")).show(ui, |ui| {
        ui.label("kept whole");
        ui.label(format!("{}   (no chunk of it is regenerated)", regen::num(st.kept_whole)));
        ui.end_row();
        ui.label("regenerated whole");
        ui.label(format!("{}   (today's worldgen decides what stands there)", regen::num(st.reset_whole)));
        ui.end_row();
        ui.label("CUT by this plan");
        let text = format!("{}   (some chunks kept, some regenerated; start regenerated: {})", regen::num(st.cut), regen::num(st.cut_start_reset));
        if st.cut > 0 {
            ui.colored_label(WARN, text);
        } else {
            ui.colored_label(GOOD, text);
        }
        ui.end_row();
        ui.label("pieces only");
        ui.label(format!("{}   (the start is not on disk)", regen::num(st.without_start)));
        ui.end_row();
    });
    if st.unreadable > 0 {
        ui.colored_label(WARN, format!("{} terrain chunk(s) whose structures did not read: planned as usual, missing here.", regen::num(st.unreadable)));
    }
    if !st.cut_lines.is_empty() {
        ui.label(RichText::new("Cut structures, the most chunks first").strong());
        for line in &st.cut_lines {
            mono_line(ui, line);
        }
        if st.cut_more > 0 {
            ui.weak(format!("... and {} more: all of them are in structures.csv in the run's folder.", regen::num(st.cut_more)));
        }
    }
    ui.weak(
        "A regenerated chunk takes back the pieces of every start within 8 chunks that reaches into it. A cut structure whose start is kept \
         is rebuilt in its regenerated chunks as it was generated (new loot and mobs; what players changed there is gone). One whose start \
         is regenerated gets a new start from today's worldgen, and joins up with its kept part only if that places it there the same way. \
         On the map, red is a regenerated chunk of a cut structure.",
    );
    section(ui, expand, &format!("structure-types-{dim}"), format!("By type ({})", st.types.len()), false, |ui| {
        egui::Grid::new(format!("structure-types-grid-{dim}")).striped(true).show(ui, |ui| {
            for head in ["structure", "all", "kept whole", "regenerated", "CUT"] {
                ui.strong(head);
            }
            ui.end_row();
            for t in &st.types {
                ui.label(t.id.as_str());
                ui.label(regen::num(t.total));
                ui.label(regen::num(t.kept_whole));
                ui.label(regen::num(t.reset_whole));
                if t.cut > 0 {
                    ui.colored_label(WARN, regen::num(t.cut));
                } else {
                    ui.label("0");
                }
                ui.end_row();
            }
        });
    });
}

/// Draws the map; returns the chunk clicked, if one was.
fn map_ui(ui: &mut egui::Ui, map: &MapTexture) -> Option<ChunkPos> {
    ui.horizontal_wrapped(|ui| {
        for (name, rgb) in regen::MAP_LEGEND {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(12.0, 12.0), egui::Sense::hover());
            ui.painter().rect_filled(rect, 2.0, Color32::from_rgb(rgb[0], rgb[1], rgb[2]));
            ui.label(RichText::new(name).small());
            ui.add_space(6.0);
        }
    });
    // Never larger than one screen pixel per image pixel: the picture is small
    // squares, and blowing it up blurs nothing but costs fill on software GL.
    let scale = (ui.available_width() / map.info.width as f32).min(1.0).max(0.05);
    let size = egui::vec2(map.info.width as f32 * scale, map.info.height as f32 * scale);
    let image = egui::Image::from_texture(egui::load::SizedTexture::new(map.texture.id(), size)).sense(egui::Sense::click());
    let response = ui.add(image);
    let per_chunk = map.info.pixels_per_chunk.max(1) as f32 * scale;
    let chunk_at = |pos: egui::Pos2| {
        let x = map.info.origin_x + ((pos.x - response.rect.min.x) / per_chunk).floor() as i64;
        let z = map.info.origin_z + ((pos.y - response.rect.min.y) / per_chunk).floor() as i64;
        (x, z)
    };
    match response.hover_pos() {
        Some(pos) => {
            let (x, z) = chunk_at(pos);
            ui.label(RichText::new(format!("chunk ({x}, {z}) = blocks x {}..{}, z {}..{}; click: what is in it", x * 16, x * 16 + 15, z * 16, z * 16 + 15)).small().monospace());
        }
        None => {
            ui.label(RichText::new("North is up; faint lines are region files (32 chunks). Point at the map to read coordinates; click a chunk to see what is in it.").small().weak());
        }
    }
    let clicked = response.clicked().then(|| response.interact_pointer_pos()).flatten()?;
    let (x, z) = chunk_at(clicked);
    Some((i32::try_from(x).ok()?, i32::try_from(z).ok()?))
}
