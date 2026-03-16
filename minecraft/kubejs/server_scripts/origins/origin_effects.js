// =============================================================================
// ORIGINS CUSTOM EFFECTS
// Place in: kubejs/server_scripts/origins/origin_effects.js
//
// Handles tick-based effects for softened origin powers:
//   - Avian: altitude-based speed/jump buffs (tag: icraft_avian)
//   - Merling: land discomfort after 5 min without water (tag: icraft_merling)
// =============================================================================

// Check interval — every 40 ticks (2 seconds)
const ORIGIN_CHECK_INTERVAL = 40

// Merling: ticks dry before debuffs apply (5 minutes = 6000 ticks)
const MERLING_DRY_THRESHOLD = 6000

ServerEvents.tick(event => {
  let server = event.server

  if (server.tickCount % ORIGIN_CHECK_INTERVAL !== 0) return

  server.players.forEach(player => {
    // =========================================================================
    // AVIAN — Sky Affinity altitude buffs
    // =========================================================================
    if (player.tags.contains('icraft_avian')) {
      let y = player.y

      if (y >= 150) {
        // High altitude: Speed II + Jump Boost II + Slow Falling
        player.potionEffects.add('minecraft:speed', ORIGIN_CHECK_INTERVAL + 20, 1, false, false)
        player.potionEffects.add('minecraft:jump_boost', ORIGIN_CHECK_INTERVAL + 20, 1, false, false)
        player.potionEffects.add('minecraft:slow_falling', ORIGIN_CHECK_INTERVAL + 20, 0, false, false)
      } else if (y >= 80) {
        // Mid altitude: Speed I + Jump Boost I
        player.potionEffects.add('minecraft:speed', ORIGIN_CHECK_INTERVAL + 20, 0, false, false)
        player.potionEffects.add('minecraft:jump_boost', ORIGIN_CHECK_INTERVAL + 20, 0, false, false)
      }
      // Below Y=80: no buffs applied, existing ones expire naturally
    }

    // =========================================================================
    // MERLING — Land discomfort after extended dry time
    // =========================================================================
    if (player.tags.contains('icraft_merling')) {
      let data = player.persistentData

      // Check if player is in water or rain
      let inWater = player.isInWater() || player.isInWaterRainOrBubble()

      if (inWater) {
        // Reset dry timer when in water
        data.putLong('ic_merling_dry_since', 0)
      } else {
        // Track when player left water
        let drySince = data.getLong('ic_merling_dry_since')
        if (drySince == 0) {
          data.putLong('ic_merling_dry_since', server.tickCount)
        }

        let ticksDry = server.tickCount - data.getLong('ic_merling_dry_since')

        if (ticksDry >= MERLING_DRY_THRESHOLD) {
          // 5+ minutes on land: apply Slowness I + Mining Fatigue I
          player.potionEffects.add('minecraft:slowness', ORIGIN_CHECK_INTERVAL + 20, 0, false, true)
          player.potionEffects.add('minecraft:mining_fatigue', ORIGIN_CHECK_INTERVAL + 20, 0, false, true)
        }
      }
    }
  })
})

console.log('[IridescentCraft] Origins custom effects loaded')
console.log('  - Avian: Sky Affinity altitude buffs (Y>=80 / Y>=150)')
console.log('  - Merling: Land discomfort after 5 min dry')
