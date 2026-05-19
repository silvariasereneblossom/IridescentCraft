// =============================================================================
// MAGIC_WEAPON LootCategory — Priority 0 (registers before Apoth gem parse)
// =============================================================================
// Adds a new Apotheosis LootCategory named `magic_weapon` so wands and staves
// can carry mage-themed gem bonuses without colliding with canonical sword/
// trident bonuses. Required because Apotheosis builds a Map<LootCategory,
// GemBonus> per gem and Collectors.toMap throws on dup — any gem JSON that
// adds a sword/trident bonus on top of an existing canonical sword/trident
// bonus fails to parse, removing the entire gem from the registry.
//
// Membership: hardcoded 26-item ID set (wands + staves). The tag-based
// predicate path didn't work in initial testing — at least 20/26 items
// resolved to NONE or SWORD instead of magic_weapon (diag 2026-05-18 23:02),
// so we switched to an in-memory HashSet of item IDs. Simpler, no tag-load
// timing concerns, and changing the set is still a one-place edit (this
// file). The kubejs/data/icraft/tags/items/magic_weapon.json file is kept
// for parity / other-system reference but is no longer load-bearing here.
//
// Slots: MAINHAND + OFFHAND so the bonus fires whether the wand/staff is
// the held item or held in the offhand (mixed builds).
//
// Iteration-order fix: passing LootCategory.SWORD as the reference arg
// inserts magic_weapon AT sword's index, pushing SWORD to idx+1. This is
// load-bearing — most wands extend SwordItem (Forge class hierarchy), so
// without this they match SWORD first and never reach magic_weapon. See
// LootCategory.forItem bytecode: VALUES iteration returns first
// predicate-match. We must precede SWORD.
//
// Idempotency: re-running this script (e.g., after /reload) is safe — we
// check BY_ID before calling register() so the second call no-ops instead
// of throwing "Cannot register a loot category with a duplicate name".
//
// LootCategory.BY_ID is Collections.unmodifiableMap(BY_ID_INTERNAL) per the
// jar's static init — a LIVE view, so late additions via register() are
// visible to Apoth's gem-JSON codec at datapack-reload time. Confirmed by
// bytecode inspection on Apotheosis-1.20.1-7.4.8.jar.
// =============================================================================

(function () {
    var LootCategory = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.loot.LootCategory')
    var EquipmentSlot = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
    var ForgeRegistries = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

    // Skip if already registered (script reloaded mid-session).
    if (LootCategory.byId('magic_weapon') != null) {
        console.log('[magic-weapon] LootCategory.magic_weapon already registered; skipping')
        return
    }

    // Hardcoded membership: 26 wands + staves. Keep in sync with
    // .minecraft/wiki/design/master-appendix.md §M.4 and the tag file at
    // kubejs/data/icraft/tags/items/magic_weapon.json.
    //
    // KubeJS 6 removed the `new java.util.X(...)` constructor pattern
    // (the old `java()` form, kubejs.com/kjs6), so we use a plain JS
    // object as a hash set rather than java.util.HashSet. Object.create
    // also stripped — bare object literal does the job and Rhino's
    // property lookup is fine for a 26-entry set.
    var MAGIC_WEAPON_IDS = {
        // Iridescent Reforging Tetra-modular wand
        'iridescent_reforging:reforged_wand': 1,
        // Dan's Magic T1 element staves
        'dna:ice_staff': 1, 'dna:lightning_staff': 1, 'dna:magma_staff': 1,
        'dna:toxic_staff': 1, 'dna:tnt_staff': 1,
        // Iron's Spellbooks named staves (NOT the spellbook curio items)
        'irons_spellbooks:blood_staff': 1, 'irons_spellbooks:graybeard_staff': 1,
        'irons_spellbooks:ice_staff': 1, 'irons_spellbooks:pyrium_staff': 1,
        'irons_spellbooks:staff_of_the_nines': 1,
        // Simple Staves tier wands
        'simple_staves:woodenwand': 1, 'simple_staves:stone_wand': 1,
        'simple_staves:iron_wand': 1, 'simple_staves:gold_wand': 1,
        'simple_staves:diamond_wand': 1, 'simple_staves:netherite_wand': 1,
        // Simple Staves element wands
        'simple_staves:flame_wand': 1, 'simple_staves:wind_essence_wand': 1,
        'simple_staves:thunder_wand': 1, 'simple_staves:venomite_wand': 1,
        'simple_staves:viritium_wand': 1, 'simple_staves:veil_wand': 1,
        'simple_staves:void_wand': 1, 'simple_staves:tenebrium_wand': 1,
        'simple_staves:explosion_wand': 1
    }

    // Predicate: stack's item ID is in the hardcoded set.
    var predicate = function (stack) {
        try {
            if (stack == null || stack.isEmpty()) return false
            var key = ForgeRegistries.ITEMS.getKey(stack.getItem())
            if (key == null) return false
            return MAGIC_WEAPON_IDS[key.toString()] === 1
        } catch (_) {
            return false
        }
    }

    var slots = [EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND]

    try {
        // reference=SWORD -> insert magic_weapon AT sword's index, pushing SWORD
        // to idx+1. Most wands extend SwordItem so SWORD.predicate matches them;
        // we must precede SWORD in VALUES iteration to win the match.
        LootCategory.register(LootCategory.SWORD, 'magic_weapon', predicate, slots)
        console.log('[magic-weapon] LootCategory.magic_weapon registered '
                  + '(hardcoded 26-ID set, MAINHAND/OFFHAND slots, '
                  + 'inserted before SWORD for SwordItem-extending wand precedence)')
    } catch (e) {
        console.error('[magic-weapon] register() failed: ' + e)
    }
})()
