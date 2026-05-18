// =============================================================================
// One-shot diagnostic: verify LootCategory.forItem on common items
// =============================================================================
// Logs the resolved LootCategory for a sampling of items at server start.
// Tests whether our magic_weapon predicate actually matches spellbooks.
//
// Delete after triage.
// =============================================================================

(function () {
    var LootCategory = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.loot.LootCategory')
    var ForgeRegistries = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

    var TEST_IDS = [
        // Should resolve via builtin predicates:
        'minecraft:iron_sword',           // SWORD
        'minecraft:diamond_pickaxe',      // PICKAXE
        'minecraft:netherite_helmet',     // HELMET
        // Should resolve to MAGIC_WEAPON via #icraft:magic_weapon tag:
        'irons_spellbooks:iron_spell_book',
        'irons_spellbooks:diamond_spell_book',
        'iridescent_modular_spells:modular_spell_book',
        'iridescent_modular_spells:modular_archmage_spell_book',
        // Should resolve to NONE (not in any category):
        'minecraft:apple',
    ]

    ServerEvents.loaded(event => {
        try {
            console.log('[magic-weapon-diag] LootCategory.VALUES contains ' + LootCategory.VALUES.size() + ' categories')
            var hasMagicWeapon = LootCategory.byId('magic_weapon')
            console.log('[magic-weapon-diag] byId("magic_weapon") -> '
                      + (hasMagicWeapon != null ? hasMagicWeapon.getName() : 'NULL'))

            for (var i = 0; i < TEST_IDS.length; i++) {
                var id = TEST_IDS[i]
                try {
                    var stack = Item.of(id)
                    if (stack == null || stack.isEmpty()) {
                        console.log('[magic-weapon-diag]   ' + id + ' -> ITEM NOT REGISTERED')
                        continue
                    }
                    var cat = LootCategory.forItem(stack)
                    console.log('[magic-weapon-diag]   ' + id + ' -> ' + cat.getName())
                } catch (e) {
                    console.log('[magic-weapon-diag]   ' + id + ' -> ERROR: ' + e)
                }
            }
        } catch (e) {
            console.error('[magic-weapon-diag] outer error: ' + e)
        }
    })
})()
