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
// runs AFTER all datapack + jar tag merging, so it is authoritative no matter
// what any mod or datapack did first.
//
// CORRECT vanilla behavior (the target): stone is in mineable/pickaxe and in
// NO needs_*_tool tag, so a WOODEN pickaxe breaks it and drops cobblestone.
// The retired datapack (and the first version of this script) wrongly ALSO
// added stone to needs_stone_tool, gating it to a stone-tier pickaxe -- which
// soft-locks progression (you need cobble to craft a stone pickaxe, but a
// stone pickaxe to get cobble). That entry was a misconception, not intent.
//
// So we both ADD stone back to mineable/pickaxe (the unblock) AND REMOVE it
// from every harvest-gate tier (defensive: whichever mod broke it may have
// shoved stone into a needs_*_tool tag too). Result: wood-or-better mines
// stone -> cobblestone, exactly like vanilla, immune to load order.
//
// Scope narrow (minecraft:stone only) to match the original problem report;
// widen MINEABLE if other blocks turn up unmineable.
//
// The Paxi datapack is retired (its zip removed) so two mechanisms don't fight.
// =============================================================================

ServerEvents.tags("block", event => {
  var MINEABLE = ['minecraft:stone']
  var NEEDS_GATES = ['minecraft:needs_stone_tool',
                     'minecraft:needs_iron_tool',
                     'minecraft:needs_diamond_tool']

  MINEABLE.forEach(function (id) {
    event.add('minecraft:mineable/pickaxe', id)
    // Strip from every harvest gate -> wood pickaxe drops cobblestone (vanilla).
    NEEDS_GATES.forEach(function (gate) { event.remove(gate, id) })
  })

  console.log('[stone-tag-fix] ' + MINEABLE.length
    + ' block(s) -> mineable/pickaxe, cleared from needs_*_tool (wood-mineable, post-merge)')
})
