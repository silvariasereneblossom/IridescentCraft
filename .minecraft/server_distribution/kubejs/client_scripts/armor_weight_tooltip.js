// =============================================================================
// Armor Weight Tooltip — Client Script
// =============================================================================
// Shows the weight tier (Robe / Light / Medium / Heavy) on every armor item's
// tooltip, color-coded to match the in-world effect from armor_weight.js:
//
//   Robe   light_purple    +mana_regen + small speed, low armor + toughness,
//                          full 4-piece set bonus (+0.5 mana_regen extra)
//   Light  aqua            +speed, light penalty
//   Medium yellow          neutral (no bonus or penalty)
//   Heavy  gold            +armor, -speed/-mana
//
// Tier is registered per-tag via four addAdvanced('#icraft:armor_*', handler)
// calls — same code path as enchanted_book_tooltip_fix.js. addAdvancedToAll
// is a silent no-op in KubeJS 2001.6.5-build.16.
//
// IMPORTANT: do NOT add `if (stack.isEmpty) return` — in this Rhino/KubeJS
// build, bare `stack.isEmpty` (no parens) evaluates to the function reference
// rather than the boolean result, which is always truthy. The handler then
// always early-returns and renders nothing. Tooltip events never receive
// EMPTY stacks anyway, so the check is unnecessary.
// =============================================================================

ItemEvents.tooltip(event => {
  event.addAdvanced('#icraft:armor_robe', (stack, advanced, text) => {
    text.add(Text.of('Robe Armor').color('light_purple'))
  })

  event.addAdvanced('#icraft:armor_light', (stack, advanced, text) => {
    text.add(Text.of('Light Armor').color('aqua'))
  })

  event.addAdvanced('#icraft:armor_medium', (stack, advanced, text) => {
    text.add(Text.of('Medium Armor').color('yellow'))
  })

  event.addAdvanced('#icraft:armor_heavy', (stack, advanced, text) => {
    text.add(Text.of('Heavy Armor').color('gold'))
  })
})
