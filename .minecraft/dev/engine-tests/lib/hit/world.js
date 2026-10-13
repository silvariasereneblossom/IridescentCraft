// Suite hit-table, after the scripts loaded: the stand-in players, the trace, and the ways a hit is driven.
// The same shapes as the full-pack probe (internal dev/hit-table-d-2026-10-13/zzzz_d_hit_probe.js), so a row
// here and a row there read alike. What differs: the mocks have no other mod's listeners (on the full pack a
// hit by an entity reaches the registry at 0.9 of what was posted), no armour maths and no i-frames carry-over.
var HT_core = global.icraft.core

// ---- stand-ins: the class and the aptitudes of a test player are answered here -------------------
// (as in the probe: a test player has no chosen class and no aptitude capability; every other player is
// passed through to the two libraries)
var HT_CLASS = {}, HT_APT = {}
var HT_APT_NAMES = ['strength', 'constitution', 'dexterity', 'defense', 'intelligence', 'building', 'magic', 'luck']
;(function () {
  var origin = global.icraft.origin, apt = global.icraft.aptitude
  var realGet = origin.get, realIs = origin.is, realAll = apt.all
  origin.get = function (player, layer) {
    var k = HT_uid(player)
    if (HT_CLASS.hasOwnProperty(k) && String(layer) === 'class') return HT_CLASS[k]
    return realGet(player, layer)
  }
  origin.is = function (player, layer, id) {
    var k = HT_uid(player)
    if (HT_CLASS.hasOwnProperty(k) && String(layer) === 'class') return HT_CLASS[k] === String(id)
    return realIs(player, layer, id)
  }
  apt.all = function (player) {
    var k = HT_uid(player)
    if (HT_APT.hasOwnProperty(k)) return HT_APT[k]
    return realAll(player)
  }
})()

var HT_UNDEAD = __host.loadClass('mk.S$MobType').UNDEAD
var HT_count = 0
// o: dim, tags, awakened, shift, cls, apt, hand, mana, sp, fire, undead, health, chest
var HT_player = function (o) {
  HT_count++
  var p = T_newPlayer('ht' + HT_count, o.dim || 'minecraft:overworld', 0.5, 200, 0.5)
  var k = HT_uid(p)
  var i
  if (o.tags) for (i = 0; i < o.tags.length; i++) p.getTags().add(o.tags[i])
  if (o.awakened) p.persistentData.putBoolean('icraft_nether_visited', true)
  if (o.shift) p.persistentData.putLong('icraft_ender_shift_expires', Number(p.level.time) + 100)
  if (o.cls) HT_CLASS[k] = o.cls
  if (o.apt) {
    var a = {}, total = 0
    for (i = 0; i < HT_APT_NAMES.length; i++) { a[HT_APT_NAMES[i]] = o.apt[HT_APT_NAMES[i]] || 1; total += a[HT_APT_NAMES[i]] }
    a.total = total
    HT_APT[k] = a
  }
  if (o.hand) p.t_hold(o.hand)
  if (o.mana !== undefined) HT_MANA[k] = o.mana
  if (o.sp) p.modifyAttribute('irons_spellbooks:spell_power', 'ht', o.sp, 'addition')
  if (o.fire) p.modifyAttribute('irons_spellbooks:fire_spell_power', 'ht', o.fire, 'addition')
  if (o.undead) p.modifyAttribute('iridescent_reforging:damage_vs_undead', 'ht', o.undead, 'addition')
  if (o.health) p.setHealth(o.health)
  if (o.chest !== undefined) p.t_wear(MSlot.CHEST, new MStack('minecraft:iron_chestplate', 1).t_durability(240, o.chest))
  return p
}
var HT_mana = function (p) { return String(HT_MANA[HT_uid(p)]) }
// a zombie: undead, 20 health, 2 armour (vanilla's)
var HT_zombie = function (dim) {
  var z = T_mob('minecraft:zombie', dim || 'minecraft:overworld', 2.5, 200, 0.5, 20)
  T.set(z, 'mobType', HT_UNDEAD)
  T.set(z, 'armor', 2)
  T.base(z, 'iridescent_reforging:damage_vs_undead', 0)     // the jar puts the attribute on every living entity
  return z
}
var HT_cow = function () {
  var c = new MLiving('minecraft:cow', T_level('minecraft:overworld'), 2.5, 200, 0.5)
  T.base(c, 'iridescent_reforging:damage_vs_undead', 0)
  return c
}
var HT_sword = function (id, max, damage, broken) {
  var st = new MStack(id, 1).t_durability(max, damage)
  if (broken) st.getOrCreateTag().putBoolean('icraft_broken', true)
  return st
}
var HT_arrow = function (shooter, bow) {
  var a = new MEntity('minecraft:arrow', shooter.level, 1, 200, 0.5)
  if (bow) a.persistentData.putString('icraft_uniq_bow', bow)
  return a
}
var HT_src = {
  melee: function (p) { return new MSource('minecraft:player_attack', p, p) },
  mob: function (m) { return new MSource('minecraft:mob_attack', m, m) },
  arrow: function (arrow, shooter) { return new MSource('minecraft:arrow', shooter, arrow) },
  fall: function () { return new MSource('minecraft:fall', null, null) },
  ars: function (path, p) { return new MSource('ars_nouveau:' + path, p, p) }
}
var HT_chest = function (p) {
  var st = p.getEquipment(MSlot.CHEST)
  return 'chestplate damage ' + st.damageValue + ' of ' + st.maxDamage + ', broken tag ' + (st.nbt && st.nbt.contains('icraft_broken') ? String(st.nbt.getBoolean('icraft_broken')) : 'absent')
}
var HT_effects = function (e, ids) {
  var out = []
  for (var i = 0; i < ids.length; i++) out.push(ids[i].replace('minecraft:', '') + ' ' + (T.hasEffect(e, ids[i]) ? 'yes' : 'no'))
  return out.join(', ')
}
var HT_stamps = function (p, keys) {
  var out = []
  var now = Number(p.level.time)
  for (var i = 0; i < keys.length; i++) {
    var has = p.persistentData.contains(keys[i])
    var v = has ? Number(p.persistentData.getLong(keys[i])) : 0
    out.push(keys[i].replace('icraft_', '') + ' ' + (has ? (v === now ? 'now' : (v === 0 ? '0' : 'another time')) : 'absent'))
  }
  return out.join(', ')
}

// ---- the trace ------------------------------------------------------------------------------------
// One frame per hurt event, in the order the events began; in a frame, one step per registry entry that ran
// (mk.T.traceHurt) and one per handler the dispatcher ran (core.hurtTap). stepText prints the steps that
// changed the amount or the cancel flag; the dispatcher's own unplaced handlers are ONE step, `core`.
var HT_num = function (x) { var n = Number(x); return (n !== n) ? 'NaN' : String(n) }
var HT_frames = [], HT_tracing = false
var HT_frameOf = function (event) {
  for (var i = HT_frames.length - 1; i >= 0; i--) if (HT_frames[i].event === event) return HT_frames[i]
  var f = { event: event, victim: event.getEntity(), source: event.getSource(), steps: [] }
  HT_frames.push(f)
  return f
}
T.traceHurt(function (key, event, before, cancelledBefore) {
  if (!HT_tracing) return
  var f = HT_frameOf(event)
  if (String(key) === '') return
  f.steps.push({ key: String(key), place: 'entry', a: Number(before), b: Number(event.getAmount()), c: cancelledBefore === true, c2: event.isCanceled() === true })
})
// (a core from before 2026-10-13 has neither hurtTap nor hurtPlan: the dispatcher is then the one step `core`,
// which is what `run.py --pack <an older checkout>` needs to show that the library's rewrite moved no row)
var HT_tapped = typeof HT_core.hurtTap === 'function'
if (HT_tapped) HT_core.hurtTap(function (key, place, event, a, c) {
  if (!HT_tracing) return
  HT_frameOf(event).steps.push({ key: String(key), place: String(place), a: Number(a), b: Number(event.getAmount()), c: c === true, c2: event.isCanceled() === true })
})
var HT_stepText = function (f) {
  var out = []
  var main = null
  var flush = function () {
    if (main !== null) { if (main.a !== main.b || main.c !== main.c2) out.push('core:' + HT_num(main.a) + '>' + HT_num(main.b) + (main.c2 && !main.c ? ' CANCELLED' : '')); main = null }
  }
  for (var i = 0; i < f.steps.length; i++) {
    var s = f.steps[i]
    if (s.place === 'entry' && s.key.indexOf('icraft.core') === 0) {
      if (!HT_tapped) { flush(); main = { a: s.a, b: s.b, c: s.c, c2: s.c2 }; flush(); continue }
      // the dispatcher: its handlers report themselves. What the entry `icraft.core` left is the end of the
      // block all the same: the dispatcher puts a NaN / infinite / negative amount right AFTER the handler.
      if (s.key === 'icraft.core' && main !== null) { main.b = s.b; main.c2 = s.c2 }
      continue
    }
    if (s.place === 'main') {
      if (main === null) main = { a: s.a, b: s.b, c: s.c, c2: s.c2 }; else { main.b = s.b; main.c2 = s.c2 }
      continue
    }
    flush()
    if (s.a !== s.b || s.c !== s.c2) out.push(s.key.replace(/^icraft\./, '') + ':' + HT_num(s.a) + '>' + HT_num(s.b) + (s.c2 && !s.c ? ' CANCELLED' : ''))
  }
  flush()
  return out.length ? out.join(' ; ') : '(no handler changed the amount)'
}
var HT_framesText = function (only) {
  var out = []
  for (var i = 0; i < HT_frames.length; i++) {
    if (only && HT_frames[i].victim !== only) continue
    out.push('[' + String(HT_frames[i].victim.getType()) + ' <- ' + String(HT_frames[i].source.getType()) + '] ' + HT_stepText(HT_frames[i]))
  }
  return out.length ? out.join(' || ') : '(no hurt event reached the registry)'
}

// ---- the ways a hit is driven ---------------------------------------------------------------------
var HT_begin = function () { HT_frames = []; HT_tracing = true }
var HT_end = function () { HT_tracing = false }
// posted: the event, through the registry; the amount it ends with (0 when cancelled, as Forge hands it back)
var HT_post = function (victim, source, amount) {
  HT_begin()
  var ev
  try { ev = T.fireHurt(victim, source, amount) } finally { HT_end() }
  return 'posted ' + HT_num(amount) + ' -> handed back ' + (ev.isCanceled() ? '0' : HT_num(ev.getAmount())) + ' | ' + HT_framesText(null)
}
// real: victim.attack(..), with the health it cost
var HT_real = function (victim, source, amount) {
  HT_begin()
  var before = Number(victim.getHealth()), took
  try { took = victim.attack(source, amount) } finally { HT_end() }
  return 'real hit of ' + HT_num(amount) + ': attack() ' + took + ', health ' + HT_num(before) + ' -> ' + HT_num(victim.getHealth()) + ' | ' + HT_framesText(null)
}
// secondary: core.dealDamage / dealDamageFrom, as a splash, a chain or thorns deal it
var HT_secondary = function (victim, kind, amount, by) {
  HT_begin()
  var before = Number(victim.getHealth()), dealt
  try { dealt = HT_core.dealDamage(victim, kind, amount, by) } finally { HT_end() }
  return 'secondary hit of ' + HT_num(amount) + ' (dealDamage ' + kind + '): ' + dealt + ', health ' + HT_num(before) + ' -> ' + HT_num(victim.getHealth()) + ' | ' + HT_framesText(null)
}
var HT_secondaryFrom = function (victim, source, amount) {
  HT_begin()
  var before = Number(victim.getHealth()), dealt
  try { dealt = HT_core.dealDamageFrom(victim, source, amount) } finally { HT_end() }
  return 'secondary hit of ' + HT_num(amount) + ' (dealDamageFrom, the source of the first hit): ' + dealt + ', health ' + HT_num(before) + ' -> ' + HT_num(victim.getHealth()) + ' | ' + HT_framesText(null)
}
// a posted event from INSIDE a secondary hit on a dummy mob (the shape of the probe's rows for a player who
// is hit: there a stand-in player cannot be hurt for real). KubeJS's EntityEvents.hurt runs inside attack().
var HT_nested = null
EntityEvents.hurt(function (ev) {
  if (HT_nested === null) return
  var inner = HT_nested
  HT_nested = null
  inner()
})
var HT_nestedPost = function (victim, source, amount) {
  HT_begin()
  var ev = null, seen = null
  HT_nested = function () { seen = HT_core.secondary(victim); ev = T.fireHurt(victim, source, amount) }
  try { HT_core.dealDamage(HT_zombie(), 'generic', 1, null) } finally { HT_end(); HT_nested = null }
  return 'nested post of ' + HT_num(amount) + ' (core.secondary() said ' + seen + ') -> handed back ' + (ev === null ? 'nothing' : (ev.isCanceled() ? '0' : HT_num(ev.getAmount()))) + ' | ' + HT_framesText(victim)
}

// ---- the order every handler runs in, wherever it lives -------------------------------------------
// The walk of the registry's two maps, with each dispatcher entry replaced by what it runs: the placed
// handlers by their keys, the unplaced ones as the one block `core`.
var HT_totalOrder = function () {
  var plan = (typeof HT_core.hurtPlan === 'function') ? HT_core.hurtPlan() : null
  var inside = function (entry) {
    if (plan === null) return ['core']
    var out = [], block = false
    for (var i = 0; i < plan.length; i++) {
      if (plan[i].entry !== entry) continue
      if (plan[i].place === 'main') { if (!block) { out.push('core'); block = true } } else out.push(plan[i].key)
    }
    return out
  }
  var walk = function (text) {
    var keys = String(text) === '' ? [] : String(text).split(','), out = []
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('icraft.core') === 0) out = out.concat(inside(keys[i])); else out.push(keys[i])
    }
    return out.join(' , ')
  }
  return walk(T.normalKeys()) + ' | late: ' + walk(T.lateKeys())
}
