// =============================================================================
// SPAWN VILLAGE PROTECTION
// Protects the starting village around world spawn from block breaking/placing.
// Players can still interact with existing blocks (crafting, chests, etc.)
// Only protects the Overworld spawn area.
// =============================================================================

const SPAWN_PROTECTION_RADIUS = 64

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

// --- Prevent hostile mob spawns in zone ---
EntityEvents.spawned(event => {
  if (!event.entity || !event.entity.living) return
  if (!event.entity.monster) return
  if (event.level.dimension != 'minecraft:overworld') return
  let spawn = event.level.server.overworld().getSharedSpawnPos()
  let dx = Math.abs(event.entity.x - spawn.x)
  let dz = Math.abs(event.entity.z - spawn.z)
  if (dx <= SPAWN_PROTECTION_RADIUS && dz <= SPAWN_PROTECTION_RADIUS) {
    event.cancel()
  }
})

// --- Cleanup: single command every 10 seconds for any stragglers ---
global.tick_spawnProtectionCleanup = (event) => {
  let spawn = event.server.overworld().getSharedSpawnPos()
  event.server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=#minecraft:hostile,distance=..${SPAWN_PROTECTION_RADIUS}]`
  )
}
global.registerServerTick('tick_spawnProtectionCleanup', 200, 100)

console.log('[IridescentCraft] Spawn protection loaded (radius: ' + SPAWN_PROTECTION_RADIUS + ')')
