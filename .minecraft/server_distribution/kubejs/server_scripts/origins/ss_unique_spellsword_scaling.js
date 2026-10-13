// =============================================================================
// SIMPLY SWORDS ELEMENTAL UNIQUES — Spell-power utility for non-casters
// =============================================================================
// Design intent: non-casters who happen to have spell power (from gear, an
// origin perk, an artifact, etc.) get *some* return on it when wielding an
// elemental SS unique. Without this, spell power is dead stat for any class
// that doesn't cast — a warrior who finds a wizard helmet has no reason to
// keep wearing it. With this, that warrior gets a small AD bump on their
// elemental SS sword for every 50% bonus SP they accrue.
//
//   Formula: +0.5 AD per 50% bonus spell power (== +1 AD per 100% bonus SP).
//   Free, no mana cost. Half the rate of Battlemage's Arcane Cleave (which
//   gives +1/50% but costs 10 mana per swing) — so Battlemage stays
//   distinctive as the dedicated spellsword class.
//
// Scope: only ELEMENTAL uniques (fire/ice/lightning/wind/nature/light/
// shadow/arcane/poison themes). Pure-physical or unclear-theme uniques
// don't scale — their damage shouldn't draw from a magical stat thematically.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks),
//         feedback_kubejs_event_scope.md (EntityEvents.hurt is server-scope).
//
// Whole file is one IIFE (body left at column 0 to keep the diff readable):
// `getBonusSpellPower` used to leak into the shared script scope, where this
// copy replaced the one in battlemage_arcane_cleave.js.
//
// 2026-10-10: the bonus had never applied -- the handler read
// `event.source.entity`, which scripts do not have (0_lib_core.js header), and
// its projectile test stringified `source.type` (a function object).
// =============================================================================

;(function () {
const SS_UNIQUE_AD_PER_HALF_SP = 1.0  // +0.5 AD per 50% bonus SP == +1 AD per 100%

// Elemental SS uniques only — weapons whose theme is an explicit element
// (fire/ice/lightning/wind/nature/light/shadow/arcane/poison). Pure-physical
// or unclear-theme uniques (enigma, harbinger, ribboncleaver, livyatan,
// waxweaver, watching_warglaive, watcher_claymore, wickpiercer,
// sword_on_a_stick, dormant_relic) are NOT in this set — they're
// physical/utility weapons that shouldn't scale with spell power.
const SS_UNIQUES = global.icraft.core.idSet([
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

  // 2026-05-15: migrated to DamageModifierRegistry.
  var core = global.icraft && global.icraft.core
  if (!core) throw new Error('0_lib_core.js did not load')
  core.onHurt('icraft.ss_unique_spellsword', function(event, ctx) {
    var source = ctx.source
    var player = ctx.attacker

    var stack = player.mainHandItem
    if (!stack || stack.isEmpty()) return
    if (!SS_UNIQUES.has(String(stack.id))) return

    // Melee-only (skip projectile sources)
    var srcType = core.dmgKey(source)
    if (srcType.indexOf('arrow') >= 0 || srcType.indexOf('trident') >= 0 ||
        srcType.indexOf('thrown') >= 0 || srcType.indexOf('fireball') >= 0) return

    var bonusAD = core.finite(getBonusSpellPower(player) * SS_UNIQUE_AD_PER_HALF_SP, 0)
    if (bonusAD <= 0) return

    event.amount = event.amount + bonusAD
  }, 'attackerPlayer')

  console.log('[ss_unique_spellsword_scaling] loaded — ' + SS_UNIQUES.count() +
              ' uniques scale with spell power')
} catch (e) {
  console.error('[ss_unique_spellsword_scaling] init failed: ' + e)
}
})()
