// =============================================================================
// CHERRY RIVER VALLEY -- world spawn at a cherry-biome village
// =============================================================================
// 2026-04-26: user directive: spawn new players in iridescent_biomes:
// cherry_river_valley, ideally AT a village.
//
// v1 (initial) found nearest cherry biome and called setSharedSpawnPos.
// Tester report: 'Generated a new world, still didn't get the cherry
// river valley village.' Cherry biome was tagged village-eligible (in
// has_structure/village_plains datapack tag), so villages CAN generate
// there, but the v1 script only searched for the biome -- the nearest
// village was wherever vanilla decided, often in a non-cherry biome.
//
// v2 algorithm: 5 attempts maximum
//   1. Find nearest unvisited cherry biome via findClosestBiome3d
//   2. From that biome center, findNearestMapStructure(#minecraft:village)
//      with a 100-chunk radius
//   3. If a village is found AND it's actually IN cherry biome,
//      set spawn there -> return
//   4. If not, advance the search origin past the current cherry biome
//      and repeat
//   5. After 5 attempts, fall back to spawning at the closest cherry
//      biome regardless of village presence (better than spawning at
//      vanilla origin)
//
// Logs every attempt so we can see why a search succeeded/failed without
// guessing. One-shot per world (persistent NBT flag) so subsequent
// server restarts don't re-search.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var BlockPos_cs = Java.loadClass('net.minecraft.core.BlockPos')
  var Predicate_cs = Java.loadClass('java.util.function.Predicate')
  var TagKey_cs = Java.loadClass('net.minecraft.tags.TagKey')
  var Registries_cs = Java.loadClass('net.minecraft.core.registries.Registries')
  var ResourceLocation_cs = Java.loadClass('net.minecraft.resources.ResourceLocation')

  var TARGET_BIOME = 'iridescent_biomes:cherry_river_valley'
  var BIOME_SEARCH_RADIUS = 12000  // blocks; was 8000 in v1, expanded for new worlds
  var Y_STEP = 32
  var XZ_STEP = 64
  var VILLAGE_SEARCH_CHUNKS = 100  // ~1600 blocks from the cherry biome center
  var MAX_ATTEMPTS = 5

  var VILLAGE_TAG = TagKey_cs.create(
    Registries_cs.STRUCTURE,
    ResourceLocation_cs.tryParse('minecraft:village')
  )

  var biomeIdAt = function(ow, pos) {
    try {
      var holder = ow.getBiome(pos)
      if (!holder) return null
      var key = holder.unwrapKey()
      if (!key.isPresent()) return null
      return String(key.get().location())
    } catch (e) { return null }
  }

  var cherryPredicate = new Predicate_cs({
    test: function(biomeHolder) {
      try {
        var key = biomeHolder.unwrapKey()
        if (!key.isPresent()) return false
        return String(key.get().location()) === TARGET_BIOME
      } catch (e) { return false }
    }
  })

  var setSpawnToCherryRiverValley = function(server) {
    try {
      var ow = server.overworld()
      if (!ow) {
        console.warn('[icraft_spawn] overworld() returned null')
        return
      }

      // One-shot guard
      try {
        var pdata = ow.getPersistentData ? ow.getPersistentData() : null
        if (pdata && pdata.contains('icraft_cherry_spawn_set')) {
          console.log('[icraft_spawn] already set this world; skipping')
          return
        }
      } catch (_) {}

      var origin = ow.getSharedSpawnPos()
      console.log('[icraft_spawn] starting search; origin=' +
                  origin.getX() + ',' + origin.getY() + ',' + origin.getZ())

      var searchFrom = origin
      var bestCherryFallback = null  // first cherry biome found (used if no village)

      for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // -- Phase 1: find next cherry biome from current search origin
        var biomeResult = null
        try {
          biomeResult = ow.findClosestBiome3d(cherryPredicate, searchFrom,
                                              BIOME_SEARCH_RADIUS, Y_STEP, XZ_STEP)
        } catch (e) {
          console.warn('[icraft_spawn] findClosestBiome3d threw on attempt ' +
                       (attempt + 1) + ': ' + e)
          break
        }
        if (!biomeResult) {
          console.warn('[icraft_spawn] no more cherry biomes within ' +
                       BIOME_SEARCH_RADIUS + ' of search origin (attempt ' +
                       (attempt + 1) + ')')
          break
        }
        var biomePos = biomeResult.getFirst()
        console.log('[icraft_spawn] attempt ' + (attempt + 1) + ': cherry biome at ' +
                    biomePos.getX() + ',' + biomePos.getY() + ',' + biomePos.getZ())

        if (!bestCherryFallback) bestCherryFallback = biomePos

        // -- Phase 2: find nearest village near this cherry biome
        var villageResult = null
        try {
          // findNearestMapStructure(TagKey, BlockPos, int searchRadius, boolean skipExistingChunks)
          villageResult = ow.findNearestMapStructure(VILLAGE_TAG, biomePos,
                                                     VILLAGE_SEARCH_CHUNKS, false)
        } catch (e) {
          console.warn('[icraft_spawn] findNearestMapStructure threw: ' + e)
        }
        if (!villageResult) {
          console.log('[icraft_spawn]   no village within ' + VILLAGE_SEARCH_CHUNKS +
                      ' chunks of cherry biome center')
        } else {
          // 1.20.1 ServerLevel.findNearestMapStructure returns BlockPos
          // directly (not Pair<BlockPos, Holder<Structure>> like
          // findClosestBiome3d does). Tester's first run threw
          //   TypeError: Cannot find function getFirst in object BlockPos{...}
          // because v2 first draft assumed Pair. Use the result as-is.
          var villagePos = villageResult
          var villageBiome = biomeIdAt(ow, villagePos)
          console.log('[icraft_spawn]   nearest village at ' +
                      villagePos.getX() + ',' + villagePos.getY() + ',' + villagePos.getZ() +
                      ' biome=' + villageBiome)
          if (villageBiome === TARGET_BIOME) {
            // Match! Set spawn at the village
            ow.setSharedSpawnPos(villagePos, 0.0)
            console.log('[icraft_spawn] SUCCESS: world spawn -> cherry village at ' +
                        villagePos.getX() + ',' + villagePos.getY() + ',' + villagePos.getZ())
            try {
              if (pdata) pdata.putBoolean('icraft_cherry_spawn_set', true)
            } catch (_) {}
            return
          }
          // village exists but not in cherry; advance search past this cherry
        }

        // Advance search origin past the current cherry biome
        searchFrom = new BlockPos_cs(
          biomePos.getX() + 2000,
          biomePos.getY(),
          biomePos.getZ() + 2000
        )
      }

      // No cherry+village combo found; fall back to just cherry biome center
      if (bestCherryFallback) {
        ow.setSharedSpawnPos(bestCherryFallback, 0.0)
        console.log('[icraft_spawn] FALLBACK: spawn -> cherry biome center at ' +
                    bestCherryFallback.getX() + ',' + bestCherryFallback.getY() + ',' +
                    bestCherryFallback.getZ() + ' (no village found in any cherry biome ' +
                    'within ' + MAX_ATTEMPTS + ' attempts)')
        try {
          if (pdata) pdata.putBoolean('icraft_cherry_spawn_set', true)
        } catch (_) {}
      } else {
        console.warn('[icraft_spawn] FAILED: no cherry biome found at all; ' +
                     'spawn unchanged. Increase BIOME_SEARCH_RADIUS or generate more terrain.')
      }
    } catch (e) {
      console.warn('[icraft_spawn] setSpawnToCherryRiverValley threw: ' + e)
    }
  }

  ServerEvents.loaded(event => {
    setSpawnToCherryRiverValley(event.server)
  })

  console.log('[IridescentCraft] cherry_spawn_biome v2 loaded -- search for ' +
              TARGET_BIOME + ' + village; max ' + MAX_ATTEMPTS + ' attempts')
} catch (e) {
  console.warn('[IridescentCraft] cherry_spawn_biome bootstrap FAILED: ' + e)
}
