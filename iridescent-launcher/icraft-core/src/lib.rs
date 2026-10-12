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
//!   - [`crash`]     — Phase 5 (crash capture; the GitHub token)
//!   - [`logpush`]   — the log mirror: staged at exit, pushed in the background
//!     through the GitHub API, never between a stop and a start
//!   - [`subprocess`] — child processes with no console, no stdin and a time limit
//!   - [`diagnose`]  — diagnostic dump
//!   - [`firewall`]  — Windows firewall audit
//!   - [`restart_policy`] — uptime restarts (4 h empty / 12 h with players)
//!   - [`backup`]    — world backups in the stopped window (every 12 h, keep 2)
//!
//! Server Customizer, the world (on demand only -- none of this is called from
//! [`serve`] or a Cycle):
//!
//!   - [`nbt`], [`anvil`], [`worlddata`] — read a world: NBT, region files,
//!     dimensions, player and mod data
//!   - [`protection`] — the chunks a regeneration must keep (beds, claims,
//!     spawn, waystones, lived-in, manual)
//!   - [`regen`]     — the protection report and regeneration DRY-RUN: reads
//!     only, never writes inside the world folder
//!   - [`regen::exec`] — carrying a plan out. The ONE part that deletes world
//!     data: started only by the operator's typed approval in the window (or,
//!     on a marked scratch copy, from the command line), with the JVM down,
//!     the launch gate held, a verified pinned backup first and a holding
//!     folder to put everything back from. Its two writers are
//!     `anvil::clear_chunks` and `nbt::Doc`. Its only hook into a launch is
//!     [`regen::exec::start_guard`]: no JVM on a world a run left half reset
//!
//! Server Customizer, local settings (the one part that runs on every launch):
//!
//!   - [`cfgedit`]   — config files read with positions, so one value can be
//!     changed in place (TOML, legacy `.cfg`, JSON, `.properties`)
//!   - [`overrides`] — this server's own config values, kept apart from the
//!     pack's files and put back before every JVM start
//!     ([`overrides::apply_at_start`], called from `run::launch_server_inner`;
//!     a no-op without `.icraft_config_overrides.json`)
//!   - [`worldgen`]  — which config files shape new terrain (the catalog the
//!     Customizer's worldgen page and `icraft settings` show)
//!
//! [`config`] holds path constants, Forge version, allowlists. [`log`]
//! provides the trans-flag-colored banner used at startup.

pub mod anvil;
pub mod backup;
pub mod banner;
pub mod cfgedit;
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
pub mod logpush;
pub mod mods;
pub mod nbt;
pub mod overrides;
pub mod packwiz;
pub mod png;
pub mod subprocess;
pub mod protection;
pub mod regen;
pub mod restart_policy;
pub mod run;
pub mod self_update;
pub mod sync;
pub mod tools;
pub mod worlddata;
pub mod worldgen;

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
    /// Run Phase 0.5 (apply staged `.new` self-update files, then re-exec
    /// `<exe> serve` if any applied). Correct for the CLI: `icraft serve`
    /// re-execs cleanly and continues serving. WRONG for the GUI: re-execing
    /// `icraft-gui.exe serve` just opens a fresh IDLE window (the GUI ignores
    /// argv) and the server never starts — and the GUI can't overwrite its own
    /// running exe anyway. The GUI manages its own binary self-update (the
    /// "Update Launcher" button / Cycle step 2 via `apply_and_relaunch_gui`),
    /// so it sets this `false`. Defaults to `true` (CLI behavior).
    pub apply_self_update: bool,
    /// After the JVM exits, only stage the logs and leave the push to
    /// `logpush`'s background worker, so a restart never waits on it. The GUI
    /// sets this: its process lives on and brings the server back up. `false`
    /// (the default, the CLI) pushes before returning, because the process
    /// ends with `serve`.
    pub defer_log_push: bool,
}

impl Default for ServeOptions {
    fn default() -> Self {
        Self {
            force_sync: false,
            headless: false,
            watchdog: run::WatchdogOptions::default(),
            pipe_output: false,
            apply_self_update: true,
            defer_log_push: false,
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

    // Phase 0.5: apply staged self-update if any (CLI only — see
    // ServeOptions::apply_self_update). For the GUI this is skipped: re-execing
    // `icraft-gui.exe serve` opens an idle window instead of serving, so the GUI
    // applies its own binary update out-of-band (Cycle step 2 / Update Launcher)
    // and leaves this off.
    if opts.apply_self_update && self_update::apply_staged(cfg)? {
        log::info!("[self-update] Relaunching with new binary...");
        return self_update::relaunch(cfg);
    }

    // Phase 1: ensure java
    install::check_java()?;

    // Phase 2: Forge + mods (idempotent — skip if already present)
    install::ensure_forge(cfg)?;
    install::ensure_mods(cfg)?;

    // Phase 2.6 / 2.7 / 2.8: mod folder hygiene. cleanup_stale_jars is now
    // manifest-aware (SHA-256 hash-verify against custom_jars_manifest.json), so
    // it catches same-filename custom-jar content drift on EVERY launch —
    // including when github_diff short-circuited on a current marker. This is
    // the "always run the jar verify even when marker == HEAD" half of the
    // Cycle-reliability fix.
    mods::strip_client_mods(cfg)?;
    mods::update_mods(cfg)?;
    mods::cleanup_stale_jars(cfg)?;

    // Phase 2.9: expected-state verify. The other "always run, independent of
    // the git SHA" check: walk the managed roots (kubejs/config/mods/.index)
    // against expected_state.json and report/remove repo-deleted files that a
    // non-deleting overlay would otherwise strand. Runs on every serve()
    // regardless of which sync path ran (or whether it short-circuited / failed
    // open) — github_diff no longer owns this. Deletions are dry-run by default
    // (see sync::EXPECTED_STATE_DRY); the report is produced every launch.
    sync::verify_expected_state(cfg);

    // Phase 3: EULA
    eula::accept(cfg)?;

    // Phase 3.5: world backup, if one is due or was requested. Every path that
    // reaches here has the JVM down (GUI Cycle, restart-policy and
    // crash-recovery Cycles, CLI serve), and restarts come ~6x a day, so this
    // is usually a no-op. Never fatal: a failed backup is logged and the
    // server starts anyway.
    backup::stopped_window(cfg);

    // Phase 4: launch the server (with watchdog)
    let exit_code = if opts.pipe_output {
        run::launch_server_watched_piped(cfg, opts.watchdog)?
    } else {
        run::launch_server_watched(cfg, opts.watchdog)?
    };

    // Phase 5: post-exit handling. Nothing here may hold up the next start:
    // the logs are copied aside (local files) and the push itself happens off
    // this thread, after the server is back up (see logpush.rs). Only a
    // caller whose process ends with this call (the CLI) pushes inline, and
    // that push is bounded.
    if exit_code != 0 {
        if let Err(e) = crash::capture_crash_log(cfg, exit_code) {
            log::warn!("[crash] could not write the crash log: {e}");
        }
    } else {
        log::info!("Server stopped normally.");
    }
    // The debug logs are mirrored only for a run that ended in a crash.
    let crashed = exit_code != 0;
    if opts.defer_log_push {
        logpush::stage_and_defer(cfg, crashed);
    } else {
        let _ = logpush::push_now(cfg, crashed);
    }

    Ok(exit_code)
}
