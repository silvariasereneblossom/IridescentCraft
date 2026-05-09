// =============================================================================
// IridescentCraft - Cooking For Blockheads Recipe Overrides
// File: kubejs/server_scripts/recipes/cooking_for_blockheads_overrides.js
//
// The kitchen is a T1 fixture by design. Pack progression assumes the
// player sets one up EARLY because food requirements (Hunger Overhaul +
// Spice of Life style cadence) make eating-without-a-kitchen tedious as
// soon as you leave the spawn area. CFB's stock 2-diamond recipe for
// `crafting_book` would gate the crafting-from-kitchen QoL behind
// caves and iron tools, which contradicts that early-kitchen premise.
//
// Override: same shape, redstone instead of diamonds. Redstone is
// reachable with a wood/stone pickaxe and shows up in the same Y-range
// the player is mining at while securing their first kitchen, so the
// crafting_book becomes available right when the kitchen does.
// =============================================================================

ServerEvents.recipes(event => {
    // Remove the stock recipe so our shaped override is the only one
    // producing the crafting book.
    event.remove({ output: 'cookingforblockheads:crafting_book' })

    // Re-add with redstone replacing diamonds. Pattern from upstream
    // (data/cookingforblockheads/recipes/crafting_book.json):
    //   ' D '
    //   'CBC'
    //   ' D '
    // C = vanilla crafting table, B = cookingforblockheads:recipe_book,
    // D was balm:diamonds tag -- now plain redstone item.
    event.shaped(
        'cookingforblockheads:crafting_book',
        [
            ' R ',
            'CBC',
            ' R ',
        ],
        {
            R: 'minecraft:redstone',
            C: 'minecraft:crafting_table',
            B: 'cookingforblockheads:recipe_book',
        }
    ).id('iridescent_reforging:cookingforblockheads_crafting_book_redstone')
})
