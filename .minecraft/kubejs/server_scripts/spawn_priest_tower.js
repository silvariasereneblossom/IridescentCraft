// =============================================================================
// SPAWN VILLAGE PRIEST TOWER GUARANTEE (docket #96, 2026-06-07)
// =============================================================================
// Operator directive: the ISS priest tower must be GUARANTEED in the starting
// village. Jigsaw weights can't guarantee (even at weight 12 of ~96 a village
// can roll zero), so this script closes the gap deterministically:
//
//   1. One-time per world (server persistentData flag).
//   2. Detect an existing tower CHEAPLY: the tower's signature block is
//      irons_spellbooks:inscription_table (verified unique non-vanilla block
//      in ctov priest_tower nbt, 9x20x9) and it is a BLOCK ENTITY - so we
//      iterate per-chunk block-entity maps (indexed; ~170 chunk lookups, no
//      block scan) in a 96-block radius around world spawn.
//   3. If absent: place ctov:village/plains/jobsite/priest_tower at the
//      flattest of four cardinal offsets from spawn (heightmap-sited),
//      verify the inscription table materialized, then set the flag.
//
// Runs on EXISTING worlds too (next boot after deploy): if the current spawn
// village never rolled a tower, it gets one retroactively.
//
// Memory/house rules honored: var-assigned functions (Rhino), no java.*
// ctors (Java.loadClass for Heightmap$Types), runCommandSilent placement,
// deferred start pattern (auto_chunky.js precedent).
// =============================================================================

;(function () {
  var FLAG = 'icraft_priest_tower_done'
  var SCAN_RADIUS_CHUNKS = 6          // 96 blocks around spawn
  var OFFSET = 30                     // placement distance from spawn
  var TEMPLATE = 'ctov:village/plains/jobsite/priest_tower'
  var SIGNATURE = 'irons_spellbooks:inscription_table'
  var START_DELAY_TICKS = 200         // let cherry_spawn_biome set spawn first

  var log = function (msg) { console.log('[PRIEST-TOWER] ' + msg) }

  var findSignatureNearSpawn = function (level, sp) {
    var found = null
    var cx0 = Math.floor(sp.x / 16), cz0 = Math.floor(sp.z / 16)
    var chunks = 0
    for (var cx = cx0 - SCAN_RADIUS_CHUNKS; cx <= cx0 + SCAN_RADIUS_CHUNKS; cx++) {
      for (var cz = cz0 - SCAN_RADIUS_CHUNKS; cz <= cz0 + SCAN_RADIUS_CHUNKS; cz++) {
        try {
          var anchor = level.getBlock(cx * 16, sp.y, cz * 16)
          var chunk = level.getChunkAt(anchor.getPos())
          if (!chunk) continue
          chunks++
          var it = chunk.getBlockEntities().keySet().iterator()
          while (it.hasNext()) {
            var bePos = it.next()
            if (String(level.getBlock(bePos).id) === SIGNATURE) {
              found = bePos
              return found
            }
          }
        } catch (e) { /* unloaded / API miss on one chunk: keep scanning */ }
      }
    }
    log('scanned ' + chunks + ' chunks, signature not found')
    return null
  }

  var surfaceY = function (level, x, z) {
    try {
      var Types = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap$Types')
      return level.getHeight(Types.WORLD_SURFACE, x, z)
    } catch (e) {
      // fallback: walk down from 200 for the first non-air block
      for (var y = 200; y > 50; y--) {
        try { if (String(level.getBlock(x, y, z).id) !== 'minecraft:air') return y + 1 } catch (e2) {}
      }
      return 64
    }
  }

  // flatness score of a 9x9 footprint = max-min corner+center surface height
  var siteScore = function (level, x, z) {
    var ys = [
      surfaceY(level, x, z), surfaceY(level, x + 8, z),
      surfaceY(level, x, z + 8), surfaceY(level, x + 8, z + 8),
      surfaceY(level, x + 4, z + 4)
    ]
    var min = ys[0], max = ys[0]
    for (var i = 1; i < ys.length; i++) {
      if (ys[i] < min) min = ys[i]
      if (ys[i] > max) max = ys[i]
    }
    return { spread: max - min, y: min }
  }

  var placeTower = function (server, level, sp) {
    var candidates = [
      { x: sp.x + OFFSET, z: sp.z }, { x: sp.x - OFFSET, z: sp.z },
      { x: sp.x, z: sp.z + OFFSET }, { x: sp.x, z: sp.z - OFFSET }
    ]
    var best = null
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i]
      var s = siteScore(level, c.x, c.z)
      if (best === null || s.spread < best.spread) {
        best = { x: c.x, z: c.z, y: s.y, spread: s.spread }
      }
      if (s.spread <= 3) { best = { x: c.x, z: c.z, y: s.y, spread: s.spread }; break }
    }
    log('placing at ' + best.x + ',' + best.y + ',' + best.z + ' (spread ' + best.spread + ')')
    var result = server.runCommandSilent(
      'place template ' + TEMPLATE + ' ' + best.x + ' ' + best.y + ' ' + best.z)
    return result > 0
  }

  ServerEvents.loaded(function (event) {
    var server = event.server
    server.scheduleInTicks(START_DELAY_TICKS, function () {
      try {
        if (server.persistentData.getBoolean(FLAG)) return
        var level = server.overworld()
        var sp = level.getSharedSpawnPos()
        var existing = findSignatureNearSpawn(level, sp)
        if (existing) {
          log('tower already present at ' + existing + ' - flagging done')
          server.persistentData.putBoolean(FLAG, true)
          return
        }
        if (placeTower(server, level, sp)) {
          var check = findSignatureNearSpawn(level, sp)
          if (check) {
            log('tower placed + verified (inscription table at ' + check + ')')
            server.persistentData.putBoolean(FLAG, true)
          } else {
            log('WARN: place command succeeded but signature not found - will retry next boot')
          }
        } else {
          log('WARN: place command failed - will retry next boot')
        }
      } catch (e) {
        console.error('[PRIEST-TOWER] guarantee pass threw: ' + e)
      }
    })
  })

  console.log('[PRIEST-TOWER] spawn-village guarantee armed (signature: ' + SIGNATURE + ')')
})()
