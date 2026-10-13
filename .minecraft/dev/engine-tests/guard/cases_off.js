// Cases for GuardChain.java when the guard is OFF: run once with `--deny java.util.Optional` (the class its
// rethrow needs cannot be loaded, so its self-test fails) and once with `--pass-through` (its own switch).
// Either way the pack must behave exactly as it did before the guard existed: handlers registered as
// written, cancels working, one throw ending the event. And it must SAY that it is off.
var CASES = []
var chain = function (name, expect, handlers, logs, absent) {
  CASES.push({ name: name, expect: expect, logs: logs || [], absent: absent || [] })
  for (var i = 0; i < handlers.length; i++) listen(name, handlers[i])
}
var next = function (event) { console.log('NEXT handler ran') }
var NEXT = 'NEXT handler ran'
var FAILED = '\\[icraft\\.guard\\] FAILED'
var plain = function (event) { console.log('plain handler ran') }

chain('off: the guard says so when it loads (an ERROR line for a failed self-test, a plain line for the switch)', 'PASS',
  [function (event) { console.log('load: ' + LOAD_LOG); console.log('armed=' + icraft.guard.armed()) }],
  [MODE === 'pass-through' ? 'log: \\[icraft\\.guard\\] OFF by its PASS_THROUGH switch' : 'error: \\[icraft\\.guard\\] OFF -- self-test failed \\(java\\.util\\.Optional could not be loaded\\)',
   'armed=false'],
  ['\\[icraft\\.guard\\] armed'])
chain('off: guard() hands back the very function it was given', 'PASS',
  [function (event) { console.log('same function: ' + (icraft.guard('t/o1', 'Test.event', plain) === plain)) }], ['same function: true'])
chain('off: a cancel works as written', 'EXIT INTERRUPT_FALSE value=null',
  [icraft.guard('t/o2', 'Test.event', function (event) { event.cancel() }), next], [], [NEXT, FAILED])
chain('off: a throw ends the event, as before the guard (KubeJS logs it)', 'ERROR dev.latvian.mods.rhino.EcmaError',
  [icraft.guard('t/o3', 'Test.event', function (event) { var u; u.foo() }), next], [], [NEXT, FAILED])
chain('off: a section just runs its function (a throw in it ends the event)', 'ERROR dev.latvian.mods.rhino.EcmaError',
  [icraft.guard('t/o4', 'Test.event', function (event) {
    icraft.section('t/o4/first', function () { console.log('section ran') })
    icraft.section('t/o4/second', function () { var u; u.foo() })
    console.log('MUST NOT PRINT')
  }), next], ['section ran'], ['MUST NOT PRINT', NEXT, FAILED])
chain('off: a registration is still ARMED (it is made either way); FIRED is not recorded, and the summary says so', 'PASS',
  [function (event) {
    var all = icraft.live.entries()
    var mine = null
    for (var i = 0; i < all.length; i++) if (all[i].id === 't/o2@Test.event') mine = all[i]
    console.log('o2 ' + (mine === null ? 'NOT ARMED' : 'armed fired=' + mine.fired))
    icraft.live.loaded('test', null)
  }],
  ['o2 armed fired=false', '\\[icraft\\.live\\] ARMED test: \\d+ registrations .*NOT compared with an expected list \\[the guard is OFF: FIRED is not recorded for event handlers\\]'],
  ['\\[icraft\\.live\\] FIRED Test'])
