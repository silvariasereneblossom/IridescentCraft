//! Thin wrapper around the system `git` binary.
//!
//! We don't pull in a git library (libgit2 / gix) because:
//!   - the only operations we need are commit/push/status against a
//!     working tree the user already manages with their own credentials
//!   - shelling out matches the existing .bat/.ps1 behavior so users'
//!     ssh-agent / credential helper just works
//!   - keeps the binary small (~5MB vs ~15MB with libgit2)
//!
//! All functions return Ok only when git's exit status is 0.

use anyhow::{anyhow, Result};
use std::path::Path;
use std::process::{Command, Output};

use crate::tools::git_exe;

fn run_git(cwd: &Path, args: &[&str]) -> Result<Output> {
    let out = Command::new(git_exe()).current_dir(cwd).args(args).output()?;
    if !out.status.success() {
        return Err(anyhow!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(out)
}

/// `git rev-parse HEAD` -> short SHA. Returns `None` if the path isn't
/// inside a working tree.
pub fn head_sha(cwd: &Path) -> Result<Option<String>> {
    let out = Command::new(git_exe())
        .current_dir(cwd)
        .args(["rev-parse", "HEAD"])
        .output()?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&out.stdout).trim().to_string()))
}

/// `git status --porcelain` with `Ok(None)` if not a working tree.
pub fn status_porcelain(cwd: &Path) -> Result<Option<String>> {
    let out = Command::new(git_exe())
        .current_dir(cwd)
        .args(["status", "--porcelain"])
        .output()?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&out.stdout).into_owned()))
}

pub fn add(cwd: &Path, paths: &[&str]) -> Result<()> {
    let mut args = vec!["add"];
    args.extend(paths);
    run_git(cwd, &args).map(|_| ())
}

pub fn commit(cwd: &Path, message: &str) -> Result<()> {
    run_git(cwd, &["commit", "-m", message]).map(|_| ())
}

pub fn push(cwd: &Path) -> Result<()> {
    run_git(cwd, &["push"]).map(|_| ())
}

/// Push using a PAT via `http.extraHeader=AUTHORIZATION: bearer <PAT>`.
/// GitHub-recommended pattern; doesn't leak the PAT into the process
/// command line, doesn't persist into .git/config. The header lives
/// only for the duration of this invocation.
pub fn push_with_pat(cwd: &Path, pat: &str) -> Result<()> {
    let header = format!("http.extraHeader=AUTHORIZATION: bearer {pat}");
    run_git(cwd, &["-c", &header, "push"]).map(|_| ())
}

/// Walk parents until a `.git` directory is found. Used by the crash
/// log push flow to discover whether the install is nested in a working
/// tree (Topology B: Z: mirror with the dev PC clone).
pub fn find_git_root(start: &Path) -> Option<std::path::PathBuf> {
    let mut cur = Some(start);
    while let Some(p) = cur {
        if p.join(".git").exists() {
            return Some(p.to_path_buf());
        }
        cur = p.parent();
    }
    None
}
