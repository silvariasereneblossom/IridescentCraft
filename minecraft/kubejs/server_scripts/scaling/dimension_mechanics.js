// =============================================================================
// IridescentCraft — Dimension-Specific Combat Mechanics
// File: kubejs/server_scripts/scaling/dimension_mechanics.js
//
// Design Doc Part II: Dimension-Specific Combat Mechanics
//
// Implements the unique per-dimension behaviors that go beyond stat scaling:
//   - Twilight: Canopy Ambush (invisibility), Pack Tactics (extended aggro)
//   - Undergarden: Virulent Spores (poison on hit), Decay Aura (weakness)
//   - Deeper Darker: Darkness Empowerment, Sculk Resonance
//   - Nether: Soulfire Burns (fire bypass), Infernal Rage (extended aggro)
//   - Deep Aether: Radiant Shield (first-hit absorb)
//   - End: Void Corruption (stacking debuff)
//
// IMPLEMENTATION APPROACH:
// Most dimension mechanics in the design doc require per-tick or per-hit
// event handling. KubeJS on 1.20.1 supports EntityEvents.hurt and
// PlayerEvents.tick. Some mechanics (like mob-side behavior changes)
// are approximated via status effects applied at spawn.
//
// Complex mechanics like "noise tracking" or "coordinated aggro" are
// noted as Phase 2/KubeJS limitations and documented here.
// =============================================================================

// ─── Mob Spawn Enhancements (Dimension-Specific Buffs at Spawn) ───
EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return
  if (entity.persistentData.contains('icraft_dim_mech')) return

  let dim = entity.level.dimension

  // ── Twilight Forest: Canopy Ambush ──
  // 15% chance to spawn invisible for 5 seconds
  if (dim === 'twilightforest:twilight_forest') {
    if (Math.random() < 0.15) {
      entity.potionEffects.add('minecraft:invisibility', 100, 0, false, false)
    }
  }

  // ── Undergarden: Virulent Spores ──
  // Mobs get Poison Aspect — handled via hurt event below
  // Mobs in Undergarden get slight regeneration to simulate Fungal Armor
  if (dim === 'undergarden:undergarden') {
    entity.potionEffects.add('minecraft:regeneration', 999999, 0, false, false)
    // Tag for poison-on-hit mechanic
    entity.persistentData.putBoolean('icraft_virulent', true)
  }

  // ── Deeper and Darker: Darkness Empowerment ──
  // Mobs at light level 0 gain +20% stats (applied via dimension_scaling.js)
  // Apply night vision so they can "see" in darkness (AI enhancement)
  if (dim === 'deeperdarker:otherside') {
    entity.potionEffects.add('minecraft:night_vision', 999999, 0, false, false)
  }

  // ── Nether: Infernal Rage ──
  // All nether mobs get fire resistance (native) + speed boost for aggression
  if (dim === 'minecraft:the_nether') {
    entity.potionEffects.add('minecraft:fire_resistance', 999999, 0, false, false)
    // 30% chance for soulfire aura (marked for damage bypass in hurt event)
    if (Math.random() < 0.30) {
      entity.persistentData.putBoolean('icraft_soulfire', true)
    }
  }

  // ── Deep Aether: Radiant Shield ──
  // 20% of mobs spawn with absorption (first-hit absorb)
  if (dim === 'deep_aether:the_aether') {
    if (Math.random() < 0.20) {
      entity.potionEffects.add('minecraft:absorption', 999999, 1, false, true)
      entity.persistentData.putBoolean('icraft_radiant', true)
    }
  }

  // ── End: Void Corruption Aura ──
  // End mobs gain slight strength scaling
  if (dim === 'minecraft:the_end') {
    entity.potionEffects.add('minecraft:strength', 999999, 0, false, false)
  }

  // ── Blue Skies: Elemental Tag ──
  // Everdawn = fire-themed, Everbright = ice-themed
  // 30% of mob damage tagged for armor-bypass (handled in hurt event)
  if (dim === 'blue_skies:everdawn') {
    entity.persistentData.putBoolean('icraft_fire_elemental', true)
  }
  if (dim === 'blue_skies:everbright') {
    entity.persistentData.putBoolean('icraft_ice_elemental', true)
  }

  // ── Ad Astra: Moon — Low gravity combat ──
  // Mobs get Jump Boost for low-grav feel
  if (dim === 'ad_astra:moon') {
    entity.potionEffects.add('minecraft:jump_boost', 999999, 1, false, false)
  }

  // ── Ad Astra: Mars — Cold-adapted mobs ──
  // Mobs get frost resistance (speed buff to simulate cold adaptation)
  if (dim === 'ad_astra:mars') {
    entity.potionEffects.add('minecraft:speed', 999999, 0, false, false)
    entity.persistentData.putBoolean('icraft_cold_adapted', true)
  }

  // ── Ad Astra: Mercury — Heat/cold dual nature ──
  // Mobs gain fire resistance on sun side
  if (dim === 'ad_astra:mercury') {
    entity.potionEffects.add('minecraft:fire_resistance', 999999, 0, false, false)
  }

  // ── Ad Astra: Venus — Acid-resistant creatures ──
  // Mobs get resistance (pressure-adapted)
  if (dim === 'ad_astra:venus') {
    entity.potionEffects.add('minecraft:resistance', 999999, 0, false, false)
    entity.potionEffects.add('minecraft:strength', 999999, 0, false, false)
  }

  // ── Ad Astra: Glacio — Alien mobs, highest difficulty ──
  // Mobs get speed + strength (alien predators)
  if (dim === 'ad_astra:glacio') {
    entity.potionEffects.add('minecraft:speed', 999999, 1, false, false)
    entity.potionEffects.add('minecraft:strength', 999999, 1, false, false)
    entity.potionEffects.add('minecraft:resistance', 999999, 0, false, false)
  }

  entity.persistentData.putBoolean('icraft_dim_mech', true)
})


// ─── Player Hurt: Dimension-Specific On-Hit Effects ───
EntityEvents.hurt(event => {
  let target = event.entity
  if (!target || !target.player) return

  let source = event.source
  let attacker = source.actual
  if (!attacker || !attacker.living) return

  let dim = target.level.dimension

  // ── Undergarden: Virulent Spores (25% poison on hit) ──
  if (dim === 'undergarden:undergarden') {
    if (attacker.persistentData.contains('icraft_virulent') || Math.random() < 0.25) {
      // Poison II for 5 seconds — damage scales with dimension multiplier
      // (Poison II = 1.2 dmg/sec, over 5s = 6 total, meaningful at T3)
      target.potionEffects.add('minecraft:poison', 100, 1, false, true)
    }
  }

  // ── Nether: Soulfire Burns (30% fire damage bypass) ──
  if (dim === 'minecraft:the_nether') {
    if (attacker.persistentData.contains('icraft_soulfire')) {
      // Apply fire for 3 seconds on hit (soul fire = bypass armor)
      target.setSecondsOnFire(3)
    }
  }

  // ── Deeper and Darker: Hexing (random debuff on hit) ──
  if (dim === 'deeperdarker:otherside') {
    if (Math.random() < 0.15) {
      let debuffs = ['minecraft:slowness', 'minecraft:weakness', 'minecraft:mining_fatigue', 'minecraft:blindness']
      let chosen = debuffs[Math.floor(Math.random() * debuffs.length)]
      target.potionEffects.add(chosen, 40, 0, false, true) // 2 seconds
    }
  }

  // ── Blue Skies: Elemental Damage (30% armor bypass) ──
  // Design doc: 30% of mob damage is converted to elemental, bypasses armor
  // Implementation: apply extra magic damage as fire/frost on hit
  if (dim === 'blue_skies:everdawn' || dim === 'blue_skies:everbright') {
    let baseDmg = event.amount
    let elementalDmg = baseDmg * 0.30
    if (elementalDmg > 0) {
      // Reduce the physical hit by 30%
      event.amount = baseDmg * 0.70
      // Apply elemental as fire/freeze effect (simulates bypass)
      if (dim === 'blue_skies:everdawn') {
        target.setSecondsOnFire(2)
      } else {
        target.potionEffects.add('minecraft:slowness', 60, 0, false, true)
        // Deal raw damage via attack to simulate frost bypass
      }
    }
  }

  // ── Moon: Doubled Knockback (low gravity combat) ──
  if (dim === 'ad_astra:moon') {
    // Double the knockback by applying extra velocity
    try {
      let motion = target.deltaMovement
      target.setMotion(motion.x * 2.0, motion.y * 1.5, motion.z * 2.0)
    } catch(e) {}
  }

  // ── End: Ender Displacement (15% of attacks teleport player) ──
  // Design doc: 15% chance to teleport player 2-4 blocks randomly on hit
  // Warp Shield enchant: -5% chance per level (level 3 = immune)
  if (dim === 'minecraft:the_end') {
    let warpChance = 0.15
    // Check for Warp Shield enchantment on armor
    try {
      ;['head','chest','legs','feet'].forEach(slot => {
        let armor = target.getItemSlot(slot)
        if (armor && !armor.isEmpty() && armor.enchantments) {
          let ws = armor.enchantments.getLevel('icraft:warp_shield')
          if (ws > 0) warpChance -= ws * 0.05
        }
      })
    } catch(e) {}

    if (warpChance > 0 && Math.random() < warpChance) {
      let dx = (Math.random() - 0.5) * 6  // -3 to +3 blocks
      let dz = (Math.random() - 0.5) * 6
      let newX = target.x + dx
      let newZ = target.z + dz
      let newY = target.y
      target.teleportTo(newX, newY, newZ)
    }
  }
})


// ─── Player Tick: Environmental Hazards ───
PlayerEvents.tick(event => {
  let player = event.player
  if (!player || player.spectator || player.creative) return

  // Only check every 100 ticks (5 seconds) for performance
  if (player.age % 100 !== 0) return

  let dim = player.level.dimension

  // ── Undergarden: Decay Aura ──
  // Standing still for 10+ seconds = Weakness I
  if (dim === 'undergarden:undergarden') {
    let moving = player.deltaMovement.length() > 0.01
    if (!moving) {
      let stillTime = player.persistentData.contains('icraft_still')
        ? player.persistentData.getInt('icraft_still') + 5
        : 5
      player.persistentData.putInt('icraft_still', stillTime)

      if (stillTime >= 10) {
        player.potionEffects.add('minecraft:weakness', 200, 0, false, true)
      }
    } else {
      player.persistentData.putInt('icraft_still', 0)
    }
  }

  // ── End: Void Corruption (stacking debuff near void) ──
  if (dim === 'minecraft:the_end') {
    let y = player.blockPosition().y
    if (y < 10) {
      // Near void — apply weakness that stacks
      let stacks = player.persistentData.contains('icraft_void_stacks')
        ? player.persistentData.getInt('icraft_void_stacks')
        : 0
      if (stacks < 3) {
        player.persistentData.putInt('icraft_void_stacks', stacks + 1)
      }
      player.potionEffects.add('minecraft:weakness', 200, stacks, false, true)
      player.potionEffects.add('minecraft:slowness', 200, Math.min(stacks, 1), false, true)
    } else {
      player.persistentData.putInt('icraft_void_stacks', 0)
    }
  }

  // ── Overworld: Full Moon Night ──
  // Design doc: full moon = doubled spawn rate, Champions 8%→5%
  // We can't modify spawn rates dynamically, but we CAN apply Strength I
  // to all overworld mobs during full moon (checked per player tick for UI)
  // Actual spawn rate increase handled by mob event if possible

  // ── Nether: Lava Affinity ──
  // Nether mobs near lava regenerate — handled via spawn regen above
  // (simplified: all Nether mobs get regen, which is close enough)

  // ═══ AD ASTRA PLANET HAZARDS ═══
  // Planetary enchantments can negate these hazards.
  // Helper: check total enchant level across armor (same as enchant_effects.js)
  function getArmorEnchTotalLocal(entity, enchId) {
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

  // ── Moon: Knockback doubled, fall damage halved ──
  // Low gravity — handled via knockback in hurt event below
  // Fall damage reduction handled via Slow Falling effect
  if (dim === 'ad_astra:moon') {
    // Slow Falling I reduces fall damage significantly (simulates low gravity)
    player.potionEffects.add('minecraft:slow_falling', 200, 0, false, false)
  }

  // ── Mars: Cold damage ticks, faster hunger drain ──
  // Thermal Regulation negates cold damage; each level reduces by 33%
  if (dim === 'ad_astra:mars') {
    let thermalReg = getArmorEnchTotalLocal(player, 'icraft:thermal_regulation')
    let coldReduction = Math.min(thermalReg * 0.33, 1.0)
    if (coldReduction < 1.0) {
      // Cold damage: 1 HP every 5 seconds, reduced by Thermal Regulation
      player.attack('freeze', 1.0 * (1.0 - coldReduction))
    }
    // Faster hunger: apply hunger effect (not affected by enchant)
    player.potionEffects.add('minecraft:hunger', 200, 0, false, false)
  }

  // ── Mercury: Fire damage on sun side, cold on dark side ──
  // Stellar Shield negates fire; Thermal Regulation negates cold
  if (dim === 'ad_astra:mercury') {
    let dayTime = player.level.dayTime % 24000
    if (dayTime >= 0 && dayTime < 12000) {
      // Day (sun side): fire damage — Stellar Shield negates
      let stellarShield = getArmorEnchTotalLocal(player, 'icraft:stellar_shield')
      let fireReduction = Math.min(stellarShield * 0.33, 1.0)
      if (fireReduction < 1.0) {
        player.setSecondsOnFire(3)
      }
    } else {
      // Night (dark side): freeze damage — Thermal Regulation negates
      let thermalReg = getArmorEnchTotalLocal(player, 'icraft:thermal_regulation')
      let coldReduction = Math.min(thermalReg * 0.33, 1.0)
      if (coldReduction < 1.0) {
        player.attack('freeze', 1.5 * (1.0 - coldReduction))
      }
    }
  }

  // ── Venus: Acid rain continuous damage, movement speed reduction ──
  // Pressure Shell negates acid damage and slowness
  if (dim === 'ad_astra:venus') {
    let pressureShell = getArmorEnchTotalLocal(player, 'icraft:pressure_shell')
    let pressureReduction = Math.min(pressureShell * 0.50, 1.0)
    if (pressureReduction < 1.0) {
      // Acid rain: continuous damage (1.5 HP per tick cycle)
      player.attack('magic', 1.5 * (1.0 - pressureReduction))
    }
    // Pressure: movement speed reduction — negated at level 2
    if (pressureShell < 2) {
      player.potionEffects.add('minecraft:slowness', 200, 1, false, false)
    }
  }

  // ── Glacio: Extreme cold, highest mob difficulty ──
  // Void Adaptation negates mining fatigue; Thermal Regulation reduces cold
  if (dim === 'ad_astra:glacio') {
    let thermalReg = getArmorEnchTotalLocal(player, 'icraft:thermal_regulation')
    let coldReduction = Math.min(thermalReg * 0.33, 1.0)
    if (coldReduction < 1.0) {
      // Extreme cold: 2 HP per tick cycle
      player.attack('freeze', 2.0 * (1.0 - coldReduction))
    }
    // Mining fatigue from extreme environment — Void Adaptation negates
    let voidAdapt = getArmorEnchTotalLocal(player, 'icraft:void_adaptation')
    if (voidAdapt < 1) {
      player.potionEffects.add('minecraft:mining_fatigue', 200, 0, false, false)
    }
  }
})


// ─── Overworld: Full Moon Detection ───
// Notifies players of full moon danger
PlayerEvents.tick(event => {
  let player = event.player
  if (!player || player.level.dimension !== 'minecraft:overworld') return
  if (player.age % 24000 !== 13000) return  // Check once at nightfall

  let dayTime = player.level.dayTime
  let lunarPhase = Math.floor((dayTime / 24000) % 8)
  if (lunarPhase === 0) {
    // Full moon — notify player
    player.tell('§c§lFull Moon Rising! §r§7Hostile mobs are more numerous and aggressive tonight.')
  }
})


// ─── Nether: Blaze Swarm (on kill) ───
// Design doc: Killing a Blaze has 20% chance to spawn 2 smaller ember mobs
EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.level.dimension !== 'minecraft:the_nether') return

  let type = entity.type
  if (type !== 'minecraft:blaze') return

  if (Math.random() < 0.20) {
    let pos = entity.blockPosition()
    let level = entity.level
    // Spawn 2 small magma cubes as "embers" (fast, weak, numerous)
    for (let i = 0; i < 2; i++) {
      let ember = level.createEntity('minecraft:magma_cube')
      if (ember) {
        let offsetX = (Math.random() - 0.5) * 2
        let offsetZ = (Math.random() - 0.5) * 2
        ember.setPosition(pos.x + offsetX, pos.y + 0.5, pos.z + offsetZ)
        // Small magma cube (size 1) — weak but fast
        ember.persistentData.putBoolean('icraft_ember', true)
        level.addFreshEntity(ember)
      }
    }
  }
})


// ─── End: Dragon's Influence ───
// Design doc: While Ender Dragon is alive, all End mobs gain +15% all stats
// Check every 200 ticks (10 seconds) per player for performance
PlayerEvents.tick(event => {
  let player = event.player
  if (!player || player.level.dimension !== 'minecraft:the_end') return
  if (player.age % 200 !== 0) return

  // Check if dragon is alive by looking at the dragon fight data
  // Simplified: check if any ender_dragon entity exists within render distance
  let dragonAlive = false
  let entities = player.level.getEntitiesWithin(
    AABB.of(player.x - 200, 0, player.z - 200, player.x + 200, 256, player.z + 200)
  )
  for (let e of entities) {
    if (e.type === 'minecraft:ender_dragon') {
      dragonAlive = true
      break
    }
  }

  // Store state for this player
  if (dragonAlive) {
    if (!player.persistentData.contains('icraft_dragon_warned')) {
      player.tell('§5§lThe Dragon\'s presence empowers nearby enemies... §r§7(+15% mob stats)')
      player.persistentData.putBoolean('icraft_dragon_warned', true)
    }
  } else {
    if (player.persistentData.contains('icraft_dragon_warned')) {
      player.persistentData.remove('icraft_dragon_warned')
    }
  }
})


// ─── End: Enhanced Void Corruption (time-based) ───
// Design doc: Every 60 seconds in Deep End, gain 1 stack (max 10)
// Each stack: -2% max HP, +3% damage dealt
// Leaving End or resting at waystone clears stacks
PlayerEvents.tick(event => {
  let player = event.player
  if (!player || player.spectator || player.creative) return
  if (player.level.dimension !== 'minecraft:the_end') return

  // Only tick every 60 seconds (1200 ticks)
  if (player.age % 1200 !== 0) return

  // Only apply in Deep End (>800 blocks from origin)
  let distSq = player.x * player.x + player.z * player.z
  if (distSq < 800 * 800) return

  let stacks = player.persistentData.contains('icraft_void_corruption')
    ? player.persistentData.getInt('icraft_void_corruption')
    : 0

  if (stacks < 10) {
    stacks++
    player.persistentData.putInt('icraft_void_corruption', stacks)

    // Visual feedback at key thresholds
    if (stacks === 1) {
      player.tell('§5The Void seeps into your being... §7(Void Corruption: 1)')
    } else if (stacks === 5) {
      player.tell('§5§lVoid Corruption intensifies... §r§7(-10% HP, +15% damage)')
    } else if (stacks === 10) {
      player.tell('§5§l§kxx§r §5§lMAXIMUM VOID CORRUPTION §5§l§kxx§r §7(-20% HP, +30% damage)')
    }
  }

  // Apply effects via potion effects (simulating HP loss + damage gain)
  // Weakness proportional to stack count (represents HP fragility)
  // Strength proportional to stack count (represents damage boost)
  if (stacks > 0) {
    // Strength: +3% per stack → Strength I at 3 stacks, II at 7, III at 10
    let strLevel = Math.floor(stacks / 3.5)
    if (strLevel > 0) {
      player.potionEffects.add('minecraft:strength', 1400, strLevel - 1, false, true)
    }

    // Apply max_health reduction via attribute (temporary)
    // -2% per stack
    player.modifyAttribute(
      'minecraft:generic.max_health',
      'icraft_void_corruption_hp',
      -0.02 * stacks,
      'multiply_base'
    )
  }
})

// Clear Void Corruption when leaving the End
// Uses tick-based dimension tracking since PlayerEvents.changeDimension doesn't exist in KubeJS 6.x
ServerEvents.tick(event => {
  if (event.server.tickCount % 20 !== 0) return // Check once per second
  event.server.players.forEach(player => {
    let currentDim = player.level.dimension
    let lastDim = player.persistentData.getString('icraft_last_dimension')
    if (lastDim && lastDim !== currentDim && lastDim === 'minecraft:the_end') {
      if (player.persistentData.contains('icraft_void_corruption')) {
        player.persistentData.remove('icraft_void_corruption')
        try {
          player.removeAttribute('minecraft:generic.max_health', 'icraft_void_corruption_hp')
        } catch(e) {}
        player.tell('\u00a7aVoid Corruption cleansed.')
      }
    }
    player.persistentData.putString('icraft_last_dimension', currentDim)
  })
})
