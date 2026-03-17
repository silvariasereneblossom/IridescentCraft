# IridescentCraft Server Setup Guide

Standalone dedicated server distribution for the IridescentCraft Progression RPG Modpack.

Forge 1.20.1-47.4.0 | 420+ mods

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
- Install Forge 1.20.1-47.4.0 (installer is included)
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
| `server.properties` | Pre-configured server settings |
| `start.bat` / `start.sh` | Server launch scripts |

---

## Server Configuration

The included `server.properties` is pre-configured for IridescentCraft:

| Setting | Value | Why |
|---------|-------|-----|
| max-tick-time | 120000 | Prevents watchdog kills with 420+ mods |
| view-distance | 8 | Reduced for performance |
| simulation-distance | 6 | Reduced for performance |
| allow-flight | true | Required for Icarus wings, jetpacks, MekaSuit |
| spawn-protection | 0 | Handled by KubeJS instead |
| difficulty | hard | Intended modpack difficulty |
| enable-command-block | true | Used for modpack features |

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
