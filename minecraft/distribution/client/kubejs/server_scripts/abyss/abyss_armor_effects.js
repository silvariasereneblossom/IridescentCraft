// =============================================================================
// IridescentCraft — Abyss Armor Set Effects
// File: kubejs/server_scripts/abyss/abyss_armor_effects.js
//
// Applies per-piece and full-set bonuses for The Abyss armor sets.
// Checked every 40 ticks (2 seconds) for passives, on-hit for reactives.
//
// Sets: Garnite, Aberythe, Incorythe, Fusion, Phantom,
//       Glacerythe, Ignisithe
// =============================================================================

// ─── Helpers ───

const ABYSS_ARMOR_SETS = {
  garnite:     { prefix: 'theabyss:garnite_',     slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  aberythe:    { prefix: 'theabyss:aberythe_',    slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  incorythe:   { prefix: 'theabyss:incorythe_',   slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  fusion:      { prefix: 'theabyss:fusion_',      slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  phantom:     { prefix: 'theabyss:phantom_',     slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  glacerythe:  { prefix: 'theabyss:glacerythe_',  slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
  ignisithe:   { prefix: 'theabyss:ignisithe_',   slots: ['helmet', 'chestplate', 'leggings', 'boots'] },
}

function getArmorId(player, slot) {
  try {
    let item
    if (slot === 'head') item = player.headArmorItem
    else if (slot === 'chest') item = player.chestArmorItem
    else if (slot === 'legs') item = player.legsArmorItem
    else if (slot === 'feet') item = player.feetArmorItem
    if (item && !item.isEmpty()) return item.id
  } catch(e) {}
  return ''
}

function countAbyssPieces(player, setName) {
  let info = ABYSS_ARMOR_SETS[setName]
  if (!info) return 0
  let count = 0
  let slotMap = ['head', 'chest', 'legs', 'feet']
  slotMap.forEach(slot => {
    let id = getArmorId(player, slot)
    if (id.startsWith(info.prefix)) count++
  })
  return count
}

function hasFullSet(player, setName) {
  return countAbyssPieces(player, setName) >= 4
}

function isInAbyss(player) {
  try {
    return player.level.dimension.includes('theabyss')
  } catch(e) {}
  return false
}


// ==========================================================================
// ███ TICK-BASED ARMOR SET EFFECTS (every 40 ticks = 2 seconds) ███
// ==========================================================================
ServerEvents.tick(event => {
  if (event.server.tickCount % 40 !== 0) return

  event.server.players.forEach(player => {
    if (!player || !player.living) return

    // ── Garnite Set: Mining speed bonus ──
    // Per piece: +3% mining speed (approximated via Haste)
    // Full set in Abyss: +15% mining speed (Haste II)
    let garnitePieces = countAbyssPieces(player, 'garnite')
    if (garnitePieces > 0) {
      if (hasFullSet(player, 'garnite') && isInAbyss(player)) {
        player.potionEffects.add('minecraft:haste', 60, 1, false, false)
      } else if (garnitePieces >= 2) {
        player.potionEffects.add('minecraft:haste', 60, 0, false, false)
      }
    }

    // ── Aberythe Set: Poison resistance/immunity ──
    // Per piece: reduces poison duration (simulated via poison resistance)
    // Full set: complete poison immunity — remove poison on tick
    let aberythePieces = countAbyssPieces(player, 'aberythe')
    if (aberythePieces > 0) {
      if (hasFullSet(player, 'aberythe')) {
        // Full set: remove any active poison effect
        try { player.removeEffect('minecraft:poison') } catch(e) {}
      }
      // Per piece: no active buff, but on-hit poison reduction handled in hurt event
    }

    // ── Incorythe Set: Night Vision + Darkness immunity ──
    // Full set only
    if (hasFullSet(player, 'incorythe')) {
      player.potionEffects.add('minecraft:night_vision', 300, 0, false, false)
      try { player.removeEffect('minecraft:darkness') } catch(e) {}
    }

    // ── Fusion Set: Explosion resistance ──
    // Per piece: +6% (approximated via Resistance at full set)
    // Full set: +25% explosion resistance (Resistance I)
    let fusionPieces = countAbyssPieces(player, 'fusion')
    if (fusionPieces > 0) {
      if (hasFullSet(player, 'fusion')) {
        player.potionEffects.add('minecraft:resistance', 60, 0, false, false)
      }
    }

    // ── Phantom Set: Invisibility while sneaking + partial transparency ──
    // Full set: Invisibility while crouching
    if (hasFullSet(player, 'phantom')) {
      if (player.crouching) {
        player.potionEffects.add('minecraft:invisibility', 60, 0, false, false)
      }
    }

    // ── Glacerythe Set: Cold immunity (freeze resistance) ──
    // Full set: remove any freezing tick + fire resistance against powdered snow
    if (hasFullSet(player, 'glacerythe')) {
      try {
        if (player.ticksFrozen > 0) {
          player.setTicksFrozen(0)
        }
      } catch(e) {}
    }

    // ── Ignisithe Set: Fire immunity ──
    // Per piece: Fire Resistance
    // Full set: complete fire immunity
    let ignisithePieces = countAbyssPieces(player, 'ignisithe')
    if (ignisithePieces > 0) {
      player.potionEffects.add('minecraft:fire_resistance', 60, 0, false, false)
      if (hasFullSet(player, 'ignisithe')) {
        try {
          if (player.remainingFireTicks > 0) player.setRemainingFireTicks(0)
        } catch(e) {}
      }
    }
  })
})


// ==========================================================================
// ███ ON-HIT ARMOR SET EFFECTS (player takes damage) ███
// ==========================================================================
EntityEvents.hurt(event => {
  if (!event.entity || !event.entity.player) return
  let player = event.entity
  let attacker = event.source ? event.source.actual : null

  // ── Aberythe Set: Reduce/negate poison damage ──
  // Full set handled in tick (removes poison entirely)
  // Per piece: reduce poison damage by 25% per piece
  if (event.source && event.source.type === 'poison') {
    let pieces = countAbyssPieces(player, 'aberythe')
    if (pieces > 0) {
      let reduction = pieces * 0.25
      event.damage = event.damage * (1.0 - Math.min(reduction, 1.0))
      if (event.damage <= 0) event.cancel()
    }
  }

  // ── Fusion Set: Explosion damage reduction ──
  if (event.source && (event.source.type === 'explosion' || event.source.type === 'player_explosion')) {
    let pieces = countAbyssPieces(player, 'fusion')
    if (pieces > 0) {
      let reduction = hasFullSet(player, 'fusion') ? 0.25 : (pieces * 0.06)
      event.damage = event.damage * (1.0 - reduction)
    }
  }

  if (!attacker || !attacker.living) return

  // ── Glacerythe Set: Freeze attackers ──
  // Full set: Slowness II for 3s on attacker
  // Per piece: Slowness I for 2s on attacker
  let glacerythePieces = countAbyssPieces(player, 'glacerythe')
  if (glacerythePieces > 0) {
    try {
      if (hasFullSet(player, 'glacerythe')) {
        attacker.potionEffects.add('minecraft:slowness', 60, 1, false, true)
      } else {
        attacker.potionEffects.add('minecraft:slowness', 40, 0, false, true)
      }
    } catch(e) {}
  }

  // ── Ignisithe Set: Fire thorns ──
  // Full set: attacker ignites for 3s
  // Per piece: attacker ignites for 1s
  let ignisithePieces = countAbyssPieces(player, 'ignisithe')
  if (ignisithePieces > 0) {
    try {
      if (hasFullSet(player, 'ignisithe')) {
        attacker.setSecondsOnFire(3)
      } else {
        attacker.setSecondsOnFire(1)
      }
    } catch(e) {}
  }

  // ── Phantom Set: 2% life steal (full set only) ──
  // On taking damage, heal 2% of the damage back
  if (hasFullSet(player, 'phantom')) {
    let healAmount = event.damage * 0.02
    if (healAmount > 0) {
      player.heal(healAmount)
    }
  }
})


// ==========================================================================
// ███ ON-HIT ARMOR SET EFFECTS (player deals damage — life steal) ███
// ==========================================================================
EntityEvents.hurt(event => {
  if (!event.source || !event.source.player) return
  let player = event.source.player

  // ── Phantom Set: 2% life steal on attacks (full set only) ──
  if (hasFullSet(player, 'phantom')) {
    let healAmount = event.damage * 0.02
    if (healAmount > 0) {
      player.heal(healAmount)
    }
  }
})


console.log('[IridescentCraft] abyss_armor_effects.js loaded — 7 armor set effects active')
