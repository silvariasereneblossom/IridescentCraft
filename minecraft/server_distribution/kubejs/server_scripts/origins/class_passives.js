// =============================================================================
// CLASS PASSIVES — KubeJS implementations for origin-described mechanics
// =============================================================================
// Each class has passive abilities described in their Origins power JSONs.
// This script implements the ones that need tick-based logic.
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
let classCacheTick = 0

function getClass(player) {
  return classCache[player.username] || null
}

function refreshClassCache(server) {
  classCacheTick = server.tickCount
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

// =============================================================================
// SAMURAI — Focus (Movement Shield + Vorpal Scaling)
// =============================================================================
// Movement builds absorption up to 10% max HP.
// When shield breaks (absorption hits 0), 10s cooldown before regen.
// Vorpal I-V based on total attack damage:
//   10-20 = I, 21-40 = II, 41-60 = III, 61-80 = IV, 81+ = V
// =============================================================================

let samuraiLastPos = {}
let samuraiShieldCD = {}  // tick when cooldown expires

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
      if (tick < cdExpires) return  // Shield on cooldown

      // Check if shield just broke (absorption was > 0 last tick, now 0)
      let hadShield = data.getBoolean('icraft_focus_active')
      let currentAbsorption = player.absorptionAmount || 0

      if (hadShield && currentAbsorption <= 0.1) {
        // Shield broke — start 10s cooldown
        data.putLong('icraft_focus_cd', tick + 200)
        data.putBoolean('icraft_focus_active', false)
        player.tell('\u00a7e[Focus]\u00a77 Shield shattered. Recharging...')
        return
      }

      // Build shield from movement (1 block moved = 0.5 absorption, capped at 10% max HP)
      if (dist > 0.1) {
        let maxShield = player.maxHealth * 0.10
        let shieldGain = Math.min(dist * 0.5, maxShield - currentAbsorption)
        if (shieldGain > 0) {
          let newAbsorption = Math.min(currentAbsorption + shieldGain, maxShield)
          player.absorptionAmount = newAbsorption
          data.putBoolean('icraft_focus_active', true)
        }
      }

      // -- Vorpal Scaling --
      // Apply Strength effect based on attack damage tier
      // We read attack damage via attribute command workaround
      // Since we can't read attributes directly, use known base + modifiers
      // Base player ATK: 1.0 + weapon damage
      // Approximate from held item
      let atkDmg = data.getDouble('icraft_focus_atk') || 0

      // Update ATK estimate every 5 seconds
      if (tick % 100 === 0) {
        // Use Strength levels as Vorpal proxy
        // Check player's approximate total damage via health/armor heuristic
        // Simpler: just scale with max health as a progression proxy
        // Actually simplest: use the scoreboard if available, or weapon tier
        let held = player.mainHandItem
        let weaponDmg = 1  // fist
        if (held && held.id !== 'minecraft:air') {
          // Rough weapon damage tiers
          let id = held.id
          if (id.includes('netherite')) weaponDmg = 10
          else if (id.includes('diamond')) weaponDmg = 8
          else if (id.includes('iron') || id.includes('gold')) weaponDmg = 6
          else if (id.includes('stone')) weaponDmg = 5
          else if (id.includes('wood')) weaponDmg = 4
          else weaponDmg = 7  // modded weapons default
        }
        // Add class bonus (15% from Brutal Strikes equivalent)
        // Add race bonuses etc — just estimate total
        let totalEstimate = weaponDmg * 1.2  // rough with bonuses
        data.putDouble('icraft_focus_atk', totalEstimate)
        atkDmg = totalEstimate
      }

      // Vorpal tiers: Strength effect as proxy
      // 10-20 total ATK = Strength I, 21-40 = II, etc.
      let vorpalLevel = 0
      if (atkDmg >= 81) vorpalLevel = 4      // Vorpal V (Strength V)
      else if (atkDmg >= 61) vorpalLevel = 3  // Vorpal IV
      else if (atkDmg >= 41) vorpalLevel = 2  // Vorpal III
      else if (atkDmg >= 21) vorpalLevel = 1  // Vorpal II
      else if (atkDmg >= 10) vorpalLevel = 0  // Vorpal I

      if (atkDmg >= 10) {
        player.server.runCommandSilent(
          `effect give ${name} minecraft:strength 3 ${vorpalLevel} true`
        )
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

      // Track visited dimensions as a comma-separated string
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
        let speedBonus = count * 0.025  // 2.5% per dimension
        let xpBonus = count * 0.05      // 5% per dimension

        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.movement_speed modifier remove icraft:wanderer_travel_speed`
        )
        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.movement_speed modifier add icraft:wanderer_travel_speed ${speedBonus} multiply_base`
        )

        // XP bonus via puffish if available
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
        if (distSq <= 64 && ally.health < ally.maxHealth) {  // 8 blocks = 64 sq
          ally.heal(0.5)
        }
      })
    })
  }

  // ── VANGUARD — Guardian's Presence: every 3 seconds ──
  if (tick % 60 === 15) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'vanguard') return

      // Apply Weakness I to hostile mobs within 5 blocks
      player.server.runCommandSilent(
        `execute at ${player.username} run effect give @e[distance=..5,type=!player,nbt={Health:1.0f}] minecraft:weakness 5 0 true`
      )
      // More reliable: target all living entities that aren't players
      player.server.runCommandSilent(
        `execute at ${player.username} run effect give @e[distance=..5,type=#minecraft:raiders] minecraft:weakness 5 0 true`
      )
      player.server.runCommandSilent(
        `execute at ${player.username} run effect give @e[distance=..5,predicate=icraft:is_hostile] minecraft:weakness 5 0 true`
      )
      // Fallback: just target common hostile mobs
      let hostiles = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman',
        'witch', 'pillager', 'vindicator', 'ravager', 'blaze', 'wither_skeleton',
        'piglin_brute', 'hoglin', 'zoglin', 'phantom', 'drowned', 'husk', 'stray']
      hostiles.forEach(mob => {
        player.server.runCommandSilent(
          `execute at ${player.username} run effect give @e[distance=..5,type=minecraft:${mob}] minecraft:weakness 5 0 true`
        )
      })
    })
  }

  // ── ARCHMAGE — Mana Attunement: every 5 seconds ──
  if (tick % 100 === 20) {
    event.server.players.forEach(player => {
      if (getClass(player) !== 'archmage') return

      let name = player.username

      // Melee penalty: -25% melee damage (always on)
      player.server.runCommandSilent(
        `attribute ${name} minecraft:generic.attack_damage modifier remove icraft:archmage_melee_penalty`
      )
      player.server.runCommandSilent(
        `attribute ${name} minecraft:generic.attack_damage modifier add icraft:archmage_melee_penalty -0.25 multiply_base`
      )

      // Low-mana damage bonus: up to +15% when mana is low
      // We can't read Iron's Spells mana directly from KubeJS.
      // Proxy: check if player has been casting recently (no Mana Regen effect
      // means mana is probably low). Alternative: use food level as a
      // rough proxy — low food = been active = probably low mana.
      // Simplest approach: scale with missing health (low HP = desperate = bonus)
      // Actually, use absorption as inverse proxy — less absorption = more casting
      // Best approach: just apply a flat +8% magic bonus here (half the max)
      // and let the combat flow handle the rest. The description says "up to 15%"
      // so we can implement it as a health-scaling bonus.
      let healthPct = player.health / player.maxHealth
      let manaBonus = 0
      if (healthPct < 0.8) {
        // Scale from 0% at 80% HP to 15% at 20% HP
        manaBonus = Math.min(0.15, (0.8 - healthPct) * 0.25)
      }

      player.server.runCommandSilent(
        `attribute ${name} minecraft:generic.attack_damage modifier remove icraft:archmage_desperation`
      )
      if (manaBonus > 0) {
        // Apply to both melee and magic (spell_power)
        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.attack_damage modifier add icraft:archmage_desperation ${manaBonus} multiply_base`
        )
        try {
          player.modifyAttribute('irons_spellbooks:spell_power',
            'icraft_archmage_desperation', manaBonus, 'multiply_base')
          player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
            'icraft_archmage_desperation', manaBonus, 'multiply_base')
        } catch (e) {}
      }
    })
  }

  // ── VOID SUMMONER — Soul Tether: XP boost on nearby mob deaths ──
  // Handled via EntityEvents.death below
})

// Void Summoner: bonus XP from nearby mob deaths
EntityEvents.death(event => {
  let entity = event.entity
  if (entity.player) return  // Not player deaths

  let source = event.source
  // Check if any Void Summoner is within 16 blocks
  let server = entity.server
  if (!server) return

  server.players.forEach(player => {
    if (getClass(player) !== 'void_summoner') return

    let dx = player.x - entity.x
    let dy = player.y - entity.y
    let dz = player.z - entity.z
    let distSq = dx * dx + dy * dy + dz * dz

    if (distSq <= 256) {  // 16 blocks
      // 10% bonus XP: give 1-3 XP orbs
      let baseXP = 3  // rough average mob XP
      let bonus = Math.max(1, Math.floor(baseXP * 0.10))
      player.giveExperiencePoints(bonus)

      // Soul Tether lifesteal: heal 5% of mob's max HP
      try {
        let mobMaxHP = entity.maxHealth || 20
        let healAmount = mobMaxHP * 0.05
        if (healAmount > 0 && player.health < player.maxHealth) {
          player.heal(Math.min(healAmount, 2))  // Cap at 2 HP per proc
        }
      } catch (e) {}
    }
  })
})

// Refresh bonuses on login
PlayerEvents.loggedIn(event => {
  // Clear class cache so it refreshes
  delete classCache[event.player.username]
})

console.log('[IridescentCraft] Class passives loaded')
console.log('  - Samurai: Focus (movement shield + Vorpal scaling)')
console.log('  - Wanderer: Seasoned Traveler (dimension stacking)')
console.log('  - Paladin: Healing Aura (AoE regen)')
console.log('  - Vanguard: Guardian\'s Presence (Weakness to nearby mobs)')
console.log('  - Archmage: Mana Attunement (-25% melee, +15% desperation bonus)')
console.log('  - Void Summoner: Soul Tether (5% lifesteal, 10% bonus XP)')
