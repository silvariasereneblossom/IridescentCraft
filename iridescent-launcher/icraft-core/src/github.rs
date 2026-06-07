//! GitHub REST API client — just enough surface for the diff-sync flow.
//!
//! Three operations needed:
//!   - `head_sha(owner, repo, branch)` — `/repos/{o}/{r}/commits/{b}`
//!   - `compare(owner, repo, base, head)` — `/repos/{o}/{r}/compare/B...H`
//!   - `fetch_raw(url)` -> bytes — raw.githubusercontent.com content
//!   - `fetch_zip(url)` -> bytes — codeload.github.com / archive zip
//!
//! Auth: optional. Reads `GITHUB_TOKEN` (or fallback `GH_TOKEN`) from env.
//! If present, sends `Authorization: Bearer <token>` on every request:
//! lifts the per-IP API limit from 60/hr (unauthenticated) to 5000/hr
//! (authenticated). If absent, falls back to anonymous and keeps the
//! original behavior.
//!
//! 2026-05-18 fix: pre-fix icraft-gui burnt the unauth 60/hr bucket via
//! a 3s polling loop during long tasks, which then locked self-update
//! out for the rest of the hour. Auth is the durable answer.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::io::Read;
use std::time::Duration;

const USER_AGENT: &str = "IridescentCraft-Server/icraft";

/// Read `GITHUB_TOKEN`, fall back to `GH_TOKEN`. Both are common
/// conventions (gh CLI uses GH_TOKEN; many CI tools set GITHUB_TOKEN).
fn auth_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .or_else(|| std::env::var("GH_TOKEN").ok())
        .filter(|s| !s.is_empty())
}

/// 300 is the documented cap on the GitHub compare API's `files` array.
/// Hitting exactly 300 means the response is silently truncated, so we
/// must fall back to full-zip. The PS1 had a `2026-04-17` regression
/// note about this -- diff-sync silently missed config changes for days
/// because we treated truncated == complete.
pub const COMPARE_FILES_CAP: usize = 300;

#[derive(Debug, Deserialize)]
pub struct Commit {
    pub sha: String,
}

#[derive(Debug, Deserialize)]
pub struct Compare {
    #[serde(default)]
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Deserialize)]
pub struct ChangedFile {
    pub filename: String,
    /// One of: "added", "modified", "removed", "renamed", "changed"
    pub status: String,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .user_agent(USER_AGENT)
        .build()
}

/// Wrap a ureq Request with the auth header if a token is configured.
/// All call sites go through this so the token is consistently applied.
fn maybe_auth(req: ureq::Request) -> ureq::Request {
    match auth_token() {
        Some(t) => req.set("Authorization", &format!("Bearer {t}")),
        None => req,
    }
}

/// GET with dead-token resilience (2026-06-07, docket #97).
///
/// A configured-but-revoked token is WORSE than no token: GitHub answers
/// 401 (or 403 for some revocation states) and the request hard-fails,
/// even though the same request would succeed anonymously. The shared
/// embedded PAT died 2026-06-06 and every box still carrying it in
/// GITHUB_TOKEN/GH_TOKEN lost head-fetch entirely ("HEAD fetch FAILED").
///
/// Behavior: authenticated attempt first; on 401/403 WITH a token
/// configured, log loudly and retry the same URL anonymously (60/hr IP
/// bucket - fine for our call volume per the 2026-05-18 fix). All other
/// errors propagate unchanged.
fn get_with_fallback(url: &str) -> std::result::Result<ureq::Response, ureq::Error> {
    let authed = auth_token().is_some();
    match maybe_auth(agent().get(url)).call() {
        Err(ureq::Error::Status(code, resp)) if authed && (code == 401 || code == 403) => {
            log::warn!(
                "[github] HTTP {code} with a configured token (revoked/expired PAT?) -- \
                 retrying unauthenticated. Rotate or unset GITHUB_TOKEN/GH_TOKEN on this box."
            );
            drop(resp);
            agent().get(url).call()
        }
        other => other,
    }
}

pub fn head_sha(owner: &str, repo: &str, branch: &str) -> Result<String> {
    let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{branch}");
    let resp = get_with_fallback(&url)
        .with_context(|| format!("GET {url}"))?;
    let commit: Commit = resp.into_json().context("parsing /commits response")?;
    Ok(commit.sha)
}

pub fn compare(owner: &str, repo: &str, base: &str, head: &str) -> Result<Compare> {
    let url = format!("https://api.github.com/repos/{owner}/{repo}/compare/{base}...{head}");
    let resp = get_with_fallback(&url)
        .with_context(|| format!("GET {url}"))?;
    let compare: Compare = resp.into_json().context("parsing /compare response")?;
    Ok(compare)
}

/// Download a raw file from raw.githubusercontent.com. Returns the
/// entire body as bytes; caller writes to disk. raw.githubusercontent.com
/// isn't rate-limited the same way as api.github.com, but we pass the
/// auth header anyway (harmless if not needed).
pub fn fetch_raw(owner: &str, repo: &str, sha: &str, path: &str) -> Result<Vec<u8>> {
    let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}");
    let resp = get_with_fallback(&url)
        .with_context(|| format!("GET {url}"))?;
    let mut body = Vec::new();
    resp.into_reader().read_to_end(&mut body)
        .context("reading raw body")?;
    Ok(body)
}

/// Download the branch zip from codeload.github.com. ~100-200MB for
/// IridescentCraft -- large enough that we want a longer timeout and
/// streaming write.
pub fn fetch_zip<W: std::io::Write>(owner: &str, repo: &str, branch: &str, sink: &mut W) -> Result<()> {
    let url = format!("https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip");
    // Same dead-token fallback as get_with_fallback, inlined for the
    // custom long timeout (see that fn's doc; github.com archive downloads
    // don't need auth on a public repo at all).
    let build = || agent().get(&url).timeout(Duration::from_secs(300));
    let resp = match maybe_auth(build()).call() {
        Err(ureq::Error::Status(code, _)) if auth_token().is_some() && (code == 401 || code == 403) => {
            log::warn!("[github] HTTP {code} on zip fetch with a configured token -- retrying unauthenticated.");
            build().call()
        }
        other => other,
    }
    .with_context(|| format!("GET {url}"))?;
    std::io::copy(&mut resp.into_reader(), sink)
        .context("streaming zip body")?;
    Ok(())
}
