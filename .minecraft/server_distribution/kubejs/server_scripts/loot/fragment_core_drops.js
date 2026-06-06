// =============================================================================
// FRAGMENT CORE DROPS -- monster-gated entity-death drop for rpgseteffects
// File: kubejs/server_scripts/loot/fragment_core_drops.js  (canonical only;
//        sync-distros mirrors server_scripts/ to the two distro copies)
// =============================================================================
//
// Fragment Core: 4% from any hostile mob death (basic resource).
//
// WHY THIS EXISTS (relocated from lootjs_overhaul.js Section 8.5):
//   The original injector used LootJS `addLootTypeModifier(LootType.ENTITY)`.
//   LootType.ENTITY filters loot tables by their LootContextParamSet -- the
//   ENTITY param set -- which EVERY `loot_tables/entities/*` table in 1.20.1
//   shares (pig, cow, sheep, chicken, mooshroom, ...). It does NOT filter by
//   MobCategory/Monster. So a vanilla pig had a 4% chance to drop a Fragment
//   Core on death. The original comment even noted "LootJS doesn't support
//   @monster entity tag" and accepted the entity-wide fallback. (Leak vector
//   PIG-1 / fix A1.)
//
//   EntityEvents.death fires per dying entity and exposes `entity.monster`,
//   so we can gate strictly on hostile mobs. Drops are spawned the same way
//   the relic boss drops are spawned (see relic_boss_drops.js) -- a real
//   ItemEntity added at the death position.
//
// GATES:
//   - skip non-hostile (passive animals, NPCs, villagers, ...) via !entity.monster
//   - skip ultris_spawned_mob (boss-arena combat summons are excluded from the
//     pack economy by design -- locked operator decision)
//
// RELOAD-SAFETY: a KubeJS EventGroup handler (EntityEvents.death), which
// unload() clears on /reload -- NOT a raw Forge-bus listener -- so it does not
// reintroduce the stale-Rhino-scope hazard (same rationale as the ender_dragon
// binding at the bottom of relic_boss_drops.js).
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside reentrant scopes),
//         feedback_kubejs_event_scope.md (EntityEvents.death is server-side here).
// =============================================================================

try {
  var ItemEntity_fcd = Java.loadClass('net.minecraft.world.entity.item.ItemEntity')
  var ItemStack_fcd = Java.loadClass('net.minecraft.world.item.ItemStack')
  var ForgeRegistries_fcd = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_fcd = Java.loadClass('net.minecraft.resources.ResourceLocation')

  var FRAGMENT_CORE_ID = 'rpgseteffects:fragment_core'
  var FRAGMENT_CORE_CHANCE = 0.04

  EntityEvents.death(function (event) {
    try {
      var entity = event.entity
      if (!entity || !entity.living || entity.player) return
      // Hostile-only: LootType.ENTITY couldn't gate by MobCategory; this can.
      if (!entity.monster) return
      // By design: Ultris arena combat summons are excluded from pack economy.
      if (entity.tags.contains('ultris_spawned_mob')) return

      if (Math.random() >= FRAGMENT_CORE_CHANCE) return

      var level = entity.level
      if (level && level.isClientSide && level.isClientSide()) return

      var item = ForgeRegistries_fcd.ITEMS.getValue(ResourceLocation_fcd.tryParse(FRAGMENT_CORE_ID))
      if (item == null) {
        console.warn('[fragment_core_drops] unknown item ' + FRAGMENT_CORE_ID + ' -- skipped')
        return
      }

      var pos = entity.position()
      var stack = new ItemStack_fcd(item)
      var drop = new ItemEntity_fcd(level, pos.x, pos.y, pos.z, stack)
      drop.setDefaultPickUpDelay()
      level.addFreshEntity(drop)
    } catch (e) {
      // Fail-soft: never let a fragment-core roll crash a mob death.
      console.warn('[fragment_core_drops] handler error: ' + e)
    }
  })

  console.log('[IridescentCraft] fragment_core_drops loaded (' +
              Math.round(FRAGMENT_CORE_CHANCE * 100) +
              '% from hostile mob death, ultris_spawned_mob excluded)')
} catch (e) {
  console.warn('[IridescentCraft] fragment_core_drops bootstrap FAILED: ' + e)
}
