// =============================================================================
// LIVENESS -- ARMED and FIRED outside the event guard: the tick master, the hurt
// dispatcher, a curated feature, and zzz_icraft_live.js (the summary line, the
// once-a-second FIRED lines), on the production Rhino build.
// The guard's own half (a handler, a cancel, a throw, the digest) is suite
// event-guard, on KubeJS's real handler chain.
// Loaded: 00_icraft_guard, 0_lib_core, 0_lib_registry, 0_tick_master,
// economy/relic_sink, zzz_icraft_live -- so the game's comparison with
// kubejs/config/icraft/live/expected.json reports hundreds of registrations as
// NOT ARMED here: only six scripts of the pack are loaded. That is the comparison
// working, and one check below holds it to exactly that.
// =============================================================================
var LV_info = function (rx) { for (var i = 0; i < T_LOG.info.length; i++) if (rx.test(T_LOG.info[i])) return T_LOG.info[i]; return null }
var LV_count = function (rx) { var n = 0; for (var i = 0; i < T_LOG.info.length; i++) if (rx.test(T_LOG.info[i])) n++; return n }
var LV_entry = function (id) {
  var all = icraft.live.entries()
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]
  return null
}
var LV_fired = function (id) { var e = LV_entry(id); return e === null ? 'not armed' : String(e.fired) }

T_run('liveness: the scripts load and the summary line is printed once', function () {
  ok(T_LOAD_ERRORS.length === 0, 'all six scripts load: ' + T_LOAD_ERRORS.join(' / '))
  var line = LV_info(/^\[icraft\.live\] ARMED server: /)
  ok(line !== null && /^\[icraft\.live\] ARMED server: \d+ registrations \(\d+ handlers on \d+ events, \d+ tick functions, \d+ hurt handlers\), digest [0-9a-f]{16}; against the expected list: \d+ not armed, 0 unlisted$/.test(line),
    'one `[icraft.live] ARMED server: ...` line with the counts, the digest and the comparison (' + line + ')')
  ok(LV_count(/^\[icraft\.live\] ARMED server: /) === 1, 'printed once')
  ok(LV_fired('zzz_icraft_live@ServerEvents.commandRegistry') === 'false' && LV_fired('tick_icraftLive@tick.server') === 'false',
    'the file that prints it is in the count: its own handlers and its tick function are ARMED')
  ok(LV_fired('economy/relic_sink@ServerEvents.commandRegistry') === 'false', "a loaded script's handler is ARMED and has not fired")
  var notArmed = 0
  for (var i = 0; i < T_LOG.error.length; i++) if (/^\[icraft\.live\] NOT ARMED x\d+: /.test(T_LOG.error[i])) notArmed++
  ok(notArmed > 5, 'the scripts that are NOT loaded here are named on ERROR lines (' + notArmed + ' lines): the comparison with expected.json runs')
  var named = T_LOG.error.join('\n')
  ok(named.indexOf('economy/relic_sink@') < 0 && named.indexOf('tick_icraftLive@') < 0 && named.indexOf('zzz_icraft_live@') < 0,
    'and no registration of a script that IS loaded is among them')
  ok(typeof global.icraftLiveLines === 'object' && typeof global.icraftLiveLines.server === 'function', '`/icraft live` finds the server part of the report on `global`')
})

var lv_ran = { good: 0, bad: 0, player: 0 }
global.registerServerTick('tick_lvGood', 1, 0, function (event) { lv_ran.good++ })
global.registerServerTick('tick_lvBad', 1, 0, function (event) { lv_ran.bad++; var u; u.foo() })
global.registerPlayerTick('tick_lvPlayer', 1, 0, function (event) { lv_ran.player++ })

T_run('liveness: a tick function is ARMED when registered, FIRED the first time it returns', function () {
  ok(LV_fired('tick_lvGood@tick.server') === 'false' && LV_fired('tick_lvBad@tick.server') === 'false' && LV_fired('tick_lvPlayer@tick.player') === 'false',
    'three tick functions registered: armed, none fired')
  ok(LV_count(/^\[icraft\.live\] ARMED late x1: tick_lvGood@tick\.server$/) === 1, 'registered after the summary line: said once (ARMED late)')
  T_tick(1)
  ok(lv_ran.good === 1 && LV_fired('tick_lvGood@tick.server') === 'true', 'the one that returns is FIRED after one tick')
  ok(lv_ran.bad === 1 && LV_fired('tick_lvBad@tick.server') === 'false', 'the one that throws ran and is NOT fired')
  ok(lv_ran.player === 0 && LV_fired('tick_lvPlayer@tick.player') === 'false', 'a player tick function cannot fire with nobody online')
  ok(LV_count(/^\[icraft\.live\] FIRED tick\.server /) === 0, 'nothing is printed yet: the server collects FIRED lines for a second')
  T_tick(19)
  var line = LV_info(/^\[icraft\.live\] FIRED tick\.server x\d+: /)
  ok(line !== null && line.indexOf('tick_lvGood') > 0 && line.indexOf('tick_lvBad') < 0, 'then ONE line names what fired in that second (' + line + ')')
  ok(lv_ran.good === 20 && LV_count(/FIRED tick\.server [^\n]*tick_lvGood/) === 1, 'twenty runs, one FIRED line')
  ok(LV_fired('tick_icraftLive@tick.server') === 'true', 'the flush is a tick function like any other, and has fired')
})

var lv_p = T_newPlayer('Scanner')
T_run('liveness: a player tick function fires once a player is on, and the first login is said without a name', function () {
  T_tick(20)
  ok(lv_ran.player > 0 && LV_fired('tick_lvPlayer@tick.player') === 'true', 'the player tick function is FIRED')
  var who = LV_info(/^\[icraft\.live\] PLAYER first login/)
  ok(who !== null && who.indexOf('Scanner') < 0, 'a `[icraft.live] PLAYER first login` line, with no name in it (' + who + ')')
  var all = T_LOG.info.concat(T_LOG.warn, T_LOG.error)
  var named = 0
  for (var i = 0; i < all.length; i++) if (all[i].indexOf('[icraft.live]') >= 0 && all[i].indexOf('Scanner') >= 0) named++
  ok(named === 0, 'no [icraft.live] line carries the player name')
})

var lv_hurt = { open: 0, gated: 0, bad: 0 }
var lv_core = global.icraft.core
lv_core.onHurt('t.lv.open', function (event, ctx) { lv_hurt.open++ }, 'any')
lv_core.onHurt('t.lv.gated', function (event, ctx) { lv_hurt.gated++ }, 'any', function () { return false })
lv_core.onHurt('t.lv.bad', function (event, ctx) { lv_hurt.bad++; var u; u.foo() }, 'any')
lv_core.onHurtLate('t.lv.late', function (event, ctx) { }, 'attackerPlayer')

T_run('liveness: a hurt handler is ARMED when registered, FIRED the first time its function returns', function () {
  ok(LV_fired('t.lv.open@hurt') === 'false' && LV_fired('t.lv.gated@hurt') === 'false' && LV_fired('t.lv.bad@hurt') === 'false' && LV_fired('t.lv.late@hurt.late') === 'false',
    'four hurt handlers registered (one LATE): armed, none fired')
  var victim = T_mob('minecraft:zombie')
  T.fireHurt(victim, new MSource('minecraft:generic', null, null), 4)
  ok(lv_hurt.open === 1 && LV_fired('t.lv.open@hurt') === 'true', 'the one that returns is FIRED')
  ok(lv_hurt.gated === 0 && LV_fired('t.lv.gated@hurt') === 'false', 'one whose gate is closed did not run and is NOT fired')
  ok(lv_hurt.bad === 1 && LV_fired('t.lv.bad@hurt') === 'false', 'the one that throws ran and is NOT fired')
  ok(LV_fired('t.lv.late@hurt.late') === 'false', 'a handler for hits by a player does not fire on a hit nobody dealt')
  T.fireHurt(victim, new MSource('minecraft:player_attack', lv_p, lv_p), 4)
  ok(LV_fired('t.lv.late@hurt.late') === 'true', 'and fires on a hit by a player')
  T.fireHurt(victim, new MSource('minecraft:generic', null, null), 4)
  T_tick(20)
  ok(LV_count(/^\[icraft\.live\] FIRED hurt x\d+: [^\n]*t\.lv\.open/) === 1 && LV_count(/^\[icraft\.live\] FIRED hurt\.late x1: t\.lv\.late$/) === 1,
    'three hits, one FIRED line for each group')
})

// ---- icraft.handler: a function put straight on a Java registry ----
var lv_direct = { ran: 0, amount: -1 }
var LV_Registry = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
LV_Registry.register('t.lv.direct', icraft.handler('t_lv_direct', 'DamageModifierRegistry.register', function (event) {
  lv_direct.ran++
  lv_direct.amount = Number(event.getAmount())
}))

T_run('liveness: a handler put straight on a Java registry is ARMED by icraft.handler, FIRED the first time it returns', function () {
  ok(LV_fired('t_lv_direct@DamageModifierRegistry.register') === 'false', 'registered through icraft.handler: armed under <name>@<Registry.method>, not fired')
  ok(LV_count(/^\[icraft\.live\] ARMED late x1: t_lv_direct@DamageModifierRegistry\.register$/) === 1, 'and said once (it was registered after the summary line)')
  var victim = T_mob('minecraft:zombie')
  T.fireHurt(victim, new MSource('minecraft:generic', null, null), 6)
  ok(lv_direct.ran === 1 && lv_direct.amount === 6, 'the registry called it from Java with the event (ran ' + lv_direct.ran + ', amount ' + lv_direct.amount + ')')
  ok(LV_fired('t_lv_direct@DamageModifierRegistry.register') === 'true', 'and it is FIRED')
  T.fireHurt(victim, new MSource('minecraft:generic', null, null), 2)
  T_tick(20)
  ok(lv_direct.ran === 2 && LV_count(/FIRED DamageModifierRegistry\.register [^\n]*t_lv_direct/) === 1, 'two calls, one FIRED line')
  var add = icraft.handler('t_lv_ret', 'Test.call', function (a, b) { return a + b })
  ok(add(2, 3) === 5, 'the arguments and the return value pass through (a LootCategory predicate returns its answer)')
  var holder = { k: 7, read: icraft.handler('t_lv_this', 'Test.call', function () { return this.k }) }
  ok(holder.read() === 7, '`this` passes through')
  var thrower = icraft.handler('t_lv_throw', 'Test.call', function () { throw new Error('the handler\'s own error') })
  var caught = ''
  try { thrower() } catch (e) { caught = String(e) }
  ok(caught.indexOf('own error') >= 0, 'a throw passes through untouched: the registry\'s own catch reports it, as before (' + caught.slice(0, 50) + ')')
  ok(LV_fired('t_lv_throw@Test.call') === 'false', 'and a handler that threw is NOT fired')
  var errorsBefore = T_LOG.error.length
  ok(icraft.handler('t_lv_bad', 'Test.call', 5) === 5, 'something that is not a function is handed back as it is')
  ok(T_LOG.error.length === errorsBefore + 1 && /MISUSE: handler\(t_lv_bad, Test\.call/.test(String(T_LOG.error[T_LOG.error.length - 1])), 'with one MISUSE line')
})

T_run('liveness: a feature is FIRED where it did its work (the relic sink and its deny list)', function () {
  var r = icraft.live.report('')
  ok(r.features.fired.length === 0 && r.features.never.indexOf('relic-sink') >= 0 && r.features.never.indexOf('relic-sink-deny') >= 0 && r.features.known > 10,
    'before: no feature fired; the expected list names relic-sink and relic-sink-deny among ' + r.features.known + ' known')
  T.slot(lv_p, 3, new MStack('artifacts:night_vision_goggles', 2))
  T.slot(lv_p, 7, new MStack('artifacts:mimic_spawn_egg', 1))
  relicSubmit(lv_p, false)
  r = icraft.live.report('')
  ok(r.features.fired.join(',') === 'relic-sink-deny', 'a preview scanned a deny-listed item: relic-sink-deny fired, relic-sink did not (' + r.features.fired.join(',') + ')')
  relicSubmit(lv_p, true)
  r = icraft.live.report('')
  ok(r.features.fired.join(',') === 'relic-sink,relic-sink-deny', 'the confirm converted: relic-sink fired (' + r.features.fired.join(',') + ')')
  T_tick(20)
  ok(LV_count(/^\[icraft\.live\] FIRED feature x\d+: /) >= 1 && LV_count(/FIRED feature [^\n]*relic-sink-deny/) === 1, 'one FIRED feature line for it')
})

T_run('liveness: the report `/icraft live` prints, filtered by name and by script', function () {
  var byName = icraft.live.report('tick_lv')
  ok(byName.never.join(',') === 'tick_lvBad@tick.server', 'filter "tick_lv": the one tick function that never fired (' + byName.never.join(',') + ')')
  var byScript = icraft.live.report('economy/relic_sink.js')
  ok(byScript.never.join(',') === 'economy/relic_sink@ServerEvents.commandRegistry,economy/relic_sink@ServerEvents.tags' && byScript.features.fired.length === 2,
    'filter by script path: the registrations and the features of that script (' + byScript.never.join(',') + ' / ' + byScript.features.fired.join(',') + ')')
  var text = global.icraftLiveLines.server('relic')
  ok(/^server scripts: \d+ armed, \d+ fired, \d+ never fired, 0 FAILED; sections 0 of \d+ ran; features 2 of \d+ fired$/.test(text[0]), 'the first line counts (' + text[0] + ')')
  ok(text.join('\n').indexOf('fired, feature x2: relic-sink, relic-sink-deny') > 0, 'and the features that fired are listed')
})
