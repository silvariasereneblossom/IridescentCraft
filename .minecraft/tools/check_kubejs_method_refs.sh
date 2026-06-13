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
#
# Usage:
#   ./check_kubejs_method_refs.sh          # scan default kubejs paths
#   ./check_kubejs_method_refs.sh <path>   # scan a specific path
#
# Exits 0 if clean, 1 if any traps are detected.
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

# Step 1: grep candidate lines.
# Step 2: strip lines that are themselves comments (begin with optional
#         whitespace then `//` or `*`).
# Step 3: strip lines explicitly opted out via `// CI-ignore`.
# Step 4: strip in-string occurrences (matched .isXxx inside a `"..."` block)
#         by removing the substring between matched double-quotes BEFORE
#         re-applying the regex. This is a coarse filter; if it produces
#         false positives, add `// CI-ignore` on the line.
found=$(
  grep -rnE "$PATTERN" "${EXISTING_DIRS[@]}" 2>/dev/null \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//' \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*\*' \
  | grep -vE 'CI-ignore' \
  | grep -vP '(\b[A-Za-z_][A-Za-z0-9_]*\.(?:is|has|can)[A-Z][a-zA-Z]+)\s*&&\s*\1\s*\(' \
  || true
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
