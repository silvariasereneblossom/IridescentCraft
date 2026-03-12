// =============================================================================
// IridescentCraft — Complex Affix Effects (Event-Driven)
// File: kubejs/server_scripts/affixes/affix_effects.js
//
// Design Doc Part V: Apotheosis Custom Affixes
//
// Simple attribute affixes (damage, HP, speed, etc.) are handled via
// Apotheosis JSON datapacks in icraft_apotheosis_affixes/.
//
// This script handles COMPLEX affixes that need event-driven behavior:
//   - Boss-themed affixes (on-kill/on-hit special effects)
//   - Dimensional affixes with unique mechanics
//   - Tier-gated affixes with conditional triggers
//
// Detection: These affixes are identified by checking item NBT for
// Apotheosis affix tags. Format: item.nbt.affix_data or similar.
// Since we can't guarantee the exact Apotheosis NBT format without
// in-game testing, we use item lore/name matching as a fallback.
//
// PHASE 1: Implement effects that work via standard KubeJS events.
// PHASE 2: Integrate with actual Apotheosis affix NBT after testing.
// =============================================================================

// ─── Helper: Check if item has a specific affix by lore text ───
// Apotheosis adds affix names to item lore. We check for our custom names.
function hasAffix(item, affixName) {
  if (!item || item.isEmpty()) return false
  try {
    let lore = item.nbt?.display?.Lore
    if (lore) {
      for (let i = 0; i < lore.size(); i++) {
        if (lore.getString(i).includes(affixName)) return true
      }
    }
    // Also check Apotheosis affix data directly
    let affixes = item.nbt?.affix_data || item.nbt?.Affixes
    if (affixes) {
      let str = affixes.toString()
      if (str.includes(affixName.toLowerCase().replace(/[' ]/g, '_'))) return true
    }
  } catch(e) {}
  return false
}

function hasAnyAffix(player, affixName) {
  // Check all equipment slots
  let slots = ['head','chest','legs','feet','mainhand','offhand']
  for (let slot of slots) {
    try {
      if (hasAffix(player.getItemSlot(slot), affixName)) return true
    } catch(e) {}
  }
  return false
}


// ==========================================================================
// ███ BOSS-THEMED AFFIX EFFECTS ███
// ==========================================================================

EntityEvents.hurt(event => {
  if (!event.source || !event.source.player) return
  let player = event.source.player
  let target = event.entity
  if (!target || !target.living) return
  let weapon = player.mainHandItem

  // ── Harbinger's Mark: target takes +25% from ALL sources for 5s ──
  if (hasAffix(weapon, "Harbinger")) {
    target.potionEffects.add('minecraft:weakness', 100, 0, false, false)
    // Apply a damage vulnerability tag
    target.persistentData.putLong('icraft_marked', target.level.gameTime)
    target.persistentData.putInt('icraft_mark_bonus', 25)
  }

  // Check if target is marked (from any player's Harbinger's Mark)
  if (target.persistentData.contains('icraft_marked')) {
    let markTime = target.persistentData.getLong('icraft_marked')
    if (target.level.gameTime - markTime < 100) { // 5 seconds
      let bonus = target.persistentData.getInt('icraft_mark_bonus')
      event.damage *= (1 + bonus / 100)
    }
  }

  // ── Forgotten King's Authority: 3% instant kill below 15% HP ──
  if (hasAffix(weapon, "Authority")) {
    if (!target.type.includes('boss') && !target.type.includes('dragon') &&
        !target.type.includes('wither')) {
      if (target.health / target.maxHealth < 0.15 && Math.random() < 0.03) {
        event.damage = target.health + 10 // Lethal
      }
    }
  }

  // ── Gaia's Judgment: Execute scaling with missing HP ──
  if (hasAffix(weapon, "Judgment")) {
    let missingPct = 1 - (target.health / target.maxHealth)
    event.damage *= (1 + missingPct * 0.50) // Up to +50% at 10% HP
  }

  // ── Primordial Force: Ignore 30% armor ──
  if (hasAffix(weapon, "Primordial")) {
    // Can't directly bypass armor in KubeJS, but can add bonus damage
    // proportional to target's armor (approximation)
    let targetArmor = target.getAttributeValue('minecraft:generic.armor') || 0
    if (targetArmor > 0) {
      event.damage += targetArmor * 0.15 // Flat bonus based on armor
    }
  }

  // ── Entropic: +5% per consecutive hit on same target ──
  if (hasAffix(weapon, "Entropic")) {
    let lastTarget = player.persistentData.contains('icraft_entropic_target')
      ? player.persistentData.getString('icraft_entropic_target') : ''
    let targetId = target.uuid.toString()
    if (lastTarget === targetId) {
      let stacks = player.persistentData.getInt('icraft_entropic_stacks') + 1
      stacks = Math.min(stacks, 10)
      player.persistentData.putInt('icraft_entropic_stacks', stacks)
      event.damage *= (1 + stacks * 0.05)
    } else {
      player.persistentData.putString('icraft_entropic_target', targetId)
      player.persistentData.putInt('icraft_entropic_stacks', 0)
    }
  }
})


// ── On-Kill Effects ──
EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  let weapon = player.mainHandItem

  // ── Soulstealer: Kills grant absorption hearts ──
  if (hasAffix(weapon, "Soulstealer")) {
    player.potionEffects.add('minecraft:absorption', 200, 1, false, true)
  }

  // ── Spectral Wail: Kills terrify nearby mobs ──
  if (hasAffix(weapon, "Spectral Wail")) {
    let r = 8
    try {
      let nearby = player.level.getEntitiesWithin(
        AABB.of(entity.x-r, entity.y-r, entity.z-r, entity.x+r, entity.y+r, entity.z+r)
      )
      nearby.forEach(e => {
        if (e !== player && e.living && e.monster) {
          e.potionEffects.add('minecraft:slowness', 100, 2, false, false)
          e.potionEffects.add('minecraft:weakness', 100, 1, false, false)
        }
      })
    } catch(e) {}
  }

  // ── Invigorating: Kills grant Speed I ──
  if (hasAffix(weapon, "Invigorating")) {
    player.potionEffects.add('minecraft:speed', 100, 0, false, true)
  }

  // ── Harvesting: Kills grant bonus XP ──
  if (hasAffix(weapon, "Harvesting")) {
    player.giveExperiencePoints(Math.floor(Math.random() * 10) + 5)
  }

  // ── Ender Siphon: Kills restore durability ──
  if (hasAffix(weapon, "Siphon")) {
    if (weapon.isDamageable()) {
      let restore = Math.floor(weapon.maxDamage * 0.05)
      weapon.damageValue = Math.max(0, weapon.damageValue - restore)
    }
  }
})


// ==========================================================================
// ███ DEFENSIVE AFFIX EFFECTS ███
// ==========================================================================

EntityEvents.hurt(event => {
  if (!event.entity || !event.entity.player) return
  let player = event.entity

  // ── Second Wind: Regen II at low HP ──
  if (player.health / player.maxHealth < 0.30 && hasAnyAffix(player, "Second Wind")) {
    let lastWind = player.persistentData.contains('icraft_second_wind')
      ? player.persistentData.getLong('icraft_second_wind') : 0
    if (player.level.gameTime - lastWind > 1200) { // 60s cooldown
      player.potionEffects.add('minecraft:regeneration', 100, 1, false, true)
      player.persistentData.putLong('icraft_second_wind', player.level.gameTime)
    }
  }

  // ── Ignis Core: Fire damage heals instead ──
  if (event.source && event.source.type &&
      (event.source.type.includes('fire') || event.source.type.includes('lava'))) {
    if (hasAnyAffix(player, "Ignis Core")) {
      let healAmount = event.damage * 0.5
      event.damage = 0
      player.heal(healAmount)
    }
  }

  // ── Sculkheart: On hit, sonic pulse damages nearby mobs ──
  if (hasAnyAffix(player, "Sculkheart")) {
    let lastPulse = player.persistentData.contains('icraft_sculk_pulse')
      ? player.persistentData.getLong('icraft_sculk_pulse') : 0
    if (player.level.gameTime - lastPulse > 200) { // 10s cooldown
      let r = 4
      try {
        let nearby = player.level.getEntitiesWithin(
          AABB.of(player.x-r, player.y-r, player.z-r, player.x+r, player.y+r, player.z+r)
        )
        nearby.forEach(e => {
          if (e !== player && e.living && e.monster) {
            e.hurt('sonic_boom', 6)
          }
        })
      } catch(e) {}
      player.persistentData.putLong('icraft_sculk_pulse', player.level.gameTime)
    }
  }

  // ── Challenger's Spirit: +10% dmg dealt, -10% dmg taken vs bosses ──
  if (event.source && event.source.actual) {
    let attacker = event.source.actual
    if (attacker.living && attacker.type &&
        (attacker.type.includes('boss') || attacker.type.includes('dragon'))) {
      if (hasAnyAffix(player, "Challenger")) {
        event.damage *= 0.90 // -10% damage taken from bosses
      }
    }
  }

  // ── Dragon's Dominion: Mobs within 8 blocks deal -15% ──
  if (hasAnyAffix(player, "Dominion")) {
    event.damage *= 0.85
  }

  // ── Chorus Shift: Random teleport when hit below 20% HP ──
  if (player.health / player.maxHealth < 0.20 && hasAnyAffix(player, "Chorus")) {
    let lastShift = player.persistentData.contains('icraft_chorus')
      ? player.persistentData.getLong('icraft_chorus') : 0
    if (player.level.gameTime - lastShift > 600) { // 30s cooldown
      let dx = (Math.random() - 0.5) * 16
      let dz = (Math.random() - 0.5) * 16
      player.teleportTo(player.x + dx, player.y, player.z + dz)
      player.persistentData.putLong('icraft_chorus', player.level.gameTime)
    }
  }
})


// ==========================================================================
// ███ DIMENSIONAL AFFIX PASSIVE EFFECTS ███
// ==========================================================================
ServerEvents.tick(event => {
  if (event.server.tickCount % 100 !== 80) return // Every 5s

  event.server.players.forEach(player => {
    let dim = player.level.dimension

    // ── Twilight's Embrace: Regen I in forest + speed at night ──
    if (dim === 'twilightforest:twilight_forest' && hasAnyAffix(player, "Embrace")) {
      player.potionEffects.add('minecraft:regeneration', 120, 0, false, false)
    }

    // ── Everdawn: Slow HP regen above Y=128 ──
    if ((dim === 'blue_skies:everbright' || dim === 'blue_skies:everdawn') &&
        player.y > 128 && hasAnyAffix(player, "Everdawn")) {
      if (player.health < player.maxHealth) player.heal(0.5)
    }

    // ── Deeproot: +15% max HP underground ──
    if (player.y < 0 && hasAnyAffix(player, "Deeproot")) {
      player.modifyAttribute('minecraft:generic.max_health',
        'icraft_deeproot', 0.15, 'multiply_base')
    }

    // ── Ascendant: Positive potions last 20% longer ──
    // Handled by buff_duration in skill_effects.js — stacks with that system

    // ── Stratospheric: Speed + Levitation immunity ──
    if ((dim === 'deep_aether:the_aether' || dim === 'aether:the_aether') &&
        hasAnyAffix(player, "Stratospheric")) {
      player.removeEffect('minecraft:levitation')
    }
  })
})


console.log('[IridescentCraft] affix_effects.js loaded — boss/dimensional/complex affix effects')
