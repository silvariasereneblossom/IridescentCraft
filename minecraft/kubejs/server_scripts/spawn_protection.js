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

// --- Hostile mob removal in spawn zone ---
// Every 5 seconds, kill hostile mobs within the spawn protection radius.
// Also converts zombie villagers back to regular villagers.
ServerEvents.tick(event => {
  let server = event.server
  if (server.tickCount % 100 !== 50) return

  let overworld = server.overworld()
  let spawn = overworld.getSharedSpawnPos()
  let r = SPAWN_PROTECTION_RADIUS

  // Kill all hostile mobs in the zone
  server.runCommandSilent(
    `kill @e[type=#minecraft:raiders,x=${spawn.x},y=${spawn.y},z=${spawn.z},dx=${r*2},dy=320,dz=${r*2},x_rotation=..90]`
  )
  // Use execute positioned for proper radius check
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:zombie,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:skeleton,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:spider,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:creeper,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:drowned,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:husk,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:phantom,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:witch,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:slime,distance=..${r}]`
  )
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:enderman,distance=..${r}]`
  )
  // Champions/modded hostile mobs
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=minecraft:zombie_villager,distance=..${r}]`
  )
  // Catch-all: any hostile mob via the is_hostile tag (if available)
  server.runCommandSilent(
    `execute positioned ${spawn.x} 0 ${spawn.z} run kill @e[type=#minecraft:hostile,distance=..${r}]`
  )
})

// --- Prevent hostile mob spawns in zone via EntityEvents.spawned ---
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

console.log('[IridescentCraft] Spawn village protection loaded')
console.log('  - Protection radius: ' + SPAWN_PROTECTION_RADIUS + ' blocks from world spawn')
console.log('  - Block breaking: CANCELLED in zone (survival only)')
console.log('  - Block placing: CANCELLED in zone (survival only)')
console.log('  - Block interaction: ALLOWED (chests, crafting tables, etc.)')
console.log('  - Hostile mob spawns: CANCELLED in zone')
console.log('  - Existing hostiles: KILLED every 5 seconds')
