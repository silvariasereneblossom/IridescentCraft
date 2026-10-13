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

// ---- liveness: ARMED and FIRED (icraft.live) --------------------------------------------------------
// Declared after the count case on purpose: the failures planted here must not move its numbers.
var LIVE = '\\[icraft\\.live\\] '
var liveEntry = function (id) {
  var all = icraft.live.entries()
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]
  return null
}
var liveShow = function (id) {
  var e = liveEntry(id)
  console.log('entry ' + id + ': ' + (e === null ? 'NOT ARMED' : 'armed fired=' + e.fired + ' times=' + e.times))
}
var l1 = icraft.guard('t/l1', 'Test.live', function (event) { console.log('l1 ran') })
chain('live: a registration is ARMED when guard() is called, before its handler ever runs', 'PASS',
  [function (event) { liveShow('t/l1@Test.live'); liveShow('t/never-registered@Test.live') }],
  ['entry t/l1@Test\\.live: armed fired=false times=1', 'entry t/never-registered@Test\\.live: NOT ARMED'], [LIVE + 'FIRED'])
chain('live: FIRED is recorded the first time a handler finishes, and ONCE (it runs three times: one line)', 'PASS',
  [function (event) { l1(event); l1(event); l1(event); liveShow('t/l1@Test.live') }],
  ['log: ' + LIVE + 'FIRED Test\\.live x1: t/l1(\\n|$)', 'entry t/l1@Test\\.live: armed fired=true times=1'],
  ['(?s)FIRED Test\\.live x1: t/l1.*FIRED Test\\.live x1: t/l1'])
chain('live: a handler that throws is FAILED and NOT fired', 'PASS',
  [icraft.guard('t/l2', 'Test.event', function (event) { var u; u.foo() }),
   function (event) { liveShow('t/l2@Test.event') }],
  [FAILED + ' t/l2 in Test\\.event: TypeError', 'entry t/l2@Test\\.event: armed fired=false'], [LIVE + 'FIRED [^\\n]*t/l2'])
chain('live: an exit counts as fired: a handler that cancels has done its work (and the cancel stands)', CANCEL,
  [icraft.guard('t/l3', 'Test.event', function (event) { event.cancel() }), next],
  [LIVE + 'FIRED Test\\.event x1: t/l3(\\n|$)'], [NEXT, FAILED])
chain('live: ... and so does success(value), which keeps its value', 'EXIT INTERRUPT_TRUE value=kept',
  [icraft.guard('t/l4', 'Test.event', function (event) { event.success('kept') }), next],
  [LIVE + 'FIRED Test\\.event x1: t/l4(\\n|$)'], [NEXT, FAILED])
chain('live: an engine-level throw is FAILED and NOT fired', 'PASS',
  [icraft.guard('t/l5', 'Test.event', function (event) { rawThrow('runtime') }),
   function (event) { liveShow('t/l5@Test.event') }],
  [FAILED + ' t/l5 in Test\\.event: ' + NO_MESSAGE, 'entry t/l5@Test\\.event: armed fired=false'], [LIVE + 'FIRED [^\\n]*t/l5'])
var l6calls = 0
var l6 = icraft.guard('t/l6', 'Test.live', function (event) { l6calls++; if (l6calls === 1) { var u; u.foo() } })
chain('live: a handler that failed once is FIRED the first time it does finish', 'PASS',
  [function (event) { l6(event); liveShow('t/l6@Test.live'); l6(event); liveShow('t/l6@Test.live') }],
  ['(?s)FAILED t/l6 in Test\\.live.*entry t/l6@Test\\.live: armed fired=false.*FIRED Test\\.live x1: t/l6\\n.*entry t/l6@Test\\.live: armed fired=true'])
chain('live: the same id registered twice is ONE entry (times=2), fired once', 'PASS',
  [icraft.guard('t/l7', 'Test.event', function (event) { }), icraft.guard('t/l7', 'Test.event', function (event) { }),
   function (event) { liveShow('t/l7@Test.event') }],
  ['entry t/l7@Test\\.event: armed fired=true times=2'], ['(?s)FIRED Test\\.event x1: t/l7.*FIRED Test\\.event x1: t/l7'])
chain('live: a feature is one line however often it is reported; its name is all that is printed', 'PASS',
  [function (event) {
    icraft.live.fired('feat-a'); icraft.live.fired('feat-a'); icraft.live.fired('feat-b'); icraft.live.fired('feat-a')
  }],
  ['log: ' + LIVE + 'FIRED feature x1: feat-a(\\n|$)', 'log: ' + LIVE + 'FIRED feature x1: feat-b(\\n|$)'],
  ['(?s)FIRED feature x1: feat-a.*FIRED feature x1: feat-a'])
chain('live: arm() / fire() for a dispatcher of its own (the tick master, the hurt dispatcher)', 'PASS',
  [function (event) {
    var e = icraft.live.arm('tick_demo', 'tick.server')
    console.log('before fired=' + e.fired + ' id=' + e.id)
    icraft.live.fire(e); icraft.live.fire(e)
    console.log('after fired=' + e.fired)
    icraft.live.fire(null)
  }],
  ['before fired=false id=tick_demo@tick\\.server', 'log: ' + LIVE + 'FIRED tick\\.server x1: tick_demo(\\n|$)', 'after fired=true'],
  ['(?s)FIRED tick\\.server x1: tick_demo.*FIRED tick\\.server', 'error: '])
chain('live: batched, nothing is printed until flush(), then one line per group in the order they fired', 'PASS',
  [function (event) {
    icraft.live.batch(true)
    icraft.live.fire(icraft.live.arm('t/b1', 'Test.batch')); icraft.live.fired('feat-c'); icraft.live.fire(icraft.live.arm('t/b2', 'Test.batch'))
    console.log('-- before the flush')
    icraft.live.flush()
    console.log('-- after the flush')
    icraft.live.flush()
    icraft.live.batch(false)
  }],
  ['(?s)-- before the flush\\nlog: ' + LIVE + 'FIRED Test\\.batch x2: t/b1, t/b2\\nlog: ' + LIVE + 'FIRED feature x1: feat-c\\nlog: -- after the flush$'],
  ['(?s)FIRED.*-- before the flush'])
chain('live: a long list is cut into lines of 24 names', 'PASS',
  [function (event) {
    icraft.live.batch(true)
    for (var i = 0; i < 50; i++) icraft.live.fire(icraft.live.arm('t/many' + i, 'Test.many'))
    icraft.live.flush()
    icraft.live.batch(false)
  }],
  ['FIRED Test\\.many x24: t/many0, t/many1, ', 'FIRED Test\\.many x24: t/many24, ', 'FIRED Test\\.many x2: t/many48, t/many49$'])
chain('live: the digest is the one dev/loud/gen_liveness.js computes (same arithmetic, same digits)', 'PASS',
  [function (event) {
    console.log('digest ' + icraft.live.digest(['a@b', 'c@d']) + ' ' + icraft.live.digest([]) + ' ' +
      icraft.live.digest(['recipes/some_long_script_name#2@ServerEvents.recipes', 'tick_x@tick.server']))
  }],
  ['digest 4bb5bea31c9d1cde 000000070000000b 0e52707c4414a4e7$'])
// ---- libraries (icraft.lib): who announced itself, who was asked for and is not there ----------------
var LIB = '\\[icraft\\.lib\\] '
chain('lib: a library that announced itself is there: need() and has() are true, and nothing is printed', 'PASS',
  [function (event) {
    icraft.lib.announce('lib-a'); icraft.lib.announce('lib-b'); icraft.lib.announce('lib-a')
    console.log('need=' + icraft.lib.need('lib-a', 't/consumer') + ' has=' + icraft.lib.has('lib-a') + ' names=' + icraft.lib.names().join('|'))
  }],
  ['need=true has=true names=lib-a\\|lib-b$'], [LIB, 'error: '])
chain('lib: a missing library is ONE error line that names the first script that asked; the next one is counted', 'PASS',
  [function (event) {
    console.log('first=' + icraft.lib.need('lib-gone', 't/first') + ' second=' + icraft.lib.need('lib-gone', 't/second') + ' has=' + icraft.lib.has('lib-gone'))
    var m = icraft.lib.missing()
    console.log('missing=' + m.length + ' name=' + m[0].name + ' count=' + m[0].count + ' first=' + m[0].first)
  }],
  ['error: ' + LIB + 'MISSING lib-gone: t/first needs this library and it has not announced itself', 'first=false second=false has=false',
   'missing=1 name=lib-gone count=2 first=t/first$'],
  ['(?s)MISSING lib-gone.*MISSING lib-gone', 't/second needs'])
var s9 = icraft.guard('t/s9', 'Test.sect', function (event) {
  icraft.section('t/s9/first', function () { console.log('s9 first ran') })
  icraft.section('t/s9/second', function () { var u; u.foo() })
})
chain('live: the summary line, NOT ARMED (an ERROR line) and UNLISTED against an expected list; the libraries against theirs', 'PASS',
  [function (event) {
    var listed = {}
    var all = icraft.live.entries()
    for (var i = 0; i < all.length; i++) listed[all[i].id] = 'cases.js'
    delete listed['t/l1@Test.live']
    listed['t/ghost@Test.event'] = 'ghost.js'
    listed['t/opt@Test.event'] = 'opt.js'
    var r = icraft.live.loaded('test', { armed: listed, optional: ['t/opt@Test.event'],
      sections: { 't/s9@Test.sect': ['t/s9/first', 't/s9/second', 't/s9/third'] }, features: { 'feat-a': 'cases.js', 'feat-z': 'cases.js' },
      libraries: { 'lib-a': 'a.js', 'lib-never': 'never.js' } })
    console.log('returned missing=' + r.missing.join('|') + ' unlisted=' + r.unlisted.join('|') + ' armed=' + r.armed)
    console.log('returned libraries=' + r.libraries.join('|') + ' not loaded=' + r.librariesMissing.join('|'))
  }],
  ['log: ' + LIVE + 'ARMED test: \\d+ registrations \\(\\d+ handlers on \\d+ events, 1 tick functions, 0 hurt handlers\\), digest [0-9a-f]{16}; against the expected list: 1 not armed, 1 unlisted(\\n|$)',
   'error: ' + LIVE + 'NOT ARMED x1: t/ghost@Test\\.event(\\n|$)', 'log: ' + LIVE + 'UNLISTED x1: t/l1@Test\\.live(\\n|$)',
   'returned missing=t/ghost@Test\\.event unlisted=t/l1@Test\\.live armed=\\d+',
   'log: ' + LIB + 'test: 2 libraries announced \\(lib-a, lib-b\\); against the expected list: 1 not loaded(\\n|$)',
   'error: ' + LIB + 'NOT LOADED x1: lib-never \\(never\\.js\\)(\\n|$)',
   'returned libraries=lib-a\\|lib-b not loaded=lib-never \\(never\\.js\\)$'],
  ['NOT ARMED[^\\n]*t/opt', 'warn: ', 'NOT LOADED[^\\n]*lib-a'])
chain('live: a handler finished and sections of it did not: one NOT RUN line (the failed one and the one never reached)', 'PASS',
  [function (event) { s9(event); s9(event) }],
  ['s9 first ran', FAILED + ' t/s9/second in Test\\.sect', 'log: ' + LIVE + 'NOT RUN section \\(2 of 3 in t/s9@Test\\.sect did not finish although the handler did\\) x2: t/s9/second, t/s9/third(\\n|$)'],
  ['(?s)NOT RUN section.*NOT RUN section'])
chain('lib: a library that announces itself after the summary line is said (ANNOUNCED late)', 'PASS',
  [function (event) { icraft.lib.announce('lib-late'); icraft.lib.announce('lib-late') }],
  ['log: ' + LIB + 'ANNOUNCED late x1: lib-late$'], ['(?s)ANNOUNCED late.*ANNOUNCED late'])
chain('live: a registration made after the summary line is said (ARMED late)', 'PASS',
  [function (event) { icraft.guard('t/late', 'Test.event', function (e) { }) }],
  ['log: ' + LIVE + 'ARMED late x1: t/late@Test\\.event$'])
chain('live: report() / lines(): what `/icraft live` shows, with and without a filter', 'PASS',
  [function (event) {
    var r = icraft.live.report('')
    console.log('report type=' + r.type + ' compared=' + r.compared + ' neverHasL2=' + (r.never.indexOf('t/l2@Test.event') >= 0) +
      ' neverHasL1=' + (r.never.indexOf('t/l1@Test.live') >= 0) + ' sections=' + r.sections.ran + '/' + r.sections.known + ' notRun=' + r.sections.notRun.join('|') +
      ' featNever=' + r.features.never.join('|') + ' featKnown=' + r.features.known)
    var f = icraft.live.report('t/l5')
    console.log('filtered never=' + f.never.join('|') + ' of ' + f.neverTotal)
    var byScript = icraft.live.report('ghost.js')
    console.log('by script never=' + byScript.never.length)
    var text = icraft.live.lines('t/l')
    for (var i = 0; i < text.length; i++) console.log('L| ' + text[i])
  }],
  ['report type=test compared=true neverHasL2=true neverHasL1=false sections=\\d+/3 notRun=t/s9/second\\|t/s9/third featNever=feat-z featKnown=2',
   'filtered never=t/l5@Test\\.event of \\d+', 'by script never=0',
   'L\\| test scripts: \\d+ armed, \\d+ fired, \\d+ never fired, \\d+ FAILED; sections \\d+ of 3 ran; features \\d+ of 2 fired(\\n|$)',
   'L\\|   filter "t/l": 3 of the \\d+ never-fired registrations(\\n|$)', 'L\\|   never fired, Test\\.event x3: t/l2, t/l5, t/late(\\n|$)'],
  ['error: '])
