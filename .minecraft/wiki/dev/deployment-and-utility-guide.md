<!-- INTERNAL ONLY -->

# Deployment and Utility Guide

This page documents how IridescentCraft code reaches the client, the dedicated server, and tester instances. Internal-only — don't mirror to the public wiki.

## 1. High level

Three independent deployment surfaces, all self-updating from `main`:

| Surface | Where it lives | Entry point | Sync mechanism |
|---|---|---|---|
| Dev client (Silvaria) | PrismLauncher instance pointing at the git clone | PrismLauncher pre-launch command | `git pull --ff-only` (Protocol 8, Mode A) |
| Tester client | `.minecraft/distribution/client/` (copy) | `iridescentcraft.bat` or PrismLauncher pre-launch | `sync_client.ps1` (SHA-check + overlay + `download_mods.ps1`) |
| Dedicated server | `.minecraft/server_distribution/` (copy on Windows Server) | `iridescentserver.bat` | `phase0_sync.ps1` (diff-based GitHub sync + self-update swap) |

**None of these require manual copying.** Commit + push to `main` and all three pick up changes on next launch. The only time a manual copy matters is when bootstrapping a brand-new machine (install.ps1 or first-run of iridescentserver.bat).

## 2. Server: iridescentserver.bat phases

File: `.minecraft/server_distribution/iridescentserver.bat`

Every launch executes these phases in order. Phase 0 and 0.5 are the self-update heart of the script.

### Phase 0 — GitHub diff sync (`phase0_sync.ps1`)

1. Reads local `.icraft_last_sha`.
2. Calls GitHub API `/repos/silvariasereneblossom/IridescentCraft/commits/main` → remote SHA.
3. If equal: prints "Up to date" and exits. ~200 ms, no download.
4. If different: calls compare API, gets changed-files list, downloads each from `raw.githubusercontent.com` into place.
5. If the compare payload is truncated (>=300 files) or there's no prior SHA: falls back to full zip download (~100-200 MB, 10-15 min).
6. Deleted files in the diff are `Remove-Item`'d locally.
7. When a file in `$selfUpdateFiles = @('iridescentserver.bat', 'iridescentserver.sh', 'phase0_sync.ps1')` is downloaded, it is written to `<name>.new` instead of overwriting the live file (because `cmd.exe` holds the running bat open).
8. On any network failure: yellow warning + `exit 0` so the server still starts.

### Phase 0.5 — Staged self-update swap

If `iridescentserver.bat.new` or `phase0_sync.ps1.new` exists, the bat atomically `move /y` renames them over the live file, then `start`s a fresh cmd and exits. The new cmd reads the new file from disk.

This is what makes it safe to ship changes to the launcher bat itself — the next launch runs the old code, stages the new code, and relaunches into the new code. No manual intervention.

### Phase 1 — Java check

Bails with instructions if `java -version` fails.

### Phase 2 — First-time install

Runs only if `libraries/net/minecraftforge/forge/1.20.1-47.4.6/` is missing:

- Downloads `forge-1.20.1-47.4.6-installer.jar` from maven.minecraftforge.net
- `java -jar ... --installServer`
- Then downloads mods: if `mods/.index/` exists but `mods/*.jar` count is <10, runs `server_install.ps1` which reads every `.pw.toml` and downloads each mod to `mods/` from Modrinth or edge.forgecdn.net.

### Phase 3 — Mod reconciliation

Always runs when `mods/.index/` is present:

- `strip_client_mods.bat` — removes client-only mods that slipped in
- `update_mods.ps1` — downloads any mod whose `.pw.toml` filename is missing in `mods/`
- Inline PowerShell cleanup — removes any `mods/*.jar` whose filename is **not** in `.index/*.pw.toml` **and** not in the `$customJars` allowlist (see Section 4 below)

### Phase 4 — EULA + JVM args + launch

`eula=true` is auto-written. Launch uses Aikar's flags + `-noverify` (required for bytecode-patched Patchouli + Ars Nouveau).

### Phase 5 — Post-crash snapshot

Non-zero exit writes `crash-<date>_<time>.log` containing the latest `crash-reports/*.txt` plus the last 200 lines of `logs/latest.log`. Combined with `push_crash_logs.bat`, this is what the tester uses to surface crashes to the repo without manual file hunting.

## 3. Client: sync_client.ps1 flow

File: `.minecraft/distribution/client/sync_client.ps1` (copied to the instance root by `install.ps1`).

Invoked either by PrismLauncher pre-launch command or by `iridescentcraft.bat` wrapper.

1. Reads `.icraft_last_sha` in instance root.
2. Hits GitHub API for main's commit SHA.
3. If equal: "Up to date", exits 0 fast.
4. Otherwise: downloads the repo zip (not diff — the client doesn't need deletion semantics the way the server does), extracts, overlays these directories onto the instance:
   - `config/ kubejs/ global_packs/ datapack_sources/ defaultconfigs/ patchouli_books/ resourcepacks/ shaderpacks/`
   - `mods/.index/` (mirror)
5. Writes the new SHA.
6. Calls `download_mods.ps1` which:
   - Reads each `mods/.index/*.pw.toml`
   - Skips mods where `side = 'server'`
   - Skips mods whose filename already exists in `mods/`
   - Downloads the rest (Modrinth direct URL or Curseforge edge URL shaped from file-id).

**What sync_client does NOT touch** — preserved from the instance: `world/`, `logs/`, `crash-reports/`, `backups/`, `libraries/`, `options.txt`, `servers.dat`, `mods/*.jar`.

On any network failure: yellow warning + `exit 0` so the user can still launch offline.

## 4. Custom-JAR allowlist

Some mods are built from source or bytecode-patched locally — they don't have `.pw.toml` entries. They must be protected from the stale-cleanup step of `iridescentserver.bat` Phase 3, `update_mods.ps1`, and `update_mods.sh`.

Current custom jars (as of 2026-04):

- `iridescent_codex_data.jar`
- `iridescent_origins-1.0.0.jar`
- `iridescent_biomes-1.0.0.jar`
- `mek_walkable_cables-1.0.1.jar`
- `offlineskins-1.20.1-v1.jar`
- `zeta_racefix-1.0.0.jar`
- `Patchouli-1.20.1-85-FORGE.jar` (bytecode-patched)
- `ars_nouveau-1.20.1-4.12.7-all.jar` (bytecode-patched)

**When you add a new custom jar:**

1. Drop the jar in all three distros: `.minecraft/mods/`, `.minecraft/server_distribution/mods/`, `.minecraft/distribution/client/mods/`.
2. Add the filename to the `$customJars` array in `iridescentserver.bat` (inline PowerShell cleanup, ~line 239).
3. Add the filename to the same array in `sync_from_repo.bat`.
4. Add the filename to `$customJars` in `update_mods.ps1` and to `CUSTOM_JARS` in `update_mods.sh`.
5. Also add to `distribution/client/sync_client.bat` / `sync_client.ps1` allowlists if those scripts enforce a list (they don't currently — but check).

Forgetting any of these means the self-updater deletes the jar on next run.

## 5. Utility scripts

### Server-side (`server_distribution/`)

| Script | Purpose |
|---|---|
| `diagnose.bat` / `.ps1` | One-shot system check: Java version, RAM, disk, mods count, SHA, last crash summary. Safe to send to testers for remote triage. |
| `firewall_audit.bat` | Lists inbound rules matching java.exe / port 25565 / 24454 (voice chat). Quick sanity check when a tester can't connect. |
| `mark_as_server.bat` | Writes the `.icraft_server` marker file so the self-relocating subfolder logic in `iridescentserver.bat` knows this directory is the real server dir. |
| `push_crash_logs.bat` | Copies `crash-reports/*.txt` and `logs/latest.log` into `TesterLogs/Server Logs/`, then a `git add && commit && push` so the Linux host can see them. (Runs in the repo clone on the Windows Server.) |
| `strip_client_mods.bat` | Deletes known client-only jars from `mods/` before server launch. Run implicitly by `iridescentserver.bat`. |
| `sync_from_repo.bat` | Alternate server update path used when phase0_sync isn't available or when running from a mapped network share. Still honors the custom-jar allowlist. |
| `run.bat` | Bare-bones Forge launch without any sync or phase logic. Use for debugging launch itself. |

### Client-side (`distribution/client/`)

| Script | Purpose |
|---|---|
| `install.ps1` | First-time tester setup: creates a PrismLauncher instance directory, copies the distribution contents, installs `sync_client.ps1`, prompts the user to set the PrismLauncher pre-launch command. |
| `iridescentcraft.bat` | Wrapper that can be used outside PrismLauncher — calls `sync_client.ps1` then launches the MC client via Forge args. |
| `update_configs.bat` / `.ps1` | Force-refresh only the config files (no mods touched). For testers after a balance patch that's config-only. |
| `build_mrpack.ps1` | Packages the current client state into a `.mrpack` for distribution via Modrinth app. Rare — only when cutting a formal release. |

### Linux host (repo root)

| Script | Purpose |
|---|---|
| `update_mods.sh` | Linux-side equivalent of `update_mods.ps1`. Used on the dev Linux host when editing/adding mod tomls and verifying downloads.|
| `verify_distros.sh` / `.bat` / `.ps1` | Cross-checks that `mods/`, `server_distribution/mods/`, and `distribution/client/mods/` contain the same set of custom jars. Run before committing a jar change. |

## 6. Troubleshooting deployment

**"I pushed but the server isn't seeing changes."**

- Confirm the commit reached `main` (`git log origin/main -1`).
- On the server box, check `.icraft_last_sha` in the server_distribution dir. If it matches the commit you pushed, the sync ran and caught up.
- If it's an older SHA, `phase0_sync.ps1` may have failed mid-sync (network). Run `iridescentserver.bat /force` — that flag deletes `.icraft_last_sha` and forces a full zip re-sync on the next launch.

**"The server deleted my custom jar on launch."**

- Missing allowlist entry. See Section 4 and add the filename to every script that has a `$customJars` / `CUSTOM_JARS` list.

**"phase0_sync.ps1.new landed but didn't get applied."**

- Phase 0.5 only swaps `.new` files if there's still a live bat to swap them in for. If the live bat is also broken, manual fix: in the server_distribution dir, run `move /y phase0_sync.ps1.new phase0_sync.ps1` then relaunch.

**"Tester's install.ps1 won't run."**

- Usually PowerShell execution policy. Right-click → Run with PowerShell, or launch from an admin cmd: `powershell -ExecutionPolicy Bypass -File install.ps1`.

## 7. Protocol cross-reference

- Protocol 8 (PrismLauncher pre-launch client sync) covers the client-side details this page summarizes.
- Protocol 7 (Chunky pre-generation) assumes the server is already running correctly — rely on Section 2 above to get there first.
