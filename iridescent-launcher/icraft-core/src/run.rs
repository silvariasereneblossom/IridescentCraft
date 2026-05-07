//! Phase 4 — launch the Forge dedicated server.
//!
//! Equivalent to the `java @libraries/.../win_args.txt nogui ...` block
//! at the end of `iridescentserver.bat`. The `@argfile` syntax expands
//! to all the dependency jars Forge needs at boot; we use the matching
//! `unix_args.txt` on Linux.

use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::banner::launch_banner;
use crate::config::{ServerConfig, AIKAR_FLAGS};

pub fn launch_server(cfg: &ServerConfig, _headless: bool) -> Result<i32> {
    launch_banner();

    let argfile = pick_argfile(cfg)?;
    log::info!("[run] argfile: {}", argfile.display());

    let mut cmd = Command::new("java");
    cmd.current_dir(&cfg.server_dir);
    for flag in AIKAR_FLAGS { cmd.arg(flag); }
    // `@<argfile>` expands the file's contents into the command line.
    cmd.arg(format!("@{}", argfile.display()));
    cmd.arg("nogui");

    // Inherit stdio so the Forge server writes to our console (and so
    // its stdin can receive operator commands when run interactively).
    cmd.stdin(Stdio::inherit())
       .stdout(Stdio::inherit())
       .stderr(Stdio::inherit());

    log::info!("[run] launching: java {} ...", AIKAR_FLAGS.join(" "));
    let status = cmd.status().context("spawning java")?;
    let code = status.code().unwrap_or(-1);
    log::info!("[run] server exited with code {}", code);
    Ok(code)
}

fn pick_argfile(cfg: &ServerConfig) -> Result<PathBuf> {
    let win = cfg.win_args();
    let unix = cfg.unix_args();
    if cfg!(target_os = "windows") {
        if win.exists() { return Ok(win); }
        if unix.exists() { return Ok(unix); }
    } else {
        if unix.exists() { return Ok(unix); }
        if win.exists() { return Ok(win); }
    }
    anyhow::bail!(
        "neither win_args.txt nor unix_args.txt found under {}",
        cfg.libraries_dir().display()
    );
}
