// =============================================================================
// MEKASUIT Mk2 — MARKER-KEYED TOOLTIP
// File: kubejs/client_scripts/mekasuit_mk2_tooltip.js
// =============================================================================
// [2026-06-06 MK2B] The Mk2 is the real mekanism:mekasuit_* piece carrying the
// NBT marker `icraft_mekasuit_mk2:1b` (stamped by the in-place upgrade recipe in
// ad_astra_gating.js SECTION G). The recipe also sets a pinnacle display Name +
// Lore, but display NBT can be overwritten by an anvil rename or stripped by a
// future migration -- so this adds a marker-keyed identity line that is
// independent of the display compound. A plain (un-upgraded) MekaSuit lacks the
// marker and is untouched.
//
// Per feedback_kubejs_tooltip_api: addAdvancedToAll is a silent no-op; use a
// per-id addAdvanced registration. `.isEmpty()` needs parens (function-ref
// truthiness trap). We add ONE line at the end so it composes with the recipe's
// own Lore rather than fighting it.
// =============================================================================

var MK2_MEKASUIT_IDS = [
  'mekanism:mekasuit_helmet',
  'mekanism:mekasuit_bodyarmor',
  'mekanism:mekasuit_pants',
  'mekanism:mekasuit_boots'
]

ItemEvents.tooltip(event => {
  MK2_MEKASUIT_IDS.forEach(itemId => {
    event.addAdvanced(itemId, (stack, advanced, text) => {
      try {
        if (!stack || stack.isEmpty()) return
        var tag = stack.nbt
        if (!tag) return
        if (!tag.contains('icraft_mekasuit_mk2')) return
        if (!tag.getBoolean('icraft_mekasuit_mk2')) return
        text.add(Text.of('MekaSuit Mk2').color('aqua').bold())
      } catch (e) {
        // Fail-soft -- never let a tooltip query crash item rendering.
      }
    })
  })
})
