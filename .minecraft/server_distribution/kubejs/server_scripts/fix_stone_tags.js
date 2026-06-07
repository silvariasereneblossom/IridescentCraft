// =============================================================================
// STONE MINEABLE TAG RESTORE (docket #98, 2026-06-07) -- GAMEPLAY-BLOCKING FIX
// =============================================================================
// Symptom: minecraft:stone became unmineable (a pickaxe wouldn't break it /
// drop it). Root cause: SOME mod jar in the pack declares
// `minecraft:mineable/pickaxe` with `"replace": true`, wiping the vanilla
// entries (stone among them). The old fix was a Paxi datapack
// (fix_stone_tags.zip) adding stone back with replace:false -- but a datapack
// tag CANNOT out-merge a replace:true from a mod jar reliably, and the zip
// had also dropped out of config/paxi/datapack_load_order.json (Paxi needs an
// explicit load-order entry), so it stopped applying.
//
// This script is the load-order-IMMUNE replacement: KubeJS ServerEvents.tags
// runs AFTER all datapack + jar tag merging, so adding stone here is
// authoritative no matter what any mod or datapack did first. Mirrors the
// datapack's exact intent so balance is unchanged:
//   - mineable/pickaxe : stone is breakable by a pickaxe (the actual unblock)
//   - needs_stone_tool : stone requires >= stone-tier pickaxe to DROP
//     (deliberate pack gate, preserved from the datapack).
//
// Scope intentionally narrow (minecraft:stone only) to exactly match the
// datapack it replaces -- if other blocks turn up unmineable, widen the
// MINEABLE / NEEDS_STONE arrays rather than blanket-restoring the tag.
//
// The Paxi datapack is retired in the same commit (its zip removed) so two
// mechanisms don't fight; this script is the single source of truth.
// =============================================================================

ServerEvents.tags("block", event => {
  var MINEABLE = ['minecraft:stone']
  var NEEDS_STONE = ['minecraft:stone']

  MINEABLE.forEach(function (id) {
    event.add('minecraft:mineable/pickaxe', id)
  })
  NEEDS_STONE.forEach(function (id) {
    event.add('minecraft:needs_stone_tool', id)
  })

  console.log('[stone-tag-fix] restored ' + MINEABLE.length
    + ' block(s) to mineable/pickaxe (+ needs_stone_tool) post-merge')
})
