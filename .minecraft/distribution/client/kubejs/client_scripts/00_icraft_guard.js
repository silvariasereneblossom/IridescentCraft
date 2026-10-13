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
//   a handler that goes straight onto one of the mod's Java registries (they are
//   not KubeJS events: ItemAttributeRegistry, ForgeEventRegistry, the damage
//   registry, Apotheosis's LootCategory) gets its liveness id the same way:
//
//   ForgeEventRegistry.registerKnockBack('icraft.my_key', icraft.handler('my_script', 'ForgeEventRegistry.registerKnockBack', function (event) {
//     ...
//   }))
//
//     name    as for guard
//     group   '<RegistryClass>.<method>' it is passed to (lint rule GUARD-SHAPE)
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
// LIVENESS: WHAT IS ARMED, WHAT HAS FIRED (icraft.live)
//   A script that LOADED has proved nothing: about thirty features of this
//   pack never ran while every check said the scripts were fine. So the guard
//   also keeps, for this script type and since this file loaded:
//     ARMED  every registration: each guard() call, each handler() call, each
//            tick function of 0_tick_master.js, each hurt handler of
//            0_lib_core.js;
//     FIRED  the FIRST time each of them ran to its end (a handler that leaves
//            through event.cancel() has done its work: that counts; one that
//            throws is FAILED and does not). After that first time the cost
//            on the hot path is one boolean read.
//   An id is '<name>@<group>'. The group of a guarded handler is its event;
//   of a registry handler the registry method ('ItemAttributeRegistry.register');
//   of a tick function 'tick.server' / 'tick.player'; of a hurt handler 'hurt'
//   / 'hurt.late'. Sections are only ever FIRED, and so are FEATURES:
//
//     icraft.live.fired('codex-submit')
//
//   goes where "the handler ran" does not mean "the feature worked" (inside
//   the branch that did the work). One line per name per script load; a short
//   curated list, not every branch. Never put a player's name in a name: the
//   lines go to the logs, and the logs are mirrored.
//
//   What is printed (dev/loud/loud-check.ps1 and the in-game check sheet read
//   these lines; dev/loud/gen_liveness.js generates what they are held to):
//     [icraft.live] ARMED <type>: <n> registrations (...), digest <16 hex>; ...
//         once per script load, from zzz_icraft_live.js (it loads last). The
//         expected ids come from kubejs/config/icraft/live/expected.json:
//     [icraft.live] NOT ARMED x<n>: <id>, <id>      (an ERROR line)
//     [icraft.live] UNLISTED x<n>: <id>, <id>       (armed, not in the list)
//     [icraft.live] FIRED <group> x<n>: <name>, <name>
//         as it happens; on the server the lines of one second share a line.
//     [icraft.live] NOT RUN section (...) x<n>: <name>, <name>
//         a handler finished and sections of it never did.
//   Nothing else is printed: 250 registrations are one line, not 250.
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

  // ---- liveness: ARMED and FIRED ---------------------------------------------
  var LINE_NAMES = 24      // names on one FIRED / NOT ARMED / UNLISTED line
  var EXPECTED_FILE = 'kubejs/config/icraft/live/expected.json'
  var live = []            // ARMED, in registration order: { name, group, id, fired, times }
  var liveById = {}
  var liveFired = 0
  var sectionsRan = {}     // section name -> true
  var sectionCount = 0
  var featuresRan = {}     // feature name -> true
  var featureCount = 0
  var queue = []           // FIRED and not printed yet: { name, group }
  var batching = false     // true = something flushes on a tick; false = a FIRED line is printed at once
  var scriptType = '?'     // 'server' | 'startup' | 'client', said by zzz_icraft_live.js
  var expected = null      // this script type's part of EXPECTED_FILE, or null
  var summarised = false

  // -> the entry of this registration (the same one when the id is registered again)
  var arm = function (name, group) {
    var id = String(name) + '@' + String(group)
    var e = liveById[id]
    if (e) {
      e.times++
      return e
    }
    e = { name: String(name), group: String(group), id: id, fired: false, times: 1 }
    liveById[id] = e
    live.push(e)
    // after the summary line: a registration made inside a handler. Said, so that no id is armed unseen.
    if (summarised) say('log', '[icraft.live] ARMED late x1: ' + id)
    return e
  }

  var printNames = function (level, head, names) {
    for (var from = 0; from < names.length; from += LINE_NAMES) {
      var part = names.slice(from, from + LINE_NAMES)
      say(level, head + ' x' + part.length + ': ' + part.join(', '))
    }
  }

  // Prints what fired since the last call, one line per group.
  var flush = function () {
    var groups = {}
    var order = []
    var pending = queue
    var i = 0
    if (pending.length === 0) return
    queue = []
    try {
      for (i = 0; i < pending.length; i++) {
        if (!groups[pending[i].group]) {
          groups[pending[i].group] = []
          order.push(pending[i].group)
        }
        groups[pending[i].group].push(pending[i].name)
      }
      for (i = 0; i < order.length; i++) printNames('log', '[icraft.live] FIRED ' + order[i], groups[order[i]])
    } catch (e) {
      say('error', '[icraft.live] could not print ' + pending.length + ' FIRED name(s): ' + e)
    }
  }

  // A handler finished for the first time: did every section the scripts have in it finish too?
  var sectionsOwed = function (e) {
    var want = (expected !== null && expected.sections) ? expected.sections[e.id] : null
    var missing = []
    if (!want) return
    for (var i = 0; i < want.length; i++) {
      if (sectionsRan[want[i]] !== true) missing.push(want[i])
    }
    if (missing.length > 0) {
      printNames('log', '[icraft.live] NOT RUN section (' + missing.length + ' of ' + want.length + ' in ' + e.id +
        ' did not finish although the handler did)', missing)
    }
  }

  // The first time `e` ran to its end. Never throws: it is called on the way out of a handler.
  var fire = function (e) {
    try {
      if (e === null || e === undefined || e.fired !== false) return
      e.fired = true
      liveFired++
      queue.push(e)
      sectionsOwed(e)
      if (!batching) flush()
    } catch (err) {
      say('error', '[icraft.live] could not record a FIRED registration: ' + err)
    }
  }

  // icraft.live.fired('feature-name'): the feature did its work. Never throws.
  var feature = function (name) {
    if (featuresRan[name] === true) return
    try {
      var key = String(name)
      if (featuresRan[key] === true) return
      featuresRan[key] = true
      featureCount++
      queue.push({ name: key, group: 'feature' })
      if (!batching) flush()
    } catch (err) {
      say('error', '[icraft.live] could not record a FIRED feature: ' + err)
    }
  }

  var sectionRan = function (name) {
    var key = String(name)
    if (sectionsRan[key] === true) return
    sectionsRan[key] = true
    sectionCount++
  }

  // Two running remainders over the sorted ids, as 16 hex digits. Plain double
  // arithmetic that stays exact (every product is below 2^53), so
  // dev/loud/gen_liveness.js computes the same digits from the script sources.
  var HEX = '0123456789abcdef'
  var hex8 = function (n) {
    var out = ''
    for (var i = 0; i < 8; i++) {
      var d = n % 16
      out = HEX.charAt(d) + out
      n = (n - d) / 16
    }
    return out
  }
  // The printable ASCII characters in code order: a character's number is its
  // place here plus 32 (31 for anything else). NOT charCodeAt: on this engine
  // it hands back a java.lang.Character, arithmetic on it is NaN, and the
  // digest of every list was sixteen zeros (suite event-guard caught it).
  var ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'
  var digest = function (sortedIds) {
    var a = 7
    var b = 11
    for (var i = 0; i < sortedIds.length; i++) {
      var s = String(sortedIds[i])
      for (var j = 0; j < s.length; j++) {
        var c = ASCII.indexOf(s.charAt(j)) + 32
        a = (a * 31 + c) % 2147483647
        b = (b * 131 + c) % 2147483629
      }
      a = (a * 31 + 10) % 2147483647
      b = (b * 131 + 10) % 2147483629
    }
    return hex8(a) + hex8(b)
  }

  // -> { part: this script type's part of the expected list | null, problem: '' | why }
  var readExpected = function (type) {
    var text = null
    var doc = null
    if (typeof JsonIO === 'undefined') return { part: null, problem: '' }
    try {
      text = JsonIO.readString(EXPECTED_FILE)
    } catch (e) {
      return { part: null, problem: EXPECTED_FILE + ' could not be read (' + e + ')' }
    }
    if (text === null || text === undefined) return { part: null, problem: EXPECTED_FILE + ' does not exist' }
    text = String(text)
    if (text === '' || text === 'null') return { part: null, problem: EXPECTED_FILE + ' does not exist or is empty' }
    try {
      doc = JSON.parse(text)
    } catch (e2) {
      return { part: null, problem: EXPECTED_FILE + ' is not JSON (' + e2 + ')' }
    }
    if (doc === null || typeof doc !== 'object' || !doc[type] || typeof doc[type].armed !== 'object') {
      return { part: null, problem: EXPECTED_FILE + ' has no "' + type + '" part' }
    }
    return { part: doc[type], problem: '' }
  }

  // Called once per script load by zzz_icraft_live.js, the last script of its
  // type: every registration a script makes while it loads has been made.
  // Prints the ONE summary line and, against the expected list, what is missing.
  // `given` (tests): the expected part to use instead of the file.
  var loaded = function (type, given) {
    var ids = []
    var events = {}
    var eventCount = 0
    var handlers = 0
    var ticks = 0
    var hurts = 0
    var missing = []
    var unlisted = []
    var optional = {}
    var problem = ''
    var line = ''
    var sum = ''
    var i = 0
    var g = ''
    var id = ''
    try {
      scriptType = String(type)
      if (given !== undefined) expected = (given !== null && typeof given === 'object') ? given : null
      else {
        var read = readExpected(scriptType)
        expected = read.part
        problem = read.problem
      }
      for (i = 0; i < live.length; i++) {
        ids.push(live[i].id)
        g = live[i].group
        if (g === 'tick.server' || g === 'tick.player') ticks++
        else if (g === 'hurt' || g === 'hurt.late') hurts++
        else {
          handlers++
          if (events[g] !== true) {
            events[g] = true
            eventCount++
          }
        }
      }
      ids.sort()
      sum = digest(ids)
      line = '[icraft.live] ARMED ' + scriptType + ': ' + live.length + ' registrations (' + handlers + ' handlers on ' +
        eventCount + ' events, ' + ticks + ' tick functions, ' + hurts + ' hurt handlers), digest ' + sum
      if (expected !== null) {
        if (expected.optional) {
          for (i = 0; i < expected.optional.length; i++) optional[expected.optional[i]] = true
        }
        for (id in expected.armed) {
          if (!liveById[id] && optional[id] !== true) missing.push(id)
        }
        for (i = 0; i < ids.length; i++) {
          if (expected.armed[ids[i]] === undefined) unlisted.push(ids[i])
        }
        missing.sort()
        line += '; against the expected list: ' + missing.length + ' not armed, ' + unlisted.length + ' unlisted'
      } else {
        line += '; NOT compared with an expected list'
      }
      if (!armed) line += ' [the guard is OFF: FIRED is not recorded for event handlers]'
      say('log', line)
      // a WARN line: the boot-log checker reports a warning nobody has accepted
      if (expected === null && problem !== '') {
        say('warn', '[icraft.live] no expected list: ' + problem + '. ARMED is a count only for this script load')
      }
      if (missing.length > 0) printNames('error', '[icraft.live] NOT ARMED', missing)
      if (unlisted.length > 0) printNames('log', '[icraft.live] UNLISTED', unlisted)
      summarised = true
    } catch (e) {
      say('error', '[icraft.live] the ARMED summary failed: ' + e)
    }
    return { type: scriptType, armed: live.length, missing: missing, unlisted: unlisted, digest: sum }
  }

  // What `/icraft live` shows. filter: a part of an id or of the script that owns it ('' = everything).
  // A feature matches as '<name>@feature', a section as '<name>@section', so `feature` lists the features.
  // -> { type, armed, fired, failed, never: [id], neverTotal, sections: { ran, known, notRun: [name] },
  //      features: { fired: [name], never: [name], known, ran }, compared }
  var report = function (filter) {
    var want = (filter === null || filter === undefined) ? '' : String(filter)
    var never = []
    var neverTotal = 0
    var notRun = []
    var known = 0
    var fFired = []
    var fNever = []
    var fKnown = 0
    var i = 0
    var id = ''
    var name = ''
    var list = null
    var owner = function (table, key) { return (table && table[key] !== undefined) ? String(table[key]) : '' }
    var matches = function (key, script) { return want === '' || key.indexOf(want) >= 0 || script.indexOf(want) >= 0 }
    for (i = 0; i < live.length; i++) {
      if (live[i].fired) continue
      neverTotal++
      if (matches(live[i].id, owner(expected !== null ? expected.armed : null, live[i].id))) never.push(live[i].id)
    }
    if (expected !== null && expected.sections) {
      for (id in expected.sections) {
        list = expected.sections[id]
        for (i = 0; i < list.length; i++) {
          known++
          if (sectionsRan[list[i]] !== true && matches(list[i] + '@section', owner(expected.armed, id))) notRun.push(list[i])
        }
      }
    }
    if (expected !== null && expected.features) {
      for (name in expected.features) {
        fKnown++
        if (featuresRan[name] === true) continue
        if (matches(name + '@feature', owner(expected.features, name))) fNever.push(name)
      }
    }
    for (name in featuresRan) {
      if (matches(name + '@feature', owner(expected !== null ? expected.features : null, name))) fFired.push(name)
    }
    never.sort()
    notRun.sort()
    fNever.sort()
    fFired.sort()
    return {
      type: scriptType, armed: live.length, fired: liveFired, failed: failedOrder.length, never: never, neverTotal: neverTotal,
      sections: { ran: sectionCount, known: known, notRun: notRun },
      features: { fired: fFired, never: fNever, known: fKnown, ran: featureCount },
      compared: expected !== null
    }
  }

  // The report as text, one string per line: this script type's part of `/icraft live`.
  var lines = function (filter) {
    var want = (filter === null || filter === undefined) ? '' : String(filter)
    var r = report(want)
    var out = []
    var byGroup = {}
    var order = []
    var i = 0
    var at = 0
    var g = ''
    out.push(r.type + ' scripts: ' + r.armed + ' armed, ' + r.fired + ' fired, ' + r.neverTotal + ' never fired, ' +
      r.failed + ' FAILED; sections ' + r.sections.ran + (r.compared ? ' of ' + r.sections.known : '') + ' ran; features ' +
      r.features.ran + (r.compared ? ' of ' + r.features.known : '') + ' fired' +
      (r.compared ? '' : ' (no expected list: what never ran among sections and features cannot be listed)'))
    if (want !== '') out.push('  filter "' + want + '": ' + r.never.length + ' of the ' + r.neverTotal + ' never-fired registrations')
    for (i = 0; i < r.never.length; i++) {
      at = r.never[i].lastIndexOf('@')
      g = r.never[i].substring(at + 1)
      if (!byGroup[g]) {
        byGroup[g] = []
        order.push(g)
      }
      byGroup[g].push(r.never[i].substring(0, at))
    }
    order.sort()
    for (i = 0; i < order.length; i++) {
      out.push('  never fired, ' + order[i] + ' x' + byGroup[order[i]].length + ': ' + byGroup[order[i]].join(', '))
    }
    if (r.features.never.length > 0) out.push('  never fired, feature x' + r.features.never.length + ': ' + r.features.never.join(', '))
    if (r.features.fired.length > 0) out.push('  fired, feature x' + r.features.fired.length + ': ' + r.features.fired.join(', '))
    if (r.sections.notRun.length > 0) out.push('  not run, section x' + r.sections.notRun.length + ': ' + r.sections.notRun.join(', '))
    return out
  }

  // ---- guard ----------------------------------------------------------------
  var running = null    // the guard whose handler is running now (a section reports its event)

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
    // ARMED, also when the guard is off: the registration is made either way
    var entry = arm(name, eventName)
    if (!armed) return handler
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
        if (exit === null) record(entry.name, entry.group, describe(e))
      } finally {
        running = outer
        // Still 0 here: something that skipped the catch is on its way out.
        // Returning from a finally block drops it (a java.lang.Error never
        // gets this far; it does not run finally blocks either).
        if (state === 0 && ISOLATE_UNCATCHABLE) {
          record(entry.name, entry.group, UNCATCHABLE)
          return
        }
      }
      // FIRED: it returned, or it left through KubeJS's own exit (a handler that
      // cancels has done its work). Not when it threw. One boolean read from the
      // second time on.
      if (entry.fired === false && (state === 1 || exit !== null)) fire(entry)
      // Outside every try: this is the cancel, on its way to KubeJS.
      if (exit !== null) rethrow(exit)
    }
  }

  // ---- section --------------------------------------------------------------
  var section = function (name, fn) {
    var state = 0
    var exit = null
    var eventName = running !== null ? running.group : '?'
    if (!armed) {
      fn()
      sectionRan(name)
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
    if (state === 1 || exit !== null) sectionRan(name)
    if (exit !== null) rethrow(exit)
  }

  // ---- handler: a liveness id for a function put straight on a Java registry --
  // The mod's own registries (ItemAttributeRegistry, ForgeEventRegistry,
  // DamageModifierRegistry) and Apotheosis's LootCategory take a function and
  // call it from Java. They are not KubeJS events, so guard() does not fit: a
  // registry catches what its handler throws and logs it itself, some handlers
  // RETURN a value the registry uses (a LootCategory predicate), and none of
  // them leaves through an EventExit. Until 2026-10-13 such a handler had no
  // id: eleven startup scripts could say LOADED and nothing more.
  //   ARMED  '<name>@<group>' when handler() is called (the registration is the
  //          next thing the script does);
  //   FIRED  the first time the function RETURNS. One boolean read afterwards.
  // Nothing else changes: `this`, the arguments and the return value pass
  // through, and a throw passes through untouched and uncounted (the registry's
  // own catch reports it, exactly as before; it is not FIRED).
  var handler = function (name, group, fn) {
    if (typeof fn !== 'function') {
      say('error', '[icraft.guard] MISUSE: handler(' + name + ', ' + group + ', <' + (typeof fn) +
        '>) was not given a function; the value is registered as it is')
      return fn
    }
    var entry = arm(name, group)
    return function () {
      var result = fn.apply(this, arguments)
      if (entry.fired === false) fire(entry)
      return result
    }
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
  own.handler = handler
  own.live = {
    arm: arm,                // (name, group) -> entry: 0_tick_master.js and 0_lib_core.js register theirs
    fire: fire,              // (entry): it ran to its end for the first time
    fired: feature,          // ('feature-name'): the feature did its work
    flush: flush,            // print what fired since the last call
    batch: function (on) { batching = (on === true) },
    loaded: loaded,          // (type): the summary line; zzz_icraft_live.js only
    report: report,          // (filter) -> what `/icraft live` shows, as data
    lines: lines,            // (filter) -> the same as text
    digest: digest,
    // [{ id, name, group, fired, times }] in registration order (a copy)
    entries: function () {
      var out = []
      for (var i = 0; i < live.length; i++) {
        out.push({ id: live[i].id, name: live[i].name, group: live[i].group, fired: live[i].fired, times: live[i].times })
      }
      return out
    }
  }

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
