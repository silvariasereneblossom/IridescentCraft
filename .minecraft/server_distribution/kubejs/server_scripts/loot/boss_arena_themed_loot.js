// =============================================================================
// BOSS-ARENA THEMED LOOT — icraft #58 Piece B §3 (banned-item scrub)
// =============================================================================
// SCOPE: banned-item scrub on the OVERWORLD ISS/cataclysm arena chests that ship
// diamonds / gunpowder / diamond-gear (policy: no diamond/gear reward in overworld
// structures; Nether/own-dim tables exempt).
//
// The §3 THEMED ENRICHMENT (Iron's Spellbooks element-themed ink/rune/orb/essence/
// spellbook economy + the cataclysm frosted_prison frost backfill) was MOVED to
// `zz_iss_arena_enrichment.js` on 2026-06-14: those adds are irons_spellbooks:-
// namespaced and were being silently EATEN by lootjs_overhaul.js's LootType.CHEST
// ISS strip. (LootJS `removeLoot` is a one-shot `removeIf` in script-load order —
// CFR-decompiled 2.13.1 — and `boss_arena_*.js` loads alphabetically BEFORE
// `lootjs_overhaul.js`, so its adds were stripped.) Re-homing them to a `zz_`-
// prefixed file that loads AFTER the strip makes them survive. The diamond SCRUBS
// stay here — they're `removeLoot` on the base tables, so order vs the ISS strip is
// irrelevant for them.
// =============================================================================

LootJS.modifiers(event => {

  // RHINO-SAFETY: var (not const) — closure-local in a LootJS.modifiers callback.
  var DIAMONDS = [
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe', 'minecraft:diamond_axe',
    'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots',
    'minecraft:diamond_horse_armor',
  ]
  var scrubDiamonds = mod => {
    var m = event.addLootTableModifier(mod)
    DIAMONDS.forEach(d => m.removeLoot(d))
    return m
  }

  // ISS Catacombs (Dead King, overworld) — diamonds in coffin/crypt/wall/trough.
  scrubDiamonds(/^irons_spellbooks:chests\/catacombs\/.*/)
  // ISS Evoker Fort (Archevoker, overworld) — diamond in the root table.
  scrubDiamonds('irons_spellbooks:chests/evoker_fort')
  // ISS Pyromancer Tower (Echo of Tyros, overworld) — gunpowder in burnt_chest.
  event.addLootTableModifier('irons_spellbooks:chests/pyromancer_tower/burnt_chest')
    .removeLoot('minecraft:gunpowder')
  // Cataclysm Frosted Prison (Scylla, overworld) — heavy diamond-gear treasure.
  scrubDiamonds('cataclysm:chests/frosted_prison_treasure')

  console.log('[boss_arena_themed_loot] scrubbed overworld diamonds/gunpowder from ISS catacombs/evoker_fort/pyromancer + cataclysm frosted_prison (ISS enrichment moved to zz_iss_arena_enrichment.js)')
})
