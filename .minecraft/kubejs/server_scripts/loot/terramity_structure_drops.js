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
//   Reverium (paladin theme) -> T3 chthonic dungeon / chthonian breach
//                               (was "T3 catacombs / subterranean shrine";
//                               both are Overworld -- see the 2026-10-11 note)
//   Nyxium (knight + cosmic-purple) -> T4 boss (was infested lab / ancient
//                               outcrop; both Overworld)
//
// WHICH TERRAMITY STRUCTURES ARE REALLY T3 (read from the 0.9.8 jar's
// has_structure tags and structure files, 2026-10-11):
//   Nether (tier_3 dimension): chthonic_dungeon, chthonian_breach
//   Overworld: everything else. In particular
//     chests/catacombs_loot           = mausoleum (taiga) + church
//     chests/subterranean_shrine_loot = subterranean_shrine (any overworld
//                                       biome) AND the Ancient Outcrop, the T1
//                                       entry-boss structure
//     chests/overgrown_facility_loot  = overgrown_facility (forest/plains/...)
//     chests/fire_lookout_tower_loot, mudhut_loot, suspicious_shrine_loot too
// Since 2026-10-11 this file adds NOTHING to an Overworld table.
// None of these items is stage-locked, so anything in an Overworld table is
// T1 loot whatever its comment says.
//
// 8 EPIC curios (audit Phase 4.1 closure) — recipes were stripped 2026-04-27
// but no drop allocation existed; they were creative-only. Now: 3 curios in
// the two Terramity Nether dungeons (T3), 5 on T4 bosses. None is obtainable
// in the Overworld (see the 2026-10-10 note in the EPIC curios section).
//
// Drop rates kept modest (5-15%) so structure runs feel rewarding without
// flooding the inventory. Stacks well with chest re-roll mechanics from
// Apoth + Marquee tier injection.
// =============================================================================

LootJS.modifiers(icraft.guard('loot/terramity_structure_drops', 'LootJS.modifiers', event => {

  // =========================================================================
  // T3 EXODIUM (warlock) — chthonic_dungeon + chthonian_breach
  // =========================================================================
  icraft.section('loot/terramity_structure_drops/t3-exodium-chthonic-dungeon-chthonian-breach', function () {
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
  })

  // =========================================================================
  // T3 REVERIUM (paladin / anti-undead) — the two Nether dungeons
  // =========================================================================
  // 2026-10-11: these sat in catacombs_loot + subterranean_shrine_loot, which
  // are Overworld tables (the shrine table is even rolled inside the T1
  // Ancient Outcrop), so a T3 weapon was a walk away for a new character.
  // Same rule the operator set for the EPIC curios on 2026-10-10 ("late-tier
  // only") and for Nyxium before that: T3 gear comes from a T3 source. Rates
  // unchanged, table for table (catacombs -> dungeon, shrine -> breach).
  icraft.section('loot/terramity_structure_drops/t3-reverium-the-two-nether-dungeons', function () {
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:reverium_sword').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:reverium_axe').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:reverium_sword').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:reverium_axe').when(c => c.randomChance(0.10)))
  })

  // =========================================================================
  // T4 NYXIUM (knight + cosmic-purple) — boss drop instead of structure
  // =========================================================================
  // Originally allocated to infested_lab + ancient_outcrop chests (2026-05-19
  // first pass), but both are Overworld structures despite their late-game
  // loot. Per user audit: T4 power-level should drop from an actual T4 source,
  // not a structure that's accessible at T1 by dimension alone. Moved to
  // Cataclysm Netherite Monstrosity — the metallic-knight T4 endgame boss
  // closest in theme to "nyxium knight greatsword." Drop rate matched to
  // planet_buster's ender_dragon allocation (0.15 in terramity_boss_drops.js).
  icraft.section('loot/terramity_structure_drops/t4-nyxium-boss-drop-instead-of-structure', function () {
  global.icraftEntityMod(event, 'cataclysm:netherite_monstrosity')
    .addLoot(LootEntry.of('terramity:nyxium_greatsword').when(c => c.randomChance(0.15)))
  })

  // =========================================================================
  // EPIC curios from audit Phase 4.1 — themed by aesthetic
  // =========================================================================
  // T3 holy/luck curios -> the two Terramity NETHER dungeons.
  //
  // 2026-10-10 (operator decision: "droppable, late-tier only"): these three
  // sat in subterranean_shrine / catacombs / overgrown_facility. All three are
  // OVERWORLD structures (terramity's has_structure tags: #minecraft:is_overworld,
  // #minecraft:is_taiga, forest/taiga/mountain/plains), so a T1 player could
  // loot an EPIC curio by walking. The only Terramity structures that generate
  // in a T3+ dimension are chthonic_dungeon and chthonian_breach
  // (#minecraft:is_nether; the Nether is tier_3-staged), so that is where they
  // go. Same per-table chances as before; the holy theme no longer matches the
  // dungeon, the tier does.
  icraft.section('loot/terramity_structure_drops/epic-curios-from-audit-phase-4.1-themed-by', function () {
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:sacred_speed_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:angel_feather').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:angel_feather').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:fortunes_favor').when(c => c.randomChance(0.10)))

  // T4 cosmic/void/dragon curios -> T4 boss drops (same rationale as the
  // Nyxium greatsword above — these were originally in infested_lab +
  // ancient_outcrop which are Overworld despite their late-game loot
  // content, so T1 players could reach them by dimension alone. Each
  // mapped to a T4 boss with thematic fit.)
  global.icraftEntityMod(event, 'cataclysm:ender_guardian')
    .addLoot(LootEntry.of('terramity:antimatter_pacemaker').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:null_scarf').when(c => c.randomChance(0.12)))

  global.icraftEntityMod(event, 'cataclysm:netherite_monstrosity')
    .addLoot(LootEntry.of('terramity:nyxs_necklace').when(c => c.randomChance(0.10)))

  global.icraftEntityMod(event, 'minecraft:ender_dragon')
    .addLoot(LootEntry.of('terramity:antiprism').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:dragon_band').when(c => c.randomChance(0.12)))
  })

  // =========================================================================
  // RARE tomes + bracelets — audit Phase 5 closure
  // =========================================================================
  // "T2" tomes (tome_of_commotion, galebounce_tome, velocity_flip,
  // dimensional_poof) -- now in the two Nether dungeons as well.
  // They sat in fire_lookout_tower / suspicious_shrine / mudhut, which are all
  // OVERWORLD structures (suspicious_shrine_loot is even rolled inside the T1
  // Ancient Outcrop), so they were T1 loot. Terramity has no structure in a T2
  // dimension; operator ruling 2026-10-11: move them to the Nether with the
  // rest. That makes them T3 in practice -- later than their label, never
  // earlier. Each tome had two rolls (one at 10%, one at 8%) and keeps both,
  // one per dungeon.
  icraft.section('loot/terramity_structure_drops/rare-tomes-bracelets-audit-phase-5-closure', function () {
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:tome_of_commotion').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:galebounce_tome').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('terramity:velocity_flip').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:dimensional_poof').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:tome_of_commotion').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:galebounce_tome').when(c => c.randomChance(0.08)))
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

  // (2026-10-11) The third guardian_grimoire roll, the T3 bracelets and one
  // electron_bracelets roll were in catacombs / subterranean_shrine /
  // overgrown_facility -- Overworld tables, see the header. Moved to the two
  // Nether dungeons with the same rates: what was in catacombs or the facility
  // goes to the dungeon, what was in the shrine goes to the breach (the
  // grimoire goes to the breach because the dungeon already rolls it above).
  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:guardian_grimoire').when(c => c.randomChance(0.10)))

  // T3 bracelets
  event
    .addLootTableModifier('terramity:chests/chthonic_dungeon_loot')
    .addLoot(LootEntry.of('terramity:malediction_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:electron_bracelets').when(c => c.randomChance(0.08)))

  event
    .addLootTableModifier('terramity:chests/chthonian_breach_loot')
    .addLoot(LootEntry.of('terramity:electron_bracelets').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('terramity:malediction_bracelets').when(c => c.randomChance(0.08)))

  console.log('[terramity_structure_drops] T3/T4 ingot-family weapons + 8 EPIC curios + 9 RARE tomes/bracelets allocated to Terramity structures')
  })
}))
