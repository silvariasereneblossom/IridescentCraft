// =============================================================================
// TWILIGHT FOREST BOSS DROPS — Phase 6F-3
// =============================================================================
// Twilight Forest is our T2 dimension. The 7 progression bosses already drop
// canonical TF items (naga_scale, fiery_blood, tower_key, etc.) via the mod's
// loot tables. This script adds:
//   - ISS/Ars magic synergy crossovers (T2-T3 ink + tier-appropriate runes)
//   - Themed bonuses by boss element (lich = magic, hydra = fire,
//     snow_queen = ice, etc.)
//
// Boss-kill counter is handled by gates/milestone_detection.js (icraft_t2_boss_kills).
// We don't need progression tokens — internal tracking auto-grants tier_2
// once a player hits the boss-kill threshold.
//
// Already covered by other scripts (don't duplicate):
//   - twilight:snow_queen → ice_staff in iss_boss_drops.js
//   - twilight:alpha_yeti → ice_staff in iss_boss_drops.js
//   - twilight:naga / lich / hydra / ur_ghast / knight_phantom in loot_overhaul.js
//     (those add Simply Swords + Tetra material drops; we add magic synergy here)
// =============================================================================

LootJS.modifiers(event => {

  // ---- Naga (T2 — first TF boss, snake queen) ----
  event
    .addEntityLootModifier('twilightforest:naga')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([2, 4]).when(c => c.randomChance(0.40)))

  // ---- Lich (T2 — magic boss, dramatic synergy with our spell systems) ----
  event
    .addEntityLootModifier('twilightforest:lich')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:lesser_spell_slot_upgrade').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('ars_nouveau:source_gem').limitCount([4, 8]).when(c => c.randomChance(0.50)))

  // ---- Hydra (T2 — fire/elemental, regen mechanics) ----
  event
    .addEntityLootModifier('twilightforest:hydra')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_upgrade_orb').when(c => c.randomChance(0.20)))

  // ---- Ur-Ghast (T2 — final TF boss, dark tower) ----
  event
    .addEntityLootModifier('twilightforest:ur_ghast')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([2, 3]).when(c => c.randomChance(0.70)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:cooldown_rune').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.15)))

  // ---- Minoshroom (T2 — labyrinth boss) ----
  event
    .addEntityLootModifier('twilightforest:minoshroom')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.20)))

  // ---- Knight Phantom (T2 — flying knight) ----
  event
    .addEntityLootModifier('twilightforest:knight_phantom')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.20)))

  console.log('[twilight_boss_drops] registered 6 TF boss synergy modifiers')
})
