// =============================================================================
// RELIC BOSS DROPS -- LivingDropsEvent injector for the iridescent_relics roster
// Place in: kubejs/server_scripts/relic_boss_drops.js  (mirrored to all 3 distros)
// =============================================================================
//
// Phase 2 of iridescent-relics-mod. Each boss in the roster drops its signature
// relic on death, at a base chance scaled by Looting. This mirrors how the
// Relic of the Remnant drops -- except the Remnant rides a loot-TABLE edit
// (kubejs/data/cataclysm/loot_tables/entities/ancient_remnant.json, the "relic"
// pool), while the new roster's source bosses include Mowzie's / Aether entities
// whose drop pathway is not always a standard, overridable entity loot table.
// A LivingDropsEvent listener catches BOTH loot-table-routed drops and drops
// injected in code, so it is the robust, universal binding for this mixed set.
//
// RELOAD-SAFETY: registered through the mod-owned dispatcher
// com.iridescentcraft.reforging.event.ForgeEventRegistry.registerDrops(id, fn)
// -- NOT a raw MinecraftForge.EVENT_BUS.addListener. The @Mod.EventBusSubscriber
// dispatcher is owned by the Tetra-expansion mod; our JS handler is only DATA in
// a static map keyed by a stable id, and re-running this script REPLACES that
// entry, so a disposed-Rhino-scope closure is never invoked on /reload. (Same
// pattern + rationale as server_scripts/strip_anomalous_drops.js. See
// design/iridescent_relics_plan.md §4.4 and lessons-learned #60.)
//
// ENDER DRAGON (Dragon's Eye) is wired SEPARATELY at the bottom of this file via
// KubeJS EntityEvents.death -- NOT the registerDrops path above. The Ender Dragon
// emits no normal LivingDropsEvent (bespoke death logic), but EntityEvents.death
// DOES fire for it (the pack already uses that event in scaling/dimension_mechanics.js).
// It is reload-safe -- a KubeJS EventGroup handler that unload() clears, NOT a raw
// Forge-bus listener -- so it does not reintroduce the #60 stale-scope hazard.
//
// OWNER REVIEW (design O6): cardinal_sins:lucifer (Cursed Sigil of Pride) is a
// capstone boss whose only drop today is a progression token. Dropping a lootable
// relic was flagged for owner confirmation. It is INCLUDED below; to hold it
// back, delete or comment the 'cardinal_sins:lucifer' entry in RELIC_DROPS.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try)
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var ForgeEventRegistry_rbd = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
  var ItemEntity_rbd = Java.loadClass('net.minecraft.world.entity.item.ItemEntity')
  var ItemStack_rbd = Java.loadClass('net.minecraft.world.item.ItemStack')
  var ForgeRegistries_rbd = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_rbd = Java.loadClass('net.minecraft.resources.ResourceLocation')

  // boss entity id -> { relic: item id, chance: base drop chance, looting: per-looting-level bonus }
  // All boss ids verified against codex_exploration_kills.js / codex_boss_rush.js.
  // All relic ids are registered by iridescent-relics-mod (see IridescentRelics.java).
  var RELIC_DROPS = {
    'mowziesmobs:frostmaw':              { relic: 'iridescent_relics:frostmaw_heart',     chance: 0.40, looting: 0.10 },
    'mowziesmobs:ferrous_wroughtnaut':   { relic: 'iridescent_relics:ironheart_cog',      chance: 0.40, looting: 0.10 },
    'aether:sun_spirit':                 { relic: 'iridescent_relics:sunfeather_charm',    chance: 0.40, looting: 0.10 },
    'twilightforest:lich':               { relic: 'iridescent_relics:phylactery_shard',    chance: 0.40, looting: 0.10 },
    'cataclysm:the_leviathan':           { relic: 'iridescent_relics:leviathans_pearl',    chance: 0.40, looting: 0.10 },
    'cardinal_sins:lucifer':             { relic: 'iridescent_relics:cursed_sigil_pride',  chance: 0.40, looting: 0.10 }
  }

  // Entity-resource-id helper (handles Rhino/SRG quirks; mirrors strip_anomalous_drops.js).
  var entityResId_rbd = function (entity) {
    try { return String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) {}
    try {
      var raw = String(entity.getType().toString())
      var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
      if (m) return m[1] + ':' + m[2]
      return raw
    } catch (e) { return '' }
  }

  var handler = function (event) {
    try {
      var entity = event.getEntity()
      if (entity == null) return

      var entId = entityResId_rbd(entity)
      var cfg = RELIC_DROPS[entId]
      if (!cfg) return

      // Looting level: getLootingLevel() exists on LivingDropsEvent in 1.20.1 Forge,
      // but guard defensively (fail-soft to 0) in case the accessor is remapped.
      var looting = 0
      try { looting = event.getLootingLevel() } catch (e) { looting = 0 }

      var chance = cfg.chance + (looting * cfg.looting)
      if (Math.random() >= chance) return

      var item = ForgeRegistries_rbd.ITEMS.getValue(ResourceLocation_rbd.tryParse(cfg.relic))
      if (item == null) {
        console.warn('[relic_boss_drops] unknown relic item ' + cfg.relic + ' for ' + entId + ' -- skipped')
        return
      }

      // [2026-10-11] Was `entity.level()` + `entity.position().x`: KubeJS hides the
      // vanilla level() method from scripts (use the `level` property), and a Vec3
      // `.x` read throws an uncatchable NullPointerException (see
      // loot/fragment_core_drops.js). None of the six relics could drop.
      var level = entity.level
      var stack = new ItemStack_rbd(item)
      var drop = new ItemEntity_rbd(level, entity.getX(), entity.getY(), entity.getZ(), stack)
      drop.setDefaultPickUpDelay()
      event.getDrops().add(drop)

      console.log('[relic_boss_drops] ' + entId + ' dropped ' + cfg.relic +
                  ' (chance ' + Math.round(chance * 100) + '%, looting ' + looting + ')')
    } catch (e) {
      // Fail-soft: never let a relic-drop roll crash a boss death.
      console.warn('[relic_boss_drops] handler error: ' + e)
    }
  }

  ForgeEventRegistry_rbd.registerDrops('iridescent_relics.boss_drops', handler)
  console.log('[IridescentCraft] relic_boss_drops loaded (' +
              Object.keys(RELIC_DROPS).length + ' LivingDropsEvent bindings + ender_dragon via death event)')
} catch (e) {
  console.warn('[IridescentCraft] relic_boss_drops bootstrap FAILED: ' + e)
}

// =============================================================================
// ENDER DRAGON -> Dragon's Eye (the finale relic). The Dragon emits no
// LivingDropsEvent, so it is bound here via KubeJS EntityEvents.death (a
// reload-safe KubeJS EventGroup handler; the pack already uses this event in
// scaling/dimension_mechanics.js). Guaranteed drop -- the finale relic, and the
// Dragon is a deliberate, resummonable endgame kill, so no RNG.
//
// GIVEN TO THE KILLER (operator ruling 2026-10-11), not dropped: the death
// event fires where the dragon is when its health reaches zero, usually in
// mid-air and often past the island's edge, so a dropped item can fall into the
// void. Who gets it:
//   1. the player the killing damage is credited to (event.source.player);
//   2. no such player (a bed or End Crystal explosion carries none): the
//      player nearest to the dragon in the dragon's dimension;
//   3. nobody in the dimension: dropped at the dragon, as before.
// player.give() puts the eye in the inventory, or at the player's feet when
// the inventory is full.
// =============================================================================
function nearestPlayerTo(server, entity) {
  var best = null
  var bestDist = -1
  try {
    var dim = String(entity.level.dimension)
    var x = entity.getX(), y = entity.getY(), z = entity.getZ()
    server.players.forEach(function (p) {
      try {
        if (String(p.level.dimension) !== dim) return
        var d = p.getDistance(x, y, z)
        if (best === null || d < bestDist) { best = p; bestDist = d }
      } catch (e1) { /* skip this player */ }
    })
  } catch (e) {
    console.warn('[relic_boss_drops] dragon: nearest-player lookup failed: ' + e)
  }
  return best
}

EntityEvents.death(icraft.guard('relic_boss_drops', 'EntityEvents.death', function (event) {
  try {
    var entity = event.entity
    if (!entity || String(entity.type) !== 'minecraft:ender_dragon') return
    var level = entity.level
    if (level && level.isClientSide && level.isClientSide()) return
    // [2026-10-11] Was `server.runCommandSilent('summon minecraft:item ' + pos.x ...)`:
    // the Vec3 `.x` read threw an uncatchable NullPointerException (and cut off the
    // death handlers that load after this file), and a server-source `summon` runs
    // in the OVERWORLD, not in the End.
    var eye = Item.of('iridescent_relics:dragons_eye')
    if (!eye || eye.isEmpty()) { console.warn('[relic_boss_drops] dragon: iridescent_relics:dragons_eye is not registered; skipped'); return }
    var killer = null
    var how = 'killer'
    try { killer = event.source ? event.source.player : null } catch (e0) { killer = null }
    if (!killer) { killer = nearestPlayerTo(event.server, entity); how = 'nearest player' }
    if (killer) {
      killer.give(eye)
      console.log('[relic_boss_drops] ender_dragon -> iridescent_relics:dragons_eye given to ' + killer.username + ' (' + how + ')')
    } else {
      // Entity.spawnAtLocation(ItemStack): at the dragon, in the dragon's level.
      entity.spawnAtLocation(eye)
      console.log('[relic_boss_drops] ender_dragon -> iridescent_relics:dragons_eye dropped at the dragon (no player in the dimension)')
    }
  } catch (e) {
    console.warn('[relic_boss_drops] dragon death handler error: ' + e)
  }
}))
})()
