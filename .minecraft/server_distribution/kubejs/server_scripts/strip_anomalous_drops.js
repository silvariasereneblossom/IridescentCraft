// =============================================================================
// STRIP ANOMALOUS DROPS -- LivingDropsEvent post-loot-table strip layer
// Place in: kubejs/server_scripts/strip_anomalous_drops.js
// =============================================================================
//
// 2026-05-20: Vanilla spiders are still spawning with infinite regeneration
// (see today's MOBDIAG-SPAWN sample). The 2026-05-10 root-cause fix (kill
// Truly Modular / nucleus_facets) cleaned up the original buff source, but
// the symptom has returned with a different shape (no nucleus:facets tag;
// duration -1 instead of ~100,000,000 ticks). The new buff-source mod is
// unidentified.
//
// loot_overhaul.js already strips diamond / netherite gear + raw mats from
// LootType.ENTITY via a Forge GLM. That GLM runs during loot-table
// generation -- it catches drops routed through the entity's loot table,
// but NOT items added directly via LivingDropsEvent.dropLoot() or similar
// Java-side injection. The 2026-04-24 spider report ("dropped diamond +
// ender_eye, source untraceable via JSON grep") fits the in-code injector
// shape exactly. A LivingDropsEvent listener catches both pathways because
// it fires AFTER the loot table runs and inspects the resulting drop list.
//
// Source of truth for the list: mirrors diag_mob_drops.js FLAGGED_DROP_IDS
// verbatim. Per user choice 2026-05-20: same list, remove + log on catch.
// Note this is BROADER than the existing loot_overhaul.js entity strip;
// it additionally removes enchanted_book + enchanted_golden_apple from
// mob drops. These are diag-flagged as anomalous-on-ordinary-mobs and
// the user opted in to stripping them too (witches dropping books from
// an Apoth-affix-as-drop or mod injector is exactly the leak shape we
// want closed).
//
// Pairs with:
//   server_scripts/diag_mob_drops.js   -- the LivingDeathEvent + 1-tick
//                                         position-scan dump that flagged
//                                         this. Both scripts MUST use the
//                                         same FLAGGED_DROP_IDS list; if
//                                         this script's list drifts from
//                                         the diag's, drops can be stripped
//                                         without being logged.
//   server_scripts/loot/loot_overhaul.js -- the upstream Forge GLM that
//                                           handles loot-table-routed drops.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try)
// =============================================================================

try {
  var MinecraftForge_sad = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingDropsEvent_sad = Java.loadClass('net.minecraftforge.event.entity.living.LivingDropsEvent')
  var EventPriority_sad = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_sad = Java.loadClass('java.util.function.Consumer')
  var ForgeRegistries_sad = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Mirrors diag_mob_drops.js FLAGGED_DROP_IDS exactly. Any change here
  // MUST be paired with the corresponding edit in the diag script.
  var FLAGGED_DROP_IDS = {
    'minecraft:diamond':              1,
    'minecraft:diamond_block':        1,
    'minecraft:emerald_block':        1,
    'minecraft:ender_eye':            1,
    'minecraft:netherite_ingot':      1,
    'minecraft:netherite_scrap':      1,
    'minecraft:netherite_block':      1,
    'minecraft:ancient_debris':       1,
    'minecraft:elytra':               1,
    'minecraft:diamond_sword':        1, 'minecraft:diamond_axe':         1,
    'minecraft:diamond_helmet':       1, 'minecraft:diamond_chestplate':  1,
    'minecraft:diamond_leggings':     1, 'minecraft:diamond_boots':       1,
    'minecraft:diamond_pickaxe':      1,
    'minecraft:netherite_sword':      1, 'minecraft:netherite_axe':       1,
    'minecraft:netherite_helmet':     1, 'minecraft:netherite_chestplate': 1,
    'minecraft:netherite_leggings':   1, 'minecraft:netherite_boots':     1,
    'minecraft:enchanted_book':       1, 'minecraft:enchanted_golden_apple': 1
  }

  // Entity-resource-id helper (handles Rhino/SRG quirks the diag scripts
  // documented; see diag_mob_drops.js entityResId).
  var entityResId_sad = function (entity) {
    try { return String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) {}
    try {
      var raw = String(entity.getType().toString())
      var m = raw.match(/^entity\.([^.]+)\.(.+)$/)
      if (m) return m[1] + ':' + m[2]
      return raw
    } catch (e) { return '' }
  }

  var handler = new Consumer_sad({
    accept: function (event) {
      try {
        var entity = event.getEntity()
        if (entity == null) return
        var drops = event.getDrops()
        if (drops == null || drops.isEmpty()) return

        // Iterate by index in reverse so we can remove() safely.
        var removed = []
        for (var i = drops.size() - 1; i >= 0; i--) {
          var itemEntity = drops.get(i)
          if (itemEntity == null) continue
          var stack = itemEntity.getItem()
          if (stack == null || stack.isEmpty()) continue
          var key = ForgeRegistries_sad.ITEMS.getKey(stack.getItem())
          if (key == null) continue
          var idStr = String(key.toString())
          if (FLAGGED_DROP_IDS[idStr] === 1) {
            removed.push({ id: idStr, count: stack.getCount() })
            drops.remove(i)
          }
        }

        if (removed.length > 0) {
          var entId = entityResId_sad(entity)
          var pos = entity.position()
          var posStr = '[' + Math.floor(pos.x) + ',' + Math.floor(pos.y) + ',' + Math.floor(pos.z) + ']'
          var dim = ''
          try { dim = String(entity.level().dimension().location()) } catch (e) {}
          for (var j = 0; j < removed.length; j++) {
            console.warn('[STRIP-DROP] ' + entId + ' @ ' + dim + ' ' + posStr +
                         ' would have dropped ' + removed[j].count + 'x ' + removed[j].id + ' -- removed')
          }
        }
      } catch (e) {
        // Fail-soft: never let a strip pass crash a mob death
      }
    }
  })

  // LOWEST priority so any other listener that wants to modify the drops
  // list (e.g. Apoth affix drop bonuses, scaling-health-style additions)
  // has already run. We strip last.
  MinecraftForge_sad.EVENT_BUS.addListener(EventPriority_sad.LOWEST, false,
                                           LivingDropsEvent_sad, handler)
  console.log('[IridescentCraft] strip_anomalous_drops loaded (LivingDropsEvent strip layer for ' +
              Object.keys(FLAGGED_DROP_IDS).length + ' flagged item IDs)')
} catch (e) {
  console.warn('[IridescentCraft] strip_anomalous_drops bootstrap FAILED: ' + e)
}
