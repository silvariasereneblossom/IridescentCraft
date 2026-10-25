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

    /// Mirror logs/ and crash-reports/ to the private logs repo now (GitHub
    /// API; needs the saved token). Debug logs are not included. Exit 1 if
    /// the push failed.
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
        /// `--set inhabited_min_ticks=72000 --set waystones=all`.
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

    /// Look a dry-run's plan over against the world as it is NOW: is it still
    /// the same plan, what would a regeneration do to each file and each mod
    /// store, and what would stop it. Reads only; safe while the server runs,
    /// and --server-dir may be a share. Exit 0 = a run would go ahead, 2 = it
    /// would not (the plan changed, or something stops it), 1 = no answer.
    RegenPreflight {
        /// The dry-run: a folder name under <server-dir>/regen-reports, or a path.
        #[arg(long)]
        run: String,
    },

    /// Carry a regeneration plan out: RESETS CHUNKS. Only on a scratch copy
    /// of a server folder, for tests: the folder must hold a file named
    /// .icraft_regen_sandbox whose first line is the folder's own full path,
    /// and no launcher may be running on it. On the live server a
    /// regeneration is started from the launcher's window, by the operator,
    /// and from nowhere else. Exit 0 = done, 3 = the plan has changed (nothing
    /// touched; a fresh dry-run was written), 2 = refused (nothing touched),
    /// 1 = failed.
    RegenExecute {
        /// The dry-run to carry out: a folder name under
        /// <server-dir>/regen-reports, or a path.
        #[arg(long)]
        run: String,
        /// The first 8 characters of that plan's sha256.
        #[arg(long)]
        approve: String,
    },

    /// The fidelity harness's planted-violation self-test against a dry-run's
    /// plan: a fixture world in the temp folder (with a copy of one region
    /// file of this world), a correct run carried out on it, then each
    /// violation planted in turn, each of which the harness has to catch.
    /// Reads the world only. Exit 0 = every plant caught, 2 = not.
    RegenSelftest {
        /// The dry-run: a folder name under <server-dir>/regen-reports, or a path.
        #[arg(long)]
        run: String,
    },

    /// The fidelity harness on this server's world against an untouched copy
    /// of that world as it was before a run: the harness's record is taken of
    /// the copy, then this world is held against it and against the dry-run's
    /// plan (F1 to F6). Reads both. For proving the harness on scratch copies,
    /// planted violations included. Exit 0 = HOLDS, 2 = FAIL, 1 = no answer.
    RegenVerify {
        /// The dry-run whose plan was carried out: a folder name under
        /// <server-dir>/regen-reports, or a path.
        #[arg(long)]
        run: String,
        /// The world folder as it was before the run (a copy of it).
        #[arg(long)]
        before: PathBuf,
    },

    /// The fidelity harness's report on a regenerated world once a server has
    /// run on it: kept chunks, chunks saved again, reset positions generated
    /// again, seams. Written into the run's holding folder; reads the world
    /// only. (The launcher writes it by itself at the first start after a
    /// server ran on the result.)
    RegenAfterBoot {
        /// A folder name under <server-dir>/regen-holding. Default: the newest.
        #[arg(long)]
        holding: Option<String>,
    },

    /// What is in one chunk: which chunk folders hold it, how long players
    /// were near it, the structures that start there and those with a piece
    /// there (each with its start), and what a dry-run's plan does with the
    /// chunk and with each of those structures. Reads only; safe while the
    /// server runs, and --server-dir may be a share.
    ChunkInfo {
        /// A block coordinate, as F3 shows it (a chunk coordinate with --chunk).
        #[arg(allow_negative_numbers = true)]
        x: i64,
        /// A block coordinate, as F3 shows it (a chunk coordinate with --chunk).
        #[arg(allow_negative_numbers = true)]
        z: i64,
        /// x and z are chunk coordinates, as the dry-run's map shows them.
        #[arg(long)]
        chunk: bool,
        #[arg(long, default_value = "minecraft:overworld")]
        dim: String,
        /// The dry-run: a folder name under <server-dir>/regen-reports, or a
        /// path. Default: the newest.
        #[arg(long)]
        run: Option<String>,
    },

    /// Undo a regeneration from its holding folder (scratch copies only, as
    /// regen-execute). Exact for as long as the world has not changed since
    /// the run.
    RegenRollback {
        /// A folder name under <server-dir>/regen-holding. Default: the newest.
        #[arg(long)]
        holding: Option<String>,
        /// The first 8 characters of that run's plan sha256.
        #[arg(long)]
        approve: String,
    },

    /// This server's own config values (worldgen and others): list, change,
    /// reset. They are kept in .icraft_config_overrides.json and written back
    /// into the config files before every server start, so a pack update
    /// cannot undo them. Config files are only written while the server is
    /// stopped; a change made while it runs waits for the next start.
    Settings {
        #[command(subcommand)]
        action: SettingsCmd,
    },

    /// Print a system / install diagnostic report.
    Diagnose,

    /// Audit Windows firewall rule for the icraft port. No-op on Linux.
    FirewallAudit,

    /// The "Start at boot" Task Scheduler task (the window's box on the
    /// Server tab does the same): `status` (exit 0 = registered for this
    /// launcher and folder, 1 = not, 2 = another task is there), `register`,
    /// `remove`, `xml` (print what `register` would register), `line` (the same
    /// task as one PowerShell line, for an elevated PowerShell at the box),
    /// `register-elevated` (what the window does when Windows refuses: the GUI
    /// exe's registration helper run as administrator, after a UAC prompt).
    BootTask {
        #[arg(value_parser = ["status", "register", "remove", "xml", "line", "register-elevated"])]
        action: String,
        /// The launcher the task starts (default: icraft-gui.exe in --server-dir).
        #[arg(long)]
        exe: Option<PathBuf>,
    },
}

#[derive(Subcommand, Debug)]
enum SettingsCmd {
    /// The worldgen config files of this install, with their short names.
    Files,
    /// Every setting of one file: value, allowed range, yours against the
    /// pack's. FILE is a short name from `settings files` (`mekanism`,
    /// `adlods-deposits/osmium`) or a path (`config/tectonic.json`,
    /// `server.properties`).
    Show {
        file: String,
        /// Also the keys of the file that are not worldgen.
        #[arg(long)]
        all: bool,
        /// One JSON object per setting instead of text.
        #[arg(long)]
        json: bool,
    },
    /// Give a setting your own value. KEY is the [section] and the name joined
    /// by a dot, as `settings show` prints them.
    Set {
        file: String,
        key: String,
        /// The new value (a negative number is fine: `-0.35`).
        #[arg(allow_hyphen_values = true)]
        value: String,
    },
    /// Keep the value a file ALREADY holds (one edited in place, or one the
    /// game wrote, as `whitelist on` does). `set` records nothing for such a
    /// value, and the next sync that rewrites the file would take it away.
    /// Writes the list only, never the config file, so it works while the
    /// server runs.
    Pin {
        file: String,
        key: String,
        /// The pack's value for the key (what a sync would put back).
        #[arg(long, allow_hyphen_values = true)]
        pack_value: String,
    },
    /// Give a setting back the pack's value.
    Reset { file: String, key: String },
    /// Your overrides, and whether each is in its file or waiting.
    Status,
    /// Write the waiting overrides into the config files now. Refused while a
    /// server has the world open (they are written before its next start).
    Apply,
    /// Would the launcher start the server with server.properties as it is?
    /// It does not when a whitelist or online mode this server switched on
    /// (`white-list`, `enforce-whitelist`, `online-mode` on the override list)
    /// is off in the file. Reads only. At a real start the overrides are
    /// written first and this check runs after.
    StartCheck,
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
            started_by::record(started_by::Action::Serve, &started_by::Source::Cli);
            let code = icraft_core::serve(cfg, ServeOptions {
                force_sync: *force_sync,
                headless: false,
                watchdog: build_watchdog(*boot_timeout, *idle_timeout),
                pipe_output: false, // CLI inherits stdio for plain Forge output
                apply_self_update: true, // CLI re-execs `icraft serve` cleanly
                defer_log_push: false,   // this process ends with serve: push before returning
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
        // Staged, then pushed through the GitHub API on this thread, bounded
        // (logpush.rs). Exit 1 when the push failed; the reason is logged.
        Cmd::PushCrashLogs => Ok(if logpush::push_now(cfg, false).is_ok() { 0 } else { 1 }),
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
        Cmd::RegenPreflight { run } => match regen::exec::preflight(cfg, &run_dir(cfg, run)) {
            Ok(preflight) => {
                print_preflight(&preflight);
                Ok(if preflight.ready() { 0 } else { 2 })
            }
            Err(why) => {
                eprintln!("regen-preflight FAILED: {why}");
                Ok(1)
            }
        },
        Cmd::RegenExecute { run, approve } => {
            let how = match regen::exec::sandbox_check(cfg) {
                Ok(how) => how,
                Err(why) => {
                    eprintln!("regen-execute REFUSED, nothing was touched: {why}");
                    return Ok(2);
                }
            };
            println!("Scratch copy: {how}.");
            let approval = regen::exec::Approval {
                run_dir: run_dir(cfg, run),
                typed: approve.clone(),
                by: "command line (scratch copy)".to_string(),
                pregen: regen::exec::Pregen::Off,
            };
            let outcome = regen::exec::execute(cfg, &approval);
            if let regen::exec::Outcome::PlanChanged(preflight) = &outcome {
                print_preflight(preflight);
            }
            println!("{}", outcome.line());
            Ok(match outcome {
                regen::exec::Outcome::Done(_) => 0,
                regen::exec::Outcome::PlanChanged(_) => 3,
                regen::exec::Outcome::Refused(_) => 2,
                regen::exec::Outcome::Failed { .. } => 1,
            })
        }
        Cmd::RegenSelftest { run } => match regen::fidelity::Plan::load(&run_dir(cfg, run)) {
            Ok(plan) => {
                let test = regen::fidelity::self_test(&cfg.world_dir(), &plan);
                println!("real region file  {}", test.real_file);
                println!("nothing planted   {}", test.control);
                for p in &test.plants {
                    println!("[{}] {} ({}): {}", if p.caught { "caught" } else { "MISSED" }, p.name, p.invariant, p.said);
                }
                if !test.error.is_empty() {
                    println!("error: {}", test.error);
                }
                println!("{} ({:.1} s)", test.line(), test.seconds);
                Ok(if test.passed() { 0 } else { 2 })
            }
            Err(why) => {
                eprintln!("regen-selftest FAILED: {why}");
                Ok(1)
            }
        },
        Cmd::RegenVerify { run, before } => {
            let looked = regen::fidelity::Plan::load(&run_dir(cfg, run)).and_then(|plan| regen::fidelity::before(before, &plan).map(|record| (plan, record)));
            match looked {
                Ok((plan, record)) => {
                    println!("{}", record.line());
                    let checked = regen::fidelity::after(&cfg.world_dir(), &plan, &record, None);
                    for check in &checked.verdict.checks {
                        println!("{} {} [{}]: {}", check.id, check.name, check.state, check.summary);
                        for finding in &check.findings {
                            println!("    {finding}");
                        }
                    }
                    println!("{}", checked.verdict.line());
                    Ok(if checked.verdict.holds() { 0 } else { 2 })
                }
                Err(why) => {
                    eprintln!("regen-verify FAILED: {why}");
                    Ok(1)
                }
            }
        }
        Cmd::ChunkInfo { x, z, chunk, dim, run } => {
            let run = run.as_deref().map(|r| run_dir(cfg, r));
            match regen::chunk_of(*x, *z, *chunk).and_then(|pos| regen::chunk_info(cfg, dim, pos, run.as_deref())) {
                Ok(lines) => {
                    for line in lines {
                        println!("{line}");
                    }
                    Ok(0)
                }
                Err(why) => {
                    eprintln!("chunk-info FAILED: {why}");
                    Ok(1)
                }
            }
        }
        Cmd::RegenAfterBoot { holding } => {
            let dir = match holding {
                Some(name) => Some(cfg.server_dir.join(regen::exec::HOLDING_DIR).join(name)),
                None => regen::exec::holdings(&cfg.server_dir).into_iter().next().map(|h| h.dir),
            };
            let Some(dir) = dir else {
                eprintln!("regen-after-boot: there is no holding folder under {}", cfg.server_dir.join(regen::exec::HOLDING_DIR).display());
                return Ok(2);
            };
            println!("{}", regen::fidelity::write_after_boot(&cfg.world_dir(), &dir));
            Ok(0)
        }
        Cmd::RegenRollback { holding, approve } => {
            let how = match regen::exec::sandbox_check(cfg) {
                Ok(how) => how,
                Err(why) => {
                    eprintln!("regen-rollback REFUSED, nothing was touched: {why}");
                    return Ok(2);
                }
            };
            println!("Scratch copy: {how}.");
            let dir = match holding {
                Some(name) => Some(cfg.server_dir.join(regen::exec::HOLDING_DIR).join(name)),
                None => regen::exec::holdings(&cfg.server_dir).into_iter().next().map(|h| h.dir),
            };
            let Some(dir) = dir else {
                eprintln!("regen-rollback: there is no holding folder under {}", cfg.server_dir.join(regen::exec::HOLDING_DIR).display());
                return Ok(2);
            };
            match regen::exec::rollback(cfg, &dir, approve, "command line (scratch copy)") {
                Ok(said) => {
                    println!("{said}");
                    Ok(0)
                }
                Err(why) => {
                    eprintln!("regen-rollback NOT done: {why}");
                    Ok(1)
                }
            }
        }
        Cmd::Settings { action } => Ok(settings(action, cfg)),
        Cmd::Diagnose => {
            print!("{}", diagnose::report(cfg)?);
            Ok(0)
        }
        Cmd::FirewallAudit => {
            print!("{}", firewall::audit()?);
            Ok(0)
        }
        Cmd::BootTask { action, exe } => {
            use icraft_core::autostart::{self as a, Registered};
            let exe = exe.clone().unwrap_or_else(|| cfg.server_dir.join("icraft-gui.exe"));
            match action.as_str() {
                "xml" => {
                    print!("{}", a::task_xml(&exe, &cfg.server_dir, &a::current_user().unwrap_or_default(), a::current_user_sid().as_deref()));
                    Ok(0)
                }
                "line" => {
                    println!("{}", a::powershell_line(&exe, &cfg.server_dir));
                    Ok(0)
                }
                "register-elevated" => {
                    let args = vec![a::BOOT_TASK_ARG.to_string(), "register".to_string(), cfg.server_dir.display().to_string()];
                    let code = a::run_elevated(&exe, &args)?;
                    println!("the registration helper run as administrator exited {code}");
                    Ok(if code == 0 { 0 } else { 1 })
                }
                "register" => {
                    a::register(&exe, &cfg.server_dir)?;
                    println!("registered '{}': {} {}", a::TASK_NAME, exe.display(), a::boot_arguments(&cfg.server_dir));
                    Ok(0)
                }
                "remove" => {
                    a::unregister()?;
                    println!("no task '{}' now", a::TASK_NAME);
                    Ok(0)
                }
                _ => Ok(match a::status(&exe, &cfg.server_dir)? {
                    Registered::Yes => {
                        println!("registered: '{}' starts {} {}", a::TASK_NAME, exe.display(), a::boot_arguments(&cfg.server_dir));
                        0
                    }
                    Registered::No => {
                        println!("not registered: no task '{}'", a::TASK_NAME);
                        1
                    }
                    Registered::Differs(why) => {
                        println!("a task '{}' is there, but {why}", a::TASK_NAME);
                        2
                    }
                }),
            }
        }
    }
}

/// `--run`: a path to a dry-run's folder, or its name under
/// `<server dir>/regen-reports`.
fn run_dir(cfg: &ServerConfig, run: &str) -> PathBuf {
    let direct = PathBuf::from(run);
    if direct.join(icraft_core::regen::PLAN_FILE).is_file() {
        direct
    } else {
        cfg.server_dir.join(icraft_core::regen::REPORTS_DIR).join(run)
    }
}

/// What stands before a regeneration, as text.
fn print_preflight(p: &icraft_core::regen::exec::Preflight) {
    use icraft_core::regen::exec::Mark;
    println!("dry-run      {}  (scope {})", p.run_name, p.scope);
    println!("approved     plan sha256 {}", p.approved_hash);
    println!("now          plan sha256 {}", p.current_hash);
    if p.same_plan {
        println!("plan         unchanged: {} chunk(s) to reset, {} to keep, of {} on disk", p.targets, p.kept, p.on_disk);
    } else {
        println!("plan         CHANGED: {} chunk(s) more than approved, {} fewer", p.added, p.removed);
        for (label, list) in [("  new      ", &p.added_sample), ("  gone     ", &p.removed_sample)] {
            if !list.is_empty() {
                println!("{label}  {}", list.join("; "));
            }
        }
        match &p.new_run {
            Some(name) => println!("fresh        a dry-run of the plan as it is now was written: {name}"),
            None => println!("fresh        run the dry-run again"),
        }
    }
    for line in &p.lines {
        let mark = match line.mark {
            Mark::Ok => "[ok]  ",
            Mark::Stop => "[STOP]",
            Mark::Note => "[note]",
        };
        println!("{mark} {}", line.text);
    }
    if p.ready() {
        println!("A run would go ahead. To approve this plan, the code is {}.", p.approval_text());
    } else {
        println!("A run would NOT go ahead as things stand.");
    }
}

/// `icraft settings ...`. Exit code 0, or 1 when something was refused or failed.
fn settings(action: &SettingsCmd, cfg: &ServerConfig) -> u8 {
    use icraft_core::{overrides, worldgen};

    // After a change to the list: write it into the files if no server has the
    // world, otherwise say when it will be.
    let write_now = |cfg: &ServerConfig| -> u8 {
        match overrides::apply_when_stopped(cfg, "command line") {
            Ok(report) => {
                println!("{}", report.line());
                u8::from(report.failed() > 0)
            }
            Err(why) => {
                println!("Not written yet: {why}. It is written into the config file before the next server start.");
                0
            }
        }
    };
    let failed = |why: String| -> u8 {
        eprintln!("settings: {why}");
        1
    };

    match action {
        SettingsCmd::Files => {
            print!("{}", worldgen::files_text(cfg));
            0
        }
        SettingsCmd::Show { file, all, json } => {
            let target = worldgen::target(cfg, file);
            let shown = if *json { worldgen::show_json(cfg, &target, *all) } else { worldgen::show_text(cfg, &target, *all) };
            match shown {
                Ok(text) => {
                    println!("{}", text.trim_end());
                    0
                }
                Err(why) => failed(why),
            }
        }
        SettingsCmd::Set { file, key, value } => {
            let target = worldgen::target(cfg, file);
            match worldgen::stage(cfg, &target, key, value, "command line") {
                Ok(overrides::Staged::Unchanged) => {
                    println!("{} :: {key} is already {value}.", target.rel);
                    0
                }
                Ok(overrides::Staged::Saved) => {
                    println!("{} :: {key} = {value}   saved to {}", target.rel, overrides::FILE);
                    write_now(cfg)
                }
                Ok(overrides::Staged::BackToPack) => {
                    println!("{} :: {key}: {value} is the pack's own value, so the override is dropped.", target.rel);
                    write_now(cfg)
                }
                Err(why) => failed(why),
            }
        }
        SettingsCmd::Pin { file, key, pack_value } => {
            let target = worldgen::target(cfg, file);
            if let Some(why) = target.source.and_then(|s| s.locked(key)) {
                return failed(format!("`{key}` is not changed from here. {why}"));
            }
            match overrides::pin(cfg, &target.rel, key, pack_value, "command line") {
                Ok(held) => {
                    println!(
                        "{} :: {key} = {held}   pinned in {} (the pack's: {pack_value}). The file was not touched; the value is put back before every server start.",
                        target.rel,
                        overrides::FILE
                    );
                    0
                }
                Err(why) => failed(why),
            }
        }
        SettingsCmd::Reset { file, key } => {
            let target = worldgen::target(cfg, file);
            match overrides::reset(cfg, &target.rel, key) {
                Ok(true) => {
                    println!("{} :: {key}: back to the pack's value.", target.rel);
                    write_now(cfg)
                }
                Ok(false) => {
                    println!("{} :: {key} has no override.", target.rel);
                    0
                }
                Err(why) => failed(why),
            }
        }
        SettingsCmd::Status => {
            print!("{}", worldgen::status_text(cfg));
            0
        }
        SettingsCmd::Apply => match overrides::apply_when_stopped(cfg, "command line") {
            Ok(report) => {
                println!("{}", report.line());
                u8::from(report.failed() > 0)
            }
            Err(why) => failed(format!("not written: {why}. The overrides are written before the next server start.")),
        },
        SettingsCmd::StartCheck => match overrides::access_check(cfg) {
            Ok(()) => {
                let guarded = overrides::guarded_keys(cfg);
                if guarded.is_empty() {
                    println!("Nothing is guarded: no whitelist or online-mode setting is switched on through the override list. The server starts with whatever server.properties holds.");
                } else {
                    println!("Passed: server.properties holds {} = true. The launcher would start the server.", guarded.join(", "));
                }
                0
            }
            Err(why) => failed(format!(
                "the launcher would NOT start the server with the files as they are: {why}. (At a real start the overrides are written first, then this check runs.)"
            )),
        },
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
