// Cases for GuardChain.java (suite `event-guard`): kubejs/server_scripts/00_icraft_guard.js on KubeJS's real
// handler chain. The guard file is loaded before this one, in the same scope, as it is in game.
//
//   chain(name, expected outcome of handle(), [handlers], [console lines that must be there], [must not be there])
//
// `next` is a handler registered after the one under test: its line proves the chain went on.
// The patterns are java.util.regex, searched in the console lines printed while the chain ran.
var CASES = []
var chain = function (name, expect, handlers, logs, absent) {
  CASES.push({ name: name, expect: expect, logs: logs || [], absent: absent || [] })
  for (var i = 0; i < handlers.length; i++) listen(name, handlers[i])
}
var next = function (event) { console.log('NEXT handler ran') }
var NEXT = 'NEXT handler ran'
var FAILED = '\\[icraft\\.guard\\] FAILED'
var CANCEL = 'EXIT INTERRUPT_FALSE value=null'
var NO_MESSAGE = 'an exception that no script catch can see'
var ArrayList = Java.loadClass('java.util.ArrayList')
global.icraft.core = { marker: 'read through the prototype' }

// ---- the engine facts the guard is built on (no guard in these) ------------------------------------
chain('engine: an unguarded cancel() leaves the chain as a cancel', CANCEL,
  [function (event) { event.cancel() }, next], [], [NEXT])
chain('engine: a script catch SWALLOWS a cancel (it is a JavaException whose javaException is the EventExit)', 'PASS',
  [function (event) {
    try { event.cancel() } catch (e) { console.log('caught name=' + e.name + ' java=' + e.javaException) }
  }, next],
  ['caught name=JavaException java=dev\\.latvian\\.mods\\.kubejs\\.event\\.EventExit', NEXT])
chain('engine: a catch that does `throw e` turns the cancel into an ERROR (why the guard cannot simply rethrow)',
  'ERROR dev.latvian.mods.rhino.JavaScriptException',
  [function (event) { try { event.cancel() } catch (e) { throw e } }, next], [], [NEXT])
chain('engine: a try / finally lets the cancel through untouched', CANCEL,
  [function (event) { try { event.cancel() } finally { console.log('finally ran') } }, next], ['finally ran'], [NEXT])
chain('engine: an unguarded TypeError ends the event for the handlers after it', 'ERROR dev.latvian.mods.rhino.EcmaError',
  [function (event) { var u; u.foo() }, next], [], [NEXT])
chain('engine: a RuntimeException from inside the engine skips a script catch', 'ERROR java.lang.IllegalStateException',
  [function (event) { try { rawThrow('runtime') } catch (e) { console.log('CAUGHT ' + e) } }, next], [], ['CAUGHT', NEXT])
chain('engine: ... but it runs finally blocks, and a return in one drops it', 'PASS',
  [function (event) { try { rawThrow('runtime') } finally { console.log('finally ran'); return } }, next], ['finally ran', NEXT])
chain('engine: a java.lang.Error skips catch AND finally', 'ERROR java.lang.AbstractMethodError',
  [function (event) { try { rawThrow('error') } catch (e) { console.log('CAUGHT') } finally { console.log('finally ran') } }, next],
  [], ['CAUGHT', 'finally ran', NEXT])

// ---- the guard file itself -------------------------------------------------------------------------
chain('guard: it armed when it loaded, and `icraft` is a view of global.icraft with its own guard / section', 'PASS',
  [function (event) {
    console.log('load: ' + LOAD_LOG)
    console.log('armed=' + icraft.guard.armed() + ' core=' + icraft.core.marker + ' own=' + (typeof icraft.guard) + '/' + (typeof icraft.section) +
      ' shared=' + (typeof global.icraft.guard))
  }],
  ['load: log: \\[icraft\\.guard\\] armed .*self-test ok', 'armed=true core=read through the prototype own=function/function shared=undefined'],
  ['error: '])

// ---- KubeJS's own exits pass through ---------------------------------------------------------------
chain('exit: a guarded cancel() still cancels', CANCEL,
  [icraft.guard('t/p1', 'Test.event', function (event) { event.cancel() }), next], [], [NEXT, FAILED])
chain('exit: a guarded success(value) keeps its type and its value', 'EXIT INTERRUPT_TRUE value=val',
  [icraft.guard('t/p2', 'Test.event', function (event) { event.success('val') }), next], [], [NEXT, FAILED])
chain('exit: a guarded exit()', 'EXIT INTERRUPT_DEFAULT value=null',
  [icraft.guard('t/p3', 'Test.event', function (event) { event.exit() }), next], [], [NEXT, FAILED])
chain('exit: a cancel inside a Java forEach callback', CANCEL,
  [icraft.guard('t/p4', 'Test.event', function (event) {
    var l = new ArrayList(); l.add('a'); l.forEach(function (x) { event.cancel() })
  }), next], [], [NEXT, FAILED])
chain('exit: a cancel from a nested script function', CANCEL,
  [icraft.guard('t/p5', 'Test.event', function (event) { var inner = function () { event.cancel() }; inner() }), next], [], [NEXT, FAILED])
chain('exit: a cancel after other work (the work is done, then the event is cancelled)', CANCEL,
  [icraft.guard('t/p6', 'Test.event', function (event) { console.log('work before the cancel'); event.cancel() }), next],
  ['work before the cancel'], [NEXT, FAILED])
chain('exit: the second of two guarded handlers cancels', CANCEL,
  [icraft.guard('t/p7', 'Test.event', function (event) { console.log('first ran') }),
   icraft.guard('t/p7#2', 'Test.event', function (event) { event.cancel() }), next],
  ['first ran'], [NEXT, FAILED])
chain('exit: an arrow handler that cancels', CANCEL,
  [icraft.guard('t/p8', 'Test.event', event => { event.cancel() }), next], [], [NEXT, FAILED])

// ---- a throw is reported once and the chain goes on ------------------------------------------------
chain('throw: a TypeError is reported with its position, the next handler runs', 'PASS',
  [icraft.guard('t/q1', 'Test.event', function (event) { var u; u.foo() }), next],
  ['error: ' + FAILED + ' t/q1 in Test\\.event: TypeError: Cannot call method "foo" of undefined \\(cases\\.js#\\d+\\)', NEXT])
chain('throw: `throw new Error`', 'PASS',
  [icraft.guard('t/q2', 'Test.event', function (event) { throw new Error('boom') }), next], [FAILED + ' t/q2 in Test\\.event: Error: boom', NEXT])
chain('throw: a thrown string', 'PASS',
  [icraft.guard('t/q3', 'Test.event', function (event) { throw 'plain string' }), next], [FAILED + ' t/q3 in Test\\.event: plain string', NEXT])
chain('throw: a NullPointerException from a Java method', 'PASS',
  [icraft.guard('t/q4', 'Test.event', function (event) { thrower.npe() }), next],
  [FAILED + ' t/q4 in Test\\.event: JavaException: java\\.lang\\.NullPointerException', NEXT])
chain('throw: a checked exception from a Java method', 'PASS',
  [icraft.guard('t/q5', 'Test.event', function (event) { thrower.checked() }), next],
  [FAILED + ' t/q5 in Test\\.event: JavaException: java\\.io\\.IOException: a checked exception', NEXT])
chain('throw: the same name fails three times: ONE line', 'PASS',
  [icraft.guard('t/q8', 'Test.event', function (event) { var u; u.a() }),
   icraft.guard('t/q8', 'Test.event', function (event) { var u; u.b() }),
   icraft.guard('t/q8', 'Test.event', function (event) { var u; u.c() }), next],
  [FAILED + ' t/q8 in Test\\.event', NEXT], ['(?s)FAILED t/q8 .*FAILED t/q8 '])
chain('throw: a handler fails, the NEXT handler cancels: the event is cancelled', CANCEL,
  [icraft.guard('t/q9', 'Test.event', function (event) { var u; u.foo() }),
   icraft.guard('t/q9#2', 'Test.event', function (event) { event.cancel() }), next],
  [FAILED + ' t/q9 in Test\\.event: TypeError'], [NEXT, 'FAILED t/q9#2'])

// ---- an exception from inside the engine (no script catch sees it): isolated, WITH a line ----------
chain('engine-level: isolated, and it prints a FAILED line that says there is no message', 'PASS',
  [icraft.guard('t/e1', 'Test.event', function (event) { rawThrow('runtime') }), next],
  ['error: ' + FAILED + ' t/e1 in Test\\.event: ' + NO_MESSAGE, NEXT])
chain('engine-level: it happens after other work: the work is done, the line is printed, the chain goes on', 'PASS',
  [icraft.guard('t/e2', 'Test.event', function (event) { console.log('work before the engine-level throw'); rawThrow('runtime') }), next],
  ['work before the engine-level throw', FAILED + ' t/e2 in Test\\.event: ' + NO_MESSAGE, NEXT])
chain('engine-level: it never masks an exit: the handler AFTER it cancels and the event is cancelled', CANCEL,
  [icraft.guard('t/e3', 'Test.event', function (event) { rawThrow('runtime') }),
   icraft.guard('t/e3#2', 'Test.event', function (event) { event.cancel() }), next],
  [FAILED + ' t/e3 in Test\\.event: ' + NO_MESSAGE], [NEXT, 'FAILED t/e3#2'])
chain('engine-level: ... and a success(value) after it keeps its value', 'EXIT INTERRUPT_TRUE value=kept',
  [icraft.guard('t/e4', 'Test.event', function (event) { rawThrow('runtime') }),
   icraft.guard('t/e4#2', 'Test.event', function (event) { event.success('kept') }), next],
  [FAILED + ' t/e4 in Test\\.event: ' + NO_MESSAGE], [NEXT])
chain('engine-level: inside a section, then the SAME handler cancels: the event is cancelled', CANCEL,
  [icraft.guard('t/e5', 'Test.event', function (event) {
    icraft.section('t/e5/first', function () { rawThrow('runtime') })
    console.log('the handler went on after the section')
    event.cancel()
  }), next],
  [FAILED + ' t/e5/first in Test\\.event: ' + NO_MESSAGE, 'the handler went on after the section'], [NEXT, 'FAILED t/e5 in'])
chain('engine-level: a handler that cancels is NOT taken for one (no line, the cancel stands)', CANCEL,
  [icraft.guard('t/e6', 'Test.event', function (event) { console.log('about to cancel'); event.cancel() }), next],
  ['about to cancel'], [NEXT, FAILED])
// ---- the wrapper is otherwise invisible ------------------------------------------------------------
chain('wrapper: the handler is called once, with the event as its only argument', 'PASS',
  [icraft.guard('t/r1', 'Test.event', function (event) { console.log('args=' + arguments.length + ' id=' + event.id) }), next],
  ['args=1 id=wrapper: the handler is called once', NEXT], ['(?s)args=1.*args=1'])
var declared = function (event) { console.log('declared handler ran') }
chain('wrapper: a handler passed by name', 'PASS',
  [icraft.guard('t/r2', 'Test.event', declared), next], ['declared handler ran', NEXT])
chain('wrapper: the two-argument form guard(name, handler) still guards (event shown as ?)', 'PASS',
  [icraft.guard('t/r3', function (event) { var u; u.foo() }), next], [FAILED + ' t/r3 in \\?: TypeError', NEXT])
chain('wrapper: guard() given something that is not a function hands it back and says so', 'PASS',
  [function (event) { console.log('got back ' + icraft.guard('t/r4', 'Test.event', 42)) }, next],
  ['error: \\[icraft\\.guard\\] MISUSE: guard\\(t/r4, Test\\.event, <number>\\)', 'got back 42', NEXT])

// ---- sections ----------------------------------------------------------------------------------------
chain('section: one fails, the sections after it run and the handler finishes', 'PASS',
  [icraft.guard('t/s1', 'Test.event', function (event) {
    icraft.section('t/s1/first', function () { console.log('section first ran') })
    icraft.section('t/s1/second', function () { var u; u.foo() })
    icraft.section('t/s1/third', function () { console.log('section third ran') })
    console.log('handler tail ran')
  }), next],
  ['section first ran', FAILED + ' t/s1/second in Test\\.event: TypeError', 'section third ran', 'handler tail ran', NEXT], ['FAILED t/s1 in'])
chain('section: a cancel inside a section cancels the event (nothing after it runs)', CANCEL,
  [icraft.guard('t/s2', 'Test.event', function (event) {
    icraft.section('t/s2/first', function () { event.cancel() })
    console.log('MUST NOT PRINT')
  }), next], [], ['MUST NOT PRINT', NEXT, FAILED])
chain('section: it reads the handler\'s variables and keeps its own', 'PASS',
  [icraft.guard('t/s4', 'Test.event', function (event) {
    const LIST = ['a', 'b']
    var total = 0
    icraft.section('t/s4/first', function () { const mine = LIST.length; total += mine })
    icraft.section('t/s4/second', function () { const mine = 40; total += mine })
    console.log('total=' + total)
  }), next], ['total=42', NEXT], [FAILED])
chain('section: used outside any guarded handler it still isolates (event shown as ?)', 'PASS',
  [function (event) { icraft.section('t/s5/alone', function () { var u; u.foo() }); console.log('went on') }, next],
  [FAILED + ' t/s5/alone in \\?: TypeError', 'went on', NEXT])

// ---- the limit (kept last: an Error skips the wrapper's finally block too, so the guard's note of "the handler
// running now" stays behind, and a section used OUTSIDE any guarded handler would then name that event) ----
chain('LIMIT: a java.lang.Error is NOT isolated (it skips finally too; 0_iss_guard.js covers that class)', 'ERROR java.lang.AbstractMethodError',
  [icraft.guard('t/e7', 'Test.event', function (event) { rawThrow('error') }), next], [], [NEXT, FAILED])

// ---- the running count -----------------------------------------------------------------------------
chain('count: icraft.guard.failures() lists every name once, with how often it failed', 'PASS',
  [function (event) {
    var f = icraft.guard.failures()
    for (var i = 0; i < f.length; i++) console.log('failure ' + f[i].name + ' in ' + f[i].event + ' x' + f[i].count)
    console.log('names=' + f.length + ' failures=' + icraft.guard.failureCount() + ' guarded=' + icraft.guard.guarded())
  }],
  ['failure t/q1 in Test\\.event x1', 'failure t/q8 in Test\\.event x3', 'failure t/e1 in Test\\.event x1', 'failure t/s1/second in Test\\.event x1',
   'failure t/r3 in \\? x1', 'names=15 failures=17 guarded=\\d+'])
