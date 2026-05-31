// =============================================================================
// VIRTUAL GOLD DURABILITY CLAMP
// Place in: kubejs/startup_scripts/virtual_gold_durability.js
// =============================================================================
//
// 2026-05-20: Clamp celestial_core virtual_gold tools/armor to iron-tier
// durability. Companion to server_scripts/virtual_gold_clamp.js (which handles
// attack damage / armor / armor_toughness).
//
// Targets:
//   tools (sword/axe/pickaxe/shovel/hoe): 250
//   helmet:     165   chestplate: 240   leggings: 225   boots: 195
//
// Does NOT touch enchantability (Item.getEnchantmentValue() is a separate
// virtual method and not modified here). Per user 2026-05-20: high enchant
// affinity stays.
//
// 2026-05-31 FIX: switched from broken `<loadedClass>.class` reflection (which
// silently no-op'd in KubeJS 2001.6.5) to the KubeJS Item mixin setter
// `kjs$setMaxDamage(int)` via ItemEvents.modification. Same pattern as
// hulk_hammer_durability.js + terramity_weapon_durability.js.
// =============================================================================

ItemEvents.modification(event => {
  const TARGETS = {
    'virtual_gold_sword':      250,
    'virtual_gold_axe':        250,
    'virtual_gold_pickaxe':    250,
    'virtual_gold_shovel':     250,
    'virtual_gold_hoe':        250,
    'virtual_gold_helmet':     165,
    'virtual_gold_chestplate': 240,
    'virtual_gold_leggings':   225,
    'virtual_gold_boots':      195,
  }
  Object.keys(TARGETS).forEach(name => {
    event.modify('celestial_core:' + name, item => item.kjs$setMaxDamage(TARGETS[name]))
  })
})
