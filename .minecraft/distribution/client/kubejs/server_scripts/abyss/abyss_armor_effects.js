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
global.tick_abyssArmorEffects = (event) => {
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
}
global.registerServerTick('tick_abyssArmorEffects', 40, 0)


// ==========================================================================
// ███ ON-HIT ARMOR SET EFFECTS (via DamageModifierRegistry) ███
// ==========================================================================
;(function(){
  var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')

  // PLAYER TAKES DAMAGE
  DR.register('icraft.abyss.armor.take', function(event) {
    var player = event.entity
    if (!(player instanceof PlayerClass)) return
    var src = event.source
    var attacker = src ? src.entity : null

    // Aberythe -- reduce poison
    if (src && src.type === 'poison') {
      var pieces = countAbyssPieces(player, 'aberythe')
      if (pieces > 0) {
        var reduction = pieces * 0.25
        event.amount = event.amount * (1.0 - Math.min(reduction, 1.0))
        if (event.amount <= 0) event.setCanceled(true)
      }
    }

    // Fusion -- explosion DR
    if (src && (src.type === 'explosion' || src.type === 'player_explosion')) {
      var fpieces = countAbyssPieces(player, 'fusion')
      if (fpieces > 0) {
        var fred = hasFullSet(player, 'fusion') ? 0.25 : (fpieces * 0.06)
        event.amount = event.amount * (1.0 - fred)
      }
    }

    if (!attacker) return

    // Glacerythe -- slow attacker
    var glacerythePieces = countAbyssPieces(player, 'glacerythe')
    if (glacerythePieces > 0) {
      try {
        if (hasFullSet(player, 'glacerythe')) {
          attacker.potionEffects.add('minecraft:slowness', 60, 1, false, true)
        } else {
          attacker.potionEffects.add('minecraft:slowness', 40, 0, false, true)
        }
      } catch(e) {}
    }

    // Ignisithe -- fire thorns
    var ignisithePieces = countAbyssPieces(player, 'ignisithe')
    if (ignisithePieces > 0) {
      try {
        if (hasFullSet(player, 'ignisithe')) {
          attacker.setSecondsOnFire(3)
        } else {
          attacker.setSecondsOnFire(1)
        }
      } catch(e) {}
    }

    // Phantom (full) -- 2% lifesteal on damage TAKEN
    if (hasFullSet(player, 'phantom')) {
      var healAmount = event.amount * 0.02
      if (healAmount > 0) player.heal(healAmount)
    }
  })

  // PLAYER DEALS DAMAGE -- Phantom lifesteal
  DR.register('icraft.abyss.armor.deal', function(event) {
    var player = event.source.entity
    if (!(player instanceof PlayerClass)) return
    if (hasFullSet(player, 'phantom')) {
      var healAmount = event.amount * 0.02
      if (healAmount > 0) player.heal(healAmount)
    }
  })
})()


console.log('[IridescentCraft] abyss_armor_effects.js loaded — 7 armor set effects active')
