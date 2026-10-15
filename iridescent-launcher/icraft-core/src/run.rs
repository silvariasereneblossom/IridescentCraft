//! Phase 4 — launch the Forge dedicated server with a hang watchdog.
//!
//! Equivalent to the `java @libraries/.../win_args.txt nogui ...` block
//! at the end of `iridescentserver.bat`, plus a watchdog thread that
//! polls `logs/latest.log` mtime to detect hangs, and (piped launches) a
//! watch on the game's own crash lines: see "A server thread that crashed".
//!
//! Two thresholds:
//!   - `boot_timeout`: max time without ANY log activity (catches
//!     stuck-during-init / never-creates-latest.log). Defaults to
//!     15 min. Boot legitimately produces log activity, so silence
//!     here is a real hang.
//!   - `idle_timeout`: max time without log activity once we've seen
//!     any output. **Defaults to 0 (disabled).** A quiet idle server
//!     with no players online produces no log lines for long
//!     stretches and would trip the old 15-min default. We now rely
//!     on JVM process-exit as the only reliable crash signal post-
//!     boot. Operators can pass a non-zero value to re-enable
//!     log-silence hang detection if they specifically want it.
//!
//! Stdio handling: stdout/stderr passes through to the parent. Stdin
//! is `piped()` and a forwarder thread copies bytes from the parent's
//! own stdin to the child. This preserves operator interactivity
//! (typing `stop`, `op username`, etc.) while also letting the
//! watchdog inject a newline into the child's stdin as a soft escalation
//! before the hard kill -- many "stuck during boot" hangs are actually
//! the JVM blocked on a stdout write because of QuickEdit / a pause
//! prompt deeper in the boot chain, and a single newline unblocks
//! them. (QuickEdit itself is also disabled at launcher startup via
//! `console::disable_quickedit_mode`, but the soft kick remains as a
//! belt-and-braces fallback for non-QuickEdit causes.)

use anyhow::{Context, Result};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::banner::launch_banner;
use crate::config::{ServerConfig, AIKAR_FLAGS};

#[derive(Debug, Clone, Copy)]
pub struct WatchdogOptions {
    /// Time-since-last-log-line cap until the boot marker is seen.
    /// Defaults to 15 minutes -- modpack first start can legitimately
    /// take 5-10 min for world / mod init.
    pub boot_timeout: Duration,
    /// Time-since-last-log-line cap once running. Set high enough
    /// that a quiet idle server doesn't trip it. 0 disables.
    pub idle_timeout: Duration,
    /// How often the watchdog samples log mtime.
    pub poll_interval: Duration,
}

impl Default for WatchdogOptions {
    fn default() -> Self {
        Self {
            boot_timeout: Duration::from_secs(15 * 60),
            // idle_timeout disabled by default: an idle server with no
            // players legitimately produces no log activity for 15+ min
            // at a time, and the old default kept killing healthy idle
            // servers thinking they were hung. JVM process-exit is our
            // only reliable crash signal; trust it. Callers (e.g. CLI
            // operators) can opt back in by passing a non-zero value.
            idle_timeout: Duration::ZERO,
            poll_interval: Duration::from_secs(10),
        }
    }
}

impl WatchdogOptions {
    pub fn disabled() -> Self {
        Self {
            boot_timeout: Duration::ZERO,
            idle_timeout: Duration::ZERO,
            poll_interval: Duration::from_secs(10),
        }
    }
}

pub fn launch_server(cfg: &ServerConfig, _headless: bool) -> Result<i32> {
    launch_server_inner(cfg, WatchdogOptions::default(), false)
}

/// Same as [`launch_server`] but pipes stdout/stderr through
/// `log::info!` so the GUI's log pane gets server output line by
/// line. Used by the GUI's "Run only" button. CLI keeps inherit.
pub fn launch_server_piped(cfg: &ServerConfig, _headless: bool) -> Result<i32> {
    launch_server_inner(cfg, WatchdogOptions::default(), true)
}

pub fn launch_server_watched(cfg: &ServerConfig, opts: WatchdogOptions) -> Result<i32> {
    launch_server_inner(cfg, opts, false)
}

/// Same as [`launch_server_watched`] but pipes stdout/stderr through
/// `log::info!`. Used by the GUI's "Serve (full)" button so the
/// server's Forge log streams into the in-app log pane and the
/// operator never has to see a separate cmd window.
pub fn launch_server_watched_piped(cfg: &ServerConfig, opts: WatchdogOptions) -> Result<i32> {
    launch_server_inner(cfg, opts, true)
}

fn launch_server_inner(cfg: &ServerConfig, opts: WatchdogOptions, pipe_output: bool) -> Result<i32> {
    launch_banner();

    let argfile = pick_argfile(cfg)?;
    log::info!("[run] argfile: {}", argfile.display());

    let mut cmd = Command::new("java");
    cmd.current_dir(&cfg.server_dir);
    // A GitHub token set in the launcher's own environment is the launcher's:
    // the JVM (every mod, every server script) must not inherit it.
    crate::subprocess::scrub_token_env(&mut cmd);
    for flag in AIKAR_FLAGS { cmd.arg(flag); }
    // Timestamped heap-dump target -- see prepare_heap_dump_path. Must come
    // before the @argfile so it lands in the JVM's own option list.
    if let Some(hprof) = prepare_heap_dump_path(cfg) {
        log::info!("[run] OOM heap dump target: {}", hprof.display());
        cmd.arg(format!("-XX:HeapDumpPath={}", hprof.display()));
    }
    cmd.arg(format!("@{}", argfile.display()));
    cmd.arg("nogui");

    // Stdin always piped so the watchdog (soft kick) and the GUI's
    // console-input panel can write into Java. Stdout/stderr piping
    // is per-caller: GUI pipes -> log::info!, CLI inherits so operator
    // sees plain Forge output in their terminal.
    cmd.stdin(Stdio::piped());
    if pipe_output {
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
        // On Windows, when launched from a GUI subsystem app (no
        // console attached), spawning a console application like
        // java.exe pops a black cmd window for the duration of the
        // child. CREATE_NO_WINDOW suppresses it -- safe because we
        // pipe stdio and don't need an attached console anywhere.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
    } else {
        cmd.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    }

    log::info!("[run] launching: java {} ...", AIKAR_FLAGS.join(" "));
    // A requested world backup may be zipping the world right now: wait for
    // it, and keep backups out until the PID is published so none can start in
    // the gap (see backup.rs).
    let backup_guard = crate::backup::launch_guard();
    // A world regeneration that was cut off half-way leaves a marker file: no
    // JVM on a world that is half reset (regen/exec.rs). The run itself holds
    // the gate just taken, so a launch never meets one in flight; this is for
    // the launcher that died in the middle of one. Without the marker it is
    // one stat call and nothing else.
    if let Err(why) = crate::regen::exec::start_guard(cfg) {
        anyhow::bail!("the server was not started: {why}");
    }
    // This server's own config values (Server Customizer): put them back into
    // the files a sync may just have rewritten, before the JVM reads them. Every
    // entry point comes through here, so "Run only" is covered too. Nothing
    // happens without `.icraft_config_overrides.json`, and it never fails the
    // launch (see overrides.rs). Inside the gate, so the tab cannot be writing
    // the same files at the same moment.
    crate::overrides::apply_at_start(cfg);
    // The one thing that does stop a launch (operator ruling 2026-10-11): a
    // whitelist or online mode this server switched ON has to be in
    // server.properties now, or no JVM is started. The pack's file has both
    // off, so a put-back that failed would open a public server. The caller
    // sees a launch failure; the heartbeat's auto-Cycles retry the put-back.
    if let Err(why) = crate::overrides::start_guard(cfg) {
        anyhow::bail!("the server was not started: {why}");
    }
    let mut child = cmd.spawn().context("spawning java")?;
    *ACTIVE_CHILD_PID.lock().unwrap() = Some(child.id());
    drop(backup_guard);
    set_server_state(ServerState::Starting);

    // What the game's own fatal path prints during this run (see "A server
    // thread that crashed" below). Only the piped launches read the output.
    let fatal: Arc<Mutex<Fatal>> = Arc::new(Mutex::new(Fatal::default()));
    let run_over = Arc::new(AtomicBool::new(false));
    let killed_after_fatal = Arc::new(AtomicBool::new(false));
    if pipe_output {
        if let Some(stdout) = child.stdout.take() {
            spawn_log_pump(stdout, Arc::clone(&fatal));
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_pump(stderr, Arc::clone(&fatal));
        }
        let _ = spawn_fatal_watch(child.id(), Arc::clone(&fatal), FATAL_GRACES, Arc::clone(&run_over), Arc::clone(&killed_after_fatal));
    }

    // Shared handle to the child's stdin -- the operator-stdin
    // forwarder thread, the watchdog soft-kick path, and the
    // GUI console-input panel all write through this. Wrapped in
    // Arc<Mutex<Option<...>>> so any side can release it on EOF
    // without invalidating the others. A clone is also published in
    // the global ACTIVE_HANDLE for the duration of this run so the
    // GUI's "Stop" / "op" / etc. buttons can find it.
    let child_stdin: Arc<Mutex<Option<ChildStdin>>> =
        Arc::new(Mutex::new(child.stdin.take()));
    *ACTIVE_HANDLE.lock().unwrap() = Some(Arc::clone(&child_stdin));
    spawn_stdin_forwarder(Arc::clone(&child_stdin));

    let watchdog_active = opts.boot_timeout > Duration::ZERO || opts.idle_timeout > Duration::ZERO;
    let kill_signal = Arc::new(AtomicBool::new(false));
    let watchdog_handle = if watchdog_active {
        Some(spawn_watchdog(
            cfg.logs_dir().join("latest.log"),
            opts,
            child.id(),
            kill_signal.clone(),
            Arc::clone(&child_stdin),
        ))
    } else {
        log::info!("[run] watchdog disabled");
        None
    };

    let exit_status = child.wait().context("waiting for java")?;
    run_over.store(true, Ordering::SeqCst);
    let jvm_code = exit_status.code().unwrap_or(-1);
    let killed_by_watchdog = kill_signal.load(Ordering::Relaxed);
    set_server_state(ServerState::PostExit);
    log::info!("[run] *** Java process exited with code {jvm_code}; running post-exit hooks ***");
    let seen = *fatal.lock().unwrap();
    let code = reported_exit_code(jvm_code, &seen, killed_after_fatal.load(Ordering::SeqCst));
    if code != jvm_code {
        log::warn!(
            "[run] !!! the server thread crashed during this run (the game's own crash lines{}): \
             reported as exit code {code}, not {jvm_code}, so it is handled as the crash it is",
            if seen.stop_failed_at.is_some() { ", and its stop failed" } else { "" }
        );
    }

    // Tell the watchdog we're done so it doesn't try to kill an already-dead PID.
    if let Some(h) = watchdog_handle {
        kill_signal.store(true, Ordering::Relaxed);
        let _ = h.join();
    }
    // Drop the globals -- subsequent send_console_line / kill_active_server
    // calls will see "no server running" until the next launch. State
    // stays at PostExit so the GUI badge reflects "post-exit hooks
    // still running"; the caller resets to Idle once they are done.
    // They are short and local: the crash capture and the log staging.
    // The log PUSH is not one of them (logpush.rs) -- it has its own
    // badge and never holds this state.
    *ACTIVE_HANDLE.lock().unwrap() = None;
    *ACTIVE_CHILD_PID.lock().unwrap() = None;

    if killed_by_watchdog {
        log::warn!("[run] server killed by watchdog (hang detected)");
        return Ok(if code == 0 { 137 } else { code });
    }
    log::info!("[run] server exited with code {}", code);
    Ok(code)
}

fn spawn_watchdog(
    log_path: PathBuf,
    opts: WatchdogOptions,
    child_pid: u32,
    kill_signal: Arc<AtomicBool>,
    child_stdin: Arc<Mutex<Option<ChildStdin>>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let started = Instant::now();
        let mut last_seen_size: u64 = file_size(&log_path);
        let mut last_seen_at: Instant = Instant::now();
        // "Booted" once we've seen ANY non-zero log content. Before
        // that we apply boot_timeout; after, idle_timeout.
        let mut booted = last_seen_size > 0;
        // True after we've written a newline to child stdin in
        // response to the current stall. Reset when log activity
        // resumes. Forces one poll_interval grace before the kill.
        let mut soft_kicked = false;

        loop {
            thread::sleep(opts.poll_interval);
            if kill_signal.load(Ordering::Relaxed) { return; }

            let cur_size = file_size(&log_path);
            if cur_size > last_seen_size {
                last_seen_size = cur_size;
                last_seen_at = Instant::now();
                if !booted {
                    booted = true;
                    log::info!("[watchdog] boot detected ({} bytes in latest.log)", cur_size);
                }
                if soft_kicked {
                    log::info!("[watchdog] soft kick worked -- log activity resumed");
                    soft_kicked = false;
                }
                continue;
            }

            let silence = last_seen_at.elapsed();
            let limit = if booted { opts.idle_timeout } else { opts.boot_timeout };
            if limit.is_zero() { continue; }
            if silence < limit { continue; }

            let phase = if booted { "idle" } else { "boot" };

            if !soft_kicked {
                // First time hitting the timeout: try a newline before
                // the kill. Resets the silence clock so we wait one
                // more poll_interval (typically 10s) for activity to
                // resume; if nothing happens, the next iteration takes
                // the kill branch.
                log::warn!(
                    "[watchdog] {phase} timeout reached after {}s -- writing newline to stdin (soft kick)",
                    silence.as_secs()
                );
                if let Some(stdin) = child_stdin.lock().unwrap().as_mut() {
                    let _ = stdin.write_all(NEWLINE);
                    let _ = stdin.flush();
                }
                soft_kicked = true;
                last_seen_at = Instant::now();
                continue;
            }

            // Already kicked -- still stalled. Hard kill.
            log::error!(
                "[watchdog] {phase} timeout exceeded after soft kick ({}s silent, since launch={}s) -- killing pid {}",
                silence.as_secs(), started.elapsed().as_secs(), child_pid
            );
            if let Err(e) = kill_pid(child_pid) {
                log::warn!("[watchdog] kill failed: {e}");
            }
            kill_signal.store(true, Ordering::Relaxed);
            return;
        }
    })
}

#[cfg(windows)]
const NEWLINE: &[u8] = b"\r\n";
#[cfg(not(windows))]
const NEWLINE: &[u8] = b"\n";

// =============================================================================
// A server thread that crashed: what the exit code does not say
// =============================================================================
//
// Measured 2026-10-15 in the rig (operator ruling 19, the End's old feature
// order cycle re-created by a test datapack and an End chunk forced): the tick
// loop crashes, the game's own stop throws ("Exception stopping the server"),
// and nothing is left that runs the server. What the JVM does next depends on
// the threads still in it:
//   - a bare Forge server: its last non-daemon threads (vanilla's IO workers)
//     time out and the JVM exits with code 0, a minute after the crash. The
//     heartbeat took that for a clean stop: "not restarting", and the status
//     file showed nothing wrong. The server stayed down.
//   - the full pack: other non-daemon threads keep the JVM alive for good, with
//     no server thread (the boot rig on 2026-10-13; the box for a week from
//     2026-09-04). Only the listener probe could see it, about five minutes
//     after the crash, and only once the server had reached Started.
// The game's fatal path prints lines nothing else prints (`fatal_line`), so the
// log pump watches for them:
//   - the server thread crashed: an exit after this is a crash whatever its
//     code (the crash log is written, the debug logs mirrored, the heartbeat
//     restarts it);
//   - its stop failed: nothing is left to save, so a JVM still alive
//     `FatalGraces::stop_failed` later is killed;
//   - a crash whose stop neither fails nor ends: killed `FatalGraces::crashed`
//     after the crash. A stop that saves the world ends well inside it.

/// What the log pump saw of the game's fatal path during one run.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Fatal {
    pub crashed_at: Option<Instant>,
    pub stop_failed_at: Option<Instant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FatalLine {
    /// `MinecraftServer.runServer` caught what the tick loop threw.
    Crashed,
    /// The stop that follows threw too.
    StopFailed,
}

/// How long a JVM may live on after the fatal lines before it is killed.
#[derive(Debug, Clone, Copy)]
pub(crate) struct FatalGraces {
    pub stop_failed: Duration,
    pub crashed: Duration,
}

const FATAL_GRACES: FatalGraces = FatalGraces {
    stop_failed: Duration::from_secs(30),
    crashed: Duration::from_secs(10 * 60),
};

/// `[time] [thread/LEVEL] [logger]: message`, split at the line's OWN
/// brackets, so text quoted inside a message (a chat line) is never taken for
/// the line's thread or logger.
fn log_parts(line: &str) -> Option<(&str, &str, &str)> {
    let (_, rest) = line.strip_prefix('[')?.split_once("] [")?;
    let (thread, rest) = rest.split_once("] [")?;
    let (logger, message) = rest.split_once("]: ")?;
    Some((thread, logger, message))
}

/// A line of the game's own fatal path, as the server's console prints it
/// (`[time] [Server thread/ERROR] [minecraft/MinecraftServer]: ...`; the log
/// file's `net.minecraft.server.MinecraftServer/` form is read too). Only an
/// ERROR line of the server thread from `MinecraftServer` itself counts: no
/// chat line, no mod's logger and no other thread prints one.
fn fatal_line(line: &str) -> Option<FatalLine> {
    let (thread, logger, message) = log_parts(line)?;
    if thread != "Server thread/ERROR" || !logger.trim_end_matches('/').ends_with("MinecraftServer") {
        return None;
    }
    if message.starts_with("Encountered an unexpected exception")
        || message.starts_with("This crash report has been saved to: ")
        || message.starts_with("We were unable to save this crash report to disk.")
    {
        Some(FatalLine::Crashed)
    } else if message.starts_with("Exception stopping the server") {
        Some(FatalLine::StopFailed)
    } else {
        None
    }
}

fn note_fatal(fatal: &Mutex<Fatal>, line: &str) {
    let Some(what) = fatal_line(line) else { return };
    let mut f = fatal.lock().unwrap();
    let slot = match what {
        FatalLine::Crashed => &mut f.crashed_at,
        FatalLine::StopFailed => &mut f.stop_failed_at,
    };
    if slot.is_none() {
        *slot = Some(Instant::now());
        match what {
            FatalLine::Crashed => log::error!("[run] !!! the server thread crashed (the game's crash lines): the JVM should exit once its stop is done"),
            FatalLine::StopFailed => log::error!("[run] !!! the server's own stop failed: nothing is left to save, and nothing runs the server any more"),
        }
    }
}

/// Why a JVM that is still alive at `now` must go, if it must.
fn overdue(f: &Fatal, graces: FatalGraces, now: Instant) -> Option<String> {
    if let Some(at) = f.stop_failed_at {
        let lived = now.saturating_duration_since(at);
        if lived >= graces.stop_failed {
            return Some(format!("its stop failed {} s ago and it has not exited", lived.as_secs()));
        }
    }
    if let Some(at) = f.crashed_at {
        let lived = now.saturating_duration_since(at);
        if lived >= graces.crashed {
            return Some(format!("its server thread crashed {} s ago and the stop has not ended", lived.as_secs()));
        }
    }
    None
}

/// The exit code a run reports. A JVM that exits 0 after the server thread
/// crashed (or after its stop failed) did not stop cleanly: 1, so every caller
/// handles it as the crash it is.
fn reported_exit_code(jvm_code: i32, f: &Fatal, killed_after_fatal: bool) -> i32 {
    let fatal = killed_after_fatal || f.crashed_at.is_some() || f.stop_failed_at.is_some();
    if fatal && jvm_code == 0 {
        1
    } else {
        jvm_code
    }
}

/// Kill the JVM `pid` once [`overdue`] says so, unless the run is over first.
/// Detached; one per piped launch.
fn spawn_fatal_watch(pid: u32, fatal: Arc<Mutex<Fatal>>, graces: FatalGraces, run_over: Arc<AtomicBool>, killed: Arc<AtomicBool>) -> thread::JoinHandle<()> {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        if run_over.load(Ordering::SeqCst) {
            return;
        }
        let seen = *fatal.lock().unwrap();
        let Some(why) = overdue(&seen, graces, Instant::now()) else { continue };
        log::error!("[run] !!! a JVM with no server thread: {why}. Killing pid {pid}, so the restart path runs (crash log, logs, heartbeat).");
        killed.store(true, Ordering::SeqCst);
        match kill_pid_force(pid) {
            Ok(()) => return,
            Err(e) => {
                log::warn!("[run] kill of pid {pid} failed: {e} (tried again in 30 s)");
                thread::sleep(Duration::from_secs(30));
            }
        }
    })
}

/// Outer Mutex protects the slot itself; inner Arc<Mutex<...>> is
/// shared with the forwarder + watchdog. Set on each launch_server_watched
/// call, cleared on exit. `send_console_line` clones the inner Arc and
/// drops the outer guard before locking the inner mutex, so console
/// writes don't block the launch/exit machinery.
static ACTIVE_HANDLE: Mutex<Option<Arc<Mutex<Option<ChildStdin>>>>> =
    Mutex::new(None);

/// PID of the running Java child, populated by launch_server_inner
/// at spawn and cleared at exit. Used by kill_active_server so the
/// GUI's Kill / Force kill buttons can target the correct process
/// without holding a Child reference (Child is owned exclusively by
/// the worker thread blocked on child.wait()).
static ACTIVE_CHILD_PID: Mutex<Option<u32>> = Mutex::new(None);

/// A JVM launched by this process is alive (from spawn until it has exited).
pub fn jvm_active() -> bool {
    ACTIVE_CHILD_PID.lock().unwrap().is_some()
}

/// Coarse-grained server lifecycle state, derived from key markers in
/// the JVM's piped log output. The GUI badge reads this to show
/// "Starting / Started / Stopping / Post-exit / Idle" without the
/// operator having to scan the log pane themselves.
///
/// Starting -> Started transition fires when Forge prints
/// `Done (Xs)! For help, type "help"` -- the canonical "server is now
/// listening for connections" marker.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerState {
    Idle,
    Starting,
    /// Server has finished boot and is accepting connections.
    /// Triggered by the Forge "Done (X)!" log line. Equivalent to
    /// "the JVM is listening on the port for player connections."
    Started,
    Stopping,
    PostExit,
}

static SERVER_STATE: Mutex<ServerState> = Mutex::new(ServerState::Idle);

pub fn server_state() -> ServerState {
    *SERVER_STATE.lock().unwrap()
}

pub fn set_server_state(s: ServerState) {
    let mut g = SERVER_STATE.lock().unwrap();
    if *g != s {
        log::info!("[run] *** server state: {:?} -> {:?} ***", *g, s);
        *g = s;
        // The uptime clock runs only while Started, so every launch -- an
        // operator Cycle, a policy restart, a heartbeat crash recovery --
        // starts it from zero.
        *STARTED_AT.lock().unwrap() = if s == ServerState::Started {
            Some((Instant::now(), chrono::Local::now()))
        } else {
            None
        };
    }
}

/// When the running server reached `Started` (its "Done" line): the monotonic
/// instant uptime is measured from, plus the wall-clock time for logs. `None`
/// whenever the server is not fully up.
static STARTED_AT: Mutex<Option<(Instant, chrono::DateTime<chrono::Local>)>> = Mutex::new(None);

pub fn started_at() -> Option<(Instant, chrono::DateTime<chrono::Local>)> {
    *STARTED_AT.lock().unwrap()
}

/// Newest `list` reply seen in the server's output: (when, players online).
static LAST_LIST_REPLY: Mutex<Option<(Instant, u32)>> = Mutex::new(None);

/// Players online, from a vanilla `list` reply:
/// `[..] [Server thread/INFO] [..]: There are 2 of a max of 20 players online: a, b`.
/// Anchored on the logger prefix's `]: ` so a chat line quoting the phrase
/// (`]: <name> There are ...`) can't pass for one.
fn parse_list_reply(line: &str) -> Option<u32> {
    const LEAD: &str = "]: There are ";
    let rest = &line[line.find(LEAD)? + LEAD.len()..];
    let (count, tail) = rest.split_once(' ')?;
    if !tail.starts_with("of a max of ") {
        return None;
    }
    count.parse().ok()
}

/// Ask the running server how many players are online: sends `list` and waits
/// for the reply to come back through the log pump (so piped launches only --
/// the GUI). `None` = no server, or no reply within `timeout` (a stalled tick
/// loop, a reworded reply). Callers must read `None` as "unknown", never as
/// "empty".
pub fn query_player_count(timeout: Duration) -> Option<u32> {
    let asked = Instant::now();
    send_console_line("list").ok()?;
    loop {
        if let Some((at, players)) = *LAST_LIST_REPLY.lock().unwrap() {
            if at >= asked {
                return Some(players);
            }
        }
        if asked.elapsed() >= timeout {
            return None;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

/// Send a termination signal to the running server, bypassing the
/// "stop" stdin command (which a hung JVM may not process). When
/// `force` is false, sends a graceful signal -- SIGTERM on Unix,
/// stdin-stop-then-taskkill /F on Windows. When `force` is true,
/// SIGKILL / taskkill /F /T immediately; world saves are LOST but
/// the process dies right away, useful for truly stuck servers.
///
/// **Windows graceful kill caveat**: plain `taskkill /T` (without
/// `/F`) sends `WM_CLOSE` to the process's top-level windows. Java
/// children spawned with `CREATE_NO_WINDOW` (which the GUI launcher
/// does, to avoid flashing a console) have NO window, so `WM_CLOSE`
/// is delivered nowhere and the call is a silent no-op. The JVM
/// just keeps running. To actually terminate a headless Java child
/// on Windows, the only mechanism is `TerminateProcess` (i.e.
/// `taskkill /F`), which skips shutdown hooks. So Windows graceful
/// kill writes `stop` to stdin first (in case the JVM is still
/// responsive enough to do its own clean shutdown), waits a short
/// grace period, then falls through to `taskkill /F` if it's still
/// alive. Best effort -- there's no clean middle ground.
///
/// Returns Err("no server running") when no Java child is active.
pub fn kill_active_server(force: bool) -> Result<()> {
    let pid = ACTIVE_CHILD_PID.lock().unwrap()
        .ok_or_else(|| anyhow::anyhow!("no server running"))?;
    if force {
        log::warn!("[run] FORCE killing pid {pid} (worlds may not flush)");
        kill_pid_force(pid)
            .map_err(|e| anyhow::anyhow!("force kill failed: {e}"))?;
    } else {
        log::info!("[run] sending graceful kill to pid {pid}");
        kill_pid(pid)
            .map_err(|e| anyhow::anyhow!("graceful kill failed: {e}"))?;
    }
    Ok(())
}

/// Send `stop` to the running server's stdin, then spawn a watchdog
/// thread that escalates to graceful kill (after `grace_secs`) and
/// finally to force kill (after another `force_secs`) if the server
/// hasn't exited. The watchdog captures the PID at start time and
/// aborts on PID change so a subsequent server start isn't killed
/// by a stale escalation timer.
///
/// Returns Err if no server is running or the stdin write fails.
/// The watchdog runs detached -- caller doesn't need to wait on it.
pub fn stop_with_escalation(grace_secs: u64, force_secs: u64) -> Result<()> {
    let pid = ACTIVE_CHILD_PID.lock().unwrap()
        .ok_or_else(|| anyhow::anyhow!("no server running"))?;

    log::info!("[run] sending 'stop' to server pid {pid} (escalates after {grace_secs}s)");
    if let Err(e) = send_console_line("stop") {
        log::warn!("[run] stop via stdin failed ({e}); skipping ahead to graceful kill");
        // Even with stdin broken we still want the watchdog to run --
        // the PID is alive, we just have no clean shutdown channel.
    }

    thread::spawn(move || {
        // Phase 1: poll for clean exit during the grace period. If
        // the server exits cleanly (ACTIVE_CHILD_PID cleared), we're
        // done -- no kill needed.
        let waited = wait_for_exit(pid, Duration::from_secs(grace_secs));
        if waited {
            log::info!("[run] server exited cleanly during stop grace ({pid})");
            return;
        }

        // Phase 2: graceful kill. On Unix that's SIGTERM (shutdown
        // hooks fire). On Windows it's stdin-stop + taskkill /F
        // (the only thing that actually terminates headless Java).
        log::warn!("[run] server still alive after {grace_secs}s 'stop' grace -- sending graceful kill");
        if let Err(e) = kill_active_server(false) {
            log::warn!("[run] graceful kill returned err: {e}");
        }

        // Phase 3: poll for exit during force grace, then force kill.
        let waited = wait_for_exit(pid, Duration::from_secs(force_secs));
        if waited {
            log::info!("[run] server exited after graceful kill ({pid})");
            return;
        }
        log::warn!("[run] still alive after graceful kill -- escalating to force kill");
        if let Err(e) = kill_active_server(true) {
            log::warn!("[run] force kill returned err: {e}");
        }
    });

    Ok(())
}

/// Poll `ACTIVE_CHILD_PID` until it differs from `original_pid` or
/// `timeout` elapses. Returns true if the original process is no
/// longer the active one (cleanly exited or replaced by a new run).
/// Returns false on timeout.
///
/// 200ms poll cadence -- responsive enough for a 30s grace window
/// without burning CPU.
fn wait_for_exit(original_pid: u32, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        let now_pid = *ACTIVE_CHILD_PID.lock().unwrap();
        if now_pid != Some(original_pid) {
            return true; // exited or new run started
        }
        if Instant::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

#[cfg(unix)]
fn kill_pid_force(pid: u32) -> std::io::Result<()> {
    use std::process::Command;
    Command::new("kill").args(["-9", &pid.to_string()]).status()?;
    Ok(())
}

#[cfg(windows)]
fn kill_pid_force(pid: u32) -> std::io::Result<()> {
    use std::process::Command;
    Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string(), "/T"])
        .status()?;
    Ok(())
}

/// Write a single command line into the running server's stdin, with
/// a platform-appropriate line ending appended. Used by the GUI
/// "Stop" / "op" / "ban" / etc. buttons and the free-form command
/// input. Returns Err if no server is running or the stdin handle
/// has been closed.
pub fn send_console_line(line: &str) -> Result<()> {
    let arc = {
        let outer = ACTIVE_HANDLE.lock().unwrap();
        outer.as_ref()
            .ok_or_else(|| anyhow::anyhow!("no server running"))?
            .clone()
    };
    let mut guard = arc.lock().unwrap();
    let stdin = guard.as_mut()
        .ok_or_else(|| anyhow::anyhow!("server stdin already closed"))?;
    let trimmed = line.trim_end_matches(['\r', '\n']);
    stdin.write_all(trimmed.as_bytes())?;
    stdin.write_all(NEWLINE)?;
    stdin.flush()?;
    Ok(())
}

/// Pump a stream (stdout or stderr from Java) line-by-line into the
/// log so the GUI pane shows server output. Detached daemon thread,
/// exits silently on EOF or read error. Watches each line for
/// lifecycle markers (server up/down) and operational events
/// (player join/leave, lag warnings, error/fatal) and emits a
/// prominent tagged log line for each so they stand out from
/// the line-by-line stream of normal log4j chatter.
///
/// **Encoding**: reads raw bytes via `read_until(b'\n')` and decodes
/// with `from_utf8_lossy`. The earlier `BufReader::lines()` impl
/// errored with `InvalidData` on the first non-UTF-8 byte and
/// `map_while(Result::ok)` silently terminated the thread, which is
/// what made the GUI log pane stop at "Found plugin source kubejs"
/// (KubeJS's plugin scan emits lines with high-byte chars in file
/// paths / mod names; on Windows the JVM writes stdout in the system
/// code page, typically cp1252). Lossy decode replaces invalid bytes
/// with U+FFFD instead of killing the pump.
fn spawn_log_pump<R: std::io::Read + Send + 'static>(reader: R, fatal: Arc<Mutex<Fatal>>) {
    use std::io::BufRead;
    thread::spawn(move || {
        let mut reader = std::io::BufReader::new(reader);
        let mut buf: Vec<u8> = Vec::with_capacity(4096);
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break, // clean EOF
                Ok(_) => {}
                Err(_) => break, // hard I/O failure
            }
            // Strip trailing CR/LF so log lines render cleanly.
            while matches!(buf.last(), Some(&b'\n') | Some(&b'\r')) {
                buf.pop();
            }
            let line: String = String::from_utf8_lossy(&buf).into_owned();

            // Lifecycle state transitions
            if line.contains("Done (") && line.contains("For help") {
                set_server_state(ServerState::Started);
            } else if line.contains("Stopping the server") {
                set_server_state(ServerState::Stopping);
            } else if let Some(players) = parse_list_reply(&line) {
                *LAST_LIST_REPLY.lock().unwrap() = Some((Instant::now(), players));
            }
            note_fatal(&fatal, &line);

            // Operational event highlights -- player session + lag
            // warnings get an extra prominent log line above the
            // raw [server] one so the operator can find them in
            // the log pane without scrolling through boot spam.
            if line.contains("joined the game") {
                log::info!("[event] >> player joined: {}", extract_player(&line, "joined the game"));
            } else if line.contains("left the game") {
                log::info!("[event] << player left:   {}", extract_player(&line, "left the game"));
            } else if line.contains("logged in with entity id") {
                log::info!("[event] >> player login: {line}");
            } else if line.contains("lost connection: ") {
                log::info!("[event] << disconnect: {line}");
            } else if line.contains("Can't keep up!") || line.contains("Is the server overloaded") {
                log::warn!("[event] LAG: {line}");
            } else if line.contains("Running ") && line.contains("ms or ") && line.contains("ticks behind") {
                log::warn!("[event] LAG: {line}");
            }

            // Surface log4j ERROR / WARN lines at the matching log
            // level so they're highlighted in the GUI.
            if line.contains("/ERROR]") || line.contains("/FATAL]") {
                log::error!("[server] {line}");
            } else if line.contains("/WARN]") {
                log::warn!("[server] {line}");
            } else {
                log::info!("[server] {line}");
            }
        }
    });
}

/// Extract a player name from a Forge log line of the form
/// `... <username> joined the game` (or `left the game`). Returns
/// the substring between the previous `]: ` and the marker. Falls
/// back to the full line if the pattern doesn't match.
fn extract_player(line: &str, marker: &str) -> String {
    if let Some(idx) = line.find(marker) {
        let before = &line[..idx];
        if let Some(prefix_end) = before.rfind("]: ") {
            return before[prefix_end + 3..].trim().to_string();
        }
    }
    line.to_string()
}

/// Forward bytes from the parent's stdin to the child's stdin so
/// operator commands (`stop`, `op user`, ...) reach the Forge server.
/// Detached daemon thread -- we don't join it. On EOF (parent stdin
/// closed) or any write error (child stdin closed), the thread exits
/// silently; the child stdin handle is dropped so the watchdog's
/// future writes also no-op gracefully.
fn spawn_stdin_forwarder(child_stdin: Arc<Mutex<Option<ChildStdin>>>) {
    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        let stdin = std::io::stdin();
        let mut handle = stdin.lock();
        loop {
            match handle.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let mut guard = child_stdin.lock().unwrap();
                    let Some(stdin_w) = guard.as_mut() else { break; };
                    if stdin_w.write_all(&buf[..n]).is_err() { *guard = None; break; }
                    let _ = stdin_w.flush();
                }
                Err(_) => break,
            }
        }
    });
}

fn file_size(p: &std::path::Path) -> u64 {
    std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

#[cfg(unix)]
fn kill_pid(pid: u32) -> std::io::Result<()> {
    // Send SIGTERM first; the JVM has its shutdown hooks (Forge calls
    // server.stopServer() on signal) and can take ~30s to flush worlds.
    // If we sent SIGKILL we'd lose unsaved chunks.
    use std::process::Command;
    Command::new("kill").arg(pid.to_string()).status()?;
    Ok(())
}

#[cfg(windows)]
fn kill_pid(pid: u32) -> std::io::Result<()> {
    // Plain `taskkill /T` (no /F) sends WM_CLOSE to the process's
    // top-level windows. Headless Java children (spawned with
    // CREATE_NO_WINDOW by the GUI launcher) have no window, so WM_CLOSE
    // is delivered nowhere and the call is a silent no-op -- the JVM
    // keeps running. Earlier impl assumed Unix-style "graceful kill"
    // semantics existed on Windows for headless processes; they don't.
    //
    // Best-effort graceful path: write `stop` to stdin in case the
    // JVM is still responsive (it'll run shutdown hooks, flush worlds,
    // exit cleanly), wait a short grace, then fall through to /F.
    // /F skips shutdown hooks but at least the process actually dies.
    use std::process::Command;
    if let Err(e) = send_console_line("stop") {
        log::debug!("[run] stdin stop failed during graceful kill: {e}");
    }
    // 5s grace for stdin path to take effect. If the JVM is responsive
    // it'll start shutting down within this window; if not, /F follows.
    thread::sleep(Duration::from_secs(5));
    // If the process already exited cleanly during the grace, skip /F.
    if !ACTIVE_CHILD_PID.lock().unwrap().map(|p| p == pid).unwrap_or(false) {
        return Ok(());
    }
    log::info!("[run] graceful kill grace expired, escalating to taskkill /F /T on pid {pid}");
    Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string(), "/T"])
        .status()?;
    Ok(())
}

/// Number of previous heap dumps kept at launch. Each is roughly heap-sized
/// (`-Xmx10G`), so this is a disk-space cap, not a history. The dump this
/// launch may write is on top of these, so the on-disk worst case is
/// `HEAP_DUMPS_KEPT + 1`.
const HEAP_DUMPS_KEPT: usize = 2;

/// Build this launch's `-XX:HeapDumpPath` value, creating
/// `<server_dir>/crash-reports/heapdumps/` and pruning old dumps first.
///
/// Why per-launch: the JVM will NOT overwrite an existing heap-dump file, so
/// a FIXED path captures exactly one OOM ever and then fails silently. The
/// old `AIKAR_FLAGS` entry was a fixed `crash-heapdump.hprof`; a 14.78 GB one
/// written 2026-06-13 sat in the live server root and swallowed every OOM
/// after it, including the 2026-09-04 OOM that wedged the server for a week.
/// The bat/sh launchers were fixed the same way on 2026-07-15; this is the
/// Rust launcher catching up, and it serves BOTH the GUI and the CLI because
/// every entry point funnels through `launch_server_inner`.
///
/// Returns `None` if the directory can't be created -- then we omit the flag
/// entirely and the JVM falls back to `java_pid<pid>.hprof` in the server
/// dir, which is at least collision-free. Never fatal: a server must still
/// boot when we can't set up dump capture.
fn prepare_heap_dump_path(cfg: &ServerConfig) -> Option<PathBuf> {
    let dir = cfg.heapdumps_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        // Unset flag > bad flag: with no -XX:HeapDumpPath the JVM writes
        // java_pid<pid>.hprof into the cwd (= server_dir), which is still
        // per-run unique, so OOM capture degrades rather than breaking.
        log::warn!(
            "[run] couldn't create {} ({e}); leaving -XX:HeapDumpPath unset",
            dir.display()
        );
        return None;
    }
    prune_heap_dumps(&dir, HEAP_DUMPS_KEPT);
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    Some(dir.join(format!("heap_{stamp}.hprof")))
}

/// Delete all but the `keep` newest `*.hprof` files in `dir`, by mtime.
/// Best-effort and chatty: every deletion is logged with its size, because
/// silently removing multi-gigabyte forensic evidence is exactly the kind of
/// thing an operator needs to be able to find in the log afterwards. Only
/// `.hprof` files are ever considered -- anything else in the directory is
/// left alone.
fn prune_heap_dumps(dir: &std::path::Path, keep: usize) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[run] couldn't scan {} for old heap dumps: {e}", dir.display());
            return;
        }
    };
    let mut dumps: Vec<(std::time::SystemTime, u64, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_hprof = path
            .extension()
            .map_or(false, |ext| ext.eq_ignore_ascii_case("hprof"));
        if !is_hprof { continue; }
        let meta = match entry.metadata() {
            Ok(m) if m.is_file() => m,
            _ => continue,
        };
        let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
        dumps.push((mtime, meta.len(), path));
    }
    if dumps.len() <= keep { return; }
    dumps.sort_by(|a, b| b.0.cmp(&a.0)); // newest first
    for (_, size, path) in dumps.into_iter().skip(keep) {
        let gib = size as f64 / (1024.0 * 1024.0 * 1024.0);
        match std::fs::remove_file(&path) {
            Ok(())  => log::info!("[run] pruned old heap dump {} ({gib:.2} GiB)", path.display()),
            Err(e)  => log::warn!("[run] couldn't prune old heap dump {}: {e}", path.display()),
        }
    }
}

fn pick_argfile(cfg: &ServerConfig) -> Result<PathBuf> {
    let win = cfg.win_args();
    let unix = cfg.unix_args();
    if cfg!(target_os = "windows") {
        if win.exists() { return Ok(win); }
        if unix.exists() { return Ok(unix); }
    } else {
        if unix.exists() { return Ok(unix); }
        if win.exists() { return Ok(win); }
    }
    anyhow::bail!(
        "neither win_args.txt nor unix_args.txt found under {}",
        cfg.libraries_dir().display()
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A server folder that gets as far as the spawn: the argfile is there.
    fn fixture(name: &str) -> (PathBuf, ServerConfig) {
        let dir = std::env::temp_dir().join(format!("icraft-run-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let cfg = ServerConfig::from_path(&dir);
        for args in [cfg.win_args(), cfg.unix_args()] {
            fs::create_dir_all(args.parent().unwrap()).unwrap();
            fs::write(&args, "").unwrap();
        }
        (dir, cfg)
    }

    fn no_watchdog() -> WatchdogOptions {
        WatchdogOptions { boot_timeout: Duration::ZERO, idle_timeout: Duration::ZERO, poll_interval: Duration::from_secs(1) }
    }

    /// The refusing half of the start guard, at the level that owns the spawn.
    /// An `Err` that names the guard can only come from before `cmd.spawn()`:
    /// had java been started on these empty argfiles, the result would be an
    /// exit code (or "spawning java" where there is no java at all).
    #[test]
    fn no_jvm_is_spawned_when_the_start_guard_refuses() {
        // 1. The whitelist is pinned on, a sync has put the pack's file back,
        //    and the put-back cannot write (its temp name is taken by a folder).
        let (dir, cfg) = fixture("guard-put-back-fails");
        fs::write(dir.join("server.properties"), "level-name=world\nwhite-list=true\n").unwrap();
        crate::overrides::pin(&cfg, "server.properties", "white-list", "false", "test").unwrap();
        fs::write(dir.join("server.properties"), "level-name=world\nwhite-list=false\n").unwrap();
        fs::create_dir_all(dir.join("server.properties.icraft-tmp")).unwrap();

        let err = launch_server_inner(&cfg, no_watchdog(), true).unwrap_err();
        assert!(format!("{err:#}").contains("the server was not started: white-list=false"), "{err:#}");
        assert!(!jvm_active());
        assert_eq!(fs::read_to_string(dir.join("server.properties")).unwrap(), "level-name=world\nwhite-list=false\n");
        let marker = fs::read_to_string(dir.join(crate::overrides::REFUSED_FILE)).unwrap();
        assert!(marker.contains("why=white-list=false"), "{marker}");
        let history = crate::overrides::history_tail(&dir, 20);
        assert!(history.iter().any(|l| l.contains("START REFUSED")), "{history:?}");
        let _ = fs::remove_dir_all(&dir);

        // 2. The list cannot be read. The file even has the whitelist on, but
        //    what this server asked for is unknown, so: no start.
        let (dir, cfg) = fixture("guard-list-unreadable");
        fs::write(dir.join("server.properties"), "level-name=world\nwhite-list=true\n").unwrap();
        fs::write(dir.join(crate::overrides::FILE), "{ not json").unwrap();

        let err = launch_server_inner(&cfg, no_watchdog(), true).unwrap_err();
        let text = format!("{err:#}");
        assert!(text.contains("the server was not started") && text.contains("does not parse"), "{text}");
        assert!(!jvm_active());
        assert!(dir.join(crate::overrides::REFUSED_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// The lines as the server printed them in the rig (2026-10-15: a bare
    /// Forge server, the End's feature order cycle re-created, an End chunk
    /// forced), on the console and in the log file. Then the lines that must
    /// never count.
    #[test]
    fn only_the_games_own_fatal_lines_count() {
        for line in [
            "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Encountered an unexpected exception",
            "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: This crash report has been saved to: C:\\srv\\.\\crash-reports\\crash-2026-10-15_09.56.19-server.txt",
            "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: We were unable to save this crash report to disk.",
            "[15Oct2026 09:56:19.576] [Server thread/ERROR] [net.minecraft.server.MinecraftServer/]: Encountered an unexpected exception",
        ] {
            assert_eq!(fatal_line(line), Some(FatalLine::Crashed), "{line}");
        }
        for line in [
            "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Exception stopping the server",
            "[15Oct2026 09:56:19.940] [Server thread/ERROR] [net.minecraft.server.MinecraftServer/]: Exception stopping the server",
        ] {
            assert_eq!(fatal_line(line), Some(FatalLine::StopFailed), "{line}");
        }
        for line in [
            // Forge prints it for every crash report, the ones a mod writes and survives too.
            "[09:56:19] [Server thread/FATAL] [ne.mi.co.ForgeMod/]: Preparing crash report with UUID 865af5c2-ff92-48b5-be71-45f0ebb4c10a",
            // What a chunk that fails to generate prints, before anything has crashed.
            "[09:56:18] [Server thread/ERROR] [minecraft/BlockableEventLoop]: Error executing task on Chunk source main thread executor for minecraft:the_end",
            "[09:56:19] [Server thread/INFO] [minecraft/MinecraftServer]: Stopping server",
            // Players, and a player quoting a whole fatal line.
            "[09:56:19] [Server thread/INFO] [minecraft/MinecraftServer]: <someone> Encountered an unexpected exception",
            "[09:56:19] [Server thread/INFO] [minecraft/MinecraftServer]: <someone> [09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Exception stopping the server",
            "[09:56:18] [Server thread/INFO] [minecraft/MinecraftServer]: [Not Secure] [Server] Encountered an unexpected exception",
            // Another logger, another thread, a stack trace line.
            "[09:56:19] [Server thread/ERROR] [somemod/Thing]: Encountered an unexpected exception",
            "[09:56:19] [Worker-Main-3/ERROR] [minecraft/MinecraftServer]: Encountered an unexpected exception",
            "java.util.concurrent.CompletionException: net.minecraft.ReportedException: Exception generating new chunk",
            "",
        ] {
            assert_eq!(fatal_line(line), None, "{line}");
        }
    }

    #[test]
    fn an_exit_after_a_crash_is_a_crash_whatever_its_code() {
        let now = Instant::now();
        let clean = Fatal::default();
        let crashed = Fatal { crashed_at: Some(now), stop_failed_at: None };
        let stop_failed = Fatal { crashed_at: Some(now), stop_failed_at: Some(now) };
        assert_eq!(reported_exit_code(0, &clean, false), 0, "a stop with no fatal line is what it says");
        assert_eq!(reported_exit_code(1, &clean, false), 1);
        assert_eq!(reported_exit_code(0, &crashed, false), 1, "the bare server of the rig: crashed, then exit 0");
        assert_eq!(reported_exit_code(0, &stop_failed, false), 1);
        assert_eq!(reported_exit_code(0, &Fatal { crashed_at: None, stop_failed_at: Some(now) }, false), 1, "a stop that failed saved nothing");
        assert_eq!(reported_exit_code(1, &stop_failed, true), 1, "killed: taskkill's own code stands");
        assert_eq!(reported_exit_code(0, &clean, true), 1);
        assert_eq!(reported_exit_code(-1, &crashed, false), -1);
    }

    #[test]
    fn a_jvm_is_overdue_only_after_its_grace() {
        let graces = FatalGraces { stop_failed: Duration::from_secs(30), crashed: Duration::from_secs(600) };
        let t0 = Instant::now();
        let at = |s: u64| t0 + Duration::from_secs(s);
        assert_eq!(overdue(&Fatal::default(), graces, at(3600)), None, "a server that never crashed is never overdue");
        let crashed = Fatal { crashed_at: Some(t0), stop_failed_at: None };
        assert_eq!(overdue(&crashed, graces, at(599)), None, "a stop that is still saving gets its time");
        assert!(overdue(&crashed, graces, at(600)).unwrap().contains("crashed 600 s ago"));
        // The rig: crashed, the stop failed 0.4 s later.
        let failed = Fatal { crashed_at: Some(t0), stop_failed_at: Some(t0) };
        assert_eq!(overdue(&failed, graces, at(29)), None);
        assert!(overdue(&failed, graces, at(30)).unwrap().contains("its stop failed 30 s ago"));
        // A clock read before the line was noted is not "overdue".
        assert_eq!(overdue(&Fatal { crashed_at: Some(at(10)), stop_failed_at: Some(at(10)) }, graces, t0), None);
    }

    /// The watch kills a process that outlives its grace, and leaves alone one
    /// whose run is over first. Real processes, real kill.
    #[test]
    fn the_watch_kills_a_jvm_that_outlives_its_failed_stop() {
        fn sleeper() -> std::process::Child {
            #[cfg(windows)]
            let mut cmd = Command::new("ping");
            #[cfg(windows)]
            cmd.args(["-n", "120", "127.0.0.1"]);
            #[cfg(not(windows))]
            let mut cmd = Command::new("sleep");
            #[cfg(not(windows))]
            cmd.arg("120");
            cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap()
        }
        let graces = FatalGraces { stop_failed: Duration::from_secs(1), crashed: Duration::from_secs(600) };

        // Its stop failed: killed about a second later.
        let mut child = sleeper();
        let fatal = Arc::new(Mutex::new(Fatal::default()));
        let (over, killed) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
        let watch = spawn_fatal_watch(child.id(), Arc::clone(&fatal), graces, Arc::clone(&over), Arc::clone(&killed));
        note_fatal(&fatal, "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Encountered an unexpected exception");
        note_fatal(&fatal, "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Exception stopping the server");
        let started = Instant::now();
        let status = child.wait().unwrap();
        over.store(true, Ordering::SeqCst);
        watch.join().unwrap();
        assert!(killed.load(Ordering::SeqCst));
        assert!(!status.success());
        assert!(started.elapsed() < Duration::from_secs(30), "killed after {:?}", started.elapsed());
        assert_ne!(reported_exit_code(status.code().unwrap_or(-1), &fatal.lock().unwrap(), true), 0);

        // Crashed, the stop still running (no failure line yet): the 10 min
        // grace holds, and the run ends first. Nothing is killed.
        let mut child = sleeper();
        let fatal = Arc::new(Mutex::new(Fatal::default()));
        let (over, killed) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
        let watch = spawn_fatal_watch(child.id(), Arc::clone(&fatal), graces, Arc::clone(&over), Arc::clone(&killed));
        note_fatal(&fatal, "[09:56:19] [Server thread/ERROR] [minecraft/MinecraftServer]: Encountered an unexpected exception");
        thread::sleep(Duration::from_secs(2));
        assert!(child.try_wait().unwrap().is_none(), "still saving: left alone");
        over.store(true, Ordering::SeqCst);
        watch.join().unwrap();
        assert!(!killed.load(Ordering::SeqCst));
        let _ = child.kill();
        let _ = child.wait();
    }

    /// The same, for a world regeneration that was cut off half-way: its
    /// marker file is there, so nothing is spawned. And the guard is nothing
    /// but that file: without it this launch gets as far as java.
    #[test]
    fn no_jvm_is_spawned_on_a_half_regenerated_world() {
        let (dir, cfg) = fixture("guard-regen-unfinished");
        fs::write(dir.join("server.properties"), "level-name=world\n").unwrap();
        assert_eq!(crate::regen::exec::start_guard(&cfg), Ok(()));
        assert!(!dir.join(crate::overrides::REFUSED_FILE).exists());

        fs::write(dir.join(crate::regen::exec::MARKER_FILE), "started_unix=1\n").unwrap();
        let err = launch_server_inner(&cfg, no_watchdog(), true).unwrap_err();
        let text = format!("{err:#}");
        assert!(text.contains("the server was not started") && text.contains("regeneration was left unfinished"), "{text}");
        assert!(!jvm_active());
        let refused = fs::read_to_string(dir.join(crate::overrides::REFUSED_FILE)).unwrap();
        assert!(refused.contains("why=a world regeneration was left unfinished"), "{refused}");
        // The marker is the launcher's to remove (a rollback does), never the guard's.
        assert!(dir.join(crate::regen::exec::MARKER_FILE).exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
