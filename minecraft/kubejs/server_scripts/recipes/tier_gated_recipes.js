// =============================================================================
// IridescentCraft — Tier-Gated Recipe Modifications (P3)
// File: kubejs/server_scripts/recipes/tier_gated_recipes.js
//
// Design Doc: Section 3 (Material Gates), Section 28 (Exploit Audit)
// Priority 3 in Section 29 Implementation Priority
//
// Removes or replaces recipes that violate the 4-tier material progression.
// AStages prevents item USE; this prevents CRAFTING and hides from JEI.
//
// Guiding Principle (Section 28):
//   Break = skip entire tier → FIX    |    Bend = small early access → LEAVE
//
// Does NOT duplicate: tier_skip.js, refined_storage_dualpath.js,
//   villager_trades.js, astages_restrictions.js
// =============================================================================

ServerEvents.recipes(event => {

  // ═══ SECTION A: DIAMOND & NETHERITE GATE ═══
  // Diamonds removed from T1 worldgen. Not craftable until T3.
  // Netherite not processable until T4.

  // A.1: Remove ALL vanilla diamond tool/armor recipes
  ;['minecraft:diamond_sword','minecraft:diamond_pickaxe','minecraft:diamond_axe',
    'minecraft:diamond_shovel','minecraft:diamond_hoe','minecraft:diamond_helmet',
    'minecraft:diamond_chestplate','minecraft:diamond_leggings','minecraft:diamond_boots'
  ].forEach(id => event.remove({ id: id }))

  // A.2: Enchanting table → T3 (ender_forged_diamond)
  event.remove({ id: 'minecraft:enchanting_table' })
  event.shaped('minecraft:enchanting_table', [' B ','DOD','OOO'], {
    B:'minecraft:book', D:'icraft:ender_forged_diamond', O:'minecraft:obsidian'
  }).id('icraft:enchanting_table_t3')

  // A.3: Jukebox → amethyst (cosmetic, no gate)
  event.remove({ id: 'minecraft:jukebox' })
  event.shaped('minecraft:jukebox', ['PPP','PAP','PPP'], {
    P:'#minecraft:planks', A:'minecraft:amethyst_shard'
  }).id('icraft:jukebox_amethyst')

  // A.4-A.5: Remove netherite ingot + all 9 smithing upgrades
  event.remove({ id: 'minecraft:netherite_ingot' })
  event.remove({ id: 'minecraft:netherite_ingot_from_netherite_block' })
  event.remove({ id: 'minecraft:netherite_upgrade_smithing_template' })
  ;['minecraft:netherite_sword_smithing','minecraft:netherite_pickaxe_smithing',
    'minecraft:netherite_axe_smithing','minecraft:netherite_shovel_smithing',
    'minecraft:netherite_hoe_smithing','minecraft:netherite_helmet_smithing',
    'minecraft:netherite_chestplate_smithing','minecraft:netherite_leggings_smithing',
    'minecraft:netherite_boots_smithing'
  ].forEach(id => event.remove({ id: id }))

  // A.6: T4-gated netherite ingot recipe
  event.shaped('minecraft:netherite_ingot', ['AAA','AGA','TTT'], {
    A:'minecraft:ancient_debris', G:'minecraft:gold_ingot',
    T:'icraft:reality_progression_token_t4'
  }).id('icraft:netherite_ingot_t4')

  // A.7: Diamond block — gated by material access
  event.remove({ id: 'minecraft:diamond_block' })
  event.shaped('minecraft:diamond_block', ['DDD','DDD','DDD'], {
    D:'minecraft:diamond'
  }).id('icraft:diamond_block_t3')


  // ═══ SECTION B: MOD MACHINE TIER GATES ═══

  // B.1: Thermal machine_frame → steel (T2, gates all Thermal machines)
  event.remove({ id: 'thermal:machine_frame' })
  event.shaped('thermal:machine_frame', ['IGI','GSG','IGI'], {
    I:'thermal:steel_ingot', G:'minecraft:glass', S:'thermal:tin_gear'
  }).id('icraft:thermal_machine_frame_t2')

  // B.2: Industrial Foregoing frames by tier
  event.remove({ id: 'industrialforegoing:machine_frame_pity' })
  event.shaped('industrialforegoing:machine_frame_pity', ['ISI','SRS','ISI'], {
    I:'thermal:steel_ingot', S:'minecraft:iron_ingot', R:'minecraft:redstone'
  }).id('icraft:if_machine_frame_pity_t2')

  event.remove({ id: 'industrialforegoing:machine_frame_advanced' })
  event.shaped('industrialforegoing:machine_frame_advanced', ['DGD','GFG','DGD'], {
    D:'minecraft:diamond', G:'minecraft:gold_ingot',
    F:'industrialforegoing:machine_frame_simple'
  }).id('icraft:if_machine_frame_advanced_t3')

  event.remove({ id: 'industrialforegoing:machine_frame_supreme' })
  event.shaped('industrialforegoing:machine_frame_supreme', ['NEN','EFE','NEN'], {
    N:'minecraft:netherite_ingot', E:'minecraft:emerald',
    F:'industrialforegoing:machine_frame_advanced'
  }).id('icraft:if_machine_frame_supreme_t4')

  // B.3: Mekanism T4 endgame machines (base Mek already gated by osmium = T3)
  event.remove({ id: 'mekanism:digital_miner' })
  event.shaped('mekanism:digital_miner', ['ATA','CFC','NLN'], {
    A:'mekanism:alloy_atomic', T:'mekanism:teleportation_core',
    C:'mekanism:basic_control_circuit', F:'mekanism:steel_casing',
    N:'minecraft:netherite_ingot', L:'mekanism:logistical_sorter'
  }).id('icraft:digital_miner_t4')

  ;['mekanism:mekasuit_helmet','mekanism:mekasuit_bodyarmor',
    'mekanism:mekasuit_pants','mekanism:mekasuit_boots'
  ].forEach(id => event.remove({ id: id }))

  event.shaped('mekanism:mekasuit_helmet', ['NHN','AUA','   '], {
    N:'minecraft:netherite_ingot', H:'mekanism:hdpe_sheet',
    A:'mekanism:alloy_atomic', U:'mekanism:ultimate_control_circuit'
  }).id('icraft:mekasuit_helmet_t4')
  event.shaped('mekanism:mekasuit_bodyarmor', ['NAN','HUH','NHN'], {
    N:'minecraft:netherite_ingot', H:'mekanism:hdpe_sheet',
    A:'mekanism:alloy_atomic', U:'mekanism:ultimate_control_circuit'
  }).id('icraft:mekasuit_body_t4')
  event.shaped('mekanism:mekasuit_pants', ['NUN','H H','ANA'], {
    N:'minecraft:netherite_ingot', H:'mekanism:hdpe_sheet',
    A:'mekanism:alloy_atomic', U:'mekanism:ultimate_control_circuit'
  }).id('icraft:mekasuit_pants_t4')
  event.shaped('mekanism:mekasuit_boots', ['N N','AUA','H H'], {
    N:'minecraft:netherite_ingot', H:'mekanism:hdpe_sheet',
    A:'mekanism:alloy_atomic', U:'mekanism:ultimate_control_circuit'
  }).id('icraft:mekasuit_boots_t4')

  event.remove({ id: 'mekanism:meka_tool' })
  event.shaped('mekanism:meka_tool', ['ANA','ACA',' U '], {
    A:'mekanism:alloy_atomic', N:'minecraft:netherite_ingot',
    C:'mekanism:configurator', U:'mekanism:ultimate_control_circuit'
  }).id('icraft:meka_tool_t4')

  // B.4-B.5: Ars Nouveau (T2), Occultism (T3) — natural material fit, no changes
  // B.7: Mahou Tsukai (T4) — AStages + natural material gate, no changes

  // B.6: Forbidden & Arcanus Hephaestus Forge → T3
  event.remove({ id: 'forbidden_arcanus:hephaestus_forge' })
  event.shaped('forbidden_arcanus:hephaestus_forge', ['DOD','OEO','DND'], {
    D:'forbidden_arcanus:deorum_ingot', O:'minecraft:obsidian',
    E:'minecraft:diamond', N:'icraft:dimensional_progression_token_t3'
  }).id('icraft:hephaestus_forge_t3')

  // B.8: RFTools Dimensions → T4
  event.remove({ id: 'rftoolsdim:dimension_builder' })
  event.shaped('rftoolsdim:dimension_builder', ['NEN','EFE','NEN'], {
    N:'minecraft:netherite_ingot', E:'minecraft:ender_pearl',
    F:'rftoolsbase:machine_frame'
  }).id('icraft:dimension_builder_t4')

  event.remove({ id: 'rftoolsdim:dimension_editor' })
  event.shaped('rftoolsdim:dimension_editor', ['NRN','RFR','NRN'], {
    N:'minecraft:netherite_ingot', R:'minecraft:redstone_block',
    F:'rftoolsbase:machine_frame'
  }).id('icraft:dimension_editor_t4')


  // ═══ SECTION C: CROSS-MOD MATERIAL LEAKS ═══

  event.remove({ type: 'create:mixing', output: 'minecraft:diamond' })
  event.remove({ type: 'create:mixing', output: 'minecraft:diamond_block' })
  event.remove({ type: 'create:crushing', output: 'minecraft:diamond' })
  event.remove({ type: 'create:crushing', output: 'minecraft:netherite_scrap' })
  event.remove({ type: 'create:crushing', output: 'minecraft:ancient_debris' })
  event.remove({ type: 'create:splashing', output: 'minecraft:diamond' })
  event.remove({ type: 'thermal:smelter', output: 'mekanism:ingot_osmium' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:diamond' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:diamond_ore' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:deepslate_diamond_ore' })
  // Botania Orechid → handled via datapack (icraft_botania_overrides)
  // IF Laser Drill, Occultism spirits, Thermal Insolator → config-based, manual audit
  // KEEP: Create mixing steel from iron+coal (Section 28: "bend")


  // ═══ SECTION D: VANILLA RECIPE CLEANUP ═══

  // Brewing Stand → T1 accessible (no blaze rod)
  event.remove({ id: 'minecraft:brewing_stand' })
  event.shaped('minecraft:brewing_stand', [' I ','ICI','SSS'], {
    I:'minecraft:iron_ingot', C:'minecraft:copper_ingot', S:'minecraft:cobblestone'
  }).id('icraft:brewing_stand_t1')

  event.remove({ id: 'minecraft:ender_chest' })    // EnderStorage handles this
  event.remove({ id: 'minecraft:end_crystal' })     // T4 item
  event.remove({ id: 'minecraft:respawn_anchor' })  // Crying obsidian = Nether T3

  // Eye of Ender → T4 "stabilized Eyes of Ender"
  event.remove({ id: 'minecraft:ender_eye' })
  event.shaped('minecraft:ender_eye', ['BEB','EPE','BEB'], {
    B:'minecraft:blaze_powder', E:'minecraft:ender_pearl',
    P:'icraft:reality_progression_token_t4'
  }).id('icraft:stabilized_eye_of_ender')

  // Lodestone → T4 (requires netherite)
  event.remove({ id: 'minecraft:lodestone' })
  event.shaped('minecraft:lodestone', ['SSS','SCS','SSS'], {
    S:'minecraft:chiseled_stone_bricks', C:'minecraft:netherite_ingot'
  }).id('icraft:lodestone_t4')

  // Beacon — naturally gated by nether star (Wither T3). LEAVE.


  // ═══ SECTION E: SIMPLY SWORDS UNIQUE REMOVAL ═══
  // Standard weapon types keep recipes. Named uniques = boss-drop only.

  ;['simplyswords:emberblade','simplyswords:frostfall','simplyswords:stormbringer',
    'simplyswords:mjolnir','simplyswords:hearthflame','simplyswords:thunderbrand',
    'simplyswords:twisted_blade','simplyswords:bramblethorn','simplyswords:storms_edge',
    'simplyswords:arcanethyst','simplyswords:icewhisper','simplyswords:watching_warglaive',
    'simplyswords:soulrender','simplyswords:soulpyre','simplyswords:soulkeeper',
    'simplyswords:soulstealer','simplyswords:molten_edge','simplyswords:livyatan',
    'simplyswords:brimstone','simplyswords:longsword_of_the_plague',
    'simplyswords:sword_on_a_stick','simplyswords:watcher_claymore',
    'simplyswords:dormant_relic','simplyswords:tidebreaker','simplyswords:runic_edge',
    'simplyswords:contained_remnants','simplyswords:void_saber',
    'simplyswords:searing_light','simplyswords:stars_edge'
  ].forEach(id => event.remove({ output: id }))


  // ═══ SECTION F: APOTHEOSIS WORKSTATION RECIPES ═══

  // Salvaging Table — T1 (ungated). LEAVE default.

  // Simple Reforging + Gem Cutting → T2 (steel)
  event.remove({ id: 'apotheosis:simple_reforging_table' })
  event.shaped('apotheosis:simple_reforging_table', ['SIS','IAI','SIS'], {
    S:'thermal:steel_ingot', I:'minecraft:iron_ingot', A:'minecraft:anvil'
  }).id('icraft:simple_reforging_table_t2')

  event.remove({ id: 'apotheosis:gem_cutting_table' })
  event.shaped('apotheosis:gem_cutting_table', ['SIS','IGI','SIS'], {
    S:'thermal:steel_ingot', I:'minecraft:iron_ingot', G:'minecraft:gold_block'
  }).id('icraft:gem_cutting_table_t2')

  // Reforging Table → T3
  event.remove({ id: 'apotheosis:reforging_table' })
  event.shaped('apotheosis:reforging_table', ['DTD','DAD','OOO'], {
    D:'minecraft:diamond', T:'icraft:dimensional_progression_token_t3',
    A:'minecraft:anvil', O:'minecraft:obsidian'
  }).id('icraft:reforging_table_t3')

  // Augmenting Table → T4
  event.remove({ id: 'apotheosis:augmenting_table' })
  event.shaped('apotheosis:augmenting_table', ['NTN','NAN','OOO'], {
    N:'minecraft:netherite_ingot', T:'icraft:reality_progression_token_t4',
    A:'minecraft:anvil', O:'minecraft:crying_obsidian'
  }).id('icraft:augmenting_table_t4')


  // ═══ SECTION G: EXPLOIT CLOSURES ═══

  event.remove({ type: 'create:mixing', output: 'minecraft:nether_star' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:nether_star' })
  event.remove({ output: 'minecraft:elytra' })

  console.log('[IridescentCraft] P3 tier_gated_recipes.js loaded')
})
