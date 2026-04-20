// =============================================================================
// IridescentCraft — Planetary Enchantment Book Loot
// File: kubejs/server_scripts/loot/planetary_loot.js
//
// Design Doc: Planetary Hazard Enchantments — Book Drops
//
// Adds enchanted book drops for the 5 planetary hazard enchantments.
// Books appear in structure chests on the relevant planet.
// Mob kill drops have been removed — books are structure-loot only.
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // PLANETARY ENCHANTMENT BOOKS IN STRUCTURE CHESTS
  // Each planet's generated structures contain the matching enchantment book.
  // Uses LootType.CHEST filtered by dimension — applies to all chest loot
  // in structures on the matching planet. Higher level books in later planets.
  // =========================================================================

  // ── Moon chests: Lunar Stride I-II (30% chance) ──
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:moon')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:lunar_stride",lvl:1s}]}'))
        .when(c => c.randomChance(0.30))
    )
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:moon')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:lunar_stride",lvl:2s}]}'))
        .when(c => c.randomChance(0.10))
    )

  // ── Mars chests: Thermal Regulation I-II (30% chance) ──
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:mars')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:thermal_regulation",lvl:1s}]}'))
        .when(c => c.randomChance(0.30))
    )
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:mars')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:thermal_regulation",lvl:2s}]}'))
        .when(c => c.randomChance(0.10))
    )

  // ── Mercury chests: Stellar Shield I-II (30% chance) ──
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:mercury')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:stellar_shield",lvl:1s}]}'))
        .when(c => c.randomChance(0.30))
    )
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:mercury')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:stellar_shield",lvl:2s}]}'))
        .when(c => c.randomChance(0.10))
    )

  // ── Venus chests: Pressure Shell I-II (30% chance) ──
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:venus')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:pressure_shell",lvl:1s}]}'))
        .when(c => c.randomChance(0.30))
    )
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:venus')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:pressure_shell",lvl:2s}]}'))
        .when(c => c.randomChance(0.10))
    )

  // ── Glacio chests: Void Adaptation I-II (30% chance) ──
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:glacio')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:void_adaptation",lvl:1s}]}'))
        .when(c => c.randomChance(0.30))
    )
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension('ad_astra:glacio')
    .addLoot(
      LootEntry.of(Item.of('minecraft:enchanted_book', '{StoredEnchantments:[{id:"icraft:void_adaptation",lvl:2s}]}'))
        .when(c => c.randomChance(0.10))
    )


  console.log('[IridescentCraft] planetary_loot.js loaded — planetary enchant books (structure chests only)')
})
