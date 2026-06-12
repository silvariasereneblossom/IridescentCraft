// =============================================================================
// CROP SEED DROP REDUCTION
// Place in: kubejs/server_scripts/loot/crop_seed_reduction.js
// REQUIRES: LootJS addon
//
// Reduces seed drops from harvested crops to 5% chance.
// Goal: Make farming require dedicated seed acquisition and make scaling
// farms for Biofuel much harder.
//
// DOES NOT modify grass drops — that's the seed discovery mechanism.
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // WHEAT: Normally drops 0-3 wheat seeds. Reduce to 5% chance of 1 seed.
  // Only targets the wheat crop block, NOT short/tall grass.
  // =========================================================================
  event
    .addBlockLootModifier('minecraft:wheat')
    .removeLoot('minecraft:wheat_seeds')
    .addLoot(
      LootEntry.of('minecraft:wheat_seeds')
        .when(c => c.randomChance(0.05))
    )

  // =========================================================================
  // BEETROOTS: Normally drops 0-3 beetroot seeds. Reduce to 5% chance.
  // =========================================================================
  event
    .addBlockLootModifier('minecraft:beetroots')
    .removeLoot('minecraft:beetroot_seeds')
    .addLoot(
      LootEntry.of('minecraft:beetroot_seeds')
        .when(c => c.randomChance(0.05))
    )

  // =========================================================================
  // POTATOES / CARROTS: self-seeded crops -- the replant "seed" IS the crop.
  // Design net yield: 1 guaranteed + 5% extra per harvest.
  //
  // We guarantee TWO, not one, because Quark's Simple Harvest (right-click /
  // hoe harvest, also used by villagers) eats one of the crop's own item from
  // the drops as the replant cost (SimpleHarvestModule.harvestAndReplant:
  // stack.shrink(1) on the block's asItem). With only 1 guaranteed, a
  // right-click harvest netted ZERO 95% of the time (2026-06-12 report).
  // Both harvest modes now net the same: right-click -> 2 drops - 1 replant
  // cost = 1; manual break -> 2 drops - 1 replanted by hand = 1.
  // Wheat/beetroot are unaffected: their seed is a separate item, and Quark
  // only eats a seed when one happens to drop (5%), never the product.
  // =========================================================================
  event
    .addBlockLootModifier('minecraft:potatoes')
    .removeLoot('minecraft:potato')
    .addLoot(LootEntry.of('minecraft:potato'))
    .addLoot(LootEntry.of('minecraft:potato'))
    .addLoot(
      LootEntry.of('minecraft:potato')
        .when(c => c.randomChance(0.05))
    )

  event
    .addBlockLootModifier('minecraft:carrots')
    .removeLoot('minecraft:carrot')
    .addLoot(LootEntry.of('minecraft:carrot'))
    .addLoot(LootEntry.of('minecraft:carrot'))
    .addLoot(
      LootEntry.of('minecraft:carrot')
        .when(c => c.randomChance(0.05))
    )

  // =========================================================================
  // MELON: Melons drop melon slices, not seeds directly. But melon stems
  // can drop seeds. Target the stem for seed reduction.
  // =========================================================================
  event
    .addBlockLootModifier('minecraft:attached_melon_stem')
    .removeLoot('minecraft:melon_seeds')
    .addLoot(
      LootEntry.of('minecraft:melon_seeds')
        .when(c => c.randomChance(0.05))
    )

  event
    .addBlockLootModifier('minecraft:melon_stem')
    .removeLoot('minecraft:melon_seeds')
    .addLoot(
      LootEntry.of('minecraft:melon_seeds')
        .when(c => c.randomChance(0.05))
    )

  // =========================================================================
  // PUMPKIN: Same as melon — target the stem for seed drops.
  // =========================================================================
  event
    .addBlockLootModifier('minecraft:attached_pumpkin_stem')
    .removeLoot('minecraft:pumpkin_seeds')
    .addLoot(
      LootEntry.of('minecraft:pumpkin_seeds')
        .when(c => c.randomChance(0.05))
    )

  event
    .addBlockLootModifier('minecraft:pumpkin_stem')
    .removeLoot('minecraft:pumpkin_seeds')
    .addLoot(
      LootEntry.of('minecraft:pumpkin_seeds')
        .when(c => c.randomChance(0.05))
    )

  console.log('[IridescentCraft] Crop seed reduction loaded')
  console.log('  - Wheat/beetroot seeds: 5% drop chance')
  console.log('  - Potato/carrot: 2 guaranteed (1 is the Quark replant cost) + 5% extra')
  console.log('  - Melon/pumpkin stem seeds: 5% drop chance')
  console.log('  - Grass seed drops: UNCHANGED (discovery mechanism)')
})
