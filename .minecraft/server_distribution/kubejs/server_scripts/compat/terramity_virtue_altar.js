// @file kubejs/server_scripts/compat/terramity_virtue_altar.js
// @events EntityEvents.spawned, tick.server
// @live virtue-altar-refused, virtue-altar-summon
// =============================================================================
// Virtue's altar is the Prismatic Pond in the Aether: an Unholy Lance thrown
// into (or within 4 blocks of) a pond's prism solution summons Virtue there.
// A lance thrown in the Overworld summons nothing, comes back to its thrower,
// and a chat line says where the altar is.
// =============================================================================
// Ruled 2026-10-16 (Aether to tier 4, round 2, "Lance into the pond", V2 of the
// scope in the internal repo, design/scope-aether-to-tier-4-2026-10-15.md 7.2).
//
// What Terramity 0.9.8 does (read from the jar):
//   - the throw (UnholyLanceItem) empties the hand and shoots a
//     terramity:unholy_lance_projectile;
//   - the projectile counts its flight in its Forge persistent data ("timer",
//     +1 a tick); when it reaches 20 it runs UnholyLanceProcProcedure and is
//     then DISCARDED, in every dimension (the lance is used up);
//   - the procedure summons only in the Overworld under open sky: rumble at
//     once, Trembling (205 ticks) on every living thing within 35 blocks 20
//     ticks later, the shatter sound at 203, Virtue (EntityType.spawn,
//     MOB_SUMMONED) at 225;
//   - a projectile that hits a block first is discarded and drops the lance
//     as an item; the prism solution plays no part anywhere.
//
// What this file does, from the projectile's join (no Forge event of the mod
// is visible to a script):
//   - Aether: while a lance is in flight, the blocks within REACH of where it
//     is and where it goes next are searched for prism solution. Found, the
//     projectile is discarded and the mod's sequence runs from here, with the
//     mod's numbers, at the lance's spot (raised out of the pond). A lance
//     that hits the pond floor in one tick is caught by its removal near the
//     prism solution; the lance item the mod dropped for it is taken back.
//   - Overworld: one tick before the mod's timer would run, the projectile is
//     discarded and the lance is given back (or dropped where it was when the
//     thrower is gone). Under open sky or not: the sky test moves with the
//     lance, so the refusal does not guess it.
//   - Anywhere else, the mod is left as it is (the lance is used up at 20);
//     the thrower gets the chat line one tick before.
// =============================================================================
;(function () {
  if (!icraft.lib.need('core', 'compat/terramity_virtue_altar') ||
      !icraft.lib.need('ticks', 'compat/terramity_virtue_altar')) return
  var core = global.icraft.core

  var LANCE = 'terramity:unholy_lance_projectile'
  var LANCE_ITEM = 'terramity:unholy_lance'
  var VIRTUE = 'terramity:virtue'
  var PRISM = 'terramity:prism_solution'
  var ALTAR_DIM = 'aether:the_aether'
  var REFUSE_DIM = 'minecraft:overworld'
  var REACH = 4            // blocks around the lance searched for prism solution
  var MOD_TIMER = 20       // the projectile runs the summon (and is discarded) at this timer
  // the mod's sequence after the summon procedure, in ticks from it
  var T_TREMBLE = 20
  var T_SHATTER = 203
  var T_SPAWN = 225
  var TREMBLE_TICKS = 205
  var TREMBLE_RADIUS = 35
  var SOUND_VOLUME = 7

  var WHERE = 'Virtue answers the Unholy Lance only at a Prismatic Pond, in the Deep Aether forests of the Aether: ' +
    'throw the lance into the pond’s prism solution.'

  var J = function (name) {
    try { return Java.loadClass(name) } catch (e) {
      core.warnOnce('virtue_altar:class:' + name, '[virtue_altar] Java.loadClass(' + name + ') failed: ' + e)
      return null
    }
  }
  var BlockPos = J('net.minecraft.core.BlockPos')
  var MutableBlockPos = J('net.minecraft.core.BlockPos$MutableBlockPos')
  var ResourceLocation = J('net.minecraft.resources.ResourceLocation')
  var BuiltInRegistries = J('net.minecraft.core.registries.BuiltInRegistries')
  var MobSpawnType = J('net.minecraft.world.entity.MobSpawnType')
  if (!BlockPos || !MutableBlockPos || !ResourceLocation || !BuiltInRegistries || !MobSpawnType) {
    console.error('[virtue_altar] a class could not be loaded: the lance is left to Terramity (Virtue in the Overworld)')
    return
  }

  var prismBlock = null
  var virtueType = null
  var lookups = function () {
    if (prismBlock && virtueType) return true
    prismBlock = BuiltInRegistries.BLOCK.get(new ResourceLocation(PRISM))
    virtueType = BuiltInRegistries.ENTITY_TYPE.get(new ResourceLocation(VIRTUE))
    if (String(BuiltInRegistries.BLOCK.getKey(prismBlock)) !== PRISM || String(BuiltInRegistries.ENTITY_TYPE.getKey(virtueType)) !== VIRTUE) {
      core.warnOnce('virtue_altar:lookups', '[virtue_altar] ' + PRISM + ' or ' + VIRTUE + ' is not registered: the altar cannot work')
      prismBlock = null
      virtueType = null
      return false
    }
    return true
  }

  // lances in flight: { e, dim, x, y, z (last seen), seen (server ticks tracked), timed (the mod's timer moved), done }
  var flying = []

  var dimOf = function (level) { return String(level.dimension) }

  // The mod's own count of the projectile's ticks. Immersive Optimization ticks a lance far from every player
  // less often than the server ticks, so server ticks are counted only while that timer was never seen moving
  // (an unreadable timer); at full speed one server tick is one projectile tick.
  var timerOf = function (rec) {
    var data = core.forgeData(rec.e)
    var t = data ? Number(data.getDouble('timer')) : NaN
    if (t === t && t > 0) rec.timed = true
    if (rec.timed) return t === t ? t : rec.seen
    if (rec.seen >= MOD_TIMER - 1) {
      core.warnOnce('virtue_altar:timer', '[virtue_altar] a lance’s "timer" (Forge persistent data) never moved: server ticks are counted instead')
    }
    return rec.seen
  }

  // the first prism solution block in the box around two points, or null
  var prismNear = function (level, x1, y1, z1, x2, y2, z2) {
    var mp = new MutableBlockPos()
    var ax = Math.floor(Math.min(x1, x2)) - REACH, bx = Math.floor(Math.max(x1, x2)) + REACH
    var ay = Math.floor(Math.min(y1, y2)) - REACH, by = Math.floor(Math.max(y1, y2)) + REACH
    var az = Math.floor(Math.min(z1, z2)) - REACH, bz = Math.floor(Math.max(z1, z2)) + REACH
    for (var x = ax; x <= bx; x++) {
      for (var z = az; z <= bz; z++) {
        for (var y = ay; y <= by; y++) {
          mp.set(x, y, z)
          if (!level.isLoaded(mp)) continue
          if (level.getBlockState(mp).is(prismBlock)) return { x: x, y: y, z: z }
        }
      }
    }
    return null
  }

  var ownerOf = function (lance) {
    try {
      var o = lance.getOwner()
      return o && core.isPlayer(o) ? o : null
    } catch (e) {
      core.warnOnce('virtue_altar:owner', '[virtue_altar] the lance’s owner could not be read: ' + e)
      return null
    }
  }

  var tell = function (player, text) {
    if (!player) return
    try { player.tell(Text.gold(text)) } catch (e) {
      core.warnOnce('virtue_altar:tell', '[virtue_altar] a chat line could not be sent: ' + e)
    }
  }

  var command = function (server, dim, cmd) {
    try { server.runCommandSilent('execute in ' + dim + ' run ' + cmd) } catch (e) {
      core.warnOnce('virtue_altar:cmd', '[virtue_altar] the command `' + cmd + '` threw: ' + e)
    }
  }

  var sound = function (server, dim, id, x, y, z, pitch) {
    command(server, dim, 'playsound ' + id + ' hostile @a ' + x + ' ' + y + ' ' + z + ' ' + SOUND_VOLUME + ' ' + pitch)
  }

  var particles = function (server, dim, id, x, y, z) {
    command(server, dim, 'particle ' + id + ' ' + x + ' ' + y + ' ' + z + ' 0 0 0 0.15 60 force')
  }

  // the lance item the mod drops when the projectile hits a block, near where it fell
  var takeBackDrop = function (level, x, y, z) {
    var taken = 0
    level.getEntitiesWithin(AABB.of(x - 2, y - 2, z - 2, x + 2, y + 2, z + 2)).forEach(function (en) {
      if (taken > 0 || core.entityId(en) !== 'minecraft:item') return
      if (Number(en.age) > 3 || String(en.item.id) !== LANCE_ITEM) return
      en.discard()
      taken++
    })
    return taken
  }

  // Terramity's summon sequence, at a spot of the altar
  var summon = function (level, x, y, z) {
    var server = level.server
    var dim = dimOf(level)
    // out of the pond (or a block) to the first open block above, at most 6 up
    var bx = Math.floor(x), bz = Math.floor(z), by = Math.floor(y)
    var mp = new MutableBlockPos()
    for (var i = 0; i < 6; i++) {
      mp.set(bx, by, bz)
      if (level.getBlockState(mp).isAir()) break
      by++
    }
    var sx = bx + 0.5, sy = by, sz = bz + 0.5
    particles(server, dim, 'terramity:stygian_particle', sx, sy, sz)
    particles(server, dim, 'terramity:evil_glint', sx, sy, sz)
    sound(server, dim, 'terramity:hexed', sx, sy, sz, 0.5)
    sound(server, dim, 'terramity:sword_pull', sx, sy, sz, 0.7)
    sound(server, dim, 'terramity:lance_rumble', sx, sy, sz, 1)
    server.scheduleInTicks(T_TREMBLE, function () {
      level.getEntitiesWithin(AABB.of(sx - TREMBLE_RADIUS, sy - TREMBLE_RADIUS, sz - TREMBLE_RADIUS,
        sx + TREMBLE_RADIUS, sy + TREMBLE_RADIUS, sz + TREMBLE_RADIUS)).forEach(function (en) {
        if (!en.living) return
        try { en.potionEffects.add('terramity:trembling', TREMBLE_TICKS, 0, true, false) } catch (e) {
          core.warnOnce('virtue_altar:tremble', '[virtue_altar] Trembling could not be given: ' + e)
        }
      })
    })
    server.scheduleInTicks(T_SHATTER, function () {
      sound(server, dim, 'terramity:lance_shatter', sx, sy, sz, 1)
    })
    server.scheduleInTicks(T_SPAWN, function () {
      particles(server, dim, 'terramity:shattered_glass', sx, sy, sz)
      var at = new BlockPos(bx, by, bz)
      if (!level.isLoaded(at)) {
        console.warn('[virtue_altar] the altar at ' + bx + ' ' + by + ' ' + bz + ' in ' + dim + ' was unloaded before Virtue came: no Virtue')
        return
      }
      var v = virtueType.spawn(level, at, MobSpawnType.MOB_SUMMONED)
      if (!v) {
        console.warn('[virtue_altar] Terramity refused to spawn Virtue at ' + bx + ' ' + by + ' ' + bz + ' in ' + dim)
        return
      }
      v.setMotion(0, 0, 0)
      console.info('[virtue_altar] Virtue summoned at ' + bx + ' ' + by + ' ' + bz + ' in ' + dim)
    })
    icraft.live.fired('virtue-altar-summon')
  }

  var refuse = function (rec) {
    var lance = rec.e
    var level = lance.level
    var owner = ownerOf(lance)
    var x = Number(lance.x), y = Number(lance.y), z = Number(lance.z)
    lance.discard()
    if (owner) {
      owner.give(Item.of(LANCE_ITEM))
    } else {
      level.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)).popItem(Item.of(LANCE_ITEM))
    }
    tell(owner, 'The Unholy Lance falls back to you: Virtue cannot be called in the Overworld. ' + WHERE)
    icraft.live.fired('virtue-altar-refused')
  }

  EntityEvents.spawned(LANCE, icraft.guard('compat/terramity_virtue_altar', 'EntityEvents.spawned', function (event) {
    var e = event.entity
    flying.push({ e: e, dim: dimOf(event.level), x: Number(e.x), y: Number(e.y), z: Number(e.z), seen: 0, done: false })
  }))

  global.registerServerTick('tick_virtueAltar', 1, 0, function (event) {
    if (flying.length === 0) return
    if (!lookups()) { flying = []; return }
    var keep = []
    for (var i = 0; i < flying.length; i++) {
      var rec = flying[i]
      if (rec.done) continue
      var lance = rec.e
      if (lance.isRemoved()) {
        var why = String(lance.getRemovalReason())
        // a flight ended by a block or a hit; a lance unloaded with its chunk joins again when it loads
        if (rec.dim === ALTAR_DIM && (why === 'DISCARDED' || why === 'KILLED')) {
          var level0 = lance.level
          if (prismNear(level0, rec.x, rec.y, rec.z, rec.x, rec.y, rec.z)) {
            takeBackDrop(level0, rec.x, rec.y, rec.z)
            summon(level0, rec.x, rec.y, rec.z)
          }
        }
        continue
      }
      rec.seen++
      var level = lance.level
      var dim = dimOf(level)
      rec.dim = dim
      var x = Number(lance.x), y = Number(lance.y), z = Number(lance.z)
      rec.x = x; rec.y = y; rec.z = z
      if (dim === ALTAR_DIM) {
        // where the lance goes next tick (motionX/Y/Z: KubeJS's getters; the Vec3 is not read)
        var nx = x + core.finite(lance.motionX, 0), ny = y + core.finite(lance.motionY, 0), nz = z + core.finite(lance.motionZ, 0)
        if (prismNear(level, x, y, z, nx, ny, nz)) {
          rec.done = true
          lance.discard()
          summon(level, x, y, z)
          continue
        }
      }
      if (timerOf(rec) >= MOD_TIMER - 1) {
        rec.done = true
        if (dim === REFUSE_DIM) {
          refuse(rec)
        } else {
          tell(ownerOf(lance), 'The Unholy Lance shatters without an altar. ' + WHERE)
        }
        continue
      }
      keep.push(rec)
    }
    flying = keep
  })
})()
