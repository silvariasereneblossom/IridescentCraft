// =============================================================================
// DIAGNOSTIC -- catch player skyward launches that bypass our existing handlers
// =============================================================================
// 2026-05-03 forensic step. Two existing layers:
//
//   cap_player_knockback.js  -- caps strength + ratio on LivingKnockBackEvent
//   diag_player_velocity.js  -- clamps post-hurt Y-velocity DELTA on
//                               LivingHurtEvent (catches setDeltaMovement
//                               that fires synchronously inside the hurt
//                               handler, e.g. EnemyExpansion procedures)
//
// Tester reports launches still happening. Both layers must be bypassed.
// The remaining vector classes:
//
//   1. STATUS EFFECTS. Levitation (or a mod-custom equivalent) pushes the
//      player upward over multiple ticks via vanilla LivingEntity.travel(),
//      reading getEffect(LEVITATION) every tick. Never goes through
//      LivingKnockBackEvent. Each per-tick velocity delta is small (~0.05
//      per amplifier) so it never exceeds our 0.8 spike threshold either.
//      Apotheosis affixes / Champions modifiers / mod weapon-procs can
//      apply effects on hit.
//
//   2. DEFERRED VELOCITY. Some mods schedule velocity changes for a later
//      tick (after LivingHurtEvent has long fired and our diag captured
//      the pre-velocity baseline). diag_player_velocity only watches
//      pre/post within ONE event; deferred changes slip through.
//
//   3. CUSTOM EVENTS. A mod fires its own velocity-applying event that
//      isn't LivingKnockBackEvent or LivingHurtEvent.
//
// This script catches all three:
//   A. MobEffectEvent.Added handler -- logs every effect applied to a
//      player, with attribution to the most recent attacker (correlated
//      via persistentData within ATTACKER_CORRELATION_TICKS of the hurt
//      event). Dedupe by attacker|effect so long fights don't spam.
//
//   B. Per-tick Y-velocity scan -- walks every loaded player every 5
//      ticks, logs when deltaMovement.y exceeds a high threshold (1.0,
//      well above natural jumps which peak ~0.42). Snapshots the active
//      effect list at the moment of the spike. Per-player one-shot until
//      they touch ground again to suppress spam during a long flight arc.
//
// Both pure observation -- no mitigation. Once we know the source,
// follow-up commit adds the strip/clamp.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try
// blocks for closure capture).
// =============================================================================

try {
  var MinecraftForge_dpl = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var MobEffectEventAdded = Java.loadClass('net.minecraftforge.event.entity.living.MobEffectEvent$Added')
  var LivingHurtEvent_dpl = Java.loadClass('net.minecraftforge.event.entity.living.LivingHurtEvent')
  var EventPriority_dpl = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_dpl = Java.loadClass('java.util.function.Consumer')
  var Player_dpl = Java.loadClass('net.minecraft.world.entity.player.Player')

  // ── A: Recent-attacker correlation + MobEffectEvent.Added monitor ─────────
  // 10 ticks ~= 0.5s. Most weapon-on-hit effects apply synchronously inside
  // the damage path, so any effect added within this window of a damage
  // event is almost certainly attributable to the attacker.
  var ATTACKER_CORRELATION_TICKS = 10

  var hurtCorrelator = new Consumer_dpl({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_dpl)) return
        var src = event.getSource()
        var atk = src ? src.getEntity() : null
        if (atk) {
          var pd = v.getPersistentData()
          pd.putString('_dpl_atk', String(atk.getType().toString()))
          pd.putLong('_dpl_atk_tick', v.level().getGameTime())
        }
      } catch (_) {}
    }
  })

  var effectAddedHandler = new Consumer_dpl({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_dpl)) return
        var inst = event.getEffectInstance()
        if (!inst) return

        var effect = inst.getEffect()
        var effectId = 'unknown'
        try {
          // Forge MobEffect description id is typically `effect.minecraft.levitation`
          // or `effect.<modid>.<name>`. Strip the `effect.` prefix for readability.
          var raw = effect.getDescriptionId ? String(effect.getDescriptionId()) : String(effect)
          effectId = raw.indexOf('effect.') === 0 ? raw.substring(7) : raw
        } catch (_) {}

        var pd = v.getPersistentData()
        var atkType = 'no-recent-combat'
        var nowTick = v.level().getGameTime()
        if (pd.contains('_dpl_atk') && pd.contains('_dpl_atk_tick')) {
          var atkTick = pd.getLong('_dpl_atk_tick')
          if (nowTick - atkTick <= ATTACKER_CORRELATION_TICKS) {
            atkType = pd.getString('_dpl_atk')
          }
        }

        // Dedupe by (attacker, effect) so long fights don't flood the log.
        // Once per pairing per server session.
        if (!global._dpl_effect_seen) global._dpl_effect_seen = {}
        var key = atkType + '|' + effectId
        if (global._dpl_effect_seen[key]) return
        global._dpl_effect_seen[key] = true

        var dur = 0, amp = 0
        try { dur = inst.getDuration() } catch (_) {}
        try { amp = inst.getAmplifier() } catch (_) {}

        console.log('[player_effect] effect=' + effectId +
                    ' amp=' + amp +
                    ' dur=' + dur + 't' +
                    ' attacker=' + atkType)
      } catch (e) {
        // Use warn so a single broken Effect class doesn't take the
        // handler down silently
        try { console.warn('[player_effect] handler threw: ' + e) } catch (_) {}
      }
    }
  })

  // MONITOR priority -- run after every other handler, observe only.
  // false = don't receive cancelled events.
  MinecraftForge_dpl.EVENT_BUS.addListener(EventPriority_dpl.MONITOR, false,
                                           LivingHurtEvent_dpl, hurtCorrelator)
  MinecraftForge_dpl.EVENT_BUS.addListener(EventPriority_dpl.MONITOR, false,
                                           MobEffectEventAdded, effectAddedHandler)

  // ── B: Per-tick player Y-velocity spike detector ──────────────────────────
  // Threshold 1.0 is well above natural jumps (vanilla initial jump
  // velocity is ~0.42, sprint-jump ~0.50). Anything above 1.0 is either
  // a knockback we missed, a status-effect arc (Levitation amp 5+), or
  // an explicit mod-driven velocity push.
  //
  // One-shot per player per airborne arc -- once we log the spike we set
  // a flag in persistentData and don't re-log until they touch ground.
  // Avoids spamming for the entire duration of a flight.
  var Y_VEL_LOG_THRESHOLD = 1.0

  var vy_dpl = function(vec3) {
    try { return vec3.y() } catch (_) {}
    try { return parseFloat(String(vec3.y)) } catch (_) {}
    return 0.0
  }

  global.tick_dplYVelocityScan = function(event) {
    var server = event.server
    server.allLevels.forEach(function(level) {
      try {
        var players = level.players()
        var n = players.size()
        for (var i = 0; i < n; i++) {
          var p = players.get(i)
          try {
            var d = p.getDeltaMovement()
            var dy = vy_dpl(d)
            var pd = p.getPersistentData()
            var inAirSpike = pd.getBoolean('_dpl_yvel_logged')

            if (dy >= Y_VEL_LOG_THRESHOLD && !inAirSpike) {
              pd.putBoolean('_dpl_yvel_logged', true)

              // Snapshot active effects at moment of spike
              var effectList = []
              try {
                var activeIter = p.getActiveEffects().iterator()
                while (activeIter.hasNext()) {
                  var eff = activeIter.next()
                  var name = 'unknown'
                  try {
                    var raw = eff.getEffect().getDescriptionId
                              ? String(eff.getEffect().getDescriptionId())
                              : String(eff.getEffect())
                    name = raw.indexOf('effect.') === 0 ? raw.substring(7) : raw
                  } catch (_) {}
                  effectList.push(name + '(amp=' + eff.getAmplifier() + ')')
                }
              } catch (_) {}

              // Recent-attacker correlation (same window as effect monitor)
              var atkType = 'no-recent-combat'
              try {
                var nowTick = level.getGameTime()
                if (pd.contains('_dpl_atk') && pd.contains('_dpl_atk_tick')) {
                  var atkTick = pd.getLong('_dpl_atk_tick')
                  if (nowTick - atkTick <= 60) {  // 3s window for tick scan
                    atkType = pd.getString('_dpl_atk')
                  }
                }
              } catch (_) {}

              console.log('[yvel_spike] player=' + p.getName().getString() +
                          ' dy=' + dy.toFixed(3) +
                          ' onGround=' + p.onGround() +
                          ' attacker=' + atkType +
                          ' effects=[' + effectList.join(',') + ']')
            } else if (p.onGround() && inAirSpike) {
              // Reset on landing so the next launch can be logged
              pd.putBoolean('_dpl_yvel_logged', false)
            }
          } catch (_) {}
        }
      } catch (_) {}
    })
  }

  // 5-tick interval (4Hz) -- catches the spike near its peak without
  // hammering the tick budget. Player velocity is updated every tick,
  // and a launch arc lasts 20+ ticks, so 5-tick sampling is plenty.
  global.registerServerTick('tick_dplYVelocityScan', 5, 2)

  console.log('[IridescentCraft] diag_player_launch loaded ' +
              '(MobEffect monitor + 4Hz Y-velocity scan, threshold=' +
              Y_VEL_LOG_THRESHOLD + ')')
} catch (e) {
  console.warn('[IridescentCraft] diag_player_launch bootstrap FAILED: ' + e)
}
