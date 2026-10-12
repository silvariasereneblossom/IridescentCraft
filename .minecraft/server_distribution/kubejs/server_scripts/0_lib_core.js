// =============================================================================
// icraft.core -- shared primitives for the hit / tick handlers
// File: kubejs/server_scripts/0_lib_core.js   (0_ prefix: loads before consumers)
// =============================================================================
// Exported through `global.icraft.core` only (no top-level names):
//
//   entity ids      core.entityId(entity)            -> 'minecraft:zombie' | ''
//                   core.isBoss(entityOrId)          -> true | false
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
//                                                        gate: optional () -> bool for 'any' handlers
//                   core.hurtHandlers()              -> { key: fn(event) } (diagnostics / tests)
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
//   enchantments    core.enchLevel(stack, enchId)    -> level (0 if absent)
//                   core.armorEnchTotal(entity, id)  -> sum over the 4 armour pieces
//                   core.heldEnchLevel(entity, id)   -> level on the main-hand item
//                   core.gearEnchMax(entity, id)     -> best of armour + both hands
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
//
// RE-ENTRANCY
//   LivingHurtEvent fires again for damage dealt from inside a hurt handler
//   (splash, cleave, chain, thorns). dealDamage() raises a depth counter for
//   the duration of the nested hurt() call and the dispatcher (so every handler
//   registered through onHurt()/onHurtLate()) skips while it is raised: secondary damage
//   lands as-is, it does not crit, proc, splash or reflect a second time.
//   Handlers registered straight on the Java registry can read
//   global.icraft.core.secondary(event.entity) to opt in to the same rule.
//
// CONTRACT
//   * nothing here throws into the caller (neutral value instead)
//   * a failure is logged once per key per script load, never per hit / tick
//   * onHurt handlers never leave event.amount NaN / infinite / negative
// =============================================================================

;(function () {
  global.icraft = global.icraft || {}

  // ---- log once -------------------------------------------------------------
  var said = {}
  var warnOnce = function (key, message) {
    if (said[key]) return
    said[key] = true
    try { console.warn(message + ' (logged once per script load)') } catch (ignored) {}
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
    } catch (e) { return false }
  }

  // ---- entity ids -----------------------------------------------------------
  var TRANSLATION_KEY = /^entity\.([^.]+)\.(.+)$/
  var entityId = function (entity) {
    if (!entity) return ''
    var s = ''
    // The METHOD, not the `type` property (see header).
    try { s = String(entity.getType()) } catch (e) { s = '' }
    if (s.indexOf(':') > 0) return s
    try {
      if (typeof entity.getEntityType === 'function') {
        s = String(entity.getEntityType().builtInRegistryHolder().key().location())
        if (s.indexOf(':') > 0) return s
      }
    } catch (e2) {}
    var m = s.match(TRANSLATION_KEY)
    return m ? (m[1] + ':' + m[2]) : s
  }

  // Bosses = the ids the pack itself treats as bosses: the union of
  // scaling/boss_hp.js (BOSS_HP) and scaling/mob_scaling_unified.js (BOSSES).
  // Replaces substring tests on 'golem' / 'guardian' / 'ghast' / 'storm' /
  // 'dragon' / 'boss' that also matched iron golems, ordinary guardians and
  // ghasts. Keep in step with those two lists.
  var BOSS_IDS = {}
  ;[
    'minecraft:ender_dragon', 'minecraft:wither', 'minecraft:warden', 'minecraft:elder_guardian',
    'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra', 'twilightforest:ur_ghast',
    'twilightforest:knight_phantom', 'twilightforest:snow_queen', 'twilightforest:minoshroom',
    'twilightforest:alpha_yeti',
    'blue_skies:summoner', 'blue_skies:alchemist', 'blue_skies:starlit_crusher', 'blue_skies:arachnarch',
    'aether:slider', 'aether:valkyrie_queen', 'aether:sun_spirit',
    'deep_aether:eots_controller',
    'undergarden:forgotten_guardian', 'undergarden:forgotten',
    'deeperdarker:stalker', 'deeperdarker:shattered', 'deeperdarker:shriek_worm',
    'deeperdarker:sculk_centipede',
    'cataclysm:netherite_monstrosity', 'cataclysm:ignis', 'cataclysm:ender_guardian',
    'cataclysm:ancient_remnant', 'cataclysm:the_leviathan', 'cataclysm:the_harbinger',
    'cataclysm:maledictus', 'cataclysm:ender_golem', 'cataclysm:ignited_revenant',
    'cataclysm:void_blossom',
    'botania:doppleganger',
    'meetyourfight:swampjaw', 'meetyourfight:bellringer', 'meetyourfight:dame_fortuna',
    'meetyourfight:rosalyne',
    'mutantmonsters:mutant_zombie', 'mutantmonsters:mutant_skeleton', 'mutantmonsters:mutant_creeper',
    'mutantmonsters:mutant_enderman',
    'stalwart_dungeons:shelterer', 'stalwart_dungeons:nether_keeper', 'stalwart_dungeons:awful_ghast',
    'stalwart_dungeons:incomplete_wither',
    'keebsz:tower_guardian',
    'irons_spellbooks:dead_king', 'irons_spellbooks:fire_boss', 'irons_spellbooks:citadel_keeper',
    'theabyss:soul_guard', 'theabyss:ice_knight', 'theabyss:nightblade_boss', 'theabyss:the_roka',
    'theabyss:elder',
    'ub:sorcerer', 'ub:storm',
    'majestic_menaces:teikoku_senshi'
  ].forEach(function (id) { BOSS_IDS[id] = true })

  // entity, or an id string (a JS string or a Java String: both lack getType())
  var isBoss = function (entityOrId) {
    if (!entityOrId) return false
    try {
      var id = (typeof entityOrId !== 'string' && typeof entityOrId.getType === 'function')
        ? entityId(entityOrId)
        : String(entityOrId)
      return BOSS_IDS[id] === true
    } catch (e) { return false }
  }

  // ---- damage sources -------------------------------------------------------
  var attacker = function (source) {
    if (!source) return null
    try { var a = source.actual; return a ? a : null } catch (e) { return null }
  }
  var direct = function (source) {
    if (!source) return null
    try { var d = source.immediate; return d ? d : null } catch (e) { return null }
  }
  var dmgMsg = function (source) {
    if (!source) return ''
    try { return String(source.getType()) } catch (e) { return '' }
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
    } catch (e) { id = '' }
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
    try { return DamageTypeTags ? DamageTypeTags[name] : null } catch (e) { return null }
  }
  var TAG_FIRE = tag('IS_FIRE')
  var TAG_EXPLOSION = tag('IS_EXPLOSION')
  var TAG_PROJECTILE = tag('IS_PROJECTILE')
  var TAG_FALL = tag('IS_FALL')
  var inTag = function (source, tagKey) {
    if (!tagKey) return false
    try { return source.is(tagKey) === true } catch (e) { return false }
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
    try {
      var level = (holder && holder.level) ? holder.level : holder
      t = finite(level.time, NaN)
      if (t !== t) t = finite(level.levelData.gameTime, NaN)
    } catch (e) { t = NaN }
    if (t !== t) {
      warnOnce('now', '[icraft.core] could not read the world game time; cooldowns will not start')
      return 0
    }
    return t
  }

  // ---- light / forge data ---------------------------------------------------
  var light = function (entity) {
    try {
      var v = finite(entity.level.getMaxLocalRawBrightness(entity.blockPosition()), NaN)
      return (v === v) ? v : 7
    } catch (e) { return 7 }
  }
  var forgeData = function (entity) {
    if (!entity) return null
    try { var d = entity.forgePersistentData; return d ? d : null } catch (e) { return null }
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
    } catch (e) { found = null }
    attrCache[key] = found
    return found
  }
  // total (base + modifiers); `fallback` when the attribute is unknown or the entity lacks it
  var attrValue = function (entity, id, fallback) {
    var attr = attribute(id)
    if (!attr) return fallback
    try { return finite(entity.getAttributeValue(attr), fallback) } catch (e) { return fallback }
  }
  var attrBase = function (entity, id, fallback) {
    var attr = attribute(id)
    if (!attr) return fallback
    try { return finite(entity.getAttributeBaseValue(attr), fallback) } catch (e) { return fallback }
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

  // 1 = on the entity and saved with it, 0 = the entity has no such attribute
  // (nothing to do), -1 = failed (logged once per modifier name; the modifier
  // is then on the mob the way entity.modifyAttribute leaves it: not saved).
  var saveModifier = function (entity, id, name, amount, operation) {
    var key = String(name)
    try {
      var attr = attribute(id)
      var inst = entity.getAttribute(attr ? attr : String(id))
      if (!inst) return 0
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
      return 1
    } catch (e) {
      // The swap may have stopped half way (taken off, not put back): have
      // KubeJS put the transient one on again, so the mob is at least buffed
      // while it stays loaded. The caller's flag stays at 1 -> retried on load.
      try { entity.modifyAttribute(String(id), key, amount, operation) } catch (ignored) {}
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
    } catch (e) { return 1 }
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
    var saved = true
    return {
      legacy: legacy,
      modifier: function (id, name, amount, operation) {
        var result = saveModifier(entity, id, name, amount, operation)
        if (result < 0) saved = false
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
      }
    }
  }

  // ---- enchantments ---------------------------------------------------------
  var enchCache = {}   // id -> Enchantment | false
  var resolveEnch = function (id) {
    var key = String(id)
    if (enchCache.hasOwnProperty(key)) return enchCache[key]
    var found = false
    try {
      var value = ForgeRegistries.ENCHANTMENTS.getValue(ResourceLocation.tryParse(key))
      if (value) found = value
    } catch (e) { found = false }
    if (!found) warnOnce('ench:' + key, '[icraft.core] enchantment ' + key + ' is not registered; its effects are off')
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
    try { return entity.getEquipment(slot) } catch (e) { return null }
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

  // ONE entry on the Java registry per phase. Each handler says which hits it
  // wants:
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
  var WHO = { 'any': 0, 'attacker': 1, 'attackerPlayer': 2, 'victimPlayer': 3, 'player': 4 }
  var handlers = []       // NORMAL phase: { key, fn, who, gate }
  var lateHandlers = []   // LATE phase (after every NORMAL handler of every script)

  // situation mask: 1 = there is an attacker, 2 = it is a player, 4 = the victim is a player
  var wants = function (who, mask) {
    if (who === 0) return true
    if (who === 1) return (mask & 1) !== 0
    if (who === 2) return (mask & 2) !== 0
    if (who === 3) return (mask & 4) !== 0
    return (mask & 6) !== 0
  }
  var plansFor = function (list) {
    var plans = []
    for (var mask = 0; mask < 8; mask++) {
      var plan = []
      for (var i = 0; i < list.length; i++) {
        if (wants(list[i].who, mask)) plan.push(list[i])
      }
      plans.push(plan)
    }
    return plans
  }
  var plans = { normal: plansFor(handlers), late: plansFor(lateHandlers) }

  // phase: 'normal' | 'late' | a fixed plan table (hurtHandlers below)
  var dispatcher = function (phase) {
    return function (event) {
      var victim, source, hitter, todo
      var mask = 0
      try {
        if (event.isCanceled()) return
        victim = event.getEntity()
        if (depth > 0 && secondary(victim)) return
        source = event.getSource()
        hitter = source ? source.actual : null
        if (!hitter) hitter = null
        if (hitter !== null) mask = isPlayer(hitter) ? 3 : 1
        if (isPlayer(victim)) mask += 4
        todo = (typeof phase === 'string') ? plans[phase][mask] : phase[mask]
      } catch (e) {
        warnOnce('dispatch', '[icraft.core] could not read a hurt event: ' + e)
        return
      }
      var n = todo.length
      if (n === 0) return
      var ctx = null
      var amount = 0
      for (var i = 0; i < n; i++) {
        var h = todo[i]
        try {
          if (h.gate !== null && h.gate() !== true) continue
          if (ctx === null) {
            amount = finite(event.getAmount(), 0)
            ctx = { victim: victim, source: source, attacker: hitter,
                    attackerIsPlayer: (mask & 2) !== 0, victimIsPlayer: (mask & 4) !== 0 }
          }
          h.fn(event, ctx)
        } catch (e) {
          warnOnce('hurt:' + h.key, '[icraft.core] hurt handler ' + h.key + ' threw: ' + e)
        }
        // Never hand vanilla (or the next handler) a NaN / infinite / negative
        // amount: NaN health is unrecoverable for the entity.
        try {
          var after = Number(event.getAmount())
          if (after !== after || after === Infinity || after === -Infinity) event.setAmount(amount)
          else if (after < 0) { event.setAmount(0); amount = 0 }
          else amount = after
          if (event.isCanceled()) return
        } catch (e2) {}
      }
    }
  }

  var dispatcherOn = { normal: false, late: false }
  var ensureDispatcher = function (phase) {
    if (dispatcherOn[phase]) return true
    if (!DamageRegistry) {
      warnOnce('registry', '[icraft.core] DamageModifierRegistry is missing: every hurt handler is OFF')
      return false
    }
    try {
      if (phase === 'late') DamageRegistry.registerLate('icraft.core.late', dispatcher('late'))
      else DamageRegistry.register('icraft.core', dispatcher('normal'))
      dispatcherOn[phase] = true
      return true
    } catch (e) {
      warnOnce('register', '[icraft.core] could not register the hurt dispatcher: ' + e)
      return false
    }
  }

  // onHurt(key, fn, who, gate)
  //   fn(event, ctx)  event: the raw Forge LivingHurtEvent
  //                   ctx:   { victim, source, attacker, attackerIsPlayer, victimIsPlayer }
  //   gate()          optional, for 'any' handlers: return true when the handler
  //                   has anything to do at all (checked before any event read)
  var registerHurt = function (phase) {
    var list = (phase === 'late') ? lateHandlers : handlers
    return function (key, fn, who, gate) {
      var id = String(key)
      var code = WHO.hasOwnProperty(String(who)) ? WHO[String(who)] : 0
      var entry = { key: id, fn: fn, who: code, gate: (typeof gate === 'function') ? gate : null }
      var replaced = false
      for (var i = 0; i < list.length; i++) {
        if (list[i].key === id) { list[i] = entry; replaced = true; break }
      }
      if (!replaced) list.push(entry)
      plans[phase] = plansFor(list)
      // A script loaded before this scheme registered `key` straight on the Java
      // registry; after a live /reload that closure would still be there.
      try { if (DamageRegistry) DamageRegistry.unregister(id) } catch (e) {}
      return ensureDispatcher(phase)
    }
  }

  // key -> function (event): that ONE handler, through the same dispatcher
  // code. For diagnostics and tests; the game only ever calls the dispatcher.
  var hurtHandlers = function () {
    var out = {}
    var all = handlers.concat(lateHandlers)
    for (var i = 0; i < all.length; i++) out[all[i].key] = dispatcher(plansFor([all[i]]))
    return out
  }

  global.icraft.core = {
    warnOnce: warnOnce,
    finite: finite,
    isPlayer: isPlayer,
    entityId: entityId,
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
    enchLevel: enchLevel,
    armorEnchTotal: armorEnchTotal,
    heldEnchLevel: heldEnchLevel,
    gearEnchMax: gearEnchMax,
    onHurt: registerHurt('normal'),
    onHurtLate: registerHurt('late'),
    hurtHandlers: hurtHandlers,
    damageSource: function (target, kind, by) {
      try { return sourceFor(target, kind, by) } catch (e) { return null }
    },
    dealDamage: dealDamage,
    dealDamageFrom: dealDamageFrom,
    secondary: secondary
  }

  console.log('[IridescentCraft] 0_lib_core loaded -- global.icraft.core (damage-source accessors, ' +
    'entity ids, world clock, one guarded hurt dispatcher' + (DamageRegistry ? '' : ' [REGISTRY MISSING]') +
    ', damage-type tags ' + (TAG_FIRE ? 'on' : 'off (id matching only)') + ')')
})()
