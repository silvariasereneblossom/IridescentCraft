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

  // Block hostile spawns inside the zone outright.
  EntityEvents.spawned(function (event) {
    var entity = event.entity
    if (!entity || !entity.living || !entity.monster) return
    if (nearSpawn(event.server, entity)) {
      event.cancel()
    }
  })

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
