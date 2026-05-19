// =============================================================================
// One-shot diagnostic: verify LootCategory.forItem on wands + staves
// =============================================================================
// Tests the 26 items in #icraft:magic_weapon resolve to LootCategory
// "magic_weapon" via the runtime-registered predicate. If any resolve to
// "none", that item won't be socketable / reforgeable / appear in gem
// tooltips and the predicate or tag is broken.
//
// Delete after triage.
// =============================================================================

(function () {
    var LootCategory = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.loot.LootCategory')

    // Same 26 items as kubejs/data/icraft/tags/items/magic_weapon.json
    var WAND_STAFF_IDS = [
        'iridescent_reforging:reforged_wand',
        'dna:ice_staff', 'dna:lightning_staff', 'dna:magma_staff', 'dna:toxic_staff', 'dna:tnt_staff',
        'irons_spellbooks:blood_staff', 'irons_spellbooks:graybeard_staff',
        'irons_spellbooks:ice_staff', 'irons_spellbooks:pyrium_staff', 'irons_spellbooks:staff_of_the_nines',
        'simple_staves:woodenwand', 'simple_staves:stone_wand', 'simple_staves:iron_wand',
        'simple_staves:gold_wand', 'simple_staves:diamond_wand', 'simple_staves:netherite_wand',
        'simple_staves:flame_wand', 'simple_staves:wind_essence_wand', 'simple_staves:thunder_wand',
        'simple_staves:venomite_wand', 'simple_staves:viritium_wand', 'simple_staves:veil_wand',
        'simple_staves:void_wand', 'simple_staves:tenebrium_wand', 'simple_staves:explosion_wand'
    ]

    // Control items that should resolve to known categories:
    var CONTROL_IDS = [
        'minecraft:iron_sword',           // expect SWORD
        'minecraft:diamond_pickaxe',      // expect PICKAXE
        'minecraft:apple'                 // expect NONE
    ]

    ServerEvents.loaded(event => {
        try {
            var byId = LootCategory.byId('magic_weapon')
            console.log('[magic-weapon-diag] LootCategory.VALUES contains ' + LootCategory.VALUES.size() + ' categories')
            console.log('[magic-weapon-diag] byId("magic_weapon") -> ' + (byId != null ? byId.getName() : 'NULL'))

            console.log('[magic-weapon-diag] --- wand/staff items (expect magic_weapon) ---')
            for (var i = 0; i < WAND_STAFF_IDS.length; i++) {
                var id = WAND_STAFF_IDS[i]
                try {
                    var stack = Item.of(id)
                    if (stack == null || stack.isEmpty()) {
                        console.log('[magic-weapon-diag]   ' + id + ' -> ITEM NOT REGISTERED')
                        continue
                    }
                    var cat = LootCategory.forItem(stack)
                    var match = (cat != null && cat.getName() === 'magic_weapon') ? '' : '  <<< MISMATCH'
                    console.log('[magic-weapon-diag]   ' + id + ' -> ' + cat.getName() + match)
                } catch (e) {
                    console.log('[magic-weapon-diag]   ' + id + ' -> ERROR: ' + e)
                }
            }

            console.log('[magic-weapon-diag] --- controls ---')
            for (var j = 0; j < CONTROL_IDS.length; j++) {
                var cid = CONTROL_IDS[j]
                try {
                    var cstack = Item.of(cid)
                    var ccat = LootCategory.forItem(cstack)
                    console.log('[magic-weapon-diag]   ' + cid + ' -> ' + ccat.getName())
                } catch (e2) {
                    console.log('[magic-weapon-diag]   ' + cid + ' -> ERROR: ' + e2)
                }
            }
        } catch (e) {
            console.error('[magic-weapon-diag] outer error: ' + e)
        }
    })
})()
