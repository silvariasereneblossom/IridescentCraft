// =============================================================================
// kubejs/startup_scripts/cursed_pyramid_items.js
// Custom items for the Cataclysm cursed_pyramid / Ancient Remnant loot overhaul (#57).
// =============================================================================
//
// NOTE (2026-05-31): "Relic of the Remnant" moved OUT of KubeJS into the native
// iridescent_relics mod (a real Curios ICurioItem). The kubejs_curios addon's builder
// mixin was incompatible with KubeJS 2001.6.5, and native ICurio is how every other
// stat-curio in the pack works (ISS rings, Relics, Artifacts). The Ancient Remnant loot
// now drops iridescent_relics:remnant_relic. This file keeps only Pharaoh's Feast.
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
})
