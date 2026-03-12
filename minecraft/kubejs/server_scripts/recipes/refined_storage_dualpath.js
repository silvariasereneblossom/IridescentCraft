// =============================================================================
// REFINED STORAGE DUAL-PATH RECIPES — Priority 11
// Design Doc Part I, Section 21: Refined Storage (Special Case)
//
// RS is Tier 3 base, Tier 4 advanced. Two parallel recipe paths:
//   Tech:   Mekanism/Thermal materials (osmium, steel, RF components)
//   Magic:  Botania/Ars Nouveau materials (terrasteel, mana diamonds, source gems)
//   Hybrid: BOTH tech+magic materials → double yield or skip intermediates
//
// Strategy:
//   1. Remove default RS recipes for key items
//   2. Add tech-path recipes (osmium/steel/signalum based)
//   3. Add magic-path recipes (terrasteel/mana/source based)
//   4. Add hybrid recipes (both → 2x yield or cheaper)
//   5. T4 advanced items require endgame materials from both paths
//
// AStages already prevents crafting RS items before Tier 3 via item_gates.js.
// These recipes just ensure the MATERIALS required are tier-appropriate.
// =============================================================================

ServerEvents.recipes(event => {

  // =========================================================================
  // STEP 1: REMOVE DEFAULT RS RECIPES
  // We replace these with dual-path versions below.
  // =========================================================================

  const rsItemsToReplace = [
    'refinedstorage:controller',
    'refinedstorage:grid',
    'refinedstorage:crafting_grid',
    'refinedstorage:disk_drive',
    'refinedstorage:crafter',
    'refinedstorage:cable',
    'refinedstorage:machine_casing',
    'refinedstorage:quartz_enriched_iron',
    'refinedstorage:basic_processor',
    'refinedstorage:improved_processor',
    'refinedstorage:advanced_processor',
    'refinedstorage:1k_storage_part',
    'refinedstorage:4k_storage_part',
    'refinedstorage:16k_storage_part',
    'refinedstorage:64k_storage_part',
  ]

  rsItemsToReplace.forEach(item => {
    event.remove({ output: item })
  })

  // =========================================================================
  // STEP 2: SHARED COMPONENT — Machine Casing (required by both paths)
  // Default: 8 quartz_enriched_iron. We make it tier-appropriate.
  // =========================================================================

  // Tech casing: steel + osmium
  event.shaped('refinedstorage:machine_casing', [
    'SOS',
    'O O',
    'SOS'
  ], {
    S: '#forge:ingots/steel',
    O: 'mekanism:ingot_osmium'
  }).id('kubejs:rs_casing_tech')

  // Magic casing: manasteel + mana diamond
  event.shaped('refinedstorage:machine_casing', [
    'MEM',
    'E E',
    'MEM'
  ], {
    M: 'botania:manasteel_ingot',
    E: 'botania:mana_diamond'
  }).id('kubejs:rs_casing_magic')

  // =========================================================================
  // STEP 3: QUARTZ ENRICHED IRON — Base crafting material
  // Default: 1 iron + 1 quartz = 1 enriched iron. We add path variants.
  // =========================================================================

  // Tech path: iron + quartz + osmium nugget → 2x yield
  event.shaped('2x refinedstorage:quartz_enriched_iron', [
    ' Q ',
    'IOI',
    ' Q '
  ], {
    Q: 'minecraft:quartz',
    I: 'minecraft:iron_ingot',
    O: '#forge:nuggets/osmium'
  }).id('kubejs:rs_enriched_iron_tech')

  // Magic path: iron + quartz + mana pearl → 2x yield
  event.shaped('2x refinedstorage:quartz_enriched_iron', [
    ' Q ',
    'IPI',
    ' Q '
  ], {
    Q: 'minecraft:quartz',
    I: 'minecraft:iron_ingot',
    P: 'botania:mana_pearl'
  }).id('kubejs:rs_enriched_iron_magic')

  // =========================================================================
  // STEP 4: PROCESSORS — Three tiers, dual-path each
  // =========================================================================

  // --- Basic Processor ---
  // Tech: silicon + steel + redstone
  event.shaped('refinedstorage:basic_processor', [
    'RSR',
    'SCS',
    'RSR'
  ], {
    R: 'minecraft:redstone',
    S: 'refinedstorage:silicon',
    C: '#forge:ingots/steel'
  }).id('kubejs:rs_basic_processor_tech')

  // Magic: silicon + manasteel + redstone
  event.shaped('refinedstorage:basic_processor', [
    'RSR',
    'SMS',
    'RSR'
  ], {
    R: 'minecraft:redstone',
    S: 'refinedstorage:silicon',
    M: 'botania:manasteel_ingot'
  }).id('kubejs:rs_basic_processor_magic')

  // --- Improved Processor ---
  // Tech: basic processor + osmium + signalum
  event.shaped('refinedstorage:improved_processor', [
    'GOG',
    'OPO',
    'GOG'
  ], {
    G: 'minecraft:gold_ingot',
    O: 'mekanism:ingot_osmium',
    P: 'refinedstorage:basic_processor'
  }).id('kubejs:rs_improved_processor_tech')

  // Magic: basic processor + mana diamond + source gem
  event.shaped('refinedstorage:improved_processor', [
    'GMG',
    'MPM',
    'GMG'
  ], {
    G: 'minecraft:gold_ingot',
    M: 'botania:mana_diamond',
    P: 'refinedstorage:basic_processor'
  }).id('kubejs:rs_improved_processor_magic')

  // --- Advanced Processor ---
  // Tech: improved processor + enderium + diamond
  event.shaped('refinedstorage:advanced_processor', [
    'DED',
    'EPE',
    'DED'
  ], {
    D: 'minecraft:diamond',
    E: '#forge:ingots/enderium',
    P: 'refinedstorage:improved_processor'
  }).id('kubejs:rs_advanced_processor_tech')

  // Magic: improved processor + terrasteel + ars source gem
  event.shaped('refinedstorage:advanced_processor', [
    'DTD',
    'TPT',
    'DTD'
  ], {
    D: 'minecraft:diamond',
    T: 'botania:terrasteel_ingot',
    P: 'refinedstorage:improved_processor'
  }).id('kubejs:rs_advanced_processor_magic')

  // =========================================================================
  // STEP 5: CONTROLLER — Core of the RS network
  // =========================================================================

  // Tech: machine casing + advanced processor + osmium + diamond
  event.shaped('refinedstorage:controller', [
    'OAO',
    'DCD',
    'OAO'
  ], {
    O: 'mekanism:ingot_osmium',
    A: 'refinedstorage:advanced_processor',
    D: 'minecraft:diamond',
    C: 'refinedstorage:machine_casing'
  }).id('kubejs:rs_controller_tech')

  // Magic: machine casing + advanced processor + terrasteel + mana diamond
  event.shaped('refinedstorage:controller', [
    'TAT',
    'MCM',
    'TAT'
  ], {
    T: 'botania:terrasteel_ingot',
    A: 'refinedstorage:advanced_processor',
    M: 'botania:mana_diamond',
    C: 'refinedstorage:machine_casing'
  }).id('kubejs:rs_controller_magic')

  // HYBRID: cheaper — uses BOTH tech+magic → skip advanced processor
  event.shaped('refinedstorage:controller', [
    'OTO',
    'DCD',
    'TMT'
  ], {
    O: 'mekanism:ingot_osmium',
    T: 'botania:terrasteel_ingot',
    D: 'minecraft:diamond',
    C: 'refinedstorage:machine_casing',
    M: 'refinedstorage:improved_processor'  // only needs improved, not advanced
  }).id('kubejs:rs_controller_hybrid')

  // =========================================================================
  // STEP 6: GRID & CRAFTING GRID
  // =========================================================================

  // Grid — Tech
  event.shaped('refinedstorage:grid', [
    'EPE',
    'GCG',
    'EEE'
  ], {
    E: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:improved_processor',
    G: 'minecraft:glass',
    C: 'refinedstorage:machine_casing'
  }).id('kubejs:rs_grid_tech')

  // Grid — Magic (same pattern, just ID differentiation for JEI)
  event.shaped('refinedstorage:grid', [
    'MPM',
    'GCG',
    'MMM'
  ], {
    M: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:improved_processor',
    G: '#forge:glass',
    C: 'refinedstorage:machine_casing'
  }).id('kubejs:rs_grid_magic')

  // Crafting Grid — uses Grid + crafting table
  event.shaped('refinedstorage:crafting_grid', [
    'EPE',
    'WGW',
    'EEE'
  ], {
    E: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:advanced_processor',
    W: 'minecraft:crafting_table',
    G: 'refinedstorage:grid'
  }).id('kubejs:rs_crafting_grid')

  // =========================================================================
  // STEP 7: DISK DRIVE
  // =========================================================================

  // Tech
  event.shaped('refinedstorage:disk_drive', [
    'OPO',
    'OCO',
    'OSO'
  ], {
    O: 'mekanism:ingot_osmium',
    P: 'refinedstorage:improved_processor',
    C: 'refinedstorage:machine_casing',
    S: '#forge:ingots/steel'
  }).id('kubejs:rs_disk_drive_tech')

  // Magic
  event.shaped('refinedstorage:disk_drive', [
    'TPT',
    'TCT',
    'TMT'
  ], {
    T: 'botania:manasteel_ingot',
    P: 'refinedstorage:improved_processor',
    C: 'refinedstorage:machine_casing',
    M: 'botania:mana_diamond'
  }).id('kubejs:rs_disk_drive_magic')

  // =========================================================================
  // STEP 8: CRAFTER
  // =========================================================================

  // Tech
  event.shaped('refinedstorage:crafter', [
    'EPE',
    'WCW',
    'ESE'
  ], {
    E: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:advanced_processor',
    W: 'minecraft:crafting_table',
    C: 'refinedstorage:machine_casing',
    S: '#forge:ingots/steel'
  }).id('kubejs:rs_crafter_tech')

  // Magic
  event.shaped('refinedstorage:crafter', [
    'EPE',
    'WCW',
    'EME'
  ], {
    E: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:advanced_processor',
    W: 'minecraft:crafting_table',
    C: 'refinedstorage:machine_casing',
    M: 'botania:terrasteel_ingot'
  }).id('kubejs:rs_crafter_magic')

  // =========================================================================
  // STEP 9: CABLE (cheap, just needs enriched iron)
  // =========================================================================

  event.shaped('12x refinedstorage:cable', [
    'EEE',
    'RGR',
    'EEE'
  ], {
    E: 'refinedstorage:quartz_enriched_iron',
    R: 'minecraft:redstone',
    G: '#forge:glass'
  }).id('kubejs:rs_cable')

  // =========================================================================
  // STEP 10: STORAGE PARTS — Dual-path with hybrid bonuses
  // =========================================================================

  // 1K — Tech
  event.shaped('refinedstorage:1k_storage_part', [
    'RSR',
    'SPS',
    'RSR'
  ], {
    R: 'minecraft:redstone',
    S: 'refinedstorage:quartz_enriched_iron',
    P: 'refinedstorage:basic_processor'
  }).id('kubejs:rs_1k_part_tech')

  // 1K — Magic
  event.shaped('refinedstorage:1k_storage_part', [
    'RMR',
    'MPM',
    'RMR'
  ], {
    R: 'minecraft:redstone',
    M: 'botania:manasteel_nugget',
    P: 'refinedstorage:basic_processor'
  }).id('kubejs:rs_1k_part_magic')

  // 4K — Tech (uses 3× 1K parts)
  event.shaped('refinedstorage:4k_storage_part', [
    'SPS',
    'POP',
    'SPS'
  ], {
    S: 'refinedstorage:1k_storage_part',
    P: 'refinedstorage:basic_processor',
    O: 'mekanism:ingot_osmium'
  }).id('kubejs:rs_4k_part_tech')

  // 4K — Magic
  event.shaped('refinedstorage:4k_storage_part', [
    'SPS',
    'PMP',
    'SPS'
  ], {
    S: 'refinedstorage:1k_storage_part',
    P: 'refinedstorage:basic_processor',
    M: 'botania:mana_diamond'
  }).id('kubejs:rs_4k_part_magic')

  // 16K — Tech
  event.shaped('refinedstorage:16k_storage_part', [
    'SPS',
    'PEP',
    'SPS'
  ], {
    S: 'refinedstorage:4k_storage_part',
    P: 'refinedstorage:improved_processor',
    E: '#forge:ingots/enderium'
  }).id('kubejs:rs_16k_part_tech')

  // 16K — Magic
  event.shaped('refinedstorage:16k_storage_part', [
    'SPS',
    'PTP',
    'SPS'
  ], {
    S: 'refinedstorage:4k_storage_part',
    P: 'refinedstorage:improved_processor',
    T: 'botania:terrasteel_ingot'
  }).id('kubejs:rs_16k_part_magic')

  // 64K — Tech
  event.shaped('refinedstorage:64k_storage_part', [
    'SPS',
    'PDP',
    'SPS'
  ], {
    S: 'refinedstorage:16k_storage_part',
    P: 'refinedstorage:advanced_processor',
    D: 'minecraft:diamond_block'
  }).id('kubejs:rs_64k_part_tech')

  // 64K — Magic
  event.shaped('refinedstorage:64k_storage_part', [
    'SPS',
    'PGP',
    'SPS'
  ], {
    S: 'refinedstorage:16k_storage_part',
    P: 'refinedstorage:advanced_processor',
    G: 'botania:gaia_ingot'
  }).id('kubejs:rs_64k_part_magic')

  // 64K — HYBRID (2x yield — the big payoff for investing in both paths)
  event.shaped('2x refinedstorage:64k_storage_part', [
    'OTO',
    'ADA',
    'TGT'
  ], {
    O: 'mekanism:ingot_osmium',
    T: 'botania:terrasteel_ingot',
    A: 'refinedstorage:advanced_processor',
    D: 'minecraft:diamond_block',
    G: 'botania:gaia_ingot'
  }).id('kubejs:rs_64k_part_hybrid')

  // =========================================================================
  // STEP 11: TIER 4 ADVANCED — RSInfinityBooster + ExtraStorage/ExtraDisks
  // Requires endgame materials. No dual-path — both paths converge here.
  // =========================================================================

  // RSInfinityBooster — infinite wireless range
  // Requires nether star + ender pearls + advanced processors + netherite
  event.remove({ output: 'rsinfinitybooster:infinity_card' })
  event.shaped('rsinfinitybooster:infinity_card', [
    'NAN',
    'ESE',
    'NAN'
  ], {
    N: 'minecraft:netherite_ingot',
    A: 'refinedstorage:advanced_processor',
    E: 'minecraft:ender_eye',
    S: 'minecraft:nether_star'
  }).id('kubejs:rs_infinity_card')

  // ExtraStorage 256K part — requires 64K parts + gaia ingot
  event.remove({ output: 'extrastorage:storagepart_256k' })
  event.shaped('extrastorage:storagepart_256k', [
    'SAS',
    'AGA',
    'SAS'
  ], {
    S: 'refinedstorage:64k_storage_part',
    A: 'refinedstorage:advanced_processor',
    G: 'botania:gaia_ingot'
  }).id('kubejs:rs_256k_part')

  // ExtraStorage 1024K part — requires 256K + netherite
  event.remove({ output: 'extrastorage:storagepart_1024k' })
  event.shaped('extrastorage:storagepart_1024k', [
    'SAS',
    'ANA',
    'SAS'
  ], {
    S: 'extrastorage:storagepart_256k',
    A: 'refinedstorage:advanced_processor',
    N: 'minecraft:netherite_ingot'
  }).id('kubejs:rs_1024k_part')

  // ExtraStorage 4096K part — requires 1024K + nether star
  event.remove({ output: 'extrastorage:storagepart_4096k' })
  event.shaped('extrastorage:storagepart_4096k', [
    'SAS',
    'ASA',
    'SAS'
  ], {
    S: 'extrastorage:storagepart_1024k',
    A: 'refinedstorage:advanced_processor'
  }).id('kubejs:rs_4096k_part')

  // =========================================================================
  // STEP 12: PERIPHERAL RS ITEMS (importer, exporter, etc.)
  // These use standard enriched iron + processor recipes.
  // We don't override these — they're cheap enough and processor gates apply.
  // =========================================================================
  // refinedstorage:importer — default recipe OK (uses improved processor)
  // refinedstorage:exporter — default recipe OK
  // refinedstorage:external_storage — default recipe OK
  // refinedstorage:constructor — default recipe OK
  // refinedstorage:destructor — default recipe OK
  // refinedstorage:detector — default recipe OK
  // refinedstorage:wireless_transmitter — default recipe OK
  //
  // These all use processors as ingredients, which are already dual-pathed.
  // The tier gate propagates through the processor dependency chain.
})
