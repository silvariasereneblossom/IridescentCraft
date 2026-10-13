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

LootJS.modifiers(icraft.guard('loot/lovely_pieces_loot', 'LootJS.modifiers', function (event) {

  // RHINO-SAFETY: var throughout; functions as var-assigned expressions.

  // -- weighted pick-one pools. Each tier is ONE gated roll:
  //      <modifier>.randomChance(LSP_Tn_SHARE).addWeightedLoot(LSP_Tn)
  //    LSP_Tn_SHARE = chance a matching chest yields an LSP item at all; the
  //    pool then picks exactly one item by weight (weights are relative,
  //    item-vs-item only).
  //
  //    [2026-10-10 load fix] This file never ran: the pools were built with
  //    `Item.of(id).withWeight(n)`, but a KubeJS ItemStack has no withWeight
  //    ("TypeError: Cannot find function withWeight in object 0 air" at the
  //    first pool line) so the whole callback aborted and NO LSP item had a
  //    source. Entries are now real LootJS entries — LootEntry.of(id)
  //    .withWeight(n) (LootJS 2.13.1 core/LootEntry.java).
  //
  //    The old `minecraft:air` filler entry is deliberately NOT carried over;
  //    the "nothing" share is the randomChance gate instead (same
  //    distribution, verified against the decompiled 2.13.1 sources):
  //      - an air LootEntry resolves to ItemStack.EMPTY and
  //        WeightedAddLootAction adds that EMPTY stack to the shared loot
  //        list (it only skips null) — every later-registered modifier's
  //        filter/callback would then see an empty stack;
  //      - the villageQoLPool shape `Item.of('minecraft:air').withChance(n)`
  //        silently loses its weight (KubeJS OutputItem.of(EMPTY, n) returns
  //        the shared EMPTY with chance NaN -> LootEntryWrapper weight 1).
  //    Shares below are the stated design shares (~8% / ~10% / ~10%). For
  //    reference, the retired air weights (184 / 252 / 180) against the
  //    current item weights (25 / 31 / 23) would have come out at
  //    12.0% / 11.0% / 11.3% — retune here if that was the intent.

  var LSP_T1_SHARE = 0.08   // ~8% of T1 chests yield one LSP item
  var LSP_T2_SHARE = 0.10   // ~10%
  var LSP_T3_SHARE = 0.10   // ~10%

  var LSP_T1 = [
    LootEntry.of('lovely_sparkle_pieces:magnetic_ring').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:eye_mask').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:night_vision').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:straw_sandals').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:cat_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:rabbit_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fox_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:goat_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:flower_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:golden_hook').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:high_quality_fishing_line').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:pocket_watch').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:speedometer').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:position_tracker').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:binoculars').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fish_pickaxe').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fish_axe').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fish_shovel').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fish_hoe').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:moja_cola').withWeight(2)
  ]

  var LSP_T2 = [
    LootEntry.of('lovely_sparkle_pieces:crit_ring').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:memory_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:night_owl_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:crush_stone_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:eco_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:marksman_goggles').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:witch_hat').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:yellow_headscarf').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:jellyfish_helmet').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:poseidon_respirator').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:moon_amulet').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:magma_amulet').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:leather_quiver').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:resuscitator').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:guard_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:warrior_greaves').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:blade_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:crystal_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:roller_skates').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:waterwalk_boot').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:heavy_bigrock').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:adventurer_belt').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:double_night_vision').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:pda').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:global_positioning_system').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:pirate_scimitar').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fireball_staff').withWeight(1)
  ]

  var LSP_T3 = [
    LootEntry.of('lovely_sparkle_pieces:super_magnetic_ring').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:ender_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:inferno_ring').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:blackstone_heart').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:blaze_core').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:capitalist_heat').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:wood_grain_quiver').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:mermaid_tail').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:jumping_footwear').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:wind_leap_boots').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:quarter_night_vision').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:flame_soul_staff').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:fishing_treasure').withWeight(2),
    LootEntry.of('lovely_sparkle_pieces:necropsyche_papillon').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:domain_stone').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:soul_torch').withWeight(1),
    // Gambler set — all 5 pieces share the T3 pool so assembling the set is
    // a deliberate hunt (the set has its own dedicated slot row, 3/5 + 5/5).
    LootEntry.of('lovely_sparkle_pieces:gamblers_corsage').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:gamblers_earrings').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:gamblers_gold_coin').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:gamblers_dice').withWeight(1),
    LootEntry.of('lovely_sparkle_pieces:gamblers_poker').withWeight(1)
  ]

  // ---------------------------------------------------------------------------
  // T1 — curated Overworld dungeon/structure tables (mirrors codex T1 list).
  // ---------------------------------------------------------------------------
  icraft.section('loot/lovely_pieces_loot/t1-curated-overworld-dungeon-structure', function () {
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
      'ctov:pillager_outpost/halloween/tower',   // alias table -> pillager_outpost (dev/loot_audit/alias_tables.json)
      'minecraft:chests/woodland_mansion',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chest.*/,   // [2026-10-10] was .*chests.* — Explorify's tables are explorify:chest/… (matched nothing)
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/,
      /keebsz:(?:.*\/)?floor.*/,   // biome folder optional: the keebsz:floorNandM alias tables
      /betterdeserttemples:.*/,
      /betterdungeons:.*/,
      /betterstrongholds:.*/
      // (yungsapi and bettermineshafts ship no loot table; their patterns were removed 2026-10-11)
    )
    .randomChance(LSP_T1_SHARE)
    .addWeightedLoot(LSP_T1)
  })

  // ---------------------------------------------------------------------------
  // T2 — progression dimensions, every chest (mirrors codex T2 gating).
  // ---------------------------------------------------------------------------
  icraft.section('loot/lovely_pieces_loot/t2-progression-dimensions-every-chest', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(icraft.dims.inTier(2, 'loot'))
    .randomChance(LSP_T2_SHARE)
    .addWeightedLoot(LSP_T2)
  })

  // ---------------------------------------------------------------------------
  // T3 — nether-tier dimensions + endgame Overworld structures.
  // ---------------------------------------------------------------------------
  icraft.section('loot/lovely_pieces_loot/t3-nether-tier-dimensions-endgame-overworld', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(icraft.dims.inTier(3, 'loot'))
    .randomChance(LSP_T3_SHARE)
    .addWeightedLoot(LSP_T3)

  // NOTE: the bastion_* tables are Nether chests, so they ALSO take the
  // dimension-wide T3 roll above (two independent T3 rolls per bastion
  // chest); ancient_city* is Overworld and takes only this one.
  // [2026-10-11] Two modifiers instead of one, same share and pool. The Ancient
  // City pair is confined to the real structure (operator decision): Explorify's
  // tavern room 14 rolls minecraft:chests/ancient_city on the Overworld surface
  // and was getting this T3 roll. The condition comes first (it gates what
  // follows) and is in a try: a failure must leave the old unconfined rule, not
  // throw out of this handler (that would end the whole LootJS event).
  var lspCity = event.addLootTableModifier(
    'minecraft:chests/ancient_city',
    'minecraft:chests/ancient_city_ice_box'
  )
  try { lspCity.anyStructure(['minecraft:ancient_city'], false) } catch (e) {
    console.error('[lovely-pieces-loot] Ancient City gate not applied: ' + e)
  }
  lspCity
    .randomChance(LSP_T3_SHARE)
    .addWeightedLoot(LSP_T3)

  event
    .addLootTableModifier(
      'minecraft:chests/bastion_treasure',
      'minecraft:chests/bastion_other',
      'minecraft:chests/bastion_bridge',
      'minecraft:chests/bastion_hoglin_stable'
    )
    .randomChance(LSP_T3_SHARE)
    .addWeightedLoot(LSP_T3)
  })

  // ---------------------------------------------------------------------------
  // T4 — LEGENDARIES: boss drops only (operator call). 10% per matching boss,
  // thematically homed, two hosts each so no single boss is the sole gate.
  // Boss ids verbatim from loot_overhaul.js (validated set).
  // ---------------------------------------------------------------------------
  icraft.section('loot/lovely_pieces_loot/t4-legendaries-boss-drops-only-.-10-per', function () {
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
      global.icraftEntityMod(event, hosts[i])
        .addLoot(LootEntry.of(legendary).when(function (c) { return c.randomChance(0.10) }))
    }
  }

  console.log('[lovely-pieces-loot] tier pools wired: T1=' + LSP_T1.length
    + ' T2=' + LSP_T2.length + ' T3=' + LSP_T3.length
    + ' legendaries=' + Object.keys(LSP_LEGENDARY_BOSSES).length + ' (boss-only)')
  })
}))
