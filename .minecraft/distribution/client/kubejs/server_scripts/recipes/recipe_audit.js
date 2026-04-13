// =============================================================================
// IridescentCraft — Cross-Mod Recipe Audit
// File: kubejs/server_scripts/recipes/recipe_audit.js
//
// Supplements tier_gated_recipes.js by catching cross-mod recipe leaks that
// allow T1 players to access T3+ materials. Follows Section 28 principle:
//   Break = skip entire tier -> FIX    |    Bend = small early access -> LEAVE
//
// Does NOT duplicate: tier_gated_recipes.js Section C (Create mixing/crushing
//   diamond/netherite, Thermal smelter osmium, Mekanism combining diamond).
//
// CONFIG-BASED FIXES (cannot be done via KubeJS, noted for manual audit):
//   - Botania Orechid ore weights: handled via datapack (icraft_botania_overrides)
//     See tier_gated_recipes.js line 163
//   - IF Laser Drill ore tables: config/industrialforegoing/laser_drill/*.json
//   - Thermal Insolator has no dimensional restriction config; gated by
//     machine_frame recipe (requires steel = T2) in tier_gated_recipes.js B.1
//   - botania-common.toml: No Orechid config knobs (weight-based, datapack only)
//   - create-common.toml: Only has worldgen toggle, no recipe controls
// =============================================================================

ServerEvents.recipes(event => {

  // ═══ SECTION A: CREATE RECIPE LEAKS ═══
  // tier_gated_recipes.js already handles: mixing diamond/diamond_block,
  // crushing diamond/netherite_scrap/ancient_debris, splashing diamond.
  // This section catches additional Create exploits.

  // A.1: Create crushing ores that bypass worldgen removal
  // If gated ores somehow enter inventory, don't let crushing multiply them
  event.remove({ type: 'create:crushing', output: 'minecraft:diamond_ore' })
  event.remove({ type: 'create:crushing', output: 'minecraft:deepslate_diamond_ore' })
  event.remove({ type: 'create:crushing', output: 'minecraft:emerald' })
  event.remove({ type: 'create:crushing', output: 'minecraft:emerald_ore' })
  event.remove({ type: 'create:crushing', output: 'minecraft:deepslate_emerald_ore' })

  // A.2: Create mixing — prevent cheap production of gated materials
  event.remove({ type: 'create:mixing', output: 'minecraft:netherite_ingot' })
  event.remove({ type: 'create:mixing', output: 'minecraft:netherite_scrap' })
  event.remove({ type: 'create:mixing', output: 'minecraft:emerald' })
  event.remove({ type: 'create:mixing', output: 'minecraft:emerald_block' })
  event.remove({ type: 'create:mixing', output: 'mekanism:ingot_osmium' })
  event.remove({ type: 'create:mixing', output: 'minecraft:ender_pearl' })

  // A.3: Create mechanical crafting — same items, different recipe type
  event.remove({ type: 'create:mechanical_crafting', output: 'minecraft:diamond' })
  event.remove({ type: 'create:mechanical_crafting', output: 'minecraft:netherite_ingot' })
  event.remove({ type: 'create:mechanical_crafting', output: 'minecraft:elytra' })

  // A.4: Create sequenced assembly leaks
  event.remove({ type: 'create:sequenced_assembly', output: 'minecraft:diamond' })
  event.remove({ type: 'create:sequenced_assembly', output: 'minecraft:netherite_ingot' })


  // ═══ SECTION B: THERMAL EXPANSION LEAKS ═══
  // tier_gated_recipes.js handles: smelter osmium.
  // Machine frame already gated to T2 (steel) in tier_gated_recipes.js B.1.

  // B.1: Thermal smelter — prevent gated material production
  event.remove({ type: 'thermal:smelter', output: 'minecraft:diamond' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:netherite_ingot' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:netherite_scrap' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:emerald' })

  // B.2: Thermal centrifuge — could separate compounds into gated materials
  event.remove({ type: 'thermal:centrifuge', output: 'minecraft:diamond' })
  event.remove({ type: 'thermal:centrifuge', output: 'minecraft:emerald' })

  // B.3: Thermal press — prevent stamping gated materials
  event.remove({ type: 'thermal:press', output: 'minecraft:diamond' })
  event.remove({ type: 'thermal:press', output: 'minecraft:netherite_ingot' })

  // B.4: Thermal Insolator — dimensional crop restriction
  // The Insolator itself is gated by the machine frame (T2 steel).
  // However, if a player obtains dimensional seeds (Nether Wart, Chorus),
  // the Insolator could let them mass-produce T3/T4 crops in the overworld.
  // Remove Insolator recipes for dimensionally-gated crops:
  event.remove({ type: 'thermal:insolator', output: 'minecraft:chorus_fruit' })
  event.remove({ type: 'thermal:insolator', output: 'minecraft:chorus_flower' })


  // ═══ SECTION C: MEKANISM LEAKS ═══
  // tier_gated_recipes.js handles: combining diamond/diamond_ore/deepslate_diamond_ore.
  // Mekanism machines naturally gated by osmium (T3).

  // C.1: Mekanism enriching — prevent enriching gated ores into ingots
  // (Mek machines need osmium = T3, but if someone transmutes 1 osmium early...)
  event.remove({ type: 'mekanism:enriching', output: 'minecraft:diamond' })
  event.remove({ type: 'mekanism:enriching', output: 'minecraft:diamond' })
  event.remove({ type: 'mekanism:enriching', output: 'minecraft:emerald' })
  event.remove({ type: 'mekanism:enriching', output: 'minecraft:emerald' })

  // C.2: Mekanism combining — additional ore fabrication blocks
  event.remove({ type: 'mekanism:combining', output: 'minecraft:emerald_ore' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:deepslate_emerald_ore' })

  // C.3: Mekanism injecting/purifying — 3x/5x ore processing for gated ores
  // These don't produce the ore directly but could multiply drops.
  // The machine tier gate (osmium) handles this mostly, but belt-and-suspenders:
  event.remove({ type: 'mekanism:purifying', output: 'mekanism:clump_diamond' })
  event.remove({ type: 'mekanism:injecting', output: 'mekanism:shard_diamond' })


  // ═══ SECTION D: INDUSTRIAL FOREGOING LEAKS ═══
  // IF machines gated by machine_frame_pity (T2 steel) in tier_gated_recipes.js B.2.

  // D.1: IF Dissolution Chamber — could dissolve items into exploitable fluids
  event.remove({ type: 'industrialforegoing:dissolution_chamber', output: 'minecraft:diamond' })
  event.remove({ type: 'industrialforegoing:dissolution_chamber', output: 'minecraft:netherite_ingot' })
  event.remove({ type: 'industrialforegoing:dissolution_chamber', output: 'minecraft:emerald' })

  // D.2: IF Laser Drill — ore tables are config-based (see header notes)
  // KubeJS cannot modify laser drill ore weights; requires manual config edit:
  //   config/industrialforegoing/laser_drill/ — remove diamond_ore, emerald_ore entries
  //   or set their weight to 0 for overworld operations


  // ═══ SECTION E: ARS NOUVEAU / OCCULTISM / BOTANIA LEAKS ═══

  // E.1: Ars Nouveau Imbuement — prevent cheap material transmutation
  event.remove({ type: 'ars_nouveau:imbuement', output: 'minecraft:diamond' })
  event.remove({ type: 'ars_nouveau:imbuement', output: 'minecraft:netherite_ingot' })

  // E.2: Occultism Crushing — spirit miners could bypass worldgen removal
  event.remove({ type: 'occultism:crushing', output: 'minecraft:diamond' })
  event.remove({ type: 'occultism:crushing', output: 'minecraft:emerald' })

  // E.3: Occultism Spirit Trade — prevent summoned spirits from trading gated materials
  event.remove({ type: 'occultism:spirit_trade', output: 'minecraft:diamond' })
  event.remove({ type: 'occultism:spirit_trade', output: 'minecraft:emerald' })

  // E.4: Occultism Ritual — dimensional miners that bypass ore removal
  // Dimensional miners are the main Occultism exploit vector.
  // The miner spirits produce ores based on the dimension they're in.
  // This is config-based (occultism miner recipes in data/occultism/recipes/miners/)
  // and should be handled via datapack overrides, not KubeJS.
  // NOTE: Verify icraft_occultism_overrides datapack handles this.

  // E.5: Botania Orechid — already handled via datapack (see tier_gated_recipes.js)
  // The Orechid transforms stone into ores based on weighted tables.
  // Diamond ore and emerald ore weights should be 0 or removed in the datapack.
  // Cannot be modified via KubeJS recipe events.

  // E.6: Botania Mana Infusion — prevent cheap gated material production
  event.remove({ type: 'botania:mana_infusion', output: 'minecraft:diamond' })
  event.remove({ type: 'botania:mana_infusion', output: 'minecraft:emerald' })


  // ═══ SECTION F: MISCELLANEOUS CROSS-MOD LEAKS ═══

  // F.1: Forbidden & Arcanus — dark magic transmutation
  event.remove({ type: 'forbidden_arcanus:clibano_combustion', output: 'minecraft:diamond' })
  event.remove({ type: 'forbidden_arcanus:clibano_combustion', output: 'minecraft:netherite_ingot' })

  // F.2: Any mod smelting/blasting gated ores (belt-and-suspenders)
  // Vanilla smelting should already be gate-safe, but catch modded furnace variants
  event.remove({ type: 'minecraft:blasting', output: 'minecraft:netherite_scrap', id: /^(?!icraft:)/ })

  // F.3: Elytra from any source (already in tier_gated_recipes.js G, but ensure
  // no cross-mod recipe sneaks one in via a different recipe type)
  event.remove({ type: 'create:mechanical_crafting', output: 'minecraft:elytra' })
  event.remove({ type: 'create:sequenced_assembly', output: 'minecraft:elytra' })

  // F.4: Nether Star fabrication (supplementing tier_gated_recipes.js G)
  event.remove({ type: 'create:sequenced_assembly', output: 'minecraft:nether_star' })
  event.remove({ type: 'mekanism:combining', output: 'minecraft:nether_star' })
  event.remove({ type: 'thermal:smelter', output: 'minecraft:nether_star' })
  // Note: tier_gated_recipes.js already removes create:mixing and thermal:smelter
  // for nether_star. These catch additional recipe types.


  // ═══ SECTION G: SUMMARY OF CONFIG-BASED FIXES NEEDED ═══
  // These cannot be handled by KubeJS and require manual config/datapack edits:
  //
  // 1. Botania Orechid weights:
  //    datapack: icraft_botania_overrides (already exists per tier_gated_recipes.js)
  //    Remove/zero-weight: diamond_ore, emerald_ore, ancient_debris
  //
  // 2. IF Laser Drill ore tables:
  //    config/industrialforegoing/laser_drill/
  //    Remove or zero-weight: diamond_ore, emerald_ore for overworld
  //
  // 3. Occultism Dimensional Miners:
  //    data/occultism/recipes/miners/ (datapack override)
  //    Ensure overworld miners don't produce T3+ ores
  //
  // 4. Thermal Insolator:
  //    Machine gated by steel frame (T2) — no additional config needed
  //    Dimensional crop recipes removed above (chorus)
  //
  // 5. Create worldgen:
  //    config/create-common.toml — only has disableWorldGen toggle
  //    Create doesn't add diamond/emerald worldgen, so no action needed
  //
  // 6. botania-common.toml:
  //    No Orechid configuration knobs — weights are datapack-only
  //    relics = true (keep, they're boss-gated naturally)



  // ═══ SECTION H: DARKORB — ORB OF ORIGIN RECIPE GATE ═══
  // DarkOrb adds a craftable recipe for origins:orb_of_origin.
  // The Orb resets ALL Origins layers (Race, Class, Species) — cannot be
  // configured to only reset one layer. Gate to T2+ to prevent trivial rerolls.
  // Replace recipe to require thermal:steel_ingot (T2 material).
  event.remove({ output: 'origins:orb_of_origin' })
  event.shaped('origins:orb_of_origin', ['SAS','AHA','SAS'], {
    S: 'thermal:steel_ingot',
    A: 'minecraft:amethyst_shard',
    H: 'minecraft:heart_of_the_sea'
  }).id('icraft:orb_of_origin_t2')


  // ═══ SECTION I: TERRAMITY — REMOVE GUNS, ARMOR RECIPES (KEEP BOSSES) ═══
  // Design decision: Terramity guns and custom armor sets break the RPG
  // progression balance. Bosses, structures, mobs, and accessories stay.

  // I.1: Remove ALL gun recipes + gunsmith station + ammo crafting
  ;[
    'terramity:basic_pistol', 'terramity:basic_rifle',
    'terramity:advanced_pistol', 'terramity:advanced_automatic_rifle',
    'terramity:advanced_burst_rifle', 'terramity:suppressed_advanced_pistol',
    'terramity:anti_material_rifle', 'terramity:antimatter_rifle',
    'terramity:conductite_laser_rifle', 'terramity:elite_rifle',
    'terramity:flintlock_pistol', 'terramity:plague_pistol',
    'terramity:big_iron', 'terramity:asphodel',
    'terramity:handcannon', 'terramity:meteor_cannon',
    'terramity:moondrill_cannon', 'terramity:railgun',
    'terramity:rocket_launcher', 'terramity:pump_action_shotgun',
    'terramity:sawed_off_shotgun', 'terramity:flare_gun',
    'terramity:gunkshot_projectile',
    // Gunsmith station and ammo
    'terramity:gunsmith_station',
    'terramity:advanced_gun_parts', 'terramity:ammo_bag',
    'terramity:ammo_box', 'terramity:bottomless_ammo_box',
    'terramity:copper_round', 'terramity:gold_round',
    'terramity:antimatter_round', 'terramity:dimlite_round',
    'terramity:iridium_round', 'terramity:shadowflame_bullet',
    'terramity:suppressed_gold_round',
  ].forEach(id => event.remove({ output: id }))

  // I.2: Remove ALL Terramity armor set recipes
  ;[
    // Conductite set
    'terramity:conductite_armor_boots', 'terramity:conductite_armor_chestplate',
    'terramity:conductite_armor_leggings', 'terramity:conductite_scouter_helmet',
    // Conjuror set
    'terramity:conjuror_boots', 'terramity:conjuror_chestplate',
    'terramity:conjuror_helmet', 'terramity:conjuror_leggings',
    // Cosmilite set
    'terramity:cosmilite_armor_boots', 'terramity:cosmilite_armor_chestplate',
    'terramity:cosmilite_armor_helmet', 'terramity:cosmilite_armor_leggings',
    // Dimlite set
    'terramity:dimlite_boots', 'terramity:dimlite_chestplate',
    'terramity:dimlite_helmet', 'terramity:dimlite_leggings',
    // Evil King set
    'terramity:evil_king_armor_boots', 'terramity:evil_king_armor_chestplate',
    'terramity:evil_king_armor_helmet', 'terramity:evil_king_armor_leggings',
    // Exodium Warlock set
    'terramity:exodium_warlock_boots', 'terramity:exodium_warlock_chestplate',
    'terramity:exodium_warlock_helmet', 'terramity:exodium_warlock_leggings',
    // Hellspec set
    'terramity:hellspec_boots', 'terramity:hellspec_chestplate',
    'terramity:hellspec_helmet', 'terramity:hellspec_leggings',
    // Iridium set
    'terramity:iridium_armor_boots', 'terramity:iridium_armor_chestplate',
    'terramity:iridium_armor_helmet', 'terramity:iridium_armor_leggings',
    // Nyxium Knight set
    'terramity:nyxium_knight_boots', 'terramity:nyxium_knight_chestplate',
    'terramity:nyxium_knight_helmet', 'terramity:nyxium_knight_leggings',
    // Onyx set
    'terramity:onyx_armor_boots', 'terramity:onyx_armor_chestplate',
    'terramity:onyx_armor_helmet', 'terramity:onyx_armor_leggings',
    // Reverium Paladin set
    'terramity:reverium_paladin_boots', 'terramity:reverium_paladin_chestplate',
    'terramity:reverium_paladin_helmet', 'terramity:reverium_paladin_leggings',
    // Ruby set
    'terramity:ruby_armor_boots', 'terramity:ruby_armor_chestplate',
    'terramity:ruby_armor_helmet', 'terramity:ruby_armor_leggings',
    // Sapphire set
    'terramity:sapphire_armor_boots', 'terramity:sapphire_armor_chestplate',
    'terramity:sapphire_armor_helmet', 'terramity:sapphire_armor_leggings',
    // Topaz set
    'terramity:topaz_armor_boots', 'terramity:topaz_armor_chestplate',
    'terramity:topaz_armor_helmet', 'terramity:topaz_armor_leggings',
    // Virentium set
    'terramity:virentium_armor_boots', 'terramity:virentium_armor_chestplate',
    'terramity:virentium_armor_helmet', 'terramity:virentium_armor_leggings',
    // Void Mage set
    'terramity:void_mage_boots', 'terramity:void_mage_chestplate',
    'terramity:void_mage_helmet', 'terramity:void_mage_leggings',
    // Boss hat drops (remove crafting only — still drop from bosses)
    'terramity:gundalfs_hat_helmet',
  ].forEach(id => event.remove({ output: id }))

  // NOTE: Terramity has no custom enchantments in the enchantment registry.
  // "enchanter_merlin" is a boss mob entity, not an enchantment — kept.



  // ═══ SECTION J: MEKANISM TOOL & ARMOR REMOVAL ═══
  // Remove Atomic Disassembler and Meka-Tool (overpowered multi-tools).
  // Remove Refined Obsidian armor set (trivializes progression).
  // MekaSuit recipes are KEPT — they feed into MekaSuit Mk2 progression.

  // J.1: Multi-tools
  event.remove({ id: 'mekanism:atomic_disassembler' })
  event.remove({ id: 'mekanism:meka_tool' })

  // J.2: Refined Obsidian Armor
  event.remove({ id: 'mekanism:refined_obsidian_helmet' })
  event.remove({ id: 'mekanism:refined_obsidian_chestplate' })
  event.remove({ id: 'mekanism:refined_obsidian_leggings' })
  event.remove({ id: 'mekanism:refined_obsidian_boots' })



  // ═══ SECTION K: THE ABYSS — RING RECIPE REMOVAL ═══
  // Design decision: All 30 Abyss rings are removed from crafting.
  // Custom rings replace them as boss/structure drops.
  // Also removes the Arcane Workbench recipe (ring crafting station).

  // K.1: Bulk remove all shaped ring recipes from the mod
  event.remove({ mod: 'theabyss', type: 'minecraft:crafting_shaped', output: /theabyss:ring_/ })

  // K.2: Catch any remaining ring recipes (shapeless, special, etc.)
  event.remove({ output: /theabyss:ring_/ })

  // K.3: Individual ring removal belt-and-suspenders (in case regex misses any)
  ;[
    'theabyss:ring_of_fire', 'theabyss:ring_of_speed', 'theabyss:ring_of_flight',
    'theabyss:ring_of_teleport', 'theabyss:ring_of_time', 'theabyss:ring_of_ghost',
    'theabyss:ring_of_slide', 'theabyss:ring_of_thunder', 'theabyss:ring_of_freeze',
    'theabyss:ring_of_blackstrike', 'theabyss:ring_of_curse', 'theabyss:ring_of_eagle',
    'theabyss:ring_of_electro', 'theabyss:ring_of_enderchest', 'theabyss:ring_of_fangs',
    'theabyss:ring_of_firestorm', 'theabyss:ring_of_firestrike', 'theabyss:ring_of_firework',
    'theabyss:ring_of_home', 'theabyss:ring_of_invisibility', 'theabyss:ring_of_jugger',
    'theabyss:ring_of_nature', 'theabyss:ring_of_nightblade', 'theabyss:ring_of_ocean',
    'theabyss:ring_of_pocket', 'theabyss:ring_of_regen', 'theabyss:ring_of_seeker',
    'theabyss:ring_of_telekinetic', 'theabyss:ring_of_fart',
  ].forEach(id => event.remove({ output: id }))

  // K.4: Remove Arcane Workbench recipe (ring crafting station — no longer needed)
  event.remove({ output: 'theabyss:arcane_workbench' })

  // K.5: Remove crafting recipes for boss-drop-only armor sets
  // Knight, Unorithe, Ragnarok, Dragon, Death armor — boss drops only
  ;[
    // Knight set
    'theabyss:knight_helmet', 'theabyss:knight_chestplate',
    'theabyss:knight_leggings', 'theabyss:knight_boots',
    // Unorithe set
    'theabyss:unorithe_helmet', 'theabyss:unorithe_chestplate',
    'theabyss:unorithe_leggings', 'theabyss:unorithe_boots',
    // Ragnarok set
    'theabyss:ragnarok_helmet', 'theabyss:ragnarok_chestplate',
    'theabyss:ragnarok_leggings', 'theabyss:ragnarok_boots',
    // Dragon set
    'theabyss:dragon_helmet', 'theabyss:dragon_chestplate',
    'theabyss:dragon_leggings', 'theabyss:dragon_boots',
    // Death set
    'theabyss:death_helmet', 'theabyss:death_chestplate',
    'theabyss:death_leggings', 'theabyss:death_boots',
  ].forEach(id => event.remove({ output: id }))




  // ═══ SECTION L: BLUE SKIES — DUSK ARC, SHADOW ARMOR, RUNIC ARC REMOVAL ═══
  // Design decision: Dusk Arc removed entirely (too strong for T2).
  // Shadow Armor removed (outclasses progression-appropriate gear).
  // Runic Arc crafting removed — now only obtainable as a rare boss drop
  // or very rare Blue Skies structure chest loot (see loot_overhaul.js).

  // L.1: Remove Dusk Arc recipe (all variants)
  event.remove({ output: /blue_skies:dusk_arc/ })

  // L.2: Remove Shadow Armor recipes (all 4 pieces)
  ;[
    'blue_skies:shadow_helmet', 'blue_skies:shadow_chestplate',
    'blue_skies:shadow_leggings', 'blue_skies:shadow_boots',
  ].forEach(id => event.remove({ output: id }))

  // L.3: Remove Runic Arc crafting recipe (gated to boss drops + rare loot)
  event.remove({ output: 'blue_skies:runic_arc' })


  // ═══ SECTION M: BLUE SKIES — MATERIAL STAT NERFS (HARDCODED LIMITATION) ═══
  // Diopside, Charoite, and Horizonite tools/armor are hardcoded in the
  // Blue Skies mod JAR. There is no config or datapack to change their
  // attack damage, durability, or armor values.
  //
  // Target stats (T2 level, NOT diamond):
  //   Diopside:   durability ~350, damage ~6,   armor ~iron+1 (precision gem)
  //   Charoite:   durability ~400, damage ~6.5, armor ~iron+1 (balanced + magic)
  //   Horizonite: durability ~450, damage ~7,   armor ~iron+2 (high durability)
  //
  // WORKAROUND: Remove all vanilla Blue Skies tool/armor crafting recipes
  // for these materials. Players use Tetra integration instead (see
  // icraft_tetra_materials datapack for balanced T2 Tetra definitions).
  // The raw materials (diopside gem, charoite gem, horizonite ingot) remain
  // obtainable and usable as Tetra components at proper T2 stats.
  //
  // NOTE FOR PLAYTESTING: If players still obtain the vanilla Blue Skies
  // tools/armor via other means (loot tables, mob drops), additional
  // loot table removals may be needed. The Tetra materials ARE balanced.

  // M.1: Remove Diopside tool + armor recipes
  ;[
    'blue_skies:diopside_sword', 'blue_skies:diopside_pickaxe',
    'blue_skies:diopside_axe', 'blue_skies:diopside_shovel',
    'blue_skies:diopside_hoe',
    'blue_skies:diopside_helmet', 'blue_skies:diopside_chestplate',
    'blue_skies:diopside_leggings', 'blue_skies:diopside_boots',
  ].forEach(id => event.remove({ output: id }))

  // M.2: Remove Charoite tool + armor recipes
  ;[
    'blue_skies:charoite_sword', 'blue_skies:charoite_pickaxe',
    'blue_skies:charoite_axe', 'blue_skies:charoite_shovel',
    'blue_skies:charoite_hoe',
    'blue_skies:charoite_helmet', 'blue_skies:charoite_chestplate',
    'blue_skies:charoite_leggings', 'blue_skies:charoite_boots',
  ].forEach(id => event.remove({ output: id }))

  // M.3: Remove Horizonite tool + armor recipes
  ;[
    'blue_skies:horizonite_sword', 'blue_skies:horizonite_pickaxe',
    'blue_skies:horizonite_axe', 'blue_skies:horizonite_shovel',
    'blue_skies:horizonite_hoe',
    'blue_skies:horizonite_helmet', 'blue_skies:horizonite_chestplate',
    'blue_skies:horizonite_leggings', 'blue_skies:horizonite_boots',
  ].forEach(id => event.remove({ output: id }))


  console.log('[IridescentCraft] recipe_audit.js loaded — cross-mod recipe audit active')
})
