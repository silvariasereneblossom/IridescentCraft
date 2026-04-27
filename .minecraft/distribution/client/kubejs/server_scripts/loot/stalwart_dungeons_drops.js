// =============================================================================
// STALWART DUNGEONS DROPS — Phase 6F-3 follow-up
// =============================================================================
// Stalwart Dungeons adds 7 custom nether mini-boss entities. Their vanilla
// loot tables drop themed items (awful_gun, awful_crystal, blaze cores etc.).
// We add T3 nether magic synergy (fire/blood runes, rare ink, T3 spell
// book chance on the toughest mini-bosses).
//
// Mobs are nether-tier T3. Magic-class power curve is uncapped late-game,
// so high-tier ink stacks here are intentional.
// =============================================================================

LootJS.modifiers(event => {

  // ---- Awful Ghast (T3 nether mini-boss, gun/crystal drops vanilla) ----
  event
    .addEntityLootModifier('stalwart_dungeons:awful_ghast')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_upgrade_orb').when(c => c.randomChance(0.10)))

  // ---- Nether Keeper (T3 nether boss) ----
  event
    .addEntityLootModifier('stalwart_dungeons:nether_keeper')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.20)))

  // ---- Incomplete Wither (T3 nether boss, wither variant) ----
  event
    .addEntityLootModifier('stalwart_dungeons:incomplete_wither')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([2, 3]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:blood_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:cooldown_rune').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.10)))

  // ---- Giddy Blaze (T3 blaze variant) ----
  event
    .addEntityLootModifier('stalwart_dungeons:giddy_blaze')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.15)))

  // ---- Reinforced Blaze (T3 buffed blaze) ----
  event
    .addEntityLootModifier('stalwart_dungeons:reinforced_blaze')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.15)))

  // ---- Shelterer (T3 mini-boss, armored variant has higher drops) ----
  event
    .addEntityLootModifier('stalwart_dungeons:shelterer')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.20)))

  event
    .addEntityLootModifier('stalwart_dungeons:shelterer_without_armor')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.20)))

  console.log('[stalwart_dungeons_drops] registered 7 Stalwart nether mini-boss synergy modifiers')
})
