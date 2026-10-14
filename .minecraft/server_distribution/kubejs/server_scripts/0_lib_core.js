// priority: 880
// @file kubejs/server_scripts/0_lib_core.js
// @events none
// @registry bosses
// @live spawn-buff-repaired, spawn-buff-saved, boss-seen-as
// =============================================================================
// icraft.core -- shared primitives for the hit / tick handlers
// File: kubejs/server_scripts/0_lib_core.js   (loads before its consumers: the priority line on top)
// =============================================================================
// Exported through `global.icraft.core` only (no top-level names):
//
//   entity ids      core.entityId(entity)            -> 'minecraft:zombie' | ''
//                                                       (a boss the game hands out under another
//                                                       type answers with its own id: `seenAs`)
//                   core.seenAsId(entity)            -> that boss id, or '' (see "entity ids" below)
//                   core.idSet([ids])                -> a set that can be asked with a Java string:
//                                                       .has(x) .add(x) .count() .list()
//                   core.isBoss(entityOrId)          -> true | false
//                                                       (the flag `boss` of the boss registry:
//                                                       icraft.bosses, 0_lib_registry.js)
//                   core.isPlayer(entity)            -> true | false
//   damage source   core.attacker(source)            -> Entity | null   (DamageSource.getEntity)
//                   core.direct(source)              -> Entity | null   (DamageSource.getDirectEntity)
//                   core.dmgId(source)               -> 'minecraft:in_fire' | ''
//                   core.dmgMsg(source)              -> 'inFire' | ''
//                   core.isFire / isMagic / isExplosion / isProjectile / isFall /
//                   core.isVoid / isWither (source)  -> true | false
//   clock           core.now(entityOrLevel)          -> world game time (number)
//   numbers         core.finite(n, fallback)         -> n if finite, else fallback
//   hurt registry   core.onHurt(key, fn, who, gate)  -> handler fn(event, ctx) on the shared dispatcher
//                   core.onHurtLate(key, fn, who, gate)  who: 'any' | 'attacker' | 'attackerPlayer' |
//                                                             'victimPlayer' | 'player'
//                                                        ctx: { victim, source, attacker,
//                                                               attackerIsPlayer, victimIsPlayer }
//                                                        gate: optional () -> bool for 'any' handlers,
//                                                              or an options object { gate, place,
//                                                              secondary, cancelled, unchecked }
//                                                              (see "hurt registry" below)
//                   core.hurtHandlers()              -> { key: fn(event) } (diagnostics / tests)
//                   core.hurtPlan()                  -> every handler in the order it runs, with its
//                                                       place and options (diagnostics / tests)
//                   core.hurtTap(fn | null)          -> fn(key, place, event, amountBefore,
//                                                       cancelledBefore) after every handler that
//                                                       ran (diagnostics / tests)
//                   core.damageSource(target, kind, attacker) -> DamageSource | null
//                     (kind: player | magic | thorns | sonic_boom | lightning |
//                      on_fire | freeze | generic). For damage that SHOULD go
//                      through the handlers, e.g. an environmental hazard:
//                      entity.attack(core.damageSource(entity, 'freeze'), 1)
//                   core.dealDamage(target, kind, amount, attacker) -> true | false
//                   core.dealDamageFrom(target, damageSource, amount) -> true | false
//                   core.secondary(entity?)          -> true while dealDamage is running
//   attributes      core.attribute(id)               -> Attribute object | null (resolved once)
//                   core.attrValue(entity, id, fallback) / core.attrBase(entity, id, fallback)
//                   core.attrValueWithout(entity, id, namePrefix, current)
//                                                    -> the total with the modifiers whose name starts
//                                                       with namePrefix left out
//   spawn buffs     core.spawnBuff(entity, flag)     -> buff | null: a once-per-mob attribute buff that is
//                                                       SAVED with the mob (see "spawn buffs" below)
//                     buff.modifier(attrId, name, amount, op) / buff.health() / buff.done() / buff.legacy
//                   core.saveModifier(entity, attrId, name, amount, op) -> 1 | 0 | -1
//                   core.dropModifier(entity, attrId, name) -> true when a modifier of that name was
//                                                       taken off (max_health: the mob keeps its share)
//   enchantments    core.enchLevel(stack, enchId)    -> level (0 if absent)
//                   core.armorEnchTotal(entity, id)  -> sum over the 4 armour pieces
//                   core.heldEnchLevel(entity, id)   -> level on the main-hand item
//                   core.gearEnchMax(entity, id)     -> best of armour + both hands
//   inventory       core.mainSlotCount()             -> 36: the slots of a player's inventory a sweep may
//                                                       read and consume (hotbar + backpack, never the
//                                                       worn armour or the off hand; see below)
//                   core.eachMainSlot(player, fn)    -> fn(stack, slot, inv) for every non-empty stack of
//                                                       those 36 slots; return true to stop
//   player          core.playerTier(player)          -> 1..4: the highest tier_N stage the player holds
//   blocks          core.blockIfLoaded(level, x, y, z) | (level, blockPos)
//                                                    -> the block, or null when its chunk is not loaded
//                                                       (level.getBlock LOADS it; this never does)
//   misc            core.forgeData(entity)           -> Forge getPersistentData() | null
//                   core.light(entity)               -> 0..15 (7 when unknown)
//                   core.warnOnce(key, message)
//
// WHY THIS EXISTS -- what scripts actually see on this KubeJS build
// (kubejs-forge 2001.6.5 / rhino 2001.2.3; every line below was read off the
// production jars, not guessed):
//
//   * DamageSource: getEntity() is exposed as getActual(), getDirectEntity() as
//     getImmediate(), getMsgId() as getType(). So `source.entity` is undefined
//     and `source.type` is vanilla's type() METHOD (a function object): every
//     handler that began with `var attacker = event.source.entity` returned on
//     its first line, and `String(source.type)` never equalled a damage id.
//     The msg id is camelCase ('inFire', 'onFire', 'indirectMagic'); the
//     registry id is 'minecraft:in_fire'. The predicates here test both.
//   * Entity: hurt(source, amount) is exposed as attack(source, amount);
//     `entity.hurt` does not exist and there is no string -> DamageSource
//     conversion ('player', 'magic', ...). setDeltaMovement(x, y, z) is
//     setMotion(x, y, z). getType() returns the registry id STRING
//     (getEntityType() is the EntityType) -- but the `type` bean property is
//     shadowed on classes with a public `type` field (Creeper Overhaul's
//     CreeperType), so ids are read through the method, never `entity.type`.
//   * Level: getGameTime() is exposed as getTime(). `level.gameTime` is
//     undefined -> NaN in every cooldown subtraction, and putLong(key,
//     undefined) throws. dimension() is hidden behind getDimensionKey();
//     `level.dimension` is a ResourceLocation (=== to a string works, string
//     methods such as includes() do not). `level.dayTime` is the dayTime()
//     METHOD, not a number.
//   * ItemStack: getTag() is exposed as getNbt() (`stack.nbt`); `enchantments`
//     is a java.util.Map (no getLevel()). LivingEntity has getItemBySlot(), no
//     getItemSlot().
//   * Forge's Entity.getPersistentData() (what the pack's jars and Apotheosis
//     write) is `entity.forgePersistentData`; `entity.persistentData` is
//     KubeJS's own compound.
//   * Inventory: `player.inventory` is the vanilla Inventory. It has NO `size`
//     (`inv.size` reads as undefined, so `for (i < inv.size)` runs zero times
//     and says nothing); the slot count is `inv.slots` / `inv.containerSize`,
//     41 for a player: 0-8 hotbar, 9-35 backpack, 36-39 the worn armour
//     (feet..head), 40 the off hand. getStackInSlot(i) / setStackInSlot(i, s)
//     are real. count() / find() look at all 41.
//
// RE-ENTRANCY
//   LivingHurtEvent fires again for damage dealt from inside a hurt handler
//   (splash, cleave, chain, thorns). dealDamage() raises a depth counter for
//   the duration of the nested hurt() call and the dispatcher (so every handler
//   registered through onHurt()/onHurtLate()) skips while it is raised: secondary damage
//   lands as-is, it does not crit, proc, splash or reflect a second time.
//   A handler that has to see secondary hits says so: the option `secondary`
//   (one does: the Blazeborn damage reduction; it ran on those hits while it sat
//   on the Java registry. The plain-bow effects did until ruling 12 of 2026-10-14
//   put them on the primary hit only; the armour clamp did until ruling 14 removed
//   it the same day).
//   Handlers registered straight on the Java registry can read
//   global.icraft.core.secondary(event.entity) to opt in to the same rule.
//
// CONTRACT
//   * nothing here throws into the caller (neutral value instead)
//   * a failure is logged once per key per script load, never per hit / tick
//   * onHurt handlers never leave event.amount NaN / infinite / negative
//     (but a handler registered `unchecked` is not checked: see "hurt registry")
// =============================================================================

;(function () {
  global.icraft = global.icraft || {}

  // ---- log once -------------------------------------------------------------
  var said = {}
  var warnOnce = function (key, message) {
    if (said[key]) return
    said[key] = true
    try { console.warn(message + ' (logged once per script load)') } catch (ignored) { /* swallow-ok: the log call itself failed; there is nowhere left to say so, and a log line must never throw into its caller */ }
  }
  // the same for a line that is good news (proof in the boot log that a path ran)
  var logOnce = function (key, message) {
    if (said[key]) return
    said[key] = true
    try { console.log(message + ' (logged once per script load)') } catch (ignored) { /* swallow-ok: the log call itself failed; a log line must never throw into its caller */ }
  }

  // ---- numbers --------------------------------------------------------------
  var finite = function (value, fallback) {
    var n = Number(value)
    if (n !== n || n === Infinity || n === -Infinity) return fallback
    return n
  }

  // ---- classes (static members only; `x instanceof cls` is the test) --------
  var loadClass = function (name) {
    try { return Java.loadClass(name) } catch (e) {
      warnOnce('class:' + name, '[icraft.core] Java.loadClass(' + name + ') failed: ' + e)
      return null
    }
  }
  var PlayerClass = loadClass('net.minecraft.world.entity.player.Player')
  var DamageTypeTags = loadClass('net.minecraft.tags.DamageTypeTags')
  var EnchantmentHelper = loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
  var ResourceLocation = loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries = loadClass('net.minecraftforge.registries.ForgeRegistries')
  var DamageRegistry = loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')

  var isPlayer = function (entity) {
    if (!entity) return false
    try {
      if (PlayerClass) return entity instanceof PlayerClass
      return entity.player === true
    } catch (e) {
      warnOnce('isPlayer', '[icraft.core] isPlayer threw (answered false): ' + e)
      return false
    }
  }

  // ---- entity ids -----------------------------------------------------------
  // A BOSS UNDER ANOTHER TYPE (`seenAs` in the boss registry, 0_lib_registry.js).
  // Iron's Spellbooks creates its Magehunter with the type minecraft:vindicator and
  // saves it under that id: the Evoker Fort's tower places it during worldgen, so it
  // is a plain Vindicator (class net.minecraft.world.entity.monster.Vindicator) before
  // any script sees it, and a summoned one becomes one at its first save (measured on
  // a full-pack boot, 2026-10-14). The registry entry says how to tell it from an
  // ordinary mob of that type: its Java class, or its marks (base max health AND the
  // item in its main hand: 50 and the Magehunter sword). The first time an id is read
  // for such an entity it is stamped (persistentData SEEN_KEY, saved with it), and
  // every later read, after any reload, answers from the stamp. Ruling 24, 2026-10-14.
  // A registry that is not loaded recognises nothing here (it is loud where it loads,
  // and core.isBoss throws without it).
  var SEEN_KEY = 'icraft_entity_id'
  var seenTable = null   // '$' + type -> [{ id, cls, baseHealth, mainHand }], from icraft.bosses.seenAs()
  var seenRoster = null  // the registry object the table was built from (a reloaded registry is a new object)
  var seenRows = function (typeId) {
    var roster = global.icraft.bosses
    if (!roster) return null             // still loading (the registry loads after this file): asked again next time
    if (seenTable === null || seenRoster !== roster) {
      seenRoster = roster
      var list = null
      try { list = roster.seenAs() } catch (e) {
        warnOnce('seenAs', '[icraft.core] the boss registry could not be asked for `seenAs` (no boss is recognised under another type): ' + e)
        seenTable = {}
        return null
      }
      var table = {}
      for (var i = 0; i < list.length; i++) {
        var key = '$' + String(list[i].type)
        if (!table[key]) table[key] = []
        table[key].push({ id: String(list[i].id), cls: list[i]['class'] ? String(list[i]['class']) : '',
                          baseHealth: (list[i].baseHealth === undefined) ? NaN : Number(list[i].baseHealth),
                          mainHand: list[i].mainHand ? String(list[i].mainHand) : '' })
      }
      seenTable = table
    }
    var rows = seenTable['$' + typeId]
    return rows ? rows : null
  }
  // the boss id an entity of type `typeId` is (stamp, class or marks), or ''
  var recognise = function (entity, typeId) {
    var rows = seenRows(typeId)
    if (rows === null) return ''
    var data = null
    try { data = entity.persistentData } catch (e) { data = null /* swallow-ok: no KubeJS data on it: it is recognised by class or marks below, and cannot be stamped */ }
    if (data) {
      var stamped = ''
      try { stamped = String(data.getString(SEEN_KEY)) } catch (e) { stamped = '' /* swallow-ok: an unreadable stamp is no stamp; class and marks below decide */ }
      for (var i = 0; stamped !== '' && i < rows.length; i++) if (rows[i].id === stamped) return stamped
    }
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j]
      var how = ''
      if (row.cls !== '') {
        try { if (String(entity.getClass().getName()) === row.cls) how = 'its Java class' } catch (e) { how = '' /* swallow-ok: the class could not be read; the marks below decide */ }
      }
      if (how === '' && row.mainHand !== '' && attrBase(entity, 'minecraft:generic.max_health', NaN) === row.baseHealth) {
        var held = ''
        try { held = String(entity.getMainHandItem().id) } catch (e) { held = '' /* swallow-ok: no readable main hand: not this boss by its marks */ }
        if (held === row.mainHand) how = 'base health ' + row.baseHealth + ' and ' + row.mainHand + ' in its hand'
      }
      if (how === '') continue
      try { if (data) data.putString(SEEN_KEY, row.id) } catch (e) {
        warnOnce('seenAs.stamp', '[icraft.core] could not stamp ' + row.id + ' on a ' + typeId + ' (it is recognised again on every read): ' + e)
      }
      logOnce('seenAs:' + row.id + ':' + how, '[icraft.core] recognised ' + row.id + ' in a ' + typeId + ' by ' + how + '; stamped ' + SEEN_KEY)
      if (live !== null) icraft.live.fired('boss-seen-as')
      return row.id
    }
    return ''
  }
  var TRANSLATION_KEY = /^entity\.([^.]+)\.(.+)$/
  var typeIdOf = function (entity) {
    var s = ''
    // The METHOD, not the `type` property (see header).
    try { s = String(entity.getType()) } catch (e) { s = '' /* swallow-ok: not an entity, or one without getType(): the registry-holder reader below is tried next */ }
    if (s.indexOf(':') > 0) return s
    try {
      if (typeof entity.getEntityType === 'function') {
        s = String(entity.getEntityType().builtInRegistryHolder().key().location())
        if (s.indexOf(':') > 0) return s
      }
    } catch (e2) { /* swallow-ok: no usable getEntityType() either: the translation-key form below is the last reader, and '' is the answer for a non-entity */ }
    var m = s.match(TRANSLATION_KEY)
    return m ? (m[1] + ':' + m[2]) : s
  }
  var entityId = function (entity) {
    if (!entity) return ''
    var s = typeIdOf(entity)
    if (s.indexOf(':') < 0) return s
    var seen = recognise(entity, s)
    return seen !== '' ? seen : s
  }
  var seenAsId = function (entity) {
    if (!entity) return ''
    var s = typeIdOf(entity)
    return (s.indexOf(':') > 0) ? recognise(entity, s) : ''
  }

  // Bosses = the entries of kubejs/config/icraft/registry/bosses.json that carry
  // the flag `boss`, asked through icraft.bosses (0_lib_registry.js; it loads
  // after this file, and the lookup happens when isBoss is CALLED). Until
  // 2026-10-13 the ids stood here as BOSS_IDS, a hand copy of the list in
  // scaling/mob_scaling_unified.js; both now read that one flag.
  // (The registry replaced substring tests on 'golem' / 'guardian' / 'ghast' /
  // 'storm' / 'dragon' / 'boss' that also matched iron golems, ordinary
  // guardians and ghasts.)
  //
  // entity, or an id string (a JS string or a Java String: both lack getType())
  // No registry (a file is missing or was refused at load) -> this THROWS, as
  // every registry call does. "Nobody is a boss" would let a Vorpal crit behead
  // Lucifer and an execute skill kill a boss outright: a missing roster is an
  // error, never an empty one.
  var isBoss = function (entityOrId) {
    if (!entityOrId) return false
    var id = ''
    try {
      id = (typeof entityOrId !== 'string' && typeof entityOrId.getType === 'function')
        ? entityId(entityOrId)
        : String(entityOrId)
    } catch (e) {
      // "not a boss" is the answer that lets a Vorpal crit behead it: never give it quietly
      warnOnce('isBoss', '[icraft.core] isBoss could not read an id (answered false): ' + e)
      return false
    }
    var roster = global.icraft.bosses
    if (!roster) throw new Error('[icraft.core] isBoss: icraft.bosses is missing (0_lib_registry.js did not load)')
    return roster.is(id)
  }

  // ---- damage sources -------------------------------------------------------
  var attacker = function (source) {
    if (!source) return null
    try { var a = source.actual; return a ? a : null } catch (e) {
      warnOnce('attacker', '[icraft.core] source.actual threw (no attacker): ' + e)
      return null
    }
  }
  var direct = function (source) {
    if (!source) return null
    try { var d = source.immediate; return d ? d : null } catch (e) {
      warnOnce('direct', '[icraft.core] source.immediate threw (no direct entity): ' + e)
      return null
    }
  }
  var dmgMsg = function (source) {
    if (!source) return ''
    try { return String(source.getType()) } catch (e) {
      warnOnce('dmgMsg', '[icraft.core] source.getType() threw (no message id): ' + e)
      return ''
    }
  }
  // The registry id costs five member reads and several handlers ask about the
  // source of the same event: the last answer is kept (`===` on two wrappers
  // of one Java object is identity).
  var memoSource = null
  var memoId = ''
  var memoKey = null
  var dmgId = function (source) {
    if (!source) return ''
    if (source === memoSource) return memoId
    var id = ''
    try {
      var key = source.typeHolder().unwrapKey()
      if (key.isPresent()) id = String(key.get().location())
    } catch (e) {
      id = ''
      warnOnce('dmgId', '[icraft.core] the damage type id could not be read (fire / magic / fall tests answer by the message id only): ' + e)
    }
    memoSource = source
    memoId = id
    memoKey = null
    return id
  }
  // 'minecraft:in_fire|infire' -- lower case, for substring tests
  var dmgKey = function (source) {
    var id = dmgId(source)
    if (source === memoSource && memoKey !== null) return memoKey
    var key = (id + '|' + dmgMsg(source)).toLowerCase()
    if (source === memoSource) memoKey = key
    return key
  }
  var tag = function (name) {
    try { return DamageTypeTags ? DamageTypeTags[name] : null } catch (e) {
      warnOnce('tag:' + name, '[icraft.core] DamageTypeTags.' + name + ' could not be read: ' + e)
      return null
    }
  }
  var TAG_FIRE = tag('IS_FIRE')
  var TAG_EXPLOSION = tag('IS_EXPLOSION')
  var TAG_PROJECTILE = tag('IS_PROJECTILE')
  var TAG_FALL = tag('IS_FALL')
  var inTag = function (source, tagKey) {
    if (!tagKey) return false
    try { return source.is(tagKey) === true } catch (e) {
      warnOnce('inTag', '[icraft.core] source.is(tag) threw (answered false): ' + e)
      return false
    }
  }
  var anyOf = function (haystack, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (haystack.indexOf(needles[i]) >= 0) return true
    }
    return false
  }
  var FIRE_WORDS = ['fire', 'lava', 'hot_floor', 'hotfloor']
  var PROJECTILE_WORDS = ['arrow', 'trident', 'fireball', 'thrown', 'mob_projectile', 'wither_skull', 'witherskull']
  var isFire = function (source) {
    if (!source) return false
    if (inTag(source, TAG_FIRE)) return true
    var key = dmgKey(source)
    // ('fireworks' is a rocket explosion, not fire)
    return anyOf(key, FIRE_WORDS) && key.indexOf('firework') < 0
  }
  var isMagic = function (source) {
    if (!source) return false
    return dmgKey(source).indexOf('magic') >= 0
  }
  var isExplosion = function (source) {
    if (!source) return false
    return inTag(source, TAG_EXPLOSION) || dmgKey(source).indexOf('explosion') >= 0
  }
  var isProjectile = function (source) {
    if (!source) return false
    return inTag(source, TAG_PROJECTILE) || anyOf(dmgKey(source), PROJECTILE_WORDS)
  }
  var isFall = function (source) {
    if (!source) return false
    if (TAG_FALL) return inTag(source, TAG_FALL)
    return dmgId(source) === 'minecraft:fall'
  }
  var isVoid = function (source) {
    if (!source) return false
    return anyOf(dmgKey(source), ['out_of_world', 'outofworld', 'void'])
  }
  var isWither = function (source) {
    if (!source) return false
    return dmgKey(source).indexOf('wither') >= 0
  }

  // ---- world clock ----------------------------------------------------------
  // Game time of the entity's level (or of a level). Monotonic across restarts.
  var now = function (holder) {
    var t
    var why = ''
    try {
      var level = (holder && holder.level) ? holder.level : holder
      t = finite(level.time, NaN)
      if (t !== t) t = finite(level.levelData.gameTime, NaN)
    } catch (e) { t = NaN; why = ' (' + e + ')' }
    if (t !== t) {
      warnOnce('now', '[icraft.core] could not read the world game time; cooldowns will not start' + why)
      return 0
    }
    return t
  }

  // ---- light / forge data ---------------------------------------------------
  var light = function (entity) {
    try {
      var v = finite(entity.level.getMaxLocalRawBrightness(entity.blockPosition()), NaN)
      return (v === v) ? v : 7
    } catch (e) {
      warnOnce('light', '[icraft.core] light(entity) threw (answered 7): ' + e)
      return 7
    }
  }
  var forgeData = function (entity) {
    if (!entity) return null
    try { var d = entity.forgePersistentData; return d ? d : null } catch (e) {
      warnOnce('forgeData', '[icraft.core] entity.forgePersistentData threw (answered null): ' + e)
      return null
    }
  }

  // ---- attributes -----------------------------------------------------------
  // The Attribute OBJECT for an id, resolved once. Passing the object to
  // getAttributeValue() / getAttributeBaseValue() skips the id -> registry
  // conversion KubeJS otherwise repeats on every call. null = not registered.
  var attrCache = {}
  var attribute = function (id) {
    var key = String(id)
    if (attrCache.hasOwnProperty(key)) return attrCache[key]
    var found = null
    try {
      var value = ForgeRegistries.ATTRIBUTES.getValue(ResourceLocation.tryParse(key))
      if (value) found = value
    } catch (e) {
      found = null
      warnOnce('attribute:' + key, '[icraft.core] the attribute ' + key + ' could not be looked up (treated as not registered): ' + e)
    }
    attrCache[key] = found
    return found
  }
  // total (base + modifiers); `fallback` when the attribute is unknown or the entity lacks it
  var attrValue = function (entity, id, fallback) {
    var attr = attribute(id)
    if (!attr) return fallback
    // swallow-ok below: vanilla THROWS ("Can't find attribute") for an attribute this entity type does not have,
    // which is the ordinary case for a modded attribute on a mob; `fallback` is what the caller asked for then
    try { return finite(entity.getAttributeValue(attr), fallback) } catch (e) { return fallback /* swallow-ok: the entity has no such attribute (vanilla throws for it) */ }
  }
  var attrBase = function (entity, id, fallback) {
    var attr = attribute(id)
    if (!attr) return fallback
    try { return finite(entity.getAttributeBaseValue(attr), fallback) } catch (e) { return fallback /* swallow-ok: the entity has no such attribute (vanilla throws for it) */ }
  }
  // The total as it would be WITHOUT the modifiers whose name starts with
  // `prefix` (vanilla's own formula: (base + additions) x (1 + sum of
  // multiply_base) x product of (1 + multiply_total), then the attribute's
  // range). `current` (the live value the caller already has) is returned
  // untouched when no modifier is left out or the attribute cannot be read.
  var attrValueWithout = function (entity, id, prefix, current) {
    try {
      var attr = attribute(id)
      var inst = entity.getAttribute(attr ? attr : String(id))
      if (!inst) return current
      var lead = String(prefix)
      var add = 0
      var mulBase = 0
      var mulTotal = 1
      var left = 0
      inst.getModifiers().forEach(function (m) {
        if (String(m.getName()).indexOf(lead) === 0) { left++; return }
        var amount = finite(m.getAmount(), 0)
        var op = String(m.getOperation()).toUpperCase()
        if (op === 'ADDITION') add += amount
        else if (op === 'MULTIPLY_BASE') mulBase += amount
        else if (op === 'MULTIPLY_TOTAL') mulTotal *= (1 + amount)
      })
      if (left === 0) return current
      var value = (finite(inst.getBaseValue(), 0) + add) * (1 + mulBase) * mulTotal
      return finite(inst.getAttribute().sanitizeValue(value), current)
    } catch (e) {
      warnOnce('attrValueWithout:' + id, '[icraft.core] attrValueWithout(' + id + ') threw: ' + e)
      return current
    }
  }

  // ---- spawn buffs: attribute modifiers that are SAVED with the mob ---------
  // entity.modifyAttribute(attr, name, amount, op) adds a TRANSIENT modifier
  // (kubejs-forge 2001.6.5, LivingEntityKJS.kjs$modifyAttribute: removeModifier(
  // uuid), then AttributeInstance.addTransientModifier; AttributeInstance.save()
  // writes only what addPermanentModifier added). Right for a player stat that
  // a tick handler keeps re-applying. Wrong for a mob buff applied ONCE in
  // EntityEvents.spawned behind a persistentData "done" flag: the flag is saved
  // and the modifier is not, so a mob that is unloaded and loaded again (chunk
  // unload, server restart, dimension change) comes back without the buff, has
  // its Health clamped to the smaller maximum while it loads, and the flag
  // keeps the script from ever applying it again. Five scaling/ scripts did
  // exactly that until 2026-10-12.
  //
  // spawnBuff() keeps the flag and the modifier together. The flag is a NUMBER:
  //   absent  never buffed -> apply; health() heals to the new maximum
  //   1       written by the old scripts (putBoolean), or by a run whose
  //           modifier could not be saved: the modifiers are gone -> apply
  //           again; health() keeps the SHARE of the maximum the mob has now
  //           (a boss at half health stays at half, an untouched one ends
  //           full). What its Health was before the first reload is not
  //           knowable: it was clamped away when the mob loaded.
  //   2       the modifiers are saved with the mob -> spawnBuff() returns null
  //           and the mob is left alone, Health included
  // EntityEvents.spawned also fires for a mob loaded from disk (it is Forge's
  // EntityJoinLevelEvent), which is what lets a "1" be repaired on load.
  //
  //   var buff = core.spawnBuff(entity, 'icraft_boss_3x')
  //   if (!buff) return
  //   buff.modifier('minecraft:generic.max_health', 'icraft_boss_3x_hp', 2.0, 'multiply_total')
  //   buff.health()
  //   buff.done()        // writes 2, or 1 when a modifier could not be saved
  //
  // A saved modifier outlives the script that added it: to retire a buff,
  // take the modifier off the mobs that carry it (entity.removeAttribute(attr,
  // name) in a spawned handler); deleting the call is not enough.
  //
  // In kubejs/server.log, once per script load each: "spawn buffs: first
  // modifier saved with a mob: ..." (the save path ran) and "spawn buffs: first
  // mob repaired under <flag>: ..." (a flag-1 mob got a modifier back, with its
  // health/max before and after). A WARN "could not be saved" is the failure.

  // 1 = on the entity and saved with it, 0 = the entity has no such attribute
  // (nothing to do), -1 = failed (logged once per modifier name; the modifier
  // is then on the mob the way entity.modifyAttribute leaves it: not saved).
  var saveModifier = function (entity, id, name, amount, operation) {
    var key = String(name)
    try {
      var attr = attribute(id)
      var inst = entity.getAttribute(attr ? attr : String(id))
      if (!inst) {
        if (String(id) !== 'minecraft:generic.max_health') return 0
        // Every living entity has max_health: no instance means the lookup
        // itself failed. That must not be recorded as "nothing to do".
        throw 'no attribute instance for ' + id
      }
      // KubeJS's own call: it derives the UUID from the name and removes any
      // modifier already under it, so a second application replaces the first
      // and never stacks.
      entity.modifyAttribute(String(id), key, amount, operation)
      var added = null
      inst.getModifiers().forEach(function (m) {
        if (added === null && String(m.getName()) === key) added = m
      })
      if (added === null) {
        warnOnce('modifier:' + key, '[icraft.core] modifier ' + key + ' was not found on ' + entityId(entity) + ' after modifyAttribute')
        return -1
      }
      // transient -> permanent: the same modifier under the same UUID
      inst.removeModifier(added.getId())
      inst.addPermanentModifier(added)
      logOnce('modifier.saved', '[icraft.core] spawn buffs: first modifier saved with a mob: ' + key + ' on ' + entityId(entity))
      return 1
    } catch (e) {
      // The swap may have stopped half way (taken off, not put back): have
      // KubeJS put the transient one on again, so the mob is at least buffed
      // while it stays loaded. The caller's flag stays at 1 -> retried on load.
      try { entity.modifyAttribute(String(id), key, amount, operation) } catch (ignored) { /* swallow-ok: the second attempt after a failed save; the failure itself is reported on the next line */ }
      warnOnce('modifier:' + key, '[icraft.core] modifier ' + key + ' on ' + entityId(entity) + ' could not be saved: ' + e)
      return -1
    }
  }

  // health / maximum, 0..1 (1 when it cannot be read). The METHODS, not the
  // bean properties: a public field of the same name on a mod's entity class
  // would shadow `entity.health` (see `type` in the header).
  var healthShare = function (entity) {
    try {
      var max = finite(entity.getMaxHealth(), 0)
      if (!(max > 0)) return 1
      var share = finite(entity.getHealth(), max) / max
      if (share < 0) return 0
      return share > 1 ? 1 : share
    } catch (e) {
      warnOnce('healthShare', '[icraft.core] health / max health could not be read (a buffed mob is healed to full): ' + e)
      return 1
    }
  }
  // 'health/max' for a log line
  var healthText = function (entity) {
    try {
      return (Math.round(finite(entity.getHealth(), 0) * 10) / 10) + '/' + (Math.round(finite(entity.getMaxHealth(), 0) * 10) / 10)
    } catch (e) { return '?/?' /* swallow-ok: text for a log line; '?/?' is how the line says it could not be read */ }
  }

  // Take a named modifier OFF an entity. For retiring a saved spawn buff: a
  // saved modifier outlives the rule that put it on (a mob that has since
  // become a boss still carries its mob-tier health). On max_health the mob
  // keeps its SHARE of health: half stays half of the new maximum.
  // -> true when a modifier was removed, false when there was none (or on a
  //    failure, logged once per modifier name).
  var dropModifier = function (entity, id, name) {
    var key = String(name)
    try {
      var attr = attribute(id)
      var inst = entity.getAttribute(attr ? attr : String(id))
      if (!inst) return false
      var found = null
      inst.getModifiers().forEach(function (m) {
        if (found === null && String(m.getName()) === key) found = m
      })
      if (found === null) return false
      var isHealth = String(id) === 'minecraft:generic.max_health'
      var share = isHealth ? healthShare(entity) : 1
      var before = isHealth ? healthText(entity) : ''
      inst.removeModifier(found.getId())
      // dead or dying (share 0): left as it is
      if (isHealth && share > 0) entity.setHealth(share * entity.getMaxHealth())
      logOnce('modifier.dropped:' + key, '[icraft.core] spawn buffs: first modifier taken off a mob: ' + key + ' on ' +
        entityId(entity) + (isHealth ? ' health/max ' + before + ' -> ' + healthText(entity) : ''))
      return true
    } catch (e) {
      warnOnce('drop:' + key, '[icraft.core] modifier ' + key + ' on ' + entityId(entity) + ' could not be taken off: ' + e)
      return false
    }
  }

  var BUFF_SAVED = 2
  var spawnBuff = function (entity, flag) {
    var key = String(flag)
    var data = null
    var state = 0
    try {
      data = entity.persistentData
      state = finite(data.getInt(key), 0)
    } catch (e) {
      warnOnce('buff:' + key, '[icraft.core] spawnBuff(' + key + ') could not read persistentData: ' + e)
      return null
    }
    if (state >= BUFF_SAVED) return null
    var legacy = state > 0
    // read BEFORE this script changes the maximum
    var share = legacy ? healthShare(entity) : 1
    var before = legacy ? healthText(entity) : ''
    var saved = true
    var count = 0
    return {
      legacy: legacy,
      modifier: function (id, name, amount, operation) {
        var result = saveModifier(entity, id, name, amount, operation)
        if (result < 0) saved = false
        if (result > 0) count++
        return result > 0
      },
      health: function () {
        try {
          if (!legacy) { entity.heal(entity.getMaxHealth()); return }
          // dead or dying (share 0): left as it is
          if (share > 0) entity.setHealth(share * entity.getMaxHealth())
        } catch (e) {
          warnOnce('buff.health:' + key, '[icraft.core] spawnBuff(' + key + ').health() threw: ' + e)
        }
      },
      done: function () {
        try { data.putInt(key, saved ? BUFF_SAVED : 1) } catch (e) {
          warnOnce('buff.done:' + key, '[icraft.core] spawnBuff(' + key + ').done() threw: ' + e)
        }
        // liveness: a mob got its buff as SAVED modifiers (a fresh spawn), or got a lost one back (a legacy mob)
        if (live !== null && saved && count > 0) {
          if (legacy) icraft.live.fired('spawn-buff-repaired')
          else icraft.live.fired('spawn-buff-saved')
        }
        if (legacy && saved && count > 0) {
          logOnce('buff.repaired:' + key, '[icraft.core] spawn buffs: first mob repaired under ' + key + ': ' +
            entityId(entity) + ' health/max ' + before + ' -> ' + healthText(entity))
        }
      }
    }
  }

  // ---- enchantments ---------------------------------------------------------
  var enchCache = {}   // id -> Enchantment | false
  var resolveEnch = function (id) {
    var key = String(id)
    if (enchCache.hasOwnProperty(key)) return enchCache[key]
    var found = false
    var why = ''
    try {
      var value = ForgeRegistries.ENCHANTMENTS.getValue(ResourceLocation.tryParse(key))
      if (value) found = value
    } catch (e) { found = false; why = ' (the lookup threw: ' + e + ')' }
    if (!found) warnOnce('ench:' + key, '[icraft.core] enchantment ' + key + ' is not registered; its effects are off' + why)
    enchCache[key] = found
    return found
  }
  var enchLevel = function (stack, id) {
    if (!stack) return 0
    try {
      if (stack.isEmpty() || !stack.isEnchanted()) return 0
      var ench = resolveEnch(id)
      if (!ench) return 0
      return finite(EnchantmentHelper.getItemEnchantmentLevel(ench, stack), 0)
    } catch (e) {
      warnOnce('enchLevel', '[icraft.core] enchLevel(' + id + ') threw: ' + e)
      return 0
    }
  }

  // Equipment through KubeJS's getEquipment(slot) (LivingEntity has
  // getItemBySlot(), there is no getItemSlot()). Never call these on an
  // irons_spellbooks caster mob: its slot accessors are abstract (0_iss_guard.js).
  var ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']
  var HAND_SLOTS = ['mainhand', 'offhand']
  var slotStack = function (entity, slot) {
    try { return entity.getEquipment(slot) } catch (e) {
      warnOnce('slot:' + slot, '[icraft.core] getEquipment(' + slot + ') threw on ' + entityId(entity) + ' (read as empty): ' + e)
      return null
    }
  }
  // sum of the level across the four armour pieces
  var armorEnchTotal = function (entity, id) {
    var total = 0
    for (var i = 0; i < ARMOR_SLOTS.length; i++) total += enchLevel(slotStack(entity, ARMOR_SLOTS[i]), id)
    return total
  }
  // level on the main-hand item
  var heldEnchLevel = function (entity, id) {
    return enchLevel(slotStack(entity, 'mainhand'), id)
  }
  // highest level on any armour piece or held item
  var gearEnchMax = function (entity, id) {
    var best = 0
    var slots = ARMOR_SLOTS.concat(HAND_SLOTS)
    for (var i = 0; i < slots.length; i++) {
      var lvl = enchLevel(slotStack(entity, slots[i]), id)
      if (lvl > best) best = lvl
    }
    return best
  }

  var MAIN_INVENTORY_SLOTS = 36   // see "player inventory: the slots a sweep may read and consume" below

  // ---- id sets: a set that can be asked with what the game hands a script -----
  // On this engine a String that comes back from a Java method (entity.type,
  // stack.id, block.id, player.username, a dimension) is a wrapped OBJECT, and a
  // JS Set / Map never matches it: `new Set([id]).has(stack.id)` is false and
  // `new Map([[id, 1]]).get(stack.id)` is undefined, with no error. Per-kill
  // boss scaling, the relic sink's deny list and a class check never ran
  // because of it. idSet() normalises BOTH sides with String(), so it answers
  // the same for a JS string, a Java String and a ResourceLocation.
  //
  //   var BOSSES = core.idSet(['minecraft:wither', 'minecraft:ender_dragon'])
  //   if (BOSSES.has(core.entityId(entity))) ...
  //   if (DIMS.has(player.level.dimension)) ...          // a ResourceLocation works
  //
  //   set.has(x)    true | false     (null / undefined -> false)
  //   set.add(x)    -> the set
  //   set.count()   how many         (a FUNCTION: a property that is misspelled
  //   set.list()    the ids, as JS strings        reads undefined and says nothing)
  // The argument is a JS array, or a Java List / Set (anything with forEach).
  // Anything else THROWS: a list that cannot be read must not become an empty
  // set that quietly matches nothing.
  var idSet = function (ids) {
    var table = {}
    var n = 0
    var put = function (id) {
      if (id === null || id === undefined) return
      // '$' in front: an id may be 'toString' or 'hasOwnProperty' (a player name can)
      var key = '$' + String(id)
      if (table[key] !== true) { table[key] = true; n++ }
    }
    if (ids !== null && ids !== undefined) {
      if (typeof ids === 'string') throw new Error('[icraft.core] idSet(' + ids + '): give it a list of ids, not one id')
      if (typeof ids.length === 'number') {
        for (var i = 0; i < ids.length; i++) put(ids[i])
      } else if (typeof ids.forEach === 'function') {
        ids.forEach(function (id) { put(id) })
      } else {
        throw new Error('[icraft.core] idSet: the argument is not a list (no length, no forEach)')
      }
    }
    var self = {
      has: function (id) {
        if (id === null || id === undefined) return false
        return table['$' + String(id)] === true
      },
      add: function (id) { put(id); return self },
      count: function () { return n },
      list: function () {
        var out = []
        for (var key in table) out.push(key.substring(1))
        return out
      }
    }
    return self
  }

  // ---- player inventory: walk the main slots ----------------------------------
  // fn(stack, slot, inv) for every NON-EMPTY stack of the main inventory (slots
  // 0..35: hotbar and backpack; never the worn armour 36-39 or the off hand 40,
  // see mainSlotCount below). Return true from fn to stop.
  //   -> how many stacks fn was given; -1 when the inventory could not be read
  //      (logged once). An error thrown BY fn is the caller's and is not caught.
  // `player.inventory` is the vanilla Inventory: it has no `size`, so a loop
  // bounded by `inv.size` runs zero times without a word. This is the loop.
  var eachMainSlot = function (player, fn) {
    var inv = null
    var why = ''
    try { inv = player.inventory } catch (e) { inv = null; why = ' (' + e + ')' }
    if (!inv || typeof inv.getStackInSlot !== 'function') {
      warnOnce('eachMainSlot', '[icraft.core] eachMainSlot: no inventory with getStackInSlot on ' + (player ? entityId(player) : player) + why)
      return -1
    }
    var seen = 0
    for (var slot = 0; slot < MAIN_INVENTORY_SLOTS; slot++) {
      var stack = null
      try { stack = inv.getStackInSlot(slot) } catch (e) {
        warnOnce('eachMainSlot.read', '[icraft.core] eachMainSlot: getStackInSlot(' + slot + ') threw: ' + e)
        return -1
      }
      if (!stack || stack.isEmpty()) continue
      seen++
      if (fn(stack, slot, inv) === true) break
    }
    return seen
  }

  // ---- player tier --------------------------------------------------------------
  // The player's progression tier, 1..4: the HIGHEST `tier_N` stage they hold
  // (AStages; `tier_1` is the baseline, so a player with no stage is tier 1).
  // A stage that is held out of order counts: tier_3 without tier_2 is 3.
  // 1 when AStages cannot be asked (logged once): the lowest tier unlocks the
  // least, so a failure never hands out more than the player has.
  // (Not the same question as "which tier is the player working towards":
  // gates/codex_progression_engine.js codexCurrentTier keeps that one.)
  var playerTier = function (player) {
    if (!player) return 1
    try {
      for (var t = 4; t >= 2; t--) {
        if (AStages.playerHasStage('tier_' + t, player) === true) return t
      }
      return 1
    } catch (e) {
      warnOnce('playerTier', '[icraft.core] playerTier: AStages could not be asked (' + e + '); everyone reads as tier 1')
      return 1
    }
  }

  // ---- block reads that never load a chunk --------------------------------------
  // level.getBlock(..) LOADS the chunk when it is not loaded: to FULL, on the
  // server thread, and without a warning (BlockContainerJS -> getBlockState ->
  // getChunk(.., FULL, true)). From a timer, a saved position or another
  // dimension that is a chunk load per call, and in a level without players
  // every one of them leaks (the nightly out-of-memory of 2026-10-09).
  // hasChunkAt does not load.
  //   core.blockIfLoaded(level, x, y, z)     numbers; a fraction is floored (the
  //                                          block that holds the point, also for
  //                                          negative coordinates)
  //   core.blockIfLoaded(level, blockPos)
  //   -> the block (what level.getBlock returns), or null when its chunk is not
  //      loaded, a coordinate is not a number, or the read failed (logged once)
  var blockIfLoaded = function (level, x, y, z) {
    if (!level) return null
    try {
      if (y === undefined && z === undefined) {
        if (x === null || x === undefined) return null
        if (level.hasChunkAt(x) !== true) return null
        return level.getBlock(x)
      }
      var bx = Math.floor(finite(x, NaN))
      var by = Math.floor(finite(y, NaN))
      var bz = Math.floor(finite(z, NaN))
      if (bx !== bx || by !== by || bz !== bz) return null
      if (level.hasChunkAt(bx, bz) !== true) return null
      return level.getBlock(bx, by, bz)
    } catch (e) {
      warnOnce('blockIfLoaded', '[icraft.core] blockIfLoaded threw: ' + e)
      return null
    }
  }

  // ---- hurt registry --------------------------------------------------------
  var depth = 0        // > 0 while dealDamage() is inside a nested hurt()
  var depthTime = -1   // game time at which depth was last raised
  var raise = function (target) { depth++; depthTime = now(target) }
  var lower = function () { if (depth > 0) depth-- }
  // A java.lang.Error thrown inside the nested hurt() (the AbstractMethodError
  // class of crash: 0_iss_guard.js) passes through script catch AND finally
  // blocks, so the matching lower() never runs -- and a counter stuck above 0
  // would silently switch every onHurt handler off until the next /reload.
  // Nested hurt events are synchronous: a raised depth seen at a LATER game
  // time is that leftover, not a live secondary hit. Drop it.
  var secondary = function (entity) {
    if (depth <= 0) return false
    if (!entity || now(entity) === depthTime) return true
    depth = 0
    warnOnce('guard.stale', '[icraft.core] a secondary hit never returned (an Error escaped dealDamage); the re-entrancy guard was reset')
    return false
  }

  var sourceFor = function (target, kind, by) {
    var sources = target.damageSources()
    switch (String(kind)) {
      case 'player':
        if (isPlayer(by)) return sources.playerAttack(by)
        if (by && by.living) return sources.mobAttack(by)
        return sources.generic()
      case 'magic':
        return by ? sources.indirectMagic(by, by) : sources.magic()
      case 'thorns':
        return by ? sources.thorns(by) : sources.generic()
      case 'sonic_boom':
        return sources.sonicBoom(by ? by : null)
      case 'lightning':
        return sources.lightningBolt()
      case 'on_fire':
        return sources.onFire()
      case 'freeze':
        return sources.freeze()
      default:
        return sources.generic()
    }
  }

  // Damage dealt BY a handler (splash, chain, thorns, aura). `by` gets the kill
  // credit where the vanilla source has a slot for it.
  var dealDamage = function (target, kind, amount, by) {
    var amt = finite(amount, 0)
    if (!target || !(amt > 0)) return false
    var ok = false
    raise(target)
    try {
      ok = target.attack(sourceFor(target, kind, by), amt) === true
    } catch (e) {
      warnOnce('dealDamage:' + kind, '[icraft.core] dealDamage(' + kind + ') threw: ' + e)
    }
    lower()
    return ok
  }

  // Same, with a ready-made DamageSource (e.g. the source of the hit that is
  // being splashed, so the splash keeps its type and its attacker).
  var dealDamageFrom = function (target, source, amount) {
    var amt = finite(amount, 0)
    if (!target || !source || !(amt > 0)) return false
    var ok = false
    raise(target)
    try {
      ok = target.attack(source, amt) === true
    } catch (e) {
      warnOnce('dealDamageFrom', '[icraft.core] dealDamageFrom threw: ' + e)
    }
    lower()
    return ok
  }

  // The dispatcher: one entry on the Java registry per place. Each handler says
  // which hits it wants:
  //   'any'            every hurt event on the server (mob vs mob, a mob on fire, ...)
  //   'attacker'       there is an attacking entity
  //   'attackerPlayer' the attacker is a player
  //   'victimPlayer'   the victim is a player
  //   'player'         a player is on either side
  // and the dispatcher works out, once per event, which of the eight possible
  // situations this is (attacker present? attacker a player? victim a player?)
  // and walks the handler list prepared for that situation, in registration
  // (= script load) order. A mob burning in lava is five member reads and, as
  // long as no 'any' handler's gate is open, nothing else.
  // (This script interpreter is slow enough that 21 separately registered
  // handlers, each re-reading the event, cost ~4x what the dead ones did on
  // EVERY hurt event; measured on the production Rhino build.)
  // Liveness (icraft.live, 00_icraft_guard.js): a handler is ARMED under
  // '<key>@hurt' / '<key>@hurt.late' when it is registered, and FIRED the
  // first time its function returns (its gate was open and it did not throw).
  // null with a guard file that has no `live` yet: nothing is recorded.
  //
  // WHAT THE JAVA REGISTRY DOES (DamageModifierRegistry, tetra-expansion jar).
  // It keeps two ConcurrentHashMaps, NORMAL and LATE, and walks NORMAL, then
  // LATE, for every LivingHurtEvent. A ConcurrentHashMap is walked in HASH
  // order of its keys, not in the order they were put: read off the map on a
  // full-pack server on 2026-10-13, NORMAL ran
  //     icraft.origin.blazeborn.take, icraft.justleveling.1, icraft.justleveling.2,
  //     icraft.core,
  //     icraft.deathskin_undead_bonus (a startup script),
  //     icraft.origin.blazeborn.deal, icraft.death_penalty.armor_clamp,
  //     icraft.battlemage_arcane_cleave, icraft.unique_tier_buff,
  //     icraft.class_passives_h6, icraft.origin.enderian.shift
  // and with a twelfth key the map doubles its table and the order of ALL of
  // them changes. So a handler put straight on the registry has no place it
  // can rely on, and one more of them moves the others (lint DIRECT-HURT-REG).
  //
  // PLACES. A handler that was moved here from the registry keeps the place it
  // had there, because an addition before a multiplication is another number
  // than after it:
  //   place 'first'  before every unplaced handler (the start of the entry
  //                  `icraft.core`)
  //   place 'last'   after every other entry of the registry, the startup
  //                  scripts' ones included: an entry of its own,
  //                  `icraft.core.then`. That key is in the LAST bin of the
  //                  map, for a table of 16 and of 32 (String.hashCode is
  //                  specified, so this is arithmetic, not luck: suite
  //                  `hit-table` holds it to a real ConcurrentHashMap).
  // Inside a place the order is the list PLACED below, never script load
  // order. A key that is not on the list is refused, loudly: a placed handler
  // is a recorded exception, not a convenience.
  //
  // OPTIONS (the fourth argument: a gate function, or an object)
  //   gate       () -> bool, for 'any' handlers: checked before any event read
  //   place      'first' | 'last' (NORMAL phase only; see above)
  //   secondary  true: also called for a secondary hit (default: skipped while
  //              dealDamage() is inside a nested hit)
  //   cancelled  true: also called when an earlier handler cancelled the hit
  //              (default: a cancelled hit ends the walk)
  //   unchecked  true: the amount the handler leaves is not checked (default:
  //              NaN / infinite is put back to the last good amount, negative
  //              becomes 0). The registry never checked.
  // The last three are what "exactly as on the registry" takes. Each is a
  // behaviour: taking one off a handler is a balance decision, with a hit
  // table (dev/engine-tests, suite `hit-table`).
  var live = (typeof icraft !== 'undefined' && icraft !== null && icraft.live) ? icraft.live : null
  var WHO = { 'any': 0, 'attacker': 1, 'attackerPlayer': 2, 'victimPlayer': 3, 'player': 4 }
  var WHO_NAMES = ['any', 'attacker', 'attackerPlayer', 'victimPlayer', 'player']
  var OPTIONS = { gate: true, place: true, secondary: true, cancelled: true, unchecked: true }
  // The placed handlers, in the order they run inside their place: the order the
  // registry's map walked these keys in while they sat on it (above).
  var PLACED = {
    first: ['icraft.origin.blazeborn.take', 'icraft.justleveling.1', 'icraft.justleveling.2'],
    last: ['icraft.origin.blazeborn.deal', 'icraft.battlemage_arcane_cleave',
           'icraft.unique_tier_buff', 'icraft.class_passives_h6', 'icraft.origin.enderian.shift']
  }
  var ENTRY_KEYS = { normal: 'icraft.core', then: 'icraft.core.then', late: 'icraft.core.late' }
  var handlers = []       // NORMAL phase, in registration order: { key, fn, who, gate, place, rank, ... }
  var lateHandlers = []   // LATE phase (after every NORMAL handler of every script)

  // situation mask: 1 = there is an attacker, 2 = it is a player, 4 = the victim is a player
  var wants = function (who, mask) {
    if (who === 0) return true
    if (who === 1) return (mask & 1) !== 0
    if (who === 2) return (mask & 2) !== 0
    if (who === 3) return (mask & 4) !== 0
    return (mask & 6) !== 0
  }
  // what one entry of the Java registry walks: a handler list per situation, and
  // whether any handler of the entry wants a secondary / a cancelled hit at all
  var tableFor = function (list) {
    var table = { plans: [], secondary: false, cancelled: false }
    for (var mask = 0; mask < 8; mask++) {
      var plan = []
      for (var i = 0; i < list.length; i++) {
        if (wants(list[i].who, mask)) plan.push(list[i])
      }
      table.plans.push(plan)
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].secondary) table.secondary = true
      if (list[j].cancelled) table.cancelled = true
    }
    return table
  }
  // The handlers of one place. 'main' (unplaced): in the order they were registered, and that
  // is all. 'first' / 'last': by their rank on the list PLACED, put in by hand.
  // NEVER through Array.sort: it is not stable on this engine. Twenty handlers of equal rank came
  // back with the one registered last in front and the third at the end (measured on a full-pack
  // boot and in suite `hit-table`, 2026-10-13), and no damage number showed it.
  var placedList = function (place) {
    var out = []
    for (var i = 0; i < handlers.length; i++) {
      var h = handlers[i]
      if (h.place !== place) continue
      var at = out.length
      if (place !== 'main') { while (at > 0 && out[at - 1].rank > h.rank) at-- }
      out.splice(at, 0, h)
    }
    return out
  }
  var tables = { normal: tableFor([]), then: tableFor([]), late: tableFor([]) }
  var rebuild = function () {
    tables.normal = tableFor(placedList('first').concat(placedList('main')))
    tables.then = tableFor(placedList('last'))
    tables.late = tableFor(lateHandlers)
  }

  // Diagnostics: fn(key, place, event, amountBefore, cancelledBefore), called after
  // every handler the dispatcher ran. One at a time; null takes it off. For the hit
  // table (suite `hit-table`, and its probe on a real server), not for features.
  var tap = null

  // entry: 'normal' | 'then' | 'late', or a fixed table (hurtHandlers below)
  var dispatcher = function (entry) {
    return function (event) {
      var victim, source, hitter, todo, table
      var mask = 0
      var cancelled = false
      var nested = false
      try {
        table = (typeof entry === 'string') ? tables[entry] : entry
        cancelled = event.isCanceled() === true
        if (cancelled && !table.cancelled) return
        victim = event.getEntity()
        nested = depth > 0 && secondary(victim)
        if (nested && !table.secondary) return
        source = event.getSource()
        hitter = source ? source.actual : null
        if (!hitter) hitter = null
        if (hitter !== null) mask = isPlayer(hitter) ? 3 : 1
        if (isPlayer(victim)) mask += 4
        todo = table.plans[mask]
      } catch (e) {
        warnOnce('dispatch', '[icraft.core] could not read a hurt event: ' + e)
        return
      }
      var n = todo.length
      if (n === 0) return
      var ctx = null
      var amount = 0
      var counted = false   // `amount` is the last good amount (from the first checked handler on)
      for (var i = 0; i < n; i++) {
        var h = todo[i]
        if (nested && !h.secondary) continue
        if (cancelled && !h.cancelled) continue
        var ran = false
        var tapAmount = 0
        var tapCancelled = false
        try {
          if (h.gate !== null && h.gate() !== true) continue
          if (ctx === null) {
            ctx = { victim: victim, source: source, attacker: hitter,
                    attackerIsPlayer: (mask & 2) !== 0, victimIsPlayer: (mask & 4) !== 0 }
          }
          if (!counted && !h.unchecked) { amount = finite(event.getAmount(), 0); counted = true }
          if (tap !== null) { tapAmount = event.getAmount(); tapCancelled = event.isCanceled() === true }
          ran = true
          h.fn(event, ctx)
          if (h.fired === false) {
            h.fired = true
            if (live !== null) live.fire(h.live)
          }
        } catch (e) {
          warnOnce('hurt:' + h.key, '[icraft.core] hurt handler ' + h.key + ' threw: ' + e)
        }
        if (ran && tap !== null) {
          try { tap(h.key, h.place, event, tapAmount, tapCancelled) } catch (eTap) {
            tap = null
            warnOnce('tap', '[icraft.core] the hurt tap threw and was taken off: ' + eTap)
          }
        }
        try {
          var after = Number(event.getAmount())
          if (h.unchecked) {
            // as the registry ran it: whatever it left is what the next one gets
            if (counted && after === after && after !== Infinity && after !== -Infinity && after >= 0) amount = after
          } else if (after !== after || after === Infinity || after === -Infinity) {
            // Never hand vanilla (or the next handler) a NaN / infinite / negative
            // amount: NaN health is unrecoverable for the entity.
            event.setAmount(amount)
          } else if (after < 0) { event.setAmount(0); amount = 0 }
          else amount = after
          if (event.isCanceled() === true) {
            if (!table.cancelled) return
            cancelled = true
          }
        } catch (e2) {
          warnOnce('dispatch.amount', '[icraft.core] the amount of a hurt event could not be checked after handler ' + h.key + ': ' + e2)
        }
      }
    }
  }

  var dispatcherOn = { normal: false, then: false, late: false }
  var ensureDispatcher = function (entry) {
    if (dispatcherOn[entry]) return true
    if (!DamageRegistry) {
      warnOnce('registry', '[icraft.core] DamageModifierRegistry is missing: every hurt handler is OFF')
      return false
    }
    try {
      // (the keys written out: the script catalogue reads them from here; ENTRY_KEYS above says the same)
      if (entry === 'late') DamageRegistry.registerLate('icraft.core.late', dispatcher('late'))
      else if (entry === 'then') DamageRegistry.register('icraft.core.then', dispatcher('then'))
      else DamageRegistry.register('icraft.core', dispatcher('normal'))
      dispatcherOn[entry] = true
      return true
    } catch (e) {
      warnOnce('register', '[icraft.core] could not register the hurt dispatcher: ' + e)
      return false
    }
  }

  // A registration this library cannot honour is refused with an ERROR line (KubeJS
  // counts it in its load summary): a handler in the wrong place, or one that runs on
  // hits it was not meant for, changes damage numbers and says nothing.
  var refuse = function (id, why) {
    try { console.error('[icraft.core] onHurt(' + id + ') REFUSED, the handler is NOT registered: ' + why) } catch (ignored) { /* swallow-ok: the log call itself failed; there is nowhere left to say so */ }
    return false
  }

  // onHurt(key, fn, who, gateOrOptions)
  //   fn(event, ctx)  event: the raw Forge LivingHurtEvent
  //                   ctx:   { victim, source, attacker, attackerIsPlayer, victimIsPlayer }
  //   gate()          optional, for 'any' handlers: return true when the handler
  //                   has anything to do at all (checked before any event read)
  //   options         { gate, place, secondary, cancelled, unchecked }: see OPTIONS above
  var registerHurt = function (phase) {
    var list = (phase === 'late') ? lateHandlers : handlers
    return function (key, fn, who, options) {
      var id = String(key)
      var code = WHO.hasOwnProperty(String(who)) ? WHO[String(who)] : 0
      var gate = null
      var place = (phase === 'late') ? 'late' : 'main'
      var rank = 0
      var also = { secondary: false, cancelled: false, unchecked: false }
      if (typeof options === 'function') gate = options
      else if (options !== null && options !== undefined) {
        if (typeof options !== 'object') return refuse(id, 'the fourth argument is neither a gate function nor an options object')
        for (var name in options) {
          if (!OPTIONS.hasOwnProperty(name)) return refuse(id, 'unknown option `' + name + '` (known: gate, place, secondary, cancelled, unchecked)')
        }
        if (options.gate !== undefined && options.gate !== null) {
          if (typeof options.gate !== 'function') return refuse(id, 'the option `gate` is not a function')
          gate = options.gate
        }
        for (var flag in also) {
          if (options[flag] === undefined) continue
          if (options[flag] !== true && options[flag] !== false) return refuse(id, 'the option `' + flag + '` is neither true nor false')
          also[flag] = options[flag]
        }
        if (options.place !== undefined) {
          var wanted = String(options.place)
          if (phase === 'late') return refuse(id, 'a LATE handler has no place (the option `place` is for onHurt)')
          if (!PLACED.hasOwnProperty(wanted)) return refuse(id, 'unknown place `' + wanted + '` (known: first, last)')
          rank = PLACED[wanted].indexOf(id)
          if (rank < 0) return refuse(id, 'this key is not on the list PLACED.' + wanted + ' of 0_lib_core.js: the order inside a place is that list, and a placed handler is a recorded exception')
          place = wanted
        }
      }
      var entry = { key: id, fn: fn, who: code, gate: gate, place: place, rank: rank,
                    secondary: also.secondary, cancelled: also.cancelled, unchecked: also.unchecked,
                    fired: false, live: (live !== null) ? live.arm(id, phase === 'late' ? 'hurt.late' : 'hurt') : null }
      var replaced = false
      for (var i = 0; i < list.length; i++) {
        if (list[i].key === id) { list[i] = entry; replaced = true; break }
      }
      if (!replaced) list.push(entry)
      rebuild()
      // A script loaded before this scheme registered `key` straight on the Java
      // registry; after a live /reload that closure would still be there.
      try { if (DamageRegistry) DamageRegistry.unregister(id) } catch (e) {
        warnOnce('unregister:' + id, '[icraft.core] DamageModifierRegistry.unregister(' + id + ') threw: ' + e)
      }
      return ensureDispatcher(phase === 'late' ? 'late' : (place === 'last' ? 'then' : 'normal'))
    }
  }

  // key -> function (event): that ONE handler, through the same dispatcher
  // code. For diagnostics and tests; the game only ever calls the dispatcher.
  var hurtHandlers = function () {
    var out = {}
    var all = handlers.concat(lateHandlers)
    for (var i = 0; i < all.length; i++) out[all[i].key] = dispatcher(tableFor([all[i]]))
    return out
  }

  // Every handler in the order the dispatcher runs them, for diagnostics, the
  // catalogue's check and the hit table: [{ key, phase, place, entry, who,
  // secondary, cancelled, unchecked, gated }]. `entry` is the key on the Java
  // registry the handler runs under; what else sits on that registry (the startup
  // scripts' handlers) is not known here.
  var hurtPlan = function () {
    var out = []
    var add = function (list, phase, entry) {
      for (var i = 0; i < list.length; i++) {
        var h = list[i]
        out.push({ key: h.key, phase: phase, place: h.place, entry: entry, who: WHO_NAMES[h.who],
                   secondary: h.secondary, cancelled: h.cancelled, unchecked: h.unchecked, gated: h.gate !== null })
      }
    }
    add(placedList('first'), 'normal', ENTRY_KEYS.normal)
    add(placedList('main'), 'normal', ENTRY_KEYS.normal)
    add(placedList('last'), 'normal', ENTRY_KEYS.then)
    add(lateHandlers, 'late', ENTRY_KEYS.late)
    return out
  }
  var hurtTap = function (fn) { tap = (typeof fn === 'function') ? fn : null }

  // ---- player inventory: the slots a sweep may read and consume ---------------
  // A sweep that converts or destroys items (the Codex submit / balance /
  // exchange, the relic sink) stops at the MAIN inventory: hotbar 0-8 and
  // backpack 9-35. Not `inv.slots` (41): 36-39 are the armour a player is
  // wearing and 40 is the off hand, and neither may be taken by a submit. The
  // relic sink's own text promises it ("worn relics are safe -- only your
  // backpack is scanned"). Ruling 2026-10-12; to widen the scope, change it
  // here, in this one place.
  // A FUNCTION on purpose, not a constant: the seven loops that use it read the
  // nonexistent `inv.size` for months and ran zero times without a word. A
  // missing function throws; a missing property is just `undefined` again.
  var mainSlotCount = function () { return MAIN_INVENTORY_SLOTS }

  global.icraft.core = {
    warnOnce: warnOnce,
    mainSlotCount: mainSlotCount,
    eachMainSlot: eachMainSlot,
    idSet: idSet,
    playerTier: playerTier,
    blockIfLoaded: blockIfLoaded,
    finite: finite,
    isPlayer: isPlayer,
    entityId: entityId,
    seenAsId: seenAsId,
    isBoss: isBoss,
    attacker: attacker,
    direct: direct,
    dmgId: dmgId,
    dmgMsg: dmgMsg,
    dmgKey: dmgKey,
    isFire: isFire,
    isMagic: isMagic,
    isExplosion: isExplosion,
    isProjectile: isProjectile,
    isFall: isFall,
    isVoid: isVoid,
    isWither: isWither,
    now: now,
    light: light,
    forgeData: forgeData,
    attribute: attribute,
    attrValue: attrValue,
    attrBase: attrBase,
    attrValueWithout: attrValueWithout,
    spawnBuff: spawnBuff,
    saveModifier: saveModifier,
    dropModifier: dropModifier,
    enchLevel: enchLevel,
    armorEnchTotal: armorEnchTotal,
    heldEnchLevel: heldEnchLevel,
    gearEnchMax: gearEnchMax,
    onHurt: registerHurt('normal'),
    onHurtLate: registerHurt('late'),
    hurtHandlers: hurtHandlers,
    hurtPlan: hurtPlan,
    hurtTap: hurtTap,
    damageSource: function (target, kind, by) {
      try { return sourceFor(target, kind, by) } catch (e) {
        warnOnce('damageSource:' + kind, '[icraft.core] damageSource(' + kind + ') could not be built (answered null): ' + e)
        return null
      }
    },
    dealDamage: dealDamage,
    dealDamageFrom: dealDamageFrom,
    secondary: secondary
  }

  console.log('[IridescentCraft] 0_lib_core loaded -- global.icraft.core (damage-source accessors, ' +
    'entity ids, world clock, one guarded hurt dispatcher' + (DamageRegistry ? '' : ' [REGISTRY MISSING]') +
    ', damage-type tags ' + (TAG_FIRE ? 'on' : 'off (id matching only)') + ')')
})()

// the last statement: this library ran to its end (icraft.lib, 00_icraft_guard.js)
icraft.lib.announce('core')
