// =============================================================================
// IridescentCraft — Mob Equipment Scaling by Dimension
// File: kubejs/server_scripts/scaling/mob_equipment.js
//
// Design Doc Part II: Mob Equipment Scaling
//
//   Tier 1:  5%  with leather/iron (random pieces), no enchants
//   Tier 2: 20-25% with iron/steel, enchant level 0-1
//   Tier 3: 40-50% with steel/diamond, enchant level 1-3
//   Tier 4: 60-80% with diamond/netherite, enchant level 2-5
//
// Champions spawn with better gear (handled by Champions mod + this script).
// Equipment drops controlled separately via lootjs_overhaul.js.
//
// INTERACTION WITH IMPROVED MOBS:
// Improved Mobs also adds equipment to mobs. To avoid double-equipping:
// - This script only equips mobs that DON'T already have gear
// - IM's global equipment chance (30%) may stack — acceptable since IM
//   quality scales with difficulty while this script scales with dimension
// =============================================================================

// Entities with abstract getItemBySlot / setItemSlot that crash on access.
// Keep in sync with the BROKEN_ENTITIES list in mob_scaling_unified.js.
// Rhino's try/catch does NOT catch java.lang.Error subclasses like
// AbstractMethodError, so we must early-exit BEFORE any item-slot access.
const MOB_EQUIP_BROKEN_ENTITIES = new Set([
  'irons_spellbooks:necromancer',
  'irons_spellbooks:archevoker',
  'irons_spellbooks:cryomancer',
  'irons_spellbooks:pyromancer',
  'irons_spellbooks:priest',
])

EntityEvents.spawned(event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return
  if (MOB_EQUIP_BROKEN_ENTITIES.has(entity.type)) return
  if (entity.persistentData.contains('icraft_equipped')) return

  // Skip mobs that already have equipment (from IM or native spawns)
  if (hasExistingGear(entity)) {
    entity.persistentData.putBoolean('icraft_equipped', true)
    return
  }

  let dim = entity.level.dimension
  let config = getEquipConfig(dim)
  if (!config) return

  // Roll for equipment
  if (Math.random() > config.chance) {
    entity.persistentData.putBoolean('icraft_equipped', true)
    return
  }

  // Equip the mob
  equipMob(entity, config)
  entity.persistentData.putBoolean('icraft_equipped', true)
})

function getEquipConfig(dim) {
  const CONFIGS = {
    // Tier 1: 5% chance, leather/iron, no enchants
    'minecraft:overworld': {
      chance: 0.05,
      weapons: ['minecraft:iron_sword', 'minecraft:iron_axe'],
      helmets: ['minecraft:leather_helmet', 'minecraft:iron_helmet'],
      chests:  ['minecraft:leather_chestplate', 'minecraft:iron_chestplate'],
      legs:    ['minecraft:leather_leggings', 'minecraft:iron_leggings'],
      boots:   ['minecraft:leather_boots', 'minecraft:iron_boots'],
      enchantLevel: 0,
      fullSetChance: 0.2  // 20% get full set, rest get random pieces
    },

    // Tier 2: 20-25% chance, iron/steel tier
    'twilightforest:twilight_forest': {
      chance: 0.20,
      weapons: ['minecraft:iron_sword', 'minecraft:iron_axe', 'twilightforest:steeleaf_sword'],
      helmets: ['minecraft:iron_helmet', 'minecraft:chainmail_helmet'],
      chests:  ['minecraft:iron_chestplate', 'minecraft:chainmail_chestplate'],
      legs:    ['minecraft:iron_leggings', 'minecraft:chainmail_leggings'],
      boots:   ['minecraft:iron_boots', 'minecraft:chainmail_boots'],
      enchantLevel: 1,
      fullSetChance: 0.3
    },
    'blue_skies:everbright': {
      chance: 0.25,
      weapons: ['minecraft:iron_sword', 'minecraft:iron_axe'],
      helmets: ['minecraft:iron_helmet', 'minecraft:chainmail_helmet'],
      chests:  ['minecraft:iron_chestplate'],
      legs:    ['minecraft:iron_leggings'],
      boots:   ['minecraft:iron_boots'],
      enchantLevel: 1,
      fullSetChance: 0.3
    },
    'blue_skies:everdawn': {
      chance: 0.25,
      weapons: ['minecraft:iron_sword', 'minecraft:iron_axe'],
      helmets: ['minecraft:iron_helmet', 'minecraft:chainmail_helmet'],
      chests:  ['minecraft:iron_chestplate'],
      legs:    ['minecraft:iron_leggings'],
      boots:   ['minecraft:iron_boots'],
      enchantLevel: 1,
      fullSetChance: 0.3
    },
    'aether:the_aether': {
      chance: 0.25,
      weapons: ['minecraft:iron_sword', 'minecraft:iron_axe'],
      helmets: ['minecraft:iron_helmet'],
      chests:  ['minecraft:iron_chestplate', 'minecraft:diamond_chestplate'],
      legs:    ['minecraft:iron_leggings'],
      boots:   ['minecraft:iron_boots'],
      enchantLevel: 1,
      fullSetChance: 0.35
    },

    // Tier 3: 40-50% chance, steel/diamond tier
    'undergarden:undergarden': {
      chance: 0.40,
      weapons: ['minecraft:iron_sword', 'minecraft:diamond_sword', 'minecraft:diamond_axe'],
      helmets: ['minecraft:iron_helmet', 'minecraft:diamond_helmet'],
      chests:  ['minecraft:iron_chestplate', 'minecraft:diamond_chestplate'],
      legs:    ['minecraft:iron_leggings', 'minecraft:diamond_leggings'],
      boots:   ['minecraft:iron_boots', 'minecraft:diamond_boots'],
      enchantLevel: 2,
      fullSetChance: 0.4
    },
    'deeperdarker:otherside': {
      chance: 0.45,
      weapons: ['minecraft:diamond_sword', 'minecraft:diamond_axe'],
      helmets: ['minecraft:diamond_helmet', 'minecraft:iron_helmet'],
      chests:  ['minecraft:diamond_chestplate'],
      legs:    ['minecraft:diamond_leggings'],
      boots:   ['minecraft:diamond_boots'],
      enchantLevel: 3,
      fullSetChance: 0.45
    },
    'minecraft:the_nether': {
      chance: 0.50,
      weapons: ['minecraft:diamond_sword', 'minecraft:diamond_axe', 'minecraft:netherite_sword'],
      helmets: ['minecraft:diamond_helmet', 'minecraft:netherite_helmet'],
      chests:  ['minecraft:diamond_chestplate', 'minecraft:netherite_chestplate'],
      legs:    ['minecraft:diamond_leggings'],
      boots:   ['minecraft:diamond_boots', 'minecraft:netherite_boots'],
      enchantLevel: 3,
      fullSetChance: 0.5
    },
    'theabyss:the_abyss': {
      chance: 0.45,
      weapons: ['minecraft:diamond_sword', 'minecraft:diamond_axe'],
      helmets: ['minecraft:diamond_helmet'],
      chests:  ['minecraft:diamond_chestplate'],
      legs:    ['minecraft:diamond_leggings'],
      boots:   ['minecraft:diamond_boots'],
      enchantLevel: 2,
      fullSetChance: 0.4
    },

    // Tier 4: 60-80% chance, diamond/netherite tier
    'deep_aether:the_aether': {
      chance: 0.60,
      weapons: ['minecraft:diamond_sword', 'minecraft:netherite_sword', 'minecraft:netherite_axe'],
      helmets: ['minecraft:diamond_helmet', 'minecraft:netherite_helmet'],
      chests:  ['minecraft:netherite_chestplate', 'minecraft:diamond_chestplate'],
      legs:    ['minecraft:netherite_leggings', 'minecraft:diamond_leggings'],
      boots:   ['minecraft:netherite_boots', 'minecraft:diamond_boots'],
      enchantLevel: 4,
      fullSetChance: 0.6
    },
    'minecraft:the_end': {
      chance: 0.75,
      weapons: ['minecraft:netherite_sword', 'minecraft:netherite_axe', 'minecraft:diamond_sword'],
      helmets: ['minecraft:netherite_helmet', 'minecraft:diamond_helmet'],
      chests:  ['minecraft:netherite_chestplate'],
      legs:    ['minecraft:netherite_leggings'],
      boots:   ['minecraft:netherite_boots'],
      enchantLevel: 5,
      fullSetChance: 0.7
    },
  }
  return CONFIGS[dim] || null
}

function equipMob(entity, config) {
  let rng = Math.random

  try {
    // Weapon (always if equipping)
    let weapon = pick(config.weapons)
    let weaponItem = Item.of(weapon)
    if (config.enchantLevel > 0 && rng() < 0.5) {
      enchantItem(weaponItem, config.enchantLevel)
    }
    entity.setItemSlot('mainhand', weaponItem)

    // Armor — full set or random pieces
    let fullSet = rng() < config.fullSetChance

    if (fullSet || rng() < 0.6) {
      let h = Item.of(pick(config.helmets))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(h, config.enchantLevel)
      entity.setItemSlot('head', h)
    }
    if (fullSet || rng() < 0.5) {
      let c = Item.of(pick(config.chests))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(c, config.enchantLevel)
      entity.setItemSlot('chest', c)
    }
    if (fullSet || rng() < 0.4) {
      let l = Item.of(pick(config.legs))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(l, config.enchantLevel)
      entity.setItemSlot('legs', l)
    }
    if (fullSet || rng() < 0.4) {
      let b = Item.of(pick(config.boots))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(b, config.enchantLevel)
      entity.setItemSlot('feet', b)
    }
  } catch(e) {
    // Silently fail if API methods don't match — prevents tick spam
    console.log('[IridescentCraft] mob_equipment: ' + e.message)
  }
}

function enchantItem(item, maxLevel) {
  // Simple enchantment — pick a random level 1 to maxLevel
  let level = Math.floor(Math.random() * maxLevel) + 1
  // KubeJS enchant method
  let enchants = [
    'minecraft:sharpness', 'minecraft:protection', 'minecraft:unbreaking',
    'minecraft:fire_aspect', 'minecraft:knockback', 'minecraft:thorns'
  ]
  let chosen = pick(enchants)
  item.enchant(chosen, Math.min(level, 3))
}

function hasExistingGear(entity) {
  // Check if mob already has non-air items in equipment slots
  try {
    let mainhand = entity.mainHandItem
    let chest = entity.getItemBySlot('chest')
    return (mainhand && !mainhand.isEmpty()) || (chest && !chest.isEmpty())
  } catch(e) {
    return false
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
