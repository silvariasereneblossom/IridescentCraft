#!/usr/bin/env bash
# =============================================================================
# IridescentCraft Server — Mod Update Script (Linux)
# =============================================================================
# Run AFTER sync_from_repo to update mod JARs when .pw.toml files change.
#
# What it does:
#   1. Reads all .pw.toml files in mods/.index/
#   2. For each TOML, checks if the expected filename exists in mods/
#   3. If missing (new version), downloads it
#   4. Finds and removes old versions of the same mod
#   5. Reports what changed
# =============================================================================

set -euo pipefail

MODS_DIR="${1:-mods}"
INDEX_DIR="$MODS_DIR/.index"

GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
GRAY='\033[90m'
RESET='\033[0m'

TF_BLUE='\033[38;2;91;206;250m'
TF_PINK='\033[38;2;245;169;184m'
TF_WHITE='\033[38;2;255;255;255m'

echo ""
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo -e "${TF_PINK}  IridescentCraft Mod Updater${RESET}"
echo -e "${TF_WHITE}  Server Utility${RESET}"
echo -e "${TF_PINK}  Iridescent Edition${RESET}"
echo -e "${TF_BLUE}  ==========================================${RESET}"
echo ""

if [ ! -d "$INDEX_DIR" ]; then
    echo -e "  ${RED}ERROR: $INDEX_DIR not found.${RESET}"
    exit 1
fi

# Force-skip list
FORCE_SKIP="embeddium|oculus|immediatelyfast|rubidium-extra|kubejsoffline|light-overlay|equipment-compare|chat_heads|BetterAnimations|transmog|probejs|irons_spells_js|gh_classes|cherryvillage|rechiseled|supermartijn642|connectedglass|trashcans|ftbbackups|ftbchunks|ftbessentials|ftblibrary|ftbquests|ftbranks|ftbteams|ftbultimine|mca-social"

# Custom JARs that aren't in TOMLs
CUSTOM_JARS="iridescent_codex_data.jar|iridescent_origins-1.0.0.jar|iridescent_biomes-1.0.0.jar|mek_walkable_cables-1.0.1.jar|offlineskins-1.20.1-v1.jar|zeta_racefix-1.0.0.jar|Patchouli-1.20.1-85-FORGE.jar|ars_nouveau-1.20.1-4.12.7-all.jar"

# ── Phase 1: Build expected mod map ──
echo "  [1/3] Reading mod index..."

TOTAL_TOMLS=$(ls "$INDEX_DIR"/*.pw.toml 2>/dev/null | wc -l)
echo "    Found $TOTAL_TOMLS .pw.toml files."

# Arrays for tracking
declare -A EXPECTED_MODS  # filename → download URL
declare -A EXPECTED_BASES # base name → filename (for old version detection)
TO_DOWNLOAD=()
TO_REMOVE=()
UP_TO_DATE=0

for toml in "$INDEX_DIR"/*.pw.toml; do
    [ -f "$toml" ] || continue

    FILENAME="" SIDE="both" MODE="" URL="" FILE_ID="" PROJECT_ID=""

    while IFS= read -r line; do
        line="$(echo "$line" | sed 's/^[[:space:]]*//')"
        case "$line" in
            filename\ =\ *) FILENAME="$(echo "$line" | sed "s/^filename[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            side\ =\ *)     SIDE="$(echo "$line" | sed "s/^side[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            mode\ =\ *)     MODE="$(echo "$line" | sed "s/^mode[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            url\ =\ *)      URL="$(echo "$line" | sed "s/^url[[:space:]]*=[[:space:]]*['\"]//;s/['\"]$//")" ;;
            file-id\ =\ *)  FILE_ID="$(echo "$line" | sed 's/^file-id[[:space:]]*=[[:space:]]*//')" ;;
            project-id\ =\ *) PROJECT_ID="$(echo "$line" | sed 's/^project-id[[:space:]]*=[[:space:]]*//')" ;;
        esac
    done < "$toml"

    [ -z "$FILENAME" ] && continue
    [ "$SIDE" = "client" ] && continue
    echo "$FILENAME" | grep -qE "$FORCE_SKIP" && continue

    # Build candidate download URLs (pipe-delimited, tried in order)
    DL_URLS=""
    if [ "$MODE" = "url" ] && [ -n "$URL" ]; then
        DL_URLS="$URL"
    elif [ "$MODE" = "metadata:curseforge" ] && [ -n "$FILE_ID" ]; then
        # Prefer direct forgecdn CDN -- no auth, avoids 403 from api/v1
        PART1="${FILE_ID:0:4}"
        PART2="${FILE_ID:4}"
        PART2="$(echo "$PART2" | sed 's/^0*//')"
        [ -z "$PART2" ] && PART2="0"
        ENCODED="$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILENAME'))" 2>/dev/null || echo "$FILENAME")"
        DL_URLS="https://edge.forgecdn.net/files/$PART1/$PART2/$ENCODED"
        # Fallback: CurseForge api/v1 (requires projectId, may 403)
        if [ -n "$PROJECT_ID" ]; then
            DL_URLS="$DL_URLS|https://www.curseforge.com/api/v1/mods/$PROJECT_ID/files/$FILE_ID/download"
        fi
    fi

    EXPECTED_MODS["$FILENAME"]="$DL_URLS"

    # Track base name for old version detection
    BASE_NAME="$(echo "$FILENAME" | sed 's/-[0-9\.]*.*\.jar$//')"
    if [ ${#BASE_NAME} -gt 3 ]; then
        EXPECTED_BASES["$BASE_NAME"]="$FILENAME"
    fi
done

echo "    ${#EXPECTED_MODS[@]} server-side mods expected."
echo ""

# ── Phase 2: Compare ──
echo "  [2/3] Checking installed mods..."

for expected in "${!EXPECTED_MODS[@]}"; do
    if [ -f "$MODS_DIR/$expected" ]; then
        UP_TO_DATE=$((UP_TO_DATE + 1))
    else
        TO_DOWNLOAD+=("$expected")

        # Check for old version
        BASE_NAME="$(echo "$expected" | sed 's/-[0-9\.]*.*\.jar$//')"
        if [ ${#BASE_NAME} -gt 3 ]; then
            for existing in "$MODS_DIR"/*.jar; do
                [ -f "$existing" ] || continue
                EXIST_BASE="$(basename "$existing" | sed 's/-[0-9\.]*.*\.jar$//')"
                EXIST_NAME="$(basename "$existing")"
                if [ "$EXIST_BASE" = "$BASE_NAME" ] && [ "$EXIST_NAME" != "$expected" ]; then
                    TO_REMOVE+=("$EXIST_NAME")
                fi
            done
        fi
    fi
done

echo "    Up to date: $UP_TO_DATE"
echo "    To download: ${#TO_DOWNLOAD[@]}"
echo "    Old versions to remove: ${#TO_REMOVE[@]}"
echo ""

if [ ${#TO_DOWNLOAD[@]} -eq 0 ] && [ ${#TO_REMOVE[@]} -eq 0 ]; then
    echo -e "  ${GREEN}[OK] All mods are up to date!${RESET}"
    echo ""
    exit 0
fi

# ── Phase 3: Apply ──
echo "  [3/3] Applying updates..."
echo ""

# Remove old versions
for old in "${TO_REMOVE[@]}"; do
    OLD_PATH="$MODS_DIR/$old"
    if [ -f "$OLD_PATH" ]; then
        rm -f "$OLD_PATH"
        echo -e "    ${YELLOW}REMOVED: $old${RESET}"
    fi
done

# Download new versions
DL_SUCCESS=0
DL_FAILED=0

for mod in "${TO_DOWNLOAD[@]}"; do
    DL_URLS="${EXPECTED_MODS[$mod]}"

    if [ -z "$DL_URLS" ]; then
        echo -e "    ${YELLOW}SKIP (no URL): $mod${RESET}"
        DL_FAILED=$((DL_FAILED + 1))
        continue
    fi

    printf "    Downloading: %s" "$mod"

    TMPFILE="$MODS_DIR/_update_temp.jar"
    DL_OK=0
    # Walk candidate URLs in order; each URL gets up to 2 attempts
    IFS='|' read -r -a URL_ARRAY <<< "$DL_URLS"
    for DL_URL in "${URL_ARRAY[@]}"; do
        for RETRY in 1 2; do
            if curl -sL -A 'Mozilla/5.0 IridescentCraft-Updater' "$DL_URL" -o "$TMPFILE" --max-redirs 10 --connect-timeout 30 --max-time 120 && \
               [ -f "$TMPFILE" ] && [ "$(stat -c%s "$TMPFILE" 2>/dev/null || stat -f%z "$TMPFILE" 2>/dev/null)" -gt 1000 ]; then
                mv "$TMPFILE" "$MODS_DIR/$mod"
                DL_OK=1
                break 2
            else
                rm -f "$TMPFILE"
                [ "$RETRY" -lt 2 ] && sleep 1
            fi
        done
    done

    if [ "$DL_OK" -eq 1 ]; then
        echo -e " ${GREEN}OK${RESET}"
        DL_SUCCESS=$((DL_SUCCESS + 1))
    else
        echo -e " ${RED}FAILED${RESET}"
        DL_FAILED=$((DL_FAILED + 1))
    fi
done

echo ""
echo -e "${CYAN}  ==========================================${RESET}"
echo -e "${CYAN}  Summary:${RESET}"
echo -e "    ${GREEN}Downloaded: $DL_SUCCESS${RESET}"
echo -e "    ${YELLOW}Removed old: ${#TO_REMOVE[@]}${RESET}"
[ "$DL_FAILED" -gt 0 ] && echo -e "    ${RED}Failed: $DL_FAILED${RESET}"
echo -e "${CYAN}  ==========================================${RESET}"
echo ""

if [ "$DL_SUCCESS" -gt 0 ] || [ ${#TO_REMOVE[@]} -gt 0 ]; then
    echo -e "  ${YELLOW}Restart the server to load the updated mods.${RESET}"
    echo ""
fi
