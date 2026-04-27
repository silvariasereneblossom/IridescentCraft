// =============================================================================
// BLUE SKIES BOSS DROPS — Phase 6F-3
// =============================================================================
// Blue Skies is a T2 dimension (Everbright/Everdawn). Its 4 dungeon bosses
// drop canonical Blue Skies items (Diopside, Charoite, etc.) via the mod's
// loot tables. This script adds T2-appropriate magic synergy.
//
// Boss-kill counter handled by gates/milestone_detection.js (icraft_t2_boss_kills).
// =============================================================================

LootJS.modifiers(event => {

  // ---- Summoner (T2 — Everdawn dungeon, magic boss) ----
  event
    .addEntityLootModifier('blue_skies:summoner')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:evocation_rune').when(c => c.randomChance(0.35)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([4, 8]).when(c => c.randomChance(0.40)))

  // ---- Alchemist (T2 — Everbright, alchemy theme) ----
  event
    .addEntityLootModifier('blue_skies:alchemist')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:evasion_elixir').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:oakskin_elixir').when(c => c.randomChance(0.20)))

  // ---- Starlit Crusher (T2 — Everbright crystal boss) ----
  event
    .addEntityLootModifier('blue_skies:starlit_crusher')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:lightning_upgrade_orb').when(c => c.randomChance(0.15)))

  // ---- Arachnarch (T2 — Everdawn spider queen) ----
  event
    .addEntityLootModifier('blue_skies:arachnarch')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.20)))

  console.log('[blue_skies_drops] registered 4 Blue Skies boss synergy modifiers')
})
