// =============================================================================
// MAHOU TSUKAI CROSS-MOD SYNERGY DROPS — Phase 6F-3 follow-up
// =============================================================================
// Mahou Tsukai is a T4 player-spell mod with no mob drops of its own — its
// reagents (attuned_diamond, attuned_emerald, fae_essence, kodoku) are
// crafted via vanilla means or rituals. To give Mahou-class players an
// organic acquisition path, we inject Mahou reagents as low-rate drops on
// thematically-aligned bosses across other mods.
//
// Tier mapping:
//   - attuned_emerald  — T2 reagent → village/cleric kills, TF Lich
//   - attuned_diamond  — T3-T4 reagent → Cataclysm bosses, end-tier
//   - fae_essence      — Fae/nature reagent → TF bosses, Ars Nouveau path
//   - kodoku           — Curse/poison reagent → undead/poison bosses
//
// Magic-class power curve is uncapped late-game, so seeding Mahou reagents
// at T2-T4 boss tiers is intentional progression-feeding.
// =============================================================================

LootJS.modifiers(event => {

  // ===== T2 REAGENTS (attuned_emerald, fae_essence) =====

  // ---- Twilight Lich (T2 magic boss) — magical reagent + fae essence ----
  event
    .addEntityLootModifier('twilightforest:lich')
    .addLoot(LootEntry.of('mahoutsukai:attuned_emerald').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('mahoutsukai:fae_essence').when(c => c.randomChance(0.15)))

  // ---- Twilight Hydra (T2 elemental) — fae essence (fae/nature theme) ----
  event
    .addEntityLootModifier('twilightforest:hydra')
    .addLoot(LootEntry.of('mahoutsukai:fae_essence').when(c => c.randomChance(0.15)))

  // ---- Aether Sun Spirit (T2 holy boss) — attuned_emerald ----
  event
    .addEntityLootModifier('aether:sun_spirit')
    .addLoot(LootEntry.of('mahoutsukai:attuned_emerald').when(c => c.randomChance(0.15)))

  // ---- Blue Skies Summoner (T2 magic boss) — attuned_emerald ----
  event
    .addEntityLootModifier('blue_skies:summoner')
    .addLoot(LootEntry.of('mahoutsukai:attuned_emerald').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('mahoutsukai:fae_essence').when(c => c.randomChance(0.10)))

  // ---- Vanilla Evoker (T2 illager magic) — small attuned_emerald drop ----
  event
    .addEntityLootModifier('minecraft:evoker')
    .addLoot(LootEntry.of('mahoutsukai:attuned_emerald').when(c => c.randomChance(0.10)))

  // ===== T3 REAGENTS (attuned_diamond, kodoku) =====

  // ---- Cataclysm Ignis (T3 fire boss) — attuned_diamond ----
  event
    .addEntityLootModifier('cataclysm:ignis')
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').when(c => c.randomChance(0.15)))

  // ---- Cataclysm Harbinger (T3-T4 ender) — attuned_diamond + kodoku ----
  event
    .addEntityLootModifier('cataclysm:the_harbinger')
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('mahoutsukai:kodoku').when(c => c.randomChance(0.10)))

  // ---- Cataclysm Maledictus (T3 cursed knight) — kodoku is on-theme ----
  event
    .addEntityLootModifier('cataclysm:maledictus')
    .addLoot(LootEntry.of('mahoutsukai:kodoku').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').when(c => c.randomChance(0.10)))

  // ---- Cataclysm Ancient Remnant (T3 undead) — kodoku (curse theme) ----
  event
    .addEntityLootModifier('cataclysm:ancient_remnant')
    .addLoot(LootEntry.of('mahoutsukai:kodoku').when(c => c.randomChance(0.15)))

  // ---- ISS Dead King (T4 undead boss) — kodoku + attuned_diamond ----
  event
    .addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('mahoutsukai:kodoku').when(c => c.randomChance(0.25)))
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').when(c => c.randomChance(0.20)))

  // ===== T4 REAGENTS (attuned_diamond at higher rate, end-tier) =====

  // ---- Cataclysm Ender Guardian (T4) — guaranteed-ish attuned_diamond ----
  event
    .addEntityLootModifier('cataclysm:ender_guardian')
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').limitCount([1, 2]).when(c => c.randomChance(0.40)))

  // ---- Vanilla Warden (T4 sculk) — kodoku (eldritch curse) ----
  event
    .addEntityLootModifier('minecraft:warden')
    .addLoot(LootEntry.of('mahoutsukai:kodoku').when(c => c.randomChance(0.30)))
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').when(c => c.randomChance(0.25)))

  // ---- Ender Dragon (T4) — attuned_diamond (already T4 progression hub) ----
  event
    .addEntityLootModifier('minecraft:ender_dragon')
    .addLoot(LootEntry.of('mahoutsukai:attuned_diamond').limitCount([2, 4]).when(c => c.randomChance(0.50)))

  console.log('[mahou_synergy_drops] registered 14 Mahou Tsukai reagent injection modifiers')
})
