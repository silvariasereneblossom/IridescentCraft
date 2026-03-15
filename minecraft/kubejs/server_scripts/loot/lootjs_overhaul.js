// =============================================================================
// LOOTJS LOOT TABLE OVERHAUL
// Place in: kubejs/server_scripts/loot/lootjs_overhaul.js
// REQUIRES: LootJS addon (https://curseforge.com/minecraft/mc-mods/lootjs)
//
// Design doc Part I, Section 19: Loot Table Overhaul
// "Every dungeon/structure mod's loot tables must respect the tier system."
//
// This script replaces the older KubeJS loot_overhaul.js with LootJS's
// modifier API, which is cleaner and supports regex-based table matching.
//
// WHAT THIS DOES:
// 1. Removes tier-breaking items (diamonds, enchanted books, netherite)
//    from structure chests based on tier appropriateness
// 2. Injects tier-appropriate progression tokens into structure chests
// 3. Removes enchanted books from ALL structure loot (Apotheosis handles enchanting)
// 4. Adds boss-specific unique drops via entity loot modifiers
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
  // This single rule covers ALL structure chest loot tables.
  // =========================================================================

  event
    .addLootTypeModifier(LootType.CHEST)
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

  // --- Dungeon Crawl: stages 1-3 (Overworld dungeon tiers) ---
  event
    .addLootTableModifier(/dungeoncrawl:chests\/stage_[123]/)
    .removeLoot('minecraft:diamond')
    .removeLoot('minecraft:diamond_block')
    .addWeightedLoot([
      Item.of('kubejs:tier1_token').withChance(85),
      Item.of('kubejs:tier2_token').withChance(15)
    ])

  // --- Dungeon Crawl: stages 4-5 (deeper = T2 loot) ---
  event
    .addLootTableModifier(/dungeoncrawl:chests\/stage_[45]/)
    .removeLoot('minecraft:diamond_block')
    .addWeightedLoot([
      Item.of('kubejs:tier2_token').withChance(75),
      Item.of('kubejs:tier3_token').withChance(10)
    ])

  // --- Explorify (all chests — Overworld structures) ---
  event
    .addLootTableModifier(/explorify:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.15)))

  // --- Dungeons Plus (all chests) ---
  event
    .addLootTableModifier(/dungeons_plus:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.18)))

  // --- Structory + Structory Towers ---
  event
    .addLootTableModifier(/structory:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  event
    .addLootTableModifier(/structory_towers:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // --- Villages & Pillages ---
  event
    .addLootTableModifier(/villagesandpillages:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

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

  // --- IDAS (100+ structures, mostly dimensional) ---
  event
    .addLootTableModifier(/idas:.*chests.*/)
    .removeLoot('minecraft:netherite_ingot')
    .removeLoot('minecraft:netherite_scrap')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

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

  // --- Moog's End Structures (T4 content — allow everything, add T4 tokens) ---
  event
    .addLootTableModifier(/mes:.*chests.*/)
    .addLoot(LootEntry.of('kubejs:tier4_token').when(c => c.randomChance(0.12)))

  // =========================================================================
  // SECTION 4: BOSS ENTITY LOOT MODIFIERS
  // Add tier tokens, bonus XP, and unique weapon chances to boss kills
  // =========================================================================

  // --- Meet Your Fight bosses (T2-T3) ---
  event
    .addEntityLootModifier('meetyourfight:swampjaw')
    .addLoot(LootEntry.of('kubejs:tier2_token', 3))
    .dropExperience(100)

  event
    .addEntityLootModifier('meetyourfight:bellringer')
    .addLoot(LootEntry.of('kubejs:tier2_token', 3))
    .dropExperience(100)

  event
    .addEntityLootModifier('meetyourfight:dame_fortuna')
    .addLoot(LootEntry.of('kubejs:tier3_token', 2))
    .dropExperience(200)

  event
    .addEntityLootModifier('meetyourfight:rosalyne')
    .addLoot(LootEntry.of('kubejs:tier3_token', 2))
    .dropExperience(200)

  // --- Mutant Monsters (T2-T3) ---
  const mutantBosses = [
    'mutantmonsters:mutant_zombie',
    'mutantmonsters:mutant_skeleton',
    'mutantmonsters:mutant_creeper',
    'mutantmonsters:mutant_enderman'
  ]
  mutantBosses.forEach(boss => {
    event
      .addEntityLootModifier(boss)
      .addLoot(LootEntry.of('kubejs:tier2_token', 2))
      .dropExperience(150)
  })

  // --- Stalwart Dungeons bosses (T2-T3) ---
  event
    .addEntityLootModifier('stalwart_dungeons:shelterer')
    .addLoot(LootEntry.of('kubejs:tier2_token', 4))
    .dropExperience(200)

  event
    .addEntityLootModifier('stalwart_dungeons:nether_keeper')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))
    .dropExperience(300)

  event
    .addEntityLootModifier('stalwart_dungeons:awful_ghast')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))
    .dropExperience(250)

  // --- Keebsz Tower Guardian (T2) — uses loot TABLE, not entity type ---
  event
    .addLootTableModifier('keebsz:entities/tower_guardian')
    .addLoot(LootEntry.of('kubejs:tier2_token', 4))

  // --- Iron's Spellbooks bosses (T2-T3) ---
  event
    .addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))
    .dropExperience(400)

  event
    .addEntityLootModifier('irons_spellbooks:fire_boss')
    .addLoot(LootEntry.of('kubejs:tier3_token', 2))
    .dropExperience(250)

  event
    .addEntityLootModifier('irons_spellbooks:citadel_keeper')
    .addLoot(LootEntry.of('kubejs:tier2_token', 3))
    .dropExperience(200)

  // --- The Abyss bosses (T3) ---
  const abyssBosses = [
    'theabyss:soul_guard',
    'theabyss:ice_knight',
    'theabyss:guard'
  ]
  abyssBosses.forEach(boss => {
    event
      .addEntityLootModifier(boss)
      .addLoot(LootEntry.of('kubejs:tier3_token', 2))
      .dropExperience(200)
  })

  // --- Ultimate Bosses (T3) — uses loot TABLES, not entity types ---
  event
    .addLootTableModifier('ub:entities/sorcerer')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))

  event
    .addLootTableModifier('ub:entities/storm')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))

  // --- Majestic Menaces (T3) ---
  event
    .addEntityLootModifier('majestic_menaces:teikoku_senshi')
    .addLoot(LootEntry.of('kubejs:tier3_token', 3))
    .dropExperience(350)

  // =========================================================================
  // SECTION 4F: SIMPLY SWORDS UNIQUE WEAPON DROPS
  // Each boss has a chance to drop a thematically matched unique weapon.
  // 42 weapons assigned across all boss tiers.
  // These stack with the token/XP drops defined in Section 4 above.
  // NOTE: 6 Abyss weapon IDs (watching_warglaive, void_saber, dormant_relic,
  //   tidebreaker, runic_edge, searing_light) need registry verification.
  // =========================================================================

  // --- Twilight Forest bosses (T2-T3) ---
  event.addEntityLootModifier('twilightforest:naga')
    .addLoot(LootEntry.of('simplyswords:tempest').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('twilightforest:lich')
    .addLoot(LootEntry.of('simplyswords:soulrender').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('twilightforest:hydra')
    .addLoot(LootEntry.of('simplyswords:emberblade').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('twilightforest:ur_ghast')
    .addLoot(LootEntry.of('simplyswords:whisperwind').when(c => c.randomChance(0.20)))
  event.addEntityLootModifier('twilightforest:knight_phantom')
    .addLoot(LootEntry.of('simplyswords:enigma').when(c => c.randomChance(0.12)))
  event.addEntityLootModifier('twilightforest:snow_queen')
    .addLoot(LootEntry.of('simplyswords:frostfall').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('twilightforest:alpha_yeti')
    .addLoot(LootEntry.of('simplyswords:icewhisper').when(c => c.randomChance(0.10)))

  // --- Blue Skies bosses (T2-T3) ---
  event.addEntityLootModifier('blue_skies:summoner')
    .addLoot(LootEntry.of('simplyswords:hiveheart').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('blue_skies:alchemist')
    .addLoot(LootEntry.of('simplyswords:toxic_longsword').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('blue_skies:starlit_crusher')
    .addLoot(LootEntry.of('simplyswords:stars_edge').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('blue_skies:arachnarch')
    .addLoot(LootEntry.of('simplyswords:waxweaver').when(c => c.randomChance(0.12)))

  // --- Aether bosses (T2-T3) ---
  event.addEntityLootModifier('aether:slider')
    .addLoot(LootEntry.of('simplyswords:thunderbrand').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('aether:valkyrie_queen')
    .addLoot(LootEntry.of('simplyswords:caelestis').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('aether:sun_spirit')
    .addLoot(LootEntry.of('simplyswords:sunfire').when(c => c.randomChance(0.15)))

  // --- Deep Aether boss (T3-T4) ---
  event.addEntityLootModifier('deep_aether:eots_controller')
    .addLoot(LootEntry.of('simplyswords:flamewind').when(c => c.randomChance(0.18)))

  // --- Cataclysm bosses (T3-T4) ---
  event.addEntityLootModifier('cataclysm:netherite_monstrosity')
    .addLoot(LootEntry.of('simplyswords:brimstone_claymore').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('cataclysm:ignis')
    .addLoot(LootEntry.of('simplyswords:molten_edge').when(c => c.randomChance(0.20)))
  event.addEntityLootModifier('cataclysm:the_harbinger')
    .addLoot(LootEntry.of('simplyswords:shadowsting').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('cataclysm:the_leviathan')
    .addLoot(LootEntry.of('simplyswords:livyatan').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('cataclysm:maledictus')
    .addLoot(LootEntry.of('simplyswords:twisted_blade').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('cataclysm:ignited_revenant')
    .addLoot(LootEntry.of('simplyswords:emberlash').when(c => c.randomChance(0.08)))
  event.addEntityLootModifier('cataclysm:ender_guardian')
    .addLoot(LootEntry.of('simplyswords:arcanethyst').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('cataclysm:ancient_remnant')
    .addLoot(LootEntry.of('simplyswords:awakened_lichblade').when(c => c.randomChance(0.15)))

  // --- Undergarden boss (T3) ---
  event.addEntityLootModifier('undergarden:forgotten_guardian')
    .addLoot(LootEntry.of('simplyswords:bramblethorn').when(c => c.randomChance(0.18)))

  // --- Deeper and Darker bosses (T3) ---
  event.addEntityLootModifier('deeperdarker:stalker')
    .addLoot(LootEntry.of('simplyswords:soulstealer').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('deeperdarker:shattered')
    .addLoot(LootEntry.of('simplyswords:soulpyre').when(c => c.randomChance(0.15)))

  // --- Vanilla bosses (T3-T4) ---
  event.addEntityLootModifier('minecraft:wither')
    .addLoot(LootEntry.of('simplyswords:soulkeeper').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('minecraft:ender_dragon')
    .addLoot(LootEntry.of('simplyswords:waking_lichblade').when(c => c.randomChance(0.25)))
  event.addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('simplyswords:stormbringer').when(c => c.randomChance(0.20)))

  // --- Botania Gaia Guardian (T4) ---
  event.addEntityLootModifier('botania:doppleganger')
    .addLoot(LootEntry.of('simplyswords:magiblade').when(c => c.randomChance(0.20)))

  // --- Meet Your Fight (weapon drops — token/XP already in Section 4) ---
  event.addEntityLootModifier('meetyourfight:swampjaw')
    .addLoot(LootEntry.of('simplyswords:harbinger').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('meetyourfight:bellringer')
    .addLoot(LootEntry.of('simplyswords:hearthflame').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('meetyourfight:dame_fortuna')
    .addLoot(LootEntry.of('simplyswords:magiscythe').when(c => c.randomChance(0.18)))
  event.addEntityLootModifier('meetyourfight:rosalyne')
    .addLoot(LootEntry.of('simplyswords:magispear').when(c => c.randomChance(0.18)))

  // --- Ultimate Bosses (loot table — weapon drops) ---
  event.addLootTableModifier('ub:entities/sorcerer')
    .addLoot(LootEntry.of('simplyswords:mjolnir').when(c => c.randomChance(0.20)))
  event.addLootTableModifier('ub:entities/storm')
    .addLoot(LootEntry.of('simplyswords:storms_edge').when(c => c.randomChance(0.20)))

  // --- The Abyss bosses (T3 — weapon drops) ---
  // NOTE: These 6 weapon IDs need in-game registry verification.
  // Run: /kubejs hand  while holding each weapon, or check simplyswords
  // item registry via registry_scan. If an ID is wrong, the drop simply
  // won't fire (no crash).
  event.addEntityLootModifier('theabyss:nightblade_boss')
    .addLoot(LootEntry.of('simplyswords:watching_warglaive').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('theabyss:the_roka')
    .addLoot(LootEntry.of('simplyswords:void_saber').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('theabyss:elder')
    .addLoot(LootEntry.of('simplyswords:dormant_relic').when(c => c.randomChance(0.12)))
  event.addEntityLootModifier('theabyss:ice_knight')
    .addLoot(LootEntry.of('simplyswords:tidebreaker').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('theabyss:ancient_seeker')
    .addLoot(LootEntry.of('simplyswords:runic_edge').when(c => c.randomChance(0.12)))
  event.addEntityLootModifier('theabyss:crystal_golem')
    .addLoot(LootEntry.of('simplyswords:searing_light').when(c => c.randomChance(0.10)))

  // =========================================================================
  // SECTION 4G: MINI-BOSS & MOB MATERIAL DROPS
  // Smaller entities that drop tokens or crafting materials (no unique weapons)
  // =========================================================================

  // --- Vanilla mob material drops ---
  event.addEntityLootModifier('minecraft:blaze')
    .addLoot(LootEntry.of('kubejs:condensed_blaze_essence').when(c => c.randomChance(0.08)))
  event.addEntityLootModifier('minecraft:elder_guardian')
    .addLoot(LootEntry.of('kubejs:tier2_token', 1))
  event.addEntityLootModifier('minecraft:enderman')
    .addLoot(LootEntry.of('kubejs:void_essence').when(c => c.randomChance(0.02)))
  event.addEntityLootModifier('minecraft:wither_skeleton')
    .addLoot(LootEntry.of('kubejs:nether_soul_fragment').when(c => c.randomChance(0.10)))

  // --- Stalwart Dungeons mini-bosses (T3) ---
  event.addEntityLootModifier('stalwart_dungeons:incomplete_wither')
    .addLoot(LootEntry.of('kubejs:tier3_token', 1))
  event.addEntityLootModifier('stalwart_dungeons:giddy_blaze')
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.20)))
  event.addEntityLootModifier('stalwart_dungeons:reinforced_blaze')
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.20)))

  // --- Iron's Spellbooks mini-bosses (T2) ---
  const isspMobs = [
    'irons_spellbooks:archevoker', 'irons_spellbooks:cryomancer',
    'irons_spellbooks:necromancer', 'irons_spellbooks:pyromancer'
  ]
  isspMobs.forEach(mob => {
    event.addEntityLootModifier(mob)
      .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.25)))
  })
  event.addEntityLootModifier('irons_spellbooks:fire_boss')
    .addLoot(LootEntry.of('kubejs:tier3_token', 1))

  // --- Mutant Monsters extras ---
  event.addEntityLootModifier('mutantmonsters:mutant_snow_golem')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))
  event.addEntityLootModifier('mutantmonsters:spider_pig')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.10)))

  // --- Deeper and Darker mini-bosses ---
  event.addEntityLootModifier('deeperdarker:sculk_centipede')
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.25)))
  event.addEntityLootModifier('deeperdarker:shriek_worm')
    .addLoot(LootEntry.of('kubejs:tier3_token', 1))

  // --- Twilight Forest: Minoshroom (T2 mini-boss) ---
  event.addEntityLootModifier('twilightforest:minoshroom')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.35)))

  // =========================================================================
  // SECTION 4H: NEXT-TIER MATERIAL PEEK DROPS
  // Design Doc Section 17 Method 2 + Section 26 Boss Material Drops
  // Current-tier bosses have 5–15% chance to drop 1–3 next-tier materials.
  // "A taste, not a full unlock"
  // =========================================================================

  // --- T2 bosses → T3 material peeks (osmium, steel) ---
  const t2BossesForPeek = [
    'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
    'twilightforest:ur_ghast', 'twilightforest:knight_phantom', 'twilightforest:snow_queen',
    'blue_skies:summoner', 'blue_skies:alchemist', 'blue_skies:starlit_crusher', 'blue_skies:arachnarch',
    'aether:slider', 'aether:valkyrie_queen', 'aether:sun_spirit'
  ]
  t2BossesForPeek.forEach(boss => {
    event.addEntityLootModifier(boss)
      .addLoot(LootEntry.of('mekanism:ingot_osmium', 1)
        .when(c => c.randomChance(0.08)))
      .addLoot(LootEntry.of('thermal:steel_ingot', 2)
        .when(c => c.randomChance(0.10)))
  })

  // --- T3 bosses → T4 material peeks (ancient debris, gaia fragments) ---
  const t3BossesForPeek = [
    'cataclysm:netherite_monstrosity', 'cataclysm:ignis', 'cataclysm:the_harbinger',
    'cataclysm:the_leviathan', 'cataclysm:maledictus',
    'meetyourfight:dame_fortuna', 'meetyourfight:rosalyne',
    'undergarden:forgotten_guardian',
    'deeperdarker:stalker', 'deeperdarker:shattered',
    'minecraft:wither'
  ]
  t3BossesForPeek.forEach(boss => {
    event.addEntityLootModifier(boss)
      .addLoot(LootEntry.of('minecraft:ancient_debris')
        .when(c => c.randomChance(0.06)))
      .addLoot(LootEntry.of('botania:life_essence', 1)
        .when(c => c.randomChance(0.08)))
  })

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

  // --- Repurposed Structures (173 tables) ---
  // Overworld dungeons/mineshafts (T1)
  event
    .addLootTableModifier(/repurposed_structures:chests\/dungeons\//)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  event
    .addLootTableModifier(/repurposed_structures:chests\/mineshafts\//)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // Overworld/Nether cities + fortresses (T2-T3)
  event
    .addLootTableModifier(/repurposed_structures:chests\/(cities|fortresses|pyramids|temples)\//)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // Underground bastions (T2-T3)
  event
    .addLootTableModifier(/repurposed_structures:chests\/bastions\//)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // End/Nether ancient cities (T3-T4)
  event
    .addLootTableModifier(
      'repurposed_structures:chests/ancient_cities/end',
      'repurposed_structures:chests/ancient_cities/nether')
    .addLoot(LootEntry.of('kubejs:tier3_token').when(c => c.randomChance(0.15)))

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

  // --- Integrated Stronghold (20 tables) ---
  // T2-T3: enhanced stronghold variant
  event
    .addLootTableModifier(
      'integrated_stronghold:chests/armory',
      'integrated_stronghold:chests/bedroom',
      'integrated_stronghold:chests/brewing',
      'integrated_stronghold:chests/dining_hall',
      'integrated_stronghold:chests/farm',
      'integrated_stronghold:chests/intersection',
      'integrated_stronghold:chests/mine',
      'integrated_stronghold:chests/prison',
      'integrated_stronghold:chests/storage',
      'integrated_stronghold:chests/stronghold')
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.15)))

  // High-value stronghold rooms (T2-T3)
  event
    .addLootTableModifier(
      'integrated_stronghold:chests/crypt',
      'integrated_stronghold:chests/enchanting',
      'integrated_stronghold:chests/grand_library',
      'integrated_stronghold:chests/maze',
      'integrated_stronghold:chests/nether_portal',
      'integrated_stronghold:chests/sanctorum',
      'integrated_stronghold:chests/secret_lab',
      'integrated_stronghold:chests/torture_chamber',
      'integrated_stronghold:chests/treasure')
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.22)))

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

  // --- Structory + Structory Towers (39 + 49 tables) ---
  event
    .addLootTableModifier(/structory:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  event
    .addLootTableModifier(/structory_towers:.*chests.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.15)))

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
  // T4: End content (confirmed in modlist)
  event
    .addLootTableModifier(/betterendisland:.*/)
    .addLoot(LootEntry.of('kubejs:tier4_token').when(c => c.randomChance(0.15)))

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
  // T1: village variants
  event
    .addLootTableModifier(/ctov:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // --- Explorations+ (16 tables) ---
  // T1: overworld exploration structures
  event
    .addLootTableModifier(/explorations:.*/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // --- Overhauled Structures (12 tables) ---
  // Already has specific table coverage in Section 3 via betterdeserttemples
  // Adding general catch-all for remaining overhauled structures
  event
    .addLootTableModifier(/overhauledstructures:chests\/.*_chest_[12]/)
    .removeLoot('minecraft:diamond')
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))

  event
    .addLootTableModifier(/overhauledstructures:chests\/.*_chest_[3m]/)
    .addLoot(LootEntry.of('kubejs:tier2_token').when(c => c.randomChance(0.18)))

  // --- Loot Integrations (7 tables) ---
  // Sub-pack glue mod — adds loot to various structures
  event
    .addLootTableModifier(/lootintegrations:.*/)
    .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.10)))

  // =========================================================================
  // SECTION 5: DIAMOND/NETHERITE REMOVAL FROM VANILLA STRUCTURES
  // =========================================================================
  // Vanilla structures (desert temples, dungeons, mineshafts, etc.) should
  // not contain diamonds in a tier-gated pack. Players earn diamonds through
  // Tier 2 progression.
  // =========================================================================

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
    'minecraft:chests/village/village_toolsmith',
    'minecraft:chests/village/village_weaponsmith',
    'minecraft:chests/village/village_armorer',
    'minecraft:chests/woodland_mansion'
  ]

  vanillaOverworldChests.forEach(table => {
    event
      .addLootTableModifier(table)
      .removeLoot('minecraft:diamond')
      .removeLoot('minecraft:diamond_horse_armor')
      .addLoot(LootEntry.of('kubejs:tier1_token').when(c => c.randomChance(0.12)))
  })

  // =========================================================================
  // SECTION 6: ENABLE LOGGING (remove in production)
  // =========================================================================

  // event.enableLogging()

  console.log('[IridescentCraft] LootJS loot table overhaul loaded')
  console.log('  - Global enchanted book removal: ALL chest loot')
  console.log('  - Structure token injection: 22+ mods covered')
  console.log('  - Boss token/XP injection: 10+ mods covered')
  console.log('  - Vanilla diamond removal: 16 OW chest tables')
})
