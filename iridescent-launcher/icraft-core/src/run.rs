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
    launch_server_watched(cfg, WatchdogOptions::default())
}

pub fn launch_server_watched(cfg: &ServerConfig, opts: WatchdogOptions) -> Result<i32> {
    launch_banner();

    let argfile = pick_argfile(cfg)?;
    log::info!("[run] argfile: {}", argfile.display());

    let mut cmd = Command::new("java");
    cmd.current_dir(&cfg.server_dir);
    for flag in AIKAR_FLAGS { cmd.arg(flag); }
    cmd.arg(format!("@{}", argfile.display()));
    cmd.arg("nogui");

    // Pipe stdin so the watchdog can write a newline as a soft kick
    // before the hard kill. Stdout/stderr inherit so server logs
    // appear directly in the operator console.
    cmd.stdin(Stdio::piped())
       .stdout(Stdio::inherit())
       .stderr(Stdio::inherit());

    log::info!("[run] launching: java {} ...", AIKAR_FLAGS.join(" "));
    let mut child = cmd.spawn().context("spawning java")?;

    // Shared handle to the child's stdin -- both the operator-stdin
    // forwarder thread and the watchdog soft-kick path write through
    // this. Wrapped in Arc<Mutex<Option<...>>> so either side can
    // release it on EOF without invalidating the other.
    let child_stdin: Arc<Mutex<Option<ChildStdin>>> =
        Arc::new(Mutex::new(child.stdin.take()));
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

    // Tell the watchdog we're done so it doesn't try to kill an already-dead PID.
    if let Some(h) = watchdog_handle {
        kill_signal.store(true, Ordering::Relaxed);
        let _ = h.join();
    }

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
