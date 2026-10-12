# IridescentCraft Server Setup Guide

Standalone dedicated server distribution for the IridescentCraft Progression RPG Modpack.

Forge 1.20.1-47.4.6 | 420+ mods

**This folder is fully self-contained.** Copy it to any machine, run the installer, and go.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Java | Java 17 (required) | Adoptium/Temurin JDK 17 |
| RAM | 8 GB dedicated to server | 10-12 GB dedicated to server |
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

**First startup takes 5-15 minutes** with 420+ mods. Wait until you see:
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
| max-tick-time | -1 | Vanilla tick watchdog off: a 420+ mod tick can run long. The launcher restarts a server that stops answering |
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

Settings usually chosen per server:

| Setting | Options |
|---------|---------|
| `white-list`, `enforce-whitelist` | `true` on any server strangers can reach |
| `online-mode` | `true` when every player has a paid account. Switching it on a world people have played gives every player a new identity (inventory, claims and quests are stored under the old one), so plan it |
| `view-distance` / `simulation-distance` | 8 / 6 if the machine has headroom |
| `max-tick-time` | a number of milliseconds (for example 120000) switches the vanilla watchdog back on |

(`server.properties.production`, an older template for such values, was removed in October 2026: nothing ever read it.)

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

Edit `start.sh` or `start.bat` and change the `-Xmx` and `-Xms` values:
- `-Xmx10G` = maximum 10 GB heap
- `-Xms8G` = initial 8 GB heap

For a server with 16 GB total RAM, `-Xmx10G` is a good setting.
For 32 GB+ systems, you can try `-Xmx12G` but more than 12G rarely helps.

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
- Ensure you have enough RAM allocated (minimum 8 GB)

### Mods failed to download during install
- Re-run `server_install.bat` / `server_install.sh` — it skips already-downloaded mods
- CurseForge downloads may fail if their API is temporarily down; try again later
- For persistent failures, manually download the mod from CurseForge/Modrinth

### TPS drops / lag
- Reduce `view-distance` to 6 in server.properties
- Reduce `simulation-distance` to 4
- Use `/forge tps` in-game to check server TPS
- Pre-generate chunks with Chunky: `/chunky radius 3000` then `/chunky start`

### Players getting kicked for flying
- Ensure `allow-flight=true` in server.properties (should be set by default)

### Mods not matching / connection refused
- Server and client must have the **exact same mod versions**
- Use the same IridescentCraft release version on both sides
