// =============================================================================
// kubejs/startup_scripts/cursed_pyramid_items.js
// Custom items for the Cataclysm cursed_pyramid / Ancient Remnant loot overhaul (#57).
// =============================================================================

StartupEvents.registry('item', event => {
    // "Pharaoh's Feast" -- the massive god-apple boss + reward-chest drop.
    // Fills the entire hunger bar in one bite + a burst of buffs.
    event.create('pharaohs_feast')
        .displayName("Pharaoh's Feast")
        .texture('minecraft:item/enchanted_golden_apple')
        .glow(true)
        .rarity('epic')
        .maxStackSize(16)
        .food(food => {
            food.hunger(20)               // fills the whole hunger bar
                .saturation(1.0)          // max saturation modifier
                .alwaysEdible()
                .effect('minecraft:saturation', 1, 19, 1.0)    // instant full saturation
                .effect('minecraft:regeneration', 400, 1, 1.0) // Regen II, 20s
                .effect('minecraft:absorption', 2400, 3, 1.0)  // Absorption IV, 2min
                .effect('minecraft:resistance', 1200, 0, 1.0)  // Resistance I, 1min
        })

    // "Relic of the Remnant" -- the unique boss charm (curios charm slot).
    // Worn: +2 hearts max health + 10% spell power, via the kubejs_curios addon
    // (kubejs_curios_forge_1.20.1-1.0.3, author zhaiji). Verified from the jar:
    //   - attachCuriosCapability(...) is mixed onto the NORMAL ItemBuilder -- there is
    //     NO 'curios:trinket' item type (that bogus 2nd arg was the original "Unknown
    //     type" startup error). Create the item plainly.
    //   - CuriosJSCapabilityBuilder.create().addAttribute(attr, name, value, op): exact
    //     sig is (ResourceLocation, String, double, AttributeModifier.Operation); KubeJS
    //     coerces the string attr -> ResourceLocation and the op string -> Operation.
    //     Using 'addition' for both (the one op string confirmed in this pack, via
    //     dna_simple_staves_buffs.js): +0.1 ADDITION on ISS spell_power (base 1.0) = +10%.
    //   - the 'curios:charm' tag assigns the charm slot (base Curios, data-driven).
    // Texture is a placeholder (heart_of_the_sea) -- swap a CC0 gold-amulet icon later.
    event.create('remnant_relic')
        .displayName('Relic of the Remnant')
        .texture('minecraft:item/heart_of_the_sea')
        .glow(true)
        .rarity('epic')
        .maxStackSize(1)
        .tooltip('§7A pulsing heart of ancient sandstone, warm to the touch.')
        .tag('curios:charm')
        .attachCuriosCapability(
            CuriosJSCapabilityBuilder.create()
                .addAttribute('minecraft:generic.max_health', 'd3f1c2a0-57aa-4a2b-9c3d-100000000057', 4, 'addition')
                .addAttribute('irons_spellbooks:spell_power', 'd3f1c2a0-57aa-4a2b-9c3d-100000000058', 0.1, 'addition')
        )
})
