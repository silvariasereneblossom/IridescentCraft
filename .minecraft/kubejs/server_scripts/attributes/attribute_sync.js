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
//
// 2026-10-10:
//   * the attacker half of the hurt handler (crit chance / crit damage /
//     lifesteal / armor penetration / spell power) never ran: it read
//     `source.entity`, which scripts do not have (0_lib_core.js header);
//   * magic resistance and spell-power scaling compared `String(source.type)`
//     (a function object) to 'magic';
//   * getAttr() looked for the modular-spell-book values (icraft_book_*) in
//     KubeJS's persistentData. The jar writes them to FORGE persistent data
//     (AttributeApplier.mirrorBookContributionsToIcraftNbt), a different
//     compound, so book spell power / mana regen / cooldown reduction never
//     reached the unified stat.
// Whole file is one IIFE (body left at column 0). attribute_commands.js reads
// the stats through global.icraft.attr.
// =============================================================================

;(function () {
var core = global.icraft && global.icraft.core
if (!core) {
  console.error('[IridescentCraft] attribute_sync.js: 0_lib_core.js did not load -- attribute sync is OFF')
  return
}

// --- Helper: read an icraft attribute from persistentData ---
// For unified stats (spell_power / mana_regen / cooldown_reduction) we
// also fold in book contributions written by the Java AttributeApplier
// under icraft_book_<name> in FORGE persistent data. This is the Option-A
// unification pathway: modular spell books push their Tetra
// material/improvement attrs into the unified icraft layer in addition to
// the ecosystem-specific Forge attribute they already buff. Class bonuses
// still own icraft_<name> as the baseline; book contribution is purely
// additive on top.
var BOOK_STATS = { 'spell_power': true, 'mana_regen': true, 'cooldown_reduction': true }
var getAttr = function (player, name, fallback) {
  var data = player.persistentData
  var key = 'icraft_' + name
  var base = data.contains(key) ? data.getDouble(key) : fallback
  if (BOOK_STATS[name] === true) {
    var forge = core.forgeData(player)
    if (forge) {
      var bookKey = 'icraft_book_' + name
      if (forge.contains(bookKey)) base += forge.getDouble(bookKey)
    }
  }
  return base
}

// --- Helper: write an icraft attribute to persistentData ---
var setAttr = function (player, name, value) {
  player.persistentData.putDouble('icraft_' + name, value)
}

// --- Helper: read attributecore value (still uses Forge attributes) ---
// (core.attrBase / core.attrValue resolve the attribute id once instead of on
// every call; an unknown attribute or an entity without it gives the fallback.)
var getAttrCore = function (player, attr, fallback) {
  return core.attrBase(player, attr, fallback)
}

// A Forge attribute's total (base + modifiers); 0 when the entity lacks it.
var attrTotal = function (entity, attr) {
  return core.attrValue(entity, attr, 0)
}

global.icraft.attr = { get: getAttr, set: setAttr, core: getAttrCore }

// --- Helper: read the icraft_mana_regen scoreboard (Puffish skill investment) ---
// This file now OWNS the consolidated mana_regen -> ISS attribute mapping, so it
// reads the skill scoreboard directly (skill_effects.js no longer writes it -- the
// two used to clobber each other on the same modifier key). Server access via
// player.server mirrors equipment_hp_halving.js / boss_bonfire_system.js.
var readManaRegenScore = function (player) {
  try {
    var sb = player.server.scoreboard
    var obj = sb.getObjective('icraft_mana_regen')
    if (!obj) return 0
    return sb.getOrCreatePlayerScore(player.username, obj).score
  } catch (e) { return 0 }
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
PlayerEvents.loggedIn(icraft.guard('attributes/attribute_sync', 'PlayerEvents.loggedIn', function(event) {
  var player = event.player
  // Check if attributes have been initialized
  if (!player.persistentData.contains('icraft_spell_power')) {
    var keys = Object.keys(ATTR_DEFAULTS)
    for (var i = 0; i < keys.length; i++) {
      setAttr(player, keys[i], ATTR_DEFAULTS[keys[i]])
    }
    console.log('[IridescentCraft] Initialized default attributes for ' + player.username)
  }
}))

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
core.onHurt('icraft.attribute_sync.hurt', function (event, ctx) {
  var entity = ctx.victim
  var source = ctx.source
  if (!entity || !source) return
  var victimIsPlayer = ctx.victimIsPlayer
  var attacker = ctx.attacker
  // (a player hurting themself is not an attack: no crit / lifesteal on it)
  var attackerIsPlayer = ctx.attackerIsPlayer && attacker !== entity

  // -- Dodge (defender is player) --
  if (victimIsPlayer) {
    var dodgeChance = getAttr(entity, 'dodge_chance', 0)
    dodgeChance += getAttrCore(entity, 'attributecore:dodge_chance', 0)
    // 2026-06-05: bridge the real icraft:dodge_chance Forge attribute (gear/
    // affix source, e.g. the icraft_evasive armor affix). getAttributeValue
    // includes affix MODIFIERS; base is 0 so unmodified players add nothing
    // (no double-count with the persistentData layer above).
    dodgeChance += attrTotal(entity, 'icraft:dodge_chance')
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
      event.setCanceled(true)
      entity.tell(Text.gray('[Dodge] Attack evaded!'))
      return
    }
    // -- Magic Resistance --
    var magicRes = core.finite(getAttr(entity, 'magic_resistance', 0), 0)
    if (magicRes > 0 && core.isMagic(source)) {
      event.amount = event.amount * (1.0 - Math.min(magicRes, 1.0))
    }
  }

  // -- Attacker-side stats --
  if (!attackerIsPlayer) return

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
  var alibCritChance = attrTotal(attacker, 'attributeslib:crit_chance')
  if (alibCritChance > 0) critChance += alibCritChance
  var alibCritDamage = attrTotal(attacker, 'attributeslib:crit_damage')
  if (alibCritDamage > 1.5) critDamage += (alibCritDamage - 1.5)

  // 2026-06-05: bridge the real icraft:spell_power / icraft:lifesteal Forge
  // attributes (gear/affix source: icraft_arcane + icraft_vampiric_weapon
  // weapon affixes). getAttributeValue includes affix MODIFIERS; both bases
  // are 0 so unmodified players add nothing -- spellPower stays at its 1.0
  // persistentData baseline (a multiplier) and lifesteal at 0, no
  // double-count with the persistentData (class/book/skill) layer.
  spellPower += attrTotal(attacker, 'icraft:spell_power')
  lifesteal  += attrTotal(attacker, 'icraft:lifesteal')

  // -- Armor Penetration --
  if (armorPen > 0 && entity.living) {
    var targetArmor = 0
    targetArmor = core.attrBase(entity, 'minecraft:generic.armor', 0)
    if (targetArmor > 0) {
      event.amount = event.amount * (1.0 + (armorPen * targetArmor / 30.0))
    }
  }

  // -- Crit Roll --
  if (Math.random() < critChance) {
    event.amount = event.amount * core.finite(critDamage, 1.5)
    // 1 s of Glowing as the crit cue (direct call; was an `effect give`
    // command parsed on every crit).
    try { attacker.potionEffects.add('minecraft:glowing', 20, 0, false, false) } catch (e) {}
    // 2026-05-21: Stamp the current tick so post-priority listeners
    // (e.g. icraft_magic_enchants.js Arcane Vorpal decap) can detect
    // "the custom crit fired for THIS attack" by comparing
    // icraft_last_crit_tick to the current tick. Spell crits
    // never set DamageSource.isCritical (vanilla only sets that for
    // Player.attack melee swings), so the flag stamp is the only
    // post-hoc signal for downstream listeners.
    // 2026-10-12: the stamp is the WORLD clock (level.time), no longer
    // server.tickCount. The value is saved with the player, and tickCount
    // starts again at 0 on every boot, so a stamp left by an earlier boot
    // could equal a later boot's tick; the world clock never repeats. The two
    // readers (startup_scripts/enchants/vorpal_rework.js and
    // icraft_magic_enchants.js) read the clock the same way: change all three
    // together or no crit is ever recognised.
    try {
      attacker.persistentData.putLong('icraft_last_crit_tick', Number(attacker.level.time))
    } catch (e) {}
  } else {
    // 2026-10-11: the stamp has to mean "THIS hit was a crit". It is keyed by
    // tick, so after one crit every other hit the same player landed in that
    // tick (a sweep, a multi-target spell) also read as a crit to the Vorpal /
    // Arcane Vorpal decapitation handlers, which went live today. A hit whose
    // roll FAILS takes the stamp back down. Hits are handled one after
    // another (this roll, then the LATE-phase readers, per hit), so the
    // readers of the hit that did crit have already run. Written only when a
    // same-tick stamp is actually there.
    try {
      var critData = attacker.persistentData
      if (Number(critData.getLong('icraft_last_crit_tick')) === Number(attacker.level.time)) {
        critData.putLong('icraft_last_crit_tick', -1)
      }
    } catch (e) {}
  }

  // -- Spell Power scaling --
  if (spellPower !== 1.0 && core.isMagic(source)) {
    event.amount = event.amount * Math.max(0, core.finite(spellPower, 1.0))
  }

  // -- Lifesteal --
  if (lifesteal > 0) {
    var healAmount = core.finite(event.amount * lifesteal, 0)
    if (healAmount > 0 && attacker.health < attacker.maxHealth) {
      attacker.heal(healAmount)
    }
  }
}, 'player')

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

  // Sync mana_regen to the ISS attribute, REBALANCED (IridescentCraft regen pass).
  // modifyAttribute, not /attribute commands (old 1.21-syntax commands never parsed
  // on 1.20.1 -- the sync was a silent no-op). Always apply the computed value.
  //
  // Consolidates the TWO investment dimensions that used to clobber each other on
  // this same modifier key: the persistentData stat (class/gear/book, via getAttr)
  // and the Puffish skill scoreboard (icraft_mana_regen, /100). skill_effects.js no
  // longer writes mana_regen -- this is now the single owner.
  //
  // Curve maps total investment -> the ISS mana_regen attribute (1.0 == ISS default,
  // ~50s empty->full; attr X => ~50/X s). A hard FLOOR for the uninvested (mana
  // matters with zero investment) + a gentle SLOPE so investment climbs back toward,
  // and a CAP so a very-high investment ceiling can't blow past, the old rate:
  //   FLOOR 0.35 (~143s uninvested) | SLOPE 0.6 (climb) | CAP 1.30 (~38s max).
  // PROVISIONAL -- tune the three constants to feel.
  // NOTE: the iridescent_reforging:mana_regen ENCHANT (+3%/lvl, L7 = +0.21) adds its
  // own multiply_base modifier directly to the ISS attribute, so it stacks ON TOP of
  // the CAP (a maxed enchant reaches ~33s). Lower MANA_REGEN_PER_LEVEL or fold the
  // enchant in here if that ceiling also needs reining in.
  var MR_FLOOR = 0.35, MR_SLOPE = 0.6, MR_CAP = 1.30
  var statRegen = getAttr(player, 'mana_regen', 1.0)              // class/gear/book stat (base 1.0)
  var rawDelta = (statRegen - 1.0) + (readManaRegenScore(player) / 100.0)  // total investment above baseline
  if (rawDelta < 0) { rawDelta = 0 }                             // never below the floor here
  var effRegen = MR_FLOOR + rawDelta * MR_SLOPE
  if (effRegen > MR_CAP) { effRegen = MR_CAP }
  try {
    player.modifyAttribute('irons_spellbooks:mana_regen',
      'icraft_mana_regen_sync', effRegen - 1.0, 'multiply_base')
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
PlayerEvents.loggedOut(icraft.guard('attributes/attribute_sync', 'PlayerEvents.loggedOut', function(event) {
  delete lastHealthMap[event.player.username]
}))

console.log('[IridescentCraft] Attribute sync handlers loaded (v0.4 persistent NBT)')
console.log('  Combat: crit/dodge/lifesteal/armor_pen/magic_res/spell_power via the damage registry')
console.log('  Combat: XP Attribute Core stacking (crit_chance, critical_damage, life_steal, dodge_chance)')
console.log('  Magic: mana_regen + CDR sync to ISB every 5s')
console.log('  Utility: xp_multiplier via tick_xpMultiplier (1s totalExperience diff)')
console.log('  Utility: healing_received via tick health tracking')
})()
