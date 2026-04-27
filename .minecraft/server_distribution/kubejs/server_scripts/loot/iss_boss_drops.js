// =============================================================================
// ISS BOSS DROPS — Phase 6F-1 themed-book + staff routing
// =============================================================================
// Adds percentage-based drops to ISS boss/mob loot tables. Guaranteed
// first-kill drops are handled by iss_boss_first_kill.js (separate file
// because it needs persistentData per-player tracking, not loot-table-side
// modifiers).
//
// Boss/mob -> drop assignments (per Phase 6F-1 plan):
//   dead_king        -> blood_staff (50%)             + necronomicon (first-kill)
//   archevoker       -> evoker_spell_book (first-kill)
//   fire_boss        -> blaze_spell_book (first-kill)
//   citadel_keeper   -> keeper_flamberge (40%)
//   cryomancer (mob) -> ice_staff (15%)
//   pyromancer (mob) -> pyromancer armor pieces (~10% per piece)
//
// Tetra replacement files (data/tetra/replacements/*) auto-convert any
// vanilla irons_spellbooks:<X>_spell_book into our modular variant on
// next inventory tick, so we drop the vanilla item here and get the
// modular variant for free.
//
// Memory: feedback_mage_power_curve.md — these drops feed mage power
// peaks; intentional that endgame mages stack these effects unbounded.
// =============================================================================

LootJS.modifiers(event => {
  // ---- Dead King (T4 ISS boss) — blood staff 50% sustained ----
  event
    .addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('irons_spellbooks:blood_staff').when(c => c.randomChance(0.50)))

  // ---- Citadel Keeper (T3 ISS boss) — flamberge 40% ----
  event
    .addEntityLootModifier('irons_spellbooks:citadel_keeper')
    .addLoot(LootEntry.of('irons_spellbooks:keeper_flamberge').when(c => c.randomChance(0.40)))

  // ---- Cryomancer (ISS wizard mob) — ice staff 15%, ice rune 25% ----
  event
    .addEntityLootModifier('irons_spellbooks:cryomancer')
    .addLoot(LootEntry.of('irons_spellbooks:ice_staff').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.25)))

  // ---- Pyromancer (ISS wizard mob) — pyromancer armor pieces ~10% each ----
  // Player can grind for full set but it's slow without the craft route.
  event
    .addEntityLootModifier('irons_spellbooks:pyromancer')
    .addLoot(LootEntry.of('irons_spellbooks:pyromancer_helmet').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:pyromancer_chestplate').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:pyromancer_leggings').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:pyromancer_boots').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.20)))

  // ---- Aether Cockatrice — lightning rod 25% (sky monster route) ----
  event
    .addEntityLootModifier('aether:cockatrice')
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rod').when(c => c.randomChance(0.25)))

  // ---- Twilight Snow Queen — ice staff 50% (canonical T2 ice boss) ----
  // Stacks with the cryomancer mob route; Snow Queen is a one-time fight,
  // cryomancer is grindable.
  event
    .addEntityLootModifier('twilightforest:snow_queen')
    .addLoot(LootEntry.of('irons_spellbooks:ice_staff').when(c => c.randomChance(0.50)))

  // ---- Twilight Alpha Yeti — ice staff 25% (mountain-peak alt route) ----
  event
    .addEntityLootModifier('twilightforest:alpha_yeti')
    .addLoot(LootEntry.of('irons_spellbooks:ice_staff').when(c => c.randomChance(0.25)))

  // ---- Aether Valkyrie Queen — magehunter 30% sustained (T3 anti-mage) ----
  // First-kill guarantee handled in iss_boss_first_kill.js
  event
    .addEntityLootModifier('aether:valkyrie_queen')
    .addLoot(LootEntry.of('irons_spellbooks:magehunter').when(c => c.randomChance(0.30)))

  // ---- Vanilla phantom — lightning_rod 5% (rare fallback so the rod
  // isn't gated only behind Aether mod). Originally I gated this to
  // thunderstorms only via c.thundering(), but that method doesn't
  // exist in LootJS 2.13.1 and the entire entity-modifier failed to
  // register. Stripped the weather check; 5% sustained is fine.
  event
    .addEntityLootModifier('minecraft:phantom')
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rod').when(c => c.randomChance(0.05)))

  console.log('[iss_boss_drops] registered 8 entity loot modifiers')
})
