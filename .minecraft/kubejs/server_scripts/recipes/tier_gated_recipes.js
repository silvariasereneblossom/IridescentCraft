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

  // A.2: Enchanting table → T1 (gold block + deepslate)
  // Vanilla recipe needs diamond + obsidian; both T3-gated in this pack
  // (diamond removed from T1 worldgen; obsidian needs a diamond pickaxe to
  // mine). Players reaching basic enchanting access shouldn't need T3 mats.
  // Replacement: 1× gold_block (T1 — accessible from gold ore) + 4× deepslate
  // (T1 — minable with iron pickaxe). A bit messy thematically (gold isn't
  // arcane) but it puts enchanting on the right side of the diamond gate.
  event.remove({ id: 'minecraft:enchanting_table' })
  event.shaped('minecraft:enchanting_table', [' B ','DGD','DDD'], {
    B:'minecraft:book', G:'minecraft:gold_block', D:'minecraft:deepslate'
  }).id('icraft:enchanting_table_t1')

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
  event.shaped('mekanism:digital_miner', ['ATA','CFC','GLG'], {
    A:'mekanism:alloy_atomic', T:'mekanism:teleportation_core',
    C:'mekanism:ultimate_control_circuit', F:'mekanism:steel_casing',
    G:'minecraft:ghast_tear', L:'kubejs:reality_progression_token_t3'
  }).id('icraft:digital_miner_t4')

  // B.3b: Teleportation Core — netherite block replaces lapis lazuli
  event.remove({ id: 'mekanism:teleportation_core' })
  event.shaped('mekanism:teleportation_core', ['NPN','PAP','NPN'], {
    N:'minecraft:netherite_block', P:'minecraft:ender_pearl',
    A:'mekanism:alloy_atomic'
  }).id('icraft:teleportation_core_t4')

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

  // 2026-04-27 audit Phase 3.1: refreshed against current JEI registry.
  // Removed 4 stale IDs (no longer exist in mod): tidebreaker, runic_edge,
  // void_saber, searing_light. Renamed 3: brimstone -> brimstone_claymore,
  // longsword_of_the_plague -> toxic_longsword, contained_remnants ->
  // contained_remnant. Added 13 missing boss-allocated weapons (per
  // loot_overhaul.js Section 8 allocation map). Added 6 "unassigned"
  // weapons per locked-in decision 4 — creative-only until allocated to
  // a future boss. Final list: 44 entries.
  ;[
    // === T2 boss-allocated (loot_overhaul.js Section 8) ===
    'simplyswords:emberblade',         // Hydra
    'simplyswords:frostfall',          // Snow Queen
    'simplyswords:icewhisper',         // Alpha Yeti
    'simplyswords:tempest',            // Naga (was missing pre-3.1)
    'simplyswords:soulrender',         // Lich
    'simplyswords:whisperwind',        // Ur-Ghast (was missing)
    'simplyswords:enigma',             // Knight Phantom (was missing)
    'simplyswords:hiveheart',          // BS Summoner (was missing)
    'simplyswords:toxic_longsword',    // BS Alchemist (renamed from longsword_of_the_plague)
    'simplyswords:stars_edge',         // BS Starlit Crusher
    'simplyswords:waxweaver',          // BS Arachnarch (was missing)
    'simplyswords:thunderbrand',       // Aether Slider
    'simplyswords:caelestis',          // Aether Valkyrie Queen (was missing)
    'simplyswords:sunfire',            // Aether Sun Spirit (was missing)
    'simplyswords:flamewind',          // Deep Aether EotsController (was missing)
    // === T3 boss-allocated ===
    'simplyswords:brimstone_claymore', // Netherite Monstrosity (renamed from brimstone)
    'simplyswords:molten_edge',        // Ignis
    'simplyswords:shadowsting',        // The Harbinger (was missing)
    'simplyswords:livyatan',           // Leviathan
    'simplyswords:twisted_blade',      // Maledictus
    'simplyswords:emberlash',          // Ignited Revenant (was missing)
    'simplyswords:bramblethorn',       // Forgotten Guardian
    'simplyswords:soulstealer',        // Stalker
    'simplyswords:soulpyre',           // Shattered
    'simplyswords:soulkeeper',         // Wither
    // === T4 boss-allocated ===
    'simplyswords:waking_lichblade',   // Ender Dragon (was missing)
    'simplyswords:magiblade',          // Gaia Guardian (was missing)
    'simplyswords:arcanethyst',        // Ender Guardian
    'simplyswords:awakened_lichblade', // Ancient Remnant (was missing)
    'simplyswords:stormbringer',       // Warden
    'simplyswords:watching_warglaive', // Void Blossom
    // === Unassigned reserves (locked-in decision 4 — creative-only until ===
    // === assigned to a future boss; see loot_overhaul.js Section 8) ===
    'simplyswords:harbinger',          // unassigned (+3.0 dmg, T2-T3 baseline)
    'simplyswords:hearthflame',        // unassigned (+8.0 dmg, T4 endgame)
    'simplyswords:magiscythe',         // unassigned (+4.0 dmg, T3)
    'simplyswords:magispear',          // unassigned (+4.0 dmg, T3)
    'simplyswords:ribboncleaver',      // unassigned (+7.0 dmg, T3-T4)
    'simplyswords:slumbering_lichblade', // unassigned — entry to lichblade chain
    'simplyswords:wickpiercer',        // unassigned (+4.0 dmg, T3)
    'simplyswords:mjolnir',            // unassigned (in list pre-3.1; preserved)
    'simplyswords:storms_edge',        // unassigned
    'simplyswords:sword_on_a_stick',   // unassigned
    'simplyswords:watcher_claymore',   // unassigned
    // === Relic entry (boss-gated; recipe removal is belt-and-suspenders) ===
    'simplyswords:dormant_relic'
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


  // ═══ SECTION H: ENCHANT UTILITY WORKSTATIONS → T2 (Steel) ═══
  // Disenchanting Table, Table of Experience → require steel ingots
  // These mods let players freely manipulate enchantments/XP, too powerful for T1.

  // H.1: Disenchanting Table → T2 (steel)
  // Default recipe is enchanting table shape with obsidian. Replace with steel requirement.
  event.remove({ output: 'disenchanting:disenchanting_table' })
  event.shaped('disenchanting:disenchanting_table', ['SBS','IRI','SIS'], {
    S:'thermal:steel_ingot', B:'minecraft:book', I:'minecraft:iron_ingot', R:'minecraft:redstone_block'
  }).id('icraft:disenchanting_table_t2')

  // H.2: Table of Experience → T2 (steel)
  // Lets players convert items to XP and vice versa. Gate behind steel.
  event.remove({ output: 'toe:table_of_experience' })
  event.shaped('toe:table_of_experience', ['SBS','IEI','SIS'], {
    S:'thermal:steel_ingot', B:'minecraft:book', I:'minecraft:iron_ingot', E:'minecraft:experience_bottle'
  }).id('icraft:table_of_experience_t2')

  // H.3: Enchantment Transfer — adds NO blocks/items (uses vanilla anvil).
  // Gating is handled via enchantmenttransfer-common.toml config (XP cost).
  // The enchanting table itself is already T3-gated (Section A.2), and anvils are
  // naturally available. The XP cost serves as a soft gate.


  // ═══ SECTION I: ICARUS WINGS → T3+ ═══
  // All Icarus wing base recipes require an elytra (already removed in Section G).
  // Replace with T3-gated recipes using diamonds + progression token.
  // Only gate the base wing types; color variants are just dye+base wing (harmless).

  // Remove all Icarus wing recipes
  event.remove({ mod: 'icarus' })

  // I.1: Feathered Wings → T3 (diamond + phantom membranes)
  event.shaped('icarus:white_feathered_wings', ['HDH','FPF','F F'], {
    H:'minecraft:honeycomb', D:'minecraft:diamond', F:'#icarus:feathers',
    P:'minecraft:phantom_membrane'
  }).id('icraft:feathered_wings_t3')

  // I.2: Dragon Wings → T4 effective (dragon_breath requires Ender Dragon
  // kill, so the recipe is ingredient-gated to T4 regardless of the diamond
  // tier of the other reagents). Recipe id stays `dragon_wings_t3` for
  // back-compat with any AStages restriction file referencing it.
  event.shaped('icarus:black_dragon_wings', ['HDH','BPB','B B'], {
    H:'minecraft:honeycomb', D:'minecraft:diamond', B:'minecraft:dragon_breath',
    P:'minecraft:phantom_membrane'
  }).id('icraft:dragon_wings_t3')

  // I.3: Mechanical Feathered Wings → T3 (steel + diamond)
  event.shaped('icarus:white_mechanical_feathered_wings', ['SDS','IPI','F F'], {
    S:'thermal:steel_ingot', D:'minecraft:diamond', I:'minecraft:iron_ingot',
    P:'minecraft:phantom_membrane', F:'#icarus:feathers'
  }).id('icraft:mech_feathered_wings_t3')

  // I.4: Mechanical Leather Wings → T3 (steel + diamond)
  event.shaped('icarus:white_mechanical_leather_wings', ['SDS','IPI','L L'], {
    S:'thermal:steel_ingot', D:'minecraft:diamond', I:'minecraft:iron_ingot',
    P:'minecraft:phantom_membrane', L:'minecraft:leather'
  }).id('icraft:mech_leather_wings_t3')

  // I.5: Light Wings → T3 (diamond + glowstone)
  event.shaped('icarus:yellow_light_wings', ['HDH','GPG','G G'], {
    H:'minecraft:honeycomb', D:'minecraft:diamond', G:'minecraft:glowstone_dust',
    P:'minecraft:phantom_membrane'
  }).id('icraft:light_wings_t3')

  // I.6: Unique wings — remove entirely (boss drop or quest reward only)
  // flandres_wings, discords_wings, zanzas_wings already removed by mod: 'icarus' above


  // ═══ SECTION I.7: ARS APPRENTICE SPELL BOOK → T2 ═══
  // Vanilla Ars Nouveau apprentice_spell_book_upgrade required diamonds (×3),
  // blaze rods (×2), quartz blocks (×2) — all T3 materials. The apprentice
  // book itself is a T2 workstation entry per master-appendix A.2, so the
  // recipe gating contradicted its tier.
  // Re-tiered to T2-appropriate ingredients:
  //   diamond   → mana_diamond       (Botania T2 transmutation, A.2)
  //   blaze_rod → source_gem_block   (Ars-themed T2 storage block = 9 source)
  //   quartz    → source_gem         (Ars-themed T2)
  //   obsidian  → deepslate          (T1 minable; obsidian needs T3 pickaxe)
  event.remove({ id: 'ars_nouveau:apprentice_spell_book_upgrade' })
  event.custom({
    type: 'ars_nouveau:book_upgrade',
    pattern: ['   ', ' y ', '   '],
    key: { y: { item: 'ars_nouveau:spell_book' } },
    ingredients: [
      { item: 'ars_nouveau:novice_spell_book' },
      { item: 'minecraft:deepslate' },
      { item: 'botania:mana_diamond' },
      { item: 'botania:mana_diamond' },
      { item: 'botania:mana_diamond' },
      { item: 'ars_nouveau:source_gem_block' },
      { item: 'ars_nouveau:source_gem_block' },
      { item: 'ars_nouveau:source_gem' },
      { item: 'ars_nouveau:source_gem' }
    ],
    result: { item: 'ars_nouveau:apprentice_spell_book' }
  }).id('icraft:apprentice_spell_book_upgrade_t2')


  // ═══ SECTION I.8: ISS ARCANE ANVIL → T2 ═══
  // Vanilla irons_spellbooks:arcane_anvil requires 1× diamond + 4× amethyst
  // block + 2× polished_deepslate + 1× anvil. Diamond is T3-gated in this
  // pack so the spell-upgrade station was unintentionally locked behind T3.
  // Re-tier: replace forge:gems/diamond with botania:mana_diamond (Botania
  // T2 transmutation product, same approach as the apprentice spell book
  // fix). Other ingredients unchanged.
  event.remove({ id: 'irons_spellbooks:arcane_anvil' })
  event.shaped('irons_spellbooks:arcane_anvil', ['AAA',' D ','SVS'], {
    A: 'minecraft:amethyst_block',
    D: 'botania:mana_diamond',
    V: 'minecraft:anvil',
    S: 'minecraft:polished_deepslate'
  }).id('icraft:arcane_anvil_t2')

  // ═══ SECTION I.9: ISS MANA RING → T2 ═══
  // Vanilla irons_spellbooks:mana_ring requires 1× diamond + 5× arcane_ingot.
  // Same fix: forge:gems/diamond → botania:mana_diamond.
  event.remove({ id: 'irons_spellbooks:mana_ring' })
  event.shaped('irons_spellbooks:mana_ring', ['DA ','A A',' A '], {
    A: 'irons_spellbooks:arcane_ingot',
    D: 'botania:mana_diamond'
  }).id('icraft:mana_ring_t2')

  // ═══ SECTION I.10: DISENCHANTING DISENCHANTER → T1 ═══
  // Disenchanting mod's disenchanter requires 1× anvil + 2× gold_ingot +
  // 1× enchanting_table + 3× obsidian. Obsidian needs a diamond pickaxe
  // (T3) so the recipe is unintentionally T3-gated. Replace obsidian with
  // deepslate (T1 minable). All ingredients now T1: anvil, gold_ingot,
  // enchanting_table (also T1 per A.2), deepslate. Pairs with the T1
  // enchanting table — basic enchant manipulation should be available
  // alongside basic enchanting.
  event.remove({ id: 'disenchanting:disenchanter' })
  event.shaped('disenchanting:disenchanter', [' A ','GCG','DDD'], {
    A: 'minecraft:anvil',
    G: 'minecraft:gold_ingot',
    C: 'minecraft:enchanting_table',
    D: 'minecraft:deepslate'
  }).id('icraft:disenchanter_t1')


  // ═══ SECTION J: COMPASS OF RETURN (T2 craftable) ═══
  // Found as 5% loot in surface dimension chests (T1 rare find).
  // Craftable at T2: compass + ender pearls + gold (spatial magic theme).
  event.shaped('kubejs:compass_of_return', [' G ','ECE',' G '], {
    G:'minecraft:gold_ingot', E:'minecraft:ender_pearl', C:'minecraft:compass'
  }).id('icraft:compass_of_return_t2')


  console.log('[IridescentCraft] P3 tier_gated_recipes.js loaded')
})
