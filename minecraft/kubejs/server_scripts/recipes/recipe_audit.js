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


  console.log('[IridescentCraft] recipe_audit.js loaded — cross-mod recipe audit active')
})
