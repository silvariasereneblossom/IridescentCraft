//! Thin wrapper around the system `git` binary.
//!
//! We don't pull in a git library (libgit2 / gix) because:
//!   - the only operations left are the operator-clicked self-update paths
//!     (clone / fetch / pull / show in a tree the user already manages)
//!   - shelling out matches the existing .bat/.ps1 behavior so users'
//!     ssh-agent / credential helper just works
//!   - keeps the binary small (~5MB vs ~15MB with libgit2)
//!
//! The log push does NOT go through here any more (see `logpush`): since
//! 2026-10-11 it talks to the GitHub API and starts no process at all.
//!
//! Every git child is started by [`Git`], which guarantees four things
//! (the reasons are in `subprocess.rs` and in the 2026-10-11 postmortem):
//!
//!   1. **It cannot wait on a human.** No console window, stdin on the null
//!      device, stdout/stderr on pipes, `GIT_TERMINAL_PROMPT=0`, no askpass
//!      program, `GCM_INTERACTIVE=Never`, and `GIT_ASK_YESNO=false`: Git for
//!      Windows asks "Unlink of file failed. Should I try again? (y/n)" only
//!      when stdin and stderr are consoles, and runs `GIT_ASK_YESNO` instead
//!      of asking when that is set (compat/mingw.c, `ask_yes_no_if_possible`).
//!   2. **It is bounded.** [`GIT_TIMEOUT`], then the whole process tree is
//!      killed.
//!   3. **It does no housekeeping.** `gc.auto=0` and `maintenance.auto=false`
//!      on every call, so a fetch never turns into a repack.
//!   4. **The token is never on a command line.** It reaches git as
//!      configuration through the environment (`GIT_CONFIG_COUNT` /
//!      `GIT_CONFIG_KEY_n` / `GIT_CONFIG_VALUE_n`, git 2.31+), scoped to
//!      github.com. A process listing shows `git fetch origin --depth=1` and
//!      nothing else; the environment belongs to that one child (and the
//!      helpers it starts), not to the launcher or the JVM.

use anyhow::{anyhow, Result};
use std::fs::File;
use std::path::Path;
use std::process::{Command, Output};
use std::time::Duration;

use crate::tools::git_exe;

/// Hard limit for one git child. One constant, shared with the log push.
pub const GIT_TIMEOUT: Duration = crate::subprocess::STEP_LIMIT;

/// One git invocation. Build with [`git`], add arguments, then run it.
pub struct Git {
    cmd: Command,
    args: Vec<String>,
    /// The token and its encoded form, to keep out of anything we log.
    secrets: Vec<String>,
    limit: Duration,
}

/// git in `cwd`, authenticated to github.com with `pat` when there is one.
///
/// Why Basic and not Bearer: GitHub's REST API accepts `Authorization: Bearer
/// <pat>`, but the Git smart-HTTP endpoint wants Basic auth with the PAT as
/// the password (the `https://x-access-token:<pat>@github.com/...` pattern).
/// With a PAT the configured credential helper is switched off for the call,
/// so a bad token is a clean HTTP 401/403 instead of a fallback prompt.
pub fn git(cwd: &Path, pat: Option<&str>) -> Git {
    let mut cmd = Command::new(git_exe());
    cmd.current_dir(cwd);
    let secrets = apply_env(&mut cmd, pat);
    Git { cmd, args: Vec::new(), secrets, limit: GIT_TIMEOUT }
}

/// Header that carries the token, only ever sent to this host.
const AUTH_CONFIG_KEY: &str = "http.https://github.com/.extraHeader";

fn apply_env(cmd: &mut Command, pat: Option<&str>) -> Vec<String> {
    // Nothing may prompt: not git's terminal read, not an askpass program, not
    // Git Credential Manager's browser flow, not the unlink retry question.
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GCM_INTERACTIVE", "Never");
    cmd.env("GIT_ASKPASS", "");
    cmd.env("SSH_ASKPASS", "");
    cmd.env("GIT_ASK_YESNO", "false");

    let mut config: Vec<(&str, String)> = vec![
        ("gc.auto", "0".to_string()),
        ("maintenance.auto", "false".to_string()),
    ];
    let mut secrets = Vec::new();
    if let Some(pat) = pat {
        let encoded = basic_auth_b64(pat);
        config.push((AUTH_CONFIG_KEY, format!("Authorization: Basic {encoded}")));
        config.push(("credential.helper", String::new()));
        secrets.push(pat.to_string());
        secrets.push(encoded);
    }
    cmd.env("GIT_CONFIG_COUNT", config.len().to_string());
    for (i, (key, value)) in config.iter().enumerate() {
        cmd.env(format!("GIT_CONFIG_KEY_{i}"), key);
        cmd.env(format!("GIT_CONFIG_VALUE_{i}"), value);
    }
    secrets
}

impl Git {
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        for arg in args {
            self.args.push(arg.as_ref().to_string());
        }
        self
    }

    pub fn timeout(mut self, limit: Duration) -> Self {
        self.limit = limit;
        self
    }

    /// `git fetch origin --depth=1`, for log lines and errors. Arguments never
    /// carry a credential; this is scrubbed anyway.
    pub fn describe(&self) -> String {
        self.scrub(&format!("git {}", self.args.join(" ")))
    }

    /// Run it. `Ok` whatever the exit status (the caller reads it); `Err` if
    /// git could not be started or was killed at the limit.
    pub fn output(self) -> Result<Output> {
        let what = self.describe();
        let (cmd, limit) = self.into_command();
        crate::subprocess::run_bounded(cmd, &what, limit)
    }

    /// [`Git::output`], with stdout written to `file` (`git show ref:path`).
    pub fn output_to(self, file: File) -> Result<Output> {
        let what = self.describe();
        let (cmd, limit) = self.into_command();
        crate::subprocess::run_bounded_to_file(cmd, file, &what, limit)
    }

    /// Run it and require exit status 0; the error says what git said.
    pub fn run(self) -> Result<Output> {
        let what = self.describe();
        let secrets = self.secrets.clone();
        let out = self.output()?;
        if !out.status.success() {
            return Err(anyhow!(
                "{what} failed (exit {}): {}",
                out.status.code().unwrap_or(-1),
                scrub_all(&failure_detail(&out), &secrets)
            ));
        }
        Ok(out)
    }

    fn scrub(&self, text: &str) -> String {
        scrub_all(text, &self.secrets)
    }

    fn into_command(mut self) -> (Command, Duration) {
        self.cmd.args(&self.args);
        (self.cmd, self.limit)
    }
}

fn scrub_all(text: &str, secrets: &[String]) -> String {
    let mut text = text.to_string();
    for secret in secrets.iter().filter(|s| !s.is_empty()) {
        text = text.replace(secret.as_str(), "***");
    }
    text
}

/// What git printed when it failed. Some messages (commit "nothing to
/// commit", refusing to touch sparse paths, etc.) go to stdout instead of
/// stderr, so both are included.
pub fn failure_detail(out: &Output) -> String {
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    match (stderr.trim().is_empty(), stdout.trim().is_empty()) {
        (false, false) => format!("{} | {}", stderr.trim(), stdout.trim()),
        (false, true) => stderr.trim().to_string(),
        (true, false) => stdout.trim().to_string(),
        (true, true) => "(no output)".to_string(),
    }
}

/// `git rev-parse HEAD` -> SHA. Returns `None` if the path isn't
/// inside a working tree.
pub fn head_sha(cwd: &Path) -> Result<Option<String>> {
    let out = git(cwd, None).args(["rev-parse", "HEAD"]).output()?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&out.stdout).trim().to_string()))
}

/// `git status --porcelain` with `Ok(None)` if not a working tree.
pub fn status_porcelain(cwd: &Path) -> Result<Option<String>> {
    let out = git(cwd, None).args(["status", "--porcelain"]).output()?;
    if !out.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&out.stdout).into_owned()))
}

/// Encode `x-access-token:<pat>` as base64 for HTTP Basic auth.
/// The username "x-access-token" is the GitHub-recommended literal
/// that signals "the password is a PAT, not a password" -- works
/// for both classic and fine-grained PATs.
fn basic_auth_b64(pat: &str) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .encode(format!("x-access-token:{pat}"))
}

/// Walk parents until a `.git` directory is found.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    const FAKE_PAT: &str = "github_pat_FAKE0000000000000000_notarealtoken";

    fn env_of(cmd: &Command, name: &str) -> Option<String> {
        cmd.get_envs()
            .find(|(key, _)| *key == OsStr::new(name))
            .and_then(|(_, value)| value.map(|v| v.to_string_lossy().into_owned()))
    }

    /// The whole point of the 2026-10-11 security finding: whatever shows in a
    /// process listing (program + arguments) must not contain the token, its
    /// base64 form, or the header that carries it.
    #[test]
    fn the_command_line_carries_no_credential() {
        let cwd = std::env::temp_dir();
        for args in [
            vec!["fetch", "origin", "main", "--depth=1"],
            vec!["clone", "--filter=blob:none", "--sparse", "--depth=1", "https://github.com/o/r.git", "."],
            vec!["pull", "--ff-only"],
            vec!["push"],
        ] {
            let g = git(&cwd, Some(FAKE_PAT)).args(args.iter().copied());
            let described = g.describe();
            let (cmd, _) = g.into_command();
            let encoded = basic_auth_b64(FAKE_PAT);
            let mut argv = vec![cmd.get_program().to_string_lossy().into_owned()];
            argv.extend(cmd.get_args().map(|a| a.to_string_lossy().into_owned()));
            assert_eq!(&argv[1..], args.as_slice(), "arguments are passed through untouched");
            for shown in argv.iter().chain(std::iter::once(&described)) {
                assert!(!shown.contains(FAKE_PAT), "token on the command line: {shown}");
                assert!(!shown.contains(&encoded), "encoded token on the command line: {shown}");
                let lower = shown.to_lowercase();
                assert!(!lower.contains("authorization"), "auth header on the command line: {shown}");
                assert!(!lower.contains("extraheader"), "auth option on the command line: {shown}");
                assert!(!lower.contains("x-access-token"), "{shown}");
            }
        }
    }

    #[test]
    fn the_token_travels_in_the_environment_scoped_to_github() {
        let (cmd, limit) = git(&std::env::temp_dir(), Some(FAKE_PAT)).args(["fetch"]).into_command();
        assert_eq!(limit, GIT_TIMEOUT);
        assert_eq!(env_of(&cmd, "GIT_CONFIG_COUNT").as_deref(), Some("4"));
        let pairs: Vec<(String, String)> = (0..4)
            .map(|i| {
                (
                    env_of(&cmd, &format!("GIT_CONFIG_KEY_{i}")).unwrap(),
                    env_of(&cmd, &format!("GIT_CONFIG_VALUE_{i}")).unwrap(),
                )
            })
            .collect();
        assert_eq!(pairs[0], ("gc.auto".to_string(), "0".to_string()));
        assert_eq!(pairs[1], ("maintenance.auto".to_string(), "false".to_string()));
        assert_eq!(pairs[2].0, "http.https://github.com/.extraHeader");
        assert_eq!(pairs[2].1, format!("Authorization: Basic {}", basic_auth_b64(FAKE_PAT)));
        assert_eq!(pairs[3], ("credential.helper".to_string(), String::new()));
    }

    #[test]
    fn every_call_refuses_to_prompt_and_to_do_housekeeping() {
        // Without a token too: the helper may still answer, but nothing asks.
        let (cmd, _) = git(&std::env::temp_dir(), None).args(["status"]).into_command();
        assert_eq!(env_of(&cmd, "GIT_TERMINAL_PROMPT").as_deref(), Some("0"));
        assert_eq!(env_of(&cmd, "GIT_ASK_YESNO").as_deref(), Some("false"));
        assert_eq!(env_of(&cmd, "GIT_ASKPASS").as_deref(), Some(""));
        assert_eq!(env_of(&cmd, "SSH_ASKPASS").as_deref(), Some(""));
        assert_eq!(env_of(&cmd, "GCM_INTERACTIVE").as_deref(), Some("Never"));
        assert_eq!(env_of(&cmd, "GIT_CONFIG_COUNT").as_deref(), Some("2"));
        assert_eq!(env_of(&cmd, "GIT_CONFIG_KEY_0").as_deref(), Some("gc.auto"));
        assert_eq!(env_of(&cmd, "GIT_CONFIG_KEY_1").as_deref(), Some("maintenance.auto"));
        assert!(env_of(&cmd, "GIT_CONFIG_KEY_2").is_none(), "no auth header without a token");
    }

    #[test]
    fn a_failure_message_never_repeats_the_token() {
        let secrets = vec![FAKE_PAT.to_string(), basic_auth_b64(FAKE_PAT)];
        let said = format!("fatal: bad header 'Authorization: Basic {}' for {FAKE_PAT}", basic_auth_b64(FAKE_PAT));
        let scrubbed = scrub_all(&said, &secrets);
        assert_eq!(scrubbed, "fatal: bad header 'Authorization: Basic ***' for ***");
    }

    /// End to end against a real git when the machine has one (the CI runner
    /// does): the settings arrive, from the environment, and git itself runs
    /// with nothing to read and no console.
    #[test]
    fn a_real_git_sees_the_settings_and_no_terminal() {
        if crate::tools::find_tool("git", &[]).is_none() {
            eprintln!("no git on this machine -- skipped");
            return;
        }
        let cwd = std::env::temp_dir();
        let get = |key: &str| {
            let out = git(&cwd, Some(FAKE_PAT)).args(["config", "--get", key]).output().unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        assert_eq!(get("gc.auto"), "0");
        assert_eq!(get("maintenance.auto"), "false");
        assert_eq!(get("http.https://github.com/.extraHeader"), format!("Authorization: Basic {}", basic_auth_b64(FAKE_PAT)));
        // The header is for github.com only: another host gets none.
        let other = git(&cwd, Some(FAKE_PAT))
            .args(["config", "--get-urlmatch", "http.extraHeader", "https://example.com/o/r.git"])
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&other.stdout).trim().is_empty());
        let ours = git(&cwd, Some(FAKE_PAT))
            .args(["config", "--get-urlmatch", "http.extraHeader", "https://github.com/o/r.git"])
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&ours.stdout).contains("Authorization: Basic"));
        // Where the value came from: the environment ("command line:" is how
        // git labels GIT_CONFIG_* and -c alike), never a file.
        let origin = git(&cwd, Some(FAKE_PAT)).args(["config", "--show-origin", "--get", "gc.auto"]).output().unwrap();
        assert!(String::from_utf8_lossy(&origin.stdout).starts_with("command line:"));
        // A failing command reports through `run`, with the token scrubbed.
        let err = git(&cwd, Some(FAKE_PAT)).args(["rev-parse", "--verify", "refs/heads/no-such-branch-here"]).run().unwrap_err();
        assert!(err.to_string().starts_with("git rev-parse --verify refs/heads/no-such-branch-here failed"), "{err}");
        assert!(!err.to_string().contains(FAKE_PAT));
    }
}
