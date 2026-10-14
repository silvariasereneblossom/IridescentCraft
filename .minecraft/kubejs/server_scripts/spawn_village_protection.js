// @file kubejs/server_scripts/spawn_village_protection.js
// @events BlockEvents.placed, EntityEvents.spawned, tick.server
// @registry bosses
// =============================================================================
// SPAWN VILLAGE PROTECTION - hostile deletion zone around world spawn
// =============================================================================
// Operator directive (2026-06-06): hostile mobs invade the spawn village as
// part of normal play - "no hostiles within the spawn chunk / all get
// instakilled within spawn chunk". The world spawn is set at the cherry
// village (cherry_spawn_biome.js), so a radius around world spawn IS the
// village protection zone.
//
// Mechanics:
//   - On hostile spawn attempt inside the zone: cancelled outright.
//   - Periodic sweep (every 60t) discards hostiles that WALK in: discard(),
//     not kill() - no drops, no XP, no death event (true deletion, so the
//     zone can't be farmed and corpses/loot don't litter the village).
//   - Persistent/named entities and anything on the equipment blacklist
//     pattern are still removed - the zone is absolute by design. Players'
//     tamed pets and villagers/golems are never touched (monster-gate).
//   - RAID mobs are also removed -> raids effectively cannot execute inside
//     the zone. Per the directive this is intended (village = safe haven).
//   - A Wither BUILT inside the zone is refused at the skull placement: the
//     blocks stay and the builder is told why (2026-10-14, below).
//
// Uses the KubeJS .monster semantics (MobCategory not friendly) - the same
// gate as mob_equipment.js - so MONSTER-category projectile-mobs are covered.
// RADIUS is the one tuning knob.
//
// This is the ONLY hostile handling around spawn since 2026-10-10:
// spawn_protection.js (r=32 square, entirely inside this circle) used to carry
// a duplicate spawn-cancel plus a `kill` sweep that never matched anything;
// both were removed there. That file now only protects blocks.
// =============================================================================

;(function () {
  var RADIUS = 96            // blocks from world spawn (covers the village)
  var SWEEP_TICKS = 60       // periodic walk-in sweep cadence
  var RADIUS_SQ = RADIUS * RADIUS

  var nearSpawn = function (server, entity) {
    try {
      var level = server.overworld()
      if (String(entity.level.dimension) !== String(level.dimension)) return false
      var sp = level.getSharedSpawnPos()
      var dx = entity.x - sp.x, dz = entity.z - sp.z
      return (dx * dx + dz * dz) <= RADIUS_SQ
    } catch (e) { return false }
  }

  // A Wither BUILT inside the zone (operator ruling, 2026-10-14). The skull that
  // completes the pattern clears the soul sand and the skulls, then the Wither
  // joins and the cancel below deletes it: measured on a full-pack boot, the
  // blocks were gone and no Wither appeared. Both happen inside that one skull
  // placement, before Forge fires its place event. So the cancelled join notes
  // where it was, and the place event of the same tick refuses the placement:
  // Forge then puts back every block the placement changed, the pattern too,
  // and the skull stays in the player's hand. A Wither built outside the zone,
  // a golem, a skull set down on its own: none leaves a note, none is touched.
  // Not covered: a dispenser that completes the pattern (no player, no event).
  var refusedWither = null   // { time, x, y, z } of the last Wither join cancelled here
  var noteIfWither = function (entity) {
    try {
      if (String(global.icraft.bosses.canon(global.icraft.core.entityId(entity))) !== 'minecraft:wither') return
      refusedWither = { time: Number(entity.level.time), x: entity.x, y: entity.y, z: entity.z }
    } catch (e) {
      global.icraft.core.warnOnce('spawn_village_protection:wither', '[spawn-protection] could not tell whether a cancelled join was a Wither (a Wither built in the zone is not refused): ' + e)
    }
  }

  // Block hostile spawns inside the zone outright.
  EntityEvents.spawned(icraft.guard('spawn_village_protection', 'EntityEvents.spawned', function (event) {
    var entity = event.entity
    if (!entity || !entity.living || !entity.monster) return
    if (nearSpawn(event.server, entity)) {
      noteIfWither(entity)
      event.cancel()
    }
  }))

  // Refuse the skull placement whose Wither was just cancelled (see above).
  BlockEvents.placed(icraft.guard('spawn_village_protection', 'BlockEvents.placed', function (event) {
    var w = refusedWither
    if (!w || !event.player) return
    refusedWither = null
    if (Number(event.level.time) !== w.time) return
    var dx = event.block.x - w.x, dy = event.block.y - w.y, dz = event.block.z - w.z
    if (dx * dx + dy * dy + dz * dz > 25) return
    console.log('[spawn-protection] refused a Wither built ' + RADIUS + ' blocks or less from the world spawn at ' +
      event.block.x + ' ' + event.block.y + ' ' + event.block.z + '; its blocks were put back')
    try {
      event.player.tell('A Wither cannot be summoned this close to the spawn village. Build it at least ' + RADIUS + ' blocks from the world spawn.')
    } catch (e) {
      console.warn('[spawn-protection] the refusal message could not be sent: ' + e)
    }
    // cancel() unwinds by throwing, so it has to be the LAST statement.
    event.cancel()
  }))

  // Sweep walk-ins. discard() = silent deletion (no drops/XP/death event).
  // Dispatched by the master tick (0_tick_master.js) every SWEEP_TICKS instead
  // of a private ServerEvents.tick handler that ran its own modulo every tick.
  // Same cadence as before (server tick % 60 === 0). Errors are left to the
  // master's rate-limited reporter (this used to console.error on every
  // failed sweep, i.e. every 3 s, and those lines are kept in memory).
  // The entity query never loads chunks (unloaded sections are just absent).
  global.registerServerTick('tick_spawnVillageSweep', SWEEP_TICKS, 0, function (event) {
    var level = event.server.overworld()
    var sp = level.getSharedSpawnPos()
    var entities = level.getEntitiesWithin(AABB.of(
      sp.x - RADIUS, -64, sp.z - RADIUS,
      sp.x + RADIUS, 320, sp.z + RADIUS))
    entities.forEach(function (e) {
      if (!e || !e.living || !e.monster) return
      var dx = e.x - sp.x, dz = e.z - sp.z
      if ((dx * dx + dz * dz) <= RADIUS_SQ) {
        e.discard()
      }
    })
  })

  console.log('[spawn-protection] hostile deletion zone active: r=' + RADIUS + ' around world spawn')
})()
