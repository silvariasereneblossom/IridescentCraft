// =============================================================================
// BATTLEMAGE — Arcane Cleave + Mana Reaver
// =============================================================================
// Two new Battlemage passives that turn the class into a true gish:
//
//   ARCANE CLEAVE: per 50% bonus spell power, +1 melee attack damage.
//                  Each melee hit consumes 10 mana. Bonus only applies
//                  when the player has >= 10 mana available; otherwise
//                  the swing lands as normal melee with no cost or bonus.
//
//   MANA REAVER:   melee kill restores 15 mana. Implements the design
//                  doc's "melee kills restore mana" line for Battlemage.
//                  Stacks with class-based mana_regen.
//
// Combined loop: Battlemage burns mana to deal scaled magical-melee damage,
// recovers it on kills. Sustained-fight viable; multi-mob trash-clear
// rewards the kit.
//
// ISS mana access via Java reflection (same pattern as
// kubejs/server_scripts/attributes/mana_pool_bonuses.js).
//
// Class detection: global.icraft.origin (0_lib_origins.js) -- a cached lookup,
// so the per-hit handler runs no commands. Before 2026-10 this file never did
// anything: the `execute if entity <name>[nbt=...]` class probe did not parse,
// `event.source.entity` is not a script-visible member of DamageSource (KubeJS
// renames getEntity() to getActual()), and `event.source.type` is vanilla's
// type() METHOD (the damage-type id string is getType()).
//
// Whole file is one IIFE (body left at column 0 to keep the diff readable):
// `isBattlemage` / `getBonusSpellPower` used to leak into the shared script
// scope and collide with battlemage_mana_shield.js /
// ss_unique_spellsword_scaling.js.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

;(function () {
const ARCANE_CLEAVE_MANA_COST   = 10
const ARCANE_CLEAVE_AD_PER_HALF = 2.0  // +1 AD per 50% bonus spell power == +2 AD per 100%
const MANA_REAVER_RESTORE       = 15

try {
  // ─── ISS reflection setup ────────────────────────────────────────────
  // Resolved once at script load so each EntityEvents.hurt fires don't
  // pay reflection lookup cost. Wrapped in try/catch so script load
  // doesn't fail if ISS isn't present (no-op handler in that case).
  var MagicData_iss = null
  try {
    MagicData_iss = Java.loadClass('io.redspace.ironsspellbooks.api.magic.MagicData')
  } catch (e) {
    console.warn('[battlemage_arcane_cleave] ISS MagicData class not loadable: ' + e + ' — handler is a no-op')
  }

  var getPlayerMana = function(player) {
    if (!MagicData_iss) return 0
    try {
      var data = MagicData_iss.getPlayerMagicData(player)
      if (!data) return 0
      return data.getMana()
    } catch (e) { return 0 }
  }

  var addPlayerMana = function(player, amount) {
    if (!MagicData_iss) return
    try {
      var data = MagicData_iss.getPlayerMagicData(player)
      if (!data) return
      data.addMana(amount)
    } catch (e) {}
  }

  // ─── Battlemage class check (cached resolver, no command) ────────────
  var isBattlemage = function(player) {
    try {
      return global.icraft.origin.is(player, 'class', 'icraft:battlemage')
    } catch (e) { return false }
  }

  // ─── DamageSource accessors (KubeJS script names) ────────────────────
  // getEntity()  -> getActual()   (`source.entity` is undefined)
  // getMsgId()   -> getType()     (`source.type` is vanilla's type() method)
  var attackerOf = function(source) {
    if (!source) return null
    var a = source.actual
    if (a === undefined) a = source.entity
    return a || null
  }
  var msgIdOf = function(source) {
    try { return String(source.getType()) } catch (e) { return '' }
  }

  var warned = {}
  var warnOnce = function(where, e) {
    if (warned[where]) return
    warned[where] = true
    console.warn('[battlemage_arcane_cleave] ' + where + ' threw (logged once): ' + e)
  }

  // Cosmetic only. Direct particle send (no command parse per hit); switched
  // off for the session the first time it fails.
  var particlesOk = true
  var puff = function(entity, particle, dy, spread, count, speed) {
    if (!particlesOk) return
    try {
      entity.level.spawnParticles(particle, false,
        entity.x, entity.y + dy, entity.z, spread, spread, spread, count, speed)
    } catch (e) {
      particlesOk = false
    }
  }

  // ─── Bonus spell power (above base 1.0) ──────────────────────────────
  var getBonusSpellPower = function(player) {
    try {
      var total = player.getAttributeValue('irons_spellbooks:spell_power')
      return Math.max(0, total - 1.0)
    } catch (e) { return 0 }
  }

  // ─── ARCANE CLEAVE: deal-damage hook (DamageModifierRegistry) ─────────
  var DR_bc = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_bc = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR_bc.register('icraft.battlemage_arcane_cleave', function(event) {
    try {
      // Secondary damage (splash / chain / reflect dealt through icraft.core.dealDamage)
      // lands as-is: it must not proc or be multiplied a second time. Same rule the
      // shared dispatcher applies to every onHurt handler (0_lib_core.js, RE-ENTRANCY).
      if (global.icraft && global.icraft.core && global.icraft.core.secondary && global.icraft.core.secondary(event.entity)) return
      var source = event.source
      var player = attackerOf(source)
      if (!(player instanceof PlayerClass_bc)) return
      var target = event.entity
      if (!target) return
      if (target instanceof PlayerClass_bc) return  // skip PvP

      // Class first: one cached lookup, and every non-Battlemage is done here.
      if (!isBattlemage(player)) return

      var srcType = msgIdOf(source)
      var isProjectile = srcType.indexOf('arrow') >= 0 ||
                         srcType.indexOf('trident') >= 0 ||
                         srcType.indexOf('thrown') >= 0 ||
                         srcType.indexOf('fireball') >= 0
      var isMelee = !isProjectile && (
        srcType === 'player' || srcType === 'mob' || srcType === 'generic'
      )
      if (!isMelee) return

      var mana = getPlayerMana(player)
      if (mana < ARCANE_CLEAVE_MANA_COST) return

      var bonusSP = getBonusSpellPower(player)
      var bonusAD = bonusSP * ARCANE_CLEAVE_AD_PER_HALF
      if (bonusAD <= 0) return

      addPlayerMana(player, -ARCANE_CLEAVE_MANA_COST)
      event.amount = event.amount + bonusAD

      // Subtle visual: a few enchantment particles on the target
      puff(target, 'minecraft:enchant', 1.0, 0.3, 6, 0.5)
    } catch (e) {
      warnOnce('hurt handler', e)
    }
  })

  // ─── MANA REAVER: kill hook ──────────────────────────────────────────
  EntityEvents.death(function(event) {
    try {
      var src = event.source
      if (!src || !src.player) return
      var player = src.player
      var target = event.entity
      if (!target || target.player) return

      if (!isBattlemage(player)) return

      addPlayerMana(player, MANA_REAVER_RESTORE)

      // Visual: instant flash of soul-fire particles on the player
      puff(player, 'minecraft:soul_fire_flame', 1.2, 0.3, 8, 0.05)
    } catch (e) {
      warnOnce('death handler', e)
    }
  })

  console.log('[IridescentCraft] battlemage_arcane_cleave loaded — Arcane Cleave (' +
    ARCANE_CLEAVE_AD_PER_HALF + ' AD per 100% bonus SP, costs ' +
    ARCANE_CLEAVE_MANA_COST + ' mana/hit) + Mana Reaver (+' +
    MANA_REAVER_RESTORE + ' mana/melee kill)')
} catch (e) {
  console.warn('[IridescentCraft] battlemage_arcane_cleave bootstrap FAILED: ' + e)
}
})()
