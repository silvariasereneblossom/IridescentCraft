#!/usr/bin/env node
// =============================================================================
// gen_recipe_removal_targets.js -- writes the REMOVAL_TARGETS list of
// kubejs/server_scripts/validate_recipe_removals.js from the scripts themselves.
//
//   node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js           rewrite the list
//   node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js --check   exit 1 if it is out of date
//   node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js --list    print what it found, change nothing
//
// The validator warns at server start about an `event.remove({ output: id })`
// whose item id no longer exists (a removal of a renamed item is a silent
// no-op). Its list used to be pasted by hand: on 2026-10-12 it held 114 ids
// while the scripts removed 442.
//
// What is collected, from every server script (parsed with node's own acorn,
// like the other lints), for a call `event.remove({ output: X })`:
//   * X is a string literal                                  'ns:item'
//   * X is the variable of a loop over a list of literals    [ ... ].forEach(id => ...),
//     LIST.forEach(...), for (const id of LIST), LIST[i]     (LIST declared in the same file)
//   * X is a template with such a variable in it             `waystones:${color}_sharestone`
//   * the list is a script global                            (global.NAME || []).forEach(...)
//     -> the NAME goes into REMOVAL_GLOBALS and the validator reads it at run time
// Skipped on purpose: tag outputs ('#forge:...'), regular expressions, and
// removals by recipe id / type / input (nothing to look up in the item registry).
// An output this tool cannot resolve is REPORTED with its file and line, and
// --check fails on it: never dropped quietly.
// =============================================================================
'use strict'
const fs = require('fs')
const path = require('path')
let acorn
try { acorn = require('internal/deps/acorn/acorn/dist/acorn') } catch (e) {
  console.error('run with: node --expose-internals ' + path.relative(process.cwd(), __filename)); process.exit(2)
}

const MC = path.resolve(__dirname, '..')
const SCRIPTS = path.join(MC, 'kubejs', 'server_scripts')
const VALIDATOR = path.join(SCRIPTS, 'validate_recipe_removals.js')
const BEGIN = '    // BEGIN GENERATED (dev/gen_recipe_removal_targets.js) -- do not edit by hand'
const END = '    // END GENERATED'
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--list') ? 'list' : 'write'

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}
function children(node, cb) {
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = node[k]
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') cb(c) }
    else if (v && typeof v.type === 'string') cb(v)
  }
}
const isItemId = s => typeof s === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(s)
const literalStrings = arr => arr.elements.length && arr.elements.every(e => e && e.type === 'Literal' && typeof e.value === 'string') ? arr.elements.map(e => e.value) : null
// global.NAME  or  (global.NAME || [])
const globalName = n => {
  if (!n) return null
  if (n.type === 'LogicalExpression' && n.operator === '||') return globalName(n.left)
  if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'global') return n.property.name
  return null
}

const byFile = new Map()      // rel path -> Set of ids
const globals = new Map()     // global name -> rel path
const unresolved = []         // 'file:line  text'
const add = (rel, id) => { if (!isItemId(id)) return; if (!byFile.has(rel)) byFile.set(rel, new Set()); byFile.get(rel).add(id) }

for (const file of walk(SCRIPTS, []).sort()) {
  if (path.resolve(file) === path.resolve(VALIDATOR)) continue
  const rel = path.relative(SCRIPTS, file).split(path.sep).join('/')
  const src = fs.readFileSync(file, 'utf8')
  let ast
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true }) } catch (e) {
    unresolved.push(rel + ': could not be parsed (' + e.message + ')'); continue
  }
  // every `NAME = [ 'literal', ... ]` and `NAME = global.X || []` in the file
  const arrays = new Map(), fromGlobal = new Map()
  ;(function scan(n) {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (n.init.type === 'ArrayExpression') { const lits = literalStrings(n.init); if (lits) arrays.set(n.id.name, lits) }
      const g = globalName(n.init); if (g) fromGlobal.set(n.id.name, g)
    }
    children(n, scan)
  })(ast)
  // a list expression -> { ids: [...] } | { global: NAME } | null
  const listOf = node => {
    if (!node) return null
    if (node.type === 'ArrayExpression') { const l = literalStrings(node); return l ? { ids: l } : null }
    if (node.type === 'Identifier') {
      if (arrays.has(node.name)) return { ids: arrays.get(node.name) }
      if (fromGlobal.has(node.name)) return { global: fromGlobal.get(node.name) }
      return null
    }
    const g = globalName(node); return g ? { global: g } : null
  }
  // what a variable ranges over, read off the enclosing loops
  const rangeOf = (name, stack) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i]
      // LIST.forEach(id => ...)  /  [ ... ].forEach(function (id) { ... })
      if ((s.type === 'ArrowFunctionExpression' || s.type === 'FunctionExpression') && s.params[0] && s.params[0].type === 'Identifier' && s.params[0].name === name) {
        const call = stack[i - 1]
        if (call && call.type === 'CallExpression' && call.callee.type === 'MemberExpression' && call.callee.property.name === 'forEach') return listOf(call.callee.object)
        return null
      }
      // for (const id of LIST)
      if (s.type === 'ForOfStatement' && s.left.type === 'VariableDeclaration' && s.left.declarations[0].id.name === name) return listOf(s.right)
      // var id = LIST[i]   in an enclosing block
      const body = Array.isArray(s.body) ? s.body : null
      if (body) {
        for (const st of body) {
          if (st.type !== 'VariableDeclaration') continue
          for (const d of st.declarations) {
            if (d.id.type === 'Identifier' && d.id.name === name && d.init && d.init.type === 'MemberExpression' && d.init.computed) return listOf(d.init.object)
          }
        }
      }
    }
    return null
  }
  ;(function visit(n, stack) {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed &&
        n.callee.property.name === 'remove' && n.callee.object.type === 'Identifier' && /^(event|e|ev)$/.test(n.callee.object.name) &&
        n.arguments[0] && n.arguments[0].type === 'ObjectExpression') {
      const prop = n.arguments[0].properties.find(q => q.key && (q.key.name === 'output' || q.key.value === 'output'))
      if (prop) {
        const v = prop.value
        let got = null     // { ids } | { global } | 'skip'
        if (v.type === 'Literal' && typeof v.value === 'string') got = { ids: [v.value] }     // tags and non-ids are filtered in add()
        else if (v.type === 'Literal' && v.regex) got = 'skip'                                // a pattern: nothing to look up
        else if (v.type === 'Identifier') got = rangeOf(v.name, stack)
        else if (v.type === 'MemberExpression' && v.computed) got = listOf(v.object)          // { output: LIST[i] }
        else if (v.type === 'TemplateLiteral' && v.expressions.length === 1 && v.expressions[0].type === 'Identifier') {
          const r = rangeOf(v.expressions[0].name, stack)
          if (r && r.ids) got = { ids: r.ids.map(x => v.quasis[0].value.cooked + x + v.quasis[1].value.cooked) }
        }
        if (got && got.ids) got.ids.forEach(id => add(rel, id))
        else if (got && got.global) globals.set(got.global, rel)
        else if (got !== 'skip') unresolved.push(rel + ':' + n.loc.start.line + '  output: ' + src.slice(v.start, v.end))
      }
    }
    stack.push(n); children(n, c => visit(c, stack)); stack.pop()
  })(ast, [])
}

const files = [...byFile.keys()].sort()
const all = new Set(); files.forEach(f => byFile.get(f).forEach(id => all.add(id)))
const gnames = [...globals.keys()].sort()
const seen = new Set()
const lines = [BEGIN,
  '    // ' + all.size + ' item ids from ' + files.length + ' script files, plus ' + gnames.length + ' list(s) read from `global` at run time.',
  '    // Regenerate, never paste:  node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js',
  '    const REMOVAL_GLOBALS = [' + gnames.map(g => "'" + g + "'").join(', ') + ']' + (gnames.length ? '   // ' + gnames.map(g => globals.get(g)).join(', ') : ''),
  '    const REMOVAL_TARGETS = [']
files.forEach(f => {
  const ids = [...byFile.get(f)].sort().filter(id => !seen.has(id))
  ids.forEach(id => seen.add(id))
  if (!ids.length) return
  lines.push('        // ' + f)
  for (let i = 0; i < ids.length; i += 3) lines.push('        ' + ids.slice(i, i + 3).map(id => "'" + id + "',").join(' '))
})
lines.push('    ]', END)

if (mode === 'list') {
  files.forEach(f => console.log(f + ' (' + byFile.get(f).size + '): ' + [...byFile.get(f)].sort().join(' ')))
  gnames.forEach(g => console.log('global.' + g + '  <- ' + globals.get(g)))
}
console.log('[gen_recipe_removal_targets] ' + all.size + ' removal output ids in ' + files.length + ' files, ' + gnames.length +
  ' run-time list(s); ' + unresolved.length + ' output(s) not resolvable')
unresolved.forEach(u => console.log('  UNRESOLVED ' + u))
if (mode === 'list') process.exit(0)

const text = fs.readFileSync(VALIDATOR, 'utf8')
const eol = text.includes('\r\n') ? '\r\n' : '\n'
const a = text.indexOf(BEGIN), b = text.indexOf(END)
if (a < 0 || b < 0 || b < a) { console.error('[gen_recipe_removal_targets] the BEGIN/END GENERATED markers are missing from ' + path.relative(MC, VALIDATOR)); process.exit(2) }
const next = text.slice(0, a) + lines.join(eol) + text.slice(b + END.length)
if (mode === 'check') {
  let bad = 0
  if (next !== text) { console.error('[gen_recipe_removal_targets] validate_recipe_removals.js is OUT OF DATE: run  node --expose-internals .minecraft/dev/gen_recipe_removal_targets.js'); bad = 1 }
  if (unresolved.length) { console.error('[gen_recipe_removal_targets] ' + unresolved.length + ' removal output(s) this tool cannot read (above): the list would be incomplete'); bad = 1 }
  if (!bad) console.log('[gen_recipe_removal_targets] validate_recipe_removals.js is up to date')
  process.exit(bad)
}
if (next === text) { console.log('[gen_recipe_removal_targets] validate_recipe_removals.js is up to date'); process.exit(unresolved.length ? 1 : 0) }
fs.writeFileSync(VALIDATOR, next)
console.log('[gen_recipe_removal_targets] rewrote the list in ' + path.relative(MC, VALIDATOR))
process.exit(unresolved.length ? 1 : 0)
