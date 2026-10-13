#!/usr/bin/env node
// =============================================================================
// gen_catalogue.js -- the script catalogue is GENERATED from the code
// =============================================================================
// Which script owns which event? Who sets `global.ICRAFT_ASCENSION`, and who reads
// it? In which order do the handlers of EntityEvents.spawned run? Until 2026-10-13
// the answer was a search through 197 files, or a header somebody wrote once.
//
// This tool reads every script (script_model.js) and writes
//   dev/catalogue/CATALOGUE.md     for a reader: the load order, every order
//                                  constraint and what holds it, every event with its
//                                  handlers IN THE ORDER THEY RUN, the tick functions,
//                                  the globals (who sets, who reads), the libraries,
//                                  and one entry per script
//   dev/catalogue/catalogue.json   the same facts for a tool
// from the CODE and the liveness manifest (dev/loud/liveness_manifest.json), never
// from a hand-kept header: a header field is only ever checked (load_order.js).
// It describes the canonical tree, .minecraft/kubejs, and says where a distribution
// lacks a script.
//
// It refuses to write when its own reading of the registrations differs from the
// liveness manifest's (two tools, one truth: the manifest is stale, or one of the
// two reads a script wrongly), and when load_order.js fails.
//
//   node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js           write
//   node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js --check   exit 1 when a file on disk is stale
//   ... --pack <another .minecraft>   --quiet
//
// Nothing in the two files changes when code only moves inside a file: no line
// numbers, no dates, no commit. Exit 0 ok, 1 stale or inconsistent, 2 could not run.
// The pre-push hook and CI run --check: a script change that alters a fact of the
// catalogue does not reach main without the regenerated files.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
let M, L;
try { M = require('./script_model.js'); M.readCode('var a'); L = require('./load_order.js'); }
catch (e) { console.error('[catalogue] CANNOT RUN: ' + e.message + '. Run with: node --expose-internals ' + __filename); process.exit(2); }

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const PACK = path.resolve(opt('--pack') || path.join(__dirname, '..', '..'));
const CHECK = flag('--check');
const QUIET = flag('--quiet');
const OUT_JSON = path.join(PACK, 'dev', 'catalogue', 'catalogue.json');
const OUT_MD = path.join(PACK, 'dev', 'catalogue', 'CATALOGUE.md');
const MANIFEST = path.join(PACK, 'dev', 'loud', 'liveness_manifest.json');
// the tree the liveness manifest judges a script type by (gen_liveness.js, JUDGED_BY)
const JUDGED = { server: 'server', startup: 'server', client: 'client' };
const TYPE_ORDER = ['startup', 'server', 'client'];

if (!fs.existsSync(path.join(PACK, 'kubejs', 'server_scripts'))) { console.error('[catalogue] CANNOT RUN: no kubejs/server_scripts under ' + PACK); process.exit(2); }
const model = M.readPack(PACK);
let lists, manifest;
try { lists = L.loadLists(PACK); manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
catch (e) { console.error('[catalogue] CANNOT RUN: ' + e.message); process.exit(2); }
const order = L.check(model, lists);
const problems = [];

// ---- two tools, one truth: the registrations as this tool reads them, and as the liveness manifest lists them ----
for (const type of TYPE_ORDER) {
  const t = model.trees[JUDGED[type]][type];
  const mine = new Set(), sections = new Set(), features = new Set();
  for (const rel of t.order) {
    const c = t.scripts.get(rel).code;
    for (const k of ['guards', 'handlers', 'ticks', 'hurts']) for (const r of c[k]) if (r.load) mine.add(r.id);
    for (const s of c.sections) sections.add(s.name);
    for (const f of c.features) features.add(f.name);
  }
  const part = manifest.armed && manifest.armed[type];
  if (!part) { problems.push('the liveness manifest has no `' + type + '` part'); continue; }
  const theirs = new Set(part.registrations.map((r) => r.id).concat(part.late || []));
  const late = new Set(part.late || []);
  const onlyMine = [...mine].filter((x) => !theirs.has(x)).sort();
  const onlyTheirs = [...theirs].filter((x) => !mine.has(x) && !late.has(x)).sort();
  if (onlyMine.length || onlyTheirs.length) {
    problems.push(type + ' registrations: this tool and dev/loud/liveness_manifest.json disagree (' +
      (onlyMine.length ? 'only here: ' + onlyMine.slice(0, 6).join(', ') + (onlyMine.length > 6 ? ', ...' : '') : '') +
      (onlyMine.length && onlyTheirs.length ? '; ' : '') +
      (onlyTheirs.length ? 'only in the manifest: ' + onlyTheirs.slice(0, 6).join(', ') + (onlyTheirs.length > 6 ? ', ...' : '') : '') +
      '). Regenerate the manifest first:  node --expose-internals .minecraft/dev/loud/gen_liveness.js');
  }
  const fired = manifest.fired && manifest.fired[type];
  if (fired) {
    const ms = new Set(fired.sections.map((s) => s.name)), mf = new Set(fired.features.map((f) => f.name));
    if (ms.size !== sections.size || [...sections].some((x) => !ms.has(x))) problems.push(type + ' sections: this tool finds ' + sections.size + ', the liveness manifest ' + ms.size);
    if (mf.size !== features.size || [...features].some((x) => !mf.has(x))) problems.push(type + ' features: this tool finds ' + features.size + ', the liveness manifest ' + mf.size);
  }
}
for (const e of order.errors) problems.push('load_order.js: ' + (e.type ? e.type + ':' : '') + e.script + ': ' + e.text);

// ---- the places of the hurt dispatcher: the list PLACED of 0_lib_core.js, read from its source ----
const PLACED = (() => {
  const file = path.join(PACK, 'kubejs', 'server_scripts', '0_lib_core.js');
  if (!fs.existsSync(file)) return null;
  const m = /var PLACED = \{\s*first: \[([^\]]*)\],\s*last: \[([^\]]*)\]\s*\}/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) return null;
  const keys = (t) => (t.match(/'[^']+'/g) || []).map((x) => x.slice(1, -1));
  return { first: keys(m[1]), last: keys(m[2]) };
})();

// ---- the facts -------------------------------------------------------------------------
const deps = M.dependencies(model, 'root');
const prov = M.providers(model, 'root');
const treeNames = Object.keys(M.TREES);
const doc = {
  about: [
    'GENERATED by dev/catalogue/gen_catalogue.js from the scripts of .minecraft/kubejs and dev/loud/liveness_manifest.json; do not edit. CATALOGUE.md is the same content for a reader.',
    'Per script type (startup, server, client; they load in that order, each type in its own scope, `global` shared by all three): `scripts` in LOAD ORDER (place 1 loads first; priority = the `// priority` line, 0 when there is none), `events` = every event or group with its handlers in the order they RUN for a firing without a target (a handler registered for a target runs before the untargeted ones when that target fires).',
    'A script: `registers` (guard = an event handler through icraft.guard, handler = a function on a Java registry through icraft.handler, tick, hurt, direct = straight on a Java registry with no id), `sections`, `features` (icraft.live.fired), `registries` read, `sets` (globals it sets while it loads) / `setsLater` (inside a handler), `reads` (each with the script that sets it and `when`: load = while this script loads, so that script must load first; handler = later, no order needed; test = only `typeof`), `after` (order constraints: basis load / same-event = proven by the code, declared = `// @after` by hand; held by priority or by the listing order of the file names), `header` (the fields it carries), `library` (the name it announces), `notIn` (distributions that lack it).',
    'The pre-push hook and CI refuse a stale file:  node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js'
  ],
  schema: 1,
  types: {},
  globals: {},
  libraries: {}
};
const isOwnSlot = (name) => /^(tick_|_)/.test(name);
const shown = (name) => (name.indexOf('icraft.') === 0 ? name : 'global.' + name);

for (const type of TYPE_ORDER) {
  const t = model.trees.root[type];
  const scripts = [];
  const events = new Map();      // group -> [{ script, name, target, kind }]
  for (const rel of t.order) {
    const s = t.scripts.get(rel);
    const c = s.code;
    const registers = [];
    for (const g of c.guards) registers.push({ kind: 'guard', group: g.group, name: g.name, target: g.target, late: !g.load });
    for (const g of c.handlers) registers.push({ kind: 'handler', group: g.group, name: g.name, target: '', late: !g.load });
    for (const g of c.ticks) registers.push({ kind: 'tick', group: g.group, name: g.name, target: '', every: g.interval, offset: g.offset, late: !g.load });
    for (const g of c.hurts) registers.push({ kind: 'hurt', group: g.group, name: g.name, target: '', who: g.who, late: !g.load,
      place: g.place, secondary: g.secondary, cancelled: g.cancelled, unchecked: g.unchecked, gated: g.gated, options: g.options });
    for (const g of c.direct) registers.push({ kind: 'direct', group: g.what, name: g.key, target: '', late: !g.load });
    for (const r of registers) {
      if (!events.has(r.group)) events.set(r.group, []);
      const e = { script: rel, name: r.name, target: r.target, kind: r.kind, late: r.late };
      if (r.kind === 'hurt') Object.assign(e, { who: r.who, place: r.place, secondary: r.secondary, cancelled: r.cancelled, unchecked: r.unchecked, gated: r.gated });
      events.get(r.group).push(e);
    }
    const reads = [];
    for (const d of deps.filter((x) => x.type === type && x.from === rel)) {
      reads.push({ name: d.name, kind: d.kind, from: (d.on.type === type ? '' : d.on.type + ':') + d.on.rel, when: d.typeofOnly ? 'test' : (d.load ? 'load' : 'handler') });
    }
    reads.sort((a, b) => (a.name + a.from < b.name + b.from ? -1 : 1));
    const sets = [...c.provides].filter(([n, p]) => p.load && !isOwnSlot(n)).map(([n]) => n).sort();
    const setsLater = [...c.provides].filter(([n, p]) => !p.load && !isOwnSlot(n)).map(([n]) => n).sort();
    const own = [...c.provides.keys()].filter(isOwnSlot).length;
    const after = order.constraints.filter((k) => k.type === type && k.script === rel && k.trees.includes('root'))
      .map((k) => ({ script: k.after, basis: k.basis, on: k.names, held: k.held, declared: k.declared, why: k.why }));
    const registries = [...c.registries].sort();
    if (c.indirectBoss && !registries.includes('bosses')) registries.push('bosses (through core.isBoss)');
    scripts.push({
      path: rel, place: s.index, priority: s.priority,
      library: c.announces.map((a) => a.name).join(', '),
      notIn: treeNames.filter((tr) => !model.trees[tr][type].scripts.has(rel)).map((tr) => L.TREE_LABEL[tr]),
      registers,
      sections: c.sections.length,
      features: [...new Set(c.features.map((f) => f.name))].sort(),
      registries,
      files: [...c.dataFiles].sort(),
      sets, setsLater, ownSlots: own,
      names: c.declares.length,
      reads, after,
      last: order.lasts.filter((k) => k.type === type && k.script === rel && k.trees.includes('root')).map((k) => k.group),
      header: [...s.header.has].sort()
    });
  }
  // hurt handlers run by place, not by registration alone: `first` (in the order of the library's list PLACED),
  // the unplaced ones as registered, then `last` (the list's order again), in an entry of its own
  if (events.has('hurt')) {
    const list = events.get('hurt');
    for (const r of list) {
      const at = r.script + ' ' + r.name;
      const reg = scripts.find((x) => x.path === r.script).registers.find((x) => x.kind === 'hurt' && x.name === r.name);
      if (reg.options) problems.push(type + ':' + at + ': the options of this hurt handler cannot be read (' + reg.options + '): the run order below would be a guess');
      if (r.place && !PLACED) problems.push(type + ':' + at + ': it is placed `' + r.place + '`, and the list PLACED of 0_lib_core.js could not be read');
      else if (r.place && !(PLACED[r.place] || []).includes(r.name)) problems.push(type + ':' + at + ': placed `' + r.place + '`, but the key is not on PLACED.' + r.place + ' of 0_lib_core.js (the library refuses it at load)');
    }
    const rank = (r) => (PLACED && PLACED[r.place] ? PLACED[r.place].indexOf(r.name) : 0);
    const placed = (p) => list.filter((r) => r.place === p).sort((a, b) => rank(a) - rank(b));
    events.set('hurt', placed('first').concat(list.filter((r) => r.place !== 'first' && r.place !== 'last'), placed('last')));
  }
  const ev = {};
  for (const g of [...events.keys()].sort()) ev[g] = events.get(g);
  doc.types[type] = { count: scripts.length, scripts, events: ev };
}

// globals: every name a script sets while it loads or another script reads
(function globals() {
  const names = new Map();
  for (const [name, list] of prov.globals) {
    if (isOwnSlot(name) && !deps.some((d) => d.name === name)) continue;
    names.set(name, { setBy: list.map((p) => ({ script: p.type + ':' + p.rel, when: p.load ? 'load' : 'handler' })), readBy: [] });
  }
  for (const d of deps) {
    if (d.kind !== 'global' || !names.has(d.name)) continue;
    const who = d.type + ':' + d.from;
    const when = d.typeofOnly ? 'test' : (d.load ? 'load' : 'handler');
    const e = names.get(d.name);
    if (!e.readBy.some((r) => r.script === who)) e.readBy.push({ script: who, when });
  }
  for (const name of [...names.keys()].sort()) {
    const e = names.get(name);
    e.setBy.sort((a, b) => (a.script < b.script ? -1 : 1));
    e.readBy.sort((a, b) => (a.script < b.script ? -1 : 1));
    doc.globals[name] = e;
  }
})();
// libraries: who announces, and every script that reads one of its globals
for (const type of TYPE_ORDER) {
  const t = model.trees.root[type];
  for (const rel of t.order) {
    const s = t.scripts.get(rel);
    for (const a of s.code.announces) {
      const users = [...new Set(deps.filter((d) => d.on.type === type && d.on.rel === rel && !d.typeofOnly).map((d) => d.type + ':' + d.from))].sort();
      const atLoad = [...new Set(deps.filter((d) => d.on.type === type && d.on.rel === rel && d.load && !d.typeofOnly).map((d) => d.type + ':' + d.from))].sort();
      doc.libraries[a.name] = { script: type + ':' + rel, priority: s.priority, sets: [...s.code.provides].filter(([n, p]) => p.load && !isOwnSlot(n)).map(([n]) => n).sort(), users, usersAtLoad: atLoad.length };
    }
  }
}
// an empty text, an empty list and a `false` say nothing: left out, so that the file stays readable in a diff
const jsonText = JSON.stringify(doc, (key, value) => ((value === '' || value === false || value === null || (Array.isArray(value) && value.length === 0)) ? undefined : value), 1) + '\n';

// ---- CATALOGUE.md ----------------------------------------------------------------------------
const md = [];
const code = (x) => '`' + x + '`';
const cell = (x) => String(x).replace(/\|/g, '\\|');
md.push('# Script catalogue');
md.push('');
md.push('<!-- GENERATED by .minecraft/dev/catalogue/gen_catalogue.js from the scripts and dev/loud/liveness_manifest.json.');
md.push('     Do not edit: change the script and regenerate. The pre-push hook and CI refuse a stale file. -->');
md.push('');
md.push('What every KubeJS script of the pack registers, sets and reads, and where it sits in the load order: read from');
md.push('the code of `.minecraft/kubejs`, not from headers. How to write a script: `.minecraft/kubejs/README.md`.');
md.push('How this file is made and checked: `.minecraft/dev/catalogue/README.md`.');
md.push('');
md.push('| Script type | Scripts | Registrations | Sections | Features |');
md.push('|---|---|---|---|---|');
for (const type of TYPE_ORDER) {
  const t = doc.types[type];
  md.push('| ' + type + ' | ' + t.count + ' | ' + t.scripts.reduce((n, s) => n + s.registers.filter((r) => r.kind !== 'direct').length, 0) + ' | ' +
    t.scripts.reduce((n, s) => n + s.sections, 0) + ' | ' + t.scripts.reduce((n, s) => n + s.features.length, 0) + ' |');
}
md.push('');
(function notEverywhere() {
  const rows = [];
  for (const type of TYPE_ORDER) for (const s of doc.types[type].scripts) if (s.notIn.length) rows.push(code(type + ':' + s.path) + ' (not in ' + s.notIn.join(', ') + ')');
  if (rows.length) {
    md.push('The counts are those of the canonical tree. Not in every distribution: ' + rows.join(', ') + '. The registrations the');
    md.push('dedicated server makes are the liveness manifest\'s (`[icraft.live] ARMED server: ' + manifest.armed.server.count + '`, `startup: ' + manifest.armed.startup.count + '`).');
    md.push('');
  }
})();
md.push('## How to read it');
md.push('');
md.push('- **Load order.** The engine walks a script folder in the order the file system lists it and then sorts by the');
md.push('  `// priority` line only (highest first, equal priorities stay in listing order). NTFS lists names upper-cased,');
md.push('  so letters sort before `_`: `zzz_x.js` loads before `zz_x.js`, `lootjs_overhaul.js` before `loot_overhaul.js`,');
md.push('  the folder `affixes/` before `affix_x.js`. The places below are computed with that rule');
md.push('  (`load_order.js --order server`), and `load_order.js --compare-log <kubejs/server.log>` holds them to a real boot.');
md.push('- **Handler order.** The handlers of one event run in the order they were registered: load order, then source');
md.push('  order inside a script. A handler registered for a target (`ItemEvents.rightClicked(\'minecraft:stick\', ..)`)');
md.push('  runs BEFORE the untargeted handlers when that target fires. Both were asked of the engine on a real server.');
md.push('- **when** a script reads a global: `load` = while the script loads (the script that sets it must load first: an');
md.push('  order constraint), `handler` = later, inside a handler or a tick (no order needed), `test` = only `typeof`.');
md.push('- A registration is named as its liveness id names it: `<name>@<group>` is what `[icraft.live] FIRED` prints.');
md.push('');

md.push('## Order constraints');
md.push('');
const byHand = order.constraints.filter((c) => c.held === 'listing' && c.trees.includes('root'));
const structural = order.constraints.filter((c) => c.held === 'priority' && c.trees.includes('root'));
md.push('Every order between two scripts that the code proves or a header declares: ' + (byHand.length + structural.length) + '. ' + structural.length +
  ' are structural (the script that must load first has the higher priority: the guard and the libraries); ' + byHand.length +
  ' hold only because of the file names and are declared with `// @after` in the script that needs them. `load_order.js` fails when one is broken.');
md.push('');
md.push('| Script | must load after | Because | Held by |');
md.push('|---|---|---|---|');
for (const c of byHand) {
  const because = c.basis === 'load' ? 'it reads ' + c.names.map(code).join(', ') + ' while it loads (proven by the code)' :
    c.basis === 'same-event' ? c.names.join(', ') + ' (proven by the code)' : 'handler order on ' + c.names.map(code).join(', ') + ': ' + c.why + ' (declared by hand)';
  md.push('| ' + code(c.script) + ' | ' + code(c.after) + ' | ' + cell(because) + ' | file names, `@after` |');
}
md.push('');
// a handler that must be the last one of its event: no script can be named, so it is not a row of the table above
const lastRoot = order.lasts.filter((l) => l.trees.includes('root'));
if (lastRoot.length) {
  md.push('Declared the LAST handler of an event (`// @last <event>`; `load_order.js` fails when a script that loads later registers on it):');
  md.push('');
  md.push('| Script | Event | Registrations of other scripts before it | Held by |');
  md.push('|---|---|---|---|');
  for (const l of lastRoot) md.push('| ' + code(l.type + ':' + l.script) + ' | ' + code(l.group) + ' | ' + l.handlersBefore + ' | file names, `@last` |');
  md.push('');
}
md.push('Structural, by the script that loads first:');
md.push('');
md.push('| Loads first | Priority | Scripts that need it while they load | They read |');
md.push('|---|---|---|---|');
(function structuralTable() {
  const groups = new Map();
  for (const c of structural) {
    const k = c.type + ':' + c.after;
    if (!groups.has(k)) groups.set(k, { users: new Set(), names: new Set(), type: c.type, after: c.after });
    groups.get(k).users.add(c.script);
    c.names.forEach((n) => groups.get(k).names.add(n));
  }
  for (const k of [...groups.keys()].sort((a, b) => {
    const pa = model.trees.root[groups.get(a).type].scripts.get(groups.get(a).after), pb = model.trees.root[groups.get(b).type].scripts.get(groups.get(b).after);
    return (TYPE_ORDER.indexOf(groups.get(a).type) - TYPE_ORDER.indexOf(groups.get(b).type)) || (pa.index - pb.index);
  })) {
    const g = groups.get(k);
    md.push('| ' + code(g.type + ':' + g.after) + ' | ' + model.trees.root[g.type].scripts.get(g.after).priority + ' | ' + g.users.size + ' | ' + [...g.names].sort().map(code).join(', ') + ' |');
  }
})();
md.push('');
if (order.accepted.length) {
  md.push('Known findings, accepted with a reason (`accepted.json`):');
  md.push('');
  for (const a of order.accepted) md.push('- ' + code((a.type ? a.type + ':' : '') + a.script) + ': ' + a.text + ' **Accepted:** ' + a.reason);
  md.push('');
}

md.push('## Libraries');
md.push('');
md.push('A library announces itself as its last statement (`icraft.lib.announce`); the game names one that did not load.');
md.push('');
md.push('| Library | Script | Priority | Sets | Scripts that read it | of them while loading |');
md.push('|---|---|---|---|---|---|');
for (const name of Object.keys(doc.libraries).sort()) {
  const l = doc.libraries[name];
  md.push('| ' + code(name) + ' | ' + code(l.script) + ' | ' + l.priority + ' | ' + l.sets.map((n) => code(shown(n))).join(', ') + ' | ' + l.users.length + ' | ' + l.usersAtLoad + ' |');
}
md.push('');

for (const type of TYPE_ORDER) {
  const t = doc.types[type];
  md.push('## ' + type + ' scripts: load order');
  md.push('');
  md.push('| Place | Priority | Script | Registers on |');
  md.push('|---|---|---|---|');
  for (const s of t.scripts) {
    const groups = [...new Set(s.registers.map((r) => r.group))].sort();
    md.push('| ' + s.place + ' | ' + (s.priority === 0 ? '' : s.priority) + ' | ' + code(s.path) + (s.library ? ' (library ' + code(s.library) + ')' : '') + ' | ' + groups.map(code).join(', ') + ' |');
  }
  md.push('');
}

const hurtFlags = (r) => [r.place, r.secondary ? 'secondary' : '', r.cancelled ? 'cancelled' : '', r.unchecked ? 'unchecked' : ''].filter((x) => x);
const hurtNote = (r) => (hurtFlags(r).length ? ' [' + hurtFlags(r).join(', ') + ']' : '');
for (const type of TYPE_ORDER) {
  const t = doc.types[type];
  const groups = Object.keys(t.events);
  if (groups.length === 0) continue;
  md.push('## ' + type + ' scripts: every event, its handlers in the order they run');
  md.push('');
  const kinds = [['guard', 'Events (handlers through `icraft.guard`)'], ['handler', 'Java registries (functions through `icraft.handler`)'],
    ['tick', 'Tick functions (through the tick master, `0_tick_master.js`; each runs when `tick % every === offset`, in this order within a tick)'],
    ['hurt', 'Hurt handlers (through the dispatcher of `0_lib_core.js`; listed in the order they RUN: the ones placed `first` in the order of the list `PLACED` of the library, the unplaced ones in the order they are registered, then, after every other entry of the Java registry (the handlers of the startup scripts), the ones placed `last`. `secondary` = also on a hit dealt through `core.dealDamage`; `cancelled` = also after an earlier handler cancelled the hit; `unchecked` = the amount it leaves is not checked)'],
    ['direct', 'Straight on a Java registry, with no liveness id (the key is what the registry calls it)']];
  for (const [kind, title] of kinds) {
    const mine = groups.filter((g) => t.events[g].some((r) => r.kind === kind));
    if (mine.length === 0) continue;
    md.push('### ' + title);
    md.push('');
    for (const g of mine) {
      const list = t.events[g].filter((r) => r.kind === kind);
      md.push('**' + code(g) + '** (' + list.length + ')');
      md.push('');
      const targeted = list.filter((r) => r.target !== '');
      list.forEach((r, i) => {
        md.push((i + 1) + '. ' + code(r.script) + (r.name && r.name !== r.script.replace(/\.js$/, '') ? ' as ' + code(r.name) : '') +
          (r.target ? ', for ' + code(r.target) : '') + (r.late ? ' (registered inside another handler)' : '') + (kind === 'hurt' ? hurtNote(r) : ''));
      });
      if (targeted.length && targeted.length < list.length) md.push('', 'When one of the targets fires, its handlers (' + targeted.length + ' of the list) run before the untargeted ones.');
      md.push('');
    }
  }
}

md.push('## Globals: who sets, who reads');
md.push('');
md.push('`global` is ONE map for startup, server and client scripts. Listed: every name a script sets while it loads, and');
md.push('every name one script sets and another reads. Not listed: a script\'s own `global.tick_*` function slots and its');
md.push('own one-shot `global._*` flags.');
md.push('');
md.push('| Name | Set by | Read by |');
md.push('|---|---|---|');
for (const name of Object.keys(doc.globals)) {
  const g = doc.globals[name];
  const readers = g.readBy.length === 0 ? '_nobody_' : (g.readBy.length > 8 ? g.readBy.length + ' scripts (' + g.readBy.filter((r) => r.when === 'load').length + ' while loading): ' +
    g.readBy.slice(0, 6).map((r) => code(r.script)).join(', ') + ', ...' : g.readBy.map((r) => code(r.script) + (r.when === 'load' ? ' (load)' : r.when === 'test' ? ' (test)' : '')).join(', '));
  md.push('| ' + code(shown(name)) + ' | ' + g.setBy.map((p) => code(p.script) + (p.when === 'handler' ? ' (in a handler)' : '')).join(', ') + ' | ' + readers + ' |');
}
md.push('');

for (const type of TYPE_ORDER) {
  const t = doc.types[type];
  md.push('## ' + type + ' scripts: one entry each');
  md.push('');
  for (const s of t.scripts) {
    md.push('### ' + code(s.path));
    md.push('');
    const bits = ['place ' + s.place + ' of ' + t.count + (s.priority !== 0 ? ', priority ' + s.priority : '')];
    if (s.library) bits.push('library ' + code(s.library));
    if (s.header.length) bits.push('header: ' + s.header.map((h) => '@' + h).join(' '));
    if (s.notIn.length) bits.push('not in ' + s.notIn.join(', '));
    md.push('- ' + bits.join('; '));
    const by = (kind) => s.registers.filter((r) => r.kind === kind);
    if (by('guard').length) md.push('- events: ' + by('guard').map((r) => code(r.group) + (r.target ? ' for ' + code(r.target) : '') + (r.name !== s.path.replace(/\.js$/, '') ? ' as ' + code(r.name) : '')).join(', '));
    if (by('handler').length) md.push('- registry handlers: ' + by('handler').map((r) => code(r.group)).join(', '));
    if (by('tick').length) md.push('- tick functions: ' + by('tick').map((r) => code(r.name) + ' (' + r.group.replace('tick.', '') + ', every ' + (r.every === null ? '?' : r.every) + ', offset ' + (r.offset === null ? '?' : r.offset) + ')').join(', '));
    if (by('hurt').length) md.push('- hurt handlers: ' + by('hurt').map((r) => code(r.name) + (r.group === 'hurt.late' ? ' (late)' : '') + ' [' + [r.who].concat(hurtFlags(r)).join(', ') + ']').join(', '));
    if (by('direct').length) md.push('- straight on a Java registry: ' + by('direct').map((r) => code(r.group) + (r.name ? ' ' + code(r.name) : '')).join(', '));
    if (s.sections) md.push('- sections: ' + s.sections);
    if (s.features.length) md.push('- features: ' + s.features.map(code).join(', '));
    if (s.registries.length) md.push('- registries: ' + s.registries.join(', '));
    if (s.files.length) md.push('- data files: ' + s.files.map(code).join(', '));
    if (s.sets.length) md.push('- sets: ' + s.sets.map((n) => code(shown(n))).join(', '));
    if (s.setsLater.length) md.push('- sets inside a handler: ' + s.setsLater.map((n) => code(shown(n))).join(', '));
    if (s.reads.length) {
      md.push('- reads: ' + s.reads.map((r) => code(r.kind === 'scope' ? r.name : shown(r.name)) + ' of ' + code(r.from) + (r.when === 'load' ? ' (load)' : r.when === 'test' ? ' (test)' : '')).join(', '));
    }
    const hand = s.after.filter((a) => a.held === 'listing');
    if (hand.length) md.push('- must load after: ' + hand.map((a) => code(a.script) + (a.basis === 'declared' ? ' (declared: ' + a.why + ')' : ' (proven by the code)')).join('; '));
    if (s.last.length) md.push('- declared the last handler of: ' + s.last.map(code).join(', '));
    md.push('');
  }
}
const mdText = md.join('\n') + '\n';

// ---- write or check ----------------------------------------------------------------------------
if (problems.length) {
  for (const p of problems) console.error('[catalogue] ' + p);
  console.error('[catalogue] ' + problems.length + ' problem(s): nothing was written');
  process.exit(1);
}
const targets = [[OUT_JSON, jsonText], [OUT_MD, mdText]];
const same = (file, text) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text;
const stale = targets.filter(([f, t]) => !same(f, t)).map(([f]) => path.relative(PACK, f).split(path.sep).join('/'));
const summary = TYPE_ORDER.map((t) => t + ' ' + doc.types[t].count).join(', ') + ' scripts; ' + order.constraints.filter((c) => c.trees.includes('root')).length + ' order constraints; ' +
  Object.keys(doc.globals).length + ' globals; ' + Object.keys(doc.libraries).length + ' libraries';
if (CHECK) {
  if (stale.length) {
    console.error('[catalogue] STALE: ' + stale.join(', '));
    console.error('[catalogue] a script registers, sets, reads or loads differently from what the committed catalogue says.');
    console.error('[catalogue] Regenerate and commit:  node --expose-internals .minecraft/dev/catalogue/gen_catalogue.js');
    process.exit(1);
  }
  if (!QUIET) console.log('[catalogue] up to date: ' + summary);
  process.exit(0);
}
for (const [f, t] of targets) if (!same(f, t)) fs.writeFileSync(f, t);
console.log('[catalogue] ' + (stale.length ? 'wrote ' + stale.join(', ') : 'nothing to write') + ': ' + summary);
