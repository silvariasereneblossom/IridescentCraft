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
//   - The Aether: Thin Air, Vertigo, Updrafts (altitude hazards)
//   - The Abyss: Oppressive Darkness, Corruption, Fear Aura, Void Whispers
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
//
// 2026-10-10 (accessors as scripts really see them: 0_lib_core.js header):
//   * Dragon's Influence scanned a 400x256x400 box of entities per End player;
//     it asks the level for its dragons instead (one cached read per 5 s).
//   * Blue Skies elemental damage never applied: it sat in EntityEvents.hurt
//     and read/wrote `event.amount`, which that wrapper does not have. It is a
//     damage-registry handler now.
//   * Planet cold / acid damage never landed: `player.attack('freeze', n)` has
//     no string -> DamageSource conversion and threw, which also skipped the
//     rest of that planet's block (Mars hunger, Venus slowness, Glacio mining
//     fatigue).
//   * Mercury was always on its night side: `level.dayTime` is the dayTime()
//     method object, so `dayTime % 24000` was NaN.
//   * Aether Acclimation / Thermal Regulation / Stellar Shield / Pressure
//     Shell / Void Adaptation / Warp Shield were all read as level 0
//     (`entity.getItemSlot` does not exist): the hazards could not be negated.
//   * The Abyss darkness check called getBrightness(pos) (no such overload).
//   * Entity ids are read through core.entityId() (the `type` property is
//     shadowed on some mod classes).
// NOT revived: the Full Moon notice at the bottom (still reads `level.dayTime`
// as a number). It announces "more numerous and aggressive" mobs, and nothing
// in the pack implements that -- reported for a design call instead.
//
// Whole file is one IIFE (body left at column 0); nothing here is used by
// another script.
// =============================================================================

;(function () {
var core = global.icraft && global.icraft.core
if (!core) {
  console.error('[IridescentCraft] dimension_mechanics.js: 0_lib_core.js did not load -- dimension mechanics are OFF')
  return
}

var ABYSS_BOSSES = {
  'theabyss:elder': true, 'theabyss:ice_knight': true, 'theabyss:nightblade_boss': true,
  'theabyss:soul_guard': true, 'theabyss:the_roka': true
}

// Total level of one enchantment across the four armour pieces
var getArmorEnchTotalLocal = function (entity, enchId) {
  return core.armorEnchTotal(entity, enchId)
}

// An environmental hit that goes through every normal damage handler.
var hazardDamage = function (player, kind, amount) {
  if (!(amount > 0)) return
  try {
    var source = core.damageSource(player, kind, null)
    if (source) player.attack(source, amount)
  } catch (e) {
    core.warnOnce('dim.hazard:' + kind, '[dimension_mechanics] ' + kind + ' hazard damage threw: ' + e)
  }
}

// ─── Mob Spawn Enhancements (Dimension-Specific Buffs at Spawn) ───
EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return
  if (entity.persistentData.contains('icraft_dim_mech')) return

  let dim = entity.level.dimension
  let type = core.entityId(entity)

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

  // ── The Aether: Thin Air Adaptation ──
  // All Aether mobs get Speed I (adapted to thin air)
  // Flying mobs get Strength I (aerial advantage)
  if (dim === 'aether:the_aether') {
    entity.potionEffects.add('minecraft:speed', 999999, 0, false, false)
    let flyingMobs = ['aether:zephyr', 'aether:valkyrie', 'aether:cockatrice']
    if (flyingMobs.indexOf(type) !== -1) {
      entity.potionEffects.add('minecraft:strength', 999999, 0, false, false)
    }
  }

  // ── The Abyss: Corruption Resistance ──
  // All Abyss mobs get Resistance I (adapted to corrupted environment)
  // Boss entities are excluded (already handled by boss_hp.js)
  if (dim === 'theabyss:the_abyss') {
    if (!ABYSS_BOSSES[type]) {
      entity.potionEffects.add('minecraft:resistance', 999999, 0, false, false)
    }
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

  // ── Blue Skies: Elemental Damage ──
  // (needs a settable amount: see the damage-registry handler below)

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
    // Check for Warp Shield enchantment on armor
    let warpChance = 0.15 - getArmorEnchTotalLocal(target, 'icraft:warp_shield') * 0.05

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


// ─── Blue Skies: Elemental Damage (30% armor bypass) ───
// Design doc: 30% of mob damage is converted to elemental, bypasses armor.
// Implementation: the physical hit is reduced by 30% and the elemental share
// lands as fire (Everdawn) / a slow (Everbright).
core.onHurt('icraft.dimension_mechanics.blue_skies', function (event, ctx) {
  var target = ctx.victim
  var attacker = ctx.attacker
  if (!attacker || attacker === target) return
  var dim = String(target.level.dimension)
  if (dim !== 'blue_skies:everdawn' && dim !== 'blue_skies:everbright') return
  if (!attacker.living) return
  if (!(event.amount > 0)) return

  // Reduce the physical hit by 30%
  event.amount = event.amount * 0.70
  // Apply elemental as fire/freeze effect (simulates bypass)
  if (dim === 'blue_skies:everdawn') {
    target.setSecondsOnFire(2)
  } else {
    target.potionEffects.add('minecraft:slowness', 60, 0, false, true)
  }
}, 'victimPlayer')


// ─── Player Tick: Environmental Hazards ───
global.tick_dimEnvironmentalHazards = (event) => {
  let player = event.player
  if (!player || player.spectator || player.creative) return

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

  // ═══ THE AETHER HAZARDS (T2) ═══
  if (dim === 'aether:the_aether') {
    let y = player.blockPosition().y

    // ── Thin Air: Above Y=180, Weakness I (thin atmosphere) ──
    // Aether Acclimation enchantment negates this
    let aetherAcclimation = getArmorEnchTotalLocal(player, 'icraft:aether_acclimation')
    if (y > 180 && aetherAcclimation <= 0) {
      player.potionEffects.add('minecraft:weakness', 200, 0, false, true)
    }

    // ── Vertigo: Above Y=200 + sprinting, 10% chance Nausea for 3s ──
    if (y > 200 && player.sprinting) {
      if (Math.random() < 0.10) {
        player.potionEffects.add('minecraft:nausea', 60, 0, false, true)
      }
    }

    // ── Updrafts: Falling below Y=0, apply Slow Falling once per fall ──
    if (y < 0) {
      if (!player.persistentData.contains('icraft_aether_updraft')) {
        player.potionEffects.add('minecraft:slow_falling', 100, 0, false, true)
        player.persistentData.putBoolean('icraft_aether_updraft', true)
      }
    } else {
      // Reset updraft tracker when back above Y=0
      if (player.persistentData.contains('icraft_aether_updraft')) {
        player.persistentData.remove('icraft_aether_updraft')
      }
    }
  }

  // ═══ THE ABYSS HAZARDS (T3) ═══
  if (dim === 'theabyss:the_abyss') {
    let y = player.blockPosition().y

    // ── Oppressive Darkness: No light source + low light = debuffs ──
    // Check if player is holding a light source in either hand
    let holdingLight = false
    try {
      let mainHand = player.mainHandItem
      let offHand = player.offHandItem
      let lightSources = ['minecraft:torch', 'minecraft:soul_torch', 'minecraft:lantern',
        'minecraft:soul_lantern', 'minecraft:glowstone', 'minecraft:shroomlight']
      if (mainHand && !mainHand.isEmpty()) {
        if (lightSources.indexOf(mainHand.id) !== -1) holdingLight = true
      }
      if (offHand && !offHand.isEmpty()) {
        if (lightSources.indexOf(offHand.id) !== -1) holdingLight = true
      }
    } catch(e) {}

    if (!holdingLight) {
      try {
        let lightLevel = core.light(player)
        if (lightLevel < 4) {
          player.potionEffects.add('minecraft:mining_fatigue', 200, 0, false, true)
          player.potionEffects.add('minecraft:slowness', 200, 0, false, true)
        }
      } catch(e) {}
    }

    // ── Corruption Ticks: Every 200 ticks, 15% chance Hunger I for 5s ──
    // Uses separate timing from the main 100-tick cycle
    if (player.age % 200 < 100) {
      // Only trigger once per 200-tick window (the main handler runs every 100 ticks)
      if (Math.random() < 0.15) {
        player.potionEffects.add('minecraft:hunger', 100, 0, false, true)
      }
    }

    // ── Fear Aura: Within 16 blocks of Abyss bosses, Darkness for 3s ──
    try {
      let nearBoss = false
      let entities = player.level.getEntitiesWithin(
        AABB.of(player.x - 16, player.y - 16, player.z - 16, player.x + 16, player.y + 16, player.z + 16)
      )
      for (let e of entities) {
        if (e.living && ABYSS_BOSSES[core.entityId(e)]) {
          nearBoss = true
          break
        }
      }
      if (nearBoss) {
        player.potionEffects.add('minecraft:darkness', 60, 0, false, true)
      }
    } catch(e) {}

    // ── Void Whispers: Below Y=20, Weakness I ──
    if (y < 20) {
      player.potionEffects.add('minecraft:weakness', 200, 0, false, true)
    }
  }

  // ═══ AD ASTRA PLANET HAZARDS ═══
  // Planetary enchantments can negate these hazards (getArmorEnchTotalLocal,
  // top of file).

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
      hazardDamage(player, 'freeze', 1.0 * (1.0 - coldReduction))
    }
    // Faster hunger: apply hunger effect (not affected by enchant)
    player.potionEffects.add('minecraft:hunger', 200, 0, false, false)
  }

  // ── Mercury: Fire damage on sun side, cold on dark side ──
  // Stellar Shield negates fire; Thermal Regulation negates cold
  if (dim === 'ad_astra:mercury') {
    let dayTime = Number(player.level.getDayTime()) % 24000
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
        hazardDamage(player, 'freeze', 1.5 * (1.0 - coldReduction))
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
      hazardDamage(player, 'magic', 1.5 * (1.0 - pressureReduction))
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
      hazardDamage(player, 'freeze', 2.0 * (1.0 - coldReduction))
    }
    // Mining fatigue from extreme environment — Void Adaptation negates
    let voidAdapt = getArmorEnchTotalLocal(player, 'icraft:void_adaptation')
    if (voidAdapt < 1) {
      player.potionEffects.add('minecraft:mining_fatigue', 200, 0, false, false)
    }
  }
}
global.registerPlayerTick('tick_dimEnvironmentalHazards', 100, 0)


// ─── Overworld: Full Moon Detection ───
// Notifies players of full moon danger
//
// NOT LIVE, and deliberately left that way on 2026-10-10 (see the file header):
// `level.dayTime` is vanilla's dayTime() METHOD object for scripts, so
// lunarPhase is NaN and the notice has never been sent. Making it work is one
// call (level.getDayTime()), but the line would then promise "more numerous
// and aggressive" mobs that nothing implements, at a moment set by the
// player's own age rather than by dusk (interval 24000 / offset 13000 on
// player.age). That is a design call, not a repair.
global.tick_fullMoonDetection = (event) => {
  let player = event.player
  if (!player || player.level.dimension !== 'minecraft:overworld') return

  let dayTime = player.level.dayTime
  let lunarPhase = Math.floor((dayTime / 24000) % 8)
  if (lunarPhase === 0) {
    player.tell('§c§lFull Moon Rising! §r§7Hostile mobs are more numerous and aggressive tonight.')
  }
}
global.registerPlayerTick('tick_fullMoonDetection', 24000, 13000)


// ─── Nether: Blaze Swarm (on kill) ───
// Design doc: Killing a Blaze has 20% chance to spawn 2 smaller ember mobs
EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.level.dimension !== 'minecraft:the_nether') return

  if (core.entityId(entity) !== 'minecraft:blaze') return

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
// "A living Ender Dragon within 200 blocks (X/Z) of the player."
// ServerLevel.getDragons() is the level's own typed lookup (every loaded,
// living ender dragon); the answer is shared by all End players for 5 s. This
// replaces a getEntitiesWithin() over a 400 x 256 x 400 box per player.
var dragonCache = { t: -1, spots: [] }
var endDragonSpots = function (level) {
  var now = core.now(level)
  if (dragonCache.t >= 0 && now >= dragonCache.t && (now - dragonCache.t) < 100) return dragonCache.spots
  var spots = []
  try {
    level.getDragons().forEach(function (dragon) {
      if (dragon && dragon.isAlive()) spots.push([dragon.x, dragon.y, dragon.z])
    })
  } catch (e) {
    core.warnOnce('dim.dragons', '[dimension_mechanics] level.getDragons() threw: ' + e)
  }
  dragonCache = { t: now, spots: spots }
  return spots
}

global.tick_dragonsInfluence = (event) => {
  let player = event.player
  if (!player) return
  if (String(player.level.dimension) !== 'minecraft:the_end') return

  let dragonAlive = false
  let spots = endDragonSpots(player.level)
  for (let i = 0; i < spots.length; i++) {
    if (Math.abs(spots[i][0] - player.x) <= 200 && Math.abs(spots[i][2] - player.z) <= 200 &&
        spots[i][1] >= 0 && spots[i][1] <= 256) {
      dragonAlive = true
      break
    }
  }

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
}
global.registerPlayerTick('tick_dragonsInfluence', 200, 0)


// ─── End: Enhanced Void Corruption (time-based) ───
global.tick_enhancedVoidCorruption = (event) => {
  let player = event.player
  if (!player || player.spectator || player.creative) return
  if (player.level.dimension !== 'minecraft:the_end') return

  // Only apply in Deep End (>800 blocks from origin)
  let distSq = player.x * player.x + player.z * player.z
  if (distSq < 800 * 800) return

  let stacks = player.persistentData.contains('icraft_void_corruption')
    ? player.persistentData.getInt('icraft_void_corruption')
    : 0

  if (stacks < 10) {
    stacks++
    player.persistentData.putInt('icraft_void_corruption', stacks)

    if (stacks === 1) {
      player.tell('§5The Void seeps into your being... §7(Void Corruption: 1)')
    } else if (stacks === 5) {
      player.tell('§5§lVoid Corruption intensifies... §r§7(-10% HP, +15% damage)')
    } else if (stacks === 10) {
      player.tell('§5§l§kxx§r §5§lMAXIMUM VOID CORRUPTION §5§l§kxx§r §7(-20% HP, +30% damage)')
    }
  }

  if (stacks > 0) {
    let strLevel = Math.floor(stacks / 3.5)
    if (strLevel > 0) {
      player.potionEffects.add('minecraft:strength', 1400, strLevel - 1, false, true)
    }

    player.modifyAttribute(
      'minecraft:generic.max_health',
      'icraft_void_corruption_hp',
      -0.02 * stacks,
      'multiply_base'
    )
  }
}
global.registerPlayerTick('tick_enhancedVoidCorruption', 1200, 0)

// Clear Void Corruption when leaving the End
global.tick_voidCorruptionCleanse = (event) => {
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
}
global.registerServerTick('tick_voidCorruptionCleanse', 20, 0)
})()
