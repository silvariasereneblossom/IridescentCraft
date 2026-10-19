# Protocol 8: PrismLauncher Pre-Launch Client Sync

## Purpose

This protocol keeps a PrismLauncher IridescentCraft instance in sync with the `main` branch automatically. Every launch picks up the latest configs, KubeJS scripts, datapacks and mod metadata, and the user never has to remember to run an updater.

PrismLauncher has a per-instance pre-launch command under Settings → Custom Commands → Pre-launch command. It runs before Minecraft starts, and if it exits with a non-zero status the launch aborts. These environment variables are available:

- `$INST_DIR`: instance root (contains `instance.cfg`, `mmc-pack.json`, `.minecraft`)
- `$INST_MC_DIR`: the `.minecraft` directory
- `$INST_JAVA`: Java path
- `$INST_JAVA_ARGS`: JVM args

## Two modes

### Mode A: Dev / first-party (force-sync to `origin/main`)

If your PrismLauncher instance *is* the git repo (GitHub Desktop keeps it synced), set the pre-launch command to the bundled hook:

```
"$INST_MC_DIR/prism_prelaunch.bat"
```

This hook force-syncs the instance to pushed `origin/main` (fetch + hard reset) instead of running a plain `git pull`. The force-sync is deliberate. A stray local commit or edit can make `git pull --ff-only` fail on every launch and leave the instance silently stale for weeks, still carrying mods that `origin` has since removed (a registry mismatch that disconnects you on join). The hard reset cannot get stuck: it discards any local divergence and mirrors pushed HEAD on every launch.

Your worlds are safe. Saves, logs, options and other runtime state are untracked, so the reset never touches them. After syncing, the hook also reconciles the mod index, cleans up stale JARs, downloads any new ones and re-wires the instance (see *Self-healing wiring* below).

Pros: it is instant, needs no manual updater, and picks up an update to the hook itself on the same launch.

Cons: the instance must be a git clone (the case for the Silvaria dev setup via GitHub Desktop) with git on PATH. Without git on PATH, the launch records a "git-missing" status and warns instead of syncing (see *Failure handling*).

> The legacy bare `git -C "$INST_DIR" pull --ff-only` command is superseded: it is the seed that wedged and caused the silent staleness. On the next launch, the self-healing wiring step upgrades a git-clone instance still wired to it (or to the zip-path `sync_client.bat`, the Mode B hook, which is the wrong one for a clone) to `prism_prelaunch.bat`.

### Mode B: Tester / distribution (SHA-check sync script)

Testers install with `distribution/client/install.ps1`, so their instance is a copy of the packaged client, **not** a git clone. They use `sync_client.ps1`, which:

1. Hits the GitHub API for the latest main commit SHA
2. Compares it against `.icraft_last_sha` in the instance's .minecraft directory
3. If they match, prints "Up to date" and exits fast (about 200ms for the API call, no download)
4. If they differ, downloads the repo zip, overlays `config/ kubejs/ global_packs/ datapack_sources/ defaultconfigs/ patchouli_books/ resourcepacks/ shaderpacks/` onto the instance, mirrors `mods/.index/`, writes the new SHA, and fetches and verifies the mod JARs (see *Mod fetching* below)

During the initial install, `install.ps1` already copies `sync_client.ps1`, `sync_client.bat`, `download_mods.ps1`, `cleanup_stale_jars.ps1`, `gen_pwpack.ps1` and the two packwiz-installer jars into `$INST_MC_DIR`, and it sets the instance's pre-launch command to the bat wrapper below, so testers do not set it themselves.

Like Mode A, the zip-path sync records a sync status that the diagnostic can read, so a failed update is visible instead of silent (see *Failure handling*).

### Mod fetching: `download_mods.ps1`

Every tester's sync downloads mods with `download_mods.ps1`, which reads `mods/.index/` directly and fetches each missing jar. A completeness gate that does not depend on paths then verifies that every indexed jar is on disk and flags any gap.

The script also carries a packwiz-installer path (CurseForge through the authenticated API, a CurseForge key in `$INST_MC_DIR/.icraft_cf_token`, Java), but it runs only when the instance holds a `pack.toml`, and neither the installer nor the sync delivers one. That is deliberate for now: on the index a tester's instance carries, packwiz-installer stops before downloading anything (some metafiles carry no download url) and the sync has no fallback when it fails. The status file records the fallback as `packwiz-fallback:no-pack.toml`, which is not a failure.

The repository's top-level copies of the launcher scripts (`.minecraft/sync_client.ps1`, `.bat`, `download_mods.ps1`) are old and run nowhere: an instance's scripts come from `distribution/client/`. Since 2026-10-19 the sync never copies or deletes those top-level names in an instance.

**PrismLauncher pre-launch command (Windows):**

```
powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"
```

Or through the bat wrapper, the preferred form: it is what the installer sets, and the sync rewrites the direct PowerShell command above to it, because only the bat can apply updates to the sync scripts:

```
"%INST_MC_DIR%\sync_client.bat"
```

## Failure handling

A sync hiccup never blocks play: the launch always goes ahead, even when the update could not be applied. "Launch anyway" used to mean "launch *silently* stale," which is how an instance can drift far behind without anyone noticing. The pre-launch hook is now fail-visible:

- It records the result of every launch's sync to a small status file in the instance (a per-launch sentinel, not committed to the repo). A successful sync clears it; a failure records *why* (offline/auth, git not on PATH, or sync blocked) and how far behind the instance is.
- A failure also prints an on-screen warning in the pre-launch log (in Mode A, "pushes are NOT arriving. Tell Silvaria"). Nothing warns inside the game: the status file is read by the diagnostic described below.
- Auth problems fail fast. The hook never hangs on a credential prompt that cannot be answered in the pre-launch context; it fails at once, records the reason and launches.

This replaces the old behavior, where the script simply exited 0 with at most a yellow console line. "Continuing with existing files" is still the safe default on a network hiccup, but a failed sync is now recorded and reported.

For a full read-only check of a machine's sync setup, run `dev/diagnose_sync.ps1`. It reads the recorded sync status and reports PASS or FAIL for each link in the chain (git on PATH, instance is a clone, launcher wiring, remote/auth), and it changes nothing. Use it when an instance looks out of date.

## Verifying it works

After setting the pre-launch command, launch the instance once. PrismLauncher shows the output in the launch log (or in a popup, depending on settings).

In Mode A (force-sync) you should see the `[prism_prelaunch]` steps: the fetch, the behind-count before the sync, the hard reset, then the post-sync index reconcile, the stale-JAR cleanup, the mod downloads and the wiring check:

```
[prism_prelaunch] git fetch origin...
[prism_prelaunch] behind origin/main by 0 commit(s) before sync.
[prism_prelaunch] force-sync: reset --hard origin/main ...
[prism_prelaunch] instance now mirrors origin/main.
[prism_prelaunch] reconcile mods\.index ...
[prism_prelaunch] cleanup stale jars...
[prism_prelaunch] download missing packwiz jars...
[prism_prelaunch] wire instance.cfg (PreLaunch + PostExit hooks)...
```

A non-zero behind-count followed by "instance now mirrors origin/main" means the update landed on this launch. A warning that pushes are NOT arriving means the sync failed and the launch is running on the existing files; check the recorded status with `dev/diagnose_sync.ps1`.

In Mode B (zip overlay) you should see the `[IridescentCraft Sync]` lines instead:

```
[IridescentCraft Sync] Instance: C:\...\IridescentCraft\.minecraft
[IridescentCraft Sync] Up to date (commit abc1234).
```

Or, when there are changes:

```
[IridescentCraft Sync] New commit: xyz9876 (was abc1234). Downloading...
[IridescentCraft Sync] Overlaid: config, kubejs, global_packs, mods/.index
[IridescentCraft Sync] Checking for new mod JARs...
  ...new jar downloads...
[IridescentCraft Sync] Done — launching...
```

## What it does NOT sync

The instance keeps these in either mode. In Mode B the overlay skips them on purpose; in Mode A they survive the hard reset because they are untracked or git-ignored, and the reset only rewrites tracked pack files, never your runtime state.

- `world/`: save data
- `logs/`, `crash-reports/`: runtime output
- `backups/`: world backups
- `libraries/`: Forge/Minecraft libraries
- `mods/*.jar`: handled separately by the mod-fetch step (`download_mods.ps1` in both modes)
- `options.txt`: player keybinds and graphics preferences
- `servers.dat`: server list
- `usercache.json`, `whitelist.json`, etc.: server-only files that shouldn't exist on a client anyway

## Your logs and crash reports

They stay on your PC and are never committed to the pack repository: it is public, and a log or a crash report carries player names, chat and addresses. After each session the post-exit hook keeps a copy of the session's logs, and of any crash report it wrote, in `.minecraft/TesterLogs/<your account>/`; it no longer pushes anything. When you hit a problem, send those files (or `logs/latest.log` and the newest file in `crash-reports/`) privately to Silvaria, who files them in a private log repository.

Until 2026-10-15 the repository tracked a set of old logs and crash reports (so a Mode A sync put the tracked `logs/latest.log` back on every launch). The first Mode A sync after that date removes every file at those tracked paths from the instance, including the previous session's `logs/latest.log`, `logs/debug.log` and KubeJS logs and the `TesterLogs/` copies; logs and crash reports under any other name stay. From then on the sync leaves all of them alone.

## When to use which mode

- Silvaria's own dev instance: Mode A (force-sync to `origin/main` via `prism_prelaunch.bat`). It is fast, and the git history gives you a rollback if something goes wrong.
- Tester instances: Mode B (sync_client.ps1). It handles the zip-download path cleanly and needs no git.

## Self-healing wiring

PrismLauncher honors a pre-launch command only when the instance's launcher settings are wired correctly, and those settings can drift (a manual edit, an import, a launcher upgrade) and silently disable syncing. To correct that, the pre-launch hook checks and repairs the instance's launcher wiring on every launch:

- It makes sure the launcher's "override commands" setting is on; without it, the pre-launch and post-exit commands are ignored entirely.
- It upgrades the two known stale pre-launch seeds (the legacy bare `git pull --ff-only` and the zip-path `sync_client.bat`) to `prism_prelaunch.bat`. Any other custom command is left alone. This runs only in a git-clone instance: for a tester's Mode B instance the zip-path bat is the right hook, and the sync there repairs its own wiring.
- It uses the launcher's bundled portable Java instead of a hardcoded Java path, so the instance still launches after Java is moved or reinstalled, or after the instance is copied to a new machine.

The repair only works on the second and later launches. The very first launch still needs the one-time manual wiring, because the hook cannot run until it is wired as the pre-launch command. The new-machine setup guide documents that one-time setup.

## Bytecode-patched JARs: re-apply after mod updates

<!-- Audit Phase 8.3 closure (FINDINGS #34) -->

Two JARs in `mods/` are bytecode-patched. Updating either one through packwiz, Modrinth or CurseForge replaces the patched binary with the unpatched one and silently breaks the pack's internal balance.

The patched jars and what the patches do:

| JAR | Patch | Why |
|-----|-------|-----|
| `Patchouli-1.20.1-85-FORGE.jar` | `athrow → pop` in `Book.class` | Disables `use_resource_pack` enforcement so we can ship the codex without forcing the player's resource pack settings |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | `doApply → immediate return` in `DungeonLootEnhancerModifier.class` | Disables Ars Nouveau's chest loot injection so our curated chest pools aren't drowned in Ars items |

Both patches need the `-noverify` JVM arg, because they create dead code paths that the JVM verifier rejects (see CLAUDE.md "JVM Requirement: -noverify").

### Re-apply checklist

When updating either mod:

1. **Don't merge the update** until you've decided whether to keep the patch
2. Find the original patched JAR in git history: `git log --all --oneline -- '.minecraft/mods/<jar>.jar'`
3. Re-apply the bytecode patch to the new version the same way (an asm-based class file edit, with javap to confirm the bytecode delta is what you expect)
4. Replace the unpatched JAR in all 3 distros (`mods/`, `server_distribution/mods/`, `distribution/client/mods/`)
5. Release it as one of the pack's own jars (both are listed in `custom_jars_manifest.json`): the custom-jar release regenerates the manifest and points the jar's `.pw.toml` at the committed patched copy, never at the unpatched upstream download. After a release under a new file name, `intake.py update <mod> <new jar>` moves the mod's intake record to it
6. Test: launch the dev instance and confirm the patched behavior holds (the Patchouli book still opens without resource pack enforcement; Ars chest loot doesn't auto-inject)

**Anti-pattern:** running `packwiz update <mod>` and forgetting that either jar exists. As a guard, both jars are listed in CLAUDE.md "Custom Bundled JARs" and in this protocol, and the mod-intake tool refuses to move one of the pack's own jars to a new file name before the custom-jar release has done it.
