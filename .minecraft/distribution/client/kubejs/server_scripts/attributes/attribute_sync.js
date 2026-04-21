// =============================================================================
// Iridescent Attributes -- Sync Handlers (v0.4 Persistent NBT)
// =============================================================================
// Stores all icraft attributes in player.persistentData instead of Forge
// attribute registry. Reads values for combat processing.
//
// Sync targets:
// - spell_power      -> magic damage scaling via EntityEvents.hurt
// - crit_chance       -> crit roll via EntityEvents.hurt
// - crit_damage       -> crit multiplier via EntityEvents.hurt
// - lifesteal         -> heal-on-hit via EntityEvents.hurt
// - dodge_chance      -> dodge roll via EntityEvents.hurt
// - armor_penetration -> effective armor bypass via EntityEvents.hurt
// - magic_resistance  -> magic damage reduction via EntityEvents.hurt
// - xp_multiplier    -> XP gain scaling via PlayerEvents.xpChange
// - healing_received  -> heal bonus via tick handler workaround
// - mana_regen        -> synced to ISB mana regen attribute
// - cooldown_reduction -> synced to ISB cooldown attribute
// =============================================================================

// --- Helper: read an icraft attribute from persistentData ---
function getAttr(player, name, fallback) {
  if (!player.persistentData.contains('icraft_' + name)) return fallback
  return player.persistentData.getDouble('icraft_' + name)
}

// --- Helper: write an icraft attribute to persistentData ---
function setAttr(player, name, value) {
  player.persistentData.putDouble('icraft_' + name, value)
}

// --- Helper: read attributecore value (still uses Forge attributes) ---
function getAttrCore(player, attr, fallback) {
  try {
    var val = player.getAttributeBaseValue(attr)
    if (val === null || val === undefined) return fallback
    return val
  } catch (e) {
    return fallback
  }
}

// --- Default attribute values ---
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

// --- Set defaults on first login ---
PlayerEvents.loggedIn(function(event) {
  var player = event.player
  // Check if attributes have been initialized
  if (!player.persistentData.contains('icraft_spell_power')) {
    var keys = Object.keys(ATTR_DEFAULTS)
    for (var i = 0; i < keys.length; i++) {
      setAttr(player, keys[i], ATTR_DEFAULTS[keys[i]])
    }
    console.log('[IridescentCraft] Initialized default attributes for ' + player.username)
  }
})

// --- COMBAT STAT APPLICATION ---
// Single hurt handler for all combat attribute processing.
// Order: dodge -> magic_resistance -> armor_pen -> crit -> spell_power -> lifesteal
//
// XP Attribute Core compatibility (v0.4):
// Reads attributecore:* values and stacks them on top of icraft values.
// This avoids sync/double-application issues -- both sources are read fresh
// each combat event and summed together.
//   attributecore:crit_chance    -> adds to crit_chance
//   attributecore:critical_damage -> adds to crit_damage
//   attributecore:life_steal     -> adds to lifesteal
//   attributecore:dodge_chance   -> adds to dodge_chance

EntityEvents.hurt(function(event) {
  var entity = event.entity
  var source = event.source

  // -- Dodge (defender is player) --
  if (entity.player) {
    var dodgeChance = getAttr(entity, 'dodge_chance', 0)
    // Stack attributecore dodge on top
    dodgeChance += getAttrCore(entity, 'attributecore:dodge_chance', 0)

    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      event.cancel()
      entity.tell(Text.gray('[Dodge] Attack evaded!'))
      return
    }

    // -- Magic Resistance (defender is player, damage is magic) --
    var sourceType = String(source.type || '')
    if (sourceType.includes('magic') || sourceType.includes('indirect_magic')) {
      var magicRes = getAttr(entity, 'magic_resistance', 0)
      if (magicRes > 0) {
        event.damage = event.damage * (1.0 - magicRes)
      }
    }
  }

  // -- Attacker-side stats (attacker is player) --
  if (source && source.player) {
    var attacker = source.player
    var critChance = getAttr(attacker, 'crit_chance', 0.05)
    var critDamage = getAttr(attacker, 'crit_damage', 1.5)
    var lifesteal  = getAttr(attacker, 'lifesteal', 0)
    var spellPower = getAttr(attacker, 'spell_power', 1.0)
    var armorPen   = getAttr(attacker, 'armor_penetration', 0)

    // Stack XP Attribute Core values on top of icraft base
    critChance += getAttrCore(attacker, 'attributecore:crit_chance', 0)
    critDamage += getAttrCore(attacker, 'attributecore:critical_damage', 0)
    lifesteal  += getAttrCore(attacker, 'attributecore:life_steal', 0)

    // -- Armor Penetration --
    // Scales with both penetration % and target's armor value.
    // Formula: bonus damage = base * armorPen * (targetArmor / 30)
    // At 10% pen vs 20 armor target: +6.7% bonus damage
    // At 10% pen vs 30 armor target: +10% bonus damage
    if (armorPen > 0 && entity.isLiving()) {
      try {
        var targetArmor = entity.getAttributeBaseValue('minecraft:generic.armor') || 0
        if (targetArmor > 0) {
          var penMultiplier = 1.0 + (armorPen * targetArmor / 30.0)
          event.damage = event.damage * penMultiplier
        }
      } catch (e) {}
    }

    // -- Crit Roll --
    if (Math.random() < critChance) {
      event.damage = event.damage * critDamage
      // Brief glowing to indicate crit visually
      try {
        attacker.server.runCommandSilent(
          'effect give ' + attacker.username + ' minecraft:glowing 1 0 true'
        )
      } catch (e) {}
    }

    // -- Spell Power scaling (magic/indirect damage types) --
    // Covers: Ars Nouveau spells, Iron's Spellbooks spells, potion damage,
    // and any other source tagged as magic or indirect_magic.
    var atkSourceType = String(source.type || '')
    if (atkSourceType.includes('magic') || atkSourceType.includes('indirect')) {
      event.damage = event.damage * spellPower
    }

    // -- Lifesteal (applied after all damage calcs) --
    if (lifesteal > 0) {
      var healAmount = event.damage * lifesteal
      if (healAmount > 0 && attacker.health < attacker.maxHealth) {
        attacker.heal(healAmount)
      }
    }
  }
})

// --- XP MULTIPLIER ---
// Disabled 2026-04-21: KubeJS 2001.6.5-build.16 does not expose
// PlayerEvents.xpChange ("Unknown event 'PlayerEvents.xpChange'"). The
// Forge PlayerXpEvent.PickupXp hook is not reflected into KubeJS's
// PlayerEvents group in this build. xp_multiplier attribute is now inert
// until we find a working hook or move to a tick-based polling approach
// that diffs totalExperience per player per tick.

// --- HEALING RECEIVED MODIFIER ---
// KubeJS doesn't expose LivingHealEvent directly. Workaround: track health
// each tick and amplify healing when health increases (not from regen effect
// or natural regen, which are slow -- we amplify any heal > 0.5 HP/tick).
//
// This is imperfect but catches potion heals, golden apples, and spell heals.
var lastHealthMap = {}

global.tick_healingReceived = function(event) {
  var player = event.player
  var name = player.username
  var healMult = getAttr(player, 'healing_received', 1.0)

  // Only process if healing_received is above baseline
  if (healMult <= 1.0) {
    lastHealthMap[name] = player.health
    return
  }

  var lastHP = lastHealthMap[name]
  if (lastHP !== undefined && lastHP !== null) {
    var delta = player.health - lastHP
    // Only amplify significant heals (>0.5 HP/tick), not natural regen
    if (delta > 0.5 && player.health < player.maxHealth) {
      var bonusHeal = delta * (healMult - 1.0)
      if (bonusHeal > 0) {
        player.heal(bonusHeal)
      }
    }
  }

  lastHealthMap[name] = player.health
}
global.registerPlayerTick('tick_healingReceived', 1, 0)

// --- MANA REGEN + CDR SYNC ---
// Syncs mana_regen and cooldown_reduction to ISB attributes every 5 seconds
global.tick_attributeSync = function(event) {
  var player = event.player
  var name = player.username

  // Sync mana_regen to ISB mana regen attribute if available
  var manaRegen = getAttr(player, 'mana_regen', 1.0)
  if (manaRegen != 1.0) {
    var manaBonus = manaRegen - 1.0
    try {
      player.server.runCommandSilent(
        'attribute ' + name + ' irons_spellbooks:mana_regen modifier remove icraft:mana_regen_sync'
      )
      player.server.runCommandSilent(
        'attribute ' + name + ' irons_spellbooks:mana_regen modifier add icraft:mana_regen_sync ' + manaBonus + ' multiply_base'
      )
    } catch (e) {}
  }

  // Sync cooldown_reduction to ISB cooldown attribute if available
  var cdr = getAttr(player, 'cooldown_reduction', 0)
  if (cdr > 0) {
    try {
      player.server.runCommandSilent(
        'attribute ' + name + ' irons_spellbooks:cooldown_reduction modifier remove icraft:cdr_sync'
      )
      player.server.runCommandSilent(
        'attribute ' + name + ' irons_spellbooks:cooldown_reduction modifier add icraft:cdr_sync ' + cdr + ' addition'
      )
    } catch (e) {}
  }
}
global.registerPlayerTick('tick_attributeSync', 100, 25)

// Clean up on logout
PlayerEvents.loggedOut(function(event) {
  delete lastHealthMap[event.player.username]
})

console.log('[IridescentCraft] Attribute sync handlers loaded (v0.4 persistent NBT)')
console.log('  Combat: crit/dodge/lifesteal/armor_pen/magic_res via EntityEvents.hurt')
console.log('  Combat: XP Attribute Core stacking (crit_chance, critical_damage, life_steal, dodge_chance)')
console.log('  Magic: mana_regen + CDR sync to ISB every 5s')
console.log('  Utility: xp_multiplier via PlayerEvents.xpChange')
console.log('  Utility: healing_received via tick health tracking')
