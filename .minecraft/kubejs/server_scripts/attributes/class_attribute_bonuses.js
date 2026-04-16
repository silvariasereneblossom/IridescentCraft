// =============================================================================
// CLASS ATTRIBUTE BONUSES — Applies icraft: attribute modifiers per class
// =============================================================================
// Uses the class detection from class_passives.js (classCache via getClass()).
// Sets attribute base values via /attribute command every 5 seconds.
//
// When a player has no class (or switches class), attributes are reset to
// their registration defaults before applying the new class bonuses.
// =============================================================================

// Default base values matching iridescent_attributes.js registration
var ATTR_DEFAULTS = {
  'icraft:spell_power':      1.0,
  'icraft:mana_regen':       1.0,
  'icraft:cooldown_reduction': 0.0,
  'icraft:magic_resistance':  0.0,
  'icraft:crit_chance':       0.05,
  'icraft:crit_damage':       1.5,
  'icraft:lifesteal':         0.0,
  'icraft:dodge_chance':      0.0,
  'icraft:armor_penetration': 0.0,
  'icraft:xp_multiplier':     1.0,
  'icraft:healing_received':  1.0
}

// Class -> attribute bonuses (base values to SET, not additive deltas)
var CLASS_ATTRIBUTES = {
  'archmage': {
    'icraft:spell_power': 1.25,
    'icraft:mana_regen':  1.2
  },
  'battlemage': {
    'icraft:spell_power':       1.15,
    'icraft:magic_resistance':  0.15
  },
  'berserker': {
    'icraft:crit_damage': 1.8,
    'icraft:lifesteal':   0.05
  },
  'samurai': {
    'icraft:crit_chance':       0.15,
    'icraft:armor_penetration': 0.10
  },
  'ranger': {
    'icraft:crit_chance':  0.13,
    'icraft:dodge_chance': 0.05
  },
  'paladin': {
    'icraft:healing_received': 1.25
  },
  'vanguard': {
    'icraft:dodge_chance': 0.08
  },
  'wanderer': {
    'icraft:xp_multiplier': 1.15
  },
  'artificer': {
    'icraft:cooldown_reduction': 0.10
  },
  'void_summoner': {
    'icraft:lifesteal':    0.08,
    'icraft:spell_power':  1.10
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
    var attr = attrs[i]
    var defaultVal = ATTR_DEFAULTS[attr]
    player.server.runCommandSilent(
      'attribute ' + name + ' ' + attr + ' base set ' + defaultVal
    )
  }

  // Apply new class bonuses
  if (playerClass && CLASS_ATTRIBUTES[playerClass]) {
    var bonuses = CLASS_ATTRIBUTES[playerClass]
    var bonusAttrs = Object.keys(bonuses)
    for (var j = 0; j < bonusAttrs.length; j++) {
      var bAttr = bonusAttrs[j]
      var bVal = bonuses[bAttr]
      player.server.runCommandSilent(
        'attribute ' + name + ' ' + bAttr + ' base set ' + bVal
      )
    }
  }

  lastAppliedClass[name] = playerClass
}

// ── Server tick: apply class attribute bonuses every 5 seconds ──
global.tick_classAttributeBonuses = function(event) {
  var tick = event.server.tickCount

  event.server.players.forEach(function(player) {
    applyClassAttributeBonuses(player)
  })
}
global.registerServerTick('tick_classAttributeBonuses', 100, 50)

// Force re-apply on login (class may have changed while offline)
PlayerEvents.loggedIn(function(event) {
  delete lastAppliedClass[event.player.username]
})

console.log('[IridescentCraft] Class attribute bonuses loaded')
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
