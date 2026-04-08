// =============================================================================
// Disable Majrusz's Bleeding Effect
// We have our own bleed mechanic (Apotheosis weapon affix).
// This strips the Majrusz bleeding effect on application.
// =============================================================================

PlayerEvents.tick(event => {
  let player = event.player
  if (event.server.tickCount % 20 !== 0) return // Check once per second

  if (player.potionEffects.isActive('majruszsdifficulty:bleeding')) {
    player.potionEffects.clear('majruszsdifficulty:bleeding')
  }
})
