#!/usr/bin/env node
// =============================================================================
// script_model.test.js -- the model of dev/catalogue against the ENGINE, and the
// load-order check against planted defects
// =============================================================================
//   node --expose-internals .minecraft/dev/catalogue/script_model.test.js
//
// PART 1  the engine. script_model.js says what KubeJS reads from a script's comment
//         lines, how it sorts scripts, and in which order handlers run. Each of those
//         was asked of KubeJS's own classes on a real Forge server
//         (engine-tests/real-engine/0_script_file_facts.js; the answers are committed
//         in engine-tests/truth/engine-facts.txt). Here the SAME cases are put to the
//         model, and every answer must be the recorded one. A recorded fact no case
//         answers fails too: the model cannot fall behind the probe.
// PART 2  the check. Small packs are written to a temp folder, each with ONE defect,
//         and load_order.js must report exactly that defect (and nothing on the pack
//         without it). Take a rule out of load_order.js and its case fails.
// PART 3  the template: dev/catalogue/script_template.js as a new script of a pack
//         passes the check, and no line of it is a file property for the engine.
//
// No git, no network, no mod jar: it runs in CI. The temp folder is deleted at the end.
// Exit 0 all passed, 1 a failure, 2 could not run.
// =============================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let M, L;
try { M = require('./script_model.js'); M.readCode('var a'); L = require('./load_order.js'); }
catch (e) { console.error('[script-model-test] CANNOT RUN: ' + e.message + '. Run with: node --expose-internals ' + __filename); process.exit(2); }

const ENGINE = path.join(__dirname, '..', 'engine-tests');
let passed = 0, failed = 0;
const ok = (cond, what, detail) => {
  if (cond) { passed++; if (process.argv.includes('--verbose')) console.log('ok   ' + what); }
  else { failed++; console.log('FAIL ' + what + (detail ? '\n       ' + detail : '')); }
};

// ---- PART 1: the engine ---------------------------------------------------------
(function engine() {
  const factsFile = path.join(ENGINE, 'real-engine', '0_script_file_facts.js');
  const truthFile = path.join(ENGINE, 'truth', 'engine-facts.txt');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(factsFile, 'utf8'), ctx);
  const cases = ctx.SCRIPT_FILE_CASES;
  const truth = new Map();
  for (const line of fs.readFileSync(truthFile, 'utf8').split(/\r?\n/)) {
    const m = /^((?:script file|script sort|handler order): .*?) :: typeof=string value=(.*)$/.exec(line);
    if (m) truth.set(m[1], m[2]);
  }
  ok(truth.size > 0, 'the truth file holds script-file facts (' + truth.size + ')');
  const answered = new Set();
  const hold = (label, mine) => {
    answered.add(label);
    if (!truth.has(label)) { ok(false, 'engine: ' + label, 'no recorded answer: run `python .minecraft/dev/engine-tests/run.py real-engine record`'); return; }
    ok(truth.get(label) === mine, 'engine: ' + label, 'the engine said  ' + truth.get(label) + '\n       the model says   ' + mine);
  };
  for (const c of cases.parse) {
    const e = M.engineFile(c.lines.join('\n'));
    let mine;
    if (e.error) mine = 'DOES NOT LOAD java.lang.NumberFormatException';
    else {
      mine = 'priority=' + e.priority + ' skipped=' + (e.skip === '' ? 'no' : 'yes');
      if (c.cond !== true) mine += ' why=' + JSON.stringify(e.skip);
      for (const k of c.keys) mine += ' ' + k + '=' + JSON.stringify(Object.prototype.hasOwnProperty.call(e.props, k) ? e.props[k][e.props[k].length - 1] : '<not set>');
      // the probe can only ask for keys by name: a key the model finds and the case does not ask for is unproven
      const extra = Object.keys(e.props).filter((k) => !c.keys.includes(k));
      ok(extra.length === 0, 'engine: ' + c.label + ' (the model finds no property the case does not ask for)', 'unasked: ' + extra.join(', '));
    }
    hold('script file: ' + c.label, mine);
    // and the header reader must agree with the engine on what is NOT a property: an @ line of the six fields
    const h = M.readHeader(c.lines.join('\n'));
    if (/^@(after|file|events|registry|live|last)( |$)/.test(c.label) && c.label.indexOf('colon') < 0 && c.label.indexOf('one word') < 0) {
      ok(h.has.size === 1 && h.problems.length === 0 && Object.keys(e.props).length === 0, 'header: `' + c.lines[0] + '` is a header field and no file property', h.problems.join('; '));
    }
    if (c.label === '@after with a colon') ok(h.has.size === 0 && h.problems.length === 1, 'header: `// @after: x` is refused with a message (a field has no colon); it is no file property either', h.problems.join('; '));
    if (c.label === '@after with one word') ok(h.fields.after.length === 0 && h.problems.length === 1, 'header: `// @after boss_hp` is refused with a message (a path with .js is wanted); it is no file property either', h.problems.join('; '));
  }
  for (const c of cases.sort) {
    hold('script sort: ' + c.label, M.engineSort(c.files, (f) => (f[1] === null ? 0 : f[1])).map((f) => f[0]).join(' '));
  }
  (function twoHundred() {
    const files = [];
    for (let n = 0; n < 200; n++) files.push(['s' + String(n).padStart(3, '0') + '.js', (n % 7 === 0) ? 3 : ((n % 5 === 0) ? -2 : 0)]);
    const out = M.engineSort(files, (f) => f[1]);
    let good = true;
    for (let i = 1; i < out.length; i++) if (out[i][1] > out[i - 1][1] || (out[i][1] === out[i - 1][1] && out[i][0] < out[i - 1][0])) good = false;
    hold('script sort: 200 files of three priorities come out highest first, each priority in the order it went in', good + ' (' + out.length + ' files)');
  })();
  hold('handler order: handlers registered for a target run before the untargeted ones, each group in registration order',
    M.handlerOrder([{ n: 'A:untargeted', target: '' }, { n: 'B:time', target: 'time' }, { n: 'C:untargeted', target: '' }, { n: 'D:time', target: 'time' }], 'time').map((h) => h.n).join(' '));
  for (const label of truth.keys()) ok(answered.has(label), 'engine: the recorded fact `' + label + '` is put to the model');
  // the walk: NTFS lists a folder upper-cased, code unit by code unit, folders and files interleaved
  const names = ['zz_x.js', 'zzz_x.js', 'affix_x.js', 'affixes', 'loot_overhaul.js', 'lootjs_overhaul.js', '0_lib.js', '00_guard.js', 'Zeta.js', 'a.js'];
  ok(names.slice().sort(M.ntfsCompare).join(' ') === '00_guard.js 0_lib.js a.js affixes affix_x.js lootjs_overhaul.js loot_overhaul.js Zeta.js zzz_x.js zz_x.js',
    'walk: the NTFS order of names (letters before `_`, so zzz_ before zz_ and lootjs_ before loot_)', names.slice().sort(M.ntfsCompare).join(' '));
})();

// ---- PART 2: planted defects -------------------------------------------------------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'icraft-load-order-'));
let packNo = 0;
const GUARD = '// priority: 1000\nvar icraft = (function () { var own = {}\n  own.guard = function (n, e, f) { return f }\n  own.handler = function (n, g, f) { return f }\n' +
  '  own.section = function (n, f) { f() }\n  own.live = { fired: function () {} }\n  own.lib = { announce: function () {}, need: function () { return true } }\n  return own })()\n';
// files: { '<type>/<rel>': text } written to all three trees; only: { '<tree>:<type>/<rel>': text } to one tree
function pack(files, only) {
  const dir = path.join(TMP, 'pack' + (++packNo));
  const put = (tree, key, text) => {
    const [type, ...rest] = key.split('/');
    const f = path.join(dir, M.TREES[tree], type + '_scripts', rest.join('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  };
  for (const tree of Object.keys(M.TREES)) {
    put(tree, 'server/00_icraft_guard.js', GUARD);
    for (const k of Object.keys(files)) put(tree, k, files[k]);
  }
  for (const k of Object.keys(only || {})) { const [tree, key] = k.split(':'); put(tree, key, only[k]); }
  return dir;
}
const run = (files, opts, only) => L.check(M.readPack(pack(files, only)), opts || {});
const codes = (res) => res.errors.map((e) => e.code + ' ' + (e.type ? e.type + ':' : '') + e.script).sort().join(' | ');
const expectCodes = (what, res, want) => ok(codes(res) === want, 'check: ' + what, 'expected  ' + (want || '(no failure)') + '\n       reported  ' + (codes(res) || '(no failure)') + (res.errors.length ? '\n       ' + res.errors.map((e) => e.text).join('\n       ') : ''));

const LIB = 'global.icraft = global.icraft || {}\nglobal.icraft.core = { now: function () { return 0 } }\nicraft.lib.announce(\'core\')\n';
const USER = 'var core = global.icraft.core\nServerEvents.loaded(icraft.guard(\'feature\', \'ServerEvents.loaded\', function (event) { core.now() }))\n';

expectCodes('a library with a priority and a script that reads it while loading: nothing to report',
  run({ 'server/0_lib_core.js': '// priority: 900\n' + LIB, 'server/feature.js': USER }), '');
(function () {
  const res = run({ 'server/0_lib_core.js': '// priority: 900\n' + LIB, 'server/feature.js': USER });
  const c = res.constraints.find((x) => x.script === 'feature.js' && x.after === '0_lib_core.js');
  ok(!!c && c.basis === 'load' && c.held === 'priority' && c.names.join() === 'icraft.core', 'check: that order is found in the code and is held by priority', JSON.stringify(c));
})();
expectCodes('the same library WITHOUT a priority: only its name keeps it first, and the reader has not declared it',
  run({ 'server/0_lib_core.js': LIB, 'server/feature.js': USER }), 'undeclared server:feature.js');
expectCodes('... declared with @after: accepted',
  run({ 'server/0_lib_core.js': LIB, 'server/feature.js': '// @after 0_lib_core.js\n' + USER }), '');
expectCodes('a script that reads a global while it loads, and the script that sets it loads AFTER it',
  run({ 'server/a_reader.js': 'var t = global.TABLE\n', 'server/b_setter.js': 'global.TABLE = {}\n' }), 'order server:a_reader.js');
expectCodes('... and an @after line does not make it true',
  run({ 'server/a_reader.js': '// @after b_setter.js\nvar t = global.TABLE\n', 'server/b_setter.js': 'global.TABLE = {}\n' }), 'order server:a_reader.js | order server:a_reader.js');
expectCodes('zzz_x.js loads BEFORE zz_x.js on NTFS: an @after written the other way round fails',
  run({ 'server/zz_x.js': 'global.Z = 1\n', 'server/zzz_x.js': '// @after zz_x.js\nvar z = global.Z\n' }), 'order server:zzz_x.js | order server:zzz_x.js');
expectCodes('a folder sorts before a file with the same beginning (affixes/ before affix_x.js)',
  run({ 'server/affixes/set.js': 'global.A = 1\n', 'server/affix_x.js': '// @after affixes/set.js\nvar a = global.A\n' }), '');
expectCodes('a global set inside a handler and read inside a handler of the SAME event, the reader first',
  run({ 'server/a_reader.js': 'LootJS.modifiers(icraft.guard(\'a_reader\', \'LootJS.modifiers\', function (e) { var b = global.BOOKS }))\n',
    'server/b_setter.js': 'LootJS.modifiers(icraft.guard(\'b_setter\', \'LootJS.modifiers\', function (e) { global.BOOKS = [] }))\n' }), 'order server:a_reader.js');
expectCodes('... the setter first, undeclared',
  run({ 'server/b_reader.js': 'LootJS.modifiers(icraft.guard(\'b_reader\', \'LootJS.modifiers\', function (e) { var b = global.BOOKS }))\n',
    'server/a_setter.js': 'LootJS.modifiers(icraft.guard(\'a_setter\', \'LootJS.modifiers\', function (e) { global.BOOKS = [] }))\n' }), 'undeclared server:b_reader.js');
expectCodes('a global set inside a handler and read inside a handler of ANOTHER event: no order between the scripts',
  run({ 'server/a_reader.js': 'ServerEvents.loaded(icraft.guard(\'a_reader\', \'ServerEvents.loaded\', function (e) { var b = global.BOOKS }))\n',
    'server/b_setter.js': 'LootJS.modifiers(icraft.guard(\'b_setter\', \'LootJS.modifiers\', function (e) { global.BOOKS = [] }))\n' }), '');
expectCodes('a global read while loading that its setter only sets inside a handler',
  run({ 'server/b_reader.js': 'var b = global.BOOKS\n', 'server/a_setter.js': 'LootJS.modifiers(icraft.guard(\'a_setter\', \'LootJS.modifiers\', function (e) { global.BOOKS = [] }))\n' }), 'order server:b_reader.js');
expectCodes('a global read inside a handler and set at load by a LATER script: fine, no order needed',
  run({ 'server/a_reader.js': 'ServerEvents.loaded(icraft.guard(\'a_reader\', \'ServerEvents.loaded\', function (e) { var t = global.TABLE }))\n', 'server/b_setter.js': 'global.TABLE = {}\n' }), '');
expectCodes('only `typeof global.X` is read: an optional use is no dependency',
  run({ 'server/a_reader.js': 'if (typeof global.TABLE === \'object\') console.log(1)\n', 'server/b_setter.js': 'global.TABLE = {}\n' }), '');
expectCodes('`global.X = global.X || {}` depends on nobody',
  run({ 'server/a.js': 'global.NS = global.NS || {}\n', 'server/b.js': 'global.NS = global.NS || {}\n' }), '');
expectCodes('a function of the file that is CALLED while it loads runs at load (its read counts)',
  run({ 'server/a_reader.js': 'function setup() { return global.TABLE.size }\nsetup()\n', 'server/b_setter.js': 'global.TABLE = {}\n' }), 'order server:a_reader.js');
expectCodes('a global nobody sets',
  run({ 'server/a.js': 'ServerEvents.loaded(icraft.guard(\'a\', \'ServerEvents.loaded\', function (e) { global.ICRAFT_TYPO.go() }))\n' }), 'unset server:a.js');
expectCodes('a top-level name of another script used while loading, that script loading later',
  run({ 'server/a_user.js': 'var x = SHARED_TABLE.length\n', 'server/b_owner.js': 'var SHARED_TABLE = []\n' }), 'order server:a_user.js');
expectCodes('a server script reading, at load, a global a STARTUP script sets: startup scripts load first',
  run({ 'server/a.js': 'var t = global.FROM_STARTUP\n', 'startup/s.js': 'global.FROM_STARTUP = 1\n' }), '');
expectCodes('a startup script reading, at load, a global a SERVER script sets: it is not there yet',
  run({ 'startup/s.js': 'var t = global.FROM_SERVER\n', 'server/a.js': 'global.FROM_SERVER = 1\n' }), 'order startup:s.js');

const H1 = 'EntityEvents.spawned(icraft.guard(\'a_first\', \'EntityEvents.spawned\', function (e) { }))\n';
const H2 = 'EntityEvents.spawned(icraft.guard(\'b_second\', \'EntityEvents.spawned\', function (e) { }))\n';
expectCodes('@after between two handlers of one event, with its reason',
  run({ 'server/a_first.js': H1, 'server/b_second.js': '// @after a_first.js  it reads the health a_first sets\n' + H2 }), '');
expectCodes('@after between two handlers of one event WITHOUT a reason',
  run({ 'server/a_first.js': H1, 'server/b_second.js': '// @after a_first.js\n' + H2 }), 'after server:b_second.js');
expectCodes('@after a script it shares nothing with',
  run({ 'server/a_first.js': 'ServerEvents.loaded(icraft.guard(\'a_first\', \'ServerEvents.loaded\', function (e) { }))\n', 'server/b_second.js': '// @after a_first.js  because\n' + H2 }), 'after server:b_second.js');
expectCodes('@after a script that does not exist',
  run({ 'server/b_second.js': '// @after a_gone.js  it was here once\n' + H2 }), 'after server:b_second.js');
expectCodes('@after itself', run({ 'server/b_second.js': '// @after b_second.js  no\n' + H2 }), 'after server:b_second.js');
expectCodes('@after below the first line of code is not a header field',
  run({ 'server/a_first.js': H1, 'server/b_second.js': H2 + '// @after a_first.js  too late\n' }), 'header server:b_second.js');
expectCodes('a misspelt field (@depends)',
  run({ 'server/a_first.js': H1, 'server/b_second.js': '// @depends a_first.js\n' + H2 }), 'header server:b_second.js');
expectCodes('prose that begins with an @word is left alone',
  run({ 'server/b_second.js': '// @monster entity tag" and accepted the fallback\n// @Mod.EventBusSubscriber owns it\n' + H2 }), '');

// `@last <event>`: the handler of this script is the last one of that event (decision list entry 52). No script
// can be named ("after every script that registers the event"), so the check looks at every later script.
const LOOT = (name) => 'LootJS.modifiers(icraft.guard(\'' + name + '\', \'LootJS.modifiers\', function (e) { }))\n';
const STRIP = '// @last LootJS.modifiers\n' + LOOT('loot/zz_strip');
expectCodes('@last on the script that is the last one of its event',
  run({ 'server/loot/add.js': LOOT('loot/add'), 'server/loot/zz_strip.js': STRIP }), '');
(function lastIsRecorded() {
  const res = run({ 'server/loot/add.js': LOOT('loot/add') + LOOT('loot/add#2'), 'server/loot/zz_strip.js': STRIP });
  const l = res.lasts;
  ok(l.length === 1 && l[0].script === 'loot/zz_strip.js' && l[0].group === 'LootJS.modifiers' && l[0].handlersBefore === 2 && l[0].own === 1 && l[0].trees.length === 3,
    'check: a declared @last is reported with the registrations in front of it', JSON.stringify(l));
})();
expectCodes('@last, and a NEW script whose name lists later registers the event (zz_v.js after zz_strip.js)',
  run({ 'server/loot/add.js': LOOT('loot/add'), 'server/loot/zz_strip.js': STRIP, 'server/loot/zz_v.js': LOOT('loot/zz_v') }), 'last server:loot/zz_strip.js');
expectCodes('@last, and a script outside the folder registers the event later (a root-level script after loot/)',
  run({ 'server/loot/zz_strip.js': STRIP, 'server/more_loot.js': LOOT('more_loot') }), 'last server:loot/zz_strip.js');
expectCodes('zzz_x.js lists BEFORE zz_x.js on NTFS: a zzz_ script does not break an @last',
  run({ 'server/loot/zz_strip.js': STRIP, 'server/loot/zzz_clamp.js': LOOT('loot/zzz_clamp') }), '');
expectCodes('a later script that registers ANOTHER event does not break an @last',
  run({ 'server/loot/zz_strip.js': STRIP, 'server/zz_other.js': H1 }), '');
expectCodes('@last naming an event the script does not register',
  run({ 'server/loot/zz_strip.js': '// @last ServerEvents.recipes\n' + LOOT('loot/zz_strip') }), 'last server:loot/zz_strip.js');
expectCodes('two scripts declare @last on one event: the one that loads first fails',
  run({ 'server/loot/a.js': '// @last LootJS.modifiers\n' + LOOT('loot/a'), 'server/loot/b.js': '// @last LootJS.modifiers\n' + LOOT('loot/b') }), 'last server:loot/a.js');
expectCodes('@last without a value', run({ 'server/loot/zz_strip.js': '// @last\n' + LOOT('loot/zz_strip') }), 'header server:loot/zz_strip.js');
expectCodes('a misspelt field (@final)', run({ 'server/loot/zz_strip.js': '// @final LootJS.modifiers\n' + LOOT('loot/zz_strip') }), 'header server:loot/zz_strip.js');
(function lastAccepted() {
  const files = { 'server/loot/zz_strip.js': STRIP, 'server/loot/zz_v.js': LOOT('loot/zz_v') };
  const res = run(files, { accepted: [{ code: 'last', script: 'server:loot/zz_strip.js', on: 'server:loot/zz_v.js', reason: 'a known finding, reported' }] });
  ok(res.errors.length === 0 && res.accepted.length === 1, 'check: a broken @last can be an accepted finding, named by both scripts', codes(res));
})();

const FULL = '// @file kubejs/server_scripts/items/thing.js\n// @events EntityEvents.spawned, tick.server\n// @registry bosses\n// @live thing-done\n';
const BODY = 'EntityEvents.spawned(icraft.guard(\'items/thing\', \'EntityEvents.spawned\', function (e) { if (icraft.bosses.is(e.entity)) icraft.live.fired(\'thing-done\') }))\n' +
  'global.registerServerTick(\'tick_thing\', 20, 0, function (e) { })\n';
const WITH_LIBS = { 'server/0_tick_master.js': '// priority: 840\nglobal.registerServerTick = function () {}\n', 'server/0_lib_registry.js': '// priority: 860\nglobal.icraft = global.icraft || {}\nglobal.icraft.bosses = { is: function () { return false } }\n' };
const NONE = { grandfathered: { startup: [], server: ['00_icraft_guard.js', '0_tick_master.js', '0_lib_registry.js'], client: [] } };
expectCodes('a new script with all its header fields', run(Object.assign({ 'server/items/thing.js': FULL + BODY }, WITH_LIBS), NONE), '');
expectCodes('a new script WITHOUT header fields', run(Object.assign({ 'server/items/thing.js': BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('... the same script on the grandfather list: not asked for a header', run(Object.assign({ 'server/items/thing.js': BODY }, WITH_LIBS),
  { grandfathered: { startup: [], server: ['00_icraft_guard.js', '0_tick_master.js', '0_lib_registry.js', 'items/thing.js'], client: [] } }), '');
expectCodes('@file that is not the file', run(Object.assign({ 'server/items/thing.js': FULL.replace('items/thing.js', 'items/other.js') + BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('@events that are not the events', run(Object.assign({ 'server/items/thing.js': FULL.replace(', tick.server', '') + BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('@registry that the code does not read', run(Object.assign({ 'server/items/thing.js': FULL.replace('bosses', 'bosses, dimensions') + BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('@live that the code does not report', run(Object.assign({ 'server/items/thing.js': FULL.replace('thing-done', 'thing-gone') + BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('a new script that reads a registry and has no @registry', run(Object.assign({ 'server/items/thing.js': FULL.replace('// @registry bosses\n', '') + BODY }, WITH_LIBS), NONE), 'header server:items/thing.js');
expectCodes('a grandfathered script that has its header now must leave the list', run(Object.assign({ 'server/items/thing.js': FULL + BODY }, WITH_LIBS),
  { grandfathered: { startup: [], server: ['00_icraft_guard.js', '0_tick_master.js', '0_lib_registry.js', 'items/thing.js'], client: [] } }), 'grandfathered server:items/thing.js');
expectCodes('a grandfathered script that is gone must leave the list', run({}, { grandfathered: { startup: [], server: ['00_icraft_guard.js', 'gone.js'], client: [] } }), 'grandfathered server:gone.js');

expectCodes('a comment line that switches the file off (`// ignored true`)', run({ 'server/a.js': '// ignored true\nvar a = 1\n' }), 'engine server:a.js');
expectCodes('a priority that is not a number: the file does not load', run({ 'server/a.js': '// priority: high\nvar a = 1\n' }), 'engine server:a.js');
expectCodes('a byte order mark in front of the first line', run({ 'server/a.js': String.fromCharCode(0xFEFF) + '// priority: 5\nvar a = 1\n' }), 'engine server:a.js');
expectCodes('a file that is not UTF-8', run({ 'server/a.js': Buffer.from([0x76, 0x61, 0x72, 0x20, 0x61, 0x20, 0x3d, 0x20, 0x27, 0xe9, 0x27, 0x0a]) }), 'engine server:a.js');
expectCodes('a file that does not parse', run({ 'server/a.js': 'var = \n' }), 'engine server:a.js');
expectCodes('two files whose names differ only by case', run({ 'server/Thing.js': 'var a1 = 1\n', 'server/thing.js': 'var a2 = 1\n' }),
  process.platform === 'win32' ? '' : 'engine server_distribution/kubejs/server_scripts/thing.js | engine distribution/client/kubejs/server_scripts/thing.js | engine kubejs/server_scripts/thing.js'.split(' | ').sort().join(' | '));

expectCodes('icraft.lib.need of a library nobody announces', run({ 'server/a.js': 'if (!icraft.lib.need(\'ghost\', \'a\')) console.log(1)\n' }), 'library server:a.js');
expectCodes('icraft.lib.need while loading, of a library that loads later',
  run({ 'server/a.js': 'if (!icraft.lib.need(\'late\', \'a\')) console.log(1)\n', 'server/b.js': 'icraft.lib.announce(\'late\')\n' }), 'library server:a.js');
expectCodes('one library name announced by two scripts', run({ 'server/a.js': 'icraft.lib.announce(\'twin\')\n', 'server/b.js': 'icraft.lib.announce(\'twin\')\n' }), 'library server:b.js');
expectCodes('a library announced inside a function that runs later',
  run({ 'server/a.js': 'ServerEvents.loaded(icraft.guard(\'a\', \'ServerEvents.loaded\', function (e) { icraft.lib.announce(\'slow\') }))\n' }), 'library server:a.js');

(function acceptedList() {
  const files = { 'server/a_reader.js': 'var t = global.TABLE\n', 'server/b_setter.js': 'global.TABLE = {}\n' };
  const acc = [{ code: 'order', script: 'server:a_reader.js', on: 'server:b_setter.js', reason: 'a known finding, reported' }];
  const res = run(files, { accepted: acc });
  ok(res.errors.length === 0 && res.accepted.length === 1 && res.accepted[0].reason === 'a known finding, reported', 'check: an accepted finding is not a failure and is still reported', codes(res));
  expectCodes('an accepted entry that matches nothing fails (the list cannot rot)', run({ 'server/b_setter.js': 'global.TABLE = {}\n' }, { accepted: acc }), 'accepted accepted.json');
})();
(function oneTree() {
  const res = run({ 'server/a_reader.js': 'var a = 1\n', 'server/b_setter.js': 'global.TABLE = {}\n' }, {}, { 'server:server/a_reader.js': 'var t = global.TABLE\n' });
  ok(res.errors.length === 1 && res.errors[0].trees.join() === 'server', 'check: a defect of ONE tree is reported for that tree', JSON.stringify(res.errors.map((e) => [e.code, e.trees])));
})();
(function logCompare() {
  const log = '[x] Loaded script server_scripts:00_icraft_guard.js in 0.1 s\n[x] Loaded script server_scripts:a.js in 0.0 s\n[x] Loaded script server_scripts:b.js in 0.0 s\n[x] Loaded script server_scripts:a.js in 0.0 s\n';
  ok(JSON.stringify(L.loadedOrder(log)) === '{"server":["00_icraft_guard.js","a.js","b.js"]}', 'log: the `Loaded script` lines of a log, first load only');
})();
(function claimLines() {
  const model = M.readPack(pack({ 'server/a.js': '// this file must load before b.js\nvar a = 1 // not a claim\n// alphabetical order matters\n' }));
  ok(L.claims(model, 'root').map((c) => c.line).join() === '1,3', 'claims: comment lines that talk about order are listed for a reader');
})();

// ---- PART 3: the template ------------------------------------------------------------
(function template() {
  const file = path.join(__dirname, 'script_template.js');
  if (!fs.existsSync(file)) { ok(false, 'template: dev/catalogue/script_template.js exists'); return; }
  const text = fs.readFileSync(file, 'utf8');
  const e = M.engineFile(text);
  ok(Object.keys(e.props).length === 0 && e.skip === '' && e.error === '', 'template: no line of the template is a file property for the engine', JSON.stringify(e.props));
  const libs = {
    'server/0_lib_core.js': '// priority: 880\nglobal.icraft = global.icraft || {}\nglobal.icraft.core = { warnOnce: function () {}, entityId: function () { return \'\' }, now: function () { return 0 } }\nicraft.lib.announce(\'core\')\n',
    'server/0_lib_registry.js': '// priority: 860\nglobal.icraft = global.icraft || {}\nglobal.icraft.bosses = { is: function () { return false } }\nglobal.icraft.dims = { tier: function () { return 1 } }\nicraft.lib.announce(\'registry\')\n',
    'server/0_tick_master.js': '// priority: 840\nglobal.registerServerTick = function () {}\nglobal.registerPlayerTick = function () {}\nicraft.lib.announce(\'ticks\')\n'
  };
  const res = run(Object.assign({ 'server/items/my_script.js': text }, libs), { grandfathered: { startup: [], server: ['00_icraft_guard.js', '0_lib_core.js', '0_lib_registry.js', '0_tick_master.js'], client: [] } });
  expectCodes('the template, saved as server_scripts/items/my_script.js, is a new script that passes', res, '');
})();

fs.rmSync(TMP, { recursive: true, force: true });
console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
