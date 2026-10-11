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
// Ring drop locations (all boss drops since 2026-10-11 -- see Section 1):
//   Shadows, Phantom — Nightblade (15% each)
//   Embers — The Roka (15%)
//   Frost — Ice Knight (15%)
//   Void Sight — Elder (10%)
//   Knight — Ice Knight (25%)
//   Dark Pact — Soul Guard (20%)
//   Unorithe — Guard (15%)
//
// Armor drop locations:
//   Unorithe set — Higher-tier Abyss bosses (soul_guard 15%/piece, guard 12%/piece)
// =============================================================================

LootJS.modifiers(event => {

  // =========================================================================
  // SECTION 1: THE FIVE "STRUCTURE CHEST" RINGS — NOW ABYSS BOSS DROPS
  // =========================================================================
  // Designed as: Shadows / Phantom / Embers / Frost from Abyss structure chests
  // (15% each), Void Sight from "deep" Abyss chests (10%). They never dropped:
  // the installed The Abyss (TATOS 1.0.5_beta) has NO chest that rolls a loot
  // table. Read from the jar's structure files (2026-10-11):
  //   - the only generated structure with chests is the Abylager hut, and its
  //     chests hold fixed items (no LootTable tag);
  //   - `theabyss:chests/underground_dungeon` / `..._room` are named by two
  //     structure pieces (cross, room_2) that nothing generates, and the jar
  //     ships no such table anyway (entity tables only).
  // So no table regex can ever match. Operator decision 2026-10-11: drop them
  // from Abyss bosses that do not already carry a ring, at the designed rates.
  // Nightblade, The Roka and Elder are the three BOSS_HP bosses
  // (scaling/boss_hp.js); the Ice Knight keeps its Knight ring in Section 2.

  // Nightblade (shadow assassin): Shadows + Phantom
  global.icraftEntityMod(event, 'theabyss:nightblade_boss')
    .addLoot(LootEntry.of('kubejs:ring_of_shadows').when(c => c.randomChance(0.15)))
    .addLoot(LootEntry.of('kubejs:ring_of_the_phantom').when(c => c.randomChance(0.15)))

  // The Roka: Embers
  global.icraftEntityMod(event, 'theabyss:the_roka')
    .addLoot(LootEntry.of('kubejs:ring_of_embers').when(c => c.randomChance(0.15)))

  // Ice Knight: Frost (its Knight ring is in Section 2)
  global.icraftEntityMod(event, 'theabyss:ice_knight')
    .addLoot(LootEntry.of('kubejs:ring_of_frost').when(c => c.randomChance(0.15)))

  // Elder (the deepest of the three): Void Sight
  global.icraftEntityMod(event, 'theabyss:elder')
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
