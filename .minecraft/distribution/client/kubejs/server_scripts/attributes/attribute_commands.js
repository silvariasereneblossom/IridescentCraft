// =============================================================================
// IRIDESCENT ATTRIBUTES -- Chat Commands (v0.4 Persistent NBT)
// =============================================================================
// !stats / !attributes -- Show current attribute values
// !class              -- Show current class info and bonuses
//
// Uses getAttr() from attribute_sync.js (loaded alphabetically before this).
// Uses getAttrCore() from attribute_sync.js for attributecore values.
// Uses getClass() from origins/class_passives.js.
// =============================================================================

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
  'void_summoner':  'Void Summoner'
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
  'void_summoner':  ['+8% Lifesteal', '+10% Spell Power']
}

function formatStatLine(player, statDef) {
  var val = getAttr(player, statDef.attr, statDef.baseline)

  // Also read attributecore equivalent if present
  var acMap = {
    'crit_chance':  'attributecore:crit_chance',
    'crit_damage':  'attributecore:critical_damage',
    'lifesteal':    'attributecore:life_steal',
    'dodge_chance': 'attributecore:dodge_chance'
  }
  if (acMap[statDef.attr]) {
    var acVal = getAttrCore(player, acMap[statDef.attr], 0)
    if (acVal > 0) val += acVal
  }

  var valueColor = '\u00a7f'
  if (statDef.isPercent) {
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
  var playerClass = null
  try {
    playerClass = getClass(player)
  } catch (e) {}

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
  var playerClass = null
  try {
    playerClass = getClass(player)
  } catch (e) {}

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
PlayerEvents.chat(function(event) {
  var msg = event.message.trim()

  if (msg === '!stats' || msg === '!attributes') {
    event.cancel()
    showStats(event.player)
    return
  }

  if (msg === '!class') {
    event.cancel()
    showClass(event.player)
    return
  }
})

console.log('[IridescentCraft] Attribute chat commands loaded (v0.4)')
console.log('  !stats / !attributes -- Show attribute values')
console.log('  !class -- Show class info and bonuses')
