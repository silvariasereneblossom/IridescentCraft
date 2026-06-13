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
// - xp_multiplier    -> XP gain scaling via tick-diff of player.xp (totalExperience)
// - healing_received  -> heal bonus via tick handler workaround
// - mana_regen        -> synced to ISB mana regen attribute
// - cooldown_reduction -> synced to ISB cooldown attribute
// =============================================================================

// --- Helper: read an icraft attribute from persistentData ---
// For unified stats (spell_power / mana_regen / cooldown_reduction) we
// also fold in book contributions written by the Java AttributeApplier
// under icraft_book_<name>. This is the Option-A unification pathway:
// modular spell books push their Tetra material/improvement attrs into
// the unified icraft layer in addition to the ecosystem-specific Forge
// attribute they already buff. Class bonuses still own icraft_<name> as
// the baseline; book contribution is purely additive on top.
function getAttr(player, name, fallback) {
  var base = player.persistentData.contains('icraft_' + name)
    ? player.persistentData.getDouble('icraft_' + name)
    : fallback
  var bookKey = 'icraft_book_' + name
  if (player.persistentData.contains(bookKey)) {
    base += player.persistentData.getDouble(bookKey)
  }
  return base
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

// 2026-05-15: migrated to DamageModifierRegistry (raw Forge LivingHurtEvent
// with mutable amount). KubeJS's EntityEvents.hurt wrapper has no settable
// damage field; the prior `event.damage = X` lines threw EvaluatorException
// on every hit and silently dropped crit/spell-power/armor-pen/magic-res.
;(function(){
  var DR_as = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_as = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR_as.register('icraft.attribute_sync.hurt', function(event) {
    var entity = event.entity
    var source = event.source

    // -- Dodge (defender is player) --
    if (entity instanceof PlayerClass_as) {
      var dodgeChance = getAttr(entity, 'dodge_chance', 0)
      dodgeChance += getAttrCore(entity, 'attributecore:dodge_chance', 0)
      // 2026-06-05: bridge the real icraft:dodge_chance Forge attribute (gear/
      // affix source, e.g. the icraft_evasive armor affix). getAttributeValue
      // includes affix MODIFIERS; base is 0 so unmodified players add nothing
      // (no double-count with the persistentData layer above).
      try { dodgeChance += entity.getAttributeValue('icraft:dodge_chance') } catch (e) {}
      if (dodgeChance > 0 && Math.random() < dodgeChance) {
        event.setCanceled(true)
        entity.tell(Text.gray('[Dodge] Attack evaded!'))
        return
      }
      // -- Magic Resistance --
      var sourceType = String(source.type || '')
      if (sourceType.includes('magic') || sourceType.includes('indirect_magic')) {
        var magicRes = getAttr(entity, 'magic_resistance', 0)
        if (magicRes > 0) {
          event.amount = event.amount * (1.0 - magicRes)
        }
      }
    }

    // -- Attacker-side stats --
    var attacker = source ? source.entity : null
    if (attacker instanceof PlayerClass_as) {
      var critChance = getAttr(attacker, 'crit_chance', 0.05)
      var critDamage = getAttr(attacker, 'crit_damage', 1.5)
      var lifesteal  = getAttr(attacker, 'lifesteal', 0)
      var spellPower = getAttr(attacker, 'spell_power', 1.0)
      var armorPen   = getAttr(attacker, 'armor_penetration', 0)

      critChance += getAttrCore(attacker, 'attributecore:crit_chance', 0)
      critDamage += getAttrCore(attacker, 'attributecore:critical_damage', 0)
      lifesteal  += getAttrCore(attacker, 'attributecore:life_steal', 0)

      // 2026-05-21: bridge attributeslib (Apothic Attributes) crit too.
      // Apoth affixes (precise / lethal / vorpal / keen / keen_edge /
      // assassins / icraft_butcher / icraft_calculated / icraft_precise)
      // all target attributeslib:crit_chance + attributeslib:crit_damage.
      // Without this bridge, the custom crit roll above only sees
      // attributecore values, so Apoth-affixed weapons appear to do
      // nothing in the custom crit system. Both attribute namespaces
      // are ADDITIVE post the same-day MULTIPLY_BASE -> ADDITION
      // conversion -- linear stacking, no compounding.
      // attributeslib:crit_damage baseline is 1.5; getAttributeValue
      // returns (1.5 + sum of ADDITION mods + ...). We subtract 1.5
      // to get just the bonus portion and add it on top of our crit
      // damage value, avoiding double-counting the 1.5 base.
      try {
        var alibCritChance = attacker.getAttributeValue('attributeslib:crit_chance')
        if (alibCritChance && alibCritChance > 0) critChance += alibCritChance
        var alibCritDamage = attacker.getAttributeValue('attributeslib:crit_damage')
        if (alibCritDamage && alibCritDamage > 1.5) critDamage += (alibCritDamage - 1.5)
      } catch (e) {
        // attribute may not be registered on this player; fail soft
      }

      // 2026-06-05: bridge the real icraft:spell_power / icraft:lifesteal Forge
      // attributes (gear/affix source: icraft_arcane + icraft_vampiric_weapon
      // weapon affixes). getAttributeValue includes affix MODIFIERS; both bases
      // are 0 so unmodified players add nothing -- spellPower stays at its 1.0
      // persistentData baseline (a multiplier) and lifesteal at 0, no
      // double-count with the persistentData (class/book/skill) layer.
      try {
        spellPower += attacker.getAttributeValue('icraft:spell_power')
        lifesteal  += attacker.getAttributeValue('icraft:lifesteal')
      } catch (e) {}

      // -- Armor Penetration --
      if (armorPen > 0 && entity.isLiving()) {
        try {
          var targetArmor = entity.getAttributeBaseValue('minecraft:generic.armor') || 0
          if (targetArmor > 0) {
            var penMultiplier = 1.0 + (armorPen * targetArmor / 30.0)
            event.amount = event.amount * penMultiplier
          }
        } catch (e) {}
      }

      // -- Crit Roll --
      if (Math.random() < critChance) {
        event.amount = event.amount * critDamage
        try {
          attacker.server.runCommandSilent(
            'effect give ' + attacker.username + ' minecraft:glowing 1 0 true'
          )
        } catch (e) {}
        // 2026-05-21: Stamp the current tick so post-priority listeners
        // (e.g. icraft_magic_enchants.js Arcane Vorpal decap) can detect
        // "the custom crit fired for THIS attack" by comparing
        // icraft_last_crit_tick to the current server tick. Spell crits
        // never set DamageSource.isCritical (vanilla only sets that for
        // Player.attack melee swings), so the flag stamp is the only
        // post-hoc signal for downstream listeners.
        try {
          attacker.persistentData.putLong('icraft_last_crit_tick',
            attacker.level.server.tickCount)
        } catch (e) {}
      }

      // -- Spell Power scaling --
      var atkSourceType = String(source.type || '')
      if (atkSourceType.includes('magic') || atkSourceType.includes('indirect')) {
        event.amount = event.amount * spellPower
      }

      // -- Lifesteal --
      if (lifesteal > 0) {
        var healAmount = event.amount * lifesteal
        if (healAmount > 0 && attacker.health < attacker.maxHealth) {
          attacker.heal(healAmount)
        }
      }
    }
  })
})()

// --- XP MULTIPLIER (tick-diff) ---
// 2026-04-22: KubeJS 2001.6.5-build.16 doesn't expose PlayerEvents.xpChange,
// so we poll player.xp (which maps to Forge Player.totalExperience —
// verified by decompiling PlayerKJS.kjs$getXp → f_36079_) once per second
// and diff against the last-seen value. Positive diffs are real XP gains
// (orb pickup, mob kill bonus, furnace XP, etc.); negative diffs are
// spends (anvil, enchanting table, death) and we just update the cache.
//
// Grant pattern: bonus = floor(diff * (xpMult - 1.0)). After granting
// via player.addXP(bonus), totalExperience increases by `bonus` too, so
// we update the cache AFTER the grant to avoid a feedback loop where
// next tick diffs against the pre-grant value and re-grants the same bonus.
//
// Skip work entirely when xpMult <= 1.0 (no bonus would be added anyway).
// Also cache the current XP without granting, so if xpMult later rises
// above 1.0 we don't retroactively award pre-penalty XP.
global.tick_xpMultiplier = function(event) {
  event.server.players.forEach(function(player) {
    try {
      var current = player.xp
      var hasLast = player.persistentData.contains('icraft_last_total_xp')
      if (!hasLast) {
        // First observation this session — initialize, skip grant.
        player.persistentData.putInt('icraft_last_total_xp', current)
        return
      }
      var last = player.persistentData.getInt('icraft_last_total_xp')
      var diff = current - last
      if (diff <= 0) {
        // Spent XP or no change — advance the cache without granting.
        player.persistentData.putInt('icraft_last_total_xp', current)
        return
      }
      var xpMult = getAttr(player, 'xp_multiplier', 1.0)
      if (xpMult > 1.0) {
        var bonus = Math.floor(diff * (xpMult - 1.0))
        if (bonus > 0) {
          player.addXP(bonus)
        }
      }
      // Cache the post-grant total so the next tick's diff is zero for
      // the portion we just awarded. Re-read player.xp because addXP
      // mutated it when xpMult > 1.0.
      player.persistentData.putInt('icraft_last_total_xp', player.xp)
    } catch (e) {
      console.warn('[xpMult] tick failed for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_xpMultiplier', 20, 9)

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
  // modifyAttribute, not /attribute commands (old 1.21-syntax commands never
  // parsed on 1.20.1 -- this sync was a silent no-op). Always apply the
  // computed value: 0 clears when the stat returns to baseline.
  var manaRegen = getAttr(player, 'mana_regen', 1.0)
  try {
    player.modifyAttribute('irons_spellbooks:mana_regen',
      'icraft_mana_regen_sync', manaRegen - 1.0, 'multiply_base')
  } catch (e) {}

  // Sync cooldown_reduction to ISB cooldown attribute if available
  var cdr = getAttr(player, 'cooldown_reduction', 0)
  try {
    player.modifyAttribute('irons_spellbooks:cooldown_reduction',
      'icraft_cdr_sync', cdr > 0 ? cdr : 0, 'addition')
  } catch (e) {}
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
console.log('  Utility: xp_multiplier via tick_xpMultiplier (1s totalExperience diff)')
console.log('  Utility: healing_received via tick health tracking')
