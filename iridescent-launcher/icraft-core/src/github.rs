//! GitHub REST API client — just enough surface for the diff-sync flow.
//!
//! Three operations needed:
//!   - `resolve_head_sha(owner, repo, branch, freshness)` — branch HEAD, from
//!     the API when it must be exact (see `HeadFreshness`)
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
    /// `head` relative to `base`: "ahead" | "behind" | "identical" |
    /// "diverged". The sync reads this to refuse a BACKWARDS move — see
    /// `sync::github_diff`.
    #[serde(default)]
    pub status: String,
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
///
/// `no_cache`: send revalidation headers. Content fetches keyed by an
/// immutable commit SHA leave this false (they're cacheable BY DEFINITION);
/// the mutable-ref reads (branch HEAD, the `.icraft_head_sha` stamp) set it so
/// no intermediary can hand us a hours-old answer.
fn get_with_fallback(url: &str, no_cache: bool) -> std::result::Result<ureq::Response, ureq::Error> {
    let build = || {
        let req = agent().get(url);
        if no_cache {
            req.set("Cache-Control", "no-cache").set("Pragma", "no-cache")
        } else {
            req
        }
    };
    let authed = auth_token().is_some();
    match maybe_auth(build()).call() {
        Err(ureq::Error::Status(code, resp)) if authed && (code == 401 || code == 403) => {
            log::warn!(
                "[github] HTTP {code} with a configured token (revoked/expired PAT?) -- \
                 retrying unauthenticated. Rotate or unset GITHUB_TOKEN/GH_TOKEN on this box."
            );
            drop(resp);
            build().call()
        }
        other => other,
    }
}

/// How fresh a HEAD reading has to be for what the caller does with it.
///
/// This is the 2026-09-24 fix for the stale-launcher defect (failure-modes §9,
/// hit 2026-09-11 and 2026-09-23). See [`resolve_head_sha`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HeadFreshness {
    /// The reading DECIDES what gets installed (the sync: it picks the commit
    /// every file — including `icraft-gui.exe` — is fetched at, and is written
    /// to `.icraft_last_sha`). Must be the real branch tip. Worth an API
    /// request; degrades to the stamp only when the API is unusable.
    Authoritative,
    /// The reading only PAINTS a badge (the GUI polls every 180 s). A few
    /// minutes of lag is cosmetic, so when we'd otherwise burn the 60/hr
    /// unauthenticated API bucket, take the free CDN stamp instead.
    Display,
}

/// Branch HEAD from the GitHub API — the authoritative answer.
pub fn head_sha(owner: &str, repo: &str, branch: &str) -> Result<String> {
    let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/{branch}");
    let resp = get_with_fallback(&url, true)
        .with_context(|| format!("GET {url}"))?;
    let commit: Commit = resp.into_json().context("parsing /commits response")?;
    Ok(commit.sha)
}

/// HEAD SHA for `branch`, at the freshness the caller actually needs.
///
/// **Why this exists (2026-09-24).** The previous entry point read
/// `.icraft_head_sha` from the raw CDN *first* and only fell back to the API.
/// That is not a HEAD reading — it is a reading of whatever the `stamp-head-sha`
/// Action last committed, and it is stale BY CONSTRUCTION on exactly the
/// commits that matter:
///
///   * GitHub does not trigger workflows for pushes made with the default
///     `GITHUB_TOKEN` (its own loop guard). `build-icraft-gui.yml` pushes the
///     rebuilt `icraft-gui.exe` with that token, so `stamp-head-sha` NEVER runs
///     on a "icraft-gui: CI rebuild" commit — verified 2026-09-24: the stamp
///     sat at `d45815a1` (the SOURCE commit) while the exe lived one commit
///     later at `319c6ecd`, and the whole run history of that Action contains
///     no CI-rebuild commit.
///   * Because the CI exe always lands one commit AFTER the source change, a
///     sync pinned to the stamp gets the new plain files and the PREVIOUS exe.
///     The launcher feature then silently never runs: the 09-18 occurrence left
///     the nightly-restart watcher dead for three nights; the 09-23 one
///     installed a 12,354,048-byte exe when origin's was 12,374,016.
///   * The marker then EQUALS the stamp, so the next Cycle short-circuits
///     "up to date" and the wrong exe is pinned until some unrelated human push
///     happens to move the stamp past it.
///
/// So: [`HeadFreshness::Authoritative`] (the sync) asks the API, which cannot
/// lag, and only degrades to the stamp — loudly — when the API is unusable.
/// [`HeadFreshness::Display`] (the badge) keeps the free path when there is no
/// token, so a 180 s poll still can't drain the 60/hr bucket the sync needs.
///
/// Request budget. With a PAT configured (the box's normal state, and now the
/// same token the sync/self-update/crash-push already use) both paths are API
/// reads against the 5000/hr authenticated bucket: 20/hr of badge polling plus
/// one per Cycle. With no token: the badge spends 0 API requests and the sync
/// spends 1 per Cycle out of 60/hr — and when that bucket IS drained, the
/// stamp fallback below catches it rather than failing the sync.
pub fn resolve_head_sha(
    owner: &str,
    repo: &str,
    branch: &str,
    freshness: HeadFreshness,
) -> Result<String> {
    // Badge + no token: the stamp is free and a cosmetic lag is acceptable.
    // (With a token there is no reason not to be exact.)
    if freshness == HeadFreshness::Display && auth_token().is_none() {
        if let Some(sha) = head_sha_stamp(owner, repo, branch) {
            return Ok(sha);
        }
        return head_sha(owner, repo, branch);
    }

    match head_sha(owner, repo, branch) {
        Ok(sha) => Ok(sha),
        Err(e) => {
            log::warn!("[github] authoritative HEAD fetch failed ({e:#}) -- trying the CDN stamp");
            match head_sha_stamp(owner, repo, branch) {
                Some(sha) => {
                    log::warn!(
                        "[github] !!! using the CDN stamp {} as HEAD. It is NOT the branch tip: it \
                         never advances onto a CI-pushed commit, so a just-rebuilt icraft-gui.exe \
                         can be missed. Most likely cause: the 60/hr unauthenticated API bucket -- \
                         save a GitHub PAT in the launcher to make this exact.",
                        &sha[..sha.len().min(7)]
                    );
                    Ok(sha)
                }
                None => Err(e),
            }
        }
    }
}

/// Read the CI-stamped `.icraft_head_sha` off the raw CDN. `None` on any
/// failure — callers decide how to degrade.
///
/// Two attempts (transient-blip tolerant). Cache-busted: this is a MUTABLE ref
/// read (`/{branch}/`), which the CDN is free to serve from cache, so we send
/// revalidation headers and a throwaway query param. Note that busting the
/// cache does NOT make the value a true HEAD — see [`resolve_head_sha`] for why
/// the stamp lags by construction; this only removes the *extra* CDN lag on top.
fn head_sha_stamp(owner: &str, repo: &str, branch: &str) -> Option<String> {
    for attempt in 0..2u8 {
        match fetch_raw_uncached(owner, repo, branch, ".icraft_head_sha") {
            Ok(bytes) => {
                let sha = String::from_utf8_lossy(&bytes).trim().to_string();
                if sha.len() == 40 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Some(sha);
                }
                log::warn!("[github] .icraft_head_sha from CDN malformed ('{sha}')");
                return None;
            }
            Err(_) if attempt == 0 => continue, // transient blip: retry once
            Err(e) => {
                log::warn!("[github] CDN stamp fetch failed ({e:#})");
                return None;
            }
        }
    }
    None
}

pub fn compare(owner: &str, repo: &str, base: &str, head: &str) -> Result<Compare> {
    let url = format!("https://api.github.com/repos/{owner}/{repo}/compare/{base}...{head}");
    let resp = get_with_fallback(&url, false)
        .with_context(|| format!("GET {url}"))?;
    let compare: Compare = resp.into_json().context("parsing /compare response")?;
    Ok(compare)
}

/// Download a raw file from raw.githubusercontent.com. Returns the
/// entire body as bytes; caller writes to disk. raw.githubusercontent.com
/// isn't rate-limited the same way as api.github.com, but we pass the
/// auth header anyway (harmless if not needed).
///
/// Callers pass a 40-char commit SHA for `sha`, which makes the URL immutable
/// and the response safely cacheable. For a MUTABLE ref (a branch name) use
/// [`fetch_raw_uncached`] instead.
pub fn fetch_raw(owner: &str, repo: &str, sha: &str, path: &str) -> Result<Vec<u8>> {
    fetch_raw_inner(owner, repo, sha, path, false)
}

/// [`fetch_raw`] for a MUTABLE ref: revalidation headers plus a throwaway
/// query param, so neither the CDN edge nor a proxy in between can answer from
/// a cached copy. Only the `.icraft_head_sha` stamp read needs this.
fn fetch_raw_uncached(owner: &str, repo: &str, git_ref: &str, path: &str) -> Result<Vec<u8>> {
    fetch_raw_inner(owner, repo, git_ref, path, true)
}

fn fetch_raw_inner(
    owner: &str,
    repo: &str,
    git_ref: &str,
    path: &str,
    no_cache: bool,
) -> Result<Vec<u8>> {
    let mut url = format!("https://raw.githubusercontent.com/{owner}/{repo}/{git_ref}/{path}");
    if no_cache {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        url.push_str(&format!("?icraft_cb={nonce}"));
    }
    let resp = get_with_fallback(&url, no_cache)
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
