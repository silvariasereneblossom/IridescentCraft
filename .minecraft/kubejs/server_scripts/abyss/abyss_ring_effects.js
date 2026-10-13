// @file kubejs/server_scripts/abyss/abyss_ring_effects.js
// @events PlayerEvents.loggedOut, hurt, tick.server
// =============================================================================
// IridescentCraft — Abyss Custom Ring Effects
// File: kubejs/server_scripts/abyss/abyss_ring_effects.js
//
// 8 custom rings replace the 30 vanilla Abyss rings.
// Effects applied via tick events (auras, passives) and hurt events (on-hit).
// Ring must be anywhere in player inventory (mainhand, offhand, or bag).
//
// 2026-10-10 revival. Until now:
//   * the on-hit half (Knight +10%, Dark Pact +15% dealt, Unorithe +5% and 1%
//     lifesteal) never ran: it read `event.source.entity`, which scripts do
//     not have (0_lib_core.js header);
//   * a ring only counted in a HAND: the bag loop was bounded by
//     `player.inventory.size`, which is undefined;
//   * Ring of Shadows never triggered (`level.gameTime` is undefined -> NaN);
//   * the Ring of Embers aura set mobs alight but its 1 HP/s never landed
//     (`mob.attack('onFire', 1)`: there is no string -> DamageSource).
//
// Whole file is one IIFE (body left at column 0); nothing here is used by
// another script.
// =============================================================================

;(function () {
// Nothing below works without the core library. A missing one is said ONCE, for
// every script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
if (!icraft.lib.need('core', 'abyss/abyss_ring_effects')) return
var core = global.icraft.core

// ─── Helpers ───

var NO_RINGS = { any: false }

// One pass over the 41 inventory slots (hotbar + bag + armour + offhand):
// -> { any: bool, '<ring id>': true, ... }
var scanRings = function (player) {
  var found = null
  try {
    var inv = player.inventory
    var size = inv.containerSize
    for (var i = 0; i < size; i++) {
      var stack = inv.getStackInSlot(i)
      if (!stack || stack.isEmpty()) continue
      var id = String(stack.id)
      if (id.indexOf('kubejs:ring_') !== 0) continue
      if (!found) found = { any: true }
      found[id] = true
    }
  } catch (e) {
    core.warnOnce('abyss.rings.scan', '[abyss_ring_effects] inventory scan threw: ' + e)
  }
  return found ? found : NO_RINGS
}

// The once-a-second tick rescans; a hit reuses that answer for up to 2 s
// instead of walking the inventory again.
var ringCache = {}   // uuid -> { t: game time, rings: {...} }
var RING_TTL = 40
var ringsOf = function (player, forceScan) {
  var key = String(player.uuid)
  var t = core.now(player)
  var entry = ringCache[key]
  if (!forceScan && entry && t >= entry.t && (t - entry.t) < RING_TTL) return entry.rings
  var rings = scanRings(player)
  ringCache[key] = { t: t, rings: rings }
  return rings
}
PlayerEvents.loggedOut(icraft.guard('abyss/abyss_ring_effects', 'PlayerEvents.loggedOut', function (event) {
  try { delete ringCache[String(event.player.uuid)] } catch (e) {}
}))

var getNearbyHostileMobs = function (player, radius) {
  var mobs = []
  try {
    var entities = player.level.getEntitiesWithin(
      AABB.of(
        player.x - radius, player.y - radius, player.z - radius,
        player.x + radius, player.y + radius, player.z + radius
      )
    )
    entities.forEach(function (e) {
      if (e && e.living && e.monster && e !== player) {
        if (e.distanceToEntity(player) <= radius) mobs.push(e)
      }
    })
  } catch (e) {}
  return mobs
}

var getNearbyLivingEntities = function (player, radius) {
  var entities = []
  try {
    var all = player.level.getEntitiesWithin(
      AABB.of(
        player.x - radius, player.y - radius, player.z - radius,
        player.x + radius, player.y + radius, player.z + radius
      )
    )
    all.forEach(function (e) {
      if (e && e.living && e !== player && !e.player) {
        if (e.distanceToEntity(player) <= radius) entities.push(e)
      }
    })
  } catch (e) {}
  return entities
}


// ==========================================================================
// ███ TICK-BASED RING EFFECTS (every 20 ticks = 1 second) ███
// ==========================================================================
var tickPlayer = function (player) {
  if (!player || !player.living) return
  var rings = ringsOf(player, true)
  if (!rings.any) return

  // ── Ring of Shadows: Invisibility on sneak (5s, 30s cooldown) ──
  if (rings['kubejs:ring_of_shadows'] && player.crouching) {
    var data = player.persistentData
    // World game time, NOT server.tickCount: the stamp is persisted on the
    // player, and tickCount restarts at 0 on every boot. (elapsed < 0 covers a
    // stamp that is somehow ahead of the clock: treat it as expired.)
    var now = core.now(player)
    var lastUse = data.contains('icraft_shadow_cd') ? Number(data.getLong('icraft_shadow_cd')) : -1
    var elapsed = now - lastUse
    if (lastUse < 0 || elapsed >= 600 || elapsed < 0) { // 600 ticks = 30 seconds
      player.potionEffects.add('minecraft:invisibility', 100, 0, false, true)
      data.putLong('icraft_shadow_cd', now)
    }
  }

  // ── Ring of Embers: Fire Resistance + fire aura (1 HP/s, 4 blocks) ──
  if (rings['kubejs:ring_of_embers']) {
    player.potionEffects.add('minecraft:fire_resistance', 40, 0, false, false)
    getNearbyHostileMobs(player, 4).forEach(function (mob) {
      try {
        mob.setSecondsOnFire(2)
        core.dealDamage(mob, 'on_fire', 1.0, player)
      } catch (e) {}
    })
  }

  // ── Ring of Frost: Slowness I to hostile mobs within 4 blocks ──
  if (rings['kubejs:ring_of_frost']) {
    getNearbyHostileMobs(player, 4).forEach(function (mob) {
      try { mob.potionEffects.add('minecraft:slowness', 40, 0, false, false) } catch (e) {}
    })
  }

  // ── Ring of Void Sight: Glowing on all mobs within 16 blocks ──
  if (rings['kubejs:ring_of_void_sight']) {
    getNearbyLivingEntities(player, 16).forEach(function (mob) {
      try { mob.potionEffects.add('minecraft:glowing', 40, 0, false, false) } catch (e) {}
    })
  }

  // ── Ring of the Knight: +10% attack damage, +5% knockback resistance ──
  // Applied as short-duration potion effects (Strength approximation)
  if (rings['kubejs:ring_of_the_knight']) {
    player.potionEffects.add('minecraft:strength', 40, 0, false, false)
  }

  // ── Ring of Unorithe: +5% max health, +5% speed ──
  // Passive stat boosts via short-duration effects
  if (rings['kubejs:ring_of_unorithe']) {
    player.potionEffects.add('minecraft:speed', 40, 0, false, false)
    player.potionEffects.add('minecraft:health_boost', 40, 0, false, false)
  }
}

global.tick_abyssRingEffects = function (event) {
  event.server.players.forEach(function (player) {
    // One player's failure must not cost the others their second.
    try { tickPlayer(player) } catch (e) {
      core.warnOnce('abyss.rings.tick', '[abyss_ring_effects] tick threw: ' + e)
    }
  })
}
global.registerServerTick('tick_abyssRingEffects', 20, 0)


// ==========================================================================
// ███ ON-HIT RING EFFECTS — via DamageModifierRegistry (raw LivingHurtEvent) ███
// ==========================================================================
// 2026-05-15: migrated off EntityEvents.hurt (no settable damage on the
// KubeJS wrapper). Same logic, raw Forge event.

// Damage DEALT: knight, dark pact (dealt), unorithe + lifesteal.
core.onHurt('icraft.abyss.rings.deal', function (event, ctx) {
  var attacker = ctx.attacker
  var rings = ringsOf(attacker, false)
  if (!rings.any) return

  if (rings['kubejs:ring_of_the_knight']) {
    event.amount = event.amount * 1.10
  }
  if (rings['kubejs:ring_of_dark_pact']) {
    event.amount = event.amount * 1.15
  }
  if (rings['kubejs:ring_of_unorithe']) {
    event.amount = event.amount * 1.05
    var healAmount = core.finite(event.amount * 0.01, 0)
    if (healAmount > 0) attacker.heal(healAmount)
  }
}, 'attackerPlayer')

// Damage TAKEN: phantom dodge (cancel), dark pact extra-taken.
core.onHurt('icraft.abyss.rings.take', function (event, ctx) {
  var entity = ctx.victim
  var rings = ringsOf(entity, false)
  if (!rings.any) return

  if (rings['kubejs:ring_of_the_phantom']) {
    if (Math.random() < 0.10) {
      event.setCanceled(true)
      return
    }
  }
  if (rings['kubejs:ring_of_dark_pact']) {
    event.amount = event.amount * 1.10
  }
}, 'victimPlayer')

console.log('[IridescentCraft] abyss_ring_effects.js loaded — 8 custom ring effects active')
})()
