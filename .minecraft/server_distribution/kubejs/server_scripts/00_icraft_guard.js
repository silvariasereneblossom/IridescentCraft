// priority: 1000
// =============================================================================
// icraft.guard / icraft.section -- one script's error never ends an event for
// the scripts that load after it
// File: kubejs/server_scripts/00_icraft_guard.js, and the SAME file in
//       startup_scripts/ and client_scripts/ (each script type has its own
//       scope and gets its own guard). Change the three together.
// =============================================================================
// USE (every event registration; lint rule UNGUARDED-EVENT enforces it)
//
//   ServerEvents.recipes(icraft.guard('recipes/my_script', 'ServerEvents.recipes', event => {
//     ...
//   }))
//   ItemEvents.rightClicked('minecraft:stick', icraft.guard('items/my_script', 'ItemEvents.rightClicked', event => { ... }))
//
//     name    the script's path below its *_scripts folder, without .js. A
//             second handler of the SAME event in one file adds '#2', '#3'.
//     event   the registration it is passed to, as written.
//
//   and inside a long handler, around one block of rules:
//
//   icraft.section('loot/my_script/village-strips', function () {
//     ...
//   })
//
// WHAT IT DOES
//   KubeJS runs the handlers of an event as one chain and leaves the chain at
//   the first handler that throws (EventHandlerContainer.handle; ServerEvents,
//   EntityEvents, PlayerEvents, BlockEvents, ItemEvents, StartupEvents and
//   LootJS.modifiers have no exception handler). One loot script that threw
//   from June to October 2026 kept the twelve loot scripts after it from ever
//   registering. A guarded handler that throws prints ONE line
//
//     [icraft.guard] FAILED <name> in <event>: <message>
//
//   (once per name per script load; later failures are counted, see
//   icraft.guard.failures()) and returns, so the handlers after it run. The
//   boot-log checker (dev/loud/loud-check.ps1) turns that line RED.
//   A section does the same for one block inside a handler: the blocks after
//   it still run.
//
// WHAT IT MUST NOT DO: SWALLOW A CANCEL
//   event.cancel() / success() / exit() work by THROWING
//   dev.latvian.mods.kubejs.event.EventExit, and a script catch sees it (as an
//   error object named 'JavaException' whose javaException is the exit). Two
//   things measured on the production jars (rhino-forge 2001.2.3, kubejs-forge
//   2001.6.5), both of which would break every cancel in the pack:
//     * a catch that simply returns   -> nothing is cancelled;
//     * a catch that does `throw e`   -> KubeJS receives a JavaScriptException,
//       not an EventExit: the event ends as an ERROR and nothing is cancelled.
//   So the exit is recognised by its class and the ORIGINAL object is thrown
//   again from Java, outside any try: java.util.Optional.empty().orElseThrow(
//   supplier) throws exactly what the supplier returns, the engine wraps it the
//   way it wrapped the first throw, and KubeJS unwraps it to the same EventExit
//   (same type, same value). The mechanism is tried once when this file loads;
//   if it does not work on this engine the guard switches itself OFF (handlers
//   are registered as written, exactly the behaviour before this file existed)
//   and says so on an ERROR line. A guard that cannot pass a cancel on is worse
//   than no guard.
//
// WHAT IT CANNOT DO
//   * A java.lang.Error (the AbstractMethodError of 0_iss_guard.js) passes
//     through script catch AND finally blocks. Nothing here sees it: the
//     event still ends for the scripts after that handler, and KubeJS prints
//     its own `Error in '<event>'` line. 0_iss_guard.js is what covers that
//     class. (It also leaves the guard's note of "the handler running now"
//     behind: a section used OUTSIDE any guarded handler may then name that
//     handler's event. Inside a guarded handler the event is always right.)
//   * An exception thrown inside the script engine itself (not by a Java
//     method a script called: the Vec3 `.x` read, a failing type conversion)
//     skips every script catch but does run finally blocks. The guard leaves
//     through its finally block, so the event goes on, but there is no error
//     object: the line says so and carries no message. To see the exception,
//     set ISOLATE_UNCATCHABLE to false on a test instance and read KubeJS's own
//     `Error in '<event>'` line.
//
// `icraft` -- the one top-level name this file adds. It is this script type's
// own object whose prototype is global.icraft (the map `global` is ONE map for
// startup, server and client scripts: BuiltinKubeJSPlugin.GLOBAL), so
// icraft.core, icraft.origin, ... read through to the shared namespace while
// guard / section stay per script type and are not swapped under a running
// handler when another script type (re)loads.
//
// WHY IT LOADS FIRST (and a note on comment lines)
//   Every script calls icraft.guard while it loads, so this file must be first.
//   `// priority: 1000` on line 1 is what guarantees it (KubeJS sorts by
//   priority, and by nothing else: without one, files load in the order the
//   file system lists them). The 00_ name keeps it first on NTFS as well. It
//   registers no event, so 0_iss_guard.js stays the first EntityEvents.spawned
//   handler.
//   KubeJS reads EVERY comment line of a script that consists of two words as
//   a file property (`// ignored true` would switch the file off): keep such
//   lines out of this header.
// =============================================================================

var icraft = (function () {
  // true = the guard is off: guard() hands the handler back as written and
  // section() just calls its function. The one-line way back to the old behaviour.
  var PASS_THROUGH = false
  // false = an exception no script catch can see is left alone (KubeJS prints
  // `Error in '<event>'` with its text and the rest of the event is lost).
  var ISOLATE_UNCATCHABLE = true
  var MAX_MESSAGE = 600
  var UNCATCHABLE = 'an exception that no script catch can see (thrown inside the script engine, ' +
    'e.g. a Vec3 .x / .y / .z read); there is no error object, so no message'

  var say = function (level, message) {
    try {
      if (level === 'error') console.error(message)
      else console.log(message)
    } catch (ignored) { /* swallow-ok: the console is the only place a guard message can go */ }
  }

  var loadClass = function (name) {
    try { return Java.loadClass(name) } catch (e) {
      say('error', '[icraft.guard] Java.loadClass(' + name + ') failed: ' + e)
      return null
    }
  }
  var Optional = loadClass('java.util.Optional')
  var ExitClass = loadClass('dev.latvian.mods.kubejs.event.EventExit')

  // ---- KubeJS's own exits ---------------------------------------------------
  // The Java EventExit behind a caught error, or null. KubeJS unwraps nested
  // WrappedExceptions before it looks (EventHandlerContainer.handle); so does this.
  var exitOf = function (caught) {
    var j = null
    var hops = 0
    try {
      if (caught === null || typeof caught !== 'object') return null
      j = caught.javaException
      while (j !== null && j !== undefined && hops < 8 && typeof j.getWrappedException === 'function') {
        j = j.getWrappedException()
        hops++
      }
      if (j === null || j === undefined) return null
      if (ExitClass !== null) return (j instanceof ExitClass) ? j : null
      return String(j).indexOf('dev.latvian.mods.kubejs.event.EventExit') === 0 ? j : null
    } catch (e) {
      say('error', '[icraft.guard] could not classify a caught error (' + e + '); it is treated as a failure, not as a cancel')
      return null
    }
  }

  // Throws the Java object `thrown` again, from Java: never returns.
  var rethrow = function (thrown) {
    Optional.empty().orElseThrow(function () { return thrown })
  }

  // Is the mechanism real on this engine? An exception the JDK throws itself is
  // caught, thrown again through rethrow() and caught again: it must come back
  // as the same Java object, the way a cancel has to.
  var selfTest = function () {
    var first = null
    var second = null
    var probe = null
    var back = null
    if (Optional === null) return 'java.util.Optional could not be loaded'
    try { Optional.empty().orElseThrow() } catch (e) { first = e }
    if (first === null) return 'a Java exception did not reach a script catch'
    probe = first.javaException
    if (probe === null || probe === undefined) return 'a caught Java exception has no javaException'
    try { rethrow(probe) } catch (e2) { second = e2 }
    if (second === null) return 'Optional.orElseThrow(supplier) did not throw'
    back = second.javaException
    if (back === null || back === undefined) return 'the exception thrown again has no javaException'
    if (!(back === probe || back.equals(probe))) return 'the exception thrown again is not the same object'
    return ''
  }

  var armed = false
  var problem = ''
  if (!PASS_THROUGH) {
    try { problem = selfTest() } catch (e) { problem = 'the self-test threw: ' + e }
    armed = (problem === '')
  }

  // ---- reporting ------------------------------------------------------------
  var failed = {}        // '<name> in <event>' -> { name, event, count, first, last }
  var failedOrder = []
  var wrapped = 0        // handlers guarded since this file loaded

  var describe = function (e) {
    var text = ''
    var where = ''
    try { text = String(e) } catch (ignored) { text = '<an error that cannot be printed>' /* swallow-ok: String() of a broken Java object */ }
    try {
      if (e !== null && typeof e === 'object' && e.lineNumber > 0 && e.fileName) where = ' (' + e.fileName + '#' + e.lineNumber + ')'
    } catch (ignored2) { /* swallow-ok: the position is a bonus, the message is already there */ }
    text = text.replace(/\s+/g, ' ')
    if (text.length > MAX_MESSAGE) text = text.substring(0, MAX_MESSAGE) + '...'
    return text + where
  }

  var record = function (name, eventName, message) {
    var key = name + ' in ' + eventName
    var f = failed[key]
    if (f) {
      f.count++
      f.last = message
      return
    }
    failed[key] = { name: name, event: eventName, count: 1, first: message, last: message }
    failedOrder.push(key)
    say('error', '[icraft.guard] FAILED ' + name + ' in ' + eventName + ': ' + message +
      ' [the rest of the event still ran; logged once per script load, later failures are counted]')
  }

  // ---- guard ----------------------------------------------------------------
  var running = null     // the guard whose handler is running now (a section reports its event)

  var guard = function (name, eventName, handler) {
    if (typeof eventName === 'function' && handler === undefined) {
      handler = eventName
      eventName = '?'
    }
    if (typeof handler !== 'function') {
      say('error', '[icraft.guard] MISUSE: guard(' + name + ', ' + eventName + ', <' + (typeof handler) +
        '>) was not given a function; the value is registered as it is')
      return handler
    }
    if (!armed) return handler
    var entry = { name: String(name), event: String(eventName) }
    wrapped++
    return function (event) {
      var state = 0          // 0 = inside the handler, 1 = it returned, 2 = it threw something a catch sees
      var exit = null
      var outer = running
      running = entry
      try {
        handler(event)
        state = 1
      } catch (e) {
        state = 2
        exit = exitOf(e)
        if (exit === null) record(entry.name, entry.event, describe(e))
      } finally {
        running = outer
        // Still 0 here: something that skipped the catch is on its way out.
        // Returning from a finally block drops it (a java.lang.Error never
        // gets this far; it does not run finally blocks either).
        if (state === 0 && ISOLATE_UNCATCHABLE) {
          record(entry.name, entry.event, UNCATCHABLE)
          return
        }
      }
      // Outside every try: this is the cancel, on its way to KubeJS.
      if (exit !== null) rethrow(exit)
    }
  }

  // ---- section --------------------------------------------------------------
  var section = function (name, fn) {
    var state = 0
    var exit = null
    var eventName = running !== null ? running.event : '?'
    if (!armed) {
      fn()
      return
    }
    try {
      fn()
      state = 1
    } catch (e) {
      state = 2
      exit = exitOf(e)
      if (exit === null) record(String(name), eventName, describe(e))
    } finally {
      if (state === 0 && ISOLATE_UNCATCHABLE) {
        record(String(name), eventName, UNCATCHABLE)
        return
      }
    }
    if (exit !== null) rethrow(exit)
  }

  // ---- diagnostics ----------------------------------------------------------
  // [{ name, event, count, first, last }] in the order they first failed
  guard.failures = function () {
    var out = []
    for (var i = 0; i < failedOrder.length; i++) {
      var f = failed[failedOrder[i]]
      out.push({ name: f.name, event: f.event, count: f.count, first: f.first, last: f.last })
    }
    return out
  }
  // failures since this file loaded, all names together
  guard.failureCount = function () {
    var n = 0
    for (var i = 0; i < failedOrder.length; i++) n += failed[failedOrder[i]].count
    return n
  }
  guard.guarded = function () { return wrapped }
  guard.armed = function () { return armed }

  // ---- the name -------------------------------------------------------------
  var shared = null
  try {
    if (!global.icraft) global.icraft = {}
    shared = global.icraft
  } catch (e) {
    say('error', '[icraft.guard] global.icraft is not usable (' + e + '); icraft.guard / icraft.section still work')
  }
  var own = (shared !== null && (typeof shared === 'object' || typeof shared === 'function')) ? Object.create(shared) : {}
  own.guard = guard
  own.section = section

  if (armed) {
    // (this line must not contain the failure line's own prefix: a grep for it would count a healthy boot)
    say('log', '[icraft.guard] armed -- event handlers are isolated: a handler that throws is reported once ' +
      '(a line with FAILED, its name and its event) and the handlers after it still run; ' +
      'event.cancel() / success() / exit() pass through (self-test ok' +
      (ExitClass === null ? ', exits recognised by name' : '') + ')')
  } else if (PASS_THROUGH) {
    say('log', '[icraft.guard] OFF by its PASS_THROUGH switch -- handlers are registered as written, one throw ends an event for the scripts after it')
  } else {
    say('error', '[icraft.guard] OFF -- self-test failed (' + problem + '). Handlers are registered as written: ' +
      'cancels work as before, and one throwing handler ends its event for every script after it')
  }
  return own
})()
