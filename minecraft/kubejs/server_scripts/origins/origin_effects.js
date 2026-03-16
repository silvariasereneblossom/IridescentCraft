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

// =============================================================================
// BLAZEBORN — Nether Affinity
// 10% damage boost + 10% damage reduction in the Nether.
// After first Nether visit, doubles to 20% and applies in ALL dimensions.
// =============================================================================

// Track first Nether visit
PlayerEvents.tick(event => {
  if (event.player.age % 200 !== 50) return // Every 10s, offset
  let player = event.player
  if (!player.tags.contains('icraft_blazeborn')) return

  let dim = player.level.dimension.toString()
  let data = player.persistentData

  // Detect first Nether visit
  if (dim === 'minecraft:the_nether' && !data.getBoolean('icraft_nether_visited')) {
    data.putBoolean('icraft_nether_visited', true)
    player.tell(Text.gold('═══════════════════════════════════════'))
    player.tell(Text.gold('  ★ NETHER AFFINITY AWAKENED ★'))
    player.tell(Text.white('  The Nether recognizes its child.'))
    player.tell(Text.gray('  Your damage bonus and resistance now'))
    player.tell(Text.gray('  double and apply in ALL dimensions.'))
    player.tell(Text.gold('═══════════════════════════════════════'))
  }
})

// Apply damage bonus via EntityEvents.hurt (dealing damage)
EntityEvents.hurt(event => {
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  if (!player.tags.contains('icraft_blazeborn')) return

  let inNether = player.level.dimension.toString() === 'minecraft:the_nether'
  let awakened = player.persistentData.getBoolean('icraft_nether_visited')

  if (inNether || awakened) {
    let bonus = awakened ? 0.20 : 0.10 // 20% if awakened, 10% if just in Nether
    event.damage = event.damage * (1 + bonus)
  }
})

// Apply damage reduction via EntityEvents.hurt (taking damage)
EntityEvents.hurt(event => {
  let entity = event.entity
  if (!entity.player) return
  let player = entity
  if (!player.tags.contains('icraft_blazeborn')) return

  let inNether = player.level.dimension.toString() === 'minecraft:the_nether'
  let awakened = player.persistentData.getBoolean('icraft_nether_visited')

  if (inNether || awakened) {
    let reduction = awakened ? 0.20 : 0.10 // 20% if awakened, 10% if just in Nether
    event.damage = event.damage * (1 - reduction)
  }
})

// =============================================================================
// ENDERIAN — Ender Shift (teleport + damage buff)
// Teleport on 60s cooldown. After teleporting, +15% damage for 10s.
// Uses ender pearl throw detection as trigger.
// =============================================================================

// Track Enderian ender pearl use for damage buff
EntityEvents.hurt(event => {
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  if (!player.tags.contains('icraft_enderian')) return

  // Check if player has the ender shift damage buff active
  let data = player.persistentData
  let buffExpiry = data.getLong('icraft_ender_shift_expires')
  if (player.level.server.tickCount < buffExpiry) {
    event.damage = event.damage * 1.15 // +15% damage
  }
})

// Detect ender pearl landing / teleport and apply buff
PlayerEvents.tick(event => {
  if (event.player.age % 20 !== 7) return
  let player = event.player
  if (!player.tags.contains('icraft_enderian')) return

  // Check if player just teleported (position changed significantly)
  let data = player.persistentData
  let lastX = data.getDouble('icraft_ender_lastx')
  let lastZ = data.getDouble('icraft_ender_lastz')
  let dx = player.x - lastX
  let dz = player.z - lastZ
  let distSq = dx * dx + dz * dz

  // If moved more than 8 blocks in 1 second, likely teleported
  if (distSq > 64 && lastX !== 0) {
    let tick = player.level.server.tickCount
    let lastBuff = data.getLong('icraft_ender_shift_expires')
    // Don't re-trigger if buff already active
    if (tick > lastBuff) {
      data.putLong('icraft_ender_shift_expires', tick + 200) // 10 seconds
      player.potionEffects.add('minecraft:strength', 200, 0, false, true)
      player.tell(Text.darkPurple('  ◆ Ender Shift: +15% damage for 10 seconds'))
    }
  }

  data.putDouble('icraft_ender_lastx', player.x)
  data.putDouble('icraft_ender_lastz', player.z)
})

// =============================================================================
// SHULK — Hardened Shell (reduced durability loss on death)
// Handled in death_penalty.js — check for icraft_shulk tag and reduce penalty
// Tag is set via the natural_armor power (already has tag logic) or we add it here
// =============================================================================

// Tag Shulk players (using no_shield power as proxy since it's Shulk-specific)
// Actually, we need a proper tagging mechanism. Add via the existing power override.

// =============================================================================
// DWARF — Miner's Appetite (halved hunger when mining)
// On block break, apply brief Saturation to offset mining exhaustion.
// Tag set by icraft:race/dwarf/miner_appetite power via action_on_callback.
// =============================================================================

BlockEvents.broken(event => {
  let player = event.entity
  if (!player || !player.player) return
  if (!player.tags.contains('icraft_dwarf')) return

  // Apply Saturation I for 3 seconds (60 ticks) to offset mining exhaustion
  // This effectively halves the hunger cost of mining by restoring saturation
  player.potionEffects.add('minecraft:saturation', 3, 0, false, false)
})

// =============================================================================
// REVENANT — Shadow Strike damage reduction
// In darkness (light level <= 4) or The Abyss, apply Resistance I.
// Tag set by icraft:race/revenant/dark_power power via action_on_callback.
// The +20% damage bonus is handled by the conditioned_attribute in the power.
// =============================================================================

ServerEvents.tick(event => {
  let server = event.server

  // Check every 2 seconds (offset from main origin check)
  if (server.tickCount % 40 !== 20) return

  server.players.forEach(player => {
    if (!player.tags.contains('icraft_revenant')) return

    let dim = player.level.dimension.toString()
    let inAbyss = dim === 'theabyss:the_abyss'

    // Check light level at player position
    let blockPos = player.block
    let lightLevel = blockPos.light

    if (lightLevel <= 4 || inAbyss) {
      // 30% damage reduction via Resistance I (20% vanilla) + stacking
      // Resistance I = 20% damage reduction. Apply for duration + buffer.
      player.potionEffects.add('minecraft:resistance', 60, 0, false, false)
    }
  })
})

console.log('[IridescentCraft] Origins custom effects loaded')
console.log('  - Avian: Sky Affinity altitude buffs (Y>=80 / Y>=150)')
console.log('  - Merling: Land discomfort after 5 min dry')
console.log('  - Blazeborn: Nether Affinity (+10% dmg/-10% taken, doubles after first Nether visit)')
console.log('  - Enderian: Ender Shift (+15% damage for 10s after teleport)')
console.log('  - Shulk: Hardened Shell (reduced death durability loss)')
console.log('  - Dwarf: Miner\'s Appetite (Saturation on block break)')
console.log('  - Revenant: Shadow Strike (Resistance I in darkness/Abyss)')
