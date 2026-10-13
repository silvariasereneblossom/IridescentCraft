'use strict';
// =============================================================================
// script_model.js -- what a KubeJS script is to the ENGINE and to the OTHER scripts
// =============================================================================
// One reading of the pack's scripts, shared by
//   load_order.js      the load order the engine really uses, and every constraint on it
//   gen_catalogue.js   the generated catalogue (dev/catalogue/CATALOGUE.md, catalogue.json)
//
// THE ENGINE'S RULES (kubejs-forge 2001.6.5; read in its bytecode, then asked of the
// classes themselves on a real Forge server: engine-tests/real-engine/0_engine_facts.js,
// the `script file:` facts, recorded in engine-tests/truth/engine-facts.txt, and
// script_model.test.js holds this file to those answers)
//   * Which files: KubeJS.loadScripts walks <type>_scripts with Files.walk(root, 10,
//     FOLLOW_LINKS): depth first, every folder in the order the FILE SYSTEM lists it,
//     regular files ending .js (or .ts, not .d.ts), at most 10 levels below the root.
//   * In what order: ScriptManager.loadFromDirectory then calls List.sort(null), and
//     ScriptFile.compareTo is Integer.compare(other.priority, this.priority): highest
//     priority first, and a STABLE sort, so files of one priority stay in the order of
//     the walk. Nothing else is compared. No name is sorted by the engine at all.
//   * The listing order is the file system's. NTFS (the live server, every client)
//     lists a folder by name, upper-cased, code unit by code unit, folders and files
//     interleaved: `affixes\` before `affix_x.js` ('E' < '_'), `zzz_x.js` before
//     `zz_x.js` ('Z' < '_'). ext4 lists by a hash: a Linux boot loads the same files in
//     another order (dev/boot builds its run folder so that it lists like NTFS).
//   * What a comment line can do: ScriptFileInfo.preload reads EVERY line of the file;
//     a line that, trimmed, starts with `//` and whose rest, trimmed, matches
//     ^(\w+)\s*[:=]?\s*(-?\w+)$ is a file property (anywhere in the file; the last one
//     of a key wins). `priority` is parsed with Integer.parseInt (a word there: the
//     file does not load), `ignored` / `ignore` = true switches the file off, and so do
//     `packmode` and `requires` under their conditions.
//   * So a header field of this pack starts with `@`: `// @after scaling/boss_hp.js`
//     can never match that pattern (`@` is not a word character), with or without a
//     colon. Measured: no `@` line sets a property; `// after boss_hp` (no `@`) does.
//
// HEADER FIELDS (read from the leading comment block of a script; all optional for an
// old script, see .minecraft/kubejs/README.md and dev/catalogue/script_template.js)
//   // @file kubejs/server_scripts/<path>.js       where the file is
//   // @events ServerEvents.recipes, LootJS.modifiers   what it registers on
//   // @after <path>.js  <why>                     must load after that script (same script type)
//   // @registry bosses, dimensions                which registries it reads
//   // @live <feature>, <feature>                  the icraft.live.fired names it reports
// A field that is there is CHECKED against what the code does. Nothing is generated
// from a header: the catalogue is read from the code.
//
// Needs node's bundled parser: run the tools with `node --expose-internals`.
// =============================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let acorn = null;
function parser() {
  if (acorn === null) acorn = require('internal/deps/acorn/acorn/dist/acorn');
  return acorn;
}

const TREES = { root: 'kubejs', server: 'server_distribution/kubejs', client: 'distribution/client/kubejs' };
const TYPES = ['startup', 'server', 'client'];
// the order the script types load in: startup scripts when the game starts, client scripts
// after them (a client only), server scripts when a world loads (and again on /reload)
const TYPE_RANK = { startup: 0, client: 1, server: 2 };
const FIELDS = ['file', 'events', 'after', 'registry', 'live'];
// a field name somebody is likely to write instead of a real one
const NEAR = { depends: 'after', dependson: 'after', requires: 'after', before: 'after', afters: 'after', loadafter: 'after',
  event: 'events', registries: 'registry', reads: 'registry', feature: 'live', features: 'live', fires: 'live', path: 'file', name: 'file' };
const REGISTRY_NAMES = { bosses: 'icraft.bosses', dimensions: 'icraft.dims' };
const MAX_DEPTH = 10;

// ---- the engine's reading of one file ------------------------------------------
// String.trim(): everything up to U+0020 at both ends, and nothing else (a BOM stays)
function javaTrim(s) {
  let a = 0, b = s.length;
  while (a < b && s.charCodeAt(a) <= 32) a++;
  while (b > a && s.charCodeAt(b - 1) <= 32) b--;
  return s.substring(a, b);
}
// java.util.regex \s and \w without flags, spelled out (JavaScript's \s is wider)
const PROPERTY = /^([A-Za-z0-9_]+)[ \t\n\x0B\f\r]*[:=]?[ \t\n\x0B\f\r]*(-?[A-Za-z0-9_]+)$/;
const splitLines = (text) => text.split(/\r\n|\n|\r/);

// -> { props: { key: [values, in file order] }, priority, error, skip }
//    error: why the file does not load at all ('' = it does); skip: why the engine skips it ('' = it does not)
function engineFile(text) {
  const props = {};
  for (const raw of splitLines(text)) {
    const t = javaTrim(raw);
    if (!t.startsWith('//')) continue;
    const m = PROPERTY.exec(javaTrim(t.substring(2)));
    if (!m) continue;
    const key = javaTrim(m[1]);
    if (!Object.prototype.hasOwnProperty.call(props, key)) props[key] = [];
    props[key].push(javaTrim(m[2]));
  }
  const last = (k, d) => (Object.prototype.hasOwnProperty.call(props, k) && props[k].length) ? props[k][props[k].length - 1] : d;
  let priority = 0, error = '', skip = '';
  const p = last('priority', '0');
  if (/^-?[0-9]+$/.test(p) && Number(p) >= -2147483648 && Number(p) <= 2147483647) priority = parseInt(p, 10);
  else error = 'java.lang.NumberFormatException: For input string: "' + p + '"';
  if (last('ignored', 'false') === 'true' || last('ignore', 'false') === 'true') skip = 'Ignored';
  else if (last('packmode', '') !== '') skip = 'Pack mode mismatch unless the pack mode is "' + last('packmode', '') + '"';
  else if (Object.prototype.hasOwnProperty.call(props, 'requires')) skip = 'Skipped unless these mods are loaded: ' + props.requires.join(', ');
  return { props, priority, error, skip };
}

// NTFS: names compared upper-cased, code unit by code unit
function ntfsCompare(a, b) {
  const x = a.toUpperCase(), y = b.toUpperCase();
  if (x < y) return -1;
  if (x > y) return 1;
  return a < b ? -1 : (a > b ? 1 : 0);
}
const isScriptName = (n) => n.endsWith('.js') || (n.endsWith('.ts') && !n.endsWith('.d.ts'));

// The walk of one <type>_scripts folder as the engine makes it on NTFS.
// -> { files: [rel], problems: [text] }
function walkScripts(dir) {
  const files = [], problems = [];
  const rec = (d, rel, depth) => {
    const entries = fs.readdirSync(d, { withFileTypes: true }).sort((p, q) => ntfsCompare(p.name, q.name));
    const seen = new Map();
    for (const e of entries) {
      const up = e.name.toUpperCase();
      if (seen.has(up)) problems.push(rel + e.name + ': differs from ' + seen.get(up) + ' only by case: one of the two does not exist on NTFS');
      seen.set(up, e.name);
      if (/[^\x20-\x7e]/.test(e.name)) problems.push(rel + e.name + ': a name outside printable ASCII: its place in an NTFS listing is not what this tool computes');
      if (e.isDirectory()) rec(path.join(d, e.name), rel + e.name + '/', depth + 1);
      else if (isScriptName(e.name)) {
        if (depth > MAX_DEPTH) problems.push(rel + e.name + ': ' + depth + ' levels below the script folder: the engine walks ' + MAX_DEPTH + ' and never loads it');
        else {
          if (!e.name.endsWith('.js')) problems.push(rel + e.name + ': the engine loads a .ts file as a script too; no tool of this pack reads it');
          files.push(rel + e.name);
        }
      }
    }
  };
  if (fs.existsSync(dir)) rec(dir, '', 1);
  return { files, problems };
}

// stable, highest priority first: List.sort(null) over ScriptFile.compareTo
function engineSort(items, priorityOf) {
  return items.map((it, i) => ({ it, i, p: priorityOf(it) })).sort((a, b) => (b.p - a.p) || (a.i - b.i)).map((x) => x.it);
}

// a byte order mark at the start of a text, taken off (written as a number: an escape of it does not survive every editor)
const stripMark = (text) => (text.charCodeAt(0) === 0xFEFF ? text.substring(1) : text);

// ---- header fields ---------------------------------------------------------------
// -> { fields: { file: [..], events: [..], after: [{ path, why, line }], registry: [..], live: [..] }, has: Set, problems: [text] }
function readHeader(text) {
  const out = { fields: { file: [], events: [], after: [], registry: [], live: [] }, has: new Set(), problems: [] };
  const lines = splitLines(text);
  let inHeader = true;
  for (let i = 0; i < lines.length; i++) {
    const raw = stripMark(lines[i]);
    const t = javaTrim(raw);
    if (t === '') continue;
    if (!t.startsWith('//')) { inHeader = false; continue; }
    const m = /^\/\/[ \t]*@([A-Za-z0-9_]+)(:?)(?:[ \t]+(.*))?$/.exec(t);
    if (!m) continue;
    const name = m[1], rest = javaTrim(m[3] || '');
    // A FIELD is a line that starts, at the first column, with `// @`. A line that is indented, or has more than
    // one space after the slashes, is prose about a field (the template explains its own fields that way).
    if (!raw.startsWith('// @')) {
      if (FIELDS.includes(name) && inHeader && (raw.startsWith('//@') || /^[ \t]+\/\/ ?@/.test(raw))) {
        out.problems.push('line ' + (i + 1) + ': `@' + name + '` is not read here: a header field starts the line with `// @' + name + ' ` (first column, one space)');
      }
      continue;
    }
    if (m[2] === ':' && FIELDS.includes(name)) { out.problems.push('line ' + (i + 1) + ': `@' + name + ':` is not read: a header field has no colon (`// @' + name + ' <value>`)'); continue; }
    if (m[2] === ':') continue;
    if (!FIELDS.includes(name)) {
      const low = name.toLowerCase();
      const meant = FIELDS.includes(low) ? low : (NEAR[low] || null);
      // prose that merely begins with an @word is left alone; only a likely misspelling is refused
      if (meant !== null && inHeader && /^[\w./,#\- ]*$/.test(rest)) out.problems.push('line ' + (i + 1) + ': `@' + name + '` is not a header field (did you mean `@' + meant + '`?)');
      continue;
    }
    if (!inHeader) { out.problems.push('line ' + (i + 1) + ': `@' + name + '` below the first line of code is not read: header fields go into the leading comment block'); continue; }
    if (rest === '') { out.problems.push('line ' + (i + 1) + ': `@' + name + '` has no value'); continue; }
    out.has.add(name);
    if (name === 'after') {
      const sp = rest.search(/[ \t]/);
      const p = sp < 0 ? rest : rest.substring(0, sp);
      const why = sp < 0 ? '' : javaTrim(rest.substring(sp)).replace(/^(--|:|-)\s*/, '');
      if (!/^[\w./-]+\.js$/.test(p) || p.startsWith('/') || p.includes('..')) out.problems.push('line ' + (i + 1) + ': `@after ' + p + '`: write the path of ONE script below its *_scripts folder, with .js (then, if you like, why)');
      else if (out.fields.after.some((a) => a.path === p)) out.problems.push('line ' + (i + 1) + ': `@after ' + p + '` is written twice');
      else out.fields.after.push({ path: p, why, line: i + 1 });
    } else if (name === 'file') {
      if (/[ \t]/.test(rest)) out.problems.push('line ' + (i + 1) + ': `@file` takes one path');
      else out.fields.file.push(rest);
    } else {
      for (const v of rest.split(/[ \t]*,[ \t]*|[ \t]+/)) if (v !== '') out.fields[name].push(v);
    }
  }
  return out;
}

// ---- the code --------------------------------------------------------------------
const SYNC_CALLBACK = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'reduceRight', 'find', 'findIndex', 'sort', 'flatMap']);
const TICKS = { registerServerTick: 'tick.server', registerPlayerTick: 'tick.player' };
const HURTS = { onHurt: 'hurt', onHurtLate: 'hurt.late' };
const isFn = (n) => !!n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const strLit = (n) => (n && n.type === 'Literal' && typeof n.value === 'string') ? n.value : null;
const prop = (n) => (n && n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') ? n.property.name : null;
const isId = (n, name) => !!n && n.type === 'Identifier' && n.name === name;
const isIcraftCall = (n, p) => !!n && n.type === 'CallExpression' && prop(n.callee) === p && isId(n.callee.object, 'icraft');
// icraft.live.fired(..) / icraft.lib.announce(..) / icraft.lib.need(..)
const isIcraft2 = (n, a, b) => !!n && n.type === 'CallExpression' && prop(n.callee) === b && prop(n.callee.object) === a && isId(n.callee.object.object, 'icraft');

function childNodes(n) {
  const out = [];
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push([x, k]); }
    else if (v && typeof v.type === 'string') out.push([v, k]);
  }
  return out;
}

function patternNames(p, into) {
  if (!p) return;
  if (p.type === 'Identifier') into.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value, into));
  else if (p.type === 'ArrayPattern') p.elements.forEach((q) => patternNames(q, into));
  else if (p.type === 'RestElement') patternNames(p.argument, into);
  else if (p.type === 'AssignmentPattern') patternNames(p.left, into);
}

// What one script does, read from its source.
// -> { parse: '' | why not, guards, handlers, ticks, hurts, sections, features, direct, provides, uses,
//      declares: [top-level names], frees: Map(name -> { load, deferred }), registries, dataFiles, announces, needs }
//    a registration: { name, group, id, target, line, load }   (load: made while the file loads)
//    provides: Map(name -> { load, deferred, line })   uses: Map(name -> { load, deferred, typeofOnly, line })
//    a name is what follows `global.`: `registerServerTick`, `ICRAFT_ASCENSION`, and two levels for the shared
//    namespace: `icraft.core`, `icraft.bosses` (bare `icraft.core` is the same name: it reads through to global.icraft)
function readCode(text) {
  const out = { parse: '', guards: [], handlers: [], ticks: [], hurts: [], sections: [], features: [], direct: [],
    provides: new Map(), uses: new Map(), declares: [], frees: new Map(), registries: new Set(), indirectBoss: false,
    dataFiles: new Set(), announces: [], needs: [] };
  let ast;
  try { ast = parser().parse(text, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (e) { out.parse = e.message; return out; }

  // ---- scopes: which names does each function (and the file) declare? ----
  const scopeOf = new Map();          // function node | Program -> Set of names
  const fnByName = new Map();         // a function of this file that is called by its name -> node (null when ambiguous)
  const noteFn = (name, node) => fnByName.set(name, fnByName.has(name) && fnByName.get(name) !== node ? null : node);
  const declare = (owner, name) => { if (!scopeOf.has(owner)) scopeOf.set(owner, new Set()); scopeOf.get(owner).add(name); };
  const topLevel = new Set();
  (function collect(n, owner, block) {
    if (isFn(n)) {
      if (n.type === 'FunctionDeclaration' && n.id) { declare(owner, n.id.name); noteFn(n.id.name, n); if (owner === ast) topLevel.add(n.id.name); }
      if (!scopeOf.has(n)) scopeOf.set(n, new Set());
      if (n.type === 'FunctionExpression' && n.id) declare(n, n.id.name);
      const names = [];
      n.params.forEach((p) => patternNames(p, names));
      names.forEach((x) => declare(n, x));
      declare(n, 'arguments');
      for (const [c] of childNodes(n)) collect(c, n, n);
      return;
    }
    if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) {
        const names = [];
        patternNames(d.id, names);
        names.forEach((x) => declare(owner, x));
        // shared with the other scripts of the type: a `var` anywhere outside a function, a let / const of the file's own body
        if (owner === ast && (n.kind === 'var' || block === ast)) names.forEach((x) => topLevel.add(x));
        if (d.id.type === 'Identifier' && isFn(d.init)) noteFn(d.id.name, d.init);
      }
    }
    if (n.type === 'ClassDeclaration' && n.id) { declare(owner, n.id.name); if (owner === ast && block === ast) topLevel.add(n.id.name); }
    if (n.type === 'CatchClause' && n.param) { const names = []; patternNames(n.param, names); names.forEach((x) => declare(owner, x)); }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && isFn(n.right)) noteFn(n.left.name, n.right);
    const inner = (n.type === 'BlockStatement' || n.type === 'ForStatement' || n.type === 'ForInStatement' || n.type === 'ForOfStatement' || n.type === 'SwitchStatement') ? n : block;
    for (const [c] of childNodes(n)) collect(c, owner, inner);
  })(ast, ast, ast);
  out.declares = [...topLevel].sort();

  // ---- which functions run WHILE THE FILE LOADS? ----
  // an immediately invoked function, a callback of an array walk, and a function of this file that code
  // running at load calls by its name. Everything else runs later (a handler, a tick, a command).
  const loadFns = new Set();
  const isIife = (fn, parent) => !!parent && parent.type === 'CallExpression' &&
    (parent.callee === fn || (parent.callee.type === 'MemberExpression' && parent.callee.object === fn && ['call', 'apply'].includes(prop(parent.callee))));
  const isSyncArg = (fn, parent) => !!parent && parent.type === 'CallExpression' && parent.arguments.includes(fn) &&
    (SYNC_CALLBACK.has(prop(parent.callee)) || isIcraftCall(parent, 'section'));
  (function reach(n, parent) {
    if (isFn(n)) {
      if (!(isIife(n, parent) || isSyncArg(n, parent))) return;
      if (loadFns.has(n)) return;
      loadFns.add(n);
    }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      const f = fnByName.get(n.callee.name);
      if (f && !loadFns.has(f)) { loadFns.add(f); for (const [c] of childNodes(f)) reach(c, f); }
    }
    for (const [c] of childNodes(n)) reach(c, n);
  })(ast, null);

  // names bound to one of the mod's own Java registries
  const javaRegistries = new Set();

  // `global.icraft` by itself is the shared namespace object, which every library creates when it is not there
  // (`global.icraft = global.icraft || {}`): it is nobody's export and nobody's dependency
  // groups: the events (liveness groups) of the handlers the name is read / set in, when that is not at load
  const groupOf = (guardId) => (guardId === null || guardId === undefined) ? null : guardId.substring(guardId.lastIndexOf('@') + 1);
  const noteUse = (name, load, isTypeof, line, guardId) => {
    if (name === 'icraft') return;
    let u = out.uses.get(name);
    if (!u) { u = { load: false, deferred: false, typeofOnly: true, line, groups: new Set() }; out.uses.set(name, u); }
    if (!isTypeof) {
      u.typeofOnly = false;
      if (load) u.load = true;
      else { u.deferred = true; if (groupOf(guardId) !== null) u.groups.add(groupOf(guardId)); }
    }
  };
  const noteProvide = (name, load, line, guardId) => {
    if (name === 'icraft') return;
    let p = out.provides.get(name);
    if (!p) { p = { load: false, deferred: false, line, groups: new Set() }; out.provides.set(name, p); }
    if (load) p.load = true;
    else { p.deferred = true; if (groupOf(guardId) !== null) p.groups.add(groupOf(guardId)); }
  };
  const resolved = (name, chain) => chain.some((s) => scopeOf.has(s) && scopeOf.get(s).has(name));

  // `global.X` / `global.icraft.X` / bare `icraft.X` rooted at node n (a MemberExpression): -> { name, top } | null
  const globalName = (n, parent, chain) => {
    if (n.type !== 'MemberExpression' || n.computed) return null;
    if (isId(n.object, 'global')) {
      if (n.property.name === 'icraft') {
        if (parent && parent.type === 'MemberExpression' && parent.object === n && !parent.computed) return null;   // the longer name is read at the parent
        return { name: 'icraft', top: n };
      }
      return { name: n.property.name, top: n };
    }
    if (n.object.type === 'MemberExpression' && !n.object.computed && isId(n.object.object, 'global') && n.object.property.name === 'icraft') return { name: 'icraft.' + n.property.name, top: n };
    // bare `icraft` (declared by 00_icraft_guard.js; its prototype is global.icraft), unless a function here has its own
    if (isId(n.object, 'icraft') && !resolved('icraft', chain)) return { name: 'icraft.' + n.property.name, top: n };
    return null;
  };

  (function walk(n, parent, key, chain, load, guardId, inTypeof, assignTo) {
    let innerChain = chain, innerLoad = load, innerGuard = guardId;
    if (isFn(n)) {
      innerChain = chain.concat([n]);
      innerLoad = load && loadFns.has(n);
      // the registration this function is handed to; a function nested in a handler belongs to that handler
      if (parent && parent.type === 'CallExpression' && parent.arguments.includes(n) && (isIcraftCall(parent, 'guard') || isIcraftCall(parent, 'handler'))) {
        const a = strLit(parent.arguments[0]), b = strLit(parent.arguments[1]);
        innerGuard = (a !== null && b !== null) ? a + '@' + b : null;
      }
    }
    const line = n.loc ? n.loc.start.line : 0;

    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'CallExpression') {
      const cls = strLit(n.init.arguments[0]);
      if (cls !== null && /^com\.iridescentcraft\..*Registry$/.test(cls)) javaRegistries.add(n.id.name);
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.right.type === 'CallExpression') {
      const cls = strLit(n.right.arguments[0]);
      if (cls !== null && /^com\.iridescentcraft\..*Registry$/.test(cls)) javaRegistries.add(n.left.name);
    }

    if (n.type === 'CallExpression') {
      const m = prop(n.callee);
      if (isIcraftCall(n, 'guard') || isIcraftCall(n, 'handler')) {
        const name = strLit(n.arguments[0]), group = strLit(n.arguments[1]);
        if (name !== null && group !== null) {
          let target = '';
          if (parent && parent.type === 'CallExpression' && parent.arguments.length > 1 && parent.arguments[0] !== n) {
            const lit = strLit(parent.arguments[0]);
            target = lit !== null ? lit : '<computed>';
          }
          (isIcraftCall(n, 'guard') ? out.guards : out.handlers).push({ name, group, id: name + '@' + group, target, line, load });
        }
      } else if (isIcraftCall(n, 'section')) {
        const name = strLit(n.arguments[0]);
        if (name !== null) out.sections.push({ name, of: guardId, line });
      } else if (isIcraft2(n, 'live', 'fired')) {
        const name = strLit(n.arguments[0]);
        if (name !== null) out.features.push({ name, line });
      } else if (isIcraft2(n, 'lib', 'announce')) {
        const name = strLit(n.arguments[0]);
        if (name !== null) out.announces.push({ name, line, load });
      } else if (isIcraft2(n, 'lib', 'need')) {
        const name = strLit(n.arguments[0]);
        if (name !== null) out.needs.push({ name, line, load });
      } else if (m && TICKS[m] && isId(n.callee.object, 'global')) {
        const name = strLit(n.arguments[0]);
        if (name !== null) {
          const num = (a) => (a && a.type === 'Literal' && typeof a.value === 'number') ? a.value : null;
          out.ticks.push({ name, group: TICKS[m], id: name + '@' + TICKS[m], interval: num(n.arguments[1]), offset: num(n.arguments[2]), line, load });
        }
      } else if (m && HURTS[m] && n.arguments.length >= 2) {
        const name = strLit(n.arguments[0]);
        if (name !== null) out.hurts.push({ name, group: HURTS[m], id: name + '@' + HURTS[m], who: strLit(n.arguments[2]) || 'any', line, load });
      } else if (m && /^register[A-Z]?\w*$/.test(m) && n.callee.object.type === 'Identifier' && javaRegistries.has(n.callee.object.name) &&
                 !n.arguments.some((a) => isIcraftCall(a, 'handler'))) {
        out.direct.push({ what: n.callee.object.name + '.' + m, key: strLit(n.arguments[0]) || '', line, load });
      } else if (m === 'isBoss') {
        out.indirectBoss = true;
      } else if (m && /^(read|readString|readJson|write|writeString)$/.test(m) && isId(n.callee.object, 'JsonIO')) {
        const p = strLit(n.arguments[0]);
        if (p !== null) out.dataFiles.add((m.startsWith('write') ? 'writes ' : 'reads ') + p);
      }
    }

    if (n.type === 'MemberExpression') {
      const g = globalName(n, parent, innerChain);
      if (g !== null) {
        const isWrite = parent && ((parent.type === 'AssignmentExpression' && parent.left === n) ||
          (parent.type === 'UnaryExpression' && parent.operator === 'delete'));
        const compound = parent && ((parent.type === 'AssignmentExpression' && parent.left === n && parent.operator !== '=') || parent.type === 'UpdateExpression');
        if (isWrite || compound) noteProvide(g.name, load, line, guardId);
        // `global.X = global.X || {}` reads X only to keep it: that is not a dependency on anybody
        if ((!isWrite || compound) && assignTo !== g.name) noteUse(g.name, load, inTypeof, line, guardId);
        if (g.name === 'icraft.bosses') out.registries.add('bosses');
        if (g.name === 'icraft.dims') out.registries.add('dimensions');
      }
    }

    // a free name: not declared anywhere in this file. Whether another script declares it is decided later.
    if (n.type === 'Identifier') {
      const isRef = !(parent && (
        (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) ||
        ((parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed) ||
        (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') ||
        (parent.type === 'VariableDeclarator' && key === 'id') ||
        (isFn(parent) && (key === 'id' || key === 'params')) ||
        (parent.type === 'ClassDeclaration' && key === 'id') || (parent.type === 'ClassExpression' && key === 'id') ||
        (parent.type === 'CatchClause' && key === 'param') ||
        parent.type === 'ObjectPattern' || parent.type === 'ArrayPattern' || parent.type === 'RestElement' ||
        (parent.type === 'AssignmentPattern' && key === 'left')));
      if (isRef && !resolved(n.name, [ast].concat(innerChain))) {
        let f = out.frees.get(n.name);
        if (!f) { f = { load: false, deferred: false, typeofOnly: true, line, groups: new Set() }; out.frees.set(n.name, f); }
        if (!inTypeof) { f.typeofOnly = false; if (load) f.load = true; else f.deferred = true; }
      }
    }

    for (const [c, k] of childNodes(n)) {
      let to = assignTo;
      if (n.type === 'AssignmentExpression' && k === 'right' && n.left.type === 'MemberExpression') {
        const g = globalName(n.left, n, innerChain);
        to = g !== null ? g.name : assignTo;
      }
      walk(c, n, k, innerChain, innerLoad, innerGuard, inTypeof || (n.type === 'UnaryExpression' && n.operator === 'typeof'), to);
    }
  })(ast, null, null, [], true, null, false, null);

  // a property of a pattern is declared, its default value is read: the walker above treats the whole pattern as
  // a declaration, which only loses reads inside default values of destructuring (none in the pack)
  return out;
}

// ---- the pack ----------------------------------------------------------------------
const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');

// -> { pack, trees: { <tree>: { <type>: { dir, exists, order: [rel], scripts: Map(rel -> script) } } }, problems: [text] }
//    a script: { rel, type, tree, index (1-based place in the load order), walkIndex, priority, engine, header, code, text, sha, bytes }
function readPack(pack) {
  const model = { pack, trees: {}, problems: [] };
  const cache = new Map();
  for (const tree of Object.keys(TREES)) {
    model.trees[tree] = {};
    for (const type of TYPES) {
      const dir = path.join(pack, TREES[tree], type + '_scripts');
      const where = TREES[tree] + '/' + type + '_scripts/';
      const w = walkScripts(dir);
      for (const p of w.problems) model.problems.push(where + p);
      const scripts = new Map();
      w.files.forEach((rel, i) => {
        const buf = fs.readFileSync(path.join(dir, rel));
        const key = sha(buf);
        let c = cache.get(key);
        if (!c) {
          let text = '';
          let bad = '';
          try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf); }
          catch (e) { bad = 'is not valid UTF-8: the engine cannot read it (Files.readAllLines throws) and the file does not load'; text = buf.toString('latin1'); }
          c = { text, bad, engine: engineFile(text), header: readHeader(text), code: readCode(stripMark(text)), bom: text.charCodeAt(0) === 0xFEFF };
          cache.set(key, c);
        }
        scripts.set(rel, { rel, type, tree, walkIndex: i, index: 0, priority: c.engine.priority, engine: c.engine, header: c.header, code: c.code, text: c.text, sha: key, bom: c.bom, bad: c.bad });
      });
      const order = engineSort(w.files, (rel) => scripts.get(rel).priority);
      order.forEach((rel, i) => { scripts.get(rel).index = i + 1; });
      model.trees[tree][type] = { dir, exists: fs.existsSync(dir), order, scripts };
    }
  }
  return model;
}

// ---- who provides what -------------------------------------------------------------
// For one tree: name -> [{ type, rel, load }] over all three script types (`global` is ONE map for all of them),
// and per type the top-level names a script declares (one shared scope per type).
function providers(model, tree) {
  const globals = new Map(), scope = {};
  for (const type of TYPES) {
    scope[type] = new Map();
    for (const rel of model.trees[tree][type].order) {
      const s = model.trees[tree][type].scripts.get(rel);
      for (const [name, p] of s.code.provides) {
        if (!globals.has(name)) globals.set(name, []);
        globals.get(name).push({ type, rel, load: p.load, groups: p.groups });
      }
      for (const name of s.code.declares) {
        if (!scope[type].has(name)) scope[type].set(name, []);
        scope[type].get(name).push(rel);
      }
    }
  }
  return { globals, scope };
}

// Every dependency of one script on another, read from the code.
// -> [{ from: rel, type, on: { type, rel, load }, name, kind: 'global' | 'scope', load, deferred, typeofOnly, sameEvent: [group] }]
//    load = the name is read while the file loads: the provider must have loaded BEFORE.
//    sameEvent = the provider sets the name inside a handler and this script reads it inside a handler of the SAME
//    event: the provider's handler must run first, so the provider must have loaded before (handler order = load order)
function dependencies(model, tree) {
  const prov = providers(model, tree);
  const out = [];
  for (const type of TYPES) {
    for (const rel of model.trees[tree][type].order) {
      const s = model.trees[tree][type].scripts.get(rel);
      const add = (name, kind, u, list) => {
        for (const p of list) {
          if (p.type === type && p.rel === rel) continue;
          const same = (p.type === type && p.load === false && p.groups && u.groups) ? [...u.groups].filter((g) => p.groups.has(g)).sort() : [];
          out.push({ from: rel, type, on: { type: p.type, rel: p.rel, load: p.load !== false }, name, kind, load: u.load, deferred: u.deferred, typeofOnly: u.typeofOnly, sameEvent: same });
        }
      };
      for (const [name, u] of s.code.uses) {
        if (s.code.provides.has(name) && s.code.provides.get(name).load) continue;      // its own
        let list = prov.globals.get(name);
        // icraft.guard / .section / .handler / .live / .lib come from the file that declares `icraft`
        if (!list && name.indexOf('icraft.') === 0) list = (prov.scope[type].get('icraft') || []).map((r) => ({ type, rel: r, load: true }));
        if (list) add(name, 'global', u, list);
      }
      for (const [name, u] of s.code.frees) {
        const list = prov.scope[type].get(name);
        if (list && name !== 'icraft') add(name, 'scope', u, list.map((r) => ({ type, rel: r, load: true })));
      }
    }
  }
  return out;
}

// The order KubeJS runs the handlers of ONE event in (EventHandler.post; asked of a real server: the fact
// `handler order: ...` of engine-tests/real-engine/0_script_file_facts.js): the handlers registered for the
// target of the firing first (`ItemEvents.rightClicked('minecraft:stick', ..)`), then the untargeted ones, each
// group in registration order, which is the load order of the scripts and the source order inside one script.
// list: [{ target: '' | '<target>' , ... }] in registration order -> the same items in the order they run for a
// firing whose target is `target` ('' = a firing without a target: only the untargeted handlers run)
function handlerOrder(list, target) {
  const hit = target === '' ? [] : list.filter((h) => h.target === target);
  return hit.concat(list.filter((h) => h.target === ''));
}

module.exports = {
  handlerOrder,
  TREES, TYPES, TYPE_RANK, FIELDS, REGISTRY_NAMES, MAX_DEPTH,
  javaTrim, engineFile, ntfsCompare, walkScripts, engineSort, readHeader, readCode, readPack, providers, dependencies, splitLines
};
