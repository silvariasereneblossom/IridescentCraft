//! Locate developer tools (git, cargo) when the launcher process
//! doesn't inherit a useful PATH.
//!
//! GUI processes launched from File Explorer / a desktop shortcut on
//! Windows get the system+user environment from the registry, NOT
//! the cmd-augmented PATH that interactive shells see. So
//! `Command::new("git")` fails with "program not found" even when
//! git is installed -- it's just not where the spawn lookup is
//! looking.
//!
//! `find_tool` consults, in order:
//!
//!   1. `ICRAFT_<NAME>` env var override (e.g. ICRAFT_GIT, ICRAFT_CARGO)
//!   2. PATH lookup via `where` (Windows) / `which` (Unix)
//!   3. Tool-specific built-in install paths:
//!      - git:   Git for Windows defaults, per-user installs, and
//!               GitHub Desktop's bundled git (<LOCALAPPDATA>/
//!               GitHubDesktop/app-<ver>/resources/app/git/cmd/
//!               git.exe -- newest version subdir wins)
//!      - cargo: %USERPROFILE%\.cargo\bin\cargo.exe (rustup default)
//!
//! Used by `crate::git`, `crate::self_update`, and `crate::crash`
//! whenever any of them shells out to git / cargo.

use std::path::PathBuf;

pub fn find_tool(name: &str, extra_candidates: &[&str]) -> Option<PathBuf> {
    // 1. ICRAFT_<NAME> env var override.
    let env_key = format!("ICRAFT_{}", name.to_uppercase());
    if let Ok(p) = std::env::var(&env_key) {
        let pb = PathBuf::from(p);
        if pb.exists() { return Some(pb); }
    }

    // 2. PATH lookup.
    #[cfg(windows)]
    let lookup = "where";
    #[cfg(not(windows))]
    let lookup = "which";
    if let Ok(out) = std::process::Command::new(lookup).arg(name).output() {
        if out.status.success() {
            if let Ok(s) = std::str::from_utf8(&out.stdout) {
                if let Some(line) = s.lines().next() {
                    let pb = PathBuf::from(line.trim());
                    if pb.exists() { return Some(pb); }
                }
            }
        }
    }

    // 3. Tool-specific built-in candidates.
    let mut candidates: Vec<String> = extra_candidates.iter().map(|s| s.to_string()).collect();
    #[cfg(windows)]
    {
        match name {
            "git" => {
                candidates.extend([
                    "C:\\Program Files\\Git\\cmd\\git.exe".into(),
                    "C:\\Program Files\\Git\\bin\\git.exe".into(),
                    "C:\\Program Files (x86)\\Git\\cmd\\git.exe".into(),
                    expand_env("%LOCALAPPDATA%\\Programs\\Git\\cmd\\git.exe"),
                ]);
                if let Some(p) = find_github_desktop_git() {
                    candidates.push(p.display().to_string());
                }
            }
            "cargo" => {
                candidates.push(expand_env("%USERPROFILE%\\.cargo\\bin\\cargo.exe"));
                candidates.push("C:\\Program Files\\Rust\\cargo.exe".into());
            }
            _ => {}
        }
    }
    #[cfg(not(windows))]
    {
        match name {
            "git" => candidates.extend(["/usr/bin/git".into(), "/usr/local/bin/git".into()]),
            "cargo" => {
                if let Ok(home) = std::env::var("HOME") {
                    candidates.push(format!("{home}/.cargo/bin/cargo"));
                }
                candidates.push("/usr/local/bin/cargo".into());
            }
            _ => {}
        }
    }

    for c in &candidates {
        let pb = PathBuf::from(c);
        if pb.exists() { return Some(pb); }
    }
    None
}

#[cfg(windows)]
fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut name = String::new();
            for nc in chars.by_ref() {
                if nc == '%' { break; }
                name.push(nc);
            }
            if let Ok(v) = std::env::var(&name) {
                out.push_str(&v);
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(windows)]
fn find_github_desktop_git() -> Option<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let root = PathBuf::from(local_app_data).join("GitHubDesktop");
    if !root.exists() { return None; }
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(&root).ok()?.flatten() {
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        if !name_s.starts_with("app-") { continue; }
        let git = entry.path().join("resources").join("app").join("git").join("cmd").join("git.exe");
        if !git.exists() { continue; }
        let mtime = entry.metadata().and_then(|m| m.modified()).ok()?;
        if newest.as_ref().map_or(true, |(t, _)| mtime > *t) {
            newest = Some((mtime, git));
        }
    }
    newest.map(|(_, p)| p)
}

/// Convenience: locate git, falling back to the bare name "git" so
/// `Command::new(&git_exe())` still resolves via PATH if find_tool
/// returns None for any reason. Used by callers that don't need a
/// hard error when git is absent.
pub fn git_exe() -> PathBuf {
    find_tool("git", &[]).unwrap_or_else(|| PathBuf::from("git"))
}
