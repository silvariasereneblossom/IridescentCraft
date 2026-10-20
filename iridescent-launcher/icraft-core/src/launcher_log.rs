//! `logs\launcher.log`: the launcher's own lines on disk.
//!
//! Until 2026-10-20 the launcher's log went only to its window (and to a
//! stderr nobody captured), so the box kept no record of what a Cycle did:
//! which sync path it took, why a start failed (failure-modes §9, 2026-10-19).
//! The boot instance has no window at all, so without this file it would run
//! the server with no record anywhere. Both kinds of launcher write it; a
//! window opened while the boot instance runs the server shows its tail.
//!
//! The game's own output is left out: every `[server]` line is in
//! `logs\latest.log` already, and the `[event]` lines repeat some of them.
//! The file rolls over to `launcher.log.1` at [`ROLL_AT`] bytes (one old
//! generation). The log push mirrors `logs\` with it, to the private logs
//! repository.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FILE_NAME: &str = "launcher.log";
pub const ROLL_AT: u64 = 2 * 1024 * 1024;

pub fn path(server_dir: &Path) -> PathBuf {
    server_dir.join("logs").join(FILE_NAME)
}

/// Lines that are the game's own output (already in `latest.log`).
pub fn is_game_output(message: &str) -> bool {
    message.starts_with("[server] ") || message.starts_with("[event] ")
}

struct Open {
    file: File,
    path: PathBuf,
    size: u64,
}

/// Appends lines; rolls the file over at [`ROLL_AT`]. Never fails the caller:
/// a line that cannot be written is dropped.
pub struct LauncherLog {
    inner: Mutex<Option<Open>>,
    roll_at: u64,
}

impl LauncherLog {
    pub const fn new() -> Self {
        Self { inner: Mutex::new(None), roll_at: ROLL_AT }
    }

    #[cfg(test)]
    fn with_roll_at(roll_at: u64) -> Self {
        Self { inner: Mutex::new(None), roll_at }
    }

    /// Start writing to `server_dir\logs\launcher.log` (creating `logs\`).
    pub fn open(&self, server_dir: &Path) -> std::io::Result<()> {
        let path = path(server_dir);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata().map(|m| m.len()).unwrap_or(0);
        *self.inner.lock().unwrap() = Some(Open { file, path, size });
        Ok(())
    }

    pub fn is_open(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }

    /// `line` with a local timestamp in front.
    pub fn write_line(&self, line: &str) {
        let mut guard = self.inner.lock().unwrap();
        let Some(open) = guard.as_mut() else { return };
        if open.size >= self.roll_at {
            let old = open.path.with_extension("log.1");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(&open.path, &old);
            match OpenOptions::new().create(true).append(true).open(&open.path) {
                Ok(f) => {
                    open.file = f;
                    open.size = 0;
                }
                Err(_) => {
                    *guard = None;
                    return;
                }
            }
        }
        let text = format!("{} {line}\n", crate::logpush::local_timestamp());
        if open.file.write_all(text.as_bytes()).is_ok() {
            open.size += text.len() as u64;
        }
    }
}

impl Default for LauncherLog {
    fn default() -> Self {
        Self::new()
    }
}

/// The last `max_lines` lines of the file, reading at most `max_bytes` from
/// its end (a line cut by that limit is dropped). Empty when there is none.
pub fn tail(server_dir: &Path, max_lines: usize, max_bytes: u64) -> Vec<String> {
    let Ok(mut file) = File::open(path(server_dir)) else { return Vec::new() };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(max_bytes);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    let skip = lines.len().saturating_sub(max_lines);
    lines.split_off(skip)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("icraft-launcherlog-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_games_own_lines_stay_out() {
        assert!(is_game_output("[server] [12:00:00] [Server thread/INFO]: Done (41.2s)!"));
        assert!(is_game_output("[event] >> player joined: someone"));
        assert!(!is_game_output("[sync] up to date (commit 1234567)"));
        assert!(!is_game_output("[boot] boot instance starting"));
    }

    #[test]
    fn lines_are_appended_with_a_time_and_read_back_from_the_end() {
        let dir = scratch("append");
        let log = LauncherLog::new();
        log.open(&dir).unwrap();
        for i in 0..5 {
            log.write_line(&format!("[ INFO] line {i}"));
        }
        let lines = tail(&dir, 3, 1 << 20);
        assert_eq!(lines.len(), 3);
        assert!(lines[0].ends_with("[ INFO] line 2") && lines[2].ends_with("[ INFO] line 4"));
        // "2026-10-20 08:12:03 " in front.
        assert_eq!(lines[0].as_bytes()[4], b'-');
        assert_eq!(lines[0].as_bytes()[19], b' ');
        // A second launcher appends to the same file.
        let again = LauncherLog::new();
        again.open(&dir).unwrap();
        again.write_line("[ INFO] after a relaunch");
        assert_eq!(tail(&dir, 10, 1 << 20).len(), 6);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_file_rolls_over_and_keeps_one_old_generation() {
        let dir = scratch("roll");
        let log = LauncherLog::with_roll_at(200);
        log.open(&dir).unwrap();
        for i in 0..30 {
            log.write_line(&format!("[ INFO] a line long enough to roll the file soon, number {i}"));
        }
        let current = std::fs::metadata(path(&dir)).unwrap().len();
        assert!(current < 400, "the live file grew past its limit: {current} bytes");
        assert!(dir.join("logs").join("launcher.log.1").is_file());
        assert!(tail(&dir, 1, 1 << 20)[0].ends_with("number 29"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tail_cut_by_the_byte_limit_drops_the_partial_line() {
        let dir = scratch("cut");
        let log = LauncherLog::new();
        log.open(&dir).unwrap();
        log.write_line("[ INFO] first");
        log.write_line("[ INFO] second");
        // 25 bytes from the end: part of "second"'s timestamp is cut off.
        let lines = tail(&dir, 10, 25);
        assert!(lines.iter().all(|l| !l.contains("first")));
        assert!(tail(&scratch("none"), 10, 1 << 20).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
