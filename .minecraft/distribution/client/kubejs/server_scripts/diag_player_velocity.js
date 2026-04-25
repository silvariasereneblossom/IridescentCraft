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
// 2026-04-25 hotfix: previous version used Vec3 FIELD access (d.y) which
// Rhino can't coerce to primitive double cleanly -- NPE in
// FieldAndMethods.getDefaultValue, swallowed try/catch DOESN'T catch
// because the failure is in the Java->JS bridge BEFORE the function body.
// Result: every player damage event crashed -> Neruina kicked the player.
// Switched to Vec3.y() METHOD form (record-style accessor in 1.20.1).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try).
// =============================================================================

try {
  var MinecraftForge_dpv = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingHurtEvent_dpv = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_dpv = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_dpv = Java.loadClass('java.util.function.Consumer')
  var Player_dpv = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Helper: read Vec3 component via method form (safe in Rhino).
  var vy = function(vec3) {
    try { return vec3.y() } catch (_) {}
    // Fallback to field via String coercion (avoids the field/method NPE bug)
    try { return parseFloat(String(vec3.y)) } catch (_) {}
    return 0.0
  }

  var preHandler = new Consumer_dpv({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_dpv)) return
        var d = v.getDeltaMovement()
        v.getPersistentData().putDouble('_pre_dy', vy(d))
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
        var postDy = vy(d)
        var ddy = postDy - preDy
        // Vanilla cap on ground = 0.4. Allow generous slack (>0.6) before
        // flagging since affix-injected knockback can legitimately spike.
        if (Math.abs(ddy) <= 0.6) return

        var src = null
        try { src = event.getSource() } catch (e) {}
        var atk = null
        try { atk = src ? src.getEntity() : null } catch (e) {}
        var atkType = atk ? String(atk.getType().toString()) : 'unknown'

        if (!global._velo_seen) global._velo_seen = {}
        var key = atkType
        if (!global._velo_seen[key]) {
          global._velo_seen[key] = true
          console.warn('[velo_spike] player Y-vel spike dy=' + ddy.toFixed(3) +
                       ' (pre=' + preDy.toFixed(3) + ' post=' + postDy.toFixed(3) +
                       ') from attacker=' + atkType)
        }
      } catch (_) {}
    }
  })

  MinecraftForge_dpv.EVENT_BUS.addListener(EventPriority_dpv.HIGHEST, false,
                                           LivingHurtEvent_dpv, preHandler)
  MinecraftForge_dpv.EVENT_BUS.addListener(EventPriority_dpv.LOWEST, false,
                                           LivingHurtEvent_dpv, postHandler)

  console.log('[IridescentCraft] diag_player_velocity loaded (Y-vel spike detector via Vec3.y() method form)')
} catch (e) {
  console.warn('[IridescentCraft] diag_player_velocity bootstrap FAILED: ' + e)
}
