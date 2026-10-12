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
//   SILENT-CATCH    a NEW catch that logs nothing, does not use the error and does not rethrow
//                                                    -> whatever its try block gets wrong is invisible for good
//                   (ratchet, see below; the catches that existed on 2026-10-11 are grandfathered)
//   UNGUARDED-EVENT an event registration (ServerEvents.x(..), LootJS.modifiers(..), any *Events group) whose
//                   handler is not wrapped in icraft.guard -> if it throws, KubeJS leaves the event's handler
//                   chain: every script that loads AFTER this one loses that event (one loot script silenced
//                   twelve for four months). Write
//                     ServerEvents.recipes(icraft.guard('<script>', 'ServerEvents.recipes', event => { ... }))
//                   (kubejs/*_scripts/00_icraft_guard.js). Strict: zero sites since 2026-10-12; a deliberate
//                   bare registration goes in the exceptions file with its reason.
//   GUARD-SHAPE     an icraft.guard / icraft.section call the log line cannot be trusted for:
//                     guard(name, event, handler)  name  = this script's path below *_scripts, without .js,
//                                                          plus '#2', '#3' for a second handler of the SAME
//                                                          event in the file (name + event is unique per file)
//                                                  event = the registration it is passed to, as written
//                     section(name, function)      name  = '<this script>/<part>', unique in the file
//                   -> "[icraft.guard] FAILED <name> in <event>" would point at the wrong script or event
//
// The silent-catch ratchet (operator ruling 2026-10-11). Most of the dead features of the audit sat behind a
// `catch (e) {}`: the code threw on every call and nothing ever said so. The pack had several hundred of those
// when the rule was made, so they are grandfathered by a per-file count in lint_kubejs_traps.silent_catches.json;
// from then on a file may not hold MORE unmarked silent catches than its count. A new one must either report
//   console.error('[my_script] <what failed>: ' + e)            (rare paths)
//   global.icraft.core.warnOnce('<key>', '[my_script] ...: ' + e)  (hot paths: once per boot)
// or carry a reason inside the catch:
//   } catch (e) { /* swallow-ok: getTier is absent on a client-only stub */ }
//   } catch (e) {
//     // swallow-ok: optional mod, the class is not there on a server without it
//   }
// A marked catch no longer counts. Fixing or marking old ones is welcome and never blocks; lower the counts with
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --ratchet-down
// (it only ever lowers them). The counts are never raised by a tool: that is the whole point.
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
const crypto = require('crypto');

// what counts as "the catch reported it": a console / chat / status line, or one of the pack's log helpers
const LOG_RE = /console\.|\.tell\(|\blog\w*\(|\bwarn\w*\(|\berror\w*\(|print\w*\(|tellThrottled|logOnce|statusMessage|displayClientMessage/;
const SWALLOW_OK = /swallow-ok\s*:\s*(\S.{2,})/;
const SILENT_MSG = 'a catch that hides whatever its try block gets wrong: nothing is logged, the error is not used, nothing is rethrown. ' +
  'Rule (2026-10-11): no NEW silent catch. Report it (console.error(\'[script] what failed: \' + e), or global.icraft.core.warnOnce(key, msg) on a hot path), ' +
  'or put a reason inside the catch: // swallow-ok: <why nothing can be done here>';

const SOURCE_ID = /^(source|src|damageSource|dmgSource|dmgSrc)$/;
const MATH_CONST = new Set(['PI', 'E', 'SQRT2', 'SQRT1_2', 'LN2', 'LN10', 'LOG2E', 'LOG10E']);
const NO_SUCH_METHOD = new Set(['getInternal', 'getItemSlot', 'isInstance']);
const EXIT_CALLS = new Set(['cancel', 'success', 'exit']);
const TICK_REG = new Set(['registerServerTick', 'registerPlayerTick']);
const NAME_SELECTOR = /\b(?:if|unless) entity (?!@)[^\s\[]*\[/;
// the bindings scripts register handlers on: every `<Something>Events` group, and LootJS (LootJS.modifiers)
const EVENT_GROUP = /^(?:[A-Z]\w*Events|LootJS)$/;
const isIcraftCall = (n, prop) => !!n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
  n.callee.object.type === 'Identifier' && n.callee.object.name === 'icraft' && n.callee.property.name === prop;
const strLit = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value : null;

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
  const silent = [];     // unmarked silent catches: { line, id }
  const comments = [];   // { text, start, end, line }
  let marked = 0, badMark = 0;
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true,
      onComment: (block, text, start, end, startLoc) => comments.push({ text, start, end, line: startLoc.line }) });
  } catch (e) { return { sites: [{ rule: 'PARSE-FAIL', line: 0, msg: e.message + ' (a file that does not parse cannot be checked)' }], idiom, silent, marked }; }
  const site = (rule, node, msg) => sites.push({ rule, line: node.loc.start.line, msg });

  // ---- event isolation: every registration goes through icraft.guard, and its labels are true ----
  const scriptName = relKey(file).replace(/^[^/]*_scripts\//, '').replace(/\.js$/, '');
  const guardKeys = new Set();     // '<name> in <event>' seen in this file
  const sectionNames = new Set();
  const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const guardName = new RegExp('^' + escRx(scriptName) + '(#[\\w-]+)?$');
  function checkGuard(call, ev) {
    const a = call.arguments;
    if (a.length !== 3) { site('GUARD-SHAPE', call, 'icraft.guard takes (name, event, handler): ' + a.length + ' argument(s) here'); return; }
    const name = strLit(a[0]), event = strLit(a[1]);
    if (name === null || event === null) { site('GUARD-SHAPE', call, 'icraft.guard: name and event must be string literals (the lint and the boot-log checker read them)'); return; }
    if (!guardName.test(name)) site('GUARD-SHAPE', call, "icraft.guard('" + name + "', ..): the name must be this script's own path, '" + scriptName + "' (or '" + scriptName + "#2' for a second handler of the same event)");
    if (event !== ev) site('GUARD-SHAPE', call, "icraft.guard(.., '" + event + "', ..) is passed to " + ev + ': the log line would name the wrong event');
    const k = name + ' in ' + event;
    if (guardKeys.has(k)) site('GUARD-SHAPE', call, "icraft.guard('" + name + "', '" + event + "', ..) is used twice in this file: add '#2' to the second name");
    guardKeys.add(k);
  }
  function checkSection(call) {
    const a = call.arguments;
    const name = strLit(a[0]);
    if (a.length !== 2 || name === null) { site('GUARD-SHAPE', call, "icraft.section takes ('<script>/<part>', function)"); return; }
    if (name.indexOf(scriptName + '/') !== 0 || name.length === scriptName.length + 1) site('GUARD-SHAPE', call, "icraft.section('" + name + "', ..): the name must start with this script's own path, '" + scriptName + "/'");
    if (sectionNames.has(name)) site('GUARD-SHAPE', call, "icraft.section('" + name + "', ..) is used twice in this file");
    sectionNames.add(name);
  }

  // a catch is silent when its body, comments aside, neither logs, nor names the caught error, nor rethrows
  function silentCatch(tryNode) {
    const h = tryNode.handler;
    let body = '';
    let pos = h.body.start + 1;
    for (const c of comments) {
      if (c.start < pos || c.end > h.body.end) continue;
      body += src.slice(pos, c.start) + ' ';
      pos = c.end;
    }
    body += src.slice(pos, h.body.end - 1);
    const pname = h.param && h.param.type === 'Identifier' ? h.param.name : null;
    const usesParam = !!pname && new RegExp('(^|[^\\w$])' + pname.replace(/\$/g, '\\$') + '($|[^\\w$])').test(body);
    if (LOG_RE.test(body) || usesParam || /\bthrow\b/.test(body)) return;
    // the marker sits inside the catch clause, or trails its closing brace on the same line
    const note = comments.find(c => /swallow-ok/.test(c.text) && ((c.start >= h.start && c.end <= h.end) || (c.start >= h.end && c.line === h.loc.end.line)));
    if (note) {
      if (SWALLOW_OK.test(note.text)) { marked++; return; }
      badMark++;
      site('SILENT-CATCH', h, '`swallow-ok` without a reason: write // swallow-ok: <why nothing can be done here>');
      return;
    }
    const id = crypto.createHash('sha1').update(src.slice(tryNode.start, tryNode.end).replace(/\s+/g, ' ')).digest('hex').slice(0, 8);
    silent.push({ line: h.loc.start.line, id });
  }

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
        if (node.handler) silentCatch(node);
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
        if (cal.type === 'MemberExpression' && !cal.computed && cal.object.type === 'Identifier' && EVENT_GROUP.test(cal.object.name) && node.arguments.length > 0) {
          const ev = cal.object.name + '.' + name;
          const last = node.arguments[node.arguments.length - 1];
          if (isIcraftCall(last, 'guard')) checkGuard(last, ev);
          else site('UNGUARDED-EVENT', node, ev + '(..) registers a bare handler: if it throws, the event ends for every script that loads after this one. ' +
            "Wrap it: " + ev + "(icraft.guard('" + scriptName + "', '" + ev + "', handler))");
        }
        if (isIcraftCall(node, 'section')) checkSection(node);
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
  return { sites, idiom, silent, marked };
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
const ratchetDown = argv.includes('--ratchet-down');
const ratchetSnapshot = argv.includes('--ratchet-snapshot');
const KNOWN_FLAGS = new Set(['--exceptions', '--ratchet-down', '--ratchet-snapshot']);
for (const a of argv) if (a.startsWith('--') && !KNOWN_FLAGS.has(a)) { console.error('[trap-lint] CANNOT RUN: unknown option ' + a); process.exit(2); }
let files = argv.filter(a => !a.startsWith('--'));
const all = files.length === 0;
if ((ratchetDown || ratchetSnapshot) && !all) { console.error('[trap-lint] CANNOT RUN: --ratchet-down / --ratchet-snapshot work on the whole pack, not on named files'); process.exit(2); }
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

// ---- silent-catch ratchet: the grandfathered counts ----
// { files: { "<path below kubejs/>": { count, ids: [fingerprint of each grandfathered try/catch] } } }
// The count is the rule; the ids only let the lint point at the catch that is new instead of listing them all.
const RATCHET_FILE = path.join(__dirname, 'lint_kubejs_traps.silent_catches.json');
let ratchet = null;
if (fs.existsSync(RATCHET_FILE)) {
  try {
    ratchet = JSON.parse(fs.readFileSync(RATCHET_FILE, 'utf8')).files;
    if (!ratchet || typeof ratchet !== 'object') throw new Error('"files" is missing');
    for (const [k, v] of Object.entries(ratchet)) if (!(v.count >= 0) || !Array.isArray(v.ids)) throw new Error('bad entry for ' + k);
  } catch (e) {
    console.error('[trap-lint] CANNOT RUN: ' + RATCHET_FILE + ' is unreadable (' + e.message + ')');
    process.exit(2);
  }
} else if (!ratchetSnapshot) {
  // without the list every old catch would look new, and with "no list = no rule" a deleted file would switch the rule off
  console.error('[trap-lint] CANNOT RUN: ' + RATCHET_FILE + ' is missing (the grandfathered silent catches). Restore it from git; do not regenerate it.');
  process.exit(2);
}
if (ratchetSnapshot && ratchet) {
  console.error('[trap-lint] CANNOT RUN: ' + path.basename(RATCHET_FILE) + ' exists. A snapshot is taken once, when the rule starts; afterwards counts only go down (--ratchet-down).');
  process.exit(2);
}
function writeRatchet(map, note) {
  const keys = Object.keys(map).filter(k => map[k].count > 0).sort();
  const total = keys.reduce((n, k) => n + map[k].count, 0);
  const rows = keys.map(k => '    ' + JSON.stringify(k) + ': {"count": ' + map[k].count + ', "ids": ' + JSON.stringify(map[k].ids) + '}');
  fs.writeFileSync(RATCHET_FILE, '{\n' +
    '  "comment": "Grandfathered silent catches for the SILENT-CATCH rule of lint_kubejs_traps.js (ratchet, operator ruling 2026-10-11). A file may hold at most `count` unmarked silent catches; a file that is not listed may hold none. `ids` are fingerprints of the grandfathered try/catch blocks, used only to point at the new one. Counts go DOWN only (--ratchet-down after fixing or marking some); never raise one by hand to get a push through: report the error, or write // swallow-ok: <reason> inside the catch.",\n' +
    '  "taken": ' + JSON.stringify(note) + ',\n' +
    '  "total": ' + total + ',\n' +
    '  "files": {\n' + rows.join(',\n') + '\n  }\n}\n');
  return { files: keys.length, total };
}

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let total = 0, excused = 0, grandfathered = 0, swallowOk = 0, headroom = 0;
const seenKeys = new Set();
const current = {};       // key -> unmarked silent catches found now
for (const f of files) {
  const key = relKey(f);
  seenKeys.add(key);
  const res = lint(f);
  current[key] = res.silent;
  swallowOk += res.marked;
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

  // the ratchet: more unmarked silent catches than the file is allowed
  if (ratchet) {
    const allowed = ratchet[key] ? ratchet[key].count : 0;
    if (res.silent.length > allowed) {
      const known = new Set(ratchet[key] ? ratchet[key].ids : []);
      let fresh = res.silent.filter(s => !known.has(s.id));
      if (fresh.length < res.silent.length - allowed) fresh = res.silent;   // the ids do not single them out: show all
      const tail = allowed === 0 ? ' [no silent catch is grandfathered in this file]'
        : ' [' + res.silent.length + ' unmarked silent catches in this file, ' + allowed + ' grandfathered' +
          (fresh.length > res.silent.length - allowed ? '; ' + (res.silent.length - allowed) + ' of the ' + fresh.length + ' shown must be fixed or marked' : '') + ']';
      for (const s of fresh) out.push(key + ':' + s.line + '\tSILENT-CATCH\t' + SILENT_MSG + tail);
      grandfathered += allowed;
    } else {
      grandfathered += res.silent.length;
      headroom += allowed - res.silent.length;
    }
  }
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

if (ratchetSnapshot) {
  const map = {};
  for (const [k, list] of Object.entries(current)) map[k] = { count: list.length, ids: list.map(s => s.id) };
  const w = writeRatchet(map, today() + ', snapshot of ' + files.length + ' scripts when the rule started');
  console.log('[trap-lint] ratchet snapshot written: ' + w.total + ' silent catch(es) grandfathered in ' + w.files + ' file(s) -> ' + path.basename(RATCHET_FILE));
} else if (ratchetDown) {
  // lower only: a file keeps min(recorded, found); a file that is not listed stays at 0; a vanished file is dropped
  const map = {}; let before = 0;
  for (const [k, v] of Object.entries(ratchet)) {
    before += v.count;
    if (!current[k]) continue;
    const n = Math.min(v.count, current[k].length);
    map[k] = { count: n, ids: current[k].length <= v.count ? current[k].map(s => s.id) : v.ids };
  }
  const prev = JSON.parse(fs.readFileSync(RATCHET_FILE, 'utf8')).taken;
  const w = writeRatchet(map, String(prev).split(';')[0] + '; lowered ' + today());
  console.log('[trap-lint] ratchet lowered: ' + before + ' -> ' + w.total + ' grandfathered silent catch(es) (' + path.basename(RATCHET_FILE) + '); commit it with the fix');
}

let line = '[trap-lint] ' + files.length + ' file(s), ' + total + ' flag(s), ' + excused + ' recorded exception(s)' + (excused && !listExceptions ? ' (--exceptions lists them)' : '');
if (ratchet) line += '; silent catches: ' + grandfathered + ' grandfathered, ' + swallowOk + ' marked swallow-ok' +
  (all && headroom > 0 && !ratchetDown ? ' (' + headroom + ' fewer than recorded: --ratchet-down)' : '');
console.log(line);
process.exitCode = total ? 1 : 0;
