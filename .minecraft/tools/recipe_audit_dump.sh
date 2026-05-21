#!/usr/bin/env bash
# =============================================================================
# RECIPE AUDIT DUMP -- Linux companion to recipe_audit_dump.ps1
# Place in: .minecraft/tools/recipe_audit_dump.sh
# =============================================================================
#
# Purpose: same TSV-output goal as the PowerShell variant. Useful if the
# mod jars are available on a Linux box (e.g., post-cutover when packwiz
# downloads into a Linux instance, or by rsync from the Windows side).
#
# Output schema matches recipe_audit_dump.ps1:
#   recipe_id  recipe_type  output_item  output_count  ingredients  source_jar
#
# Usage:
#   bash .minecraft/tools/recipe_audit_dump.sh <mods_dir> [out_file]
# Defaults: <mods_dir>=./.minecraft/mods, out_file=./recipes.tsv
#
# Requires: jq, unzip, awk
# =============================================================================

set -euo pipefail

MODS_DIR="${1:-./.minecraft/mods}"
OUT_FILE="${2:-./recipes.tsv}"

if [ ! -d "$MODS_DIR" ]; then
  echo "[recipe_audit_dump] mods dir not found: $MODS_DIR" >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "unzip required" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Header
printf 'recipe_id\trecipe_type\toutput_item\toutput_count\tingredients\tsource_jar\n' > "$OUT_FILE"

jars=$(find "$MODS_DIR" -maxdepth 1 -name '*.jar' | sort)
total=$(echo "$jars" | wc -l)
echo "[recipe_audit_dump] Walking $total jars in $MODS_DIR"

i=0
for jar in $jars; do
  i=$((i+1))
  name=$(basename "$jar")
  [ $((i % 10)) -eq 0 ] && echo "  [$i/$total] $name"

  jar_dir="$WORK/$(basename "$jar" .jar)"
  mkdir -p "$jar_dir"

  unzip -q -o "$jar" 'data/*/recipes/*.json' -d "$jar_dir" 2>/dev/null || true
  [ -d "$jar_dir/data" ] || { rm -rf "$jar_dir"; continue; }

  find "$jar_dir/data" -name '*.json' -path '*/recipes/*' | while read -r recipe; do
    rel="${recipe#$jar_dir/}"
    modid=$(echo "$rel" | cut -d'/' -f2)
    path=$(echo "$rel" | sed "s|data/$modid/recipes/||;s|\.json$||")
    recipe_id="${modid}:${path}"

    # Read JSON via jq; tolerate malformed files
    rtype=$(jq -r '.type // "unknown"' "$recipe" 2>/dev/null || echo "unknown")

    # Output: try result.item, result (string), results[0].item, result.tag
    output=$(jq -r '
      if (.result | type) == "string" then .result
      elif .result.item then .result.item
      elif .result.tag then "#" + .result.tag
      elif (.results // [])[0].item then .results[0].item
      elif (.results // [])[0].tag then "#" + .results[0].tag
      else "" end
    ' "$recipe" 2>/dev/null || echo "")

    count=$(jq -r '.result.count // 1' "$recipe" 2>/dev/null || echo "1")

    # Ingredients: collect from ingredients[], ingredient, key{}, input
    ingredients=$(jq -r '
      [
        (.ingredients // [])[] | (if type == "array" then .[] else . end) | (.item // ("#" + (.tag // "")) // empty),
        (.ingredient | (.item // ("#" + (.tag // "")))) // empty,
        (.key // {} | to_entries[] | .value | (if type == "array" then .[] else . end) | (.item // ("#" + (.tag // "")) // empty)),
        (.input | (.item // ("#" + (.tag // "")))) // empty
      ] | map(select(. != null and . != "#")) | unique | join(",")
    ' "$recipe" 2>/dev/null || echo "")

    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$recipe_id" "$rtype" "$output" "$count" "$ingredients" "$name" >> "$OUT_FILE"
  done

  rm -rf "$jar_dir"
done

total_recipes=$(($(wc -l < "$OUT_FILE") - 1))
echo "[recipe_audit_dump] Done. $total_recipes recipes captured in $OUT_FILE"
echo ""
echo "Next steps:"
echo "  T2+ ingredient leak filter:"
echo "    awk -F'\\t' 'NR > 1 && \$5 ~ /thermal:steel_ingot|botania:manasteel_ingot|botania:mana_diamond|minecraft:diamond[^_]|minecraft:netherite_ingot|mekanism:osmium_ingot|botania:terrasteel_ingot|thermal:enderium_ingot/' $OUT_FILE > t2_t3_leaks.tsv"
echo "  Then cross-reference each hit against tier_gated_recipes.js + tier_skip.js."
