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
    #[cfg(windows)]
    {
        let backup = exe.with_extension("exe.old");
        let _ = fs::remove_file(&backup);
        fs::rename(&exe, &backup)
            .map_err(|e| anyhow::anyhow!("rename running exe -> .old: {e}"))?;
        if let Err(e) = fs::rename(&staged, &exe) {
            // Try to restore the backup before bubbling
            let _ = fs::rename(&backup, &exe);
            return Err(anyhow::anyhow!("rename .new -> live: {e}"));
        }
    }

    #[cfg(not(windows))]
    {
        fs::rename(&staged, &exe)
            .map_err(|e| anyhow::anyhow!("rename .new -> live: {e}"))?;
    }

    // Spawn the new binary as a detached child. Caller exits.
    log::info!("[self-update] spawning new instance: {}", exe.display());
    std::process::Command::new(&exe)
        .current_dir(&cfg.server_dir)
        .spawn()?;
    Ok(true)
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
        .status()
        .map_err(|e| anyhow::anyhow!("running git pull failed: {e}"))?;
    if !pull.success() {
        anyhow::bail!("git pull failed (resolve conflicts and retry)");
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

    // Deploy + commit + push the binary to the repo so consumer boxes
    // (no git/cargo) can pull via Update Launcher's HTTP-based github_diff.
    // Repo root: prefer ICRAFT_REPO_ROOT, else assume launcher source is
    // a sibling of .minecraft\ inside the same repo (the nested layout).
    let deploy_root = std::env::var("ICRAFT_REPO_ROOT").ok().map(PathBuf::from)
        .or_else(|| src_dir.parent().map(Path::to_path_buf));
    if let Some(root) = deploy_root {
        let canonical = root.join(".minecraft").join("server_distribution").join(&exe_name);
        if canonical.parent().map_or(false, |p| p.exists()) {
            log::info!("[self-update] deploying canonical -> {}", canonical.display());
            fs::copy(&built, &canonical)
                .map_err(|e| anyhow::anyhow!("canonical copy: {e}"))?;
            if let Err(e) = git_commit_push_binary(&git_exe, &root, &canonical, &exe_name, pat.as_deref()) {
                // Non-fatal: local apply still proceeds even if push fails.
                log::warn!("[self-update] repo push skipped: {e:#}");
            }
        } else {
            log::info!(
                "[self-update] {} doesn't have .minecraft/server_distribution/; \
                 skipping repo deploy (set ICRAFT_REPO_ROOT to enable)",
                root.display()
            );
        }
    }

    // Stage as <running>.new next to the running binary.
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
    use std::process::{Command, Stdio};

    let git = find_tool("git", &[]).ok_or_else(|| anyhow::anyhow!(
        "git not found. Install Git for Windows (https://git-scm.com/download/win) \
         or set ICRAFT_GIT to your git.exe path."
    ))?;
    log::info!("[self-update] git: {}", git.display());
    // PAT-authed network ops bypass the credential manager prompt.
    let pat = crate::crash::read_pat(cfg);

    let exe = std::env::current_exe()?;
    let repo_root = find_git_root(exe.parent().unwrap_or(&exe)).ok_or_else(|| anyhow::anyhow!(
        "no git working tree found containing {}. Initialize one in the dir \
         the exe runs from (see pull_repo_binary_apply_gui docs for the \
         flat / sparse-checkout setup).",
        exe.display()
    ))?;
    log::info!("[self-update] git working tree: {}", repo_root.display());

    // Path of the running exe relative to the working tree, with
    // forward slashes so git's pathspec accepts it on both platforms.
    let rel = exe.strip_prefix(&repo_root)
        .map_err(|_| anyhow::anyhow!(
            "exe {} is not inside repo at {}",
            exe.display(), repo_root.display()
        ))?
        .to_string_lossy()
        .replace('\\', "/");

    log::info!("[self-update] git fetch origin --depth=1");
    let fetch = crate::git::authed_command(&repo_root, pat.as_deref())
        .args(["fetch", "origin", "--depth=1"])
        .status()
        .map_err(|e| anyhow::anyhow!("running git fetch: {e}"))?;
    if !fetch.success() {
        anyhow::bail!("git fetch failed (resolve auth/network and retry)");
    }

    // Resolve the remote ref to read the binary from. Track HEAD's
    // upstream branch so weird branches (release/*, etc.) just work.
    let upstream = Command::new(&git)
        .current_dir(&repo_root)
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
    let exe_name = exe.file_name().and_then(|n| n.to_str())
        .unwrap_or(if cfg!(windows) { "icraft-gui.exe" } else { "icraft-gui" });
    let staged = exe.with_file_name(format!("{exe_name}.new"));
    log::info!("[self-update] git show {remote_ref}:{rel} > {}", staged.display());
    let staged_file = File::create(&staged)
        .map_err(|e| anyhow::anyhow!("create {}: {e}", staged.display()))?;
    let show = Command::new(&git)
        .current_dir(&repo_root)
        .args(["show", &format!("{remote_ref}:{rel}")])
        .stdout(Stdio::from(staged_file))
        .status()?;
    if !show.success() {
        let _ = fs::remove_file(&staged);
        anyhow::bail!(
            "git show failed -- is {rel} tracked in {remote_ref}? \
             (make sure the dev box has pushed the binary)"
        );
    }
    let bytes = fs::metadata(&staged).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        let _ = fs::remove_file(&staged);
        anyhow::bail!(
            "staged file is empty -- {rel} likely isn't tracked in {remote_ref}"
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

/// Stage + commit + push the freshly built binary to the repo so consumer
/// boxes can pull it via Update Launcher. No-op silently if there's
/// nothing to commit (binary byte-identical to the existing repo copy).
/// Errors bubble up but the caller treats them as non-fatal.
fn git_commit_push_binary(
    git_exe: &Path,
    repo_root: &Path,
    canonical: &Path,
    exe_name: &str,
    pat: Option<&str>,
) -> Result<()> {
    use std::process::Command;
    let rel = format!(".minecraft/server_distribution/{exe_name}");
    let add = Command::new(git_exe)
        .current_dir(repo_root).args(["add", &rel])
        .status()?;
    if !add.success() {
        anyhow::bail!("git add failed");
    }
    let unchanged = Command::new(git_exe)
        .current_dir(repo_root).args(["diff", "--cached", "--quiet"])
        .status()?.success();
    if unchanged {
        log::info!("[self-update] binary unchanged; nothing to push");
        let _ = canonical;
        return Ok(());
    }
    let commit = Command::new(git_exe)
        .current_dir(repo_root).args(["commit", "-m", &format!("{exe_name}: rebuild")])
        .status()?;
    if !commit.success() {
        anyhow::bail!("git commit failed");
    }
    // PAT-authed push: extraHeader bypasses Windows Credential
    // Manager so the operator never sees a prompt.
    let push_result = match pat {
        Some(p) => crate::git::push_with_pat(repo_root, p),
        None    => {
            log::warn!(
                "[self-update] no PAT configured; falling back to plain git push \
                 (may prompt for credentials). Save a PAT via the GitHub auth \
                 panel to avoid this."
            );
            crate::git::push(repo_root)
        }
    };
    if let Err(e) = push_result {
        anyhow::bail!("git push failed: {e}");
    }
    log::info!("[self-update] pushed new {exe_name} to repo");
    Ok(())
}

fn current_exe_name() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_owned))
        .unwrap_or_else(|| if cfg!(windows) { "icraft-gui.exe".into() } else { "icraft-gui".into() })
}

fn find_launcher_src() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ICRAFT_LAUNCHER_SRC") {
        let pb = PathBuf::from(p);
        if is_launcher_src(&pb) { return Some(pb); }
    }
    // Walk up from the running exe's directory.
    let exe = std::env::current_exe().ok()?;
    let mut cur = exe.parent();
    while let Some(c) = cur {
        let candidate = c.join("iridescent-launcher");
        if is_launcher_src(&candidate) { return Some(candidate); }
        // Also check `c` itself, in case the exe is sitting inside the
        // launcher source tree (e.g. running directly from target/release/).
        if is_launcher_src(c) { return Some(c.to_path_buf()); }
        cur = c.parent();
    }
    None
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
