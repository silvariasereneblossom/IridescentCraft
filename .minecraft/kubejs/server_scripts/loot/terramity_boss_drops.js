// =============================================================================
// TERRAMITY BOSS DROPS — non-gun melee EPIC weapons (audit Phase 4.1)
// =============================================================================
// Companion to:
//   - recipes/recipe_audit.js Section I.3 (removes crafting recipes)
//   - loot/lootjs_overhaul.js (strips from generic chest+entity loot pools)
//
// Allocates the 7 EPIC non-gun terramity weapons to specific T3-T4 bosses
// per the audit's themed mapping. The 8 EPIC curios in the same I.3 block
// are NOT allocated to bosses — they're pack-incompatible accessories that
// stay creative-only.
//
// Drop chances are 5-15% per boss kill — lower than simplyswords/ISS rates
// because terramity uses internal Class system effects that overlap with
// our origins/classes; we want these as occasional rewards, not staples.
// =============================================================================

LootJS.modifiers(event => {

  // ---- unholy_lance — undead/lance theme ----
  // Allocated to Maledictus (T3 ISS undead boss). Themed: undead lance.
  event
    .addEntityLootModifier('irons_spellbooks:dead_king')
    .addLoot(LootEntry.of('terramity:unholy_lance').when(c => c.randomChance(0.10)))

  // ---- blasphemic_rapture — fire/destruction theme ----
  // Allocated to Ignis (T3 cataclysm fire boss). Themed: blasphemic flame.
  event
    .addEntityLootModifier('cataclysm:ignis')
    .addLoot(LootEntry.of('terramity:blasphemic_rapture').when(c => c.randomChance(0.10)))

  // ---- davy_jones — ocean/cursed-captain theme ----
  // Allocated to The Leviathan (T3-T4 cataclysm ocean boss).
  event
    .addEntityLootModifier('cataclysm:the_leviathan')
    .addLoot(LootEntry.of('terramity:davy_jones').when(c => c.randomChance(0.10)))

  // ---- olympus — storm/divine theme ----
  // Allocated to Aether Slider (T2 storm-themed) at lower rate, since
  // olympus is T3-power-level and Slider is T2 boss; rare drop honors
  // the cross-tier reward bridge.
  event
    .addEntityLootModifier('aether:slider')
    .addLoot(LootEntry.of('terramity:olympus').when(c => c.randomChance(0.05)))

  // ---- divine_intervention — holy/heal theme ----
  // Allocated to Aether Sun Spirit (T2 holy/sun boss).
  event
    .addEntityLootModifier('aether:sun_spirit')
    .addLoot(LootEntry.of('terramity:divine_intervention').when(c => c.randomChance(0.10)))

  // ---- planet_buster — cosmic/end-tier theme ----
  // Allocated to Ender Dragon (T4 endgame). Highest-power weapon, lowest rate.
  event
    .addEntityLootModifier('minecraft:ender_dragon')
    .addLoot(LootEntry.of('terramity:planet_buster').when(c => c.randomChance(0.15)))

  // ---- kamehameha — anime/charge-attack theme ----
  // Allocated to Mythic Forge as a quest reward path rather than boss drop —
  // its theme is unique enough to warrant a "you earned this" gate via the
  // existing endgame crafting system rather than RNG. For now, drop from
  // Ancient Remnant at low rate (T4 endgame proxy) until a Mythic Forge
  // recipe is added in a future phase.
  event
    .addEntityLootModifier('cataclysm:ancient_remnant')
    .addLoot(LootEntry.of('terramity:kamehameha').when(c => c.randomChance(0.05)))

  console.log('[terramity_boss_drops] registered 7 non-gun EPIC weapon allocations')
})
