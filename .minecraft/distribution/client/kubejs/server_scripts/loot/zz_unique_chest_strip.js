// =============================================================================
// zz_unique_chest_strip — INSURANCE: keep Too Many Bows bows out of all chests
// =============================================================================
// TMB bows are now boss-EXCLUSIVE (operator 2026-06-03). Their two chest sources
// were already cut at the root — the mod's config injection (config/too_many_bows
// .json *LootEnabled=false) and the pack's tiered pools (lootjs_overhaul.js bow
// lines removed). This file is the belt-and-suspenders strip that mirrors the
// existing @simplyswords chest strip (lootjs_overhaul.js:2952): if any residual
// source ever re-adds a TMB bow to a chests/ table, remove it.
//
// Named zz_ so it loads LAST — its removeLoot is registered after every other
// script's addLoot, so it applies last per table. Reads global.ICRAFT_TMB_BOWS
// (unique_itemset_registry.js) lazily inside the LootJS modifier callback.
//
// [2026-10-10] The table filter was /chests\//. LootJS table regexes are
// FULL-MATCH (ResourceLocationFilter.ByPattern.test == Pattern.matcher(id)
// .matches(), decompiled 2.13.1), so that pattern matched no table at all and
// this insurance strip had never run. /.*chests\/.*/ is "any table whose id
// contains chests/".
//
// [2026-10-11] Plus the alias tables whose id has no chests/ in it (minecraft:
// house_1, ctov:village/…, ctov:pillager_outpost/… — dev/loot_audit/
// alias_tables.json). They forward to chests/ tables, and a LootJS rule sees
// only the root id, i.e. the alias.
// =============================================================================

LootJS.modifiers(icraft.guard('loot/zz_unique_chest_strip', 'LootJS.modifiers', event => {
  var bows = global.ICRAFT_TMB_BOWS || []
  if (!bows.length) { console.warn('[zz_unique_chest_strip] no bow list — nothing stripped'); return }
  var m = event.addLootTableModifier(/.*chests\/.*/,
    'minecraft:house_1', /^ctov:(?:village|pillager_outpost)\/.*/)
  bows.forEach(b => m.removeLoot(b))
  console.log('[zz_unique_chest_strip] insurance strip armed for ' + bows.length
    + ' TMB bows across all chests/ tables (boss-exclusive)')
}))
