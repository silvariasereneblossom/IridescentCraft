# Protocol 8: PrismLauncher Pre-Launch Client Sync

## Purpose

Keep a PrismLauncher IridescentCraft instance in sync with the `main` branch automatically, so every launch picks up the latest configs, KubeJS scripts, datapacks, and mod metadata without the user needing to remember to run an updater.

PrismLauncher supports per-instance pre-launch commands under **Settings → Custom Commands → Pre-launch command**. The command runs before Minecraft starts; if it exits with a non-zero status, the launch aborts. Environment variables available:

- `$INST_DIR` — instance root (contains `instance.cfg`, `mmc-pack.json`, `.minecraft`)
- `$INST_MC_DIR` — the `.minecraft` directory
- `$INST_JAVA` — Java path
- `$INST_JAVA_ARGS` — JVM args

## Two modes

### Mode A — Dev / first-party (git pull)

If your PrismLauncher instance *is* the git repo (GitHub Desktop keeps it synced), the simplest pre-launch command is:

```
git -C "$INST_DIR" pull --ff-only
```

Windows form:

```
git -C "%INST_DIR%" pull --ff-only
```

Pros: instant, no custom scripts, git handles everything including mod JAR tracking if they're in the repo.

Cons: requires the instance to be a git clone (which is the case for the Silvaria dev setup via GitHub Desktop). If git is not on PATH, this fails.

### Mode B — Tester / distribution (SHA-check sync script)

For testers using `distribution/client/install.ps1` — their instance is **not** a git clone, it's a copy of the packaged client. They use `sync_client.ps1` which:

1. Hits the GitHub API for the latest main commit SHA
2. Compares against `.icraft_last_sha` in the instance root
3. If they match, prints "Up to date" and exits fast (~200ms API call, no download)
4. If they differ, downloads the repo zip, overlays `config/ kubejs/ global_packs/ datapack_sources/ defaultconfigs/ patchouli_books/ resourcepacks/ shaderpacks/` onto the instance, mirrors `mods/.index/`, writes the new SHA, and invokes `download_mods.ps1` for any new JARs (that script skips existing JARs by filename)

**Install location:** `install.ps1` already copies `sync_client.ps1` and `sync_client.bat` into `$INST_MC_DIR` during initial install. Users set the pre-launch command once.

**PrismLauncher pre-launch command (Windows):**

```
powershell -ExecutionPolicy Bypass -File "%INST_MC_DIR%\sync_client.ps1"
```

Or via the bat wrapper:

```
"%INST_MC_DIR%\sync_client.bat"
```

## Failure handling

Both the API call and the zip download have short timeouts (10s / 60s). On **any** network failure the script prints a yellow warning and exits 0 so Minecraft still launches — "continuing with existing files" is always safer than blocking play. The pre-launch command will never gate a session on a network hiccup.

## Verifying it works

After setting the pre-launch command, launch the instance once. You should see console output (PrismLauncher shows it in the launch log or a popup depending on settings):

```
[IridescentCraft Sync] Instance: C:\...\IridescentCraft\.minecraft
[IridescentCraft Sync] Up to date (commit abc1234).
```

Or if there are actual changes:

```
[IridescentCraft Sync] New commit: xyz9876 (was abc1234). Downloading...
[IridescentCraft Sync] Overlaid: config, kubejs, global_packs, mods/.index
[IridescentCraft Sync] Checking for new mod JARs...
  ...new jar downloads...
[IridescentCraft Sync] Done — launching...
```

## What it does NOT sync

Deliberately excluded (preserved from the instance):

- `world/` — save data
- `logs/`, `crash-reports/` — runtime output
- `backups/` — FastBack history
- `libraries/` — Forge/Minecraft libraries
- `mods/*.jar` — handled separately by `download_mods.ps1` (diff-aware)
- `options.txt` — player keybinds and graphics preferences
- `servers.dat` — server list
- `usercache.json`, `whitelist.json`, etc. — server-only files that shouldn't exist on client anyway

## When to use which mode

- **Silvaria's own dev instance:** Mode A (git pull). Fastest and the git history gives you rollback if something goes wrong
- **Tester instances:** Mode B (sync_client.ps1). Handles the zip-download path cleanly, no git required
