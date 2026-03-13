// =============================================================================
// VILLAGER TRADE REWORK
// KubeJS Server Script (requires MoreJS addon)
// Place in: kubejs/server_scripts/villager_trades.js
//
// Design doc Part I, Section 18: Villager Trade Rework
//
// Goal: Keep villagers relevant as an emerald economy without bypassing
// tier gates. Emeralds become a "convenience currency" for food, XP,
// building materials, and utility items — NOT progression gear/enchants.
//
// REMOVE: Enchanted book trades from Librarians (Apotheosis handles enchanting)
// REMOVE: Diamond/netherite gear from Toolsmiths/Armorers/Weaponsmiths
// KEEP:   Food, building materials, utility trades (maps, glass, dyes)
// KEEP:   Iron-tier tool/armor trades (tier-appropriate baseline)
// ADD:    XP bottle trades on Clerics at scaling emerald costs
//
// DEPENDENCY: MoreJS (https://curseforge.com/minecraft/mc-mods/morejs)
//             Provides MoreJS.villagerTrades() event for trade modification
// =============================================================================

MoreJS.villagerTrades(event => {

  // =========================================================================
  // LIBRARIAN — Remove ALL enchanted book trades (levels 1-5)
  // =========================================================================
  // Librarians are the #1 tier-gate bypass in vanilla. A single librarian
  // can provide Mending, Protection IV, Sharpness V etc. for emeralds.
  // Apotheosis is the enchanting system — players should earn enchantments
  // through the Enchanting Table + affix system, not passive trading.
  // =========================================================================

  event.removeTrades({
    output: 'minecraft:enchanted_book',
    professions: 'minecraft:librarian'
  })

  // =========================================================================
  // ARMORER — Remove diamond and netherite gear trades
  // =========================================================================
  // Iron armor from armorers is fine (Tier 1). Diamond+ must come from
  // crafting with earned materials, boss drops, or dungeon loot.
  // =========================================================================

  event.removeTrades({ output: 'minecraft:diamond_helmet', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:diamond_chestplate', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:diamond_leggings', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:diamond_boots', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:netherite_helmet', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:netherite_chestplate', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:netherite_leggings', professions: 'minecraft:armorer' })
  event.removeTrades({ output: 'minecraft:netherite_boots', professions: 'minecraft:armorer' })

  // =========================================================================
  // TOOLSMITH — Remove diamond and netherite tool trades
  // =========================================================================

  event.removeTrades({ output: 'minecraft:diamond_pickaxe', professions: 'minecraft:toolsmith' })
  event.removeTrades({ output: 'minecraft:diamond_axe', professions: 'minecraft:toolsmith' })
  event.removeTrades({ output: 'minecraft:diamond_shovel', professions: 'minecraft:toolsmith' })
  event.removeTrades({ output: 'minecraft:diamond_hoe', professions: 'minecraft:toolsmith' })

  // =========================================================================
  // WEAPONSMITH — Remove diamond and netherite weapon trades
  // =========================================================================

  event.removeTrades({ output: 'minecraft:diamond_sword', professions: 'minecraft:weaponsmith' })
  event.removeTrades({ output: 'minecraft:diamond_axe', professions: 'minecraft:weaponsmith' })

  // =========================================================================
  // CLERIC — Add XP bottle trades at scaling costs
  // =========================================================================
  // Design doc: "ADD: XP bottle trades on Clerics at scaling emerald costs
  // (emeralds → XP conversion)" — ties emeralds into XP economy (Sec 15).
  // =========================================================================

  // Level 3: 5 emeralds → 1 XP bottle (introductory)
  event.addTrade(
    'minecraft:cleric', 3,
    Item.of('minecraft:emerald', 5),
    'minecraft:experience_bottle'
  )

  // Level 4: 3 emeralds → 1 XP bottle (better rate for loyal customers)
  event.addTrade(
    'minecraft:cleric', 4,
    Item.of('minecraft:emerald', 3),
    'minecraft:experience_bottle'
  )

  // Level 5: 10 emeralds → 4 XP bottles (master tier bulk discount)
  event.addTrade(
    'minecraft:cleric', 5,
    Item.of('minecraft:emerald', 10),
    Item.of('minecraft:experience_bottle', 4)
  )

  // =========================================================================
  // LOGGING
  // =========================================================================
  console.log('[IridescentCraft] Villager trade rework loaded:')
  console.log('  - Librarian: Enchanted book trades REMOVED')
  console.log('  - Armorer: Diamond/netherite gear REMOVED')
  console.log('  - Toolsmith: Diamond/netherite tools REMOVED')
  console.log('  - Weaponsmith: Diamond/netherite weapons REMOVED')
  console.log('  - Cleric: XP bottle trades ADDED (levels 3-5)')
})
