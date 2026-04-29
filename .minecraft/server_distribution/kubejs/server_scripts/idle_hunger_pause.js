// =============================================================================
// IDLE HUNGER PAUSE — no hunger drain when truly AFK
// =============================================================================
// The pack runs Hungeroverhaul + Sleep Hunger + Liteminer hunger gate +
// respawn hunger reset, all of which compound into a heavy hunger tax.
// Tester directive 2026-04-29: that tax shouldn't apply when the player
// is genuinely AFK (e.g. walked away from keyboard). Hunger draining
// down to zero while the player isn't even playing is anti-fun.
//
// Detection: poll player position + look angles every 20 ticks (1s).
// If neither changed in 2400 ticks (2 minutes), the player is idle.
// While idle, snapshot foodLevel + saturationLevel on entry, and
// restore them every tick — any drain that fires gets reverted before
// the player would notice it.
//
// What counts as an "action":
//   - Position change (walking, jumping, falling)
//   - Look-angle change (mouse movement, camera turn)
// Inventory changes / clicks are NOT tracked — those typically come with
// position or look changes anyway, and tracking them here adds complexity.
//
// Skip in creative / spectator (no hunger drain to begin with).
// Cleared on logout to keep the per-player state map bounded.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try blocks).
// =============================================================================

const IDLE_THRESHOLD_TICKS = 2400  // 2 minutes (20 t/s × 120 s)
const POLL_INTERVAL_TICKS  = 20    // 1 second
const POSITION_EPSILON     = 0.01  // tiny position deltas count as "still"
const ROTATION_EPSILON     = 0.5   // half-degree look deltas count as "still"

try {
  // username -> { x, y, z, yaw, pitch, lastChangeTick, idle, foodSnap, satSnap }
  var idleState = {}

  global.tick_idleHungerPause = function(event) {
    var server = event.server
    var now = server.tickCount

    server.players.forEach(function(player) {
      try {
        if (player.creative || player.spectator) return

        var name = player.username
        var x = player.x, y = player.y, z = player.z
        var yaw = player.yaw, pitch = player.pitch
        var st = idleState[name]

        if (!st) {
          // First observation — initialize
          idleState[name] = {
            x: x, y: y, z: z, yaw: yaw, pitch: pitch,
            lastChangeTick: now,
            idle: false,
            foodSnap: 0, satSnap: 0
          }
          return
        }

        var moved = (Math.abs(x - st.x) > POSITION_EPSILON) ||
                    (Math.abs(y - st.y) > POSITION_EPSILON) ||
                    (Math.abs(z - st.z) > POSITION_EPSILON)
        var turned = (Math.abs(yaw - st.yaw) > ROTATION_EPSILON) ||
                     (Math.abs(pitch - st.pitch) > ROTATION_EPSILON)

        if (moved || turned) {
          // Active — reset idle state and timestamp
          st.x = x; st.y = y; st.z = z
          st.yaw = yaw; st.pitch = pitch
          st.lastChangeTick = now
          st.idle = false
          return
        }

        // No movement / no look change since last poll
        var idleFor = now - st.lastChangeTick
        if (idleFor < IDLE_THRESHOLD_TICKS) return

        // Idle — snapshot food on first idle tick, then keep restoring
        if (!st.idle) {
          try {
            st.foodSnap = player.foodData.foodLevel
            st.satSnap  = player.foodData.saturationLevel
          } catch (e) { return }
          st.idle = true
        }

        // Restore food + saturation every poll cycle. Hungeroverhaul ambient
        // drain happens on a slower cadence than 1s, so the player never
        // visibly loses hunger while AFK.
        try {
          if (player.foodData.foodLevel < st.foodSnap) {
            player.foodData.setFoodLevel(st.foodSnap)
          }
          if (player.foodData.saturationLevel < st.satSnap) {
            player.foodData.setSaturation(st.satSnap)
          }
        } catch (e) {}
      } catch (e) {
        console.warn('[idle_hunger_pause] tick failed for ' + player.username + ': ' + e)
      }
    })
  }
  global.registerServerTick('tick_idleHungerPause', POLL_INTERVAL_TICKS, 13)

  PlayerEvents.loggedOut(function(event) {
    try { delete idleState[event.player.username] } catch (e) {}
  })

  console.log('[IridescentCraft] idle_hunger_pause loaded — hunger drain pauses after ' +
    (IDLE_THRESHOLD_TICKS / 20) + 's of inaction')
} catch (e) {
  console.warn('[IridescentCraft] idle_hunger_pause bootstrap FAILED: ' + e)
}
