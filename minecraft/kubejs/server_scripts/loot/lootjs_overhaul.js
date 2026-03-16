// =============================================================================
// LOOTJS LOOT TABLE OVERHAUL
// Place in: kubejs/server_scripts/loot/lootjs_overhaul.js
// REQUIRES: LootJS addon (https://curseforge.com/minecraft/mc-mods/lootjs)
//
// Design doc Part I, Section 19: Loot Table Overhaul
// "Every dungeon/structure mod's loot tables must respect the tier system."
//
// STRUCTURE CHEST MODIFIERS ONLY. Boss entity drops are in loot_overhaul.js.
//
// WHAT THIS DOES:
// 1. Removes tier-breaking items (diamonds, enchanted books, netherite)
//    from structure chests based on tier appropriateness
// 2. Injects tier-appropriate progression tokens into structure chests
// 3. Removes enchanted books from ALL structure loot (Apotheosis handles enchanting)
// 4. Reduces Overworld food and removes modded food from structure chests
// 5. Village chest loot restrictions (iron/leather only, no powerful modded items)
// 6. Curio drops for tower structures
//
// STRUCTURE MOD COVERAGE (35+ mods):
//   YUNG's Better series (Dungeons, Strongholds, Fortresses, Mineshafts,
//     Ocean Monuments, Desert Temples, End Island),
//   Dungeon Crawl, IDAS, Explorify, Dungeons Plus, Moog's End Structures,
//   Structory, Structory Towers, Keebsz Battle Towers, Iron's Spellbooks,
//   Villages & Pillages, Overhauled Structures, Loot Integrations,
//   Celestial Artifacts, Unwrecked Ships, Ultris, When Dungeons Arise,
//   Valhelsia Structures, Repurposed Structures, Integrated Stronghold,
//   ChoiceTheorem's Overhauled Village, Explorations+,
//   Cataclysm (structures), Twilight Forest (structures),
//   Blue Skies, Aether, Deep Aether, Undergarden, Deeper and Darker,
//   The Abyss (structures)
//
// BOSS MOD COVERAGE (8 mods):
//   Meet Your Fight, Mutant Monsters, Majestic Menaces, Stalwart Dungeons,
//   Keebsz (loot table), Iron's Spellbooks, The Abyss,
//   Ultimate Bosses (loot table), Cataclysm, Twilight Forest
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: GLOBAL ENCHANTED BOOK REMOVAL
  // =========================================================================
  // Design doc: "REMOVE all enchanted books from structure loot.
  // Apotheosis is the enchanting system."
  //
  // This single rule covers ALL structure chest loot tables EXCEPT
  // Ad Astra planetary dimensions (which have custom planetary enchantment
  // books added by planetary_loot.js).
  // =========================================================================

  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(
      'minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end',
      'twilightforest:twilight_forest',
      'blue_skies:everbright', 'blue_skies:everdawn',
      'aether:the_aether', 'deep_aether:the_aether',
      'undergarden:undergarden',
      'deeperdarker:otherside',
      'theabyss:the_abyss'
    )
    .removeLoot('minecraft:enchanted_book')

  // =========================================================================
  // SECTION 2: TIER 1 STRUCTURE LOOT (Overworld)
  // Remove diamonds, add T1 token chance
  // =========================================================================
  // Overworld structures should NOT contain diamonds or netherite.
  // They get iron-tier tokens instead.
  //
  // Matched mods: Dungeon Crawl (stages 1-3), Explorify, Dungeons Plus,
  // Structory, Villages & Pillages, Better Desert Temples (storage tier),
  // Loot Integrations (easy/village/water), Unwrecked Ships,
  // Overhauled Structures (chest_1/2), YUNG's series (OW structures)
  // =========================================================================

  // --- Dungeon Crawl: MOVED to Section 4B (more granular coverage) ---

  // --- Explorify (all chests — Overworld structures) ---
  event
    .addLootTableModifier(/explorify:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.15)))

  // --- Dungeons Plus: MOVED to Section 4B (common/rare split) ---

  // --- Structory + Structory Towers: MOVED to Section 4B (chests-scoped) ---

  // --- Villages & Pillages ---
  // No T1 tokens — villages are starting areas, not progression structures
  event
    .addLootTableModifier(/villagesandpillages:.*chests.*/)
    .removeLoot('minecraft:diamond')

  // --- Unwrecked Ships ---
  event
    .addLootTableModifier(/unwrecked_ships:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  // --- Better Desert Temples: storage tier (food_storage, storage, pot, wardrobe) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:food_storage|storage|pot|wardrobe)/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.12)))

  // --- Better Desert Temples: mid tier (lab, library, statue, tomb) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*(?:lab|library|statue|tomb(?!_pharaoh))/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // --- Better Desert Temples: pharaoh tier (tomb_pharaoh, pharaoh_hidden) ---
  event
    .addLootTableModifier(/betterdeserttemples:.*pharaoh/)
    .removeLoot('minecraft:diamond')
    .addWeightedLoot([
      Item.of('kubejs:tier2_token').withChance(75),
      Item.of('kubejs:tier3_token').withChance(5)
    ])

  // --- Overhauled Structures: common (chest_1, chest_2) ---
  event
    .addLootTableModifier(/overhauledstructures:.*chest_[12]/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // --- Overhauled Structures: rare (chest_3, chest_m) ---
  event
    .addLootTableModifier(/overhauledstructures:.*chest_[3m]/)
    .addWeightedLoot([
      Item.of('kubejs:tier2_token').withChance(78),
      Item.of('kubejs:tier3_token').withChance(5)
    ])

  // --- Loot Integrations: easy/village/water = T1 ---
  event
    .addLootTableModifier(/lootintegrations:.*(?:easy|village|water)/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.12)))

  // --- Loot Integrations: medium = T2 ---
  event
    .addLootTableModifier(/lootintegrations:.*medium/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))

  // --- Loot Integrations: hard/nether = T3 ---
  event
    .addLootTableModifier(/lootintegrations:.*(?:hard|nether)/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.15)))

  // --- Celestial Artifacts ---
  event
    .addLootTableModifier(/celestial_artifacts:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // =========================================================================
  // SECTION 3: TIER 2 STRUCTURE LOOT (Dimensional dungeons)
  // These structures exist in T2 dimensions — allow diamonds but no netherite
  // =========================================================================

  // --- IDAS: MOVED to Section 4B (overworld/treasure split) ---

  // --- Keebsz Battle Towers ---
  // Loot tables confirmed: keebsz:{biome}/floor{N}and{N+1} (6 biomes × 5 tiers)
  // Lower floors (1-4) = T1, mid floors (5-6) = T1-T2, upper floors (7-10) = T2
  event
    .addLootTableModifier(/keebsz:.*\/floor[12]and[23]/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  event
    .addLootTableModifier(/keebsz:.*\/floor[35]and[46]/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.18)))

  event
    .addLootTableModifier(/keebsz:.*\/floor[79]and[810]/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))

  // --- Iron's Spellbooks structures ---
  event
    .addLootTableModifier(/irons_spellbooks:.*chests.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))

  // --- Moog's End Structures (T4 content — allow everything, add T4 tokens + thematic loot) ---
  event
    .addLootTableModifier(/mes:.*chests.*/)
    .addLoot(LootEntry.of('kubejs:tier4_token').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('minecraft:chorus_fruit').limitCount([4, 8]).when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('minecraft:ender_pearl').limitCount([2, 4]).when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('minecraft:shulker_shell').when(c => c.randomChance(0.03)))

  // =========================================================================
  // SECTIONS 4–4H: BOSS ENTITY LOOT MODIFIERS
  // REMOVED — All boss entity drops (tokens, Simply Swords uniques,
  // mini-boss materials, next-tier peeks) are now handled exclusively
  // by loot_overhaul.js to avoid duplicate drops.
  // This file only handles STRUCTURE CHEST modifiers.
  // =========================================================================

  // =========================================================================
  // SECTION 4B: NEWLY VERIFIED STRUCTURE MODS
  // Registry-confirmed loot table namespaces from scan3/scan4
  // =========================================================================

  // --- When Dungeons Arise (131 tables) ---
  // T1-T2 structures: villages, pubs, fishing huts, farms
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(fishing_hut|bandit_village|greenwood_pub|giant_mushroom|bathhouse|aviary)\//)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  // T2 structures: temples, towers, foundry
  event
    .addLootTableModifier(
      /dungeons_arise:chests\/(abandoned_temple|bandit_towers|foundry|scorched_mines)\//)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // T2-T3 structures: heavenly series (challenger, conqueror, rider)
  event
    .addLootTableModifier(/dungeons_arise:chests\/heavenly_/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // Catch-all treasure tables
  event
    .addLootTableModifier(/dungeons_arise:chests\/.*treasure/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.22)))

  // --- Repurposed Structures ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)

  // --- Valhelsia Structures (11 chest tables) ---
  // T1-T2: common structures
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/castle',
      'valhelsia_structures:chests/castle_ruin',
      'valhelsia_structures:chests/desert_house',
      'valhelsia_structures:chests/forge',
      'valhelsia_structures:chests/kitchen',
      'valhelsia_structures:chests/miscellaneous',
      'valhelsia_structures:chests/player_house',
      'valhelsia_structures:chests/witch_hut')
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  // T2: spawner dungeon + treasure
  event
    .addLootTableModifier(
      'valhelsia_structures:chests/spawner_dungeon',
      'valhelsia_structures:chests/treasure')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // --- IDAS: Integrated Dungeons and Structures (144 tables) ---
  // General overworld structures (T1)
  event
    .addLootTableModifier(/idas:chests\/(?!.*treasure)/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // Treasure tables within IDAS (T2)
  event
    .addLootTableModifier(/idas:chests\/.*treasure/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // --- Integrated Stronghold ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)

  // --- Dungeons Plus (31 tables) ---
  // Common chests (T1)
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/common/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  // Rare chests (T2)
  event
    .addLootTableModifier(/dungeons_plus:chests\/.*\/rare/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // --- Dungeon Crawl (15 tables) ---
  // Staged dungeon: stages 1-2 = T1, stages 3-5 = T2, treasure = T2-T3
  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_1',
      'dungeoncrawl:chests/stage_2',
      'dungeoncrawl:chests/food',
      'dungeoncrawl:chests/supply')
    .removeLoot('minecraft:diamond')
    .removeLoot('minecraft:diamond_block')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_3',
      'dungeoncrawl:chests/stage_4',
      'dungeoncrawl:chests/forge',
      'dungeoncrawl:chests/library')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  event
    .addLootTableModifier(
      'dungeoncrawl:chests/stage_5',
      'dungeoncrawl:chests/secret_room',
      'dungeoncrawl:chests/treasure')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.22)))

  // --- Structory (39 tables) — T1 overworld ---
  event
    .addLootTableModifier(/structory:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // --- Structory Towers (49 tables) — T1-T2 overworld ---
  event
    .addLootTableModifier(/structory_towers:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // =========================================================================
  // SECTION 4C: YUNG'S BETTER SERIES
  // All confirmed in loot table registry scan
  // =========================================================================

  // --- YUNG's Better Dungeons (8 tables) ---
  // T1-T2: overworld dungeons (zombie, skeleton, spider variants)
  event
    .addLootTableModifier(/betterdungeons:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.18)))

  // --- YUNG's Better Strongholds (10 tables) ---
  // T2-T3: late overworld (library, corridor, crossing, grand_library, portal_room)
  event
    .addLootTableModifier(/betterstrongholds:.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // --- YUNG's Better Nether Fortresses (9 tables) ---
  // T3: Nether structures
  event
    .addLootTableModifier(/betterfortresses:.*/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.18)))

  // --- YUNG's Better Mineshafts ---
  // T1: overworld mineshafts
  event
    .addLootTableModifier(/bettermineshafts:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  // --- YUNG's Better Ocean Monuments (1 table) ---
  // T2: challenging overworld
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))

  // --- YUNG's Better End Island ---
  // NOT PRESENT in modpack (confirmed by loot_overhaul.js discovery scan)
  // Kept commented out for future reference:
  // event.addLootTableModifier(/betterendisland:.*/)
  //   .addLoot(LootEntry.of('kubejs:tier4_token').when(c => c.randomChance(0.15)))

  // Note: Better Desert Temples already covered in Section 3 above

  // =========================================================================
  // SECTION 4D: DIMENSION-SPECIFIC STRUCTURE LOOT
  // Dimensional mods with their own structure chests
  // =========================================================================

  // --- Blue Skies (641 tables, targeting chests only) ---
  // T2-T3: Everbright and Everdawn dimensions
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.05)))

  // --- Blue Skies: Runic Arc as very rare structure chest loot (0.5%) ---
  // Supplements the 5% boss drop rate (see loot_overhaul.js).
  // Only in Blue Skies dimensions to maintain dimensional gating.
  event
    .addLootTableModifier(/blue_skies:chests\/.*/)
    .addLoot(LootEntry.of('blue_skies:runic_arc').when(c => c.randomChance(0.005)))

  // --- Aether (191 tables, targeting chests only) ---
  // T2-T3: Aether dimension dungeons (bronze/silver/gold)
  event
    .addLootTableModifier(/aether:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.05)))

  // --- Deep Aether (301 tables, targeting chests only) ---
  // T3-T4: Deep Aether brass/gold dungeons
  event
    .addLootTableModifier(/deep_aether:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.22)))
    .addLoot(LootEntry.of('kubejs:tier4_token').when(c => c.randomChance(0.08)))

  // --- Undergarden (215 tables, targeting chests only) ---
  // T2-T3: Undergarden dimension
  event
    .addLootTableModifier(/undergarden:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.05)))

  // --- Deeper and Darker (149 tables, targeting chests only) ---
  // T3: Otherside dimension
  event
    .addLootTableModifier(/deeperdarker:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.20)))

  // --- The Abyss structures (13 tables) ---
  // T3: Abyss dimension structures
  event
    .addLootTableModifier(/theabyss:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.18)))

  // --- Cataclysm structures (164 tables, targeting chests only) ---
  // T3-T4: high-tier dungeon structures (soul forge, burning arena, sunken city, etc.)
  event
    .addLootTableModifier(/cataclysm:.*chest.*/)
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.22)))

  // --- Twilight Forest (532 tables, targeting chests only) ---
  // T2-T3: Twilight Forest dimension
  event
    .addLootTableModifier(/twilightforest:chests\/.*/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.05)))

  // =========================================================================
  // SECTION 4E: REMAINING OVERWORLD STRUCTURE MODS
  // =========================================================================

  // --- ChoiceTheorem's Overhauled Village (12 tables) ---
  // No T1 tokens — villages are starting areas, not progression structures
  event
    .addLootTableModifier(/ctov:.*/)
    .removeLoot('minecraft:diamond')

  // --- Explorations+ (16 tables) ---
  // T1: overworld exploration structures
  event
    .addLootTableModifier(/explorations:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // --- Overhauled Structures: covered in Section 2 (chest_[12], chest_[3m]) ---

  // --- Loot Integrations: covered in Section 2 (difficulty-tier split) ---

  // =========================================================================
  // SECTION 5: DIAMOND/NETHERITE REMOVAL FROM VANILLA STRUCTURES
  // =========================================================================
  // Vanilla structures (desert temples, dungeons, mineshafts, etc.) should
  // not contain diamonds in a tier-gated pack. Players earn diamonds through
  // Tier 2 progression.
  // =========================================================================

  // Non-village vanilla overworld chests: remove diamonds + add T1 token chance
  const vanillaOverworldChests = [
    'minecraft:chests/simple_dungeon',
    'minecraft:chests/abandoned_mineshaft',
    'minecraft:chests/buried_treasure',
    'minecraft:chests/desert_pyramid',
    'minecraft:chests/jungle_temple',
    'minecraft:chests/pillager_outpost',
    'minecraft:chests/shipwreck_treasure',
    'minecraft:chests/stronghold_corridor',
    'minecraft:chests/stronghold_crossing',
    'minecraft:chests/stronghold_library',
    'minecraft:chests/underwater_ruin_big',
    'minecraft:chests/underwater_ruin_small',
    'minecraft:chests/woodland_mansion'
  ]

  vanillaOverworldChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
      .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))
  })

  // Village smith chests: remove diamonds but NO T1 tokens
  // Villages are starting areas, not progression structures
  const vanillaVillageSmithChests = [
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_armorer'
  ]

  vanillaVillageSmithChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
  })

  // =========================================================================
  // SECTION 5B: OVERWORLD STRUCTURE FOOD REDUCTION
  // =========================================================================
  // Reduce non-meat food in Overworld structure chests by 90%.
  // Meat (raw/cooked) is kept as-is since there's no infinite source.
  // Modded foods (Pam's HarvestCraft, Farmer's Delight) removed entirely
  // from structure loot — those should be player-crafted.
  // Only applies to Overworld dimension.
  // =========================================================================

  // --- Non-meat food items to reduce by 90% (keep 10% chance) ---
  // Uses removeLoot + addLoot with 10% random chance per food.
  // This effectively removes ~90% of these foods from Overworld structure chests.
  const reducedFoods = [
    'minecraft:bread',
    'minecraft:apple',
    'minecraft:golden_apple',
    'minecraft:golden_carrot',
    'minecraft:cookie',
    'minecraft:pumpkin_pie',
    'minecraft:beetroot_soup',
    'minecraft:mushroom_stew',
    'minecraft:suspicious_stew',
    'minecraft:baked_potato',
    'minecraft:carrot',
    'minecraft:potato',
    'minecraft:beetroot',
    'minecraft:melon_slice',
    'minecraft:sweet_berries',
    'minecraft:dried_kelp',
    'minecraft:cake'
  ]

  // Apply 90% reduction to non-meat food in ALL chest loot (Overworld only).
  // Single modifier that removes all listed foods, then re-adds each at 10% chance.
  let foodModifier = event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')

  reducedFoods.forEach(food => {
    foodModifier.removeLoot(food)
    foodModifier.addLoot(LootEntry.of(food).when(c => c.randomChance(0.10)))
  })

  // --- Remove modded foods from structure chests (Overworld only) ---
  // Pam's HarvestCraft and Farmer's Delight foods should be player-crafted.
  // Uses KubeJS @mod filter to match all items from these namespaces.
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('@pamhc')
    .removeLoot('@farmersdelight')
    .removeLoot('@farmersrespite')
    .removeLoot('@brewinandchewin')
    .removeLoot('@collectorsreap')
    .removeLoot('@croptopia')
    .removeLoot('@culturaldelights')
    .removeLoot('@delightful')
    .removeLoot('@nethersdelight')

  // --- Remove tier-gated mod items from Overworld chests ---
  // These mods inject items into vanilla loot tables but are AStages-gated,
  // causing "Unfamiliar Item" confusion for pre-tier players.
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:overworld')
    .removeLoot('@aether')
    .removeLoot('@deep_aether')
    .removeLoot('@blue_skies')
    .removeLoot('@twilightforest')
    .removeLoot('@theabyss')

  // =========================================================================
  // SECTION 5C: OCEAN STRUCTURE LOOT
  // =========================================================================
  // Ocean structures (Monuments, Ruins, Shipwrecks, Buried Treasure) get
  // T1-appropriate loot with token fragments (15-20% chance).
  // Ocean Monuments get slightly better loot since they require underwater
  // combat (Elder Guardians). Water-themed curio drops at ~10% chance.
  // YUNG's Better Ocean Monuments handled in Section 4C above (T2 tokens).
  // =========================================================================

  // --- Vanilla Ocean Structures: Shipwrecks, Ocean Ruins, Buried Treasure ---
  // T1 ocean loot: nautical supplies + token fragments (15% chance)
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure')
    .addLoot(LootEntry.of('minecraft:prismarine_shard').limitCount([1, 3]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('minecraft:prismarine_crystals').limitCount([1, 2]).when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('minecraft:nautilus_shell').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.15)))

  // --- Vanilla Ocean Monument ---
  // T1-T2 ocean loot: slightly better rewards for underwater combat challenge
  // Note: diamonds already removed by Section 5 vanillaOverworldChests
  // Note: YUNG's Better Ocean Monuments already handled in Section 4C (T2 tokens)
  event
    .addLootTableModifier('minecraft:chests/ocean_monument')
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('minecraft:prismarine_shard').limitCount([2, 5]).when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('minecraft:prismarine_crystals').limitCount([2, 4]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('minecraft:sponge').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.20)))

  // --- Ocean structure curio drops: water-themed artifacts (~10% total) ---
  // Spread across multiple items at low individual chance to total ~10%
  event
    .addLootTableModifier(
      'minecraft:chests/shipwreck_treasure',
      'minecraft:chests/shipwreck_map',
      'minecraft:chests/shipwreck_supply',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/ocean_monument')
    .addLoot(
      LootEntry.of('artifacts:snorkel').when(c => c.randomChance(0.025))
    )
    .addLoot(
      LootEntry.of('artifacts:flippers').when(c => c.randomChance(0.025))
    )
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.02))
    )
    .addLoot(
      LootEntry.of('artifacts:pocket_piston').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.01))
    )

  // --- YUNG's Better Ocean Monuments: curio drops ---
  // Already has T2 tokens from Section 4C; add water-themed curios here
  event
    .addLootTableModifier(/betteroceanmonuments:.*/)
    .addLoot(
      LootEntry.of('artifacts:snorkel').when(c => c.randomChance(0.03))
    )
    .addLoot(
      LootEntry.of('artifacts:flippers').when(c => c.randomChance(0.03))
    )
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.02))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.012))
    )

  // =========================================================================
  // SECTION 6: VILLAGE CHEST LOOT RESTRICTIONS
  // =========================================================================
  // Design doc: Village loot should be T1-appropriate only.
  // Remove powerful modded items, ensure iron/leather gear baseline.
  // Apotheosis affixes are applied post-generation and cannot be controlled
  // here, but we can remove obvious tier-breaking items.
  // =========================================================================

  const villageChests = [
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_armorer',
    'minecraft:chests/village/village_plains_house',
    'minecraft:chests/village/village_desert_house',
    'minecraft:chests/village/village_savanna_house',
    'minecraft:chests/village/village_snowy_house',
    'minecraft:chests/village/village_taiga_house',
    'minecraft:chests/village/village_temple',
    'minecraft:chests/village/village_fisher',
    'minecraft:chests/village/village_tannery',
    'minecraft:chests/village/village_shepherd',
    'minecraft:chests/village/village_butcher',
    'minecraft:chests/village/village_cartographer',
    'minecraft:chests/village/village_mason'
  ]

  // Remove all diamond+ gear and powerful modded items from village chests
  villageChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_sword')
      .removeLoot('minecraft:diamond_pickaxe')
      .removeLoot('minecraft:diamond_axe')
      .removeLoot('minecraft:diamond_shovel')
      .removeLoot('minecraft:diamond_hoe')
      .removeLoot('minecraft:diamond_helmet')
      .removeLoot('minecraft:diamond_chestplate')
      .removeLoot('minecraft:diamond_leggings')
      .removeLoot('minecraft:diamond_boots')
      .removeLoot('minecraft:diamond_horse_armor')
      .removeLoot('minecraft:golden_horse_armor')
      .removeLoot('minecraft:iron_horse_armor')
      .removeLoot('minecraft:enchanted_golden_apple')
  })

  // Add guaranteed basic gear to smith village chests
  event
    .addLootTableModifier(
      'minecraft:chests/village/village_weaponsmith',
      'minecraft:chests/village/village_toolsmith',
      'minecraft:chests/village/village_armorer')
    .addLoot(LootEntry.of('minecraft:iron_ingot').limitCount([2, 5]))
    .addWeightedLoot([
      Item.of('minecraft:iron_sword').withChance(20),
      Item.of('minecraft:iron_pickaxe').withChance(20),
      Item.of('minecraft:iron_axe').withChance(15),
      Item.of('minecraft:leather_helmet').withChance(15),
      Item.of('minecraft:leather_chestplate').withChance(10),
      Item.of('minecraft:leather_leggings').withChance(10),
      Item.of('minecraft:leather_boots').withChance(10)
    ])

  // =========================================================================
  // SECTION 7: TOWER STRUCTURE CURIO DROPS
  // =========================================================================
  // Design doc Part IX: Curios drop from tier-appropriate loot tables.
  // General utility curios (movement speed, minor buffs) appear in T1 loot.
  // Tower structures (Structory Towers, Keebsz Battle Towers) get a 15%
  // chance to contain a random curio item from the artifacts mod.
  // =========================================================================

  // Structory Towers — ~15% chance for a random utility curio
  // Uses addLoot with randomChance so it's not guaranteed every chest
  event
    .addLootTableModifier(/structory_towers:.*chests.*/)
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:kitty_slippers').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:bunny_hoppers').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:running_shoes').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:snowshoes').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:pocket_piston').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:universal_attractor').when(c => c.randomChance(0.01))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.008))
    )
    .addLoot(
      LootEntry.of('artifacts:cloud_in_a_bottle').when(c => c.randomChance(0.01))
    )
    .addLoot(
      LootEntry.of('artifacts:obsidian_skull').when(c => c.randomChance(0.008))
    )

  // Keebsz Battle Towers — upper floors (7-10) get curio chance (~15%)
  event
    .addLootTableModifier(/keebsz:.*\/floor[79]and[810]/)
    .addLoot(
      LootEntry.of('artifacts:umbrella').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:kitty_slippers').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:bunny_hoppers').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:running_shoes').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:snowshoes').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:pocket_piston').when(c => c.randomChance(0.015))
    )
    .addLoot(
      LootEntry.of('artifacts:universal_attractor').when(c => c.randomChance(0.01))
    )
    .addLoot(
      LootEntry.of('artifacts:crystal_heart').when(c => c.randomChance(0.008))
    )
    .addLoot(
      LootEntry.of('artifacts:cloud_in_a_bottle').when(c => c.randomChance(0.01))
    )
    .addLoot(
      LootEntry.of('artifacts:obsidian_skull').when(c => c.randomChance(0.008))
    )

  // =========================================================================
  // SECTION 8: ENABLE LOGGING (remove in production)
  // =========================================================================

  // event.enableLogging()

  console.log('[IridescentCraft] LootJS structure chest overhaul loaded')
  console.log('  - Global enchanted book removal: ALL chest loot')
  console.log('  - Structure token injection: 22+ mods covered')
  console.log('  - Vanilla diamond removal: 16 OW chest tables')
  console.log('  - Village chest restrictions: iron/leather gear, no powerful items')
  console.log('  - Overworld food reduction: 90% non-meat, modded foods removed')
  console.log('  - Ocean structure loot: T1 tokens + water curios in ocean chests')
  console.log('  - Tower curio drops: 15% chance in tower structures')
})
