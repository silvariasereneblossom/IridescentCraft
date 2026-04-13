// =============================================================================
// IridescentCraft — Mob Tier HP Scaling
// File: kubejs/server_scripts/scaling/mob_tier_hp.js
//
// Applies a base HP multiplier to all hostile mobs based on creature tier.
// This makes even basic mobs a real threat and scales the combat feel
// across the entire progression.
//
// Tiers:
//   Basic (3x)     — Common Overworld trash mobs
//   Mid-tier (1.5x) — Nether, dimensional, and dungeon mobs
//   Champion (1.25x) — Mobs with Champions affixes (stacks on top)
//   Boss (1x)       — Boss entities (no change, they have custom HP)
//
// Applied via multiply_base, stacks multiplicatively with dimension_scaling.js
// and ascension.js. Runs BEFORE dimension scaling (lower priority spawned event
// is not available, so we use a separate persistent data flag).
// =============================================================================

EntityEvents.spawned(event => {
  try {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.player) return

  // Skip already-processed mobs
  if (entity.persistentData.contains('icraft_mob_tier')) return

  // Skip bosses — they have custom HP via boss_hp.js
  if (isTierBoss(entity.type)) return

  // Determine tier and multiplier
  let mult = getMobTierMultiplier(entity)
  if (mult <= 1.0) {
    entity.persistentData.putBoolean('icraft_mob_tier', true)
    return
  }

  // Apply HP multiplier
  entity.modifyAttribute(
    'minecraft:generic.max_health',
    'icraft_mob_tier_hp',
    mult - 1.0,  // multiply_base: 2.0 = +200% = 3x total
    'multiply_base'
  )

  // Heal to new max
  entity.heal(entity.maxHealth)

  // Mark as processed
  entity.persistentData.putBoolean('icraft_mob_tier', true)
  } catch (e) {
    // Some modded entities (e.g. Iron's Spellbooks NecromancerEntity) have abstract methods
    // that crash when accessed. Silently skip these.
  }
})

// ─── Tier Classification ───

function getMobTierMultiplier(entity) {
  let type = entity.type

  // Check if Champion (has custom name formatting from Champions mod)
  if (isChampion(entity)) return 1.25

  // Basic mobs: 3x HP
  if (BASIC_MOBS.has(type)) return 3.0

  // Mid-tier mobs: 1.5x HP
  if (MID_TIER_MOBS.has(type)) return 1.5

  // Catch-all for hostile mobs not in either list:
  // If it's a monster, give it the basic multiplier
  if (entity.monster) return 3.0

  // Modded hostiles that don't extend Monster
  if (isHostileMod(type)) return 1.5

  // Non-hostile entities (animals, NPCs, etc.) — no scaling
  return 1.0
}

// ─── Champion Detection ───
function isChampion(entity) {
  // Champions mod marks entities with champion data in NBT
  // Check for the champions:rank NBT tag or custom name with color codes
  try {
    let nbt = entity.fullNBT
    if (nbt && nbt.contains && nbt.contains('champion')) return true
    // Fallback: Champions add colored name formatting
    let name = entity.customName
    if (name && name.getString && name.getString().length > 0) {
      let nameStr = entity.customNameVisible ? entity.customName.getString() : ''
      if (nameStr && entity.fullNBT && entity.fullNBT.contains('ForgeData')) {
        let forgeData = entity.fullNBT.getCompound('ForgeData')
        if (forgeData.contains('champion')) return true
      }
    }
  } catch (e) {
    // Silent catch — not a champion
  }
  return false
}

// ─── Basic Mobs (3x HP) ───
// Common Overworld threats that die too fast at any gear level
const BASIC_MOBS = new Set([
  // Vanilla Overworld
  'minecraft:zombie',
  'minecraft:skeleton',
  'minecraft:spider',
  'minecraft:creeper',
  'minecraft:drowned',
  'minecraft:stray',
  'minecraft:husk',
  'minecraft:cave_spider',
  'minecraft:slime',
  'minecraft:silverfish',
  'minecraft:witch',
  'minecraft:phantom',
  'minecraft:enderman',
  'minecraft:zombie_villager',
  'minecraft:vindicator',
  'minecraft:pillager',
  'minecraft:evoker',
  'minecraft:vex',

  // Vanilla variants
  'minecraft:skeleton_horseman',
  'minecraft:magma_cube',

  // Common modded Overworld hostiles
  'alexsmobs:grizzly_bear',
  'alexsmobs:rattlesnake',
  'alexsmobs:crocodile',
  'alexsmobs:soul_vulture',
  'alexsmobs:bone_serpent',
  'creeper_overhaul:jungle_creeper',
  'creeper_overhaul:bamboo_creeper',
  'creeper_overhaul:desert_creeper',
  'creeper_overhaul:badlands_creeper',
  'creeper_overhaul:hills_creeper',
  'creeper_overhaul:dripstone_creeper',
  'creeper_overhaul:cave_creeper',
  'creeper_overhaul:dark_oak_creeper',
  'creeper_overhaul:mushroom_creeper',
  'creeper_overhaul:ocean_creeper',
  'creeper_overhaul:spruce_creeper',
  'creeper_overhaul:beach_creeper',
  'creeper_overhaul:snowy_creeper',
  'creeper_overhaul:swamp_creeper',
  'creeper_overhaul:savannah_creeper',

  // Improved Mobs / Enemy Expansion variants
  'enemy_expansion:undead_warrior',
  'enemy_expansion:undead_archer',

  // The Undead Revamped
  'the_undead_revamped:zombie_brute',
])

// ─── Mid-Tier Mobs (1.5x HP) ───
// Dimensional and dungeon mobs that are already tougher
const MID_TIER_MOBS = new Set([
  // Vanilla Nether
  'minecraft:blaze',
  'minecraft:wither_skeleton',
  'minecraft:piglin_brute',
  'minecraft:ghast',
  'minecraft:hoglin',
  'minecraft:zoglin',
  'minecraft:piglin',
  'minecraft:zombified_piglin',
  'minecraft:guardian',
  'minecraft:elder_guardian',
  'minecraft:ravager',
  'minecraft:endermite',
  'minecraft:shulker',

  // Twilight Forest
  'twilightforest:blockchain_goblin',
  'twilightforest:helmet_crab',
  'twilightforest:hostile_wolf',
  'twilightforest:kobold',
  'twilightforest:maze_slime',
  'twilightforest:minotaur',
  'twilightforest:mist_wolf',
  'twilightforest:redcap',
  'twilightforest:redcap_sapper',
  'twilightforest:skeleton_druid',
  'twilightforest:slime_beetle',
  'twilightforest:swarm_spider',
  'twilightforest:towerwood_borer',
  'twilightforest:wraith',
  'twilightforest:yeti',
  'twilightforest:winter_wolf',
  'twilightforest:fire_beetle',
  'twilightforest:pinch_beetle',
  'twilightforest:death_tome',
  'twilightforest:troll',
  'twilightforest:giant_miner',
  'twilightforest:armored_giant',

  // Blue Skies
  'blue_skies:venomous_snake',
  'blue_skies:soul_spider',
  'blue_skies:whistleshell_crab',
  'blue_skies:armored_frost_spirit',
  'blue_skies:frost_spirit',
  'blue_skies:shadowfolk',
  'blue_skies:blinding_sentinel',
  'blue_skies:stonelet',

  // Aether
  'aether:sentry',
  'aether:mimic',
  'aether:cockatrice',
  'aether:zephyr',
  'aether:fire_minion',

  // Undergarden
  'undergarden:rotling',
  'undergarden:brute',
  'undergarden:stoneborn',
  'undergarden:sploogie',
  'undergarden:nargoyle',
  'undergarden:muncher',

  // Deeper and Darker
  'deeperdarker:sculk_snapper',
  'deeperdarker:sculk_leech',
  'deeperdarker:sculk_centipede',

  // Iron's Spellbooks dungeon mobs
  'irons_spellbooks:dead_king_knight',
  'irons_spellbooks:venomous_spider',
  'irons_spellbooks:necromancer',
  'irons_spellbooks:apothecarist',
  'irons_spellbooks:cryomancer',
  'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest',
  'irons_spellbooks:archevoker',
  'irons_spellbooks:keeper',

  // The Abyss
  'theabyss:dark_skeleton',
  'theabyss:dark_zombie',
  'theabyss:soul_knight',
  'theabyss:shadow_mage',

  // Cataclysm mobs (non-boss)
  'cataclysm:kobolediator',
  'cataclysm:deepling',
  'cataclysm:deepling_brute',
  'cataclysm:deepling_priest',
  'cataclysm:deepling_angler',
  'cataclysm:aptrgangr',
  'cataclysm:lionfish',
  'cataclysm:coralssus',
])

// ─── Boss Blacklist ───
// Mirrors dimension_scaling.js boss list — bosses get 1x (no tier scaling)
function isTierBoss(type) {
  return TIER_BOSSES.has(type)
}

const TIER_BOSSES = new Set([
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

// Modded hostile mobs that don't extend Monster class
function isHostileMod(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:')
}
