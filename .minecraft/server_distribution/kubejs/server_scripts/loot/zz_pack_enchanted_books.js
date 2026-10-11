// =============================================================================
// PACK ENCHANTED BOOKS — tier-scaled + marquee books, registered LATE
// =============================================================================
// WHY THIS FILE EXISTS (2026-10-10). Two older files disagree about enchanted
// books in chests, and both are meant to hold:
//
//   * loot_overhaul.js STRIPS `minecraft:enchanted_book` from the vanilla
//     dungeon / mineshaft / stronghold / mansion / temple / outpost / ancient
//     city tables and from the dungeons_arise, YUNG's (dungeons, strongholds,
//     fortresses, mineshafts), Valhelsia, Twilight Forest, Blue Skies and
//     Aether chest tables — "books in chests bypass the Apotheosis bookshelf
//     progression". That is about the books those TABLES roll by themselves.
//   * lootjs_overhaul.js ADDS the pack's own tier-scaled books to every chest
//     of a dimension, plus a book in each marquee structure.
//
// LootJS removeLoot is a one-shot removeIf in registration order
// (RemoveLootAction, decompiled 2.13.1), and the real load order sorts letters
// before '_' — lootjs_overhaul.js loads BEFORE loot_overhaul.js. So the strip
// ran after the adds and deleted the pack's books in exactly the chests listed
// above (every vanilla dungeon, stronghold and mansion, all Twilight Forest /
// Blue Skies / Aether chests, the Nether fortresses, the Ancient City).
//
// The adds are therefore registered from HERE. This file's name starts with
// 'z', so it loads after both overhaul files whichever of the two loads first
// (no reliance on how '_' sorts). Result, independent of that order:
//   table's own books   -> removed where loot_overhaul.js says so
//   the pack's books    -> always survive
// No LootJS modifier registered after this file touches enchanted books
// (zz_unique_chest_strip.js only names Too Many Bows items; no script outside
// loot/ that loads later uses LootJS).
//
// PURE MOVE: dimensions / levels / chances of the four tier adds are verbatim
// from lootjs_overhaul.js Section 1 (minus the 'deep_aether:the_aether' entry
// of the T2 list — not a real dimension, it never matched). The marquee books
// are queued by applyMarquee() there (global.ICRAFT_MARQUEE_BOOKS: table,
// level range, 10%) and registered here, one modifier per marquee table.
//
// NOTE: LootEntry.of must be 'minecraft:book' (not enchanted_book).
// EnchantmentHelper.enchantItem() checks `stack.is(Items.BOOK)` and only
// writes StoredEnchantments for plain books — converting the stack to
// enchanted_book as part of the function. Starting from enchanted_book writes
// to the wrong NBT tag, so the book looks blank. Vanilla loot tables do the same.
// =============================================================================

;(function () {
  // Local to this file (function scope) — nothing is exported to the shared scope.
  var UniformGenerator = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.UniformGenerator')
  var ConstantValue = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.ConstantValue')

  LootJS.modifiers(function (event) {

    // --- Tier-scaled books: every chest of the dimension ---
    console.log('[icraft-loot] Registering T1 enchanted_book re-add (Overworld, 7.5%, levels 10-25)')
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:overworld')
      .addLoot(
        LootEntry.of('minecraft:book')
          .enchantWithLevels(UniformGenerator.between(10, 25), true)
          .when(function (c) { return c.randomChance(0.075) })
      )

    console.log('[icraft-loot] Registering T2 enchanted_book re-add (TF/Aether/BlueSkies, 10%, levels 15-30)')
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('twilightforest:twilight_forest',
        'aether:the_aether',
        'blue_skies:everbright', 'blue_skies:everdawn')
      .addLoot(
        LootEntry.of('minecraft:book')
          .enchantWithLevels(UniformGenerator.between(15, 30), true)
          .when(function (c) { return c.randomChance(0.10) })
      )

    console.log('[icraft-loot] Registering T3 enchanted_book re-add (Nether/Undergarden, 12.5%, levels 20-30)')
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_nether', 'undergarden:undergarden')
      .addLoot(
        LootEntry.of('minecraft:book')
          .enchantWithLevels(UniformGenerator.between(20, 30), true)
          .when(function (c) { return c.randomChance(0.125) })
      )

    console.log('[icraft-loot] Registering T4 enchanted_book re-add (End/DD/Abyss, 15%, level 30)')
    event
      .addLootTypeModifier(LootType.CHEST)
      .anyDimension('minecraft:the_end', 'deeperdarker:otherside', 'theabyss:the_abyss')
      .addLoot(
        LootEntry.of('minecraft:book')
          .enchantWithLevels(ConstantValue.exactly(30), true)
          .when(function (c) { return c.randomChance(0.15) })
      )

    // --- Marquee-structure books (queued by lootjs_overhaul.js applyMarquee) ---
    var queued = global.ICRAFT_MARQUEE_BOOKS
    if (!queued || typeof queued.length !== 'number') {
      console.warn('[icraft-loot] marquee book queue missing (lootjs_overhaul.js did not run?) - no marquee books registered')
      queued = []
    }
    // The entry is built BEFORE the modifier is opened, so a bad queue record can
    // never leave an action-less modifier behind (that would throw in LootJS and
    // drop every modifier registered after it).
    var addMarqueeBook = function (q) {
      var chance = q.chance
      var entry = LootEntry.of('minecraft:book')
        .enchantWithLevels(UniformGenerator.between(q.minLevel, q.maxLevel), true)
        .when(function (c) { return c.randomChance(chance) })
      event.addLootTableModifier(q.table).addLoot(entry)
    }
    var done = 0
    for (var i = 0; i < queued.length; i++) {
      try {
        addMarqueeBook(queued[i])
        done++
      } catch (e) {
        console.error('[icraft-loot] marquee book #' + i + ' not registered: ' + e)
      }
    }
    console.log('[icraft-loot] ' + done + ' marquee enchanted-book modifiers registered (10% each, tier-scaled levels)')
  })
})()
