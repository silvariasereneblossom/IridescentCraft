// =============================================================================
// SIMPLY SWORDS UNIQUES — Spellsword damage scaling
// =============================================================================
// Pushes Simply Swords drop-only unique weapons toward spellsword/Battlemage
// builds: every melee hit with a held SS unique adds bonus AD scaled by the
// player's bonus spell power.
//
//   Formula: +0.5 AD per 50% bonus spell power (== +1 AD per 100% bonus SP).
//   Half the rate of Battlemage's Arcane Cleave (which gives +1/50% but
//   costs 10 mana per swing). This one is FREE — small permanent buff for
//   any wielder, regardless of class.
//
// Why on every wielder, not just Battlemage:
//   - SS uniques are all magic-themed (emberblade fire / frostfall ice /
//     soulrender necro / arcanethyst arcane / etc.)
//   - User intent: "push them harder toward Battlemage builds" — this is
//     an INCENTIVE (small bonus rewards mages who melee) not a gate.
//   - Battlemage class stays distinctive via Arcane Cleave (higher rate,
//     mana cost, kill-restore loop).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks),
//         feedback_kubejs_event_scope.md (EntityEvents.hurt is server-scope).
// =============================================================================

const SS_UNIQUE_AD_PER_HALF_SP = 1.0  // +0.5 AD per 50% bonus SP == +1 AD per 100%

// Elemental SS uniques only — weapons whose theme is an explicit element
// (fire/ice/lightning/wind/nature/light/shadow/arcane/poison). Pure-physical
// or unclear-theme uniques (enigma, harbinger, ribboncleaver, livyatan,
// waxweaver, watching_warglaive, watcher_claymore, wickpiercer,
// sword_on_a_stick, dormant_relic) are NOT in this set — they're
// physical/utility weapons that shouldn't scale with spell power.
const SS_UNIQUES = new Set([
  // Fire (7)
  'simplyswords:emberblade', 'simplyswords:emberlash', 'simplyswords:sunfire',
  'simplyswords:flamewind', 'simplyswords:molten_edge', 'simplyswords:brimstone_claymore',
  'simplyswords:hearthflame',
  // Ice (2)
  'simplyswords:frostfall', 'simplyswords:icewhisper',
  // Lightning / Thunder (4)
  'simplyswords:stormbringer', 'simplyswords:thunderbrand', 'simplyswords:mjolnir',
  'simplyswords:storms_edge',
  // Wind (2)
  'simplyswords:tempest', 'simplyswords:whisperwind',
  // Nature / Earth (2)
  'simplyswords:bramblethorn', 'simplyswords:hiveheart',
  // Light / Cosmic (2)
  'simplyswords:caelestis', 'simplyswords:stars_edge',
  // Shadow / Necro (9)
  'simplyswords:shadowsting', 'simplyswords:soulrender', 'simplyswords:soulpyre',
  'simplyswords:soulkeeper', 'simplyswords:soulstealer', 'simplyswords:waking_lichblade',
  'simplyswords:awakened_lichblade', 'simplyswords:slumbering_lichblade',
  'simplyswords:twisted_blade',
  // Arcane (4)
  'simplyswords:magiblade', 'simplyswords:magiscythe', 'simplyswords:magispear',
  'simplyswords:arcanethyst',
  // Poison (1)
  'simplyswords:toxic_longsword'
])

try {
  // ─── Bonus spell power (subtract 1.0 base; ISS reports total multiplier) ──
  var getBonusSpellPower = function(player) {
    try {
      var total = player.getAttributeValue('irons_spellbooks:spell_power')
      return Math.max(0, total - 1.0)
    } catch (e) { return 0 }
  }

  EntityEvents.hurt(function(event) {
    try {
      if (!event.source || !event.source.player) return
      var player = event.source.player

      // Held weapon must be an SS unique
      var stack = player.mainHandItem
      if (!stack || stack.isEmpty()) return
      var id = String(stack.id || '')
      if (!SS_UNIQUES.has(id)) return

      // Melee-only (skip projectile sources)
      var srcType = ''
      try { srcType = String(event.source.type || '') } catch (e) {}
      var isProjectile = srcType.indexOf('arrow') >= 0 ||
                         srcType.indexOf('trident') >= 0 ||
                         srcType.indexOf('thrown') >= 0 ||
                         srcType.indexOf('fireball') >= 0
      if (isProjectile) return

      var bonusSP = getBonusSpellPower(player)
      // bonusSP is the BONUS portion (0.5 = +50% spell power).
      // 0.5 AD per 50% SP == bonusSP * 1.0 raw AD bonus.
      var bonusAD = bonusSP * SS_UNIQUE_AD_PER_HALF_SP
      if (bonusAD <= 0) return

      event.damage = event.damage + bonusAD
    } catch (e) {
      console.warn('[ss_unique_spellsword_scaling] hurt handler threw: ' + e)
    }
  })

  console.log('[ss_unique_spellsword_scaling] loaded — ' + SS_UNIQUES.size +
              ' uniques scale with spell power')
} catch (e) {
  console.error('[ss_unique_spellsword_scaling] init failed: ' + e)
}
