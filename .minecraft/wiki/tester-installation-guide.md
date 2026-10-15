# Tester Installation Guide

End-to-end setup for joining the IridescentCraft alpha as a tester. Covers client install on Windows + Linux, dedicated server install on Windows + Linux, and the auto-update flow that keeps your install in sync with the `main` branch.

The full pack is **Forge 1.20.1-47.4.6, ~450 mods, ~3 GB on disk**. First-time mod download is slow (5–30 minutes depending on connection); subsequent launches are fast because the auto-sync only fetches deltas.

---

## Quick links — distribution scripts

Direct downloads from `main`. Right-click → Save link as. **All four scripts are true one-shot bootstraps** — download just the single file, run it, and it pulls everything else from GitHub (Forge installer, mods, configs, datapacks). No zip extraction or `git clone` needed.

| Platform | Client (PrismLauncher .mrpack builder) | Server (full self-bootstrap) |
|---|---|---|
| Windows | [iridescentcraft.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat) | [iridescentserver.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.bat) |
| Linux | [iridescentcraft.sh](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.sh) | [iridescentserver.sh](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.sh) |

The server scripts auto-create a clean `IridescentCraft Dedicated Server\` (Windows) / `IridescentCraft-Dedicated-Server/` (Linux) subfolder next to wherever you saved them, copy themselves there, and bootstrap from inside. So you can save the bat to Desktop/Downloads and double-click — the install lands in a tidy subfolder, not your Downloads root.

---

## Prerequisites (all platforms)

| Component | Requirement |
|---|---|
| Java | **JDK 17** — Adoptium/Temurin recommended ([https://adoptium.net/](https://adoptium.net/)) |
| RAM | 8 GB minimum allocated to client; 12 GB recommended |
| Disk | 10 GB free |
| Network | Initial install hits GitHub + Modrinth + CurseForge CDN — full IPv4 connectivity |
| Account | Microsoft Minecraft account (or Ely.by / offline for LAN testing only) |

The pack ships with two bytecode-patched jars (Patchouli, Ars Nouveau) that need the JVM `-noverify` flag. Server scripts add this automatically; PrismLauncher needs it added once during initial setup (see the Windows / Linux client sections below).

---

## Client install — Windows

### Path A: PrismLauncher (recommended)

1. **Install PrismLauncher** from [prismlauncher.org](https://prismlauncher.org). Make sure your Microsoft account is added to it.
2. **Install JDK 17** from [adoptium.net](https://adoptium.net) and point PrismLauncher at it (Settings → Java → set Java path to your JDK 17 install).
3. **Get the installer** — pick one:
   - **Bootstrap (fastest)**: download just [iridescentcraft.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat) (right-click → Save link as) to any folder. The bat will fetch everything else it needs from GitHub on first run.
   - **Full clone**: install [GitHub Desktop](https://desktop.github.com), clone `https://github.com/silvariasereneblossom/IridescentCraft` to a path of your choice. Use this if you want local copies of all the wiki/source content too.
   - **Zip download**: green **Code → Download ZIP** button on the repo, extract anywhere.
4. **Run the installer**: double-click `iridescentcraft.bat`.
   - If you used the bootstrap path, that's the file you downloaded.
   - If you cloned/zipped, navigate to `.minecraft\distribution\client\iridescentcraft.bat`.
   - The script downloads the latest `install.ps1` from GitHub, runs it, and produces a PrismLauncher-importable `.mrpack` file at `%TEMP%\IridescentCraft.mrpack` (path printed to console).
5. **Import into PrismLauncher**: Add Instance → Import from local file → select the `.mrpack`.
6. **Add `-noverify` to JVM args**: right-click the new instance → Edit Instance → Settings → Java → JVM arguments → add `-noverify` to the existing list. **This is mandatory** — the pack will crash without it because two mods are bytecode-patched in dead-code-path-rejected ways the verifier rejects.
7. **First launch**: PrismLauncher will download Forge + ~450 mods. Expect 10–20 minutes on first run. Subsequent launches are seconds.

**Auto-update on every launch**: see [[Client Sync Protocol]] — TL;DR set the PrismLauncher pre-launch command to `"%INST_MC_DIR%\sync_client.bat"` so each launch syncs to the latest `main` commit (typically <1 second when up-to-date, ~30 seconds when there's a new commit).

### Path B: Manual install (if you don't use PrismLauncher)

1. Install Forge 1.20.1-47.4.6 directly into a vanilla `.minecraft` instance.
2. Copy the contents of `.minecraft/distribution/client/{mods, config, kubejs, defaultconfigs, global_packs, resourcepacks}/` into your `.minecraft` folder.
3. Add `-noverify` to your launcher's JVM args.
4. Note that Path B has no auto-update — you need to manually re-copy the dirs after each `git pull` to stay in sync.

---

## Client install — Linux

PrismLauncher is the only supported path on Linux for this pack.

```bash
# 1. Install JDK 17 + PrismLauncher via your package manager
#    (Adoptium/Temurin from adoptium.net works on every distro)

# 2A. BOOTSTRAP path — single-file install. The .sh auto-downloads the
#     repo zip on first run if it can't find mods/.index/ locally.
curl -O https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.sh
chmod +x iridescentcraft.sh
./iridescentcraft.sh

# 2B. FULL CLONE path — better if you want the whole repo locally.
git clone https://github.com/silvariasereneblossom/IridescentCraft.git
cd IridescentCraft/.minecraft/distribution/client
chmod +x iridescentcraft.sh
./iridescentcraft.sh

# 3. The script builds /tmp/IridescentCraft.mrpack
#    Import it in PrismLauncher: Add Instance → Import from local file
```

After import, follow steps 6 and 7 from the Windows guide above (add `-noverify`, set the pre-launch sync command). The Linux equivalent of the pre-launch command is:

```
bash "$INST_MC_DIR/sync_client.sh"
```

The `iridescentcraft.sh` script checks for `mods/.index/` in its current directory; if it's not there (e.g. you ran it from outside the repo) it auto-downloads the repo zip from GitHub to `/tmp/IridescentCraft-repo-extract/` and uses that as the source.

---

## Server install — Windows

True one-click bootstrap. Download a single file, double-click, done — the bat builds its own server folder, fetches the rest from GitHub, installs Forge, downloads all mods, and launches.

1. **Install JDK 17** ([adoptium.net](https://adoptium.net)). Add to PATH if it isn't already.
2. **Download just the bat** (right-click → Save link as): [iridescentserver.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.bat). Save it anywhere — Desktop, Downloads, a fresh `D:\Servers\` folder, doesn't matter.
3. **Double-click** the bat.

What happens automatically:

1. **Subfolder bootstrap** — first run creates `IridescentCraft Dedicated Server\` next to the bat, copies itself there, and relaunches from there. This prevents server files from spilling into Downloads/Desktop. The marker file `.icraft_server` flags the install location so subsequent launches don't re-bootstrap.
2. **Repo sync** — `phase0_sync.ps1` is downloaded from GitHub if missing, then runs. On first launch with no `.icraft_last_sha` marker, it falls back to a full `main.zip` download (~150 MB) and overlays all `server_distribution/` files into the install dir. Subsequent launches diff-sync via the GitHub compare API (typically 5–10 seconds for a few changed files).
3. **Forge installer** — downloads `forge-1.20.1-47.4.6-installer.jar` and runs `--installServer`.
4. **Mod download** — `server_install.ps1` parses `mods/.index/*.pw.toml` and downloads ~370 server-side mods from Modrinth + CurseForge CDN. Client-only mods (rendering, GUI, KubeJS Offline, Equipment Compare, etc.) are auto-skipped via the per-mod `side` field.
5. **EULA + launch** — auto-accepts the Minecraft EULA and starts the server with Aikar's flags (`-Xmx10G -Xms8G` G1GC tuning).

First boot takes 5–15 minutes for ~420 mods to initialize. Wait for `Done (XXX.XXXs)! For help, type "help"` in the console.

To force a clean re-sync when the server state has drifted from the repo (rare): run `iridescentserver.bat -Force`. This deletes the `.icraft_last_sha` marker and re-downloads everything.

**RAM tuning**: edit the bat to change `-Xmx10G` (max heap) and `-Xms8G` (initial). For a 16 GB host, `-Xmx10G` is good. More than 12 GB rarely helps with Minecraft.

---

## Server install — Linux

True one-click bootstrap, same model as Windows. Curl one file, run it, done.

```bash
# 1. JDK 17 (apt/dnf/pacman/etc.)
#    Verify: java -version  (must show 17)

# 2. Curl + run. The script auto-creates IridescentCraft-Dedicated-Server/
#    subfolder, copies itself there, and bootstraps from there.
curl -O https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.sh
chmod +x iridescentserver.sh
./iridescentserver.sh

# Force re-sync when needed:
./iridescentserver.sh --force
```

What happens automatically (same as Windows): subfolder bootstrap → full repo zip download into the new dir → Forge install → mod download → EULA + launch. First boot 5–15 minutes.

For a long-running server, wrap the launch in `screen` or `tmux` (or run as a `systemd` service):

```bash
screen -S icraft -dm bash -c 'cd /path/to/IridescentCraft-Dedicated-Server && ./iridescentserver.sh'
# attach with:  screen -r icraft
# detach with:  Ctrl-A then D
```

---

## Connecting to the test server

In the Minecraft client (with the modpack installed):

1. **Multiplayer → Add Server**
2. **Server Address**: `sereneblossom.gay` (default port 25565 — leave it off the address)
3. **Done → Join Server**

If `sereneblossom.gay` doesn't resolve for you (DNS propagation, custom resolver, etc.), ping me for the raw IP. The DNS record should work in 99% of cases.

Both client and server must be on the **same `main` branch commit** for protocol compatibility — the auto-sync flow handles this if you launch both within ~30 seconds of the latest push.

If you get **"connection lost: invalid protocol"**, your client is on a different commit than the server. Launch the client once to trigger auto-sync, then reconnect.

---

## Updating

You almost never need to update manually — both client and server self-sync on every launch:

| Component | Sync mechanism | Trigger |
|---|---|---|
| Client | `sync_client.ps1` / `sync_client.sh` | Every PrismLauncher launch (via pre-launch command) |
| Server | self-sync block in `iridescentserver.bat`/`.sh` | Every server launch |

Both compare a stored `.icraft_last_sha` against the latest `main` commit SHA and only re-download when the SHAs differ. Network failures fall through silently — your install keeps working with the existing files.

For the **forced full re-sync**, see the `-Force` flag note in the server section. The client equivalent is to delete `.icraft_last_sha` from the instance's `.minecraft` folder and relaunch.

See [[Client Sync Protocol]] for the deep-dive on how the client sync works.

---

## Reporting issues

When you hit a crash or unexpected behavior:

1. **Send your logs to Silvaria privately** (a direct message, not a public channel): `logs/latest.log` and the newest file in `crash-reports/` from your instance's `.minecraft` folder, or the copy of your last session that the post-exit hook keeps in `.minecraft/TesterLogs/<your account>/`. **Never commit or push them to the repository**: it is public, and a log or a crash report carries player names, chat and addresses. The repository refuses them anyway (its `.gitignore`), and Silvaria files them in a private log repository. The server's own logs are collected privately by its launcher; you do not need to send those.
2. **File a GitHub issue** at [https://github.com/silvariasereneblossom/IridescentCraft/issues](https://github.com/silvariasereneblossom/IridescentCraft/issues) with:
   - Symptom (what you expected vs. what happened)
   - Repro steps if reproducible
   - Time of occurrence (so logs can be cross-referenced)
   - Whether server / client / both

   Issues are public too: leave the logs out of the issue and say that you sent them.
3. **In-game `/icraft despawn <radius>`** can clear nearby hostiles if you're stuck — useful to recover before reporting an offending mob crash.

The dev's debugging order is usually: latest crash report (in `crash-reports/`) → `latest.log` head/tail → `kubejs-server.log` for KubeJS-related errors → `debug.log` for class-load and resource-load issues.

---

## Common first-run problems

| Problem | Fix |
|---|---|
| **JVM `-noverify` not set** — pack crashes during mod-loading with `VerifyError` referencing Patchouli or Ars Nouveau | Add `-noverify` to PrismLauncher JVM args (see Windows step 6). Server already has it. |
| **Wrong Java version** — install fails with cryptic `class file version` errors | Must be JDK 17, not 8/11/21. `java -version` should show `17.x.x`. |
| **PrismLauncher can't find Java** | Settings → Java → manually set the JDK 17 path. Auto-detect doesn't always find Adoptium. |
| **Mod download fails midway** | Re-run the installer — it skips already-downloaded files. CurseForge CDN is occasionally flaky; one retry usually clears it. |
| **First server boot stuck for >20 min** | Watch `logs/latest.log` — if the last line is `[modloading-worker]` something is still working. Some configs (Ad Astra worldgen, Apotheosis affixes) generate large data on first init. Wait it out unless you see a stack trace. |
| **`Connection lost: invalid protocol` on join** | Client and server are on different commits. Relaunch the client to trigger auto-sync, then reconnect. |
| **Custom JARs missing after sync** | One of the in-house mods (`iridescent_modular_spells-X.X.X.jar`, `iridescent_origins-X.X.X.jar`, etc.) was treated as stale. Confirm the version in `mods/` matches the one in the repo's `.gitignore` allowlist. If the repo bumped a version, the next sync auto-handles it. |

---

## What's in the modpack

See the dedicated wiki pages:

- [[Mod Overview]] — categorized mod list with notes
- [[Custom Mods]] — in-house mods (modular spells, origins, biomes, etc.)
- [[Progression Overview]] — tier system, dimension gates, what to do when
- [[Classes and Races]] — character creation choices
- [[Systems Overview]] — death penalty, scaling, enchantments, affixes, skills, loot
- [[Master Design Document]] — canonical source of truth for everything
- [[Known Issues]] — current bugs + verification status
