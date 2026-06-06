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
  ServerEvents.tick(function (event) {
    var server = event.server
    if (server.tickCount % SWEEP_TICKS !== 0) return
    var level = server.overworld()
    var sp = level.getSharedSpawnPos()
    try {
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
    } catch (err) {
      console.error('[spawn-protection] sweep error: ' + err)
    }
  })

  console.log('[spawn-protection] hostile deletion zone active: r=' + RADIUS + ' around world spawn')
})()
