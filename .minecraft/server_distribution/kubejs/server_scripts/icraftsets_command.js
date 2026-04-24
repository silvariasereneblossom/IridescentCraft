// =============================================================================
// /icraftsets — open the Epic RPG: Class Artifacts Set Equipment Screen
// =============================================================================
// Backup entry point for the Set Menu (artifact + relic slots). The mod
// ships three entry points in code:
//   1. Inventory-screen "Sets" button (gated by [gui].showInventoryButton=true
//      in config/everydayxp/rpgseteffects/rpgseteffects.toml). Not currently
//      rendering on our client even with the config correct — cause unknown
//      (other mod's button overlay likely clipping, or click-through ordering
//      issue). 2026-04-24.
//   2. Keybind J — but J is JourneyMap in our pack. Conflict makes the
//      keybind unreachable unless the user rebinds one of them in Controls.
//   3. This command — direct server-side invocation of
//      SetEquipmentHelper.open(ServerPlayer), which is exactly what the
//      OpenSetMenuPacket handler does when the button/keybind fire.
//
// Any of the three paths opens the same SetEquipmentMenu (4 slots total:
// ally, barrier, earrings, talisman — labeled "Artifact Slot" and "Relic
// Slot" in the GUI text).
// =============================================================================

var SetEquipmentHelper = Java.loadClass('com.everydayxp.rpgseteffects.system.slot.SetEquipmentHelper')

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event

  event.register(
    Commands.literal('icraftsets')
      .requires(src => src.hasPermission(0))
      .executes(ctx => {
        let sp
        try { sp = ctx.source.getPlayerOrException() } catch (e) { return 0 }
        try {
          SetEquipmentHelper.open(sp)
          return 1
        } catch (e) {
          console.warn('[icraftsets] open threw for ' + sp.username + ': ' + e)
          sp.tell('§c[Sets] Could not open Set Equipment Screen: ' + e)
          return 0
        }
      })
  )
})

console.log('[IridescentCraft] /icraftsets command registered')
