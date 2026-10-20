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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use eframe::egui;
use icraft_core::config::ServerConfig;

mod customizer;
mod regen_page;
mod worldgen_page;

const APP_TITLE: &str = "IridescentCraft Server Launcher";
const KEY_SERVER_DIR: &str = "icraft.server_dir";
/// Where a preview keeps its window state, apart from the real launcher's.
const PREVIEW_APP_NAME: &str = "IridescentCraft Server Launcher Preview";
/// Where a sandbox run keeps its state (see ICRAFT_GUI_SANDBOX in `main`).
const SANDBOX_APP_NAME: &str = "IridescentCraft Server Launcher Sandbox";

/// The two halves of the window: running the server, and the Customizer
/// (world backups, protection map, regeneration dry-run, worldgen settings,
/// and carrying a regeneration out).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Server,
    Customizer,
}

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
    // `--boot-task register|remove <folder>`: the window's registration helper,
    // run as administrator after a UAC prompt (see "Start at boot").
    if let Some((action, dir)) = icraft_core::autostart::boot_task_from_args(std::env::args_os().skip(1)) {
        std::process::exit(run_boot_task_helper(&action, &dir));
    }
    // `--boot <server folder>`: the boot instance the "Start at boot" task
    // starts (no window; see "The boot instance"). Without it: the window.
    if let Some(dir) = icraft_core::autostart::boot_dir_from_args(std::env::args_os().skip(1), || std::env::current_dir().ok()) {
        run_boot(dir);
        return Ok(());
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
    let preview = Preview::from_env();
    let mut viewport = egui::ViewportBuilder::default()
        .with_inner_size([720.0, 600.0])
        .with_min_inner_size([520.0, 420.0])
        .with_title(APP_TITLE);
    if let Some(p) = &preview {
        // Shown without taking the keyboard from whoever is at the machine.
        viewport = viewport.with_inner_size(p.size).with_title(format!("{APP_TITLE} [preview]")).with_active(false);
    }
    // ICRAFT_GUI_SANDBOX: the whole launcher, every background thread
    // included, on settings of its own. Nothing is read from or saved to the
    // real launcher's state, so it opens on the current directory. For trying
    // a build against a scratch folder on a machine that also has a real
    // install (a preview starts no thread; this does).
    let sandbox = preview.is_none() && std::env::var_os("ICRAFT_GUI_SANDBOX").is_some();
    if sandbox {
        viewport = viewport.with_title(format!("{APP_TITLE} [sandbox]")).with_active(false);
    }
    let app_name = if preview.is_some() {
        PREVIEW_APP_NAME
    } else if sandbox {
        SANDBOX_APP_NAME
    } else {
        APP_TITLE
    };
    let opts = eframe::NativeOptions {
        viewport,
        persist_window: preview.is_none(),
        // Glow (OpenGL) backend. On dev boxes with a real GPU, the
        // system ICD handles us. On the server VM with no GPU access,
        // Mesa3D's drop-in `opengl32.dll` + `libgallium_wgl.dll`
        // (placed alongside this exe; build/fetch from
        // github.com/pal1000/mesa-dist-win) provides a pure-CPU
        // OpenGL 4.6 implementation. See the env vars above.
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(app_name, opts, Box::new(move |cc| Box::new(IcraftApp::new(cc, preview))))
}

// =============================================================================
// Preview mode -- look at the window without touching a real install
// =============================================================================
//
// Nobody can see this window where it matters: on the server box it is behind
// remoting, and on a dev PC the saved state points the launcher, and the
// threads it starts, at a real server folder. `ICRAFT_GUI_PREVIEW=<folder>`
// starts it on that folder instead: nothing is loaded from or saved to the
// launcher's state, no background thread is started, and the network is not
// touched. With `ICRAFT_GUI_PREVIEW_SHOTS=<dir>` it also photographs itself and
// closes:
//
//   ICRAFT_GUI_PREVIEW_TAB=server|customizer   the tab to show (customizer)
//   ICRAFT_GUI_PREVIEW_RUN=ring:8              start a dry-run with that scope first
//   ICRAFT_GUI_PREVIEW_PAGE=worldgen           the Customizer's worldgen page instead
//   ICRAFT_GUI_PREVIEW_PAGE=regenerate         its Regenerate page, with the newest dry-run
//                                              checked against the world (read-only: a
//                                              preview cannot type the approval)
//   ICRAFT_GUI_PREVIEW_FILE=mekanism           ...with this file open (a name from `icraft settings files`)
//   ICRAFT_GUI_PREVIEW_EDIT=key=value;k2=v2    ...and these values typed in, not saved
//   ICRAFT_GUI_PREVIEW_SCROLL=0,700,1400       one PNG per scroll offset
//   ICRAFT_GUI_PREVIEW_EXPAND=1                every collapsible section open
//   ICRAFT_GUI_PREVIEW_SIZE=1000x900           window size

#[derive(Clone, Copy, PartialEq, Eq)]
enum PreviewPhase {
    Start,
    Running,
    Shooting,
    Done,
}

struct Preview {
    dir: PathBuf,
    size: [f32; 2],
    shots: Option<PathBuf>,
    tab: Tab,
    run: Option<String>,
    /// `Some` for the worldgen page: (file to open, values to type).
    worldgen: Option<(Option<String>, Option<String>)>,
    /// The Regenerate page.
    regenerate: bool,
    scrolls: Vec<f32>,
    expand: bool,
    phase: PreviewPhase,
    frames: u32,
    shot: usize,
    waiting_for_image: bool,
    started: Instant,
}

impl Preview {
    fn from_env() -> Option<Self> {
        let dir = PathBuf::from(std::env::var_os("ICRAFT_GUI_PREVIEW")?);
        let var = |name: &str| std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let size = var("ICRAFT_GUI_PREVIEW_SIZE")
            .and_then(|v| {
                let (w, h) = v.split_once('x')?;
                Some([w.trim().parse::<f32>().ok()?, h.trim().parse::<f32>().ok()?])
            })
            .unwrap_or([1000.0, 900.0]);
        let scrolls: Vec<f32> = var("ICRAFT_GUI_PREVIEW_SCROLL")
            .map(|v| v.split(',').filter_map(|n| n.trim().parse().ok()).collect())
            .unwrap_or_else(|| vec![0.0]);
        Some(Preview {
            dir,
            size,
            shots: var("ICRAFT_GUI_PREVIEW_SHOTS").map(PathBuf::from),
            tab: if var("ICRAFT_GUI_PREVIEW_TAB").as_deref() == Some("server") { Tab::Server } else { Tab::Customizer },
            run: var("ICRAFT_GUI_PREVIEW_RUN"),
            worldgen: (var("ICRAFT_GUI_PREVIEW_PAGE").as_deref() == Some("worldgen"))
                .then(|| (var("ICRAFT_GUI_PREVIEW_FILE"), var("ICRAFT_GUI_PREVIEW_EDIT"))),
            regenerate: var("ICRAFT_GUI_PREVIEW_PAGE").as_deref() == Some("regenerate"),
            scrolls,
            expand: var("ICRAFT_GUI_PREVIEW_EXPAND").is_some(),
            phase: PreviewPhase::Start,
            frames: 0,
            shot: 0,
            waiting_for_image: false,
            started: Instant::now(),
        })
    }
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
        let message = record.args().to_string();
        let line = format!("[{:>5}] {message}", record.level());
        // logs\launcher.log, once this launcher runs the server folder: its
        // own lines only (the game's are in latest.log). See launcher_log.rs.
        if !icraft_core::launcher_log::is_game_output(&message) {
            LAUNCHER_LOG.write_line(&line);
        }
        // The boot instance has no window to drain the channel into.
        if !WINDOWLESS.load(Ordering::Relaxed) {
            if let Some(bus) = LOG_BUS.get() {
                let _ = bus.sender.lock().unwrap().send(line.clone());
            }
        }
        // Something new to show: the repaint pump paints it (see "Repaints").
        LOG_DIRTY.store(true, Ordering::Release);
        // Also write to stderr for parity with CLI / launcher logs.
        eprintln!("{line}");
    }
    fn flush(&self) {}
}

/// `logs\launcher.log` of the server folder this launcher runs.
static LAUNCHER_LOG: icraft_core::launcher_log::LauncherLog = icraft_core::launcher_log::LauncherLog::new();
/// The boot instance: no window, no log pane.
static WINDOWLESS: AtomicBool = AtomicBool::new(false);

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
// Repaints -- paint when there is something new, not on a timer
// =============================================================================
//
// On the server box the window is drawn by Mesa's software renderer, one
// thread: a frame of the 1916x1115 window costs about 0.2 s of CPU. Until
// 2026-10-11 the launcher used a full core there at all times (10.0 s of CPU
// per 10 s, measured with the server healthy; 94 % of it on the rasterizer
// thread, 5 % on the UI thread). The cause was the "Task running..." spinner:
// an animated widget asks for a repaint on every frame it is visible, a task is
// running whenever the server is, and at that window size the spinner is on
// screen. With nothing else limiting it, the window repainted as fast as the
// rasterizer could go.
//
// So: no animated widgets, and repaints come from what changes --
//   - a new log line: the pump below asks for ONE frame, at most every
//     LOG_REPAINT_EVERY (state changes always log, so badges follow);
//   - a slow tick while a task runs (IDLE_REPAINT_EVERY), for the badges that
//     count time;
//   - input, and the few places that ask for a repaint while they work.
// FRAMES counts what was actually painted; the status file reports the rate, so
// a regression shows up as a number instead of a hot core.

/// A log line arrived since the last frame the pump asked for.
static LOG_DIRTY: AtomicBool = AtomicBool::new(false);
/// Frames painted since the launcher started.
static FRAMES: AtomicU64 = AtomicU64::new(0);
const LOG_REPAINT_EVERY: Duration = Duration::from_millis(2000);
const IDLE_REPAINT_EVERY: Duration = Duration::from_secs(30);

/// Started once in `IcraftApp::new`.
fn spawn_repaint_pump(ctx: egui::Context) {
    std::thread::spawn(move || loop {
        std::thread::sleep(LOG_REPAINT_EVERY);
        if LOG_DIRTY.swap(false, Ordering::AcqRel) {
            // A delay asks for exactly one frame; request_repaint() asks for two.
            ctx.request_repaint_after(Duration::from_millis(50));
        }
    });
}

// =============================================================================
// Persistent app state
// =============================================================================

#[derive(Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
struct PersistedState {
    server_dir: Option<String>,
    /// Heartbeat auto-restart toggle. None (older saved state) = on.
    auto_restart: Option<bool>,
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
    /// World-backup status for the Backup badge. Refreshed on its own slow
    /// clock (see update()), because `refresh_status` only runs on task events
    /// and a requested backup can run with no task at all.
    backup: icraft_core::backup::Status,
    last_backup_refresh: Option<Instant>,
    /// When "Back up now" was last clicked: keeps the GUI repainting until the
    /// request watcher (10 s poll) has picked the request up.
    backup_requested_at: Option<Instant>,
    /// Which half of the window is showing.
    tab: Tab,
    /// The Customizer tab: world backups, protection map, regeneration dry-run.
    customizer: customizer::Customizer,
    /// Set by a preview: where the action panel should be scrolled to.
    forced_scroll: Option<f32>,
    /// What this window shows while another launcher runs the folder.
    viewer: Viewer,
    /// `Some` when started with ICRAFT_GUI_PREVIEW (see "Preview mode").
    preview: Option<Preview>,
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

// =============================================================================
// Heartbeat -- auto-Cycle when the server crashes or stops answering
// =============================================================================
//
// 2026-09-10 incident: the server OOM'd on Sept 4, the OutOfMemoryError re-fired
// inside the shutdown path ("Exception stopping the server"), and the JVM never
// exited -- a zombie holding ~9 GB with the game port closed. Nothing noticed
// for a week, because the only restart path was a human clicking Cycle.
//
// Two detectors, both independent of the egui frame loop (update() can stall
// while the window is minimized or the RDP session is disconnected):
//   1. Exit supervisor -- supervised runs (Serve (full), Cycle, the resume after
//      a launcher self-update) loop inside their worker thread. A non-zero exit
//      (every recorded crash has exited 1) or a probe-forced stop that the
//      operator did NOT ask for runs the Cycle sequence again, with backoff and
//      a crash-loop cap. Exit 0 (e.g. an in-game /stop) is treated as intentional,
//      unless the server thread crashed first: since 2026-10-15 run.rs reports
//      such an exit as 1, and kills a JVM still alive 30 s after its stop failed
//      (icraft_core::run, "A server thread that crashed"; measured in the rig,
//      ruling 19: before that the probe below took five minutes, and a JVM that
//      exited 0 on its own was not restarted at all).
//   2. Listener probe -- while a supervised server is Started (or wedged in
//      Stopping), a bare TCP connect to the game port every PROBE_INTERVAL.
//      PROBE_FAILS_TO_HANG consecutive failures = the JVM is alive but no longer
//      serving (the Sept 4 zombie) -> stop_with_escalation, then detector 1
//      restarts it. Bare connect, no handshake, from 127.0.0.1 (Connectivity's
//      proxywhitelist) so the probe can't trip the malformed-traffic blocker.
//
// Not covered: a main-thread tick freeze with the network threads still up (it
// still accepts TCP). Vanilla's max-tick-time watchdog is the tool for that, and
// server.properties currently disables it (max-tick-time=-1).

const PROBE_INTERVAL: Duration = Duration::from_secs(30);
/// x PROBE_INTERVAL = ~5 min with no listener before the probe forces a stop.
const PROBE_FAILS_TO_HANG: u32 = 10;
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// Auto-restarts allowed per CRASH_WINDOW before giving up (crash loop).
const MAX_AUTO_RESTARTS: usize = 3;
const CRASH_WINDOW: Duration = Duration::from_secs(30 * 60);
/// Wait before auto-restart #n is n x this (15 s, 30 s, 45 s).
const RESTART_BACKOFF_STEP: Duration = Duration::from_secs(15);

struct Supervisor {
    /// Operator toggle (persisted). Off = a crash is logged, not restarted.
    auto_restart: AtomicBool,
    /// A supervise() loop owns the running task (including its backoff waits).
    running: AtomicBool,
    /// A supervised serve()/JVM run is in progress -- gates the listener probe.
    server_live: AtomicBool,
    /// Stop / Kill / Force kill / console `stop`: the next exit is intentional.
    operator_stop: AtomicBool,
    /// Cycle clicked during a supervised run: restart regardless of auto_restart.
    cycle_requested: AtomicBool,
    /// The listener probe forced this stop: a crash even if the JVM exits 0.
    hang_kill: AtomicBool,
    /// Where the probe connects; refreshed from server.properties per launch.
    probe_addr: Mutex<Option<std::net::SocketAddr>>,
    /// Timestamps of recent auto-restarts, for the crash-loop cap.
    restarts: Mutex<std::collections::VecDeque<Instant>>,
    /// Heartbeat badge text; empty = the default "armed"/"off".
    status: Mutex<String>,
}

static SUPERVISOR: Supervisor = Supervisor {
    auto_restart: AtomicBool::new(true),
    running: AtomicBool::new(false),
    server_live: AtomicBool::new(false),
    operator_stop: AtomicBool::new(false),
    cycle_requested: AtomicBool::new(false),
    hang_kill: AtomicBool::new(false),
    probe_addr: Mutex::new(None),
    restarts: Mutex::new(std::collections::VecDeque::new()),
    status: Mutex::new(String::new()),
};

fn set_heartbeat_status(s: impl Into<String>) {
    *SUPERVISOR.status.lock().unwrap() = s.into();
}

/// The operator asked the server to stop -- the supervisor must not
/// "helpfully" bring it back.
fn mark_operator_stop() {
    SUPERVISOR.operator_stop.store(true, Ordering::SeqCst);
}

/// Undo [`mark_operator_stop`] when the stop found no JVM to act on. During a
/// supervised run's sync/launch phase (no JVM yet) a leftover mark would blind
/// the probe and swallow the next crash for the whole run. With no run live,
/// keep it: it cancels a pending auto-restart backoff.
fn clear_stale_operator_stop() {
    if SUPERVISOR.server_live.load(Ordering::SeqCst) {
        SUPERVISOR.operator_stop.store(false, Ordering::SeqCst);
    }
}

/// Probe target from server.properties: `server-ip` if one is set (the server
/// then binds only that address), else 127.0.0.1; `server-port`, default 25565.
/// If server-ip is ever set, add that IP to Connectivity's proxywhitelist too,
/// or its per-source error counter will see the probe's bare connects.
fn probe_addr(c: &ServerConfig) -> std::net::SocketAddr {
    let props = std::fs::read_to_string(c.server_dir.join("server.properties")).unwrap_or_default();
    let get = |key: &str| props.lines().find_map(|l| l.trim().strip_prefix(key).map(|v| v.trim().to_string()));
    let port: u16 = get("server-port=").and_then(|v| v.parse().ok()).unwrap_or(25565);
    let ip: std::net::IpAddr = get("server-ip=")
        .filter(|v| !v.is_empty() && v != "0.0.0.0")
        .and_then(|v| v.parse().ok())
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));
    std::net::SocketAddr::new(ip, port)
}

/// One plain serve (the "Serve (full)" first launch).
fn serve_once(c: &ServerConfig) -> anyhow::Result<i32> {
    let opts = icraft_core::ServeOptions {
        pipe_output: true,        // -> server log streams into GUI
        apply_self_update: false, // GUI self-updates out-of-band (Cycle step 2)
        defer_log_push: true,     // staged at exit, pushed once the server is back up
        ..Default::default()
    };
    set_cycle_step("pre-launch: sync check, mod verify, backup");
    icraft_core::serve(c, opts)
}

/// Cycle steps 2 + 3: self-update the launcher + FULLY sync content, then
/// start the server. Step 1 (stop the running server) is the caller's: this
/// only runs once the previous JVM has fully exited.
fn cycle_once(c: &ServerConfig) -> anyhow::Result<i32> {
    // === Cycle step 2: self-update launcher + FULLY sync content ===
    log::info!("[cycle] step 2: self-update launcher + sync content");
    set_cycle_step("cycle: content sync from GitHub");
    // 2a. Content sync. Stages icraft-gui.exe.new if the repo's launcher
    //     advanced, and brings kubejs/config/mods current. github_diff
    //     now fails LOUD (visible Sync badge) instead of proceeding
    //     stale silently, and never blind-trusts the marker for the
    //     drift verifies that serve() runs below.
    if let Err(e) = icraft_core::sync::github_diff(c, false) {
        log::warn!("[cycle] content sync error: {e:#} (continuing -- on-disk verifies still run)");
    }
    // 2b. If a newer launcher exe got staged, apply it via the GUI
    //     rename-dance and relaunch. Arm the resume sentinel FIRST so
    //     the spawned new instance continues this very Cycle (sync +
    //     start) rather than coming up idle.
    if icraft_core::self_update::gui_update_staged(c) {
        set_cycle_step("cycle: launcher self-update");
        log::info!("[cycle] newer launcher staged -- applying + relaunching; the new instance resumes the Cycle");
        icraft_core::self_update::set_cycle_resume(c);
        match icraft_core::self_update::apply_and_relaunch_gui(c) {
            Ok(true) => {
                log::info!("[cycle] new GUI spawned -- exiting current process to release the exe lock");
                std::thread::sleep(std::time::Duration::from_millis(500));
                std::process::exit(0);
            }
            Ok(false) => {
                // Nothing actually swapped (race / .new vanished).
                let _ = icraft_core::self_update::take_cycle_resume(c);
                log::warn!("[cycle] launcher apply found nothing to swap -- continuing without relaunch");
            }
            Err(e) => {
                let _ = icraft_core::self_update::take_cycle_resume(c);
                log::warn!("[cycle] launcher self-update failed: {e:#} -- continuing with the current binary");
            }
        }
    }
    // === Cycle step 3: start the server ===
    // serve() re-runs github_diff (now a fast short-circuit), the
    // manifest-aware jar hash-verify + the expected-state verify, then
    // launches the JVM and blocks until it exits.
    log::info!("[cycle] step 3: starting server");
    serve_once(c)
}

/// Worker body of every supervised run: the first launch (Cycle sequence or a
/// plain serve), then detector 1 of the heartbeat. Returns once the operator
/// stopped the server, it exited cleanly, auto-restart is off, or the
/// crash-loop cap tripped.
fn supervise(c: ServerConfig, first_is_cycle: bool) -> anyhow::Result<()> {
    SUPERVISOR.running.store(true, Ordering::SeqCst);
    let r = supervise_loop(&c, first_is_cycle);
    SUPERVISOR.server_live.store(false, Ordering::SeqCst);
    SUPERVISOR.running.store(false, Ordering::SeqCst);
    set_cycle_step("");
    // No restart is coming, so staged logs need not wait for one.
    icraft_core::logpush::release();
    r
}

fn supervise_loop(c: &ServerConfig, first_is_cycle: bool) -> anyhow::Result<()> {
    let mut cycle = first_is_cycle;
    loop {
        SUPERVISOR.hang_kill.store(false, Ordering::SeqCst);
        *SUPERVISOR.probe_addr.lock().unwrap() = Some(probe_addr(c));
        SUPERVISOR.server_live.store(true, Ordering::SeqCst);
        let r = if cycle { cycle_once(c) } else { serve_once(c) };
        SUPERVISOR.server_live.store(false, Ordering::SeqCst);
        icraft_core::run::set_server_state(icraft_core::run::ServerState::Idle);
        log::info!("[run] *** all post-exit hooks complete -- ready ***");

        let operator = SUPERVISOR.operator_stop.swap(false, Ordering::SeqCst);
        let hang = SUPERVISOR.hang_kill.swap(false, Ordering::SeqCst);
        if SUPERVISOR.cycle_requested.swap(false, Ordering::SeqCst) {
            log::info!("[cycle] previous run done (JVM exited) -- self-update + sync + restart");
            cycle = true;
            continue;
        }
        let why = match &r {
            Ok(0) if !hang => {
                log::info!("[heartbeat] server stopped cleanly (exit 0) -- not restarting");
                return Ok(());
            }
            Ok(_) if hang => "hang (no listener)".to_string(),
            Ok(code) => format!("exit code {code}"),
            Err(e) => format!("launch failed: {e:#}"),
        };
        if operator {
            log::info!("[heartbeat] server exited ({why}) after an operator stop -- not restarting");
            return r.map(|_| ());
        }
        if !SUPERVISOR.auto_restart.load(Ordering::SeqCst) {
            log::warn!("[heartbeat] server went DOWN ({why}) -- auto-restart is off; click Cycle to bring it back");
            set_heartbeat_status(format!("DOWN ({why}) -- auto-restart off"));
            return r.map(|_| ());
        }
        let attempt = {
            let mut q = SUPERVISOR.restarts.lock().unwrap();
            while q.front().is_some_and(|t| t.elapsed() > CRASH_WINDOW) {
                q.pop_front();
            }
            if q.len() >= MAX_AUTO_RESTARTS {
                let mins = CRASH_WINDOW.as_secs() / 60;
                log::error!(
                    "[heartbeat] server went DOWN ({why}) -- already auto-restarted {} times in {mins} min; \
                     giving up (crash loop). Fix the cause, then click Cycle, or run request_cycle.ps1 \
                     (on the box or over remoting): a request starts it again.",
                    q.len()
                );
                set_heartbeat_status(format!(
                    "GAVE UP -- crash loop ({} in {mins} min); click Cycle or run request_cycle.ps1",
                    q.len() + 1
                ));
                return r.map(|_| ());
            }
            q.push_back(Instant::now());
            q.len()
        };
        let delay = RESTART_BACKOFF_STEP * attempt as u32;
        log::warn!(
            "[heartbeat] server went DOWN ({why}) -- auto-Cycle #{attempt}/{MAX_AUTO_RESTARTS} in {}s (Stop cancels)",
            delay.as_secs()
        );
        set_heartbeat_status(format!("restarting in {}s (#{attempt}/{MAX_AUTO_RESTARTS})", delay.as_secs()));
        set_cycle_step("auto-restart backoff");
        let deadline = Instant::now() + delay;
        while Instant::now() < deadline {
            if SUPERVISOR.operator_stop.swap(false, Ordering::SeqCst) {
                log::info!("[heartbeat] auto-restart cancelled by operator");
                set_heartbeat_status("");
                return Ok(());
            }
            if SUPERVISOR.cycle_requested.swap(false, Ordering::SeqCst) {
                break; // Cycle clicked during the wait: go now
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        set_heartbeat_status(format!("auto-Cycle #{attempt} running"));
        cycle = true;
    }
}

/// Detector 2 of the heartbeat. Long-lived; started once in `IcraftApp::new`.
fn spawn_listener_probe() {
    use icraft_core::run::{server_state, ServerState};
    std::thread::spawn(|| {
        let mut fails: u32 = 0;
        loop {
            std::thread::sleep(PROBE_INTERVAL);
            let st = server_state();
            let eligible = SUPERVISOR.server_live.load(Ordering::SeqCst)
                && matches!(st, ServerState::Started | ServerState::Stopping)
                && !SUPERVISOR.operator_stop.load(Ordering::SeqCst)
                && !SUPERVISOR.cycle_requested.load(Ordering::SeqCst);
            if !eligible {
                fails = 0;
                continue;
            }
            let Some(addr) = *SUPERVISOR.probe_addr.lock().unwrap() else { continue };
            match std::net::TcpStream::connect_timeout(&addr, PROBE_CONNECT_TIMEOUT) {
                Ok(_) => {
                    if fails > 0 {
                        log::info!("[heartbeat] listener {addr} answering again after {fails} failed probe(s)");
                    }
                    fails = 0;
                    let mut s = SUPERVISOR.status.lock().unwrap();
                    if s.starts_with("auto-Cycle") {
                        *s = s.replacen("auto-Cycle", "recovered by auto-Cycle", 1).replace(" running", "");
                    }
                }
                Err(e) => {
                    fails += 1;
                    log::warn!("[heartbeat] listener probe {addr} failed ({fails}/{PROBE_FAILS_TO_HANG}): {e}");
                }
            }
            if fails >= PROBE_FAILS_TO_HANG {
                log::error!(
                    "[heartbeat] no listener on {addr} for ~{}s while the server should be up ({st:?}) -- \
                     JVM alive but not serving; forcing a stop so the supervisor can Cycle",
                    (PROBE_INTERVAL * fails).as_secs()
                );
                SUPERVISOR.hang_kill.store(true, Ordering::SeqCst);
                if let Err(e) = icraft_core::run::stop_with_escalation(30, 10) {
                    log::warn!("[heartbeat] forced stop failed: {e}");
                }
                fails = 0;
                // Don't re-fire while the escalation runs: wait for this launch
                // to leave Started/Stopping (capped so a stuck kill re-arms).
                let wait_until = Instant::now() + Duration::from_secs(300);
                while Instant::now() < wait_until
                    && SUPERVISOR.server_live.load(Ordering::SeqCst)
                    && matches!(server_state(), ServerState::Started | ServerState::Stopping)
                {
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        }
    });
}

// =============================================================================
// Cycle requests -- external request file
// =============================================================================
//
// Only this process holds the server's console, so anything else that wants a
// restart asks for one: request_cycle.ps1 (run on the box or over remoting)
// drops CYCLE_REQUEST_FILE ("<unix-secs> <reason>") in the server dir, and this
// watcher runs it like the Cycle button: in-game warnings, a graceful stop with
// a longer save grace, then the supervisor's Cycle (self-update + sync +
// start). It answers "<unix-secs> accepted" or "<unix-secs> skipped: <why>" in
// CYCLE_RESULT_FILE so the caller logs what actually happened. (Built for the
// 05:00 nightly-restart task, which the uptime restart policy below replaced.)
//
// Since 2026-10-15 a request is also the way back after the heartbeat GAVE UP
// (operator ruling 20): nothing runs then, so it is a start, answered
// "accepted: start ...". The rules, the 10 min age limit included, are
// `icraft_core::restart_policy::request_verdict`.

const CYCLE_REQUEST_FILE: &str = ".icraft_cycle_request";
const CYCLE_RESULT_FILE: &str = ".icraft_cycle_request.result";
const CYCLE_REQUEST_POLL: Duration = Duration::from_secs(10);
const CYCLE_WARN_LEAD: Duration = Duration::from_secs(60);
/// A ~450-mod world save needs more than the Cycle button's 30 s (the old NSSM
/// console-stop timeout was 120 s).
const SCHEDULED_STOP_GRACE_SECS: u64 = 120;
/// A warned restart countdown is running (request file or restart policy): one
/// at a time.
static RESTART_COUNTDOWN: AtomicBool = AtomicBool::new(false);

/// The GUI's install dir, published by `refresh_status` for the request watcher
/// and the restart policy.
static APP_SERVER_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Started once in `IcraftApp::new`.
fn spawn_cycle_request_watcher() {
    use icraft_core::restart_policy::RequestVerdict;
    std::thread::spawn(|| loop {
        std::thread::sleep(CYCLE_REQUEST_POLL);
        let Some(dir) = APP_SERVER_DIR.lock().unwrap().clone() else { continue };
        let Ok(body) = std::fs::read_to_string(dir.join(CYCLE_REQUEST_FILE)) else { continue };
        let _ = std::fs::remove_file(dir.join(CYCLE_REQUEST_FILE));
        let body = body.trim().to_string();
        let verdict = icraft_core::restart_policy::request_verdict(&request_facts(&dir, &body));
        let answer = verdict.answer();
        log::info!("[scheduled] Cycle request '{body}': {answer}");
        let _ = std::fs::write(dir.join(CYCLE_RESULT_FILE), format!("{} {answer}\n", unix_now()));
        match verdict {
            RequestVerdict::Cycle => {
                warned_cycle("scheduled", "Server restart", CYCLE_WARN_LEAD);
            }
            RequestVerdict::StartAfterGaveUp => start_after_gave_up(dir, &body),
            RequestVerdict::Refused(_) => {}
        }
    });
}

/// What the request rules (`restart_policy::request_verdict`) need to know.
fn request_facts(dir: &std::path::Path, body: &str) -> icraft_core::restart_policy::RequestFacts {
    let stamp: Option<u64> = body.split_whitespace().next().and_then(|s| s.parse().ok());
    icraft_core::restart_policy::RequestFacts {
        age_secs: stamp.map(|s| unix_now().saturating_sub(s)),
        cycle_blocker: cycle_blocker(),
        gave_up: !SUPERVISOR.running.load(Ordering::SeqCst) && SUPERVISOR.status.lock().unwrap().starts_with("GAVE UP"),
        jvm_running: icraft_core::run::jvm_active(),
        busy: TASK_BUSY.load(Ordering::SeqCst) || ADOPT_TASK.lock().unwrap().is_some(),
        regen_unfinished: dir.join(icraft_core::regen::exec::MARKER_FILE).exists(),
    }
}

/// The way back after GAVE UP, from a request: the same supervised Cycle
/// (sync + start) as the Cycle button with nothing running, the heartbeat
/// armed again.
fn start_after_gave_up(dir: PathBuf, body: &str) {
    log::warn!("[scheduled] the heartbeat had given up; request '{body}' starts the server again (sync + start)");
    start_cycle_unattended(dir, "start after GAVE UP");
}

/// A supervised Cycle (sync + start) that no click started: after GAVE UP,
/// at boot, after a launcher self-update, after a takeover. Runs without the
/// window (its frames stop while nobody looks at the box, and the boot
/// instance has none), which adopts the task at its next frame; the boot
/// instance adopts it in its own loop.
fn start_cycle_unattended(dir: PathBuf, what: &'static str) {
    arm_supervisor();
    TASK_BUSY.store(true, Ordering::SeqCst);
    // Held while the thread is made, so a frame can never see neither the
    // window's task nor this one.
    let mut slot = ADOPT_TASK.lock().unwrap();
    *slot = Some(std::thread::spawn(move || {
        let _busy = TaskBusy;
        log::info!("== {what} starting ==");
        match supervise(ServerConfig::from_path(dir), true) {
            Ok(_) => log::info!("== {what} done =="),
            Err(e) => log::error!("== {what} FAILED: {e:#} =="),
        }
    }));
}

/// A task holds the launcher: set when the window or the request watcher
/// starts one, cleared by that task's own thread (`TaskBusy`), even when it
/// panics. The request watcher reads it; the window reads its own handle.
static TASK_BUSY: AtomicBool = AtomicBool::new(false);
/// A supervised run the request watcher started: the window takes it as its
/// running task at its next frame, so its buttons treat it as one of theirs.
static ADOPT_TASK: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

struct TaskBusy;

impl Drop for TaskBusy {
    fn drop(&mut self) {
        TASK_BUSY.store(false, Ordering::SeqCst);
    }
}

/// A fresh supervised launch re-arms the heartbeat: no stale stop or Cycle
/// flag, an empty crash-loop history, no "GAVE UP" badge.
fn arm_supervisor() {
    SUPERVISOR.operator_stop.store(false, Ordering::SeqCst);
    SUPERVISOR.cycle_requested.store(false, Ordering::SeqCst);
    SUPERVISOR.restarts.lock().unwrap().clear();
    set_heartbeat_status("");
    SUPERVISOR.running.store(true, Ordering::SeqCst);
}

/// Why an automatic Cycle can't start right now, if anything: it needs a
/// supervised server that is fully up, with no stop, Cycle or restart countdown
/// already under way.
fn cycle_blocker() -> Option<String> {
    use icraft_core::run::{server_state, ServerState};
    if !SUPERVISOR.running.load(Ordering::SeqCst) {
        return Some("no supervised server (stopped on purpose, or started via Run only / an older launcher)".to_string());
    }
    let st = server_state();
    if !SUPERVISOR.server_live.load(Ordering::SeqCst) || st != ServerState::Started {
        return Some(format!("server not up ({st:?}) -- already booting or restarting"));
    }
    if SUPERVISOR.cycle_requested.load(Ordering::SeqCst)
        || SUPERVISOR.operator_stop.load(Ordering::SeqCst)
        || RESTART_COUNTDOWN.load(Ordering::SeqCst)
    {
        return Some("a stop/Cycle is already in progress".to_string());
    }
    None
}

/// Warn players, then hand off exactly like the Cycle button (see
/// [`stop_for_cycle`]). Announces at `lead`, then again at the 60 s and 10 s
/// marks inside it. False = abandoned, nothing was stopped.
fn warned_cycle(tag: &str, what: &str, lead: Duration) -> bool {
    warned_then(tag, what, lead, stop_for_cycle)
}

/// The countdown of [`warned_cycle`], then `stop` (a Cycle's, or a takeover's).
fn warned_then(tag: &str, what: &str, lead: Duration, stop: fn(&str) -> bool) -> bool {
    if RESTART_COUNTDOWN.swap(true, Ordering::SeqCst) {
        log::info!("[{tag}] another restart countdown is already running -- skipped");
        return false;
    }
    let say = |msg: String| {
        if let Err(e) = icraft_core::run::send_console_line(&format!("say {msg}")) {
            log::warn!("[{tag}] in-game warning failed: {e}");
        }
    };
    let mut marks: Vec<u64> = vec![lead.as_secs()];
    marks.extend([60u64, 10].into_iter().filter(|m| *m < lead.as_secs()));
    let mut counted_down = true;
    for (i, &left) in marks.iter().enumerate() {
        if i == 0 {
            say(format!("[Auto-Restart] {what} in {} -- back in a few minutes.", say_secs(left)));
        } else {
            say(format!("[Auto-Restart] Restarting in {}.", say_secs(left)));
        }
        let next = marks.get(i + 1).copied().unwrap_or(0);
        if !countdown(tag, Duration::from_secs(left - next)) {
            counted_down = false;
            break;
        }
    }
    let stopping = counted_down && stop(tag);
    RESTART_COUNTDOWN.store(false, Ordering::SeqCst);
    stopping
}

/// "5 minutes" / "60 seconds", for the in-game countdown.
fn say_secs(s: u64) -> String {
    if s >= 120 && s % 60 == 0 {
        format!("{} minutes", s / 60)
    } else {
        format!("{s} seconds")
    }
}

/// Flag a Cycle and stop the server with SCHEDULED_STOP_GRACE_SECS; the
/// supervisor brings it back (self-update + sync + start) once the JVM exits.
fn stop_for_cycle(tag: &str) -> bool {
    log::info!("[{tag}] stopping (save grace {SCHEDULED_STOP_GRACE_SECS}s), then Cycle: self-update + sync + start");
    SUPERVISOR.cycle_requested.store(true, Ordering::SeqCst);
    if let Err(e) = icraft_core::run::stop_with_escalation(SCHEDULED_STOP_GRACE_SECS, 10) {
        SUPERVISOR.cycle_requested.store(false, Ordering::SeqCst);
        log::warn!("[{tag}] stop failed: {e} -- Cycle abandoned");
        return false;
    }
    true
}

/// Sleep through one countdown step; false (abandon) if the server goes down,
/// gets stopped, or starts cycling for another reason meanwhile.
fn countdown(tag: &str, d: Duration) -> bool {
    let end = Instant::now() + d;
    while Instant::now() < end {
        if !SUPERVISOR.server_live.load(Ordering::SeqCst)
            || SUPERVISOR.operator_stop.load(Ordering::SeqCst)
            || SUPERVISOR.cycle_requested.load(Ordering::SeqCst)
        {
            log::info!("[{tag}] server went down / was stopped during the countdown -- Cycle abandoned");
            return false;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    true
}

// =============================================================================
// World backups -- request file
// =============================================================================
//
// The backups themselves are icraft_core::backup: serve() takes the scheduled
// one in a Cycle's stopped window, so every supervised restart is covered with
// nothing to do here. This thread only serves the request file (the "Back up
// now" button, request_backup.ps1, or a file dropped over the share): with the
// JVM down it takes the pinned backup at once; with the server up it answers
// "queued" and leaves the file for the next stopped window to pick up.

const BACKUP_REQUEST_POLL: Duration = Duration::from_secs(10);

/// Started once in `IcraftApp::new`.
fn spawn_backup_request_watcher() {
    std::thread::spawn(|| loop {
        std::thread::sleep(BACKUP_REQUEST_POLL);
        let Some(dir) = APP_SERVER_DIR.lock().unwrap().clone() else { continue };
        icraft_core::backup::poll_request(&ServerConfig::from_path(dir));
    });
}

// =============================================================================
// Protection report / regeneration dry-run -- request file
// =============================================================================
//
// icraft_core::regen reads the world and writes a report; it deletes nothing
// and never writes inside the world folder, so unlike a backup it does not
// wait for the JVM to be down. This thread serves the request file (the
// "Protection report / Regen dry-run" button, request_regen_report.ps1, or a
// file dropped over the share). It is not part of serve() or a Cycle, and
// nothing here ever runs on its own.

const REGEN_REQUEST_POLL: Duration = Duration::from_secs(10);

/// Started once in `IcraftApp::new`.
fn spawn_regen_request_watcher() {
    std::thread::spawn(|| loop {
        std::thread::sleep(REGEN_REQUEST_POLL);
        let Some(dir) = APP_SERVER_DIR.lock().unwrap().clone() else { continue };
        icraft_core::regen::poll_request(&ServerConfig::from_path(dir));
    });
}

// =============================================================================
// Uptime restart policy -- Cycle at 4 h empty / 12 h with players
// =============================================================================
//
// The rules, the override file (dry-run / off / test thresholds) and the audit
// log live in icraft_core::restart_policy. This thread feeds them the two
// signals only this process has first-hand:
//   - uptime: since this launch's "Done" line (run::started_at), so every
//     restart resets it -- heartbeat crash recoveries included;
//   - players online: a console `list`, read back through the log pump. No
//     reply = unknown = counted as "players online".
// `list` is only sent once a restart could come due (from one debounce window
// before the empty threshold), so a young server's log stays free of it.
// Supervised runs only, like the heartbeat: "Run only" is left alone.

const POLICY_TICK: Duration = Duration::from_secs(60);
const LIST_REPLY_TIMEOUT: Duration = Duration::from_secs(15);
/// With nothing changing, still log one status line this often (proof of life).
const POLICY_STATUS_EVERY: Duration = Duration::from_secs(3600);
/// Restart-policy badge: (healthy, text).
static POLICY_BADGE: Mutex<(bool, String)> = Mutex::new((true, String::new()));

fn set_policy_badge(ok: bool, text: String) {
    *POLICY_BADGE.lock().unwrap() = (ok, text);
}

/// Started once in `IcraftApp::new`.
fn spawn_restart_policy() {
    use icraft_core::restart_policy::{self as rp, Decision, Mode};
    std::thread::spawn(|| {
        // "The last thing logged", so only changes reach the audit log.
        let mut last_policy: Option<Result<rp::Policy, String>> = None;
        let mut last_state = String::new();
        let mut last_line = Instant::now();
        // The launch being tracked, and since when every reading has been empty.
        let mut boot: Option<Instant> = None;
        let mut empty_since: Option<Instant> = None;
        loop {
            std::thread::sleep(POLICY_TICK);
            let Some(dir) = APP_SERVER_DIR.lock().unwrap().clone() else { continue };

            let loaded = rp::Policy::load(&dir);
            if last_policy.as_ref() != Some(&loaded) {
                match &loaded {
                    Ok(p) => rp::audit(&dir, &format!("policy: {}", p.describe())),
                    Err(e) => rp::audit(&dir, &format!("policy SUSPENDED until the override file is fixed or removed -- {e}")),
                }
                last_policy = Some(loaded.clone());
                last_state.clear(); // re-log where things stand under the new settings
            }

            // The uptime clock runs only while a supervised server is fully up.
            let supervised = SUPERVISOR.running.load(Ordering::SeqCst) && SUPERVISOR.server_live.load(Ordering::SeqCst);
            let Some((since, wall)) = icraft_core::run::started_at().filter(|_| supervised) else {
                if boot.take().is_some() {
                    rp::audit(&dir, "server down or restarting -- uptime clock stopped");
                }
                empty_since = None;
                last_state.clear();
                set_policy_badge(true, "idle (no server up)".to_string());
                continue;
            };
            if boot != Some(since) {
                boot = Some(since);
                empty_since = None;
                last_state.clear();
                rp::audit(&dir, &format!("server up since {} -- uptime clock started", wall.format("%Y-%m-%d %H:%M:%S")));
            }

            let policy = match loaded {
                Ok(p) if p.mode != Mode::Off => p,
                Ok(_) => {
                    empty_since = None;
                    set_policy_badge(false, "off (override file)".to_string());
                    continue;
                }
                Err(_) => {
                    empty_since = None;
                    set_policy_badge(false, "SUSPENDED (bad override file)".to_string());
                    continue;
                }
            };
            let uptime = since.elapsed();

            // Ask who is online only once a restart could come due.
            let asking = uptime >= policy.empty_after.saturating_sub(policy.empty_debounce);
            let players = if asking { icraft_core::run::query_player_count(LIST_REPLY_TIMEOUT) } else { None };
            if players == Some(0) {
                if empty_since.is_none() {
                    empty_since = Some(Instant::now());
                }
            } else {
                empty_since = None;
            }
            let empty_for = empty_since.map_or(Duration::ZERO, |t| t.elapsed());
            let decision = rp::decide(&policy, uptime, players, empty_for);

            let seen = match players {
                Some(n) => n.to_string(),
                None if asking => "unknown (no reply to `list`; counted as online)".to_string(),
                None => "not asked yet".to_string(),
            };
            let dry_run = policy.mode == Mode::DryRun;
            set_policy_badge(true, format!(
                "{}up {}, next: {} empty / {} with players",
                if dry_run { "DRY-RUN, " } else { "" },
                rp::fmt_span(uptime), rp::fmt_span(policy.empty_after), rp::fmt_span(policy.busy_after),
            ));
            let state = format!("{seen}|{decision:?}");
            if state != last_state || last_line.elapsed() >= POLICY_STATUS_EVERY {
                rp::audit(&dir, &format!(
                    "uptime {} | players {seen} | empty for {} | {}{}",
                    rp::fmt_span(uptime), rp::fmt_span(empty_for), decision.describe(),
                    if dry_run && decision.is_restart() { " -- DRY-RUN, not acting" } else { "" },
                ));
                last_state = state;
                last_line = Instant::now();
            }

            if !decision.is_restart() || dry_run {
                continue;
            }
            if let Some(why) = cycle_blocker() {
                rp::audit(&dir, &format!("restart due, but held this round: {why}"));
                continue;
            }
            let stopping = if decision == Decision::RestartBusy {
                rp::audit(&dir, &format!(
                    "ACTION: Cycle after a {} in-game countdown (up {}, players {seen})",
                    rp::fmt_span(policy.busy_warn_lead), rp::fmt_span(uptime),
                ));
                warned_cycle("restart-policy", "Scheduled restart", policy.busy_warn_lead)
            } else {
                rp::audit(&dir, &format!(
                    "ACTION: Cycle now, no warnings (up {}, empty for {})",
                    rp::fmt_span(uptime), rp::fmt_span(empty_for),
                ));
                stop_for_cycle("restart-policy")
            };
            if !stopping {
                rp::audit(&dir, "restart abandoned (server went down, was stopped, or the stop failed) -- re-evaluating");
            }
            last_state.clear();
        }
    });
}

// =============================================================================
// Cycle watchdog + status file
// =============================================================================
//
// 2026-10-11: a restart sat between "JVM stopped" and "JVM started" for 39
// minutes. Nothing timed the stages of a Cycle, and nothing outside the
// launcher could tell "up" from "the launcher is alive and the server is not":
// the window is not visible over remoting, and its log pane is not on disk.
//
// This thread does two small things every STATUS_TICK:
//   - it times the phase a supervised run is in. A phase that is not "up" and
//     has lasted CYCLE_STAGE_LIMIT is reported: an error in the log pane, a
//     line in logs\restart_policy.log, a red Cycle badge. It does NOT act --
//     killing or relaunching on a timer is the watcher's job, not built here.
//   - it rewrites STATUS_FILE next to server.properties: state, phase and
//     since when, whether a JVM exists and since when not, the log push, and
//     how many frames a minute the window paints. verify-server.ps1 reads it
//     and reports "launcher up, JVM down for N min" in red.

const CYCLE_STAGE_LIMIT: Duration = Duration::from_secs(10 * 60);
const STATUS_TICK: Duration = Duration::from_secs(15);
const STATUS_FILE: &str = ".icraft_launcher_status";

/// What a supervised run is doing while no JVM exists.
static CYCLE_STEP: Mutex<&'static str> = Mutex::new("");
/// The watchdog's finding for the Cycle badge; empty = nothing is stuck.
static CYCLE_STUCK: Mutex<String> = Mutex::new(String::new());

fn set_cycle_step(step: &'static str) {
    *CYCLE_STEP.lock().unwrap() = step;
}

/// The phase a supervised run is in, and whether it is one the server is down
/// (or not yet up) in.
fn current_phase() -> (String, bool) {
    use icraft_core::run::{server_state, ServerState};
    if !SUPERVISOR.running.load(Ordering::SeqCst) {
        return ("no supervised server".to_string(), false);
    }
    match server_state() {
        ServerState::Started => ("up".to_string(), false),
        ServerState::Starting => ("starting: JVM booting".to_string(), true),
        ServerState::Stopping => ("stopping: JVM saving and exiting".to_string(), true),
        ServerState::PostExit => ("post-exit: crash capture, log staging".to_string(), true),
        ServerState::Idle => {
            let step = *CYCLE_STEP.lock().unwrap();
            (if step.is_empty() { "between stop and start" } else { step }.to_string(), true)
        }
    }
}

/// One line, for a `key=value` file.
fn one_line(text: &str) -> String {
    text.replace(['\r', '\n'], " ")
}

/// Started once in `IcraftApp::new`.
fn spawn_cycle_watchdog() {
    std::thread::spawn(|| {
        let launched = unix_now();
        let mut phase = (String::new(), false);
        let mut phase_since = Instant::now();
        let mut phase_since_unix = launched;
        let mut reported: Option<Instant> = None;
        // The launcher starts with no JVM.
        let mut jvm_was_up = false;
        let mut jvm_down_since_unix = launched;
        let mut frames_before = FRAMES.load(Ordering::Relaxed);
        let mut counted_at = Instant::now();
        let mode = if WINDOWLESS.load(Ordering::SeqCst) { icraft_core::instance::MODE_BOOT } else { icraft_core::instance::MODE_WINDOW };
        let session = icraft_core::autostart::session_id().map_or("unknown".to_string(), |s| s.to_string());
        loop {
            std::thread::sleep(STATUS_TICK);
            let now = current_phase();
            if now != phase {
                phase = now;
                phase_since = Instant::now();
                phase_since_unix = unix_now();
                reported = None;
                CYCLE_STUCK.lock().unwrap().clear();
            }
            let jvm_up = icraft_core::run::jvm_active();
            if jvm_was_up && !jvm_up {
                jvm_down_since_unix = unix_now();
            }
            jvm_was_up = jvm_up;
            let dir = APP_SERVER_DIR.lock().unwrap().clone();

            let lasted = phase_since.elapsed();
            if phase.1 && lasted >= CYCLE_STAGE_LIMIT && reported.map_or(true, |t| t.elapsed() >= CYCLE_STAGE_LIMIT) {
                reported = Some(Instant::now());
                let limit = CYCLE_STAGE_LIMIT.as_secs() / 60;
                let finding = format!("STUCK in '{}' for {} min (limit {limit} min)", phase.0, lasted.as_secs() / 60);
                log::error!(
                    "[watchdog] !!! the server is not up: this run has been in '{}' for {} min (a stage should take under {limit}). \
                     Nothing is done about it automatically. Look at what the launcher is waiting on (its child processes), \
                     then Stop and Cycle.",
                    phase.0,
                    lasted.as_secs() / 60
                );
                if let Some(dir) = &dir {
                    icraft_core::restart_policy::audit(dir, &format!("WATCHDOG: {finding}"));
                }
                *CYCLE_STUCK.lock().unwrap() = finding;
            }

            let frames = FRAMES.load(Ordering::Relaxed);
            let frames_per_min = (frames - frames_before) as f64 * 60.0 / counted_at.elapsed().as_secs_f64().max(1.0);
            frames_before = frames;
            counted_at = Instant::now();

            let Some(dir) = dir else { continue };
            let status = format!(
                "# icraft-gui status, rewritten every {tick} s. Read by .minecraft/dev/verify-server.ps1.\n\
                 written_unix={written}\n\
                 written={written_local}\n\
                 launcher_pid={pid}\n\
                 launcher_started_unix={launched}\n\
                 launcher_mode={mode}\n\
                 session_id={session}\n\
                 supervised={supervised}\n\
                 server_state={state:?}\n\
                 phase={phase_name}\n\
                 phase_since_unix={phase_since_unix}\n\
                 jvm_running={jvm_up}\n\
                 jvm_down_since_unix={down_since}\n\
                 stuck={stuck}\n\
                 heartbeat={heartbeat}\n\
                 log_push={push}\n\
                 frames_per_min={frames_per_min:.0}\n",
                tick = STATUS_TICK.as_secs(),
                written = unix_now(),
                written_local = icraft_core::logpush::local_timestamp(),
                pid = std::process::id(),
                supervised = SUPERVISOR.running.load(Ordering::SeqCst),
                state = icraft_core::run::server_state(),
                phase_name = one_line(&phase.0),
                down_since = if jvm_up { 0 } else { jvm_down_since_unix },
                stuck = one_line(&CYCLE_STUCK.lock().unwrap()),
                heartbeat = one_line(&SUPERVISOR.status.lock().unwrap()),
                push = one_line(&icraft_core::logpush::state().label()),
            );
            // Whole or not at all: the reader must never see half a file.
            let tmp = dir.join(format!("{STATUS_FILE}.tmp"));
            if std::fs::write(&tmp, status).is_ok() {
                let _ = std::fs::rename(&tmp, dir.join(STATUS_FILE));
            }
        }
    });
}

// =============================================================================
// One launcher per server folder -- the window's side
// =============================================================================
//
// The launcher that runs the server holds icraft_core::instance::LOCK_FILE in
// its folder (see instance.rs for why). A window that finds it held -- the
// boot instance runs the server, or another window does -- runs none of the
// threads that act on the server (request watchers, restart policy,
// heartbeat probe, status file) and shows the holder's status file and log
// instead, with three things it can still do: ask for a Cycle and a backup
// through their request files, and take the server over. It keeps trying the
// lock: when the holder goes (it was asked to, it was replaced by a
// self-update, it died), this window becomes the one that runs the folder.

#[derive(Clone)]
enum Role {
    /// Not known yet (the first few seconds, or a preview).
    Deciding,
    /// This window runs the server folder.
    Owner,
    /// Another launcher does (`None`: its lock file could not be read).
    Viewer(Option<icraft_core::instance::Holder>),
}

static ROLE: Mutex<Role> = Mutex::new(Role::Deciding);
/// Held for as long as this process runs the folder.
static OWNER_LOCK: Mutex<Option<icraft_core::instance::InstanceLock>> = Mutex::new(None);
/// This window asked the boot instance to let go: start the server once it has.
static TAKEOVER_ASKED: AtomicBool = AtomicBool::new(false);
/// How long a window waits for the lock before it shows itself as a viewer:
/// a self-update starts the new window half a second before the old one exits.
const OWNER_FIRST_WAIT: Duration = Duration::from_secs(5);
const OWNER_RETRY: Duration = Duration::from_secs(2);
/// A folder found free that this window did not ask for is taken only once it
/// has stayed free this long: longer than a boot instance's successor waits
/// for it (BOOT_LOCK_WAIT), so a self-update never loses the folder to a window.
const HOLDER_GONE_AFTER: Duration = Duration::from_secs(45);

fn role() -> Role {
    ROLE.lock().unwrap().clone()
}

/// The threads that act on the server folder: only the launcher that runs it
/// starts them (once).
fn spawn_owner_threads() {
    spawn_listener_probe();
    spawn_cycle_request_watcher();
    spawn_backup_request_watcher();
    spawn_regen_request_watcher();
    spawn_restart_policy();
    spawn_cycle_watchdog();
}

/// Started once in `IcraftApp::new` (not in a preview).
///
/// A free folder is this window's at once when nothing else was running it
/// (the usual start, or this window's own self-update relaunch), or when this
/// window asked to take the server over. Otherwise the holder may be replacing
/// itself: a boot instance's self-update leaves the folder free for a moment
/// (the lock file still names it, and the Cycle-resume sentinel is there) and
/// its successor takes it back. Then the window lets go at once and takes the
/// folder only once it has stayed free for HOLDER_GONE_AFTER (the holder died).
fn spawn_lock_taker(dir: PathBuf) {
    use icraft_core::instance::{self, Acquired, Holder, MODE_WINDOW};
    std::thread::spawn(move || {
        let me = Holder::me(MODE_WINDOW);
        let cfg = ServerConfig::from_path(&dir);
        let mut first = true;
        let mut told = false;
        let mut free_since: Option<Instant> = None;
        loop {
            // Read before trying: the file names its last holder even once free.
            let last = instance::read_holder(&dir);
            let boot_relaunching = last.as_ref().is_some_and(|h| h.is_boot())
                && icraft_core::self_update::cycle_resume_pending(&cfg);
            let got = if first {
                instance::acquire_within(&dir, &me, OWNER_FIRST_WAIT)
            } else {
                instance::try_acquire(&dir, &me)
            };
            first = false;
            match got {
                Ok(Acquired::Ours(lock)) => {
                    let viewing = matches!(role(), Role::Viewer(_));
                    let gone = free_since.is_some_and(|t| t.elapsed() >= HOLDER_GONE_AFTER);
                    if TAKEOVER_ASKED.load(Ordering::SeqCst) || (!viewing && !boot_relaunching) || gone {
                        if gone && !TAKEOVER_ASKED.load(Ordering::SeqCst) {
                            log::warn!(
                                "[instance] the launcher that ran this server folder has gone (free for {} s): this window runs it now",
                                HOLDER_GONE_AFTER.as_secs()
                            );
                        }
                        *OWNER_LOCK.lock().unwrap() = Some(lock);
                        become_owner(&dir);
                        return;
                    }
                    // Not ours yet: give it back at once (the successor retries every 250 ms).
                    drop(lock);
                    if free_since.is_none() {
                        free_since = Some(Instant::now());
                    }
                    if !viewing {
                        *ROLE.lock().unwrap() = Role::Viewer(last);
                        LOG_DIRTY.store(true, Ordering::Release);
                    }
                }
                Ok(Acquired::Theirs(holder)) => {
                    free_since = None;
                    if !told {
                        log::info!(
                            "[instance] {} runs this server folder: this window shows it, and can take the server over (Server tab)",
                            holder.as_ref().map_or("another launcher".to_string(), |h| h.describe())
                        );
                        told = true;
                    }
                    *ROLE.lock().unwrap() = Role::Viewer(holder);
                    LOG_DIRTY.store(true, Ordering::Release);
                }
                Err(e) => {
                    log::warn!("[instance] the launcher lock in {} could not be taken ({e}): running without it", dir.display());
                    become_owner(&dir);
                    return;
                }
            }
            std::thread::sleep(OWNER_RETRY);
        }
    });
}

/// This window runs the folder now: its log file, its threads, and a start if
/// one is owed (a Cycle a self-update relaunch left half done, or a takeover).
fn become_owner(dir: &Path) {
    if let Err(e) = LAUNCHER_LOG.open(dir) {
        log::warn!("[instance] logs\\launcher.log could not be opened ({e}): this launcher's lines stay in the window only");
    }
    *ROLE.lock().unwrap() = Role::Owner;
    LOG_DIRTY.store(true, Ordering::Release);
    log::info!(
        "[instance] this window runs the server folder (pid {}, Windows session {})",
        std::process::id(),
        icraft_core::autostart::session_id().map_or("unknown".to_string(), |s| s.to_string())
    );
    spawn_owner_threads();
    let cfg = ServerConfig::from_path(dir);
    // Logs a previous instance staged but never pushed (it was replaced
    // mid-Cycle by a launcher self-update, or closed): queue them.
    icraft_core::logpush::resume_pending(&cfg);
    // If the previous instance relaunched itself mid-Cycle to apply a newer
    // launcher binary, it left the resume sentinel next to the install.
    let resume = icraft_core::self_update::take_cycle_resume(&cfg);
    if TAKEOVER_ASKED.swap(false, Ordering::SeqCst) {
        log::info!("[instance] the boot instance let go of the server folder: taking the server over (sync + start)");
        start_cycle_unattended(dir.to_path_buf(), "takeover: sync + start");
    } else if resume {
        log::info!("[cycle] resuming Cycle after launcher self-update -- sync + start");
        start_cycle_unattended(dir.to_path_buf(), "cycle-restart");
    }
}

// =============================================================================
// The boot instance -- `icraft-gui.exe --boot <server folder>`, no window
// =============================================================================
//
// What the "Start at boot" task starts when Windows starts (icraft_core::
// autostart): session 0, nobody logged on, no desktop anyone can see. A
// window there would be drawn for nobody (Mesa's software renderer still pays
// for every frame) and could never be clicked, so there is none. Everything
// that keeps the server up already runs on threads of its own -- the
// supervisor and both heartbeat detectors, the Cycle / backup / regen request
// watchers, the uptime restart policy, the watchdog and its status file -- so
// the boot instance starts those, then the same supervised Cycle (sync +
// self-update + start) the Cycle button runs, and waits. A launcher
// self-update relaunches it with the same arguments, so it stays a boot
// instance. Its log is logs\launcher.log.
//
// It ends in one way: a window asks to take the server over
// (TAKEOVER_REQUEST_FILE). The boot instance then stops the server like a
// Cycle does, does not restart it, writes its answer, lets go of the server
// folder and exits; the window starts its own Cycle.

const BOOT_TICK: Duration = Duration::from_secs(2);
/// A boot instance a self-update just started waits this long for its
/// predecessor to let go of the folder.
const BOOT_LOCK_WAIT: Duration = Duration::from_secs(30);
/// A takeover is under way: the server is being stopped for it.
static HANDOVER: AtomicBool = AtomicBool::new(false);

fn run_boot(dir: PathBuf) {
    use icraft_core::autostart::{TakeoverVerdict, TAKEOVER_RESULT_FILE};
    use icraft_core::instance::{self, Acquired, Holder, MODE_BOOT};
    WINDOWLESS.store(true, Ordering::SeqCst);
    let opened = LAUNCHER_LOG.open(&dir);
    log::info!(
        "[boot] boot instance starting: pid {}, Windows session {}, server folder {}",
        std::process::id(),
        icraft_core::autostart::session_id().map_or("unknown".to_string(), |s| s.to_string()),
        dir.display()
    );
    if let Err(e) = opened {
        // Nobody will read this (there is no file and no window), but stderr.
        log::error!("[boot] logs\\launcher.log could not be opened: {e}");
    }
    if !dir.join("server.properties").is_file() {
        log::error!("[boot] {} has no server.properties: not a server folder, nothing started", dir.display());
        return;
    }
    let lock = match instance::acquire_within(&dir, &Holder::me(MODE_BOOT), BOOT_LOCK_WAIT) {
        Ok(Acquired::Ours(lock)) => Some(lock),
        Ok(Acquired::Theirs(holder)) => {
            log::info!(
                "[boot] {} already runs this server folder: the boot instance has nothing to do and exits",
                holder.map_or("another launcher".to_string(), |h| h.describe())
            );
            return;
        }
        Err(e) => {
            log::warn!("[boot] the launcher lock could not be taken ({e}): running without it");
            None
        }
    };
    *ROLE.lock().unwrap() = Role::Owner;
    *APP_SERVER_DIR.lock().unwrap() = Some(dir.clone());
    // Unattended: the heartbeat always restarts a crashed server here.
    SUPERVISOR.auto_restart.store(true, Ordering::SeqCst);
    spawn_owner_threads();
    let cfg = ServerConfig::from_path(&dir);
    // The account's profile is loaded for an S4U logon, so the token the window
    // saved is found the same way (the path only, never the token).
    let token = match icraft_core::crash::pat_status(&cfg) {
        icraft_core::crash::PatStatus::EnvVar => "the ICRAFT_GH_TOKEN environment variable".to_string(),
        icraft_core::crash::PatStatus::FileInAppData(p)
        | icraft_core::crash::PatStatus::FileNextToExe(p)
        | icraft_core::crash::PatStatus::FileInServerDir(p) => p.display().to_string(),
        icraft_core::crash::PatStatus::None => "none found (the sync runs unauthenticated, the log push waits)".to_string(),
    };
    log::info!("[boot] GitHub token: {token}");
    icraft_core::logpush::resume_pending(&cfg);
    // A boot always runs the Cycle; a sentinel left by a self-update (this
    // instance's predecessor) is consumed so no later window resumes it again.
    if icraft_core::self_update::take_cycle_resume(&cfg) {
        log::info!("[boot] continuing the Cycle the previous boot instance began before its self-update");
    }
    start_cycle_unattended(dir.clone(), "boot: Cycle (sync + self-update + start)");

    let mut task: Option<JoinHandle<()>> = None;
    loop {
        std::thread::sleep(BOOT_TICK);
        // Every unattended start (this one, a request's after GAVE UP) is
        // this instance's own task.
        if let Some(h) = ADOPT_TASK.lock().unwrap().take() {
            task = Some(h);
        }
        let alive = task.as_ref().is_some_and(|h| !h.is_finished());
        if HANDOVER.load(Ordering::SeqCst) {
            // The stop is under way: wait for the supervised run to end.
            if !alive && !SUPERVISOR.running.load(Ordering::SeqCst) {
                break;
            }
            continue;
        }
        match poll_takeover(&dir, alive) {
            Some(TakeoverVerdict::Now) => break,
            Some(TakeoverVerdict::AfterStop) => {
                HANDOVER.store(true, Ordering::SeqCst);
                let d = dir.clone();
                std::thread::spawn(move || handover_stop(&d));
            }
            Some(TakeoverVerdict::Refused(_)) | None => {}
        }
    }
    log::info!("[boot] the boot instance lets go of the server folder and exits: a launcher window takes the server over");
    let _ = std::fs::write(
        dir.join(TAKEOVER_RESULT_FILE),
        format!("{} released: the boot instance has let go of the server folder and exited\n", unix_now()),
    );
    drop(lock);
}

/// A takeover request, if one is there: read, removed, answered.
fn poll_takeover(dir: &Path, task_alive: bool) -> Option<icraft_core::autostart::TakeoverVerdict> {
    use icraft_core::autostart::{self as a, TakeoverFacts};
    let path = dir.join(a::TAKEOVER_REQUEST_FILE);
    let body = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    let body = body.trim().to_string();
    let facts = TakeoverFacts {
        age_secs: a::request_age(&body, unix_now()),
        supervising: SUPERVISOR.running.load(Ordering::SeqCst),
        cycle_blocker: cycle_blocker(),
        busy: task_alive || TASK_BUSY.load(Ordering::SeqCst),
    };
    let verdict = a::takeover_verdict(&facts);
    let answer = verdict.answer();
    log::info!("[boot] takeover request '{body}': {answer}");
    let _ = std::fs::write(dir.join(a::TAKEOVER_RESULT_FILE), format!("{} {answer}\n", unix_now()));
    Some(verdict)
}

/// Stop the server for a takeover: at once when nobody is on, else after the
/// Cycle's countdown. The supervisor does not restart it (an operator stop).
fn handover_stop(dir: &Path) {
    let players = icraft_core::run::query_player_count(LIST_REPLY_TIMEOUT);
    let stopping = if players == Some(0) {
        stop_for_handover("takeover")
    } else {
        warned_then("takeover", "Server restart", CYCLE_WARN_LEAD, stop_for_handover)
    };
    if !stopping {
        HANDOVER.store(false, Ordering::SeqCst);
        log::warn!("[boot] the takeover stop did not happen (the server went down, was stopped, or the stop failed): still running the server");
        let _ = std::fs::write(
            dir.join(icraft_core::autostart::TAKEOVER_RESULT_FILE),
            format!("{} failed: the server could not be stopped for the takeover; the boot instance still runs it -- ask again\n", unix_now()),
        );
    }
}

fn stop_for_handover(tag: &str) -> bool {
    log::info!("[{tag}] stopping (save grace {SCHEDULED_STOP_GRACE_SECS}s); no restart: a launcher window takes the server over");
    mark_operator_stop();
    if let Err(e) = icraft_core::run::stop_with_escalation(SCHEDULED_STOP_GRACE_SECS, 10) {
        clear_stale_operator_stop();
        log::warn!("[{tag}] stop failed: {e}");
        return false;
    }
    true
}

// =============================================================================
// Start at boot -- the window's box for the Task Scheduler task
// =============================================================================

#[derive(Clone)]
enum BootTask {
    /// Not asked yet.
    Unknown,
    /// A query, a registration or a removal is running (the box shows this).
    Working(bool),
    Known(icraft_core::autostart::Registered),
    Failed(String),
}

static BOOT_TASK: Mutex<BootTask> = Mutex::new(BootTask::Unknown);

/// What Task Scheduler has, for this launcher and folder (on a thread:
/// schtasks takes a moment).
fn refresh_boot_task(dir: PathBuf) {
    {
        let mut t = BOOT_TASK.lock().unwrap();
        let on = matches!(*t, BootTask::Known(icraft_core::autostart::Registered::Yes) | BootTask::Working(true));
        *t = BootTask::Working(on);
    }
    std::thread::spawn(move || {
        let state = match std::env::current_exe() {
            Ok(exe) => match icraft_core::autostart::status(&exe, &dir) {
                Ok(r) => BootTask::Known(r),
                Err(e) => BootTask::Failed(format!("{e:#}")),
            },
            Err(e) => BootTask::Failed(format!("this launcher's own path is unknown: {e}")),
        };
        *BOOT_TASK.lock().unwrap() = state;
        LOG_DIRTY.store(true, Ordering::Release);
    });
}

/// Register (`on`) or delete the task, then read it back.
fn set_boot_task(on: bool, dir: PathBuf) {
    use icraft_core::autostart as a;
    *BOOT_TASK.lock().unwrap() = BootTask::Working(on);
    std::thread::spawn(move || {
        let exe = match std::env::current_exe() {
            Ok(exe) => exe,
            Err(e) => {
                *BOOT_TASK.lock().unwrap() = BootTask::Failed(format!("this launcher's own path is unknown: {e}"));
                return;
            }
        };
        let what = if on { "registering the task" } else { "removing the task" };
        let mut done = if on { a::register(&exe, &dir) } else { a::unregister() };
        // Task Scheduler refuses an S4U registration from an unelevated token
        // (measured on Server 2025): ask Windows for administrator approval and
        // let a copy of this launcher, run as administrator, do it.
        if done.as_ref().is_err_and(|e| format!("{e:#}").to_lowercase().contains("denied")) {
            log::warn!(
                "[boot-task] Windows refused ({}): asking for administrator approval -- answer the Windows prompt \
                 (User Account Control; it may be flashing on the taskbar)",
                done.as_ref().err().map(|e| format!("{e:#}")).unwrap_or_default()
            );
            let args = vec![a::BOOT_TASK_ARG.to_string(), if on { "register" } else { "remove" }.to_string(), dir.display().to_string()];
            let elevated = a::run_elevated(&exe, &args);
            // The helper writes to logs\launcher.log, not to this window.
            if let Some(said) = icraft_core::launcher_log::tail(&dir, 40, 64 * 1024)
                .into_iter()
                .filter(|l| l.contains("(as administrator)"))
                .last()
            {
                log::info!("[boot-task] the helper run as administrator: {said}");
            }
            done = match elevated {
                Ok(0) => Ok(()),
                Ok(a::ERROR_CANCELLED) => Err(anyhow::anyhow!("the administrator approval was declined (or could not be shown)")),
                Ok(code) => Err(anyhow::anyhow!("the helper run as administrator failed (exit {code}; logs\\launcher.log has its line)")),
                Err(e) => Err(e),
            };
        }
        match done {
            Ok(()) if on => log::info!(
                "[boot-task] registered '{}': at every Windows start, {} {} runs as {} (S4U: nobody logged on, no password stored)",
                a::TASK_NAME,
                exe.display(),
                a::boot_arguments(&dir),
                a::current_user().unwrap_or_default()
            ),
            Ok(()) => log::info!("[boot-task] removed '{}': nothing starts the launcher at boot now", a::TASK_NAME),
            Err(e) => {
                log::error!("[boot-task] {what} failed: {e:#}");
                if on {
                    log::error!("[boot-task] the same task from an elevated PowerShell at the box (one line):");
                    log::error!("{}", a::powershell_line(&exe, &dir));
                }
            }
        }
        let state = match a::status(&exe, &dir) {
            Ok(r) => BootTask::Known(r),
            Err(e) => BootTask::Failed(format!("{e:#}")),
        };
        *BOOT_TASK.lock().unwrap() = state;
        LOG_DIRTY.store(true, Ordering::Release);
    });
}

/// `icraft-gui.exe --boot-task register|remove <folder>`: what the window runs
/// as administrator when Windows refuses it the task. No window; its lines go
/// to the folder's logs\launcher.log (the window shows that file's lines only
/// once it is the viewer, so it says what came back). 0 = done.
fn run_boot_task_helper(action: &str, dir: &Path) -> i32 {
    use icraft_core::autostart as a;
    WINDOWLESS.store(true, Ordering::SeqCst);
    let _ = LAUNCHER_LOG.open(dir);
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            log::error!("[boot-task] (as administrator) this launcher's own path is unknown: {e}");
            return 1;
        }
    };
    let done = if action == "register" { a::register(&exe, dir) } else { a::unregister() };
    match done {
        Ok(()) => {
            log::info!("[boot-task] (as administrator) {action}: done, '{}'", a::TASK_NAME);
            0
        }
        Err(e) => {
            log::error!("[boot-task] (as administrator) {action} failed: {e:#}");
            1
        }
    }
}

/// What a window shows of the launcher that runs the folder: its status file
/// (key=value lines), its log's tail, and the answer to a takeover.
#[derive(Default)]
struct Viewer {
    status: Vec<(String, String)>,
    log: Vec<String>,
    takeover_answer: String,
    read_at: Option<Instant>,
    /// First click on "Take over here": a second within 10 s sends it.
    armed_at: Option<Instant>,
}

const VIEWER_REFRESH: Duration = Duration::from_secs(5);

impl Viewer {
    fn refresh(&mut self, dir: &Path) {
        self.read_at = Some(Instant::now());
        self.status = std::fs::read_to_string(dir.join(STATUS_FILE))
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.starts_with('#'))
            .filter_map(|l| l.split_once('=').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
            .collect();
        self.log = icraft_core::launcher_log::tail(dir, 400, 256 * 1024);
        self.takeover_answer = std::fs::read_to_string(dir.join(icraft_core::autostart::TAKEOVER_RESULT_FILE))
            .unwrap_or_default()
            .trim()
            .to_string();
        // Refused or failed: nothing will let go, so nothing to start.
        let answer = self.takeover_answer.split_once(' ').map_or("", |(_, a)| a);
        if TAKEOVER_ASKED.load(Ordering::SeqCst)
            && (answer.starts_with("skipped") || answer.starts_with("rejected") || answer.starts_with("failed"))
        {
            TAKEOVER_ASKED.store(false, Ordering::SeqCst);
            log::warn!("[instance] the boot instance did not let go: {answer}");
        }
    }

    fn get(&self, key: &str) -> &str {
        self.status.iter().find(|(k, _)| k == key).map_or("", |(_, v)| v.as_str())
    }
}

impl IcraftApp {
    fn new(cc: &eframe::CreationContext<'_>, preview: Option<Preview>) -> Self {
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

        // A preview reads no saved state, starts no background thread and
        // consumes nothing in the folder it is shown.
        let persisted: PersistedState = if preview.is_some() {
            PersistedState::default()
        } else {
            cc.storage.and_then(|s| eframe::get_value(s, KEY_SERVER_DIR)).unwrap_or_default()
        };
        SUPERVISOR.auto_restart.store(persisted.auto_restart.unwrap_or(true), Ordering::SeqCst);
        let server_dir = match &preview {
            Some(p) => p.dir.clone(),
            None => persisted.server_dir
                .map(PathBuf::from)
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
        };
        if preview.is_none() {
            spawn_repaint_pump(cc.egui_ctx.clone());
            // Runs the folder (and starts the threads that act on it, see
            // become_owner) or shows the launcher that does.
            spawn_lock_taker(server_dir.clone());
        } else if std::env::var_os("ICRAFT_GUI_PREVIEW_VIEWER").is_some() {
            // A preview of the window another launcher's lock leaves it in.
            let started = unix_now().saturating_sub(3 * 3600 + 300);
            *ROLE.lock().unwrap() = Role::Viewer(Some(icraft_core::instance::Holder {
                pid: 4242,
                mode: icraft_core::instance::MODE_BOOT.to_string(),
                started_unix: started,
            }));
        } else {
            *ROLE.lock().unwrap() = Role::Owner;
        }
        let mut customizer = customizer::Customizer::new();
        customizer.expand_all = preview.as_ref().map_or(false, |p| p.expand);
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
            remote_fetched_at: Arc::new(Mutex::new(None)),
            last_remote_poll: None,
            backup: icraft_core::backup::Status::default(),
            last_backup_refresh: None,
            backup_requested_at: None,
            tab: preview.as_ref().map_or(Tab::Server, |p| p.tab),
            customizer,
            forced_scroll: None,
            viewer: Viewer::default(),
            preview,
        };
        app.refresh_status();
        if app.preview.is_none() {
            app.kick_remote_refresh();
        }
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
            // Display freshness: this reading only paints the badge, so with
            // no PAT configured it takes the free CDN stamp rather than
            // spending the 60/hr unauthenticated API bucket that the SYNC
            // needs (20 polls/hr would be a third of it). With a PAT — the
            // normal state — it's an exact API read like the sync's.
            let r = icraft_core::github::resolve_head_sha(
                "silvariasereneblossom",
                "IridescentCraft",
                "main",
                icraft_core::github::HeadFreshness::Display,
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
        // Runs on every install-dir change + periodically: keeps the scheduled
        // Cycle-request watcher pointed at the current install.
        *APP_SERVER_DIR.lock().unwrap() = Some(self.server_dir.clone());
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
        self.running_task.as_ref().map(|h| !h.is_finished()).unwrap_or(false) || ADOPT_TASK.lock().unwrap().is_some()
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
        TASK_BUSY.store(true, Ordering::SeqCst);
        let h = std::thread::spawn(move || {
            let _busy = TaskBusy;
            match work(cfg) {
                Ok(_) => log::info!("== {} done ==", name),
                Err(e) => log::error!("== {} FAILED: {e:#} ==", name),
            }
        });
        self.running_task = Some(h);
    }

    /// Spawn the Cycle "restart" worker (steps 2 + 3, see [`cycle_once`]) as a
    /// supervised run, so the heartbeat keeps the server up afterwards. Shared
    /// by the Cycle button's no-server-running branch, the task-finished
    /// handler (after a non-supervised task was stopped), and the
    /// resume-on-start path (after a self-update relaunch).
    ///
    /// Step 1 (stop the running server) is handled by the caller.
    fn spawn_cycle_restart(&mut self) {
        self.spawn_supervised("cycle-restart", true);
    }

    /// Start a supervised server run (see [`supervise`]). A fresh operator
    /// launch re-arms the heartbeat: clears stale stop/cycle flags, the
    /// crash-loop history, and any "GAVE UP" badge.
    fn spawn_supervised(&mut self, name: &'static str, first_is_cycle: bool) {
        if self.task_running() { return; }
        // Sets `running` here (GUI thread), not only inside the worker, so a
        // Cycle click in the instant after spawn already takes the supervised path.
        arm_supervisor();
        self.spawn(name, move |c| supervise(c, first_is_cycle));
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
        if self.preview.is_some() {
            return;
        }
        let p = PersistedState {
            server_dir: Some(self.server_dir.display().to_string()),
            auto_restart: Some(SUPERVISOR.auto_restart.load(Ordering::SeqCst)),
        };
        eframe::set_value(storage, KEY_SERVER_DIR, &p);
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        FRAMES.fetch_add(1, Ordering::Relaxed);
        self.preview_tick(ctx);
        // Drain log buffer + check task completion every frame.
        self.drain_log();
        // A start the request watcher made (after GAVE UP) becomes this
        // window's running task: Stop, Cycle and the rest see it as their own.
        if self.running_task.is_none() {
            if let Some(h) = ADOPT_TASK.lock().unwrap().take() {
                log::info!("[scheduled] the window takes over the start made by a request");
                self.running_task = Some(h);
            }
        }
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
                // Slow tick while a task is running, for the badges that
                // count time. New log lines (and with them every state
                // change) are painted by the repaint pump within
                // LOG_REPAINT_EVERY, so this is no longer what keeps the
                // window live. It used to be a fixed 2 s repaint: on the
                // server VM (Mesa llvmpipe, ~0.2 s of CPU per frame) that
                // alone was a tenth of a core, around the clock. See
                // "Repaints".
                ctx.request_repaint_after(IDLE_REPAINT_EVERY);
            }
        }

        // Backup badge: read the manifest every few seconds, whether or not a
        // task is running. And keep painting while a requested backup is
        // pending or under way, so its log lines and the badge move even when
        // the GUI would otherwise sleep (no server task).
        if self.last_backup_refresh.map_or(true, |t| t.elapsed() >= Duration::from_secs(5)) {
            self.backup = icraft_core::backup::status(&self.server_dir);
            self.last_backup_refresh = Some(Instant::now());
        }
        if icraft_core::backup::in_progress()
            || self.backup_requested_at.is_some_and(|t| t.elapsed() < Duration::from_secs(30))
        {
            ctx.request_repaint_after(Duration::from_millis(2000));
        }

        // Keep painting while a dry-run is reading the world (one started on
        // the Customizer tab, or one asked for through the request file).
        if self.customizer.busy() || icraft_core::regen::in_progress() {
            ctx.request_repaint_after(Duration::from_millis(1000));
        }

        // (Resume-after-self-update and the start after a takeover are started
        // by become_owner, without a frame, and adopted above.)

        // Another launcher runs the folder: read what it says, now and then.
        let viewing = matches!(role(), Role::Viewer(_));
        if viewing {
            if self.viewer.read_at.map_or(true, |t| t.elapsed() >= VIEWER_REFRESH) {
                self.viewer.refresh(&self.server_dir);
            }
            ctx.request_repaint_after(VIEWER_REFRESH);
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
        if poll_due && !self.remote_fetching.load(Ordering::Relaxed) && self.preview.is_none() {
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
            if viewing {
                self.draw_viewer_badges(ui);
            } else {
                self.draw_status_badges(ui);
            }
            ui.add_space(4.0);
        });

        // The Customizer tab needs the height more than the log does: there
        // the log is a few lines (it can still be dragged taller). A panel
        // remembers its size by id, so each tab keeps its own.
        let (log_id, log_min, log_default) = match self.tab {
            Tab::Server => ("log", 180.0, 280.0),
            Tab::Customizer => ("log-customizer", 64.0, 110.0),
        };
        egui::TopBottomPanel::bottom(log_id).resizable(true)
            .min_height(log_min).default_height(log_default).show(ctx, |ui| {
            ui.add_space(2.0);
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("Log").strong());
                if ui.button("Clear").clicked() { self.log_lines.clear(); }
            });
            self.draw_log_pane(ui);
        });

        // Two tabs. Either one is taller than the window at its default size,
        // so each scrolls (and keeps its own scroll position).
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.selectable_value(&mut self.tab, Tab::Server, "   Server   ");
                ui.selectable_value(&mut self.tab, Tab::Customizer, "   Customizer   ");
            });
            ui.separator();
            let mut area = egui::ScrollArea::vertical()
                .id_source(match self.tab {
                    Tab::Server => "tab-server",
                    Tab::Customizer => self.customizer.page_name(),
                })
                .auto_shrink([false, false]);
            if let Some(offset) = self.forced_scroll.take() {
                area = area.vertical_scroll_offset(offset);
            }
            area.show(ui, |ui| match (self.tab, role()) {
                (Tab::Server, Role::Owner) => self.draw_action_buttons(ui),
                (Tab::Server, Role::Viewer(holder)) => self.draw_viewer(ui, holder.as_ref()),
                (_, Role::Deciding) => {
                    ui.add_space(8.0);
                    ui.label("Checking whether another launcher runs this server folder...");
                }
                (Tab::Customizer, Role::Owner) => {
                    if self.customizer.ui(ui, &self.server_dir, &self.backup) {
                        self.request_backup_now();
                    }
                }
                (Tab::Customizer, Role::Viewer(_)) => {
                    ui.add_space(8.0);
                    ui.label(
                        "Another launcher runs this server folder. The Customizer works on the world and the server's \
                         own settings, so it is open only in the launcher that runs the server: take the server over \
                         on the Server tab first. (\"Back up now\" is on the Server tab here.)",
                    );
                }
            });
        });
    }
}

impl IcraftApp {
    /// "Back up now": ask for a pinned backup through the request file, the
    /// same way request_backup.ps1 does.
    fn request_backup_now(&mut self) {
        match icraft_core::backup::write_request(&self.server_dir, "gui") {
            Ok(()) if icraft_core::run::jvm_active() => log::info!(
                "[backup] requested -- the server is running, so it waits for the next Cycle's stopped window (click Cycle to take it now)"
            ),
            Ok(()) => log::info!("[backup] requested -- starting within ~10 s"),
            Err(e) => log::warn!("[backup] could not write the request file: {e}"),
        }
        self.backup_requested_at = Some(Instant::now());
    }

    /// Drive a preview (see "Preview mode"): show the tab, start the dry-run
    /// it was asked for, photograph the window at each scroll offset, close.
    fn preview_tick(&mut self, ctx: &egui::Context) {
        let Some(p) = self.preview.as_mut() else { return };
        ctx.request_repaint();
        p.frames += 1;

        // A screenshot asked for on an earlier frame arrives as an input event.
        let image = ctx.input(|i| {
            i.raw.events.iter().find_map(|e| match e {
                egui::Event::Screenshot { image, .. } => Some(image.clone()),
                _ => None,
            })
        });
        if let (Some(image), Some(dir)) = (image, p.shots.as_ref()) {
            let rgb: Vec<u8> = image.pixels.iter().flat_map(|c| [c.r(), c.g(), c.b()]).collect();
            let tab = match p.tab {
                Tab::Server => "server",
                Tab::Customizer if p.worldgen.is_some() => "worldgen",
                Tab::Customizer if p.regenerate => "regenerate",
                Tab::Customizer => "customizer",
            };
            let name = format!("{tab}-{:02}.png", p.shot);
            let saved = icraft_core::png::encode_rgb(image.size[0] as u32, image.size[1] as u32, &rgb)
                .ok_or_else(|| "could not encode it".to_string())
                .and_then(|png| {
                    std::fs::create_dir_all(dir).and_then(|()| std::fs::write(dir.join(&name), png)).map_err(|e| e.to_string())
                });
            match saved {
                Ok(()) => log::info!("[preview] saved {name} ({}x{})", image.size[0], image.size[1]),
                Err(e) => log::warn!("[preview] {name}: {e}"),
            }
            p.shot += 1;
            p.waiting_for_image = false;
            p.frames = 0;
        }

        match p.phase {
            PreviewPhase::Start => {
                self.tab = p.tab;
                // A few frames first, so the tab has loaded the folder.
                if p.frames >= 4 {
                    if let Some((file, edits)) = &p.worldgen {
                        self.customizer.show_worldgen(file.as_deref(), edits.as_deref());
                    }
                    if p.regenerate {
                        self.customizer.show_regenerate();
                    }
                    if let Some(scope) = p.run.clone() {
                        match self.customizer.set_scope(&scope) {
                            Ok(()) => self.customizer.start_run(&self.server_dir),
                            Err(e) => log::warn!("[preview] {e}"),
                        }
                    }
                    p.phase = PreviewPhase::Running;
                    p.frames = 0;
                }
            }
            PreviewPhase::Running => {
                if !self.customizer.busy() && p.frames >= 6 {
                    if self.customizer.failed() {
                        log::warn!("[preview] the dry-run failed; photographing the tab as it is");
                    }
                    p.phase = if p.shots.is_some() { PreviewPhase::Shooting } else { PreviewPhase::Done };
                    p.frames = 0;
                }
            }
            PreviewPhase::Shooting => match p.scrolls.get(p.shot).copied() {
                None => {
                    p.phase = PreviewPhase::Done;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
                Some(offset) => {
                    self.forced_scroll = Some(offset);
                    if p.frames >= 5 && !p.waiting_for_image {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot);
                        p.waiting_for_image = true;
                    }
                }
            },
            PreviewPhase::Done => {}
        }
        // A photographing preview never outstays its welcome.
        if p.shots.is_some() && p.started.elapsed() > Duration::from_secs(240) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }
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

            // Heartbeat: auto-Cycle on crash / dead listener (see SUPERVISOR).
            let hb_status = SUPERVISOR.status.lock().unwrap().clone();
            let (hb_label, hb_ok) = if !hb_status.is_empty() {
                let ok = hb_status.starts_with("recovered") || hb_status.starts_with("auto-Cycle");
                (hb_status, ok)
            } else if !SUPERVISOR.auto_restart.load(Ordering::Relaxed) {
                ("off".to_string(), false)
            } else if SUPERVISOR.running.load(Ordering::Relaxed) {
                ("armed".to_string(), true)
            } else {
                ("armed (no server)".to_string(), true)
            };
            badge(ui, "Heartbeat", hb_ok, &hb_label);

            // Cycle watchdog: only shown when a stage of a restart has
            // outlasted CYCLE_STAGE_LIMIT (see spawn_cycle_watchdog).
            let stuck = CYCLE_STUCK.lock().unwrap().clone();
            if !stuck.is_empty() {
                badge(ui, "Cycle", false, &stuck);
            }

            // Log push (icraft_core::logpush): staged at exit, pushed in the
            // background. Its own badge, so "pushing logs" is never mistaken
            // for the server being busy -- and never holds the Server state.
            {
                use icraft_core::logpush::{Health, PushState};
                let push = icraft_core::logpush::state();
                if push != PushState::Idle {
                    let color = match push.health() {
                        Health::Good => BADGE_GREEN,
                        Health::Busy => BADGE_AMBER,
                        Health::Bad => BADGE_RED,
                    };
                    let label: String = push.label().chars().take(110).collect();
                    badge_colored(ui, "Logs", color, &label);
                }
            }

            // Uptime restart policy (see spawn_restart_policy); empty until
            // its first evaluation, a minute after launch.
            let (rp_ok, rp_label) = POLICY_BADGE.lock().unwrap().clone();
            if !rp_label.is_empty() {
                badge(ui, "Restarts", rp_ok, &rp_label);
            }

            // World backups (icraft_core::backup): age of the newest verified
            // scheduled backup -- green under 13 h, amber under 24 h, red
            // beyond that, with none, or when the last attempt failed. Pinned
            // (manual) backups are counted in the label: nothing but the
            // operator ever deletes those.
            {
                use icraft_core::backup::Health;
                let now = unix_now() as i64;
                let (color, label) = if icraft_core::backup::in_progress() {
                    (BADGE_AMBER, "running...".to_string())
                } else {
                    let color = match self.backup.health(now) {
                        Health::Good => BADGE_GREEN,
                        Health::Stale => BADGE_AMBER,
                        Health::Bad => BADGE_RED,
                    };
                    (color, self.backup.label(now))
                };
                badge_colored(ui, "Backup", color, &label);
            }

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
                icraft_core::sync::SyncStatus::LauncherStale  => ("LAUNCHER STALE -- restart", false),
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
                // Supervised: the heartbeat auto-Cycles it if it crashes.
                self.spawn_supervised("serve", false);
            }
            // Run only = bare JVM launch for debugging: NOT supervised.
            if action_btn(ui, "Run only", busy).clicked() {
                self.spawn("run", move |c| {
                    let result = icraft_core::run::launch_server_piped(&c, false);
                    // Nothing restarts a run-only server: stage, and push now
                    // (in the background -- this task does not wait for it).
                    // Debug logs go along only when the run ended in a crash.
                    let crashed = matches!(&result, Ok(code) if *code != 0);
                    icraft_core::logpush::stage_and_defer(&c, crashed);
                    icraft_core::logpush::release();
                    icraft_core::run::set_server_state(icraft_core::run::ServerState::Idle);
                    log::info!("[run] *** all post-exit hooks complete -- ready ***");
                    result.map(|_| ())
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
                // Operator intent: the heartbeat must not restart it (also
                // cancels a pending auto-restart backoff).
                mark_operator_stop();
                log::info!("[lifecycle] Stop clicked (auto-escalates after 30s)");
                if let Err(e) = icraft_core::run::stop_with_escalation(30, 10) {
                    clear_stale_operator_stop();
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
                mark_operator_stop();
                log::info!("[lifecycle] Kill clicked");
                if let Err(e) = icraft_core::run::kill_active_server(false) {
                    clear_stale_operator_stop();
                    log::warn!("[lifecycle] kill failed: {e}");
                }
            }
            if ui.add(egui::Button::new("Force kill").min_size(egui::vec2(140.0, 28.0))).clicked() {
                // Last resort: SIGKILL / taskkill /F /T. Process dies
                // immediately. World saves NOT flushed -- chunks since
                // last autosave are lost. Use only when graceful Kill
                // also stalls.
                mark_operator_stop();
                log::warn!("[lifecycle] Force kill clicked -- worlds may not flush");
                if let Err(e) = icraft_core::run::kill_active_server(true) {
                    clear_stale_operator_stop();
                    log::warn!("[lifecycle] force kill failed: {e}");
                }
            }
            // Cycle = full stop -> self-update + sync -> start, single click.
            // Supervised run: flag cycle_requested and stop -- the supervise()
            // loop restarts it once the JVM has exited (or right away, if it is
            // sitting in an auto-restart backoff). Other task running: the old
            // path -- stop_with_escalation (Stop's 30s grace + 10s force-kill
            // watchdog), set pending_restart, and let update()'s task-finished
            // handler run spawn_cycle_restart. Nothing running: go now.
            if ui.add(egui::Button::new("Cycle").min_size(egui::vec2(140.0, 28.0))).clicked() {
                if SUPERVISOR.running.load(Ordering::SeqCst) {
                    // A manual Cycle re-arms a heartbeat that gave up.
                    SUPERVISOR.restarts.lock().unwrap().clear();
                    set_heartbeat_status("");
                    SUPERVISOR.cycle_requested.store(true, Ordering::SeqCst);
                    if SUPERVISOR.server_live.load(Ordering::SeqCst) {
                        log::info!("[cycle] step 1: stop server (escalates after 30s), then self-update + sync + start");
                        if let Err(e) = icraft_core::run::stop_with_escalation(30, 10) {
                            // No JVM yet (still in the sync/launch phase): it is
                            // already coming up fresh -- don't leave a stale flag
                            // that would turn a later Stop into a restart.
                            SUPERVISOR.cycle_requested.store(false, Ordering::SeqCst);
                            log::warn!("[cycle] {e} -- server is still starting (sync/launch phase); Cycle ignored");
                        }
                    } else {
                        log::info!("[cycle] auto-restart backoff in progress -- restarting now");
                    }
                } else if self.task_running() {
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
        // Heartbeat toggle (persisted). Applies to Serve (full) / Cycle runs.
        let mut auto_restart = SUPERVISOR.auto_restart.load(Ordering::SeqCst);
        if ui.checkbox(&mut auto_restart, "Auto-restart: run Cycle when the server crashes or stops answering (~5 min)")
            .on_hover_text("Off: a crash is logged and the Heartbeat badge turns red, but nothing restarts it. \
                            Stop / Kill / Force kill / a console `stop` / an in-game /stop are never restarted. \
                            Gives up after 3 auto-restarts in 30 min (crash loop) -- click Cycle to re-arm.")
            .changed()
        {
            SUPERVISOR.auto_restart.store(auto_restart, Ordering::SeqCst);
            log::info!("[heartbeat] auto-restart {}", if auto_restart { "ON" } else { "OFF" });
        }
        self.draw_boot_task(ui);

        ui.add_space(6.0);
        ui.label(egui::RichText::new(
            "World backups and the world-regeneration dry-run are on the Customizer tab."
        ).small().weak());

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
            // Not gated on `busy`: the push runs on logpush's own worker, so it
            // can be asked for while the server is up (it then mirrors the
            // logs as they are right now).
            if ui.add(egui::Button::new("Push crash logs").min_size(egui::vec2(140.0, 28.0))).clicked() {
                log::info!("[logs] Push crash logs clicked -- staging, then pushing in the background (see the Logs badge)");
                let c = cfg.clone();
                std::thread::spawn(move || {
                    icraft_core::logpush::stage_and_defer(&c, false);
                    icraft_core::logpush::release();
                });
            }
        });

        ui.add_space(8.0);
        ui.heading("GitHub auth");
        ui.label(egui::RichText::new(
            "PAT used by 'Push crash logs', Apply Self-Update, AND the repo sync (Cycle/Serve) -- saving one lifts the sync API off the 60/hr unauth limit (5000/hr), which prevents the intermittent 'API unreachable -> starts on old content' Cycle failure. Stored in %LOCALAPPDATA%\\icraft-launcher\\.icraft_token (gitignored). Needs read access to the IridescentCraft repo, and Contents: read and write on the PRIVATE IridescentCraft-logs repo (the log mirror)."
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
            // Plain text, not a spinner: an animated widget repaints on every
            // frame it is visible, and a task is running whenever the server
            // is. That kept one core busy around the clock on the server's
            // software renderer (see "Repaints").
            ui.label(egui::RichText::new("Task running...").weak());
        }
    }

    /// The "Start at boot" box (Server tab; also shown while viewing).
    fn draw_boot_task(&mut self, ui: &mut egui::Ui) {
        use icraft_core::autostart::{self as a, Registered};
        if self.preview.is_none() && matches!(*BOOT_TASK.lock().unwrap(), BootTask::Unknown) {
            refresh_boot_task(self.server_dir.clone());
        }
        let state = BOOT_TASK.lock().unwrap().clone();
        let (mut on, working) = match &state {
            BootTask::Known(Registered::Yes) => (true, false),
            BootTask::Working(on) => (*on, true),
            _ => (false, false),
        };
        let enabled = !working && self.preview.is_none();
        let resp = ui
            .add_enabled(
                enabled,
                egui::Checkbox::new(
                    &mut on,
                    "Start at boot: when Windows starts, start this launcher without its window and run Cycle (nobody has to log on; no password is stored)",
                ),
            )
            .on_hover_text(format!(
                "Registers the Task Scheduler task '{}' for this launcher and this folder: at every Windows start (after a minute) it runs \
                 icraft-gui.exe --boot as your account, with nobody logged on (S4U: no password stored, least privilege). \
                 A window opened later shows that boot instance and can take the server over. Untick to delete the task.",
                a::TASK_NAME
            ));
        if resp.changed() {
            set_boot_task(on, self.server_dir.clone());
        }
        let (text, color) = match &state {
            _ if self.preview.is_some() => ("(Task Scheduler is not read in a preview)".to_string(), BADGE_AMBER),
            BootTask::Unknown | BootTask::Working(_) => ("checking Task Scheduler...".to_string(), BADGE_AMBER),
            BootTask::Known(Registered::Yes) => (format!("on: the task '{}' starts this launcher at every Windows start", a::TASK_NAME), BADGE_GREEN),
            BootTask::Known(Registered::No) => (
                "off: nothing starts the launcher when Windows starts -- after a reboot the server stays down until someone logs on and starts it".to_string(),
                BADGE_AMBER,
            ),
            BootTask::Known(Registered::Differs(why)) => (
                format!("a task '{}' is there, but {why}: tick the box to replace it with this launcher's", a::TASK_NAME),
                BADGE_AMBER,
            ),
            BootTask::Failed(e) => (format!("Task Scheduler could not be read: {e}"), BADGE_RED),
        };
        ui.label(egui::RichText::new(text).small().color(color));
    }

    /// The badges row while another launcher runs the folder: what its status
    /// file says (it rewrites the file every 15 s).
    fn draw_viewer_badges(&self, ui: &mut egui::Ui) {
        let v = &self.viewer;
        ui.horizontal_wrapped(|ui| {
            let state = v.get("server_state");
            if state.is_empty() {
                badge(ui, "Server", false, "(no status file from the launcher that runs it)");
                return;
            }
            badge(ui, "Server", state == "Started", &format!("{state} -- {}", v.get("phase")));
            let written: u64 = v.get("written_unix").parse().unwrap_or(0);
            let age = unix_now().saturating_sub(written);
            if age > 180 {
                badge(ui, "Status", false, &format!("{} old: that launcher is closed or hung", icraft_core::instance::span(age)));
            }
            let hb = v.get("heartbeat");
            badge(ui, "Heartbeat", !hb.starts_with("GAVE UP") && !hb.starts_with("DOWN"), if hb.is_empty() { "armed" } else { hb });
            if !v.get("stuck").is_empty() {
                badge(ui, "Cycle", false, v.get("stuck"));
            }
            let who = match v.get("launcher_mode") {
                icraft_core::instance::MODE_BOOT => "the boot instance (no window)",
                icraft_core::instance::MODE_WINDOW => "a launcher window",
                _ => "another launcher",
            };
            badge_colored(
                ui,
                "Run by",
                BADGE_AMBER,
                &format!("{who}, pid {}, Windows session {}", v.get("launcher_pid"), v.get("session_id")),
            );
        });
    }

    /// The Server tab while another launcher runs the folder.
    fn draw_viewer(&mut self, ui: &mut egui::Ui, holder: Option<&icraft_core::instance::Holder>) {
        use icraft_core::autostart as a;
        ui.add_space(4.0);
        ui.heading("Another launcher runs this server");
        let who = holder.map_or("Another launcher".to_string(), |h| {
            let d = h.describe();
            let mut c = d.chars();
            c.next().map_or(d.clone(), |f| f.to_uppercase().collect::<String>() + c.as_str())
        });
        ui.label(format!(
            "{who} holds this server folder, so this window does not run the server: two launchers on one folder would \
             each sync files, restart the server and start a JVM on the same world."
        ));
        if holder.is_some_and(|h| h.is_boot()) {
            ui.label(egui::RichText::new(
                "The boot instance is what the Start-at-boot task started when Windows started. It runs the server exactly as \
                 this window would (the same Cycle, heartbeat, restart policy, backups and request files), without a window. \
                 Its log is below (logs\\launcher.log); the game's own log is logs\\latest.log.",
            ).small().weak());
        }
        ui.add_space(6.0);
        ui.horizontal_wrapped(|ui| {
            if ui.add(egui::Button::new("Cycle (ask it)").min_size(egui::vec2(140.0, 28.0))).clicked() {
                let body = format!("{} gui-viewer\n", unix_now());
                match std::fs::write(self.server_dir.join(CYCLE_REQUEST_FILE), body) {
                    Ok(()) => log::info!("[viewer] asked the launcher that runs the server for a Cycle (it answers within ~10 s)"),
                    Err(e) => log::warn!("[viewer] could not write the Cycle request: {e}"),
                }
                self.viewer.read_at = None;
            }
            if ui.add(egui::Button::new("Back up now (ask it)").min_size(egui::vec2(140.0, 28.0))).clicked() {
                match icraft_core::backup::write_request(&self.server_dir, "gui-viewer") {
                    Ok(()) => log::info!("[viewer] asked for a pinned backup (taken at once with the server down, else at the next Cycle)"),
                    Err(e) => log::warn!("[viewer] could not write the backup request: {e}"),
                }
            }
            let armed = self.viewer.armed_at.is_some_and(|t| t.elapsed() < Duration::from_secs(10));
            let waiting = TAKEOVER_ASKED.load(Ordering::SeqCst);
            let label = if waiting { "Waiting for it to let go..." } else if armed { "Click again to take over" } else { "Take over here" };
            if ui.add_enabled(!waiting, egui::Button::new(label).min_size(egui::vec2(180.0, 28.0))).clicked() {
                if armed {
                    self.viewer.armed_at = None;
                    match a::write_takeover_request(&self.server_dir, &format!("window pid {}", std::process::id()), unix_now()) {
                        Ok(()) => {
                            TAKEOVER_ASKED.store(true, Ordering::SeqCst);
                            log::info!("[viewer] asked the launcher that runs the server to let go: this window starts it once it has");
                        }
                        Err(e) => log::warn!("[viewer] could not write the takeover request: {e}"),
                    }
                    self.viewer.read_at = None;
                } else {
                    self.viewer.armed_at = Some(Instant::now());
                }
            }
        });
        ui.label(egui::RichText::new(
            "Take over here: the other launcher stops the server (a 60 s in-game countdown when players are on) and exits, then \
             this window syncs and starts it -- about five minutes down in all. Needed for the console, Stop and the Customizer. \
             Keep this window open until the server is back up: once it runs the server, closing this window or signing out \
             stops it, and nothing starts it again until the next Windows start (or run the task by hand: \
             schtasks /Run /TN \"IridescentCraft launcher at boot\").",
        ).small().weak());
        if !self.viewer.takeover_answer.is_empty() {
            ui.label(format!("Last answer to a takeover: {}", self.viewer.takeover_answer));
        }
        ui.add_space(8.0);
        self.draw_boot_task(ui);
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
        // While another launcher runs the folder: the tail of its
        // logs\launcher.log (lines with a time in front), not this window's.
        let viewing = matches!(role(), Role::Viewer(_));
        let total = if viewing { self.viewer.log.len() } else { self.log_lines.len() };
        egui::ScrollArea::vertical()
            .stick_to_bottom(true)
            .auto_shrink([false, false])
            .show_rows(ui, row_height, total, |ui, range| {
                for i in range {
                    // VecDeque random access is O(1) when both halves
                    // of the ring fit (always, for our sizes); .get
                    // is the safe lookup that returns Option.
                    let line = if viewing { self.viewer.log.get(i) } else { self.log_lines.get(i) };
                    let Some(line) = line else { continue };
                    let level = match line.as_bytes() {
                        // "2026-10-20 08:12:03 [ INFO] ..." from launcher.log
                        [_, _, _, _, b'-', ..] if line.len() > 20 && line.is_char_boundary(20) => &line[20..],
                        _ => line.as_str(),
                    };
                    let color = if level.starts_with("[ERROR")        { egui::Color32::from_rgb(244, 102, 102) }
                               else if level.starts_with("[ WARN")    { egui::Color32::from_rgb(244, 199, 102) }
                               else if level.starts_with("[ INFO")    { egui::Color32::from_rgb(180, 220, 255) }
                               else if level.starts_with("[DEBUG")    { egui::Color32::from_rgb(140, 140, 140) }
                               else                                   { egui::Color32::LIGHT_GRAY };
                    ui.colored_label(color, line);
                }
            });
    }
}

// =============================================================================
// helpers
// =============================================================================

const BADGE_GREEN: egui::Color32 = egui::Color32::from_rgb(120, 200, 140);
/// "Probably fine, unconfirmed" -- the Repo HEAD badge's stale colour.
const BADGE_AMBER: egui::Color32 = egui::Color32::from_rgb(220, 170, 60);
const BADGE_RED: egui::Color32 = egui::Color32::from_rgb(220, 140, 140);

fn badge(ui: &mut egui::Ui, label: &str, ok: bool, value: &str) {
    badge_colored(ui, label, if ok { BADGE_GREEN } else { BADGE_RED }, value);
}

fn badge_colored(ui: &mut egui::Ui, label: &str, color: egui::Color32, value: &str) {
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
    // A typed `stop` is operator intent -- the heartbeat must not restart it.
    let is_stop = line.trim_start_matches('/').eq_ignore_ascii_case("stop");
    if is_stop {
        mark_operator_stop();
    }
    log::info!("[console] >> {line}");
    if let Err(e) = icraft_core::run::send_console_line(line) {
        if is_stop {
            clear_stale_operator_stop();
        }
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
