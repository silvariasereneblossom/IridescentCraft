// =============================================================================
// icboot_worldgen.js - SANDBOX ONLY
// =============================================================================
// Copied by .minecraft/dev/boot (icboot.py) into the offline boot rig's
// kubejs/server_scripts and nowhere else. It must never sit in a distro tree:
// it generates chunks on the server thread.
//
// Why: the game sorts the placed features of ALL biomes of a dimension into one
// order the first time a chunk of that dimension is decorated. Two biomes that
// list two features in opposite orders, or one biome that lists a feature twice
// in a step, make that sort throw ("Feature order cycle found"), and then no
// chunk of the dimension can generate. Nothing says so until somebody enters
// the dimension. This helper asks every dimension at every boot of the rig.
//
// PART 1, 40 ticks after the world loaded (read-only, no chunk is touched):
//   worldgen_analysis.json   per dimension: the chunk generator, the biomes of its
//                            biome source, per biome and generation step the placed
//                            features in order AS THE GAME HOLDS THEM (after Forge
//                            biome modifiers), and the verdict of the game's own
//                            FeatureSorter on exactly those lists.
// PART 2, on the console command `icboot_worldgen` (sent by icboot.py after its
// measurements), one target per tick:
//   worldgen.json            per target: the chunk, its biome, ok / failed / skipped,
//                            the stage it failed in, the time taken (rewritten after
//                            every target, so a server that dies leaves what it had)
//   worldgen_done.json       written last: the tool waits for it
// The targets: one chunk per dimension, FAR_CHUNKS chunks from the world spawn on
// both axes (nothing has been generated there), plus what worldgen_request.json
// asks for: {"force": bool, "extra": [{dim, x, z, radius, label} |
// {dim, structure, x, z, search, radius, label}]} (blocks; radius in chunks).
//
// A chunk is asked for in two steps. First up to FEATURES: every placed feature
// has run, and a failure up to there comes back as an exception and leaves the
// level able to tick. Then up to FULL. (A chunk that fails on its way to FULL
// when FULL was asked for at once makes the level's next save pass throw, and
// the server crashes: that is what a player entering a broken dimension does.)
// A dimension whose feature order has a cycle is not asked at all, unless the
// request says "force": every chunk of it fails.
//
// It never logs at WARN or ERROR: what it finds is in its files, and icboot.py
// turns that into the findings. Engine rules kept on purpose: `var` only,
// String(x) around every Java string, explicit loops, one try per section.
// =============================================================================

(function () {
  var OUT = 'icboot-out/'
  var TAG = '[icboot] worldgen: '
  var DELAY_TICKS = 40
  var FAR_CHUNKS = 50
  var BLOCK_TALLY_LIMIT = 8000

  var ArrayList = Java.loadClass('java.util.ArrayList')
  var HashMap = Java.loadClass('java.util.HashMap')
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var Registries = Java.loadClass('net.minecraft.core.registries.Registries')
  var FeatureSorter = Java.loadClass('net.minecraft.world.level.biome.FeatureSorter')
  var ChunkStatus = Java.loadClass('net.minecraft.world.level.chunk.ChunkStatus')
  var BlockPos = Java.loadClass('net.minecraft.core.BlockPos')
  var HolderSet = Java.loadClass('net.minecraft.core.HolderSet')
  var ResourceKey = Java.loadClass('net.minecraft.resources.ResourceKey')
  var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

  var state = { verdicts: {}, running: false }

  var listOf = function (collection) {
    return new ArrayList(collection)
  }

  var keyOf = function (holder) {
    var k = holder.unwrapKey()
    return k.isPresent() ? String(k.get().location()) : null
  }

  var dimensionIds = function (server) {
    var ids = []
    var keys = listOf(server.levelKeys())
    for (var i = 0; i < keys.size(); i++) ids.push(String(keys.get(i).location()))
    ids.sort()
    return ids
  }

  // the exception and its causes, outermost first (the engine hands a script the outermost only)
  var errorChain = function (err) {
    var out = [String(err)]
    try {
      var t = null
      if (err && err.javaException) t = err.javaException
      else if (err && typeof err.getCause === 'function') t = err
      var n = 0
      while (t && n < 8) {
        var line = String(t)
        if (out.indexOf(line) < 0) out.push(line)
        t = t.getCause()
        n++
      }
    } catch (ignored) {
      // swallow-ok: the first line is what there is
    }
    return out
  }

  // ---------------------------------------------------------------------------
  // PART 1: the feature lists, and the game's own verdict on them
  // ---------------------------------------------------------------------------
  var describeUnregistered = function (placed) {
    try {
      var configured = placed.feature()
      var key = keyOf(configured)
      if (key !== null) return 'of configured feature ' + key
      return 'of feature type ' + String(BuiltInRegistries.FEATURE.getKey(configured.value().feature()))
    } catch (err) {
      return 'unknown: ' + err
    }
  }

  var sorterVerdict = function (holders, generator) {
    try {
      FeatureSorter.buildFeaturesPerStep(holders, function (h) {
        return generator.getBiomeGenerationSettings(h).features()
      }, true)
      return { verdict: 'ok' }
    } catch (err) {
      var text = String(err)
      return { verdict: text.indexOf('Feature order cycle') >= 0 ? 'cycle' : 'error', message: text }
    }
  }

  var analyse = function (server) {
    // FeatureSorter tells two placed features apart by equals(): two ids with the same configured
    // feature and the same placement objects are ONE feature to it. `eq` is that identity.
    var eqIndex = new HashMap()
    var eqCount = 0
    var fidOf = {}
    var features = []
    var dims = {}
    var ids = dimensionIds(server)
    for (var d = 0; d < ids.length; d++) {
      var rec = { biomes: [] }
      try {
        var level = server.getLevel(ids[d])
        var generator = level.getChunkSource().getGenerator()
        var source = generator.getBiomeSource()
        rec.generator = String(generator.getClass().getName())
        rec.biome_source = String(source.getClass().getName())
        var holders = listOf(source.possibleBiomes())
        for (var b = 0; b < holders.size(); b++) {
          var biome = holders.get(b)
          var steps = []
          var perStep = generator.getBiomeGenerationSettings(biome).features()
          for (var s = 0; s < perStep.size(); s++) {
            var set = perStep.get(s)
            var row = []
            for (var k = 0; k < set.size(); k++) {
              var holder = set.get(k)
              var placed = holder.value()
              var eq = eqIndex.get(placed)
              if (eq == null) {
                eq = eqCount++
                eqIndex.put(placed, eq)
              } else {
                eq = Number(eq)
              }
              var id = keyOf(holder)
              var label = id !== null ? id : '(not registered, ' + describeUnregistered(placed) + ', #' + eq + ')'
              var fid = fidOf[label]
              if (fid === undefined) {
                fid = features.length
                fidOf[label] = fid
                features.push({ id: label, eq: eq, registered: id !== null })
              }
              row.push(fid)
            }
            steps.push(row)
          }
          var bid = keyOf(biome)
          rec.biomes.push({ id: bid !== null ? bid : '(not registered biome #' + b + ')', steps: steps })
        }
        rec.sorter = sorterVerdict(holders, generator)
      } catch (err) {
        rec.error = String(err)
        rec.sorter = { verdict: 'error', message: 'the helper could not read this dimension: ' + err }
      }
      state.verdicts[ids[d]] = rec.sorter.verdict
      dims[ids[d]] = rec
    }
    return { features: features, dimensions: dims }
  }

  // ---------------------------------------------------------------------------
  // PART 2: new chunks
  // ---------------------------------------------------------------------------
  var readRequest = function () {
    var req = { force: false, extra: [] }
    try {
      var raw = JsonIO.read(OUT + 'worldgen_request.json')
      if (raw == null) return req
      req.force = String(raw.get('force')) === 'true'
      var extra = raw.get('extra')
      if (extra != null) {
        var list = listOf(extra)
        for (var i = 0; i < list.size(); i++) {
          var e = list.get(i)
          var num = function (name, fallback) {
            var v = e.get(name)
            return v == null ? fallback : Number(v)
          }
          var str = function (name) {
            var v = e.get(name)
            return v == null ? null : String(v)
          }
          req.extra.push({ dim: str('dim'), structure: str('structure'), x: num('x', 0), z: num('z', 0),
            radius: num('radius', 0), search: num('search', 100), label: str('label') })
        }
      }
    } catch (err) {
      req.error = String(err)
    }
    return req
  }

  var startsOf = function (level, chunk) {
    var out = []
    try {
      var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE)
      var entries = listOf(chunk.getAllStarts().entrySet())
      for (var i = 0; i < entries.size(); i++) {
        var e = entries.get(i)
        if (e.getValue().isValid()) out.push(String(reg.getKey(e.getKey())))
      }
      out.sort()
    } catch (err) {
      out.push('(could not read: ' + err + ')')
    }
    return out
  }

  var generate = function (level, cx, cz) {
    var cs = level.getChunkSource()
    var out = { chunk: [cx, cz] }
    var t0 = Date.now()
    try {
      out.biome = keyOf(level.getBiome(new BlockPos(cx * 16 + 8, 64, cz * 16 + 8)))
    } catch (err) {
      // swallow-ok: the biome is information only; the chunk request below is the test
      out.biome = null
    }
    out.was_loaded = Boolean(cs.hasChunk(cx, cz))
    var stage = 'features'
    try {
      cs.getChunk(cx, cz, ChunkStatus.FEATURES, true)
      stage = 'full'
      var chunk = cs.getChunk(cx, cz, ChunkStatus.FULL, true)
      out.status = 'ok'
      out.starts = startsOf(level, chunk)
    } catch (err) {
      out.status = 'failed'
      out.stage = stage
      out.error = errorChain(err)
    }
    out.millis = Date.now() - t0
    return out
  }

  var locate = function (level, id, x, z, search) {
    var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE)
    var found = reg.getHolder(ResourceKey.create(Registries.STRUCTURE, new ResourceLocation(id)))
    if (!found.isPresent()) return { error: 'no structure ' + id + ' is registered' }
    var one = new ArrayList()
    one.add(found.get())
    var pair = level.getChunkSource().getGenerator().findNearestMapStructure(level, HolderSet.direct(one), new BlockPos(x, 64, z), search, false)
    if (pair == null) return { error: 'no ' + id + ' within ' + search + ' chunks of ' + x + ' ' + z }
    var p = pair.getFirst()
    return { x: Number(p.getX()), z: Number(p.getZ()) }
  }

  // what a located structure left in the world: its pieces, its box, and the blocks inside its first pieces
  // (read only where a chunk is loaded: reading a block elsewhere would generate that chunk)
  var structureEvidence = function (level, id, cx, cz) {
    var out = {}
    try {
      var reg = level.registryAccess().registryOrThrow(Registries.STRUCTURE)
      var cs = level.getChunkSource()
      var start = cs.getChunk(cx, cz, ChunkStatus.FULL, true).getStartForStructure(reg.get(new ResourceLocation(id)))
      if (start == null || !start.isValid()) {
        out.start = 'no valid start of ' + id + ' in chunk ' + cx + ' ' + cz
        return out
      }
      var box = start.getBoundingBox()
      var pieces = listOf(start.getPieces())
      out.pieces = Number(pieces.size())
      out.box = [Number(box.minX()), Number(box.minY()), Number(box.minZ()), Number(box.maxX()), Number(box.maxY()), Number(box.maxZ())]
      var tally = {}
      var read = 0
      var skipped = 0
      for (var i = 0; i < pieces.size() && read < BLOCK_TALLY_LIMIT; i++) {
        var pb = pieces.get(i).getBoundingBox()
        for (var x = Number(pb.minX()); x <= Number(pb.maxX()) && read < BLOCK_TALLY_LIMIT; x++) {
          for (var z = Number(pb.minZ()); z <= Number(pb.maxZ()) && read < BLOCK_TALLY_LIMIT; z++) {
            if (!cs.hasChunk(x >> 4, z >> 4)) {
              skipped++
              continue
            }
            for (var y = Number(pb.minY()); y <= Number(pb.maxY()) && read < BLOCK_TALLY_LIMIT; y++) {
              var name = String(BuiltInRegistries.BLOCK.getKey(level.getBlockState(new BlockPos(x, y, z)).getBlock()))
              tally[name] = (tally[name] || 0) + 1
              read++
            }
          }
        }
      }
      out.blocks_read = read
      out.columns_outside_generated_chunks = skipped
      out.blocks = tally
    } catch (err) {
      out.error = String(err)
    }
    return out
  }

  var processTarget = function (server, target, force) {
    var res = { dim: target.dim, label: target.label, kind: target.kind }
    var t0 = Date.now()
    var verdict = state.verdicts[target.dim]
    if (verdict === undefined) {
      res.status = 'failed'
      res.stage = 'request'
      res.error = ['no dimension ' + target.dim + ' on this server']
      return res
    }
    if (verdict !== 'ok' && !force) {
      res.status = 'skipped'
      res.why = verdict === 'cycle' ? 'its feature order has a cycle: every chunk of this dimension fails' : 'its feature lists could not be read'
      return res
    }
    var level = server.getLevel(target.dim)
    var cx = target.cx
    var cz = target.cz
    if (target.structure) {
      res.structure = target.structure
      var at = locate(level, target.structure, target.x, target.z, target.search)
      if (at.error) {
        res.status = 'failed'
        res.stage = 'locate'
        res.error = [at.error]
        res.millis = Date.now() - t0
        return res
      }
      res.located = [at.x, at.z]
      cx = at.x >> 4
      cz = at.z >> 4
    }
    res.chunk = [cx, cz]
    res.radius = target.radius
    res.chunks = []
    res.status = 'ok'
    var biomes = {}
    var starts = {}
    // the centre first: it is the chunk the target names
    var order = [[0, 0]]
    for (var dx = -target.radius; dx <= target.radius; dx++) {
      for (var dz = -target.radius; dz <= target.radius; dz++) {
        if (dx !== 0 || dz !== 0) order.push([dx, dz])
      }
    }
    for (var i = 0; i < order.length; i++) {
      var one = generate(level, cx + order[i][0], cz + order[i][1])
      res.chunks.push([one.chunk[0], one.chunk[1], one.status])
      if (one.biome) biomes[one.biome] = true
      if (one.was_loaded) res.was_loaded = true
      if (one.starts) for (var s = 0; s < one.starts.length; s++) starts[one.starts[s]] = true
      if (one.status !== 'ok') {
        res.status = 'failed'
        res.stage = one.stage
        res.error = one.error
        res.failed_chunk = one.chunk
        break
      }
    }
    res.biomes = Object.keys(biomes).sort()
    res.starts = Object.keys(starts).sort()
    if (target.structure && res.status === 'ok') res.evidence = structureEvidence(level, target.structure, cx, cz)
    res.millis = Date.now() - t0
    return res
  }

  var run = function (server) {
    if (state.running) return
    state.running = true
    var t0 = Date.now()
    var req = readRequest()
    var sp = server.overworld().getSharedSpawnPos()
    var fx = (Number(sp.getX()) >> 4) + FAR_CHUNKS
    var fz = (Number(sp.getZ()) >> 4) + FAR_CHUNKS
    var targets = []
    var ids = dimensionIds(server)
    for (var i = 0; i < ids.length; i++) {
      targets.push({ dim: ids[i], kind: 'dimension', label: 'one new chunk', cx: fx, cz: fz, radius: 0 })
    }
    for (var j = 0; j < req.extra.length; j++) {
      var e = req.extra[j]
      targets.push({ dim: e.dim, kind: 'extra', label: e.label || (e.structure ? e.structure : 'block ' + e.x + ' ' + e.z),
        structure: e.structure, x: e.x, z: e.z, cx: e.x >> 4, cz: e.z >> 4, radius: e.radius, search: e.search })
    }
    var results = []
    var write = function (done) {
      JsonIO.write(OUT + 'worldgen.json', { data: { targets: results, asked: targets.length, force: req.force,
        request_error: req.error || null, spawn: [Number(sp.getX()), Number(sp.getZ())], far_chunk: [fx, fz],
        millis: Date.now() - t0, finished: done } })
    }
    var n = 0
    var step = function () {
      try {
        if (n >= targets.length) {
          write(true)
          JsonIO.write(OUT + 'worldgen_done.json', { targets: results.length, millis: Date.now() - t0 })
          console.log(TAG + 'finished, ' + results.length + ' target(s) in ' + (Date.now() - t0) + ' ms')
          return
        }
        var target = targets[n++]
        console.log(TAG + 'start ' + n + '/' + targets.length + ' ' + target.dim + ' (' + target.label + ')')
        var res
        try {
          res = processTarget(server, target, req.force)
        } catch (err) {
          res = { dim: target.dim, label: target.label, kind: target.kind, status: 'failed', stage: 'helper', error: errorChain(err) }
        }
        results.push(res)
        write(false)
        console.log(TAG + 'end ' + n + '/' + targets.length + ' ' + target.dim + ' ' + res.status +
          (res.chunk ? ' chunk ' + res.chunk[0] + ' ' + res.chunk[1] : '') + (res.stage ? ' at ' + res.stage : '') +
          (res.millis !== undefined ? ' in ' + res.millis + ' ms' : ''))
      } catch (err) {
        console.log(TAG + 'helper failed: ' + err)
      }
      server.scheduleInTicks(1, step)
    }
    console.log(TAG + targets.length + ' target(s), the far chunk is ' + fx + ' ' + fz + (req.force ? ', forced' : ''))
    server.scheduleInTicks(1, step)
  }

  ServerEvents.loaded(function (event) {
    var server = event.server
    server.scheduleInTicks(DELAY_TICKS, function () {
      var t0 = Date.now()
      try {
        var data = analyse(server)
        JsonIO.write(OUT + 'worldgen_analysis.json', { data: data })
        var bad = []
        for (var id in state.verdicts) if (state.verdicts[id] !== 'ok') bad.push(id)
        console.log(TAG + 'feature order read for ' + Object.keys(data.dimensions).length + ' dimension(s) in ' + (Date.now() - t0) +
          ' ms; the game finds a cycle or an error in ' + bad.length + (bad.length ? ': ' + bad.join(', ') : ''))
      } catch (err) {
        JsonIO.write(OUT + 'worldgen_analysis.json', { error: String(err) })
        console.log(TAG + 'feature order analysis failed: ' + err)
      }
    })
  })

  ServerEvents.commandRegistry(function (event) {
    var Commands = event.commands
    event.register(Commands.literal('icboot_worldgen').requires(function (source) {
      return source.hasPermission(4)
    }).executes(function (ctx) {
      run(ctx.source.getServer())
      return 1
    }))
  })
})()
