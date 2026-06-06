// =============================================================================
// TATOS DIMENSION LOCK -- confine all theabyss:* mobs to TATOS dimensions
// =============================================================================
// 2026-04-25: tester reported TATOS mobs (Abyss Skeleton, etc.) appearing in
// the Overworld and breaking doors. TATOS' own datapack biome_modifiers
// only target theabyss:* biomes -- so overworld TATOS spawns must come
// from one of: Java-side hardcoded spawn calls, mod-vs-mod cross-injection
// (Apotheosis spawner pools, dungeon spawners), structure-piece spawners,
// or commands. A datapack remove_spawns can't reach those paths.
//
// User directive: "tier TATOS away from overworld entirely". The bluntest
// guarantee is to subscribe to EntityEvents.spawned and discard any
// theabyss:* entity that spawns outside a TATOS dimension. This catches
// every spawn route regardless of source.
//
// TATOS dimensions per the mod's data/theabyss/dimension/*.json:
//   theabyss:the_abyss        -- main overworld-equivalent
//   theabyss:spectral_world   -- spectral biome dim
//   theabyss:frost_world      -- frost biome dim
//   theabyss:pocket_dimension -- pocket-biome dim
//
// All four are allowed; everything else is denied.
//
// We also defensively allow the secondary namespace 'abyss:' that TATOS
// uses for its tags subdirectory (data/abyss/tags/...) just in case any
// entity ships under that ID.
//
// Memory: feedback_wiki_reference.md (Rhino var-not-const), feedback_jar_audit.md.
// =============================================================================

try {
  var TATOS_NAMESPACES = ['theabyss:', 'abyss:']
  var TATOS_DIMENSIONS = {
    'theabyss:the_abyss': true,
    'theabyss:spectral_world': true,
    'theabyss:frost_world': true,
    'theabyss:pocket_dimension': true
  }

  EntityEvents.spawned(event => {
    try {
      var entity = event.entity
      if (!entity) return

      // Resolve the entity's registry id (e.g. "theabyss:abyss_skeleton").
      // Prefer the registry-key path (stable across versions); fall back to
      // EntityType.toString() which is "entity.<ns>.<path>" in 1.20.1.
      var typeId = null
      try {
        typeId = String(entity.getType().builtInRegistryHolder().key().location())
      } catch (e) {}
      if (!typeId) {
        try {
          var raw = String(entity.getType().toString())
          // Convert "entity.theabyss.abyss_skeleton" -> "theabyss:abyss_skeleton"
          var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
          if (m) typeId = m[1] + ':' + m[2]
        } catch (e) {}
      }
      if (!typeId) return

      var isTatos = false
      for (var i = 0; i < TATOS_NAMESPACES.length; i++) {
        if (typeId.indexOf(TATOS_NAMESPACES[i]) === 0) { isTatos = true; break }
      }
      if (!isTatos) return

      // Resolve the dimension this spawn happened in.
      var dimId = null
      try {
        dimId = String(entity.level.dimension)
      } catch (e) {}
      if (!dimId) {
        try { dimId = String(entity.getLevel().dimension) } catch (e) {}
      }
      if (!dimId) return

      if (TATOS_DIMENSIONS[dimId]) return  // legitimate TATOS-dim spawn

      // Outside any TATOS dim. Discard silently.
      try { entity.discard() } catch (e) {}

      // Per-type one-shot log so we can see what's actually crossing over
      // and from where. After a few sessions of clean logs, this can be
      // pruned.
      if (!global._tatos_lock_seen) global._tatos_lock_seen = {}
      var key = typeId + '@' + dimId
      if (!global._tatos_lock_seen[key]) {
        global._tatos_lock_seen[key] = true
        console.log('[tatos_lock] discarded ' + typeId + ' attempting spawn in ' + dimId)
      }
    } catch (e) {
      console.warn('[tatos_lock] spawned-handler threw: ' + e)
    }
  })

  console.log('[IridescentCraft] tatos_dimension_lock loaded (theabyss:* mobs confined to 4 TATOS dims)')
} catch (e) {
  console.warn('[IridescentCraft] tatos_dimension_lock bootstrap FAILED: ' + e)
}
