// =============================================================================
// Broken Item Tooltip — Client Script
// Shows "(Broken)" on items reduced to 0 durability by death penalty
// =============================================================================
// Per-tag registration since addAdvancedToAll is a silent no-op in KubeJS
// 2001.6.5-build.16. Coverage: 4 armor tags. Held weapons/tools don't share
// a common pack-wide tag — follow up if testers report broken weapons not
// rendering the line.
//
// IMPORTANT: do NOT use `stack.isEmpty` as a guard — bare property access
// returns the function reference (always truthy) in this Rhino. Use
// `stack.nbt` null-check + `getBoolean('icraft_broken')` instead.
// =============================================================================

const BROKEN_TAGS = [
  '#icraft:armor_robe',
  '#icraft:armor_light',
  '#icraft:armor_medium',
  '#icraft:armor_heavy'
]

function brokenTooltipHandler(stack, advanced, text) {
  if (!stack.nbt) return
  if (!stack.nbt.getBoolean('icraft_broken')) return
  text.add(1, Text.red(Text.of('✘ BROKEN').bold()))
  text.add(2, Text.gray('Repair at an anvil to restore functionality'))
}

ItemEvents.tooltip(event => {
  BROKEN_TAGS.forEach(tag => {
    event.addAdvanced(tag, brokenTooltipHandler)
  })
})
