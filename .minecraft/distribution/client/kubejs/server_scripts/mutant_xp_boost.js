// =============================================================================
// MUTANT MONSTERS XP BOOST (10x)
// Place in: kubejs/server_scripts/mutant_xp_boost.js
// =============================================================================
//
// User design call (2026-05-13): Mutant Monsters items are stripped via
// Paxi datapack icraft_mm_overrides. Compensate by boosting XP drops
// 10x for any mutantmonsters: entity death, so fighting mutants is still
// rewarding (just rewards XP instead of unique loot).
//
// Hooks Forge's LivingExperienceDropEvent which fires before the XP orb
// spawns. We multiply event.getDroppedExperience by 10 if the dying
// entity is in the mutantmonsters namespace.
//
// Affects: mutant_zombie, mutant_skeleton, mutant_creeper, mutant_enderman,
// mutant_snow_golem, spider_pig, creeper_minion, endersoul_clone (and any
// future mutantmonsters entity).
//
// 2026-10-11: the boost had never applied. The handler read the id through
// `entity.getType().builtInRegistryHolder()`, but for scripts getType() IS the
// id string (KubeJS kjs$getType; the vanilla getter is getEntityType), so it
// threw into the empty catch on every death. It is live from this date.
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var ForgeEventRegistry_xp = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')

  var MULTIPLIER = 10

  var handler = function(event) {
      try {
        var entity = event.getEntity()
        if (!entity) return
        var typeId = String(entity.getType())
        if (typeId.indexOf('mutantmonsters:') !== 0) return
        var orig = event.getDroppedExperience()
        if (orig <= 0) return
        event.setDroppedExperience(orig * MULTIPLIER)
        if (!global._mm_xp_seen) {
          global._mm_xp_seen = true
          console.log('[mutant_xp_boost] ' + typeId + ' XP ' + orig +
                      ' -> ' + (orig * MULTIPLIER) + ' (logging once)')
        }
      } catch (e) {
        // Fail-soft: never let XP scaling crash mob death. Logged once, so a
        // handler that throws every time is visible in the log.
        if (!global._mm_xp_err) {
          global._mm_xp_err = true
          console.warn('[mutant_xp_boost] handler threw (logging once): ' + e)
        }
      }
  }

  // Reload-safe: registered via the mod's ForgeEventRegistry (@Mod.EventBusSubscriber
  // owned by the mod) instead of a raw MinecraftForge.EVENT_BUS listener, whose JS
  // closure would survive a context dispose on the Forge bus and crash on next fire.
  ForgeEventRegistry_xp.registerExperienceDrop('icraft.mutant_xp_boost', handler)
  console.log('[IridescentCraft] mutant_xp_boost loaded (' + MULTIPLIER + 'x)')
} catch (e) {
  console.warn('[IridescentCraft] mutant_xp_boost bootstrap FAILED: ' + e)
}
})()
