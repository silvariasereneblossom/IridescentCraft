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
// =============================================================================

LootJS.modifiers(event => {
  var bows = global.ICRAFT_TMB_BOWS || []
  if (!bows.length) { console.warn('[zz_unique_chest_strip] no bow list — nothing stripped'); return }
  var m = event.addLootTableModifier(/chests\//)
  bows.forEach(b => m.removeLoot(b))
  console.log('[zz_unique_chest_strip] insurance strip armed for ' + bows.length
    + ' TMB bows across all chests/ tables (boss-exclusive)')
})
