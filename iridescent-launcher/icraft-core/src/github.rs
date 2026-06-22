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

/// Resolve a bearer token for api.github.com calls. Order:
///   1. `GITHUB_TOKEN`, then `GH_TOKEN` (CI / gh-CLI conventions).
///   2. The launcher's own saved PAT — `ICRAFT_GH_TOKEN` env or the
///      `.icraft_token` file the GUI "Save" button writes (via
///      [`crate::crash::resolve_pat_cfgless`]).
///
/// Step 2 is the important one: before it, a PAT saved in the GUI only
/// authenticated git PUSHES (crash logs / self-update), while the SYNC API
/// (head_sha fallback + the per-sync `compare` call) stayed UNAUTHENTICATED at
/// 60 req/hr per IP. That bucket drains intermittently (worse behind CGNAT /
/// the FRP egress IP), the head fetch then fails, and Cycle proceeds-stale on
/// behind content. Sharing the saved PAT lifts the sync to 5000/hr — the
/// durable fix for the "Sync: API UNREACHABLE -> old content" symptom. A
/// Contents:write push token also satisfies the read-only API; the repo is
/// public so even a fine-grained read token works.
fn auth_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .or_else(|| std::env::var("GH_TOKEN").ok())
        .filter(|s| !s.is_empty())
        .or_else(crate::crash::resolve_pat_cfgless)
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

/// HEAD SHA WITHOUT spending an api.github.com request.
///
/// 2026-06-11: the per-launch + per-180s-badge-poll `head_sha` calls were
/// draining the unauth 60/hr-per-IP API bucket (worse behind CGNAT/shared
/// IP), so `z_mirror_or_zip` would intermittently hard-skip the sync ("pulls
/// new files inconsistently"). Instead we read a CI-stamped `.icraft_head_sha`
/// file from the raw CDN (`raw.githubusercontent.com`, not the 60/hr-capped
/// API). The `stamp-head-sha` Action writes the commit SHA on every content
/// push to main, so this tracks HEAD with a ~30s CI lag.
///
/// Robust degradation: two CDN attempts (transient-blip tolerant), then fall
/// back to the rate-limited API `head_sha` if the stamp file is missing
/// (fresh repo before the Action ran) or malformed. So worst case = the old
/// behavior, never worse.
pub fn head_sha_cdn(owner: &str, repo: &str, branch: &str) -> Result<String> {
    for attempt in 0..2u8 {
        match fetch_raw(owner, repo, branch, ".icraft_head_sha") {
            Ok(bytes) => {
                let sha = String::from_utf8_lossy(&bytes).trim().to_string();
                if sha.len() == 40 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Ok(sha);
                }
                log::warn!("[github] .icraft_head_sha from CDN malformed ('{sha}') -- falling back to API");
                break;
            }
            Err(_) if attempt == 0 => continue, // transient blip: retry once
            Err(e) => {
                log::warn!("[github] CDN head fetch failed ({e:#}) -- falling back to API");
                break;
            }
        }
    }
    head_sha(owner, repo, branch)
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
