#!/usr/bin/env bash
# Build iridescent-tetra-expansion-mod (the bundled Tetra-armor +
# modular-spell-book jar) and deploy to all 3 distros.
set -euo pipefail

cd "$(dirname "$0")"

JAR_NAME="iridescent_tetra_expansion-1.0.0.jar"
SRC_JAR="build/libs/${JAR_NAME}"

# Stage compile-time libs from the central cache if any are missing.
CACHE="../iridescent-biomes-mod/tools/.cache/all-mods"
copy_if_missing() {
    local target="$1"
    local source_glob="$2"
    if [ ! -f "libs/${target}" ]; then
        local match
        match=$(ls $CACHE/$source_glob 2>/dev/null | head -n1 || true)
        if [ -n "${match:-}" ]; then
            echo "[Tetra-Expansion Build] Staging libs/${target} from cache"
            cp "$match" "libs/${target}"
        fi
    fi
}
copy_if_missing tetra.jar           'tetra-1.20.1-*.jar'
copy_if_missing mutil.jar           'mutil-1.20.1-*.jar'
copy_if_missing irons_spellbooks.jar 'irons_spellbooks-1.20.1-*.jar'
copy_if_missing curios-forge.jar    'curios-forge-*.jar'
copy_if_missing ars_nouveau.jar     'ars_nouveau-1.20.1-*.jar'
copy_if_missing geckolib-forge.jar  'geckolib-forge-1.20.1-*.jar'

echo "[Tetra-Expansion Build] Regenerating Tetra repair definitions from current module data..."
python3 tools/gen_repair_definitions.py

echo "[Tetra-Expansion Build] Generating skin-aware inventory icon overrides..."
python3 tools/gen_skin_models.py

echo "[Tetra-Expansion Build] Generating source-aware spellbook icon overrides..."
python3 tools/gen_spellbook_icons.py

echo "[Tetra-Expansion Build] Running gradle build..."
./gradlew build

if [ ! -f "$SRC_JAR" ]; then
    echo "[Tetra-Expansion Build] ERROR: $SRC_JAR was not produced"
    exit 1
fi

echo "[Tetra-Expansion Build] Deploying $JAR_NAME to all 3 distros..."
for dest in \
    /root/IridescentCraft/.minecraft/mods \
    /root/IridescentCraft/.minecraft/server_distribution/mods \
    /root/IridescentCraft/.minecraft/distribution/client/mods
do
    cp "$SRC_JAR" "$dest/"
    echo "  -> $dest/$JAR_NAME"
done
echo "[Tetra-Expansion Build] Done."
