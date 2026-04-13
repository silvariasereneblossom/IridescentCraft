// =============================================================================
// COMPASS OF RETURN — Magic Mirror Teleport to Bed
// =============================================================================
// Right-click to teleport to your last bed/respawn point.
// 10-minute cooldown. Works across dimensions.
//
// Implementation: We can't easily read bed position from KubeJS, so we
// track it ourselves. When a player sleeps, we store their bed coords.
// On right-click, teleport there.
// =============================================================================

const COMPASS_COOLDOWN_TICKS = 12000  // 10 minutes

// Track bed position when player sleeps
// PlayerEvents doesn't have a 'slept' event in KubeJS 1.20.1 Forge,
// so we check periodically if player's spawn point NBT has changed.
// Better approach: store bed pos on first use via /spawnpoint query.

// Actually, the simplest reliable approach: just kill and respawn would
// lose items. Instead, use the fact that /execute stores can read
// spawn point data. OR we can just track beds via block interaction.

// Most reliable approach for KubeJS 1.20.1 Forge:
// Store spawn position when player interacts with a bed.

// Track bed interactions to store respawn position
PlayerEvents.loggedIn(event => {
  // On login, try to read stored position — nothing to do, it persists
})

// Store bed position when player right-clicks a bed
// Beds are right-clicked to sleep, so we can capture the position
BlockEvents.rightClicked(event => {
  let block = event.block
  if (!block.id.includes('_bed')) return

  let player = event.player
  if (!player) return

  let data = player.persistentData
  data.putInt('icraft_bed_x', block.pos.x)
  data.putInt('icraft_bed_y', block.pos.y)
  data.putInt('icraft_bed_z', block.pos.z)
  data.putString('icraft_bed_dim', player.level.dimension.toString())
})

// Compass right-click handler
ItemEvents.rightClicked(event => {
  let player = event.player
  let item = event.item

  if (item.id !== 'kubejs:compass_of_return') return

  event.cancel()

  let data = player.persistentData

  // Check cooldown
  let lastUse = data.getLong('icraft_compass_last_use') || 0
  let currentTick = player.server.tickCount
  let elapsed = currentTick - lastUse

  if (elapsed < COMPASS_COOLDOWN_TICKS && lastUse > 0) {
    let remaining = Math.ceil((COMPASS_COOLDOWN_TICKS - elapsed) / 20)
    let minutes = Math.floor(remaining / 60)
    let seconds = remaining % 60
    player.tell('\u00a7c[Compass of Return]\u00a77 Recharging... ' + minutes + 'm ' + seconds + 's remaining')
    return
  }

  // Check for stored bed position
  let bedX = data.getInt('icraft_bed_x')
  let bedY = data.getInt('icraft_bed_y')
  let bedZ = data.getInt('icraft_bed_z')
  let bedDim = data.getString('icraft_bed_dim')

  if (!bedDim || bedDim === '') {
    player.tell('\u00a7e[Compass of Return]\u00a77 You have no bed to return to. Sleep in a bed first.')
    return
  }

  // Play departure effects
  let name = player.username
  player.server.runCommandSilent(
    `playsound minecraft:entity.enderman.teleport player ${name} ~ ~ ~ 1 0.8`
  )
  player.server.runCommandSilent(
    `effect give ${name} minecraft:blindness 2 0 true`
  )

  // Teleport (handles cross-dimension)
  player.server.runCommandSilent(
    `execute in ${bedDim} run tp ${name} ${bedX} ${bedY + 1} ${bedZ}`
  )

  // Play arrival sound at destination
  player.server.runCommandSilent(
    `execute in ${bedDim} run playsound minecraft:block.respawn_anchor.set_spawn player ${name} ${bedX} ${bedY} ${bedZ} 1 1.2`
  )

  // Set cooldown
  data.putLong('icraft_compass_last_use', currentTick)

  player.tell('\u00a79[Compass of Return]\u00a77 The needle guides you home.')
})

console.log('[IridescentCraft] Compass of Return loaded')
console.log('  - Right-click to teleport to last bed')
console.log('  - 10 minute cooldown')
console.log('  - Bed position tracked on right-click interaction')
