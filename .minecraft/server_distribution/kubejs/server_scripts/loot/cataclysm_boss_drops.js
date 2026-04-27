// =============================================================================
// CATACLYSM BOSS DROPS — Phase 6F-3
// =============================================================================
// L_Ender's Cataclysm contributes most of our T3 nether/end bosses. They drop
// canonical mod items (ignitium, void_core, etc.) via the mod's loot tables.
// This script adds:
//   - T3-appropriate ISS/Ars magic synergy (rare/epic ink, T3 spell book chance)
//   - Themed runes by boss element (ignis = fire, harbinger = ender, etc.)
//
// Boss-kill counter handled by gates/milestone_detection.js (icraft_t3_boss_kills).
// =============================================================================

LootJS.modifiers(event => {

  // ---- Netherite Monstrosity (T3 — nether) ----
  event
    .addEntityLootModifier('cataclysm:netherite_monstrosity')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([2, 3]).when(c => c.randomChance(0.70)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:protection_rune').when(c => c.randomChance(0.30)))

  // ---- Ignis (T3 — fire boss, ISS fire synergy) ----
  event
    .addEntityLootModifier('cataclysm:ignis')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([2, 3]).when(c => c.randomChance(0.70)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_upgrade_orb').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.15)))

  // ---- The Harbinger (T3-T4 — ender boss, summons) ----
  event
    .addEntityLootModifier('cataclysm:the_harbinger')
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').limitCount([1, 2]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_upgrade_orb').when(c => c.randomChance(0.25)))

  // ---- Ender Guardian (T4 — end-tier) ----
  event
    .addEntityLootModifier('cataclysm:ender_guardian')
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').limitCount([2, 3]).when(c => c.randomChance(0.70)))
    .addLoot(LootEntry.of('irons_spellbooks:legendary_ink').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_upgrade_orb').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('irons_spellbooks:netherite_spell_book').when(c => c.randomChance(0.10)))

  // ---- Maledictus (T3 — ender knight) ----
  event
    .addEntityLootModifier('cataclysm:maledictus')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.25)))

  // ---- Ancient Remnant (T3 — undead remnant) ----
  event
    .addEntityLootModifier('cataclysm:ancient_remnant')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:blood_rune').when(c => c.randomChance(0.30)))

  // ---- The Leviathan (T3-T4 — ocean) ----
  event
    .addEntityLootModifier('cataclysm:the_leviathan')
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:diamond_spell_book').when(c => c.randomChance(0.10)))

  // ---- Coralssus (T3 — coral boss) ----
  event
    .addEntityLootModifier('cataclysm:coralssus')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').when(c => c.randomChance(0.40)))
    .addLoot(LootEntry.of('irons_spellbooks:nature_rune').when(c => c.randomChance(0.20)))

  console.log('[cataclysm_boss_drops] registered 8 Cataclysm boss synergy modifiers')
})
