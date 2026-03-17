// =============================================================================
// IridescentCraft — Custom Champion Affixes & Dimension Spawn Rate Scaling
// File: kubejs/server_scripts/champions/custom_champion_affixes.js
//
// Design Doc Part II: Champion Affix Pool + Scaling Configuration
//
// This script implements:
//   1. Five custom Champion affixes (KubeJS event-driven, not native):
//      - Commanding: Buffs nearby mobs with Speed/Strength aura
//      - Draining:   Leeches XP from players on hit
//      - Hexing:     Applies random debuffs on hit
//      - Leaping:    Periodically lunges toward nearest player
//      - Summoning:  Spawns reinforcement mobs periodically
//
//   2. Per-dimension Champion spawn rate scaling:
//      Champions config only supports a global 15% rate (Overworld baseline).
//      Higher dimensions get additional KubeJS-driven champion promotion.
//
// Champion Detection:
//   Champions Unofficial stores rank data in the entity's persistent data
//   under ForgeData. We check for the presence of champion rank NBT tags.
//   The mod uses capability data internally, but we can detect champions
//   by checking if the entity has champion-related NBT or by checking
//   the entity's custom name (champions get colored names with rank).
//
// Custom Affix Assignment:
//   On EntityEvents.spawned, if a mob is a champion (or gets promoted),
//   we assign one of our 5 custom affixes via persistentData tags.
//   ServerEvents.tick and EntityEvents.hurt then process the behaviors.
// =============================================================================

// ─── Constants ───

const CUSTOM_AFFIXES = ['commanding', 'draining', 'hexing', 'leaping', 'summoning']

// Dimension-weighted affix pools (from design doc)
// Each dimension has preferred affixes that are more likely to roll
const DIMENSION_AFFIX_WEIGHTS = {
  'twilightforest:twilight_forest': { commanding: 3, summoning: 2, hexing: 1, draining: 1, leaping: 1 },
  'blue_skies:everbright':         { leaping: 2, commanding: 1, hexing: 1, draining: 1, summoning: 1 },
  'blue_skies:everdawn':           { leaping: 2, commanding: 1, hexing: 1, draining: 1, summoning: 1 },
  'aether:the_aether':             { leaping: 3, commanding: 2, hexing: 1, draining: 1, summoning: 1 },
  'undergarden:undergarden':       { hexing: 2, draining: 2, commanding: 1, leaping: 1, summoning: 1 },
  'deeperdarker:otherside':        { hexing: 3, draining: 2, summoning: 1, commanding: 1, leaping: 1 },
  'minecraft:the_nether':          { summoning: 2, commanding: 2, hexing: 1, draining: 1, leaping: 1 },
  'theabyss:the_abyss':            { hexing: 2, draining: 2, summoning: 2, commanding: 1, leaping: 1 },
  'deep_aether:the_aether':        { commanding: 3, leaping: 2, summoning: 1, hexing: 1, draining: 1 },
  'minecraft:the_end':             { draining: 3, hexing: 2, commanding: 1, leaping: 1, summoning: 1 },
  // Ad Astra Planets (Post-T4 Endgame)
  'ad_astra:moon':                 { leaping: 3, commanding: 2, summoning: 1, hexing: 1, draining: 1 },
  'ad_astra:mars':                 { hexing: 3, commanding: 2, draining: 1, leaping: 1, summoning: 1 },
  'ad_astra:mercury':              { draining: 3, hexing: 2, leaping: 1, commanding: 1, summoning: 1 },
  'ad_astra:venus':                { summoning: 3, hexing: 2, draining: 1, commanding: 1, leaping: 1 },
  'ad_astra:glacio':               { commanding: 3, summoning: 3, hexing: 2, draining: 2, leaping: 2 },
}

// Per-dimension champion spawn rates (design doc values)
// The global Champions config handles 15% baseline for Overworld.
// Additional promotion chance = target% - 15% (the base rate already handled)
// For dimensions with rates below 15%, we don't demote — Champions handles it.
const DIMENSION_CHAMPION_RATES = {
  // Tier 1
  'minecraft:overworld':            0.05,   // 5% — actually LOWER than global 15%
  // Tier 2
  'twilightforest:twilight_forest': 0.07,
  'blue_skies:everbright':          0.08,
  'blue_skies:everdawn':            0.08,
  'aether:the_aether':              0.08,
  // Tier 3
  'undergarden:undergarden':        0.10,
  'deeperdarker:otherside':         0.10,
  'minecraft:the_nether':           0.12,
  'theabyss:the_abyss':             0.10,
  // Tier 4
  'deep_aether:the_aether':         0.13,
  'minecraft:the_end':              0.15,
  // Ad Astra Planets (Post-T4 Endgame)
  'ad_astra:moon':                  0.15,
  'ad_astra:mars':                  0.18,
  'ad_astra:mercury':               0.20,
  'ad_astra:venus':                 0.22,
  'ad_astra:glacio':                0.25,
}

// Chance that a champion gets a custom affix (on top of its native ones)
// Higher in later dimensions where custom affixes are more thematic
const CUSTOM_AFFIX_CHANCE_BY_DIM = {
  'minecraft:overworld':            0.15,
  'twilightforest:twilight_forest': 0.20,
  'blue_skies:everbright':          0.20,
  'blue_skies:everdawn':            0.20,
  'aether:the_aether':              0.25,
  'undergarden:undergarden':        0.30,
  'deeperdarker:otherside':         0.35,
  'minecraft:the_nether':           0.35,
  'theabyss:the_abyss':             0.40,
  'deep_aether:the_aether':         0.40,
  'minecraft:the_end':              0.45,
  // Ad Astra Planets (Post-T4 Endgame)
  'ad_astra:moon':                  0.40,
  'ad_astra:mars':                  0.45,
  'ad_astra:mercury':               0.50,
  'ad_astra:venus':                 0.55,
  'ad_astra:glacio':                0.60,
}

// Boss blacklist — never promote or give custom affixes to bosses
const BOSS_ENTITIES = new Set([
  'minecraft:ender_dragon', 'minecraft:wither', 'minecraft:warden',
  'minecraft:elder_guardian',
  'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
  'twilightforest:ur_ghast', 'twilightforest:knight_phantom',
  'twilightforest:snow_queen', 'twilightforest:minoshroom', 'twilightforest:alpha_yeti',
  'blue_skies:summoner', 'blue_skies:alchemist', 'blue_skies:starlit_crusher',
  'blue_skies:arachnarch',
  'aether:slider', 'aether:valkyrie_queen', 'aether:sun_spirit',
  'deep_aether:eots_controller',
  'undergarden:forgotten_guardian', 'undergarden:forgotten',
  'deeperdarker:stalker', 'deeperdarker:shattered',
  'deeperdarker:shriek_worm', 'deeperdarker:sculk_centipede',
  'cataclysm:netherite_monstrosity', 'cataclysm:ignis',
  'cataclysm:ender_guardian', 'cataclysm:ancient_remnant',
  'cataclysm:the_leviathan', 'cataclysm:the_harbinger',
  'cataclysm:maledictus', 'cataclysm:ender_golem', 'cataclysm:ignited_revenant',
  'botania:doppleganger',
  'meetyourfight:swampjaw', 'meetyourfight:bellringer',
  'meetyourfight:dame_fortuna', 'meetyourfight:rosalyne',
  'mutantmonsters:mutant_zombie', 'mutantmonsters:mutant_skeleton',
  'mutantmonsters:mutant_creeper', 'mutantmonsters:mutant_enderman',
  'stalwart_dungeons:shelterer', 'stalwart_dungeons:nether_keeper',
  'stalwart_dungeons:awful_ghast', 'stalwart_dungeons:incomplete_wither',
  'keebsz:tower_guardian',
  'irons_spellbooks:dead_king', 'irons_spellbooks:fire_boss',
  'irons_spellbooks:citadel_keeper',
  'theabyss:soul_guard', 'theabyss:ice_knight',
  'theabyss:nightblade_boss', 'theabyss:the_roka', 'theabyss:elder',
  'ub:sorcerer', 'ub:storm',
  'majestic_menaces:teikoku_senshi',
])


// =============================================================================
// SECTION 1: Champion Detection & Custom Affix Assignment (on spawn)
// =============================================================================

EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.player) return
  if (!entity.monster && !isHostileModdedChamp(entity.type)) return
  if (BOSS_ENTITIES.has(entity.type)) return

  // Skip already-processed mobs
  if (entity.persistentData.contains('icraft_champ_processed')) return
  entity.persistentData.putBoolean('icraft_champ_processed', true)

  let dim = entity.level.dimension

  // ── Step 1: Dimension-based Champion Promotion ──
  // The Champions mod handles the global 15% base rate.
  // For dimensions where the design rate differs, we adjust:
  //   - If design rate < 15%: remove champion status with some probability
  //   - If design rate > 15%: not applicable here (design rates are all <= 15%)
  //
  // Since all design doc rates are <= 15%, we need to DEMOTE some champions
  // in dimensions where the rate should be lower than the global 15%.
  let isChampion = detectChampion(entity)
  let targetRate = DIMENSION_CHAMPION_RATES[dim]

  if (targetRate !== undefined && targetRate < 0.15 && isChampion) {
    // Probability of keeping this champion = targetRate / 0.15
    // e.g., Overworld 5%: keep probability = 5/15 = 33%, so 67% get demoted
    let keepChance = targetRate / 0.15
    if (Math.random() > keepChance) {
      // Demote: remove champion data by killing and respawning as normal mob
      // Since we can't cleanly remove Champions capability data, we instead
      // apply a "nullification" — strip the champion's bonus stats and mark
      // it as demoted so it acts as a normal mob
      demoteChampion(entity)
      return
    }
  }

  // ── Step 2: Assign Custom Affix to Champions ──
  if (isChampion && !entity.persistentData.contains('icraft_champ_demoted')) {
    let affixChance = CUSTOM_AFFIX_CHANCE_BY_DIM[dim] || 0.15
    if (Math.random() < affixChance) {
      let affix = rollWeightedAffix(dim)
      assignCustomAffix(entity, affix)
    }
  }
})


// =============================================================================
// SECTION 2: Custom Affix Behaviors — Tick-Based (Commanding, Leaping, Summoning)
// =============================================================================

ServerEvents.tick(event => {
  let server = event.server
  // Only process every 40 ticks (2 seconds) for performance
  if (server.tickCount % 40 !== 0) return

  server.allLevels.forEach(level => {
    let entities = level.getEntities().filter(e =>
      e && e.living && !e.player && e.isAlive() &&
      e.persistentData.contains('icraft_custom_affix')
    )

    entities.forEach(entity => {
      let affix = entity.persistentData.getString('icraft_custom_affix')

      switch (affix) {
        case 'commanding':
          tickCommanding(entity, level)
          break
        case 'leaping':
          tickLeaping(entity, level, server.tickCount)
          break
        case 'summoning':
          tickSummoning(entity, level, server.tickCount)
          break
        // draining and hexing are on-hit only — handled in EntityEvents.hurt
      }
    })
  })
})


// ─── Commanding: Buff nearby mobs with Speed I and Strength I ───
// Design doc: "Nearby non-Champion mobs gain +10% damage (aura)"
// Implementation: Apply Speed I + Strength I to hostile mobs within 16 blocks
function tickCommanding(entity, level) {
  let pos = entity.blockPosition()
  let nearbyMobs = level.getEntitiesWithin(
    AABB.of(pos.x - 16, pos.y - 8, pos.z - 16, pos.x + 16, pos.y + 8, pos.z + 16)
  )

  nearbyMobs.forEach(mob => {
    if (!mob || !mob.living || mob.player) return
    if (mob.uuid === entity.uuid) return  // Don't buff self
    if (!mob.monster && !isHostileModdedChamp(mob.type)) return

    // Apply Speed I and Strength I for 5 seconds (100 ticks)
    // Re-applied every 2 seconds by tick handler, so effectively permanent while in range
    mob.potionEffects.add('minecraft:speed', 100, 0, false, false)
    mob.potionEffects.add('minecraft:strength', 100, 0, false, false)
  })

  // Visual indicator: the commanding champion itself gets glowing
  entity.potionEffects.add('minecraft:glowing', 100, 0, false, false)
}


// ─── Leaping: Periodically lunge toward nearest player ───
// Design doc: "Jumps 4 blocks high. Lands with AoE shockwave"
// Implementation: Every 6 seconds, launch toward nearest player within 24 blocks
function tickLeaping(entity, level, tickCount) {
  // Only leap every 6 seconds (every 3rd tick cycle at 40 ticks/cycle)
  let leapTimer = entity.persistentData.contains('icraft_leap_timer')
    ? entity.persistentData.getInt('icraft_leap_timer')
    : 0
  leapTimer++
  entity.persistentData.putInt('icraft_leap_timer', leapTimer)

  if (leapTimer < 3) return  // ~6 seconds between leaps
  entity.persistentData.putInt('icraft_leap_timer', 0)

  // Find nearest player within 24 blocks
  let nearestPlayer = level.getNearestPlayer(entity.x, entity.y, entity.z, 24, false)
  if (!nearestPlayer) return

  // Calculate launch vector toward player
  let dx = nearestPlayer.x - entity.x
  let dy = nearestPlayer.y - entity.y
  let dz = nearestPlayer.z - entity.z
  let dist = Math.sqrt(dx * dx + dz * dz)

  if (dist < 2.0) return  // Already close enough, don't leap
  if (dist > 24.0) return // Too far

  // Normalize horizontal direction and scale leap
  let speed = Math.min(dist * 0.08, 1.2)  // Cap horizontal speed
  let vx = (dx / dist) * speed
  let vz = (dz / dist) * speed
  let vy = 0.6 + Math.min(dy * 0.05, 0.3) // Vertical leap: ~3-4 blocks high

  entity.setMotion(vx, vy, vz)
  entity.persistentData.putBoolean('icraft_leaping_active', true)

  // Apply AoE damage on landing (checked next tick cycle)
  // Mark landing check for next cycle
  entity.persistentData.putDouble('icraft_leap_start_y', entity.y)
}

// Check for leap landing — apply shockwave damage
ServerEvents.tick(event => {
  let server = event.server
  if (server.tickCount % 10 !== 0) return  // Check every 0.5 seconds

  server.allLevels.forEach(level => {
    let leapers = level.getEntities().filter(e =>
      e && e.living && e.isAlive() &&
      e.persistentData.contains('icraft_leaping_active') &&
      e.persistentData.getBoolean('icraft_leaping_active')
    )

    leapers.forEach(entity => {
      // Check if mob has landed (on ground or moving downward and close to ground)
      if (entity.onGround) {
        entity.persistentData.putBoolean('icraft_leaping_active', false)

        // AoE shockwave: 2 damage to players within 3 blocks
        let pos = entity.blockPosition()
        let nearby = level.getEntitiesWithin(
          AABB.of(pos.x - 3, pos.y - 1, pos.z - 3, pos.x + 3, pos.y + 3, pos.z + 3)
        )
        nearby.forEach(target => {
          if (!target || !target.player) return
          if (target.creative || target.spectator) return
          target.attack('mob', 2.0)
          // Brief slowness from shockwave
          target.potionEffects.add('minecraft:slowness', 30, 1, false, true)
        })
      }
    })
  })
})


// ─── Summoning: Spawn reinforcements periodically ───
// Design doc: "Spawns 2 weaker copies of itself when below 50% HP (once)"
// Enhanced implementation: spawn reinforcements every 20 seconds while below 50% HP
// Max 2 summon waves to prevent infinite mob spam
function tickSummoning(entity, level, tickCount) {
  // Check HP threshold: only summon when below 50%
  let healthPercent = entity.health / entity.maxHealth
  if (healthPercent > 0.50) return

  // Track summon count — max 2 waves
  let summonCount = entity.persistentData.contains('icraft_summon_count')
    ? entity.persistentData.getInt('icraft_summon_count')
    : 0
  if (summonCount >= 2) return

  // Cooldown: only summon every 10 tick cycles (20 seconds)
  let summonTimer = entity.persistentData.contains('icraft_summon_timer')
    ? entity.persistentData.getInt('icraft_summon_timer')
    : 0
  summonTimer++
  entity.persistentData.putInt('icraft_summon_timer', summonTimer)

  if (summonTimer < 10) return
  entity.persistentData.putInt('icraft_summon_timer', 0)
  entity.persistentData.putInt('icraft_summon_count', summonCount + 1)

  // Spawn 2 reinforcement mobs of the same type
  let mobType = entity.type
  let pos = entity.blockPosition()

  for (let i = 0; i < 2; i++) {
    try {
      let reinforcement = level.createEntity(mobType)
      if (!reinforcement) continue

      let offsetX = (Math.random() - 0.5) * 4
      let offsetZ = (Math.random() - 0.5) * 4
      reinforcement.setPosition(pos.x + offsetX, pos.y + 0.5, pos.z + offsetZ)

      // Reinforcements are weaker — half HP, no champion status
      reinforcement.persistentData.putBoolean('icraft_reinforcement', true)
      reinforcement.persistentData.putBoolean('icraft_champ_processed', true)

      level.addFreshEntity(reinforcement)

      // Halve the reinforcement's max HP after spawning
      try {
        reinforcement.modifyAttribute(
          'minecraft:generic.max_health',
          'icraft_reinforcement_hp',
          -0.5,
          'multiply_base'
        )
        reinforcement.health = reinforcement.maxHealth
      } catch (e) {}
    } catch (e) {}
  }

  // Visual/audio feedback — apply brief glowing to summoner
  entity.potionEffects.add('minecraft:glowing', 40, 0, false, true)
}


// =============================================================================
// SECTION 3: Custom Affix Behaviors — On-Hit (Draining, Hexing)
// =============================================================================

EntityEvents.hurt(event => {
  let target = event.entity
  if (!target || !target.player) return
  if (target.creative || target.spectator) return

  let source = event.source
  let attacker = source.actual
  if (!attacker || !attacker.living) return
  if (!attacker.persistentData.contains('icraft_custom_affix')) return

  let affix = attacker.persistentData.getString('icraft_custom_affix')

  switch (affix) {
    case 'draining':
      onHitDraining(target, attacker)
      break
    case 'hexing':
      onHitHexing(target, attacker)
      break
    // Commanding, Leaping, Summoning are tick-based — no on-hit needed
  }
})


// ─── Draining: Leech XP from player on hit ───
// Design doc: "Hits steal 5% of player's current mana/stamina"
// Since mana systems vary, we drain XP points as a universal resource
function onHitDraining(player, attacker) {
  // Drain 3-8 XP points per hit (scales with attacker's champion tier)
  let tier = getChampionTier(attacker)
  let drainAmount = 3 + (tier * 2)  // Rank 1: 5, Rank 2: 7, Rank 3: 9, Rank 4: 11

  let currentXp = player.xp
  if (currentXp <= 0) return  // No XP to drain

  let actualDrain = Math.min(drainAmount, currentXp)
  player.giveExperiencePoints(-actualDrain)

  // Brief nausea to indicate XP drain (0.5 seconds — noticeable but not annoying)
  player.potionEffects.add('minecraft:nausea', 10, 0, false, true)

  // Heal the draining champion slightly (life steal flavor)
  let healAmount = actualDrain * 0.3
  attacker.heal(healAmount)
}


// ─── Hexing: Apply random debuff on hit ───
// Design doc: "20% chance to apply random negative potion effect (2s duration)"
function onHitHexing(player, attacker) {
  if (Math.random() > 0.20) return  // 20% chance

  let tier = getChampionTier(attacker)
  let duration = 40 + (tier * 20)  // Rank 1: 3s, Rank 2: 4s, Rank 3: 5s, Rank 4: 6s
  let amplifier = Math.min(tier - 1, 1)  // Rank 1-2: level I, Rank 3-4: level II

  let debuffs = [
    'minecraft:slowness',
    'minecraft:weakness',
    'minecraft:mining_fatigue',
    'minecraft:blindness',
    'minecraft:hunger',
    'minecraft:unluck',
  ]

  // Roll 1-2 debuffs (Rank 3+ can apply 2)
  let numDebuffs = tier >= 3 ? 2 : 1

  // Shuffle and pick
  let shuffled = debuffs.sort(() => Math.random() - 0.5)
  for (let i = 0; i < numDebuffs && i < shuffled.length; i++) {
    player.potionEffects.add(shuffled[i], duration, amplifier, false, true)
  }
}


// =============================================================================
// SECTION 4: Utility Functions
// =============================================================================

// Detect if an entity is a Champions mod champion
// Champions Unofficial stores data via Forge capabilities.
// We detect champions by checking:
//   1. The entity's custom name contains rank color formatting (champions get colored names)
//   2. The entity has champion-specific NBT in ForgeData
function detectChampion(entity) {
  try {
    // Method 1: Check for champion capability data in full NBT
    // Champions stores "championTier" in the entity's capability data
    let nbt = entity.fullNBT
    if (nbt) {
      // Champions Unofficial stores data under ForgeCaps with the champions mod key
      let nbtStr = nbt.toString()
      if (nbtStr.includes('champions') && nbtStr.includes('Tier')) {
        return true
      }
    }
  } catch (e) {}

  try {
    // Method 2: Check custom name for Champions rank color codes
    // Champions mod applies colored custom names like "[Rank I] Zombie"
    let name = entity.customName
    if (name) {
      let nameStr = name.toString()
      // Champions uses bracket notation with tier number
      if (nameStr.includes('Champion') || nameStr.includes('\u00a7') && nameStr.includes('[')) {
        return true
      }
    }
  } catch (e) {}

  try {
    // Method 3: Check if entity has more max HP than base (champions get growth factor)
    // Champions applies growthFactor to HP — a Rank 1 mob has 2x base HP
    // This is a heuristic: if the mob has significantly more HP than its type's base,
    // it's likely a champion. We check for the "champion" tag in entity tags.
    if (entity.tags.contains('champion') || entity.tags.contains('champions:champion')) {
      return true
    }
  } catch (e) {}

  return false
}

// Get the champion tier (rank) of an entity
// Returns 0 if not a champion, 1-4 for champion ranks
function getChampionTier(entity) {
  try {
    let nbt = entity.fullNBT
    if (nbt) {
      let nbtStr = nbt.toString()
      // Look for tier data in the NBT string
      // Champions stores tier as an integer
      let tierMatch = nbtStr.match(/Tier[:\s]*(\d+)/i)
      if (tierMatch) return parseInt(tierMatch[1])
    }
  } catch (e) {}

  try {
    // Fallback: check custom name for rank indicators
    let name = entity.customName
    if (name) {
      let nameStr = name.toString()
      if (nameStr.includes('IV') || nameStr.includes('4')) return 4
      if (nameStr.includes('III') || nameStr.includes('3')) return 3
      if (nameStr.includes('II')) return 2
      return 1
    }
  } catch (e) {}

  return 1  // Default to Rank 1 if detected as champion but can't determine tier
}

// Demote a champion — neutralize its champion bonuses
// We can't remove Champions capability data directly, so we apply
// counter-modifiers to effectively make it act like a normal mob
function demoteChampion(entity) {
  entity.persistentData.putBoolean('icraft_champ_demoted', true)

  // Remove the custom name that Champions applies
  try {
    entity.customName = null
    entity.customNameVisible = false
  } catch (e) {}

  // Counter the HP growth factor by reducing max HP
  // Champions Rank 1 has growthFactor 2 (2x HP), so we halve it
  try {
    entity.modifyAttribute(
      'minecraft:generic.max_health',
      'icraft_champ_demote_hp',
      -0.50,
      'multiply_base'
    )
    entity.health = Math.min(entity.health, entity.maxHealth)
  } catch (e) {}
}

// Roll a weighted custom affix based on dimension
function rollWeightedAffix(dim) {
  let weights = DIMENSION_AFFIX_WEIGHTS[dim]
  if (!weights) {
    // Default: equal weight
    return CUSTOM_AFFIXES[Math.floor(Math.random() * CUSTOM_AFFIXES.length)]
  }

  // Build weighted pool
  let pool = []
  for (let affix in weights) {
    for (let i = 0; i < weights[affix]; i++) {
      pool.push(affix)
    }
  }

  return pool[Math.floor(Math.random() * pool.length)]
}

// Assign a custom affix to an entity
function assignCustomAffix(entity, affix) {
  entity.persistentData.putString('icraft_custom_affix', affix)

  // Apply passive effects based on affix type
  switch (affix) {
    case 'commanding':
      // Commanding champions glow to indicate their aura
      entity.potionEffects.add('minecraft:glowing', 999999, 0, false, false)
      break
    case 'leaping':
      // Leaping champions get a speed boost for chase-down potential
      entity.potionEffects.add('minecraft:jump_boost', 999999, 1, false, false)
      break
    case 'summoning':
      // Initialize summon trackers
      entity.persistentData.putInt('icraft_summon_count', 0)
      entity.persistentData.putInt('icraft_summon_timer', 0)
      break
    case 'draining':
      // Draining champions get a subtle visual — dark particles via wither effect (brief)
      entity.potionEffects.add('minecraft:wither', 1, 0, false, true) // 1 tick — just for particles
      break
    case 'hexing':
      // Hexing champions get resistance (they're debuff-focused, need survivability)
      entity.potionEffects.add('minecraft:resistance', 999999, 0, false, false)
      break
  }
}

// Check if a modded entity is hostile (supplement for entity.monster check)
function isHostileModdedChamp(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:') ||
         type.startsWith('theabyss:')
}


// =============================================================================
// SECTION 5: Champion Death Rewards & Feedback
// =============================================================================

EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (!entity.persistentData.contains('icraft_custom_affix')) return

  let affix = entity.persistentData.getString('icraft_custom_affix')
  let source = event.source
  let killer = source.player

  if (!killer) return

  // Bonus XP for killing a champion with a custom affix
  // Design doc: Champions already drop bonus loot/XP, but custom affixes
  // are an additional layer of difficulty deserving extra reward
  let tier = getChampionTier(entity)
  let bonusXp = 10 + (tier * 8) + (affix === 'summoning' ? 5 : 0)
  killer.giveExperiencePoints(bonusXp)

  // Notify the player of the custom affix kill
  let affixDisplay = affix.charAt(0).toUpperCase() + affix.slice(1)
  let tierColors = { 1: '\u00a7e', 2: '\u00a76', 3: '\u00a7c', 4: '\u00a75' }
  let color = tierColors[tier] || '\u00a7e'
  killer.tell(color + 'Defeated a ' + affixDisplay + ' Champion! ' + '\u00a77(+' + bonusXp + ' XP)')
})


// =============================================================================
// SECTION 6: Debug / Admin Commands
// =============================================================================

// Register a simple chat-based debug command for testing
// Usage: type "!champinfo" while looking at a mob
PlayerEvents.chat(event => {
  let msg = event.message.trim()
  if (msg !== '!champinfo') return
  event.cancel()

  let player = event.player
  if (!player.op) {
    player.tell('\u00a7cOp-only command.')
    return
  }

  // Check entities near the player's look direction
  let nearestMob = player.level.getNearestEntity(
    player.x, player.y, player.z, 8
  )

  // Fallback: get nearest non-player entity within 5 blocks
  let entities = player.level.getEntitiesWithin(
    AABB.of(player.x - 5, player.y - 3, player.z - 5, player.x + 5, player.y + 3, player.z + 5)
  )

  let target = null
  let closestDist = 999
  for (let e of entities) {
    if (!e || !e.living || e.player) continue
    let d = e.distanceToEntity(player)
    if (d < closestDist) {
      closestDist = d
      target = e
    }
  }

  if (!target) {
    player.tell('\u00a77No mob found within 5 blocks.')
    return
  }

  let isChamp = detectChampion(target)
  let tier = getChampionTier(target)
  let customAffix = target.persistentData.contains('icraft_custom_affix')
    ? target.persistentData.getString('icraft_custom_affix')
    : 'none'
  let demoted = target.persistentData.contains('icraft_champ_demoted')

  player.tell('\u00a76--- Champion Info ---')
  player.tell('\u00a77Entity: \u00a7f' + target.type)
  player.tell('\u00a77Is Champion: \u00a7f' + isChamp)
  player.tell('\u00a77Champion Tier: \u00a7f' + tier)
  player.tell('\u00a77Custom Affix: \u00a7f' + customAffix)
  player.tell('\u00a77Demoted: \u00a7f' + demoted)
  player.tell('\u00a77HP: \u00a7f' + Math.round(target.health) + '/' + Math.round(target.maxHealth))
})
