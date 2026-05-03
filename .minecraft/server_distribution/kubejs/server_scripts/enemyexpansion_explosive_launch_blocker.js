// =============================================================================
// ENEMY EXPANSION -- block explosive_launch mob effect on ALL living entities
// =============================================================================
// 2026-04-26 EnemyExpansion audit: ExplosiveLaunchHappensProcedure runs at
// the END of the `enemyexpansion:explosive_launch` mob effect (40-tick
// countdown). When it fires, the procedure:
//   1. Sets a random vertical/diagonal velocity on the entity
//   2. Summons an `invisicreeper` (radius 1-4 explosion) at the entity's
//      position — THIS explosion launches nearby arrows + mobs skyward
//      (chain reaction the user observed: "arrows from these mobs launch
//      each other into the air")
//   3. Applies a CARDIAC effect (DoT) if entity survives
//
// 2026-05-03 EXTENDED to all living entities. Earlier version only stripped
// the effect from players; mob-on-mob applications still completed their
// 40-tick countdown, summoned the invisicreeper, and launched everything
// nearby. To kill the chain reaction we have to strip the effect from
// every entity that gets it — players, hostiles, passives, all of them.
//
// Strategy: every 5 ticks (4 Hz), iterate every loaded entity in every
// ServerLevel. If it has the EXPLOSIVE_LAUNCH effect, remove it. The
// 40-tick countdown never finishes — procedure never fires — no launch,
// no invisicreeper, no chain reaction.
//
// Performance: hasEffect() is a HashMap lookup, microseconds per entity.
// Even with hundreds of loaded entities the cost is negligible.
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
      var stripped = 0
      event.server.allLevels.forEach(function(level) {
        try {
          // ServerLevel.entities returns all loaded entities (players,
          // mobs, items, projectiles). Effect can only exist on
          // LivingEntity, so we filter via .living before the check.
          var iterator = level.entities.iterator()
          while (iterator.hasNext()) {
            var entity = iterator.next()
            try {
              if (!entity.living) continue
              if (entity.hasEffect(effectInstance)) {
                entity.removeEffect(effectInstance)
                stripped++
              }
            } catch (_) {}
          }
        } catch (_) {}
      })
      // One-time log per session that the blocker is firing — confirms
      // the chain is being broken without spamming on every strip.
      if (stripped > 0 && !global._exp_launch_blocker_logged) {
        global._exp_launch_blocker_logged = true
        console.log('[explosive_launch_blocker] stripped ' + EFFECT_ID +
                    ' from ' + stripped + ' entities (first occurrence)')
      }
    }
    // Tick every 5 ticks (4Hz) -- frequent enough to interrupt the
    // 40-tick countdown well before completion. Effect can't reach
    // ExplosiveLaunchHappensProcedure.
    global.registerServerTick('tick_explosiveLaunchBlocker', 5, 5)
    console.log('[IridescentCraft] enemyexpansion_explosive_launch_blocker loaded (4Hz scan, all living entities)')
  }
} catch (e) {
  console.warn('[IridescentCraft] enemyexpansion_explosive_launch_blocker bootstrap FAILED: ' + e)
}
