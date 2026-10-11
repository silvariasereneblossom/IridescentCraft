//! Phase 5 — capture the crash log, and the GitHub token the launcher uses.
//!
//! Replaces the trailing block of `iridescentserver.bat`:
//!   - timestamp a `crash-YYYY-MM-DD_HH-MM.log` file
//!   - dump latest crash-reports/crash-*.txt + tail of latest.log
//!
//! Mirroring the logs to the repo (what `push_crash_logs.bat` did) lives in
//! [`crate::logpush`]: staged at exit, pushed in the background through the
//! GitHub API, never on the restart path.

use anyhow::Result;
use chrono::Local;
use std::fs;
use std::io::Read;
use std::path::PathBuf;

use crate::config::ServerConfig;

pub fn capture_crash_log(cfg: &ServerConfig, exit_code: i32) -> Result<PathBuf> {
    let now = Local::now();
    let stamp = now.format("%Y-%m-%d_%H-%M").to_string();
    let path = cfg.server_dir.join(format!("crash-{stamp}.log"));

    let mut body = String::new();
    body.push_str("IridescentCraft Server Crash Log\n");
    body.push_str("================================\n");
    body.push_str(&format!("Date: {}\n", now.format("%Y-%m-%d %H:%M:%S")));
    body.push_str(&format!("Exit Code: {exit_code}\n\n"));

    // Forge crash report -- only one written for THIS exit. The newest file
    // under crash-reports/ can be days old (a hang, a kill, or an OOM that
    // wedged the shutdown writes none), and embedding it pins a stale cause on
    // this exit (2026-09-10: a Cycle kill of a week-old zombie JVM bundled the
    // Sept 4 OOM report as if it were new).
    match newest_crash_report(cfg) {
        Some((mtime, latest)) if mtime.elapsed().map_or(true, |age| age <= FRESH_CRASH_REPORT) => {
            body.push_str(&format!("--- Forge Crash Report: {} ---\n", latest.display()));
            if let Ok(s) = fs::read_to_string(&latest) {
                body.push_str(&s);
            }
            body.push('\n');
        }
        Some((mtime, latest)) => {
            let age = mtime.elapsed().unwrap_or_default().as_secs();
            body.push_str(&format!(
                "--- No Forge crash report for this exit (newest on disk is {}, {}h{:02}m old -- not included; \
                 a hang/kill or a wedged shutdown writes none) ---\n\n",
                latest.display(), age / 3600, (age % 3600) / 60
            ));
        }
        None => {}
    }

    body.push_str("\n--- Last 200 lines of server log ---\n");
    if let Ok(tail) = read_tail(&cfg.logs_dir().join("latest.log"), 200) {
        body.push_str(&tail);
    }

    fs::write(&path, body)?;
    log::info!("[crash] wrote {}", path.display());
    Ok(path)
}

/// Read the GitHub PAT used for log-push auth. Order of precedence:
///   1. `ICRAFT_GH_TOKEN` environment variable
///   2. `<appdata>/icraft-launcher/.icraft_token` (canonical save
///      location -- safe from modpack-sync flows)
///   3. `.icraft_token` next to the running binary (legacy)
///   4. `.icraft_token` in `cfg.server_dir` (legacy; vulnerable to
///      sync_from_repo.bat's robocopy /MIR -- still readable for
///      backward compat with existing setups, but new saves don't
///      go here)
/// Returns None if none of the above yields a non-empty token.
pub fn read_pat(cfg: &ServerConfig) -> Option<String> {
    // Cfg-independent sources first (env + canonical/legacy files), then the
    // server_dir legacy fallback which needs `cfg`.
    resolve_pat_cfgless()
        .or_else(|| read_token_file(&cfg.server_dir.join(".icraft_token")))
}

/// The `cfg`-independent half of [`read_pat`]: `ICRAFT_GH_TOKEN` env, then the
/// canonical `%LOCALAPPDATA%\icraft-launcher\.icraft_token`, then the legacy
/// next-to-exe file. Shared with `github::auth_token` so a PAT saved via the
/// GUI authenticates the SYNC API (head/compare), not just git pushes —
/// otherwise the sync stays on the 60/hr unauthenticated bucket and Cycle
/// intermittently fails open / proceeds-stale. (The server_dir fallback is
/// `read_pat`-only because it needs the install dir, which the low-level GitHub
/// client doesn't carry.)
pub(crate) fn resolve_pat_cfgless() -> Option<String> {
    if let Ok(t) = std::env::var("ICRAFT_GH_TOKEN") {
        let t = t.trim().to_string();
        if !t.is_empty() { return Some(t); }
    }
    if let Some(p) = pat_appdata_path() {
        if let Some(t) = read_token_file(&p) { return Some(t); }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(t) = read_token_file(&parent.join(".icraft_token")) {
                return Some(t);
            }
        }
    }
    None
}

/// Canonical PAT save location: `%LOCALAPPDATA%\icraft-launcher\
/// .icraft_token` on Windows, `~/.config/icraft-launcher/.icraft_token`
/// elsewhere. Lives outside the modpack tree so sync_from_repo.bat
/// (or any other repo-sync flow) can't wipe it.
fn pat_appdata_path() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var("LOCALAPPDATA").ok().map(PathBuf::from)?
    } else {
        std::env::var("XDG_CONFIG_HOME").ok().map(PathBuf::from)
            .or_else(|| std::env::var("HOME").ok().map(|h| PathBuf::from(h).join(".config")))?
    };
    Some(base.join("icraft-launcher").join(".icraft_token"))
}

fn read_token_file(p: &std::path::Path) -> Option<String> {
    let text = std::fs::read_to_string(p).ok()?;
    let first = text.lines().next()?.trim().to_string();
    if first.is_empty() { None } else { Some(first) }
}

/// Where a configured PAT is currently being read from.
#[derive(Debug, Clone)]
pub enum PatStatus {
    EnvVar,
    /// Canonical save location -- `%LOCALAPPDATA%\icraft-launcher\
    /// .icraft_token` (Windows) or equivalent.
    FileInAppData(PathBuf),
    /// Legacy: file next to the running exe.
    FileNextToExe(PathBuf),
    /// Legacy: file in the modpack root. Vulnerable to
    /// sync_from_repo.bat /MIR wiping it.
    FileInServerDir(PathBuf),
    None,
}

/// Mirror of `read_pat`'s search order. Reports the source path
/// instead of the token. For UI status display -- never returns the
/// token itself.
pub fn pat_status(cfg: &ServerConfig) -> PatStatus {
    if std::env::var("ICRAFT_GH_TOKEN").map(|v| !v.trim().is_empty()).unwrap_or(false) {
        return PatStatus::EnvVar;
    }
    if let Some(p) = pat_appdata_path() {
        if read_token_file(&p).is_some() {
            return PatStatus::FileInAppData(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join(".icraft_token");
            if read_token_file(&p).is_some() {
                return PatStatus::FileNextToExe(p);
            }
        }
    }
    let p = cfg.server_dir.join(".icraft_token");
    if read_token_file(&p).is_some() {
        return PatStatus::FileInServerDir(p);
    }
    PatStatus::None
}

/// Persist `token` to `%LOCALAPPDATA%\icraft-launcher\.icraft_token`
/// (or platform-equivalent). Lives outside the modpack tree so the
/// modpack-sync flow can't wipe it. Creates parent dirs as needed.
/// On Unix sets mode 0600. Returns the absolute path written.
pub fn write_pat_to_file(token: &str) -> Result<PathBuf> {
    let path = pat_appdata_path()
        .ok_or_else(|| anyhow::anyhow!("no LOCALAPPDATA / HOME env var; can't pick a PAT save location"))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, token.trim())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, perms);
        }
    }
    Ok(path)
}

/// Remove the canonical PAT file (appdata location). Returns
/// Ok(true) if a file was actually removed, Ok(false) if there was
/// nothing to clear. Doesn't touch legacy locations (next-to-exe /
/// server-dir) -- if the operator wants those gone, they can delete
/// them by hand or save a new token (which writes to appdata).
pub fn clear_pat_file() -> Result<bool> {
    let path = pat_appdata_path()
        .ok_or_else(|| anyhow::anyhow!("no LOCALAPPDATA / HOME env var"))?;
    if path.exists() {
        std::fs::remove_file(&path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// A Forge crash report counts as "this exit's" if written within this window
/// before the exit is captured (the crash-time save can take a few minutes).
const FRESH_CRASH_REPORT: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// Newest `crash-reports/*.txt` by mtime, with that mtime.
fn newest_crash_report(cfg: &ServerConfig) -> Option<(std::time::SystemTime, PathBuf)> {
    let dir = cfg.crash_reports();
    if !dir.is_dir() { return None; }
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in fs::read_dir(&dir).ok()?.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("txt") { continue; }
        let m = entry.metadata().ok()?.modified().ok()?;
        match &best {
            None => best = Some((m, p)),
            Some((bt, _)) if m > *bt => best = Some((m, p)),
            _ => {}
        }
    }
    best
}

fn read_tail(path: &std::path::Path, lines: usize) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let mut all = String::new();
    f.read_to_string(&mut all)?;
    let collected: Vec<&str> = all.lines().collect();
    let start = collected.len().saturating_sub(lines);
    Ok(collected[start..].join("\n"))
}
