// lint_kubejs_traps.js -- flag script patterns that are valid JavaScript, load without an error,
// and never do what they say on this pack's engine (rhino 2001.2.3 / KubeJS 2001.6.5).
//
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js              # all kubejs scripts
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js a.js b.js    # just these
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --exceptions # also list every recorded exception
//
// Exit code 0 clean, 1 when anything is flagged, 2 when the lint could not run (no parser, unreadable
// exceptions file). Blocking in the pre-push hook (install-hooks.ps1), next to lint_kubejs_rhino.js
// (engine quirks) and lint_kubejs_scope.py (shared top-level names). Every rule below was a dead
// feature in this pack (2026-10-09 to 10-11 audit); none of them writes a line to any log.
//
//   SRC-ENTITY      source.entity / .getEntity() / .directEntity / .getDirectEntity() on a damage source
//                                                    -> undefined: the names are `actual` / `immediate`
//   SRC-TYPE        source.type used as a value       -> undefined: use getType() (or the msgId)
//   GAME-TIME       x.gameTime / x.getGameTime() on a level -> undefined / not a function: the name is `time`
//                   (levelData.gameTime is the real field and is not flagged)
//   CANCEL-IN-TRY   event.cancel() inside a try       -> cancel() works by throwing; the catch swallows it
//   AFTER-EXIT      a statement after event.cancel() / success() / exit() in the same block
//                                                    -> never runs (the call throws); bare `return` is ignored
//   NAME-SELECTOR   a command string with `if entity <name>[...]` -> a player NAME takes no [..] filter; the
//                   command fails to parse and the test is always false. Use `@a[name=..,..]` or script-side checks
//   TICK-OFFSET     registerServerTick / registerPlayerTick(name, interval, offset, fn) with offset >= interval
//                                                    -> `tick % interval === offset` is never true
//   MATH-CONST      Math.PI / Math.E / ...            -> undefined on this engine (the functions are fine)
//   NO-SUCH-METHOD  .getInternal() / .getItemSlot() / .isInstance() -> "not a function"
//
// Recorded exceptions (lint_kubejs_traps.exceptions.json, next to this file) are data, each with a reason:
//   * an entry tolerates exactly `count` sites of one rule in one file. One more site and the whole
//     file+rule is flagged; one fewer and the entry itself is flagged (STALE-EXCEPTION), so an exception
//     cannot outlive the code it was written for and quietly cover a new site.
//   * the `source.actual`-first fallback (`src.actual !== undefined ? src.actual : src.entity`, or any
//     function that reads `<same object>.actual` before the `.entity` read) is recognised structurally and
//     counted as a recorded exception rather than a flag: it is harmless, the second branch never wins.
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
catch (e) {
  console.error('[trap-lint] CANNOT RUN: the bundled parser is not reachable (' + e.message + '). Run with: node --expose-internals ' + __filename);
  process.exit(2);
}
const fs = require('fs');
const path = require('path');

const SOURCE_ID = /^(source|src|damageSource|dmgSource|dmgSrc)$/;
const MATH_CONST = new Set(['PI', 'E', 'SQRT2', 'SQRT1_2', 'LN2', 'LN10', 'LOG2E', 'LOG10E']);
const NO_SUCH_METHOD = new Set(['getInternal', 'getItemSlot', 'isInstance']);
const EXIT_CALLS = new Set(['cancel', 'success', 'exit']);
const TICK_REG = new Set(['registerServerTick', 'registerPlayerTick']);
const NAME_SELECTOR = /\b(?:if|unless) entity (?!@)[^\s\[]*\[/;

const isFn = (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';

function dotted(n) {
  if (!n) return '?';
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'MemberExpression') return dotted(n.object) + (n.computed ? '[]' : '.' + n.property.name);
  if (n.type === 'CallExpression') return dotted(n.callee) + '()';
  return '?';
}
// string as the game will see it, with every non-literal part replaced by ${}
function flat(n) {
  if (!n) return '${}';
  if (n.type === 'Literal') return typeof n.value === 'string' ? n.value : String(n.raw);
  if (n.type === 'TemplateLiteral') { let s = ''; n.quasis.forEach((q, i) => { s += q.value.cooked; if (i < n.expressions.length) s += '${}'; }); return s; }
  if (n.type === 'BinaryExpression' && n.operator === '+') return flat(n.left) + flat(n.right);
  return '${}';
}
function isSourceObj(n) {
  if (!n) return false;
  if (n.type === 'Identifier') return SOURCE_ID.test(n.name);
  if (n.type === 'MemberExpression' && !n.computed) return n.property.name === 'source' || n.property.name === 'damageSource';
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) return n.callee.property.name === 'getSource';
  return false;
}
function isLevelData(n) {
  if (!n) return false;
  if (n.type === 'Identifier') return n.name === 'levelData';
  if (n.type === 'MemberExpression' && !n.computed) return n.property.name === 'levelData';
  if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) return n.callee.property.name === 'getLevelData';
  return false;
}
// `x.cancel()` / `x.success(..)` / `x.exit(..)` as a whole statement
function exitCall(stmt) {
  if (!stmt || stmt.type !== 'ExpressionStatement') return null;
  const c = stmt.expression;
  if (c.type !== 'CallExpression' || c.callee.type !== 'MemberExpression' || c.callee.computed) return null;
  const p = c.callee.property.name;
  if (!EXIT_CALLS.has(p)) return null;
  if (p === 'cancel' && c.arguments.length !== 0) return null;
  return dotted(c.callee) + '()';
}
// dead either way, and harmless: `event.cancel(); return`
const isInert = (s) => s.type === 'EmptyStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement' ||
  (s.type === 'ReturnStatement' && (!s.argument || s.argument.type === 'Literal' || s.argument.type === 'Identifier'));

// relative key used in the exceptions file: the path below .../kubejs/
function relKey(file) {
  const p = path.resolve(file).split(path.sep).join('/');
  const i = p.lastIndexOf('/kubejs/');
  return i >= 0 ? p.slice(i + '/kubejs/'.length) : p.split('/').slice(-2).join('/');
}

function lint(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sites = [];      // { rule, line, msg }
  const idiom = [];      // fallback-idiom sites (recorded exception, structural)
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
  catch (e) { return { sites: [{ rule: 'PARSE-FAIL', line: 0, msg: e.message + ' (a file that does not parse cannot be checked)' }], idiom }; }
  const site = (rule, node, msg) => sites.push({ rule, line: node.loc.start.line, msg });

  // pass 1: per function, where `<object>.actual` is read (for the fallback idiom)
  const actualReads = new Map(); // function node (or null) -> [{ obj, pos }]
  (function collect(node, fn) {
    if (!node || typeof node.type !== 'string') return;
    if (isFn(node)) fn = node;
    if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'actual') {
      if (!actualReads.has(fn)) actualReads.set(fn, []);
      actualReads.get(fn).push({ obj: dotted(node.object), pos: node.start });
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') collect(c, fn); }
      else if (v && typeof v.type === 'string') collect(v, fn);
    }
  })(ast, null);
  const actualFirst = (fn, objNode, pos) => (actualReads.get(fn) || []).some(r => r.obj === dotted(objNode) && r.pos < pos);

  function afterExit(list) {
    for (let i = 0; i < list.length; i++) {
      const call = exitCall(list[i]);
      if (!call) continue;
      const next = list.slice(i + 1).find(s => !isInert(s));
      if (next) site('AFTER-EXIT', list[i], call + ' throws to leave the handler: the statement at line ' + next.loc.start.line + ' (and the rest of this block) never runs. Do the work first, call it last');
    }
  }

  // ctx: { fn, tryDepth (within fn), inConcat }
  function visit(node, parent, ctx, key) {
    if (!node || typeof node.type !== 'string') return;
    let c = ctx;
    if (isFn(node)) c = { fn: node, tryDepth: 0, inConcat: false };
    else if (c.inConcat && !(node.type === 'BinaryExpression' && node.operator === '+') && node.type !== 'Literal') c = { fn: c.fn, tryDepth: c.tryDepth, inConcat: false };

    switch (node.type) {
      case 'Program': case 'BlockStatement': afterExit(node.body); break;
      case 'SwitchCase': afterExit(node.consequent); break;
      case 'TryStatement': {
        visit(node.block, node, { fn: c.fn, tryDepth: c.tryDepth + (node.handler ? 1 : 0), inConcat: false }, 'block');
        if (node.handler) visit(node.handler, node, c, 'handler');
        if (node.finalizer) visit(node.finalizer, node, c, 'finalizer');
        return;
      }
      case 'MemberExpression': {
        if (!node.computed && node.property.type === 'Identifier') {
          const p = node.property.name;
          const isCallee = !!parent && parent.type === 'CallExpression' && key === 'callee';
          if (isSourceObj(node.object)) {
            if (p === 'entity' || p === 'directEntity' || (isCallee && (p === 'getEntity' || p === 'getDirectEntity'))) {
              const text = dotted(node) + (isCallee ? '()' : '');
              if (p === 'entity' && !isCallee && actualFirst(c.fn, node.object, node.start)) idiom.push({ line: node.loc.start.line, text });
              else site('SRC-ENTITY', node, text + ' is undefined for scripts: the attacker is `.actual`, the projectile `.immediate` (or global.icraft.core)');
            }
            if (p === 'type' && !isCallee) site('SRC-TYPE', node, dotted(node) + ' is undefined for scripts: call getType() (or compare the msgId)');
          }
          if ((p === 'gameTime' || (p === 'getGameTime' && isCallee)) && !isLevelData(node.object))
            site('GAME-TIME', node, dotted(node) + (isCallee ? '()' : '') + ' does not exist on a level for scripts (KubeJS renames it): use level.time, or global.icraft.core for the world clock');
          if (node.object.type === 'Identifier' && node.object.name === 'Math' && MATH_CONST.has(p))
            site('MATH-CONST', node, 'Math.' + p + ' is undefined on this engine: write the number');
        }
        break;
      }
      case 'CallExpression': {
        const cal = node.callee;
        const name = cal.type === 'MemberExpression' && !cal.computed && cal.property.type === 'Identifier' ? cal.property.name
          : (cal.type === 'Identifier' ? cal.name : null);
        if (cal.type === 'MemberExpression' && name === 'cancel' && node.arguments.length === 0 && c.tryDepth > 0)
          site('CANCEL-IN-TRY', node, dotted(cal) + '() works by throwing; inside a try the catch swallows it and nothing is cancelled. Set a flag in the try, cancel after it');
        if (cal.type === 'MemberExpression' && NO_SUCH_METHOD.has(name))
          site('NO-SUCH-METHOD', node, '.' + name + '() does not exist for scripts on this KubeJS ("not a function")');
        if (name && TICK_REG.has(name)) {
          const a = node.arguments;
          const iv = a[1] && a[1].type === 'Literal' && typeof a[1].value === 'number' ? a[1].value : null;
          const off = a[2] && a[2].type === 'Literal' && typeof a[2].value === 'number' ? a[2].value : null;
          if (iv !== null && off !== null && off >= iv)
            site('TICK-OFFSET', node, name + '(' + (a[0] && a[0].type === 'Literal' ? JSON.stringify(a[0].value) : '..') + ', ' + iv + ', ' + off + '): offset >= interval, so it never fires');
        }
        break;
      }
      case 'Literal': case 'TemplateLiteral': case 'BinaryExpression': {
        const stringish = node.type === 'TemplateLiteral' || (node.type === 'Literal' && typeof node.value === 'string') ||
          (node.type === 'BinaryExpression' && node.operator === '+');
        if (stringish && !c.inConcat) {
          if (NAME_SELECTOR.test(flat(node)))
            site('NAME-SELECTOR', node, '`if entity <name>[...]`: a player name takes no [..] filter, the command never parses and the test is always false');
          if (node.type === 'BinaryExpression') c = { fn: c.fn, tryDepth: c.tryDepth, inConcat: true };
        }
        break;
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const ch of v) if (ch && typeof ch.type === 'string') visit(ch, node, c, k); }
      else if (v && typeof v.type === 'string') visit(v, node, c, k);
    }
  }
  visit(ast, null, { fn: null, tryDepth: 0, inConcat: false }, null);
  return { sites, idiom };
}

// ---- recorded exceptions ----
const EXC_FILE = path.join(__dirname, 'lint_kubejs_traps.exceptions.json');
let recorded;
try {
  recorded = JSON.parse(fs.readFileSync(EXC_FILE, 'utf8')).exceptions;
  if (!Array.isArray(recorded)) throw new Error('"exceptions" is not a list');
  for (const x of recorded) {
    if (typeof x.file !== 'string' || typeof x.rule !== 'string' || !(x.count > 0) || typeof x.reason !== 'string' || !x.reason.trim())
      throw new Error('every entry needs file, rule, count > 0 and a reason: ' + JSON.stringify(x));
  }
} catch (e) {
  console.error('[trap-lint] CANNOT RUN: ' + EXC_FILE + ' is unreadable (' + e.message + ')');
  process.exit(2);
}

const argv = process.argv.slice(2);
const listExceptions = argv.includes('--exceptions');
let files = argv.filter(a => !a.startsWith('--'));
const all = files.length === 0;
if (all) {
  const root = path.join(__dirname, '..', 'kubejs');
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
    }
  };
  for (const d of ['server_scripts', 'startup_scripts', 'client_scripts']) walk(path.join(root, d));
  files.sort();
  if (files.length === 0) { console.error('[trap-lint] CANNOT RUN: no scripts found under ' + root); process.exit(2); }
}

let total = 0, excused = 0;
const seenKeys = new Set();
for (const f of files) {
  const key = relKey(f);
  seenKeys.add(key);
  const res = lint(f);
  const out = [];
  const byRule = new Map();
  for (const s of res.sites) { if (!byRule.has(s.rule)) byRule.set(s.rule, []); byRule.get(s.rule).push(s); }
  const notes = [];
  for (const [rule, list] of byRule) {
    const exc = recorded.find(x => x.file === key && x.rule === rule);
    if (exc && list.length === exc.count) {
      excused += list.length;
      for (const s of list) notes.push(key + ':' + s.line + '\t' + rule + '\trecorded exception: ' + exc.reason);
      continue;
    }
    for (const s of list) out.push(key + ':' + s.line + '\t' + rule + '\t' + s.msg);
    if (exc) out.push(key + ':0\t' + rule + '\t' + list.length + ' site(s) here, the recorded exception covers exactly ' + exc.count + ': every site is shown; fix what is new, or correct the count of the entry');
  }
  for (const exc of recorded.filter(x => x.file === key && !byRule.has(x.rule)))
    out.push(key + ':0\tSTALE-EXCEPTION\t' + exc.rule + ' x' + exc.count + ' is recorded for this file and no site is left: remove the entry from ' + path.basename(EXC_FILE));
  for (const s of res.idiom) notes.push(key + ':' + s.line + '\tSRC-ENTITY\trecorded exception: ' + s.text + ' after a `.actual` read (fallback idiom, the second branch never wins)');
  excused += res.idiom.length;
  total += out.length;
  const showNotes = listExceptions && notes.length > 0;
  if (out.length || !all || showNotes) console.log((out.length ? 'FLAGS ' : (showNotes ? 'noted ' : 'clean ')) + key + (out.length ? '\n  ' + out.join('\n  ') : ''));
  if (showNotes) console.log('  ' + notes.join('\n  '));
}
// a whole-pack run also checks that every recorded exception still points at a file
if (all) for (const exc of recorded) if (!seenKeys.has(exc.file)) {
  total++;
  console.log('FLAGS ' + exc.file + '\n  ' + exc.file + ':0\tSTALE-EXCEPTION\tthe file is gone: remove the entry from ' + path.basename(EXC_FILE));
}
console.log('[trap-lint] ' + files.length + ' file(s), ' + total + ' flag(s), ' + excused + ' recorded exception(s)' + (excused && !listExceptions ? ' (--exceptions lists them)' : ''));
process.exitCode = total ? 1 : 0;
