// @file kubejs/server_scripts/scaling/mob_equipment.js
// @events EntityEvents.spawned
// @registry bosses, dimensions
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

// The five Iron's Spellbooks casters these spawn scripts must not touch are the
// entries of the boss registry (kubejs/config/icraft/registry/bosses.json) with
// the flag `caster`: icraft.bosses.has(id, 'caster'). Until 2026-10-13 the five
// ids stood here, and in four other scripts, each "kept in sync" by hand.
// The reason is unchanged: on these classes an item-slot or NBT access throws a
// java.lang.Error (AbstractMethodError), which no script catch sees, so the
// test has to come BEFORE any such access.
// 2026-04-22: even after extending the set the log STILL showed
// NecromancerEntity.getItemBySlot AbstractMethodError in spawned handlers.
// All AbstractSpellCastingMob subclasses in irons_spellbooks share the
// abstract slot-access bug (necromancer + necromancer/*, wizards/*, etc.).
// Rather than enumerate every subclass, skip all `irons_spellbooks:*`
// entities from equipment scaling. We lose equipment on wizard mobs —
// fine, their mod-native loot + spell kit is their thing.
//
// 2026-04-25: AbstractMethodError still firing despite the prefix check.
// Root cause: KubeJS `entity.type` returns the translation-key form
// (e.g. "entity.irons_spellbooks.necromancer"), NOT the resource-location
// form ("irons_spellbooks:necromancer"). The Set lookup AND the prefix
// indexOf('irons_spellbooks:') both miss. Fix: normalize via the registry
// holder's key.location() (always the canonical "ns:path" form), with a
// regex fallback for the translation-key form. Use this canonical id
// everywhere we compare entity types in this file.
// 2026-10-13: that reader is global.icraft.core.entityId (0_lib_core.js), the one
// home of it; the copy that stood here is gone.
function isIronsSpellbooksMob(resId) {
  return String(resId || '').indexOf('irons_spellbooks:') === 0
}

// =============================================================================
// EQUIPMENT BLACKLIST (#icraft:equipment_blacklist entity_types tag)
// -----------------------------------------------------------------------------
// entity.monster is TRUE for ANY EntityType registered with MobCategory.MONSTER
// (it resolves to !category.isFriendly()), NOT only classes that extend Monster.
// Terramity beam/bomb/ring "projectile" entities are PathfinderMob registered
// as MONSTER, so they pass `if (!entity.monster) return` and get equipped --
// then leak iron/leather gear via death drops. A curated denylist tag is the
// lowest-risk fix (data-driven, no per-id script logic). Resolve the TagKey
// once via the proven Java.loadClass pattern from sunlight_smite.js:42-53 and
// test entity.getType().is(tag) at spawn. (Leak vector PROJ-1/PROJ-2; fix A2.)
// =============================================================================
var MOB_EQUIP_BLACKLIST_TAG = null
try {
  var ResourceLocation_me = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var TagKey_me = Java.loadClass('net.minecraft.tags.TagKey')
  var Registries_me = Java.loadClass('net.minecraft.core.registries.Registries')
  MOB_EQUIP_BLACKLIST_TAG = TagKey_me.create(Registries_me.ENTITY_TYPE,
    new ResourceLocation_me('icraft', 'equipment_blacklist'))
} catch (e) {
  console.warn('[mob_equipment] equipment_blacklist TagKey init FAILED: ' + e)
}

function isMobEquipBlacklisted(entity) {
  if (!MOB_EQUIP_BLACKLIST_TAG) return false
  try {
    return entity.getType().is(MOB_EQUIP_BLACKLIST_TAG)
  } catch (e) {
    return false
  }
}

EntityEvents.spawned(icraft.guard('scaling/mob_equipment', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living || entity.player) return
  if (!entity.monster) return
  // Skip category-MONSTER projectile/beam/ring entities (Terramity etc.) that
  // would otherwise be equipped and leak gear via death drops. (A2 / PROJ-1.)
  if (isMobEquipBlacklisted(entity)) return
  // Centralized ISS-mob skip + bail log via 0_iss_guard.js. The local
  // The `caster` test (boss registry) + isIronsSpellbooksMob below remain as a
  // fallback in case the guard script ever fails to load first.
  if (global.icraftSkipIssMob && global.icraftSkipIssMob(entity, 'mob_equipment')) return
  var resId = global.icraft.core.entityId(entity)
  if (icraft.bosses.has(resId, 'caster')) return
  if (isIronsSpellbooksMob(resId)) return
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
}))

// The gear roll of a dimension = `mobEquipment` on its entry in the dimension
// registry (kubejs/config/icraft/registry/dimensions.json, through icraft.dims):
// chance, the five item pools, enchantLevel, fullSetChance. Until 2026-10-13
// the ten configs stood here (tier 1: 5%, leather/iron; tier 2: 20-25%,
// iron/steel; tier 3: 40-50%, steel/diamond; tier 4: 75%, diamond/netherite).
// null = no roll in that dimension.
// (Deep Aether has no entry: it registers no dimension, its mobs spawn inside
//  aether:the_aether and use the Aether config, as they always have. Ruling
//  2026-10-11: Deep Aether scales with the Aether.)
// One copy per dimension is kept: the reader hands out a fresh copy per call.
var EQUIP_CONFIG_CACHE = {}
function getEquipConfig(dim) {
  var key = String(dim)
  if (!EQUIP_CONFIG_CACHE.hasOwnProperty(key)) EQUIP_CONFIG_CACHE[key] = icraft.dims.get(key, 'mobEquipment')
  return EQUIP_CONFIG_CACHE[key]
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
    zeroDropChance(entity, 'mainhand')

    // Armor — full set or random pieces
    let fullSet = rng() < config.fullSetChance

    if (fullSet || rng() < 0.6) {
      let h = Item.of(pick(config.helmets))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(h, config.enchantLevel)
      entity.setItemSlot('head', h)
      zeroDropChance(entity, 'head')
    }
    if (fullSet || rng() < 0.5) {
      let c = Item.of(pick(config.chests))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(c, config.enchantLevel)
      entity.setItemSlot('chest', c)
      zeroDropChance(entity, 'chest')
    }
    if (fullSet || rng() < 0.4) {
      let l = Item.of(pick(config.legs))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(l, config.enchantLevel)
      entity.setItemSlot('legs', l)
      zeroDropChance(entity, 'legs')
    }
    if (fullSet || rng() < 0.4) {
      let b = Item.of(pick(config.boots))
      if (config.enchantLevel > 0 && rng() < 0.3) enchantItem(b, config.enchantLevel)
      entity.setItemSlot('feet', b)
      zeroDropChance(entity, 'feet')
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

// Zero the drop chance for an equipment slot so script-equipped gear never
// drops on death. Without this, every setItemSlot'd piece drops at the vanilla
// ~8.5%/slot default, flooding the economy with iron/leather/diamond gear.
// (A4a / ULTRIS-1 part B.) setItemSlot(slot, item) already works with a string
// slot in this file, so setDropChance(slot, 0) uses the same EquipmentSlot
// string coercion; guarded so a binding mismatch can never crash equipMob.
function zeroDropChance(entity, slot) {
  try {
    entity.setDropChance(slot, 0.0)
  } catch (e) {}
}
