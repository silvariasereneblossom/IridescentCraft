// magic_bonuses.js: each magic bonus counts once on an Iron's spell (2026-10-17, decision list entry 120).
// The scripts: origins/class_passives.js (the Archmage's Mana Attunement), skills/justleveling_skills.js (Mana Spark,
// Mana Blaze, Mana Inferno), attributes/class_attribute_bonuses.js through attributes/attribute_sync.js (the class
// spell power, applied in the hurt dispatcher), skills/skill_effects.js (its old "magic damage sync" is gone).
//
// Two engine steps are not in any script, so the suite carries them as ports HELD TO a full-pack server (internal
// dev/archmage-2026-10-17/, probe zzzz_am_probe.js, rows measured 2026-10-17 on the pack's 428 mods with ISS's spell
// config built as at a player's first login):
//   * Iron's Spells: a spell's power = its base x the caster's irons_spellbooks:spell_power (firebolt level 1: base 18;
//     18 with no modifier, 20.7 with +0.15 multiply_base, 18 with any magic_damage modifier).
//   * Pufferfish's Attributes: at the head of LivingEntity.hurt, a hit by a living attacker whose type is
//     minecraft:magic / indirect_magic or #c:is_magic / #neoforge:is_magic (all nine Iron's school types) is put
//     through the attacker's puffish_attributes:magic_damage modifiers (DynamicModificationImpl.applyTo: additions,
//     then multiply_base on that sum, then multiply_total). A 10-point hit cost a zombie 9 with no modifier (other
//     mods take a tenth before the pack's handlers), 10.35 with +0.15 multiply_base, 10.8 with +2 addition, 10.35 with
//     +0.15 multiply_total; Ars Nouveau's spell damage and melee stayed at 9 under every modifier.
// The class, the race and the aptitudes of a test player are answered here (as in the probe and the hit table).
var MB_core = global.icraft.core
var MB_CLASS = {}, MB_RACE = {}, MB_APT = {}
var MB_uid = function (p) { return String(p.uuid.toString()) }
;(function () {
  var origin = global.icraft.origin, apt = global.icraft.aptitude
  var realGet = origin.get, realIs = origin.is, realAll = apt.all
  var answer = function (player, layer) {
    var k = MB_uid(player), l = String(layer)
    if (l === 'class' && MB_CLASS.hasOwnProperty(k)) return { v: MB_CLASS[k] }
    if (l === 'race' && MB_RACE.hasOwnProperty(k)) return { v: MB_RACE[k] }
    return null
  }
  origin.get = function (player, layer) { var a = answer(player, layer); return a ? a.v : realGet(player, layer) }
  origin.is = function (player, layer, id) { var a = answer(player, layer); return a ? a.v === String(id) : realIs(player, layer, id) }
  apt.all = function (player) { var k = MB_uid(player); return MB_APT.hasOwnProperty(k) ? MB_APT[k] : realAll(player) }
})()
var MB_APT_NAMES = ['strength', 'constitution', 'dexterity', 'defense', 'intelligence', 'building', 'magic', 'luck']
var MB_n = 0
// o: cls, race, tier, magic (aptitude), arcane (the Origins power Arcane Supremacy, +0.5 multiply_base on magic damage)
var MB_player = function (o) {
  MB_n++
  var p = T_newPlayer('mb' + MB_n, 'minecraft:overworld', 0.5, 200, 0.5)
  var k = MB_uid(p)
  if (o.cls) MB_CLASS[k] = o.cls
  if (o.race) MB_RACE[k] = o.race
  if (o.tier) p.persistentData.putInt('icraft_detected_tier', o.tier)
  var a = { total: 0 }
  for (var i = 0; i < MB_APT_NAMES.length; i++) { a[MB_APT_NAMES[i]] = (MB_APT_NAMES[i] === 'magic') ? (o.magic || 0) : 0; a.total += a[MB_APT_NAMES[i]] }
  MB_APT[k] = a
  // the Origins attribute power, as Origins puts it on a player of that class / race (a modifier of its own name)
  if (o.arcane) T.modifier(p, 'puffish_attributes:magic_damage', 'origins:arcane_power', o.arcane, 1)
  return p
}
// the pack's own tick functions, run at the tick on which each does its magic work
var MB_tickFn = function (name) {
  var list = global.serverTickFunctions || []
  for (var i = 0; i < list.length; i++) if (String(list[i].name) === name) return list[i].fn
  return null
}
var MB_runTick = function (name, tick) {
  var fn = MB_tickFn(name)
  if (!fn) throw new Error('tick function ' + name + ' is not registered')
  T.set(T_server, 'tick', tick)
  fn({ server: T_server })
}
var MB_allTicks = function () {
  MB_runTick('tick_classPassives', 225)              // the Archmage block: tick % 200 === 25
  MB_runTick('tick_justlevelingSkills', 237)
  MB_runTick('tick_skillEffects', 250)               // the old sync block: tick % 200 === 50
  MB_runTick('tick_classAttributeBonuses', 250)
}
// the modifiers on an attribute, as "name op amount" (op 0 / 1 / 2)
var MB_mods = function (p, attr) { var s = String(T.mods(p, attr)); return s === '' ? [] : s.split(',') }
var MB_modsNamed = function (p, attr, prefix) { return MB_mods(p, attr).filter(function (m) { return m.indexOf(prefix) === 0 }) }

// ---- the two engine steps (ports, held to the full pack below) ----------------------------------------------------
var MB_PUFF_MAGIC = ['minecraft:magic', 'minecraft:indirect_magic', 'irons_spellbooks:fire_magic', 'irons_spellbooks:ice_magic',
  'irons_spellbooks:lightning_magic', 'irons_spellbooks:holy_magic', 'irons_spellbooks:ender_magic', 'irons_spellbooks:blood_magic',
  'irons_spellbooks:evocation_magic', 'irons_spellbooks:eldritch_magic', 'irons_spellbooks:nature_magic']
var MB_puffish = function (p, typeId, amount) {
  if (MB_PUFF_MAGIC.indexOf(typeId) < 0) return amount
  var mods = MB_mods(p, 'puffish_attributes:magic_damage'), add = 0, mb = 0, mt = 1
  for (var i = 0; i < mods.length; i++) {
    var f = mods[i].split(' '), op = Number(f[1]), v = Number(f[2])
    if (op === 0) add += v; else if (op === 1) mb += v; else mt *= (1 + v)
  }
  var x = amount + add
  return (x + x * mb) * mt
}
var MB_OTHER = 0.9                                     // what the other mods leave of a hit before the pack's handlers
var MB_FIREBOLT_L1 = 18
var MB_issPower = function (p) { return MB_FIREBOLT_L1 * Number(p.getAttributeValue('irons_spellbooks:spell_power')) }
// a firebolt (level 1) of `p` landing on a fresh zombie: what the zombie loses
var MB_firebolt = function (p) {
  var z = T_mob('minecraft:zombie', 'minecraft:overworld', 2.5, 200, 0.5, 1000)
  var src = T.source('irons_spellbooks:fire_magic', p, p)
  T_rand(0.999)                                        // no crit roll succeeds
  var ev = T_fireHurt(z, src, MB_puffish(p, 'irons_spellbooks:fire_magic', MB_issPower(p)) * MB_OTHER)
  T_rand()
  return Number(ev.getAmount())
}

T_run('magic bonuses: the scripts load', function () {
  ok(T_LOAD_ERRORS.length === 0, 'loads (' + T_LOAD_ERRORS.join(' / ') + ')')
  ;['tick_classPassives', 'tick_justlevelingSkills', 'tick_skillEffects', 'tick_classAttributeBonuses'].forEach(function (n) {
    ok(MB_tickFn(n) !== null, n + ' is registered')
  })
})

T_run('the two engine steps reproduce the full-pack rows', function () {
  // [modifier on the attacker, cost of a 10-point magic hit, cost of a 10-point Ars / melee hit, firebolt L1 power]
  var ROWS = [
    ['none', null, 9, 9, 18],
    ['magic_damage +0.15 multiply_base', ['puffish_attributes:magic_damage', 0.15, 1], 10.35, 9, 18],
    ['magic_damage +2 addition', ['puffish_attributes:magic_damage', 2, 0], 10.8, 9, 18],
    ['magic_damage +0.15 multiply_total', ['puffish_attributes:magic_damage', 0.15, 2], 10.35, 9, 18],
    ['spell_power +0.15 multiply_base', ['irons_spellbooks:spell_power', 0.15, 1], 9, 9, 20.7]
  ]
  ROWS.forEach(function (r) {
    var p = MB_player({})
    if (r[1]) T.modifier(p, r[1][0], 'mb_probe', r[1][1], r[1][2])
    var magicOk = MB_PUFF_MAGIC.every(function (t) { return Math.abs(MB_puffish(p, t, 10) * MB_OTHER - r[2]) < 1e-6 })
    ok(magicOk, r[0] + ': a 10-point hit of every Iron\'s school and of vanilla magic costs ' + r[2])
    near(MB_puffish(p, 'ars_nouveau:spell', 10) * MB_OTHER, r[3], r[0] + ': Ars Nouveau spell damage')
    near(MB_puffish(p, 'minecraft:player_attack', 10) * MB_OTHER, r[3], r[0] + ': melee')
    near(MB_issPower(p), r[4], r[0] + ': firebolt level 1 power')
  })
})

T_run('Mana Attunement: spell power only, +5 % a tier', function () {
  ;[1, 2, 3, 4].forEach(function (t) {
    var p = MB_player({ cls: 'icraft:archmage', tier: t, arcane: 0.5 })
    MB_allTicks()
    var sp = MB_modsNamed(p, 'irons_spellbooks:spell_power', 'icraft_archmage_attunement')
    var want = t === 1 ? [] : ['icraft_archmage_attunement 1 ' + (0.05 * (t - 1))]
    ok(sp.length === want.length && (want.length === 0 || Math.abs(Number(sp[0].split(' ')[2]) - 0.05 * (t - 1)) < 1e-9 && sp[0].split(' ')[1] === '1'),
      'tier ' + t + ': spell power ' + (t === 1 ? 'untouched' : '+' + (5 * (t - 1)) + ' % multiply_base') + ' (' + sp.join('; ') + ')')
    var md = MB_mods(p, 'puffish_attributes:magic_damage')
    ok(md.length === 1 && md[0].indexOf('origins:arcane_power ') === 0, 'tier ' + t + ': magic damage carries the Origins power alone (' + md.join('; ') + ')')
  })
  var none = MB_player({ tier: 4 })
  MB_allTicks()
  ok(MB_mods(none, 'irons_spellbooks:spell_power').length === 0 && MB_mods(none, 'puffish_attributes:magic_damage').length === 0,
    'a player of no class, tier 4: neither attribute is touched')
})

T_run('the old magic damage sync is gone', function () {
  var who = [['Archmage', { cls: 'icraft:archmage', tier: 1, arcane: 0.5 }], ['Battlemage', { cls: 'icraft:battlemage', tier: 1 }],
    ['Faefolk', { race: 'icraft:faefolk', tier: 1 }], ['Elf', { race: 'icraft:elf', tier: 1 }]]
  who.forEach(function (w) {
    var p = MB_player(w[1])
    MB_allTicks()
    ok(MB_modsNamed(p, 'irons_spellbooks:spell_power', 'icraft_magic_damage_sync').length === 0,
      w[0] + ': no icraft_magic_damage_sync on spell power (' + MB_mods(p, 'irons_spellbooks:spell_power').join('; ') + ')')
  })
})

T_run('the Archmage\'s firebolt at tiers 1 to 4 (classless: 16.2)', function () {
  near(MB_firebolt(MB_player({ tier: 4 })), 16.2, 'a player of no class')
  // spell power 1 + 0.05 (t - 1), Arcane Supremacy x1.5, the class spell power x1.25 in the dispatcher
  var WANT = { 1: 30.375, 2: 31.89375, 3: 33.4125, 4: 34.93125 }
  ;[1, 2, 3, 4].forEach(function (t) {
    var p = MB_player({ cls: 'icraft:archmage', tier: t, arcane: 0.5 })
    MB_allTicks()
    ok(Math.abs(Number(p.persistentData.getDouble('icraft_spell_power')) - 1.25) < 1e-9, 'tier ' + t + ': the class spell power is 1.25')
    near(MB_firebolt(p), WANT[t], 'tier ' + t + ': x' + (WANT[t] / 16.2).toFixed(3) + ' of the classless caster')
  })
})

T_run('the Magic aptitude skills: spell power only', function () {
  // [MAG, spell power multiply_base sum, max mana, mana regen, firebolt cost (no class)]
  var ROWS = [[0, 0, 0, 0, 16.2], [5, 0.05, 20, 0, 17.01], [10, 0.05, 20, 0.15, 17.01], [15, 0.20, 20, 0.15, 19.44],
    [20, 0.20, 20, 0.15, 19.44], [30, 0.50, 20, 0.15, 24.3]]
  ROWS.forEach(function (r) {
    var p = MB_player({ magic: r[0] })
    MB_allTicks()
    var sum = 0
    MB_modsNamed(p, 'irons_spellbooks:spell_power', 'icraft_mana_').forEach(function (m) { sum += Number(m.split(' ')[2]) })
    near(sum, r[1], 'MAG ' + r[0] + ': Mana Spark / Blaze / Inferno on spell power')
    ok(MB_mods(p, 'puffish_attributes:magic_damage').length === 0, 'MAG ' + r[0] + ': nothing on magic damage (' + MB_mods(p, 'puffish_attributes:magic_damage').join('; ') + ')')
    var mm = MB_modsNamed(p, 'irons_spellbooks:max_mana', 'icraft_mana_spark'), mr = MB_modsNamed(p, 'irons_spellbooks:mana_regen', 'icraft_conservation')
    near(mm.length ? Number(mm[0].split(' ')[2]) : 0, r[2], 'MAG ' + r[0] + ': max mana')
    near(mr.length ? Number(mr[0].split(' ')[2]) : 0, r[3], 'MAG ' + r[0] + ': mana regen')
    near(MB_firebolt(p), r[4], 'MAG ' + r[0] + ': firebolt level 1 costs a zombie')
  })
})
