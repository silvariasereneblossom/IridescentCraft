// =============================================================================
// BOSS REFIGHT-TO-REPAIR FLOORS — icraft #58 (Piece A supply guarantee)
// =============================================================================
// Each icraft #58 boss-only Tetra material (datapack_sources/icraft_tetra_materials)
// binds its repair to the boss's signature drop, so "repair == refight the boss".
// For most bosses the signature item is ALREADY a guaranteed/bulk native drop, so
// no floor is needed (cm_monstrosity/lava_power_cell, cm_scylla/lacrima,
// ug_forgotten_guardian/forgotten_nugget, the 7 Cardinal Sins essences, etc.).
//
// THIS file covers the materials whose chosen repair item is NOT a reliable
// every-kill drop — either a low-% drop, a 1-of-N pool pick, an item the mod
// awards only as a BLOCK, or an item not in the entity's loot table at all
// (code-driven boss). We add a guaranteed x1 (or small count) floor so a single
// refight always yields at least one repair unit. This is the SAME pattern the
// shipped cataclysm_boss_drops.js uses for ignitium/cursium/witherite, and the
// SAME LootJS hook iss_boss_drops.js already uses on these ISS bosses.
//
// Guardrail (scope sec.0): the floor is the *boss refight* supply. Arena chests
// (Piece B) only TEASE 0-2 of a signature drop at low weight; the bulk stays here.
//
// Drop IDs + entity IDs jar-verified 2026-06-03. See gen_boss_materials.py for
// the full boss->material->item table.
// =============================================================================

LootJS.modifiers(event => {

  // ---- T1 ----
  // bm_gob: Gob's gilded gear is a 1-of-3 pool pick -> floor the gilded hat.
  event.addEntityLootModifier('terramity:gob')
    .addLoot(LootEntry.of('terramity:gobs_gilded_hat_helmet'))
  // bm_sculptor: Tongbi drops 1-of-5 gear -> floor the geomancy staff.
  event.addEntityLootModifier('mowziesmobs:sculptor')
    .addLoot(LootEntry.of('mowziesmobs:sculptor_staff'))
  // bm_mnaga: Mowzie's Naga fang is a 0-1 drop -> floor for refight reliability.
  event.addEntityLootModifier('mowziesmobs:naga')
    .addLoot(LootEntry.of('mowziesmobs:naga_fang'))

  // ---- T2 ----
  // tf_knightphantom: Knight Phantom's data loot table is empty (code-driven) ->
  // floor the knightmetal ring (its signature spectral-knightmetal trinket).
  event.addEntityLootModifier('twilightforest:knight_phantom')
    .addLoot(LootEntry.of('twilightforest:knightmetal_ring'))
  // ae_valkyrie: the Queen drops only a key+sword; victory_medal comes from lesser
  // valkyries -> floor it on the Queen so her material has a refight source.
  event.addEntityLootModifier('aether:valkyrie_queen')
    .addLoot(LootEntry.of('aether:victory_medal'))

  // ---- T3 ----
  // iss_deadking: blood_staff is a ~50% drop -> floor to guarantee one per kill.
  event.addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('irons_spellbooks:blood_staff'))
  // iss_citadel: keeper_flamberge is a ~40% drop -> floor it.
  event.addEntityLootModifier('irons_spellbooks:citadel_keeper')
    .addLoot(LootEntry.of('irons_spellbooks:keeper_flamberge'))
  // iss_magehunter: 'irons_spellbooks:magehunter' is an ITEM id, not an entity -
  // an unresolvable id in addEntityLootModifier silently DEFAULTS TO minecraft:pig
  // (ENTITY_TYPE is a DefaultedRegistry). Re-homed 2026-06-06 onto the weapon's
  // actual dropper (valkyrie_queen, iss_boss_drops @30%) to guarantee repair.
  event.addEntityLootModifier('aether:valkyrie_queen')
    .addLoot(LootEntry.of('irons_spellbooks:magehunter'))

  // ---- T4 ----
  // cm_ancient_metal: Ancient Remnant natively drops ancient_metal_BLOCK x1.
  // Add a few ingots directly so the repair material is usable without uncrafting
  // (identical to the witherite_ingot floor in cataclysm_boss_drops.js).
  event.addEntityLootModifier('cataclysm:ancient_remnant')
    .addLoot(LootEntry.of('cataclysm:ancient_metal_ingot').limitCount([2, 3]))
  // da_eots: squall_plate (stormforged ingredient) is not in any loot table ->
  // inject it as the Eye of the Storm refight drop (stratus_ingot is already
  // claimed by the `stratus` material, so squall_plate keeps da_eots distinct).
  event.addEntityLootModifier('deep_aether:eots_controller')
    .addLoot(LootEntry.of('deep_aether:squall_plate'))
  // tm_circe: code-driven (no confirmed Circe drop); malediction_bracelets is her
  // catalog signature (also a Gundalf drop) -> floor it on Circe. FLAGGED: if the
  // operator prefers a Circe-unique item, swap here + in gen_boss_materials.py.
  event.addEntityLootModifier('terramity:sorceress_circe')
    .addLoot(LootEntry.of('terramity:malediction_bracelets'))
  // vn_warden: the Warden natively drops only sculk_catalyst; echo_shard is the
  // material-grade sculk-echo item -> floor it on warden kills.
  event.addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('minecraft:echo_shard'))

  console.log('[boss_refight_repair_floors] registered 12 refight-to-repair drop floors (icraft #58)')
})
