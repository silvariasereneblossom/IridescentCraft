#!/usr/bin/env bash
# IridescentCraft Server — Unified Installer + Launcher (Linux/macOS)
# Forge 1.20.1-47.4.6 with 420+ mods
#
# First run:  Installs Forge, downloads mods, then starts the server
# Later runs: Skips install (mods already present), starts the server
#
# Requirements:
#   - Java 17 (e.g., Adoptium/Temurin JDK 17)
#   - 8-12 GB RAM available for the server
#
# Usage:
#   chmod +x iridescentserver.sh
#   ./iridescentserver.sh

FORGE_VERSION="1.20.1-47.4.6"
FORGE_INSTALLER="forge-${FORGE_VERSION}-installer.jar"
FORGE_INSTALLER_URL="https://maven.minecraftforge.net/net/minecraftforge/forge/${FORGE_VERSION}/forge-${FORGE_VERSION}-installer.jar"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# One-click bootstrap: when the .sh is run from a folder that doesn't
# contain the install marker (.icraft_server), set up a clean subfolder
# `IridescentCraft-Dedicated-Server/`, copy the script there, exec into
# it. Mirrors the Windows .bat behavior — users who curl this single file
# into Downloads get a clean install location instead of spilling
# server_distribution into their downloads dir.
#
# Single source of truth: .icraft_server. The relaunched instance lives
# inside the subfolder with marker present, falls through to phase 0.
if [ ! -f "$SCRIPT_DIR/.icraft_server" ]; then
    SERVER_DIR="$SCRIPT_DIR/IridescentCraft-Dedicated-Server"
    mkdir -p "$SERVER_DIR"
    cp -f "$0" "$SERVER_DIR/iridescentserver.sh"
    chmod +x "$SERVER_DIR/iridescentserver.sh"
    touch "$SERVER_DIR/.icraft_server"
    echo "[SETUP] Created server directory: $SERVER_DIR"
    echo "[SETUP] Launching from there..."
    exec "$SERVER_DIR/iridescentserver.sh" "$@"
fi

# -Force flag: delete the SHA marker so the next sync does a full download.
# Use when the server state has drifted from the repo despite the marker
# claiming "up to date" (e.g., after a sync silently missed files).
if [ "$1" = "-Force" ] || [ "$1" = "--force" ] || [ "$1" = "/force" ]; then
    SHA_FILE_FORCE="$SCRIPT_DIR/.icraft_last_sha"
    if [ -f "$SHA_FILE_FORCE" ]; then
        rm -f "$SHA_FILE_FORCE"
        echo "[FORCE] Deleted .icraft_last_sha — next sync will download fresh."
    else
        echo "[FORCE] No .icraft_last_sha present — already a full-sync run."
    fi
    echo ""
fi

# ANSI 24-bit RGB color codes
# Trans flag: #5BCEFA (blue), #F5A9B8 (pink), #FFFFFF (white)
TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'

RESET='\033[0m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Server${RESET}"
echo -e "${TF_WHITE}  Forge ${FORGE_VERSION}  ~450 mods${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

# -------------------------------------------------------------------
# Phase 0: Self-Update from GitHub (SHA-based)
# -------------------------------------------------------------------
# Checks latest commit SHA via GitHub API. If it matches the stored
# SHA in .icraft_last_sha, skips the zip download entirely. Otherwise
# downloads main.zip, overlays configs/scripts/datapacks/.index, and
# records the new SHA.
echo "[UPDATE] Checking for updates from GitHub..."

DOWNLOADER=""
if command -v curl &> /dev/null; then DOWNLOADER="curl"
elif command -v wget &> /dev/null; then DOWNLOADER="wget"
else echo "ERROR: Neither curl nor wget found."; exit 1; fi

SHA_FILE="$SCRIPT_DIR/.icraft_last_sha"
API_URL="https://api.github.com/repos/silvariasereneblossom/IridescentCraft/commits/main"
ZIP_URL="https://github.com/silvariasereneblossom/IridescentCraft/archive/refs/heads/main.zip"
ZIP_FILE="/tmp/IridescentCraft-server.zip"
EXTRACT_DIR="/tmp/IridescentCraft-server-extract"

LOCAL_SHA=""
[ -f "$SHA_FILE" ] && LOCAL_SHA=$(tr -d '[:space:]' < "$SHA_FILE")

if [ "$DOWNLOADER" = "curl" ]; then
    REMOTE_SHA=$(curl -s -H "User-Agent: IridescentCraft-Server" --max-time 15 "$API_URL" | grep -m1 '"sha"' | sed -E 's/.*"sha"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
else
    REMOTE_SHA=$(wget -qO- --header="User-Agent: IridescentCraft-Server" --timeout=15 "$API_URL" | grep -m1 '"sha"' | sed -E 's/.*"sha"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
fi

FORCE_INSTALL=0
if [ ! -d "$SCRIPT_DIR/config" ] || [ ! -d "$SCRIPT_DIR/global_packs" ]; then
    FORCE_INSTALL=1
fi

if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" = "$LOCAL_SHA" ] && [ "$FORCE_INSTALL" = "0" ]; then
    echo -e "  ${GREEN}[OK] Up to date (commit ${REMOTE_SHA:0:7}).${NC}"
    echo ""
elif [ -z "$REMOTE_SHA" ]; then
    echo -e "  ${YELLOW}[WARN] Could not reach GitHub API. Continuing with existing files...${NC}"
    echo ""
else
    if [ "$FORCE_INSTALL" = "1" ]; then
        echo "  First run — downloading ${REMOTE_SHA:0:7}..."
    else
        echo "  New commit: ${REMOTE_SHA:0:7} (was ${LOCAL_SHA:0:7}). Downloading..."
    fi

    if [ "$DOWNLOADER" = "curl" ]; then
        curl -L -s -o "$ZIP_FILE" "$ZIP_URL"
    else
        wget -q -O "$ZIP_FILE" "$ZIP_URL"
    fi

    if [ ! -s "$ZIP_FILE" ]; then
        echo -e "  ${YELLOW}[WARN] Download failed. Continuing with existing files...${NC}"
    else
        echo "  Extracting..."
        rm -rf "$EXTRACT_DIR"
        unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR"
        SRC=$(find "$EXTRACT_DIR" -maxdepth 1 -type d | tail -1)/.minecraft/server_distribution

        echo "  Syncing configs, scripts, datapacks..."
        SELF_UPDATE_STAGED=0
        for item in "$SRC"/*; do
            base=$(basename "$item")
            if [ "$base" = "iridescentserver.bat" ] || [ "$base" = "iridescentserver.sh" ]; then
                # Self-update: stage as .new if content differs, swap after Phase 0
                current="$SCRIPT_DIR/$base"
                if [ ! -f "$current" ] || ! cmp -s "$item" "$current"; then
                    cp -f "$item" "$current.new"
                    echo "    [update] Staged new $base for post-Phase 0 swap"
                    [ "$base" = "iridescentserver.sh" ] && SELF_UPDATE_STAGED=1
                fi
                continue
            fi
            case "$base" in
                world|logs|crash-reports|backups|libraries|.cache) continue ;;
            esac
            if [ "$base" = "mods" ]; then
                mkdir -p "$SCRIPT_DIR/mods/.index"
                cp -rf "$item/.index/"* "$SCRIPT_DIR/mods/.index/" 2>/dev/null || true
                find "$item" -maxdepth 1 -name '*.jar' -exec cp -f {} "$SCRIPT_DIR/mods/" \;
            else
                cp -rf "$item" "$SCRIPT_DIR/"
            fi
        done

        # Belt-and-suspenders: verify every paxi datapack zip by size, force-copy if missing or different
        PAXI_SRC="$SRC/config/paxi/datapacks"
        PAXI_DEST="$SCRIPT_DIR/config/paxi/datapacks"
        if [ -d "$PAXI_SRC" ] && [ -d "$PAXI_DEST" ]; then
            echo "  Verifying paxi datapacks..."
            paxi_copied=0
            for zip in "$PAXI_SRC"/*.zip; do
                [ -f "$zip" ] || continue
                zipname=$(basename "$zip")
                target="$PAXI_DEST/$zipname"
                src_size=$(stat -c%s "$zip" 2>/dev/null || stat -f%z "$zip" 2>/dev/null)
                dest_size=0
                [ -f "$target" ] && dest_size=$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target" 2>/dev/null)
                if [ "$src_size" != "$dest_size" ]; then
                    cp -f "$zip" "$target"
                    paxi_copied=$((paxi_copied + 1))
                    echo "    [sync] $zipname"
                fi
            done
            if [ -f "$SRC/config/paxi/datapack_load_order.json" ]; then
                cp -f "$SRC/config/paxi/datapack_load_order.json" "$SCRIPT_DIR/config/paxi/datapack_load_order.json"
            fi
            if [ "$paxi_copied" -gt 0 ]; then
                echo -e "    ${YELLOW}[sync] $paxi_copied paxi datapack(s) force-copied${NC}"
            fi
        fi

        # Verify custom mod JARs (same belt-and-suspenders as paxi zips)
        MODS_SRC="$SRC/mods"
        MODS_DEST="$SCRIPT_DIR/mods"
        if [ -d "$MODS_SRC" ]; then
            echo "  Verifying custom mod JARs..."
            for jar in "$MODS_SRC"/*.jar; do
                [ -f "$jar" ] || continue
                jarname=$(basename "$jar")
                target="$MODS_DEST/$jarname"
                src_size=$(stat -c%s "$jar" 2>/dev/null || stat -f%z "$jar" 2>/dev/null)
                dest_size=0
                [ -f "$target" ] && dest_size=$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target" 2>/dev/null)
                if [ "$src_size" != "$dest_size" ]; then
                    cp -f "$jar" "$target"
                    echo "    [sync] $jarname"
                fi
            done
        fi

        echo -n "$REMOTE_SHA" > "$SHA_FILE"
        rm -f "$ZIP_FILE"
        rm -rf "$EXTRACT_DIR"
        echo -e "  ${GREEN}[OK] Updated to ${REMOTE_SHA:0:7}.${NC}"

        # Cross-platform counterpart cleanup — apply iridescentserver.bat.new
        # if Phase 0 staged it. The .bat isn't used on Linux but we keep it
        # current so .new orphans don't accumulate. No relaunch needed.
        if [ -f "$SCRIPT_DIR/iridescentserver.bat.new" ]; then
            echo "    [update] Cleaning up cross-platform counterpart: iridescentserver.bat"
            mv -f "$SCRIPT_DIR/iridescentserver.bat.new" "$SCRIPT_DIR/iridescentserver.bat"
        fi

        # Self-update swap (Linux): if Phase 0 staged a new .sh, swap and relaunch
        if [ "$SELF_UPDATE_STAGED" = "1" ] && [ -f "$SCRIPT_DIR/iridescentserver.sh.new" ]; then
            echo ""
            echo "[UPDATE] New iridescentserver.sh staged. Applying and relaunching..."
            mv -f "$SCRIPT_DIR/iridescentserver.sh.new" "$SCRIPT_DIR/iridescentserver.sh"
            chmod +x "$SCRIPT_DIR/iridescentserver.sh"
            exec "$SCRIPT_DIR/iridescentserver.sh" "$@"
        fi
    fi

    if [ ! -d "$SCRIPT_DIR/global_packs" ] && [ "$FORCE_INSTALL" = "1" ]; then
        echo "ERROR: Failed to download server files."
        exit 1
    fi
    echo ""
fi

# -------------------------------------------------------------------
# Phase 1: Check Java
# -------------------------------------------------------------------
if ! command -v java &> /dev/null; then
    echo "ERROR: Java not found. Please install Java 17."
    echo "  Download: https://adoptium.net/"
    exit 1
fi

JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VER" != "17" ]; then
    echo "WARNING: Java $JAVA_VER detected. Java 17 is required for Forge 1.20.1."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# -------------------------------------------------------------------
# Phase 2: Install if needed (Forge + mods)
# -------------------------------------------------------------------
if [ ! -d "libraries/net/minecraftforge/forge/${FORGE_VERSION}" ]; then
    echo "[INSTALL] Forge not found — running first-time setup..."
    echo ""

    if [ ! -f "./${FORGE_INSTALLER}" ]; then
        echo "[INSTALL] Downloading Forge installer..."
        if command -v curl &> /dev/null; then
            curl -L -o "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        elif command -v wget &> /dev/null; then
            wget -O "./${FORGE_INSTALLER}" "$FORGE_INSTALLER_URL"
        else
            echo "ERROR: Neither curl nor wget found."
            exit 1
        fi
        [ -f "./${FORGE_INSTALLER}" ] || { echo "ERROR: Failed to download Forge installer."; exit 1; }
        echo "[INSTALL] Forge installer downloaded."
    fi

    java -jar "./${FORGE_INSTALLER}" --installServer
    echo ""
fi

# Download mods if .index exists
INDEX_DIR="mods/.index"
if [ -d "$INDEX_DIR" ]; then
    mkdir -p mods

    # Pick a download tool
    DOWNLOADER=""
    if command -v curl &> /dev/null; then
        DOWNLOADER="curl"
    elif command -v wget &> /dev/null; then
        DOWNLOADER="wget"
    else
        echo "ERROR: Neither curl nor wget found. Cannot download mods."
        exit 1
    fi

    # Client-only and server-incompatible mods to skip
    FORCE_SKIP=(
        "embeddium"
        "oculus"
        "immediatelyfast"
        "rubidium-extra"
        "kubejsoffline"
        "light-overlay"
        "equipment-compare"
        "EquipmentCompare"
        "chat_heads"
        "BetterAnimations"
        "transmog"
        "probejs"
        "ProbeJS"
        "irons_spells_js"
        "gh_classes"
        "rechiseled"
        "supermartijn642"
        "connectedglass"
        "trashcans"
    )

    DOWNLOADED=0
    SKIPPED_CLIENT=0
    SKIPPED_EXISTS=0
    FAILED=0
    TOTAL_FILES=$(ls -1 "$INDEX_DIR"/*.pw.toml 2>/dev/null | wc -l)

    # Trans flag installer banner
    echo ""
    echo -e "${TF_BLUE}  ==========================================${NC}"
    echo -e "${TF_PINK}  IridescentCraft Server Installer${NC}"
    echo -e "${TF_WHITE}  Forge ${FORGE_VERSION}${NC}"
    echo -e "${TF_PINK}  Standalone Edition${NC}"
    echo -e "${TF_BLUE}  ==========================================${NC}"
    echo ""
    echo "  Found $TOTAL_FILES mod metadata files."

    for toml_file in "$INDEX_DIR"/*.pw.toml; do
        [ -f "$toml_file" ] || continue

        # Parse TOML — handle both single and double quoted values
        filename=$(grep '^filename' "$toml_file" | head -1 | sed "s/^filename = ['\"]//;s/['\"]$//")
        side=$(grep '^side' "$toml_file" | head -1 | sed "s/^side = ['\"]//;s/['\"]$//")
        mode=$(grep '^mode' "$toml_file" | head -1 | sed "s/^mode = ['\"]//;s/['\"]$//")
        url=$(grep '^url' "$toml_file" | head -1 | sed "s/^url = ['\"]//;s/['\"]$//")

        [ -z "$filename" ] && continue

        # Skip client-only mods
        if [ "$side" = "client" ]; then
            SKIPPED_CLIENT=$((SKIPPED_CLIENT + 1))
            continue
        fi

        # Skip force-excluded mods
        skip=false
        for pattern in "${FORCE_SKIP[@]}"; do
            if [[ "$filename" == *"$pattern"* ]]; then
                skip=true
                break
            fi
        done
        if $skip; then
            SKIPPED_CLIENT=$((SKIPPED_CLIENT + 1))
            continue
        fi

        # Skip if already downloaded
        if [ -f "mods/$filename" ]; then
            SKIPPED_EXISTS=$((SKIPPED_EXISTS + 1))
            continue
        fi

        # Determine download URL
        DOWNLOAD_URL=""
        if [ "$mode" = "url" ] && [ -n "$url" ]; then
            DOWNLOAD_URL="$url"
        elif [ "$mode" = "metadata:curseforge" ]; then
            project_id=$(grep '^project-id' "$toml_file" | head -1 | sed 's/^project-id = //')
            file_id=$(grep '^file-id' "$toml_file" | head -1 | sed 's/^file-id = //')
            if [ -n "$project_id" ] && [ -n "$file_id" ]; then
                DOWNLOAD_URL="https://www.curseforge.com/api/v1/mods/${project_id}/files/${file_id}/download"
            fi
        fi

        if [ -z "$DOWNLOAD_URL" ]; then
            echo "  WARNING: No URL for $filename"
            FAILED=$((FAILED + 1))
            continue
        fi

        echo -n "  Downloading: $filename"
        dl_success=false
        if [ "$DOWNLOADER" = "curl" ]; then
            curl -L -s -o "mods/$filename" "$DOWNLOAD_URL" && dl_success=true
        else
            wget -q -O "mods/$filename" "$DOWNLOAD_URL" && dl_success=true
        fi

        if $dl_success && [ -f "mods/$filename" ]; then
            file_size=$(stat -c%s "mods/$filename" 2>/dev/null || stat -f%z "mods/$filename" 2>/dev/null || echo "0")
            if [ "$file_size" -lt 1000 ]; then
                echo -e " ${RED}FAILED (bad response)${NC}"
                rm -f "mods/$filename"
                FAILED=$((FAILED + 1))
            else
                echo -e " ${GREEN}OK${NC}"
                DOWNLOADED=$((DOWNLOADED + 1))
            fi
        else
            echo -e " ${RED}FAILED${NC}"
            rm -f "mods/$filename"
            FAILED=$((FAILED + 1))
        fi
    done

    echo ""
    echo -e "  ${GREEN}Downloaded: $DOWNLOADED mods${NC}"
    echo -e "  ${CYAN}Skipped (client-only): $SKIPPED_CLIENT${NC}"
    echo -e "  ${CYAN}Skipped (already present): $SKIPPED_EXISTS${NC}"
    [ "$FAILED" -gt 0 ] && echo -e "  ${RED}Failed: $FAILED mods${NC}"
    echo ""

    echo "Mod download complete. Press Enter to continue to server launch..."
    read -r
    echo ""
fi

# Strip client-only / crash-causing mods
strip_mod() {
    for pattern in "$@"; do
        for f in mods/$pattern; do
            [ -f "$f" ] && echo "  Stripping: $(basename "$f")" && rm -f "$f"
        done
    done
}

if [ -d "mods" ]; then
    strip_mod "*embeddium*"
    strip_mod "*oculus*"
    strip_mod "*immediatelyfast*" "*ImmediatelyFast*"
    strip_mod "*rubidium-extra*"
    strip_mod "*kubejsoffline*"
    strip_mod "*light-overlay*"
    strip_mod "*equipment-compare*" "*EquipmentCompare*"
    strip_mod "*chat_heads*"
    strip_mod "*BetterAnimations*"
    strip_mod "*transmog*"
    strip_mod "*probejs*" "*ProbeJS*"
    strip_mod "*irons_spells_js*"
    strip_mod "*gh_classes*"
    strip_mod "*cherryvillage*" "*CherryVillage*"
    strip_mod "*rechiseled*"
    strip_mod "*supermartijn642*"
    strip_mod "*connectedglass*"
    strip_mod "*trashcans*"
    strip_mod "*auudio*"
    strip_mod "*BetterAdvancements*"
    strip_mod "*biomemusic*"
    strip_mod "*CTM-*"
    strip_mod "*CutThrough*"
    strip_mod "*fallingleaves*"
    strip_mod "*Highlighter*"
    strip_mod "*inventoryhud*"
    strip_mod "*jeed-*"
    strip_mod "*jmi-forge*"
    strip_mod "*lazyDFU*"
    strip_mod "*libIPN*"
    strip_mod "*MouseTweaks*"
    strip_mod "*Prism-*"
fi

# -------------------------------------------------------------------
# Phase 3: Accept EULA
# -------------------------------------------------------------------
if [ ! -f "eula.txt" ] || ! grep -q "eula=true" eula.txt 2>/dev/null; then
    echo "eula=true" > eula.txt
    echo "[SETUP] EULA accepted."
fi

# -------------------------------------------------------------------
# Phase 4: Launch server
# -------------------------------------------------------------------
echo ""
echo -e "${TF_BLUE}  ==========================================${NC}"
echo -e "${TF_PINK}  Welcome to IridescentCraft!${NC}"
echo -e "${TF_WHITE}  Starting server (8-10 GB RAM)${NC}"
echo -e "${TF_PINK}  First startup may take 5-15 minutes${NC}"
echo -e "${TF_BLUE}  ==========================================${NC}"
echo ""

java \
    -Xmx10G \
    -Xms8G \
    -XX:+UseG1GC \
    -XX:+ParallelRefProcEnabled \
    -XX:MaxGCPauseMillis=200 \
    -XX:+UnlockExperimentalVMOptions \
    -XX:+DisableExplicitGC \
    -XX:+AlwaysPreTouch \
    -XX:G1NewSizePercent=30 \
    -XX:G1MaxNewSizePercent=40 \
    -XX:G1HeapRegionSize=8M \
    -XX:G1ReservePercent=20 \
    -XX:G1HeapWastePercent=5 \
    -XX:G1MixedGCCountTarget=4 \
    -XX:InitiatingHeapOccupancyPercent=15 \
    -XX:G1MixedGCLiveThresholdPercent=90 \
    -XX:G1RSetUpdatingPauseTimePercent=5 \
    -XX:SurvivorRatio=32 \
    -XX:+PerfDisableSharedMem \
    -XX:MaxTenuringThreshold=1 \
    -Dusing.aikars.flags=https://mcflags.emc.gs \
    -Daikars.new.flags=true \
    -XX:+HeapDumpOnOutOfMemoryError \
    -XX:HeapDumpPath=crash-heapdump.hprof \
    @libraries/net/minecraftforge/forge/1.20.1-47.4.6/unix_args.txt nogui "$@"

# -------------------------------------------------------------------
# Phase 5: Post-exit crash log
# -------------------------------------------------------------------
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "=========================================="
    echo "  SERVER CRASHED — Exit code: $EXIT_CODE"
    echo "=========================================="
    echo ""

    CRASHLOG="crash-$(date +%Y-%m-%d_%H-%M-%S).log"

    echo "IridescentCraft Server Crash Log" > "$CRASHLOG"
    echo "================================" >> "$CRASHLOG"
    echo "Date: $(date)" >> "$CRASHLOG"
    echo "Exit Code: $EXIT_CODE" >> "$CRASHLOG"
    echo "" >> "$CRASHLOG"

    # Append latest Forge crash report if one exists
    LATEST_CRASH=$(ls -t crash-reports/crash-*.txt 2>/dev/null | head -1)
    if [ -n "$LATEST_CRASH" ]; then
        echo "--- Forge Crash Report: $(basename "$LATEST_CRASH") ---" >> "$CRASHLOG"
        cat "$LATEST_CRASH" >> "$CRASHLOG"
    fi

    echo "" >> "$CRASHLOG"
    echo "--- Last 200 lines of server log ---" >> "$CRASHLOG"
    if [ -f "logs/latest.log" ]; then
        tail -200 "logs/latest.log" >> "$CRASHLOG"
    fi

    echo "Crash log saved: $CRASHLOG"
    echo ""
else
    echo ""
    echo "Server stopped normally."
fi

# -------------------------------------------------------------------
# Auto-mirror session logs to TesterLogs/Server Logs/ on every exit
# (clean or crash). Calls push_crash_logs.sh --silent which copies
# logs + does a best-effort git push from instance root if the parent
# is a git working tree. Topology B (dedicated host with manual mirror)
# falls through to dev-PC pickup via prism_postexit.bat.
#
# Manual interactive variant (push_crash_logs.sh without flag) is kept
# as a failsafe for one-off pushes.
# -------------------------------------------------------------------
if [ -x "$(dirname "$0")/push_crash_logs.sh" ] || [ -f "$(dirname "$0")/push_crash_logs.sh" ]; then
    bash "$(dirname "$0")/push_crash_logs.sh" --silent || true
fi

