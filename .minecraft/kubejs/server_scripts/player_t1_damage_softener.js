// =============================================================================
// T1 PLAYER DAMAGE SOFTENER -- 15% incoming damage reduction at tier_1 only
// =============================================================================
// 2026-04-26 origin: "I get 1-2 shot with WoI/Faefolk/Archmage at T1. Aim for
// 2-3 shot early." Compounding -HP origins (Witch of Ink frail + Faefolk
// fragile + Archmage glass cannon) leave the player at ~10-13 HP.
//
// 2026-06-13 RETUNE 30% -> 15% (operator: "T1 early *should* be punishing for
// mage starts"). The same-day +30% per-tier incoming-damage bump
// (iridescent_difficulty damageMultiplierPct=130) now carries the "punishing
// T1" intent that the softener was inverting. Mages are back-loaded glass
// cannons by design (feedback_mage_power_curve) -- early fragility is the
// price of the uncapped late ceiling, NOT a bug to pad. The softener is kept
// only as a THIN anti-true-1-shot margin for the ~10 HP origin stacks, not as
// a comfort cushion. Net early-T1 incoming for a glass mage:
//   1.5 (curve) x 1.30 (dmg bump) x 0.85 (this) ~= 1.66x vanilla -> ~3 shot.
// (Was 1.37x/~3-4 shot at 0.70; removing entirely would be 1.95x/~2-3 shot.)
//
// Levers in play:
//   1. ImprovedMobs Equipment Chance 0.30 -> 0.15 (fewer gear-stacked mobs)
//   2. THIS SCRIPT: -15% incoming damage while player has tier_1 stage AND
//      NOT tier_2 stage (haven't left the overworld). Once they reach a T2
//      dim the softener stops -- they're expected to have better gear.
//
// Implementation: DamageModifierRegistry (Forge LivingHurtEvent setAmount).
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var SOFTENER_MULTIPLIER = 0.85  // 15% damage reduction (was 0.70; retuned 2026-06-13)
  // 2026-05-15: migrated to DamageModifierRegistry. EntityEvents.hurt's
  // KubeJS wrapper has no settable damage; the raw Forge LivingHurtEvent
  // dispatched through DR has setAmount.
  var DR_t1soft = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_t1soft = Java.loadClass('net.minecraft.world.entity.player.Player')

  DR_t1soft.register('icraft.t1_softener', function(event) {
    try {
      var entity = event.entity
      if (!(entity instanceof PlayerClass_t1soft)) return

      // Soften only if tier_1 active AND tier_2 NOT active.
      var hasT1 = false, hasT2 = false
      try { hasT1 = AStages.playerHasStage('tier_1', entity) } catch (_) {}
      try { hasT2 = AStages.playerHasStage('tier_2', entity) } catch (_) {}
      if (!hasT1 || hasT2) return

      var orig = event.amount
      event.amount = orig * SOFTENER_MULTIPLIER

      if (!global._t1_softener_seen) global._t1_softener_seen = {}
      var src = null
      try { src = event.source } catch (_) {}
      var atk = null
      try { atk = src ? src.getEntity() : null } catch (_) {}
      var atkType = atk ? String(atk.getType().toString()) : 'unknown'
      if (!global._t1_softener_seen[atkType]) {
        global._t1_softener_seen[atkType] = true
        console.log('[t1_softener] reduced ' + orig.toFixed(2) + ' -> ' +
                    event.amount.toFixed(2) + ' from ' + atkType +
                    ' for ' + entity.username)
      }
    } catch (_) {}
  })

  console.log('[IridescentCraft] player_t1_damage_softener loaded (-15% incoming damage at tier_1 only)')
} catch (e) {
  console.warn('[IridescentCraft] player_t1_damage_softener bootstrap FAILED: ' + e)
}
