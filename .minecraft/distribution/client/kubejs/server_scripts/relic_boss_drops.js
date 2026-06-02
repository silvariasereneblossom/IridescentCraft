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
// NOT WIRED HERE (flagged for a bespoke follow-up):
//   - minecraft:ender_dragon -> iridescent_relics:dragons_eye
//     The Ender Dragon does NOT emit a normal LivingDropsEvent on death (it
//     routes XP + the egg via bespoke EnderDragon death logic), so a
//     LivingDropsEvent injector will not fire for it. The Dragon's Eye relic
//     ITEM exists and is creative-spawnable / loot-table-addable; its drop needs
//     a dedicated path (e.g. a DragonDeath-aware handler or a podium/egg-claim
//     reward), to be authored separately.
//
// OWNER REVIEW (design O6): cardinal_sins:lucifer (Cursed Sigil of Pride) is a
// capstone boss whose only drop today is a progression token. Dropping a lootable
// relic was flagged for owner confirmation. It is INCLUDED below; to hold it
// back, delete or comment the 'cardinal_sins:lucifer' entry in RELIC_DROPS.
//
// Memory: feedback_rhino_scoping.md (var X = function(){} inside try)
// =============================================================================

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

      var level = entity.level()
      var pos = entity.position()
      var stack = new ItemStack_rbd(item)
      var drop = new ItemEntity_rbd(level, pos.x, pos.y, pos.z, stack)
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
              Object.keys(RELIC_DROPS).length + ' boss->relic bindings; ender_dragon deferred)')
} catch (e) {
  console.warn('[IridescentCraft] relic_boss_drops bootstrap FAILED: ' + e)
}
