#!/usr/bin/env node
// =============================================================================
// gen_liveness.js -- the liveness manifest is GENERATED from the scripts
// =============================================================================
// A script that loaded has proved nothing. What the pack's scripts register
// (ARMED) and what must be seen running (FIRED) is read here from the script
// sources, so nobody hand-writes a list that can go stale:
//
//   icraft.guard('<name>', '<event>', handler)      ARMED   <name>@<event>
//   icraft.handler('<name>', '<Registry>.<method>', fn)   ARMED   <name>@<Registry>.<method>
//                                                   (a function put straight on a Java registry)
//   global.registerServerTick('<name>', ...)        ARMED   <name>@tick.server
//   global.registerPlayerTick('<name>', ...)        ARMED   <name>@tick.player
//   <core>.onHurt('<key>', ...) / .onHurtLate(...)  ARMED   <key>@hurt / <key>@hurt.late
//   icraft.section('<name>', fn)                    FIRED   only (inside its handler)
//   icraft.live.fired('<name>')                     FIRED   only (a feature did its work)
//
// The runtime half is kubejs/*_scripts/00_icraft_guard.js (icraft.live) and
// zzz_icraft_live.js: they print `[icraft.live] ARMED <type>: <n> registrations
// (...), digest <16 hex>` once per script load and `[icraft.live] FIRED ...` the
// first time each id runs to its end.
//
// WRITES (all three are generated; never edit them by hand)
//   dev/loud/liveness_manifest.json           what dev/loud/loud-check.ps1 holds a boot to:
//                                             the ARMED ids and digest per script type (of the
//                                             DEDICATED SERVER tree for server and startup, of
//                                             the client distribution for client), the names
//                                             that can fire, and the hand-kept log lines of
//                                             dev/loud/liveness_lines.json copied through
//   kubejs/config/icraft/live/expected.json   (x3 trees, one file) what the game itself compares
//                                             with: the union of the three trees, an id that is
//                                             not in every tree marked optional
//   --sheet <file>                            the in-game check sheet (markdown): for every id,
//                                             the action that makes it fire (dev/loud/liveness_actions.json)
//
//   node --expose-internals .minecraft/dev/loud/gen_liveness.js            write
//   node --expose-internals .minecraft/dev/loud/gen_liveness.js --check    exit 1 when a file on disk is stale
//   node --expose-internals .minecraft/dev/loud/gen_liveness.js --sheet <file.md>
//   node --expose-internals .minecraft/dev/loud/gen_liveness.js --lines    where each hand-kept line is printed
//   ... --pack <another .minecraft>
//
// Exit 0 ok, 1 stale (--check) or a script the generator cannot read reliably
// (a name that is not a string literal, an id used twice, a section outside any
// guarded handler), 2 could not run.
// The pre-push hook runs --check through dev/engine-tests/run.py (suite
// `liveness-manifest`), so a registration added, renamed or removed without
// regenerating does not reach main.
// =============================================================================
'use strict';
let acorn;
try { acorn = require('internal/deps/acorn/acorn/dist/acorn'); }
catch (e) {
  console.error('[gen-liveness] CANNOT RUN: the bundled parser is not reachable (' + e.message + '). Run with: node --expose-internals ' + __filename);
  process.exit(2);
}
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const PACK = path.resolve(opt('--pack') || path.join(__dirname, '..', '..'));
const CHECK = flag('--check');
const SHEET = opt('--sheet');
const SHOW_LINES = flag('--lines');
const QUIET = flag('--quiet');

const TREES = { root: 'kubejs', server: 'server_distribution/kubejs', client: 'distribution/client/kubejs' };
const TYPES = ['server', 'startup', 'client'];
// the tree whose scripts a script type is JUDGED by (the checker reads a dedicated server's logs; a client's
// own log is checked against the client distribution)
const JUDGED_BY = { server: 'server', startup: 'server', client: 'client' };
// the trees a script type is deployed from: an id missing from one of them is optional for the game's own check
const DEPLOYED = { server: ['root', 'server', 'client'], startup: ['root', 'server', 'client'], client: ['root', 'client'] };
const LOGS = { server: 'kubejs/server.log', startup: 'kubejs/startup.log', client: 'kubejs/client.log' };
const LIVE_SCRIPT = 'zzz_icraft_live.js';
const MANIFEST = path.join(PACK, 'dev', 'loud', 'liveness_manifest.json');
const LINES = path.join(PACK, 'dev', 'loud', 'liveness_lines.json');
const ACTIONS = path.join(PACK, 'dev', 'loud', 'liveness_actions.json');
const EXPECTED_REL = 'config/icraft/live/expected.json';

// Events whose handlers run on every boot with nobody online: registration-time events and the load
// itself. Their ids are listed under `at_boot`; one of them that did not fire in a finished boot is a finding
// of the checker (`notfired:<id>`, AMBER, since 2026-10-13: the one exception to "FIRED is never a finding").
// On the live server's first boot with these lines all 104 fired. Held to a real boot: proof 4 of the
// package compares this list with what a full-pack boot fired before anyone joined.
const AT_BOOT = /^(?:ServerEvents\.(?:recipes|afterRecipes|tags|highPriorityData|lowPriorityData|commandRegistry|loaded|tick|\w*LootTables)|LootJS\.modifiers|StartupEvents\.\w+|ItemEvents\.(?:modification|toolTierRegistry|armorTierRegistry)|BlockEvents\.modification|WorldgenEvents\.\w+)$/;

// ---- the digest: the SAME arithmetic as 00_icraft_guard.js (suite event-guard holds the two together) ----
const ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
const HEX = '0123456789abcdef';
function hex8(n) { let out = ''; for (let i = 0; i < 8; i++) { const d = n % 16; out = HEX.charAt(d) + out; n = (n - d) / 16; } return out; }
function digest(sortedIds) {
  let a = 7, b = 11;
  for (const s of sortedIds) {
    for (let j = 0; j < s.length; j++) {
      const c = ASCII.indexOf(s.charAt(j)) + 32;
      a = (a * 31 + c) % 2147483647;
      b = (b * 131 + c) % 2147483629;
    }
    a = (a * 31 + 10) % 2147483647;
    b = (b * 131 + 10) % 2147483629;
  }
  return hex8(a) + hex8(b);
}

// ---- reading one script ---------------------------------------------------------
const problems = [];
const problem = (where, msg) => problems.push(where + ': ' + msg);
const strLit = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value : null;
const isFn = (n) => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const memberName = (n) => (n && n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') ? n.property.name : null;
const isIcraft = (n, prop) => !!n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
  n.callee.object.type === 'Identifier' && n.callee.object.name === 'icraft' && n.callee.property.name === prop;
// icraft.live.fired(...)
const isLiveFired = (n) => !!n && n.type === 'CallExpression' && memberName(n.callee) === 'fired' && n.callee.object.type === 'MemberExpression' &&
  memberName(n.callee.object) === 'live' && n.callee.object.object.type === 'Identifier' && n.callee.object.object.name === 'icraft';
const TICKS = { registerServerTick: 'tick.server', registerPlayerTick: 'tick.player' };
const HURTS = { onHurt: 'hurt', onHurtLate: 'hurt.late' };
const CONSOLE = new Set(['log', 'info', 'warn', 'error']);
// string as the game prints it, every non-literal part replaced by a sample digit
function flat(n) {
  if (!n) return '7';
  if (n.type === 'Literal') return typeof n.value === 'string' ? n.value : String(n.raw);
  if (n.type === 'TemplateLiteral') { let s = ''; n.quasis.forEach((q, i) => { s += q.value.cooked; if (i < n.expressions.length) s += '7'; }); return s; }
  if (n.type === 'BinaryExpression' && n.operator === '+') return flat(n.left) + flat(n.right);
  if (n.type === 'ConditionalExpression') return flat(n.consequent);
  return '7';
}

// -> { regs: [{ id, line, ctx }], sections: [{ name, of, line }], features: [{ name, line }],
//      logs: [{ text, level, line, ctx }], direct: [{ what, line }] }
// ctx: 'load' (runs while the file loads), 'handler:<id>' / 'tick:<id>' / 'hurt:<id>' (inside that function),
//      'function' (some other function: when it runs is not known from here)
function readScript(file, where) {
  const src = fs.readFileSync(file, 'utf8');
  const out = { regs: [], sections: [], features: [], logs: [], direct: [] };
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
  catch (e) { problem(where, 'does not parse (' + e.message + ')'); return out; }

  // first pass: functions that are handed over BY NAME (icraft.guard('x', 'E', onThing); registerServerTick('t', 5, 0, onTick);
  // global.tick_x = function ...) so that what is inside them is attributed to the right id
  const named = new Map();     // function name -> ctx
  const globals = new Map();   // global.<name> -> ctx
  const regOf = (call) => {
    if ((isIcraft(call, 'guard') || isIcraft(call, 'handler')) && call.arguments.length === 3) {
      const name = strLit(call.arguments[0]), ev = strLit(call.arguments[1]);
      if (name !== null && ev !== null) return { ctx: 'handler:' + name + '@' + ev, fn: call.arguments[2] };
    }
    const m = memberName(call.callee);
    if (m && TICKS[m]) {
      const name = strLit(call.arguments[0]);
      if (name !== null) return { ctx: 'tick:' + name + '@' + TICKS[m], fn: call.arguments[3] || null, global: name };
    }
    if (m && HURTS[m]) {
      const key = strLit(call.arguments[0]);
      if (key !== null) return { ctx: 'hurt:' + key + '@' + HURTS[m], fn: call.arguments[1] || null };
    }
    return null;
  };
  // names bound to one of the mod's own Java registries (DamageModifierRegistry, ForgeEventRegistry,
  // ItemAttributeRegistry): `var X = Java.loadClass('com.iridescentcraft....Registry')`, or through a local loadClass helper
  const registries = new Set();
  const scan = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'CallExpression') {
      const cls = strLit(n.init.arguments[0]);
      if (cls !== null && /^com\.iridescentcraft\..*Registry$/.test(cls)) registries.add(n.id.name);
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.right.type === 'CallExpression') {
      const cls = strLit(n.right.arguments[0]);
      if (cls !== null && /^com\.iridescentcraft\..*Registry$/.test(cls)) registries.add(n.left.name);
    }
    if (n.type === 'CallExpression') {
      const r = regOf(n);
      if (r) {
        if (r.fn && r.fn.type === 'Identifier') named.set(r.fn.name, r.ctx);
        if (r.global && !r.fn) globals.set(r.global, r.ctx);
      }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v.type === 'string') scan(v);
    }
  };
  scan(ast);

  const walk = (n, parent, ctx, handler) => {
    if (!n || typeof n.type !== 'string') return;
    let inner = ctx, innerHandler = handler;
    if (isFn(n)) {
      const iife = parent && parent.type === 'CallExpression' && parent.callee === n;
      const reg = parent && parent.type === 'CallExpression' && parent.arguments.includes(n) ? regOf(parent) : null;
      const inSection = parent && isIcraft(parent, 'section');
      let byName = null;
      if (n.type === 'FunctionDeclaration' && n.id && named.has(n.id.name)) byName = named.get(n.id.name);
      if (parent && parent.type === 'VariableDeclarator' && parent.init === n && parent.id.type === 'Identifier' && named.has(parent.id.name)) byName = named.get(parent.id.name);
      if (parent && parent.type === 'AssignmentExpression' && parent.right === n) {
        const l = parent.left;
        if (l.type === 'Identifier' && named.has(l.name)) byName = named.get(l.name);
        if (l.type === 'MemberExpression' && !l.computed && l.object.type === 'Identifier' && l.object.name === 'global' && globals.has(l.property.name)) byName = globals.get(l.property.name);
      }
      if (iife || inSection) inner = ctx;
      else if (reg && reg.fn === n) inner = reg.ctx;
      else if (byName) inner = byName;
      else inner = 'function';
      if (inner.indexOf('handler:') === 0) innerHandler = inner.substring(8);
      else if (inner !== ctx) innerHandler = null;
    }
    if (n.type === 'CallExpression') {
      const line = n.loc.start.line;
      const m = memberName(n.callee);
      if (isIcraft(n, 'guard')) {
        const name = strLit(n.arguments[0]), ev = strLit(n.arguments[1]);
        if (n.arguments.length !== 3 || name === null || ev === null) problem(where + ':' + line, 'icraft.guard: name and event must be string literals (lint rule GUARD-SHAPE says the same)');
        else {
          // what the handler is registered FOR, when the registration names it: ItemEvents.rightClicked('<item>', guard(..))
          let detail = '';
          if (parent && parent.type === 'CallExpression' && parent.arguments.length > 1 && parent.arguments[0] !== n) {
            const lit = strLit(parent.arguments[0]);
            detail = lit !== null ? 'for `' + lit + '`' : 'for a value the script computes (several items: see the script)';
          }
          out.regs.push({ id: name + '@' + ev, line, ctx, detail });
        }
      } else if (isIcraft(n, 'handler')) {
        // a function put straight on a Java registry, with its liveness id (00_icraft_guard.js, icraft.handler)
        const name = strLit(n.arguments[0]), group = strLit(n.arguments[1]);
        if (n.arguments.length !== 3 || name === null || group === null) problem(where + ':' + line, 'icraft.handler: name and group must be string literals (lint rule GUARD-SHAPE says the same)');
        else out.regs.push({ id: name + '@' + group, line, ctx, detail: 'called from Java by `' + group + '`' });
      } else if (isIcraft(n, 'section')) {
        const name = strLit(n.arguments[0]);
        if (name === null) problem(where + ':' + line, 'icraft.section: the name must be a string literal');
        else if (handler === null) problem(where + ':' + line, "icraft.section('" + name + "') is not inside a guarded handler of this file: the generator cannot say which handler owes it");
        else out.sections.push({ name, of: handler, line });
      } else if (isLiveFired(n)) {
        const name = strLit(n.arguments[0]);
        if (n.arguments.length !== 1 || name === null) problem(where + ':' + line, 'icraft.live.fired: the name must be ONE string literal (the manifest and the check sheet are generated from it)');
        else if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) problem(where + ':' + line, "icraft.live.fired('" + name + "'): a feature name is lower-case words joined by '-'");
        else out.features.push({ name, line });
      } else if (m && TICKS[m] && n.callee.object.type === 'Identifier' && n.callee.object.name === 'global') {
        const name = strLit(n.arguments[0]);
        if (name === null) problem(where + ':' + line, m + ': the name must be a string literal (the manifest is generated from it)');
        else {
          const num = (a) => (a && a.type === 'Literal' && typeof a.value === 'number') ? a.value : (a && a.type === 'Identifier' ? a.name : '?');
          const iv = num(n.arguments[1]), off = num(n.arguments[2]);
          const secs = (typeof iv === 'number') ? ' (' + (iv / 20) + ' s)' : '';
          out.regs.push({ id: name + '@' + TICKS[m], line, ctx, detail: 'every ' + iv + ' ticks' + secs + ', offset ' + off });
        }
      } else if (m && HURTS[m] && n.arguments.length >= 2) {
        const key = strLit(n.arguments[0]);
        if (key === null) problem(where + ':' + line, '.' + m + ': the key must be a string literal (the manifest is generated from it)');
        else {
          const who = strLit(n.arguments[2]);
          const WHO = { any: 'any hit on the server', attacker: 'a hit that has an attacker', attackerPlayer: 'a hit dealt by a player', victimPlayer: 'a hit taken by a player', player: 'a hit with a player on either side' };
          out.regs.push({ id: key + '@' + HURTS[m], line, ctx, detail: (WHO[who] || WHO.any) + (n.arguments.length > 3 ? ', while its gate is open' : '') });
        }
      } else if (m && CONSOLE.has(m) && n.callee.object.type === 'Identifier' && n.callee.object.name === 'console') {
        out.logs.push({ text: flat(n.arguments[0]), level: m, line, ctx });
      } else if (m && /^register[A-Z]?\w*$/.test(m) && n.callee.object.type === 'Identifier' && registries.has(n.callee.object.name) &&
                 !n.arguments.some((a) => isIcraft(a, 'handler'))) {
        // a handler put straight on one of the mod's Java registries WITHOUT icraft.handler: it has no id at all
        out.direct.push({ what: n.callee.object.name + '.' + m, line, ctx });
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => walk(x, n, inner, innerHandler));
      else if (v && typeof v.type === 'string') walk(v, n, inner, innerHandler);
    }
  };
  walk(ast, null, 'load', null);
  return out;
}

function listScripts(dir) {
  const out = [];
  const rec = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) rec(path.join(d, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) out.push(rel + e.name);
    }
  };
  if (fs.existsSync(dir)) rec(dir, '');
  return out.sort();
}

// ---- every tree, every script type -------------------------------------------
// data[tree][type] = { scripts: [rel], armed: Map(id -> script), sections: Map(handler id -> [name]),
//                      features: Map(name -> script), late: [id], perScript: Map(rel -> readScript result) }
const data = {};
for (const tree of Object.keys(TREES)) {
  data[tree] = {};
  for (const type of TYPES) {
    const dir = path.join(PACK, TREES[tree], type + '_scripts');
    const d = { scripts: listScripts(dir), armed: new Map(), sections: new Map(), features: new Map(), late: [], perScript: new Map(), detail: new Map(), exists: fs.existsSync(dir) };
    for (const rel of d.scripts) {
      const where = TREES[tree] + '/' + type + '_scripts/' + rel;
      const r = readScript(path.join(dir, rel), where);
      d.perScript.set(rel, r);
      for (const g of r.regs) {
        if (d.armed.has(g.id)) problem(where + ':' + g.line, "the id '" + g.id + "' is registered twice (also in " + d.armed.get(g.id) + '): the second would replace or shadow the first in every report');
        d.armed.set(g.id, rel);
        if (g.detail) d.detail.set(g.id, g.detail);
        // made inside another registration's function: it exists only after that one has run
        if (g.ctx !== 'load' && g.ctx !== 'function') d.late.push(g.id);
      }
      for (const s of r.sections) {
        if (!d.sections.has(s.of)) d.sections.set(s.of, []);
        if (d.sections.get(s.of).includes(s.name)) problem(where + ':' + s.line, "icraft.section('" + s.name + "') is used twice in one handler");
        d.sections.get(s.of).push(s.name);
      }
      for (const f of r.features) {
        if (d.features.has(f.name) && d.features.get(f.name) !== rel) problem(where + ':' + f.line, "the feature '" + f.name + "' is reported from two scripts (" + d.features.get(f.name) + ' too): give each its own name');
        d.features.set(f.name, rel);
      }
    }
    data[tree][type] = d;
  }
}
if (!data.server.server.exists || data.server.server.scripts.length === 0) {
  console.error('[gen-liveness] CANNOT RUN: no server scripts under ' + path.join(PACK, TREES.server));
  process.exit(2);
}

// ---- kubejs/config/icraft/live/expected.json: what the game compares with -----
const sortedObj = (map) => { const o = {}; for (const k of [...map.keys()].sort()) o[k] = map.get(k); return o; };
const expected = {
  about: [
    'GENERATED by dev/loud/gen_liveness.js from the scripts; do not edit. Read by kubejs/*_scripts/00_icraft_guard.js (icraft.live.loaded) when the scripts of a type have loaded.',
    'Per script type: `armed` = every registration the scripts make while they load (id -> script; an id is <name>@<group>: the event of a guarded handler, tick.server / tick.player, hurt / hurt.late), `optional` = ids that are not in every tree the type is deployed from (a dev-only script), `late` = ids registered inside another handler (not compared at load), `sections` = guarded handler -> the sections inside it, `features` = icraft.live.fired names -> script.',
    'A registration that is in the list and was not made prints `[icraft.live] NOT ARMED ...` (an ERROR line); one that was made and is not here prints `[icraft.live] UNLISTED ...`. The pre-push hook refuses a stale file (suite liveness-manifest).'
  ],
  schema: 1
};
for (const type of TYPES) {
  const armed = new Map(), sections = new Map(), features = new Map(), late = new Set();
  const inTrees = new Map();
  for (const tree of DEPLOYED[type]) {
    const d = data[tree][type];
    for (const [id, rel] of d.armed) { armed.set(id, rel); inTrees.set(id, (inTrees.get(id) || 0) + 1); }
    for (const [h, list] of d.sections) sections.set(h, list.slice());
    for (const [name, rel] of d.features) features.set(name, rel);
    for (const id of d.late) late.add(id);
  }
  const optional = [...armed.keys()].filter((id) => inTrees.get(id) < DEPLOYED[type].length).sort();
  const part = { armed: sortedObj(armed) };
  // a late id is never "not armed at load": the game says `ARMED late` when it is made
  part.optional = [...new Set(optional.concat([...late]))].sort();
  part.late = [...late].sort();
  part.sections = sortedObj(sections);
  part.features = sortedObj(features);
  expected[type] = part;
}
const expectedText = JSON.stringify(expected, null, 1) + '\n';

// ---- dev/loud/liveness_manifest.json: what the checker holds a boot to --------
let lines = null;
try { lines = JSON.parse(fs.readFileSync(LINES, 'utf8')); }
catch (e) { console.error('[gen-liveness] CANNOT RUN: ' + LINES + ' is unreadable (' + e.message + ')'); process.exit(2); }
if (!Array.isArray(lines.entries)) { console.error('[gen-liveness] CANNOT RUN: ' + LINES + ' has no "entries" list'); process.exit(2); }

// a line left behind for a script that is gone would never be judged again (the checker skips a line whose
// script is not in the tree of the boot): refuse it here
for (const e of lines.entries) {
  const owner = String(e.owner || '');
  if (!e.id || !e.owner || !e.log || !e.pattern || !e.proves || !e.why) problem(path.basename(LINES), 'an entry lacks id / owner / log / pattern / proves / why: ' + JSON.stringify(e).slice(0, 120));
  if (owner.indexOf('kubejs/server_scripts/') === 0 && !data[JUDGED_BY.server].server.perScript.has(owner.substring('kubejs/server_scripts/'.length)))
    problem(path.basename(LINES), "entry '" + e.id + "' names " + owner + ', which is not in ' + TREES[JUDGED_BY.server] + ': remove the entry in the commit that removes the script');
}

const manifest = {
  version: 2,
  about: [
    'GENERATED by dev/loud/gen_liveness.js; do not edit. Read by dev/loud/loud-check.ps1 (and by dev/boot, which hands it to the checker).',
    'ARMED tier, exact: `armed.<type>` lists every registration the scripts of the tree make while they load (server and startup: the DEDICATED SERVER tree; client: the client distribution), with the digest the game prints in its `[icraft.live] ARMED <type>: ...` line. A boot whose digest is not this one is RED, and the registrations are named from the `[icraft.live] NOT ARMED` / `UNLISTED` lines.',
    'It applies to a boot whose deployed tree has ' + LIVE_SCRIPT + ' (older boots have no such lines and are judged by `entries` alone).',
    'FIRED tier: `fired.<type>` lists what else can be seen running: `sections` (name, and the handler it is in) and `features` (icraft.live.fired names). Every armed id fires too. FIRED is reported and never a failure by itself, with one exception: `at_boot` are the armed ids whose event runs on every boot with nobody online, and one of them that did not fire in a finished boot is a finding (`notfired:`, AMBER).',
    '`entries` = the hand-kept log lines of dev/loud/liveness_lines.json, copied through: lines that prove something the generated set does not (each says what, under `proves`). Edit them THERE.'
  ],
  boot_complete: lines.boot_complete,
  generated: { by: 'dev/loud/gen_liveness.js', live_script: LIVE_SCRIPT },
  armed: {},
  fired: {},
  entries: lines.entries
};
for (const type of TYPES) {
  const d = data[JUDGED_BY[type]][type];
  const late = new Set(d.late);
  const ids = [...d.armed.keys()].filter((id) => !late.has(id)).sort();
  manifest.armed[type] = {
    log: LOGS[type],
    tree: TREES[JUDGED_BY[type]] + '/' + type + '_scripts',
    count: ids.length,
    digest: digest(ids),
    late: [...late].sort(),
    at_boot: ids.filter((id) => AT_BOOT.test(id.substring(id.lastIndexOf('@') + 1))),
    registrations: ids.map((id) => ({ id, script: d.armed.get(id) }))
  };
  const sections = [];
  for (const h of [...d.sections.keys()].sort()) for (const name of d.sections.get(h)) sections.push({ name, of: h });
  manifest.fired[type] = {
    sections,
    features: [...d.features.keys()].sort().map((name) => ({ name, script: d.features.get(name) }))
  };
}
const manifestText = JSON.stringify(manifest, null, 1) + '\n';

// ---- the hand-kept lines: is each one still worth keeping? ----------------------
// A line printed while its file loads proves that the file got that far. The generated set proves that
// every registration of the file was made. So such a line is kept only when the script arms something the
// generated set cannot see (a handler put straight on a Java registry), or when the entry checks more
// than presence (must_not, min).
function lineReport() {
  const d = data[JUDGED_BY.server].server;
  const rows = [];
  for (const e of lines.entries) {
    const owner = String(e.owner || '');
    if (owner.indexOf('kubejs/server_scripts/') !== 0) { rows.push({ id: e.id, where: 'not a script', regs: 0, direct: 0 }); continue; }
    const rel = owner.substring('kubejs/server_scripts/'.length);
    const r = d.perScript.get(rel);
    if (!r) { rows.push({ id: e.id, where: 'OWNER GONE', regs: 0, direct: 0 }); continue; }
    let rx = null;
    try { rx = new RegExp(String(e.pattern).replace(/^.*?#\\d\+: ?/, '')); } catch (err) { rx = null; }
    const hits = rx ? r.logs.filter((l) => rx.test(l.text)) : [];
    const where = hits.length === 0 ? 'NOT FOUND' : [...new Set(hits.map((h) => h.ctx))].join(' | ');
    rows.push({ id: e.id, where, regs: r.regs.filter((g) => g.ctx === 'load' || g.ctx === 'function').length, direct: r.direct.length, extra: ['must_not', 'min'].filter((k) => e[k] !== undefined).join('+') });
  }
  return rows;
}

// ---- the check sheet ------------------------------------------------------------
function sheet() {
  let actions = { events: {}, ids: {}, features: {}, groups: {} };
  try { actions = JSON.parse(fs.readFileSync(ACTIONS, 'utf8')); }
  catch (e) { console.error('[gen-liveness] CANNOT RUN: ' + ACTIONS + ' is unreadable (' + e.message + ')'); process.exit(2); }
  const L = [];
  const missing = [];
  // an entry of its own, else the action of its event; a tick function and a hurt handler are described by
  // what the script itself says (interval, who), which the group's line explains
  const how = (id, type) => {
    const at = id.lastIndexOf('@');
    const group = id.substring(at + 1);
    const detail = data[JUDGED_BY[type]][type].detail.get(id) || '';
    let a = null;
    if (actions.ids && actions.ids[id]) a = actions.ids[id];
    else if (actions.events && actions.events[group]) a = actions.events[group];
    else if (detail && (group.indexOf('tick.') === 0 || group.indexOf('hurt') === 0)) return detail;
    if (a === null) { missing.push(id); return null; }
    if (!detail) return a;
    const o = (typeof a === 'string') ? { do: a } : Object.assign({}, a);
    o.do = (o.do || '') + ' Registered ' + detail + '.';
    return o;
  };
  const cell = (v) => {
    if (v === null) return '**no action written yet** (add one to `dev/loud/liveness_actions.json`)';
    const o = (typeof v === 'string') ? { do: v } : v;
    let s = String(o.do || '');
    if (o.cmd) s += (s ? ' ' : '') + [].concat(o.cmd).map((c) => '`' + c + '`').join(' then ');
    if (o.needs) s += ' _(needs: ' + o.needs + ')_';
    return s.replace(/\|/g, '\\|');
  };
  L.push('# Liveness check sheet: how to make each FIRED line appear');
  L.push('');
  L.push('<!-- GENERATED by the pack repo\'s .minecraft/dev/loud/gen_liveness.js --sheet from the scripts and');
  L.push('     dev/loud/liveness_actions.json. Do not edit: change the actions file and regenerate. INTERNAL ONLY. -->');
  L.push('');
  L.push('Every name below prints one line the first time it runs to its end after the scripts load:');
  L.push('');
  L.push('    [icraft.live] FIRED <group> x<n>: <name>, <name>, ...');
  L.push('');
  L.push('in `logs/kubejs/server.log` (startup scripts: `startup.log`; client scripts: `client.log` on the client) and in');
  L.push('`logs/latest.log`. On the server the names of one second share a line. `/icraft live` lists what has not fired');
  L.push('since the load; `/icraft live <part of a name or script>` narrows it. A scripted check does the action, waits two');
  L.push('seconds, and asserts that a FIRED line of that group names the id. `<Name>` is the test player.');
  L.push('');
  L.push('Commands need operator level or the server console. Ids are the ones the scripts use.');
  L.push('');
  for (const type of TYPES) {
    const m = manifest.armed[type];
    const f = manifest.fired[type];
    L.push('## ' + type + ' scripts (' + m.count + ' registrations, ' + f.features.length + ' features, ' + f.sections.length + ' sections)');
    L.push('');
    if (f.features.length > 0) {
      L.push('### Features (`FIRED feature`): the feature did its work, not just its handler');
      L.push('');
      L.push('| Feature | Script | What the line proves | How to make it fire |');
      L.push('|---|---|---|---|');
      for (const x of f.features) {
        const a = (actions.features || {})[x.name];
        if (!a) missing.push(x.name + '@feature');
        L.push('| `' + x.name + '` | `' + x.script + '` | ' + (a ? String(a.proves || '').replace(/\|/g, '\\|') : '') + ' | ' + cell(a || null) + ' |');
      }
      L.push('');
    }
    const boot = new Set(m.at_boot);
    const groups = new Map();
    for (const r of m.registrations) {
      const g = r.id.substring(r.id.lastIndexOf('@') + 1);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    const atBoot = [...groups.keys()].filter((g) => groups.get(g).every((r) => boot.has(r.id))).sort();
    const inPlay = [...groups.keys()].filter((g) => !atBoot.includes(g)).sort();
    if (atBoot.length > 0) {
      L.push('### Fire on every boot, with nobody online');
      L.push('');
      L.push('Nothing to do: a finished boot prints them. The checker lists one that did not fire under `AT BOOT`.');
      L.push('');
      L.push('| Group | Ids |');
      L.push('|---|---|');
      for (const g of atBoot) L.push('| `' + g + '` (' + groups.get(g).length + ') | ' + groups.get(g).map((r) => '`' + r.id.substring(0, r.id.lastIndexOf('@')) + '`').join(', ') + ' |');
      L.push('');
    }
    if (inPlay.length > 0) {
      L.push('### Need a player or an action');
      L.push('');
      for (const g of inPlay) {
        const ga = (actions.groups || {})[g];
        L.push('#### `' + g + '` (' + groups.get(g).length + ')' + (ga ? ': ' + ga : ''));
        L.push('');
        L.push('| Id | Script | How to make it fire |');
        L.push('|---|---|---|');
        for (const r of groups.get(g)) L.push('| `' + r.id.substring(0, r.id.lastIndexOf('@')) + '` | `' + r.script + '` | ' + cell(how(r.id, type)) + ' |');
        L.push('');
      }
    }
    if (m.late.length > 0) {
      L.push('Registered inside another handler (the game says `ARMED late` when it is made): ' + m.late.map((x) => '`' + x + '`').join(', ') + '.');
      L.push('');
    }
  }
  L.push('## Sections');
  L.push('');
  L.push('A section is a block inside a long registration handler; it runs when its handler runs. The game prints');
  L.push('`[icraft.live] NOT RUN section (...)` when a handler finished and a section of it did not, and nothing otherwise.');
  L.push('');
  return { text: L.join('\n') + '\n', missing };
}

// ---- write or check ---------------------------------------------------------------
const targets = [[MANIFEST, manifestText]];
for (const tree of Object.keys(TREES)) targets.push([path.join(PACK, TREES[tree], EXPECTED_REL), expectedText]);

if (problems.length > 0) {
  for (const p of problems) console.error('[gen-liveness] ' + p);
  console.error('[gen-liveness] ' + problems.length + ' problem(s) in the scripts: nothing was written');
  process.exit(1);
}
if (SHOW_LINES) {
  for (const r of lineReport()) console.log([r.id, r.where, 'regs=' + r.regs, 'direct=' + r.direct, r.extra || ''].join('\t'));
  process.exit(0);
}
if (SHEET) {
  const s = sheet();
  fs.mkdirSync(path.dirname(path.resolve(SHEET)), { recursive: true });
  fs.writeFileSync(path.resolve(SHEET), s.text);
  console.log('[gen-liveness] check sheet written: ' + path.resolve(SHEET) + (s.missing.length ? ' (' + s.missing.length + ' id(s) without an action: ' + s.missing.slice(0, 8).join(', ') + (s.missing.length > 8 ? ', ...' : '') + ')' : ''));
  process.exit(s.missing.length ? 1 : 0);
}
const same = (file, text) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text;
const stale = targets.filter(([file, text]) => !same(file, text)).map(([file]) => path.relative(PACK, file).split(path.sep).join('/'));
const summary = TYPES.map((t) => t + ' ' + manifest.armed[t].count + ' armed (' + manifest.armed[t].digest + '), ' +
  manifest.fired[t].sections.length + ' sections, ' + manifest.fired[t].features.length + ' features').join('; ');
if (CHECK) {
  if (stale.length > 0) {
    console.error('[gen-liveness] STALE: ' + stale.join(', '));
    console.error('[gen-liveness] a script registers, names or reports something the committed liveness files do not have (or no longer does).');
    console.error('[gen-liveness] Regenerate and commit:  node --expose-internals .minecraft/dev/loud/gen_liveness.js');
    process.exit(1);
  }
  if (!QUIET) console.log('[gen-liveness] up to date: ' + summary + '; ' + manifest.entries.length + ' hand-kept lines');
  process.exit(0);
}
for (const [file, text] of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!same(file, text)) fs.writeFileSync(file, text);
}
console.log('[gen-liveness] ' + (stale.length ? 'wrote ' + stale.join(', ') : 'nothing to write') + ': ' + summary + '; ' + manifest.entries.length + ' hand-kept lines');
