// =============================================================================
// VILLAGER TRADE REWORK
// KubeJS Server Script (native Forge event — no MoreJS required)
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
// APPROACH: Uses ForgeEvents.onEvent to hook Forge's VillagerTradesEvent.
// This fires when each profession's trade list is first assembled.
// We clear specific level tiers that contain banned items and re-add
// only the trades we want to keep. For Cleric, we add new XP bottle trades.
// =============================================================================

// ── Java class imports ──────────────────────────────────────────────────────
const BasicItemListing = Java.loadClass('net.minecraftforge.common.BasicItemListing')
const ItemStack = Java.loadClass('net.minecraft.world.item.ItemStack')
const Items = Java.loadClass('net.minecraft.world.item.Items')

// ── Helper: create a BasicItemListing trade ─────────────────────────────────
// Args: costA (ItemStack), costB (ItemStack|null), result (ItemStack),
//       maxUses, xp, priceMult
function makeTrade(costA, costB, result, maxUses, xp, priceMult) {
  if (costB) {
    return new BasicItemListing(costA, costB, result, maxUses, xp, priceMult)
  }
  return new BasicItemListing(costA, ItemStack.EMPTY, result, maxUses, xp, priceMult)
}

// ── Forge VillagerTradesEvent hook ───────────────────────────────────────────
// This event fires once per profession when the game builds the trade pool.
// event.getTrades() returns an Int2ObjectMap<List<ItemListing>> keyed by
// villager level (1-5).
//
// STRATEGY: For problematic professions, we clear the specific levels that
// contain banned trades and replace them with curated alternatives.
// This avoids needing to inspect opaque lambda-based ItemListing objects.
// =============================================================================

ForgeEvents.onEvent('net.minecraftforge.event.village.VillagerTradesEvent', event => {
  let professionName = '' + event.getType()

  // =========================================================================
  // LIBRARIAN — Remove enchanted book trades (levels 1-5)
  // =========================================================================
  // Vanilla librarians offer enchanted books at every level. These are the
  // #1 tier-gate bypass. Apotheosis handles enchanting — players earn
  // enchantments through the enchanting table + affix system.
  //
  // We clear levels 1-5 and re-add only paper/book/ink/name-tag type trades.
  // =========================================================================
  if (professionName.includes('librarian')) {
    let trades = event.getTrades()

    // Level 1: Vanilla has paper->emerald and emerald->enchanted_book
    // Keep: paper trade (24 paper -> 1 emerald)
    // Remove: enchanted book trade
    clearAndReplace(trades, 1, [
      makeTrade(new ItemStack(Items.PAPER, 24), null,
        new ItemStack(Items.EMERALD, 1), 16, 2, 0.05),
      // Add: book trade (emeralds -> book, utility)
      makeTrade(new ItemStack(Items.EMERALD, 4), null,
        new ItemStack(Items.BOOK, 3), 12, 1, 0.05)
    ])

    // Level 2: Vanilla has book->emerald and emerald->enchanted_book
    // Keep: book buy trade
    clearAndReplace(trades, 2, [
      makeTrade(new ItemStack(Items.BOOK, 4), null,
        new ItemStack(Items.EMERALD, 1), 12, 10, 0.05),
      // Add: lantern trade (utility lighting)
      makeTrade(new ItemStack(Items.EMERALD, 1), null,
        new ItemStack(Items.LANTERN, 1), 12, 5, 0.05)
    ])

    // Level 3: Vanilla has ink_sac->emerald and emerald->enchanted_book
    // Keep: ink sac buy trade
    clearAndReplace(trades, 3, [
      makeTrade(new ItemStack(Items.INK_SAC, 5), null,
        new ItemStack(Items.EMERALD, 1), 12, 10, 0.05),
      // Add: glass trade (building material)
      makeTrade(new ItemStack(Items.EMERALD, 1), null,
        new ItemStack(Items.GLASS, 4), 12, 10, 0.05)
    ])

    // Level 4: Vanilla has writable_book and emerald->enchanted_book
    // Keep: writable book buy
    clearAndReplace(trades, 4, [
      makeTrade(new ItemStack(Items.WRITABLE_BOOK, 2), null,
        new ItemStack(Items.EMERALD, 1), 12, 15, 0.05),
      // Add: bookshelf (building/decorative)
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.BOOKSHELF, 1), 12, 15, 0.05)
    ])

    // Level 5: Vanilla has name_tag trade
    // Keep: name tag trade (utility)
    clearAndReplace(trades, 5, [
      makeTrade(new ItemStack(Items.EMERALD, 20), null,
        new ItemStack(Items.NAME_TAG, 1), 12, 30, 0.05)
    ])

    console.log('[IridescentCraft] Librarian trades reworked: enchanted books REMOVED, utility trades kept')
  }

  // =========================================================================
  // ARMORER — Remove diamond/netherite gear, keep iron tier
  // =========================================================================
  // Vanilla armorer levels:
  //   1: coal->emerald, iron_leggings/boots/helmet (varies)
  //   2: iron_*  (keeps these)
  //   3: lava_bucket->emerald, chainmail/diamond trades start
  //   4: diamond_* trades
  //   5: diamond/netherite master trades
  // We clear levels 3-5 and replace with iron-tier and utility trades.
  // =========================================================================
  if (professionName.includes('armorer')) {
    let trades = event.getTrades()

    // Levels 1-2: Keep vanilla iron trades as-is (tier-appropriate)

    // Level 3: Remove chainmail/diamond, add shield & iron horse armor
    clearAndReplace(trades, 3, [
      makeTrade(new ItemStack(Items.LAVA_BUCKET, 1), null,
        new ItemStack(Items.EMERALD, 1), 12, 10, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 5), null,
        new ItemStack(Items.SHIELD, 1), 12, 10, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 6), null,
        new ItemStack(Items.IRON_HORSE_ARMOR, 1), 12, 10, 0.05)
    ])

    // Level 4: Utility armor-related trades only
    clearAndReplace(trades, 4, [
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.IRON_HELMET, 1), 12, 15, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 7), null,
        new ItemStack(Items.IRON_CHESTPLATE, 1), 12, 15, 0.05)
    ])

    // Level 5: Master tier — premium iron trades
    clearAndReplace(trades, 5, [
      makeTrade(new ItemStack(Items.EMERALD, 5), null,
        new ItemStack(Items.IRON_LEGGINGS, 1), 3, 30, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 4), null,
        new ItemStack(Items.IRON_BOOTS, 1), 3, 30, 0.05)
    ])

    console.log('[IridescentCraft] Armorer trades reworked: diamond/netherite REMOVED, iron tier kept')
  }

  // =========================================================================
  // TOOLSMITH — Remove diamond/netherite tools, keep iron tier
  // =========================================================================
  // Vanilla toolsmith levels:
  //   1: coal->emerald, stone_axe/hoe/pickaxe/shovel
  //   2: iron_*
  //   3: flint->emerald, diamond trades start
  //   4: diamond_*
  //   5: diamond_* master
  // We clear levels 3-5 and add iron-tier alternatives.
  // =========================================================================
  if (professionName.includes('toolsmith')) {
    let trades = event.getTrades()

    // Levels 1-2: Keep vanilla stone/iron trades as-is

    // Level 3: Replace diamond with iron picks
    clearAndReplace(trades, 3, [
      makeTrade(new ItemStack(Items.FLINT, 30), null,
        new ItemStack(Items.EMERALD, 1), 12, 10, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.IRON_PICKAXE, 1), 12, 10, 0.05)
    ])

    // Level 4: Iron tools continued
    clearAndReplace(trades, 4, [
      makeTrade(new ItemStack(Items.EMERALD, 2), null,
        new ItemStack(Items.IRON_SHOVEL, 1), 12, 15, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.IRON_AXE, 1), 12, 15, 0.05)
    ])

    // Level 5: Master tier — iron hoe + bell (utility)
    clearAndReplace(trades, 5, [
      makeTrade(new ItemStack(Items.EMERALD, 2), null,
        new ItemStack(Items.IRON_HOE, 1), 12, 30, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 36), null,
        new ItemStack(Items.BELL, 1), 3, 30, 0.05)
    ])

    console.log('[IridescentCraft] Toolsmith trades reworked: diamond/netherite REMOVED, iron tier kept')
  }

  // =========================================================================
  // WEAPONSMITH — Remove diamond/netherite weapons, keep iron tier
  // =========================================================================
  // Vanilla weaponsmith levels:
  //   1: coal->emerald, iron_axe
  //   2: iron_sword, emerald->flint
  //   3: diamond trades start
  //   4-5: diamond/enchanted diamond
  // We clear levels 3-5 and keep iron-tier trades.
  // =========================================================================
  if (professionName.includes('weaponsmith')) {
    let trades = event.getTrades()

    // Levels 1-2: Keep vanilla iron trades as-is

    // Level 3: Iron weapon alternatives
    clearAndReplace(trades, 3, [
      makeTrade(new ItemStack(Items.EMERALD, 1), null,
        new ItemStack(Items.FLINT, 10), 12, 10, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.IRON_SWORD, 1), 12, 10, 0.05)
    ])

    // Level 4: Crossbow + arrows (ranged utility)
    clearAndReplace(trades, 4, [
      makeTrade(new ItemStack(Items.EMERALD, 3), null,
        new ItemStack(Items.CROSSBOW, 1), 12, 15, 0.05),
      makeTrade(new ItemStack(Items.EMERALD, 1), null,
        new ItemStack(Items.ARROW, 16), 12, 15, 0.05)
    ])

    // Level 5: Master — iron axe (combat variant)
    clearAndReplace(trades, 5, [
      makeTrade(new ItemStack(Items.EMERALD, 4), null,
        new ItemStack(Items.IRON_AXE, 1), 3, 30, 0.05)
    ])

    console.log('[IridescentCraft] Weaponsmith trades reworked: diamond/netherite REMOVED, iron tier kept')
  }

  // =========================================================================
  // CLERIC — Add XP bottle trades at scaling costs
  // =========================================================================
  // Design doc: "ADD: XP bottle trades on Clerics at scaling emerald costs
  // (emeralds -> XP conversion)" — ties emeralds into XP economy (Sec 15).
  // Vanilla cleric already has XP bottles at level 5 for 3 emeralds.
  // We add earlier access at higher costs + a bulk option at master.
  // =========================================================================
  if (professionName.includes('cleric')) {
    let trades = event.getTrades()

    // Level 3: 5 emeralds -> 1 XP bottle (introductory, expensive)
    trades.get(3).add(makeTrade(
      new ItemStack(Items.EMERALD, 5), null,
      new ItemStack(Items.EXPERIENCE_BOTTLE, 1),
      12, 10, 0.05
    ))

    // Level 4: 3 emeralds -> 1 XP bottle (better rate for loyal customers)
    trades.get(4).add(makeTrade(
      new ItemStack(Items.EMERALD, 3), null,
      new ItemStack(Items.EXPERIENCE_BOTTLE, 1),
      12, 15, 0.05
    ))

    // Level 5: 10 emeralds -> 4 XP bottles (master tier bulk discount)
    trades.get(5).add(makeTrade(
      new ItemStack(Items.EMERALD, 10), null,
      new ItemStack(Items.EXPERIENCE_BOTTLE, 4),
      12, 20, 0.05
    ))

    console.log('[IridescentCraft] Cleric trades: XP bottle trades ADDED (levels 3-5)')
  }
})

// ── Helper: clear all trades at a level and add replacements ────────────────
function clearAndReplace(trades, level, replacements) {
  let list = trades.get(level)
  if (list) {
    list.clear()
    replacements.forEach(trade => list.add(trade))
  }
}

// ── Startup log ──────────────────────────────────────────────────────────────
console.log('[IridescentCraft] Villager trade rework script loaded')
console.log('  - Librarian: Enchanted book trades will be REMOVED (utility trades kept)')
console.log('  - Armorer: Diamond/netherite gear will be REMOVED (iron tier kept)')
console.log('  - Toolsmith: Diamond/netherite tools will be REMOVED (iron tier kept)')
console.log('  - Weaponsmith: Diamond/netherite weapons will be REMOVED (iron tier kept)')
console.log('  - Cleric: XP bottle trades will be ADDED at levels 3-5')
