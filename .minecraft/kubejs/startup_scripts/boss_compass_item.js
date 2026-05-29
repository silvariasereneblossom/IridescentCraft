// =============================================================================
// kubejs/startup_scripts/boss_compass_item.js
//
// Registers the unified boss compass item (kubejs:boss_compass). The item
// itself is a simple Tetra-style "I have NBT" carrier. The interaction
// logic lives in kubejs/server_scripts/bonfire/boss_compass_handler.js.
//
// Design (#46 Part A MVP):
//   - Single item type, all 106 bosses target-selectable via right-click
//     menu (tier-gated by AStages -- see handler).
//   - Vanilla-compass-flavored model + name; visual needle rotation is
//     deferred to a Phase 2 polish pass (the MVP shows direction + distance
//     as chat tellraw instead).
//   - Recipe: 1 vanilla compass + 1 Ars Nouveau source gem (T1-accessible
//     so the player can craft one early; tier-gating happens at target-
//     selection time, not crafting time).
// =============================================================================

StartupEvents.registry("item", event => {
    event.create("kubejs:boss_compass")
        .displayName("Boss Compass")
        .texture("minecraft:item/compass")
        .tooltip("Tracks tier-appropriate boss arenas.")
        .tooltip("Right-click in air: choose a target.")
        .tooltip("Shift-right-click: clear target.")
        .maxStackSize(1)
        .rarity("uncommon")
        .glow(true)
})

ServerEvents.recipes(event => {
    event.shapeless("kubejs:boss_compass", [
        "minecraft:compass",
        "ars_nouveau:source_gem",
    ])
})
