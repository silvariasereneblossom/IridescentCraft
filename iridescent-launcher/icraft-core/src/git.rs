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
    let out = base_command(cwd).args(args).output()?;
    if !out.status.success() {
        // Some git messages (commit "nothing to commit", refusing to
        // touch sparse paths, etc.) go to stdout instead of stderr.
        // Include both so the operator sees the real reason in the log.
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let detail = match (stderr.trim().is_empty(), stdout.trim().is_empty()) {
            (false, false) => format!("{} | {}", stderr.trim(), stdout.trim()),
            (false, true)  => stderr.trim().to_string(),
            (true,  false) => stdout.trim().to_string(),
            (true,  true)  => "(no output)".to_string(),
        };
        return Err(anyhow!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            out.status.code().unwrap_or(-1),
            detail
        ));
    }
    Ok(out)
}

/// Build a base `git` Command with prompt-suppressing env vars applied.
/// GIT_TERMINAL_PROMPT=0 -- git's classic credential read fails fast
/// instead of stalling on a TTY read or, in a GUI context, popping
/// the system credential manager.
/// GCM_INTERACTIVE=Never -- Git Credential Manager (the default helper
/// on modern Git for Windows installs) skips its browser-OAuth
/// fallback. Combined, no credential prompt of any kind reaches the
/// operator -- if the configured auth (extraHeader bearer token, or
/// nothing) is rejected, git returns a clean 401/403 error instead.
fn base_command(cwd: &Path) -> Command {
    let mut cmd = Command::new(git_exe());
    cmd.current_dir(cwd);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GCM_INTERACTIVE", "Never");
    cmd
}

/// `git rev-parse HEAD` -> short SHA. Returns `None` if the path isn't
/// inside a working tree.
pub fn head_sha(cwd: &Path) -> Result<Option<String>> {
    let out = base_command(cwd).args(["rev-parse", "HEAD"]).output()?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&out.stdout).trim().to_string()))
}

/// `git status --porcelain` with `Ok(None)` if not a working tree.
pub fn status_porcelain(cwd: &Path) -> Result<Option<String>> {
    let out = base_command(cwd).args(["status", "--porcelain"]).output()?;
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

/// `git commit -m <msg>` with scratch user.email + user.name passed
/// inline via `-c`. Use for ephemeral / cache repos that don't have
/// global identity configured -- otherwise git refuses to commit
/// with `*** Please tell me who you are`. Doesn't pollute the global
/// or repo-local config; the values live only for this invocation.
pub fn commit_with_identity(cwd: &Path, message: &str) -> Result<()> {
    run_git(cwd, &[
        "-c", "user.email=icraft-launcher@local",
        "-c", "user.name=icraft-launcher",
        "commit", "-m", message,
    ]).map(|_| ())
}

/// True when there are no staged changes (`git diff --cached --quiet`
/// returns 0). False when there are staged changes (exit 1) OR when
/// the diff command itself fails (we treat 'unknown' as 'has changes'
/// so the caller still attempts the commit and surfaces any real
/// underlying error).
pub fn staged_is_empty(cwd: &Path) -> Result<bool> {
    let status = base_command(cwd).args(["diff", "--cached", "--quiet"]).status()?;
    Ok(status.success())
}

pub fn push(cwd: &Path) -> Result<()> {
    run_git(cwd, &["push"]).map(|_| ())
}

/// Push using a PAT via `http.extraHeader=AUTHORIZATION: bearer <PAT>`.
/// Also disables the credential helper for this invocation so a
/// malformed / insufficient-scope PAT fails cleanly with an explicit
/// error instead of falling back to Git Credential Manager's
/// browser-based OAuth prompt.
pub fn push_with_pat(cwd: &Path, pat: &str) -> Result<()> {
    let header = format!("http.extraHeader=AUTHORIZATION: bearer {pat}");
    run_git(cwd, &["-c", &header, "-c", "credential.helper=", "push"]).map(|_| ())
}

/// Build a `Command` that runs git in `cwd` with `http.extraHeader`
/// set to bearer-auth `pat` when provided. Use for any network op
/// (clone, fetch, push, pull) where you'd otherwise hit Windows
/// Credential Manager popups or Git Credential Manager browser-OAuth
/// flows.
///
/// When a PAT is supplied, also passes `-c credential.helper=` to
/// disable the configured credential helper for this single
/// invocation. Combined with the bearer header, this guarantees the
/// PAT is the only auth attempted -- if it's wrong/insufficient,
/// the operation fails with a real HTTP 401/403 error in the log
/// pane instead of the operator seeing a browser pop and trying to
/// guess what's wrong.
pub fn authed_command(cwd: &Path, pat: Option<&str>) -> Command {
    let mut cmd = base_command(cwd);
    if let Some(p) = pat {
        cmd.arg("-c").arg(format!("http.extraHeader=AUTHORIZATION: bearer {p}"));
        cmd.arg("-c").arg("credential.helper=");
    }
    cmd
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
