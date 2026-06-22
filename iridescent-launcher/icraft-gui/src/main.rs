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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use eframe::egui;
use icraft_core::config::ServerConfig;

const APP_TITLE: &str = "IridescentCraft Server Launcher";
const KEY_SERVER_DIR: &str = "icraft.server_dir";

fn main() -> Result<(), eframe::Error> {
    install_log_router();
    // No-op when launched as a GUI subsystem app (no console attached),
    // but takes effect when icraft-gui.exe is launched from a cmd window
    // or pinned to a console-bearing parent.
    icraft_core::console::disable_quickedit_mode();
    // Best-effort cleanup of the .old backup left behind by the
    // previous Path A self-update. Windows can't overwrite the
    // running exe, so apply_and_relaunch_gui renames live -> .old
    // before swapping. We delete it on the next launch when no one
    // holds a handle on it.
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_extension("exe.old"));
    }
    // Mesa3D software-OpenGL hints. When the server VM has no GPU
    // passthrough (RDP basic display driver, headless KVM, etc.), we
    // drop Mesa's `opengl32.dll` + `libgallium_wgl.dll` next to this
    // exe. Windows resolves `opengl32.dll` from the exe directory
    // before system32, so Mesa wins. These env vars tell Mesa to:
    //  - pick the llvmpipe (pure-CPU) backend, not any DX wrapper
    //  - advertise OpenGL 4.6 so glow's version probe is satisfied
    //  - cap the rasterizer to 1 worker thread (default is all cores;
    //    on a server VM that's catastrophic -- Mesa eats every core
    //    Minecraft needs and TPS tanks even though RAM is fine).
    // No-op when Mesa isn't present: the system OpenGL ICD is used.
    std::env::set_var("GALLIUM_DRIVER", "llvmpipe");
    std::env::set_var("MESA_GL_VERSION_OVERRIDE", "4.6");
    std::env::set_var("LP_NUM_THREADS", "1");
    let opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([720.0, 600.0])
            .with_min_inner_size([520.0, 420.0])
            .with_title(APP_TITLE),
        // Glow (OpenGL) backend. On dev boxes with a real GPU, the
        // system ICD handles us. On the server VM with no GPU access,
        // Mesa3D's drop-in `opengl32.dll` + `libgallium_wgl.dll`
        // (placed alongside this exe; build/fetch from
        // github.com/pal1000/mesa-dist-win) provides a pure-CPU
        // OpenGL 4.6 implementation. See the env vars above.
        renderer: eframe::Renderer::Glow,
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
    /// Ring buffer of recent log lines. VecDeque so the
    /// trim-on-overflow path is O(1) at the front instead of an
    /// O(n) shift on a Vec. The visible log pane uses
    /// ScrollArea::show_rows for virtualized rendering, so a long
    /// buffer is cheap as long as random indexing is O(1) (which
    /// VecDeque is, as long as both halves of the ring fit).
    log_lines: std::collections::VecDeque<String>,
    log_rx: Option<Receiver<String>>,
    running_task: Option<JoinHandle<()>>,
    /// Snapshot of install state, refreshed manually + after each task.
    status: InstallStatus,
    /// Free-form server console input -- also reused as the username/arg
    /// for the per-command quick buttons (op, ban, kick, ...).
    console_input: String,
    /// PAT input (password-masked). Cleared after Save.
    pat_input: String,
    /// Remote (GitHub) HEAD SHA for the configured branch, fetched in
    /// the background. None until the first fetch completes.
    remote_sha: Arc<Mutex<Option<String>>>,
    /// True while a remote-sha fetch is in flight; prevents duplicates.
    remote_fetching: Arc<AtomicBool>,
    /// Last time we ran refresh_status while a task was active. Used to
    /// throttle the periodic refresh during long-running tasks (Serve)
    /// so the head-SHA badge updates after Phase 0 instead of waiting
    /// until the server actually stops.
    last_status_refresh: Option<Instant>,
    /// Set true when the Cycle button is clicked while a server task is
    /// running. After the running task completes, update() spawns a
    /// fresh "serve" task to bring the server back up. Cleared on
    /// pickup so a second cycle requires another button press.
    pending_restart: bool,
    /// Set in `new()` when the Cycle-resume sentinel is found on startup
    /// (the previous instance relaunched itself mid-Cycle to apply a
    /// newer launcher binary). On the first update() tick this auto-spawns
    /// the cycle-restart worker so the server still ends up started after
    /// the self-update — i.e. the post-relaunch path completes the Cycle.
    /// One-shot: cleared on pickup.
    resume_cycle_pending: bool,
    /// Wall-clock of the last *successful* remote-HEAD fetch, stamped by
    /// the background thread. Drives the "(stale)" badge state: a remote
    /// SHA we haven't re-confirmed recently must NOT render green
    /// "(in sync)" -- it may be masking a push made while we sat idle,
    /// offline, or rate-limited.
    remote_fetched_at: Arc<Mutex<Option<Instant>>>,
    /// Last time we kicked a remote-HEAD refresh (any path). Gates the
    /// idle poll so the remote side re-checks on its own cadence instead
    /// of only on task start/finish + manual Refresh.
    last_remote_poll: Option<Instant>,
}

#[derive(Default, Clone)]
struct InstallStatus {
    forge_present: bool,
    eula_present: bool,
    mod_count: usize,
    last_sha: Option<String>,
}

/// How often the GUI re-checks GitHub's HEAD SHA on its own. ~20 req/hour,
/// safely under the 60/hour unauthenticated api.github.com limit. (The
/// 2026-05-18 change removed a 3 s / 1200-per-hour poll; this restores a
/// rate-safe cadence so a push surfaces as "(behind)" without a manual
/// Refresh, instead of the remote side only refreshing on task events.)
const REMOTE_POLL_INTERVAL: Duration = Duration::from_secs(180);
/// A remote-HEAD reading older than this is shown amber "(stale -- Refresh)"
/// rather than green "(in sync)", so a stale value that happens to equal the
/// deployed SHA can't masquerade as confirmed-current.
const REMOTE_STALE_AFTER: Duration = Duration::from_secs(300);

impl IcraftApp {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // Force a dark, near-black background so the trans-flag heading
        // and per-letter rainbow on "Server Launcher" stay legible. The
        // eframe default leans toward a medium grey on some Windows
        // setups which washed out the lighter stripes.
        let mut visuals = egui::Visuals::dark();
        let bg = egui::Color32::from_gray(18);   // ~#121212
        visuals.window_fill = bg;
        visuals.panel_fill = bg;
        visuals.extreme_bg_color = egui::Color32::from_gray(8);
        cc.egui_ctx.set_visuals(visuals);

        let persisted: PersistedState = cc.storage
            .and_then(|s| eframe::get_value(s, KEY_SERVER_DIR))
            .unwrap_or_default();
        let server_dir = persisted.server_dir
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
        // If the previous instance relaunched itself mid-Cycle to apply a newer
        // launcher binary, it left the resume sentinel next to the install.
        // Consume it now so the first update() tick continues the Cycle.
        let resume_cycle_pending =
            icraft_core::self_update::take_cycle_resume(&ServerConfig::from_path(&server_dir));
        let mut app = Self {
            server_dir_text: server_dir.display().to_string(),
            server_dir,
            log_lines: std::collections::VecDeque::with_capacity(1024),
            log_rx: LOG_RX.lock().unwrap().take(),
            running_task: None,
            status: InstallStatus::default(),
            console_input: String::new(),
            pat_input: String::new(),
            remote_sha: Arc::new(Mutex::new(None)),
            remote_fetching: Arc::new(AtomicBool::new(false)),
            last_status_refresh: None,
            pending_restart: false,
            resume_cycle_pending,
            remote_fetched_at: Arc::new(Mutex::new(None)),
            last_remote_poll: None,
        };
        app.refresh_status();
        app.kick_remote_refresh();
        app
    }

    /// Fire off a background fetch of GitHub's HEAD SHA for the
    /// configured branch. Result lands in `self.remote_sha`. Skips
    /// if a fetch is already in flight (so spamming Refresh doesn't
    /// stack up requests). Network failures are logged and leave the
    /// previous value in place.
    fn refresh_remote_sha(&self) {
        if self.remote_fetching.swap(true, Ordering::AcqRel) {
            return;
        }
        let slot = Arc::clone(&self.remote_sha);
        let stamp = Arc::clone(&self.remote_fetched_at);
        let busy = Arc::clone(&self.remote_fetching);
        std::thread::spawn(move || {
            // Hardcoded for now -- the alpha repo. If we ever ship
            // forks, switch to reading `git config remote.origin.url`
            // out of the working tree. For now this matches what
            // pull_repo_binary_apply_gui assumes.
            let r = icraft_core::github::head_sha_cdn(
                "silvariasereneblossom",
                "IridescentCraft",
                "main",
            );
            match r {
                Ok(sha) => {
                    *slot.lock().unwrap() = Some(sha);
                    // Stamp the SUCCESS time so the badge can tell a freshly
                    // confirmed reading from a stale value left over from
                    // before a push / a failed fetch.
                    *stamp.lock().unwrap() = Some(Instant::now());
                }
                Err(e) => log::warn!("[github] HEAD fetch failed: {e}"),
            }
            busy.store(false, Ordering::Release);
        });
    }

    /// Kick a remote-HEAD refresh AND reset the idle-poll clock, so the
    /// periodic poll counts from the most recent refresh of any kind
    /// (task start/finish, manual Refresh, or the idle poll itself).
    fn kick_remote_refresh(&mut self) {
        self.refresh_remote_sha();
        self.last_remote_poll = Some(Instant::now());
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
                self.log_lines.push_back(line);
                // 20000-line cap. With virtualized rendering
                // (ScrollArea::show_rows) only the visible window of
                // ~30 rows is laid out per frame, so this is more
                // about memory + GC than UI cost. Earlier 50K cap
                // existed because a non-virtualized log pane fell
                // off a cliff above ~10K lines (every frame laid out
                // every label off-screen), which manifested as the
                // pane appearing to hang at the last visible line
                // while the channel piled up behind it. Now the GUI
                // can keep up with the firehose during boot.
                while self.log_lines.len() > 20000 {
                    self.log_lines.pop_front();
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

    /// Spawn the Cycle "restart" worker: step (2) self-update the launcher +
    /// FULLY sync content, then step (3) start the server. Shared by the Cycle
    /// button's no-server-running branch, the task-finished handler (after a
    /// stop), and the resume-on-start path (after a self-update relaunch) so all
    /// three take the identical, reliable sequence.
    ///
    /// Step 1 (stop the running server) is handled by the caller: the
    /// task-finished path only fires AFTER the prior serve worker returned,
    /// i.e. the JVM has fully exited.
    fn spawn_cycle_restart(&mut self) {
        self.spawn("cycle-restart", move |c| {
            // === Cycle step 2: self-update launcher + FULLY sync content ===
            log::info!("[cycle] step 2: self-update launcher + sync content");
            // 2a. Content sync. Stages icraft-gui.exe.new if the repo's launcher
            //     advanced, and brings kubejs/config/mods current. github_diff
            //     now fails LOUD (visible Sync badge) instead of proceeding
            //     stale silently, and never blind-trusts the marker for the
            //     drift verifies that serve() runs below.
            if let Err(e) = icraft_core::sync::github_diff(&c, false) {
                log::warn!("[cycle] content sync error: {e:#} (continuing -- on-disk verifies still run)");
            }
            // 2b. If a newer launcher exe got staged, apply it via the GUI
            //     rename-dance and relaunch. Arm the resume sentinel FIRST so
            //     the spawned new instance continues this very Cycle (sync +
            //     start) rather than coming up idle.
            if icraft_core::self_update::gui_update_staged(&c) {
                log::info!("[cycle] newer launcher staged -- applying + relaunching; the new instance resumes the Cycle");
                icraft_core::self_update::set_cycle_resume(&c);
                match icraft_core::self_update::apply_and_relaunch_gui(&c) {
                    Ok(true) => {
                        log::info!("[cycle] new GUI spawned -- exiting current process to release the exe lock");
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        std::process::exit(0);
                    }
                    Ok(false) => {
                        // Nothing actually swapped (race / .new vanished).
                        let _ = icraft_core::self_update::take_cycle_resume(&c);
                        log::warn!("[cycle] launcher apply found nothing to swap -- continuing without relaunch");
                    }
                    Err(e) => {
                        let _ = icraft_core::self_update::take_cycle_resume(&c);
                        log::warn!("[cycle] launcher self-update failed: {e:#} -- continuing with the current binary");
                    }
                }
            }
            // === Cycle step 3: start the server ===
            // serve() re-runs github_diff (now a fast short-circuit), the
            // manifest-aware jar hash-verify + the expected-state verify, then
            // launches the JVM and blocks until it exits.
            log::info!("[cycle] step 3: starting server");
            let opts = icraft_core::ServeOptions {
                pipe_output: true,
                apply_self_update: false, // GUI self-updated in step 2 already
                ..Default::default()
            };
            let r = icraft_core::serve(&c, opts).map(|_| ());
            icraft_core::run::set_server_state(icraft_core::run::ServerState::Idle);
            log::info!("[cycle] *** all post-exit hooks complete -- ready ***");
            r
        });
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
                self.last_status_refresh = None;
                self.refresh_status();
                self.kick_remote_refresh();
                // If a Cycle was queued while this task ran (the prior task was
                // the Serve we just stopped — the JVM has now fully exited),
                // run the cycle-restart sequence: self-update + sync + start.
                if self.pending_restart {
                    self.pending_restart = false;
                    log::info!("[cycle] previous task done (JVM exited) -- self-update + sync + restart");
                    self.spawn_cycle_restart();
                }
            } else {
                // Periodically refresh status while a task is running so
                // long operations (Serve, which writes a new SHA marker
                // in Phase 0 then blocks for hours on the launched
                // server) show updated install state in the badges
                // without waiting for the task to complete. 3s cadence
                // is gentle enough -- refresh_status reads the SHA file
                // + counts jars in mods/ (~400 entries), well under
                // 10ms on disk-backed Windows.
                //
                // 2026-05-18 fix: do NOT call refresh_remote_sha here.
                // That hits api.github.com which has a 60/hour unauth
                // limit; 3s cadence is 1200/hour and rate-limits within
                // ~3 minutes of any long task. The DURING-task refresh
                // is for surfacing the LOCAL SHA marker that Phase 0
                // writes to disk; the REMOTE SHA only changes when
                // someone pushes to main and is refreshed on task-start,
                // task-finish, and manual Refresh -- all bounded events.
                let now = Instant::now();
                let due = self.last_status_refresh
                    .map_or(true, |t| now.duration_since(t) >= Duration::from_secs(3));
                if due {
                    self.refresh_status();
                    self.last_status_refresh = Some(now);
                }
                // Heartbeat repaint while a task is running. 2 s is a
                // compromise between "log pane updates feel live" and
                // "Mesa software rasterizer doesn't burn the CPU MC
                // needs". On dev (real GPU) 200 ms was free; on the
                // server VM (Mesa llvmpipe) every redraw was 5 fps of
                // pure-CPU rasterization, which combined with default
                // multi-threaded llvmpipe ate ~half the cores Minecraft
                // wanted -> server TPS tanked while heap stayed at 8/14 GB.
                // 2 s is still fast enough to see status badges flip;
                // drain_log piggybacks on whatever wake happens.
                ctx.request_repaint_after(Duration::from_millis(2000));
            }
        }

        // Resume-after-self-update: the previous instance relaunched mid-Cycle
        // to apply a newer launcher binary and left the resume sentinel (taken
        // in new()). Now that we're up and idle, continue the Cycle so the
        // server still ends up started. One-shot.
        if self.resume_cycle_pending && !self.task_running() {
            self.resume_cycle_pending = false;
            log::info!("[cycle] resuming Cycle after launcher self-update -- sync + start");
            self.spawn_cycle_restart();
        }

        // Tick faster while a remote-sha fetch is in flight so the
        // (checking...) -> (in sync)/(behind) transition shows up
        // promptly. Cheap because the state only lasts ~1 s.
        if self.remote_fetching.load(Ordering::Relaxed) {
            ctx.request_repaint_after(Duration::from_millis(400));
        }

        // Idle/periodic remote re-check so "Repo HEAD" stays honest without a
        // manual Refresh: a push made while the GUI sits idle surfaces as
        // "(behind)" on its own. Gated to REMOTE_POLL_INTERVAL (rate-safe),
        // and a repaint is scheduled on the same cadence so this still fires
        // when the GUI is otherwise asleep (no task, no fetch in flight).
        let poll_now = Instant::now();
        let poll_due = self.last_remote_poll
            .map_or(true, |t| poll_now.duration_since(t) >= REMOTE_POLL_INTERVAL);
        if poll_due && !self.remote_fetching.load(Ordering::Relaxed) {
            self.kick_remote_refresh();
        }
        ctx.request_repaint_after(REMOTE_POLL_INTERVAL);

        egui::TopBottomPanel::top("hdr").show(ctx, |ui| {
            ui.add_space(6.0);
            draw_colored_title(ui);
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
            if ui.button("Refresh").clicked() {
                self.refresh_status();
                self.kick_remote_refresh();
            }
        });
    }

    fn draw_status_badges(&self, ui: &mut egui::Ui) {
        ui.horizontal_wrapped(|ui| {
            // Server lifecycle badge -- updates from the run module's
            // SERVER_STATE which is set on spawn / detected from piped
            // log output / cleared once post-exit hooks complete.
            let (state_label, state_ok) = match icraft_core::run::server_state() {
                icraft_core::run::ServerState::Idle      => ("idle (ready)",        true),
                icraft_core::run::ServerState::Starting  => ("starting",            true),
                icraft_core::run::ServerState::Started   => ("STARTED (listening)", true),
                icraft_core::run::ServerState::Stopping  => ("stopping",            false),
                icraft_core::run::ServerState::PostExit  => ("post-exit hooks",     false),
            };
            badge(ui, "Server", state_ok, state_label);

            badge(ui, "Forge",   self.status.forge_present, if self.status.forge_present { "installed" } else { "missing" });
            badge(ui, "EULA",    self.status.eula_present,  if self.status.eula_present  { "accepted"  } else { "missing" });
            badge(ui, "Mods",    self.status.mod_count > 0, &format!("{} jar(s)", self.status.mod_count));
            let sha_label = self.status.last_sha.as_deref()
                .map(|s| s.chars().take(7).collect::<String>())
                .unwrap_or_else(|| "(none)".to_string());
            badge(ui, "Last sync", self.status.last_sha.is_some(), &sha_label);

            // Sync status: surfaces the github_diff outcome so a fail-open /
            // proceed-stale can't hide in the log scrollback. Red on the
            // not-ok states (API unreachable, partial write failure).
            let (sync_label, sync_ok) = match icraft_core::sync::sync_status() {
                icraft_core::sync::SyncStatus::Idle           => ("idle",                       true),
                icraft_core::sync::SyncStatus::Checking       => ("checking...",                true),
                icraft_core::sync::SyncStatus::Current        => ("current",                    true),
                icraft_core::sync::SyncStatus::Updated        => ("synced",                     true),
                icraft_core::sync::SyncStatus::ApiUnreachable => ("API UNREACHABLE -- STALE!",  false),
                icraft_core::sync::SyncStatus::PartialFailure => ("partial -- will retry",      false),
            };
            badge(ui, "Sync", sync_ok, sync_label);

            // Repo HEAD: shows the latest GitHub SHA + tells you if your
            // local last_sync is up to date. Three states:
            //   - matches local       -> green, "<sha> (in sync)"
            //   - differs from local  -> orange-ish ("behind") so you
            //                            know to click Apply Self-Update
            //   - fetch hasn't landed -> grey "(checking...)"
            let remote = self.remote_sha.lock().unwrap().clone();
            let fetched_at = *self.remote_fetched_at.lock().unwrap();
            let fetching = self.remote_fetching.load(Ordering::Relaxed);
            // A remote reading older than REMOTE_STALE_AFTER (rate-limited,
            // offline, or mid-long-task) is NOT trustworthy as "in sync" -- it
            // may equal the deployed SHA only because we haven't re-checked
            // since before a push. Show it amber "(stale -- Refresh)" instead.
            let stale = fetched_at.map_or(true, |t| t.elapsed() >= REMOTE_STALE_AFTER);
            match remote.as_deref() {
                Some(rsha) => {
                    let short = rsha.chars().take(7).collect::<String>();
                    let in_sync = self.status.last_sha.as_deref() == Some(rsha);
                    if !in_sync {
                        // A newer commit than what's deployed -- always flag it.
                        badge(ui, "Repo HEAD", false, &format!("{short} (behind)"));
                    } else if stale {
                        // Deployed SHA matches the LAST-KNOWN remote, but that
                        // reading is old -- don't claim green "in sync"; nudge a
                        // Refresh. Amber is reserved for "probably fine, unconfirmed".
                        ui.label(egui::RichText::new("Repo HEAD:").strong());
                        ui.label(egui::RichText::new(format!("{short} (stale -- Refresh)"))
                            .color(egui::Color32::from_rgb(220, 170, 60)));
                        ui.separator();
                    } else {
                        badge(ui, "Repo HEAD", true, &format!("{short} (in sync)"));
                    }
                }
                None if fetching => {
                    ui.label(egui::RichText::new("Repo HEAD:").strong());
                    ui.label(egui::RichText::new("(checking...)").weak());
                    ui.separator();
                }
                None => {
                    ui.label(egui::RichText::new("Repo HEAD:").strong());
                    ui.label(egui::RichText::new("(offline?)")
                        .color(egui::Color32::from_rgb(180, 180, 180)));
                    ui.separator();
                }
            }
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
                    let opts = icraft_core::ServeOptions {
                        pipe_output: true, // -> server log streams into GUI
                        apply_self_update: false, // GUI self-updates out-of-band
                        ..Default::default()
                    };
                    let r = icraft_core::serve(&c, opts).map(|_| ());
                    icraft_core::run::set_server_state(icraft_core::run::ServerState::Idle);
                    log::info!("[run] *** all post-exit hooks complete -- ready ***");
                    r
                });
            }
            if action_btn(ui, "Run only", busy).clicked() {
                self.spawn("run", move |c| {
                    let result = icraft_core::run::launch_server_piped(&c, false).map(|_| ());
                    if let Err(e) = icraft_core::crash::push_logs(&c) {
                        log::warn!("[run] post-exit log push failed: {e}");
                    }
                    icraft_core::run::set_server_state(icraft_core::run::ServerState::Idle);
                    log::info!("[run] *** all post-exit hooks complete -- ready ***");
                    result
                });
            }
            // Stop / Kill / Force kill are intentionally NOT gated on
            // `busy` -- they have to be clickable while a "serve" task
            // is running, which is exactly when `busy` is true.
            if ui.add(egui::Button::new("Stop").min_size(egui::vec2(140.0, 28.0))).clicked() {
                // Sends `stop` via stdin (operator command -- normal
                // shutdown path: Forge prints "Stopping the server",
                // unloads worlds, saves chunks, exits clean), then
                // arms a watchdog that escalates to graceful kill
                // after 30s and force kill 10s after that. Aborts on
                // PID change so a new run isn't killed by a stale
                // timer.
                log::info!("[lifecycle] Stop clicked (auto-escalates after 30s)");
                if let Err(e) = icraft_core::run::stop_with_escalation(30, 10) {
                    log::warn!("[lifecycle] stop failed: {e}");
                }
            }
            if ui.add(egui::Button::new("Kill").min_size(egui::vec2(140.0, 28.0))).clicked() {
                // Graceful kill bypassing the auto-escalate watchdog.
                // Unix: SIGTERM (JVM shutdown hooks fire, worlds
                // flush). Windows: writes `stop` to stdin, waits 5s,
                // then taskkill /F (since plain taskkill /T is a no-op
                // for headless Java -- no window to receive WM_CLOSE).
                // Use when Stop's 30s grace is too long to wait.
                log::info!("[lifecycle] Kill clicked");
                if let Err(e) = icraft_core::run::kill_active_server(false) {
                    log::warn!("[lifecycle] kill failed: {e}");
                }
            }
            if ui.add(egui::Button::new("Force kill").min_size(egui::vec2(140.0, 28.0))).clicked() {
                // Last resort: SIGKILL / taskkill /F /T. Process dies
                // immediately. World saves NOT flushed -- chunks since
                // last autosave are lost. Use only when graceful Kill
                // also stalls.
                log::warn!("[lifecycle] Force kill clicked -- worlds may not flush");
                if let Err(e) = icraft_core::run::kill_active_server(true) {
                    log::warn!("[lifecycle] force kill failed: {e}");
                }
            }
            // Cycle = full stop -> self-update + sync -> start, single click.
            // When a server task is running we sequence: stop_with_escalation
            // (Stop's 30s grace + 10s force-kill watchdog), set pending_restart,
            // and let update()'s task-finished handler run spawn_cycle_restart
            // once the JVM has fully exited. When no task is running we run the
            // same self-update + sync + start sequence immediately.
            if ui.add(egui::Button::new("Cycle").min_size(egui::vec2(140.0, 28.0))).clicked() {
                if self.task_running() {
                    log::info!("[cycle] step 1: stop server (escalates after 30s), then self-update + sync + start");
                    if let Err(e) = icraft_core::run::stop_with_escalation(30, 10) {
                        log::warn!("[cycle] stop failed: {e}");
                    }
                    self.pending_restart = true;
                } else {
                    log::info!("[cycle] no server running -- self-update + sync + start");
                    self.spawn_cycle_restart();
                }
            }
            if action_btn(ui, "Accept EULA", busy).clicked() {
                self.spawn("accept-eula", move |c| icraft_core::eula::accept(&c));
            }
        });

        ui.add_space(8.0);
        ui.heading("Sync + install");
        let can_rebuild = icraft_core::self_update::can_rebuild_gui();
        ui.label(egui::RichText::new(
            if can_rebuild {
                "'Sync' is the one-button update: dev boxes (cargo available) rebuild + push + apply; server boxes pull the latest binary + apply. Use Apply Self-Update / Rebuild + Push GUI directly only when you need to override the auto-routing."
            } else {
                "'Sync' is the one-button update: pulls the latest launcher binary + applies it. Use Apply Self-Update to override."
            }
        ).small().weak());
        ui.add_space(2.0);
        ui.horizontal_wrapped(|ui| {
            if action_btn(ui, "Sync", busy).clicked() {
                // One-button update. self_update::sync_apply_gui auto-
                // routes between dev (rebuild + push) and server
                // (pull binary) based on cargo availability. Caller
                // exits 0 if a new GUI spawned.
                self.spawn("sync", move |c| {
                    if icraft_core::self_update::sync_apply_gui(&c)? {
                        log::info!("[sync] new GUI spawned -- exiting current process");
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        std::process::exit(0);
                    }
                    Ok(())
                });
            }
            if action_btn(ui, "Sync repo", busy).clicked() {
                // Single incremental sync. Diff-based: hits compare API,
                // fetches only changed files. The "Sync (--force)" button
                // below is the explicit full-pull reset.
                self.spawn("sync-repo", move |c| icraft_core::sync::github_diff(&c, false));
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
                // Pull-binary-from-git flow: fetch origin in the working
                // tree containing the running exe, extract the new binary
                // content as <exe>.new without overwriting the running
                // file, apply + relaunch. Works on any box with git
                // installed, no cargo / source needed. apply_staged runs
                // first to handle any other staged files (bat/ps1/sh).
                self.spawn("self-update", move |c| {
                    let _ = icraft_core::self_update::apply_staged(&c)?;
                    if icraft_core::self_update::pull_repo_binary_apply_gui(&c)? {
                        log::info!("[self-update] new GUI spawned -- exiting current process");
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        std::process::exit(0);
                    }
                    Ok(())
                });
            }
            if action_btn(ui, "Update Launcher", busy).clicked() {
                // Path A: pull the latest icraft-gui.exe from the repo
                // and re-exec. Sync first (drops .new), then apply +
                // spawn the new binary. The current process exits so
                // its file handle on icraft-gui.exe releases.
                self.spawn("update-launcher", move |c| {
                    icraft_core::sync::github_diff(&c, false)?;
                    if icraft_core::self_update::apply_and_relaunch_gui(&c)? {
                        log::info!("[update] new instance spawned -- exiting current GUI");
                        // Brief pause so the log line flushes via the
                        // GUI before we kill the process.
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        std::process::exit(0);
                    }
                    Ok(())
                });
            }
            // Dev-only: hidden on boxes without cargo (#49).
            if can_rebuild && action_btn(ui, "Rebuild + Push GUI", busy).clicked() {
                // In-process build flow: cargo build the GUI from
                // ICRAFT_LAUNCHER_SRC (or auto-located source), stage the
                // result as <running>.new next to current_exe wherever
                // it sits, best-effort commit+push to the repo, then
                // apply + relaunch. No external bat, no layout
                // assumptions -- works regardless of where the running
                // exe was placed on disk. Cargo output streams into
                // the log pane in real time.
                self.spawn("rebuild-gui", move |c| {
                    if icraft_core::self_update::pull_build_apply_gui(&c)? {
                        log::info!("[rebuild] new GUI spawned -- exiting");
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        std::process::exit(0);
                    }
                    Ok(())
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

        ui.add_space(8.0);
        ui.heading("GitHub auth");
        ui.label(egui::RichText::new(
            "PAT used by 'Push crash logs', Apply Self-Update, AND the repo sync (Cycle/Serve) -- saving one lifts the sync API off the 60/hr unauth limit (5000/hr), which prevents the intermittent 'API unreachable -> starts on old content' Cycle failure. Stored in %LOCALAPPDATA%\\icraft-launcher\\.icraft_token (gitignored). Needs Contents:write on the IridescentCraft repo."
        ).small().weak());
        ui.add_space(2.0);

        let status = icraft_core::crash::pat_status(&cfg);
        let (status_text, status_ok) = match &status {
            icraft_core::crash::PatStatus::EnvVar =>
                ("PAT source: ICRAFT_GH_TOKEN environment variable".to_string(), true),
            icraft_core::crash::PatStatus::FileInAppData(p) =>
                (format!("PAT source: {}", p.display()), true),
            icraft_core::crash::PatStatus::FileNextToExe(p) =>
                (format!("PAT source (legacy): {} -- save again to migrate to %LOCALAPPDATA%\\icraft-launcher\\.icraft_token (safe from modpack sync)", p.display()), true),
            icraft_core::crash::PatStatus::FileInServerDir(p) =>
                (format!("PAT source (legacy): {} -- WARNING: this location gets wiped by sync_from_repo.bat. Save again to migrate.", p.display()), true),
            icraft_core::crash::PatStatus::None =>
                ("No PAT configured".to_string(), false),
        };
        let status_color = if status_ok {
            egui::Color32::from_rgb(120, 200, 140)
        } else {
            egui::Color32::from_rgb(220, 140, 140)
        };
        ui.label(egui::RichText::new(status_text).color(status_color));

        ui.horizontal(|ui| {
            ui.label("Token:");
            ui.add(
                egui::TextEdit::singleline(&mut self.pat_input)
                    .desired_width(f32::INFINITY)
                    .password(true)
                    .hint_text("github_pat_..."),
            );
        });
        ui.horizontal(|ui| {
            if ui.button("Save").clicked() {
                let token = self.pat_input.trim().to_string();
                if token.is_empty() {
                    log::warn!("[auth] empty token; nothing to save");
                } else {
                    match icraft_core::crash::write_pat_to_file(&token) {
                        Ok(p) => {
                            log::info!("[auth] saved PAT to {}", p.display());
                            self.pat_input.clear();
                        }
                        Err(e) => log::error!("[auth] save failed: {e}"),
                    }
                }
            }
            if ui.button("Clear").clicked() {
                match icraft_core::crash::clear_pat_file() {
                    Ok(true)  => log::info!("[auth] removed .icraft_token"),
                    Ok(false) => log::info!("[auth] no .icraft_token file to remove"),
                    Err(e)    => log::error!("[auth] clear failed: {e}"),
                }
                self.pat_input.clear();
            }
        });

        ui.add_space(8.0);
        ui.heading("Server console");
        ui.label(egui::RichText::new(
            "Send commands to the running Forge server. The text field doubles as the username/arg for the per-command buttons -- type 'alice', click [op] -> sends 'op alice'."
        ).small().weak());
        ui.add_space(2.0);

        ui.horizontal(|ui| {
            ui.label("Command:");
            let resp = ui.add(
                egui::TextEdit::singleline(&mut self.console_input)
                    .desired_width(f32::INFINITY)
                    .hint_text("free-form command, OR username for op/ban/kick/...")
            );
            let enter = resp.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
            if ui.button("Send").clicked() || enter {
                if !self.console_input.trim().is_empty() {
                    send_console(&self.console_input);
                    self.console_input.clear();
                }
            }
        });

        ui.add_space(2.0);
        ui.label(egui::RichText::new("With argument (uses input field):").small());
        ui.horizontal_wrapped(|ui| {
            for cmd in ["op", "deop", "kick", "ban", "pardon", "say", "tp", "gamemode"] {
                if ui.button(cmd).clicked() {
                    let arg = self.console_input.trim();
                    if arg.is_empty() {
                        log::warn!("[console] {cmd}: type the username/arg in the field first");
                    } else {
                        send_console(&format!("{cmd} {arg}"));
                    }
                }
            }
        });

        ui.add_space(2.0);
        ui.label(egui::RichText::new("No argument:").small());
        ui.horizontal_wrapped(|ui| {
            for cmd in ["save-all", "save-on", "save-off", "list", "seed",
                        "weather clear", "weather rain", "weather thunder",
                        "time set day", "time set night"] {
                if ui.button(cmd).clicked() {
                    send_console(cmd);
                }
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
        // Virtualized rendering: ScrollArea::show_rows lays out only
        // the rows currently in the viewport (typically ~30) instead
        // of the entire buffer. Without this the pane would lay out
        // every line in self.log_lines on every frame, which at 10K+
        // lines stalls the UI thread badly enough that the channel
        // feeding new log lines piles up and the pane appears to
        // hang at the last successfully-rendered line during boot
        // (real bug, 2026-05-09: tester saw hang at YACL deserialize
        // line while server kept booting fine in the background).
        let row_height = ui.text_style_height(&egui::TextStyle::Body);
        let total = self.log_lines.len();
        egui::ScrollArea::vertical()
            .stick_to_bottom(true)
            .auto_shrink([false, false])
            .show_rows(ui, row_height, total, |ui, range| {
                for i in range {
                    // VecDeque random access is O(1) when both halves
                    // of the ring fit (always, for our sizes); .get
                    // is the safe lookup that returns Option.
                    let Some(line) = self.log_lines.get(i) else { continue };
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

/// Renders the heading "IridescentCraft Server Launcher" with
/// "IridescentCraft" striped in trans-flag colors and "Server Launcher"
/// in a per-letter rainbow gradient. Spaces remain default-color.
fn draw_colored_title(ui: &mut egui::Ui) {
    use egui::Color32;
    // Trans flag stripes (top-to-bottom): blue, pink, white, pink, blue.
    // 15 chars / 5 stripes = 3 chars per stripe, mapped left-to-right.
    let trans = [
        Color32::from_rgb(0x5B, 0xCE, 0xFA), // light blue
        Color32::from_rgb(0xF5, 0xA9, 0xB8), // pink
        Color32::WHITE,
        Color32::from_rgb(0xF5, 0xA9, 0xB8),
        Color32::from_rgb(0x5B, 0xCE, 0xFA),
    ];
    let title    = "IridescentCraft";
    let subtitle = " Server Launcher"; // leading space separates from title
    let title_chars: Vec<char> = title.chars().collect();
    let stripe_size = (title_chars.len() as f32 / trans.len() as f32).ceil() as usize;

    // Single horizontal row, no inter-letter gap so the heading reads
    // as one word per stretch instead of widely spaced letters.
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 0.0;
        for (i, c) in title_chars.iter().enumerate() {
            let stripe = (i / stripe_size).min(trans.len() - 1);
            ui.label(egui::RichText::new(c.to_string())
                .heading()
                .strong()
                .color(trans[stripe]));
        }
        // Rainbow over the letters of "Server Launcher" (skip space).
        let letters: Vec<char> = subtitle.chars().collect();
        let letter_count = letters.iter().filter(|c| !c.is_whitespace()).count() as f32;
        let mut idx = 0.0_f32;
        for c in letters {
            let rich = if c.is_whitespace() {
                egui::RichText::new(c.to_string()).heading()
            } else {
                let hue = idx / letter_count; // 0..1
                idx += 1.0;
                let color: Color32 = egui::ecolor::Hsva::new(hue, 0.85, 1.0, 1.0).into();
                egui::RichText::new(c.to_string()).heading().strong().color(color)
            };
            ui.label(rich);
        }
    });
}

/// Send `line` to the running server's stdin, logging both the
/// outgoing command and any send error to the GUI log pane. Handles
/// the "no server running" case gracefully -- operator just sees a
/// warn line, no crash.
fn send_console(line: &str) {
    let line = line.trim();
    if line.is_empty() { return; }
    log::info!("[console] >> {line}");
    if let Err(e) = icraft_core::run::send_console_line(line) {
        log::warn!("[console] {e}");
    }
}

fn list_jars(p: &Path) -> usize {
    std::fs::read_dir(p).map(|rd|
        rd.filter_map(|e| e.ok())
          .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jar"))
          .count()
    ).unwrap_or(0)
}
