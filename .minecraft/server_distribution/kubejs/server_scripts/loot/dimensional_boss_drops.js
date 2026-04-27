// =============================================================================
// DIMENSIONAL BOSS DROPS — Phase 6F-3 (Undergarden + Deeper Darker + Aether mini-bosses)
// =============================================================================
// Catch-all for dimension-specific bosses/mini-bosses not covered by the
// per-mod files. T3 dimensions (Undergarden / Deeper Darker / Aether mini-
// bosses), with magic synergy crossovers tier-appropriate to each.
//
// Boss-kill counter handled by gates/milestone_detection.js.
// =============================================================================

LootJS.modifiers(event => {

  // ---- Aether: Slider (T2 mini-boss, Bronze Dungeon) ----
  event
    .addEntityLootModifier('aether:slider')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:lightning_rune').when(c => c.randomChance(0.20)))

  // ---- Aether: Sun Spirit (T2 boss, Gold Dungeon) ----
  event
    .addEntityLootModifier('aether:sun_spirit')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:holy_rune').when(c => c.randomChance(0.20)))

  // ---- Deep Aether: EotS Controller (T4 sky-end boss) ----
  event
    .addEntityLootModifier('deep_aether:eots_controller')
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:lightning_upgrade_orb').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:cooldown_upgrade_orb').when(c => c.randomChance(0.15)))

  // ---- Deeper Darker: Warden (T4 sculk-tier — vanilla Warden buffed) ----
  event
    .addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').limitCount([1, 2]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:cooldown_rune').when(c => c.randomChance(0.30)))

  // ---- Undergarden: Forgotten Guardian (T3 dim boss) ----
  event
    .addEntityLootModifier('undergarden:forgotten_guardian')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.25)))

  // ---- Undergarden: Forgotten (T3 mini-boss) ----
  event
    .addEntityLootModifier('undergarden:forgotten')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.15)))

  // ---- Undergarden: Rotbeast (T3 brute) ----
  event
    .addEntityLootModifier('undergarden:rotbeast')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))

  // ---- Iceologer (T2 mountain mini-boss, vanilla wild update mob) ----
  event
    .addEntityLootModifier('mutantmonsters:mutant_zombie')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:blood_rune').when(c => c.randomChance(0.10)))

  // ---- Mutant Skeleton — undead T3 ----
  event
    .addEntityLootModifier('mutantmonsters:mutant_skeleton')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.10)))

  // ---- Mutant Creeper — T2-T3 explosive ----
  event
    .addEntityLootModifier('mutantmonsters:mutant_creeper')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.10)))

  // ---- Mutant Enderman — T3 ender ----
  event
    .addEntityLootModifier('mutantmonsters:mutant_enderman')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.25)))

  console.log('[dimensional_boss_drops] registered 11 dimension/mutant boss synergy modifiers')
})
