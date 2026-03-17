# IridescentCraft Server Setup Guide

Dedicated server setup for the IridescentCraft Progression RPG Modpack.

Forge 1.20.1-47.4.0 | 420+ mods

**Forge installer is included** — no separate download needed.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Java | Java 17 (required) | Adoptium/Temurin JDK 17 |
| RAM | 8 GB dedicated to server | 10-12 GB dedicated to server |
| CPU | 4 cores | 6+ cores |
| Disk | 10 GB free | 20 GB free (for world growth) |
| OS | Linux or Windows | Linux (better performance) |

**Download Java 17:** https://adoptium.net/

---

## Quick Start (Automated)

If you have the full IridescentCraft repository checked out:

### Linux
```bash
cd server_distribution/
chmod +x server_install.sh start.sh
./server_install.sh
./start.sh
```

### Windows
1. Run `server_install.sh` using Git Bash or WSL
2. Double-click `start.bat`

The install script will:
- Download and install Forge 1.20.1-47.4.0
- Copy all server-compatible mods (excluding client-only mods)
- Copy config/, kubejs/, defaultconfigs/, and global_packs/
- Set up eula.txt and server.properties

---

## Manual Setup

If you prefer to set things up manually or are deploying on a remote machine:

### 1. Install Forge

Download the Forge 1.20.1-47.4.0 installer:
```
https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.4.0/forge-1.20.1-47.4.0-installer.jar
```

Run the installer in server mode:
```bash
java -jar forge-1.20.1-47.4.0-installer.jar --installServer
```

This creates the `libraries/` folder and Forge args files.

### 2. Copy Mod Files

From the modpack's `minecraft/` directory, copy these folders into your server directory:

- **mods/** - All mod jar files. **Exclude the client-only mods** listed in `client_only_mods.txt`
- **config/** - All mod configurations
- **kubejs/** - KubeJS scripts (recipes, events, etc.)
- **defaultconfigs/** - Default config files applied to new worlds
- **global_packs/** - Paxi datapacks (required for progression)

### 3. Copy Server Files

From this `server_distribution/` folder, copy to your server directory:
- `start.sh` and/or `start.bat`
- `eula.txt`
- `server.properties`

### 4. Start the Server

```bash
# Linux
chmod +x start.sh
./start.sh

# Windows
start.bat
```

**First startup takes 5-15 minutes** with 420+ mods. Wait until you see:
```
[Server thread/INFO]: Done (XXX.XXXs)! For help, type "help"
```

---

## Client-Only Mods (Do NOT Include on Server)

The file `client_only_mods.txt` lists all mods that should be excluded from the server.
These are rendering, UI, and sound mods that either crash on a headless server or serve
no purpose. Key exclusions include:

- Oculus (shaders)
- Embeddium (rendering)
- ImmediatelyFast (rendering)
- Falling Leaves (particles)
- Mouse Tweaks (UI)
- JourneyMap Integration (map UI)
- Better Advancements (UI)

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
- Make sure client-only mods are not in the server's mods/ folder

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
