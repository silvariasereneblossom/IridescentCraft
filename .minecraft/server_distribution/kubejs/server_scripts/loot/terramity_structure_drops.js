// =============================================================================
// TERRAMITY STRUCTURE DROPS — ingot-family weapons + 8 EPIC curios
// =============================================================================
// Companion to:
//   - recipes/recipe_audit.js Section I.3 (8 EPIC curios + 7 non-gun weapons)
//   - recipes/recipe_audit.js Section I.4 (3 ingot-family full strip)
//   - loot/terramity_boss_drops.js (7 non-gun EPIC weapons -> bosses)
//
// All recipes for the items below have been removed in Section I.3 + I.4.
// This file is the ONLY way to obtain them in survival, by design.
//
// Per the 2026-05-19 user decision (audit revisit): Terramity ingot families
// (nyxium / exodium / reverium) parallel-progress vanilla/Tetra materials in
// ways that don't fit the pack's tier curve. The ingots are stripped from
// sourcing entirely; the WEAPONS and CURIOS that previously needed them
// reappear as T3/T4 structure-chest drops, themed by family:
//   Exodium (warlock theme)  -> T3 chthonic dungeon / chthonian breach
//   Reverium (paladin theme) -> T3 catacombs / subterranean shrine
//   Nyxium (knight + cosmic-purple) -> T4 infested lab / ancient outcrop
//
// 8 EPIC curios (audit Phase 4.1 closure) — recipes were stripped 2026-04-27
// but no drop allocation existed; they were creative-only. Now placed in
// thematically-matched Terramity structures at T3 (3 curios) or T4 (5 curios).
//
// Drop rates kept modest (5-15%) so structure runs feel rewarding without
// flooding the inventory. Stacks well with chest re-roll mechanics from
// Apoth + Marquee tier injection.
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // T3 EXODIUM (warlock) — chthonic_dungeon + chthonian_breach
  // =========================================================================
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:exodium_sword').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:exodium_waraxe').when(c => c.randomChance(0.06)))
    .addLoot(LootEntry.of('terramity:exodium_twin_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:exodium_shield_amulet').when(c => c.randomChance(0.06)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:exodium_sword').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:exodium_waraxe').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:exodium_twin_bracelets').when(c => c.randomChance(0.10)))

  // =========================================================================
  // T3 REVERIUM (paladin / anti-undead) — catacombs + subterranean_shrine
  // =========================================================================
  event
    .addLootTableModifier('terramity:chests/catacombs_loot')
    .addLoot(LootEntry.of('terramity:reverium_sword').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:reverium_axe').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/subterranean_shrine_loot')
    .addLoot(LootEntry.of('terramity:reverium_sword').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:reverium_axe').when(c => c.randomChance(0.10)))

  // =========================================================================
  // T4 NYXIUM (knight + cosmic-purple) — infested_lab + ancient_outcrop
  // =========================================================================
  event
    .addLootTableModifier('terramity:chests/infested_lab_loot')
    .addLoot(LootEntry.of('terramity:nyxium_greatsword').when(c => c.randomChance(0.15)))

  event
    .addLootTableModifier('terramity:chests/ancient_outcrop_loot')
    .addLoot(LootEntry.of('terramity:nyxium_greatsword').when(c => c.randomChance(0.15)))

  // =========================================================================
  // EPIC curios from audit Phase 4.1 — themed by aesthetic
  // =========================================================================
  // T3 holy/luck curios -> Reverium + facility tables
  event
    .addLootTableModifier('terramity:chests/subterranean_shrine_loot')
    .addLoot(LootEntry.of('terramity:sacred_speed_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:angel_feather').when(c => c.randomChance(0.10)))

  event
    .addLootTableModifier('terramity:chests/catacombs_loot')
    .addLoot(LootEntry.of('terramity:angel_feather').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/overgrown_facility_loot')
    .addLoot(LootEntry.of('terramity:fortunes_favor').when(c => c.randomChance(0.10)))

  // T4 cosmic/void/dragon curios -> Nyxium tier tables
  event
    .addLootTableModifier('terramity:chests/infested_lab_loot')
    .addLoot(LootEntry.of('terramity:antimatter_pacemaker').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:nyxs_necklace').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:antiprism').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:null_scarf').when(c => c.randomChance(0.10)))

  event
    .addLootTableModifier('terramity:chests/ancient_outcrop_loot')
    .addLoot(LootEntry.of('terramity:dragon_band').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:nyxs_necklace').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:null_scarf').when(c => c.randomChance(0.08)))

  // =========================================================================
  // RARE tomes + bracelets — audit Phase 5 closure
  // =========================================================================
  // T2 tomes — fire_lookout_tower (T2), suspicious_shrine (T2), mudhut (T1-T2)
  event
    .addLootTableModifier('terramity:chests/fire_lookout_tower_loot')
    .addLoot(LootEntry.of('terramity:tome_of_commotion').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:galebounce_tome').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:velocity_flip').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/suspicious_shrine_loot')
    .addLoot(LootEntry.of('terramity:tome_of_commotion').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:dimensional_poof').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:galebounce_tome').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/mudhut_loot')
    .addLoot(LootEntry.of('terramity:velocity_flip').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:dimensional_poof').when(c => c.randomChance(0.10)))

  // T3 tomes -> T3 dungeon/dungeon-adjacent tables
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:tome_of_ascension').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:guardian_grimoire').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:gaias_tempest').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:tome_of_ascension').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/catacombs_loot')
    .addLoot(LootEntry.of('terramity:guardian_grimoire').when(c => c.randomChance(0.10)))

  // T3 bracelets -> reverium-tier tables (paladin theme matches anti-undead)
  event
    .addLootTableModifier('terramity:chests/catacombs_loot')
    .addLoot(LootEntry.of('terramity:malediction_bracelets').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/subterranean_shrine_loot')
    .addLoot(LootEntry.of('terramity:electron_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:malediction_bracelets').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/overgrown_facility_loot')
    .addLoot(LootEntry.of('terramity:electron_bracelets').when(c => c.randomChance(0.08)))

  console.log('[terramity_structure_drops] T3/T4 ingot-family weapons + 8 EPIC curios + 9 RARE tomes/bracelets allocated to Terramity structures')
})
