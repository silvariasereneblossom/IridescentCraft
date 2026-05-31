// =============================================================================
// TERRAMITY WEAPON DURABILITY CLAMP  (kubejs/startup_scripts/)
// =============================================================================
// Clamp 12 wildly-above-tier Terramity weapon durabilities to 2500 (~1.2x
// netherite): 5 ingot melee at 8124, 6 audit guns at 16256, unholy_lance 50000.
// 2500 makes them expensive-to-reforge T3/T4 loot instead of ~unbreakable, and
// keeps the reforging table from being cheaper than re-running the structure.
//
// 2026-05-31: use the `maxDamage` PROPERTY on the ItemEvents.modification target
// (KubeJS 2001.6.5 exposes the kjs$ setter as this property; the raw
// `kjs$setMaxDamage` name + the old `<class>.class` reflection both failed).
// try/catch-hedged. Durable fallback: iridescent_durability_clamp coremod mixin.
// =============================================================================

ItemEvents.modification(event => {
  const TARGET_DURABILITY = 2500
  const WEAPONS = [
    'nyxium_greatsword',
    'exodium_sword',
    'exodium_waraxe',
    'reverium_sword',
    'reverium_axe',
    'blasphemic_rapture',
    'davy_jones',
    'divine_intervention',
    'kamehameha',
    'olympus',
    'planet_buster',
    'unholy_lance',
  ]
  WEAPONS.forEach(id => {
    event.modify('terramity:' + id, item => {
      try { item.maxDamage = TARGET_DURABILITY }
      catch (e) { console.warn('[terramity_weapon_durability] ' + id + ': ' + e) }
    })
  })
})
