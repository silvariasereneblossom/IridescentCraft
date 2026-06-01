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
// COEXISTENCE: the legacy kubejs:tN_token_fragment chest/boss seeding in
// loot_overhaul.js + lootjs_overhaul.js is a DIFFERENT currency (the old
// auto-consume-1000 fragment system) and is left untouched — no item-ID
// collision. This file adds the new accumulation token in parallel.
//
// RELOAD-SAFETY: LootJS.modifiers(...) is the standard reload-safe loot hook
// used throughout loot/ — reapplied on every /reload, no Forge bus, no item
// creation.
// =============================================================================

LootJS.modifiers(event => {

  // Token item per tier (T4 dims fold to the t3 token).
  const TOK_T1 = 'icraft:progression_token_t1'
  const TOK_T2 = 'icraft:progression_token_t2'
  const TOK_T3 = 'icraft:progression_token_t3'

  // ===========================================================================
  // T1 — OVERWORLD — dungeon/structure chests ONLY (not villages/settlements).
  // Same curated dungeon+structure pool the pack already uses for its rare
  // Overworld finds (compass_of_return / mana_ring in lootjs_overhaul.js), so
  // tokens track "I explored a dungeon", not "I opened a village barrel".
  // Lower density: ~25% for a small 1-3 stack.
  // ===========================================================================
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
      'minecraft:chests/woodland_mansion',
      /dungeoncrawl:.*chests.*/,
      /explorify:.*chests.*/,
      /^structory:.+/,
      /dungeons_plus:.*/,
      /dungeons_arise:.*/,
      /valhelsia_structures:.*chests.*/,
      /repurposed_structures:.*chests.*/,
      /keebsz:.*\/floor.*/,
      /betterdeserttemples:.*/,
      /yungsapi:.*/,
      /betterdungeons:.*/,
      /betterstrongholds:.*/,
      /bettermineshafts:.*/
    )
    .addLoot(
      LootEntry.of(TOK_T1).limitCount([1, 3]).when(c => c.randomChance(0.25))
    )

  // ===========================================================================
  // T2 — TWILIGHT FOREST / AETHER / BLUE SKIES — every chest in the dimension.
  // Higher density: ~45% for a 2-4 stack (you came to the dimension to progress).
  // ===========================================================================
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(
      'twilightforest:twilight_forest',
      'aether:the_aether',
      'blue_skies:everbright',
      'blue_skies:everdawn'
    )
    .addLoot(
      LootEntry.of(TOK_T2).limitCount([2, 4]).when(c => c.randomChance(0.45))
    )

  // ===========================================================================
  // T3 — NETHER / UNDERGARDEN / DEEPER DARKER — every chest in the dimension.
  // Higher density: ~45% for a 2-5 stack.
  // ===========================================================================
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(
      'minecraft:the_nether',
      'undergarden:undergarden',
      'deeperdarker:otherside'
    )
    .addLoot(
      LootEntry.of(TOK_T3).limitCount([2, 5]).when(c => c.randomChance(0.45))
    )

  // ===========================================================================
  // T4 — DEEP AETHER / END / THE ABYSS — every chest in the dimension.
  // Highest density: ~50% for a 3-6 stack. T4 has no token of its own, so the
  // endgame dimensions seed the t3 accumulation token (terminal-tier — these
  // tokens are spendable engineering/exploration currency, not a T4 gate).
  // ===========================================================================
  event
    .addLootTypeModifier(LootType.CHEST)
    .anyDimension(
      'deep_aether:the_aether',
      'minecraft:the_end',
      'theabyss:the_abyss'
    )
    .addLoot(
      LootEntry.of(TOK_T3).limitCount([3, 6]).when(c => c.randomChance(0.50))
    )

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
      var mod = event.addEntityLootModifier(mobId)
      if (dims && dims.length) mod = mod.anyDimension.apply(mod, dims)
      mod.addLoot(LootEntry.of(tokenId).when(c => c.randomChance(chance)))
    })
  }

  // Overworld common hostiles — very low (Overworld is the engineering tier;
  // exploration tokens here are a light bonus).
  seedMobDrops(
    ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider',
     'minecraft:creeper', 'minecraft:husk', 'minecraft:stray',
     'minecraft:drowned', 'minecraft:pillager', 'minecraft:vindicator'],
    TOK_T1, 0.02, ['minecraft:overworld'])

  // T2 dimensions — common hostiles found across TF / Aether / Blue Skies.
  // (Per-dimension via .anyDimension so a vanilla zombie wandering a T2 dim
  //  drops a t2, while the same zombie in the Overworld drops a t1 above.)
  seedMobDrops(
    ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider',
     'twilightforest:skeleton_druid', 'twilightforest:swarm_spider',
     'twilightforest:redcap', 'twilightforest:kobold',
     'aether:cockatrice', 'aether:zephyr',
     'blue_skies:spitfire', 'blue_skies:diamondback'],
    TOK_T2, 0.04,
    ['twilightforest:twilight_forest', 'aether:the_aether',
     'blue_skies:everbright', 'blue_skies:everdawn'])

  // T3 dimensions — Nether / Undergarden / Deeper Darker common hostiles.
  seedMobDrops(
    ['minecraft:zombified_piglin', 'minecraft:piglin', 'minecraft:blaze',
     'minecraft:wither_skeleton', 'minecraft:hoglin', 'minecraft:magma_cube',
     'undergarden:rotling', 'undergarden:rotwalker', 'undergarden:gwib',
     'deeperdarker:sculk_centipede', 'deeperdarker:sculk_leech'],
    TOK_T3, 0.04,
    ['minecraft:the_nether', 'undergarden:undergarden',
     'deeperdarker:otherside'])

  // T4 dimensions (t3 token — terminal tier) — End / Deep Aether / Abyss.
  seedMobDrops(
    ['minecraft:enderman', 'minecraft:shulker', 'minecraft:endermite',
     'deep_aether:tempest', 'deep_aether:skyhunter'],
    TOK_T3, 0.05,
    ['deep_aether:the_aether', 'minecraft:the_end', 'theabyss:the_abyss'])

  console.log('[codex_exploration_drops] Codex progression tokens injected into ' +
    'chest/barrel loot (OW dungeons t1 / T2-T4 dimension chests t2-t3) + ' +
    'low-rate enemy drops by dimension tier')
})
