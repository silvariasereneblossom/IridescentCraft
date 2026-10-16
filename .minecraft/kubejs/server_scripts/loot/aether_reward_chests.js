// @file kubejs/server_scripts/loot/aether_reward_chests.js
// @events LootJS.modifiers
// =============================================================================
// The Silver and Gold dungeon reward chests of the Aether pay tier-4 loot: the vanilla gear under the tier-4
// floor is taken out and every chest holds stratus ingots, the Aether's netherite-grade metal.
// =============================================================================
// The Aether is a tier-4 dimension since 2026-10-16 (scope "the Aether to tier 4", section 8, chip C; option
// C1, implemented on recommendation, for review). Netherite is the tier-4 floor.
//   Silver reward (the Valkyrie Queen's): minecraft:iron_sword and minecraft:golden_sword out; +1 stratus ingot.
//   Gold reward (the Sun Spirit's): the chainmail helmet, chestplate, leggings, boots and aether:chainmail_gloves
//   out; +2 stratus ingots.
// Unchanged on purpose: the Aether's own gear (the vanilla-style sets are its flavour), Deep Aether's loot
// modifiers (skyjade, the stratus smithing template, its own stratus pick: their `chanceToSpawn` is a chance to
// SKIP) and Aether Treasure Reforging's upgrade templates. The tier-4 group rules (tokens, scrolls, books, the
// marquee) come from the dimension's tier, not from here.
// The ids are the root tables a reward chest rolls (aether:chests/dungeon/<x>/<x>_dungeon_reward): Forge runs
// loot modifiers for the root table only, and the stripped items are entries of these roots.
;(function () {
  var SILVER = 'aether:chests/dungeon/silver/silver_dungeon_reward'
  var GOLD = 'aether:chests/dungeon/gold/gold_dungeon_reward'
  var STRATUS = 'deep_aether:stratus_ingot'

  LootJS.modifiers(icraft.guard('loot/aether_reward_chests', 'LootJS.modifiers', function (event) {
    icraft.section('loot/aether_reward_chests/silver', function () {
      event.addLootTableModifier(SILVER)
        .removeLoot('minecraft:iron_sword')
        .removeLoot('minecraft:golden_sword')
        .addLoot(LootEntry.of(STRATUS, 1))
    })
    icraft.section('loot/aether_reward_chests/gold', function () {
      event.addLootTableModifier(GOLD)
        .removeLoot('minecraft:chainmail_helmet')
        .removeLoot('minecraft:chainmail_chestplate')
        .removeLoot('minecraft:chainmail_leggings')
        .removeLoot('minecraft:chainmail_boots')
        .removeLoot('aether:chainmail_gloves')
        .addLoot(LootEntry.of(STRATUS, 2))
    })
  }))
})()
