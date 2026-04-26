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

  // 2026-04-26: Promoted from logger to active clamper. EnemyExpansion uses
  // Entity.setDeltaMovement() directly (bypasses LivingKnockBackEvent), so
  // cap_player_knockback.js can't see those launches. This handler caps the
  // player's post-hit Y-velocity to vanilla max (pre + 0.4) when a procedure
  // (Vampire, ExplosiveLaunch, etc.) bumped it past safety threshold (0.8).
  // X/Z velocity left alone -- vanilla knockback() normalizes ratios so
  // horizontal launches go through the normal path our other handler caps.
  var SKYWARD_THRESHOLD = 0.8   // delta from pre to post that triggers clamp
  var VANILLA_GROUND_Y_CAP = 0.4 // post = pre + this is the vanilla maximum

  var setDelta = function(entity, x, y, z) {
    // Need a Vec3 instance. Java.loadClass returns class wrapper; instantiate
    // via reflection-friendly path: Vec3 is a public constructor.
    try {
      var Vec3 = Java.loadClass('net.minecraft.world.phys.Vec3')
      entity.setDeltaMovement(new Vec3(x, y, z))
      return true
    } catch (_) { return false }
  }

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

        var src = null
        try { src = event.getSource() } catch (e) {}
        var atk = null
        try { atk = src ? src.getEntity() : null } catch (e) {}
        var atkType = atk ? String(atk.getType().toString()) : 'unknown'

        // Active clamp: only for SKYWARD (positive Y) spikes that exceed
        // the vanilla ground cap by a generous margin. Leaves negative Y
        // (falling) alone -- gravity is fine.
        if (ddy > SKYWARD_THRESHOLD) {
          // Read x/z via field access (need primitive doubles for Vec3 ctor)
          var dx = 0.0, dz = 0.0
          try { dx = d.x() } catch (_) {}
          try { dz = d.z() } catch (_) {}
          var newY = preDy + VANILLA_GROUND_Y_CAP
          if (setDelta(v, dx, newY, dz)) {
            if (!global._velo_clamp_seen) global._velo_clamp_seen = {}
            if (!global._velo_clamp_seen[atkType]) {
              global._velo_clamp_seen[atkType] = true
              console.log('[velo_clamp] CLAMPED player Y-vel: pre=' + preDy.toFixed(3) +
                          ' post=' + postDy.toFixed(3) + ' (delta=' + ddy.toFixed(3) +
                          ') -> ' + newY.toFixed(3) + ' from attacker=' + atkType)
            }
          }
        } else if (Math.abs(ddy) > 0.6) {
          // Below clamp threshold but above logging threshold -- diag only
          if (!global._velo_seen) global._velo_seen = {}
          if (!global._velo_seen[atkType]) {
            global._velo_seen[atkType] = true
            console.warn('[velo_spike] player Y-vel spike dy=' + ddy.toFixed(3) +
                         ' (pre=' + preDy.toFixed(3) + ' post=' + postDy.toFixed(3) +
                         ') from attacker=' + atkType + ' (under clamp threshold)')
          }
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
