// =============================================================================
// Broken Item Tooltip — Client Script
// Shows "(Broken)" on items that have been reduced to 0 durability by death
// =============================================================================
// addAdvancedToAll's callback does not fire in this KubeJS build
// (2001.6.5-build.16) — confirmed by 2-stage diag 2026-05-04. Register
// per-tag-ingredient instead, mirroring armor_weight_tooltip.js.
//
// Coverage: 4 armor tags. Held weapons/tools are not covered yet — most
// tetra-modular weapons + vanilla tools don't share a common item tag in
// this pack. Follow-up if testers confirm broken-weapon tooltip is missed.
// =============================================================================

const BROKEN_TAGS = [
  '#icraft:armor_robe',
  '#icraft:armor_light',
  '#icraft:armor_medium',
  '#icraft:armor_heavy'
]

function brokenTooltipHandler(stack, advanced, text) {
  if (stack.isEmpty || !stack.nbt) return
  if (!stack.nbt.getBoolean('icraft_broken')) return
  text.add(1, Text.red(Text.of('✘ BROKEN').bold()))
  text.add(2, Text.gray('Repair at an anvil to restore functionality'))
}

ItemEvents.tooltip(event => {
  BROKEN_TAGS.forEach(tag => {
    event.addAdvanced(tag, brokenTooltipHandler)
  })
})
