// =============================================================================
// IRIDESCENT CODEX — EXPLORATION LANE: WORLD DROPS (chest/barrel token seeding)
// File: kubejs/server_scripts/loot/codex_exploration_drops.js
// REQUIRES: LootJS (already a pack dependency — see loot/lootjs_overhaul.js)
//
// Implements the WORLD-DROP half of §3 (Route B — Exploration) of
// IridescentCraft-internal/design/progression-framework.md:
//
//   "Tokens also found in chests/barrels and occasionally dropped by enemies
//    — higher density in structures + dimensions."
//
// Injects the NEW Codex accumulation tokens (icraft:progression_token_t1/_t2/
// _t3 — minted in startup_scripts/codex_progression_tokens.js, spent at the
// Codex via server_scripts/gates/codex_progression_engine.js) into chest-type
// loot, tier-gated by DIMENSION so each tier's tokens drop where that tier is
// played. Higher per-chest density (rate + count) in non-overworld progression
// dimensions; Overworld is lower density + restricted to genuine
// dungeon/structure tables (no free tokens in village/settlement chests).
//
//   Tier → token item: t1 (Overworld) / t2 (T2 dims) / t3 (T3 + T4 dims).
//   (No progression_token_t4 — T4 is terminal; T4 dims seed t3, the highest
//    accumulation token. See report.)
//
// LootJS NOTE: barrels placed by structures roll the same `minecraft:chests/...`
// (or mod) loot tables as chests, so LootType.CHEST modifiers cover structure
// barrels too. There is no separate LootType.BARREL — a naturally-placed empty
// barrel has no loot table and is correctly untouched.
//
// SUPERSEDES: the legacy kubejs:tN_token_fragment chest/boss seeding (the old
// auto-consume-1000 fragment system) was RETIRED — its seeding was removed from
// loot_overhaul.js + lootjs_overhaul.js (2026-06-01). This file's
// icraft:progression_token_tN accumulation token is now the only chest/barrel
// progression-currency seeding.
//
// RELOAD-SAFETY: LootJS.modifiers(...) is the standard reload-safe loot hook
// used throughout loot/ — reapplied on every /reload, no Forge bus, no item
// creation.
// =============================================================================

LootJS.modifiers(icraft.guard('loot/codex_exploration_drops', 'LootJS.modifiers', event => {

  // Token item per tier (T4 dims fold to the t3 token).
  // RHINO-SAFETY: var (not const) — closure-local in a LootJS.modifiers callback.
  var TOK_T1 = 'icraft:progression_token_t1'
  var TOK_T2 = 'icraft:progression_token_t2'
  var TOK_T3 = 'icraft:progression_token_t3'

  // ===========================================================================
  // T1 — OVERWORLD — dungeon/structure chests ONLY (not villages/settlements).
  // Same curated dungeon+structure pool the pack already uses for its rare
  // Overworld finds (compass_of_return / mana_ring in lootjs_overhaul.js), so
  // tokens track "I explored a dungeon", not "I opened a village barrel".
  // Lower density: ~25% for a small 1-3 stack.
  // ===========================================================================
  icraft.section('loot/codex_exploration_drops/t1-overworld-dungeon-structure-chests-only', function () {
  event
    .addLootTableModifier(
      'minecraft:chests/simple_dungeon',
      'minecraft:chests/abandoned_mineshaft',
      'minecraft:chests/desert_pyramid',
      'minecraft:chests/jungle_temple',
      'minecraft:chests/stronghold_corridor',
      'minecraft:chests/stronghold_crossing',
      'minecraft:chests/stronghold_library',
      'minecraft:chests/buried_treasure',
      'minecraft:chests/underwater_ruin_big',
      'minecraft:chests/underwater_ruin_small',
      'minecraft:chests/pillager_outpost',
      'ctov:pillager_outpost/halloween/tower',   // alias table -> pillager_outpost (dev/loot_audit/alias_tables.json)
      'minecraft:chests/woodland_mansion',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chest.*/,   // [2026-10-10] was .*chests.* — Explorify's tables are explorify:chest/… (matched nothing)
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/,
      /keebsz:(?:.*\/)?floor.*/,   // biome folder optional: the keebsz:floorNandM alias tables
      /betterdeserttemples:.*/,
      /betterdungeons:.*/,
      /betterstrongholds:.*/
      // (yungsapi and bettermineshafts ship no loot table; their patterns were removed 2026-10-11)
    )
    .addLoot(
      LootEntry.of(TOK_T1).limitCount([1, 3]).when(c => c.randomChance(0.25))
    )
  })

  // ===========================================================================
  // T2 — TWILIGHT FOREST / BLUE SKIES — every chest in the dimension.
  // Higher density: ~50% for a 2-4 stack (you came to the dimension to progress).
  // [2026-10-16] 45% -> 50% (operator ruling, Aether scope R6 "Token top-up"):
  // the Aether left this rule, and took its chests and arrival bonus with it.
  // ===========================================================================
  icraft.section('loot/codex_exploration_drops/t2-twilight-forest-aether-blue-skies-every', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(icraft.dims.inTier(2, 'loot'))
    .addLoot(
      LootEntry.of(TOK_T2).limitCount([2, 4]).when(c => c.randomChance(0.50))
    )
  })

  // ===========================================================================
  // T3 — NETHER / UNDERGARDEN / DEEPER DARKER / THE ABYSS — every chest in the
  // dimension. (The Abyss moved here from the T4 rule below on 2026-10-11:
  // operator decision, the stage gate is right, the Abyss is tier 3.)
  // Higher density: ~45% for a 2-5 stack.
  // ===========================================================================
  icraft.section('loot/codex_exploration_drops/t3-nether-undergarden-deeper-darker-the', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(icraft.dims.inTier(3, 'loot'))
    .addLoot(
      LootEntry.of(TOK_T3).limitCount([2, 5]).when(c => c.randomChance(0.45))
    )
  })

  // ===========================================================================
  // T4 — END / AETHER — every chest in the dimension.
  // Highest density: ~50% for a 3-6 stack. T4 has no token of its own, so the
  // endgame dimensions seed the t3 accumulation token (terminal-tier — these
  // tokens are spendable engineering/exploration currency, not a T4 gate).
  //
  // [2026-10-10] This list used to start with 'deep_aether:the_aether'. No such
  // dimension exists: Deep Aether adds its biomes and structures to
  // aether:the_aether.
  // [2026-10-16] The Aether (Deep Aether's biomes included) is tier 4 (operator
  // ruling 2026-10-15): this rule takes the registry's tier-4 loot group.
  // ===========================================================================
  icraft.section('loot/codex_exploration_drops/t4-end-every-chest-in-the-dimension', function () {
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(icraft.dims.inTier(4, 'loot'))
    .addLoot(
      LootEntry.of(TOK_T3).limitCount([3, 6]).when(c => c.randomChance(0.50))
    )
  })

  // ===========================================================================
  // OCCASIONAL ENEMY DROPS — §3: "occasionally dropped by enemies … higher
  // density in structures + dimensions". A low flat per-kill chance on common
  // hostiles, tier-gated by dimension so the dropped token matches where you
  // are. Kept low (these are the trickle path; minibosses/bosses are the bulk —
  // see codex_exploration_kills.js). Single token, no stack.
  //
  // IMPLEMENTATION NOTE: per the iss_boss_drops.js lesson, unverified LootJS
  // 2.13.1 methods (e.g. a `.matchEntity(predicate)` filter) silently fail the
  // ENTIRE entity modifier. So we use ONLY the proven shape
  // `addEntityLootModifier('<id>').anyDimension(...).addLoot(...)` over explicit
  // per-dimension hostile-ID lists rather than a monster predicate.
  // ===========================================================================
  function seedMobDrops(mobIds, tokenId, chance, dims) {
    mobIds.forEach(function (mobId) {
      var mod = global.icraftEntityMod(event, mobId)
      if (dims && dims.length) mod = mod.anyDimension.apply(mod, dims)
      mod.addLoot(LootEntry.of(tokenId).when(c => c.randomChance(chance)))
    })
  }

  // Overworld common hostiles — very low (Overworld is the engineering tier;
  // exploration tokens here are a light bonus).
  icraft.section('loot/codex_exploration_drops/occasional-enemy-drops-3-occasionally', function () {
  seedMobDrops(
    ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider',
     'minecraft:creeper', 'minecraft:husk', 'minecraft:stray',
     'minecraft:drowned', 'minecraft:pillager', 'minecraft:vindicator'],
    TOK_T1, 0.02, ['minecraft:overworld'])

  // T2 dimensions — common hostiles found across TF / Blue Skies.
  // (Per-dimension via .anyDimension so a vanilla zombie wandering a T2 dim
  //  drops a t2, while the same zombie in the Overworld drops a t1 above.)
  // [2026-10-16] the Aether and its cockatrice / zephyr moved to the T4 list.
  seedMobDrops(
    ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider',
     'twilightforest:skeleton_druid', 'twilightforest:swarm_spider',
     'twilightforest:redcap', 'twilightforest:kobold',
     'blue_skies:venom_spider', 'blue_skies:nested_spider'],  // were spitfire/diamondback (no such entities -> pig) 2026-06-06
    TOK_T2, 0.04,
    ['twilightforest:twilight_forest',
     'blue_skies:everbright', 'blue_skies:everdawn'])

  // T3 dimensions — Nether / Undergarden / Deeper Darker / Abyss common hostiles.
  seedMobDrops(
    ['minecraft:zombified_piglin', 'minecraft:piglin', 'minecraft:blaze',
     'minecraft:wither_skeleton', 'minecraft:hoglin', 'minecraft:magma_cube',
     'undergarden:rotling', 'undergarden:rotwalker', 'undergarden:gwib',
     'deeperdarker:sculk_centipede', 'deeperdarker:sculk_leech'],
    TOK_T3, 0.04,
    ['minecraft:the_nether', 'undergarden:undergarden',
     'deeperdarker:otherside', 'theabyss:the_abyss'])

  // T4 dimensions (t3 token — terminal tier) — the End and the Aether.
  // ('deep_aether:the_aether' dropped from the dimension list 2026-10-10: not a
  //  dimension. deep_aether:venomite spawns in a Deep Aether biome of
  //  aether:the_aether (yagroot_swamp); it fires since 2026-10-16, when the
  //  Aether joined the tier-4 group. The cockatrice and the zephyr came from
  //  the T2 list the same day.)
  seedMobDrops(
    ['minecraft:enderman', 'minecraft:shulker', 'minecraft:endermite',
     'deep_aether:venomite',  // were tempest/skyhunter (no such entities -> pig) 2026-06-06
     'aether:cockatrice', 'aether:zephyr'],
    TOK_T3, 0.05,
    icraft.dims.inTier(4, 'loot'))

  console.log('[codex_exploration_drops] Codex progression tokens injected into ' +
    'chest/barrel loot (OW dungeons t1 / T2-T4 dimension chests t2-t3) + ' +
    'low-rate enemy drops by dimension tier')
  })
}))
