// =============================================================================
// IridescentCraft — Per-Kill Boss Scaling (Modded Bosses)
// File: kubejs/server_scripts/scaling/boss_progressive.js
//
// Design Doc Part II: Progressive Bosses Configuration
//
// Progressive Bosses mod only handles Wither/Dragon/Elder Guardian.
// This script provides the same per-kill scaling for ALL modded bosses.
//
// Scaling is PER-WORLD (global kill counter, not per-player).
// Uses level.persistentData to track kill counts.
//
// Per-Kill Table (Design Doc):
//   Kill 1:   Base
//   Kill 2:   +15% HP, +10% DMG, +3% SPD
//   Kill 3:   +30% HP, +20% DMG, +5% SPD
//   Kill 5:   +50% HP, +35% DMG, +8% SPD
//   Kill 10:  +100% HP, +60% DMG, +12% SPD
//   Kill 15+: +150% HP (cap), +80% DMG (cap), +15% SPD (cap)
// =============================================================================

// ─── Spawn: Apply scaling based on current kill count ───
EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = entity.type
  if (!isScalableBoss(type)) return
  if (entity.persistentData.contains('icraft_prog_scaled')) return

  let kills = getKillCount(event.level, type)
  if (kills <= 0) return  // First encounter — base stats (already set by boss_hp.js)

  let scale = getProgressiveScale(kills)

  if (scale.hp > 0) {
    entity.modifyAttribute('minecraft:generic.max_health', 'icraft_prog_hp', scale.hp, 'multiply_base')
    entity.heal(entity.maxHealth)
  }
  if (scale.dmg > 0) {
    entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_prog_dmg', scale.dmg, 'multiply_base')
  }
  if (scale.spd > 0) {
    entity.modifyAttribute('minecraft:generic.movement_speed', 'icraft_prog_spd', scale.spd, 'multiply_base')
  }

  entity.persistentData.putBoolean('icraft_prog_scaled', true)
})

// ─── Kill: Increment kill counter ───
EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = entity.type
  if (!isScalableBoss(type)) return

  incrementKillCount(event.level, type)
})

// ─── Progressive Scale Lookup ───
function getProgressiveScale(kills) {
  // Interpolated from design doc table
  if (kills >= 15) return { hp: 1.50, dmg: 0.80, spd: 0.15 }
  if (kills >= 10) return { hp: 1.00, dmg: 0.60, spd: 0.12 }
  if (kills >= 7)  return { hp: 0.75, dmg: 0.48, spd: 0.10 }
  if (kills >= 5)  return { hp: 0.50, dmg: 0.35, spd: 0.08 }
  if (kills >= 3)  return { hp: 0.30, dmg: 0.20, spd: 0.05 }
  if (kills >= 2)  return { hp: 0.15, dmg: 0.10, spd: 0.03 }
  return { hp: 0, dmg: 0, spd: 0 }
}

// ─── Kill Count Storage ───
// Uses overworld's persistentData as the global store
function getKillCount(level, entityType) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return 0

  let data = overworld.persistentData
  let key = 'icraft_boss_kills'
  if (!data.contains(key)) return 0

  let kills = data.getCompound(key)
  let safeType = entityType.replace(':', '_')
  return kills.contains(safeType) ? kills.getInt(safeType) : 0
}

function incrementKillCount(level, entityType) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return

  let data = overworld.persistentData
  let key = 'icraft_boss_kills'
  if (!data.contains(key)) {
    data.put(key, {})
  }

  let kills = data.getCompound(key)
  let safeType = entityType.replace(':', '_')
  let current = kills.contains(safeType) ? kills.getInt(safeType) : 0
  kills.putInt(safeType, current + 1)

  // Log for server operators
  console.log(`[IridescentCraft] Boss killed: ${entityType} (total: ${current + 1})`)
}

// ─── Scalable Boss Registry ───
// Excludes Wither/Dragon/Elder Guardian (handled by Progressive Bosses mod)
function isScalableBoss(type) {
  const BOSSES = new Set([
    // Twilight Forest
    'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
    'twilightforest:ur_ghast', 'twilightforest:knight_phantom',
    'twilightforest:snow_queen', 'twilightforest:minoshroom', 'twilightforest:alpha_yeti',
    // Blue Skies
    'blue_skies:summoner', 'blue_skies:alchemist',
    'blue_skies:starlit_crusher', 'blue_skies:arachnarch',
    // Aether
    'aether:slider', 'aether:valkyrie_queen', 'aether:sun_spirit',
    // Deep Aether
    'deep_aether:eots_controller',
    // Undergarden
    'undergarden:forgotten_guardian', 'undergarden:forgotten',
    // Deeper Darker
    'deeperdarker:stalker', 'deeperdarker:shattered',
    'deeperdarker:shriek_worm', 'deeperdarker:sculk_centipede',
    // Cataclysm
    'cataclysm:netherite_monstrosity', 'cataclysm:ignis',
    'cataclysm:ender_guardian', 'cataclysm:ancient_remnant',
    'cataclysm:the_leviathan', 'cataclysm:the_harbinger',
    'cataclysm:maledictus', 'cataclysm:ender_golem',
    'cataclysm:ignited_revenant', 'cataclysm:void_blossom',
    // Botania
    'botania:doppleganger',
    // Meet Your Fight
    'meetyourfight:swampjaw', 'meetyourfight:bellringer',
    'meetyourfight:dame_fortuna', 'meetyourfight:rosalyne',
    // Mutant Monsters
    'mutantmonsters:mutant_zombie', 'mutantmonsters:mutant_skeleton',
    'mutantmonsters:mutant_creeper', 'mutantmonsters:mutant_enderman',
    // Stalwart Dungeons
    'stalwart_dungeons:shelterer', 'stalwart_dungeons:nether_keeper',
    'stalwart_dungeons:awful_ghast', 'stalwart_dungeons:incomplete_wither',
    // Battle Towers
    'keebsz:tower_guardian',
    // Iron's Spells
    'irons_spellbooks:dead_king', 'irons_spellbooks:fire_boss',
    'irons_spellbooks:citadel_keeper',
    // The Abyss
    'theabyss:soul_guard', 'theabyss:ice_knight',
    'theabyss:nightblade_boss', 'theabyss:the_roka', 'theabyss:elder',
    // Ultimate Bosses
    'ub:sorcerer', 'ub:storm',
    // Majestic Menaces
    'majestic_menaces:teikoku_senshi',
  ])
  return BOSSES.has(type)
}
