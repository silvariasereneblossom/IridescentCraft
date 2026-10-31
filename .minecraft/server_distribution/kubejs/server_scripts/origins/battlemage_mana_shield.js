// =============================================================================
// BATTLEMAGE — Mana Shield (Magic-Scaling Damage Reduction)
// =============================================================================
// Passive damage reduction that scales with magic damage bonuses.
// Implemented as periodic Resistance effect whose level scales with magic.
//
// Base: Resistance I (20% reduction) — always active for Battlemages
// With Elf (+5% magic):    still Resistance I
// With Faefolk (+30% magic): Resistance II (36% reduction)
// With Faefolk + affixes:  Resistance III (48% reduction) — hard cap
//
// Negate chance from the description is flavor — the actual mechanic is
// continuous damage reduction, which is more reliable and less RNG-dependent.
//
// Class / race come from global.icraft.origin (0_lib_origins.js). The old
// `execute if entity <name>[nbt=...]` probes never parsed, so this never ran
// before 2026-10. Wrapped in an IIFE: `isBattlemage` used to be a top-level
// name shared (and overwritten) with battlemage_arcane_cleave.js.
// =============================================================================

;(function () {
  var originIs = function (player, layer, id) {
    try { return global.icraft.origin.is(player, layer, id) } catch (e) { return false }
  }

  var warned = false

  // Calculate magic bonus from known race sources
  var getMagicBonus = function (player) {
    var bonus = 0.15  // Battlemage base (arcane_strikes)
    if (originIs(player, 'race', 'icraft:faefolk')) bonus += 0.30
    if (originIs(player, 'race', 'icraft:elf')) bonus += 0.05
    return bonus
  }

  // Apply Mana Shield as Resistance effect every 5 seconds
  global.tick_battlemageManaShield = function (event) {
    event.server.players.forEach(function (player) {
      try {
        if (!originIs(player, 'class', 'icraft:battlemage')) return

        var magicBonus = getMagicBonus(player)

        var resistLevel = 0
        if (magicBonus >= 0.55) {
          resistLevel = 2
        } else if (magicBonus >= 0.35) {
          resistLevel = 1
        }

        // 7 s, no particles (what `effect give <name> resistance 7 <lvl> true` built)
        player.potionEffects.add('minecraft:resistance', 140, resistLevel, false, false)
      } catch (e) {
        if (!warned) {
          warned = true
          console.warn('[battlemage_mana_shield] tick threw (logged once): ' + e)
        }
      }
    })
  }
  // offset 63 since 2026-10-30: sixteen functions shared offset 0 and ran in one tick (RAM audit F17)
  global.registerServerTick('tick_battlemageManaShield', 100, 63)

  console.log('[IridescentCraft] Battlemage Mana Shield loaded')
  console.log('  - Resistance I base (20% damage reduction)')
  console.log('  - Resistance II with high magic bonus (36% reduction)')
  console.log('  - Resistance III cap with very high magic bonus (48% reduction)')
})()
