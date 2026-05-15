// =============================================================================
// T1 PLAYER DAMAGE SOFTENER -- 30% incoming damage reduction at tier_1 only
// =============================================================================
// 2026-04-26 user directive: "I get 1-2 shot with WoI/Faefolk/Archmage at T1.
// Aim for 2-3 shot early." Compounding -HP origins (Witch of Ink frail +
// Faefolk fragile + Archmage glass cannon) leave the player at ~10-13 HP.
// A geared overworld zombie or affixed skeleton can output 5-8 dmg per
// hit, which 1-2 shots that pool.
//
// Levers in play:
//   1. ImprovedMobs Equipment Chance reduced 0.30 -> 0.15 (fewer gear-stacked mobs)
//   2. THIS SCRIPT: -30% incoming damage while player has tier_1 stage AND
//      NOT tier_2 stage (i.e. they haven't progressed past the overworld yet).
//      Once they reach Twilight Forest / Aether / Blue Skies (T2 dims), the
//      softener stops applying -- they're expected to have better gear.
//
// Cap reasoning: 30% reduction means a 7-dmg hit becomes ~5, turning a 2-shot
// into a 3-shot. Doesn't trivialize T1 (still meaningful threat), just gives
// breathing room for low-HP mage starts.
//
// Implementation: EntityEvents.hurt at NORMAL priority. Check if entity is
// player + tier_1 stage + NOT tier_2. If so, multiply event.damage by 0.7.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var SOFTENER_MULTIPLIER = 0.7  // 30% damage reduction
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

  console.log('[IridescentCraft] player_t1_damage_softener loaded (-30% incoming damage at tier_1 only)')
} catch (e) {
  console.warn('[IridescentCraft] player_t1_damage_softener bootstrap FAILED: ' + e)
}
