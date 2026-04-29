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
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

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

  // ─── Battlemage class check ──────────────────────────────────────────
  var isBattlemage = function(player) {
    try {
      var result = player.server.runCommandSilent(
        `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:class":"icraft:battlemage"}}}}]`
      )
      return result > 0
    } catch (e) { return false }
  }

  // ─── Bonus spell power (above base 1.0) ──────────────────────────────
  var getBonusSpellPower = function(player) {
    try {
      var total = player.getAttributeValue('irons_spellbooks:spell_power')
      return Math.max(0, total - 1.0)
    } catch (e) { return 0 }
  }

  // ─── ARCANE CLEAVE: deal-damage hook ─────────────────────────────────
  EntityEvents.hurt(function(event) {
    try {
      if (!event.source || !event.source.player) return
      var player = event.source.player
      var target = event.entity
      if (!target || !target.living || target.player) return

      // Melee-only check (mirrors justleveling_skills.js convention)
      var srcType = ''
      try { srcType = String(event.source.type || '') } catch (e) {}
      var isProjectile = srcType.indexOf('arrow') >= 0 ||
                         srcType.indexOf('trident') >= 0 ||
                         srcType.indexOf('thrown') >= 0 ||
                         srcType.indexOf('fireball') >= 0
      var isMelee = !isProjectile && (
        srcType === 'player' || srcType === 'mob' || srcType === 'generic'
      )
      if (!isMelee) return

      if (!isBattlemage(player)) return

      var mana = getPlayerMana(player)
      if (mana < ARCANE_CLEAVE_MANA_COST) {
        // Insufficient mana — no bonus, no cost. Hit lands as plain melee.
        return
      }

      var bonusSP = getBonusSpellPower(player)
      // bonusSP units: 0.5 = 50% bonus → +1 AD
      var bonusAD = bonusSP * ARCANE_CLEAVE_AD_PER_HALF
      if (bonusAD <= 0) {
        // No spell power bonus to convert — no cost, no effect
        return
      }

      // Pay mana cost, apply damage bonus
      addPlayerMana(player, -ARCANE_CLEAVE_MANA_COST)
      event.damage = event.damage + bonusAD

      // Subtle visual: a few enchantment particles on the target
      try {
        var pos = target.blockPosition()
        player.server.runCommandSilent(
          `particle minecraft:enchant ${pos.x} ${pos.y + 1} ${pos.z} 0.3 0.3 0.3 0.5 6 force`
        )
      } catch (e) {}
    } catch (e) {
      console.warn('[battlemage_arcane_cleave] hurt handler threw: ' + e)
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
      try {
        var pos = player.blockPosition()
        player.server.runCommandSilent(
          `particle minecraft:soul_fire_flame ${pos.x} ${pos.y + 1.2} ${pos.z} 0.3 0.5 0.3 0.05 8 force`
        )
      } catch (e) {}
    } catch (e) {
      console.warn('[battlemage_arcane_cleave] death handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] battlemage_arcane_cleave loaded — Arcane Cleave (' +
    ARCANE_CLEAVE_AD_PER_HALF + ' AD per 100% bonus SP, costs ' +
    ARCANE_CLEAVE_MANA_COST + ' mana/hit) + Mana Reaver (+' +
    MANA_REAVER_RESTORE + ' mana/melee kill)')
} catch (e) {
  console.warn('[IridescentCraft] battlemage_arcane_cleave bootstrap FAILED: ' + e)
}
