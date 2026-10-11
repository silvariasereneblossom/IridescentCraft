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
        /// During boot the server MUST produce log lines (mod init,
        /// world load, etc.) -- silence here is a real hang.
        /// 0 disables. Defaults to 900 (15 min).
        #[arg(long, default_value_t = 900)]
        boot_timeout: u64,
        /// Seconds without log activity (post-boot) before declaring
        /// an idle hang. Default DISABLED (0) because an idle server
        /// with no players online legitimately goes long stretches
        /// with no log activity, and the watchdog used to kill it
        /// thinking it had hung. JVM-process exit is the only reliable
        /// crash signal we have without adding RCON / query-protocol
        /// pings; we rely on that and trust quiet idle. Operators who
        /// genuinely want idle-hang detection can pass `--idle-timeout
        /// 1800` etc. explicitly.
        #[arg(long, default_value_t = 0)]
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

    /// Zip the world into backups/ now, as a pinned `manual-*.zip` (never
    /// pruned). The server must be stopped.
    Backup {
        /// Take the scheduled `world-*.zip` instead, and only if one is due
        /// (what `serve` does before every launch).
        #[arg(long)]
        if_due: bool,
    },

    /// Show the world-backup policy, health and verified backups.
    BackupStatus,

    /// Protection map + chunk-regeneration DRY-RUN. Reads the world and
    /// writes a report; deletes nothing and never writes inside the world
    /// folder. Safe while the server runs, and --server-dir may be a share.
    RegenDryrun {
        /// What a regeneration would select: `report` (nothing: the
        /// protection map only), `ring:N` (every chunk within N chunks of a
        /// bed), `all`, or `box:x1,z1,x2,z2` (chunk coordinates).
        #[arg(long, default_value = "report")]
        scope: String,
        /// Dimensions to analyse: comma-separated ids, or `all`.
        #[arg(long, default_value = "minecraft:overworld")]
        dims: String,
        /// Override a protection setting for this run (repeatable), e.g.
        /// `--set inhabited_min_ticks=72000 --set waystones=activated`.
        /// The keys are those of the .icraft_regen_policy file.
        #[arg(long = "set", value_name = "KEY=VALUE")]
        set: Vec<String>,
        /// Write the report folder under this directory instead of
        /// <server-dir>/regen-reports.
        #[arg(long)]
        out: Option<PathBuf>,
        /// Skip the PNG overview maps.
        #[arg(long)]
        no_png: bool,
        /// Print only the one-line summary, not the whole report.
        #[arg(long)]
        quiet: bool,
    },

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
                pipe_output: false, // CLI inherits stdio for plain Forge output
                apply_self_update: true, // CLI re-execs `icraft serve` cleanly
            })?;
            // Truncate i32 -> u8 for ExitCode. Common server exit codes
            // (0, 1, 130, 137, 143) all fit; anything larger gets clamped.
            Ok(code.try_into().unwrap_or(1))
        }
        Cmd::Sync { force } => {
            // Single incremental call. Pre-fix the CLI also called
            // z_mirror_or_zip (which itself called github_diff with
            // force=true), causing every invocation to clear the SHA
            // and full-zip. github_diff with `*force` covers both the
            // default incremental path and the explicit --force reset.
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
        Cmd::Backup { if_due } => {
            let outcome = backup::run_now(cfg, *if_due);
            println!("{}", outcome.answer());
            Ok(if outcome.is_failure() { 1 } else { 0 })
        }
        Cmd::BackupStatus => {
            print!("{}", backup::report(cfg));
            Ok(0)
        }
        Cmd::RegenDryrun { scope, dims, set, out, no_png, quiet } => {
            let mut tokens = vec![format!("scope={scope}"), format!("dims={dims}")];
            tokens.extend(set.iter().cloned());
            let spec = regen::RunSpec::parse_tokens(tokens.iter().map(String::as_str))
                .map(|spec| regen::RunSpec { out_root: out.clone(), png: !*no_png, ..spec });
            match spec.and_then(|spec| regen::run(cfg, &spec)) {
                Ok(summary) => {
                    if !*quiet {
                        println!("{}", summary.report);
                    }
                    println!("{}", summary.line);
                    Ok(0)
                }
                Err(why) => {
                    eprintln!("regen-dryrun FAILED: {why}");
                    Ok(1)
                }
            }
        }
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
