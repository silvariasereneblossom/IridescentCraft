# Tester Installation Guide

This page takes a tester from nothing to a working install of the IridescentCraft alpha. It covers the client install and the dedicated server install, each on Windows and Linux, and the auto-update flow that keeps your install in sync with the `main` branch.

The full pack is Forge 1.20.1-47.4.6, 455 mods (a client installs three more, 458 in all) and about 3 GB on disk. The first mod download is slow (5 to 30 minutes depending on your connection); later launches are fast because the auto-sync only fetches what changed.

---

## Quick links: distribution scripts

These are direct downloads from `main` (right-click → Save link as). Each of the four scripts bootstraps the whole install on its own: download that one file, run it, and it pulls everything else from GitHub (the Forge installer, mods, configs, datapacks). You do not need to extract a zip or run `git clone`.

| Platform | Client (PrismLauncher installer) | Server (full self-bootstrap) |
|---|---|---|
| Windows | [iridescentcraft.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat) | [iridescentserver.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.bat) |
| Linux | [iridescentcraft.sh](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.sh) | [iridescentserver.sh](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.sh) |

The server scripts create a clean subfolder next to wherever you saved them (`IridescentCraft Dedicated Server\` on Windows, `IridescentCraft-Dedicated-Server/` on Linux), copy themselves into it and bootstrap from there. You can save the bat to your Desktop or Downloads and double-click it: the install lands in its own subfolder, not in your Downloads root.

---

## Prerequisites (all platforms)

| Component | Requirement |
|---|---|
| Java | JDK 17, Adoptium/Temurin recommended ([https://adoptium.net/](https://adoptium.net/)) |
| RAM | At least 8 GB allocated to the client; 12 GB recommended |
| Disk | 10 GB free |
| Network | The first install downloads from GitHub, Modrinth and the CurseForge CDN and needs full IPv4 connectivity |
| Account | Microsoft Minecraft account (or Ely.by / offline for LAN testing only) |

Two of the pack's jars (Patchouli, Ars Nouveau) are bytecode-patched and need the JVM `-noverify` flag. The server scripts add it for you, and so does the Windows client installer; on Linux you add it once in PrismLauncher during setup (see the client sections below).

---

## Client install: Windows

### Path A: PrismLauncher (recommended)

1. Install PrismLauncher from [prismlauncher.org](https://prismlauncher.org) and add your Microsoft account to it.
2. Install JDK 17 from [adoptium.net](https://adoptium.net) and point PrismLauncher at it (Settings → Java → set the Java path to your JDK 17 install).
3. Get the installer in one of these ways:
   - Bootstrap (fastest): download only [iridescentcraft.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/distribution/client/iridescentcraft.bat) (right-click → Save link as) to any folder. On its first run the bat fetches everything else it needs from GitHub.
   - Full clone: install [GitHub Desktop](https://desktop.github.com) and clone `https://github.com/silvariasereneblossom/IridescentCraft` to a path of your choice. Pick this if you also want local copies of the wiki and source content.
   - Zip download: use the green Code → Download ZIP button on the repo and extract the zip anywhere.
4. Run the installer: double-click `iridescentcraft.bat`.
   - On the bootstrap path, that is the file you downloaded.
   - If you cloned or unzipped the repo, navigate to `.minecraft\distribution\client\iridescentcraft.bat`.
   - The script runs `install.ps1` (the copy next to it, or else the latest one from GitHub). It creates an instance named IridescentCraft directly in PrismLauncher's instances folder (downloading a portable PrismLauncher first if it finds none), copies the configs, scripts and the pack's own jars into it, and downloads the client's 458 mods.
5. There is nothing to import: the installer starts PrismLauncher with the new instance in its list.
6. Check that `-noverify` is in the JVM arguments: right-click the instance → Edit Instance → Settings → Java → JVM arguments. The installer puts `-noverify` there, and the sync adds it back if it goes missing. **This is mandatory**: without it the pack crashes, because two mods are bytecode-patched in a way that leaves dead code paths, and the verifier rejects them.
7. First launch: PrismLauncher downloads Forge, and the pre-launch sync runs a full mod sync with a completeness check, which the installer says may take a few minutes; later launches take seconds.

The installer also sets the instance's pre-launch command, so every launch syncs to the latest `main` commit, which typically takes under 1 second when you are up to date and about 30 seconds when there is a new commit. If the command is ever missing (Edit Instance → Settings → Custom Commands), set it to `cmd.exe /c "$INST_MC_DIR/sync_client.bat"`, the command the installer writes. [[Client Sync Protocol]] has the details.

### Without PrismLauncher: not supported

Copying `.minecraft/distribution/client/` into a vanilla `.minecraft` does not give a working install. That folder holds the pack's configs, scripts, datapacks and its own 16 jars, but none of the third-party mods: those are listed in `mods/.index/` and downloaded by the installer and the pre-launch sync, which need PrismLauncher. Use Path A; if you have no PrismLauncher, the installer downloads a portable one for you.

---

## Client install: Linux

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

# 3. The script saves IridescentCraft.mrpack to your Desktop (or a path
#    you pick) and opens PrismLauncher's import dialog with it; it
#    downloads the PrismLauncher AppImage first if it finds none.
```

After the import, add `-noverify` to the instance's JVM arguments as in step 6 of the Windows guide above: the Linux script builds a plain Modrinth pack, which cannot set JVM arguments.

A Linux install does not update itself: the pack has no Linux pre-launch sync, so leave the instance's pre-launch command empty. To update, run `iridescentcraft.sh` again and import the new pack. `update_configs.sh` copies the configs and scripts only, never the mods.

The `iridescentcraft.sh` script looks for `mods/.index/` in its current directory. If it is not there (for example, you ran it from outside the repo), the script downloads the repo zip from GitHub to `/tmp/IridescentCraft-repo-extract/` and uses that as the source.

---

## Server install: Windows

The server installs from a single file: download it and double-click it. The bat builds its own server folder, fetches the rest from GitHub, installs Forge, downloads all mods and launches the server.

1. Install JDK 17 ([adoptium.net](https://adoptium.net)) and add it to PATH if it isn't there already.
2. Download only the bat (right-click → Save link as): [iridescentserver.bat](https://raw.githubusercontent.com/silvariasereneblossom/IridescentCraft/main/.minecraft/server_distribution/iridescentserver.bat). Save it anywhere you like; Desktop, Downloads or a fresh `D:\Servers\` folder all work.
3. Double-click the bat.

What happens automatically:

1. Subfolder bootstrap: the first run creates `IridescentCraft Dedicated Server\` next to the bat, copies itself there and relaunches from there, so server files do not spill into Downloads or Desktop. The marker file `.icraft_server` flags the install location so later launches don't bootstrap again.
2. Repo sync: `phase0_sync.ps1` is downloaded from GitHub if it is missing, then runs. On the first launch, with no `.icraft_last_sha` marker, it falls back to a full `main.zip` download (about 150 MB) and overlays all `server_distribution/` files into the install dir. Later launches diff-sync through the GitHub compare API (typically 5 to 10 seconds for a few changed files).
3. Forge installer: downloads `forge-1.20.1-47.4.6-installer.jar` and runs `--installServer`.
4. Mod download: `server_install.ps1` parses `mods/.index/*.pw.toml` and downloads the server's 428 mods from Modrinth and the CurseForge CDN, skipping any already present. Client-only mods (rendering, GUI, KubeJS Offline, Equipment Compare, etc.) are skipped through each mod's `side` field.
5. EULA and launch: accepts the Minecraft EULA and starts the server with Aikar's flags (`-Xmx14G -Xms14G` G1GC tuning; the Linux script uses `-Xmx10G -Xms8G`).

The first boot takes 5 to 15 minutes while the server's 428 mods initialize. Wait for `Done (XXX.XXXs)! For help, type "help"` in the console.

If the server state has drifted from the repo (rare), force a clean re-sync with `iridescentserver.bat -Force`. It deletes the `.icraft_last_sha` marker and downloads everything again.

To tune RAM, edit the bat and change `-Xmx14G` (max heap) and `-Xms14G` (initial heap). The bat's own note asks for 12 GB plus about 2 GB per player online at once: 14 GB for one tester, 16 GB for two, 22 GB for five.

---

## Server install: Linux

This works the same way as on Windows: fetch one file with curl and run it.

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

The automatic steps are the same as on Windows: subfolder bootstrap, a full repo zip download into the new dir, Forge install, mod download, then EULA and launch. The first boot takes 5 to 15 minutes.

For a long-running server, wrap the launch in `screen` or `tmux` (or run it as a `systemd` service):

```bash
screen -S icraft -dm bash -c 'cd /path/to/IridescentCraft-Dedicated-Server && ./iridescentserver.sh'
# attach with:  screen -r icraft
# detach with:  Ctrl-A then D
```

---

## Connecting to the test server

In the Minecraft client (with the modpack installed):

1. Open Multiplayer → Add Server.
2. Set Server Address to `iridescentcraft.sereneblossom.gay` (the default port is 25565; leave it off the address).
3. Click Done, then Join Server.

If `iridescentcraft.sereneblossom.gay` doesn't resolve for you (DNS propagation, a custom resolver, etc.), ping me for the raw IP. The DNS record should work in 99% of cases.

Client and server must be on the same `main` branch commit to be protocol compatible. Your client syncs on every launch, but the test server takes a new commit only when it restarts (on its schedule, every 4 to 12 hours, or after a crash), so for a while after a push your client can be ahead of it.

If you get "connection lost: invalid protocol", your client is on a different commit from the server. Launch the client once to trigger the auto-sync, then reconnect. If your client is already on the newest commit, the server catches up at its next restart.

---

## Updating

You almost never need to update by hand, because the client and the server both sync themselves on every launch:

| Component | Sync mechanism | Trigger |
|---|---|---|
| Client | `sync_client.bat`, which runs `sync_client.ps1` (Windows; an instance that is a git clone uses `prism_prelaunch.bat`). Linux: none | Every PrismLauncher launch (via the pre-launch command) |
| Server | self-sync block in `iridescentserver.bat`/`.sh` | Every server launch |

Both compare a stored `.icraft_last_sha` with the latest `main` commit SHA and download again only when the two differ. A network failure does not stop the launch: the sync prints a warning and your install keeps working with the files it already has. The client sync also records the failure in a status file in the instance, and when you join a world the game says in chat that the pack did not update.

For a forced full re-sync, see the `-Force` flag in the server section. On the client, delete `.icraft_last_sha` from the instance's `.minecraft` folder and relaunch.

[[Client Sync Protocol]] explains in detail how the client sync works.

---

## Reporting issues

When you hit a crash or unexpected behavior:

1. Send your logs to Silvaria privately (a direct message, not a public channel): `logs/latest.log` and the newest file in `crash-reports/` from your instance's `.minecraft` folder. (An instance that is a git clone also keeps a copy of your last session in `.minecraft/TesterLogs/<your account>/`; an instance the installer made does not.) **Never commit or push them to the repository**: it is public, and a log or a crash report carries player names, chat and addresses. The repository refuses them anyway (its `.gitignore`), and Silvaria files them in a private log repository. The server's launcher collects the server's own logs privately, so you do not need to send those.
2. File a GitHub issue at [https://github.com/silvariasereneblossom/IridescentCraft/issues](https://github.com/silvariasereneblossom/IridescentCraft/issues) with:
   - Symptom (what you expected vs. what happened)
   - Repro steps if reproducible
   - Time of occurrence (so logs can be cross-referenced)
   - Whether server / client / both

   Issues are public too: leave the logs out of the issue and say that you sent them.
3. On a server where you are an operator, `/icraft despawn <radius>` clears nearby hostiles, which lets you recover before you report a crash caused by a mob. The command needs operator status (permission level 2), and the test server has no operators, so it does not work there.

The dev usually debugs in this order: the latest crash report (in `crash-reports/`), then the head and tail of `latest.log`, then `kubejs-server.log` for KubeJS errors, then `debug.log` for class-load and resource-load issues.

---

## Common first-run problems

| Problem | Fix |
|---|---|
| **JVM `-noverify` not set**: pack crashes during mod-loading with `VerifyError` referencing Patchouli or Ars Nouveau | Add `-noverify` to the PrismLauncher JVM args (see Windows step 6). The server already has it. |
| **Wrong Java version**: install fails with cryptic `class file version` errors | It must be JDK 17, not 8/11/21. `java -version` should show `17.x.x`. |
| **PrismLauncher can't find Java** | Settings → Java → set the JDK 17 path by hand. Auto-detect doesn't always find Adoptium. |
| **Mod download fails midway** | Re-run the installer; it skips files it already downloaded. The CurseForge CDN is occasionally flaky, and one retry usually clears it. |
| **First server boot stuck for >20 min** | Watch `logs/latest.log`: if the last line is `[modloading-worker]`, something is still working. Some configs (Ad Astra worldgen, Apotheosis affixes) generate large data on the first init. Wait it out unless you see a stack trace. |
| **`Connection lost: invalid protocol` on join** | Client and server are on different commits. Relaunch the client to trigger the auto-sync, then reconnect. |
| **Custom JARs missing after sync** | One of the in-house mods (`iridescent_tetra_expansion-X.X.X.jar`, `iridescent_origins-X.X.X.jar`, etc.) was treated as stale. The sync removes a copy in `mods/` whose checksum differs from the pack's `custom_jars_manifest.json` and downloads the current one in the same run, so a jar still missing afterwards means that download failed: launch again and read the sync's lines in the launch log. If the repo bumped a version, the next sync handles it. |

---

## What's in the modpack

See these wiki pages:

- [[Mod Overview]]: categorized mod list with notes
- [[Custom Mods]]: in-house mods (modular spells, origins, biomes, etc.)
- [[Progression Overview]]: tier system, dimension gates, what to do when
- [[Classes and Races]]: character creation choices
- [[Systems Overview]]: death penalty, scaling, enchantments, affixes, skills, loot
- [[Master Design Document]]: the canonical source of truth for everything
- [[Known Issues]]: current bugs and their verification status
