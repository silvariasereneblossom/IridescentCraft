// =============================================================================
// HIT TABLE, first scope -- the options of core.onHurt / onHurtLate, proven on the
// library alone, before any script uses them: `place`, `secondary`, `cancelled`,
// `unchecked`, and what the Java registry's own order is.
// Nothing of the pack is loaded here but the guard, 0_lib_core.js and the registry
// reader; the handlers are test functions. Placed handlers borrow keys of the list
// PLACED of 0_lib_core.js (a key that is not on it is refused: tested below).
// Its counts go to the second scope (suites/hit_table.js) through the stash.
// =============================================================================
var HO_core = global.icraft.core
var HO_DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
var HO_noop = function (event) {}
var HO_generic = function () { return new MSource('minecraft:generic', null, null) }

// ---- the walk of the registry ----------------------------------------------------------------------
// The pack's keys, put by the same calls in the order the game makes them at boot (startup scripts, then
// the server scripts in load order), as they were on 2026-10-13 before any handler moved. The two lines
// are what a full-pack server printed from the registry's own maps that day.
var HO_BOOT = [
  ['n', 'icraft.deathskin_undead_bonus'], ['l', 'icraft.magic_enchants_decap'], ['l', 'icraft.vorpal_rework_decap'],
  ['n', 'icraft.core'], ['n', 'icraft.death_penalty.armor_clamp'], ['l', 'icraft.tmb_plain_bow_effects'],
  ['n', 'icraft.unique_tier_buff'], ['n', 'icraft.battlemage_arcane_cleave'], ['n', 'icraft.class_passives_h6'],
  ['n', 'icraft.origin.blazeborn.deal'], ['n', 'icraft.origin.blazeborn.take'], ['n', 'icraft.origin.enderian.shift'],
  ['n', 'icraft.justleveling.1'], ['n', 'icraft.justleveling.2']
]
var HO_NORMAL = 'icraft.origin.blazeborn.take,icraft.justleveling.1,icraft.justleveling.2,icraft.core,icraft.deathskin_undead_bonus,' +
  'icraft.origin.blazeborn.deal,icraft.death_penalty.armor_clamp,icraft.battlemage_arcane_cleave,icraft.unique_tier_buff,' +
  'icraft.class_passives_h6,icraft.origin.enderian.shift'
var HO_LATE = 'icraft.magic_enchants_decap,icraft.tmb_plain_bow_effects,icraft.vorpal_rework_decap'
var HO_boot = function (skip) {
  T.clearHurtRegistry()
  for (var i = 0; i < HO_BOOT.length; i++) {
    if (skip && skip.indexOf(HO_BOOT[i][1]) >= 0) continue
    if (HO_BOOT[i][0] === 'l') HO_DR.registerLate(HO_BOOT[i][1], HO_noop); else HO_DR.register(HO_BOOT[i][1], HO_noop)
  }
}
var HO_last = function (text) { var k = String(text).split(','); return k[k.length - 1] }

T_run('the registry walks its keys in hash order (a ConcurrentHashMap), not in the order they were put', function () {
  HO_boot(null)
  ok(String(T.normalKeys()) === HO_NORMAL, 'NORMAL: the eleven keys of 2026-10-13 in the order a full-pack server walked them  (got ' + T.normalKeys() + ')')
  ok(String(T.lateKeys()) === HO_LATE, 'LATE: the three keys likewise  (got ' + T.lateKeys() + ')')
  ok(HO_NORMAL.indexOf('icraft.deathskin_undead_bonus') < HO_NORMAL.indexOf('icraft.death_penalty.armor_clamp') &&
     HO_BOOT[0][1] === 'icraft.deathskin_undead_bonus' && HO_NORMAL.split(',')[0] !== 'icraft.deathskin_undead_bonus',
     'the key that was put FIRST is walked fifth, three keys put last are walked first: put order says nothing')
  // one more key and the table doubles: every key is filed again
  HO_DR.register('icraft.some.twelfth.handler', HO_noop)
  var twelve = String(T.normalKeys())
  var without = twelve.split(',').filter(function (k) { return k !== 'icraft.some.twelfth.handler' }).join(',')
  ok(without !== HO_NORMAL, 'a TWELFTH key changes the order of the other eleven (the table doubles)  (now ' + without + ')')
  ok(without.split(',')[0] === 'icraft.origin.blazeborn.deal', '... the Blazeborn bonus, sixth until then, would run first, before the dispatcher')
})

T_run('the entry icraft.core.then is walked last, in a table of 16 and in a table of 32', function () {
  // 16: the state at every step of the move (a handler that moves takes its key off; never more than eleven)
  var singles = ['icraft.origin.enderian.shift', 'icraft.class_passives_h6', 'icraft.unique_tier_buff', 'icraft.battlemage_arcane_cleave',
                 'icraft.death_penalty.armor_clamp', 'icraft.origin.blazeborn.deal']
  var moved = [], allLast = true, detail = []
  for (var i = 0; i < singles.length; i++) {
    moved.push(singles[i])
    HO_boot(moved)
    HO_DR.register('icraft.core.then', HO_noop)
    var keys = String(T.normalKeys())
    if (HO_last(keys) !== 'icraft.core.then' || keys.split(',').length > 11) { allLast = false; detail.push(keys) }
  }
  ok(allLast, 'with one to six of the placed-last keys taken off (10 or 11 keys, a table of 16): last every time' + (allLast ? '' : '  ' + detail.join(' // ')))
  // the end state: the dispatcher's two entries and the startup script's handler
  T.clearHurtRegistry()
  HO_DR.register('icraft.deathskin_undead_bonus', HO_noop)
  HO_DR.register('icraft.core', HO_noop)
  HO_DR.register('icraft.core.then', HO_noop)
  ok(String(T.normalKeys()) === 'icraft.core,icraft.deathskin_undead_bonus,icraft.core.then', 'the end state: icraft.core, the startup handler, icraft.core.then  (got ' + T.normalKeys() + ')')
  // 32: every key of 2026-10-13 and the entry (twelve keys: the table has doubled)
  HO_boot(null)
  HO_DR.register('icraft.core.then', HO_noop)
  ok(HO_last(T.normalKeys()) === 'icraft.core.then' && String(T.normalKeys()).split(',').length === 12, 'with all eleven keys and the entry (a table of 32): still last  (got ' + T.normalKeys() + ')')
  HO_DR.registerLate('icraft.core.late', HO_noop)
  ok(String(T.lateKeys()) === 'icraft.magic_enchants_decap,icraft.core.late,icraft.tmb_plain_bow_effects,icraft.vorpal_rework_decap',
     'LATE: icraft.core.late is walked between the two Vorpal handlers, where the plain-bow handler is  (got ' + T.lateKeys() + ')')
})

// ---- the dispatcher --------------------------------------------------------------------------------
// From here on the registry is as at boot: the startup script's handler first, then whatever core registers.
T.clearHurtRegistry()
var HO_log = []
var HO_flags = { cancel: false, splash: null, nan: false, negative: false, uncheckedNan: false, uncheckedSet: 0, gate: false }
var HO_mark = function (name, act) { return function (event, ctx) { HO_log.push(name); if (act) act(event, ctx) } }
HO_DR.register('icraft.deathskin_undead_bonus', function (event) { HO_log.push('startup') })
HO_DR.registerLate('icraft.magic_enchants_decap', function (event) { HO_log.push('startup-late') })
// registered in an order that is NOT the order they must run in
var HO_r = {}
HO_r.shift = HO_core.onHurt('icraft.origin.enderian.shift', HO_mark('shift'), 'any', { place: 'last' })
HO_r.main1 = HO_core.onHurt('t.ho.main1', HO_mark('main1', function (event) {
  if (HO_flags.splash !== null) { var target = HO_flags.splash; HO_flags.splash = null; HO_core.dealDamage(target, 'generic', 2, null) }
  if (HO_flags.cancel) event.setCanceled(true)
}), 'any')
HO_r.jl2 = HO_core.onHurt('icraft.justleveling.2', HO_mark('jl2'), 'any', { place: 'first' })
HO_r.deal = HO_core.onHurt('icraft.origin.blazeborn.deal', HO_mark('deal'), 'any', { place: 'last', cancelled: true })
HO_r.take = HO_core.onHurt('icraft.origin.blazeborn.take', HO_mark('take'), 'any', { place: 'first', secondary: true })
HO_r.unchecked = HO_core.onHurt('t.ho.unchecked', HO_mark('unchecked', function (event) {
  if (HO_flags.uncheckedSet > 0) event.setAmount(HO_flags.uncheckedSet)
}), 'any', { unchecked: true })
HO_r.main2 = HO_core.onHurt('t.ho.main2', HO_mark('main2', function (event) {
  if (HO_flags.nan) event.setAmount(NaN)
  if (HO_flags.negative) event.setAmount(-3)
}), 'any')
HO_r.clamp = HO_core.onHurt('icraft.death_penalty.armor_clamp', HO_mark('clamp', function (event) {
  if (HO_flags.uncheckedNan) event.setAmount(NaN)
}), 'victimPlayer', { place: 'last', secondary: true, cancelled: true, unchecked: true })
HO_r.jl1 = HO_core.onHurt('icraft.justleveling.1', HO_mark('jl1'), 'attackerPlayer', { place: 'first' })
HO_r.gated = HO_core.onHurt('t.ho.gated', HO_mark('gated'), 'any', { gate: function () { return HO_flags.gate } })
HO_r.late = HO_core.onHurtLate('t.ho.late', HO_mark('late'), 'any')
HO_r.late2 = HO_core.onHurtLate('t.ho.late.every', HO_mark('late-every'), 'any', { secondary: true, cancelled: true, unchecked: true })

var HO_hit = function (victim, source, amount) {
  HO_log = []
  return T.fireHurt(victim, source, amount)
}
var HO_mobA = T_mob('minecraft:zombie'), HO_mobB = T_mob('minecraft:husk')
var HO_p = T_newPlayer('ho1'), HO_q = T_newPlayer('ho2')

T_run('place: first and last hold their place whatever the order of registration; a startup handler stays between', function () {
  var all = true
  for (var k in HO_r) if (HO_r[k] !== true) all = false
  ok(all, 'every registration returned true')
  ok(String(T.normalKeys()) === 'icraft.core,icraft.deathskin_undead_bonus,icraft.core.then', 'the dispatcher is two entries of the NORMAL map, around the startup script\'s  (got ' + T.normalKeys() + ')')
  ok(String(T.lateKeys()) === 'icraft.magic_enchants_decap,icraft.core.late', 'and one of the LATE map  (got ' + T.lateKeys() + ')')
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_log.join(' ') === 'take jl2 main1 unchecked main2 startup deal shift startup-late late late-every',
     'a hit nobody dealt, on a mob: first (take, jl2: the list\'s order), the unplaced ones, the startup handler, last (deal, shift)  (got ' + HO_log.join(' ') + ')')
  HO_hit(HO_q, new MSource('minecraft:player_attack', HO_p, HO_p), 5)
  ok(HO_log.join(' ') === 'take jl1 jl2 main1 unchecked main2 startup deal clamp shift startup-late late late-every',
     'a hit by a player on a player: `who` holds for placed handlers too (jl1 for a player attacker, clamp for a player victim), each at its place  (got ' + HO_log.join(' ') + ')')
})

T_run('secondary: a handler runs on a secondary hit only when it says so', function () {
  HO_flags.splash = HO_mobB
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_log.join(' ') === 'take jl2 main1 take startup startup-late late-every unchecked main2 startup deal shift startup-late late late-every',
     'inside the splash only `secondary` handlers run (take, the LATE one), and the registry\'s own entries; the first hit then goes on  (got ' + HO_log.join(' ') + ')')
  HO_flags.splash = HO_q
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_log.join(' ').indexOf('main1 take startup clamp startup-late late-every unchecked') >= 0,
     'a splash onto a player: the placed-last handler with `secondary` runs in it, after the startup handler  (got ' + HO_log.join(' ') + ')')
  ok(HO_core.secondary() === false, 'and the re-entrancy counter is back at 0')
})

T_run('cancelled: a cancelled hit ends the walk, except for a handler that says it wants it', function () {
  HO_flags.cancel = true
  var ev = HO_hit(HO_q, HO_generic(), 5)
  HO_flags.cancel = false
  ok(ev.isCanceled() === true, 'the hit is cancelled')
  ok(HO_log.join(' ') === 'take jl2 main1 startup deal clamp startup-late late-every',
     'after the cancel: no further unplaced handler, the registry\'s own entries (as ever), deal and clamp (`cancelled`), not shift; LATE: only the one with `cancelled`  (got ' + HO_log.join(' ') + ')')
})

T_run('unchecked: the amount a handler leaves is checked, unless it says not', function () {
  HO_flags.nan = true
  var ev = HO_hit(HO_mobA, HO_generic(), 5)
  HO_flags.nan = false
  ok(Number(ev.getAmount()) === 5, 'a checked handler that leaves NaN: the last good amount is put back  (got ' + ev.getAmount() + ')')
  HO_flags.negative = true
  ev = HO_hit(HO_mobA, HO_generic(), 5)
  HO_flags.negative = false
  ok(Number(ev.getAmount()) === 0, 'a checked handler that leaves -3: 0  (got ' + ev.getAmount() + ')')
  HO_flags.uncheckedSet = 12; HO_flags.nan = true
  ev = HO_hit(HO_mobA, HO_generic(), 5)
  HO_flags.uncheckedSet = 0; HO_flags.nan = false
  ok(Number(ev.getAmount()) === 12, 'what an unchecked handler set (12) IS the last good amount for the checked one after it  (got ' + ev.getAmount() + ')')
  // an unchecked handler that leaves NaN: nothing is put back after IT; the next handler is handed the NaN,
  // as the next entry of the registry was. (The next CHECKED handler then puts the last good amount back.)
  var found = {}
  HO_core.hurtTap(function (key, place, event, before, cancelledBefore) { found[String(key)] = Number(before) })
  HO_flags.uncheckedNan = true
  ev = HO_hit(HO_q, HO_generic(), 5)
  HO_flags.uncheckedNan = false
  HO_core.hurtTap(null)
  ok(found['icraft.death_penalty.armor_clamp'] === 5 && found['icraft.origin.enderian.shift'] !== found['icraft.origin.enderian.shift'],
     'an unchecked handler that leaves NaN: the handler after it is handed NaN, as on the registry  (clamp found ' + found['icraft.death_penalty.armor_clamp'] + ', shift found ' + found['icraft.origin.enderian.shift'] + ')')
  ok(Number(ev.getAmount()) === 5, '... and that next handler, a checked one, puts the last good amount back  (got ' + ev.getAmount() + ')')
  ok(HO_log.indexOf('shift') > HO_log.indexOf('clamp') && HO_log.indexOf('late') >= 0, '... and the walk goes on  (got ' + HO_log.join(' ') + ')')
  var arrived = HO_hit(HO_mobA, HO_generic(), Infinity)
  ok(Number(arrived.getAmount()) === 0, 'an amount that ARRIVES infinite is 0 after the first checked handler (as before this option existed)  (got ' + arrived.getAmount() + ')')
})

T_run('a gate, as the fourth argument or as an option; the same key again replaces', function () {
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_log.indexOf('gated') < 0, 'a closed gate: not called')
  HO_flags.gate = true
  HO_hit(HO_mobA, HO_generic(), 5)
  HO_flags.gate = false
  ok(HO_log.indexOf('gated') > HO_log.indexOf('main2'), 'an open gate: called, in registration order  (got ' + HO_log.join(' ') + ')')
  var before = HO_core.hurtPlan().length
  HO_core.onHurt('t.ho.gated', HO_mark('gated-again'), 'any', function () { return true })
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_core.hurtPlan().length === before && HO_log.indexOf('gated-again') > HO_log.indexOf('main2') && HO_log.indexOf('gated') < 0,
     'registered again under its key with a gate FUNCTION: one handler, the new one, same position  (got ' + HO_log.join(' ') + ')')
})

T_run('a registration the library cannot honour is refused, loudly, and nothing is registered', function () {
  var errors = function () { return T_LOG.error.length }
  var refused = function (what, fn) {
    var n = errors(), plan = HO_core.hurtPlan().length
    var back = fn()
    var line = (errors() === n + 1) ? T_LOG.error[n] : ''
    ok(back === false && /^\[icraft\.core\] onHurt\([^)]+\) REFUSED, the handler is NOT registered: /.test(line) && HO_core.hurtPlan().length === plan,
       what + ': false, one ERROR line, the plan unchanged  (' + (line === '' ? 'NO ERROR LINE' : line.substring(line.indexOf('registered: ') + 12)) + ')')
  }
  refused('a place for a key that is not on the list PLACED', function () { return HO_core.onHurt('t.ho.x1', HO_noop, 'any', { place: 'first' }) })
  refused('a key of the list `last` asking for `first`', function () { return HO_core.onHurt('icraft.unique_tier_buff', HO_noop, 'any', { place: 'first' }) })
  refused('an unknown place', function () { return HO_core.onHurt('t.ho.x2', HO_noop, 'any', { place: 'middle' }) })
  refused('a misspelt option', function () { return HO_core.onHurt('t.ho.x3', HO_noop, 'any', { secondry: true }) })
  refused('an option that is not true or false', function () { return HO_core.onHurt('t.ho.x4', HO_noop, 'any', { secondary: 'yes' }) })
  refused('a gate that is not a function', function () { return HO_core.onHurt('t.ho.x5', HO_noop, 'any', { gate: 5 }) })
  refused('a fourth argument that is neither', function () { return HO_core.onHurt('t.ho.x6', HO_noop, 'any', 'last') })
  refused('a place on a LATE handler', function () { return HO_core.onHurtLate('t.ho.x7', HO_noop, 'any', { place: 'last' }) })
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(HO_log.join(' ') === 'take jl2 main1 unchecked main2 gated-again startup deal shift startup-late late late-every', 'and a hit runs what it ran before  (got ' + HO_log.join(' ') + ')')
})

T_run('hurtPlan and hurtTap: what runs, in which order, and what each handler did', function () {
  var plan = HO_core.hurtPlan(), text = []
  for (var i = 0; i < plan.length; i++) {
    var e = plan[i]
    text.push(e.key.replace(/^icraft\./, '') + '[' + e.entry.replace('icraft.', '') + '/' + e.place + '/' + e.who + (e.secondary ? '/secondary' : '') + (e.cancelled ? '/cancelled' : '') + (e.unchecked ? '/unchecked' : '') + (e.gated ? '/gated' : '') + ']')
  }
  ok(text.join(' ') === 'origin.blazeborn.take[core/first/any/secondary] justleveling.1[core/first/attackerPlayer] justleveling.2[core/first/any] ' +
     't.ho.main1[core/main/any] t.ho.unchecked[core/main/any/unchecked] t.ho.main2[core/main/any] t.ho.gated[core/main/any/gated] ' +
     'origin.blazeborn.deal[core.then/last/any/cancelled] death_penalty.armor_clamp[core.then/last/victimPlayer/secondary/cancelled/unchecked] origin.enderian.shift[core.then/last/any] ' +
     't.ho.late[core.late/late/any] t.ho.late.every[core.late/late/any/secondary/cancelled/unchecked]',
     'hurtPlan: every handler in the order it runs, with its entry, place, who and options  (got ' + text.join(' ') + ')')
  var seen = []
  HO_core.hurtTap(function (key, place, event, before, cancelledBefore) { seen.push(String(key).replace(/^icraft\./, '') + ':' + place + ':' + Number(before) + '>' + Number(event.getAmount())) })
  HO_flags.uncheckedSet = 7
  HO_hit(HO_mobA, HO_generic(), 5)
  HO_flags.uncheckedSet = 0
  ok(seen.join(' ') === 'origin.blazeborn.take:first:5>5 justleveling.2:first:5>5 t.ho.main1:main:5>5 t.ho.unchecked:main:5>7 t.ho.main2:main:7>7 t.ho.gated:main:7>7 ' +
     'origin.blazeborn.deal:last:7>7 origin.enderian.shift:last:7>7 t.ho.late:late:7>7 t.ho.late.every:late:7>7',
     'hurtTap: one call per handler that ran, after it, with the amount it found  (got ' + seen.join(' ') + ')')
  var warned = T_LOG.warn.length
  HO_core.hurtTap(function () { var u; u.x() })
  HO_hit(HO_mobA, HO_generic(), 5)
  ok(T_LOG.warn.length === warned + 1 && T_LOG.warn[warned].indexOf('the hurt tap threw and was taken off') >= 0 &&
     HO_log.join(' ') === 'take jl2 main1 unchecked main2 gated-again startup deal shift startup-late late late-every',
     'a tap that throws is taken off with one warning, and the hit is not disturbed  (got ' + HO_log.join(' ') + ')')
  HO_core.hurtTap(null)
})

T_run('a placed handler is ARMED and FIRED like any other', function () {
  var fired = function (id) {
    var all = icraft.live.entries()
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return String(all[i].fired)
    return 'not armed'
  }
  ok(fired('icraft.origin.blazeborn.take@hurt') === 'true' && fired('icraft.death_penalty.armor_clamp@hurt') === 'true' && fired('t.ho.late.every@hurt.late') === 'true',
     'placed first, placed last and LATE: each is armed under <key>@hurt / @hurt.late and has fired  (' + fired('icraft.origin.blazeborn.take@hurt') + ', ' +
     fired('icraft.death_penalty.armor_clamp@hurt') + ', ' + fired('t.ho.late.every@hurt.late') + ')')
  ok(fired('t.ho.x1@hurt') === 'not armed', 'a refused registration armed nothing  (' + fired('t.ho.x1@hurt') + ')')
  ok(HO_core.hurtHandlers().hasOwnProperty('icraft.origin.blazeborn.take') && HO_core.hurtHandlers().hasOwnProperty('t.ho.late'),
     'hurtHandlers() offers the placed and the LATE handlers by key, as before')
  var one = HO_core.hurtHandlers()['icraft.origin.blazeborn.take']
  HO_log = []
  one(new MHurt(HO_mobA, HO_generic(), 5))
  ok(HO_log.join(' ') === 'take', 'and runs that ONE handler  (got ' + HO_log.join(' ') + ')')
})

// The pack has twenty unplaced handlers. With that many of EQUAL rank, a sort through Array.sort came back in
// another order on this engine (it is not stable): on a full-pack boot the handler registered last ran first and
// the third ran last, and no row of the hit table saw it, because the rows show the unplaced handlers as one
// block. The dispatcher must never sort them; this is the check that would have said so.
T_run('the unplaced handlers run in the order they were registered, however many there are', function () {
  var names = []
  for (var i = 0; i < 30; i++) {
    (function (n) {
      names.push(n)
      HO_core.onHurt('t.ho.many.' + n, function (event, ctx) { HO_log.push(n) }, 'any')
    })('m' + (i < 10 ? '0' : '') + i)
  }
  HO_hit(HO_mobA, HO_generic(), 5)
  var ran = HO_log.filter(function (x) { return /^m\d\d$/.test(x) })
  ok(ran.join(' ') === names.join(' '), 'thirty more handlers of equal rank: run in registration order  (got ' + ran.join(' ') + ')')
  var plan = HO_core.hurtPlan().filter(function (e) { return e.place === 'main' }).map(function (e) { return e.key })
  ok(plan.slice(0, 4).join(' ') === 't.ho.main1 t.ho.unchecked t.ho.main2 t.ho.gated' && plan.slice(4).join(' ') === names.map(function (n) { return 't.ho.many.' + n }).join(' '),
     'hurtPlan lists them so, after the four registered earlier  (got ' + plan.join(' ') + ')')
  ok(HO_log.indexOf('take') < HO_log.indexOf('main1') && HO_log.indexOf('m29') < HO_log.indexOf('startup') && HO_log.indexOf('startup') < HO_log.indexOf('deal'),
     'and the places hold around them: first, the thirty-four, the startup handler, last')
})

__host.print('hit-table, first scope (the options): ' + T_pass + ' passed, ' + T_fail + ' failed')
__host.stash.put('ht_options_pass', T_pass)
__host.stash.put('ht_options_fail', T_fail + T_UNCAUGHT.length + T_LOAD_ERRORS.length)
