// =============================================================================
// STAFF / WAND DROPS — drop-only mage main-hand tier seeding (Phase 7)
// =============================================================================
// Mirrors the Simply Swords boss-drop pattern but for the 15 staff/wand items
// across 9 mods that were previously inheriting default mod loot logic without
// our progression seeding. Pure-mage main-hand niche per project_mage_loadout:
//   - Ars Nouveau spellbook = off-hand "basic attack"
//   - ISS spellbook = curio "abilities"
//   - Drop-only staff/wand = main-hand, this file allocates to bosses
//
// Already covered elsewhere (don't duplicate):
//   - irons_spellbooks:blood_staff → dead_king (50%) in iss_boss_drops.js
//   - irons_spellbooks:ice_staff → cryomancer/snow_queen/alpha_yeti in iss_boss_drops.js
//
// Companion: tier_gated_recipes.js Section K strips crafting recipes for
// the 11 staves that are otherwise craftable in source mods.
//
// Memory: project_mage_loadout.md, feedback_kubejs_event_scope.md.
// =============================================================================

LootJS.modifiers(event => {

  // ════════════════════════════════════════════════════════════════════
  // T2 STAVES — boss-allocated drops (~30-40% rate)
  // ════════════════════════════════════════════════════════════════════

  // ── TF Fortification Scepter — Knight Phantom (T2 defender boss) ──
  // Themed: knight = fortification.
  event
    .addEntityLootModifier('twilightforest:knight_phantom')
    .addLoot(LootEntry.of('twilightforest:fortification_scepter').when(c => c.randomChance(0.35)))

  // ── TF Lifedrain Scepter — Lich (T2 magic boss) ──
  // Themed: lich = life drain.
  event
    .addEntityLootModifier('twilightforest:lich')
    .addLoot(LootEntry.of('twilightforest:lifedrain_scepter').when(c => c.randomChance(0.30)))

  // ── TF Twilight Scepter — Ur-Ghast (T2 final TF boss, twilight tower) ──
  event
    .addEntityLootModifier('twilightforest:ur_ghast')
    .addLoot(LootEntry.of('twilightforest:twilight_scepter').when(c => c.randomChance(0.30)))

  // ── TF Zombie Scepter — Minoshroom (T2, ground/undead theme) ──
  event
    .addEntityLootModifier('twilightforest:minoshroom')
    .addLoot(LootEntry.of('twilightforest:zombie_scepter').when(c => c.randomChance(0.25)))

  // ── ISS Graybeard Staff — re-homed to Archevoker (T2/T3 caster). The
  // 'wandering_magician' is armor-only in installed ISS (no entity); the
  // unresolvable id silently defaulted this drop onto pigs (2026-06-06). ──
  event
    .addEntityLootModifier('irons_spellbooks:archevoker')
    .addLoot(LootEntry.of('irons_spellbooks:graybeard_staff').when(c => c.randomChance(0.20)))

  // ── ISS Hither-Thither Wand — Archevoker (T2 teleport-mage themed) ──
  event
    .addEntityLootModifier('irons_spellbooks:archevoker')
    .addLoot(LootEntry.of('irons_spellbooks:hither_thither_wand').when(c => c.randomChance(0.25)))

  // ── Savage and Ravage Wand of Freezing — Pillager Executioner (T2 raid drop) ──
  event
    .addEntityLootModifier('savage_and_ravage:executioner')
    .addLoot(LootEntry.of('savage_and_ravage:wand_of_freezing').when(c => c.randomChance(0.20)))

  // ════════════════════════════════════════════════════════════════════
  // T3 STAVES — boss-allocated drops (~15-25% rate)
  // ════════════════════════════════════════════════════════════════════

  // ── ISS Pyrium Staff — Pyromancer (T3 ISS fire wizard mob) ──
  // Pyromancer already drops armor pieces; add staff at 15% as an
  // alternate path for mage players grinding the mob.
  event
    .addEntityLootModifier('irons_spellbooks:pyromancer')
    .addLoot(LootEntry.of('irons_spellbooks:pyrium_staff').when(c => c.randomChance(0.15)))

  // ── Aether Nature Staff — Slider (T2-T3 stone/earth boss, nature theme) ──
  event
    .addEntityLootModifier('aether:slider')
    .addLoot(LootEntry.of('aether:nature_staff').when(c => c.randomChance(0.25)))

  // ── Terramity Perish Staff — Maledictus (T3 corrupted boss, perish theme) ──
  event
    .addEntityLootModifier('cataclysm:maledictus')
    .addLoot(LootEntry.of('terramity:perish_staff').when(c => c.randomChance(0.15)))

  // ── FA Draco Arcanus Staff — Cataclysm Harbinger (T3 dark herald) ──
  event
    .addEntityLootModifier('cataclysm:the_harbinger')
    .addLoot(LootEntry.of('forbidden_arcanus:draco_arcanus_staff').when(c => c.randomChance(0.18)))

  // ════════════════════════════════════════════════════════════════════
  // T4 STAVES — endgame boss-allocated drops (~10-15% rate)
  // ════════════════════════════════════════════════════════════════════

  // ── ISS Staff of the Nines — Dead King (T4 ISS boss; alt to blood_staff) ──
  // Dead King already drops blood_staff (50%); staff_of_the_nines is
  // the rarer alternate, 12% — endgame mage capstone path.
  event
    .addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('irons_spellbooks:staff_of_the_nines').when(c => c.randomChance(0.12)))

  // ── Aether Cloud Staff — Valkyrie Queen (T3-T4 sky boss, cloud theme) ──
  event
    .addEntityLootModifier('aether:valkyrie_queen')
    .addLoot(LootEntry.of('aether:cloud_staff').when(c => c.randomChance(0.20)))

  // ── DD Sonorous Staff — Warden (T4 sculk boss, sonorous = sonic theme) ──
  // The Cataclysm Warden has the sound-based mechanic this staff thematically
  // mirrors. Vanilla minecraft:warden is one option but Cataclysm-modified
  // wardens drop richer loot pools; use both for safety.
  event
    .addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('deeperdarker:sonorous_staff').when(c => c.randomChance(0.15)))
  event
    .addEntityLootModifier('cataclysm:ender_guardian')
    .addLoot(LootEntry.of('deeperdarker:sonorous_staff').when(c => c.randomChance(0.10)))

  // ── FA Draco Arcanus Scepter — Cataclysm Maledictus (T4 corrupted endgame) ──
  // Pairs with FA Draco Arcanus Staff (T3 Harbinger). Scepter is the
  // upgraded form, dropped from a higher-tier boss.
  event
    .addEntityLootModifier('cataclysm:ender_guardian')
    .addLoot(LootEntry.of('forbidden_arcanus:draco_arcanus_scepter').when(c => c.randomChance(0.10)))

  // ── Terramity Lightning Staff — Vanilla Warden (T4 storm/sonic) ──
  // Lightning theme on a sound-based boss; pairs with sonorous_staff but
  // separate drop slot.
  event
    .addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('terramity:lightning_staff').when(c => c.randomChance(0.10)))

  console.log('[staff_wand_drops] loaded — 17 staves seeded across T2/T3/T4 bosses')
})
