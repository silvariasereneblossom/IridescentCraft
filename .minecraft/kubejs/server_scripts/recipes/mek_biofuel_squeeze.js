// =============================================================================
// IridescentCraft -- Mekanism Biofuel Production Squeeze
// File: kubejs/server_scripts/recipes/mek_biofuel_squeeze.js
//
// LOCKED OPERATOR DIRECTIVE (2026-06-06): the path to Ethylene must be VERY
// expensive so that meaningful ethylene generation requires AUTOMATED farming.
//
// CONFIRMED LEVER (this file): production-side recipe yields. Every stock
//   mekanism:crushing recipe that turns a crop/plant into mekanism:bio_fuel
//   has its output count cut to ceil(N / SQUEEZE_FACTOR), floored at 1.
//
// EXPLICITLY NOT touched here (other locked decisions):
//   - bioGeneration (Bio Generator burn = 350 J/t) -- stays stock (decision B).
//   - PRS bio->ethylene ratio (2 bio_fuel -> 100 mB ethene) -- stays stock for
//     chain legibility. We squeeze the FEEDSTOCK, not the conversion.
//
// GROUND TRUTH (Mekanism 10.4.16.80, jar enumerated 2026-06-06):
//   The ONLY routes producing mekanism:bio_fuel in the entire pack are the 101
//   stock mekanism:crushing recipes under data/mekanism/recipes/crushing/biofuel/.
//   Verified NO bio_fuel output from Create / Thermal / Industrial Foregoing /
//   CMOE (IF's "biofuel" is a separate FLUID industrialforegoing:biofuel, not
//   the mekanism:bio_fuel item). So this single file covers the entire surface.
//
// IDIOM: mirrors recipe_audit.js / tier_gated_recipes.js -- bulk remove the
//   stock recipes by {type, output}, then re-add each at the cut count via
//   event.custom (replaceOutput cannot change counts; the schema below is
//   copied verbatim from the jar's crushing JSON).
// =============================================================================

// PROVISIONAL squeeze factor. One lever for the whole curve. Round DOWN via
// ceil-then... no: directive is ceil(N/factor) with a floor of 1, so the
// cheapest 2-yield crops drop to 1 (a 2x cut) and the richest 8-yield foods
// drop to 2 (a 4x cut). Net effect across the catalog is ~3-4x. Bump this to
// retune; nothing else needs to change.
const BIOFUEL_SQUEEZE_FACTOR = 4

// [input item id, stock N bio_fuel] for every stock crushing->bio_fuel recipe.
// Stock N is embedded (not the pre-computed cut) so the factor above stays the
// single live lever AND so a future Mekanism rebalance of a crop is visible in
// this table during the next jar re-audit.
const BIOFUEL_CRUSH = [
  ['minecraft:acacia_leaves', 2],
  ['minecraft:acacia_sapling', 2],
  ['minecraft:allium', 5],
  ['minecraft:apple', 5],
  ['minecraft:azalea', 5],
  ['minecraft:azalea_leaves', 2],
  ['minecraft:azure_bluet', 5],
  ['minecraft:baked_potato', 7],
  ['minecraft:beetroot', 5],
  ['minecraft:beetroot_seeds', 2],
  ['minecraft:big_dripleaf', 5],
  ['minecraft:birch_leaves', 2],
  ['minecraft:birch_sapling', 2],
  ['minecraft:blue_orchid', 5],
  ['minecraft:bread', 7],
  ['minecraft:brown_mushroom', 5],
  ['minecraft:brown_mushroom_block', 7],
  ['minecraft:cactus', 4],
  ['minecraft:cake', 8],
  ['minecraft:carrot', 5],
  ['minecraft:carved_pumpkin', 5],
  ['minecraft:cherry_leaves', 2],
  ['minecraft:cherry_sapling', 2],
  ['minecraft:cocoa_beans', 5],
  ['minecraft:cookie', 7],
  ['minecraft:cornflower', 5],
  ['minecraft:crimson_fungus', 5],
  ['minecraft:crimson_roots', 5],
  ['minecraft:dandelion', 5],
  ['minecraft:dark_oak_leaves', 2],
  ['minecraft:dark_oak_sapling', 2],
  ['minecraft:dried_kelp', 2],
  ['minecraft:dried_kelp_block', 4],
  ['minecraft:fern', 5],
  ['minecraft:flowering_azalea', 7],
  ['minecraft:flowering_azalea_leaves', 4],
  ['minecraft:glow_berries', 2],
  ['minecraft:glow_lichen', 4],
  ['minecraft:grass', 2],
  ['minecraft:hanging_roots', 2],
  ['minecraft:hay_block', 7],
  ['minecraft:jungle_leaves', 2],
  ['minecraft:jungle_sapling', 2],
  ['minecraft:kelp', 2],
  ['minecraft:large_fern', 5],
  ['minecraft:lilac', 5],
  ['minecraft:lily_of_the_valley', 5],
  ['minecraft:lily_pad', 5],
  ['minecraft:mangrove_leaves', 2],
  ['minecraft:mangrove_propagule', 2],
  ['minecraft:mangrove_roots', 2],
  ['minecraft:melon', 5],
  ['minecraft:melon_seeds', 2],
  ['minecraft:melon_slice', 4],
  ['minecraft:moss_block', 5],
  ['minecraft:moss_carpet', 2],
  ['minecraft:mushroom_stem', 5],
  ['minecraft:nether_sprouts', 4],
  ['minecraft:nether_wart', 5],
  ['minecraft:nether_wart_block', 7],
  ['minecraft:oak_leaves', 2],
  ['minecraft:oak_sapling', 2],
  ['minecraft:orange_tulip', 5],
  ['minecraft:oxeye_daisy', 5],
  ['minecraft:peony', 5],
  ['minecraft:pink_petals', 2],
  ['minecraft:pink_tulip', 5],
  ['minecraft:pitcher_plant', 7],
  ['minecraft:pitcher_pod', 2],
  ['minecraft:poppy', 5],
  ['minecraft:potato', 5],
  ['minecraft:pumpkin', 5],
  ['minecraft:pumpkin_pie', 8],
  ['minecraft:pumpkin_seeds', 2],
  ['minecraft:red_mushroom', 5],
  ['minecraft:red_mushroom_block', 7],
  ['minecraft:red_tulip', 5],
  ['minecraft:rose_bush', 5],
  ['minecraft:sea_pickle', 5],
  ['minecraft:seagrass', 2],
  ['minecraft:shroomlight', 5],
  ['minecraft:small_dripleaf', 2],
  ['minecraft:spore_blossom', 5],
  ['minecraft:spruce_leaves', 2],
  ['minecraft:spruce_sapling', 2],
  ['minecraft:sugar_cane', 4],
  ['minecraft:sunflower', 5],
  ['minecraft:sweet_berries', 2],
  ['minecraft:tall_grass', 4],
  ['minecraft:torchflower', 7],
  ['minecraft:torchflower_seeds', 2],
  ['minecraft:twisting_vines', 4],
  ['minecraft:vine', 4],
  ['minecraft:warped_fungus', 5],
  ['minecraft:warped_roots', 5],
  ['minecraft:warped_wart_block', 7],
  ['minecraft:weeping_vines', 4],
  ['minecraft:wheat', 5],
  ['minecraft:wheat_seeds', 2],
  ['minecraft:white_tulip', 5],
  ['minecraft:wither_rose', 5]
]

ServerEvents.recipes(event => {

  // Helper as a var fn-expr (Rhino closure-in-scope safety; matches pack style).
  var squeeze = function (n) {
    var cut = Math.ceil(n / BIOFUEL_SQUEEZE_FACTOR)
    return cut < 1 ? 1 : cut
  }

  // Sanitize an item id into an id-safe suffix for the recipe id.
  var idSuffix = function (itemId) {
    return itemId.replace(':', '_').replace(/[^a-z0-9_]/g, '_')
  }

  // STEP 1: nuke every stock crushing recipe that outputs bio_fuel in one shot.
  // (Same {type, output} filter idiom recipe_audit.js uses for mek leaks.)
  event.remove({ type: 'mekanism:crushing', output: 'mekanism:bio_fuel' })

  // STEP 2: re-add each at the squeezed count. Schema copied verbatim from
  //   data/mekanism/recipes/crushing/biofuel/*.json in the pinned jar.
  var added = 0
  BIOFUEL_CRUSH.forEach(function (row) {
    var itemId = row[0]
    var stockN = row[1]
    var cut = squeeze(stockN)
    event.custom({
      type: 'mekanism:crushing',
      input: { ingredient: { item: itemId } },
      output: { count: cut, item: 'mekanism:bio_fuel' }
    }).id('icraft:biofuel_squeeze/' + idSuffix(itemId))
    added++
  })

  console.log('[IridescentCraft] mek_biofuel_squeeze.js loaded -- factor ' +
    BIOFUEL_SQUEEZE_FACTOR + ', re-added ' + added + ' squeezed crushing->bio_fuel recipes')
})
