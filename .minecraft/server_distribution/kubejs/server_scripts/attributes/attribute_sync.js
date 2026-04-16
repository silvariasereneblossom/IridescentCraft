// =============================================================================
// Iridescent Attributes — Sync Handlers (v0.3 Full)
// =============================================================================
// Reads unified icraft:* attributes from players and propagates them to
// mod-specific systems. Runs as a player tick handler via 0_tick_master.js.
//
// Sync targets:
// - icraft:spell_power      -> magic damage scaling via EntityEvents.hurt
// - icraft:crit_chance       -> crit roll via EntityEvents.hurt
// - icraft:crit_damage       -> crit multiplier via EntityEvents.hurt
// - icraft:lifesteal         -> heal-on-hit via EntityEvents.hurt
// - icraft:dodge_chance      -> dodge roll via EntityEvents.hurt
// - icraft:armor_penetration -> effective armor bypass via EntityEvents.hurt
// - icraft:magic_resistance  -> magic damage reduction via EntityEvents.hurt
// - icraft:xp_multiplier    -> XP gain scaling via PlayerEvents.xpChange
// - icraft:healing_received  -> heal bonus via tick handler workaround
// - icraft:mana_regen        -> future sync to Ars/ISB mana systems
// - icraft:cooldown_reduction -> future sync to ISB cooldown system
// =============================================================================

// --- Helper: safely read an attribute base value ---
function getAttr(player, attr, fallback) {
  try {
    var val = player.getAttributeBaseValue(attr)
    if (val === null || val === undefined) return fallback
    return val
  } catch (e) {
    return fallback
  }
}

// --- COMBAT STAT APPLICATION ---
// Single hurt handler for all combat attribute processing.
// Order: dodge -> magic_resistance -> armor_pen -> crit -> spell_power -> lifesteal
//
// XP Attribute Core compatibility (v0.3):
// Reads attributecore:* values and stacks them on top of icraft:* values.
// This avoids sync/double-application issues — both sources are read fresh
// each combat event and summed together.
//   attributecore:crit_chance    -> adds to icraft:crit_chance
//   attributecore:critical_damage -> adds to icraft:crit_damage
//   attributecore:life_steal     -> adds to icraft:lifesteal
//   attributecore:dodge_chance   -> adds to icraft:dodge_chance

EntityEvents.hurt(function(event) {
  var entity = event.entity
  var source = event.source

  // ── Dodge (defender is player) ──
  if (entity.player) {
    var dodgeChance = getAttr(entity, 'icraft:dodge_chance', 0)
    // Stack attributecore dodge on top
    dodgeChance += getAttr(entity, 'attributecore:dodge_chance', 0)

    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      event.cancel()
      entity.tell(Text.gray('[Dodge] Attack evaded!'))
      return
    }

    // ── Magic Resistance (defender is player, damage is magic) ──
    var sourceType = String(source.type || '')
    if (sourceType.includes('magic') || sourceType.includes('indirect_magic')) {
      var magicRes = getAttr(entity, 'icraft:magic_resistance', 0)
      if (magicRes > 0) {
        event.damage = event.damage * (1.0 - magicRes)
      }
    }
  }

  // ── Attacker-side stats (attacker is player) ──
  if (source && source.player) {
    var attacker = source.player
    var critChance = getAttr(attacker, 'icraft:crit_chance', 0.05)
    var critDamage = getAttr(attacker, 'icraft:crit_damage', 1.5)
    var lifesteal  = getAttr(attacker, 'icraft:lifesteal', 0)
    var spellPower = getAttr(attacker, 'icraft:spell_power', 1.0)
    var armorPen   = getAttr(attacker, 'icraft:armor_penetration', 0)

    // Stack XP Attribute Core values on top of icraft base
    critChance += getAttr(attacker, 'attributecore:crit_chance', 0)
    critDamage += getAttr(attacker, 'attributecore:critical_damage', 0)
    lifesteal  += getAttr(attacker, 'attributecore:life_steal', 0)

    // ── Armor Penetration ──
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

    // ── Crit Roll ──
    if (Math.random() < critChance) {
      event.damage = event.damage * critDamage
      // Brief glowing to indicate crit visually
      try {
        attacker.server.runCommandSilent(
          'effect give ' + attacker.username + ' minecraft:glowing 1 0 true'
        )
      } catch (e) {}
    }

    // ── Spell Power scaling (magic/indirect damage types) ──
    // Covers: Ars Nouveau spells, Iron's Spellbooks spells, potion damage,
    // and any other source tagged as magic or indirect_magic.
    // ISB uses damage types: irons_spellbooks:fire_magic, irons_spellbooks:ice_magic,
    // irons_spellbooks:lightning_magic, irons_spellbooks:holy_magic, irons_spellbooks:ender_magic,
    // irons_spellbooks:blood_magic, irons_spellbooks:evocation_magic, irons_spellbooks:void_magic
    // All contain "magic" in the type string, so our check catches them.
    var atkSourceType = String(source.type || '')
    if (atkSourceType.includes('magic') || atkSourceType.includes('indirect')) {
      event.damage = event.damage * spellPower
    }

    // ── Lifesteal (applied after all damage calcs) ──
    if (lifesteal > 0) {
      var healAmount = event.damage * lifesteal
      if (healAmount > 0 && attacker.health < attacker.maxHealth) {
        attacker.heal(healAmount)
      }
    }
  }
})

// --- XP MULTIPLIER ---
// Scales XP gains by icraft:xp_multiplier. Only triggers when xp_multiplier != 1.0.
// PlayerEvents.xpChange fires when the player gains or loses XP points.
PlayerEvents.xpChange(function(event) {
  // Only modify positive XP gains (not losses/spending)
  if (event.amount <= 0) return

  var player = event.player
  var xpMult = getAttr(player, 'icraft:xp_multiplier', 1.0)

  if (xpMult > 1.0) {
    // Calculate bonus XP (the event already includes the base amount)
    var bonus = Math.floor(event.amount * (xpMult - 1.0))
    if (bonus > 0) {
      // Schedule bonus XP grant for next tick to avoid recursion
      player.server.scheduleInTicks(1, function() {
        try {
          player.giveExperiencePoints(bonus)
        } catch (e) {}
      })
    }
  }
})

// --- HEALING RECEIVED MODIFIER ---
// KubeJS doesn't expose LivingHealEvent directly. Workaround: track health
// each tick and amplify healing when health increases (not from regen effect
// or natural regen, which are slow — we amplify any heal > 0.5 HP/tick).
//
// This is imperfect but catches potion heals, golden apples, and spell heals.
var lastHealthMap = {}

global.tick_healingReceived = function(event) {
  var player = event.player
  var name = player.username
  var healMult = getAttr(player, 'icraft:healing_received', 1.0)

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

// --- ATTRIBUTE SYNC TICK ---
// Syncs icraft attributes to mod-specific systems every 5 seconds
global.tick_attributeSync = function(event) {
  var player = event.player
  var name = player.username

  // Read our unified spell_power
  var spellPower = getAttr(player, 'icraft:spell_power', 1.0)

  // Sync to puffish_attributes magic_damage if available
  // (puffish reads from scoreboard, not attributes directly)
  if (spellPower != 1.0) {
    var magicBonus = Math.round((spellPower - 1.0) * 100)
    player.server.runCommandSilent(
      'scoreboard players set ' + name + ' icraft_magic_bonus ' + magicBonus
    )
  }

  // Sync mana_regen to ISB/Ars mana regen attributes if available
  var manaRegen = getAttr(player, 'icraft:mana_regen', 1.0)
  if (manaRegen != 1.0) {
    var manaBonus = manaRegen - 1.0
    // Iron's Spellbooks mana regen
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
  var cdr = getAttr(player, 'icraft:cooldown_reduction', 0)
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

console.log('[IridescentCraft] Attribute sync handlers loaded (v0.3 full)')
console.log('  Combat: crit/dodge/lifesteal/armor_pen/magic_res via EntityEvents.hurt')
console.log('  Combat: XP Attribute Core stacking (crit_chance, critical_damage, life_steal, dodge_chance)')
console.log('  Magic: spell_power + mana_regen + CDR sync every 5s')
console.log('  Utility: xp_multiplier via PlayerEvents.xpChange')
console.log('  Utility: healing_received via tick health tracking')
