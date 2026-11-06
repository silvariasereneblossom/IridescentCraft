# IridescentCraft Server Setup Guide

Standalone dedicated server distribution for the IridescentCraft Progression RPG Modpack.

Forge 1.20.1-47.4.6 | 428 mods on the server

This folder is fully self-contained. Copy it to any machine and run the installer.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Java | Java 17 (required) | Adoptium/Temurin JDK 17 |
| RAM | 8 GB free for the server, with `-Xmx6G` (see [Adjusting RAM](#adjusting-ram)) | 12 GB free for the server (a 16 GB machine), for the default `-Xmx10G` |
| CPU | 4 cores | 6+ cores |
| Disk | 10 GB free | 20 GB free (for world growth) |
| OS | Linux or Windows | Linux (better performance) |
| Network | Internet (for initial mod downloads) | |

**Download Java 17:** https://adoptium.net/

---

## Quick Start

### Windows
1. Double-click `server_install.bat`
2. Wait for Forge install and mod downloads
3. Double-click `start.bat`

### Linux
```bash
chmod +x server_install.sh start.sh
./server_install.sh
./start.sh
```

The install script will:
- Install Forge 1.20.1-47.4.6 (installer is included)
- Download all server-side mods automatically from .pw.toml metadata
- Skip client-only mods (rendering, UI, etc.)
- Config, KubeJS, defaultconfigs, and global_packs are already included

**First startup takes 5-15 minutes** with 428 mods. Wait until you see:
```
[Server thread/INFO]: Done (XXX.XXXs)! For help, type "help"
```

---

## What's Included

| Folder/File | Purpose |
|-------------|---------|
| `mods/.index/` | PrismLauncher metadata (download URLs for all mods) |
| `mods/*.jar` | Custom IridescentCraft mods (bundled directly) |
| `config/` | All mod configurations |
| `kubejs/` | KubeJS scripts (recipes, events, etc.) |
| `defaultconfigs/` | Default config files for new worlds |
| `global_packs/` | Paxi datapacks (required for progression) |
| `forge-*-installer.jar` | Forge server installer |
| `eula.txt` | Minecraft EULA (pre-accepted) |
| `server.properties` | Pack-default server settings (see Server Configuration) |
| `manage_whitelist.ps1` | Whitelist tool for an offline-mode server |
| `start.bat` / `start.sh` | Server launch scripts |

---

## Server Configuration

The included `server.properties` holds the **pack defaults**. They suit a new or private server:

| Setting | Pack default | Why |
|---------|--------------|-----|
| max-tick-time | -1 | Vanilla tick watchdog off: a 428-mod tick can run long. The launcher restarts a server that stops answering |
| view-distance | 6 | Reduced for performance |
| simulation-distance | 4 | Reduced for performance |
| entity-broadcast-range-percentage | 65 | Reduced for performance |
| allow-flight | true | Required for Icarus wings, jetpacks, MekaSuit |
| spawn-protection | 0 | Handled by KubeJS instead |
| difficulty | hard | Intended modpack difficulty |
| enable-command-block | true | Used for modpack features |
| online-mode | false | Development default: accounts are not checked |
| white-list | false | Development default: anyone may join |

**Before your server can be reached from the internet, switch its whitelist on (or `online-mode`).** With the two development defaults above, anyone who installs the pack can join, under any name.

### Settings that belong to your server

A sync from the repository overwrites `server.properties`, so a value you edit in the file does not last. A value that should differ on your server goes on the launcher's override list, and the launcher writes it back before every server start:

```
icraft settings set server.properties <key> <value>                    a new value
icraft settings pin server.properties <key> --pack-value <default>     keep a value you already edited in the file
icraft settings status                                                 what this server overrides
icraft settings start-check                                            would the launcher start the server right now?
```

**The launcher refuses to start a server whose access settings it could not restore.** Once `white-list`, `enforce-whitelist` or `online-mode` is switched on through the override list, the launcher checks `server.properties` before every start. If the value is not there (the file could not be written, the key is gone, or the override list itself is unreadable), no server is started: the reason is written to `.icraft_start_refused` in the server folder and to the launcher's log, and the launcher's automatic restart attempts try again. Put the value right, then press **Cycle**.

**One server per world.** The launcher never starts a server on a world that another server has open, for example one that an earlier launcher left running. It names that process in its log, in `.icraft_start_refused` and on its Server tab, which offers **Stop it cleanly**: that server is sent Ctrl+C, saves the world and exits, and the launcher then starts the server itself. Closing the launcher's window while it runs the server stops the server first (the window asks).

Settings usually chosen per server:

| Setting | Options |
|---------|---------|
| `white-list`, `enforce-whitelist` | `true` on any server strangers can reach |
| `online-mode` | `true` when every player has a paid account. Switching it on a world people have played gives every player a new identity (inventory, claims and quests are stored under the old one), so plan it |
| `view-distance` / `simulation-distance` | 8 / 6 if the machine has headroom |
| `max-tick-time` | a number of milliseconds (for example 120000) switches the vanilla watchdog back on |

(`server.properties.production`, an older template for such values, was removed in October 2026 because nothing ever read it.)

### Whitelist, operators and bans

`whitelist.json`, `ops.json`, `banned-ips.json`, `banned-players.json` and `usercache.json` are **your server's own files**. They are not in the repository, the game creates them on the first start, and no sync writes or deletes them. Never commit one: they hold player names.

Switch the whitelist on through the override list (see above), then add players:

- **`online-mode=true`:** type `whitelist add <name>` in the launcher's console box.
- **`online-mode=false` (the pack default):** do **not** use `whitelist add`. On an offline-mode server that command stores the wrong ID for the player (it looks the name up with Mojang first), and the player is still refused. Use the script in this folder, which writes the ID the player will really have:

  ```
  .\manage_whitelist.ps1 -Add ExactName        the in-game name, capitals included
  .\manage_whitelist.ps1 -Remove ExactName
  .\manage_whitelist.ps1 -List
  .\manage_whitelist.ps1 -Check                finds entries a player can never match
  ```

  Then type `whitelist reload` in the launcher's console box, or wait for the next restart. From another computer, add `-ServerRoot "<path to the server folder>"`.

A player who is not on the list sees **"You are not white-listed on this server!"**. Names are case-sensitive in offline mode: `Alex` and `alex` are different players.

On an offline-mode server the whitelist checks the name a player types, not an account. It keeps strangers out; it cannot tell a listed player from someone using that player's name. Only `online-mode=true` does that.

### Adjusting RAM

Measured on the pack's own server with no players on (November 2026):

- **About 5-6 GB of RAM at idle**, and more with players. After a load the server keeps about 2 GB of live data in its heap and about 1.3 GB outside it.
- The launch scripts start the heap at 4 GB and let it grow to 10 GB (`-Xms4G -Xmx10G`) when the server needs it. After a busy spell the heap can shrink again, at the garbage collector's next marking cycle.
- At the full 10 GB heap the whole server holds about 11-12 GB. To leave room for all of it, give the server 12 GB (a 16 GB machine).

On a machine with less RAM to spare, lower `-Xmx` so that it plus about 2 GB fits in what the machine can give the server:

| RAM free for the server | `-Xmx` |
|---|---|
| 12 GB or more | `-Xmx10G` (the default) |
| 8 GB | `-Xmx6G`, the lowest ceiling tested (tested with no players on) |

Keep `-Xms4G`, and keep `-Xmx` at or above it (the JVM does not start with a ceiling below its starting heap). Do not lower `-Xms` to save memory: with `-Xms2G` the boot outgrew the heap at once and the server ended up holding *more* than with 4 GB.

Where the value lives:

| You start the server with | Edit |
|---|---|
| `iridescentserver.bat` | the `-Xmx10G` line in Phase 4 |
| `iridescentserver.sh` or `start.sh` | the `-Xmx10G` line |
| Forge's `run.bat` / `run.sh` | the `-Xmx10G` line of `user_jvm_args.txt` |
| the IridescentCraft launcher (`icraft-gui.exe`) | it has no heap setting: it always runs `-Xmx10G`. On a machine with less RAM, start the server with one of the scripts |

A sync that brings a newer version of that file from the repository replaces your edit: set the value again after it.

---

## Port Forwarding

To allow players outside your local network to connect:

1. Find your server's local IP: `ip addr` (Linux) or `ipconfig` (Windows)
2. In your router's admin panel, forward **TCP port 25565** to your server's local IP
3. Give players your **public IP** (find it at https://whatismyip.com)
4. Players connect using: `your.public.ip:25565`

For hosting providers (VPS/dedicated), port 25565 is usually already open.

---

## Connecting to the Server

In the Minecraft client (with IridescentCraft modpack installed):

1. Click **Multiplayer**
2. Click **Add Server**
3. Server Address: `<server-ip>:25565` (or just `<server-ip>` if using default port)
4. Click **Done**, then join

**All players must have the full IridescentCraft modpack installed on their client.**

---

## Troubleshooting

### Server crashes on startup
- Check `logs/latest.log` and `crash-reports/` for details
- Ensure you have Java 17 (not 8, not 21)
- Ensure the machine has the RAM the server needs and `-Xmx` fits in it (see [Adjusting RAM](#adjusting-ram))

### Mods failed to download during install
- Re-run `server_install.bat` / `server_install.sh`; it skips mods it has already downloaded
- CurseForge downloads may fail if their API is temporarily down; try again later
- For persistent failures, manually download the mod from CurseForge/Modrinth

### TPS drops / lag
- Reduce `view-distance` to 6 in server.properties
- Reduce `simulation-distance` to 4
- Use `/forge tps` in-game to check server TPS
- Pre-generate chunks with Chunky: `/chunky radius 3000` then `/chunky start`

### Players getting kicked for flying
- Make sure `allow-flight=true` is set in server.properties (it is the pack default)

### Mods not matching / connection refused
- Server and client must have the **exact same mod versions**
- Use the same IridescentCraft release version on both sides
