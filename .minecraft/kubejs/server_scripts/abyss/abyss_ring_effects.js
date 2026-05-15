// =============================================================================
// IridescentCraft — Abyss Custom Ring Effects
// File: kubejs/server_scripts/abyss/abyss_ring_effects.js
//
// 8 custom rings replace the 30 vanilla Abyss rings.
// Effects applied via tick events (auras, passives) and hurt events (on-hit).
// Ring must be anywhere in player inventory (mainhand, offhand, or bag).
// =============================================================================

// ─── Helpers ───

function hasRingInInventory(player, ringId) {
  // Check mainhand + offhand
  if (player.mainHandItem && player.mainHandItem.id === ringId) return true
  if (player.offHandItem && player.offHandItem.id === ringId) return true
  // Check full inventory
  for (let i = 0; i < player.inventory.size; i++) {
    try {
      let stack = player.inventory.getStackInSlot(i)
      if (stack && !stack.isEmpty() && stack.id === ringId) return true
    } catch(e) {}
  }
  return false
}

function getNearbyHostileMobs(player, radius) {
  let mobs = []
  try {
    let entities = player.level.getEntitiesWithin(
      AABB.of(
        player.x - radius, player.y - radius, player.z - radius,
        player.x + radius, player.y + radius, player.z + radius
      )
    )
    entities.forEach(e => {
      if (e && e.living && e.monster && e !== player) {
        let dist = e.distanceToEntity(player)
        if (dist <= radius) mobs.push(e)
      }
    })
  } catch(e) {}
  return mobs
}

function getNearbyLivingEntities(player, radius) {
  let entities = []
  try {
    let all = player.level.getEntitiesWithin(
      AABB.of(
        player.x - radius, player.y - radius, player.z - radius,
        player.x + radius, player.y + radius, player.z + radius
      )
    )
    all.forEach(e => {
      if (e && e.living && e !== player && !e.player) {
        let dist = e.distanceToEntity(player)
        if (dist <= radius) entities.push(e)
      }
    })
  } catch(e) {}
  return entities
}


// ==========================================================================
// ███ TICK-BASED RING EFFECTS (every 20 ticks = 1 second) ███
// ==========================================================================
global.tick_abyssRingEffects = (event) => {
  event.server.players.forEach(player => {
    if (!player || !player.living) return

    // ── Ring of Shadows: Invisibility on sneak (5s, 30s cooldown) ──
    if (hasRingInInventory(player, 'kubejs:ring_of_shadows')) {
      if (player.crouching) {
        let lastUse = 0
        try { lastUse = player.persistentData.getLong('icraft_shadow_cd') } catch(e) {}
        let now = event.server.tickCount
        if (now - lastUse >= 600) { // 600 ticks = 30 seconds
          player.potionEffects.add('minecraft:invisibility', 100, 0, false, true)
          player.persistentData.putLong('icraft_shadow_cd', now)
        }
      }
    }

    // ── Ring of Embers: Fire Resistance + fire aura (1 HP/s, 4 blocks) ──
    if (hasRingInInventory(player, 'kubejs:ring_of_embers')) {
      player.potionEffects.add('minecraft:fire_resistance', 40, 0, false, false)
      let mobs = getNearbyHostileMobs(player, 4)
      mobs.forEach(mob => {
        try {
          mob.setSecondsOnFire(2)
          mob.attack('onFire', 1.0)
        } catch(e) {}
      })
    }

    // ── Ring of Frost: Slowness I to hostile mobs within 4 blocks ──
    if (hasRingInInventory(player, 'kubejs:ring_of_frost')) {
      let mobs = getNearbyHostileMobs(player, 4)
      mobs.forEach(mob => {
        try {
          mob.potionEffects.add('minecraft:slowness', 40, 0, false, false)
        } catch(e) {}
      })
    }

    // ── Ring of Void Sight: Glowing on all mobs within 16 blocks ──
    if (hasRingInInventory(player, 'kubejs:ring_of_void_sight')) {
      let mobs = getNearbyLivingEntities(player, 16)
      mobs.forEach(mob => {
        try {
          mob.potionEffects.add('minecraft:glowing', 40, 0, false, false)
        } catch(e) {}
      })
    }

    // ── Ring of the Knight: +10% attack damage, +5% knockback resistance ──
    // Applied as short-duration potion effects (Strength approximation)
    if (hasRingInInventory(player, 'kubejs:ring_of_the_knight')) {
      player.potionEffects.add('minecraft:strength', 40, 0, false, false)
    }

    // ── Ring of Unorithe: +5% max health, +5% speed ──
    // Passive stat boosts via short-duration effects
    if (hasRingInInventory(player, 'kubejs:ring_of_unorithe')) {
      player.potionEffects.add('minecraft:speed', 40, 0, false, false)
      player.potionEffects.add('minecraft:health_boost', 40, 0, false, false)
    }
  })
}
global.registerServerTick('tick_abyssRingEffects', 20, 0)


// ==========================================================================
// ███ ON-HIT RING EFFECTS — via DamageModifierRegistry (raw LivingHurtEvent) ███
// ==========================================================================
// 2026-05-15: migrated off EntityEvents.hurt (no settable damage on the
// KubeJS wrapper). Same logic, raw Forge event.
;(function(){
  var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Damage DEALT: knight, dark pact (dealt), unorithe + lifesteal.
  DR.register('icraft.abyss.rings.deal', function(event) {
    var attacker = event.source.entity
    if (!attacker || !(attacker instanceof PlayerClass)) return
    var target = event.entity
    if (!target) return

    if (hasRingInInventory(attacker, 'kubejs:ring_of_the_knight')) {
      event.amount = event.amount * 1.10
    }
    if (hasRingInInventory(attacker, 'kubejs:ring_of_dark_pact')) {
      event.amount = event.amount * 1.15
    }
    if (hasRingInInventory(attacker, 'kubejs:ring_of_unorithe')) {
      event.amount = event.amount * 1.05
      var healAmount = event.amount * 0.01
      if (healAmount > 0) attacker.heal(healAmount)
    }
  })

  // Damage TAKEN: phantom dodge (cancel), dark pact extra-taken.
  DR.register('icraft.abyss.rings.take', function(event) {
    var entity = event.entity
    if (!(entity instanceof PlayerClass)) return

    if (hasRingInInventory(entity, 'kubejs:ring_of_the_phantom')) {
      if (Math.random() < 0.10) {
        event.setCanceled(true)
        return
      }
    }
    if (hasRingInInventory(entity, 'kubejs:ring_of_dark_pact')) {
      event.amount = event.amount * 1.10
    }
  })
})()


console.log('[IridescentCraft] abyss_ring_effects.js loaded — 8 custom ring effects active')
