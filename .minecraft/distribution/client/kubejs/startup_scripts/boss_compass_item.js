// =============================================================================
// kubejs/startup_scripts/boss_compass_item.js
//
// Registers the unified boss compass item (kubejs:boss_compass). The item
// itself is a simple Tetra-style "I have NBT" carrier. The interaction
// logic lives in kubejs/server_scripts/bonfire/boss_compass_handler.js.
//
// Design (#46 Part A MVP):
//   - Single item type, all bosses target-selectable via right-click cycle
//     (or the /icraft_compass menu clickable list); tier-gated by AStages
//     -- see handler.
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
        .tooltip("Right-click: cycle to the next target.")
        .tooltip("Shift-right-click: clear target.")
        .tooltip("/icraft_compass menu: full clickable list.")
        .maxStackSize(1)
        .rarity("uncommon")
        .glow(true)
})

// Recipe registration moved to server_scripts/bonfire/boss_compass_handler.js
// per KubeJS script-type rules -- ServerEvents.* only fires from server_scripts/,
// never startup_scripts/. Original error 2026-05-29:
//   "Tried to register event handler 'ServerEvents.recipes' for invalid script
//    type STARTUP! Valid script types: [SERVER]"
