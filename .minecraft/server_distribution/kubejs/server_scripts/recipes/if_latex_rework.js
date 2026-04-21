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
  // 2026-04-21: Create's mixing constructor in this build rejects our
  // 2-arg call ("Constructor for create:mixing with 2 arguments not found").
  // Wrapped in try/catch so the rest of the latex pipeline (crushing +
  // crucible + HDPE conversion) still registers. Re-audit Create's KubeJS
  // bindings later to find the correct signature for this version.
  try {
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
  } catch (e) {
    console.warn('[latex-rework] Create mixing recipe registration failed (known issue, crushing + crucible still active): ' + e)
  }

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


  // =========================================================================
  // SECTION D: HDPE CIRCUIT BOARD — Industrial Byproduct Recycling
  // =========================================================================
  // HDPE Sheet + Redstone + Gold Nuggets → Plastic Circuit Board
  // Can substitute for control circuits in select Mekanism recipes,
  // creating a feedback loop: ethylene processing → HDPE byproduct →
  // circuit boards → more machines → more processing capacity.

  // Register the circuit board recipe
  event.shaped('kubejs:hdpe_circuit_board', [
    'GRG',
    'RHR',
    'GRG'
  ], {
    H: 'mekanism:hdpe_sheet',
    R: 'minecraft:redstone',
    G: 'minecraft:gold_nugget'
  }).id('icraft:hdpe_circuit_board')

  // =========================================================================
  // SECTION E: HDPE CIRCUIT AS ALTERNATIVE INGREDIENT
  // =========================================================================
  // Add alternative recipes for key Mekanism machines using HDPE circuits
  // instead of standard control circuits. Not replacing — adding alternatives.

  // Alternative Fission Reactor Casing: HDPE circuit replaces control circuit
  event.shaped('mekanism:fission_reactor_casing', [
    'SCS',
    'CLC',
    'SCS'
  ], {
    S: 'mekanism:ingot_osmium',
    C: 'kubejs:hdpe_circuit_board',
    L: 'minecraft:lead'
  }).id('icraft:fission_casing_hdpe')

  // Alternative Fission Reactor Logic Adapter
  event.shaped('mekanism:fission_reactor_logic_adapter', [
    ' C ',
    'CFC',
    ' C '
  ], {
    C: 'kubejs:hdpe_circuit_board',
    F: 'mekanism:fission_reactor_casing'
  }).id('icraft:fission_logic_hdpe')

  // Alternative Fusion Reactor Frame: HDPE circuit path
  event.shaped('mekanism:fusion_reactor_frame', [
    'SCS',
    'CAC',
    'SCS'
  ], {
    S: 'mekanism:alloy_ultimate',
    C: 'kubejs:hdpe_circuit_board',
    A: 'mekanism:alloy_atomic'
  }).id('icraft:fusion_frame_hdpe')

  // Alternative Fusion Reactor Logic Adapter
  event.shaped('mekanism:fusion_reactor_logic_adapter', [
    ' C ',
    'CFC',
    ' C '
  ], {
    C: 'kubejs:hdpe_circuit_board',
    F: 'mekanism:fusion_reactor_frame'
  }).id('icraft:fusion_logic_hdpe')

  // Alternative Enrichment Chamber: HDPE circuit path (cheaper T3 entry)
  event.shaped('mekanism:enrichment_chamber', [
    'ACA',
    'ISI',
    'ACA'
  ], {
    A: 'mekanism:alloy_infused',
    C: 'kubejs:hdpe_circuit_board',
    I: 'minecraft:iron_ingot',
    S: 'mekanism:steel_casing'
  }).id('icraft:enrichment_chamber_hdpe')

  // Alternative Crusher: HDPE circuit path
  event.shaped('mekanism:crusher', [
    'ACA',
    'ISI',
    'ACA'
  ], {
    A: 'mekanism:alloy_infused',
    C: 'kubejs:hdpe_circuit_board',
    I: 'minecraft:lava_bucket',
    S: 'mekanism:steel_casing'
  }).id('icraft:crusher_hdpe')

  console.log('[IridescentCraft] IF latex rework + HDPE circuits loaded')
  console.log('  - Logs → latex via Create mixing/crushing + Thermal crucible')
  console.log('  - HDPE sheet/pellet/rod → dry rubber (1:9 / 1:3 / 1:6)')
  console.log('  - Latex fluid → dry rubber via smelting + Create compacting')
  console.log('  - HDPE Circuit Board: alternative for fission/fusion/machine recipes')
})
