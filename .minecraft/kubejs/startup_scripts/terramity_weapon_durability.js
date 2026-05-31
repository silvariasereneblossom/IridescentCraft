// =============================================================================
// TERRAMITY WEAPON DURABILITY CLAMP
// Place in: kubejs/startup_scripts/terramity_weapon_durability.js
// =============================================================================
//
// 2026-05-19: Clamp 12 Terramity weapon durabilities to 2500.
// Native values are wildly above-tier:
//   - 5 ingot-family melee (nyxium_greatsword, exodium_sword, exodium_waraxe,
//     reverium_sword, reverium_axe):                       8124  (4x netherite)
//   - 6 audit guns (blasphemic_rapture, davy_jones, divine_intervention,
//     kamehameha, olympus, planet_buster):                 16256 (8x netherite)
//   - unholy_lance:                                        50000 (24x netherite)
// 2500 lands them ~1.2x netherite -- expensive-to-reforge T3/T4 loot rather
// than effectively unbreakable. Reforging cost scales with durability and the
// audit values made the reforging table cheaper than re-running the structure.
// See master-appendix.md sec M.10.
//
// 2026-05-31 FIX: switched from broken `<loadedClass>.class` reflection (which
// silently no-op'd in KubeJS 2001.6.5) to the KubeJS Item mixin setter
// `kjs$setMaxDamage(int)` via ItemEvents.modification. Same pattern as
// hulk_hammer_durability.js.
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
    event.modify('terramity:' + id, item => item.kjs$setMaxDamage(TARGET_DURABILITY))
  })
})
