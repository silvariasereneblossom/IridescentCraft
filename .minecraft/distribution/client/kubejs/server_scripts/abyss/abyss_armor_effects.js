// @file kubejs/server_scripts/abyss/abyss_armor_effects.js
// @events hurt, tick.server
// =============================================================================
// IridescentCraft — Abyss Armor Set Effects
// File: kubejs/server_scripts/abyss/abyss_armor_effects.js
//
// Applies per-piece and full-set bonuses for The Abyss armor sets.
// Checked every 40 ticks (2 seconds) for passives, on-hit for reactives.
//
// Sets: Garnite, Aberythe, Incorythe, Fusion, Phantom,
//       Glacerythe, Ignisithe
//
// 2026-10-10 revival. Until now:
//   * Phantom's lifesteal on damage DEALT never ran (`event.source.entity`);
//   * the whole attacker half of the damage-TAKEN handler never ran for the
//     same reason (Glacerythe slow, Ignisithe fire thorns, Phantom heal);
//   * Aberythe / Fusion compared `src.type` (a function object) to 'poison' /
//     'explosion', so neither reduction ever applied. Poison has no damage
//     type of its own in 1.20.1 -- the effect deals unattributed
//     minecraft:magic -- so it is recognised as exactly that while Poison is
//     active;
//   * Garnite's "full set in the Abyss" Haste II never applied
//     (`level.dimension` is a ResourceLocation: no includes()).
//
// Whole file is one IIFE (body left at column 0); nothing here is used by
// another script.
// =============================================================================

;(function () {
// Nothing below works without the core library. A missing one is said ONCE, for
// every script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
if (!icraft.lib.need('core', 'abyss/abyss_armor_effects')) return
var core = global.icraft.core

// ─── Helpers ───

// item ids are theabyss:<set>_armor_<piece>
var ABYSS_SETS = ['garnite', 'aberythe', 'incorythe', 'fusion', 'phantom', 'glacerythe', 'ignisithe']
var ABYSS_PREFIX = 'theabyss:'

var armorIdAt = function (player, index) {
  var item = null
  try {
    if (index === 0) item = player.headArmorItem
    else if (index === 1) item = player.chestArmorItem
    else if (index === 2) item = player.legsArmorItem
    else item = player.feetArmorItem
    if (item && !item.isEmpty()) return String(item.id)
  } catch (e) {}
  return ''
}

// One pass over the four armour slots -> { garnite: 0..4, ..., any: bool }
var piecesOf = function (player) {
  var counts = { any: false }
  for (var s = 0; s < ABYSS_SETS.length; s++) counts[ABYSS_SETS[s]] = 0
  for (var i = 0; i < 4; i++) {
    var id = armorIdAt(player, i)
    if (id.indexOf(ABYSS_PREFIX) !== 0) continue
    for (var k = 0; k < ABYSS_SETS.length; k++) {
      if (id.indexOf(ABYSS_PREFIX + ABYSS_SETS[k] + '_') === 0) {
        counts[ABYSS_SETS[k]]++
        counts.any = true
        break
      }
    }
  }
  return counts
}

var isInAbyss = function (player) {
  try { return String(player.level.dimension).indexOf('theabyss') >= 0 } catch (e) {}
  return false
}


// ==========================================================================
// ███ TICK-BASED ARMOR SET EFFECTS (every 40 ticks = 2 seconds) ███
// ==========================================================================
var tickPlayer = function (player) {
  if (!player || !player.living) return
  var pieces = piecesOf(player)
  if (!pieces.any) return

  // ── Garnite Set: Mining speed bonus ──
  // Per piece: +3% mining speed (approximated via Haste)
  // Full set in Abyss: +15% mining speed (Haste II)
  if (pieces.garnite > 0) {
    if (pieces.garnite >= 4 && isInAbyss(player)) {
      player.potionEffects.add('minecraft:haste', 60, 1, false, false)
    } else if (pieces.garnite >= 2) {
      player.potionEffects.add('minecraft:haste', 60, 0, false, false)
    }
  }

  // ── Aberythe Set: Poison resistance/immunity ──
  // Full set: complete poison immunity — remove poison on tick
  // Per piece: on-hit poison reduction handled in the hurt handler
  if (pieces.aberythe >= 4) {
    try { player.removeEffect('minecraft:poison') } catch (e) {}
  }

  // ── Incorythe Set: Night Vision + Darkness immunity ──
  // Full set only
  if (pieces.incorythe >= 4) {
    player.potionEffects.add('minecraft:night_vision', 300, 0, false, false)
    try { player.removeEffect('minecraft:darkness') } catch (e) {}
  }

  // ── Fusion Set: Explosion resistance ──
  // Per piece: +6% (hurt handler). Full set: Resistance I on top.
  if (pieces.fusion >= 4) {
    player.potionEffects.add('minecraft:resistance', 60, 0, false, false)
  }

  // ── Phantom Set: Invisibility while sneaking ──
  // Full set: Invisibility while crouching
  if (pieces.phantom >= 4 && player.crouching) {
    player.potionEffects.add('minecraft:invisibility', 60, 0, false, false)
  }

  // ── Glacerythe Set: Cold immunity (freeze resistance) ──
  // Full set: remove any freezing tick
  if (pieces.glacerythe >= 4) {
    try {
      if (player.ticksFrozen > 0) player.setTicksFrozen(0)
    } catch (e) {}
  }

  // ── Ignisithe Set: Fire immunity ──
  // Per piece: Fire Resistance
  // Full set: complete fire immunity
  if (pieces.ignisithe > 0) {
    player.potionEffects.add('minecraft:fire_resistance', 60, 0, false, false)
    if (pieces.ignisithe >= 4) {
      try {
        if (player.remainingFireTicks > 0) player.setRemainingFireTicks(0)
      } catch (e) {}
    }
  }
}

global.tick_abyssArmorEffects = function (event) {
  event.server.players.forEach(function (player) {
    try { tickPlayer(player) } catch (e) {
      core.warnOnce('abyss.armor.tick', '[abyss_armor_effects] tick threw: ' + e)
    }
  })
}
global.registerServerTick('tick_abyssArmorEffects', 40, 0)


// ==========================================================================
// ███ ON-HIT ARMOR SET EFFECTS (via DamageModifierRegistry) ███
// ==========================================================================

// A poison tick: unattributed minecraft:magic while the Poison effect is active.
var isPoisonTick = function (player, source, attacker) {
  if (attacker) return false
  if (core.dmgId(source) !== 'minecraft:magic') return false
  try { return player.hasEffect('minecraft:poison') === true } catch (e) { return false }
}

// PLAYER TAKES DAMAGE
core.onHurt('icraft.abyss.armor.take', function (event, ctx) {
  var player = ctx.victim
  var pieces = piecesOf(player)
  if (!pieces.any) return
  var src = ctx.source
  var attacker = ctx.attacker

  // Aberythe -- reduce poison (25% per piece)
  if (pieces.aberythe > 0 && isPoisonTick(player, src, attacker)) {
    var reduction = pieces.aberythe * 0.25
    event.amount = event.amount * (1.0 - Math.min(reduction, 1.0))
    if (!(event.amount > 0)) {
      event.setCanceled(true)
      return
    }
  }

  // Fusion -- explosion DR (6% per piece, 25% for the full set)
  if (pieces.fusion > 0 && core.isExplosion(src)) {
    var fred = (pieces.fusion >= 4) ? 0.25 : (pieces.fusion * 0.06)
    event.amount = event.amount * (1.0 - fred)
  }

  if (!attacker || attacker === player || !attacker.living) return

  // Glacerythe -- slow attacker
  if (pieces.glacerythe > 0) {
    try {
      if (pieces.glacerythe >= 4) {
        attacker.potionEffects.add('minecraft:slowness', 60, 1, false, true)
      } else {
        attacker.potionEffects.add('minecraft:slowness', 40, 0, false, true)
      }
    } catch (e) {}
  }

  // Ignisithe -- fire thorns
  if (pieces.ignisithe > 0) {
    try {
      attacker.setSecondsOnFire(pieces.ignisithe >= 4 ? 3 : 1)
    } catch (e) {}
  }

  // Phantom (full) -- 2% lifesteal on damage TAKEN
  if (pieces.phantom >= 4) {
    var healTaken = core.finite(event.amount * 0.02, 0)
    if (healTaken > 0) player.heal(healTaken)
  }
}, 'victimPlayer')

// PLAYER DEALS DAMAGE -- Phantom lifesteal
core.onHurt('icraft.abyss.armor.deal', function (event, ctx) {
  var player = ctx.attacker
  if (piecesOf(player).phantom >= 4) {
    var healDealt = core.finite(event.amount * 0.02, 0)
    if (healDealt > 0) player.heal(healDealt)
  }
}, 'attackerPlayer')

console.log('[IridescentCraft] abyss_armor_effects.js loaded — 7 armor set effects active')
})()
