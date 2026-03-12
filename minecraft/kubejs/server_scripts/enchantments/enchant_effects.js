// =============================================================================
// IridescentCraft — Custom Enchantment Effects
// File: kubejs/server_scripts/enchantments/enchant_effects.js
//
// Design Doc Part VI: 24 Custom Enchantments
// Registration in startup_scripts/custom_enchantments.js
//
// Helper: getEnchLevel checks equipped items for a specific enchantment level.
// Effects are applied via EntityEvents.hurt, PlayerEvents.tick, and BlockEvents.
// =============================================================================

// ─── Helpers ───

function getEnchLevel(entity, enchId) {
  // Check all armor slots + mainhand + offhand for the enchantment
  let maxLevel = 0
  let slots = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand']
  slots.forEach(slot => {
    try {
      let item = entity.getItemSlot(slot)
      if (item && !item.isEmpty()) {
        let enchants = item.enchantments
        if (enchants) {
          let lvl = enchants.getLevel(enchId)
          if (lvl > maxLevel) maxLevel = lvl
        }
      }
    } catch(e) {}
  })
  return maxLevel
}

function getWeaponEnchLevel(entity, enchId) {
  try {
    let item = entity.mainHandItem
    if (item && !item.isEmpty() && item.enchantments) {
      return item.enchantments.getLevel(enchId)
    }
  } catch(e) {}
  return 0
}

function getArmorEnchTotal(entity, enchId) {
  // Sum enchantment levels across all armor pieces
  let total = 0
  ;['head','chest','legs','feet'].forEach(slot => {
    try {
      let item = entity.getItemSlot(slot)
      if (item && !item.isEmpty() && item.enchantments) {
        total += item.enchantments.getLevel(enchId)
      }
    } catch(e) {}
  })
  return total
}

function isBoss(type) {
  return type.includes('boss') || type.includes('dragon') || type.includes('wither') ||
    type.includes('guardian') || type.includes('naga') || type.includes('lich') ||
    type.includes('hydra') || type.includes('ghast') || type.includes('doppleganger') ||
    type.includes('ignis') || type.includes('harbinger') || type.includes('leviathan') ||
    type.includes('remnant') || type.includes('blossom') || type.includes('golem') ||
    type.includes('fortuna') || type.includes('rosalyne') || type.includes('swampjaw') ||
    type.includes('bellringer') || type.includes('sorcerer') || type.includes('storm') ||
    type.includes('senshi') || type.includes('slider') || type.includes('valkyrie') ||
    type.includes('sun_spirit') || type.includes('eots') || type.includes('forgotten') ||
    type.includes('stalker') || type.includes('shattered')
}


// ==========================================================================
// ███ DAMAGE DEALT BY PLAYER (weapon enchants) ███
// ==========================================================================
EntityEvents.hurt(event => {
  if (!event.source || !event.source.player) return
  let player = event.source.player
  let target = event.entity
  if (!target || !target.living) return

  // ── Titan Slayer: +4% damage per level vs entities with >100 HP ──
  let titan = getWeaponEnchLevel(player, 'icraft:titan_slayer')
  if (titan > 0 && target.maxHealth > 100) {
    let bonus = 1 + (titan * 0.04) * (target.maxHealth / 100)
    event.damage *= Math.min(bonus, 1 + titan * 0.20) // Cap at +20% per level
  }

  // ── Adrenaline: +6% damage per level when player below 30% HP ──
  let adren = getWeaponEnchLevel(player, 'icraft:adrenaline')
  if (adren > 0 && player.health / player.maxHealth < 0.30) {
    event.damage *= (1 + adren * 0.06)
  }

  // ── Crowd Control: +5% damage per level per nearby enemy (3 block radius) ──
  let crowd = getWeaponEnchLevel(player, 'icraft:crowd_control')
  if (crowd > 0) {
    let r = 3.0
    let nearbyCount = 0
    try {
      let nearby = player.level.getEntitiesWithin(
        AABB.of(player.x-r, player.y-r, player.z-r, player.x+r, player.y+r, player.z+r)
      )
      nearby.forEach(e => {
        if (e !== player && e.living && e.monster) nearbyCount++
      })
    } catch(e) {}
    if (nearbyCount > 1) {
      let bonus = Math.min(nearbyCount - 1, 5) * crowd * 0.05
      event.damage *= (1 + bonus)
    }
  }

  // ── Nemesis: +3% damage per hit against same boss (tracked via NBT) ──
  let nemesis = getWeaponEnchLevel(player, 'icraft:nemesis')
  if (nemesis > 0 && isBoss(target.type)) {
    let key = 'icraft_nemesis_' + target.type.replace(':', '_')
    let stacks = player.persistentData.contains(key)
      ? player.persistentData.getInt(key) : 0
    stacks = Math.min(stacks + 1, 10 * nemesis) // Cap at 10 stacks per level
    player.persistentData.putInt(key, stacks)
    event.damage *= (1 + stacks * 0.03)
  }

  // ── Momentum: +attack speed stacking with consecutive hits ──
  let momentum = getWeaponEnchLevel(player, 'icraft:momentum')
  if (momentum > 0) {
    let momStacks = player.persistentData.contains('icraft_momentum')
      ? player.persistentData.getInt('icraft_momentum') : 0
    momStacks = Math.min(momStacks + 1, 5 * momentum)
    player.persistentData.putInt('icraft_momentum', momStacks)
    player.persistentData.putLong('icraft_momentum_time', player.level.gameTime)
    // Apply speed via attribute
    try {
      player.modifyAttribute('minecraft:generic.attack_speed',
        'icraft_momentum_bonus', momStacks * 0.02, 'multiply_base')
    } catch(e) {}
  }

  // ── Primal Force: +3% damage per level based on food saturation ──
  let primal = getWeaponEnchLevel(player, 'icraft:primal_force')
  if (primal > 0) {
    let saturation = player.foodData ? player.foodData.saturationLevel : 0
    let bonus = primal * 0.03 * (saturation / 5.0) // Normalized to ~5 max saturation
    event.damage *= (1 + Math.min(bonus, primal * 0.15))
  }

  // ── Mana Temper: bonus damage scaling with mana (Iron's Spells) ──
  // Can't directly read mana pool from KubeJS. Approximate: check if player
  // has magic items equipped and apply flat bonus.
  let manaTemp = getWeaponEnchLevel(player, 'icraft:mana_temper')
  if (manaTemp > 0) {
    // Check offhand for magic items (staves, spellbooks, source gems)
    let offhand = player.offHandItem
    let hasMagic = offhand && (offhand.id.includes('spell') || offhand.id.includes('staff') ||
      offhand.id.includes('wand') || offhand.id.includes('source') || offhand.id.includes('mana'))
    if (hasMagic) {
      event.damage *= (1 + manaTemp * 0.08) // +8% per level when dual-wielding magic
    }
  }
})


// ==========================================================================
// ███ DAMAGE TAKEN BY PLAYER (armor enchants) ███
// ==========================================================================
EntityEvents.hurt(event => {
  if (!event.entity || !event.entity.player) return
  let player = event.entity
  let source = event.source

  // ── Heatward: -8% fire damage per level ──
  if (source && (source.type.includes('fire') || source.type.includes('lava') ||
      source.type === 'minecraft:on_fire' || source.type === 'minecraft:in_fire')) {
    let heat = getArmorEnchTotal(player, 'icraft:heatward')
    if (heat > 0) {
      event.damage *= Math.max(0.1, 1 - heat * 0.08)
    }
  }

  // ── Voidward: -8% void/wither/darkness damage per level ──
  if (source && (source.type.includes('void') || source.type.includes('wither') ||
      source.type === 'minecraft:out_of_world')) {
    let voidw = getArmorEnchTotal(player, 'icraft:voidward')
    if (voidw > 0) {
      event.damage *= Math.max(0.1, 1 - voidw * 0.08)
    }
  }

  // ── Depthstrider Custom: -10% damage per level below Y=0 ──
  if (player.y < 0) {
    let depth = getArmorEnchTotal(player, 'icraft:depthstrider_custom')
    if (depth > 0) {
      event.damage *= Math.max(0.2, 1 - depth * 0.10)
    }
  }

  // ── Boss Ward: -5% damage per level from boss entities ──
  if (source && source.actual && isBoss(source.actual.type)) {
    let ward = getArmorEnchTotal(player, 'icraft:boss_ward')
    if (ward > 0) {
      event.damage *= Math.max(0.2, 1 - ward * 0.05)
    }
  }

  // ── Adaptive: After taking 3 hits of same type, gain resistance ──
  let adaptive = getArmorEnchTotal(player, 'icraft:adaptive')
  if (adaptive > 0 && source) {
    let dmgType = source.type || 'generic'
    let key = 'icraft_adapt_' + dmgType
    let hits = player.persistentData.contains(key) ? player.persistentData.getInt(key) : 0
    hits++
    player.persistentData.putInt(key, Math.min(hits, 10))
    if (hits >= 3) {
      let reduction = Math.min((hits - 2) * adaptive * 0.03, 0.30)
      event.damage *= (1 - reduction)
    }
  }

  // ── Phalanx: -6% damage per level when blocking ──
  let phalanx = getEnchLevel(player, 'icraft:phalanx')
  if (phalanx > 0 && player.isBlocking()) {
    event.damage *= Math.max(0.1, 1 - phalanx * 0.06)
  }

  // ── Last Stand: Survive lethal hit at 1 HP (5 min cooldown) ──
  let lastStand = getArmorEnchTotal(player, 'icraft:last_stand')
  if (lastStand > 0 && event.damage >= player.health) {
    let lastUsed = player.persistentData.contains('icraft_last_stand_time')
      ? player.persistentData.getLong('icraft_last_stand_time') : 0
    let now = player.level.gameTime
    if (now - lastUsed > 6000) { // 5 minute cooldown (6000 ticks)
      event.damage = player.health - 1.0
      player.persistentData.putLong('icraft_last_stand_time', now)
      player.potionEffects.add('minecraft:absorption', 100, 1, false, true)
      player.potionEffects.add('minecraft:resistance', 40, 2, false, true) // 2s invuln
      player.tell('§6§lLast Stand activated! §r§7(5 min cooldown)')
    }
  }

  // ── Warp Shield: Resist ender displacement (End mechanic) ──
  // This is checked in dimension_mechanics.js where displacement is applied.
  // Enchantment presence reduces teleport chance.

  // ── RF Capacitance: Damage reduction scaling with... RF items in inventory ──
  // Approximate: check if player has energy storage items (Mekanism, Thermal)
  let rfCap = getArmorEnchTotal(player, 'icraft:rf_capacitance')
  if (rfCap > 0) {
    // Check for energy items in inventory as proxy for "stored RF"
    let hasEnergy = false
    for (let i = 0; i < player.inventory.size; i++) {
      try {
        let item = player.inventory.get(i)
        if (item && (item.id.includes('energy_cube') || item.id.includes('flux') ||
            item.id.includes('capacitor') || item.id.includes('battery') ||
            item.id.includes('cell'))) {
          hasEnergy = true
          break
        }
      } catch(e) {}
    }
    if (hasEnergy) {
      event.damage *= Math.max(0.3, 1 - rfCap * 0.04)
    }
  }
})


// ==========================================================================
// ███ BLOCK BREAK EFFECTS (tool enchants) ███
// ==========================================================================
BlockEvents.broken(event => {
  if (!event.player) return
  let player = event.player
  let blockId = event.block.id

  // ── Prospector: Bonus ore drops (stacks with Fortune) ──
  if (blockId.includes('_ore')) {
    let prosp = getWeaponEnchLevel(player, 'icraft:prospector')
    if (prosp > 0 && Math.random() < prosp * 0.10) { // 10% per level
      // Double the normal drop
      event.block.popItem(event.block.item)
    }
  }

  // ── Lumberjack: Fell connected logs (up to level * 16 blocks) ──
  if (blockId.includes('log') || blockId.includes('stem')) {
    let lj = getWeaponEnchLevel(player, 'icraft:lumberjack')
    if (lj > 0) {
      let maxBlocks = lj * 16
      let pos = event.block.pos
      let level = player.level
      let toBreak = []
      let checked = new Set()
      let queue = [pos]

      while (queue.length > 0 && toBreak.length < maxBlocks) {
        let current = queue.shift()
        let key = `${current.x},${current.y},${current.z}`
        if (checked.has(key)) continue
        checked.add(key)

        let block = level.getBlock(current.x, current.y, current.z)
        if (block && (block.id.includes('log') || block.id.includes('stem'))) {
          if (current !== pos) toBreak.push(current)
          // Check adjacent blocks (6 directions + 2 diagonals up)
          ;[
            {x:0,y:1,z:0}, {x:1,y:0,z:0}, {x:-1,y:0,z:0},
            {x:0,y:0,z:1}, {x:0,y:0,z:-1},
            {x:1,y:1,z:0}, {x:-1,y:1,z:0}, {x:0,y:1,z:1}, {x:0,y:1,z:-1}
          ].forEach(d => {
            queue.push({x: current.x+d.x, y: current.y+d.y, z: current.z+d.z})
          })
        }
      }

      // Break all connected logs
      toBreak.forEach(p => {
        let block = level.getBlock(p.x, p.y, p.z)
        if (block) {
          block.popItem(block.item)
          level.destroyBlock(p, false)
        }
      })
    }
  }
})


// ==========================================================================
// ███ PERIODIC TICK EFFECTS ███
// ==========================================================================
ServerEvents.tick(event => {
  let tick = event.server.tickCount

  // ── Every 2 seconds: Vitality HP bonus ──
  if (tick % 40 === 0) {
    event.server.players.forEach(player => {
      let vit = getArmorEnchTotal(player, 'icraft:vitality')
      if (vit > 0) {
        // +2 HP per total Vitality level across armor
        try {
          player.modifyAttribute('minecraft:generic.max_health',
            'icraft_vitality_bonus', vit * 2, 'addition')
        } catch(e) {}
      }
    })
  }

  // ── Every 2 seconds: Magnetism pickup range ──
  if (tick % 40 === 10) {
    event.server.players.forEach(player => {
      let mag = getArmorEnchTotal(player, 'icraft:magnetism')
      if (mag <= 0) return

      let range = 2.0 + mag * 1.5 // Base 2 + 1.5 per level
      let items = player.level.getEntitiesWithin(
        AABB.of(player.x-range, player.y-range, player.z-range,
                player.x+range, player.y+range, player.z+range)
      )
      items.forEach(e => {
        if (e.type === 'minecraft:item' && e.age > 10) {
          // Pull item toward player
          let dx = player.x - e.x
          let dy = player.y - e.y
          let dz = player.z - e.z
          let dist = Math.sqrt(dx*dx + dy*dy + dz*dz)
          if (dist > 0.5 && dist < range) {
            e.setDeltaMovement(dx/dist * 0.3, dy/dist * 0.3 + 0.05, dz/dist * 0.3)
          }
        }
      })
    })
  }

  // ── Every 5 seconds: Momentum decay ──
  if (tick % 100 === 0) {
    event.server.players.forEach(player => {
      let lastHit = player.persistentData.contains('icraft_momentum_time')
        ? player.persistentData.getLong('icraft_momentum_time') : 0
      let now = player.level.gameTime
      if (now - lastHit > 100) { // 5 seconds without hitting
        player.persistentData.putInt('icraft_momentum', 0)
        try {
          player.modifyAttribute('minecraft:generic.attack_speed',
            'icraft_momentum_bonus', 0, 'multiply_base')
        } catch(e) {}
      }
    })
  }

  // ── Every 5 seconds: Steadfast knockback resistance near bosses ──
  if (tick % 100 === 20) {
    event.server.players.forEach(player => {
      let stead = getArmorEnchTotal(player, 'icraft:steadfast')
      if (stead <= 0) return

      // Check if any boss entities within 32 blocks
      let r = 32
      let nearBoss = false
      try {
        let nearby = player.level.getEntitiesWithin(
          AABB.of(player.x-r, player.y-r, player.z-r, player.x+r, player.y+r, player.z+r)
        )
        nearby.forEach(e => {
          if (e.living && isBoss(e.type)) nearBoss = true
        })
      } catch(e) {}

      if (nearBoss) {
        player.modifyAttribute('minecraft:generic.knockback_resistance',
          'icraft_steadfast_bonus', stead * 0.15, 'addition')
      } else {
        player.modifyAttribute('minecraft:generic.knockback_resistance',
          'icraft_steadfast_bonus', 0, 'addition')
      }
    })
  }

  // ── Every 2 seconds: Aether Acclimation (remove thin air debuffs) ──
  if (tick % 40 === 30) {
    event.server.players.forEach(player => {
      let aether = getArmorEnchTotal(player, 'icraft:aether_acclimation')
      if (aether <= 0) return

      let dim = player.level.dimension
      if (dim === 'aether:the_aether' || dim === 'deep_aether:the_aether') {
        // Remove Slowness and Mining Fatigue from thin air
        if (player.y > 192 + (aether * 32)) return // Still too high even for enchant
        player.removeEffect('minecraft:slowness')
        player.removeEffect('minecraft:mining_fatigue')
      }
    })
  }

  // ── Every 2 seconds: Quick Draw (bow draw speed) ──
  if (tick % 40 === 35) {
    event.server.players.forEach(player => {
      let qd = getWeaponEnchLevel(player, 'icraft:quick_draw')
      if (qd <= 0) return
      let held = player.mainHandItem
      if (held && (held.id.includes('bow') || held.id.includes('crossbow'))) {
        // Grant attack speed bonus as proxy for draw speed
        try {
          player.modifyAttribute('minecraft:generic.attack_speed',
            'icraft_quick_draw', qd * 0.15, 'multiply_base')
        } catch(e) {}
      }
    })
  }

  // ── Every 10 seconds: Adaptive decay (reduce tracked damage type stacks) ──
  if (tick % 200 === 0) {
    event.server.players.forEach(player => {
      // Decay all adaptive stacks by 1
      let data = player.persistentData
      try {
        let keys = data.allKeys
        if (keys) {
          keys.forEach(key => {
            if (key.startsWith('icraft_adapt_')) {
              let val = data.getInt(key)
              if (val > 0) data.putInt(key, val - 1)
              if (val <= 1) data.remove(key)
            }
          })
        }
      } catch(e) {}
    })
  }
})


// ==========================================================================
// ███ CONVERGENCE: Spell power scales with weapon tier ███
// Applied via attribute sync — checks mainhand weapon material tier
// ==========================================================================
ServerEvents.tick(event => {
  if (event.server.tickCount % 200 !== 75) return
  event.server.players.forEach(player => {
    let conv = getWeaponEnchLevel(player, 'icraft:convergence')
    if (conv <= 0) return

    let weapon = player.mainHandItem
    if (!weapon || weapon.isEmpty()) return

    // Determine weapon material tier
    let id = weapon.id
    let tierBonus = 0
    if (id.includes('netherite')) tierBonus = 0.20
    else if (id.includes('diamond') || id.includes('terrasteel')) tierBonus = 0.15
    else if (id.includes('steel') || id.includes('manasteel')) tierBonus = 0.10
    else if (id.includes('iron')) tierBonus = 0.05

    if (tierBonus > 0) {
      try {
        player.modifyAttribute('irons_spellbooks:spell_power',
          'icraft_convergence_sync', conv * tierBonus, 'multiply_base')
      } catch(e) {}
    }
  })
})


console.log('[IridescentCraft] enchant_effects.js loaded — 24 custom enchantment effects')
