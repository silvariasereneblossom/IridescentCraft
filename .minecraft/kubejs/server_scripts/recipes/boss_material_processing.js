// =============================================================================
// BOSS MATERIAL PROCESSING
// =============================================================================
// Boss-dropped custom materials -> useful vanilla items.
// These are the genuinely-live processing recipes preserved from the retired
// recipes/tier_skip.js (Section 6) when the legacy tier-skip/transmutation
// system was removed in favor of the Iridescent Codex token economy.
//
// All inputs are live boss drops (see loot/loot_overhaul.js):
//   - condensed_blaze_essence  : Blaze (8% per kill)
//   - void_essence             : Warden (1-3), End Enderman (2%)
//   - nether_soul_fragment     : Wither Skeleton (10% per kill)
//
// (void_essence also has an endgame sink in endgame/mythic_forge.js — the Rift
//  Keystone recipe — so this conversion is a secondary path, not its only use.)
// =============================================================================

ServerEvents.recipes(event => {

    // Condensed Blaze Essence (blaze drop) -> Blaze Powder (3x, more efficient)
    event.shapeless('3x minecraft:blaze_powder', [
        'kubejs:condensed_blaze_essence'
    ]).id('kubejs:blaze_essence_to_powder')

    // Void Essence (Warden / End enderman drop) -> Ender Eye
    event.shaped('minecraft:ender_eye', [
        'VBV',
        'B B',
        'VBV'
    ], {
        V: 'kubejs:void_essence',
        B: 'minecraft:blaze_powder'
    }).id('kubejs:void_essence_to_eye')

    // Nether Soul Fragments (wither skeleton drop) -> Soul Sand
    event.shaped('4x minecraft:soul_sand', [
        'NN',
        'NN'
    ], {
        N: 'kubejs:nether_soul_fragment'
    }).id('kubejs:soul_fragments_to_sand')

    console.log('[IridescentCraft] Boss material processing recipes loaded')
})
