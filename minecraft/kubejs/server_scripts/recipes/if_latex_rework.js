// =============================================================================
// IridescentCraft — Industrial Foregoing Latex/Rubber Rework
// File: kubejs/server_scripts/recipes/if_latex_rework.js
//
// Design intent: The vanilla IF resin-to-latex pipeline (Tree Fluid Extractor
// slowly drips resin from placed logs) is impractical at scale. Rework to:
//
// 1. Logs → Latex fluid via Create crushing/mixing (bulk processing)
// 2. Mekanism HDPE → Latex items at 1:9 ratio (cross-mod synergy)
// 3. Keep the Latex Processing Unit for latex fluid → dry rubber
//
// This makes rubber/plastic production viable without the tedious tree
// extractor setup while rewarding cross-mod infrastructure investment.
// =============================================================================

ServerEvents.recipes(event => {

  // =========================================================================
  // SECTION A: LOGS → LATEX (Create + Thermal alternatives)
  // =========================================================================
  // Any log can be crushed/processed into latex — bulk processing replaces
  // the slow Tree Fluid Extractor drip system.

  // Create Mixing: 4 logs + water → latex bucket
  // (Mixing basin with water simulates the extraction process at scale)
  event.recipes.create.mixing(
    Fluid.of('industrialforegoing:latex', 250),
    [
      '#minecraft:logs',
      '#minecraft:logs',
      '#minecraft:logs',
      '#minecraft:logs',
      Fluid.of('minecraft:water', 500)
    ]
  ).heated().id('icraft:logs_to_latex_mixing')

  // Create Crushing: 1 log → small amount of latex
  event.recipes.create.crushing([
    Fluid.of('industrialforegoing:latex', 50)
  ], '#minecraft:logs').processingTime(200).id('icraft:log_crush_to_latex')

  // Thermal Crucible: logs → latex fluid
  event.recipes.thermal.crucible(
    Fluid.of('industrialforegoing:latex', 100),
    '#minecraft:logs'
  ).energy(4000).id('icraft:log_crucible_to_latex')

  // =========================================================================
  // SECTION B: MEKANISM HDPE → LATEX ITEMS (1:9 ratio)
  // =========================================================================
  // HDPE is somewhat lacking in uses in the pack. Converting to latex
  // creates a valuable cross-mod synergy — Mekanism players can supply
  // the IF rubber pipeline efficiently.

  // HDPE Sheet → 9 Dry Rubber (shapeless)
  event.shapeless(
    Item.of('industrialforegoing:dry_rubber', 9),
    ['mekanism:hdpe_sheet']
  ).id('icraft:hdpe_sheet_to_dry_rubber')

  // HDPE Pellet → 3 Dry Rubber (shapeless — pellet is less processed)
  event.shapeless(
    Item.of('industrialforegoing:dry_rubber', 3),
    ['mekanism:hdpe_pellet']
  ).id('icraft:hdpe_pellet_to_dry_rubber')

  // HDPE Rod → 6 Dry Rubber (shapeless — between pellet and sheet)
  event.shapeless(
    Item.of('industrialforegoing:dry_rubber', 6),
    ['mekanism:hdpe_rod']
  ).id('icraft:hdpe_rod_to_dry_rubber')

  // =========================================================================
  // SECTION C: DIRECT LATEX FLUID → DRY RUBBER (alternative to machine)
  // =========================================================================
  // Allow smelting a latex bucket into dry rubber as a low-tech option
  // (the Latex Processing Unit is still faster and more efficient)

  event.smelting(
    Item.of('industrialforegoing:dry_rubber', 4),
    'industrialforegoing:latex_bucket'
  ).id('icraft:smelt_latex_to_rubber')

  // Create Compacting: latex fluid → dry rubber
  event.recipes.create.compacting(
    Item.of('industrialforegoing:dry_rubber', 3),
    [Fluid.of('industrialforegoing:latex', 250)]
  ).id('icraft:compact_latex_to_rubber')


  console.log('[IridescentCraft] IF latex rework loaded')
  console.log('  - Logs → latex via Create mixing/crushing + Thermal crucible')
  console.log('  - HDPE sheet/pellet/rod → dry rubber (1:9 / 1:3 / 1:6)')
  console.log('  - Latex fluid → dry rubber via smelting + Create compacting')
})
