// =============================================================================
// SCRIPT FILE FACTS -- what KubeJS reads from a script's comment lines, how it
// sorts the scripts of a folder, and in which order it runs the handlers of one event.
// File: .minecraft/dev/engine-tests/real-engine/0_script_file_facts.js  (dev tool, never in a distro)
//
// The pack's header fields (`// @after <script>`, see dev/catalogue) must never be
// read by KubeJS as a file property, and the load order the tools compute
// (dev/catalogue/script_model.js, dev/boot) must be the engine's own. These facts ask
// KubeJS's classes themselves, on a real Forge server:
//   ScriptFileInfo.preload      the parser of comment lines
//   ScriptFile.compareTo        through List.sort(null), the call ScriptManager.loadFromDirectory makes
//   EventHandler.post           through four handlers of one event (0_handler_order_probe.js)
//
// ONE list of cases, read in two places:
//   1. zz_engine_probe.js evaluates SCRIPT_FILE_FACTS after ENGINE_FACTS (`run.py real-engine`);
//      the answers are committed in truth/engine-facts.txt;
//   2. dev/catalogue/script_model.test.js evaluates this file in node, takes
//      SCRIPT_FILE_CASES, and holds the model to the recorded answers.
// The file needs nothing from another probe file while it loads (a Linux folder lists
// its files in hash order: no probe file may depend on another at load).
//
//   parse: { label, lines, keys }   keys = the properties asked for (the model may find no other)
//          cond: true = whether the file is skipped depends on the pack mode / the mods that are loaded
//   sort:  { label, files: [[name, priority | null]] }   null = no priority line
// =============================================================================
var SCRIPT_FILE_CASES = {
  parse: [
    { label: 'a comment of several words', lines: ['// just a comment line with several words', 'var a = 1'], keys: [] },
    { label: '@after with a path', lines: ['// @after scaling/boss_hp.js'], keys: ['after'] },
    { label: '@after with a path and a reason', lines: ['// @after scaling/boss_hp.js  boss_hp reads the maximum first'], keys: ['after'] },
    { label: '@after with one word', lines: ['// @after boss_hp'], keys: ['after'] },
    { label: '@after with a colon', lines: ['// @after: boss_hp'], keys: ['after'] },
    { label: '@file', lines: ['// @file kubejs/server_scripts/x.js'], keys: ['file'] },
    { label: '@events', lines: ['// @events ServerEvents.recipes, LootJS.modifiers'], keys: ['events'] },
    { label: '@events with one word', lines: ['// @events none'], keys: ['events'] },
    { label: '@registry', lines: ['// @registry bosses'], keys: ['registry'] },
    { label: '@live', lines: ['// @live codex-submit'], keys: ['live'] },
    { label: '@last with an event', lines: ['// @last LootJS.modifiers'], keys: ['last'] },
    { label: '@last with a group of one name', lines: ['// @last hurt'], keys: ['last'] },
    { label: 'last WITHOUT the @ is a property', lines: ['// last hurt'], keys: ['last'] },
    { label: '@priority is not priority', lines: ['// @priority 5'], keys: ['priority'] },
    { label: 'after WITHOUT the @ is a property', lines: ['// after boss_hp'], keys: ['after'] },
    { label: 'ONE word is a property (all but its last letter = its last letter)', lines: ['// CONTRACT'], keys: ['CONTRAC', 'CONTRACT'] },
    { label: 'two words are a property', lines: ['// LOAD ORDER'], keys: ['LOAD'] },
    { label: 'priority: 5', lines: ['// priority: 5'], keys: ['priority'] },
    { label: 'priority 5 (no colon)', lines: ['// priority 5'], keys: ['priority'] },
    { label: 'priority=5 (no spaces)', lines: ['//priority=5'], keys: ['priority'] },
    { label: 'priority5 (glued)', lines: ['// priority5'], keys: ['priority'] },
    { label: 'priority : 5 (a space before the colon)', lines: ['// priority : 5'], keys: ['priority'] },
    { label: 'priority:: 5', lines: ['// priority:: 5'], keys: ['priority'] },
    { label: 'priority with tabs', lines: ['//' + String.fromCharCode(9) + 'priority:' + String.fromCharCode(9) + '5'], keys: ['priority'] },
    { label: 'an indented priority line', lines: ['      // priority: 3'], keys: ['priority'] },
    { label: 'Priority with a capital', lines: ['// Priority: 3'], keys: ['priority', 'Priority'] },
    { label: 'priority: -5', lines: ['// priority: -5'], keys: ['priority'] },
    { label: 'priority: +5', lines: ['// priority: +5'], keys: ['priority'] },
    { label: 'priority: 007', lines: ['// priority: 007'], keys: ['priority'] },
    { label: 'priority twice: the last one wins', lines: ['// priority: 5', 'var a = 1', '  // priority: 7'], keys: ['priority'] },
    { label: 'priority deep inside a function', lines: ['var a = 1', 'function f() {', '    // priority 9', '}'], keys: ['priority'] },
    { label: 'a // line inside a block comment is read', lines: ['/*', '// priority: 5', '*/'], keys: ['priority'] },
    { label: 'a star line of a block comment is not', lines: ['/*', ' * priority: 5', ' */'], keys: ['priority'] },
    { label: 'a comment after code is not', lines: ['var a = 1 // priority: 5'], keys: ['priority'] },
    { label: 'three slashes are not', lines: ['/// priority: 5'], keys: ['priority'] },
    { label: 'priority with words after it is not', lines: ['// priority: 5 because'], keys: ['priority'] },
    { label: 'priority: high (the file does not load)', lines: ['// priority: high'], keys: ['priority'] },
    { label: 'priority: 1_000 (the file does not load)', lines: ['// priority: 1_000'], keys: ['priority'] },
    { label: 'priority: 99999999999 (the file does not load)', lines: ['// priority: 99999999999'], keys: ['priority'] },
    { label: 'a byte order mark before the slashes', lines: [String.fromCharCode(65279) + '// priority: 5'], keys: ['priority'] },
    { label: 'a no-break space after the slashes', lines: ['//' + String.fromCharCode(160) + 'priority: 5'], keys: ['priority'] },
    { label: 'ignored true', lines: ['// ignored true'], keys: ['ignored'] },
    { label: 'ignore: true', lines: ['// ignore: true'], keys: ['ignore'] },
    { label: 'ignored: false', lines: ['// ignored: false'], keys: ['ignored'] },
    { label: 'ignored true, then ignored false', lines: ['// ignored true', '// ignored false'], keys: ['ignored'] },
    { label: 'packmode', lines: ['// packmode hard'], keys: ['packmode'], cond: true },
    { label: 'requires a mod that is not there', lines: ['// requires icraft_no_such_mod'], keys: ['requires'], cond: true }
  ],
  sort: [
    { label: 'no priority: the order of the list is kept', files: [['c.js', null], ['a.js', null], ['b.js', null]] },
    { label: 'one high', files: [['c.js', null], ['a.js', null], ['b.js', 10]] },
    { label: 'one low', files: [['c.js', -10], ['a.js', null], ['b.js', null]] },
    { label: 'equal high priorities keep their order', files: [['m.js', 5], ['z.js', null], ['a.js', 5], ['k.js', 5], ['b.js', null]] },
    { label: 'equal low priorities keep their order', files: [['m.js', -5], ['z.js', null], ['a.js', -5], ['k.js', 1], ['b.js', -5]] },
    { label: 'the pack: the guard 1000, libraries from 900 down, the rest, the summary -1000',
      files: [['zzz_icraft_live.js', -1000], ['abyss/x.js', null], ['0_tick_master.js', 840], ['0_lib_core.js', 880], ['00_icraft_guard.js', 1000], ['0_iss_guard.js', 900], ['loot/y.js', null], ['0_lib_registry.js', 860]] },
    { label: 'a priority written as 0 and no priority are the same', files: [['z1.js', 0], ['a1.js', null], ['m1.js', 0], ['b1.js', null]] }
  ]
}

// [label, why, flags, fn(o)], the shape of ENGINE_FACTS (0_engine_facts.js); none is asked of the mocks
var SCRIPT_FILE_FACTS = []

;(function () {
  // KubeJS's own classes. Java.loadClass refuses its script package (the class filter); the class of an
  // object a script already holds is not filtered, and `console` is such an object.
  var engine = function () {
    var K = console.getClass()
    var loader = K.getClassLoader()
    var klass = function (name) { return K.forName(name, true, loader) }
    var Info = klass('dev.latvian.mods.kubejs.script.ScriptFileInfo')
    var PackInfo = klass('dev.latvian.mods.kubejs.script.ScriptPackInfo')
    var File = klass('dev.latvian.mods.kubejs.script.ScriptFile')
    var ArrayList = Java.loadClass('java.util.ArrayList')
    var make = function (c, args) { return c.getConstructors()[0].newInstance(args) }
    var pack = make(PackInfo, ['probe', ''])
    return {
      list: function () { return new ArrayList() },
      // the ScriptFileInfo of a file with these lines, after preload (ScriptSource has one method: a function will do)
      info: function (name, lines) {
        var info = make(Info, [pack, name])
        var list = new ArrayList()
        for (var i = 0; i < lines.length; i++) list.add(lines[i])
        info.preload(function (ignored) { return list })
        return info
      },
      file: function (info) { return make(File, [null, info, null]) }
    }
  }

  var parseFact = function (c) {
    return function (o) {
      var e = engine()
      var info = null
      try { info = e.info('x.js', c.lines) } catch (err) {
        var text = String(err)
        return 'DOES NOT LOAD ' + (text.indexOf('NumberFormatException') >= 0 ? 'java.lang.NumberFormatException' : text.substring(0, 80))
      }
      var why = String(info.skipLoading())
      var out = 'priority=' + info.getPriority() + ' skipped=' + (why === '' ? 'no' : 'yes')
      if (c.cond !== true) out += ' why=' + JSON.stringify(why)
      for (var k = 0; k < c.keys.length; k++) out += ' ' + c.keys[k] + '=' + JSON.stringify(String(info.getProperty(c.keys[k], '<not set>')))
      return out
    }
  }
  var sortFact = function (c) {
    return function (o) {
      var e = engine()
      var list = e.list()
      for (var i = 0; i < c.files.length; i++) {
        list.add(e.file(e.info(c.files[i][0], c.files[i][1] === null ? ['var a = 1'] : ['// priority: ' + c.files[i][1]])))
      }
      list.sort(null)
      var names = []
      for (var j = 0; j < list.size(); j++) names.push(String(list.get(j).info.file))
      return names.join(' ')
    }
  }

  var i = 0
  for (i = 0; i < SCRIPT_FILE_CASES.parse.length; i++) {
    SCRIPT_FILE_FACTS.push(['script file: ' + SCRIPT_FILE_CASES.parse[i].label, 'ScriptFileInfo.preload on the lines of this case', '', parseFact(SCRIPT_FILE_CASES.parse[i])])
  }
  for (i = 0; i < SCRIPT_FILE_CASES.sort.length; i++) {
    SCRIPT_FILE_FACTS.push(['script sort: ' + SCRIPT_FILE_CASES.sort[i].label, 'List.sort(null) over ScriptFile.compareTo, the files in the order of this case', '', sortFact(SCRIPT_FILE_CASES.sort[i])])
  }
  SCRIPT_FILE_FACTS.push(['script sort: 200 files of three priorities come out highest first, each priority in the order it went in',
    'the sort is stable: files of one priority never change places', '', function (o) {
      var e = engine()
      var list = e.list()
      var n = 0
      for (n = 0; n < 200; n++) {
        var name = 's' + (n < 10 ? '00' : (n < 100 ? '0' : '')) + n + '.js'
        list.add(e.file(e.info(name, (n % 7 === 0) ? ['// priority: 3'] : ((n % 5 === 0) ? ['// priority: -2'] : ['var a = 1']))))
      }
      list.sort(null)
      var good = true
      var lastP = 2147483647
      var lastName = ''
      for (n = 0; n < list.size(); n++) {
        var p = list.get(n).info.getPriority()
        var nm = String(list.get(n).info.file)
        if (p > lastP) good = false
        if (p === lastP && nm < lastName) good = false
        lastP = p
        lastName = nm
      }
      return good + ' (' + list.size() + ' files)'
    }])
  SCRIPT_FILE_FACTS.push(['handler order: handlers registered for a target run before the untargeted ones, each group in registration order',
    'EventHandler.post: the containers of the extra id first, then the general ones (the event index of dev/catalogue is built on it)', '', function (o) {
      if (typeof HANDLER_ORDER_SEEN === 'undefined') return 'the probe file 0_handler_order_probe.js did not load'
      HANDLER_ORDER_SEEN.length = 0
      o.server.runCommandSilent('time query gametime')
      return HANDLER_ORDER_SEEN.join(' ')
    }])
})()
