// =============================================================================
// CLASS PASSIVES — KubeJS implementations for origin-described mechanics
// =============================================================================

// ── Helper: check class origin ──
function hasClass(player, className) {
  try {
    let r = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:${className}"}]}}}]`
    )
    return r > 0
  } catch (e) {
    return false
  }
}

// Cache class lookups per player (refreshed every 30s)
let classCache = {}

function getClass(player) {
  return classCache[player.username] || null
}

function refreshClassCache(server) {
  let classes = ['berserker', 'samurai', 'battlemage', 'wanderer', 'paladin',
    'vanguard', 'ranger', 'archmage', 'artificer', 'void_summoner']
  server.players.forEach(p => {
    classCache[p.username] = null
    for (let c of classes) {
      if (hasClass(p, c)) {
        classCache[p.username] = c
        break
      }
    }
  })
}

// ── Helper: detect progression tier from visited dimensions ──
function getPlayerTier(player) {
  let data = player.persistentData
  let tier = data.getInt('icraft_detected_tier') || 1
  let dim = player.level.dimension.toString()

  // Update tier based on current dimension (only goes up)
  if (dim.includes('the_end') || dim.includes('otherside') || dim.includes('the_abyss')) {
    tier = Math.max(tier, 4)
  } else if (dim.includes('the_nether') || dim.includes('undergarden')) {
    tier = Math.max(tier, 3)
  } else if (dim.includes('twilight') || dim.includes('aether') || dim.includes('blue_skies') ||
             dim.includes('everbright') || dim.includes('everdawn')) {
    tier = Math.max(tier, 2)
  }

  data.putInt('icraft_detected_tier', tier)
  return tier
}


// =============================================================================
// SAMURAI — Focus (Movement Shield + Vorpal Scaling)
// =============================================================================
// Movement builds a shield tracked in persistentData (NOT absorption).
// Shield displayed as absorption but managed carefully to avoid conflicts.
// If shield HP depletes, 10s cooldown before it can rebuild.
// Vorpal I-V via Strength effect, scaling with progression tier.
// =============================================================================

ServerEvents.tick(event => {
  let tick = event.server.tickCount

  // Refresh class cache every 30 seconds
  if (tick % 600 === 0) refreshClassCache(event.server)

  // ── SAMURAI FOCUS: every 1 second ──
  if (tick % 20 === 0) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'samurai') return

      let name = player.username
      let data = player.persistentData

      // -- Vorpal: Strength based on progression tier --
      let tier = getPlayerTier(player)
      // T1 = Strength I (amp 0), T2 = II, T3 = III, T4 = IV, beyond = V
      let vorpalAmp = Math.min(tier - 1, 4)
      player.server.runCommandSilent(
        `effect give ${name} minecraft:strength 3 ${vorpalAmp} true`
      )

      // -- Movement Shield --
      let lastX = data.getDouble('icraft_focus_x') || player.x
      let lastZ = data.getDouble('icraft_focus_z') || player.z
      let dx = player.x - lastX
      let dz = player.z - lastZ
      let dist = Math.sqrt(dx * dx + dz * dz)

      data.putDouble('icraft_focus_x', player.x)
      data.putDouble('icraft_focus_z', player.z)

      // Check cooldown
      let cdExpires = data.getLong('icraft_focus_cd') || 0
      if (tick < cdExpires) return  // Shield on cooldown, don't touch anything

      let shieldHP = data.getDouble('icraft_focus_shield') || 0
      let maxShield = player.maxHealth * 0.10

      // Detect shield damage: if current absorption < our shield, damage was taken
      let currentAbsorption = player.absorptionAmount || 0
      if (shieldHP > 0 && currentAbsorption < shieldHP) {
        // Shield took damage (or golden apple wore off — but if our shield was
        // lower than a golden apple's absorption, this won't trigger)
        shieldHP = Math.max(0, currentAbsorption)
        data.putDouble('icraft_focus_shield', shieldHP)

        if (shieldHP <= 0) {
          // Shield broke — start 10s cooldown
          data.putLong('icraft_focus_cd', tick + 200)
          data.putDouble('icraft_focus_shield', 0)
          player.tell('\u00a7e[Focus]\u00a77 Shield shattered. Recharging...')
          return
        }
      }

      // Build shield from movement
      if (dist > 0.1 && shieldHP < maxShield) {
        let gain = Math.min(dist * 0.5, maxShield - shieldHP)
        shieldHP = Math.min(shieldHP + gain, maxShield)
        data.putDouble('icraft_focus_shield', shieldHP)

        // Only set absorption if our shield > current absorption
        // This prevents overwriting golden apple / totem absorption
        if (shieldHP > currentAbsorption) {
          player.absorptionAmount = shieldHP
        }
      }
    })
  }

  // ── WANDERER — Seasoned Traveler: every 5 seconds ──
  if (tick % 100 === 5) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'wanderer') return

      let name = player.username
      let data = player.persistentData
      let currentDim = player.level.dimension.toString()

      // Track visited dimensions
      let visited = data.getString('icraft_wanderer_dims') || ''
      let dimList = visited ? visited.split(',') : []

      if (!dimList.includes(currentDim)) {
        dimList.push(currentDim)
        data.putString('icraft_wanderer_dims', dimList.join(','))
        let count = dimList.length
        player.tell('\u00a7a[Seasoned Traveler]\u00a77 New dimension discovered! (' + count + ' total)')
        player.tell('\u00a77  +' + (count * 5) + '% XP, +' + (count * 2.5).toFixed(1) + '% speed')
      }

      // Apply bonuses based on dimension count
      let count = dimList.length
      if (count > 0) {
        let speedBonus = count * 0.025
        let xpBonus = count * 0.05

        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.movement_speed modifier remove icraft:wanderer_travel_speed`
        )
        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.movement_speed modifier add icraft:wanderer_travel_speed ${speedBonus} multiply_base`
        )

        try {
          player.modifyAttribute('puffish_attributes:experience',
            'icraft_wanderer_travel_xp', xpBonus, 'multiply_base')
        } catch (e) {}
      }
    })
  }

  // ── PALADIN — Healing Aura: every 5 seconds ──
  if (tick % 100 === 10) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'paladin') return

      // Self-heal: 1 HP/5s when above 50% HP
      if (player.health > player.maxHealth * 0.5 && player.health < player.maxHealth) {
        player.heal(1)
      }

      // Heal nearby allies: 0.5 HP/5s within 8 blocks
      let px = player.x, py = player.y, pz = player.z
      event.server.players.forEach(ally => {
        if (ally.username === player.username) return
        let dx = ally.x - px, dy = ally.y - py, dz = ally.z - pz
        let distSq = dx * dx + dy * dy + dz * dz
        if (distSq <= 64 && ally.health < ally.maxHealth) {
          ally.heal(0.5)
        }
      })
    })
  }

  // ── VANGUARD — Guardian's Presence: every 3 seconds ──
  // Weakness only affects melee attack damage, so applying it to passive
  // mobs (cows, pigs, etc.) has zero effect. Safe to target all non-player
  // living entities within range.
  if (tick % 60 === 15) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'vanguard') return

      player.server.runCommandSilent(
        `execute at ${player.username} run effect give @e[distance=..5,type=!player,type=!item,type=!experience_orb,type=!arrow,type=!area_effect_cloud] minecraft:weakness 5 0 true`
      )
    })
  }
})

// =============================================================================
// VOID SUMMONER — Soul Tether (lifesteal + bonus XP from nearby deaths)
// =============================================================================

EntityEvents.death(event => {
  let entity = event.entity
  if (entity.player) return

  let server = entity.server
  if (!server) return

  server.players.forEach(player => {
    if (getClass(player) !== 'void_summoner') return

    let dx = player.x - entity.x
    let dy = player.y - entity.y
    let dz = player.z - entity.z
    let distSq = dx * dx + dy * dy + dz * dz

    if (distSq <= 256) {  // 16 blocks
      // 10% bonus XP
      let bonus = Math.max(1, Math.floor(3 * 0.10))
      player.giveExperiencePoints(bonus)

      // 5% lifesteal from mob max HP, capped at 2 HP
      try {
        let mobMaxHP = entity.maxHealth || 20
        let heal = Math.min(mobMaxHP * 0.05, 2)
        if (heal > 0 && player.health < player.maxHealth) {
          player.heal(heal)
        }
      } catch (e) {}
    }
  })
})

// Refresh cache on login
PlayerEvents.loggedIn(event => {
  delete classCache[event.player.username]
})

console.log('[IridescentCraft] Class passives loaded')
console.log('  - Samurai: Focus (movement shield + Vorpal by tier)')
console.log('  - Wanderer: Seasoned Traveler (dimension stacking)')
console.log('  - Paladin: Healing Aura (AoE regen)')
console.log('  - Vanguard: Guardian\'s Presence (Weakness to nearby entities)')
console.log('  - Void Summoner: Soul Tether (5% lifesteal, 10% bonus XP)')
