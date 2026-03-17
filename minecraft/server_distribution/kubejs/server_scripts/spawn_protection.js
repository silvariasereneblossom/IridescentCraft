// =============================================================================
// SPAWN VILLAGE PROTECTION
// Place in: kubejs/server_scripts/spawn_protection.js
//
// Protects the starting village around world spawn from block breaking and
// placing. Players can still interact with existing blocks (crafting tables,
// chests, furnaces, anvils, etc.) — just can't modify the terrain.
//
// Only protects the Overworld spawn area, not other villages.
// =============================================================================

// Protection radius in blocks from world spawn
const SPAWN_PROTECTION_RADIUS = 64

/**
 * Check if a block position is within the spawn protection zone.
 * Only applies to the Overworld dimension.
 */
function isInSpawnZone(event) {
  if (event.level.dimension != 'minecraft:overworld') return false

  let spawn = event.level.server.overworld().getSharedSpawnPos()
  let dx = Math.abs(event.block.x - spawn.x)
  let dz = Math.abs(event.block.z - spawn.z)

  return dx <= SPAWN_PROTECTION_RADIUS && dz <= SPAWN_PROTECTION_RADIUS
}

// --- Block breaking protection ---
BlockEvents.broken(event => {
  if (!event.player) return
  if (event.player.creative) return

  if (isInSpawnZone(event)) {
    event.cancel()
    // Only send message once every 5 seconds to avoid spam
    let data = event.player.persistentData
    let lastMsg = data.getLong('ic_spawnMsgTime')
    let now = event.level.server.tickCount

    if (now - lastMsg > 100) {
      event.player.tell('The starting village is protected. Venture out and build your own base!')
      data.putLong('ic_spawnMsgTime', now)
    }
  }
})

// --- Block placing protection ---
BlockEvents.placed(event => {
  if (!event.player) return
  if (event.player.creative) return

  if (isInSpawnZone(event)) {
    event.cancel()
    let data = event.player.persistentData
    let lastMsg = data.getLong('ic_spawnMsgTime')
    let now = event.level.server.tickCount

    if (now - lastMsg > 100) {
      event.player.tell('The starting village is protected. Venture out and build your own base!')
      data.putLong('ic_spawnMsgTime', now)
    }
  }
})

console.log('[IridescentCraft] Spawn village protection loaded')
console.log('  - Protection radius: ' + SPAWN_PROTECTION_RADIUS + ' blocks from world spawn')
console.log('  - Block breaking: CANCELLED in zone (survival only)')
console.log('  - Block placing: CANCELLED in zone (survival only)')
console.log('  - Block interaction: ALLOWED (chests, crafting tables, etc.)')
