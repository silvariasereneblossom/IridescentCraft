//! Uptime restart policy for the dedicated server (operator decision 2026-10-09).
//!
//!   - nobody online, up >= 4 h      -> Cycle, no warnings
//!   - players online, up >= 12 h    -> Cycle, with the in-game countdown
//!   - players online, 4 h .. 12 h   -> wait; Cycle once it has stayed empty
//!                                      for the debounce window
//!
//! "Uptime" is time since the server's own "Done" line, so every restart --
//! a heartbeat crash recovery included -- starts the clock again. "Empty"
//! needs `EMPTY_DEBOUNCE` of consecutive empty readings, so a reconnecting
//! player isn't restarted on. An unknown player count counts as "players
//! online": the server then only restarts at the 12 h ceiling, with warnings.
//!
//! This replaces the fixed 05:00 nightly restart. It is hygiene, not a leak
//! workaround: the 16 h OOM it was first drawn up against was fixed the same
//! day (`e4c74ea4`), but a ~450-mod server still does better with a fresh JVM
//! a few times a day, and every restart is a Cycle, so it also deploys HEAD.
//!
//! This module owns the rules, the override file and the audit log. The GUI
//! owns the two live signals (uptime, player count) and the restart itself --
//! see `spawn_restart_policy` in icraft-gui.

use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// Restart an empty server once it has been up this long.
pub const EMPTY_AFTER: Duration = Duration::from_secs(4 * 3600);
/// Restart regardless of players once it has been up this long.
pub const BUSY_AFTER: Duration = Duration::from_secs(12 * 3600);
/// How long the server must have stayed empty before an empty restart.
pub const EMPTY_DEBOUNCE: Duration = Duration::from_secs(5 * 60);
/// First in-game warning before a restart with players online.
pub const BUSY_WARN_LEAD: Duration = Duration::from_secs(60);
/// Never restart a server younger than this, whatever the override file says.
pub const MIN_UPTIME: Duration = Duration::from_secs(10 * 60);

/// Optional `key=value` overrides, next to server.properties. Runtime-only
/// (not in the repo, not touched by the sync) and re-read every evaluation,
/// so a change applies within a minute without restarting anything:
///
/// ```text
/// mode=dry-run            # live (default) | dry-run (log only) | off
/// empty_after_min=240
/// busy_after_min=720
/// empty_debounce_min=5
/// busy_warn_sec=60
/// ```
pub const OVERRIDE_FILE: &str = ".icraft_restart_policy";
/// Audit log, in the server's `logs/` (mirrored to TesterLogs with the rest).
pub const LOG_FILE: &str = "restart_policy.log";
const LOG_ROLL_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Live,
    /// Evaluate and log every decision, never act.
    DryRun,
    Off,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    pub mode: Mode,
    pub empty_after: Duration,
    pub busy_after: Duration,
    pub empty_debounce: Duration,
    pub busy_warn_lead: Duration,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            mode: Mode::Live,
            empty_after: EMPTY_AFTER,
            busy_after: BUSY_AFTER,
            empty_debounce: EMPTY_DEBOUNCE,
            busy_warn_lead: BUSY_WARN_LEAD,
        }
    }
}

impl Policy {
    /// The defaults, with `OVERRIDE_FILE` applied when it exists. `Err` (the
    /// file is unreadable or has a line that doesn't parse) means "suspend the
    /// policy": a typo'd `mode=dry-run` must not fall back to live.
    pub fn load(server_dir: &Path) -> Result<Self, String> {
        let path = server_dir.join(OVERRIDE_FILE);
        match std::fs::read_to_string(&path) {
            Ok(body) => Self::parse(&body).map_err(|e| format!("{OVERRIDE_FILE}: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("{OVERRIDE_FILE}: unreadable ({e})")),
        }
    }

    fn parse(body: &str) -> Result<Self, String> {
        let mut p = Self::default();
        for raw in body.lines() {
            // A BOM survives `read_to_string`; PowerShell 5.1 writes one.
            let line = raw.trim_start_matches('\u{feff}').split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let (key, value) = line
                .split_once('=')
                .ok_or_else(|| format!("'{line}' is not key=value"))?;
            let (key, value) = (key.trim().to_ascii_lowercase(), value.trim().to_ascii_lowercase());
            let number = || value.parse::<u64>().map_err(|_| format!("'{line}': not a whole number"));
            match key.as_str() {
                "mode" => {
                    p.mode = match value.as_str() {
                        "live" | "on" => Mode::Live,
                        "dry-run" | "dryrun" | "dry" => Mode::DryRun,
                        "off" => Mode::Off,
                        _ => return Err(format!("'{line}': mode is live, dry-run or off")),
                    }
                }
                "empty_after_min" => p.empty_after = Duration::from_secs(number()?.saturating_mul(60)),
                "busy_after_min" => p.busy_after = Duration::from_secs(number()?.saturating_mul(60)),
                "empty_debounce_min" => p.empty_debounce = Duration::from_secs(number()?.saturating_mul(60)),
                "busy_warn_sec" => p.busy_warn_lead = Duration::from_secs(number()?),
                _ => return Err(format!("'{line}': unknown key")),
            }
        }
        // The ceiling can't sit below the empty threshold, and the countdown
        // needs room for its 10 s mark.
        p.busy_after = p.busy_after.max(p.empty_after);
        p.busy_warn_lead = p.busy_warn_lead.max(Duration::from_secs(10));
        Ok(p)
    }

    /// One line for the audit log.
    pub fn describe(&self) -> String {
        let mode = match self.mode {
            Mode::Live => "LIVE",
            Mode::DryRun => "DRY-RUN (logging only)",
            Mode::Off => "OFF",
        };
        let overridden = if *self == Self::default() { "" } else { " [override file in effect]" };
        format!(
            "mode {mode}; Cycle when empty for {} and up {}, or up {} with players on ({} warning){overridden}",
            fmt_span(self.empty_debounce),
            fmt_span(self.empty_after),
            fmt_span(self.busy_after),
            fmt_span(self.busy_warn_lead),
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Not up long enough for anything to be due.
    Young,
    /// Players on (or the count is unknown), below the ceiling.
    WaitForEmpty,
    /// Empty and old enough, but not empty for the whole debounce yet.
    Debounce,
    /// Cycle now, no warnings: nobody is on.
    RestartEmpty,
    /// Cycle now, with the countdown: the ceiling was reached with players on.
    RestartBusy,
}

impl Decision {
    pub fn is_restart(self) -> bool {
        matches!(self, Decision::RestartEmpty | Decision::RestartBusy)
    }

    pub fn describe(self) -> &'static str {
        match self {
            Decision::Young => "wait: nothing due yet",
            Decision::WaitForEmpty => "wait: players online, below the ceiling -- restart once empty",
            Decision::Debounce => "wait: empty, debouncing",
            Decision::RestartEmpty => "CYCLE: empty and past the empty threshold",
            Decision::RestartBusy => "CYCLE: ceiling reached with players online (warned countdown)",
        }
    }
}

/// `players`: `None` = unknown, which is treated as "players online".
/// `empty_for`: how long every reading has been `Some(0)`.
pub fn decide(p: &Policy, uptime: Duration, players: Option<u32>, empty_for: Duration) -> Decision {
    if uptime < MIN_UPTIME || uptime < p.empty_after {
        Decision::Young
    } else if players == Some(0) {
        if empty_for >= p.empty_debounce {
            Decision::RestartEmpty
        } else {
            Decision::Debounce
        }
    } else if uptime >= p.busy_after {
        Decision::RestartBusy
    } else {
        Decision::WaitForEmpty
    }
}

/// `3h07m` / `12m` / `45s` -- for log lines.
pub fn fmt_span(d: Duration) -> String {
    let s = d.as_secs();
    if s >= 3600 {
        format!("{}h{:02}m", s / 3600, (s % 3600) / 60)
    } else if s >= 60 {
        format!("{}m", s / 60)
    } else {
        format!("{s}s")
    }
}

/// Append one line to `logs/restart_policy.log` (and the launcher log).
/// Best-effort: the audit trail must never take the policy thread down.
pub fn audit(server_dir: &Path, msg: &str) {
    log::info!("[restart-policy] {msg}");
    let dir = server_dir.join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(LOG_FILE);
    if std::fs::metadata(&path).map_or(false, |m| m.len() > LOG_ROLL_BYTES) {
        let _ = std::fs::rename(&path, dir.join(format!("{LOG_FILE}.1")));
    }
    let line = format!("[{}] {msg}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: u64 = 3600;
    fn secs(s: u64) -> Duration { Duration::from_secs(s) }

    #[test]
    fn empty_server_restarts_at_four_hours_after_the_debounce() {
        let p = Policy::default();
        assert_eq!(decide(&p, secs(4 * H - 1), Some(0), secs(600)), Decision::Young);
        assert_eq!(decide(&p, secs(4 * H), Some(0), secs(299)), Decision::Debounce);
        assert_eq!(decide(&p, secs(4 * H), Some(0), secs(300)), Decision::RestartEmpty);
    }

    #[test]
    fn players_hold_it_until_twelve_hours() {
        let p = Policy::default();
        assert_eq!(decide(&p, secs(4 * H), Some(1), secs(0)), Decision::WaitForEmpty);
        assert_eq!(decide(&p, secs(12 * H - 1), Some(3), secs(0)), Decision::WaitForEmpty);
        assert_eq!(decide(&p, secs(12 * H), Some(3), secs(0)), Decision::RestartBusy);
        // Went empty at 13 h: still debounced, then no warnings needed.
        assert_eq!(decide(&p, secs(13 * H), Some(0), secs(60)), Decision::Debounce);
        assert_eq!(decide(&p, secs(13 * H), Some(0), secs(300)), Decision::RestartEmpty);
    }

    #[test]
    fn unknown_count_is_treated_as_players_online() {
        let p = Policy::default();
        assert_eq!(decide(&p, secs(6 * H), None, secs(0)), Decision::WaitForEmpty);
        assert_eq!(decide(&p, secs(12 * H), None, secs(0)), Decision::RestartBusy);
    }

    #[test]
    fn never_inside_the_boot_floor() {
        let p = Policy::parse("empty_after_min=1\nbusy_after_min=1\nempty_debounce_min=0").unwrap();
        assert_eq!(decide(&p, secs(599), Some(0), secs(599)), Decision::Young);
        assert_eq!(decide(&p, secs(600), Some(0), secs(600)), Decision::RestartEmpty);
    }

    #[test]
    fn override_file_parses_and_fails_closed() {
        let p = Policy::parse("\u{feff}mode = Dry-Run  # testing\n\nempty_after_min=15\nbusy_warn_sec=300\n").unwrap();
        assert_eq!(p.mode, Mode::DryRun);
        assert_eq!(p.empty_after, secs(900));
        assert_eq!(p.busy_after, BUSY_AFTER);
        assert_eq!(p.busy_warn_lead, secs(300));
        assert!(Policy::parse("mode=dryrun-please").is_err());
        assert!(Policy::parse("empty_hours=4").is_err());
        assert!(Policy::parse("busy_after_min=soon").is_err());
        // Ceiling below the empty threshold is lifted to it.
        assert_eq!(Policy::parse("busy_after_min=60").unwrap().busy_after, EMPTY_AFTER);
    }
}
