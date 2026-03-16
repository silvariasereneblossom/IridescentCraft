// =============================================================================
// IridescentCraft — Planetary Enchantment Book Loot
// File: kubejs/server_scripts/loot/planetary_loot.js
//
// Design Doc: Planetary Hazard Enchantments — Book Drops
//
// Adds enchanted book drops for the 5 planetary hazard enchantments.
// Books drop from any mob kill on the relevant planet at ~12% chance.
// Uses LootJS entity loot modifiers with dimension checks.
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // PLANETARY ENCHANTMENT BOOK DROPS
  // Each planet's mobs have a chance to drop the matching enchantment book.
  // Uses LootType.ENTITY to modify all entity loot, filtered by dimension.
  // =========================================================================

  // ── Moon: Lunar Stride books (12% from any mob) ──
  event
    .addLootTypeModifier(LootType.ENTITY)
    .anyDimension('ad_astra:moon')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .withNBT('{StoredEnchantments:[{id:"icraft:lunar_stride",lvl:1s}]}')
        .when(c => c.randomChance(0.12))
    )

  // ── Mars: Thermal Regulation books (12% from any mob) ──
  event
    .addLootTypeModifier(LootType.ENTITY)
    .anyDimension('ad_astra:mars')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .withNBT('{StoredEnchantments:[{id:"icraft:thermal_regulation",lvl:1s}]}')
        .when(c => c.randomChance(0.12))
    )

  // ── Mercury: Stellar Shield books (12% from any mob) ──
  event
    .addLootTypeModifier(LootType.ENTITY)
    .anyDimension('ad_astra:mercury')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .withNBT('{StoredEnchantments:[{id:"icraft:stellar_shield",lvl:1s}]}')
        .when(c => c.randomChance(0.12))
    )

  // ── Venus: Pressure Shell books (12% from any mob) ──
  event
    .addLootTypeModifier(LootType.ENTITY)
    .anyDimension('ad_astra:venus')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .withNBT('{StoredEnchantments:[{id:"icraft:pressure_shell",lvl:1s}]}')
        .when(c => c.randomChance(0.12))
    )

  // ── Glacio: Void Adaptation books (12% from any mob) ──
  event
    .addLootTypeModifier(LootType.ENTITY)
    .anyDimension('ad_astra:glacio')
    .addLoot(
      LootEntry.of('minecraft:enchanted_book')
        .withNBT('{StoredEnchantments:[{id:"icraft:void_adaptation",lvl:1s}]}')
        .when(c => c.randomChance(0.12))
    )


  // =========================================================================
  // AETHERSTEEL ON VENUS & GLACIO
  // Since Forge biome modifiers cannot filter by dimension, we add Aethersteel
  // scraps as bonus drops when mining planet stone on Venus and Glacio.
  // This simulates finding Aethersteel ore veins in these dimensions.
  // =========================================================================

  // ── Venus: Mining Venus Stone has 5% chance to drop Aethersteel Scrap ──
  event
    .addBlockLootModifier('ad_astra:venus_stone')
    .anyDimension('ad_astra:venus')
    .addLoot(
      LootEntry.of('aethersteel:aethersteel_scrap')
        .when(c => c.randomChance(0.05))
    )

  // ── Glacio: Mining Glacio Stone has 5% chance to drop Aethersteel Scrap ──
  event
    .addBlockLootModifier('ad_astra:glacio_stone')
    .anyDimension('ad_astra:glacio')
    .addLoot(
      LootEntry.of('aethersteel:aethersteel_scrap')
        .when(c => c.randomChance(0.05))
    )

  // ── Venus: Deepslate equivalent has higher chance ──
  event
    .addBlockLootModifier('ad_astra:venus_sandstone')
    .anyDimension('ad_astra:venus')
    .addLoot(
      LootEntry.of('aethersteel:aethersteel_scrap')
        .when(c => c.randomChance(0.03))
    )

  // ── Glacio: Deepslate equivalent has higher chance ──
  event
    .addBlockLootModifier('ad_astra:permafrost')
    .anyDimension('ad_astra:glacio')
    .addLoot(
      LootEntry.of('aethersteel:aethersteel_scrap')
        .when(c => c.randomChance(0.03))
    )


  console.log('[IridescentCraft] planetary_loot.js loaded — planetary enchant books + Aethersteel drops')
})
