// =============================================================================
// CATACLYSM BOSS DROPS — Phase 6F-3
// =============================================================================
// L_Ender's Cataclysm contributes most of our T3 nether/end bosses. They drop
// canonical mod items (ignitium, void_core, etc.) via the mod's loot tables.
// This script adds:
//   - T3-appropriate ISS/Ars magic synergy (rare/epic ink, T3 spell book chance)
//   - Themed runes by boss element (ignis = fire, harbinger = ender, etc.)
//   - REFIGHT-TO-REPAIR boss materials (icraft #35): guarantees the boss-only
//     Tetra repair items drop, so a Tetra item built from a cm_* material can
//     ONLY be repaired by refighting its boss. The material IS the repair item.
//     See datapack_sources/icraft_tetra_materials/data/tetra/materials/metal/cm_*.json:
//       Ignis          -> cataclysm:ignitium_ingot  (cm_ignitium)  [native x3 + floor below]
//       Maledictus     -> cataclysm:cursium_ingot   (cm_cursium)   [native x3-4 + floor below]
//       The Harbinger  -> cataclysm:witherite_ingot (cm_witherite) [native drops the BLOCK; we add ingots so repair is usable without uncrafting]
//       Ender Guardian -> cataclysm:gauntlet_of_guard(cm_ender_guard)[native x1 = the repair item; one kill = one repair, by design]
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
    // refight-to-repair: ignitium_ingot = repair item for cm_ignitium Tetra material.
    // Native Ignis table already drops x3; this is a guaranteed +1 floor.
    .addLoot(LootEntry.of('cataclysm:ignitium_ingot'))

  // ---- The Harbinger (T3-T4 — ender boss, summons) ----
  event
    .addEntityLootModifier('cataclysm:the_harbinger')
    .addLoot(LootEntry.of('irons_spellbooks:epic_ink').limitCount([1, 2]).when(c => c.randomChance(0.60)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.50)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_upgrade_orb').when(c => c.randomChance(0.25)))
    // refight-to-repair: witherite_ingot = repair item for cm_witherite Tetra material.
    // Native Harbinger table drops witherite_BLOCK x1 (= 9 ingots when uncrafted); we add a
    // few ingots directly so the repair material is immediately usable.
    .addLoot(LootEntry.of('cataclysm:witherite_ingot').limitCount([3, 5]))

  // ---- Ender Guardian (T4 — end-tier) ----
  // refight-to-repair: gauntlet_of_guard = repair item for cm_ender_guard Tetra material.
  // Native Ender Guardian table drops the gauntlet x1 = exactly one repair per kill (by design,
  // the harshest/purest refight loop). NOT duplicated here on purpose. FLAG for review: if this
  // is too punishing, switch the binding to a dedicated ender_guard_plating drop item instead.
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
    // refight-to-repair: cursium_ingot = repair item for cm_cursium Tetra material.
    // Native Maledictus table already drops x3-4; this is a guaranteed +1 floor.
    .addLoot(LootEntry.of('cataclysm:cursium_ingot'))

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

  console.log('[cataclysm_boss_drops] registered 8 Cataclysm boss synergy modifiers + 3 refight-to-repair material floors (ignitium/cursium/witherite); ender_guardian gauntlet is native')
})
