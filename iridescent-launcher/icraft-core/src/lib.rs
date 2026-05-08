//! IridescentCraft server launcher — core logic.
//!
//! Replaces the .bat / .ps1 / .sh scripts under
//! `.minecraft/server_distribution/` with native Rust. Each module
//! corresponds to one phase or utility from the existing
//! `iridescentserver.bat` orchestrator:
//!
//!   - [`sync`]      — Phase -1 (Z: mirror) and Phase 0 (GitHub diff)
//!   - [`self_update`] — Phase 0.5 (apply staged .new files)
//!   - [`install`]   — Phase 2 (Forge + mods)
//!   - [`mods`]      — strip_client_mods, update_mods, cleanup_stale_jars
//!   - [`eula`]      — Phase 3
//!   - [`run`]       — Phase 4 (java exec with Aikar flags)
//!   - [`crash`]     — Phase 5 (crash capture + push)
//!   - [`diagnose`]  — diagnostic dump
//!   - [`firewall`]  — Windows firewall audit
//!
//! [`config`] holds path constants, Forge version, allowlists. [`log`]
//! provides the trans-flag-colored banner used at startup.

pub mod banner;
pub mod config;
pub mod console;
pub mod crash;
pub mod diagnose;
pub mod eula;
pub mod firewall;
pub mod git;
pub mod github;
pub mod http;
pub mod install;
pub mod mods;
pub mod packwiz;
pub mod run;
pub mod self_update;
pub mod sync;
pub mod tools;

use anyhow::Result;

/// Top-level orchestration: the equivalent of running
/// `iridescentserver.bat` end-to-end. Phases run sequentially; any
/// non-fatal phase logs a warning and continues, fatal phases bubble
/// up the error.
pub struct ServeOptions {
    pub force_sync: bool,
    pub headless: bool,
    pub watchdog: run::WatchdogOptions,
    /// Pipe Java's stdout/stderr through `log::info!` instead of
    /// inheriting the parent's stdio. The GUI sets this so server
    /// output streams into the in-app log pane; the CLI leaves it
    /// off so operators see plain Forge output in their terminal.
    pub pipe_output: bool,
}

impl Default for ServeOptions {
    fn default() -> Self {
        Self {
            force_sync: false,
            headless: false,
            watchdog: run::WatchdogOptions::default(),
            pipe_output: false,
        }
    }
}

pub fn serve(cfg: &config::ServerConfig, opts: ServeOptions) -> Result<i32> {
    banner::startup_banner();

    // Phase 0: incremental GitHub sync (compare API + raw fetches).
    // Phase -1 used to do a separate Z: drive mirror copy here. After
    // the Z: dependency was retired and z_mirror_or_zip was rewritten
    // to call github_diff, running both phases just made the same
    // call twice -- and worse, the Phase -1 variant was hardcoded to
    // force=true, clearing the SHA marker so Phase 0 always full-
    // zipped. Single phase now: respect opts.force_sync, default
    // incremental.
    if let Err(e) = sync::github_diff(cfg, opts.force_sync) {
        log::warn!("[sync] GitHub diff sync failed: {e}");
    }

    // Phase 0.5: apply staged self-update if any
    if self_update::apply_staged(cfg)? {
        log::info!("[self-update] Relaunching with new binary...");
        return self_update::relaunch(cfg);
    }

    // Phase 1: ensure java
    install::check_java()?;

    // Phase 2: Forge + mods (idempotent — skip if already present)
    install::ensure_forge(cfg)?;
    install::ensure_mods(cfg)?;

    // Phase 2.6 / 2.7 / 2.8: mod folder hygiene
    mods::strip_client_mods(cfg)?;
    mods::update_mods(cfg)?;
    mods::cleanup_stale_jars(cfg)?;

    // Phase 3: EULA
    eula::accept(cfg)?;

    // Phase 4: launch the server (with watchdog)
    let exit_code = if opts.pipe_output {
        run::launch_server_watched_piped(cfg, opts.watchdog)?
    } else {
        run::launch_server_watched(cfg, opts.watchdog)?
    };

    // Phase 5: post-exit handling
    if exit_code != 0 {
        crash::capture_crash_log(cfg, exit_code)?;
    } else {
        log::info!("Server stopped normally.");
    }
    crash::push_logs(cfg)?;

    Ok(exit_code)
}
