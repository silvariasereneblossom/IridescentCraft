#!/usr/bin/env bash
# =============================================================================
# KubeJS method-reference-no-parens trap validator
# =============================================================================
# Per feedback_kubejs_tooltip_api: in Rhino/KubeJS, calling a method without
# parens (e.g. `stack.isEmpty`) returns a function reference, which is always
# truthy in boolean context. Code like `if (stack.isEmpty) return` or
# `if (!stack.isDamageableItem) return` ALWAYS triggers the early return for
# any non-null stack, silently disabling the entire downstream logic.
#
# This trap surfaced twice in production:
#   - 2026-05-18: apotheosis_gem_repair.js inventory sweep had been silently
#     no-op for the script's entire lifetime due to `stack.isEmpty` (line 66).
#   - 2026-05-18 cascade: fixing isEmpty unmasked the same trap on
#     `stack.isDamageableItem` in death_penalty.js, which started
#     incorrectly tagging non-damageable items (gems) with icraft_broken.
#
# Pattern detected: <ident>.<is|has|can><CamelCase> NOT followed by `(`.
# Common method families that fall into the trap:
#   is*  -> isEmpty, isDamageableItem, isStackable, isDamaged, isEnchanted,
#           isFood, isLightWeapon, isWeapon, isArmor, isFoil, isCrossbow
#   has* -> hasTag, hasNbt, hasFoil, hasCustomHoverName
#   can* -> canEnchant, canBeReplaced, canRepair
#
# Exclusions:
#   - Anything inside line comments (`//`)
#   - Anything inside block comments (handled by stripping)
#   - Any line with `// CI-ignore` marker -- escape hatch for true positives
#     where the property is a known KubeJS-extension getter
#   - The feature-detect-then-call idiom `obj.method && obj.method()` -- here
#     the bare ref IS immediately guarded + called (it's a real null/existence
#     check, NOT a boolean misuse), so it's exempt. Only a bare ref that ISN'T
#     immediately `&&`'d with its own call stays flagged.
#   - The capability probe `typeof obj.method` (e.g.
#     `typeof core.isBoss === 'function' && core.isBoss(id)`) -- `typeof` reads
#     the member's TYPE, which is exactly what a bare ref is for. Only the
#     probe itself is dropped; any other bare ref on the same line still flags.
#   - The two labels of an event guard, `icraft.guard('<script>', '<Group.event>',`
#     (kubejs/*_scripts/00_icraft_guard.js): the second one is the registration's
#     own name as a STRING (`'ItemEvents.canPickUp'`), not a member read. Only the
#     two string arguments are dropped; the handler after them is still checked.
#
# What still needs `// CI-ignore: <reason>` on the line (verify first -- javap
# the live jar, don't guess):
#   - a KubeJS BEAN GETTER read as a property: `block.canSeeSky` is
#     BlockContainerJS.getCanSeeSky() and reads as a real boolean, while its
#     neighbour `canSeeSkyFromBelowWater` is a plain method and IS the trap.
#   - a field of a plain JS object (`q.isMarker`, `statDef.isPercent`).
#
# Usage:
#   ./check_kubejs_method_refs.sh          # scan default kubejs paths
#   ./check_kubejs_method_refs.sh <path>   # scan a specific path
#
# Exits 0 if clean, 1 if any traps are detected, 2 if the scan could not run.
# =============================================================================

set -eu

ROOT="${1:-$(dirname "$0")/..}"

SCAN_DIRS=(
  "$ROOT/kubejs/server_scripts"
  "$ROOT/kubejs/startup_scripts"
  "$ROOT/kubejs/client_scripts"
)

PATTERN='\b[A-Za-z_][A-Za-z0-9_]*\.(is|has|can)[A-Z][a-zA-Z]+[^a-zA-Z_(]'

# Build the find args for directories that actually exist.
EXISTING_DIRS=()
for d in "${SCAN_DIRS[@]}"; do
  [ -d "$d" ] && EXISTING_DIRS+=("$d")
done

if [ "${#EXISTING_DIRS[@]}" -eq 0 ]; then
  echo "No KubeJS script directories found under $ROOT — nothing to validate."
  exit 0
fi

# Step 1: grep candidate lines (grep exits 0 = hits, 1 = none, 2+ = it failed).
# Step 2: one perl pass drops the legitimate shapes:
#           - lines that are themselves comments (optional whitespace, then
#             `//` or `*`)
#           - lines explicitly opted out via `// CI-ignore`
#           - the feature-detect idiom `obj.method && obj.method(`
#           - `typeof obj.method` probes (the probe only, then the line is
#             re-tested for any bare ref left over)
#           - the two string labels of `icraft.guard('..', '..',` (same way)
#         A hit inside a string literal is NOT filtered; add `// CI-ignore`.
#
# perl, not `grep -P`: under a non-UTF-8 locale (Git Bash with LANG unset)
# `grep -P` dies with "supports only unibyte and UTF-8 locales", and behind
# the old pipeline's `|| true` that read as a CLEAN run -- the local check
# printed OK on a tree CI was failing. A step that cannot run now exits 2.
command -v perl >/dev/null 2>&1 || { echo "ERROR: perl is required by $0"; exit 2; }

candidates=$(grep -rnE "$PATTERN" "${EXISTING_DIRS[@]}") || {
  rc=$?
  if [ "$rc" -ne 1 ]; then
    echo "ERROR: candidate scan failed (grep exit $rc) -- nothing was validated."
    exit 2
  fi
  candidates=""
}

found=$(
  printf '%s\n' "$candidates" | perl -ne '
    next unless /\S/;
    next if m{^[^:]+:[0-9]+:\s*(?://|\*)};
    next if /CI-ignore/;
    next if /(\b[A-Za-z_][A-Za-z0-9_]*\.(?:is|has|can)[A-Z][a-zA-Z]+)\s*&&\s*\1\s*\(/;
    (my $rest = $_) =~ s/\btypeof\s*\(?\s*[A-Za-z_\$][\w\$.]*//g;
    $rest =~ s/\bicraft\.guard\(\s*([\x27"])[^\x27"]*\1\s*,\s*([\x27"])[^\x27"]*\2//g;
    print if $rest =~ /\b[A-Za-z_][A-Za-z0-9_]*\.(?:is|has|can)[A-Z][a-zA-Z]+[^a-zA-Z_(\n]/;
  '
)

# ── Check 2: command-applied attribute modifiers ─────────────────────────
# /attribute <target> <attr> modifier add takes UUID + NAME on 1.20.1, and
# the ops are add|multiply|multiply_base. Scripts written with 1.21 syntax
# (single resource-location id, add_value op) PARSE-FAIL, and
# runCommandSilent swallows the error -- 37 such sites silently no-opped
# class/race progression for months (found 2026-06-13 via the Witch of Ink
# toughness report). Use player.modifyAttribute(...) instead; execute-if
# NBT probes (no "modifier") remain fine.
attr_cmds=$(
  grep -rnE "runCommandSilent\(.*attribute .* modifier (add|remove)" "${EXISTING_DIRS[@]}" 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*)' \
  | grep -vE 'CI-ignore' \
  || true
)

if [ -n "$attr_cmds" ]; then
  echo "ERROR: command-applied attribute modifier found in KubeJS scripts."
  echo ""
  echo "On 1.20.1, /attribute modifier add needs UUID + NAME and ops"
  echo "add|multiply|multiply_base -- the 1.21 single-id/add_value form"
  echo "parse-fails and runCommandSilent SWALLOWS the error (silent no-op)."
  echo "Use player.modifyAttribute(attr, name, value, op) instead."
  echo ""
  echo "Offending lines:"
  echo "$attr_cmds"
  exit 1
fi

if [ -z "$found" ]; then
  echo "OK: no bare method-ref traps in KubeJS scripts."
  echo "Scanned: ${EXISTING_DIRS[*]}"
  exit 0
fi

echo "ERROR: bare method-ref (no parens) found in KubeJS scripts."
echo ""
echo "Per feedback_kubejs_tooltip_api: in Rhino/KubeJS, \`stack.isEmpty\`"
echo "without parens is a function reference, always truthy in boolean"
echo "context. Code like \`if (stack.isEmpty) return\` always early-returns;"
echo "code like \`if (!stack.isEmpty && ...)\` never enters the block."
echo ""
echo "Fix by adding parens: \`stack.isEmpty()\` etc."
echo ""
echo "If the property is a real KubeJS extension getter (rare; almost all"
echo "is/has/can entries are Java methods), suppress the warning by adding"
echo "\`// CI-ignore: <reason>\` on the offending line."
echo ""
echo "Offending lines:"
echo "$found"
exit 1
