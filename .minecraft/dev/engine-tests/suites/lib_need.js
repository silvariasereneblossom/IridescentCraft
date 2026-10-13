// =============================================================================
// LIB NEED -- the scripts that ask for the core library, loaded WITHOUT it.
// Until 2026-10-13 eleven scripts carried their own test (`if (!core) { console.error(
// '... 0_lib_core.js did not load -- ... are OFF'); return }`, three of them a throw).
// They ask icraft.lib.need('core', '<script>') now (00_icraft_guard.js). What that must
// do when the library is not there, on the production script engine:
//   * every one of them loads without an error of its own;
//   * the missing library is ONE error line, naming the first script that asked;
//   * the others are counted (icraft.lib.missing()), not printed;
//   * no script prints a "did not load" line of its own any more;
//   * a script that asks as its FIRST statement has registered nothing.
// The load list (suites.json) is the guard, the tick master and the consumers; the core
// is left out on purpose. LN_WHOLE = the eight scripts whose whole file is behind the
// question, LN_PART = the three where only one block is (the rest of such a file loads
// and registers as before, which is why they are loaded after the count is taken).
// =============================================================================
var ln_missing_lines = function () {
  return T_LOG.error.filter(function (l) { return l.indexOf('[icraft.lib] MISSING') >= 0 })
}
var ln_all = LN_WHOLE.concat(LN_PART)

T_run('lib need: the consumers load without the core', function () {
  ok(typeof global.icraft === 'object' && global.icraft.core === undefined, 'the core library is not loaded in this suite')
  ok(T_LOAD_ERRORS.length === 0, 'no script fails to load (' + T_LOAD_ERRORS.length + '): ' + T_LOAD_ERRORS.join(' / ').substring(0, 300))
  ok(ln_all.length === 11, 'eleven consumers are loaded (' + ln_all.length + ')')
})

T_run('lib need: one line for the missing library', function () {
  var lines = ln_missing_lines()
  ok(lines.length === 1, 'ONE `[icraft.lib] MISSING` error line for ' + ln_all.length + ' scripts (' + lines.length + ')')
  ok(lines.length === 1 && lines[0].indexOf('[icraft.lib] MISSING core: ' + LN_WHOLE[0] + ' needs this library') === 0,
    'it names the library and the FIRST script that asked: ' + (lines[0] || '').substring(0, 90))
  var own = T_LOG.error.concat(T_LOG.warn).concat(T_LOG.info).filter(function (l) { return l.indexOf('did not load') >= 0 })
  ok(own.length === 0, 'no script says "did not load" itself any more: ' + own.join(' / ').substring(0, 300))
})

T_run('lib need: the others are counted', function () {
  var missing = icraft.lib.missing()
  ok(missing.length === 1 && missing[0].name === 'core', 'icraft.lib.missing() lists the core alone (' + missing.map(function (m) { return m.name }).join(', ') + ')')
  ok(missing.length === 1 && missing[0].first === LN_WHOLE[0], 'the first one that asked is ' + LN_WHOLE[0])
  ok(missing.length === 1 && missing[0].count === LN_ASKING, missing[0].count + ' scripts asked (want ' + LN_ASKING + ')')
  ok(icraft.lib.has('core') === false && icraft.lib.need('core', 'suite/again') === false, 'has() and a later need() answer false')
  ok(ln_missing_lines().length === 1, 'and a later need() prints no second line')
})

T_run('lib need: a script that asks first has registered nothing', function () {
  ok(LN_AFTER_WHOLE === LN_BEFORE, 'loading the eight whole-file consumers added no registration (' + LN_BEFORE + ' before, ' + LN_AFTER_WHOLE + ' after)')
})
