// lint_kubejs_traps.js -- flag script patterns that are valid JavaScript, load without an error,
// and never do what they say on this pack's engine (rhino 2001.2.3 / KubeJS 2001.6.5).
//
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js              # all kubejs scripts
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js a.js b.js    # just these
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --exceptions # also list every recorded exception
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --ratchet-down             # lower the grandfathered counts
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --ratchet-start=ID-SET     # a new ratcheted rule's first counts
//   node --expose-internals .minecraft/dev/lint_kubejs_traps.js --ratchet-base=origin/main
//                                                    # only compare the grandfathered counts with that commit
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
//                     handler(name, group, fn)     name  = as for guard (name + group is unique per file)
//                                                  group = '<Class>.<method>' of the Java registry call it is
//                                                          passed to: the method as written, the class as the
//                                                          script loaded it (Java.loadClass('...<Class>'))
//                   -> "[icraft.guard] FAILED <name> in <event>" would point at the wrong script or event
//
// Rules of 2026-10-13 (package H; each proven by a fixture under dev/lint-fixtures, run by lint_kubejs_traps.test.js):
//   FILE-PROPERTY   a comment line KubeJS acts on. It reads EVERY line `// <word> <word>` of a script as a file
//                   property (ScriptFileInfo.preload: ^(\w+)\s*[:=]?\s*(-?\w+)$, the colon optional, anywhere in the
//                   file). `// ignored true` or `// ignore true` switches the file off, `// packmode x` and
//                   `// requires y` skip it unless that mode / mod is there, `// priority high` makes it fail to load,
//                   and `// priority 5` reorders the load: none of it writes a log line. A deliberate
//                   `// priority: N` is recorded as an exception, with its reason.
//   LOOP-CLOSURE    a function created in a loop body that reads the loop's HEAD variable and is not called at once
//                   -> it sees the value the loop ENDED with. Measured on the production Rhino (suite dialect): true
//                   for `let`, `const` and `var`, in for, for-in and for-of. An argument of forEach / map / filter /
//                   some / every / find / reduce / sort / replace and an IIFE run in their own iteration: not flagged.
//   CHARCODEAT      .charCodeAt(..) -> a raw java.lang.Character: NaN in arithmetic, false in comparisons, a throw in
//                   typeof and concatenation. Use .codePointAt(..)
//   ID-SET          new Set(..) / new Map(..) -> never matches a string that comes from Java (`.has` false, `.get`
//                   undefined). Use global.icraft.core.idSet([...]). Ratcheted.
//   NO-SUCH-MEMBER  the members the failure ledger knows are not there, each one an entry of
//                   engine-tests/truth/known-false.json (the test holds the two lists together): inv.size /
//                   inv.getSize(), level.dayTime as a value, level.dropItem(), entity.hurt(), getUUID(), setTag(),
//                   hasTag() with no argument, Item.of(..).itemStack, getMsgId(), isCritical(),
//                   enchantments.getLevel(), event.amount in an EntityEvents.hurt handler
//   ENTITY-TYPE     <entity>.type read as a value -> a Java string, and shadowed on classes with a public `type`
//                   field. Use global.icraft.core.entityId(entity). Ratcheted.
//   TICKCOUNT-SAVED a value read from .tickCount written to persistent data -> wrong after every restart
//   BLOCK-READ      level.getBlock / getBlockState / getBlockEntity / getChunkAt in a function that never asks
//                   hasChunkAt / isLoaded / core.blockIfLoaded -> the read LOADS the chunk. Ratcheted.
//   DIRECT-HURT-REG DamageModifierRegistry.register / registerLate(..) outside 0_lib_core.js -> no re-entrancy
//                   guard, no NaN guard, no liveness id. Use core.onHurt / core.onHurtLate. Ratcheted.
//   HELPER-COPY     a server script's own copy of a core helper: a function named warnOnce / entityId / idSet /
//                   playerTier / getPlayerTier / blockIfLoaded / mainSlotCount / isBoss, the entity-id regex
//                   /^entity\.([^.]+)\.(.+)$/, or getEntityType().builtInRegistryHolder(). Ratcheted.
//
// "Ratcheted" (lint_kubejs_traps.ratchet.json): the sites that existed when the rule started are a per-file count,
// as for SILENT-CATCH below. A file may not hold MORE sites of the rule than its count; a file that is not listed
// may hold none. Fixing sites never blocks: --ratchet-down lowers the counts (it only ever lowers them), and
// --ratchet-base=<ref> refuses a count that rose. A rule gets its first counts once, with --ratchet-start=<RULE>.
// A site that is RIGHT as it stands (a Set keyed by numbers, a block read at an event's own position) is not
// debt: it goes in lint_kubejs_traps.exceptions.json with its reason, like every other recorded exception.
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
// ...and not by hand either: --ratchet-base=<git ref> (decision sheet G20, 2026-10-13). The lint above compares the
// scripts with the counts file OF THE SAME TREE, so a session that raised a count (or deleted the file and took a
// new snapshot) passed its own lint. This mode compares the counts file with the one at <ref> and flags
// RATCHET-RAISED for every file whose count went up, or that appeared with a count. It lints nothing and takes
// about 0.1 s; the pre-push hook runs it against the commit the push is based on (the remote's tip) for every
// push, and the `KubeJS script checks` Action against the tip before the push.
//   --ratchet-head=<git ref>   read the counts from that commit instead of the working tree (the hook passes
//                              the commit being pushed)
// A script that MOVED keeps its debt: a key that is new may take over the counts of keys whose script no longer
// exists (old path gone, new path listed, the sum not larger). Everything else that rises is a flag. A base
// commit from before a counts file existed has nothing to compare with and passes with a note.
// Exit 0 nothing rose, 1 a count rose, 2 could not run (unknown ref, not a git checkout, unreadable file).
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

// ---- the rules of 2026-10-13 (package H): constants ----
const HURT_REGISTRY_CLASS = 'com.iridescentcraft.reforging.event.DamageModifierRegistry';
// the translation-key fallback of core.entityId, as a regex source: /^entity\.([^.]+)\.(.+)$/
const ID_FALLBACK_PATTERN = '^entity\\.([^.]+)\\.(.+)$';
// a local function of this name -> the export of global.icraft.core that is the one home of that helper
const CORE_HELPER_NAMES_TO = { warnOnce: 'warnOnce', entityId: 'entityId', idSet: 'idSet', playerTier: 'playerTier', getPlayerTier: 'playerTier',
  blockIfLoaded: 'blockIfLoaded', mainSlotCount: 'mainSlotCount', isBoss: 'isBoss' };
const CORE_HELPER_NAMES = new Set(Object.keys(CORE_HELPER_NAMES_TO));
// the names a declaration pattern binds
function patternNames(p) {
  if (!p) return [];
  switch (p.type) {
    case 'Identifier': return [p.name];
    case 'ObjectPattern': return [].concat.apply([], p.properties.map(pr => patternNames(pr.type === 'RestElement' ? pr.argument : pr.value)));
    case 'ArrayPattern': return [].concat.apply([], p.elements.map(patternNames));
    case 'RestElement': return patternNames(p.argument);
    case 'AssignmentPattern': return patternNames(p.left);
    default: return [];
  }
}
// Rules with sites that are older than the rule: those are grandfathered by a per-file count in
// lint_kubejs_traps.ratchet.json (the way SILENT-CATCH is, minus the fingerprints). Every other rule is strict.
const RATCHETED_RULES = ['ID-SET', 'ENTITY-TYPE', 'BLOCK-READ', 'DIRECT-HURT-REG', 'HELPER-COPY'];

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
  // the simple class name each variable of this file was loaded as: var X = Java.loadClass('a.b.Class')
  const loadedAs = new Map();
  (function collectLoads(n) {
    if (!n || typeof n.type !== 'string') return;
    let id = null, init = null;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') { id = n.id.name; init = n.init; }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') { id = n.left.name; init = n.right; }
    if (id && init && init.type === 'CallExpression' && init.arguments.length === 1 && strLit(init.arguments[0]) !== null &&
        (dotted(init.callee) === 'Java.loadClass' || (init.callee.type === 'Identifier' && /loadClass/i.test(init.callee.name))))
      loadedAs.set(id, strLit(init.arguments[0]).split('.').pop().split('$').pop());
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') collectLoads(c); }
      else if (v && typeof v.type === 'string') collectLoads(v);
    }
  })(ast);
  // icraft.handler(name, group, fn) as an argument of `reg`, the registration call on a Java registry
  function checkHandler(call, reg) {
    const a = call.arguments;
    if (a.length !== 3) { site('GUARD-SHAPE', call, 'icraft.handler takes (name, group, function): ' + a.length + ' argument(s) here'); return; }
    const name = strLit(a[0]), group = strLit(a[1]);
    if (name === null || group === null) { site('GUARD-SHAPE', call, 'icraft.handler: name and group must be string literals (the lint and the liveness generator read them)'); return; }
    if (!guardName.test(name)) site('GUARD-SHAPE', call, "icraft.handler('" + name + "', ..): the name must be this script's own path, '" + scriptName + "' (or '" + scriptName + "#2')");
    if (!reg || reg.type !== 'CallExpression' || reg.callee.type !== 'MemberExpression' || reg.callee.computed || reg.callee.object.type !== 'Identifier') {
      site('GUARD-SHAPE', call, "icraft.handler(..) must be an argument of the registration it names: <Registry>.<method>(.., icraft.handler('" + name + "', '<Registry>.<method>', fn))");
    } else {
      const obj = reg.callee.object.name, method = reg.callee.property.name;
      const cls = loadedAs.has(obj) ? loadedAs.get(obj) : obj;
      if (group !== cls + '.' + method) site('GUARD-SHAPE', call, "icraft.handler(.., '" + group + "', ..) is passed to " + obj + '.' + method + ' (class ' + cls + "): the group must be '" + cls + '.' + method + "', or the liveness line names another registration");
    }
    const k = name + ' in ' + group;
    if (guardKeys.has(k)) site('GUARD-SHAPE', call, "icraft.handler('" + name + "', '" + group + "', ..) is used twice in this file: add '#2' to the second name");
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
        if (isIcraftCall(node, 'handler')) checkHandler(node, (parent && parent.type === 'CallExpression' && key === 'arguments') ? parent : null);
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

  // =================================================================================================
  // The rules of 2026-10-13 (package H). Each was a dead feature or a measured engine fact; the fixtures
  // in dev/lint-fixtures prove each one flags its case (lint_kubejs_traps.test.js).
  // =================================================================================================
  const base = relKey(file).replace(/^[^/]*_scripts\//, '');
  const isServerScript = /^server_scripts\//.test(relKey(file));
  const isCore = isServerScript && base === '0_lib_core.js';

  // ---- FILE-PROPERTY: a comment line KubeJS acts on (ScriptFileInfo.preload, read from the jar) ----
  // Line based, exactly as the engine does it: trim, starts with `//`, the rest trimmed matches
  // ^(\w+)\s*[:=]?\s*(-?\w+)$ ; anywhere in the file, inside a block comment or a template string too.
  (function fileProperties() {
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.slice(0, 2) !== '//') continue;
      const m = /^(\w+)\s*[:=]?\s*(-?\w+)$/.exec(t.slice(2).trim());
      if (!m) continue;
      const key = m[1], value = m[2];
      let msg = null;
      if (key === 'priority') {
        msg = /^-?\d+$/.test(value)
          ? 'this comment sets the file\'s load priority to ' + value + ' (KubeJS sorts scripts by it and by nothing else). A priority is a decision: record it in lint_kubejs_traps.exceptions.json with its reason'
          : 'KubeJS reads this comment as the file property priority = "' + value + '" and Integer.parseInt throws on it: the file does not load. Reword the comment';
      } else if ((key === 'ignored' || key === 'ignore') && value === 'true') {
        msg = 'KubeJS reads this comment as the file property ' + key + ' = true: the file is switched OFF, with no line in any log. Reword the comment';
      } else if (key === 'packmode') {
        msg = 'KubeJS reads this comment as the file property packmode = "' + value + '": the file is skipped unless the pack mode is exactly that. Reword the comment';
      } else if (key === 'requires') {
        msg = 'KubeJS reads this comment as the file property requires = "' + value + '": the file is skipped unless a mod with that id is loaded. Reword the comment (or record the requirement as an exception)';
      }
      if (msg) sites.push({ rule: 'FILE-PROPERTY', line: i + 1, msg });
    }
  })();

  // ---- helpers for the receiver heuristics ----
  const lastSeg = (n) => {
    if (!n) return '';
    if (n.type === 'Identifier') return n.name;
    if (n.type === 'ThisExpression') return 'this';
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') return n.property.name;
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.property.type === 'Identifier') return n.callee.property.name + '()';
    return '';
  };
  const INV_RX = /^(inv|inventory|playerInv|playerInventory|getInventory\(\))$/i;
  const LEVEL_RX = /^(level|lvl|world|serverLevel|overworld\(\)|getLevel\(\)|ow|dim)$/i;
  const ENTITY_RX = /^(entity|ent|mob|target|victim|attacker|killer|hitter|living|boss|getEntity\(\))$/;
  const containsNode = (root, pred) => {
    let hit = false;
    (function w(n) {
      if (hit || !n || typeof n.type !== 'string') return;
      if (pred(n)) { hit = true; return; }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') w(c); }
        else if (v && typeof v.type === 'string') w(v);
      }
    })(root);
    return hit;
  };
  const isMemberNamed = (n, name) => !!n && n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && n.property.name === name;
  const calleeName = (call) => (call.callee.type === 'MemberExpression' && !call.callee.computed && call.callee.property.type === 'Identifier') ? call.callee.property.name
    : (call.callee.type === 'Identifier' ? call.callee.name : null);

  // ---- DIRECT-HURT-REG: the names this file binds to the Java damage registry ----
  const hurtRegistryNames = new Set();
  const isHurtRegistryLoad = (n) => !!n && n.type === 'CallExpression' && n.arguments.length === 1 && strLit(n.arguments[0]) === HURT_REGISTRY_CLASS &&
    (dotted(n.callee) === 'Java.loadClass' || (n.callee.type === 'Identifier' && /loadClass/i.test(n.callee.name)));
  containsNode(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isHurtRegistryLoad(n.init)) hurtRegistryNames.add(n.id.name);
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && isHurtRegistryLoad(n.right)) hurtRegistryNames.add(n.left.name);
    return false;
  });

  // ---- TICKCOUNT-SAVED: per function, the names that hold a value read from .tickCount ----
  // (a property or an object key that is merely NAMED like a tainted variable is not that variable: core.now(..))
  const hasTickCount = (root, tainted) => {
    let hit = false;
    (function w(n, parent, key) {
      if (hit || !n || typeof n.type !== 'string') return;
      if (isMemberNamed(n, 'tickCount')) { hit = true; return; }
      if (n.type === 'Identifier' && tainted.has(n.name)) {
        const isName = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || (parent.type === 'Property' && key === 'key' && !parent.computed));
        if (!isName) { hit = true; return; }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') w(c, n, k); }
        else if (v && typeof v.type === 'string') w(v, n, k);
      }
    })(root, null, null);
    return hit;
  };
  const taintedIn = new Map();   // function node (or null) -> Set of names
  (function collectTaint(node, fn) {
    if (!node || typeof node.type !== 'string') return;
    if (isFn(node)) fn = node;
    if (!taintedIn.has(fn)) taintedIn.set(fn, new Set());
    const set = taintedIn.get(fn);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init && hasTickCount(node.init, set)) set.add(node.id.name);
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && hasTickCount(node.right, set)) set.add(node.left.name);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') collectTaint(c, fn); }
      else if (v && typeof v.type === 'string') collectTaint(v, fn);
    }
  })(ast, null);
  const PUT_RX = /^put(Int|Long|Double|Float|Short|Byte|String|Boolean)?$/;
  const touchesPersistent = (n) => containsNode(n, (x) => isMemberNamed(x, 'persistentData') || isMemberNamed(x, 'forgePersistentData') ||
    (x.type === 'Identifier' && /^(pd|pdata|persistent|persistentData|data|nbt|tag)$/i.test(x.name)));

  // ---- LOOP-CLOSURE: a function created in a loop body that reads the loop's HEAD variable ----
  // Measured on the production Rhino (suite dialect): for (let|const|var x ...; ...), for (.. in ..) and
  // for (.. of ..) all share ONE binding of the head variable, so every such closure sees the value the
  // loop ended with. A function that is called at once (an argument of forEach / map / ..., an IIFE) reads
  // the value of its own iteration and is not flagged.
  const SYNC_CALLS = new Set(['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'reduce', 'reduceRight', 'flatMap', 'sort', 'replace']);
  const declaresName = (fnNode, name) => {
    if (fnNode.params.some(p => patternNames(p).indexOf(name) >= 0)) return true;
    if (fnNode.id && fnNode.id.name === name && fnNode.type === 'FunctionExpression') return true;
    return containsNode(fnNode.body, (x) => (x.type === 'VariableDeclarator' && patternNames(x.id).indexOf(name) >= 0) ||
      (x.type === 'FunctionDeclaration' && x.id && x.id.name === name));
  };
  const readsName = (fnNode, name) => {
    let hit = false;
    (function w(n, parent, key) {
      if (hit || !n || typeof n.type !== 'string') return;
      if (n !== fnNode && isFn(n) && declaresName(n, name)) return;   // shadowed further in
      if (n.type === 'Identifier' && n.name === name) {
        const isPropName = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
          (parent.type === 'Property' && key === 'key' && !parent.computed));
        if (!isPropName) { hit = true; return; }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') w(c, n, k); }
        else if (v && typeof v.type === 'string') w(v, n, k);
      }
    })(fnNode.body, fnNode, 'body');
    return hit;
  };
  function loopClosures(loop, names) {
    (function w(n, parent, key) {
      if (!n || typeof n.type !== 'string') return;
      if (isFn(n)) {
        const called = parent && parent.type === 'CallExpression' && key === 'callee';
        const syncArg = parent && parent.type === 'CallExpression' && key === 'arguments' && SYNC_CALLS.has(calleeName(parent));
        if (!called && !syncArg) {
          for (const name of names) {
            if (!declaresName(n, name) && readsName(n, name)) {
              site('LOOP-CLOSURE', n, 'this function is created inside the loop at line ' + loop.loc.start.line + ' and reads its head variable `' + name +
                '`. On this engine every function made in the loop shares ONE `' + name + '` and sees the value the loop ENDED with, for `let`, `const` and `var`, ' +
                'in for, for-in and for-of alike. Copy it first: `let ' + name + '_ = ' + name + '` in the loop body, and read the copy');
            }
          }
          return;   // inner functions of a flagged / cleared function are its own business
        }
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') w(c, n, k); }
        else if (v && typeof v.type === 'string') w(v, n, k);
      }
    })(loop.body, loop, 'body');
  }

  // ---- BLOCK-READ: the functions that ask "is it loaded" somewhere ----
  const LOADED_CALLS = new Set(['hasChunkAt', 'isLoaded', 'hasChunk', 'isAreaLoaded', 'blockIfLoaded', 'isPositionEntityTicking', 'hasChunksAt']);
  const BLOCK_READS = new Set(['getBlock', 'getBlockState', 'getBlockEntity', 'getChunkAt']);
  const asksLoaded = new Map();
  const fnAsksLoaded = (fn) => {
    if (!asksLoaded.has(fn)) asksLoaded.set(fn, containsNode(fn === null ? ast : fn, (x) => x.type === 'CallExpression' && LOADED_CALLS.has(calleeName(x))));
    return asksLoaded.get(fn);
  };

  // ---- one walk for the node rules ----
  const parentOf = new WeakMap();
  const noSuch = (node, type, member, msg) => site('NO-SUCH-MEMBER', node, msg);
  (function walk(node, parent, key, fnStack, hurtHandlerParam) {
    if (!node || typeof node.type !== 'string') return;
    let fns = fnStack, hurtParam = hurtHandlerParam;
    if (isFn(node)) {
      fns = fnStack.concat([node]);
      // the handler of EntityEvents.hurt(...), also through icraft.guard(name, event, handler)
      const viaGuard = parent && isIcraftCall(parent, 'guard') ? parent : null;
      const reg = viaGuard ? parentOf.get(viaGuard) : parent;
      if (reg && reg.type === 'CallExpression' && dotted(reg.callee) === 'EntityEvents.hurt' && node.params[0] && node.params[0].type === 'Identifier') hurtParam = node.params[0].name;
    }
    const fn = fns.length ? fns[fns.length - 1] : null;

    switch (node.type) {
      case 'ForStatement':
        if (node.init && node.init.type === 'VariableDeclaration') loopClosures(node, [].concat.apply([], node.init.declarations.map(d => patternNames(d.id))));
        break;
      case 'ForInStatement': case 'ForOfStatement':
        if (node.left.type === 'VariableDeclaration') loopClosures(node, [].concat.apply([], node.left.declarations.map(d => patternNames(d.id))));
        break;
      case 'NewExpression':
        if (!isCore && node.callee.type === 'Identifier' && (node.callee.name === 'Set' || node.callee.name === 'Map')) {
          site('ID-SET', node, 'new ' + node.callee.name + '(..): a JS ' + node.callee.name + ' never matches a string that comes from Java (entity.type, stack.id, block.id, a dimension, a username: ' +
            '`.has` is false and `.get` undefined, without an error). For ids and names use global.icraft.core.idSet([...]) (it normalises what it is asked); ' +
            'a ' + node.callee.name + ' whose keys are numbers or strings the script built itself is recorded as an exception, with that reason');
        }
        break;
      case 'Literal':
        if (isServerScript && !isCore && base !== '0_iss_guard.js' && node.regex && node.regex.pattern === ID_FALLBACK_PATTERN)
          site('HELPER-COPY', node, 'this is the translation-key fallback of global.icraft.core.entityId (a local copy of the entity-id reader): call the helper');
        break;
      case 'VariableDeclarator': case 'FunctionDeclaration': case 'AssignmentExpression': {
        if (!isServerScript || isCore) break;
        let name = null, value = null;
        if (node.type === 'FunctionDeclaration') { name = node.id && node.id.name; value = node; }
        else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') { name = node.id.name; value = node.init; }
        else if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') { name = node.left.name; value = node.right; }
        if (name && value && isFn(value) && CORE_HELPER_NAMES.has(name))
          site('HELPER-COPY', node, 'a local function named ' + name + ': global.icraft.core.' + CORE_HELPER_NAMES_TO[name] + ' is the one home of that helper (a copy drifts: ten copies of the id reader, fifteen of warnOnce, five player-tier readers disagreed). ' +
            'Use `var ' + name + ' = global.icraft.core.' + CORE_HELPER_NAMES_TO[name] + '`');
        break;
      }
      case 'MemberExpression': {
        if (node.computed || node.property.type !== 'Identifier') break;
        const p = node.property.name;
        const isCallee = !!parent && parent.type === 'CallExpression' && key === 'callee';
        const recv = lastSeg(node.object);
        if (p === 'type' && !isCallee && !isCore && ENTITY_RX.test(recv))
          site('ENTITY-TYPE', node, dotted(node) + ': the `type` bean of an entity is shadowed on classes that have a public `type` field (Creeper Overhaul), and what it returns is a Java string. ' +
            'Read the id through global.icraft.core.entityId(' + dotted(node.object) + ') (it calls getType(), and returns a JS string)');
        // the ledger's known-missing members (each one is an entry of engine-tests/truth/known-false.json)
        if (p === 'size' && !isCallee && INV_RX.test(recv)) noSuch(node, 'net.minecraft.world.entity.player.Inventory', 'size', dotted(node) + ' is undefined on the vanilla Inventory, so a loop bounded by it runs ZERO times: use global.icraft.core.eachMainSlot(player, fn) or core.mainSlotCount()');
        if (p === 'getSize' && isCallee && INV_RX.test(recv)) noSuch(node, 'net.minecraft.world.entity.player.Inventory', 'getSize', dotted(node) + '() does not exist on the vanilla Inventory: use global.icraft.core.eachMainSlot(player, fn) or core.mainSlotCount()');
        if (p === 'dayTime' && !isCallee && LEVEL_RX.test(recv)) noSuch(node, 'net.minecraft.world.level.Level', 'dayTime', dotted(node) + ' is the dayTime() METHOD for scripts, not a number (arithmetic on it is NaN): call ' + dotted(node) + '()');
        if (p === 'dropItem' && isCallee && LEVEL_RX.test(recv)) noSuch(node, 'net.minecraft.world.level.Level', 'dropItem', dotted(node) + '() does not exist: use block.popItem(stack), or new ItemEntity(level, x, y, z, stack) + level.addFreshEntity');
        if (p === 'hurt' && isCallee && !EVENT_GROUP.test(recv)) noSuch(node, 'net.minecraft.world.entity.Entity', 'hurt', dotted(node) + '() does not exist for scripts ("Cannot find function hurt"): KubeJS names it attack(source, amount); for damage dealt by a handler use global.icraft.core.dealDamage');
        if (p === 'getUUID' && isCallee) noSuch(node, 'net.minecraft.world.entity.Entity', 'getUUID', dotted(node) + '() does not exist for scripts: use .uuid / .getUuid()');
        if (p === 'setTag' && isCallee) noSuch(node, 'net.minecraft.world.item.ItemStack', 'setTag', dotted(node) + '() does not exist for scripts: assign stack.nbt');
        if (p === 'hasTag' && isCallee && parent.arguments.length === 0) noSuch(node, 'net.minecraft.world.item.ItemStack', 'hasTag', dotted(node) + '() with no argument throws: hasTag(id) is the item-TAG test; the NBT test is hasNBT()');
        if (p === 'itemStack' && !isCallee && node.object.type === 'CallExpression' && dotted(node.object.callee) === 'Item.of') noSuch(node, 'net.minecraft.world.item.ItemStack', 'itemStack', 'Item.of(..).itemStack is undefined: Item.of(..) IS the stack');
        if (p === 'getMsgId' && isCallee) noSuch(node, 'net.minecraft.world.damagesource.DamageSource', 'getMsgId', dotted(node) + '() does not exist for scripts: use getType() (or global.icraft.core.dmgMsg / dmgId)');
        if (p === 'isCritical' && isCallee) noSuch(node, 'net.minecraft.world.damagesource.DamageSource', 'isCritical', dotted(node) + '() exists on no class of this pack: the only crit a script can see is the pack\'s own roll');
        if (p === 'getLevel' && isCallee && lastSeg(node.object) === 'enchantments') noSuch(node, null, 'item.enchantments.getLevel', dotted(node) + '(): stack.enchantments is a map of id -> level and has no getLevel: use global.icraft.core.enchLevel(stack, id)');
        if (p === 'amount' && hurtParam !== null && node.object.type === 'Identifier' && node.object.name === hurtParam)
          noSuch(node, 'dev.latvian.mods.kubejs.entity.LivingEntityHurtEventJS', 'amount', hurtParam + '.amount does not exist on EntityEvents.hurt: the name is ' + hurtParam + '.damage');
        break;
      }
      case 'CallExpression': {
        const name = calleeName(node);
        if (name === 'builtInRegistryHolder' && isServerScript && !isCore && base !== '0_iss_guard.js' && node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'CallExpression' && (calleeName(node.callee.object) === 'getEntityType' || calleeName(node.callee.object) === 'getType'))
          site('HELPER-COPY', node, dotted(node.callee) + '(): a local copy of the entity-id reader' +
            (calleeName(node.callee.object) === 'getType' ? ' (and getType() is the id STRING for scripts: this call throws on every entity, the copy lives on its fallback)' : '') +
            '. global.icraft.core.entityId(entity) is the one home of it');
        if (name === 'charCodeAt' && node.callee.type === 'MemberExpression')
          site('CHARCODEAT', node, '.charCodeAt(..) hands back a raw java.lang.Character on this engine: NaN in arithmetic, false in every comparison, a throw in typeof and in string concatenation. Use .codePointAt(..) (a number)');
        if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.object.type === 'Identifier' && hurtRegistryNames.has(node.callee.object.name) &&
            (name === 'register' || name === 'registerLate' || name === 'registerEarly') && !isCore)
          site('DIRECT-HURT-REG', node, dotted(node.callee) + '(..) puts a handler straight on the Java damage registry: it is outside the shared dispatcher, so it has no re-entrancy guard (a splash or thorns hit runs it again), ' +
            'no NaN guard on the amount, and no liveness id. Use global.icraft.core.' + (name === 'registerLate' ? 'onHurtLate' : 'onHurt') + '(key, fn, who)');
        if (name && PUT_RX.test(name) && node.callee.type === 'MemberExpression' && node.arguments.length >= 2 &&
            hasTickCount(node.arguments[node.arguments.length - 1], taintedIn.get(fn) || new Set()) && touchesPersistent(node.callee.object))
          site('TICKCOUNT-SAVED', node, 'a value read from .tickCount is written to persistent data: tickCount restarts at 0 on every boot, so a saved cooldown or timestamp is in the future (or the past) after a restart. ' +
            'Save global.icraft.core.now(entity) (the world game time) instead');
        if (name && BLOCK_READS.has(name) && node.callee.type === 'MemberExpression' && LEVEL_RX.test(lastSeg(node.callee.object)) && !isCore) {
          if (!fns.some(f => fnAsksLoaded(f)) && !(fns.length === 0 && fnAsksLoaded(null)))
            site('BLOCK-READ', node, dotted(node.callee) + '(..) LOADS the chunk when it is not loaded (to FULL, on the server thread) and nothing in this function asks first. From a timer, a saved position or another dimension ' +
              'that is one chunk load per call, and in a level without players every one of them leaks. Use global.icraft.core.blockIfLoaded(level, x, y, z) (null when not loaded), or level.hasChunkAt(pos) before the read');
        }
        break;
      }
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && touchesPersistent(node.left.object) &&
        hasTickCount(node.right, taintedIn.get(fn) || new Set()))
      site('TICKCOUNT-SAVED', node, 'a value read from .tickCount is assigned into persistent data: tickCount restarts at 0 on every boot. Save global.icraft.core.now(entity) (the world game time) instead');

    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const ch of v) if (ch && typeof ch.type === 'string') { parentOf.set(ch, node); walk(ch, node, k, fns, hurtParam); } }
      else if (v && typeof v.type === 'string') { parentOf.set(v, node); walk(v, node, k, fns, hurtParam); }
    }
  })(ast, null, null, [], null);

  sites.sort((a, b) => a.line - b.line);
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
const VALUE_FLAGS = new Set(['--ratchet-base', '--ratchet-head', '--ratchet-start']);   // written --flag=<value>
const flagValue = (name) => { const a = argv.find(x => x.startsWith(name + '=')); return a ? a.slice(name.length + 1) : null; };
for (const a of argv) if (a.startsWith('--') && !KNOWN_FLAGS.has(a) && !(a.includes('=') && VALUE_FLAGS.has(a.slice(0, a.indexOf('='))) && a.length > a.indexOf('=') + 1)) {
  console.error('[trap-lint] CANNOT RUN: unknown option ' + a + (VALUE_FLAGS.has(a) ? ' (write ' + a + '=<git ref>)' : '')); process.exit(2);
}
const ratchetBase = flagValue('--ratchet-base'), ratchetHead = flagValue('--ratchet-head'), ratchetStart = flagValue('--ratchet-start');
if (ratchetStart !== null && RATCHETED_RULES.indexOf(ratchetStart) < 0) { console.error('[trap-lint] CANNOT RUN: --ratchet-start=' + ratchetStart + ': not a ratcheted rule (' + RATCHETED_RULES.join(', ') + ')'); process.exit(2); }
if (ratchetHead !== null && ratchetBase === null) { console.error('[trap-lint] CANNOT RUN: --ratchet-head needs --ratchet-base=<git ref>'); process.exit(2); }
let files = argv.filter(a => !a.startsWith('--'));
const all = files.length === 0;
if ((ratchetDown || ratchetSnapshot) && !all) { console.error('[trap-lint] CANNOT RUN: --ratchet-down / --ratchet-snapshot work on the whole pack, not on named files'); process.exit(2); }
if (ratchetStart !== null && (!all || ratchetDown || ratchetSnapshot || ratchetBase !== null)) { console.error('[trap-lint] CANNOT RUN: --ratchet-start is a run of its own on the whole pack'); process.exit(2); }
if (ratchetBase !== null && (!all || ratchetDown || ratchetSnapshot || listExceptions)) { console.error('[trap-lint] CANNOT RUN: --ratchet-base is a run of its own (no files, no other option but --ratchet-head)'); process.exit(2); }
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
// { rules: { "<RULE>": { started, total, files: { "<path below kubejs/>": count } } } } for RATCHETED_RULES
const RULE_RATCHET_FILE = path.join(__dirname, 'lint_kubejs_traps.ratchet.json');

// ---- the counts files against a git ref (--ratchet-base): no count may rise ----
// One reader per counts file: text -> Map of '<label>' -> count, where a label is what a flag line names.
// A second counts file (a per-rule ratchet for other rules) is one more entry in this list.
// `group` = the rule an entry belongs to. A group that is not in the base at all is a rule that STARTED in this
// push (its counts are its first snapshot, said in the output); the silent catches are one group that exists
// whenever their file does.
const RATCHET_FILES = [
  { file: RATCHET_FILE, what: 'unmarked silent catches',
    read: (text) => { const m = new Map(); for (const [k, v] of Object.entries(JSON.parse(text).files || {})) m.set(k, { key: k, count: v.count, group: 'SILENT-CATCH' }); return m; },
    groups: () => ['SILENT-CATCH'],
    how: 'report the error (console.error / global.icraft.core.warnOnce) or mark the catch // swallow-ok: <reason>' },
  { file: RULE_RATCHET_FILE, what: 'sites of that rule',
    read: (text) => {
      const m = new Map();
      for (const [rule, r] of Object.entries(JSON.parse(text).rules || {}))
        for (const [k, n] of Object.entries(r.files || {})) m.set(k + ' [' + rule + ']', { key: k, count: n, group: rule });
      return m;
    },
    groups: (text) => Object.keys(JSON.parse(text).rules || {}),
    how: 'fix the new site (the rule\'s message says how), or record it in lint_kubejs_traps.exceptions.json with the reason it is right' },
];
function ratchetAgainst(baseRef, headRef) {
  const { execFileSync } = require('child_process');
  const git = (args, okFail) => {
    try { return execFileSync('git', ['-C', __dirname].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
    catch (e) { if (okFail) return null; console.error('[trap-lint] CANNOT RUN: git ' + args.join(' ') + ' failed: ' + String(e.stderr || e.message).trim()); process.exit(2); }
  };
  // this folder as git names it inside the repository ('.minecraft/dev/'). Asked of git, not computed from
  // --show-toplevel: on Windows the two can be spelled differently (an 8.3 short name on one side) and
  // path.relative then walks out of the repository.
  const prefix = git(['rev-parse', '--show-prefix']).trim();
  const inRepo = (relToHere) => path.posix.normalize(prefix + relToHere);
  const resolve = (ref) => {
    const sha = git(['rev-parse', '--verify', '--quiet', ref + '^{commit}'], true);
    if (!sha) { console.error('[trap-lint] CANNOT RUN: ' + ref + ' is not a commit of this clone (fetch it first)'); process.exit(2); }
    return sha.trim();
  };
  const base = resolve(baseRef), head = headRef === null ? null : resolve(headRef);
  // `git show <sha>:<path>`; null when the path does not exist in that commit
  const at = (sha, abs) => {
    const rel = inRepo(path.basename(abs));
    if (git(['cat-file', '-e', sha + ':' + rel], true) === null) return null;
    return git(['show', sha + ':' + rel]);
  };
  const scriptExists = (key) => {
    if (head === null) return fs.existsSync(path.join(__dirname, '..', 'kubejs', key));
    return git(['cat-file', '-e', head + ':' + inRepo('../kubejs/' + key)], true) !== null;
  };
  let flags = 0, compared = 0;
  const notes = [];
  for (const rf of RATCHET_FILES) {
    const name = path.basename(rf.file);
    const baseText = at(base, rf.file);
    const headText = head === null ? (fs.existsSync(rf.file) ? fs.readFileSync(rf.file, 'utf8') : null) : at(head, rf.file);
    if (baseText === null) { notes.push(name + ': not in ' + baseRef + ' (older than the rule), nothing to compare'); continue; }
    if (headText === null) {
      flags++;
      console.log('FLAGS ' + name + '\n  ' + name + ':0\tRATCHET-RAISED\tthe counts file exists at ' + baseRef + ' and is gone here: without it nothing is grandfathered and nothing is checked. Restore it from git.');
      continue;
    }
    let b, h, baseGroups;
    try { b = rf.read(baseText); h = rf.read(headText); baseGroups = new Set(rf.groups(baseText)); }
    catch (e) { console.error('[trap-lint] CANNOT RUN: ' + name + ' is unreadable (' + e.message + ')'); process.exit(2); }
    compared++;
    const started = {};
    // the debt of scripts that are gone: a key that is new may take it over (a moved script)
    let pool = 0;
    for (const [label, v] of b) if (!h.has(label) && !scriptExists(v.key)) pool += v.count;
    let sumB = 0, sumH = 0;
    for (const v of b.values()) sumB += v.count;
    for (const v of h.values()) sumH += v.count;
    for (const [label, v] of [...h].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
      const was = b.has(label) ? b.get(label).count : 0;
      if (!(v.count > was)) continue;
      if (!baseGroups.has(v.group)) { started[v.group] = (started[v.group] || 0) + v.count; continue; }
      if (!b.has(label) && pool >= v.count) { pool -= v.count; notes.push(name + ': ' + label + ' is new with ' + v.count + ', taken over from a script that no longer exists'); continue; }
      flags++;
      console.log('FLAGS ' + label + '\n  ' + v.key + ':0\tRATCHET-RAISED\t' + v.group + ': the grandfathered count of this file went UP against ' + baseRef + ', ' + was + ' -> ' + v.count +
        ' (' + name + '). The count is the debt of ' + rf.what + ' the file had when the rule started; it only goes down. Put ' + was + ' back and ' + rf.how + '.');
    }
    for (const g of Object.keys(started).sort()) notes.push(name + ': rule ' + g + ' is not in ' + baseRef + ': it starts in this push, with ' + started[g] + ' grandfathered');
    notes.push(name + ': ' + sumB + ' -> ' + sumH + ' grandfathered in ' + b.size + ' -> ' + h.size + ' file(s)');
  }
  for (const n of notes) console.log('  ' + n);
  console.log('[trap-lint] ratchet against ' + baseRef + ' (' + base.slice(0, 9) + ')' + (head === null ? ', working tree' : ', ' + headRef + ' (' + head.slice(0, 9) + ')') + ': ' +
    compared + ' counts file(s) compared, ' + flags + ' flag(s)');
  process.exit(flags ? 1 : 0);
}
if (ratchetBase !== null) ratchetAgainst(ratchetBase, ratchetHead);

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
let ruleRatchet = {};
if (fs.existsSync(RULE_RATCHET_FILE)) {
  try {
    ruleRatchet = JSON.parse(fs.readFileSync(RULE_RATCHET_FILE, 'utf8')).rules;
    if (!ruleRatchet || typeof ruleRatchet !== 'object') throw new Error('"rules" is missing');
    for (const [rule, r] of Object.entries(ruleRatchet)) {
      if (RATCHETED_RULES.indexOf(rule) < 0) throw new Error(rule + ' is not a ratcheted rule of this lint');
      if (!r.files || typeof r.files !== 'object') throw new Error('bad entry for ' + rule);
      for (const [k, n] of Object.entries(r.files)) if (!(n > 0) || n !== Math.floor(n)) throw new Error('bad count for ' + rule + ' ' + k);
    }
  } catch (e) {
    console.error('[trap-lint] CANNOT RUN: ' + RULE_RATCHET_FILE + ' is unreadable (' + e.message + ')');
    process.exit(2);
  }
}
if (ratchetStart !== null && ruleRatchet[ratchetStart]) {
  console.error('[trap-lint] CANNOT RUN: ' + ratchetStart + ' already has its counts in ' + path.basename(RULE_RATCHET_FILE) + '. A rule starts once; afterwards counts only go down (--ratchet-down).');
  process.exit(2);
}
const ruleAllowed = (rule, key) => (ruleRatchet[rule] && ruleRatchet[rule].files[key]) || 0;
function writeRuleRatchet(rulesMap) {
  const names = Object.keys(rulesMap).sort();
  const blocks = names.map(rule => {
    const r = rulesMap[rule];
    const keys = Object.keys(r.files).filter(k => r.files[k] > 0).sort();
    const total = keys.reduce((n, k) => n + r.files[k], 0);
    return '    ' + JSON.stringify(rule) + ': {\n      "started": ' + JSON.stringify(r.started) + ',\n      "total": ' + total + ',\n      "files": {' +
      (keys.length ? '\n' + keys.map(k => '        ' + JSON.stringify(k) + ': ' + r.files[k]).join(',\n') + '\n      ' : '') + '}\n    }';
  });
  fs.writeFileSync(RULE_RATCHET_FILE, '{\n' +
    '  "comment": "Grandfathered sites of the ratcheted rules of lint_kubejs_traps.js (' + RATCHETED_RULES.join(', ') + '). A file may hold at most this many sites of the rule; a file that is not listed may hold none. `started` is the day the rule got its first counts (--ratchet-start=<RULE>, once). Counts go DOWN only (--ratchet-down after fixing some); never raise one by hand: fix the new site, or record it in lint_kubejs_traps.exceptions.json with the reason it is right. --ratchet-base=<ref> (pre-push hook, CI) refuses a count that rose.",\n' +
    '  "rules": {\n' + blocks.join(',\n') + '\n  }\n}\n');
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
const ruleNow = {};            // rule -> key -> sites found now (no recorded exception)
const ruleGrand = {};          // rule -> grandfathered sites
for (const r of RATCHETED_RULES) { ruleNow[r] = {}; ruleGrand[r] = 0; }
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
    if (ruleNow[rule] && !exc) {
      // a ratcheted rule: as many sites as the file had when the rule started, and no more
      ruleNow[rule][key] = list.length;
      const allowed = ruleAllowed(rule, key);
      if (list.length <= allowed || ratchetStart === rule) {
        ruleGrand[rule] += list.length;
        for (const s of list) notes.push(key + ':' + s.line + '\t' + rule + '\tgrandfathered (' + list.length + ' of ' + (ratchetStart === rule ? list.length : allowed) + ' in this file): ' + s.msg.split('. ')[0]);
        continue;
      }
      for (const s of list) out.push(key + ':' + s.line + '\t' + rule + '\t' + s.msg);
      out.push(key + ':0\t' + rule + '\t' + list.length + ' site(s) in this file, ' + (allowed === 0 ? 'none is grandfathered' : allowed + ' grandfathered (' + path.basename(RULE_RATCHET_FILE) + ')') +
        ': every site is shown, ' + (list.length - allowed) + ' of them must be fixed. The count never goes up');
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
} else if (ratchetStart !== null) {
  // a rule's first counts: what the pack holds today, minus the files a recorded exception covers
  const filesOf = {}; let n = 0;
  for (const [k, c] of Object.entries(ruleNow[ratchetStart])) if (c > 0) { filesOf[k] = c; n += c; }
  const next = {};
  for (const [rule, r] of Object.entries(ruleRatchet)) next[rule] = { started: r.started, files: r.files };
  next[ratchetStart] = { started: today(), files: filesOf };
  writeRuleRatchet(next);
  console.log('[trap-lint] ' + ratchetStart + ' starts: ' + n + ' site(s) grandfathered in ' + Object.keys(filesOf).length + ' file(s) -> ' + path.basename(RULE_RATCHET_FILE));
} else if (ratchetDown) {
  // the per-rule counts, the same way: min(recorded, found now), a vanished or clean file is dropped
  if (Object.keys(ruleRatchet).length) {
    const next = {}; let was = 0, now = 0;
    for (const [rule, r] of Object.entries(ruleRatchet)) {
      next[rule] = { started: r.started, files: {} };
      for (const [k, c] of Object.entries(r.files)) {
        was += c;
        const n = Math.min(c, ruleNow[rule][k] || 0);
        if (n > 0) { next[rule].files[k] = n; now += n; }
      }
    }
    writeRuleRatchet(next);
    console.log('[trap-lint] rule ratchet lowered: ' + was + ' -> ' + now + ' grandfathered site(s) (' + path.basename(RULE_RATCHET_FILE) + '); commit it with the fix');
  }
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
{
  const parts = RATCHETED_RULES.filter(r => ruleGrand[r] > 0).map(r => r + ' ' + ruleGrand[r]);
  let ruleHeadroom = 0;
  if (all) for (const [rule, r] of Object.entries(ruleRatchet)) for (const [k, c] of Object.entries(r.files)) ruleHeadroom += Math.max(0, c - (ruleNow[rule][k] || 0));
  if (parts.length || ruleHeadroom) line += '; ratcheted rules: ' + (parts.length ? parts.join(', ') + ' grandfathered' : 'none grandfathered') +
    (ruleHeadroom > 0 && !ratchetDown ? ' (' + ruleHeadroom + ' fewer than recorded: --ratchet-down)' : '');
}
console.log(line);
process.exitCode = total ? 1 : 0;
