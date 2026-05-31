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
    // 2026-05-31: the kubejs_curios addon's `attachCuriosCapability` builder mixin
    // does NOT apply in KubeJS 2001.6.5-build.16. BasicItemJS$Builder correctly
    // extends the mixin's target (dev.latvian.mods.kubejs.item.ItemBuilder), but the
    // injection silently fails (version-specific addon-mixin fragility) -> the method
    // is missing at runtime ("Cannot find function attachCuriosCapability"). The
    // addon's BINDINGS do load (CuriosJSCapabilityBuilder resolves), but the attach
    // path is unusable and the addon exposes no event-based alternative.
    //
    // So: register the relic as a plain item tagged into the 'curios:charm' slot
    // (base Curios, data-driven -- equips fine, NO addon needed). Worn stats
    // (+2 hearts, +10% spell power) are TBD via a server-tick handler mirroring the
    // proven dna_simple_staves_buffs.js pattern (player.modifyAttribute keyed on the
    // equipped curio). Until that's wired, it equips as a trophy charm.
    // Texture is a placeholder (heart_of_the_sea) -- swap a CC0 gold-amulet icon later.
    event.create('remnant_relic')
        .displayName('Relic of the Remnant')
        .texture('minecraft:item/heart_of_the_sea')
        .glow(true)
        .rarity('epic')
        .maxStackSize(1)
        .tooltip('§7A pulsing heart of ancient sandstone, warm to the touch.')
        .tag('curios:charm')
})
