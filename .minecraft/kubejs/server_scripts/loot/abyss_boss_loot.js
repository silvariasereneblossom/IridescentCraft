// =============================================================================
// IridescentCraft — Abyss Boss Drop Gating & Custom Ring Loot
// File: kubejs/server_scripts/loot/abyss_boss_loot.js
//
// Makes the boss-drop-only Unorithe armor set obtainable exclusively through
// boss kills. Custom rings drop from Abyss structure chests and specific boss
// kills.
//
// [2026-10-10 ID fix] This file originally also wired Knight / Ragnarok /
// Dragon / Death armor and used `theabyss:<set>_<slot>` ids. None of those
// resolve in the installed The Abyss (TATOS 1.0.5_beta): real armor ids are
// `theabyss:<set>_armor_<slot>` and the only sets registered are aberythe,
// bone, fusion, garnite, glacerythe, ignisithe, incorythe, phantom, unorithe.
// So every armor entry here was a silent no-op (LootEntry of an unknown id =
// empty stack). Unorithe is remapped 1:1; the Knight / Ragnarok / Dragon /
// Death entries are removed because no such armor items exist (Knight exists
// only as tools/ingot/shard). The recipe side is recipes/recipe_audit.js K.5.
//
// Ring drop locations:
//   Shadows, Phantom, Embers, Frost — Abyss structure chests (15% each)
//   Knight — Knight boss drop (25%)
//   Void Sight — Deep Abyss structure chests (10%)
//   Dark Pact — Nightblade boss drop (20%)
//   Unorithe — Final Abyss boss drop (15%)
//
// Armor drop locations:
//   Unorithe set — Higher-tier Abyss bosses (soul_guard 15%/piece, guard 12%/piece)
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: CUSTOM RING DROPS — ABYSS STRUCTURE CHESTS
  // =========================================================================
  // Rings of Shadows, Phantom, Embers, and Frost drop from general
  // Abyss structure chests at 15% each.
  //
  // NOTE (2026-10-10): neither modifier in this section matches any table, so
  // these five rings currently have NO source. (1) The installed The Abyss
  // (TATOS 1.0.5_beta) ships entity loot tables only — there is no
  // theabyss:chests/… table. (2) Even if there were, LootJS table regexes are
  // full-match, so both patterns would need a trailing .* . Left as written:
  // which real tables its structure chests roll is unknown, so where the
  // rings should come from is an open question.

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
  global.icraftEntityMod(event, 'theabyss:ice_knight')
    .addLoot(LootEntry.of('kubejs:ring_of_the_knight').when(c => c.randomChance(0.25)))

  // Ring of Dark Pact — drops from nightblade/shadow-type boss (20%)
  // Uses soul_guard as the nightblade-type boss
  global.icraftEntityMod(event, 'theabyss:soul_guard')
    .addLoot(LootEntry.of('kubejs:ring_of_dark_pact').when(c => c.randomChance(0.20)))

  // Ring of Unorithe — drops from final/hardest Abyss boss (15%)
  global.icraftEntityMod(event, 'theabyss:guard')
    .addLoot(LootEntry.of('kubejs:ring_of_unorithe').when(c => c.randomChance(0.15)))


  // =========================================================================
  // SECTION 3: KNIGHT ARMOR SET — REMOVED (no such items)
  // =========================================================================
  // Was: ice_knight -> theabyss:knight_{helmet,chestplate,leggings,boots} at
  // 20% each. The Abyss registers no Knight armor at all (only knight_sword /
  // _axe / _pick_axe / _shovel / _hoe / _ingot / _shard), so there is nothing
  // to remap to. The whole modifier is dropped rather than left empty: a
  // LootJS modifier with zero actions throws at registration and aborts every
  // modifier registered after it.


  // =========================================================================
  // SECTION 4: UNORITHE ARMOR SET — Higher-tier Abyss bosses
  // =========================================================================

  global.icraftEntityMod(event, 'theabyss:soul_guard')
    .addLoot(LootEntry.of('theabyss:unorithe_armor_helmet').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_chestplate').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_leggings').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_boots').when(c => c.randomChance(0.15)))

  global.icraftEntityMod(event, 'theabyss:guard')
    .addLoot(LootEntry.of('theabyss:unorithe_armor_helmet').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_chestplate').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_leggings').when(c => c.randomChance(0.12)))
    .addLoot(LootEntry.of('theabyss:unorithe_armor_boots').when(c => c.randomChance(0.12)))


  // =========================================================================
  // SECTION 5: RAGNAROK / DRAGON / DEATH ARMOR — REMOVED (no such items)
  // =========================================================================
  // Was: guard -> ragnarok_* 5%, dragon_* 4%, death_* 3%; soul_guard ->
  // death_* 3% (per piece). None of these sets is registered by the installed
  // The Abyss, so all 16 entries (4 modifiers) are dropped.


  console.log('[IridescentCraft] abyss_boss_loot.js loaded — Abyss boss drop gating active')
})
