// =============================================================================
// DIALECT -- what the production Rhino build (rhino-forge 2001.2.3) does with the
// constructs that have silently killed scripts in this pack. Every expectation here
// was OBSERVED on that jar (2026-10-12) and is what lint_kubejs_rhino.js and the
// failure ledger assume. If a Rhino update changes one, this suite fails first:
// then the lint rule and the ledger line are wrong too.
// No game classes are involved; the strings-from-Java part is repeated on the real
// engine by truth/engine-facts.txt.
// =============================================================================

section('const / let / var in loops')
eq(outcome(function () { var seen = []; for (var i = 0; i < 3; i++) { const c = i; seen.push(c) } return seen.join(',') }), '0,0,0',
  'a const in a for body keeps the value of the FIRST iteration')
eq(outcome(function () { var seen = []; var i = 0; while (i < 3) { const c = i; seen.push(c); i++ } return seen.join(',') }), '0,0,0',
  'a const in a while body keeps the value of the first iteration')
eq(outcome(function () { var seen = []; for (var i = 0; i < 3; i++) { let c = i; seen.push(c) } return seen.join(',') }), '0,1,2',
  'a let WITH an initializer is correct in every iteration')
eq(outcome(function () { var seen = []; for (var i = 0; i < 3; i++) { let c; seen.push(String(c)); c = i } return seen.join(',') }), 'undefined,0,1',
  'a let WITHOUT an initializer is not reset per iteration')
eq(outcome(function () { var seen = []; for (const k in { a: 1, b: 2, c: 3 }) seen.push(k); return seen.join(',') }), 'a,b,c',
  'a const in a for-in HEAD rebinds per iteration (safe)')
eq(outcome(function () { var seen = []; for (const v of [1, 2, 3]) seen.push(v); return seen.join(',') }), '1,2,3',
  'a const in a for-of HEAD rebinds per iteration (safe)')

section('closures in loops')
eq(outcome(function () { var fs = []; for (var i = 0; i < 3; i++) { let v = i; fs.push(function () { return v }) } return fs.map(function (f) { return f() }).join(',') }), '0,1,2',
  'a closure over an initialised let in the loop BODY sees its own iteration')
eq(outcome(function () { var fs = []; for (var i = 0; i < 3; i++) { var v = i; fs.push(function () { return v }) } return fs.map(function (f) { return f() }).join(',') }), '0,1,2',
  'a closure over a var in the loop body sees its own iteration (var is block-scoped here)')
eq(outcome(function () { var fs = []; for (let i = 0; i < 3; i++) fs.push(function () { return i }); return fs.map(function (f) { return f() }).join(',') }), '3,3,3',
  'closures over the for-HEAD variable all see its final value (unlike ES6): copy it into a body let first')
// 2026-10-13: the same holds for EVERY loop head, whatever the keyword and whatever the loop. These six are what
// lint rule LOOP-CLOSURE (lint_kubejs_traps.js) rests on; if one changes, the rule is wrong.
eq(outcome(function () { var fs = []; for (var i = 0; i < 3; i++) fs.push(function () { return i }); return fs.map(function (f) { return f() }).join(',') }), '3,3,3',
  'closures over a `var` for-head variable see its final value')
eq(outcome(function () { var fs = []; for (let k in { a: 1, b: 2, c: 3 }) fs.push(function () { return k }); return fs.map(function (f) { return f() }).join(',') }), 'c,c,c',
  'closures over a `let` for-IN head variable all see the LAST key (ES6: a,b,c)')
eq(outcome(function () { var fs = []; for (const k in { a: 1, b: 2, c: 3 }) fs.push(function () { return k }); return fs.map(function (f) { return f() }).join(',') }), 'c,c,c',
  'closures over a `const` for-IN head variable all see the LAST key (ES6: a,b,c)')
eq(outcome(function () { var fs = []; for (let v of [1, 2, 3]) fs.push(function () { return v }); return fs.map(function (f) { return f() }).join(',') }), '3,3,3',
  'closures over a `let` for-OF head variable all see the LAST element (ES6: 1,2,3)')
eq(outcome(function () { var fs = []; for (const v of [1, 2, 3]) fs.push(function () { return v }); return fs.map(function (f) { return f() }).join(',') }), '3,3,3',
  'closures over a `const` for-OF head variable all see the LAST element (ES6: 1,2,3)')
eq(outcome(function () { var fs = []; [1, 2, 3].forEach(function (v) { fs.push(function () { return v }) }); return fs.map(function (f) { return f() }).join(',') }), '1,2,3',
  'a closure over a PARAMETER of the callback (forEach) sees its own call: that is the safe form')

section('const inside try')
var D_constTry = function () {
  var side = 0
  var r
  try { const x = (side = side + 1); r = 'no throw' } catch (e) { r = 'caught ' + String(e) }
  return r + ' | side=' + side
}
var D_first = D_constTry()
ok(D_first.indexOf('redeclaration of var x') >= 0, 'a const in a try body throws "redeclaration of var" on the FIRST execution: ' + D_first)
ok(D_first.indexOf('side=1') >= 0, '...AFTER its initializer ran (the side effect happened, then the catch ran)')
ok(D_constTry().indexOf('redeclaration of var x') >= 0, '...and on every later execution')
eq(outcome(function () { var out = []; for (var i = 0; i < 3; i++) { try { const x = i; out.push('ok' + x) } catch (e) { out.push('caught') } } return out.join(',') }),
  'caught,caught,caught', 'so a try body with a const never reaches the statement after it')

section('var is block-scoped')
eq(outcome(function () { try { var x = 5 } catch (e) { } return typeof x }), 'undefined', 'a var declared in a try is gone after the try')
eq(outcome(function () { if (true) { var y = 5 } return typeof y }), 'undefined', 'a var declared in an if is gone after the if')
eq(outcome(function () { for (var i = 0; i < 1; i++) { var z = 5 } return typeof z }), 'undefined', 'a var declared in a loop body is gone after the loop')
ok(String(outcome(function () { for (var i = 0; i < 2; i++) { } return i })).indexOf('ReferenceError') >= 0,
  'the loop variable of `for (var i ...)` read after the loop is a ReferenceError')
eq(outcome(function () { var f; if (true) { function inner() { return 1 } f = function () { return typeof inner } } return f() }), 'undefined',
  'a function DECLARED inside a block is undefined to a closure: use `var f = function () {}`')

section('syntax this parser rejects (node --check accepts all of it)')
var D_rejected = [
  ['catch without a binding', 'try { } catch { }'],
  ['spread in a call', 'f(...a)'],
  ['spread in an array', 'var x = [...a]'],
  ['object spread', 'var o = { ...a }'],
  ['default parameter', 'function f(a = 1) { }'],
  ['rest parameter', 'function f(...a) { }'],
  ['shorthand property', 'var a = 1; var o = { a }'],
  ['computed key', "var k = 'a'; var o = { [k]: 1 }"],
  ['class', 'class A { }'],
  ['async function', 'async function f() { }'],
  ['logical assignment', 'a ||= 1'],
  ['numeric separator', 'var n = 1_000'],
  ['BigInt literal', 'var b = 10n']
]
for (var D_i = 0; D_i < D_rejected.length; D_i++) ok(!parses(D_rejected[D_i][1]), D_rejected[D_i][0] + ' is a syntax error: ' + D_rejected[D_i][1])

section('syntax this parser accepts')
var D_accepted = [
  ['arrow function', 'var f = (a) => a + 1'],
  ['template literal', 'var s = `a${1}b`'],
  ['object destructuring', 'var { a, b } = o'],
  ['array destructuring', 'var [a, b] = o'],
  ['optional chaining', 'var x = a?.b'],
  ['for-of', 'for (var v of a) { }'],
  ['method shorthand', 'var o = { m() { return 1 } }'],
  ['?? (it parses; see the value below)', 'var x = a ?? b']
]
for (var D_j = 0; D_j < D_accepted.length; D_j++) ok(parses(D_accepted[D_j][1]), D_accepted[D_j][0] + ' parses: ' + D_accepted[D_j][1])

section('built-ins that are missing or wrong')
eq(typeof Math.PI, 'undefined', 'Math.PI is undefined (write 3.141592653589793)')
eq(typeof Math.E, 'undefined', 'Math.E is undefined')
eq(typeof Promise, 'undefined', 'there is no Promise')
eq(typeof java, 'undefined', 'there is no `java` package root: `new java.util.HashSet()` cannot work, use Java.loadClass')
eq(JSON.stringify({ a: [1, 2] }), '{"a":[1.0,2.0]}', 'JSON.stringify writes whole numbers with a decimal point')
__host.runs('var D_q1 = null ?? 5; var D_q2 = undefined ?? 5; var D_q3 = 7 ?? 5')
eq([D_q1, D_q2, D_q3].join(','), '0,0,7', '`null ?? 5` and `undefined ?? 5` are 0, not 5 (`7 ?? 5` is 7): never use ??')
__host.runs('var D_n = null; var D_q4 = D_n?.b')
eq(typeof D_q4, 'undefined', 'optional chaining on null gives undefined (it works)')

section('a String that comes back from Java')
var D_s = __host.javaString('minecraft:diamond')
eq(typeof D_s, 'object', "it is typeof 'object'")
ok(D_s === 'minecraft:diamond' && D_s == 'minecraft:diamond', '=== and == against a literal work')
eq(new Set(['minecraft:diamond']).has(D_s), false, 'new Set([id]).has(x) is FALSE')
eq(new Set(['minecraft:diamond']).has(String(D_s)), true, 'new Set([id]).has(String(x)) is true')
eq(typeof new Map([['minecraft:diamond', 1]]).get(D_s), 'undefined', 'new Map([[id, v]]).get(x) is undefined')
eq(({ 'minecraft:diamond': 5 })[D_s], 5, 'a plain object as the table works')
eq(typeof D_s.length, 'function', 'x.length is a function (Java length()), so `x.length > 0` is false')
eq(typeof D_s.toUpperCase(), 'object', 'String methods return Java strings again')
eq(D_s.replace(/[:\/]/g, '_'), 'minecraft:diamond', 'x.replace(/regex/, ..) changes NOTHING (Java replace takes the regex as literal text)')
eq(String(D_s).replace(/[:\/]/g, '_'), 'minecraft_diamond', 'String(x).replace(/regex/, ..) works')
eq(outcome(function () { return D_s.charCodeAt(0) + 1 }), 'NaN', 'x.charCodeAt(i) is a raw java.lang.Character: NaN in arithmetic (use codePointAt)')
// 2026-10-13: it is wrong on a plain JS string as well, and in every use, not only in arithmetic. These four are
// what lint rule CHARCODEAT rests on.
eq(outcome(function () { return 'abc'.charCodeAt(1) + 0 }), 'NaN', "'abc'.charCodeAt(1) + 0 is NaN on a JS string too")
eq(outcome(function () { return 'abc'.charCodeAt(1) === 98 }), 'false', "'abc'.charCodeAt(1) === 98 is false")
eq(outcome(function () { return 'abc'.charCodeAt(1) < 100 }), 'false', "'abc'.charCodeAt(1) < 100 is false")
ok(String(outcome(function () { return typeof 'abc'.charCodeAt(1) })).indexOf('THROWS InternalError: Invalid JavaScript value of type java.lang.Character') === 0,
  'typeof x.charCodeAt(i) THROWS (InternalError: Invalid JavaScript value of type java.lang.Character)')
eq(D_s.codePointAt(0), 109, 'x.codePointAt(i) is a number')
ok(String(outcome(function () { return D_s.substring(0, 99) })).indexOf('StringIndexOutOfBounds') >= 0, 'an out-of-range substring throws a Java exception')

section('Java classes')
var D_Stack = __host.loadClass('mk.W$Stack')
ok(String(outcome(function () { return D_Stack.isInstance(1) })).indexOf('THROWS') === 0, 'a loaded class has no isInstance (statics only)')
eq(new D_Stack('minecraft:diamond', 1) instanceof D_Stack, true, '`x instanceof cls` works')
var D_Vec3 = __host.loadClass('mk.W$Vec3')
var D_v = new D_Vec3(1.5, 2, 3)
eq(typeof D_v.x, 'function', 'a name that is both a field and a method (Vec3.x) reads as a function')
eq(D_v.x(), 1.5, 'calling it works')
var D_npe = String(__host.runs('try { Math.floor(D_v.x) } catch (e) { }'))
ok(D_npe.indexOf('NullPointerException') >= 0, 'a VALUE read of it throws a NullPointerException straight through a script try/catch: ' + D_npe.substring(0, 90))

__host.print('')
__host.print('RESULT: ' + T_pass + ' passed, ' + T_fail + ' failed')
