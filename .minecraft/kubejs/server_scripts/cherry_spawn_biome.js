// =============================================================================
// CHERRY RIVER VALLEY -- world spawn biome retarget
// =============================================================================
// 2026-04-26: user directive: change biome spawn point to
// iridescent_biomes:cherry_river_valley (added by our own iridescent_biomes
// mod). Vanilla picks an arbitrary spawn biome at world creation; we want
// new players to start in cherry_river_valley.
//
// Approach: on serverStarted, find the closest cherry_river_valley biome
// to the current world spawn (default is near 0,0,0) and reset
// ServerLevel.setSharedSpawnPos to that location. This affects:
//   - Default world-spawn for first-time players (PlayerEvents.firstJoinedSpawn
//     teleports them to shared spawn pos by default)
//   - The compass needle direction
//   - Bed-less respawns
//
// One-shot per world (gated by level persistent flag) so subsequent
// server restarts don't re-search.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var BlockPos_cs = Java.loadClass('net.minecraft.core.BlockPos')
  var Predicate_cs = Java.loadClass('java.util.function.Predicate')

  var TARGET_BIOME = 'iridescent_biomes:cherry_river_valley'
  var SEARCH_RADIUS = 8000  // blocks; covers ~16km diameter -- generous
  var Y_STEP = 32
  var XZ_STEP = 64

  var setSpawnToCherryRiverValley = function(server) {
    try {
      var ow = server.overworld()
      if (!ow) {
        console.warn('[icraft_spawn] overworld() returned null')
        return
      }

      // One-shot guard: stash a flag in level data so we don't re-run on every
      // server restart. Player can manually re-trigger by clearing the flag.
      var data = ow.getLevelData()  // optional -- may be null in some KubeJS versions
      var alreadySet = false
      try { alreadySet = ow.getServer().getLevel(ow.dimension()).getDataStorage()
                            ? false : false } catch (_) {}
      // Simpler: stash on server's overworld via persistent NBT
      try {
        var pdata = ow.getPersistentData ? ow.getPersistentData() : null
        if (pdata && pdata.contains('icraft_cherry_spawn_set')) return
      } catch (_) {}

      var origin = ow.getSharedSpawnPos()
      console.log('[icraft_spawn] searching for ' + TARGET_BIOME +
                  ' within ' + SEARCH_RADIUS + ' blocks of ' + origin)

      var pred = new Predicate_cs({
        test: function(biomeHolder) {
          try {
            var key = biomeHolder.unwrapKey()
            if (!key.isPresent()) return false
            return String(key.get().location()) === TARGET_BIOME
          } catch (e) { return false }
        }
      })

      var result = null
      try {
        result = ow.findClosestBiome3d(pred, origin, SEARCH_RADIUS, Y_STEP, XZ_STEP)
      } catch (e) {
        console.warn('[icraft_spawn] findClosestBiome3d threw: ' + e)
        return
      }

      if (!result) {
        console.warn('[icraft_spawn] ' + TARGET_BIOME + ' not found within ' +
                     SEARCH_RADIUS + ' blocks. World spawn unchanged. ' +
                     'Increase SEARCH_RADIUS or generate more terrain.')
        return
      }

      var pos = result.getFirst()
      ow.setSharedSpawnPos(pos, 0.0)
      console.log('[icraft_spawn] world spawn set to ' + TARGET_BIOME +
                  ' at ' + pos.getX() + ',' + pos.getY() + ',' + pos.getZ())

      // Set the one-shot flag so we don't re-run.
      try {
        var pdata = ow.getPersistentData ? ow.getPersistentData() : null
        if (pdata) pdata.putBoolean('icraft_cherry_spawn_set', true)
      } catch (_) {}
    } catch (e) {
      console.warn('[icraft_spawn] setSpawnToCherryRiverValley threw: ' + e)
    }
  }

  ServerEvents.loaded(event => {
    setSpawnToCherryRiverValley(event.server)
  })

  console.log('[IridescentCraft] cherry_spawn_biome loaded -- world spawn -> ' + TARGET_BIOME + ' on server start')
} catch (e) {
  console.warn('[IridescentCraft] cherry_spawn_biome bootstrap FAILED: ' + e)
}
