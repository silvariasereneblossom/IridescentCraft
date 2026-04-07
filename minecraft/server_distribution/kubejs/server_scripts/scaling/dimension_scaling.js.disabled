// =============================================================================
// IridescentCraft — Dimension-Based Mob Scaling
// File: kubejs/server_scripts/scaling/dimension_scaling.js
//
// Design Doc Part II: Stat Scaling Per Dimension
//
// This script applies per-dimension HP/Damage/Speed/Armor multipliers to
// hostile mobs when they spawn. This is the PRIMARY scaling axis — ScalingMobs
// handles gentle time-based scaling on top of this.
//
// All multipliers are applied as percentage bonuses to base stats.
// Example: Nether zombie (20 HP base) × 4.0x = 80 HP
//
// Boss entities are EXCLUDED — they scale via Progressive Bosses + boss_hp.js
// =============================================================================

EntityEvents.spawned(event => {
  try {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.player) return

  // Only scale hostile mobs (skip passives, NPCs, bosses)
  let type = entity.type
  if (!entity.monster && !isHostileModded(type)) return

  // Skip bosses — they have their own scaling systems
  if (isBoss(type)) return

  // Skip already-scaled mobs (prevent double-scaling on chunk reload)
  if (entity.persistentData.contains('icraft_scaled')) return

  let dim = entity.level.dimension
  let scale = getDimensionScale(dim)
  if (!scale) return // Unknown dimension — no scaling

  // Apply stat multipliers via attributes
  applyScaling(entity, scale)

  // Mark as scaled
  entity.persistentData.putBoolean('icraft_scaled', true)
  } catch (e) {
    // Some modded entities have abstract methods that crash when accessed
  }
})

// ─── Dimension Scale Tables ───
// Format: { hp, damage, speed, armor }
// Values are MULTIPLIERS (1.0 = vanilla, 2.0 = double)
function getDimensionScale(dim) {
  const SCALES = {
    // Tier 1
    'minecraft:overworld':              { hp: 1.0,  dmg: 1.0,  spd: 1.0,  armor: 0  },

    // Tier 2
    'twilightforest:twilight_forest':   { hp: 1.8,  dmg: 2.0,  spd: 1.05, armor: 2  },
    'blue_skies:everbright':            { hp: 2.0,  dmg: 2.3,  spd: 1.05, armor: 3  },
    'blue_skies:everdawn':              { hp: 2.0,  dmg: 2.3,  spd: 1.05, armor: 3  },
    'aether:the_aether':                { hp: 2.2,  dmg: 2.5,  spd: 1.08, armor: 4  },

    // Tier 3
    'undergarden:undergarden':          { hp: 3.0,  dmg: 3.5,  spd: 1.10, armor: 6  },
    'deeperdarker:otherside':           { hp: 3.5,  dmg: 4.0,  spd: 1.10, armor: 7  },
    'minecraft:the_nether':             { hp: 4.0,  dmg: 5.0,  spd: 1.12, armor: 8  },
    'theabyss:the_abyss':               { hp: 3.5,  dmg: 4.0,  spd: 1.10, armor: 7  },

    // Tier 4
    'deep_aether:the_aether':           { hp: 5.0,  dmg: 6.5,  spd: 1.15, armor: 10 },
    'minecraft:the_end':                { hp: 6.0,  dmg: 8.0,  spd: 1.15, armor: 12 },
    // End multi-zone scaling is biome-based — handled separately below

    // Ad Astra Planets (Post-T4 Endgame)
    'ad_astra:moon':                    { hp: 7.0,  dmg: 7.0,  spd: 1.10, armor: 14 },
    'ad_astra:mars':                    { hp: 8.0,  dmg: 8.0,  spd: 1.12, armor: 16 },
    'ad_astra:mercury':                 { hp: 9.0,  dmg: 9.0,  spd: 1.15, armor: 18 },
    'ad_astra:venus':                   { hp: 10.0, dmg: 10.0, spd: 1.18, armor: 20 },
    'ad_astra:glacio':                  { hp: 12.0, dmg: 12.0, spd: 1.20, armor: 24 },
  }
  return SCALES[dim] || null
}

// ─── Apply Scaling ───
function applyScaling(entity, scale) {
  // HP: multiply_base operation (multiplicative with base max_health)
  if (scale.hp > 1.0) {
    entity.modifyAttribute(
      'minecraft:generic.max_health',
      'icraft_dim_hp',
      scale.hp - 1.0,   // multiply_base adds percentage: 0.8 = +80%
      'multiply_base'
    )
    // Heal to new max
    entity.heal(entity.maxHealth)
  }

  // Damage: multiply_base
  if (scale.dmg > 1.0) {
    entity.modifyAttribute(
      'minecraft:generic.attack_damage',
      'icraft_dim_dmg',
      scale.dmg - 1.0,
      'multiply_base'
    )
  }

  // Speed: multiply_base (applied as fraction above 1.0)
  if (scale.spd > 1.0) {
    entity.modifyAttribute(
      'minecraft:generic.movement_speed',
      'icraft_dim_spd',
      scale.spd - 1.0,
      'multiply_base'
    )
  }

  // Armor: flat addition
  if (scale.armor > 0) {
    entity.modifyAttribute(
      'minecraft:generic.armor',
      'icraft_dim_armor',
      scale.armor,
      'addition'
    )
  }

  // End multi-zone: check biome for escalated scaling
  if (entity.level.dimension === 'minecraft:the_end') {
    applyEndZoneScaling(entity)
  }
}

// ─── End Multi-Zone Scaling ───
// Design doc: End has 3 zones with escalating difficulty
// Outer Islands: 6.0x (base End scaling above)
// Deep End / End Cities: 7.5x HP, 9.0x DMG
// Dragon's Domain: 10.0x HP, 12.0x DMG
function applyEndZoneScaling(entity) {
  let pos = entity.blockPosition()

  // Dragon's Domain: within 200 blocks of origin (0,0)
  let distSq = pos.x * pos.x + pos.z * pos.z
  if (distSq < 200 * 200) {
    // Dragon's Domain — upgrade from 6.0x to 10.0x
    let extraHp = (10.0 - 6.0) / 6.0  // Additional ~66% on top of base
    let extraDmg = (12.0 - 8.0) / 8.0  // Additional ~50%
    entity.modifyAttribute('minecraft:generic.max_health', 'icraft_end_zone', extraHp, 'multiply_base')
    entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_end_zone_dmg', extraDmg, 'multiply_base')
    entity.modifyAttribute('minecraft:generic.armor', 'icraft_end_zone_armor', 4, 'addition') // +4 on top of +12
    entity.heal(entity.maxHealth)
    return
  }

  // Deep End (End Cities area): 800-2000 blocks from origin
  if (distSq > 800 * 800) {
    // Deep End — upgrade from 6.0x to 7.5x
    let extraHp = (7.5 - 6.0) / 6.0
    let extraDmg = (9.0 - 8.0) / 8.0
    entity.modifyAttribute('minecraft:generic.max_health', 'icraft_end_zone', extraHp, 'multiply_base')
    entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_end_zone_dmg', extraDmg, 'multiply_base')
    entity.modifyAttribute('minecraft:generic.armor', 'icraft_end_zone_armor', 2, 'addition')
    entity.heal(entity.maxHealth)
  }
  // Outer Islands (200-800): uses base End scaling (6.0x) — no extra
}

// ─── Boss Blacklist ───
function isBoss(type) {
  const BOSSES = new Set([
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
    'cataclysm:maledictus', 'cataclysm:ender_golem',
    'cataclysm:ignited_revenant', 'cataclysm:void_blossom',
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
  return BOSSES.has(type)
}

// Some modded mobs are hostile but don't extend Monster class
function isHostileModded(type) {
  // Add any modded hostile mobs that aren't detected as monster
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:')
}
