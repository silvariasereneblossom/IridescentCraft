// =============================================================================
// SPAWN VILLAGE PROTECTION
// Protects the starting village around world spawn from block breaking/placing.
// Players can still interact with existing blocks (crafting, chests, etc.)
// Only protects the Overworld spawn area.
//
// This file is BLOCK protection only (break / place). Hostile mobs around
// spawn are handled by spawn_village_protection.js (r=96 circle: spawn cancel +
// discard sweep), whose zone fully contains this 32-block square. The two
// hostile pieces that used to live here were removed 2026-10-10 as redundant:
//   - an EntityEvents.spawned cancel for the r=32 square (a strict subset of
//     the r=96 cancel), and
//   - a 200-tick `kill @e[type=#minecraft:hostile,distance=..32]` sweep that
//     never removed anything: it was positioned at y=0 (a 3-D 32-block sphere
//     far below the village), and `#minecraft:hostile` is not an entity-type
//     tag that exists in this pack, so the selector matched no entity at all.
// =============================================================================

// 2026-04-24: reduced 64 -> 32. The 64 radius covered most of a starting
// village plus the surrounding countryside, effectively walling off a
// 128x128 zone. 32 keeps the core village protected but lets outlying
// buildings / crops / terrain be interacted with — reinforces the "leave
// to build your base" philosophy without fully locking the village edges.
const SPAWN_PROTECTION_RADIUS = 32

function isInSpawnZone(event) {
  if (event.level.dimension != 'minecraft:overworld') return false
  let spawn = event.level.server.overworld().getSharedSpawnPos()
  let dx = Math.abs(event.block.x - spawn.x)
  let dz = Math.abs(event.block.z - spawn.z)
  return dx <= SPAWN_PROTECTION_RADIUS && dz <= SPAWN_PROTECTION_RADIUS
}

// Throttled "this zone is protected" chat line (at most one per 5 s per player).
// Until 2026-10-10 this code sat AFTER event.cancel() in both handlers and was
// unreachable (cancel() throws), so the notice was never shown. It is wrapped in
// its own try/catch so that nothing in it can ever stop the cancel that follows.
function spawnProtectionNotice(event) {
  try {
    let data = event.player.persistentData
    let lastMsg = data.getLong('ic_spawnMsgTime')
    // World game time, not server.tickCount: the stamp is persisted on the
    // player and tickCount restarts at 0 on every boot.
    let now = event.level.time
    if (now - lastMsg > 100 || now < lastMsg) {
      event.player.tell('The starting village is protected. Venture out and build your own base!')
      data.putLong('ic_spawnMsgTime', now)
    }
  } catch (e) {}
}

// --- Block breaking protection ---
BlockEvents.broken(icraft.guard('spawn_protection', 'BlockEvents.broken', event => {
  if (!event.player) return
  if (event.player.creative) return
  if (isInSpawnZone(event)) {
    spawnProtectionNotice(event)
    // cancel() unwinds by throwing, so it has to be the LAST statement.
    event.cancel()
  }
}))

// --- Block placing protection ---
BlockEvents.placed(icraft.guard('spawn_protection', 'BlockEvents.placed', event => {
  if (!event.player) return
  if (event.player.creative) return
  if (isInSpawnZone(event)) {
    spawnProtectionNotice(event)
    // cancel() unwinds by throwing, so it has to be the LAST statement.
    event.cancel()
  }
}))

console.log('[IridescentCraft] Spawn protection loaded (radius: ' + SPAWN_PROTECTION_RADIUS + ')')
