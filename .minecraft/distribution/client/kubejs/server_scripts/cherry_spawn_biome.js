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
// 2026-10-10 -- the one-shot never worked; the search ran on EVERY boot:
//   * `pdata` was declared with `var` INSIDE the guard's try block. This Rhino
//     build scopes a `var` declared inside a block to that block, so every
//     later `if (pdata)` threw a ReferenceError that the surrounding
//     `catch (_)` swallowed: no flag and no village coordinates were ever
//     stored (119 consecutive "SUCCESS" boots on the May world; the
//     first-join teleport below never fired once). `pdata` is now declared at
//     the function's top level.
//   * A search that ends with nothing (no cherry biome / every set-spawn path
//     failed) stored nothing either. It now records
//     `icraft_cherry_spawn_exhausted`, which the guard honours.
//   * On the live world the search can't even start: an earlier SUCCESS stored
//     the spawn at Y=-64 (the heightmap of the then-unloaded village chunk),
//     and findClosestBiome3d samples no Y level at all when the origin Y is
//     outside (minBuildHeight, maxBuildHeight]. That case is now recognised,
//     logged once, and marked exhausted -- the world spawn is left alone.
//   * Because flags now persist, the first-join teleport becomes reachable for
//     the first time. It is only armed when the spawn is set on a NEW world
//     (so no existing character is ever pulled back to the village), and it
//     resolves the landing height at login instead of trusting the stored Y
//     (which is -64 whenever the village chunk was unloaded at search time).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var BlockPos_cs = Java.loadClass('net.minecraft.core.BlockPos')
  var Predicate_cs = Java.loadClass('java.util.function.Predicate')
  var TagKey_cs = Java.loadClass('net.minecraft.tags.TagKey')
  var Registries_cs = Java.loadClass('net.minecraft.core.registries.Registries')
  var ResourceLocation_cs = Java.loadClass('net.minecraft.resources.ResourceLocation')

  // 2026-04-26 v2.4: tester clarified -- villages DO spawn in
  // cherry_river_valley, just rarely. Reverted v2.3's cherry_mountains
  // fallback. Bumped MAX_ATTEMPTS to 15 to compensate for the low hit
  // rate; keeps strict targeting on the user's intended biome.
  var TARGET_BIOME = 'iridescent_biomes:cherry_river_valley'
  var BIOME_SEARCH_RADIUS = 12000  // blocks; was 8000 in v1, expanded for new worlds
  var Y_STEP = 32
  var XZ_STEP = 64
  var VILLAGE_SEARCH_CHUNKS = 100  // ~1600 blocks from the cherry biome center
  var MAX_ATTEMPTS = 15  // v2.4: bumped from 5 -- river_valley villages are rare
  // The first-join teleport is only armed when the spawn is chosen this early
  // in a world's life (ServerEvents.loaded of a brand-new world is game time 0).
  var NEW_WORLD_MAX_GAMETIME = 12000  // 10 minutes
  var FLAG_SET = 'icraft_cherry_spawn_set'
  var FLAG_EXHAUSTED = 'icraft_cherry_spawn_exhausted'

  var VILLAGE_TAG = TagKey_cs.create(
    Registries_cs.STRUCTURE,
    ResourceLocation_cs.tryParse('minecraft:village')
  )

  // KubeJS's ServerLevel wrapper hides setSharedSpawnPos by name. Try several
  // paths: Forge's setDefaultSpawnPos, LevelData.setSpawn, the m_ SRG names.
  // First success wins. Returns true if any path succeeded, false otherwise.
  var applySpawnPos = function(ow, pos) {
    // Path 1: Forge's setDefaultSpawnPos(BlockPos, float)
    try { ow.setDefaultSpawnPos(pos, 0.0); return true } catch (_) {}
    // Path 2: vanilla setSharedSpawnPos by name (sometimes exposed)
    try { ow.setSharedSpawnPos(pos, 0.0); return true } catch (_) {}
    // Path 3: SRG name for setSharedSpawnPos (Forge 1.20.1)
    try { ow.m_8615_(pos, 0.0); return true } catch (_) {}
    // Path 4: through LevelData (always present, vanilla path)
    try { ow.getLevelData().setSpawn(pos, 0.0); return true } catch (_) {}
    // Path 5: through serverLevelData getter (KubeJS variant)
    try { ow.getServerLevelData().setSpawn(pos, 0.0); return true } catch (_) {}
    return false
  }

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

      // One-shot guard. RHINO: `pdata` MUST be declared here, not inside the
      // try -- a `var` declared in a block is invisible outside it in this
      // Rhino build (see the 2026-10-10 header note).
      var pdata = null
      try { pdata = ow.getPersistentData ? ow.getPersistentData() : null } catch (_) {}
      if (pdata && pdata.contains(FLAG_SET)) {
        console.log('[icraft_spawn] already set this world; skipping')
        return
      }
      if (pdata && pdata.contains(FLAG_EXHAUSTED)) {
        console.log('[icraft_spawn] search already ran to a dead end on this world; skipping')
        return
      }
      // Records "the search has run and has nothing more to try" so it never
      // repeats on later boots. No-op if persistent data is unavailable.
      var markExhausted = function() {
        try { if (pdata) pdata.putBoolean(FLAG_EXHAUSTED, true) } catch (_) {}
      }

      var origin = ow.getSharedSpawnPos()

      // findClosestBiome3d walks Y outward from the origin's Y within
      // (minBuildHeight, maxBuildHeight]; an origin Y outside that range yields
      // no samples and the call returns null immediately. Say so instead of
      // reporting "no cherry biome within 12000 blocks".
      var originY = origin.getY()
      if (originY <= ow.getMinBuildHeight() || originY > ow.getMaxBuildHeight()) {
        console.log('[icraft_spawn] world spawn Y=' + originY + ' (' + origin.getX() + ',' + originY + ',' +
                    origin.getZ() + ') is outside the vertical range the biome search samples, so it cannot run. ' +
                    'World spawn left unchanged; not searching again on this world.')
        markExhausted()
        return
      }

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
            // Match! findNearestMapStructure returns Y=0 (no surface query);
            // resolve the actual ground Y via the heightmap before stashing.
            var surfaceY = villagePos.getY()
            try {
              surfaceY = ow.getHeight(
                Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types').MOTION_BLOCKING_NO_LEAVES,
                villagePos.getX(), villagePos.getZ()
              )
            } catch (_) {}
            var safePos = new BlockPos_cs(villagePos.getX(), surfaceY, villagePos.getZ())

            // 1. Set world spawn (compass + bedless respawn)
            // 2. Stash the position in level NBT so PlayerEvents.loggedIn
            //    can teleport first-time players directly to the village
            //    (setSharedSpawnPos alone only affects WORLD spawn -- the
            //    player's actual first-join landing depends on player.dat
            //    state, server spawn-radius scatter, etc.)
            if (applySpawnPos(ow, safePos)) {
              // Arm the first-join teleport only on a brand-new world: on a world
              // that already has characters, storing the coordinates would yank
              // every one of them (none carries the first-spawn marker) back to
              // the village on their next login.
              var armTeleport = false
              try { armTeleport = ow.gameTime <= NEW_WORLD_MAX_GAMETIME } catch (_) {}
              try {
                if (pdata) {
                  pdata.putBoolean(FLAG_SET, true)
                  if (armTeleport) {
                    pdata.putInt('icraft_cherry_village_x', safePos.getX())
                    pdata.putInt('icraft_cherry_village_y', safePos.getY())
                    pdata.putInt('icraft_cherry_village_z', safePos.getZ())
                  }
                }
              } catch (_) {}
              console.log('[icraft_spawn] SUCCESS: world spawn -> cherry village at ' +
                          safePos.getX() + ',' + safePos.getY() + ',' + safePos.getZ() +
                          (armTeleport ? ' (player first-join teleport armed)'
                                       : ' (existing world: first-join teleport NOT armed)'))
              return
            } else {
              console.warn('[icraft_spawn] all setSpawnPos paths failed for village at ' +
                           safePos.getX() + ',' + safePos.getY() + ',' + safePos.getZ())
              markExhausted()
              return
            }
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
        if (applySpawnPos(ow, bestCherryFallback)) {
          console.log('[icraft_spawn] FALLBACK: spawn -> cherry biome center at ' +
                      bestCherryFallback.getX() + ',' + bestCherryFallback.getY() + ',' +
                      bestCherryFallback.getZ() + ' (no village found in any cherry biome ' +
                      'within ' + MAX_ATTEMPTS + ' attempts)')
          try {
            if (pdata) pdata.putBoolean(FLAG_SET, true)
          } catch (_) {}
        } else {
          console.warn('[icraft_spawn] all setSpawnPos paths failed for cherry fallback at ' +
                       bestCherryFallback.getX() + ',' + bestCherryFallback.getY() + ',' +
                       bestCherryFallback.getZ())
          markExhausted()
        }
      } else {
        console.warn('[icraft_spawn] FAILED: no cherry biome found at all; ' +
                     'spawn unchanged. Increase BIOME_SEARCH_RADIUS or generate more terrain. ' +
                     '(Recorded; the search will not repeat on this world.)')
        markExhausted()
      }
    } catch (e) {
      console.warn('[icraft_spawn] setSpawnToCherryRiverValley threw: ' + e)
    }
  }

  ServerEvents.loaded(event => {
    setSpawnToCherryRiverValley(event.server)
  })

  // Player first-join teleport. setSharedSpawnPos sets WORLD spawn but the
  // first-time player's actual landing position is influenced by player.dat
  // (existing players keep their saved spawn) and server-property
  // spawn-radius scatter. This handler explicitly teleports first-time
  // players to the cherry village position stashed in level NBT.
  PlayerEvents.loggedIn(function(event) {
    try {
      var player = event.player
      if (!player) return
      if (player.persistentData.contains('icraft_cherry_first_spawned')) return

      var ow = event.server.overworld()
      var pdata = ow.getPersistentData ? ow.getPersistentData() : null
      if (!pdata || !pdata.contains('icraft_cherry_village_x')) return

      var x = pdata.getInt('icraft_cherry_village_x')
      var z = pdata.getInt('icraft_cherry_village_z')

      // This login IS the first join, whatever happens below: mark it now so a
      // later login can never be mistaken for one.
      player.persistentData.putBoolean('icraft_cherry_first_spawned', true)

      // Landing height is resolved NOW from the heightmap, never from the stored
      // Y: that value is the heightmap of a chunk that was usually still unloaded
      // when the spawn was chosen (= the world's min build height, e.g. -64), and
      // teleporting there would bury the player in bedrock. If the village column
      // still isn't loaded, skip the teleport: vanilla has already put a new
      // player at the world spawn, which is this same village.
      var minY = ow.getMinBuildHeight()
      var y = minY
      try {
        y = ow.getHeight(
          Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types').MOTION_BLOCKING_NO_LEAVES,
          x, z)
      } catch (eh) {}
      if (!(y > minY)) {
        console.log('[icraft_spawn] first-join teleport skipped for ' + player.username +
                    ': village column ' + x + ',' + z + ' has no surface loaded yet (player stays at world spawn)')
        return
      }

      // Center the player on the block + +1 to land on top of the surface
      try { player.teleportTo(x + 0.5, y + 1, z + 0.5) } catch (e) {
        // Fallback: vanilla SRG teleport name
        try { player.m_6021_(x + 0.5, y + 1, z + 0.5) } catch (e2) {
          console.warn('[icraft_spawn] first-join teleport failed for ' +
                       player.username + ': ' + e + ' / ' + e2)
          return
        }
      }
      console.log('[icraft_spawn] first-join teleport: ' + player.username +
                  ' -> ' + x + ',' + y + ',' + z + ' (cherry village)')
    } catch (e) {
      console.warn('[icraft_spawn] PlayerEvents.loggedIn handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] cherry_spawn_biome v2 loaded -- search for ' +
              TARGET_BIOME + ' + village; max ' + MAX_ATTEMPTS +
              ' attempts; first-join teleport armed')
} catch (e) {
  console.warn('[IridescentCraft] cherry_spawn_biome bootstrap FAILED: ' + e)
}
