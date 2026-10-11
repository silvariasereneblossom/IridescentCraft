// =============================================================================
// AFK HUNGER STOP & SLEEP HUNGER PROTECTION
// Place in: kubejs/server_scripts/food/hunger_management.js
//
// Tracks player activity. If a player is AFK for 20 minutes (24000 ticks),
// applies Saturation I to freeze hunger drain. Removed when they act again.
// Also applies Saturation I while sleeping to prevent drain during sleep.
//
// 2026-10-10: `ic_lastActivity` is persisted on the player, so it is stamped
// with WORLD GAME TIME now. It used to be server.tickCount, which restarts at 0
// on every boot: a stamp from an earlier (longer) boot was "in the future", so
// the AFK check went negative and could not trigger until the new boot had run
// longer than the old stamp. The stamp is also reset the first time a freshly
// created player entity is seen (login / respawn), so time spent OFFLINE — and
// any stale pre-migration tickCount stamp — is never counted as AFK time.
// =============================================================================

// AFK threshold in ticks (20 minutes = 24000 ticks)
const AFK_THRESHOLD = 24000

// Check interval — every 100 ticks (5 seconds) to reduce overhead
const CHECK_INTERVAL = 100

global.tick_hungerManagement = (event) => {
  let server = event.server

  server.players.forEach(player => {
    let data = player.persistentData
    // Persisted clock: world game time (survives restarts; same in every dimension).
    let now = player.level.time

    // --- Track current position and state ---
    let currentX = Math.floor(player.x * 10)
    let currentY = Math.floor(player.y * 10)
    let currentZ = Math.floor(player.z * 10)
    let currentHealth = Math.floor(player.health * 10)

    let lastX = data.getInt('ic_lastX')
    let lastY = data.getInt('ic_lastY')
    let lastZ = data.getInt('ic_lastZ')
    let lastHealth = data.getInt('ic_lastHealth')
    let lastActivity = data.getLong('ic_lastActivity')

    // First check for this player entity (never stamped, just logged in or
    // respawned — player.age restarts at 0 — or a stamp ahead of the clock):
    // start the AFK window now instead of trusting an old stamp.
    if (lastActivity == 0 || lastActivity > now || player.age < CHECK_INTERVAL) {
      lastActivity = now
      data.putLong('ic_lastActivity', now)
    }

    // --- Detect activity: position changed, health changed (damage/combat) ---
    let hasMoved = (currentX != lastX || currentY != lastY || currentZ != lastZ)
    let tookDamage = (currentHealth < lastHealth && lastHealth > 0)

    if (hasMoved || tookDamage) {
      // Player is active — update last activity time
      data.putLong('ic_lastActivity', now)

      // Remove AFK saturation if it was applied
      if (data.getBoolean('ic_afkSaturation')) {
        player.removeEffect('minecraft:saturation')
        data.putBoolean('ic_afkSaturation', false)
      }
    }

    // --- Check if player is sleeping ---
    if (player.sleeping) {
      if (!data.getBoolean('ic_sleepSaturation')) {
        // Apply Saturation I while sleeping (duration refreshed each check)
        player.potionEffects.add('minecraft:saturation', CHECK_INTERVAL + 40, 0, false, false)
        data.putBoolean('ic_sleepSaturation', true)
      } else {
        // Refresh the effect while still sleeping
        player.potionEffects.add('minecraft:saturation', CHECK_INTERVAL + 40, 0, false, false)
      }
      // Reset AFK timer while sleeping — sleeping is not AFK
      data.putLong('ic_lastActivity', now)
    } else {
      // Player woke up — remove sleep saturation flag
      if (data.getBoolean('ic_sleepSaturation')) {
        data.putBoolean('ic_sleepSaturation', false)
        // Don't remove the effect immediately — let it expire naturally
        // so there's no jarring hunger tick right on wakeup
      }
    }

    // --- Check AFK threshold ---
    let ticksSinceActivity = now - data.getLong('ic_lastActivity')
    if (ticksSinceActivity >= AFK_THRESHOLD && !data.getBoolean('ic_afkSaturation')) {
      // Player has been AFK for 20+ minutes — apply Saturation I
      player.potionEffects.add('minecraft:saturation', CHECK_INTERVAL + 40, 0, false, false)
      data.putBoolean('ic_afkSaturation', true)
    } else if (data.getBoolean('ic_afkSaturation') && !player.sleeping) {
      // Refresh the saturation effect while AFK
      player.potionEffects.add('minecraft:saturation', CHECK_INTERVAL + 40, 0, false, false)
    }

    // --- Update tracking data ---
    data.putInt('ic_lastX', currentX)
    data.putInt('ic_lastY', currentY)
    data.putInt('ic_lastZ', currentZ)
    data.putInt('ic_lastHealth', currentHealth)
  })
}
global.registerServerTick('tick_hungerManagement', 100, 0)

console.log('[IridescentCraft] AFK hunger management loaded')
console.log('  - AFK threshold: 20 minutes (24000 ticks)')
console.log('  - Sleep protection: Saturation I while sleeping')
