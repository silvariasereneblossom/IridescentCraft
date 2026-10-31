// @file kubejs/server_scripts/compat/ub_tick_gate.js
// @events EntityEvents.spawned, PlayerEvents.loggedIn, tick.server
// @live ub-tick-gate
// =============================================================================
// Ultimate Bosses only runs the parts of its tick that have something loaded
// to act on; its bosses, towers and special mobs behave exactly as before.
// =============================================================================
// RAM and lag audit 2026-10-30, option A of reports/datapack-bosses-scope.md
// (internal repo, dev/ram-audit-2026-10-30). Ultimate Bosses 1.0.4 (All Rights
// Reserved) is a datapack: its ub:tick calls seven functions every tick, and
// together they scan every loaded entity of every dimension about 275 times per
// tick while no boss exists (about 2.9 us per loaded entity per tick on the
// boot rig). Our kubejs/data/ub/functions/tick.mcfunction calls the same seven
// function ids in the same order, each only while its family is open. This
// file opens and closes the families: one score per family in the objective
// icraft_gate.
//
//   holder      function (UB 1.0.4)      open while one of these is loaded
//   #ub_eye     ub:boss/eye              tag eye_of_fire; a blaze without the tag
//                                        `counted` (the Eye's spawn counter)
//   #ub_angel   ub:boss/lostangel        tags lostangel, explode, explode1,
//                                        healer, lostangelspawn (tower marker)
//   #ub_storm   ub:boss/storm            tags cloud, tornado, particles, s,
//                                        cloudm, cloudspawn (tower marker)
//   #ub_circle  ub:alchemy_circles/tick  tags red_circle1, red_circle2, sorcc
//   #ub_sorc    ub:boss/sorcerer         tags kill1, red_circle1, red_circle2,
//                                        sorcc, inv
//   #ub_extras  ub:extras/tick           tag sorcc (tower marker)
//   #ub_mobs    ub:mobs/ticking          a blaze, camel, drowned, enderman,
//                                        evoker, phantom, pillager, shulker,
//                                        skeleton, stray, witch or zombie
//                                        without the tag `nocusmob`; or any
//                                        player online (its spawn lines run
//                                        `at @a`)
//
// Why that is the same behaviour (every line of the four boss files, the circle,
// extras and mobs files read, 2026-10-30):
//   - every line acts only through one of its family's entities, except the
//     bossbar clears and the music stops (`stopsound`), which act when the boss
//     is gone. A family therefore stays open LINGER ticks after its last entity
//     left, and those lines run as they did;
//   - `effect give @e[tag=inv]` in the Sorcerer file acts on anything tagged
//     inv. Nothing in the pack sets that tag; it opens the family all the same;
//   - the one line that acts with no family at all, the Lost Angel's Slowness
//     within 2 blocks of world spawn, is kept by the override itself;
//   - every anchor tag above is set in summon or structure NBT, never added to
//     an existing entity (UB 1.0.4, and no other jar, datapack or script of the
//     pack adds one), and EntityEvents.spawned fires for every join, an entity
//     loaded with its chunk included. A join opens its family at once, also
//     when a function of the same tick summoned it, so a later function of
//     that tick sees it, as before. A player's login opens #ub_mobs the same way.
//   - removals are noticed at the end of the tick (Entity.isRemoved: death,
//     unload, dimension change). Every rebuild (after a load or /reload, then
//     every REBUILD_TICKS) lists every loaded entity again, so nothing missed
//     stays missed.
//
// Fail-open: #ub_ttl is set to TTL at the end of every tick and the override
// counts it down before it reads the gates. When this file stops (an error, a
// script that did not load) or the objective is removed, the override runs all
// seven functions ungated from the next tick on (icraft:gates/ub_all).
//
// Watch the gates in game (operator): /scoreboard objectives setdisplay sidebar icraft_gate
// =============================================================================
;(function () {
  if (!icraft.lib.need('core', 'compat/ub_tick_gate') ||
      !icraft.lib.need('ticks', 'compat/ub_tick_gate')) return
  var core = global.icraft.core

  var OBJECTIVE = 'icraft_gate'
  var TTL = 2               // the override's countdown: 2 = fail-open on the second tick without a refresh
  var LINGER = 2            // function ticks a family stays open after its last entity left
  var REBUILD_TICKS = 1200  // a full pass over every loaded entity once a minute

  var EYE = 1, ANGEL = 2, STORM = 4, CIRCLE = 8, SORC = 16, EXTRAS = 32, MOBS = 64
  var FAMILIES = [
    { bit: EYE, holder: '#ub_eye' },
    { bit: ANGEL, holder: '#ub_angel' },
    { bit: STORM, holder: '#ub_storm' },
    { bit: CIRCLE, holder: '#ub_circle' },
    { bit: SORC, holder: '#ub_sorc' },
    { bit: EXTRAS, holder: '#ub_extras' },
    { bit: MOBS, holder: '#ub_mobs' }
  ]
  // anchor tag -> families; '$' in front, a tag may be named like an Object member
  var ANCHORS = {
    '$eye_of_fire': EYE,
    '$lostangel': ANGEL, '$explode': ANGEL, '$explode1': ANGEL, '$healer': ANGEL, '$lostangelspawn': ANGEL,
    '$cloud': STORM, '$tornado': STORM, '$particles': STORM, '$s': STORM, '$cloudm': STORM, '$cloudspawn': STORM,
    '$red_circle1': CIRCLE | SORC, '$red_circle2': CIRCLE | SORC, '$sorcc': CIRCLE | SORC | EXTRAS,
    '$kill1': SORC, '$inv': SORC
  }
  // the twelve types ub:mobs/ticking counts (`type=` selects the real entity type)
  var MOB_TYPES = core.idSet(['minecraft:blaze', 'minecraft:camel', 'minecraft:drowned', 'minecraft:enderman',
    'minecraft:evoker', 'minecraft:phantom', 'minecraft:pillager', 'minecraft:shulker', 'minecraft:skeleton',
    'minecraft:stray', 'minecraft:witch', 'minecraft:zombie'])

  var entries = []          // { e, anchor, blaze, mob } for every loaded entity that opens a family
  var rest = [0, 0, 0, 0, 0, 0, 0]
  var gate = [-1, -1, -1, -1, -1, -1, -1]  // what was last written; -1 = not written by this load
  var built = false         // false after a load or /reload: the first tick lists every entity
  var sinceBuild = 0

  // The real type id: core.entityId answers a boss of the registry's `seenAs` by
  // its boss id, and ub:mobs/ticking's `type=` sees the entity type itself.
  var typeOf = function (entity) {
    try {
      return String(entity.getType())
    } catch (e) {
      core.warnOnce('ub_tick_gate:type', '[ub_tick_gate] an entity type could not be read (that entity opens no mob family): ' + e)
      return ''
    }
  }

  // the entry an entity needs, or null when it opens no family
  var classify = function (entity) {
    var tags = entity.getTags()
    var anchor = 0
    if (!tags.isEmpty()) {
      var it = tags.iterator()
      while (it.hasNext()) {
        var bits = ANCHORS['$' + it.next()]
        if (bits) anchor |= bits
      }
    }
    var type = typeOf(entity)
    var mob = false
    var blaze = false
    if (MOB_TYPES.has(type)) {
      mob = !tags.contains('nocusmob')
      blaze = type === 'minecraft:blaze' && !tags.contains('counted')
    }
    if (anchor === 0 && !mob && !blaze) return null
    return { e: entity, anchor: anchor, blaze: blaze, mob: mob }
  }

  var objective = function (server) {
    var board = server.getScoreboard()
    var obj = board.getObjective(OBJECTIVE)
    if (obj === null) {
      server.runCommandSilent('scoreboard objectives add ' + OBJECTIVE + ' dummy')
      obj = board.getObjective(OBJECTIVE)
    }
    return obj
  }

  // a join or a login: open the families at once (a closed gate would skip them this tick)
  var open = function (server, bits) {
    var obj = null
    for (var i = 0; i < FAMILIES.length; i++) {
      if ((bits & FAMILIES[i].bit) === 0) continue
      rest[i] = LINGER
      if (gate[i] === 1) continue
      if (obj === null) obj = objective(server)
      if (obj === null) return
      server.getScoreboard().getOrCreatePlayerScore(FAMILIES[i].holder, obj).setScore(1)
      gate[i] = 1
    }
  }

  var rebuild = function (server) {
    var fresh = []
    var levels = server.getAllLevels().iterator()
    while (levels.hasNext()) {
      var it = levels.next().getAllEntities().iterator()
      while (it.hasNext()) {
        var entry = classify(it.next())
        if (entry !== null) fresh.push(entry)
      }
    }
    entries = fresh
    built = true
    sinceBuild = 0
  }

  EntityEvents.spawned(icraft.guard('compat/ub_tick_gate', 'EntityEvents.spawned', function (event) {
    var entity = event.entity
    if (!entity) return
    var entry = classify(entity)
    if (entry === null) return
    entries.push(entry)
    open(entity.getServer(), entry.anchor | (entry.blaze ? EYE : 0) | (entry.mob ? MOBS : 0))
  }))

  PlayerEvents.loggedIn(icraft.guard('compat/ub_tick_gate', 'PlayerEvents.loggedIn', function (event) {
    open(event.player.getServer(), MOBS)
  }))

  global.registerServerTick('tick_ubTickGate', 1, 0, function (event) {
    var server = event.server
    if (!built || ++sinceBuild >= REBUILD_TICKS) rebuild(server)

    var bits = 0
    var kept = []
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i]
      var entity = entry.e
      if (entity.isRemoved()) continue
      var have = entry.anchor
      if (entry.blaze) {
        if (entity.getTags().contains('counted')) entry.blaze = false
        else have |= EYE
      }
      if (entry.mob) {
        if (entity.getTags().contains('nocusmob')) entry.mob = false
        else have |= MOBS
      }
      if (have === 0) continue
      kept.push(entry)
      bits |= have
    }
    entries = kept
    if (Number(server.getPlayerCount()) > 0) bits |= MOBS

    var obj = objective(server)
    // no objective: #ub_ttl is not refreshed and the override runs everything
    if (obj === null) {
      core.warnOnce('ub_tick_gate:objective', '[ub_tick_gate] the objective ' + OBJECTIVE + ' could not be created: Ultimate Bosses runs ungated')
      return
    }
    var board = server.getScoreboard()
    for (var f = 0; f < FAMILIES.length; f++) {
      var value = 0
      if ((bits & FAMILIES[f].bit) !== 0) { rest[f] = LINGER; value = 1 } else if (rest[f] > 0) { rest[f]--; value = 1 }
      board.getOrCreatePlayerScore(FAMILIES[f].holder, obj).setScore(value)
      gate[f] = value
    }
    // last, after every gate is written: a failure above leaves it unrefreshed (fail-open)
    board.getOrCreatePlayerScore('#ub_ttl', obj).setScore(TTL)
    icraft.live.fired('ub-tick-gate')
  })
})()
