#!/usr/bin/env bash
# =============================================================================
# IridescentCraft Distribution Verification
# =============================================================================
# Checks that all critical files exist in server_distribution/ and
# distribution/client/ with matching sizes. Run after any rebuild,
# commit, or before pushing.
#
# Exit 0 = all good, Exit 1 = missing files found
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

echo "[Verify] Checking distribution sync..."

# Critical Paxi datapacks
PAXI_ZIPS=(
  "iridescent_codex.zip"
  "icraft_skills.zip"
  "icraft_apotheosis_affixes.zip"
  "icraft_botania_overrides.zip"
  "icraft_tetra_materials.zip"
  "icraft_tetra_overrides.zip"
  "icraft_aethersteel_overrides.zip"
  "icraft_progdiff_overrides.zip"
  "improvedmobs_datapack.zip"
  "icraft_loot_overrides.zip"
  "icraft_dungeon_crawl_overrides.zip"
)

# Critical custom JARs
CUSTOM_JARS=(
  "iridescent_codex_data.jar"
  "iridescent_origins-1.0.0.jar"
  "iridescent_biomes-1.0.0.jar"
  "iridescent_modular_spells-0.2.0.jar','iridescent_reforging-0.1.0.jar"
  "offlineskins-1.20.1-v1.jar"
  "Patchouli-1.20.1-85-FORGE.jar"
)

# Critical KubeJS scripts
KUBEJS_SCRIPTS=(
  "kubejs/server_scripts/loot/lootjs_overhaul.js"
  "kubejs/server_scripts/gates/milestone_detection.js"
  "kubejs/server_scripts/gates/astages_restrictions.js"
  "kubejs/server_scripts/scaling/mob_scaling_unified.js"
  "kubejs/server_scripts/death_penalty.js"
  "kubejs/server_scripts/compat/class_artifacts_recipes.js"
  "kubejs/data/forge/loot_modifiers/global_loot_modifiers.json"
)

# Critical configs
CONFIGS=(
  "config/dungeon_crawl.toml"
  "config/lootr-common.toml"
  "config/tectonic.json"
  "config/sereneseasons/seasons.toml"
  "config/everydayxp/rpgseteffects/rpgseteffects.toml"
  "config/chunky/config.json"
  "config/paxi/datapack_load_order.json"
)

DISTROS=("server_distribution" "distribution/client")

check_file() {
  local src="$1"
  local distro="$2"
  local rel="$3"

  local src_path="$SCRIPT_DIR/$rel"
  local dst_path="$SCRIPT_DIR/$distro/$rel"

  if [ ! -f "$src_path" ]; then
    return 0  # Source doesn't exist, skip
  fi

  if [ ! -f "$dst_path" ]; then
    echo "  MISSING: $distro/$rel"
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  local src_size=$(stat -c%s "$src_path" 2>/dev/null || stat -f%z "$src_path" 2>/dev/null)
  local dst_size=$(stat -c%s "$dst_path" 2>/dev/null || stat -f%z "$dst_path" 2>/dev/null)

  if [ "$src_size" != "$dst_size" ]; then
    echo "  STALE:   $distro/$rel (src=${src_size} dst=${dst_size})"
    ERRORS=$((ERRORS + 1))
    return 1
  fi

  return 0
}

for distro in "${DISTROS[@]}"; do
  echo ""
  echo "  --- $distro ---"

  for zip in "${PAXI_ZIPS[@]}"; do
    check_file "" "$distro" "config/paxi/datapacks/$zip"
  done

  for jar in "${CUSTOM_JARS[@]}"; do
    check_file "" "$distro" "mods/$jar"
  done

  for script in "${KUBEJS_SCRIPTS[@]}"; do
    check_file "" "$distro" "$script"
  done

  for cfg in "${CONFIGS[@]}"; do
    check_file "" "$distro" "$cfg"
  done
done

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "[Verify] FAILED: $ERRORS file(s) missing or stale"
  echo "[Verify] Run sync or copy the missing files to fix."
  exit 1
else
  echo "[Verify] All critical files present and sized correctly."
  exit 0
fi
