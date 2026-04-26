// =============================================================================
// ENEMY EXPANSION -- block explosive_launch mob effect on players
// =============================================================================
// 2026-04-26 EnemyExpansion audit: ExplosiveLaunchHappensProcedure runs every
// tick on any entity with the `enemyexpansion:explosive_launch` mob effect
// and applies setDeltaMovement() with random vectors. Effect amplitude is
// unbounded -> can launch the player skyward over multiple ticks.
//
// Procedure bypasses LivingKnockBackEvent. Active velocity clamp in
// diag_player_velocity.js catches per-event Y-spikes via LivingHurtEvent,
// but the explosive_launch effect ticks INDEPENDENTLY of damage events --
// some launch ticks won't fire LivingHurtEvent. Need a separate handler
// to remove the effect outright.
//
// Strategy: every server tick, scan players. If any has the effect, remove
// it. Mob-on-mob effects unaffected (we only touch players).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var ResourceLocation_eel = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_eel = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  var EFFECT_ID = 'enemyexpansion:explosive_launch'
  var resolved = null
  try {
    var rl = ResourceLocation_eel.tryParse(EFFECT_ID)
    if (rl) resolved = ForgeRegistries_eel.MOB_EFFECTS.getValue(rl)
  } catch (_) {}

  if (!resolved) {
    console.log('[explosive_launch_blocker] effect ' + EFFECT_ID +
                ' not registered (mod absent or renamed); handler is a no-op')
  } else {
    var effectInstance = resolved
    global.tick_explosiveLaunchBlocker = function(event) {
      event.server.players.forEach(function(player) {
        try {
          if (player.hasEffect(effectInstance)) {
            player.removeEffect(effectInstance)
            if (!global._exp_launch_seen) global._exp_launch_seen = {}
            var name = String(player.username)
            if (!global._exp_launch_seen[name]) {
              global._exp_launch_seen[name] = true
              console.log('[explosive_launch_blocker] stripped ' + EFFECT_ID +
                          ' from ' + name + ' (per-tick procedure neutralized)')
            }
          }
        } catch (_) {}
      })
    }
    // Tick every 5 ticks (4Hz) -- frequent enough to interrupt the launch
    // accumulation but cheap. Effect duration is short anyway.
    global.registerServerTick('tick_explosiveLaunchBlocker', 5, 5)
    console.log('[IridescentCraft] enemyexpansion_explosive_launch_blocker loaded (4Hz scan)')
  }
} catch (e) {
  console.warn('[IridescentCraft] enemyexpansion_explosive_launch_blocker bootstrap FAILED: ' + e)
}
