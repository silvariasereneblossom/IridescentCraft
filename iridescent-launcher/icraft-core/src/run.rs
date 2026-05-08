//! Phase 4 — launch the Forge dedicated server with a hang watchdog.
//!
//! Equivalent to the `java @libraries/.../win_args.txt nogui ...` block
//! at the end of `iridescentserver.bat`, plus a watchdog thread that
//! polls `logs/latest.log` mtime to detect hangs.
//!
//! Two thresholds:
//!   - `boot_timeout`: max time without ANY log activity (catches
//!     stuck-during-init / never-creates-latest.log)
//!   - `idle_timeout`: max time without log activity once we've seen
//!     any output (catches mid-runtime freezes / GC death spirals)
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
            idle_timeout: Duration::from_secs(15 * 60),
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
    for flag in AIKAR_FLAGS { cmd.arg(flag); }
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
    let mut child = cmd.spawn().context("spawning java")?;
    *ACTIVE_CHILD_PID.lock().unwrap() = Some(child.id());
    set_server_state(ServerState::Starting);

    if pipe_output {
        if let Some(stdout) = child.stdout.take() {
            spawn_log_pump(stdout);
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_pump(stderr);
        }
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
    let code = exit_status.code().unwrap_or(-1);
    let killed_by_watchdog = kill_signal.load(Ordering::Relaxed);
    set_server_state(ServerState::PostExit);
    log::info!("[run] *** Java process exited with code {code}; running post-exit hooks ***");

    // Tell the watchdog we're done so it doesn't try to kill an already-dead PID.
    if let Some(h) = watchdog_handle {
        kill_signal.store(true, Ordering::Relaxed);
        let _ = h.join();
    }
    // Drop the globals -- subsequent send_console_line / kill_active_server
    // calls will see "no server running" until the next launch. State
    // stays at PostExit so the GUI badge reflects "post-exit hooks
    // still running"; the caller resets to Idle when push_logs etc.
    // have finished.
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
    }
}

/// Send a termination signal to the running server, bypassing the
/// "stop" stdin command (which a hung JVM may not process). When
/// `force` is false, sends a graceful signal -- SIGTERM on Unix,
/// taskkill /T on Windows -- so the JVM's shutdown hooks fire and
/// chunks flush. When `force` is true, sends SIGKILL / taskkill /F /T;
/// world saves are LOST but the process dies immediately, useful for
/// truly stuck servers where graceful shutdown stalls indefinitely.
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
fn spawn_log_pump<R: std::io::Read + Send + 'static>(reader: R) {
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
            }

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
    // taskkill /T kills the whole tree; /F is force. Without /F the JVM
    // gets a graceful shutdown signal first; we want graceful so worlds
    // flush cleanly, so omit /F.
    use std::process::Command;
    Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T"])
        .status()?;
    Ok(())
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
