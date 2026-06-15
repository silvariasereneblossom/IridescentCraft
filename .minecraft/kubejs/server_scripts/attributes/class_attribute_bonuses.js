// =============================================================================
// CLASS ATTRIBUTE BONUSES -- Applies icraft attribute modifiers per class
// =============================================================================
// Uses the class detection from class_passives.js (classCache via getClass()).
// Sets attribute values via player.persistentData (setAttr from attribute_sync.js).
//
// When a player has no class (or switches class), attributes are reset to
// their defaults before applying the new class bonuses.
// =============================================================================

// Default base values (must match attribute_sync.js ATTR_DEFAULTS)
var ATTR_DEFAULTS = {
  'spell_power':       1.0,
  'mana_regen':        1.0,
  'cooldown_reduction': 0.0,
  'magic_resistance':  0.0,
  'crit_chance':       0.05,
  'crit_damage':       1.5,
  'lifesteal':         0.0,
  'dodge_chance':      0.0,
  'armor_penetration': 0.0,
  'xp_multiplier':     1.0,
  'healing_received':  1.0
}

// Class -> attribute bonuses (base values to SET, not additive deltas)
var CLASS_ATTRIBUTES = {
  'archmage': {
    'spell_power': 1.25,
    'mana_regen':  1.2
  },
  'battlemage': {
    'spell_power':       1.15,
    'magic_resistance':  0.15
  },
  'berserker': {
    'crit_damage': 1.8,
    'lifesteal':   0.05
  },
  'samurai': {
    'crit_chance':       0.15,
    'armor_penetration': 0.10
  },
  'ranger': {
    'crit_chance':  0.13,
    'dodge_chance': 0.05
  },
  'paladin': {
    'healing_received': 1.25
  },
  'vanguard': {
    'dodge_chance': 0.08
  },
  'wanderer': {
    'xp_multiplier': 1.15
  },
  'artificer': {
    'cooldown_reduction': 0.10
  },
  'void_summoner': {
    'lifesteal':    0.08,
    'spell_power':  1.10
  },
  // ── Trinity mages (Phase 1a, 2026-06-14). spell_power is school-blind, so it
  //    stays at/below the design's 1.40 and the per-school edge lives in the ISS
  //    <school>_spell_power powers (triad_attunement.json). Mages get NO puffish
  //    magic_damage (that flat-on-everything stat is the Archmage's identity).
  'elemental': {
    'spell_power':  1.40,
    'crit_chance':  0.12,
    'crit_damage':  1.7,
    'mana_regen':   1.1
  },
  'blessed': {
    'spell_power':       1.40,
    'magic_resistance':  0.18,
    'healing_received':  1.30,
    'mana_regen':        1.2
  },
  'corrupted': {
    'spell_power':        1.40,
    'magic_resistance':   0.10,
    'lifesteal':          0.15,
    'cooldown_reduction': 0.08,
    'armor_penetration':  0.10
  }
}

// Track which class each player last had bonuses applied for
var lastAppliedClass = {}

function applyClassAttributeBonuses(player) {
  var name = player.username
  // getClass is defined in class_passives.js, loaded before this via alphabetical order
  var playerClass = null
  try {
    playerClass = getClass(player)
  } catch (e) {
    // class_passives.js hasn't loaded yet or getClass unavailable
    return
  }

  var prevClass = lastAppliedClass[name] || null

  // Skip if same class as last application
  if (playerClass === prevClass) return

  // Reset all icraft attributes to defaults first
  var attrs = Object.keys(ATTR_DEFAULTS)
  for (var i = 0; i < attrs.length; i++) {
    setAttr(player, attrs[i], ATTR_DEFAULTS[attrs[i]])
  }

  // Apply new class bonuses
  if (playerClass && CLASS_ATTRIBUTES[playerClass]) {
    var bonuses = CLASS_ATTRIBUTES[playerClass]
    var bonusAttrs = Object.keys(bonuses)
    for (var j = 0; j < bonusAttrs.length; j++) {
      setAttr(player, bonusAttrs[j], bonuses[bonusAttrs[j]])
    }
  }

  lastAppliedClass[name] = playerClass
}

// -- Server tick: apply class attribute bonuses every 5 seconds --
global.tick_classAttributeBonuses = function(event) {
  event.server.players.forEach(function(player) {
    applyClassAttributeBonuses(player)
  })
}
global.registerServerTick('tick_classAttributeBonuses', 100, 50)

// Force re-apply on login (class may have changed while offline)
PlayerEvents.loggedIn(function(event) {
  delete lastAppliedClass[event.player.username]
})

console.log('[IridescentCraft] Class attribute bonuses loaded (v0.4 persistent NBT)')
console.log('  Archmage: spell_power +25%, mana_regen +20%')
console.log('  Battlemage: spell_power +15%, magic_resistance +15%')
console.log('  Berserker: crit_damage +30%, lifesteal +5%')
console.log('  Samurai: crit_chance +10%, armor_penetration +10%')
console.log('  Ranger: crit_chance +8%, dodge_chance +5%')
console.log('  Paladin: healing_received +25%')
console.log('  Vanguard: dodge_chance +8%')
console.log('  Wanderer: xp_multiplier +15%')
console.log('  Artificer: cooldown_reduction +10%')
console.log('  Void Summoner: lifesteal +8%, spell_power +10%')
console.log('  Elemental: spell_power +40%, crit_chance +12%, crit_damage 1.7, mana_regen +10% (+80% fire/ice/lightning via ISS powers)')
console.log('  Blessed: spell_power +40%, magic_resistance +18%, healing_received +30%, mana_regen +20% (+80% holy/nature/evocation via ISS powers)')
console.log('  Corrupted: spell_power +40%, magic_resistance +10%, lifesteal +15%, cooldown_reduction +8%, armor_penetration +10% (+80% blood/ender/eldritch via ISS powers)')
