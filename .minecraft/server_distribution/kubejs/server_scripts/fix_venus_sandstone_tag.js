// =============================================================================
// VENUS SANDSTONE CRUSHING-TAG RESTORE (docket #80, 2026-06-08)
// =============================================================================
// Boot ERRORs cleared (mekanism.common.Mekanism logger):
//   "Empty item ingredient: {"tag":"forge:sandstone/venus_sandstone"}"
//   "Incomplete recipe detected: mekanism:crushing/venus_sandstone_to_venus_sand"
//
// Root cause (decompile-confirmed, ad_astra-forge-1.20.1-1.15.20.jar):
// ad_astra SHIPS the compat recipe
//   data/mekanism/recipes/crushing/venus_sandstone_to_venus_sand.json
//   (input #forge:sandstone/venus_sandstone -> 2x ad_astra:venus_sand, gated on
//    forge:mod_loaded mekanism) but ships NO tag file anywhere populating
//   #forge:sandstone/venus_sandstone (it ships forge tags only for its ores/
//   ingots/nuggets/storage_blocks/fluids -- no sandstone tags at all). The tag
//   is referenced-but-never-defined -> resolves EMPTY -> Mekanism rejects the
//   empty ingredient and drops the recipe at boot. ad_astra's sibling recipe
//   data/immersiveengineering/recipes/crusher/venus_sandstone.json reads the
//   SAME tag, so this also pre-empts that failure when IE is loaded. (ad_astra's
//   create:milling recipe uses a direct item input and was never affected.)
//
// Fix: populate the ITEM tag with ad_astra:venus_sandstone (confirmed a real,
// COMMON item in TesterLogs/Item Audit/all_items.tsv). ServerEvents.tags runs
// AFTER all datapack + jar tag merging, so it is load-order-immune -- same
// proven pattern as fix_stone_tags.js (#98). This RESTORES the mod-intended
// venus_sandstone -> venus_sand crushing compat rather than deleting it.
// =============================================================================

ServerEvents.tags('item', event => {
  event.add('forge:sandstone/venus_sandstone', 'ad_astra:venus_sandstone')
  console.log('[venus-sandstone-tag] forge:sandstone/venus_sandstone <- ad_astra:venus_sandstone (post-merge)')
})
