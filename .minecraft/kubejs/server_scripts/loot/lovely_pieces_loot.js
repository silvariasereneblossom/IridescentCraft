// =============================================================================
// IRIDESCENT LOVELY PIECES — tier-scoped loot wiring (docket #94, 2026-06-07)
// =============================================================================
// All LSP crafting recipes were removed in the fork (v-iridescent.2): these
// items enter the world EXCLUSIVELY through the pools below. Operator calls:
// keep all slot rows; items tier-scoped into loot; legendaries on bosses /
// endgame structures.
//
// VILLAGE SAFETY: lovely_sparkle_pieces: bypasses the Section 6 village strip
// predicate (it only filters artifacts/relics/celestial_artifacts), so this
// script uses ONLY explicit table allowlists + dimension-gated LootType.CHEST
// — never an ungated CHEST broadcast. T1 list mirrors the curated dungeon
// allowlist in codex_exploration_drops.js (no villages/settlements).
//
// PIG SAFETY: every boss id below is copied verbatim from loot_overhaul.js
// waystone wiring (runtime-validated set, 0_entity_id_validator.js).
//
// EXCLUDED ITEMS (registered but deliberately NOT in any pool):
//   polymerization / superpolymerization — dead crafting reagents (recipes gone)
//   katana — upstream dead asset (never had an item)
//   flat_ice / solid_ice / molten_dirt / molten_stone / soul_light — blocks,
//     placed-world only (cake.png is an upstream dead texture, no item); moja_cola
//     folds into T1 as a flavor find.
//
// All chances PROVISIONAL pending feel pass.
// =============================================================================

LootJS.modifiers(function (event) {

  // RHINO-SAFETY: var throughout; functions as var-assigned expressions.

  // -- weighted pick-one pools (house pattern: villageQoLPool — air entry
  //    controls the "nothing" share; single addWeightedLoot = one roll).

  var LSP_T1 = [
    Item.of('minecraft:air').withWeight(184),          // ~8% any-item share
    Item.of('lovely_sparkle_pieces:magnetic_ring').withWeight(2),
    Item.of('lovely_sparkle_pieces:eye_mask').withWeight(2),
    Item.of('lovely_sparkle_pieces:night_vision').withWeight(2),
    Item.of('lovely_sparkle_pieces:straw_sandals').withWeight(2),
    Item.of('lovely_sparkle_pieces:cat_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:rabbit_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:fox_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:goat_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:flower_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:golden_hook').withWeight(1),
    Item.of('lovely_sparkle_pieces:high_quality_fishing_line').withWeight(1),
    Item.of('lovely_sparkle_pieces:pocket_watch').withWeight(1),
    Item.of('lovely_sparkle_pieces:speedometer').withWeight(1),
    Item.of('lovely_sparkle_pieces:position_tracker').withWeight(1),
    Item.of('lovely_sparkle_pieces:binoculars').withWeight(1),
    Item.of('lovely_sparkle_pieces:fish_pickaxe').withWeight(1),
    Item.of('lovely_sparkle_pieces:fish_axe').withWeight(1),
    Item.of('lovely_sparkle_pieces:fish_shovel').withWeight(1),
    Item.of('lovely_sparkle_pieces:fish_hoe').withWeight(1),
    Item.of('lovely_sparkle_pieces:moja_cola').withWeight(2)
  ]

  var LSP_T2 = [
    Item.of('minecraft:air').withWeight(252),          // ~10% any-item share
    Item.of('lovely_sparkle_pieces:crit_ring').withWeight(2),
    Item.of('lovely_sparkle_pieces:memory_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:night_owl_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:crush_stone_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:eco_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:marksman_goggles').withWeight(2),
    Item.of('lovely_sparkle_pieces:witch_hat').withWeight(2),
    Item.of('lovely_sparkle_pieces:yellow_headscarf').withWeight(1),
    Item.of('lovely_sparkle_pieces:jellyfish_helmet').withWeight(1),
    Item.of('lovely_sparkle_pieces:poseidon_respirator').withWeight(1),
    Item.of('lovely_sparkle_pieces:moon_amulet').withWeight(1),
    Item.of('lovely_sparkle_pieces:magma_amulet').withWeight(1),
    Item.of('lovely_sparkle_pieces:leather_quiver').withWeight(2),
    Item.of('lovely_sparkle_pieces:resuscitator').withWeight(1),
    Item.of('lovely_sparkle_pieces:guard_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:warrior_greaves').withWeight(1),
    Item.of('lovely_sparkle_pieces:blade_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:crystal_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:roller_skates').withWeight(1),
    Item.of('lovely_sparkle_pieces:waterwalk_boot').withWeight(1),
    Item.of('lovely_sparkle_pieces:heavy_bigrock').withWeight(1),
    Item.of('lovely_sparkle_pieces:adventurer_belt').withWeight(1),
    Item.of('lovely_sparkle_pieces:double_night_vision').withWeight(1),
    Item.of('lovely_sparkle_pieces:pda').withWeight(1),
    Item.of('lovely_sparkle_pieces:global_positioning_system').withWeight(1),
    Item.of('lovely_sparkle_pieces:pirate_scimitar').withWeight(1),
    Item.of('lovely_sparkle_pieces:fireball_staff').withWeight(1)
  ]

  var LSP_T3 = [
    Item.of('minecraft:air').withWeight(180),          // ~10% any-item share
    Item.of('lovely_sparkle_pieces:super_magnetic_ring').withWeight(2),
    Item.of('lovely_sparkle_pieces:ender_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:inferno_ring').withWeight(1),
    Item.of('lovely_sparkle_pieces:blackstone_heart').withWeight(1),
    Item.of('lovely_sparkle_pieces:blaze_core').withWeight(1),
    Item.of('lovely_sparkle_pieces:capitalist_heat').withWeight(1),
    Item.of('lovely_sparkle_pieces:wood_grain_quiver').withWeight(1),
    Item.of('lovely_sparkle_pieces:mermaid_tail').withWeight(1),
    Item.of('lovely_sparkle_pieces:jumping_footwear').withWeight(1),
    Item.of('lovely_sparkle_pieces:wind_leap_boots').withWeight(1),
    Item.of('lovely_sparkle_pieces:quarter_night_vision').withWeight(1),
    Item.of('lovely_sparkle_pieces:flame_soul_staff').withWeight(1),
    Item.of('lovely_sparkle_pieces:fishing_treasure').withWeight(2),
    Item.of('lovely_sparkle_pieces:necropsyche_papillon').withWeight(1),
    Item.of('lovely_sparkle_pieces:domain_stone').withWeight(1),
    Item.of('lovely_sparkle_pieces:soul_torch').withWeight(1),
    // Gambler set — all 5 pieces share the T3 pool so assembling the set is
    // a deliberate hunt (the set has its own dedicated slot row, 3/5 + 5/5).
    Item.of('lovely_sparkle_pieces:gamblers_corsage').withWeight(1),
    Item.of('lovely_sparkle_pieces:gamblers_earrings').withWeight(1),
    Item.of('lovely_sparkle_pieces:gamblers_gold_coin').withWeight(1),
    Item.of('lovely_sparkle_pieces:gamblers_dice').withWeight(1),
    Item.of('lovely_sparkle_pieces:gamblers_poker').withWeight(1)
  ]

  // ---------------------------------------------------------------------------
  // T1 — curated Overworld dungeon/structure tables (mirrors codex T1 list).
  // ---------------------------------------------------------------------------
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/pillager_outpost',
      'minecraft:chests/woodland_mansion',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chests.*/,
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/,
      /keebsz:.*\/floor.*/,
      /betterdeserttemples:.*/,
      /yungsapi:.*/,
      /betterdungeons:.*/,
      /betterstrongholds:.*/,
      /bettermineshafts:.*/
    )
    .addWeightedLoot(LSP_T1)

  // ---------------------------------------------------------------------------
  // T2 — progression dimensions, every chest (mirrors codex T2 gating).
  // ---------------------------------------------------------------------------
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('twilightforest:twilight_forest', 'aether:the_aether', 'blue_skies:everbright', 'blue_skies:everdawn')
    .addWeightedLoot(LSP_T2)

  // ---------------------------------------------------------------------------
  // T3 — nether-tier dimensions + endgame Overworld structures.
  // ---------------------------------------------------------------------------
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('minecraft:the_nether', 'undergarden:undergarden', 'deeperdarker:otherside')
    .addWeightedLoot(LSP_T3)

  event
    .addLootTableModifier(
      'minecraft:chests/ancient_city',
      'minecraft:chests/ancient_city_ice_box',
      'minecraft:chests/bastion_treasure',
      'minecraft:chests/bastion_other',
      'minecraft:chests/bastion_bridge',
      'minecraft:chests/bastion_hoglin_stable'
    )
    .addWeightedLoot(LSP_T3)

  // ---------------------------------------------------------------------------
  // T4 — LEGENDARIES: boss drops only (operator call). 10% per matching boss,
  // thematically homed, two hosts each so no single boss is the sole gate.
  // Boss ids verbatim from loot_overhaul.js (validated set).
  // ---------------------------------------------------------------------------
  var LSP_LEGENDARY_BOSSES = {
    'lovely_sparkle_pieces:newbie_umbrella':      ['twilightforest:naga', 'blue_skies:summoner'],
    'lovely_sparkle_pieces:blasphemous_contract': ['twilightforest:lich', 'aether:sun_spirit'],
    'lovely_sparkle_pieces:enchant_eye':          ['twilightforest:snow_queen', 'blue_skies:alchemist'],
    'lovely_sparkle_pieces:soul_quiver':          ['twilightforest:knight_phantom', 'blue_skies:arachnarch'],
    'lovely_sparkle_pieces:mirror_and_water':     ['aether:valkyrie_queen', 'blue_skies:starlit_crusher'],
    'lovely_sparkle_pieces:dragon_heart':         ['twilightforest:hydra', 'deep_aether:eots_controller'],
    'lovely_sparkle_pieces:sky_beast_shoes':      ['twilightforest:ur_ghast', 'aether:slider', 'twilightforest:alpha_yeti']
  }

  for (var legendary in LSP_LEGENDARY_BOSSES) {
    var hosts = LSP_LEGENDARY_BOSSES[legendary]
    for (var i = 0; i < hosts.length; i++) {
      event.addEntityLootModifier(hosts[i])
        .addLoot(LootEntry.of(legendary).when(function (c) { return c.randomChance(0.10) }))
    }
  }

  console.log('[lovely-pieces-loot] tier pools wired: T1=' + (LSP_T1.length - 1)
    + ' T2=' + (LSP_T2.length - 1) + ' T3=' + (LSP_T3.length - 1)
    + ' legendaries=' + Object.keys(LSP_LEGENDARY_BOSSES).length + ' (boss-only)')
})
