// =============================================================================
// MAGIC_WEAPON LootCategory — Priority 0 (registers before Apoth gem parse)
// =============================================================================
// Adds a new Apotheosis LootCategory named `magic_weapon` so spellbooks /
// wands / staves can carry mage-themed gem bonuses without colliding with
// canonical sword/trident bonuses. Required because Apotheosis builds a
// Map<LootCategory, GemBonus> per gem and Collectors.toMap throws on dup —
// any gem JSON that adds a sword/trident bonus on top of an existing
// canonical sword/trident bonus fails to parse, removing the entire gem
// from the registry.
//
// Previous approach (TYPE_OVERRIDES typing 32 spellbooks as `sword` in
// adventure.cfg) made spellbooks share gem bonuses with swords, which
// (a) collided when we tried to add per-school spell-power bonuses, and
// (b) meant swords and spellbooks couldn't be differentiated in gem design.
//
// Membership: any item carrying the `icraft:magic_weapon` item tag.
// The tag is populated by data/icraft/tags/items/magic_weapon.json.
//
// Slots: MAINHAND + OFFHAND so the bonus fires whether the spellbook is
// the held item (Ars-style) or held in the offhand (ISS-style).
//
// Idempotency: re-running this script (e.g., after /reload) is safe — we
// check BY_ID before calling register() so the second call no-ops instead
// of throwing "Cannot register a loot category with a duplicate name".
//
// LootCategory.BY_ID is Collections.unmodifiableMap(BY_ID_INTERNAL) per the
// jar's static {} init — a LIVE view, so late additions via register() are
// visible to Apoth's gem-JSON codec at datapack-reload time. Confirmed by
// bytecode inspection on Apotheosis-1.20.1-7.4.8.jar.
// =============================================================================

(function () {
    var LootCategory = Java.loadClass('dev.shadowsoffire.apotheosis.adventure.loot.LootCategory')
    var EquipmentSlot = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
    var TagKey = Java.loadClass('net.minecraft.tags.TagKey')
    var Registries = Java.loadClass('net.minecraft.core.registries.Registries')
    var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

    // Skip if already registered (script reloaded mid-session).
    if (LootCategory.byId('magic_weapon') != null) {
        console.log('[magic-weapon] LootCategory.magic_weapon already registered; skipping')
        return
    }

    // Canonical TagKey<Item> for #icraft:magic_weapon; passed to ItemStack.is(TagKey).
    var MAGIC_WEAPON_TAG = TagKey.create(Registries.ITEM, new ResourceLocation('icraft', 'magic_weapon'))

    // Predicate: stack matches the tag. ItemStack.is(TagKey) is the canonical
    // Forge form. stack.isEmpty() called WITH parens (function-ref-truthy
    // trap per feedback_kubejs_tooltip_api).
    var predicate = new java.util.function.Predicate({
        test: function (stack) {
            try {
                if (stack == null || stack.isEmpty()) return false
                return stack.is(MAGIC_WEAPON_TAG)
            } catch (_) {
                return false
            }
        }
    })

    var slots = [EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND]

    try {
        // reference=null -> append at end of VALUES_INTERNAL (see Gem.register impl).
        LootCategory.register(null, 'magic_weapon', predicate, slots)
        console.log('[magic-weapon] LootCategory.magic_weapon registered '
                  + '(tag #icraft:magic_weapon predicate, MAINHAND/OFFHAND slots)')
    } catch (e) {
        console.error('[magic-weapon] register() failed: ' + e)
    }
})()
