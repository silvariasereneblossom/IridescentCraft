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
    Run,

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
        Cmd::Serve { force_sync } => {
            let code = icraft_core::serve(cfg, ServeOptions {
                force_sync: *force_sync,
                headless: false,
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
        Cmd::Run => {
            let code = run::launch_server(cfg, false)?;
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
