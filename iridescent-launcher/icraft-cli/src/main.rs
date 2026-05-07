//! `icraft` — IridescentCraft server CLI.
//!
//! Subcommand surface mirrors the .bat / .ps1 phases under
//! `.minecraft/server_distribution/`. Headless-friendly — every command
//! exits with a non-zero code on failure and writes structured log
//! lines via env_logger so it can run unattended under NSSM / systemd.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

use icraft_core::config::ServerConfig;

#[derive(Parser, Debug)]
#[command(
    name = "icraft",
    version,
    about = "IridescentCraft dedicated server launcher",
    long_about = "Replaces the .bat/.ps1/.sh scripts under .minecraft/server_distribution/ \
                  with a single binary. Every flag-less script becomes a subcommand here."
)]
struct Cli {
    /// Override the server install dir. Defaults to current working dir.
    #[arg(long, global = true)]
    server_dir: Option<PathBuf>,

    /// Verbose logging (sets RUST_LOG=debug if not already set).
    #[arg(short, long, global = true)]
    verbose: bool,

    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Run the full launch sequence: sync -> install -> launch -> post-exit.
    Serve {
        /// Force a full GitHub re-sync instead of diff sync.
        #[arg(long)]
        force_sync: bool,
        /// Seconds without log activity before declaring a boot hang.
        /// 0 disables. Defaults to 900 (15 min).
        #[arg(long, default_value_t = 900)]
        boot_timeout: u64,
        /// Seconds without log activity (post-boot) before declaring
        /// an idle hang. 0 disables. Defaults to 900.
        #[arg(long, default_value_t = 900)]
        idle_timeout: u64,
    },

    /// Phase -1 + 0 sync only -- pull from Z: mirror or GitHub diff.
    Sync {
        #[arg(long)]
        force: bool,
    },

    /// Apply staged self-update (.new files) and relaunch if any applied.
    SelfUpdate,

    /// Verify Java is on PATH (Phase 1).
    CheckJava,

    /// Install Forge if missing (Phase 2).
    InstallForge,

    /// Bulk-download mods if mods/ is empty (Phase 2.5).
    InstallMods,

    /// Strip client-only mods from mods/ (Phase 2.6).
    StripClientMods,

    /// Sync mod jars against the .index allowlist (Phase 2.7).
    UpdateMods {
        /// Log what would be downloaded/removed without touching disk.
        #[arg(long)]
        dry_run: bool,
    },

    /// Remove jars not in the allowlist + customJars (Phase 2.8).
    CleanupJars {
        /// Log what would be removed without touching disk.
        #[arg(long)]
        dry_run: bool,
    },

    /// Write `eula=true` to eula.txt (Phase 3).
    AcceptEula,

    /// Just launch the server (skip sync/install). Aikar flags applied.
    Run {
        #[arg(long, default_value_t = 900)]
        boot_timeout: u64,
        #[arg(long, default_value_t = 900)]
        idle_timeout: u64,
    },

    /// Capture latest crash report + tail of latest.log + push to git.
    PushCrashLogs,

    /// Print a system / install diagnostic report.
    Diagnose,

    /// Audit Windows firewall rule for the icraft port. No-op on Linux.
    FirewallAudit,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    init_logging(cli.verbose);
    // Kill Windows QuickEdit so accidental clicks in the console can't
    // freeze stdout and stall the spawned Java process. No-op elsewhere.
    icraft_core::console::disable_quickedit_mode();

    let cfg = match cli.server_dir {
        Some(p) => ServerConfig::from_path(p),
        None => match ServerConfig::from_cwd_or_default() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[icraft] cwd unreachable: {e}");
                return ExitCode::FAILURE;
            }
        },
    };

    let res = dispatch(&cli.command, &cfg);
    match res {
        Ok(code) => ExitCode::from(code),
        Err(e) => {
            log::error!("{e:#}");
            ExitCode::FAILURE
        }
    }
}

fn dispatch(cmd: &Cmd, cfg: &ServerConfig) -> anyhow::Result<u8> {
    use icraft_core::*;

    match cmd {
        Cmd::Serve { force_sync, boot_timeout, idle_timeout } => {
            let code = icraft_core::serve(cfg, ServeOptions {
                force_sync: *force_sync,
                headless: false,
                watchdog: build_watchdog(*boot_timeout, *idle_timeout),
            })?;
            // Truncate i32 -> u8 for ExitCode. Common server exit codes
            // (0, 1, 130, 137, 143) all fit; anything larger gets clamped.
            Ok(code.try_into().unwrap_or(1))
        }
        Cmd::Sync { force } => {
            sync::z_mirror_or_zip(cfg)?;
            sync::github_diff(cfg, *force)?;
            Ok(0)
        }
        Cmd::SelfUpdate => {
            let any = self_update::apply_staged(cfg)?;
            if any {
                let code = self_update::relaunch(cfg)?;
                Ok(code.try_into().unwrap_or(1))
            } else {
                println!("[self-update] nothing staged");
                Ok(0)
            }
        }
        Cmd::CheckJava => { install::check_java()?; println!("ok"); Ok(0) }
        Cmd::InstallForge => { install::ensure_forge(cfg)?; Ok(0) }
        Cmd::InstallMods => { install::ensure_mods(cfg)?; Ok(0) }
        Cmd::StripClientMods => { mods::strip_client_mods(cfg)?; Ok(0) }
        Cmd::UpdateMods { dry_run } => {
            let opts = if *dry_run { mods::ModSyncOpts::dry() } else { mods::ModSyncOpts::live() };
            mods::update_mods_with(cfg, opts)?;
            Ok(0)
        }
        Cmd::CleanupJars { dry_run } => {
            let opts = if *dry_run { mods::ModSyncOpts::dry() } else { mods::ModSyncOpts::live() };
            mods::cleanup_stale_jars_with(cfg, opts)?;
            Ok(0)
        }
        Cmd::AcceptEula => { eula::accept(cfg)?; Ok(0) }
        Cmd::Run { boot_timeout, idle_timeout } => {
            let code = run::launch_server_watched(cfg, build_watchdog(*boot_timeout, *idle_timeout))?;
            Ok(code.try_into().unwrap_or(1))
        }
        Cmd::PushCrashLogs => { crash::push_logs(cfg)?; Ok(0) }
        Cmd::Diagnose => {
            print!("{}", diagnose::report(cfg)?);
            Ok(0)
        }
        Cmd::FirewallAudit => {
            print!("{}", firewall::audit()?);
            Ok(0)
        }
    }
}

fn build_watchdog(boot_secs: u64, idle_secs: u64) -> icraft_core::run::WatchdogOptions {
    use std::time::Duration;
    icraft_core::run::WatchdogOptions {
        boot_timeout: Duration::from_secs(boot_secs),
        idle_timeout: Duration::from_secs(idle_secs),
        poll_interval: Duration::from_secs(10),
    }
}

fn init_logging(verbose: bool) {
    if std::env::var_os("RUST_LOG").is_none() {
        let lvl = if verbose { "debug" } else { "info" };
        std::env::set_var("RUST_LOG", format!("icraft={lvl},icraft_core={lvl}"));
    }
    env_logger::Builder::from_default_env()
        .format_timestamp(None)
        .format_target(false)
        .init();
}
