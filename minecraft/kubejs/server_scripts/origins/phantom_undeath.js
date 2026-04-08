// =============================================================================
// PHANTOM — Spectral Undeath
// =============================================================================
// Phantoms never truly die. When they would reach 0 HP:
//   - Health locks to 0.5 hearts (1 HP)
//   - 50% damage reduction (Weakness II equivalent via Resistance)
//   - Slowness II for 5 minutes
//   - Mining Fatigue I for 5 minutes
//   - Visual: Wither particle effect (darkness closing in)
// After 5 minutes the debuffs expire and they recover naturally.
// Cannot trigger again while debuffs are active (no infinite immortality loop).
// =============================================================================

function isPhantom(player) {
  try {
    let result = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"origins:phantom"}]}}}]`
    )
    return result > 0
  } catch (e) {
    return false
  }
}

// Intercept death for Phantom players
EntityEvents.death(event => {
  let entity = event.entity
  if (!entity.player) return

  let player = entity
  if (!isPhantom(player)) return

  // Check if already in spectral collapse (don't trigger again)
  let data = player.persistentData
  if (data.getBoolean('icraft_phantom_collapsed')) return

  // Cancel death
  event.cancel()

  // Set to half a heart
  player.setHealth(1)

  // Mark as collapsed
  data.putBoolean('icraft_phantom_collapsed', true)

  let name = player.username

  // Apply 5-minute debuffs
  // Weakness II = 50% less melee damage
  player.server.runCommandSilent(
    `effect give ${name} minecraft:weakness 300 1 false`
  )
  // Slowness II
  player.server.runCommandSilent(
    `effect give ${name} minecraft:slowness 300 1 false`
  )
  // Mining Fatigue I
  player.server.runCommandSilent(
    `effect give ${name} minecraft:mining_fatigue 300 0 false`
  )
  // Resistance II — 36% damage reduction to help survive the collapse state
  player.server.runCommandSilent(
    `effect give ${name} minecraft:resistance 300 1 false`
  )

  // Notify player
  player.tell('\u00a78\u00a7l[Spectral Collapse]\u00a7r')
  player.tell('\u00a77Your phantom form wavers at the edge of death.')
  player.tell('\u00a77You are severely weakened for 5 minutes.')
  player.server.runCommandSilent(
    `title ${name} title {"text":"Spectral Collapse","color":"gray","bold":true}`
  )
  player.server.runCommandSilent(
    `title ${name} subtitle {"text":"Your form holds... barely.","color":"dark_gray"}`
  )
})

// Clear the collapse flag when debuffs expire (check every 10 seconds)
global.tick_phantomUndeath = (event) => {
  event.server.players.forEach(player => {
    if (!isPhantom(player)) return

    let data = player.persistentData
    if (!data.getBoolean('icraft_phantom_collapsed')) return

    let hasWeakness = player.potionEffects.isActive('minecraft:weakness')
    if (!hasWeakness) {
      data.putBoolean('icraft_phantom_collapsed', false)
      player.tell('\u00a77Your spectral form stabilizes. You feel whole again.')
    }
  })
}
global.registerServerTick('tick_phantomUndeath', 200, 0)

console.log('[IridescentCraft] Phantom Undeath loaded')
console.log('  - Phantoms cannot die — health locks to 0.5 hearts')
console.log('  - Spectral Collapse: Weakness II, Slowness II, Mining Fatigue I for 5 min')
console.log('  - Resistance II during collapse to prevent instant re-collapse')
