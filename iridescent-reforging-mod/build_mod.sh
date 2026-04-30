#!/usr/bin/env bash
# Build iridescent-reforging-mod and deploy the jar to all 3 distros.
#
# Mirrors the pattern used by iridescent-modular-spells-mod/build_mod.sh.
set -euo pipefail

cd "$(dirname "$0")"

JAR_NAME="iridescent_reforging-0.1.0.jar"
SRC_JAR="build/libs/${JAR_NAME}"

# Ensure libs/ has the compile-time jars. Pull from the iridescent-biomes-mod
# tools cache if any are missing (avoids per-mod cache duplication).
CACHE="../iridescent-biomes-mod/tools/.cache/all-mods"
copy_if_missing() {
    local target="$1"
    local source_glob="$2"
    if [ ! -f "libs/${target}" ]; then
        local match
        match=$(ls $CACHE/$source_glob 2>/dev/null | head -n1 || true)
        if [ -n "${match:-}" ]; then
            echo "[Reforging Build] Staging libs/${target} from cache"
            cp "$match" "libs/${target}"
        else
            echo "[Reforging Build] WARNING: libs/${target} missing and no cache match for $source_glob"
        fi
    fi
}
copy_if_missing tetra.jar 'tetra-1.20.1-*.jar'
copy_if_missing mutil.jar 'mutil-1.20.1-*.jar'
copy_if_missing geckolib-forge.jar 'geckolib-forge-1.20.1-*.jar'
copy_if_missing irons_spellbooks.jar 'irons_spellbooks-1.20.1-*.jar'

if command -v python3 >/dev/null 2>&1 && [ -f tools/lang_audit.py ] && [ -f tools/texture_audit.py ]; then
    echo "[Reforging Build] Preflight: lang + texture audits..."
    python3 tools/lang_audit.py    || { echo "[Reforging Build] FAIL: lang_audit reported gaps"; exit 1; }
    python3 tools/texture_audit.py || { echo "[Reforging Build] FAIL: texture_audit reported gaps"; exit 1; }
fi

echo "[Reforging Build] Running gradle build..."
./gradlew build --warning-mode=none

if [ ! -f "${SRC_JAR}" ]; then
    echo "[Reforging Build] FAIL: build artifact not found at ${SRC_JAR}"
    exit 1
fi

echo "[Reforging Build] Deploying ${JAR_NAME} to all 3 distros..."
for distro in \
    /root/IridescentCraft/.minecraft/mods \
    /root/IridescentCraft/.minecraft/server_distribution/mods \
    /root/IridescentCraft/.minecraft/distribution/client/mods
do
    cp "${SRC_JAR}" "${distro}/${JAR_NAME}"
    echo "  -> ${distro}/${JAR_NAME}"
done

echo "[Reforging Build] Done."
echo
echo "Reminder: add ${JAR_NAME} to the custom-JAR allowlists in"
echo "iridescentserver.bat / sync_from_repo.bat / update_mods.sh"
echo "if this is the first deploy."
