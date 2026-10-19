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
//
// 2026-10-10 -- "progression token" ingredients are gone from this file. Six
// recipes here named token ids that were never registered; KubeJS silently
// blanks an unknown item out of a shaped pattern, so those recipes were
// craftable by anyone with the token slot empty. Operator decision: gate by
// tier stage. Each of those recipes keeps the shape it really had (slot blank)
// and is locked to its tier in gates/astages_restrictions.js (STAGE-GATED
// RECIPES) -- the crafting grid gives no result without the stage.
// =============================================================================

ServerEvents.recipes(icraft.guard('recipes/tier_gated_recipes', 'ServerEvents.recipes', event => {

  // ═══ SECTION A: DIAMOND & NETHERITE GATE ═══
  // Diamonds removed from T1 worldgen. Not craftable until T3.
  // Netherite not processable until T4.

  // A.1: Remove ALL vanilla diamond tool/armor recipes
  icraft.section('recipes/tier_gated_recipes/section-a-diamond-netherite-gate', function () {
  ;['minecraft:diamond_sword','minecraft:diamond_pickaxe','minecraft:diamond_axe',
    'minecraft:diamond_shovel','minecraft:diamond_hoe','minecraft:diamond_helmet',
    'minecraft:diamond_chestplate','minecraft:diamond_leggings','minecraft:diamond_boots'
  ].forEach(id => event.remove({ id: id }))

  // A.2: Enchanting table → Apotheosis-gem T1 recipe (2026-05-16)
  // Gold flanking the book, apotheosis gems replacing diamonds, deepslate
  // rows (NOT obsidian -- obsidian needs a diamond pickaxe, would defeat T1).
  //   Pattern:  G B G   (gold | book | gold)
  //             A D A   (any common Apotheosis gem | deepslate | any common Apotheosis gem)
  //             D D D   (deepslate)
  // The gem slot uses Apotheosis's custom `apotheosis:gem` Forge ingredient
  // type (registered by AdventureModule). It matches ANY gem item of the
  // declared rarity and -- crucially for JEI -- returns ALL gem variants ×
  // that rarity as preview stacks, so the recipe cycles through every gem
  // like a wood recipe cycles through plank types.
  // Rarity locked to common: most accessible tier, most thematically
  // appropriate for a T1 workstation. Rarer gems are gated to higher-tier
  // structures and shouldn't be required at the T1 entry point.
  // Authored via event.custom so the `type` field on the gem ingredient
  // passes through KubeJS to Forge's CraftingHelper.
  event.remove({ id: 'minecraft:enchanting_table' })
  event.custom({
    type: 'minecraft:crafting_shaped',
    pattern: ['GBG','ADA','DDD'],
    key: {
      G: { item: 'minecraft:gold_ingot' },
      B: { item: 'minecraft:book' },
      A: { type: 'apotheosis:gem', rarity: 'apotheosis:common' },
      D: { item: 'minecraft:deepslate' }
    },
    result: { item: 'minecraft:enchanting_table', count: 1 }
  }).id('icraft:enchanting_table_apoth_gem')

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

  // A.6: T4-gated netherite ingot recipe (stage-locked to tier_4 by recipe id)
  event.shaped('minecraft:netherite_ingot', ['AAA','AGA'], {
    A:'minecraft:ancient_debris', G:'minecraft:gold_ingot'
  }).id('icraft:netherite_ingot_t4')

  // A.7: Diamond block — gated by material access
  event.remove({ id: 'minecraft:diamond_block' })
  event.shaped('minecraft:diamond_block', ['DDD','DDD','DDD'], {
    D:'minecraft:diamond'
  }).id('icraft:diamond_block_t3')
  })


  // ═══ SECTION B: MOD MACHINE TIER GATES ═══

  // B.1: Thermal machine_frame → steel (T2, gates all Thermal machines)
  icraft.section('recipes/tier_gated_recipes/section-b-mod-machine-tier-gates', function () {
  event.remove({ id: 'thermal:machine_frame' })
  event.shaped('thermal:machine_frame', ['IGI','GSG','IGI'], {
    I:'thermal:steel_ingot', G:'minecraft:glass', S:'thermal:tin_gear'
  }).id('icraft:thermal_machine_frame_t2')

  // B.2: Industrial Foregoing frames by tier
  event.remove({ id: 'industrialforegoing:machine_frame_pity' })
  event.shaped('industrialforegoing:machine_frame_pity', ['ISI','SRS','ISI'], {
    I:'thermal:steel_ingot', S:'minecraft:iron_ingot', R:'minecraft:redstone'
  }).id('icraft:if_machine_frame_pity_t2')

  // [2026-10-10] The two removals below used the ITEM ids as recipe ids
  // ('industrialforegoing:machine_frame_advanced' / '..._supreme'). No recipe
  // has those ids: IF makes both frames in the Dissolution Chamber, and the
  // stock recipes are industrialforegoing:dissolution_chamber/advanced_machine_frame
  // and .../supreme_machine_frame (ids read from the 3.5.21 jar). So the stock
  // recipes were never removed and sat next to the tier-gated ones. (The pity
  // frame above is a crafting recipe whose id really is the item id.)
  event.remove({ id: 'industrialforegoing:dissolution_chamber/advanced_machine_frame' })
  event.shaped('industrialforegoing:machine_frame_advanced', ['DGD','GFG','DGD'], {
    D:'minecraft:diamond', G:'minecraft:gold_ingot',
    F:'industrialforegoing:machine_frame_simple'
  }).id('icraft:if_machine_frame_advanced_t3')

  event.remove({ id: 'industrialforegoing:dissolution_chamber/supreme_machine_frame' })
  event.shaped('industrialforegoing:machine_frame_supreme', ['NEN','EFE','NEN'], {
    N:'minecraft:netherite_ingot', E:'minecraft:emerald',
    F:'industrialforegoing:machine_frame_advanced'
  }).id('icraft:if_machine_frame_supreme_t4')

  // B.3: Mekanism T4 endgame machines (base Mek already gated by osmium = T3)
  event.remove({ id: 'mekanism:digital_miner' })
  // (stage-locked to tier_4 by recipe id)
  event.shaped('mekanism:digital_miner', ['ATA','CFC','G G'], {
    A:'mekanism:alloy_atomic', T:'mekanism:teleportation_core',
    C:'mekanism:ultimate_control_circuit', F:'mekanism:steel_casing',
    G:'minecraft:ghast_tear'
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
  // (stage-locked to tier_3 by recipe id)
  event.shaped('forbidden_arcanus:hephaestus_forge', ['DOD','OEO','D D'], {
    D:'forbidden_arcanus:deorum_ingot', O:'minecraft:obsidian',
    E:'minecraft:diamond'
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
  })


  // ═══ SECTION C: CROSS-MOD MATERIAL LEAKS ═══

  icraft.section('recipes/tier_gated_recipes/section-c-cross-mod-material-leaks', function () {
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
  })
  // Botania Orechid → handled via datapack (icraft_botania_overrides)
  // IF Laser Drill, Occultism spirits, Thermal Insolator → config-based, manual audit
  // KEEP: Create mixing steel from iron+coal (Section 28: "bend")


  // ═══ SECTION D: VANILLA RECIPE CLEANUP ═══

  // Brewing Stand → T1 accessible (no blaze rod)
  icraft.section('recipes/tier_gated_recipes/section-d-vanilla-recipe-cleanup', function () {
  event.remove({ id: 'minecraft:brewing_stand' })
  event.shaped('minecraft:brewing_stand', [' I ','ICI','SSS'], {
    I:'minecraft:iron_ingot', C:'minecraft:copper_ingot', S:'minecraft:cobblestone'
  }).id('icraft:brewing_stand_t1')

  event.remove({ id: 'minecraft:ender_chest' })    // EnderStorage handles this
  // minecraft:end_crystal keeps its VANILLA recipe (it was removed here with
  // no replacement, which made the Dragon Summoning Crystal -- 2x End Crystal,
  // the only way to start the dragon fight -- uncraftable). T4 gate: the item
  // is tier_4-staged and the recipe is stage-locked to tier_4 by recipe id.
  event.remove({ id: 'minecraft:respawn_anchor' })  // Crying obsidian = Nether T3

  // Eye of Ender → T4 "stabilized Eyes of Ender"
  event.remove({ id: 'minecraft:ender_eye' })
  // (stage-locked to tier_4 by recipe id)
  event.shaped('minecraft:ender_eye', ['BEB','E E','BEB'], {
    B:'minecraft:blaze_powder', E:'minecraft:ender_pearl'
  }).id('icraft:stabilized_eye_of_ender')

  // Lodestone → T4 (requires netherite)
  event.remove({ id: 'minecraft:lodestone' })
  event.shaped('minecraft:lodestone', ['SSS','SCS','SSS'], {
    S:'minecraft:chiseled_stone_bricks', C:'minecraft:netherite_ingot'
  }).id('icraft:lodestone_t4')
  })

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
  icraft.section('recipes/tier_gated_recipes/section-e-simply-swords-unique-removal', function () {
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
    'simplyswords:watching_warglaive', // Void Worm (since 2026-10-18; was the uninstalled Void Blossom)
    // === The former reserves (locked-in decision 4): every one has a boss ===
    // === since 2026-10-18; who drops each: unique_itemset_registry.js  ===
    'simplyswords:harbinger',          // Ender Golem (T4)
    'simplyswords:hearthflame',        // Umvuthi (T1)
    'simplyswords:magiscythe',         // Virtue (T4)
    'simplyswords:magispear',          // Virtue (T4)
    'simplyswords:ribboncleaver',      // Sculptor (T1)
    'simplyswords:slumbering_lichblade', // Mutant Enderman (T2)
    'simplyswords:wickpiercer',        // Lucifer (T4)
    'simplyswords:mjolnir',            // Minoshroom (T2)
    'simplyswords:storms_edge',        // Bellringer (T2)
    'simplyswords:sword_on_a_stick',   // Gob (T1)
    'simplyswords:watcher_claymore',   // Ferrous Wroughtnaut (T1)
    // === Relic entry (boss-gated; recipe removal is belt-and-suspenders) ===
    'simplyswords:dormant_relic'
  ].forEach(id => event.remove({ output: id }))
  })

  // === Runic crafting OFF (operator ruling 2026-10-11 22:18 EDT: "Wither ===
  // === drops 2, no runic crafting")                                      ===
  // simplyswords:runic_tablet now drops from the Wither (loot_overhaul.js) and
  // serves ONE purpose: the two relic crafts, recipe ids
  // simplyswords:righteous_relic and simplyswords:tainted_relic (dormant relic
  // + 3 tablets + 4 gold ingots + an enchanted golden apple, or + 4 phantom
  // membranes + an eye of ender). Those two are NOT touched here. Every other recipe that
  // takes a tablet is removed (Simply Swords 1.56.0, jar-scanned; no other mod
  // or pack file names the item):
  //   - 15 runic weapons, 2 smithing recipes each, removed by output:
  //     simplyswords:runic_<w> (netherite <w> + tablet) and
  //     simplyswords:runic2_<w> (runic <w> + tablet, the re-roll);
  //   - the fused gems, by output: simplyswords:runefused_gem (+
  //     runefused_gem_reroll) and simplyswords:netherfused_gem;
  //   - by id: simplyswords:runic_grimoire_recipe_shapeless (book + tablet;
  //     the grimoire is swept on login anyway, codex_delivery.js).
  // Already gone, removed by output in the list above: sunfire, harbinger,
  // waking_lichblade, awakened_lichblade. Never loaded (their own mod-loaded
  // conditions name mods that are not installed): the two Dreadtide recipes.
  icraft.section('recipes/tier_gated_recipes/drops-2-no-runic-crafting', function () {
  ;[
    'simplyswords:runic_chakram',     'simplyswords:runic_claymore',
    'simplyswords:runic_cutlass',     'simplyswords:runic_glaive',
    'simplyswords:runic_greataxe',    'simplyswords:runic_greathammer',
    'simplyswords:runic_halberd',     'simplyswords:runic_katana',
    'simplyswords:runic_longsword',   'simplyswords:runic_rapier',
    'simplyswords:runic_sai',         'simplyswords:runic_scythe',
    'simplyswords:runic_spear',       'simplyswords:runic_twinblade',
    'simplyswords:runic_warglaive',
    'simplyswords:runefused_gem',     'simplyswords:netherfused_gem'
  ].forEach(id => event.remove({ output: id }))
  event.remove({ id: 'simplyswords:runic_grimoire_recipe_shapeless' })
  })


  // ═══ SECTION K: STAFF / WAND DROP-ONLY ENFORCEMENT ═══
  // Companion to loot/staff_wand_drops.js — the 11 staves that ship with
  // crafting recipes in their source mods (out of the 15 added there +
  // 2 already-seeded in iss_boss_drops.js). Strip recipes so these items
  // are exclusively boss-drops, mirroring the Simply Swords pattern.
  // The other 4 (hither_thither_wand, staff_of_the_nines, cloud_staff,
  // perish_staff) ship without recipes already.
  icraft.section('recipes/tier_gated_recipes/section-k-staff-wand-drop-only-enforcement', function () {
  ;[
    // ISS — graybeard, pyrium (also pyrium has armor route)
    'irons_spellbooks:graybeard_staff',
    'irons_spellbooks:pyrium_staff',
    // Twilight Forest — 4 scepters
    'twilightforest:fortification_scepter',
    'twilightforest:lifedrain_scepter',
    'twilightforest:twilight_scepter',
    'twilightforest:zombie_scepter',
    // Forbidden Arcanus — 2 draco staves
    'forbidden_arcanus:draco_arcanus_staff',
    'forbidden_arcanus:draco_arcanus_scepter',
    // Aether — nature_staff
    'aether:nature_staff',
    // Terramity — lightning_staff
    'terramity:lightning_staff',
    // DeeperDarker — sonorous_staff
    'deeperdarker:sonorous_staff'
  ].forEach(id => event.remove({ output: id }))
  })


  // ═══ SECTION F: APOTHEOSIS WORKSTATION RECIPES ═══

  // Salvaging Table — T1 (ungated). LEAVE default.

  // Simple Reforging + Gem Cutting -- T1 craftable (2026-05-14 design call:
  // workstations ungated, rarity ladder + boss-drop tokens are the gate;
  // see master-appendix D.2). Iron recipe instead of steel.
  icraft.section('recipes/tier_gated_recipes/section-f-apotheosis-workstation-recipes', function () {
  event.remove({ id: 'apotheosis:simple_reforging_table' })
  event.shaped('apotheosis:simple_reforging_table', ['IGI','IAI','IGI'], {
    I:'minecraft:iron_ingot', G:'apotheosis:gem_dust', A:'minecraft:anvil'
  }).id('icraft:simple_reforging_table_t1')

  event.remove({ id: 'apotheosis:gem_cutting_table' })
  event.shaped('apotheosis:gem_cutting_table', ['IGI','ICI','IGI'], {
    I:'minecraft:iron_ingot', G:'apotheosis:gem_dust', C:'minecraft:smooth_stone'
  }).id('icraft:gem_cutting_table_t1')

  // Reforging Table → T3
  event.remove({ id: 'apotheosis:reforging_table' })
  // (stage-locked to tier_3 by recipe id; the TABLE itself stays ungated)
  event.shaped('apotheosis:reforging_table', ['D D','DAD','OOO'], {
    D:'minecraft:diamond',
    A:'minecraft:anvil', O:'minecraft:obsidian'
  }).id('icraft:reforging_table_t3')

  // Sigil of Removal (destroys gem, frees socket) + Sigil of Withdrawal
  // (returns gem intact, frees socket) -- both canonical Apoth recipes
  // require blaze_rod (T3 Nether material). Per 2026-05-14 design call
  // (sigils ungated) and 2026-05-20 in-game leak finding, override with
  // T1-only ingredients so gem-maintenance is a Day-1 utility. Apoth-
  // affixed gear with sockets drops as early as T1 from natural mobs;
  // forcing T3 access just to clean those up is a friction trap.
  //
  // Recipe shape: 4 amethyst_shard (corners) + 4 redstone (sides) + 1
  // iron_ingot (center). All T1 materials. Amethyst is geode-spawning
  // overworld; redstone + iron are standard early-game. Identical
  // recipe for both sigils -- the differentiator is the destroys-vs-
  // returns behavior which is hardcoded in Apoth, not in the recipe.
  // Withdrawal is the "expensive" option (keeps gem). The intended "cheap,
  // destroys-gem" Removal variant has NO backing item in this pack's Apotheosis
  // — `apotheosis:sigil_of_removal` is unregistered, so its recipe resolved to an
  // empty result and threw "ItemStack 'result' can't be empty!" on every recipe
  // reload. Disabled 2026-06-05 (dead code, never craftable). A cheap-destroy
  // removal path would need a real item — design gap, tracked in the docket.
  // Output count = 1 (was 4 canonical; T1 amethyst cost is much lower
  // than T3 blaze_rod, so 1-per-craft keeps per-removal effort similar).
  // event.remove({ id: 'apotheosis:sigil_of_removal' })
  // event.shaped('apotheosis:sigil_of_removal', ['ARA','RIR','ARA'], {
  //   A:'minecraft:amethyst_shard', R:'minecraft:redstone', I:'minecraft:iron_ingot'
  // }).id('icraft:sigil_of_removal_t1')

  event.remove({ id: 'apotheosis:sigil_of_withdrawal' })
  event.shaped('apotheosis:sigil_of_withdrawal', ['ARA','RIR','ARA'], {
    A:'minecraft:amethyst_shard', R:'minecraft:redstone', I:'minecraft:iron_ingot'
  }).id('icraft:sigil_of_withdrawal_t1')

  // Augmenting Table → T4
  event.remove({ id: 'apotheosis:augmenting_table' })
  // (stage-locked to tier_4 by recipe id; the TABLE itself stays ungated)
  event.shaped('apotheosis:augmenting_table', ['N N','NAN','OOO'], {
    N:'minecraft:netherite_ingot',
    A:'minecraft:anvil', O:'minecraft:crying_obsidian'
  }).id('icraft:augmenting_table_t4')
  })


  // ═══ SECTION G: EXPLOIT CLOSURES ═══

  icraft.section('recipes/tier_gated_recipes/section-g-exploit-closures', function () {
  event.remove({ type: 'create:mixing', output: 'minecraft:nether_star' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:nether_star' })
  event.remove({ output: 'minecraft:elytra' })
  })


  // ═══ SECTION G.2: PROGRESSIVE BOSSES' STRONGER WITHERS: ONLY THE ULTIMATE ═══
  // Corrupted Soul Sand is the one block that summons the mod's level 1 to 3
  // Withers (armoured, summoner, ultimate). The mod's three shapeless recipes
  // (progressivebosses:corrupted_soul_sand_1, _2 and _3: soul sand or soul soil
  // plus 1, 2 or 3 Nether Stars) are its only source; the level is in the
  // result's {BlockEntityTag:{lvl:N}} and is read from the placed block.
  // Operator rulings of 2026-10-14: all three removed ("remove for now"), then
  // placement P2: only the Ultimate Wither (level 3) returns, an optional tier-4
  // challenge in the Nether; levels 1 and 2 stay out. So _1 and _2 stay removed
  // and _3 stays as the mod has it (3 stars), stage-locked to tier_4 by recipe
  // id in gates/astages_restrictions.js. Its loot, XP and health:
  // kubejs/data/progressivebosses and the registry's levelHp.
  icraft.section('recipes/tier_gated_recipes/section-g2-stronger-withers', function () {
  event.remove({ id: 'progressivebosses:corrupted_soul_sand_1' })
  event.remove({ id: 'progressivebosses:corrupted_soul_sand_2' })
  })


  // ═══ SECTION H: ENCHANT UTILITY WORKSTATIONS → T2 (Steel) ═══
  // Disenchanting Table, Table of Experience → require steel ingots
  // These mods let players freely manipulate enchantments/XP, too powerful for T1.

  // H.1: Disenchanting → handled in Section I.10 below (not duplicated here).
  // 2026-05-10: removed stale block referencing `disenchanting:disenchanting_table`
  // — the actual mod item is `disenchanting:disenchanter` (per `TesterLogs/Item Audit/all_items.tsv`).
  // I.10 already does the de-gate to T1 with the correct ID.

  // H.2: Table of Experience → T2 (steel)
  // Lets players convert items to XP and vice versa. Gate behind steel.
  // 2026-05-10: item id is `toe:table_of_expieriance` (sic — the mod ships
  // the misspelled form, confirmed against item audit registry).
  icraft.section('recipes/tier_gated_recipes/section-h-enchant-utility-workstations-t2', function () {
  event.remove({ output: 'toe:table_of_expieriance' })
  event.shaped('toe:table_of_expieriance', ['SBS','IEI','SIS'], {
    S:'thermal:steel_ingot', B:'minecraft:book', I:'minecraft:iron_ingot', E:'minecraft:experience_bottle'
  }).id('icraft:table_of_experience_t2')
  })

  // H.3: Enchantment Transfer — adds NO blocks/items (uses vanilla anvil).
  // Gating is handled via enchantmenttransfer-common.toml config (XP cost).
  // The enchanting table itself is already T3-gated (Section A.2), and anvils are
  // naturally available. The XP cost serves as a soft gate.


  // ═══ SECTION I: ICARUS WINGS → T3+ ═══
  // All Icarus wing base recipes require an elytra (already removed in Section G).
  // Replace with T3-gated recipes using diamonds + progression token.
  // Only gate the base wing types; color variants are just dye+base wing (harmless).

  // Remove all Icarus wing recipes
  icraft.section('recipes/tier_gated_recipes/section-i-icarus-wings-t3', function () {
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
  })

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
  icraft.section('recipes/tier_gated_recipes/section-i.7-ars-apprentice-spell-book-t2', function () {
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
  })


  // ═══ SECTION I.8: ISS ARCANE ANVIL → T2 ═══
  // Vanilla irons_spellbooks:arcane_anvil requires 1× diamond + 4× amethyst
  // block + 2× polished_deepslate + 1× anvil. Diamond is T3-gated in this
  // pack so the spell-upgrade station was unintentionally locked behind T3.
  // Re-tier: replace forge:gems/diamond with botania:mana_diamond (Botania
  // T2 transmutation product, same approach as the apprentice spell book
  // fix). Other ingredients unchanged.
  icraft.section('recipes/tier_gated_recipes/section-i.8-iss-arcane-anvil-t2', function () {
  event.remove({ id: 'irons_spellbooks:arcane_anvil' })
  event.shaped('irons_spellbooks:arcane_anvil', ['AAA',' D ','SVS'], {
    A: 'minecraft:amethyst_block',
    D: 'botania:mana_diamond',
    V: 'minecraft:anvil',
    S: 'minecraft:polished_deepslate'
  }).id('icraft:arcane_anvil_t2')
  })

  // ═══ SECTION I.9: ISS MANA RING → T2 ═══
  // Vanilla irons_spellbooks:mana_ring requires 1× diamond + 5× arcane_ingot.
  // Same fix: forge:gems/diamond → botania:mana_diamond.
  icraft.section('recipes/tier_gated_recipes/section-i.9-iss-mana-ring-t2', function () {
  event.remove({ id: 'irons_spellbooks:mana_ring' })
  event.shaped('irons_spellbooks:mana_ring', ['DA ','A A',' A '], {
    A: 'irons_spellbooks:arcane_ingot',
    D: 'botania:mana_diamond'
  }).id('icraft:mana_ring_t2')
  })

  // ═══ SECTION I.10: DISENCHANTING DISENCHANTER → T1 ═══
  // Disenchanting mod's disenchanter requires 1× anvil + 2× gold_ingot +
  // 1× enchanting_table + 3× obsidian. Obsidian needs a diamond pickaxe
  // (T3) so the recipe is unintentionally T3-gated. Replace obsidian with
  // deepslate (T1 minable). All ingredients now T1: anvil, gold_ingot,
  // enchanting_table (also T1 per A.2), deepslate. Pairs with the T1
  // enchanting table — basic enchant manipulation should be available
  // alongside basic enchanting.
  // 2026-05-16: pattern matches the new enchanting table exactly.
  // Same `apotheosis:gem` ingredient type so JEI cycles through all gem
  // variants like a wood recipe cycles through plank types.
  icraft.section('recipes/tier_gated_recipes/section-i.10-disenchanting-disenchanter-t1', function () {
  event.remove({ id: 'disenchanting:disenchanter' })
  event.custom({
    type: 'minecraft:crafting_shaped',
    pattern: ['GBG','ADA','DDD'],
    key: {
      G: { item: 'minecraft:gold_ingot' },
      B: { item: 'minecraft:book' },
      A: { type: 'apotheosis:gem', rarity: 'apotheosis:common' },
      D: { item: 'minecraft:deepslate' }
    },
    result: { item: 'disenchanting:disenchanter', count: 1 }
  }).id('icraft:disenchanter_apoth_gem')
  })


  // ═══ SECTION I.11: TORCHMASTER MEGATORCH → T1 ═══
  // Vanilla torchmaster:megatorch requires 3× torch + 2× diamond + 2× log
  // + 2× gold block. Megatorch is a wide-radius mob-spawn-suppression item
  // that's most useful early game (T1-T2 base defense), but the diamonds
  // gate it to T3 — by which point the player has progressed past the
  // problem it solves. Replace 2× diamond with 2× iron block, and replace
  // 2× log with 2× redstone block (logs are essentially free filler;
  // redstone block adds a thematic signal/power component fitting the
  // mob-detection-radius theme). Net cost: 18 iron + 8 gold + 18 redstone
  // dust = clearly T1-craftable but still meaningful investment for a
  // permanent base defense item.
  icraft.section('recipes/tier_gated_recipes/section-i.11-torchmaster-megatorch-t1', function () {
  event.remove({ id: 'torchmaster:megatorch' })
  event.shaped('torchmaster:megatorch', ['TTT','IRI','GRG'], {
    T: 'minecraft:torch',
    I: 'minecraft:iron_block',
    R: 'minecraft:redstone_block',
    G: 'minecraft:gold_block'
  }).id('icraft:megatorch_t1')
  })


  // ═══ SECTION J: COMPASS OF RETURN (T2 craftable) ═══
  // Found as 5% loot in surface dimension chests (T1 rare find).
  // Craftable at T2: compass + ender pearls + gold (spatial magic theme).
  icraft.section('recipes/tier_gated_recipes/section-j-compass-of-return', function () {
  event.shaped('kubejs:compass_of_return', [' G ','ECE',' G '], {
    G:'minecraft:gold_ingot', E:'minecraft:ender_pearl', C:'minecraft:compass'
  }).id('icraft:compass_of_return_t2')


  console.log('[IridescentCraft] P3 tier_gated_recipes.js loaded')
  })
}))
