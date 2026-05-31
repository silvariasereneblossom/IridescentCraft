// =============================================================================
// VIRTUAL GOLD DURABILITY CLAMP  (kubejs/startup_scripts/)
// =============================================================================
// Clamp celestial_core virtual_gold tools/armor to iron-tier durability.
// Companion to server_scripts/virtual_gold_clamp.js (atk dmg / armor / toughness).
// High enchant affinity intentionally stays (not touched here).
//
// 2026-05-31: use the `maxDamage` PROPERTY on the ItemEvents.modification target
// (KubeJS 2001.6.5 exposes the kjs$ setter as this property; raw
// `kjs$setMaxDamage` + the old `<class>.class` reflection both failed).
// try/catch-hedged. Durable fallback: iridescent_durability_clamp coremod mixin.
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
    event.modify('celestial_core:' + name, item => {
      try { item.maxDamage = TARGETS[name] }
      catch (e) { console.warn('[virtual_gold_durability] ' + name + ': ' + e) }
    })
  })
})
