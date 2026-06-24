# Protocol 8: PrismLauncher Pre-Launch Client Sync

## Purpose

Keep a PrismLauncher IridescentCraft instance in sync with the `main` branch automatically, so every launch picks up the latest configs, KubeJS scripts, datapacks, and mod metadata without the user needing to remember to run an updater.

PrismLauncher supports per-instance pre-launch commands under **Settings → Custom Commands → Pre-launch command**. The command runs before Minecraft starts; if it exits with a non-zero status, the launch aborts. Environment variables available:

- `$INST_DIR` — instance root (contains `instance.cfg`, `mmc-pack.json`, `.minecraft`)
- `$INST_MC_DIR` — the `.minecraft` directory
- `$INST_JAVA` — Java path
- `$INST_JAVA_ARGS` — JVM args

## Two modes

### Mode A — Dev / first-party (force-sync to `origin/main`)

If your PrismLauncher instance *is* the git repo (GitHub Desktop keeps it synced), set the pre-launch command to the bundled hook:

```
"$INST_MC_DIR/prism_prelaunch.bat"
```

This hook **force-syncs** the instance to pushed `origin/main` (fetch + hard reset), not a plain `git pull`. A force-sync is used deliberately: a stray local commit or edit can make `git pull --ff-only` fail on every launch and then leave the instance **silently stale** for weeks, still carrying mods that `origin` has since removed (a registry mismatch that disconnects you on join). The hard reset can never get stuck — it discards any local divergence and mirrors pushed HEAD every launch.

Your worlds are safe: saves, logs, options, and other runtime state are untracked, so the reset never touches them. After syncing, the hook also reconciles the mod index, cleans up stale JARs, downloads any new ones, and re-wires the instance (see *Self-healing wiring* below).

Pros: instant, no manual updater, picks up an update to the hook itself on the same launch.

Cons: requires the instance to be a git clone (the case for the Silvaria dev setup via GitHub Desktop) with git on PATH. If git is not on PATH, the launch records a "git-missing" status and warns rather than syncing (see *Failure handling*).

> The legacy bare `git -C "$INST_DIR" pull --ff-only` command is **superseded** — it is the exact wedge-prone seed that caused silent staleness. Instances still wired to it (or to the zip-path `sync_client.bat`) are auto-upgraded to `prism_prelaunch.bat` on the next launch by the self-healing wiring step.

### Mode B — Tester / distribution (SHA-check sync script)

For testers using `distribution/client/install.ps1` — their instance is **not** a git clone, it's a copy of the packaged client. They use `sync_client.ps1` which:

1. Hits the GitHub API for the latest main commit SHA
2. Compares against `.icraft_last_sha` in the instance root
3. If they match, prints "Up to date" and exits fast (~200ms API call, no download)
4. If they differ, downloads the repo zip, overlays `config/ kubejs/ global_packs/ datapack_sources/ defaultconfigs/ patchouli_books/ resourcepacks/ shaderpacks/` onto the instance, mirrors `mods/.index/`, writes the new SHA, and fetches/verifies the mod JARs (see *Mod fetching* below)

**Install location:** `install.ps1` already copies `sync_client.ps1`, `sync_client.bat`, `gen_pwpack.ps1`, and `packwiz-installer-bootstrap.jar` into `$INST_MC_DIR` during initial install. Users set the pre-launch command once.

Like Mode A, the zip-path sync now records a sync status that the diagnostic and the in-game warning can read, so a failed update is **visible** rather than silent (see *Failure handling*).

### Mod fetching — packwiz-installer (CurseForge API key required)

The mod-fetch step uses the official **packwiz-installer** (it reads the same `mods/.index/` metadata the pack already ships). CurseForge mods download through the **authenticated CurseForge API** instead of the old hand-shaped, unauthenticated `forgecdn` URLs that caused the recurring fresh-install "missing mods" flake. Two per-host prerequisites:

- **CurseForge API key.** Get a free key at [console.curseforge.com](https://console.curseforge.com/) → **API Keys**, then save just the key (one line) to **`$INST_MC_DIR/.icraft_cf_token`** (gitignored — the public repo never carries it; same pattern as the GitHub PAT). Set `CF_API_KEY` in the environment instead if you prefer.
- **Java.** packwiz-installer is a Java program; the sync auto-detects PrismLauncher's bundled/configured Java (or system `java`).

If **either** is missing, the sync **falls back to the legacy `download_mods.ps1`** so a tester is never bricked — but that's the flakier path, so place the key. The bootstrap jar is fed a flat pack generated from `mods/.index/` (`gen_pwpack.ps1`) each run, so the mod index can never drift, and jars install to `mods/` via `--pack-folder`. A path-independent **completeness gate** then verifies every indexed jar is on disk and re-flags any gap.

**PrismLauncher pre-launch command (Windows):**

```
powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"
```

Or via the bat wrapper:

```
"%INST_MC_DIR%\sync_client.bat"
```

## Failure handling

A sync hiccup never blocks play — the launch always proceeds even if the update couldn't be applied. But "launch anyway" used to mean "launch *silently* stale," which is how an instance can drift far behind without anyone noticing. The pre-launch hook is now **fail-visible**:

- It records the result of every launch's sync to a small status file in the instance (a per-launch sentinel, not committed to the repo). A successful sync clears it; a failure records *why* (offline/auth, git not on PATH, or sync blocked) and how far behind the instance is.
- Failures also print an on-screen warning ("pushes are NOT arriving — tell Silvaria") in the pre-launch log, and an in-game warning surfaces so a stale launch is obvious from inside the game rather than passing silently.
- Auth problems **fail fast**: the hook never hangs waiting for a credential prompt that can't be answered in the pre-launch context — it fails immediately, records the reason, and launches.

This **supersedes** the old behavior where the script simply exited 0 with at most a yellow console line. "Continuing with existing files" is still the safe default on a network hiccup, but a failed sync is now recorded and surfaced, not swallowed.

For a full read-only check of a machine's sync setup, run `dev/diagnose_sync.ps1` — it reads the recorded sync status and reports a PASS/FAIL for each link in the chain (git on PATH, instance is a clone, launcher wiring, remote/auth). It changes nothing; it only diagnoses. Use it when an instance looks out of date.

## Verifying it works

After setting the pre-launch command, launch the instance once. PrismLauncher shows the output in the launch log (or a popup, depending on settings).

**Mode A (force-sync):** you should see the `[prism_prelaunch]` steps — fetch, the behind-count before sync, the hard reset, then the post-sync index reconcile, stale-JAR cleanup, mod downloads, and the wiring check:

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

A non-zero behind-count followed by "instance now mirrors origin/main" means the update landed this launch. A warning that pushes are NOT arriving means the sync failed and the launch is running on existing files — check the recorded status with `dev/diagnose_sync.ps1`.

**Mode B (zip overlay):** you should see the `[IridescentCraft Sync]` lines instead:

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

These are preserved from the instance regardless of mode. In Mode B the overlay deliberately skips them; in Mode A they survive the hard reset because they're untracked or git-ignored, so the reset only rewrites tracked pack files and never your runtime state.

- `world/` — save data
- `logs/`, `crash-reports/` — runtime output
- `backups/` — FastBack history
- `libraries/` — Forge/Minecraft libraries
- `mods/*.jar` — handled separately by `download_mods.ps1` (diff-aware)
- `options.txt` — player keybinds and graphics preferences
- `servers.dat` — server list
- `usercache.json`, `whitelist.json`, etc. — server-only files that shouldn't exist on client anyway

## When to use which mode

- **Silvaria's own dev instance:** Mode A (force-sync to `origin/main` via `prism_prelaunch.bat`). Fast, and the git history gives you rollback if something goes wrong
- **Tester instances:** Mode B (sync_client.ps1). Handles the zip-download path cleanly, no git required

## Self-healing wiring

PrismLauncher only honors a pre-launch command when the instance's launcher settings are wired correctly — and those settings can drift (a manual edit, an import, a launcher upgrade) and silently disable syncing. To make that self-correcting, the pre-launch hook re-checks and repairs the instance's launcher wiring on every launch:

- Asserts the launcher's "override commands" gate is on — without it, the pre-launch and post-exit commands are ignored entirely.
- Upgrades the two known stale pre-launch seeds (the legacy bare `git pull --ff-only` and the zip-path `sync_client.bat`) to `prism_prelaunch.bat`. Any other custom command is left alone.
- Uses the launcher's bundled portable Java instead of a hardcoded Java path, so the instance still launches after Java is moved or reinstalled, or when copied to a new machine.

This heals on the **second and later** launches only — the very first launch still needs the one-time manual wiring (the hook can't run until it's wired as the pre-launch command). That one-time setup is documented in the new-machine setup guide.

## Bytecode-patched JARs — re-apply after mod updates

<!-- Audit Phase 8.3 closure (FINDINGS #34) -->

Two JARs in `mods/` are bytecode-patched. Updating either via packwiz/Modrinth/CurseForge replaces the patched binary with vanilla, silently breaking pack-internal balance.

**Patched jars + what they do:**

| JAR | Patch | Why |
|-----|-------|-----|
| `Patchouli-1.20.1-85-FORGE.jar` | `athrow → pop` in `Book.class` | Disables `use_resource_pack` enforcement so we can ship the codex without forcing the player's resource pack settings |
| `ars_nouveau-1.20.1-4.12.7-all.jar` | `doApply → immediate return` in `DungeonLootEnhancerModifier.class` | Disables Ars Nouveau's chest loot injection so our curated chest pools aren't drowned in Ars items |

Both patches require **`-noverify` JVM arg** because the patches create dead code paths the JVM verifier rejects (see CLAUDE.md "JVM Requirement: -noverify").

### Re-apply checklist

When updating either mod:

1. **Don't merge the update** until you've decided whether to keep the patch
2. Locate the original patched JAR in git history: `git log --all --oneline -- '.minecraft/mods/<jar>.jar'`
3. Re-apply the bytecode patch on the new version using the same approach (asm-based class file edit, javap to verify the bytecode delta is what you expect)
4. Replace the unpatched JAR in all 3 distros (`mods/`, `server_distribution/mods/`, `distribution/client/mods/`)
5. Update the version in `.pw.toml` if needed but DO NOT let packwiz re-download — the URL points to the unpatched upstream
6. Test: launch the dev instance, confirm the patched behavior holds (Patchouli book still opens without resource pack enforcement; Ars chest loot doesn't auto-inject)

**Anti-pattern:** running `packwiz update <mod>` and forgetting either jar exists. Mitigation — these jars are listed in CLAUDE.md "Custom Bundled JARs" + this protocol; reviewers must check before merging mod updates.
