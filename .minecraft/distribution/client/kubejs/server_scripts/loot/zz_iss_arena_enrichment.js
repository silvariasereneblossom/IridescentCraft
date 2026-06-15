// =============================================================================
// ISS ARENA ENRICHMENT — re-homed from boss_arena_themed_loot.js + _material_tease.js
// =============================================================================
// WHY THIS FILE LOADS LAST (the `zz_` prefix): lootjs_overhaul.js installs a
// `LootType.CHEST` strip `removeLoot(stripISSExceptScroll)` that removes every
// irons_spellbooks:* item except `scroll`. LootJS `removeLoot` is a ONE-SHOT
// `removeIf` applied in REGISTRATION (script-load) ORDER — CFR-decompiled from
// lootjs 2.13.1 (2026-06-14): `RemoveLootAction.applyLootHandler` = a single
// `loot.removeIf(predicate)`, NOT a persistent whole-pass filter. KubeJS loads
// scripts ALPHABETICALLY, so `boss_arena_*.js` registered their ISS-arena
// enrichment BEFORE `lootjs_overhaul.js` registered the strip -> the strip ate
// them. Re-homing those adds here (this file loads AFTER lootjs_overhaul) makes
// them register AFTER the strip, so they SURVIVE -- with NO over-delivery to
// generic chests (the strip still clears ISS items everywhere else).
//
// PURE MOVE: tables / items / chances / limitCounts are verbatim from the two
// source files (jar-verified 2026-06-03 there). Boss trophies stay boss-gated
// (not added here); the diamond/gunpowder SCRUBS stay in boss_arena_themed_loot
// (removeLoot on base tables — order vs the ISS strip is irrelevant for them);
// the icraft progression tokens (not ISS-namespaced, never stripped) are kept.
// =============================================================================

LootJS.modifiers(event => {

  // RHINO-SAFETY: var (not const) — closure-local in a LootJS.modifiers callback.
  var T3 = 'icraft:progression_token_t3'

  // ---- Catacombs (Dead King) — blood / necro theme ----
  event.addLootTableModifier('irons_spellbooks:chests/catacombs/coffin_loot')
    .addLoot(LootEntry.of('irons_spellbooks:blood_rune').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:blood_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.16)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 3]).when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('irons_spellbooks:gold_spell_book').when(c => c.randomChance(0.07)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))
  event.addLootTableModifier('irons_spellbooks:chests/catacombs/crypt_loot')
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:blank_rune').when(c => c.randomChance(0.18)))

  // ---- Pyromancer Tower (Echo of Tyros) — fire theme (+ cinder_essence tease, moved here) ----
  event.addLootTableModifier('irons_spellbooks:chests/pyromancer_tower/pyromancer_supplies')
    .addLoot(LootEntry.of('irons_spellbooks:fire_rune').when(c => c.randomChance(0.22)))
    .addLoot(LootEntry.of('irons_spellbooks:fire_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:cinder_essence').when(c => c.randomChance(0.10)))

  // ---- Citadel (Ancient Knight) — ender / holy theme (NETHER) ----
  event.addLootTableModifier('irons_spellbooks:chests/citadel/rampart_supplies')
    .addLoot(LootEntry.of('irons_spellbooks:holy_rune').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('irons_spellbooks:ender_rune').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:holy_upgrade_orb').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_salvage').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))

  // ---- Evoker Fort (Archevoker) — evocation / arcane theme (+ arcane_essence tease, moved here) ----
  event.addLootTableModifier('irons_spellbooks:chests/evoker_fort')
    .addLoot(LootEntry.of('irons_spellbooks:evocation_rune').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:evocation_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:lesser_spell_slot_upgrade').when(c => c.randomChance(0.08)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').when(c => c.randomChance(0.10)))

  // ---- Mountain Tower (Magehunter) — ice / arcane theme ----
  event.addLootTableModifier('irons_spellbooks:chests/mountain_tower/mountain_tower')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.22)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:uncommon_ink').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:arcane_essence').limitCount([1, 2]).when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of(T3).when(c => c.randomChance(0.05)))

  // ---- Cataclysm frosted_prison (Scylla, overworld) — frost-magic backfill ----
  event.addLootTableModifier('cataclysm:chests/frosted_prison_treasure')
    .addLoot(LootEntry.of('irons_spellbooks:ice_rune').when(c => c.randomChance(0.18)))
    .addLoot(LootEntry.of('irons_spellbooks:ice_upgrade_orb').when(c => c.randomChance(0.10)))
    .addLoot(LootEntry.of('irons_spellbooks:rare_ink').limitCount([1, 2]).when(c => c.randomChance(0.12)))

  console.log('[zz_iss_arena_enrichment] re-homed ISS arena enrichment AFTER lootjs_overhaul ISS strip (extracted from boss_arena_themed_loot + _material_tease; survives the registration-order removeIf)')
})
