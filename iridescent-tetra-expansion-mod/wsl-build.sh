#!/usr/bin/env bash
# =============================================================================
# wsl-build.sh — Build iridescent_tetra_expansion-1.0.0.jar from inside WSL2.
#
# Workaround for task #39: gradle fails on the Windows dev host with
# "Unable to establish loopback connection" (WEPollSelectorImpl AF_UNIX
# init EINVAL). WSL2 runs a Linux kernel, no NDIS filter drivers, no
# WEPoll. Gradle just works.
#
# Prereqs inside WSL2 Ubuntu (one-time):
#   sudo apt update
#   sudo apt install -y openjdk-17-jdk python3 unzip
#
# Usage from WSL bash:
#   ./wsl-build.sh                 # build + deploy to 3 distros + Z: live
#   ./wsl-build.sh --no-deploy     # build only; jar at build/libs/
#   ./wsl-build.sh --distros-only  # build + deploy to 3 distros, skip Z:
#   ./wsl-build.sh --live-only     # build + deploy to Z: only
#   ./wsl-build.sh --clean         # also `./gradlew clean` first
#
# Performance note:
#   /mnt/c/ access is slow under WSL2 (Plan9 protocol). If you build often,
#   clone a working copy into the WSL home filesystem:
#     git clone https://github.com/silvariasereneblossom/IridescentCraft.git ~/IridescentCraft
#   and run the build from there. Then sync the built jar back to /mnt/c/.
#   Or just live with /mnt/c/ -- one full Forge Gradle build takes ~20 min
#   from /mnt/c/ vs ~5 min from ~/.
# =============================================================================
set -euo pipefail

MOD_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$MOD_ROOT")"
JAR_NAME="iridescent_tetra_expansion-1.0.0.jar"

# --- args --------------------------------------------------------------------
DO_BUILD=1; DEPLOY_DISTROS=1; DEPLOY_LIVE=1; DO_CLEAN=0
for arg in "$@"; do
    case "$arg" in
        --no-deploy)    DEPLOY_DISTROS=0; DEPLOY_LIVE=0 ;;
        --distros-only) DEPLOY_LIVE=0 ;;
        --live-only)    DEPLOY_DISTROS=0 ;;
        --clean)        DO_CLEAN=1 ;;
        -h|--help)
            sed -n '/^#/p' "$0" | head -40; exit 0 ;;
        *) echo "[wsl-build] unknown arg: $arg"; exit 2 ;;
    esac
done

# --- env sanity --------------------------------------------------------------
echo "[wsl-build] MOD_ROOT  = $MOD_ROOT"
echo "[wsl-build] REPO_ROOT = $REPO_ROOT"

if [ ! -f /proc/sys/kernel/osrelease ] || ! grep -qi microsoft /proc/sys/kernel/osrelease; then
    echo "[wsl-build] WARN: this doesn't look like WSL. Continuing anyway."
fi

for cmd in java python3 unzip; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[wsl-build] ERROR: '$cmd' not on PATH."
        echo "[wsl-build]   sudo apt update && sudo apt install -y openjdk-17-jdk python3 unzip"
        exit 1
    fi
done

JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+)\.[0-9]+\..*/\1/' || true)"
if [ "${JAVA_MAJOR:-0}" -lt 17 ]; then
    echo "[wsl-build] ERROR: need JDK 17+. Found: $(java -version 2>&1 | head -1)"
    exit 1
fi

cd "$MOD_ROOT"

# --- stage compile-time libs -------------------------------------------------
# Same logic as build_mod.sh: copy from the biomes-mod cache if libs/ is
# missing entries. Cache is at REPO_ROOT/iridescent-biomes-mod/tools/.cache/all-mods/.
# Fallback: read from the deployed server mods dir if accessible.

CACHE_PRIMARY="$REPO_ROOT/iridescent-biomes-mod/tools/.cache/all-mods"
# Z: drive on Windows is mapped at /mnt/z/ inside WSL when accessible.
CACHE_FALLBACK="/mnt/z/Users/silvariazemaitis/Desktop/IridescentCraft Dedicated Server/mods"
# PrismLauncher live mods folder — the canonical source of truth for what
# ships in the pack via CurseForge manifest (mods not committed to the dev
# repo). Used as a last-resort fallback so compileOnly deps that aren't in
# either cache can still be staged on a clean WSL checkout.
CACHE_PRISM="/mnt/c/Users/silvariazemaitis/AppData/Roaming/PrismLauncher/instances/IridescentCraft/.minecraft/mods"

mkdir -p libs

stage_lib() {
    local target="$1"; local glob="$2"
    if [ -f "libs/$target" ]; then
        return 0
    fi
    local hit=""
    for cache in "$CACHE_PRIMARY" "$CACHE_FALLBACK" "$CACHE_PRISM"; do
        [ -d "$cache" ] || continue
        hit="$(ls "$cache"/$glob 2>/dev/null | head -n1 || true)"
        [ -n "$hit" ] && break
    done
    if [ -n "$hit" ]; then
        echo "[wsl-build] stage libs/$target  <- $(basename "$hit")"
        cp "$hit" "libs/$target"
    else
        echo "[wsl-build] WARN: libs/$target not found in any cache (glob: $glob)"
    fi
}

stage_lib tetra.jar             'tetra-1.20.1-*.jar'
stage_lib mutil.jar             'mutil-1.20.1-*.jar'
stage_lib irons_spellbooks.jar  'irons_spellbooks-1.20.1-*.jar'
stage_lib curios-forge.jar      'curios-forge-*.jar'
stage_lib ars_nouveau.jar       'ars_nouveau-1.20.1-*.jar'
stage_lib geckolib-forge.jar    'geckolib-forge-1.20.1-*.jar'
# compileOnly mixin targets — not bundled in our libs/ historically because
# the mixins are pure runtime ride-alongs (UI relocate + harvest-replant),
# but compilation does need the target classes on the classpath.
stage_lib ApothicAttributes.jar 'ApothicAttributes-1.20.1-*.jar'
stage_lib cofh_core.jar         'cofh_core-1.20.1-*.jar'
stage_lib ensorcellation.jar    'ensorcellation-1.20.1-*.jar'

# --- preprocessor python scripts ---------------------------------------------
echo "[wsl-build] Running data preprocessors..."
python3 tools/gen_repair_definitions.py
python3 tools/gen_skin_models.py
python3 tools/gen_spellbook_icons.py

# --- gradle ------------------------------------------------------------------
if [ "$DO_BUILD" = 1 ]; then
    # gradlew is checked in with CRLF on Windows hosts; bash chokes on the
    # shebang line ("/bin/sh^M: bad interpreter"). Strip CR in place. Idempotent
    # if the file is already LF-only. We don't touch gradlew.bat (Windows wants
    # CRLF there).
    if grep -q $'\r' gradlew 2>/dev/null; then
        echo "[wsl-build] Stripping CRLF from gradlew (Windows checkout)"
        sed -i 's/\r$//' gradlew
    fi
    chmod +x ./gradlew
    if [ "$DO_CLEAN" = 1 ]; then
        echo "[wsl-build] ./gradlew clean"
        ./gradlew clean
    fi
    echo "[wsl-build] ./gradlew build"
    ./gradlew build
fi

# --- locate built jar --------------------------------------------------------
BUILT_JAR=""
for cand in \
    "build/libs/$JAR_NAME" \
    "build/libs/iridescent_tetra_expansion-*.jar"
do
    hit="$(ls $cand 2>/dev/null | head -n1 || true)"
    if [ -n "$hit" ]; then BUILT_JAR="$hit"; break; fi
done
if [ -z "$BUILT_JAR" ]; then
    echo "[wsl-build] ERROR: built jar not found under build/libs/"
    exit 1
fi
echo "[wsl-build] Built jar: $BUILT_JAR"

# --- deploy ------------------------------------------------------------------
deploy_to() {
    local target_dir="$1"
    if [ ! -d "$target_dir" ]; then
        echo "[wsl-build]   skip (missing): $target_dir"
        return 0
    fi
    cp "$BUILT_JAR" "$target_dir/$JAR_NAME"
    echo "[wsl-build]   -> $target_dir/$JAR_NAME"
}

if [ "$DEPLOY_DISTROS" = 1 ]; then
    echo "[wsl-build] Deploying to 3 repo distros..."
    deploy_to "$REPO_ROOT/.minecraft/mods"
    deploy_to "$REPO_ROOT/.minecraft/server_distribution/mods"
    deploy_to "$REPO_ROOT/.minecraft/distribution/client/mods"
fi

if [ "$DEPLOY_LIVE" = 1 ]; then
    LIVE="/mnt/z/Users/silvariazemaitis/Desktop/IridescentCraft Dedicated Server/mods"
    if [ -d "$LIVE" ]; then
        echo "[wsl-build] Deploying to Z: live server..."
        deploy_to "$LIVE"
    else
        echo "[wsl-build] Z: live mount not accessible from WSL ($LIVE missing) -- skip."
        echo "[wsl-build]   On the Windows host: net use Z: \\server\share (or whatever the share is)"
        echo "[wsl-build]   Then in WSL: sudo mount -t drvfs Z: /mnt/z"
    fi
fi

echo "[wsl-build] Done."
