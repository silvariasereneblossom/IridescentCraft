// @file kubejs/server_scripts/compat/twilight_plateau_boss_guard.js
// @events EntityEvents.spawned
// =============================================================================
// Twilight Forest's unfinished Final Castle boss (twilightforest:plateau_boss)
// is never let into a level: on TF 4.3.2508 it crashes the server as soon as
// it dies or its chunk is saved.
// =============================================================================
// The class (twilightforest.entity.boss.PlateauBoss) reads a synched value,
// HOME_POINT, that it never defines, so getRestrictionPoint() throws a
// NullPointerException. That method is called from die() (through
// LandmarkUtil.markStructureConquered), from addAdditionalSaveData() (every
// save of the entity: a chunk save or unload), from checkDespawn() on
// Peaceful, and from readAdditionalSaveData() when the tag has a Home or
// HomePos entry. Found 2026-10-14 on the boot rig: a Netherite Monstrosity
// killed one and the server stopped with "Ticking entity".
//
// No game path makes one. It has no AI, no natural spawn and no spawn egg,
// and the Final Castle's own spawner (FinalBossSpawnerBlockEntity) overrides
// spawnMyBoss to return false without spawning anything. What is left is
// /summon and any mod that creates an entity by its id. Refusing the join
// covers all of them, and an entity in a saved chunk too. Cancelling its
// death would not: PlateauBoss.die() goes on after the cancelled super call
// and throws anyway, and the save path stays open.
//
// It is ruled a plain mob (no boss registry entry). This file can go when a
// Twilight Forest jar defines the value (PlateauBoss.defineSynchedData).
// =============================================================================
;(function () {
  var LOG_LIMIT = 20
  var refused = 0

  EntityEvents.spawned('twilightforest:plateau_boss', icraft.guard('compat/twilight_plateau_boss_guard', 'EntityEvents.spawned', function (event) {
    refused++
    if (refused <= LOG_LIMIT) {
      var where
      try {
        var e = event.entity
        where = Math.floor(e.x) + ' ' + Math.floor(e.y) + ' ' + Math.floor(e.z) + ' in ' + String(event.level.dimension)
      } catch (err) {
        where = 'an unknown place (' + err + ')'
      }
      console.warn('[plateau_boss_guard] refused twilightforest:plateau_boss at ' + where +
        ': Twilight Forest 4.3 crashes the server when this entity dies or is saved' +
        (refused === LOG_LIMIT ? ' (refusal ' + LOG_LIMIT + '; further ones are not logged until the scripts reload)' : ''))
    }
    event.cancel()
  }))
})()
