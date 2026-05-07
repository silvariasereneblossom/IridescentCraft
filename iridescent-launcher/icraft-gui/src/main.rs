//! `icraft-gui` — egui shell for the IridescentCraft server launcher.
//!
//! Cross-platform native window, single binary, no webview. One button
//! per CLI subcommand routed through icraft-core. Background tasks run
//! on a worker thread; their log output streams into a scrolling pane
//! via a custom `log` appender that broadcasts to a mpsc channel.
//!
//! Persists the install dir between launches via eframe's storage.
//!
//! Linux builds use a manual text-input for the install dir (no GTK3
//! system dep); Windows builds get the rfd native folder picker.

#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use eframe::egui;
use icraft_core::config::ServerConfig;

const APP_TITLE: &str = "IridescentCraft Server Launcher";
const KEY_SERVER_DIR: &str = "icraft.server_dir";

fn main() -> Result<(), eframe::Error> {
    install_log_router();
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([720.0, 600.0])
            .with_min_inner_size([520.0, 420.0])
            .with_title(APP_TITLE),
        ..Default::default()
    };
    eframe::run_native(APP_TITLE, opts, Box::new(|cc| Box::new(IcraftApp::new(cc))))
}

// =============================================================================
// Log routing — capture log:: output and feed the GUI buffer
// =============================================================================

static LOG_BUS: once_cell::OnceCell<LogBus> = once_cell::OnceCell::new();

struct LogBus {
    sender: Mutex<Sender<String>>,
}

mod once_cell {
    /// Tiny single-cell wrapper so we don't pull in the once_cell crate.
    /// Initialized exactly once at startup; reads after init are
    /// lock-free via a raw pointer cast through atomics.
    use std::sync::atomic::{AtomicPtr, Ordering};
    pub struct OnceCell<T> {
        ptr: AtomicPtr<T>,
    }
    impl<T> OnceCell<T> {
        pub const fn new() -> Self { Self { ptr: AtomicPtr::new(std::ptr::null_mut()) } }
        pub fn set(&self, value: T) -> Result<(), T> {
            let boxed = Box::into_raw(Box::new(value));
            match self.ptr.compare_exchange(std::ptr::null_mut(), boxed, Ordering::AcqRel, Ordering::Acquire) {
                Ok(_) => Ok(()),
                Err(_) => {
                    // SAFETY: we just allocated this box, never published.
                    let v = *unsafe { Box::from_raw(boxed) };
                    Err(v)
                }
            }
        }
        pub fn get(&self) -> Option<&T> {
            let p = self.ptr.load(Ordering::Acquire);
            if p.is_null() { None } else {
                // SAFETY: pointer came from Box::into_raw, never freed.
                Some(unsafe { &*p })
            }
        }
    }
    unsafe impl<T: Send> Send for OnceCell<T> {}
    unsafe impl<T: Sync> Sync for OnceCell<T> {}
}

struct ChannelLogger {
    level: log::Level,
}

impl log::Log for ChannelLogger {
    fn enabled(&self, m: &log::Metadata) -> bool { m.level() <= self.level }
    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) { return; }
        let line = format!("[{:>5}] {}", record.level(), record.args());
        if let Some(bus) = LOG_BUS.get() {
            let _ = bus.sender.lock().unwrap().send(line.clone());
        }
        // Also write to stderr for parity with CLI / launcher logs.
        eprintln!("{line}");
    }
    fn flush(&self) {}
}

fn install_log_router() {
    let (tx, rx) = channel::<String>();
    let _ = LOG_BUS.set(LogBus { sender: Mutex::new(tx) });
    // Stash receiver on a Mutex<Option> so the GUI can take it during init.
    *LOG_RX.lock().unwrap() = Some(rx);
    let _ = log::set_boxed_logger(Box::new(ChannelLogger { level: log::Level::Info }));
    log::set_max_level(log::LevelFilter::Info);
}

static LOG_RX: Mutex<Option<Receiver<String>>> = Mutex::new(None);

// =============================================================================
// Persistent app state
// =============================================================================

#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct PersistedState {
    server_dir: Option<String>,
}

// =============================================================================
// The app
// =============================================================================

struct IcraftApp {
    server_dir: PathBuf,
    server_dir_text: String,    // text input buffer, separate from PathBuf for editing
    log_lines: Vec<String>,
    log_rx: Option<Receiver<String>>,
    running_task: Option<JoinHandle<()>>,
    /// Snapshot of install state, refreshed manually + after each task.
    status: InstallStatus,
}

#[derive(Default, Clone)]
struct InstallStatus {
    forge_present: bool,
    eula_present: bool,
    mod_count: usize,
    last_sha: Option<String>,
}

impl IcraftApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let persisted: PersistedState = cc.storage
            .and_then(|s| eframe::get_value(s, KEY_SERVER_DIR))
            .unwrap_or_default();
        let server_dir = persisted.server_dir
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        let mut app = Self {
            server_dir_text: server_dir.display().to_string(),
            server_dir,
            log_lines: Vec::with_capacity(1024),
            log_rx: LOG_RX.lock().unwrap().take(),
            running_task: None,
            status: InstallStatus::default(),
        };
        app.refresh_status();
        app
    }

    fn refresh_status(&mut self) {
        let cfg = ServerConfig::from_path(&self.server_dir);
        self.status = InstallStatus {
            forge_present: cfg.forge_dir().exists(),
            eula_present: cfg.eula().exists(),
            mod_count: list_jars(&cfg.mods_dir()),
            last_sha: std::fs::read_to_string(cfg.last_sha()).ok().map(|s| s.trim().to_string()),
        };
    }

    fn server_cfg(&self) -> ServerConfig {
        ServerConfig::from_path(&self.server_dir)
    }

    fn task_running(&self) -> bool {
        self.running_task.as_ref().map(|h| !h.is_finished()).unwrap_or(false)
    }

    fn drain_log(&mut self) {
        if let Some(rx) = &self.log_rx {
            while let Ok(line) = rx.try_recv() {
                self.log_lines.push(line);
                // cap buffer to keep the GUI snappy
                if self.log_lines.len() > 5000 {
                    let drop = self.log_lines.len() - 4000;
                    self.log_lines.drain(..drop);
                }
            }
        }
    }

    fn spawn<F>(&mut self, name: &'static str, work: F)
    where F: FnOnce(ServerConfig) -> anyhow::Result<()> + Send + 'static {
        if self.task_running() { return; }
        let cfg = self.server_cfg();
        log::info!("== {} starting ==", name);
        let h = std::thread::spawn(move || {
            match work(cfg) {
                Ok(_) => log::info!("== {} done ==", name),
                Err(e) => log::error!("== {} FAILED: {e:#} ==", name),
            }
        });
        self.running_task = Some(h);
    }

    fn pick_dir(&mut self) {
        #[cfg(windows)]
        {
            if let Some(p) = rfd::FileDialog::new()
                .set_directory(&self.server_dir)
                .pick_folder()
            {
                self.server_dir = p.clone();
                self.server_dir_text = p.display().to_string();
                self.refresh_status();
            }
        }
        #[cfg(not(windows))]
        {
            log::info!("[gui] folder picker is Windows-only -- edit the text field directly on this platform");
        }
    }
}

impl eframe::App for IcraftApp {
    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        let p = PersistedState { server_dir: Some(self.server_dir.display().to_string()) };
        eframe::set_value(storage, KEY_SERVER_DIR, &p);
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Drain log buffer + check task completion every frame.
        self.drain_log();
        if let Some(h) = &self.running_task {
            if h.is_finished() {
                self.running_task = None;
                self.refresh_status();
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(200));
            }
        }

        egui::TopBottomPanel::top("hdr").show(ctx, |ui| {
            ui.add_space(6.0);
            ui.heading(APP_TITLE);
            ui.add_space(2.0);
            self.draw_dir_picker(ui);
            ui.add_space(4.0);
        });

        egui::TopBottomPanel::top("status").show(ctx, |ui| {
            ui.add_space(2.0);
            self.draw_status_badges(ui);
            ui.add_space(4.0);
        });

        egui::TopBottomPanel::bottom("log").resizable(true)
            .min_height(180.0).default_height(280.0).show(ctx, |ui| {
            ui.add_space(2.0);
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("Log").strong());
                if ui.button("Clear").clicked() { self.log_lines.clear(); }
            });
            self.draw_log_pane(ui);
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            self.draw_action_buttons(ui);
        });
    }
}

impl IcraftApp {
    fn draw_dir_picker(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.label("Install dir:");
            let resp = ui.add(
                egui::TextEdit::singleline(&mut self.server_dir_text)
                    .desired_width(f32::INFINITY)
                    .hint_text("path/to/IridescentCraft Dedicated Server"),
            );
            if resp.changed() {
                self.server_dir = PathBuf::from(self.server_dir_text.trim());
                self.refresh_status();
            }
        });
        ui.horizontal(|ui| {
            #[cfg(windows)]
            { if ui.button("Browse...").clicked() { self.pick_dir(); } }
            #[cfg(not(windows))]
            { ui.add_enabled(false, egui::Button::new("Browse... (Windows only)")); }

            if ui.button("Use cwd").clicked() {
                if let Ok(cwd) = std::env::current_dir() {
                    self.server_dir = cwd.clone();
                    self.server_dir_text = cwd.display().to_string();
                    self.refresh_status();
                }
            }
            if ui.button("Refresh").clicked() { self.refresh_status(); }
        });
    }

    fn draw_status_badges(&self, ui: &mut egui::Ui) {
        ui.horizontal_wrapped(|ui| {
            badge(ui, "Forge",   self.status.forge_present, if self.status.forge_present { "installed" } else { "missing" });
            badge(ui, "EULA",    self.status.eula_present,  if self.status.eula_present  { "accepted"  } else { "missing" });
            badge(ui, "Mods",    self.status.mod_count > 0, &format!("{} jar(s)", self.status.mod_count));
            let sha_label = self.status.last_sha.as_deref()
                .map(|s| s.chars().take(7).collect::<String>())
                .unwrap_or_else(|| "(none)".to_string());
            badge(ui, "Last sync", self.status.last_sha.is_some(), &sha_label);
        });
    }

    fn draw_action_buttons(&mut self, ui: &mut egui::Ui) {
        let busy = self.task_running();
        let cfg = self.server_cfg();
        ui.add_space(4.0);

        ui.heading("Server lifecycle");
        ui.horizontal_wrapped(|ui| {
            if action_btn(ui, "Serve (full)", busy).clicked() {
                self.spawn("serve", move |c| {
                    icraft_core::serve(&c, icraft_core::ServeOptions { force_sync: false, headless: false }).map(|_| ())
                });
            }
            if action_btn(ui, "Run only", busy).clicked() {
                self.spawn("run", move |c| {
                    icraft_core::run::launch_server(&c, false).map(|_| ())
                });
            }
            if action_btn(ui, "Accept EULA", busy).clicked() {
                self.spawn("accept-eula", move |c| icraft_core::eula::accept(&c));
            }
        });

        ui.add_space(8.0);
        ui.heading("Sync + install");
        ui.horizontal_wrapped(|ui| {
            if action_btn(ui, "Sync repo", busy).clicked() {
                self.spawn("sync", move |c| {
                    icraft_core::sync::z_mirror_or_zip(&c)?;
                    icraft_core::sync::github_diff(&c, false)
                });
            }
            if action_btn(ui, "Sync (--force)", busy).clicked() {
                self.spawn("sync-force", move |c| icraft_core::sync::github_diff(&c, true));
            }
            if action_btn(ui, "Install Forge", busy).clicked() {
                self.spawn("install-forge", move |c| icraft_core::install::ensure_forge(&c));
            }
            if action_btn(ui, "Install Mods", busy).clicked() {
                self.spawn("install-mods", move |c| icraft_core::install::ensure_mods(&c));
            }
            if action_btn(ui, "Apply Self-Update", busy).clicked() {
                self.spawn("self-update", move |c| {
                    icraft_core::self_update::apply_staged(&c).map(|_| ())
                });
            }
        });

        ui.add_space(8.0);
        ui.heading("Mod folder hygiene");
        ui.horizontal_wrapped(|ui| {
            if action_btn(ui, "Update mods", busy).clicked() {
                self.spawn("update-mods", move |c| icraft_core::mods::update_mods(&c));
            }
            if action_btn(ui, "Update mods (dry-run)", busy).clicked() {
                self.spawn("update-mods-dry", move |c|
                    icraft_core::mods::update_mods_with(&c, icraft_core::mods::ModSyncOpts::dry()));
            }
            if action_btn(ui, "Cleanup stale jars", busy).clicked() {
                self.spawn("cleanup-jars", move |c| icraft_core::mods::cleanup_stale_jars(&c));
            }
            if action_btn(ui, "Cleanup (dry-run)", busy).clicked() {
                self.spawn("cleanup-jars-dry", move |c|
                    icraft_core::mods::cleanup_stale_jars_with(&c, icraft_core::mods::ModSyncOpts::dry()));
            }
            if action_btn(ui, "Strip client mods", busy).clicked() {
                self.spawn("strip-client-mods", move |c| icraft_core::mods::strip_client_mods(&c));
            }
        });

        ui.add_space(8.0);
        ui.heading("Diagnostics");
        ui.horizontal_wrapped(|ui| {
            if action_btn(ui, "Diagnose", busy).clicked() {
                self.spawn("diagnose", move |c| {
                    let r = icraft_core::diagnose::report(&c)?;
                    for line in r.lines() { log::info!("{line}"); }
                    Ok(())
                });
            }
            if action_btn(ui, "Check Java", busy).clicked() {
                self.spawn("check-java", |_| icraft_core::install::check_java());
            }
            if action_btn(ui, "Firewall audit", busy).clicked() {
                self.spawn("firewall-audit", |_| {
                    let r = icraft_core::firewall::audit()?;
                    for line in r.lines() { log::info!("{line}"); }
                    Ok(())
                });
            }
            if action_btn(ui, "Push crash logs", busy).clicked() {
                self.spawn("push-crash-logs", move |c| icraft_core::crash::push_logs(&c));
            }
        });

        if busy {
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Task running...");
            });
        }

        // suppress unused warning
        let _ = cfg;
    }

    fn draw_log_pane(&self, ui: &mut egui::Ui) {
        egui::ScrollArea::vertical().stick_to_bottom(true).show(ui, |ui| {
            for line in &self.log_lines {
                let color = if line.starts_with("[ERROR")        { egui::Color32::from_rgb(244, 102, 102) }
                           else if line.starts_with("[ WARN")    { egui::Color32::from_rgb(244, 199, 102) }
                           else if line.starts_with("[ INFO")    { egui::Color32::from_rgb(180, 220, 255) }
                           else if line.starts_with("[DEBUG")    { egui::Color32::from_rgb(140, 140, 140) }
                           else                                  { egui::Color32::LIGHT_GRAY };
                ui.colored_label(color, line);
            }
        });
    }
}

// =============================================================================
// helpers
// =============================================================================

fn badge(ui: &mut egui::Ui, label: &str, ok: bool, value: &str) {
    let color = if ok { egui::Color32::from_rgb(120, 200, 140) } else { egui::Color32::from_rgb(220, 140, 140) };
    ui.label(egui::RichText::new(format!("{label}:")).strong());
    ui.label(egui::RichText::new(value).color(color));
    ui.separator();
}

fn action_btn(ui: &mut egui::Ui, label: &str, busy: bool) -> egui::Response {
    ui.add_enabled(!busy, egui::Button::new(label).min_size(egui::vec2(140.0, 28.0)))
}

fn list_jars(p: &Path) -> usize {
    std::fs::read_dir(p).map(|rd|
        rd.filter_map(|e| e.ok())
          .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jar"))
          .count()
    ).unwrap_or(0)
}
