// =============================================================================
// IRIDESCENT ATTRIBUTES — Client Tooltip Integration (v0.3)
// =============================================================================
// Adds unified stat tooltips to equipment items showing icraft: attribute
// modifiers. Also shows class bonus summary on class-related gear.
//
// Client-side only — uses ItemEvents.tooltip which fires on the client.
// =============================================================================

// Attribute display metadata: id -> { name, format, isPercent, baseline }
// 'baseline' is the default/neutral value — we only show if different
var ATTR_DISPLAY = {
  'icraft:spell_power':       { name: 'Spell Power',       isPercent: true,  baseline: 1.0, category: 'Magic' },
  'icraft:mana_regen':        { name: 'Mana Regen',        isPercent: true,  baseline: 1.0, category: 'Magic' },
  'icraft:cooldown_reduction':{ name: 'Cooldown Reduction', isPercent: true,  baseline: 0.0, category: 'Magic' },
  'icraft:magic_resistance':  { name: 'Magic Resistance',  isPercent: true,  baseline: 0.0, category: 'Magic' },
  'icraft:crit_chance':       { name: 'Crit Chance',       isPercent: true,  baseline: 0.05, category: 'Combat' },
  'icraft:crit_damage':       { name: 'Crit Damage',       isPercent: false, baseline: 1.5, category: 'Combat', suffix: 'x' },
  'icraft:lifesteal':         { name: 'Lifesteal',         isPercent: true,  baseline: 0.0, category: 'Combat' },
  'icraft:dodge_chance':      { name: 'Dodge Chance',      isPercent: true,  baseline: 0.0, category: 'Combat' },
  'icraft:armor_penetration': { name: 'Armor Penetration', isPercent: true,  baseline: 0.0, category: 'Combat' },
  'icraft:xp_multiplier':     { name: 'XP Multiplier',     isPercent: false, baseline: 1.0, category: 'Utility', suffix: 'x' },
  'icraft:healing_received':  { name: 'Healing Received',  isPercent: false, baseline: 1.0, category: 'Utility', suffix: 'x' }
}

// Equipment slot types to check for attribute modifiers
var EQUIPMENT_SLOTS = ['mainhand', 'offhand', 'head', 'chest', 'legs', 'feet']

// Class bonus lookup (mirrors class_attribute_bonuses.js for display)
var CLASS_DISPLAY = {
  'archmage':       { label: 'Archmage',       bonuses: { 'Spell Power': '+25%', 'Mana Regen': '+20%' } },
  'battlemage':     { label: 'Battlemage',      bonuses: { 'Spell Power': '+15%', 'Magic Resistance': '+15%' } },
  'berserker':      { label: 'Berserker',       bonuses: { 'Crit Damage': '+0.3x', 'Lifesteal': '+5%' } },
  'samurai':        { label: 'Samurai',         bonuses: { 'Crit Chance': '+10%', 'Armor Penetration': '+10%' } },
  'ranger':         { label: 'Ranger',          bonuses: { 'Crit Chance': '+8%', 'Dodge Chance': '+5%' } },
  'paladin':        { label: 'Paladin',         bonuses: { 'Healing Received': '+25%' } },
  'vanguard':       { label: 'Vanguard',        bonuses: { 'Dodge Chance': '+8%' } },
  'wanderer':       { label: 'Wanderer',        bonuses: { 'XP Multiplier': '+15%' } },
  'artificer':      { label: 'Artificer',       bonuses: { 'Cooldown Reduction': '+10%' } },
  'void_summoner':  { label: 'Void Summoner',   bonuses: { 'Lifesteal': '+8%', 'Spell Power': '+10%' } }
}

// Format an attribute value for display
function formatAttrValue(key, value) {
  var info = ATTR_DISPLAY[key]
  if (!info) return null

  var delta = value - info.baseline
  if (Math.abs(delta) < 0.001) return null

  var positive = delta > 0
  var color = positive ? '\u00a7a' : '\u00a7c'
  var sign = positive ? '+' : ''

  if (info.isPercent) {
    var pct = Math.round(delta * 100)
    return color + sign + pct + '% ' + info.name
  } else if (info.suffix) {
    var rounded = Math.round(delta * 100) / 100
    return color + sign + rounded + info.suffix + ' ' + info.name
  } else {
    var rounded2 = Math.round(delta * 100) / 100
    return color + sign + rounded2 + ' ' + info.name
  }
}

// ─── Equipment Attribute Tooltips ───
ItemEvents.tooltip(event => {
  event.addAdvanced('*', function(stack, advanced, text) {
    if (stack.isEmpty) return

    // Check if item has attribute modifiers via NBT (AttributeModifiers tag)
    var nbt = stack.nbt
    if (!nbt) return

    // Minecraft stores attribute modifiers in the "AttributeModifiers" NBT list
    var modifiers = null
    try {
      modifiers = nbt.getList('AttributeModifiers', 10) // 10 = CompoundTag type
    } catch (e) {
      return
    }
    if (!modifiers || modifiers.size() === 0) return

    var icraftLines = []
    for (var i = 0; i < modifiers.size(); i++) {
      try {
        var mod = modifiers.getCompound(i)
        var attrName = mod.getString('AttributeName')
        if (!attrName || attrName.indexOf('icraft:') !== 0) continue

        var amount = mod.getDouble('Amount')
        var operation = mod.getInt('Operation')
        var info = ATTR_DISPLAY[attrName]
        if (!info) continue

        // Format based on operation type:
        // 0 = addition, 1 = multiply_base, 2 = multiply_total
        var positive = amount > 0
        var color = positive ? '\u00a7a' : '\u00a7c'
        var sign = positive ? '+' : ''

        var displayStr = ''
        if (operation === 1 || operation === 2) {
          // Multiplier — show as percentage
          var pct = Math.round(amount * 100)
          displayStr = color + sign + pct + '% ' + info.name
        } else {
          // Addition — context-dependent
          if (info.isPercent) {
            var pct2 = Math.round(amount * 100)
            displayStr = color + sign + pct2 + '% ' + info.name
          } else if (info.suffix) {
            var rounded = Math.round(amount * 100) / 100
            displayStr = color + sign + rounded + info.suffix + ' ' + info.name
          } else {
            var rounded2 = Math.round(amount * 100) / 100
            displayStr = color + sign + rounded2 + ' ' + info.name
          }
        }

        if (displayStr) {
          icraftLines.push(displayStr)
        }
      } catch (e) {}
    }

    if (icraftLines.length > 0) {
      // Insert after the item name (position 1)
      var insertPos = 1
      text.add(insertPos, Text.of('\u00a76[Iridescent Attributes]'))
      for (var j = 0; j < icraftLines.length; j++) {
        text.add(insertPos + 1 + j, Text.of(icraftLines[j]))
      }
    }

    // ── Class Artifact Tooltips ──
    // If item has icraft_class NBT tag, show the class bonus summary
    try {
      var classTag = nbt.getString('icraft_class')
      if (classTag && CLASS_DISPLAY[classTag]) {
        var classInfo = CLASS_DISPLAY[classTag]
        var classInsert = text.size()
        text.add(classInsert, Text.of(''))
        text.add(classInsert + 1, Text.of('\u00a76[' + classInfo.label + ' Bonuses]'))
        var bonusKeys = Object.keys(classInfo.bonuses)
        for (var k = 0; k < bonusKeys.length; k++) {
          var bonusName = bonusKeys[k]
          var bonusVal = classInfo.bonuses[bonusName]
          text.add(classInsert + 2 + k, Text.of('\u00a7a' + bonusVal + ' ' + bonusName))
        }
      }
    } catch (e) {}
  })
})

console.log('[IridescentCraft] Attribute tooltips loaded (client)')
console.log('  Equipment icraft: modifier display')
console.log('  Class artifact bonus summary')
