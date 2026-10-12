// Assertions for suites that need no game mocks (suite `dialect`).
var T_pass = 0, T_fail = 0
function section(name) { __host.print('-- ' + name) }
function ok(cond, what) {
  if (cond) { T_pass++ } else { T_fail++; __host.fail(); __host.print('   FAIL  ' + what) }
}
// eq(actual, expected, what): compared as strings, so arrays compare by content
function eq(actual, expected, what) { ok(String(actual) === String(expected), what + '  (got ' + String(actual) + ', want ' + String(expected) + ')') }
// what a snippet does when run: its value, or 'THROWS <first line of the error>'
function outcome(fn) { try { return fn() } catch (e) { return 'THROWS ' + String(e).split('\n')[0] } }
function parses(src) { return String(__host.compiles(src)) === '' }
