// =============================================================================
// DIAGNOSTIC -- log player Y-velocity spikes that bypass LivingKnockBackEvent
// =============================================================================
// 2026-04-25: cap_player_knockback successfully clamped ratio mag=2.43 -> 1.0
// in the latest log, but the tester still reports skyward launches. Vanilla
// LivingEntity.knockback() normalizes the (xRatio, zRatio) input before
// applying impulse, so big ratios alone shouldn't cause launches once
// LivingKnockBackEvent fires. The skyward force must be coming from a path
// that bypasses LivingKnockBackEvent entirely -- a mod (Apotheosis affix,
// Better Combat, etc.) directly setting deltaMovement on the player.
//
// Strategy: subscribe to LivingHurtEvent on the player, sample
// player.getDeltaMovement() before AND right after, log the delta.
// Anything with a Y-velocity spike of |dy| > 0.5 (vanilla knockback caps Y
// at 0.4) flags as suspicious. Per-attacker-type one-shot to avoid spam.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try).
// =============================================================================

try {
  var MinecraftForge_dpv = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingHurtEvent_dpv = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_dpv = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_dpv = Java.loadClass('java.util.function.Consumer')
  var Player_dpv = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Stash the player's Y-velocity before-state, sampled at HIGHEST priority
  // (runs first). Then a LOWEST-priority handler reads after-state and
  // logs the delta. Same idiom as dropdiag.
  var preHandler = new Consumer_dpv({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_dpv)) return
        var d = v.getDeltaMovement()
        v.getPersistentData().putDouble('_pre_dx', d.x)
        v.getPersistentData().putDouble('_pre_dy', d.y)
        v.getPersistentData().putDouble('_pre_dz', d.z)
      } catch (_) {}
    }
  })

  var postHandler = new Consumer_dpv({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_dpv)) return
        var d = v.getDeltaMovement()
        var pd = v.getPersistentData()
        var preDy = pd.contains('_pre_dy') ? pd.getDouble('_pre_dy') : 0.0
        var ddy = d.y - preDy
        // Vanilla cap on ground = 0.4. We allow generous slack (>0.6) before
        // flagging since affix-injected knockback can legitimately spike.
        // The "skyward" launches reported are probably >> 1.0.
        if (Math.abs(ddy) <= 0.6) return

        var src = null
        try { src = event.getSource() } catch (e) {}
        var atk = null
        try { atk = src ? src.getEntity() : null } catch (e) {}
        var atkType = atk ? String(atk.getType().toString()) : 'unknown'
        var srcMsg = 'no-src'
        try {
          if (src) {
            srcMsg = String(src.m_19385_ ? src.m_19385_() : src.type || src.msgId || 'unknown')
          }
        } catch (_) {}

        if (!global._velo_seen) global._velo_seen = {}
        var key = atkType + '/' + srcMsg
        if (!global._velo_seen[key]) {
          global._velo_seen[key] = true
          console.warn('[velo_spike] player Y-vel spike dy=' + ddy.toFixed(3) +
                       ' (pre=' + preDy.toFixed(3) + ' post=' + d.y.toFixed(3) +
                       ') from attacker=' + atkType + ' source=' + srcMsg)
        }
      } catch (_) {}
    }
  })

  MinecraftForge_dpv.EVENT_BUS.addListener(EventPriority_dpv.HIGHEST, false,
                                           LivingHurtEvent_dpv, preHandler)
  MinecraftForge_dpv.EVENT_BUS.addListener(EventPriority_dpv.LOWEST, false,
                                           LivingHurtEvent_dpv, postHandler)

  console.log('[IridescentCraft] diag_player_velocity loaded (Y-vel spike detector on LivingHurtEvent)')
} catch (e) {
  console.warn('[IridescentCraft] diag_player_velocity bootstrap FAILED: ' + e)
}
