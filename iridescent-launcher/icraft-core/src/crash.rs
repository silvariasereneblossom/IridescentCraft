//! Phase 5 — capture crash log and best-effort git push to TesterLogs.
//!
//! Replaces the trailing block of `iridescentserver.bat` plus
//! `push_crash_logs.bat`. The bat does:
//!   - timestamp a `crash-YYYY-MM-DD_HH-MM.log` file
//!   - dump latest crash-reports/crash-*.txt + tail of latest.log
//!   - mirror logs to TesterLogs/Server Logs/
//!   - if the install is in a git working tree, commit + push
//!
//! Native Rust port handles the same logic with chrono + std::fs +
//! [`crate::git`].

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

    // Latest crash report (newest by mtime under crash-reports/)
    if let Some(latest) = newest_crash_report(cfg) {
        body.push_str(&format!("--- Forge Crash Report: {} ---\n", latest.display()));
        if let Ok(s) = fs::read_to_string(&latest) {
            body.push_str(&s);
        }
        body.push('\n');
    }

    body.push_str("\n--- Last 200 lines of server log ---\n");
    if let Ok(tail) = read_tail(&cfg.logs_dir().join("latest.log"), 200) {
        body.push_str(&tail);
    }

    fs::write(&path, body)?;
    log::info!("[crash] wrote {}", path.display());
    Ok(path)
}

/// Best-effort: copy logs/ -> TesterLogs/Server Logs/ and run a
/// commit + push from the parent working tree if any. Failures are
/// logged but never fatal — the server should not refuse to exit
/// because we couldn't push logs.
pub fn push_logs(cfg: &ServerConfig) -> Result<()> {
    let src = cfg.logs_dir();
    if !src.exists() { return Ok(()); }

    // Mirror to TesterLogs/Server Logs/ inside the install tree if it
    // exists. push_crash_logs.bat originally did this with xcopy.
    let mirror = cfg.server_dir.join("TesterLogs").join("Server Logs");
    if let Err(e) = mirror_dir(&src, &mirror) {
        log::warn!("[crash] mirror to TesterLogs failed: {e}");
    }

    // Find a git working tree from cwd upwards. If none, we're done.
    let Some(root) = crate::git::find_git_root(&cfg.server_dir) else {
        log::warn!(
            "[crash] no git working tree found from {} upward -- skipping push. \
             Set Install dir to your IridescentCraft clone to enable.",
            cfg.server_dir.display()
        );
        return Ok(());
    };
    log::info!("[crash] git root: {}", root.display());

    if let Err(e) = crate::git::add(&root, &["TesterLogs"]) {
        log::warn!("[crash] git add failed: {e}");
        return Ok(());
    }
    let msg = format!(
        "server logs auto-mirror {}",
        Local::now().format("%Y-%m-%d %H:%M")
    );
    if let Err(e) = crate::git::commit(&root, &msg) {
        // Common case: nothing to commit. Don't escalate, but make
        // visible so the user can tell push was a no-op vs. mirror
        // landing in the wrong place.
        log::info!("[crash] git commit skipped: {e}");
        return Ok(());
    }

    let pat = read_pat(cfg);
    let push_result = match &pat {
        Some(p) => crate::git::push_with_pat(&root, p),
        None    => {
            log::warn!("[crash] no PAT configured (set ICRAFT_GH_TOKEN or drop .icraft_token next to the launcher); attempting unauthenticated push");
            crate::git::push(&root)
        }
    };
    match push_result {
        Ok(_)  => log::info!("[crash] logs pushed to remote"),
        Err(e) => log::warn!("[crash] git push failed: {e}"),
    }
    Ok(())
}

/// Read the GitHub PAT used for log-push auth. Order of precedence:
///   1. `ICRAFT_GH_TOKEN` environment variable (set system-wide on
///      the server box, survives reboots, no on-disk file)
///   2. `.icraft_token` file next to the running binary (one line,
///      the PAT only)
///   3. `.icraft_token` file in `cfg.server_dir` (modpack root)
/// Returns None if none of the above yields a non-empty token.
fn read_pat(cfg: &ServerConfig) -> Option<String> {
    if let Ok(t) = std::env::var("ICRAFT_GH_TOKEN") {
        let t = t.trim().to_string();
        if !t.is_empty() { return Some(t); }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            if let Some(t) = read_token_file(&parent.join(".icraft_token")) {
                return Some(t);
            }
        }
    }
    read_token_file(&cfg.server_dir.join(".icraft_token"))
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
    FileNextToExe(PathBuf),
    FileInServerDir(PathBuf),
    None,
}

/// Mirror of `read_pat`'s search order, but reports the source path
/// instead of the token. For UI status display -- never returns the
/// token itself.
pub fn pat_status(cfg: &ServerConfig) -> PatStatus {
    if std::env::var("ICRAFT_GH_TOKEN").map(|v| !v.trim().is_empty()).unwrap_or(false) {
        return PatStatus::EnvVar;
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

/// Persist `token` to `.icraft_token` next to the running exe. On
/// Unix the file mode is set to 0600 so other users can't read it.
/// `.icraft_token` is gitignored so an accidentally-committed working
/// tree won't leak the token. Returns the absolute path written.
pub fn write_pat_to_file(token: &str) -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let parent = exe.parent()
        .ok_or_else(|| anyhow::anyhow!("current_exe has no parent: {}", exe.display()))?;
    let path = parent.join(".icraft_token");
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

/// Remove `.icraft_token` next to the running exe. Returns Ok(true)
/// if a file was actually removed, Ok(false) if there was nothing to
/// clear.
pub fn clear_pat_file() -> Result<bool> {
    let exe = std::env::current_exe()?;
    let parent = exe.parent()
        .ok_or_else(|| anyhow::anyhow!("current_exe has no parent"))?;
    let path = parent.join(".icraft_token");
    if path.exists() {
        std::fs::remove_file(&path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

fn newest_crash_report(cfg: &ServerConfig) -> Option<PathBuf> {
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
    best.map(|(_, p)| p)
}

fn read_tail(path: &std::path::Path, lines: usize) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let mut all = String::new();
    f.read_to_string(&mut all)?;
    let collected: Vec<&str> = all.lines().collect();
    let start = collected.len().saturating_sub(lines);
    Ok(collected[start..].join("\n"))
}

fn mirror_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            mirror_dir(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}
