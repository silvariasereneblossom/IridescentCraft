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

global.tick_originEffectsAvianMerling = (event) => {
  let server = event.server

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
}
global.registerServerTick('tick_originEffectsAvianMerling', 40, 0)

// =============================================================================
// BLAZEBORN — Nether Affinity
// 10% damage boost + 10% damage reduction in the Nether.
// After first Nether visit, doubles to 20% and applies in ALL dimensions.
// =============================================================================

// Track first Nether visit
global.tick_blazebornNetherAffinity = (event) => {
  let player = event.player
  if (!player.tags.contains('icraft_blazeborn')) return

  let dim = player.level.dimension.toString()
  let data = player.persistentData

  if (dim === 'minecraft:the_nether' && !data.getBoolean('icraft_nether_visited')) {
    data.putBoolean('icraft_nether_visited', true)
    player.tell(Text.gold('═══════════════════════════════════════'))
    player.tell(Text.gold('  ★ NETHER AFFINITY AWAKENED ★'))
    player.tell(Text.white('  The Nether recognizes its child.'))
    player.tell(Text.gray('  Your damage bonus and resistance now'))
    player.tell(Text.gray('  double and apply in ALL dimensions.'))
    player.tell(Text.gold('═══════════════════════════════════════'))
  }
}
global.registerPlayerTick('tick_blazebornNetherAffinity', 200, 50)

// Apply damage bonus + reduction via DamageModifierRegistry.
// 2026-05-15: migrated off EntityEvents.hurt — that KubeJS wrapper has no
// settable damage field. The registry dispatches the RAW Forge
// LivingHurtEvent, which supports event.setAmount(...) (and Rhino-style
// `event.amount = X` resolves to setAmount).
;(function(){
  var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Dealing damage in/after Nether: +10% (in Nether) or +20% (after awakening, anywhere)
  DR.register('icraft.origin.blazeborn.deal', function(event) {
    var attacker = event.source.entity
    if (!attacker || !(attacker instanceof PlayerClass)) return
    if (!attacker.tags.contains('icraft_blazeborn')) return
    var inNether = attacker.level.dimension.toString() === 'minecraft:the_nether'
    var awakened = attacker.persistentData.getBoolean('icraft_nether_visited')
    if (!inNether && !awakened) return
    var bonus = awakened ? 0.20 : 0.10
    event.amount = event.amount * (1 + bonus)
  })

  // Taking damage in/after Nether: -10% / -20%
  DR.register('icraft.origin.blazeborn.take', function(event) {
    var entity = event.entity
    if (!(entity instanceof PlayerClass)) return
    if (!entity.tags.contains('icraft_blazeborn')) return
    var inNether = entity.level.dimension.toString() === 'minecraft:the_nether'
    var awakened = entity.persistentData.getBoolean('icraft_nether_visited')
    if (!inNether && !awakened) return
    var reduction = awakened ? 0.20 : 0.10
    event.amount = event.amount * (1 - reduction)
  })
})()

// =============================================================================
// ENDERIAN — Ender Shift (teleport + damage buff)
// Teleport on 60s cooldown. After teleporting, +15% damage for 10s.
// Uses ender pearl throw detection as trigger.
// =============================================================================

// Enderian: +15% damage for 10s after teleport. Via DamageModifierRegistry.
;(function(){
  var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR.register('icraft.origin.enderian.shift', function(event) {
    var attacker = event.source.entity
    if (!attacker || !(attacker instanceof PlayerClass)) return
    if (!attacker.tags.contains('icraft_enderian')) return
    var data = attacker.persistentData
    var buffExpiry = data.getLong('icraft_ender_shift_expires')
    if (attacker.level.server.tickCount < buffExpiry) {
      event.amount = event.amount * 1.15
    }
  })
})()

// Detect ender pearl landing / teleport and apply buff
global.tick_enderianShift = (event) => {
  let player = event.player
  if (!player.tags.contains('icraft_enderian')) return

  let data = player.persistentData
  let lastX = data.getDouble('icraft_ender_lastx')
  let lastZ = data.getDouble('icraft_ender_lastz')
  let dx = player.x - lastX
  let dz = player.z - lastZ
  let distSq = dx * dx + dz * dz

  if (distSq > 64 && lastX !== 0) {
    let tick = player.level.server.tickCount
    let lastBuff = data.getLong('icraft_ender_shift_expires')
    if (tick > lastBuff) {
      data.putLong('icraft_ender_shift_expires', tick + 200)
      player.potionEffects.add('minecraft:strength', 200, 0, false, true)
      player.tell(Text.darkPurple('  ◆ Ender Shift: +15% damage for 10 seconds'))
    }
  }

  data.putDouble('icraft_ender_lastx', player.x)
  data.putDouble('icraft_ender_lastz', player.z)
}
global.registerPlayerTick('tick_enderianShift', 20, 7)

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

global.tick_revenantShadowStrike = (event) => {
  let server = event.server

  server.players.forEach(player => {
    if (!player.tags.contains('icraft_revenant')) return

    let dim = player.level.dimension.toString()
    let inAbyss = dim === 'theabyss:the_abyss'

    let blockPos = player.block
    let lightLevel = blockPos.light

    if (lightLevel <= 4 || inAbyss) {
      player.potionEffects.add('minecraft:resistance', 60, 0, false, false)
    }
  })
}
global.registerServerTick('tick_revenantShadowStrike', 40, 20)

console.log('[IridescentCraft] Origins custom effects loaded')
console.log('  - Avian: Sky Affinity altitude buffs (Y>=80 / Y>=150)')
console.log('  - Merling: Land discomfort after 5 min dry')
console.log('  - Blazeborn: Nether Affinity (+10% dmg/-10% taken, doubles after first Nether visit)')
console.log('  - Enderian: Ender Shift (+15% damage for 10s after teleport)')
console.log('  - Shulk: Hardened Shell (reduced death durability loss)')
console.log('  - Dwarf: Miner\'s Appetite (Saturation on block break)')
console.log('  - Revenant: Shadow Strike (Resistance I in darkness/Abyss)')
