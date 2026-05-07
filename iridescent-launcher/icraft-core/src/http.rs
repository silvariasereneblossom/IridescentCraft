//! Generic HTTP download with redirect-following + size validation +
//! retry. Used by mod-download flows where each entry has a list of
//! candidate URLs and we want to walk them until one succeeds.

use anyhow::{anyhow, Result};
use std::io::Read;
use std::path::Path;
use std::time::Duration;

/// Minimum body size accepted as a successful download. Anything below
/// is treated as a corrupt/redirect-loop response and rejected.
/// PS1 used 1000 bytes; we mirror it.
pub const MIN_BODY_BYTES: u64 = 1000;

/// Download `url` to `dest`. Single attempt. Returns Ok with the body
/// size on success. Caller handles retry / fallback URL walking.
pub fn fetch_to_file(url: &str, dest: &Path, user_agent: &str) -> Result<u64> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .user_agent(user_agent)
        // Follow redirects; CurseForge does 307 -> 302 -> 200.
        .redirects(10)
        .build();
    let resp = agent.get(url).call()
        .map_err(|e| anyhow!("GET {url}: {e}"))?;

    let mut tmp_path = dest.to_path_buf();
    tmp_path.set_extension("partial");
    let mut sink = std::fs::File::create(&tmp_path)
        .map_err(|e| anyhow!("create {}: {e}", tmp_path.display()))?;
    let mut body = resp.into_reader();
    let mut buf = [0u8; 64 * 1024];
    let mut total: u64 = 0;
    loop {
        let n = body.read(&mut buf).map_err(|e| anyhow!("read {url}: {e}"))?;
        if n == 0 { break; }
        std::io::Write::write_all(&mut sink, &buf[..n])
            .map_err(|e| anyhow!("write {}: {e}", tmp_path.display()))?;
        total += n as u64;
    }
    drop(sink);

    if total < MIN_BODY_BYTES {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(anyhow!("body too small ({} bytes) — likely 4xx redirect or empty", total));
    }
    std::fs::rename(&tmp_path, dest)
        .map_err(|e| anyhow!("rename {} -> {}: {e}", tmp_path.display(), dest.display()))?;
    Ok(total)
}

/// Walk `urls` in order, each with `attempts_per_url` attempts.
/// Returns the URL that succeeded plus body size. Last error bubbles
/// up if every attempt fails.
pub fn fetch_with_fallbacks(
    urls: &[String],
    dest: &Path,
    user_agent: &str,
    attempts_per_url: u32,
) -> Result<(String, u64)> {
    let mut last_err: Option<anyhow::Error> = None;
    for url in urls {
        for attempt in 0..attempts_per_url {
            match fetch_to_file(url, dest, user_agent) {
                Ok(bytes) => return Ok((url.clone(), bytes)),
                Err(e) => {
                    log::debug!("[http] {} attempt {}: {}", url, attempt + 1, e);
                    last_err = Some(e);
                    if attempt + 1 < attempts_per_url {
                        std::thread::sleep(Duration::from_secs(1));
                    }
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow!("no urls supplied")))
}
