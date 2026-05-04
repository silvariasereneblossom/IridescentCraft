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
// Tier comes from the four icraft:armor_robe / armor_light / armor_medium /
// armor_heavy tags. Each registers as its own tag-ingredient handler — the
// `addAdvancedToAll` API does not invoke the callback in this KubeJS build
// (2001.6.5-build.16), confirmed by 2-stage diag 2026-05-04. Tag ingredients
// (`#icraft:armor_*`) work via the same path as `addAdvanced('minecraft:enchanted_book', ...)`
// in enchanted_book_tooltip_fix.js.
//
// Reforged armor (iridescent_reforging:reforged_*) is excluded from these
// tags — those items already display the tier via Java appendHoverText in
// ItemModularArmor (with a tier-specific T1/T2/T3 line above it).
// =============================================================================

ItemEvents.tooltip(event => {
  event.addAdvanced('#icraft:armor_robe', (stack, advanced, text) => {
    if (stack.isEmpty) return
    text.add(Text.of('Robe Armor').color('light_purple'))
  })

  event.addAdvanced('#icraft:armor_light', (stack, advanced, text) => {
    if (stack.isEmpty) return
    text.add(Text.of('Light Armor').color('aqua'))
  })

  event.addAdvanced('#icraft:armor_medium', (stack, advanced, text) => {
    if (stack.isEmpty) return
    text.add(Text.of('Medium Armor').color('yellow'))
  })

  event.addAdvanced('#icraft:armor_heavy', (stack, advanced, text) => {
    if (stack.isEmpty) return
    text.add(Text.of('Heavy Armor').color('gold'))
  })
})
