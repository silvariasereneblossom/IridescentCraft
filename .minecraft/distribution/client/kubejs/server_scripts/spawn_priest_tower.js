// =============================================================================
// SPAWN VILLAGE PRIEST TOWER GUARANTEE (docket #96, 2026-06-07)
// =============================================================================
// Operator directive: the ISS priest tower must be GUARANTEED in the starting
// village. Jigsaw weights can't guarantee (even at weight 12 of ~96 a village
// can roll zero), so this script closes the gap deterministically:
//
//   1. One-time per world (server persistentData flag).
//   2. Detect an existing tower (details below).
//   3. If absent: place ctov:village/plains/jobsite/priest_tower at the
//      flattest of four cardinal offsets from spawn (heightmap-sited) and set
//      the flag AS SOON AS `place` reports success.
//
// Runs on EXISTING worlds too (next boot after deploy): if the current spawn
// village never rolled a tower, it gets one retroactively.
//
// ---------------------------------------------------------------------------
// 2026-10-10 REWRITE OF THE DETECTOR — it re-placed the tower on EVERY boot.
// ---------------------------------------------------------------------------
// The old detector walked per-chunk block-entity maps looking for
// irons_spellbooks:inscription_table. The inscription table is NOT a block
// entity (jar-verified: InscriptionTableBlock extends HorizontalDirectionalBlock
// and does not implement EntityBlock; ISS registers no BlockEntityType for it),
// so it could never be found — neither before placing nor when "verifying"
// afterwards — and the done-flag was only set on a verified find. Result: one
// `place template` per boot for four months. Each of the four sites got a
// tower, and once all four were occupied the east site won every tie and took a
// new tower one block higher each boot (the template's footprint corners are
// only its y=0 dirt/grass layer, so the "surface" the siting read back was
// always previous base + 1), leaving a 9x9 dirt pillar under the newest tower.
//
// Template facts (decoded from the ctov 3.4.14 jar; size 9 x 20 x 9; `place
// template` applies no rotation, so offsets are from the placement corner):
//   [3,11,6] [4,11,6]  irons_spellbooks:inscription_table (two halves, plain blocks)
//   [4, 1,8]           minecraft:jigsaw  — worldgen swaps it for its final_state
//                      (stone_brick_stairs); `place template` leaves the RAW
//                      jigsaw block, which survival players cannot break. So a
//                      jigsaw here is the durable fingerprint of a script-placed
//                      tower, even after someone walks off with the tables.
//   [3, 2,2]           minecraft:lectern   (block entity)
//   [4, 2,2] [2,11,3]  minecraft:chest     (block entities)
//
// Detection now (all plain block reads — no block-entity dependence):
//   A. Script-placed tower: at each of the four candidate sites (the same
//      spawn +/-30 corners placeTower uses) scan the full build height of the
//      jigsaw column and the two table columns.
//   B. Worldgen tower anywhere in the village (jigsaw-rotated): walk the
//      block-entity maps of the 13x13 chunks around spawn for lecterns (cheap,
//      indexed) and test the template's table / chest offsets around each one
//      in all four rotations; a raw jigsaw with the lectern at its template
//      offset also counts (script-placed tower at an older spawn).
// A read error makes the pass INCONCLUSIVE and nothing is placed that boot
// ("found nothing" must never be confused with "could not look").
//
// Hard stops, independent of detection:
//   * the done-flag is set the moment `place` succeeds (verification only logs);
//   * at most MAX_ATTEMPTS boots ever reach the placing step for one world.
//
// Memory/house rules honored: var-assigned functions (Rhino), no java.*
// ctors (Java.loadClass for Heightmap$Types), runCommandSilent placement,
// deferred start pattern (auto_chunky.js precedent). RHINO: a `var` declared
// inside a block is scoped to that block in this Rhino build — anything read
// after a try/if/for is declared before it.
//
// CHUNK LOADING IS INTENTIONAL HERE (2026-10-10 getBlock/OOM sweep): Ksyxis
// means spawn chunks are NOT kept loaded, so the block reads below force-load
// the chunks they touch on an empty server. That's fine: it's one pass per boot
// (not a timer), at ~tick 200, before the level's 300-tick empty cutoff stops
// tickBlockEntities, so the reloaded chunks' tickers are still pruned — and
// once the flag is set the pass returns before touching the world at all (pass
// A alone touches only the four site chunks). Do NOT add a hasChunkAt guard:
// the scan would see nothing, and both getHeight (returns the min build height
// for an unloaded chunk) and `place template` (refuses unloaded positions) rely
// on pass B having just loaded the site (spawn +/-30..39 blocks) in the same tick.
// =============================================================================

;(function () {
  var FLAG = 'icraft_priest_tower_done'
  var ATTEMPTS_KEY = 'icraft_priest_tower_attempts'
  var MAX_ATTEMPTS = 3                // boots allowed to reach the placing step
  var SCAN_RADIUS_CHUNKS = 6          // 96 blocks around spawn
  var OFFSET = 30                     // placement distance from spawn
  var TEMPLATE = 'ctov:village/plains/jobsite/priest_tower'
  var SIGNATURE = 'irons_spellbooks:inscription_table'
  var JIGSAW = 'minecraft:jigsaw'
  var LECTERN = 'minecraft:lectern'
  var CHEST = 'minecraft:chest'
  var START_DELAY_TICKS = 200         // let cherry_spawn_biome set spawn first

  // Template-relative offsets (see header).
  var TABLE_A = [3, 11, 6], TABLE_B = [4, 11, 6]
  var JIGSAW_AT = [4, 1, 8]
  var LECTERN_AT = [3, 2, 2]

  // Offsets FROM THE LECTERN, for worldgen (rotated) towers: dy plus the four
  // horizontal rotations of (dx, dz):  (dx,dz) (-dz,dx) (-dx,-dz) (dz,-dx).
  var rotations = function (dx, dz) {
    return [[dx, dz], [-dz, dx], [-dx, -dz], [dz, -dx]]
  }
  var TABLE_FROM_LECTERN = rotations(0, 4).concat(rotations(1, 4))   // dy = +9
  var UPPER_CHEST_FROM_LECTERN = rotations(-1, 1)                    // dy = +9
  var LOWER_CHEST_FROM_LECTERN = rotations(1, 0)                     // dy =  0

  var log = function (msg) { console.log('[PRIEST-TOWER] ' + msg) }

  // Block id at a position, or null if the read failed. `stats.errors` counts
  // failed reads so a pass can tell "nothing there" from "could not look".
  var idAt = function (level, x, y, z, stats) {
    try {
      return String(level.getBlock(x, y, z).id)
    } catch (e) {
      stats.errors++
      return null
    }
  }

  var candidateSites = function (sp) {
    return [
      { x: sp.x + OFFSET, z: sp.z }, { x: sp.x - OFFSET, z: sp.z },
      { x: sp.x, z: sp.z + OFFSET }, { x: sp.x, z: sp.z - OFFSET }
    ]
  }

  // Pass A — a tower this script placed at one of its four sites.
  // Returns a description string, or null.
  var findPlacedTower = function (level, sp, stats) {
    var yMin = level.getMinBuildHeight()
    var yMax = level.getMaxBuildHeight()
    var sites = candidateSites(sp)
    for (var i = 0; i < sites.length; i++) {
      var s = sites[i]
      for (var y = yMin; y < yMax; y++) {
        if (idAt(level, s.x + JIGSAW_AT[0], y, s.z + JIGSAW_AT[2], stats) === JIGSAW) {
          return 'template jigsaw at ' + (s.x + JIGSAW_AT[0]) + ',' + y + ',' + (s.z + JIGSAW_AT[2]) +
            ' (tower corner ' + s.x + ',' + (y - JIGSAW_AT[1]) + ',' + s.z + ')'
        }
        if (idAt(level, s.x + TABLE_A[0], y, s.z + TABLE_A[2], stats) === SIGNATURE ||
            idAt(level, s.x + TABLE_B[0], y, s.z + TABLE_B[2], stats) === SIGNATURE) {
          return 'inscription table at ' + (s.x + TABLE_A[0]) + '..' + (s.x + TABLE_B[0]) + ',' + y + ',' +
            (s.z + TABLE_A[2]) + ' (tower corner ' + s.x + ',' + (y - TABLE_A[1]) + ',' + s.z + ')'
        }
      }
    }
    return null
  }

  var anyAt = function (level, x, y, z, offsets, dy, wanted, stats) {
    for (var k = 0; k < offsets.length; k++) {
      if (idAt(level, x + offsets[k][0], y + dy, z + offsets[k][1], stats) === wanted) return true
    }
    return false
  }

  // Pass B — a worldgen tower (any rotation) or a script-placed one at an older
  // spawn, anywhere within SCAN_RADIUS_CHUNKS. Also loads the 13x13 chunks that
  // siting + `place template` need. Returns a description string, or null.
  var findTowerInVillage = function (level, sp, stats) {
    var cx0 = Math.floor(sp.x / 16), cz0 = Math.floor(sp.z / 16)
    var chunks = 0
    for (var cx = cx0 - SCAN_RADIUS_CHUNKS; cx <= cx0 + SCAN_RADIUS_CHUNKS; cx++) {
      for (var cz = cz0 - SCAN_RADIUS_CHUNKS; cz <= cz0 + SCAN_RADIUS_CHUNKS; cz++) {
        try {
          var anchor = level.getBlock(cx * 16, sp.y, cz * 16)
          var chunk = level.getChunkAt(anchor.getPos())
          if (!chunk) { stats.errors++; continue }
          chunks++
          var it = chunk.getBlockEntities().keySet().iterator()
          while (it.hasNext()) {
            var p = it.next()
            var bx = p.getX(), by = p.getY(), bz = p.getZ()
            var id = idAt(level, bx, by, bz, stats)
            if (id === LECTERN) {
              if (anyAt(level, bx, by, bz, TABLE_FROM_LECTERN, 9, SIGNATURE, stats)) {
                return 'priest-tower lectern at ' + bx + ',' + by + ',' + bz + ' with its inscription table'
              }
              if (anyAt(level, bx, by, bz, UPPER_CHEST_FROM_LECTERN, 9, CHEST, stats) &&
                  anyAt(level, bx, by, bz, LOWER_CHEST_FROM_LECTERN, 0, CHEST, stats)) {
                return 'priest-tower lectern at ' + bx + ',' + by + ',' + bz + ' with both tower chests (tables gone)'
              }
            } else if (id === JIGSAW) {
              // raw jigsaw => a `place template` leftover; confirm it is this template
              if (idAt(level, bx - JIGSAW_AT[0] + LECTERN_AT[0], by - JIGSAW_AT[1] + LECTERN_AT[1],
                       bz - JIGSAW_AT[2] + LECTERN_AT[2], stats) === LECTERN) {
                return 'script-placed tower (template jigsaw at ' + bx + ',' + by + ',' + bz + ')'
              }
            }
          }
        } catch (e) {
          stats.errors++   // API miss on one chunk: keep scanning, but the pass is inconclusive
        }
      }
    }
    log('scanned ' + chunks + ' chunks around spawn: no priest tower' +
        (stats.errors > 0 ? ' (' + stats.errors + ' read error(s))' : ''))
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

  // Returns the placement corner {x, y, z} on success, or null.
  var placeTower = function (server, level, sp) {
    var candidates = candidateSites(sp)
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
    return result > 0 ? best : null
  }

  var runGuarantee = function (server) {
    var pd = server.persistentData
    if (pd.getBoolean(FLAG)) return

    var attempts = pd.getInt(ATTEMPTS_KEY)
    if (attempts >= MAX_ATTEMPTS) {
      log('giving up after ' + attempts + ' attempts - flagging done WITHOUT placing ' +
          '(remove "' + FLAG + '" and "' + ATTEMPTS_KEY + '" from the server persistent data to re-arm)')
      pd.putBoolean(FLAG, true)
      return
    }

    var level = server.overworld()
    var sp = level.getSharedSpawnPos()
    var stats = { errors: 0 }

    var found = findPlacedTower(level, sp, stats)
    if (!found) found = findTowerInVillage(level, sp, stats)
    if (found) {
      log('tower already present: ' + found + ' - flagging done')
      pd.putBoolean(FLAG, true)
      return
    }

    // From here on this boot counts as an attempt (bounded by MAX_ATTEMPTS).
    pd.putInt(ATTEMPTS_KEY, attempts + 1)

    if (stats.errors > 0) {
      log('WARN: detection was inconclusive (' + stats.errors + ' read error(s)) - NOT placing; ' +
          'will look again next boot (attempt ' + (attempts + 1) + '/' + MAX_ATTEMPTS + ')')
      return
    }

    var placed = placeTower(server, level, sp)
    if (!placed) {
      log('WARN: place command failed - nothing was placed; will retry next boot (attempt ' +
          (attempts + 1) + '/' + MAX_ATTEMPTS + ')')
      return
    }

    // `place` succeeded: the tower exists. Flag FIRST, unconditionally — the
    // check below is a log line only and can never cause another placement.
    pd.putBoolean(FLAG, true)
    var check = { errors: 0 }
    var tableId = idAt(level, placed.x + TABLE_A[0], placed.y + TABLE_A[1], placed.z + TABLE_A[2], check)
    if (tableId === SIGNATURE) {
      log('tower placed + verified (inscription table at ' + (placed.x + TABLE_A[0]) + ',' +
          (placed.y + TABLE_A[1]) + ',' + (placed.z + TABLE_A[2]) + ') - flagged done')
    } else {
      log('WARN: tower placed and flagged done, but the block at the table offset reads "' +
          tableId + '" (template changed upstream?)')
    }
  }

  ServerEvents.loaded(function (event) {
    var server = event.server
    server.scheduleInTicks(START_DELAY_TICKS, function () {
      try {
        runGuarantee(server)
      } catch (e) {
        console.error('[PRIEST-TOWER] guarantee pass threw: ' + e)
      }
    })
  })

  console.log('[PRIEST-TOWER] spawn-village guarantee armed (signature: ' + SIGNATURE + ')')
})()
