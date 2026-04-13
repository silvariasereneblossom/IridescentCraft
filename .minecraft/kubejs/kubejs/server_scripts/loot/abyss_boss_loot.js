// =============================================================================
// IridescentCraft — Abyss Boss Drop Gating & Custom Ring Loot
// File: kubejs/server_scripts/loot/abyss_boss_loot.js
//
// Makes boss-drop-only armor sets (Knight, Unorithe, Ragnarok, Dragon, Death)
// obtainable exclusively through boss kills. Custom rings drop from Abyss
// structure chests and specific boss kills.
//
// Ring drop locations:
//   Shadows, Phantom, Embers, Frost — Abyss structure chests (15% each)
//   Knight — Knight boss drop (25%)
//   Void Sight — Deep Abyss structure chests (10%)
//   Dark Pact — Nightblade boss drop (20%)
//   Unorithe — Final Abyss boss drop (15%)
//
// Armor drop locations:
//   Knight set — Knight boss / elite mobs
//   Unorithe set — Higher-tier Abyss bosses
//   Ragnarok/Dragon/Death sets — Hardest Abyss bosses (very rare)
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: CUSTOM RING DROPS — ABYSS STRUCTURE CHESTS
  // =========================================================================
  // Rings of Shadows, Phantom, Embers, and Frost drop from general
  // Abyss structure chests at 15% each.

  event
    .addLootTableModifier(/theabyss:chests\//)
    .addLoot(LootEntry.of('kubejs:ring_of_shadows').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('kubejs:ring_of_the_phantom').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('kubejs:ring_of_embers').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('kubejs:ring_of_frost').when(c => c.randomChance(0.15)))

  // Ring of Void Sight — Deep Abyss structure chests (10%)
  // Matches deeper/rarer structure chest tables
  event
    .addLootTableModifier(/theabyss:chests\/(deep|dungeon|temple|boss)/)
    .addLoot(LootEntry.of('kubejs:ring_of_void_sight').when(c => c.randomChance(0.10)))


  // =========================================================================
  // SECTION 2: CUSTOM RING DROPS — BOSS KILLS
  // =========================================================================

  // Ring of the Knight — drops from ice_knight boss (25%)
  event
    .addEntityLootModifier('theabyss:ice_knight')
    .addLoot(LootEntry.of('kubejs:ring_of_the_knight').when(c => c.randomChance(0.25)))

  // Ring of Dark Pact — drops from nightblade/shadow-type boss (20%)
  // Uses soul_guard as the nightblade-type boss
  event
    .addEntityLootModifier('theabyss:soul_guard')
    .addLoot(LootEntry.of('kubejs:ring_of_dark_pact').when(c => c.randomChance(0.20)))

  // Ring of Unorithe — drops from final/hardest Abyss boss (15%)
  event
    .addEntityLootModifier('theabyss:guard')
    .addLoot(LootEntry.of('kubejs:ring_of_unorithe').when(c => c.randomChance(0.15)))


  // =========================================================================
  // SECTION 3: KNIGHT ARMOR SET — Boss/elite mob drops
  // =========================================================================

  event
    .addEntityLootModifier('theabyss:ice_knight')
    .addLoot(LootEntry.of('theabyss:knight_helmet').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('theabyss:knight_chestplate').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('theabyss:knight_leggings').when(c => c.randomChance(0.20)))
    .addLoot(LootEntry.of('theabyss:knight_boots').when(c => c.randomChance(0.20)))


  // =========================================================================
  // SECTION 4: UNORITHE ARMOR SET — Higher-tier Abyss bosses
  // =========================================================================

  event
    .addEntityLootModifier('theabyss:soul_guard')
    .addLoot(LootEntry.of('theabyss:unorithe_helmet').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_chestplate').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_leggings').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_boots').when(c => c.randomChance(0.15)))

  event
    .addEntityLootModifier('theabyss:guard')
    .addLoot(LootEntry.of('theabyss:unorithe_helmet').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_chestplate').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_leggings').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_boots').when(c => c.randomChance(0.12)))


  // =========================================================================
  // SECTION 5: RAGNAROK / DRAGON / DEATH ARMOR — Very rare from hardest bosses
  // =========================================================================
  // These are endgame sets — extremely rare drops from the toughest Abyss bosses.

  // Ragnarok set — from guard (final boss), 5% per piece
  event
    .addEntityLootModifier('theabyss:guard')
    .addLoot(LootEntry.of('theabyss:ragnarok_helmet').when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('theabyss:ragnarok_chestplate').when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('theabyss:ragnarok_leggings').when(c => c.randomChance(0.05)))
    .addLoot(LootEntry.of('theabyss:ragnarok_boots').when(c => c.randomChance(0.05)))

  // Dragon set — from guard, 4% per piece
  event
    .addEntityLootModifier('theabyss:guard')
    .addLoot(LootEntry.of('theabyss:dragon_helmet').when(c => c.randomChance(0.04)))
    .addLoot(LootEntry.of('theabyss:dragon_chestplate').when(c => c.randomChance(0.04)))
    .addLoot(LootEntry.of('theabyss:dragon_leggings').when(c => c.randomChance(0.04)))
    .addLoot(LootEntry.of('theabyss:dragon_boots').when(c => c.randomChance(0.04)))

  // Death set — from guard and soul_guard, 3% per piece (rarest)
  event
    .addEntityLootModifier('theabyss:guard')
    .addLoot(LootEntry.of('theabyss:death_helmet').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_chestplate').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_leggings').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_boots').when(c => c.randomChance(0.03)))

  event
    .addEntityLootModifier('theabyss:soul_guard')
    .addLoot(LootEntry.of('theabyss:death_helmet').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_chestplate').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_leggings').when(c => c.randomChance(0.03)))
    .addLoot(LootEntry.of('theabyss:death_boots').when(c => c.randomChance(0.03)))


  console.log('[IridescentCraft] abyss_boss_loot.js loaded — Abyss boss drop gating active')
})
