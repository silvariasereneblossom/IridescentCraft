// =============================================================================
// IRIDESCENT ATTRIBUTES -- Chat Commands (v0.4 Persistent NBT)
// =============================================================================
// !stats / !attributes -- Show current attribute values
// !class              -- Show current class info and bonuses
//
// Stats come from global.icraft.attr (attribute_sync.js, loaded alphabetically
// before this): attr.get() for the icraft stats, attr.core() for attributecore
// values. Until 2026-10-10 these were the top-level getAttr()/getAttrCore() of
// that file, reached through the shared script scope.
// Class comes from global.icraft.origin (0_lib_origins.js).
//
// 2026-10: neither command ever printed anything. (1) The chat handler called
// event.cancel() BEFORE showStats()/showClass(); cancel() works by throwing, so
// the message was swallowed and the handler ended there. (2) getClass() in
// class_passives.js was built on an `execute if entity <name>[nbt=...]` probe
// that never parsed, so the class was always "None".
// PlayerEvents.chat runs on a Worker thread: the resolver only answers from
// its cache there (it never serialises the player off-thread).
//
// Whole file is one IIFE (body left at column 0 to keep the diff readable);
// nothing here is used by another script.
// =============================================================================

;(function () {
// Attribute display names for the stats readout
var STAT_DISPLAY = {
  magic: [
    { attr: 'spell_power',       name: 'Spell Power',       isPercent: true,  baseline: 1.0 },
    { attr: 'mana_regen',        name: 'Mana Regen',        isPercent: true,  baseline: 1.0 },
    { attr: 'cooldown_reduction', name: 'Cooldown Reduction', isPercent: true,  baseline: 0.0 },
    { attr: 'magic_resistance',  name: 'Magic Resistance',  isPercent: true,  baseline: 0.0 }
  ],
  combat: [
    { attr: 'crit_chance',       name: 'Crit Chance',       isPercent: true,  baseline: 0.0 },
    { attr: 'crit_damage',       name: 'Crit Damage',       isPercent: false, baseline: 0.0, suffix: 'x' },
    { attr: 'lifesteal',         name: 'Lifesteal',         isPercent: true,  baseline: 0.0 },
    { attr: 'dodge_chance',      name: 'Dodge Chance',      isPercent: true,  baseline: 0.0 },
    { attr: 'armor_penetration', name: 'Armor Penetration', isPercent: true,  baseline: 0.0 }
  ],
  utility: [
    { attr: 'xp_multiplier',    name: 'XP Multiplier',     isPercent: false, baseline: 0.0, suffix: 'x' },
    { attr: 'healing_received',  name: 'Healing Received',  isPercent: false, baseline: 0.0, suffix: 'x' }
  ]
}

// Class display names (matches class_attribute_bonuses.js)
var CLASS_NAMES = {
  'archmage':       'Archmage',
  'battlemage':     'Battlemage',
  'berserker':      'Berserker',
  'samurai':        'Samurai',
  'ranger':         'Ranger',
  'paladin':        'Paladin',
  'vanguard':       'Vanguard',
  'wanderer':       'Wanderer',
  'artificer':      'Artificer',
  'void_summoner':  'Void Summoner',
  'elemental':      'Elemental',
  'blessed':        'Blessed',
  'corrupted':      'Corrupted'
}

// Class bonus descriptions
var CLASS_BONUS_DESC = {
  'archmage':       ['+25% Spell Power', '+20% Mana Regen'],
  'battlemage':     ['+15% Spell Power', '+15% Magic Resistance'],
  'berserker':      ['+0.3x Crit Damage', '+5% Lifesteal'],
  'samurai':        ['+10% Crit Chance', '+10% Armor Penetration'],
  'ranger':         ['+8% Crit Chance', '+5% Dodge Chance'],
  'paladin':        ['+25% Healing Received'],
  'vanguard':       ['+8% Dodge Chance'],
  'wanderer':       ['+15% XP Multiplier'],
  'artificer':      ['+10% Cooldown Reduction'],
  'void_summoner':  ['+8% Lifesteal', '+10% Spell Power'],
  'elemental':      ['+40% Spell Power', '+7% Crit Chance', '+0.2x Crit Damage', '+10% Mana Regen'],
  'blessed':        ['+40% Spell Power', '+18% Magic Resistance', '+30% Healing Received', '+20% Mana Regen'],
  'corrupted':      ['+40% Spell Power', '+10% Magic Resistance', '+15% Lifesteal', '+8% Cooldown Reduction', '+10% Armor Penetration']
}

// Bare class name ('archmage') from the shared resolver, or null.
function statsClassOf(player) {
  try {
    var classId = global.icraft.origin.get(player, 'class')
    return classId ? classId.substring(classId.indexOf(':') + 1) : null
  } catch (e) {
    return null
  }
}

function formatStatLine(player, statDef) {
  var attr = global.icraft.attr
  var val = attr.get(player, statDef.attr, statDef.baseline)

  // Also read attributecore equivalent if present
  var acMap = {
    'crit_chance':  'attributecore:crit_chance',
    'crit_damage':  'attributecore:critical_damage',
    'lifesteal':    'attributecore:life_steal',
    'dodge_chance': 'attributecore:dodge_chance'
  }
  if (acMap[statDef.attr]) {
    var acVal = attr.core(player, acMap[statDef.attr], 0)
    if (acVal > 0) val += acVal
  }

  var valueColor = '\u00a7f'
  if (statDef.isPercent) {  // CI-ignore: statDef.isPercent is a custom JS config-object property, not a method
    var pct = Math.round(val * 100)
    if (pct > 0) valueColor = '\u00a7a'
    return '\u00a77  ' + statDef.name + ': ' + valueColor + pct + '%'
  } else if (statDef.suffix) {
    var rounded = Math.round(val * 100) / 100
    if (rounded > 0) valueColor = '\u00a7a'
    return '\u00a77  ' + statDef.name + ': ' + valueColor + rounded + statDef.suffix
  } else {
    var rounded2 = Math.round(val * 100) / 100
    if (rounded2 > 0) valueColor = '\u00a7a'
    return '\u00a77  ' + statDef.name + ': ' + valueColor + rounded2
  }
}

function showStats(player) {
  var playerClass = statsClassOf(player)

  var className = playerClass ? (CLASS_NAMES[playerClass] || playerClass) : 'None'

  player.tell(Text.of('\u00a76\u2550\u2550\u2550 Iridescent Attributes \u2550\u2550\u2550'))
  player.tell(Text.of('\u00a77Class: \u00a7f' + className))
  player.tell(Text.of(''))

  // Magic section
  player.tell(Text.of('\u00a76Magic'))
  var magicStats = STAT_DISPLAY.magic
  for (var i = 0; i < magicStats.length; i++) {
    player.tell(Text.of(formatStatLine(player, magicStats[i])))
  }
  player.tell(Text.of(''))

  // Combat section
  player.tell(Text.of('\u00a76Combat'))
  var combatStats = STAT_DISPLAY.combat
  for (var j = 0; j < combatStats.length; j++) {
    player.tell(Text.of(formatStatLine(player, combatStats[j])))
  }
  player.tell(Text.of(''))

  // Utility section
  player.tell(Text.of('\u00a76Utility'))
  var utilStats = STAT_DISPLAY.utility
  for (var k = 0; k < utilStats.length; k++) {
    player.tell(Text.of(formatStatLine(player, utilStats[k])))
  }

  player.tell(Text.of('\u00a76\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'))
}

function showClass(player) {
  var playerClass = statsClassOf(player)

  if (!playerClass) {
    player.tell(Text.of('\u00a76\u2550\u2550\u2550 Class Info \u2550\u2550\u2550'))
    player.tell(Text.of('\u00a77You have not chosen a class yet.'))
    player.tell(Text.of('\u00a77Use the Origin selection screen to pick a class.'))
    player.tell(Text.of('\u00a76\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'))
    return
  }

  var displayName = CLASS_NAMES[playerClass] || playerClass
  var bonuses = CLASS_BONUS_DESC[playerClass] || []

  player.tell(Text.of('\u00a76\u2550\u2550\u2550 Class Info \u2550\u2550\u2550'))
  player.tell(Text.of('\u00a77Class: \u00a7f' + displayName))
  player.tell(Text.of(''))

  if (bonuses.length > 0) {
    player.tell(Text.of('\u00a76[' + displayName + ' Bonuses]'))
    for (var i = 0; i < bonuses.length; i++) {
      player.tell(Text.of('\u00a7a' + bonuses[i]))
    }
  }

  player.tell(Text.of(''))
  player.tell(Text.of('\u00a77Type \u00a7f!stats \u00a77to see your full attribute values.'))
  player.tell(Text.of('\u00a76\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'))
}

// --- Chat Command Listener ---
// Do the work first, cancel last and OUTSIDE the try: event.cancel() exits the
// handler by throwing, and a try/catch around it swallows the cancel.
var statsChatWarned = false
PlayerEvents.chat(icraft.guard('attributes/attribute_commands', 'PlayerEvents.chat', function(event) {
  var handled = false
  try {
    var msg = String(event.message || '').trim()

    if (msg === '!stats' || msg === '!attributes') {
      handled = true
      showStats(event.player)
    } else if (msg === '!class') {
      handled = true
      showClass(event.player)
    }
  } catch (e) {
    if (!statsChatWarned) {
      statsChatWarned = true
      console.warn('[attribute_commands] chat command threw (logged once): ' + e)
    }
  }
  if (handled) event.cancel()
}))

console.log('[IridescentCraft] Attribute chat commands loaded (v0.4)')
console.log('  !stats / !attributes -- Show attribute values')
console.log('  !class -- Show class info and bonuses')
})()
