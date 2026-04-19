// =============================================================================
// IridescentCraft — Unified Mob Scaling
// File: kubejs/server_scripts/scaling/mob_scaling_unified.js
//
// Single EntityEvents.spawned handler that applies BOTH:
//   1. Mob Tier HP (basic 3x, mid 1.5x, champion 1.25x, boss 1x)
//   2. Dimension Scaling (HP, damage, speed, armor per dimension)
//
// Merged to reduce per-spawn overhead from 2 separate event handlers to 1.
// Boss entities are excluded — they scale via boss_hp.js + boss_progressive.js
// =============================================================================

EntityEvents.spawned(event => {
  try {
    let entity = event.entity
    if (!entity || !entity.living) return
    if (entity.player) return

    let type = entity.type

    // Skip entities with broken abstract methods that crash on property access
    if (BROKEN_ENTITIES.has(type)) return

    // Skip already-processed mobs (single flag for both systems)
    if (entity.persistentData.contains('icraft_scaled')) return

    // Skip bosses — they have their own scaling systems
    if (BOSSES.has(type)) return

    // Only scale hostile mobs (skip passives, NPCs)
    let isHostile = entity.monster || isHostileMod(type)
    if (!isHostile) {
      entity.persistentData.putBoolean('icraft_scaled', true)
      return
    }

    // ── Mob Tier HP ──
    let tierMult = getMobTierMultiplier(entity, type)
    if (tierMult > 1.0) {
      entity.modifyAttribute(
        'minecraft:generic.max_health',
        'icraft_mob_tier_hp',
        tierMult - 1.0,
        'multiply_base'
      )
    }

    // ── Dimension Scaling ──
    let dim = entity.level.dimension
    let scale = DIMENSION_SCALES[dim]
    if (scale) {
      if (scale.hp > 1.0) {
        entity.modifyAttribute('minecraft:generic.max_health', 'icraft_dim_hp', scale.hp - 1.0, 'multiply_base')
      }
      if (scale.dmg > 1.0) {
        entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_dim_dmg', scale.dmg - 1.0, 'multiply_base')
      }
      if (scale.spd > 1.0) {
        entity.modifyAttribute('minecraft:generic.movement_speed', 'icraft_dim_spd', scale.spd - 1.0, 'multiply_base')
      }
      if (scale.armor > 0) {
        entity.modifyAttribute('minecraft:generic.armor', 'icraft_dim_armor', scale.armor, 'addition')
      }

      // End multi-zone scaling
      if (dim === 'minecraft:the_end') {
        let pos = entity.blockPosition()
        let distSq = pos.x * pos.x + pos.z * pos.z
        if (distSq < 200 * 200) {
          // Dragon's Domain — upgrade from 6.0x to 10.0x
          entity.modifyAttribute('minecraft:generic.max_health', 'icraft_end_zone', (10.0 - 6.0) / 6.0, 'multiply_base')
          entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_end_zone_dmg', (12.0 - 8.0) / 8.0, 'multiply_base')
          entity.modifyAttribute('minecraft:generic.armor', 'icraft_end_zone_armor', 4, 'addition')
        } else if (distSq > 800 * 800) {
          // Deep End — upgrade from 6.0x to 7.5x
          entity.modifyAttribute('minecraft:generic.max_health', 'icraft_end_zone', (7.5 - 6.0) / 6.0, 'multiply_base')
          entity.modifyAttribute('minecraft:generic.attack_damage', 'icraft_end_zone_dmg', (9.0 - 8.0) / 8.0, 'multiply_base')
          entity.modifyAttribute('minecraft:generic.armor', 'icraft_end_zone_armor', 2, 'addition')
        }
      }
    }

    // Heal to new max after all modifiers applied
    entity.heal(entity.maxHealth)

    // Mark as processed (single flag for both systems)
    entity.persistentData.putBoolean('icraft_scaled', true)
  } catch (e) {
    // Some modded entities have abstract methods that crash when accessed
  }
})

// ── Dimension Scale Tables ──
const DIMENSION_SCALES = {
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
  // Ad Astra Planets (Post-T4)
  'ad_astra:moon':                    { hp: 7.0,  dmg: 7.0,  spd: 1.10, armor: 14 },
  'ad_astra:mars':                    { hp: 8.0,  dmg: 8.0,  spd: 1.12, armor: 16 },
  'ad_astra:mercury':                 { hp: 9.0,  dmg: 9.0,  spd: 1.15, armor: 18 },
  'ad_astra:venus':                   { hp: 10.0, dmg: 10.0, spd: 1.18, armor: 20 },
  'ad_astra:glacio':                  { hp: 12.0, dmg: 12.0, spd: 1.20, armor: 24 },
}

// ── Mob Tier Classification ──
function getMobTierMultiplier(entity, type) {
  if (isChampion(entity)) return 1.25
  if (BASIC_MOBS.has(type)) return 3.0
  if (MID_TIER_MOBS.has(type)) return 1.5
  if (entity.monster) return 3.0
  if (isHostileMod(type)) return 1.5
  return 1.0
}

// ── Champion Detection ──
function isChampion(entity) {
  try {
    let nbt = entity.fullNBT
    if (nbt && nbt.contains && nbt.contains('champion')) return true
    if (nbt && nbt.contains('ForgeData')) {
      let forgeData = nbt.getCompound('ForgeData')
      if (forgeData.contains('champion')) return true
    }
  } catch (e) {}
  return false
}

// ── Modded hostiles that don't extend Monster ──
function isHostileMod(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:')
}

// ── Boss Blacklist ──
// Entities with abstract methods that crash KubeJS on any property access.
// Rhino's try/catch does NOT catch java.lang.Error subclasses (e.g.
// AbstractMethodError), so every handler that accesses item slots or
// similar must guard against these entities BEFORE the call. Keep this
// list in sync with MOB_EQUIP_BROKEN_ENTITIES in mob_equipment.js.
const BROKEN_ENTITIES = new Set([
  'irons_spellbooks:necromancer',
  'irons_spellbooks:archevoker',
])

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

// ── Basic Mobs (3x HP) ──
const BASIC_MOBS = new Set([
  'minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider', 'minecraft:creeper',
  'minecraft:drowned', 'minecraft:stray', 'minecraft:husk', 'minecraft:cave_spider',
  'minecraft:slime', 'minecraft:silverfish', 'minecraft:witch', 'minecraft:phantom',
  'minecraft:enderman', 'minecraft:zombie_villager', 'minecraft:vindicator',
  'minecraft:pillager', 'minecraft:evoker', 'minecraft:vex',
  'minecraft:skeleton_horseman', 'minecraft:magma_cube',
  'alexsmobs:grizzly_bear', 'alexsmobs:rattlesnake', 'alexsmobs:crocodile',
  'alexsmobs:soul_vulture', 'alexsmobs:bone_serpent',
  'creeper_overhaul:jungle_creeper', 'creeper_overhaul:bamboo_creeper',
  'creeper_overhaul:desert_creeper', 'creeper_overhaul:badlands_creeper',
  'creeper_overhaul:hills_creeper', 'creeper_overhaul:dripstone_creeper',
  'creeper_overhaul:cave_creeper', 'creeper_overhaul:dark_oak_creeper',
  'creeper_overhaul:mushroom_creeper', 'creeper_overhaul:ocean_creeper',
  'creeper_overhaul:spruce_creeper', 'creeper_overhaul:beach_creeper',
  'creeper_overhaul:snowy_creeper', 'creeper_overhaul:swamp_creeper',
  'creeper_overhaul:savannah_creeper',
  'enemy_expansion:undead_warrior', 'enemy_expansion:undead_archer',
  'the_undead_revamped:zombie_brute',
])

// ── Mid-Tier Mobs (1.5x HP) ──
const MID_TIER_MOBS = new Set([
  'minecraft:blaze', 'minecraft:wither_skeleton', 'minecraft:piglin_brute',
  'minecraft:ghast', 'minecraft:hoglin', 'minecraft:zoglin', 'minecraft:piglin',
  'minecraft:zombified_piglin', 'minecraft:guardian', 'minecraft:elder_guardian',
  'minecraft:ravager', 'minecraft:endermite', 'minecraft:shulker',
  'twilightforest:blockchain_goblin', 'twilightforest:helmet_crab',
  'twilightforest:hostile_wolf', 'twilightforest:kobold', 'twilightforest:maze_slime',
  'twilightforest:minotaur', 'twilightforest:mist_wolf', 'twilightforest:redcap',
  'twilightforest:redcap_sapper', 'twilightforest:skeleton_druid',
  'twilightforest:slime_beetle', 'twilightforest:swarm_spider',
  'twilightforest:towerwood_borer', 'twilightforest:wraith', 'twilightforest:yeti',
  'twilightforest:winter_wolf', 'twilightforest:fire_beetle',
  'twilightforest:pinch_beetle', 'twilightforest:death_tome',
  'twilightforest:troll', 'twilightforest:giant_miner', 'twilightforest:armored_giant',
  'blue_skies:venomous_snake', 'blue_skies:soul_spider',
  'blue_skies:whistleshell_crab', 'blue_skies:armored_frost_spirit',
  'blue_skies:frost_spirit', 'blue_skies:shadowfolk',
  'blue_skies:blinding_sentinel', 'blue_skies:stonelet',
  'aether:sentry', 'aether:mimic', 'aether:cockatrice',
  'aether:zephyr', 'aether:fire_minion',
  'undergarden:rotling', 'undergarden:brute', 'undergarden:stoneborn',
  'undergarden:sploogie', 'undergarden:nargoyle', 'undergarden:muncher',
  'deeperdarker:sculk_snapper', 'deeperdarker:sculk_leech', 'deeperdarker:sculk_centipede',
  'irons_spellbooks:dead_king_knight', 'irons_spellbooks:venomous_spider',
  'irons_spellbooks:necromancer', 'irons_spellbooks:apothecarist',
  'irons_spellbooks:cryomancer', 'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest', 'irons_spellbooks:archevoker', 'irons_spellbooks:keeper',
  'theabyss:dark_skeleton', 'theabyss:dark_zombie',
  'theabyss:soul_knight', 'theabyss:shadow_mage',
  'cataclysm:kobolediator', 'cataclysm:deepling', 'cataclysm:deepling_brute',
  'cataclysm:deepling_priest', 'cataclysm:deepling_angler',
  'cataclysm:aptrgangr', 'cataclysm:lionfish', 'cataclysm:coralssus',
])

console.log('[IridescentCraft] Unified mob scaling loaded (tier HP + dimension scaling)')
