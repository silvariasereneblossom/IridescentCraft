// =============================================================================
// legacy_lists.js -- the boss and dimension lists as the scripts held them
// BEFORE the registries (kubejs/config/icraft/registry/*.json), read out of the
// script sources.
//
//   node legacy_lists.js <tree> [--loot-only]
//                                    <tree> = a folder that holds
//                                    kubejs/server_scripts and kubejs/startup_scripts
//   --loot-only                      only the .anyDimension(...) calls of the loot
//                                    scripts (a tree that has no lists any more)
//
// Prints one JSON document: for every consuming system, what each id meant to
// it. `table.py` runs this on a commit that still has the lists (the default is
// the last one, see LAST_LIST_COMMIT there) and compares the result, cell for
// cell, with what the registry gives the same systems.
//
// A list is found by an anchor in its file and evaluated as the JavaScript
// literal it is (node's own parser: comments, trailing commas and string
// concatenation are whatever JavaScript says they are). A list that is not
// found is an ERROR, never an empty list.
// =============================================================================
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const tree = process.argv[2]
const lootOnly = process.argv.indexOf('--loot-only') > 2
if (!tree) { console.error('usage: node legacy_lists.js <tree> [--loot-only]'); process.exit(2) }
const problems = []

function read(rel) {
  const p = path.join(tree, 'kubejs', rel)
  try { return fs.readFileSync(p, 'utf8') } catch (e) { problems.push(rel + ': not readable'); return null }
}

// The source text of the literal that starts at the first `open` character at
// or after `from`: strings, template strings, comments and regex-free code.
function literalAt(src, from, open) {
  const close = { '[': ']', '{': '}', '(': ')' }[open]
  let i = src.indexOf(open, from)
  if (i < 0) return null
  const start = i
  let depth = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); if (i < 0) return null; continue }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return null; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++ }
      i = j + 1
      continue
    }
    if (c === '[' || c === '{' || c === '(') depth++
    if (c === ']' || c === '}' || c === ')') {
      depth--
      if (depth === 0) {
        if (c !== close) return null
        return src.substring(start, i + 1)
      }
    }
    i++
  }
  return null
}

// The value of the literal that follows `anchor` (a RegExp) in the file `rel`.
function literal(rel, anchor, open, name) {
  const src = read(rel)
  if (src === null) return null
  const m = anchor.exec(src)
  if (!m) { problems.push(rel + ': ' + name + ' was not found (anchor ' + anchor + ')'); return null }
  const text = literalAt(src, m.index + m[0].length - 1, open)
  if (text === null) { problems.push(rel + ': ' + name + ' could not be cut out'); return null }
  try { return vm.runInNewContext('(' + text + ')', {}) } catch (e) {
    problems.push(rel + ': ' + name + ' is not a plain literal (' + e.message + ')')
    return null
  }
}

const S = 'server_scripts/'
const out = { bosses: {}, dimensions: {}, arenas: null, arenaOrder: null, loot: [], counts: {} }
const asSet = (list) => { const o = {}; (list || []).forEach((id) => { o[id] = true }); return o }

function lists() {
// ---- bosses -----------------------------------------------------------------
const coreIds = literal(S + '0_lib_core.js', /var BOSS_IDS = \{\}\s*;?\s*\[/, '[', 'BOSS_IDS')
out.bosses.isBoss = asSet(coreIds)

const tierExcluded = literal(S + 'scaling/mob_scaling_unified.js', /const BOSSES = new Set\(\[/, '[', 'BOSSES')
out.bosses.tierHpExcluded = asSet(tierExcluded)

const perKill = literal(S + 'scaling/boss_progressive.js', /const BOSSES = new Set\(\[/, '[', 'BOSSES')
out.bosses.perKill = asSet(perKill)

out.bosses.hp = literal(S + 'scaling/boss_hp.js', /const BOSS_HP = \{/, '{', 'BOSS_HP') || {}

// kill tokens: the first tier that lists an id wins (buildTierLookup), and a
// named boss is never also paid as a miniboss (the handler tests named first)
const firstTier = (byTier) => {
  const map = {}
  for (let t = 1; t <= 4; t++) ((byTier || {})[t] || []).forEach((id) => { if (map[id] === undefined) map[id] = t })
  return map
}
const kills = S + 'exploration/codex_exploration_kills.js'
const namedByTier = literal(kills, /const NAMED_BOSSES_BY_TIER = \{/, '{', 'NAMED_BOSSES_BY_TIER')
const miniByTier = literal(kills, /const MINIBOSSES_BY_TIER = \{/, '{', 'MINIBOSSES_BY_TIER')
out.bosses.tokensNamed = firstTier(namedByTier)
out.bosses.tokensMiniboss = firstTier(miniByTier)

// x3: named (all tiers) + extras - excludes; the damage-skip lever
const x3 = S + 'scaling/zz_boss_global_3x.js'
const extras = literal(x3, /const BOSS_3X_EXTRAS = \[/, '[', 'BOSS_3X_EXTRAS')
const excludes = literal(x3, /const BOSS_3X_EXCLUDES = \[/, '[', 'BOSS_3X_EXCLUDES')
const dmgSkip = literal(x3, /const BOSS_3X_DMG_SKIP = \[/, '[', 'BOSS_3X_DMG_SKIP')
const x3set = {}
Object.keys(out.bosses.tokensNamed).forEach((id) => { x3set[id] = true })
;(extras || []).forEach((id) => { x3set[id] = true })
;(excludes || []).forEach((id) => { delete x3set[id] })
out.bosses.x3 = x3set
out.bosses.x3DamageSkip = asSet(dmgSkip)
out.counts.x3 = { named: Object.keys(out.bosses.tokensNamed).length, extras: (extras || []).length, excluded: (excludes || []).length }

// boss rush: roster tier per id, and the phase aliases
const rush = S + 'gates/codex_boss_rush.js'
const rosters = literal(rush, /var BOSS_RUSH_ROSTERS = \{/, '{', 'BOSS_RUSH_ROSTERS') || {}
out.bosses.rush = {}
out.counts.rush = {}
Object.keys(rosters).forEach((t) => {
  out.counts.rush[t] = rosters[t].length
  rosters[t].forEach((id) => {
    if (out.bosses.rush[id] !== undefined) problems.push('BOSS_RUSH_ROSTERS: ' + id + ' is in two rosters')
    out.bosses.rush[id] = Number(t)
  })
})
out.bosses.rushCreditsAs = literal(rush, /var BOSS_PHASE_ALIASES = \{/, '{', 'BOSS_PHASE_ALIASES') || {}

out.bosses.witchInk = asSet(Object.keys(literal(S + 'origins/witch_of_ink_progression.js', /var DIMENSIONAL_BOSSES = \{/, '{', 'DIMENSIONAL_BOSSES') || {}))
out.bosses.relicDrop = literal(S + 'relic_boss_drops.js', /var RELIC_DROPS = \{/, '{', 'RELIC_DROPS') || {}
out.bosses.abyssBoss = asSet(Object.keys(literal(S + 'scaling/dimension_mechanics.js', /var ABYSS_BOSSES = \{/, '{', 'ABYSS_BOSSES') || {}))
out.bosses.vorpalArcaneBlock = asSet(Object.keys(literal('startup_scripts/enchants/icraft_magic_enchants.js', /var VORPAL_BOSS_BLOCKLIST = \{/, '{', 'VORPAL_BOSS_BLOCKLIST') || {}))
out.bosses.vorpalMeleeBlock = asSet(Object.keys(literal('startup_scripts/enchants/vorpal_rework.js', /var VORPAL_BOSS_BLOCKLIST = \{/, '{', 'VORPAL_BOSS_BLOCKLIST') || {}))

// the five copies of the excluded spellcasters (one column each: they are five lists)
const casters = [
  ['casterAffixOverworld', S + 'affix_overworld_strip.js', /const AFFIX_STRIP_BROKEN_ENTITIES = new Set\(\[/, '['],
  ['casterAffixSkyshatter', S + 'affix_skyshatter_mob_strip.js', /const SKYSHATTER_STRIP_BROKEN_ENTITIES = new Set\(\[/, '['],
  ['casterMobEquipment', S + 'scaling/mob_equipment.js', /const MOB_EQUIP_BROKEN_ENTITIES = new Set\(\[/, '['],
  ['casterMobTier', S + 'scaling/mob_scaling_unified.js', /const BROKEN_ENTITIES = new Set\(\[/, '['],
  ['casterAscension', S + 'scaling/zz_ascension_scaling.js', /const ASC_BROKEN_ISS = \{/, '{']
]
casters.forEach((c) => {
  const v = literal(c[1], c[2], c[3], c[0])
  out.bosses[c[0]] = asSet(Array.isArray(v) ? v : Object.keys(v || {}))
})

// arenas: keyed by arena key (the old table has no entity id), in table order
const arenas = literal(S + 'bonfire/boss_arena_registry.js', /global\.ICRAFT_BOSS_ARENAS = \{/, '{', 'ICRAFT_BOSS_ARENAS')
if (arenas) { out.arenas = arenas; out.arenaOrder = Object.keys(arenas) }

// ---- dimensions ---------------------------------------------------------------
const gate = read(S + 'gates/astages_restrictions.js')
out.dimensions.stageGate = {}
out.counts.stageGateOrder = []
if (gate !== null) {
  const re = /stageDimension\(\s*'(tier_\d)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g
  let m
  const code = scan(gate).noComments
  while ((m = re.exec(code)) !== null) {
    out.dimensions.stageGate[m[2]] = { stage: m[1], restriction: m[3] }
    out.counts.stageGateOrder.push(m[2])
  }
  if (out.counts.stageGateOrder.length === 0) problems.push('astages_restrictions.js: no stageDimension(...) call with literal arguments')
}
out.dimensions.exploration = literal(kills, /const EXPLORE_DIMENSIONS = \{/, '{', 'EXPLORE_DIMENSIONS') || {}
out.dimensions.mobEquipment = literal(S + 'scaling/mob_equipment.js', /const CONFIGS = \{/, '{', 'CONFIGS') || {}
out.dimensions.deathPenalty = literal(S + 'death_penalty.js', /const DIMENSION_DURABILITY_LOSS = \{/, '{', 'DIMENSION_DURABILITY_LOSS') || {}
out.dimensions.classPassives = literal(S + 'origins/class_passives.js', /var DIMENSION_TIER = \{/, '{', 'DIMENSION_TIER') || {}

}
// The source with every comment blanked (`noComments`: same length, line breaks
// kept) and, in `code`, the inside of every string, template and regex literal
// blanked as well. A real scanner, not a pair of regular expressions: the loot
// scripts are full of regex literals such as /.*chests\/.*/, in which a regex
// for block comments sees a comment start and swallows the file up to the next
// "*/" (the first version of this tool lost ten of 75 calls that way, on both
// sides of the comparison alike).
// A slash starts a regex literal when what stands before it cannot end an operand.
function scan(src) {
  const noComments = src.split('')
  const code = src.split('')
  const blank = (arr, a, b) => { for (let k = a; k < b; k++) if (arr[k] !== '\n' && arr[k] !== '\r') arr[k] = ' ' }
  const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^'
  const REGEX_AFTER_WORD = { 'return': 1, 'typeof': 1, 'case': 1, 'in': 1, 'of': 1, 'delete': 1, 'void': 1, 'throw': 1, 'new': 1, 'else': 1, 'do': 1 }
  const WORD = /[A-Za-z0-9_$]/
  let i = 0
  let prev = ''
  let prevWord = ''
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i)
      if (j < 0) j = src.length
      blank(noComments, i, j); blank(code, i, j)
      i = j
      continue
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j < 0 ? src.length : j + 2
      blank(noComments, i, j); blank(code, i, j)
      i = j
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++ }
      j = Math.min(j + 1, src.length)
      blank(code, i + 1, j - 1)
      i = j
      prev = c
      prevWord = ''
      continue
    }
    if (c === '/' && (prev === '' || REGEX_AFTER.indexOf(prev) >= 0 || REGEX_AFTER_WORD[prevWord] === 1)) {
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      j = Math.min(j + 1, src.length)
      while (j < src.length && /[a-z]/.test(src[j])) j++
      blank(code, i + 1, j - 1)
      i = j
      prev = ')'            // after a regex literal a slash is a division
      prevWord = ''
      continue
    }
    if (WORD.test(c)) {
      let j = i
      while (j < src.length && WORD.test(src[j])) j++
      prevWord = src.substring(i, j)
      prev = src[j - 1]
      i = j
      continue
    }
    if (!/\s/.test(c)) { prev = c; prevWord = '' }
    i++
  }
  return { noComments: noComments.join(''), code: code.join('') }
}
if (!lootOnly) lists()

// every .anyDimension(...) call of a server script: file, the call's ordinal in
// the file, and the ids in order when its arguments are all string literals
// (otherwise the argument text, comments and line breaks removed)
function walk(dir, rel, found) {
  let names = []
  try { names = fs.readdirSync(dir).sort() } catch (e) { problems.push(rel + ': not readable'); return }
  names.forEach((name) => {
    const full = path.join(dir, name)
    const r = rel === '' ? name : rel + '/' + name
    if (fs.statSync(full).isDirectory()) walk(full, r, found)
    else if (name.endsWith('.js')) found.push(r)
  })
}
const serverFiles = []
walk(path.join(tree, 'kubejs', 'server_scripts'), '', serverFiles)
let rawMentions = 0
serverFiles.forEach((f) => {
  const src = fs.readFileSync(path.join(tree, 'kubejs', 'server_scripts', f), 'utf8')
  if (src.indexOf('.anyDimension(') < 0) return
  rawMentions += src.split('.anyDimension(').length - 1
  const s = scan(src)
  const needle = '.anyDimension('
  let at = s.code.indexOf(needle)
  let n = 0
  while (at >= 0) {
    n++
    const text = literalAt(s.noComments, at + needle.length - 1, '(')
    let ids = null
    if (text !== null && /^\(\s*(['"][^'"]+['"]\s*,?\s*)+\)$/.test(text)) {
      try { ids = vm.runInNewContext('[' + text.slice(1, -1) + ']', {}) } catch (e) { ids = null }
    }
    if (text === null) problems.push(f + ': .anyDimension( call ' + n + ' could not be cut out')
    out.loot.push({ file: f, call: n, ids: ids, text: ids === null ? (text || '').replace(/\s+/g, ' ') : undefined })
    at = s.code.indexOf(needle, at + needle.length)
  }
})
// every textual mention, comments included: the calls found above can only be fewer
out.counts.anyDimensionMentions = rawMentions

out.problems = problems
process.stdout.write(JSON.stringify(out, null, 1) + '\n')
process.exit(problems.length ? 1 : 0)
