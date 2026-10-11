// lint_kubejs_rhino.js -- flag script patterns that misbehave on the pack's script engine
// (rhino 2001.2.3 / KubeJS 2001.6.5) but pass `node --check`.
//
//   node --expose-internals .minecraft/dev/lint_kubejs_rhino.js            # all kubejs scripts
//   node --expose-internals .minecraft/dev/lint_kubejs_rhino.js a.js b.js  # just these
//
// Exit code 1 when anything is flagged. Every rule was reproduced on the production Rhino jar
// (2026-10-10; internal dev/failure-modes.md section 2). Companion gates: lint_kubejs_scope.py
// (shared top-level names) and rhino_parse/ParseAll.java (compile every script with the real parser).
//
//   CONST-IN-TRY        const lexically inside a try{} body (same function)  -> throws "redeclaration of var"
//   CONST-IN-LOOP       const in a loop body                                  -> keeps its first-iteration value
//   LET-NOINIT-IN-LOOP  `let x` (no initializer) in a loop body               -> not reset per iteration
//   FUNC-DECL-IN-BLOCK  function declaration inside a block                   -> undefined inside try blocks
//   BLOCK-VAR-ESCAPE    `var` declared in a block, referenced outside it      -> ReferenceError / undefined
//   VAR-SHADOW          `var x` in a block while an enclosing scope of the same function also has `var x`
//                                                                             -> the inner one does NOT assign the outer
//   SYNTAX              spread / default param / rest / shorthand prop / computed key / catch{} / ?? / ?.
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const fs = require('fs');

function patternIds(p, out) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p); break;
    case 'ObjectPattern': for (const pr of p.properties) patternIds(pr.type === 'RestElement' ? pr.argument : pr.value, out); break;
    case 'ArrayPattern': for (const el of p.elements) patternIds(el, out); break;
    case 'RestElement': patternIds(p.argument, out); break;
    case 'AssignmentPattern': patternIds(p.left, out); break;
  }
  return out;
}

let SID = 0;
class Scope {
  constructor(kind, parent, node) { this.kind = kind; this.parent = parent; this.node = node; this.id = ++SID; this.vars = new Map(); this.lex = new Map(); this.transparent = false; }
  fn() { let s = this; while (s.kind !== 'function' && s.kind !== 'program') s = s.parent; return s; }
  // Rhino: var lands in the nearest non-transparent block
  rhinoVarScope() { let s = this; while (s.transparent) s = s.parent; return s; }
  within(other) { for (let s = this; s; s = s.parent) if (s === other) return true; return false; }
}

function lint(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
  catch (e) { return [file + ': PARSE FAIL ' + e.message]; }
  const flag = (node, kind, msg) => out.push(file.replace(/\\/g, '/').split('/').slice(-2).join('/') + ':' + node.loc.start.line + '\t' + kind + '\t' + msg);

  const top = new Scope('program', null, ast);
  const scopeOf = new Map();
  const varDecls = []; // {name, scope(rhino), fnScope, node}

  function declareVar(scope, id) {
    const rs = scope.rhinoVarScope();
    varDecls.push({ name: id.name, scope: rs, fn: scope.fn(), node: id });
    if (!rs.vars.has(id.name)) rs.vars.set(id.name, id);
  }

  function p1(node, scope, ctx) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'FunctionDeclaration': {
        if (ctx.blockDepth > 0) flag(node, 'FUNC-DECL-IN-BLOCK', node.id.name + (ctx.inTry ? ' (inside try: undefined at call time)' : ''));
        scope.fn().vars.set(node.id.name, node.id);
      } // fallthrough
      case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const fs_ = new Scope('function', scope, node); scopeOf.set(node, fs_);
        if (node.type === 'FunctionExpression' && node.id) fs_.vars.set(node.id.name, node.id);
        for (const p of node.params) {
          if (p.type === 'AssignmentPattern') flag(p, 'SYNTAX', 'default parameter');
          if (p.type === 'RestElement') flag(p, 'SYNTAX', 'rest parameter');
          for (const id of patternIds(p, [])) fs_.vars.set(id.name, id);
        }
        const inner = { inTry: false, inLoop: false, blockDepth: 0 };
        if (node.body.type === 'BlockStatement') { for (const s of node.body.body) p1(s, fs_, inner); }
        else p1(node.body, fs_, inner);
        return;
      }
      case 'VariableDeclaration': {
        for (const d of node.declarations) {
          const ids = patternIds(d.id, []);
          if (node.kind === 'var') { for (const id of ids) declareVar(scope, id); }
          else {
            for (const id of ids) scope.lex.set(id.name, id);
            const names = ids.map(i => i.name).join(',');
            if (node.kind === 'const' && ctx.inTry && !ctx.forHead) flag(d, 'CONST-IN-TRY', names);
            if (node.kind === 'const' && ctx.inLoop && !ctx.forHead) flag(d, 'CONST-IN-LOOP', names);
            if (node.kind === 'let' && ctx.inLoop && !ctx.forHead && !d.init) flag(d, 'LET-NOINIT-IN-LOOP', names);
          }
          if (d.init) p1(d.init, scope, ctx);
        }
        return;
      }
      case 'BlockStatement': {
        const bs = new Scope('block', scope, node); scopeOf.set(node, bs);
        const c = { inTry: ctx.inTry, inLoop: ctx.inLoop, blockDepth: ctx.blockDepth + 1 };
        for (const s of node.body) p1(s, bs, c);
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const bs = new Scope('block', scope, node); scopeOf.set(node, bs);
        const head = { inTry: ctx.inTry, inLoop: ctx.inLoop, blockDepth: ctx.blockDepth + 1, forHead: true };
        for (const k of ['init', 'left']) if (node[k]) p1(node[k], bs, head);
        const rest = { inTry: ctx.inTry, inLoop: ctx.inLoop, blockDepth: ctx.blockDepth + 1 };
        for (const k of ['right', 'test', 'update']) if (node[k]) p1(node[k], bs, rest);
        const body = { inTry: ctx.inTry, inLoop: true, blockDepth: ctx.blockDepth + 1 };
        p1(node.body, bs, body);
        return;
      }
      case 'WhileStatement': case 'DoWhileStatement': {
        p1(node.test, scope, ctx);
        p1(node.body, scope, { inTry: ctx.inTry, inLoop: true, blockDepth: ctx.blockDepth + 1 });
        return;
      }
      case 'TryStatement': {
        const tctx = { inTry: ctx.inTry || !!node.handler, inLoop: ctx.inLoop, blockDepth: ctx.blockDepth };
        p1(node.block, scope, tctx);
        if (node.handler) {
          if (!node.handler.param) flag(node.handler, 'SYNTAX', 'catch without a binding');
          const cs = new Scope('catch', scope, node.handler); cs.transparent = true; scopeOf.set(node.handler, cs);
          if (node.handler.param) for (const id of patternIds(node.handler.param, [])) cs.lex.set(id.name, id);
          // catch body: its own block node, but var-transparent (traps5 #134)
          const bs = new Scope('block', cs, node.handler.body); bs.transparent = true; scopeOf.set(node.handler.body, bs);
          const c = { inTry: ctx.inTry, inLoop: ctx.inLoop, blockDepth: ctx.blockDepth + 1 };
          for (const s of node.handler.body.body) p1(s, bs, c);
        }
        if (node.finalizer) p1(node.finalizer, scope, ctx);
        return;
      }
      case 'SpreadElement': flag(node, 'SYNTAX', 'spread'); break;
      case 'Property':
        if (node.shorthand && node.value.type !== 'AssignmentPattern') flag(node, 'SYNTAX', 'shorthand property ' + (node.key.name || ''));
        if (node.computed) flag(node, 'SYNTAX', 'computed property key');
        break;
      case 'LogicalExpression': if (node.operator === '??') flag(node, 'SYNTAX', '?? (returns a wrong value on this engine)'); break;
      case 'ChainExpression': flag(node, 'SYNTAX', 'optional chaining'); break;
      case 'ClassDeclaration': case 'ClassExpression': flag(node, 'SYNTAX', 'class'); break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') p1(c, scope, ctx); }
      else if (v && typeof v.type === 'string') p1(v, scope, ctx);
    }
  }
  p1(ast, top, { inTry: false, inLoop: false, blockDepth: 0 });

  // VAR-SHADOW: same function, one declaring scope strictly encloses the other
  const seen = new Set();
  for (const a of varDecls) for (const b of varDecls) {
    if (a === b || a.name !== b.name || a.fn !== b.fn || a.scope === b.scope) continue;
    if (b.scope.within(a.scope)) {
      const key = a.name + ':' + b.node.loc.start.line;
      if (!seen.has(key)) { seen.add(key); flag(b.node, 'VAR-SHADOW', b.name + ' (also declared in an enclosing scope at line ' + a.node.loc.start.line + ')'); }
    }
  }

  // BLOCK-VAR-ESCAPE: resolve references with STANDARD semantics, then check the Rhino scope contains the use
  function stdResolve(name, scope) {
    // lexical first, walking up; var: any block of each function on the way
    for (let s = scope; s; s = s.parent) {
      if (s.lex.has(name)) return { lex: true };
      if (s.vars.has(name)) return { scope: s };
      if (s.kind === 'function' || s.kind === 'program') {
        // standard hoisting: a var anywhere in this function is visible here
        const hit = varDecls.find(d => d.name === name && d.fn === s);
        if (hit) return { scope: hit.scope, hoisted: true, all: varDecls.filter(d => d.name === name && d.fn === s) };
      }
    }
    return null;
  }
  function p2(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    const own = scopeOf.get(node); if (own) scope = own;
    switch (node.type) {
      case 'Identifier': {
        const r = stdResolve(node.name, scope);
        if (r && r.hoisted) {
          // visible under Rhino only if the use is inside one of the declaring blocks
          const ok = r.all.some(d => scope.within(d.scope));
          if (!ok) flag(node, 'BLOCK-VAR-ESCAPE', node.name + ' (declared in a block at line ' + r.all.map(d => d.node.loc.start.line).join('/') + ')');
        }
        return;
      }
      case 'MemberExpression': p2(node.object, scope); if (node.computed) p2(node.property, scope); return;
      case 'Property': if (node.computed) p2(node.key, scope); p2(node.value, scope); return;
      case 'LabeledStatement': p2(node.body, scope); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const fs_ = scopeOf.get(node);
        if (node.body.type === 'BlockStatement') for (const s of node.body.body) p2(s, fs_); else p2(node.body, fs_);
        return;
      }
      case 'VariableDeclaration': for (const d of node.declarations) { if (d.init) p2(d.init, scope); } return;
      case 'CatchClause': { const cs = scopeOf.get(node); p2(node.body, cs); return; }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') p2(c, scope); }
      else if (v && typeof v.type === 'string') p2(v, scope);
    }
  }
  p2(ast, top);
  return out;
}

const path = require('path');
let files = process.argv.slice(2);
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
}
let total = 0;
for (const f of files) {
  const res = lint(f);
  total += res.length;
  // scanning the whole pack: only print the files that have something to say
  if (res.length || !all) {
    const name = f.split(path.sep).join('/').split('/').slice(-2).join('/');
    console.log((res.length ? 'FLAGS ' : 'clean ') + name + (res.length ? '\n  ' + res.join('\n  ') : ''));
  }
}
console.log('[rhino-lint] ' + files.length + ' file(s), ' + total + ' flag(s)');
process.exitCode = total ? 1 : 0;
