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
//
// Abyssal Celestial Artifacts (since 2026-10-11 -- see Section 6):
//   Elder, The Roka — one of the five T3 artifacts (chances below)
//   Nightblade — one of the seven T4 artifacts
//   all three — an enchanted book, levels 20-30
// =============================================================================

// ── Abyssal pool rates (Section 6) ── PROVISIONAL ──────────────────────────
// Operator ruling 2026-10-11 (decision sheet rows E1-E6): shipped before the
// spawn check, so these are the numbers to retune once it has been run.
// The Elder is a common natural spawn (Blue Mountain), The Roka a rare one
// (Blue Jungle), Nightblade an altar summon that costs a Roka and an Elder
// kill. Rule from the proposal: HALVE ABYSSAL_ELDER_CHANCE if a 20-minute
// spawn check in Blue Mountain shows more than about 5 Elders per hour.
// (Unique names: every server script shares one top-level scope.)
var ABYSSAL_ELDER_CHANCE      = 0.20   // Elder: one of the T3 five
var ABYSSAL_ROKA_CHANCE       = 0.50   // The Roka: one of the T3 five
var ABYSSAL_NIGHTBLADE_CHANCE = 1.00   // Nightblade: one of the T4 seven
var ABYSSAL_BOOK_CHANCE       = 0.10   // each of the three: enchanted book, levels 20-30

LootJS.modifiers(icraft.guard('loot/abyss_boss_loot', 'LootJS.modifiers', event => {

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
  icraft.section('loot/abyss_boss_loot/section-1-the-five-structure-chest-rings', function () {
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
  })


  // =========================================================================
  // SECTION 2: CUSTOM RING DROPS — BOSS KILLS
  // =========================================================================

  // Ring of the Knight — drops from ice_knight boss (25%)
  icraft.section('loot/abyss_boss_loot/section-2-custom-ring-drops-boss-kills', function () {
  global.icraftEntityMod(event, 'theabyss:ice_knight')
    .addLoot(LootEntry.of('kubejs:ring_of_the_knight').when(c => c.randomChance(0.25)))

  // Ring of Dark Pact — drops from nightblade/shadow-type boss (20%)
  // Uses soul_guard as the nightblade-type boss
  global.icraftEntityMod(event, 'theabyss:soul_guard')
    .addLoot(LootEntry.of('kubejs:ring_of_dark_pact').when(c => c.randomChance(0.20)))

  // Ring of Unorithe — drops from final/hardest Abyss boss (15%)
  global.icraftEntityMod(event, 'theabyss:guard')
    .addLoot(LootEntry.of('kubejs:ring_of_unorithe').when(c => c.randomChance(0.15)))
  })


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

  icraft.section('loot/abyss_boss_loot/section-4-unorithe-armor-set-higher-tier', function () {
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
  })


  // =========================================================================
  // SECTION 5: RAGNAROK / DRAGON / DEATH ARMOR — REMOVED (no such items)
  // =========================================================================
  // Was: guard -> ragnarok_* 5%, dragon_* 4%, death_* 3%; soul_guard ->
  // death_* 3% (per piece). None of these sets is registered by the installed
  // The Abyss, so all 16 entries (4 modifiers) are dropped.


  // =========================================================================
  // SECTION 6: ABYSSAL CELESTIAL ARTIFACTS — the three real Abyss bosses
  // =========================================================================
  // These were the T4_ABYSSAL themed pool of lootjs_overhaul.js, meant for
  // Abyss structure chests (11.2% per chest + a 10% book). No Abyss chest
  // rolls a loot table (Section 1), so the pool never dropped anywhere in the
  // Abyss. Operator ruling 2026-10-11: the bosses carry it, split by tier.
  //   - Elder and The Roka (natural spawns): one of the five artifacts the
  //     pack keeps in its T3 dimension pool (artifactT3Pool).
  //   - Nightblade (the capstone: its summon costs a Roka Horn, an Elder Eye,
  //     a Crystal Hand and 8 Soul Hearts): one of the seven it keeps in the
  //     T4 pool. Shadow Glaive is left off on purpose (it has four other
  //     sources); Space Dissector is on RELIC_DENY and was never in the pool.
  // Not on Soul Guard / Guard (40-HP mobs that spawn in groups) and not on the
  // Ice Knight (it spawns in theabyss:frost_world, not in the Abyss).
  //
  // Shape: <modifier>.randomChance(CHANCE).addWeightedLoot(pool) — one gated
  // roll that picks exactly one artifact (equal weights). A LootJS condition
  // gates only what follows it in the same modifier, so the pool and the book
  // are separate modifiers, and both are separate from the ring modifiers in
  // Section 1: a kill can drop a ring, an artifact and a book.
  // The chest pools in lootjs_overhaul.js are unchanged.

  icraft.section('loot/abyss_boss_loot/section-6-abyssal-celestial-artifacts-the', function () {
  var abyssalT3Five = [
    'celestial_artifacts:demon_curse',
    'celestial_artifacts:twisted_scabbard',
    'celestial_artifacts:catastrophe_scroll',
    'celestial_artifacts:abyss_will_badge',
    'celestial_artifacts:lock_of_abyss'
  ]
  var abyssalT4Seven = [
    'celestial_artifacts:abyss_core',
    'celestial_artifacts:demon_heart',
    'celestial_artifacts:twisted_heart',
    'celestial_artifacts:twisted_scroll',
    'celestial_artifacts:heart_of_revenge',
    'celestial_artifacts:chaotic_etching',
    'celestial_artifacts:nihility_etching'
  ]
  var abyssalPool = function (ids) {
    return ids.map(function (id) { return LootEntry.of(id).withWeight(1) })
  }

  global.icraftEntityMod(event, 'theabyss:elder')
    .randomChance(ABYSSAL_ELDER_CHANCE)
    .addWeightedLoot(abyssalPool(abyssalT3Five))
    // liveness (here and on the two rules below): the chance passed and one artifact
    // was rolled (a LootJS rule has no script code at roll time otherwise; the action
    // adds and removes nothing)
    .apply(function (ctx) { icraft.live.fired('abyssal-artifact') })

  global.icraftEntityMod(event, 'theabyss:the_roka')
    .randomChance(ABYSSAL_ROKA_CHANCE)
    .addWeightedLoot(abyssalPool(abyssalT3Five))
    .apply(function (ctx) { icraft.live.fired('abyssal-artifact') })

  global.icraftEntityMod(event, 'theabyss:nightblade_boss')
    .randomChance(ABYSSAL_NIGHTBLADE_CHANCE)
    .addWeightedLoot(abyssalPool(abyssalT4Seven))
    .apply(function (ctx) { icraft.live.fired('abyssal-artifact') })

  // The marquee's enchanted book (levels 20-30), now per kill. The entry is a
  // plain minecraft:book: enchantWithLevels only stores enchantments on that
  // (see loot/zz_pack_enchanted_books.js). No strip in the pack removes
  // enchanted books from entity loot, so it can be registered from here.
  var AbyssalUniform = Java.loadClass('net.minecraft.world.level.storage.loot.providers.number.UniformGenerator')
  ;['theabyss:elder', 'theabyss:the_roka', 'theabyss:nightblade_boss'].forEach(function (boss) {
    global.icraftEntityMod(event, boss)
      .addLoot(LootEntry.of('minecraft:book')
        .enchantWithLevels(AbyssalUniform.between(20, 30), true)
        .when(c => c.randomChance(ABYSSAL_BOOK_CHANCE)))
  })


  console.log('[IridescentCraft] abyss_boss_loot.js loaded — Abyss boss drop gating active'
    + ' (Abyssal artifacts: Elder ' + ABYSSAL_ELDER_CHANCE + ', Roka ' + ABYSSAL_ROKA_CHANCE
    + ', Nightblade ' + ABYSSAL_NIGHTBLADE_CHANCE + ', book ' + ABYSSAL_BOOK_CHANCE + ' — provisional)')
  })
}))
