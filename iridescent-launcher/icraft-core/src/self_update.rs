//! Phase 0.5 — apply staged self-updates.
//!
//! `phase0_sync.ps1` writes new versions of files as `<file>.new` so
//! that Windows file locks on the running .bat / .ps1 don't block the
//! download. After the diff sync, we move-overwrite each `.new` onto
//! its target; on success the orchestrator relaunches.
//!
//! For the new Rust binary the same staging applies: the binary itself
//! cannot be overwritten while running on Windows, so the updater
//! drops `icraft.exe.new` and we apply + relaunch.

use anyhow::Result;
use std::fs;
use std::path::{Path, PathBuf};

use crate::config::ServerConfig;

const STAGED_FILES: &[&str] = &[
    "iridescentserver.bat",
    "phase0_sync.ps1",
    "iridescentserver.sh",
    "icraft.exe",
    "icraft",
    // GUI variant (2026-05-29): same fix as sync.rs SELF_UPDATE_FILES --
    // when the launcher swapped CLI -> GUI, this activator list wasn't
    // updated either, so even if a .new were staged, it would never
    // be renamed in. Both lists must stay aligned.
    "icraft-gui.exe",
    "icraft-gui",
];

/// Returns true if at least one staged file was applied (caller should
/// then relaunch). Failures on individual files are logged but don't
/// abort the loop -- we apply what we can and continue.
pub fn apply_staged(cfg: &ServerConfig) -> Result<bool> {
    let mut any_swap = false;
    for f in STAGED_FILES {
        let staged = cfg.server_dir.join(format!("{f}.new"));
        if !staged.exists() { continue; }
        let target = cfg.server_dir.join(f);
        match fs::rename(&staged, &target) {
            Ok(_) => {
                log::info!("[self-update] applied {} -> {}", staged.display(), target.display());
                any_swap = true;
            }
            Err(e) => {
                log::warn!("[self-update] failed to apply {}: {} (file may be locked)",
                    staged.display(), e);
            }
        }
    }
    Ok(any_swap)
}

/// Re-exec the orchestrator. On success this never returns; on Linux
/// we use [`std::os::unix::process::CommandExt::exec`]. On Windows we
/// spawn a detached child and exit with code 0.
#[allow(clippy::needless_return)]
pub fn relaunch(cfg: &ServerConfig) -> Result<i32> {
    let exe = std::env::current_exe()?;
    log::info!("[self-update] relaunch: {}", exe.display());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let err = std::process::Command::new(&exe)
            .current_dir(&cfg.server_dir)
            .arg("serve")
            .exec();
        // exec only returns on failure
        return Err(err.into());
    }

    #[cfg(windows)]
    {
        let _child = std::process::Command::new(&exe)
            .current_dir(&cfg.server_dir)
            .arg("serve")
            .spawn()?;
        // Caller exits 0; the spawned child takes over.
        return Ok(0);
    }
}

/// Path A self-update for the GUI: apply staged .new files and spawn
/// the new binary. Caller should `std::process::exit(0)` immediately
/// after this returns Ok(true) to release the old binary's file lock
/// and let the new instance take over.
///
/// The binary self-update target is `current_exe()`, not
/// `cfg.server_dir`, so the GUI can live in a different dir from the
/// modpack tree if the user prefers. We check both locations for the
/// `.new` files and apply whichever is present.
pub fn apply_and_relaunch_gui(cfg: &ServerConfig) -> Result<bool> {
    use std::fs;
    let exe = std::env::current_exe()?;
    let exe_name = exe.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("current_exe has no filename: {}", exe.display()))?
        .to_string();

    // Two candidate `.new` locations: (1) next to the running binary,
    // (2) inside the modpack server_dir. The sync flow drops .new
    // files into server_dir; if the GUI binary itself sits there too,
    // both paths point at the same file.
    let here = exe.with_file_name(format!("{exe_name}.new"));
    let there = cfg.server_dir.join(format!("{exe_name}.new"));

    let staged = if here.exists() {
        Some(here)
    } else if there.exists() && there != exe.with_file_name(&exe_name) {
        Some(there)
    } else {
        None
    };

    let Some(staged) = staged else {
        log::info!("[self-update] no {exe_name}.new staged; nothing to apply");
        return Ok(false);
    };

    log::info!("[self-update] applying {} -> {}", staged.display(), exe.display());

    // Windows can't overwrite the running binary. Workaround: rename
    // the running exe to .old, then rename .new to the live name. The
    // OS allows this because we're moving a held-open file to a new
    // path, then placing a new file at the now-vacated path.
    //
    // Caveat: the rename CAN fail with ERROR_ACCESS_DENIED. Reasons
    // we've actually seen:
    //   - Defender / AV mid-scan holding a transient handle
    //   - The loader opened the exe with a share mode that excludes
    //     DELETE access (rare, but happens on some Server SKUs and
    //     anti-tamper-aware setups)
    //   - A stale `<exe>.old` from a previous self-update is
    //     DELETE_PENDING (the remove_file below succeeded but the
    //     unlink hasn't finalized; the rename target collides)
    //   - Controlled Folder Access on the parent dir
    // For all of those, the fallback is to delegate the rename to a
    // tiny .cmd stub that runs AFTER we exit. The stub polls for our
    // PID, performs the rename, spawns the new exe, and self-deletes.
    #[cfg(windows)]
    {
        let backup = exe.with_extension("exe.old");
        let _ = fs::remove_file(&backup);
        match fs::rename(&exe, &backup) {
            Ok(()) => {
                if let Err(e) = fs::rename(&staged, &exe) {
                    let _ = fs::rename(&backup, &exe);
                    return Err(anyhow::anyhow!("rename .new -> live: {e}"));
                }
                // Direct path succeeded; spawn the new binary now.
                log::info!("[self-update] spawning new instance: {}", exe.display());
                std::process::Command::new(&exe)
                    .current_dir(&cfg.server_dir)
                    .spawn()?;
                return Ok(true);
            }
            Err(e) => {
                log::warn!(
                    "[self-update] direct rename failed ({e}); using stub-script fallback"
                );
                spawn_update_stub_windows(&exe, &staged)?;
                // Stub will spawn the new binary after we exit. Caller
                // must call std::process::exit(0) to release the file
                // lock so the stub's rename succeeds.
                return Ok(true);
            }
        }
    }

    #[cfg(not(windows))]
    {
        fs::rename(&staged, &exe)
            .map_err(|e| anyhow::anyhow!("rename .new -> live: {e}"))?;
        // Spawn the new binary as a detached child. Caller exits.
        log::info!("[self-update] spawning new instance: {}", exe.display());
        std::process::Command::new(&exe)
            .current_dir(&cfg.server_dir)
            .spawn()?;
        Ok(true)
    }
}

/// Write a temp .cmd stub that polls for our PID to exit, then
/// renames the live exe to .old, moves the staged .new into place,
/// spawns the new binary, and self-deletes. Used as a fallback when
/// the direct in-process rename fails on Windows (AV / share mode /
/// Controlled Folder Access). Stub runs in a hidden console.
///
/// The stub is intentionally simple: cmd-only, no PowerShell, no
/// dependencies. Polls every ~1s via `tasklist /FI` and exits the
/// loop once our PID disappears from the process list.
#[cfg(windows)]
fn spawn_update_stub_windows(live: &std::path::Path, staged: &std::path::Path) -> Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let pid = std::process::id();
    let backup = live.with_extension("exe.old");
    let live_str = live.display().to_string();
    let staged_str = staged.display().to_string();
    let backup_str = backup.display().to_string();

    let stub_path = std::env::temp_dir().join(format!("icraft-gui-update-{pid}.cmd"));
    let script = format!(
        "@echo off\r\n\
         setlocal\r\n\
         rem Wait for the GUI (PID {pid}) to release the exe lock.\r\n\
         :wait\r\n\
         tasklist /FI \"PID eq {pid}\" 2>nul | findstr /I \"{pid}\" >nul\r\n\
         if errorlevel 1 goto exited\r\n\
         ping -n 2 127.0.0.1 >nul\r\n\
         goto wait\r\n\
         :exited\r\n\
         rem Brief extra grace so the loader fully drops the file handle.\r\n\
         ping -n 2 127.0.0.1 >nul\r\n\
         del \"{backup_str}\" 2>nul\r\n\
         move /Y \"{live_str}\" \"{backup_str}\" >nul\r\n\
         if errorlevel 1 (\r\n\
           rem Couldn't even rename live -> .old after exit. Bail rather\r\n\
           rem than leaving the user without a working binary.\r\n\
           exit /b 1\r\n\
         )\r\n\
         move /Y \"{staged_str}\" \"{live_str}\" >nul\r\n\
         if errorlevel 1 (\r\n\
           rem Restore live exe so the user has something runnable.\r\n\
           move /Y \"{backup_str}\" \"{live_str}\" >nul\r\n\
           exit /b 1\r\n\
         )\r\n\
         start \"\" \"{live_str}\"\r\n\
         (goto) 2>nul & del \"%~f0\"\r\n",
    );
    fs::write(&stub_path, script)
        .map_err(|e| anyhow::anyhow!("write stub {}: {e}", stub_path.display()))?;
    log::info!("[self-update] stub: {}", stub_path.display());

    std::process::Command::new("cmd")
        .args(["/C", &stub_path.display().to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| anyhow::anyhow!("spawning stub: {e}"))?;
    Ok(())
}

/// One-button sync: auto-route between the dev path (pull source +
/// rebuild + push binary + apply) and the server path (pull binary
/// from repo + apply). Detection: presence of `cargo` on PATH or in
/// the standard install locations. If cargo is available, assume
/// dev box; otherwise assume server box and use the binary-pull
/// path.
///
/// Returns Ok(true) if a new GUI was applied + spawned; caller must
/// `std::process::exit(0)` to release the file lock.
pub fn sync_apply_gui(cfg: &ServerConfig) -> Result<bool> {
    if crate::tools::find_tool("cargo", &[]).is_some() {
        log::info!("[sync] cargo available -- dev path: rebuild + push + apply");
        pull_build_apply_gui(cfg)
    } else {
        log::info!("[sync] cargo not found -- server path: pull binary + apply");
        pull_repo_binary_apply_gui(cfg)
    }
}

/// Pull source from the repo, build the GUI in release mode, stage the
/// resulting binary as `<live>.new`, then apply + relaunch.
///
/// Source location: `ICRAFT_LAUNCHER_SRC` env var if set, otherwise
/// walks up from the running exe's dir for an `iridescent-launcher\`
/// folder containing `Cargo.toml` + `icraft-gui\`.
///
/// Returns Ok(true) if a fresh build was applied + the new instance was
/// spawned (caller must `std::process::exit(0)` to release the file
/// lock). Ok(false) if no source dir was located -- caller can fall
/// back to other update paths.
///
/// Requires `git` and `cargo` on PATH. Build output streams into the
/// log pane (lines tagged `[cargo]`) so the operator gets real-time
/// progress instead of a silent multi-minute hang on first build.
pub fn pull_build_apply_gui(cfg: &ServerConfig) -> Result<bool> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    // Read PAT once for clone/fetch + final binary push so the
    // credential manager never gets a chance to prompt.
    let pat = crate::crash::read_pat(cfg);
    let src_dir = ensure_launcher_src(pat.as_deref())?;
    log::info!("[self-update] launcher source: {}", src_dir.display());

    // Repo root for git pull -- the launcher dir's parent. (For a
    // standalone iridescent-launcher checkout, the launcher dir IS
    // the repo root, so use it directly when there's no parent .git.)
    let repo_root: PathBuf = match src_dir.parent() {
        Some(p) if p.join(".git").exists() => p.to_path_buf(),
        _ => src_dir.clone(),
    };

    let git_exe = find_tool("git", &[]).ok_or_else(|| anyhow::anyhow!(
        "git not found. GUI processes don't always inherit your shell PATH. \
         Install Git for Windows (https://git-scm.com/download/win), or set \
         ICRAFT_GIT to your git.exe path. GitHub Desktop's bundled git is \
         auto-detected if Desktop is installed."
    ))?;
    log::info!("[self-update] git: {}", git_exe.display());
    log::info!("[self-update] git pull --ff-only in {}", repo_root.display());
    let pull = crate::git::authed_command(&repo_root, pat.as_deref())
        .args(["pull", "--ff-only"])
        .output()
        .map_err(|e| anyhow::anyhow!("running git pull failed: {e}"))?;
    if !pull.status.success() {
        let stderr = String::from_utf8_lossy(&pull.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&pull.stdout).trim().to_string();
        let detail = match (stderr.is_empty(), stdout.is_empty()) {
            (false, false) => format!("{stderr} | {stdout}"),
            (false, true)  => stderr,
            (true,  false) => stdout,
            (true,  true)  => "(no output)".to_string(),
        };
        // Surface common diagnoses inline -- saves one round trip
        // per support request.
        let hint = if detail.contains("Not possible to fast-forward") || detail.contains("non-fast-forward") {
            "\n  hint: local commits diverge from origin/main. Either reset (git reset --hard origin/main) or rebase (git pull --rebase) manually, then retry."
        } else if detail.contains("would be overwritten by merge") {
            "\n  hint: uncommitted local changes block the pull. Stash (git stash) or commit them, then retry."
        } else if detail.contains("refusing to merge unrelated histories") {
            "\n  hint: source dir's git history doesn't share an ancestor with origin. Check ICRAFT_LAUNCHER_SRC points at the right repo."
        } else if detail.contains("401") || detail.contains("403") || detail.contains("Authentication") {
            "\n  hint: PAT auth rejected. Verify the saved token has Contents:Read on this repo."
        } else {
            ""
        };
        anyhow::bail!("git pull failed (exit {}): {}{}",
            pull.status.code().unwrap_or(-1), detail, hint);
    }

    let cargo_exe = find_tool("cargo", &[]).ok_or_else(|| anyhow::anyhow!(
        "cargo not found. Install rustup (https://rustup.rs), or set \
         ICRAFT_CARGO to your cargo.exe path. Standard install is at \
         %USERPROFILE%\\.cargo\\bin\\cargo.exe."
    ))?;
    log::info!("[self-update] cargo: {}", cargo_exe.display());
    log::info!("[self-update] cargo build -p icraft-gui --release ...");
    let mut child = Command::new(&cargo_exe)
        .current_dir(&src_dir)
        .args(["build", "-p", "icraft-gui", "--release"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| anyhow::anyhow!("running cargo build failed: {e}"))?;
    // Stream both stdout (rare for cargo) and stderr (where status
    // diagnostics go) into the log pane line-by-line.
    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");
    let t1 = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            log::info!("[cargo] {line}");
        }
    });
    let t2 = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            log::info!("[cargo] {line}");
        }
    });
    let status = child.wait()?;
    let _ = t1.join();
    let _ = t2.join();
    if !status.success() {
        anyhow::bail!("cargo build failed (see [cargo] lines above)");
    }

    // Find the produced exe. Fast path = target/release; slow path
    // walks the target tree (handles a custom default-target triple
    // adding a target/<triple>/release/ subdir).
    let target_dir = cargo_target_dir(&src_dir).unwrap_or_else(|_| src_dir.join("target"));
    let exe_name = current_exe_name();
    let built = find_built_exe(&target_dir, &exe_name)
        .ok_or_else(|| anyhow::anyhow!(
            "build succeeded but {exe_name} not found under {}",
            target_dir.display()
        ))?;
    log::info!("[self-update] built: {}", built.display());
    let _ = git_exe; // unused now that we don't deploy/push from here

    // Stage as <running>.new next to the running binary. The build
    // is ephemeral -- no commit + push to the repo, no canonical
    // deploy. Source is the only canonical artifact; binaries are
    // local build outputs each box produces for itself.
    let live = std::env::current_exe()?;
    let staged = live.with_file_name(format!("{exe_name}.new"));
    fs::copy(&built, &staged)
        .map_err(|e| anyhow::anyhow!("staging copy {} -> {}: {e}", built.display(), staged.display()))?;
    log::info!("[self-update] staged: {}", staged.display());

    // apply_and_relaunch_gui handles the rename + spawn dance.
    apply_and_relaunch_gui(cfg)
}

/// Pull the latest binary out of the git working tree containing the
/// running exe, stage it as `<exe>.new` (without touching the running
/// binary -- Windows file lock), then apply + relaunch.
///
/// Setup (one-time per box, requires git installed):
///
///   FLAT LAYOUT (binary at working-tree root, e.g. dedicated binaries repo):
///     mkdir icraft && cd icraft
///     git init && git remote add origin <repo-url>
///     git fetch origin --depth=1 && git checkout main
///     # Run icraft-gui.exe from this dir.
///
///   NESTED LAYOUT (sparse-checkout of IridescentCraft):
///     git clone --filter=blob:none --no-checkout <repo-url> icraft && cd icraft
///     git sparse-checkout init --cone
///     git sparse-checkout set .minecraft/server_distribution
///     git checkout main
///     # Run .minecraft\server_distribution\icraft-gui.exe from this dir.
///
/// Apply Self-Update from a binary inside either layout works
/// identically -- the path-within-repo is computed dynamically.
///
/// Requires git on PATH (or ICRAFT_GIT). Does NOT require cargo.
pub fn pull_repo_binary_apply_gui(cfg: &ServerConfig) -> Result<bool> {
    use std::fs::File;
    use std::process::Stdio;

    let git = find_tool("git", &[]).ok_or_else(|| anyhow::anyhow!(
        "git not found. Install Git for Windows (https://git-scm.com/download/win) \
         or set ICRAFT_GIT to your git.exe path."
    ))?;
    log::info!("[self-update] git: {}", git.display());
    // PAT-authed network ops bypass the credential manager prompt.
    let pat = crate::crash::read_pat(cfg);

    let exe = std::env::current_exe()?;
    let exe_name = exe.file_name().and_then(|n| n.to_str())
        .unwrap_or(if cfg!(windows) { "icraft-gui.exe" } else { "icraft-gui" })
        .to_string();

    // Two paths for picking a git working tree:
    //   A) Walk up from the exe -- the operator already has a sparse
    //      / flat checkout containing the running binary.
    //   B) No working tree containing the exe -- auto-clone a sparse
    //      cache at %LOCALAPPDATA%\icraft-launcher\binary-pull\
    //      filtered to .minecraft/server_distribution. The running
    //      exe stays where it is; we just need a tree to git-show
    //      out of.
    let (repo_root, rel) = match find_git_root(exe.parent().unwrap_or(&exe)) {
        Some(root) => {
            log::info!("[self-update] git working tree: {}", root.display());
            let rel = exe.strip_prefix(&root)
                .map_err(|_| anyhow::anyhow!(
                    "exe {} is not inside repo at {}",
                    exe.display(), root.display()
                ))?
                .to_string_lossy()
                .replace('\\', "/");
            (root, rel)
        }
        None => {
            log::info!(
                "[self-update] no local git tree containing {} -- using binary-pull cache",
                exe.display()
            );
            let cache = ensure_binary_pull_cache(pat.as_deref())?;
            // Canonical repo path for the binary. Override via
            // ICRAFT_BINARY_REPO_PATH if your fork has it elsewhere.
            let rel = std::env::var("ICRAFT_BINARY_REPO_PATH").unwrap_or_else(|_|
                format!(".minecraft/server_distribution/{exe_name}")
            );
            (cache, rel)
        }
    };

    log::info!("[self-update] git fetch origin --depth=1");
    let fetch_out = crate::git::authed_command(&repo_root, pat.as_deref())
        .args(["fetch", "origin", "--depth=1"])
        .output()
        .map_err(|e| anyhow::anyhow!("running git fetch: {e}"))?;
    let fetch = fetch_out.status;
    if !fetch.success() {
        let stderr = String::from_utf8_lossy(&fetch_out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&fetch_out.stdout).trim().to_string();
        anyhow::bail!("git fetch failed (exit {}): {}",
            fetch.code().unwrap_or(-1),
            if !stderr.is_empty() { stderr } else if !stdout.is_empty() { stdout } else { "(no output)".to_string() });
    }
    let _ = fetch;

    // Resolve the remote ref to read the binary from. Track HEAD's
    // upstream branch so weird branches (release/*, etc.) just work.
    let upstream = crate::git::authed_command(&repo_root, pat.as_deref())
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .output()?;
    let remote_ref = if upstream.status.success() {
        std::str::from_utf8(&upstream.stdout)?.trim().to_string()
    } else {
        // No upstream configured -- fall back to origin/HEAD.
        "origin/HEAD".to_string()
    };
    log::info!("[self-update] target ref: {remote_ref}");

    // Extract `rel` from `remote_ref` straight to <exe>.new. This
    // bypasses git's working-tree merge entirely, so the running exe
    // doesn't get touched (no Windows file-lock collision).
    let staged = exe.with_file_name(format!("{exe_name}.new"));
    log::info!("[self-update] git show {remote_ref}:{rel} > {}", staged.display());
    let staged_file = File::create(&staged)
        .map_err(|e| anyhow::anyhow!("create {}: {e}", staged.display()))?;
    let show = crate::git::authed_command(&repo_root, pat.as_deref())
        .args(["show", &format!("{remote_ref}:{rel}")])
        .stdout(Stdio::from(staged_file))
        .status()?;
    let bytes = fs::metadata(&staged).map(|m| m.len()).unwrap_or(0);
    if !show.success() || bytes == 0 {
        let _ = fs::remove_file(&staged);
        // Common case: dev hasn't pushed a binary to the repo yet.
        // If cargo is installed, fall through to the source-build
        // path automatically -- one click does the right thing
        // regardless of whether a prebuilt binary exists upstream.
        if crate::tools::find_tool("cargo", &[]).is_some() {
            log::info!(
                "[self-update] {rel} isn't tracked in {remote_ref} (no binary published) -- \
                 cargo is available, falling back to source build"
            );
            return pull_build_apply_gui(cfg);
        }
        anyhow::bail!(
            "git show failed -- {rel} not tracked in {remote_ref}, and cargo isn't \
             available to build from source. Either push a binary from a dev box \
             or install rustup so this box can rebuild locally."
        );
    }
    log::info!("[self-update] staged {} bytes", bytes);

    apply_and_relaunch_gui(cfg)
}

/// Walk up from `start` for a directory containing a `.git` entry
/// (file or dir -- worktrees use a file pointer). Returns the first
/// such ancestor or None.
fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut cur = Some(start);
    while let Some(c) = cur {
        if c.join(".git").exists() {
            return Some(c.to_path_buf());
        }
        cur = c.parent();
    }
    None
}

// git_commit_push_binary removed: pull_build_apply_gui no longer
// publishes binaries to the repo. Source is the canonical artifact;
// each box builds locally and applies in place. If a binary push
// is ever needed (e.g. for cargo-less consumer boxes), use
// rebuild_gui.bat --push from a dev shell.

fn current_exe_name() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_owned))
        .unwrap_or_else(|| if cfg!(windows) { "icraft-gui.exe".into() } else { "icraft-gui".into() })
}

fn find_launcher_src() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ICRAFT_LAUNCHER_SRC") {
        let pb = PathBuf::from(p);
        if is_launcher_src(&pb) {
            if has_git_history(&pb) {
                return Some(pb);
            }
            log::warn!(
                "[self-update] ICRAFT_LAUNCHER_SRC points at {} but no .git history found there or in its parent -- falling through to auto-clone cache. Set the env var to a real git working tree, or clear it (setx ICRAFT_LAUNCHER_SRC \"\") to silence this warning.",
                pb.display()
            );
        }
    }
    // Walk up from the running exe's directory.
    let exe = std::env::current_exe().ok()?;
    let mut cur = exe.parent();
    while let Some(c) = cur {
        let candidate = c.join("iridescent-launcher");
        if is_launcher_src(&candidate) && has_git_history(&candidate) {
            return Some(candidate);
        }
        // Also check `c` itself, in case the exe is sitting inside the
        // launcher source tree (e.g. running directly from target/release/).
        if is_launcher_src(c) && has_git_history(c) {
            return Some(c.to_path_buf());
        }
        cur = c.parent();
    }
    None
}

/// True if `p` or its direct parent contains a `.git` entry. We
/// require a real working tree because the build flow does
/// `git pull --ff-only` -- a Cargo.toml-only source dir without
/// .git history is unbuildable in our pipeline (the pull step
/// fails with `fatal: not a git repository`).
fn has_git_history(p: &Path) -> bool {
    p.join(".git").exists()
        || p.parent().map_or(false, |par| par.join(".git").exists())
}

/// Default repo to clone from when no local source can be located.
/// Override via ICRAFT_LAUNCHER_REPO env var (useful for forks or
/// testing branches).
const DEFAULT_LAUNCHER_REPO: &str = "https://github.com/silvariasereneblossom/IridescentCraft.git";

/// Locate the launcher source, AUTO-CLONING into a cache dir if no
/// local copy exists. Lookup order:
///
///   1. ICRAFT_LAUNCHER_SRC env var (explicit override)
///   2. Walk up from current_exe (find iridescent-launcher\ as
///      sibling, or current dir if exe is inside the source tree)
///   3. Cache dir from a previous auto-clone:
///        Windows: %LOCALAPPDATA%\icraft-launcher\source\
///        Unix:    ~/.cache/icraft-launcher/source/
///   4. Fresh sparse-clone of DEFAULT_LAUNCHER_REPO into the cache
///      dir, sparse-checkout to `iridescent-launcher` only (~5MB
///      source + ~10MB .git instead of the full ~GB modpack repo)
///
/// Result: the user can drop icraft-gui.exe anywhere, click Rebuild,
/// and it just works -- the cache dir is created and populated on
/// first use, then incrementally pulled on subsequent rebuilds.
fn ensure_launcher_src(pat: Option<&str>) -> Result<PathBuf> {
    if let Some(p) = find_launcher_src() {
        return Ok(p);
    }
    let cache = launcher_cache_dir()?;
    let cached_src = cache.join("iridescent-launcher");
    if is_launcher_src(&cached_src) {
        log::info!("[self-update] using cached source: {}", cached_src.display());
        return Ok(cached_src);
    }
    log::info!(
        "[self-update] no local source found; cloning launcher source into {}",
        cache.display()
    );
    sparse_clone_launcher(&cache, pat)?;
    if !is_launcher_src(&cached_src) {
        anyhow::bail!(
            "clone succeeded but {} doesn't look like a valid launcher source",
            cached_src.display()
        );
    }
    Ok(cached_src)
}

/// Sparse-checkout cache for the binary-pull self-update path. Holds
/// only `.minecraft/server_distribution/` so `git show <ref>:<bin>`
/// resolves regardless of whether the operator's running exe lives
/// inside an existing repo working tree. Cloned once into
/// `%LOCALAPPDATA%\icraft-launcher\binary-pull\` (or
/// `~/.cache/icraft-launcher/binary-pull/`); the next `git fetch`
/// keeps it current. Disk footprint after first clone: a few MB.
fn ensure_binary_pull_cache(pat: Option<&str>) -> Result<PathBuf> {
    let cache = binary_pull_cache_dir()?;
    if cache.join(".git").exists() {
        log::info!("[self-update] reusing binary-pull cache: {}", cache.display());
        return Ok(cache);
    }
    let _ = crate::tools::find_tool("git", &[]).ok_or_else(|| anyhow::anyhow!(
        "git not found. Install Git for Windows or set ICRAFT_GIT."
    ))?;
    let repo = std::env::var("ICRAFT_LAUNCHER_REPO")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_REPO.to_string());
    log::info!("[self-update] cloning binary-pull cache into {} ({})", cache.display(), repo);
    let status = crate::git::authed_command(&cache, pat)
        .args(["clone", "--filter=blob:none", "--sparse", "--depth=1", &repo, "."])
        .status()
        .map_err(|e| anyhow::anyhow!("git clone for binary cache: {e}"))?;
    if !status.success() {
        anyhow::bail!("git clone failed for binary-pull cache");
    }
    let status = crate::git::authed_command(&cache, pat)
        .args(["sparse-checkout", "set", ".minecraft/server_distribution"])
        .status()?;
    if !status.success() {
        anyhow::bail!("git sparse-checkout failed for binary-pull cache");
    }
    Ok(cache)
}

fn binary_pull_cache_dir() -> Result<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var("LOCALAPPDATA").map(PathBuf::from).map_err(|_|
            anyhow::anyhow!("no LOCALAPPDATA env var; can't pick a binary-pull cache dir")
        )?
    } else {
        let home = std::env::var("HOME").map_err(|_|
            anyhow::anyhow!("no HOME env var; can't pick a binary-pull cache dir")
        )?;
        PathBuf::from(home).join(".cache")
    };
    let dir = base.join("icraft-launcher").join("binary-pull");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn launcher_cache_dir() -> Result<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var("LOCALAPPDATA").map(PathBuf::from).map_err(|_|
            anyhow::anyhow!("no LOCALAPPDATA env var; can't pick a cache dir")
        )?
    } else {
        let home = std::env::var("HOME").map_err(|_|
            anyhow::anyhow!("no HOME env var; can't pick a cache dir")
        )?;
        PathBuf::from(home).join(".cache")
    };
    let dir = base.join("icraft-launcher").join("source");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Sparse-clone the launcher source into `dest` (must already exist
/// and be empty). Pulls only iridescent-launcher\ from the repo via
/// blob-filter + cone-mode sparse-checkout.
fn sparse_clone_launcher(dest: &Path, pat: Option<&str>) -> Result<()> {
    let _ = crate::tools::find_tool("git", &[]).ok_or_else(|| anyhow::anyhow!(
        "git not found. Install Git for Windows (https://git-scm.com/download/win) \
         or set ICRAFT_GIT to your git.exe path."
    ))?;
    let repo = std::env::var("ICRAFT_LAUNCHER_REPO")
        .unwrap_or_else(|_| DEFAULT_LAUNCHER_REPO.to_string());

    if dest.join(".git").exists() {
        log::info!("[self-update] cache .git already exists -- skipping clone");
        return Ok(());
    }

    log::info!("[self-update] git clone --filter=blob:none --sparse {repo}");
    let status = crate::git::authed_command(dest, pat)
        .args(["clone", "--filter=blob:none", "--sparse", &repo, "."])
        .status()
        .map_err(|e| anyhow::anyhow!("running git clone: {e}"))?;
    if !status.success() {
        anyhow::bail!("git clone failed (network/auth/repo URL?)");
    }

    log::info!("[self-update] git sparse-checkout set iridescent-launcher");
    let status = crate::git::authed_command(dest, pat)
        .args(["sparse-checkout", "set", "iridescent-launcher"])
        .status()?;
    if !status.success() {
        anyhow::bail!("git sparse-checkout failed");
    }
    Ok(())
}

fn is_launcher_src(p: &Path) -> bool {
    p.join("Cargo.toml").exists() && p.join("icraft-gui").join("Cargo.toml").exists()
}

fn cargo_target_dir(launcher_dir: &Path) -> Result<PathBuf> {
    let cargo = find_tool("cargo", &[])
        .ok_or_else(|| anyhow::anyhow!("cargo not found"))?;
    let out = std::process::Command::new(&cargo)
        .current_dir(launcher_dir)
        .args(["metadata", "--format-version=1", "--no-deps"])
        .output()?;
    if !out.status.success() {
        anyhow::bail!("cargo metadata exited with {:?}", out.status.code());
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)?;
    let dir = v.get("target_directory").and_then(|d| d.as_str())
        .ok_or_else(|| anyhow::anyhow!("no target_directory in cargo metadata"))?;
    Ok(PathBuf::from(dir))
}

// find_tool moved to crate::tools so git.rs / crash.rs can share it.
use crate::tools::find_tool;

fn find_built_exe(target_dir: &Path, name: &str) -> Option<PathBuf> {
    // Fast path: <target>/release/<name>
    let direct = target_dir.join("release").join(name);
    if direct.exists() { return Some(direct); }
    // Slow path: recursively walk for the freshest match.
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    let mut stack = vec![target_dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        for entry in rd.flatten() {
            let p = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(p);
            } else if p.file_name().and_then(|n| n.to_str()) == Some(name) {
                if let Ok(m) = entry.metadata() {
                    if let Ok(t) = m.modified() {
                        if newest.as_ref().map_or(true, |(prev, _)| t > *prev) {
                            newest = Some((t, p));
                        }
                    }
                }
            }
        }
    }
    newest.map(|(_, p)| p)
}
