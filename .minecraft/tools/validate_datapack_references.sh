#!/usr/bin/env bash
# =============================================================================
# validate_datapack_references.sh — close cross-cutting finding from audit
# Phase 8.1 (closes the loop on the occultism P0 finding).
# =============================================================================
# The audit's P0 finding was that recipe_audit.js:137 referenced an
# icraft_occultism_overrides datapack via code comment, but that datapack
# was never actually created. The TODO silently rotted because nothing
# validated the contract between code-comments and datapack_sources/.
#
# This script is the closing-the-loop dev-time check:
#   1. Scan kubejs/ for any "icraft_*_overrides" mention (in comments or code)
#   2. Compare against datapack_sources/ directory list
#   3. Compare against config/paxi/datapack_load_order.json entries
#   4. Print a report; exit 1 if any mismatch
#
# Run manually before committing audit/gating changes, or wire as a pre-commit
# hook. NOT a runtime check — KubeJS class filter blocks java.io.* so we can't
# do this from server_scripts. Build-time verification is the right place.
# =============================================================================

set -uo pipefail

MC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MC"

referenced=$(grep -rhEo "icraft_[a-z_]+_overrides" kubejs/ 2>/dev/null | sort -u)
present=$(ls datapack_sources/ 2>/dev/null | grep -E "^icraft_[a-z_]+_overrides$" | sort -u)

# Paxi load-order entries strip the .zip suffix
loaded=$(grep -oE 'icraft_[a-z_]+_overrides' config/paxi/datapack_load_order.json 2>/dev/null | sort -u)

stale_refs=()
missing_zips=()
unloaded_packs=()

# Refs in code that don't have a datapack source dir
for r in $referenced; do
    if ! echo "$present" | grep -qx "$r"; then
        stale_refs+=("$r")
    fi
done

# Datapack sources that aren't in the paxi load order
for p in $present; do
    if ! echo "$loaded" | grep -qx "$p"; then
        unloaded_packs+=("$p")
    fi
done

# Datapack sources that don't have a built zip in config/paxi/datapacks/
for p in $present; do
    if [ ! -f "config/paxi/datapacks/${p}.zip" ]; then
        missing_zips+=("${p}.zip")
    fi
done

echo "=== Datapack-reference validation ==="
echo
echo "Referenced in kubejs/ ($(echo "$referenced" | wc -w)):"
for r in $referenced; do echo "  $r"; done
echo
echo "Datapack source dirs ($(echo "$present" | wc -w)):"
for p in $present; do echo "  $p"; done
echo
echo "In paxi load order ($(echo "$loaded" | wc -w)):"
for l in $loaded; do echo "  $l"; done
echo
echo "=== Issues ==="

errors=0

if [ ${#stale_refs[@]} -gt 0 ]; then
    echo
    echo "STALE — referenced in code but no datapack_sources/ directory:"
    for r in "${stale_refs[@]}"; do echo "  - $r"; done
    echo "  ^^ Either create the datapack OR remove the reference from code."
    errors=$((errors + ${#stale_refs[@]}))
fi

if [ ${#missing_zips[@]} -gt 0 ]; then
    echo
    echo "UNBUILT — datapack source exists but no zip in config/paxi/datapacks/:"
    for z in "${missing_zips[@]}"; do echo "  - $z"; done
    echo "  ^^ Build the zip and copy to all 3 distros."
    errors=$((errors + ${#missing_zips[@]}))
fi

if [ ${#unloaded_packs[@]} -gt 0 ]; then
    echo
    echo "ORDER UNDEFINED — datapack source exists but not in paxi load order:"
    for u in "${unloaded_packs[@]}"; do echo "  - $u"; done
    echo "  ^^ Paxi loads them, but in unspecified order relative to other"
    echo "     icraft_*_overrides. Add to config/paxi/datapack_load_order.json"
    echo "     (and the other 2 distros) for deterministic load order."
    errors=$((errors + ${#unloaded_packs[@]}))
fi

if [ "$errors" -eq 0 ]; then
    echo "  All clean. Code refs, datapack sources, zips, and load order are consistent."
fi

echo
exit "$errors"
