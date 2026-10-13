#!/usr/bin/env node
// =============================================================================
// load_order.js -- the load order KubeJS really uses, and every constraint on it
// =============================================================================
// Until 2026-10-13 the order of the pack's scripts was asserted nowhere: 13 file
// name prefixes, twenty comments that said "loads before", and a sort rule that
// was misread for months (`zzz_x.js` loads BEFORE `zz_x.js`). This tool computes
// the order the engine uses (script_model.js: the walk of the folder as NTFS lists
// it, then a stable sort by `// priority`, both asked of KubeJS's own classes on a
// real server) and holds the scripts to it, in all three trees:
//
//   PROVEN BY THE CODE (no header needed to find it)
//     * a script reads `global.X` WHILE IT LOADS and another script sets it while
//       it loads: the setter must load first;
//     * a script reads `global.X` inside a handler of an event and another script
//       sets it inside a handler of the SAME event: the setter's handler must run
//       first, so the setter must load first (handlers run in load order).
//     Such an order is either STRUCTURAL (the setter has a higher `// priority`:
//     a library) or it holds only because of the file names. Then the reader must
//     DECLARE it:   // @after <the setter's path>
//     so that a rename or a new file that breaks it fails here, with both names.
//   DECLARED BY HAND (what no tool can read: one handler relying on what another
//     did to the same entity or the same loot list)
//     * `// @after <path>  <why>`: the two scripts must share an event, and the
//       line must say why.
//     * `// @last <event>`: this script's handler must be the LAST one of that
//       event (a strip that has to run after every add). "After every script
//       that registers this event" names no script, so `@after` cannot say it.
//       The check fails when a script that loads LATER registers on the event,
//       and names it. It moves nothing: the order is still the file names'.
//   AND
//     * a header field that is there is what the code does (@file, @events,
//       @registry, @live, @last); a script that is not on headers_grandfathered.json (a
//       NEW script) has `@file` and `@events`;
//     * a library that is asked for (icraft.lib.need) is announced by a script that
//       loads first; a name is announced once;
//     * nothing reads a global that no script sets;
//     * no file is switched off, mis-prioritised or unreadable for the engine
//       (a comment line it takes for a file property, a byte order mark, a name the
//       NTFS order of which is not certain).
//
//   node --expose-internals .minecraft/dev/catalogue/load_order.js              check (exit 1 on a failure)
//   ... --order server [--tree root|server|client]     the order, one script per line
//   ... --constraints                                   every constraint and what holds it
//   ... --claims                                        comment lines that talk about order, for a reader
//   ... --compare-log <kubejs/server.log> [--tree server]   a real log's `Loaded script` lines against the computed order
//   ... --pack <another .minecraft>   --quiet   --json
//
// A constraint that is violated and known is not hidden: it is an entry of
// accepted.json with its reason, printed on every run. An entry that matches
// nothing fails (the list cannot rot).
// Exit 0 ok, 1 a failure, 2 could not run.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
let M;
try { M = require('./script_model.js'); M.readCode('var a'); }
catch (e) {
  console.error('[load-order] CANNOT RUN: ' + e.message + '. Run with: node --expose-internals ' + __filename);
  process.exit(2);
}

const HERE = __dirname;
const TREE_LABEL = { root: 'kubejs', server: 'server_distribution/kubejs', client: 'distribution/client/kubejs' };
const OWN = new Set(['icraft.guard', 'icraft.section', 'icraft.handler', 'icraft.live', 'icraft.lib']);

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// every liveness group a script registers on: its events, its registry methods, tick.server / tick.player, hurt / hurt.late
function groupsOf(script) {
  const g = new Set();
  for (const k of ['guards', 'handlers', 'ticks', 'hurts']) for (const r of script.code[k]) g.add(r.group);
  return g;
}

// how many registrations a script makes on one group
function groupCount(script, group) {
  let n = 0;
  for (const k of ['guards', 'handlers', 'ticks', 'hurts']) for (const r of script.code[k]) if (r.group === group) n++;
  return n;
}

// -> { errors: [{ code, type, script, on, text, trees }], accepted: [...], constraints: [...], lasts: [...] }
function check(model, opts) {
  const accepted = (opts && opts.accepted) || [];
  const grandfathered = (opts && opts.grandfathered) || null;
  const raw = [];            // { code, type, script, on, text, tree }
  const constraintMap = new Map();
  const lastMap = new Map();  // a declared `@last`: type|script|group -> { type, script, group, place, handlersBefore, own, trees }
  const err = (tree, code, type, script, on, text) => raw.push({ tree, code, type, script, on: on || '', text });
  const trees = Object.keys(M.TREES);
  const existsIn = (type, rel) => trees.filter((t) => model.trees[t][type].scripts.has(rel));

  for (const p of model.problems) raw.push({ tree: '', code: 'engine', type: '', script: p.split(':')[0], on: '', text: p });

  for (const tree of trees) {
    const deps = M.dependencies(model, tree);
    const prov = M.providers(model, tree);
    for (const type of M.TYPES) {
      const t = model.trees[tree][type];
      const idx = (rel) => t.scripts.get(rel).index;
      const announced = new Map();     // library name -> rel
      for (const rel of t.order) {
        const s = t.scripts.get(rel);
        for (const a of s.code.announces) {
          if (announced.has(a.name) && announced.get(a.name) !== rel) err(tree, 'library', type, rel, announced.get(a.name), 'announces the library `' + a.name + '`, which ' + announced.get(a.name) + ' announces too: one name, one script');
          else announced.set(a.name, rel);
          if (!a.load) err(tree, 'library', type, rel, '', 'icraft.lib.announce(\'' + a.name + '\') is inside a function that runs later: a library announces itself as the last statement of its file');
        }
      }
      for (const rel of t.order) {
        const s = t.scripts.get(rel);
        const me = type + ':' + rel;
        // ---- what the engine makes of the file ----
        if (s.bad) err(tree, 'engine', type, rel, '', s.bad);
        if (s.bom) err(tree, 'engine', type, rel, '', 'starts with a byte order mark: the engine does not take its first line for a comment (a `// priority` there is lost). Save it as UTF-8 without one');
        if (s.code.parse) err(tree, 'engine', type, rel, '', 'does not parse: ' + s.code.parse);
        if (s.engine.error) err(tree, 'engine', type, rel, '', 'does not load: a comment line sets the file property priority to something that is not a whole number (' + s.engine.error + ')');
        if (s.engine.skip) err(tree, 'engine', type, rel, '', 'a comment line is a file property that switches the file off: ' + s.engine.skip);
        for (const p of s.header.problems) err(tree, 'header', type, rel, '', p);

        // ---- the order the code proves ----
        const mine = deps.filter((d) => d.type === type && d.from === rel && !d.typeofOnly);
        const byName = new Map();
        for (const d of mine) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }
        const edges = new Map();     // provider rel (same type) -> { names: Set, basis: Set }
        for (const [name, list] of byName) {
          const shown = name.indexOf('icraft.') === 0 || list[0].kind === 'scope' ? name : 'global.' + name;
          if (list.some((d) => d.load)) {
            const atLoad = list.filter((d) => d.on.load);
            if (atLoad.length === 0) {
              err(tree, 'order', type, rel, list[0].on.type + ':' + list[0].on.rel, 'reads ' + shown + ' while it loads, and ' + list.map((d) => d.on.rel).join(', ') + ' sets it only inside a handler: it is not there yet');
            }
            for (const d of atLoad) {
              if (d.on.type !== type) {
                if (M.TYPE_RANK[d.on.type] > M.TYPE_RANK[type]) err(tree, 'order', type, rel, d.on.type + ':' + d.on.rel, 'reads ' + shown + ' while it loads, and a ' + d.on.type + ' script sets it (' + d.on.rel + '): ' + d.on.type + ' scripts load after ' + type + ' scripts');
                continue;
              }
              if (!edges.has(d.on.rel)) edges.set(d.on.rel, { names: new Set(), basis: new Set() });
              edges.get(d.on.rel).names.add(shown);
              edges.get(d.on.rel).basis.add('load');
            }
          }
          for (const d of list) {
            if (d.sameEvent.length === 0) continue;
            if (!edges.has(d.on.rel)) edges.set(d.on.rel, { names: new Set(), basis: new Set() });
            edges.get(d.on.rel).names.add(shown + ' (set and read in handlers of ' + d.sameEvent.join(', ') + ')');
            edges.get(d.on.rel).basis.add('same-event');
          }
        }
        const declared = new Map(s.header.fields.after.map((a) => [a.path, a]));
        for (const [target, e] of edges) {
          const ts = t.scripts.get(target);
          const names = [...e.names].sort();
          const held = ts.priority > s.priority ? 'priority' : 'listing';
          const how = e.basis.has('load') ? 'reads ' + names.join(', ') + ' while it loads' : 'reads ' + names.join(', ');
          if (ts.index > s.index) err(tree, 'order', type, rel, type + ':' + target, how + ', and ' + target + ' loads AFTER it (place ' + ts.index + ', this script ' + s.index + ')');
          else if (held === 'listing' && !declared.has(target)) {
            err(tree, 'undeclared', type, rel, type + ':' + target, how + ', and only the file names keep ' + target + ' in front of it. Declare it in the header:  // @after ' + target +
              (ts.code.announces.length ? '   (or give the library a `// priority` above this script\'s)' : ''));
          }
          const key = type + '|' + rel + '|' + target;
          if (!constraintMap.has(key)) constraintMap.set(key, { type, script: rel, after: target, basis: e.basis.has('load') ? 'load' : 'same-event', names, held, declared: declared.has(target), why: declared.has(target) ? declared.get(target).why : '', trees: [] });
          constraintMap.get(key).trees.push(tree);
        }

        // ---- the order somebody declared ----
        const myGroups = groupsOf(s);
        for (const a of s.header.fields.after) {
          if (a.path === rel) { err(tree, 'after', type, rel, '', '`@after ' + a.path + '` names the script itself'); continue; }
          if (!t.scripts.has(a.path)) { err(tree, 'after', type, rel, type + ':' + a.path, '`@after ' + a.path + '`: there is no such ' + type + ' script'); continue; }
          const ts = t.scripts.get(a.path);
          if (ts.index > s.index) err(tree, 'order', type, rel, type + ':' + a.path, 'declares `@after ' + a.path + '` and loads BEFORE it (place ' + s.index + ', ' + a.path + ' ' + ts.index + ')');
          if (edges.has(a.path)) continue;       // proven by the code, recorded above
          const shared = [...groupsOf(ts)].filter((g) => myGroups.has(g)).sort();
          if (shared.length === 0) {
            err(tree, 'after', type, rel, type + ':' + a.path, '`@after ' + a.path + '`: nothing in the code connects the two (no global of ' + a.path + ' is read here while loading, and the two share no event). Declare only an order that can be shown');
            continue;
          }
          if (a.why === '') err(tree, 'after', type, rel, type + ':' + a.path, '`@after ' + a.path + '` is an order no tool can read from the code (the two share ' + shared.join(', ') + '): say why on the same line');
          const key = type + '|' + rel + '|' + a.path;
          if (!constraintMap.has(key)) constraintMap.set(key, { type, script: rel, after: a.path, basis: 'declared', names: shared, held: ts.priority > s.priority ? 'priority' : 'listing', declared: true, why: a.why, trees: [] });
          constraintMap.get(key).trees.push(tree);
        }

        // ---- the last handler of an event, declared ----
        // Handlers of one event run in registration order, which is load order. `@last` holds when no script
        // that loads after this one registers on the event (a handler registered for a target is outside
        // this rule: it runs before the untargeted ones whatever the order).
        for (const g of [...new Set(s.header.fields.last)]) {
          if (!myGroups.has(g)) {
            err(tree, 'last', type, rel, '', '`@last ' + g + '`: this script registers nothing on ' + g + ' (it registers on ' + ([...myGroups].sort().join(', ') || 'nothing') + ')');
            continue;
          }
          let before = 0;
          for (const r of t.order) {
            if (r === rel) continue;
            const o = t.scripts.get(r);
            if (!groupsOf(o).has(g)) continue;
            if (o.index < s.index) { before += groupCount(o, g); continue; }
            err(tree, 'last', type, rel, type + ':' + r, 'declares `@last ' + g + '`, and ' + r + ' registers on ' + g + ' AFTER it (place ' + o.index + ', this script ' + s.index +
              '): the handler that must be the last one of that event no longer is. Give the new script a name that lists before ' + rel +
              ', or take the `@last` line off if that order has stopped mattering');
          }
          const key = type + '|' + rel + '|' + g;
          if (!lastMap.has(key)) lastMap.set(key, { type, script: rel, group: g, place: s.index, handlersBefore: before, own: groupCount(s, g), trees: [] });
          lastMap.get(key).trees.push(tree);
        }

        // ---- libraries asked for ----
        for (const n of s.code.needs) {
          if (!announced.has(n.name)) err(tree, 'library', type, rel, '', 'icraft.lib.need(\'' + n.name + '\'): no ' + type + ' script announces a library of that name (announced: ' + ([...announced.keys()].sort().join(', ') || 'none') + ')');
          else if (n.load && idx(announced.get(n.name)) > s.index) err(tree, 'library', type, rel, type + ':' + announced.get(n.name), 'icraft.lib.need(\'' + n.name + '\') while it loads, and ' + announced.get(n.name) + ' loads after it');
        }

        // ---- a global nobody sets ----
        for (const [name, u] of s.code.uses) {
          if (u.typeofOnly || OWN.has(name) || s.code.provides.has(name)) continue;
          if (prov.globals.has(name)) continue;
          if (name.indexOf('icraft.') === 0 && (prov.scope[type].get('icraft') || []).length && OWN.has(name)) continue;
          err(tree, 'unset', type, rel, name, 'reads ' + (name.indexOf('icraft.') === 0 ? name : 'global.' + name) + ', which no script of the pack sets');
        }

        // ---- the header against the code ----
        const f = s.header.fields, has = s.header.has;
        const isNew = grandfathered !== null && !(grandfathered[type] || []).includes(rel);
        const wantFile = 'kubejs/' + type + '_scripts/' + rel;
        if (has.has('file') && (f.file.length !== 1 || f.file[0] !== wantFile)) err(tree, 'header', type, rel, '', '`@file ' + f.file.join(' ') + '`: the file is ' + wantFile);
        const groups = [...myGroups].sort();
        if (has.has('events')) {
          const said = f.events.filter((x) => x !== 'none').sort();
          if (said.join(' ') !== groups.join(' ')) err(tree, 'header', type, rel, '', '`@events ' + f.events.join(', ') + '`: the code registers on ' + (groups.join(', ') || 'nothing (write `@events none`)'));
        }
        const regs = [...s.code.registries].sort();
        if (has.has('registry')) {
          const said = [...new Set(f.registry)].sort();
          const unknown = said.filter((x) => !M.REGISTRY_NAMES[x]);
          const okIndirect = s.code.indirectBoss && said.join(' ') === regs.concat(regs.includes('bosses') ? [] : ['bosses']).sort().join(' ');
          if (unknown.length) err(tree, 'header', type, rel, '', '`@registry ' + unknown.join(', ') + '`: the registries are ' + Object.keys(M.REGISTRY_NAMES).join(', '));
          else if (said.join(' ') !== regs.join(' ') && !okIndirect) err(tree, 'header', type, rel, '', '`@registry ' + f.registry.join(', ') + '`: the code reads ' + (regs.join(', ') || 'no registry'));
        }
        const feats = [...new Set(s.code.features.map((x) => x.name))].sort();
        if (has.has('live') && [...new Set(f.live)].sort().join(' ') !== feats.join(' ')) err(tree, 'header', type, rel, '', '`@live ' + f.live.join(', ') + '`: the code reports ' + (feats.join(', ') || 'no feature'));
        if (isNew) {
          const lacks = [];
          if (!has.has('file')) lacks.push('@file ' + wantFile);
          if (!has.has('events')) lacks.push('@events ' + (groups.join(', ') || 'none'));
          if (regs.length && !has.has('registry')) lacks.push('@registry ' + regs.join(', '));
          if (feats.length && !has.has('live')) lacks.push('@live ' + feats.join(', '));
          if (lacks.length) err(tree, 'header', type, rel, '', 'a new script has its header fields (dev/catalogue/script_template.js); this one lacks:  // ' + lacks.join('   // '));
        }
      }
    }
  }

  // ---- the grandfather list only shrinks ----
  if (grandfathered !== null) {
    for (const type of M.TYPES) {
      for (const rel of (grandfathered[type] || [])) {
        const where = existsIn(type, rel);
        if (where.length === 0) { raw.push({ tree: '', code: 'grandfathered', type, script: rel, on: '', text: 'is on headers_grandfathered.json and is no longer a script: take it off the list' }); continue; }
        const s = model.trees[where[0]][type].scripts.get(rel);
        if (s.header.has.has('file') && s.header.has.has('events')) raw.push({ tree: '', code: 'grandfathered', type, script: rel, on: '', text: 'has its header fields now: take it off headers_grandfathered.json (the list only shrinks)' });
      }
    }
  }

  // one line per fact, with the trees it is true in
  const merged = new Map();
  for (const e of raw) {
    const key = [e.code, e.type, e.script, e.on, e.text].join('|');
    if (!merged.has(key)) merged.set(key, { code: e.code, type: e.type, script: e.script, on: e.on, text: e.text, trees: [] });
    if (e.tree) merged.get(key).trees.push(e.tree);
  }
  const errors = [], acceptedHits = [];
  const used = new Set();
  for (const e of merged.values()) {
    const id = (e.type ? e.type + ':' : '') + e.script;
    const hit = accepted.findIndex((a) => a.code === e.code && a.script === id && (a.on || '') === e.on);
    if (hit >= 0) { used.add(hit); acceptedHits.push(Object.assign({ reason: accepted[hit].reason }, e)); }
    else errors.push(e);
  }
  accepted.forEach((a, i) => {
    if (!used.has(i)) errors.push({ code: 'accepted', type: '', script: 'accepted.json', on: '', trees: [], text: 'the entry { ' + a.code + ', ' + a.script + (a.on ? ', ' + a.on : '') + ' } matches nothing any more: delete it' });
  });
  const constraints = [...constraintMap.values()].sort((a, b) => (a.type + a.script + a.after < b.type + b.script + b.after ? -1 : 1));
  const lasts = [...lastMap.values()].sort((a, b) => (a.type + a.script + a.group < b.type + b.script + b.group ? -1 : 1));
  return { errors, accepted: acceptedHits, constraints, lasts };
}

function treeNote(e) {
  if (e.trees.length === 0 || e.trees.length === Object.keys(M.TREES).length) return '';
  return ' [only in ' + e.trees.map((t) => TREE_LABEL[t]).join(', ') + ']';
}

// comment lines that talk about load or handler order: what a reader checks against the declared constraints
const CLAIM = /load[- ]?order|loads? (before|after|first|last|early|late)|loaded (before|after|first|last)|must (load|run|come|register|be registered|execute) (before|after|first|last)|LOAD-BEARING|(runs?|registered|registers|fires?|executes?) (before|after|first|last) |alphabetical|sorts? (before|after)|registration order|handler order|file ?name order|prefix (is|keeps|makes|ensures)/i;
function claims(model, tree) {
  const out = [];
  for (const type of M.TYPES) {
    for (const rel of model.trees[tree][type].order) {
      const s = model.trees[tree][type].scripts.get(rel);
      M.splitLines(s.text).forEach((line, i) => {
        const at = line.indexOf('//');
        if (at >= 0 && CLAIM.test(line.substring(at))) out.push({ type, rel, line: i + 1, text: line.substring(at).trim(), after: s.header.fields.after.map((a) => a.path) });
      });
    }
  }
  return out;
}

// the `Loaded script <type>_scripts:<rel>` lines of a real log, first load only -> { type: [rel] }
function loadedOrder(text) {
  const out = {};
  const rx = /Loaded script (\w+)_scripts:(\S+) in /;
  for (const line of text.split(/\r?\n/)) {
    const m = rx.exec(line);
    if (!m) continue;
    if (!out[m[1]]) out[m[1]] = { order: [], seen: new Set() };
    if (out[m[1]].seen.has(m[2])) continue;
    out[m[1]].seen.add(m[2]);
    out[m[1]].order.push(m[2]);
  }
  const res = {};
  for (const k of Object.keys(out)) res[k] = out[k].order;
  return res;
}

function loadLists(pack) {
  const dir = path.join(pack, 'dev', 'catalogue');
  const acc = readJson(path.join(dir, 'accepted.json'), { accepted: [] });
  const gf = readJson(path.join(dir, 'headers_grandfathered.json'), null);
  return { accepted: acc.accepted || [], grandfathered: gf };
}

module.exports = { check, claims, loadedOrder, loadLists, groupsOf, TREE_LABEL };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const PACK = path.resolve(opt('--pack') || path.join(HERE, '..', '..'));
  const QUIET = flag('--quiet');
  const tree = opt('--tree') || 'root';
  if (!M.TREES[tree]) { console.error('[load-order] CANNOT RUN: --tree is root, server or client'); process.exit(2); }
  if (!fs.existsSync(path.join(PACK, 'kubejs', 'server_scripts'))) { console.error('[load-order] CANNOT RUN: no kubejs/server_scripts under ' + PACK); process.exit(2); }
  const model = M.readPack(PACK);

  if (flag('--grandfather-start')) {
    const file = path.join(PACK, 'dev', 'catalogue', 'headers_grandfathered.json');
    if (fs.existsSync(file)) { console.error('[load-order] ' + file + ' exists: the list is started once and only shrinks afterwards'); process.exit(2); }
    const doc = { about: [
      'Scripts that existed without header fields when the fields were introduced (2026-10-13, package O). A script that is NOT on this list is new: dev/catalogue/load_order.js requires its `@file` and `@events` fields (and `@registry` / `@live` where the code reads a registry or reports a feature).',
      'The list only shrinks: a script that gets its header leaves it (the tool says so), a script that is removed or renamed leaves it. Never add a name.'
    ] };
    for (const type of M.TYPES) {
      const names = new Set();
      for (const t of Object.keys(M.TREES)) for (const rel of model.trees[t][type].order) {
        const s = model.trees[t][type].scripts.get(rel);
        if (!(s.header.has.has('file') && s.header.has.has('events'))) names.add(rel);
      }
      doc[type] = [...names].sort();
    }
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
    console.log('[load-order] wrote ' + file + ': ' + M.TYPES.map((t) => t + ' ' + doc[t].length).join(', '));
    process.exit(0);
  }

  if (opt('--order')) {
    const type = opt('--order');
    if (!M.TYPES.includes(type)) { console.error('[load-order] CANNOT RUN: --order startup | server | client'); process.exit(2); }
    for (const rel of model.trees[tree][type].order) {
      const s = model.trees[tree][type].scripts.get(rel);
      console.log(String(s.index).padStart(4) + '  ' + String(s.priority).padStart(6) + '  ' + rel);
    }
    process.exit(0);
  }

  if (opt('--header')) {
    // the header fields the code of one script implies: what to paste on top of a new script
    const [type, rel] = String(opt('--header')).split(':');
    const s = M.TYPES.includes(type) ? model.trees[tree][type].scripts.get(rel) : null;
    if (!s) { console.error('[load-order] CANNOT RUN: --header <startup|server|client>:<path below the script folder>'); process.exit(2); }
    const groups = [...groupsOf(s)].sort();
    const regs = [...s.code.registries].sort();
    const feats = [...new Set(s.code.features.map((x) => x.name))].sort();
    console.log('// @file kubejs/' + type + '_scripts/' + rel);
    console.log('// @events ' + (groups.join(', ') || 'none'));
    if (regs.length) console.log('// @registry ' + regs.join(', '));
    if (feats.length) console.log('// @live ' + feats.join(', '));
    for (const a of s.header.fields.after) console.log('// @after ' + a.path + (a.why ? '  ' + a.why : ''));
    // a decision, like @after: printed back when it is there, never invented
    if (s.header.fields.last.length) console.log('// @last ' + [...new Set(s.header.fields.last)].join(', '));
    process.exit(0);
  }

  if (flag('--claims')) {
    for (const c of claims(model, tree)) console.log(c.type + ':' + c.rel + ':' + c.line + (c.after.length ? '  [@after ' + c.after.join(', ') + ']' : '') + '  ' + c.text.substring(0, 200));
    process.exit(0);
  }

  if (opt('--compare-log')) {
    let text;
    try { text = fs.readFileSync(opt('--compare-log'), 'utf8'); }
    catch (e) { console.error('[load-order] CANNOT RUN: ' + e.message); process.exit(2); }
    const seen = loadedOrder(text);
    let bad = 0, compared = 0;
    for (const type of Object.keys(seen)) {
      if (!M.TYPES.includes(type)) continue;
      const want = model.trees[tree][type].order;
      const inTree = new Set(want);
      // a script the log has and the tree does not (a test rig's own helper) is named, not judged
      const extra = seen[type].filter((x) => !inTree.has(x));
      const got = seen[type].filter((x) => inTree.has(x));
      compared++;
      const same = want.length === got.length && want.every((x, i) => x === got[i]);
      if (same) {
        console.log('[load-order] SAME  ' + type + ': the ' + got.length + ' `Loaded script` lines of the log are in the computed order of ' + TREE_LABEL[tree] +
          (extra.length ? ' (' + extra.length + ' more in the log that the tree does not have: ' + extra.join(', ') + ')' : ''));
        continue;
      }
      bad++;
      let at = 0;
      while (at < want.length && at < got.length && want[at] === got[at]) at++;
      console.log('[load-order] DIFFERENT  ' + type + ': the log has ' + got.length + ' scripts, the tree ' + want.length + '; first difference at place ' + (at + 1) + ': the log has ' + (got[at] || '(nothing)') + ', computed ' + (want[at] || '(nothing)'));
    }
    if (compared === 0) { console.error('[load-order] CANNOT RUN: no `Loaded script <type>_scripts:` line in that file'); process.exit(2); }
    process.exit(bad ? 1 : 0);
  }

  let lists;
  try { lists = loadLists(PACK); }
  catch (e) { console.error('[load-order] CANNOT RUN: ' + e.message); process.exit(2); }
  const res = check(model, lists);

  if (flag('--json')) { console.log(JSON.stringify(res, null, 1)); process.exit(res.errors.length ? 1 : 0); }

  if (flag('--constraints')) {
    for (const c of res.constraints) {
      console.log(c.type + ':' + c.script + '  AFTER  ' + c.after + '\n      ' +
        (c.basis === 'load' ? 'proven by the code: reads ' + c.names.join(', ') + ' while it loads' : c.basis === 'same-event' ? 'proven by the code: ' + c.names.join(', ') : 'declared: handler order on ' + c.names.join(', ') + (c.why ? ' -- ' + c.why : '')) +
        '\n      held by ' + (c.held === 'priority' ? 'priority' : 'the listing order of the file names' + (c.declared ? ', declared with @after' : ', NOT declared')));
    }
    for (const l of res.lasts) {
      console.log(l.type + ':' + l.script + '  LAST on  ' + l.group + '\n      declared with @last: ' + l.handlersBefore + ' registration(s) of other scripts come before its ' + l.own +
        '\n      held by the listing order of the file names (place ' + l.place + ')');
    }
  }

  for (const e of res.errors) console.error('[load-order] FAIL ' + (e.type ? e.type + ':' : '') + e.script + ': ' + e.text + treeNote(e));
  if (!QUIET || res.errors.length) {
    for (const a of res.accepted) console.log('[load-order] ACCEPTED ' + (a.type ? a.type + ':' : '') + a.script + ': ' + a.text + '  -- ' + a.reason);
  }
  const t = model.trees[tree];
  const byHeld = (h) => res.constraints.filter((c) => c.held === h).length;
  const summary = M.TYPES.map((type) => type + ' ' + t[type].order.length + ' (' + [...new Set(t[type].order.map((r) => t[type].scripts.get(r).priority))].filter((p) => p !== 0).length + ' priorities)').join(', ');
  const line = 'scripts: ' + summary + '; order constraints: ' + res.constraints.length + ' (' + byHeld('priority') + ' held by priority, ' + byHeld('listing') + ' by the listing order and declared; ' +
    res.constraints.filter((c) => c.basis !== 'declared').length + ' proven by the code, ' + res.constraints.filter((c) => c.basis === 'declared').length + ' declared by hand)' +
    (res.lasts.length ? '; ' + res.lasts.length + ' handler(s) declared the last of their event' : '') +
    (res.accepted.length ? '; ' + res.accepted.length + ' accepted finding(s)' : '');
  if (res.errors.length) {
    console.error('[load-order] ' + res.errors.length + ' failure(s). ' + line);
    process.exit(1);
  }
  if (!QUIET) console.log('[load-order] ok: ' + line);
  process.exit(0);
}
