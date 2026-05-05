// =============================================================================
// Magic recipes — Iron's Spellbooks + Ars Nouveau craft access overrides
// =============================================================================
// Goal: bring early-game magic crafting access into T1. Vanilla ISS Scroll
// Forge requires Crying Obsidian (Nether-tier). Players need scroll-craft
// access on Day 1-2 to participate in the village-chest scroll economy.
// =============================================================================

ServerEvents.recipes(event => {

  // -----------------------------------------------------------------
  // ISS Scroll Forge — Crying Obsidian -> Gold Block
  // -----------------------------------------------------------------
  // Vanilla pattern (jar): DDD / _O_ / OOO
  //   D = polished_deepslate
  //   O = crying_obsidian (Nether raid drop)
  //
  // New pattern: same shape, gold_block in O slot. 4x gold_block + 3x
  // polished_deepslate is achievable Day 1-2 of normal play.
  event.remove({ output: 'irons_spellbooks:scroll_forge' })
  event.shaped('irons_spellbooks:scroll_forge', [
    'DDD',
    ' G ',
    'GGG'
  ], {
    D: 'minecraft:polished_deepslate',
    G: 'minecraft:gold_block'
  }).id('icraft:scroll_forge_t1')

})
