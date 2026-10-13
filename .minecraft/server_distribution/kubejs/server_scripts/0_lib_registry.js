// =============================================================================
// icraft.bosses / icraft.dims -- the pack's boss roster and dimension tiers,
// read from ONE data file each
// File: kubejs/server_scripts/0_lib_registry.js   (0_ prefix: loads before consumers)
// Data: kubejs/config/icraft/registry/bosses.json, dimensions.json
// =============================================================================
// Until 2026-10-13 the boss roster was copied by hand into ten script files that
// disagreed, and dimension -> tier into five. A boss added to four of them and
// forgotten in four (mowziesmobs:frostmaw) failed without a word. Each fact now
// has one home, the two JSON files; this file is the only reader, and a script
// asks it instead of keeping a list.
//
// Exported through global.icraft (so `icraft.bosses` in every script type: the
// map `global` is shared, see 00_icraft_guard.js; startup-script HANDLERS may
// ask at run time, a startup script that is still LOADING runs before this file):
//
//   icraft.bosses.is(id)              -> true | false   core.isBoss: the flag `boss`
//   icraft.bosses.has(id, system)     -> true | false   is this id part of that system
//   icraft.bosses.get(id, system)     -> the value that system gets, or null
//                                        (hp: number, rush: the roster tier, phase: the
//                                        boss a kill is credited to, relic / arena: a
//                                        fresh copy of the record, a flag system: true)
//   icraft.bosses.tier(id)            -> 1..4, 0 when the id has no entry or no tier
//   icraft.bosses.hp(id)              -> designed health, or null
//   icraft.bosses.kind(id)            -> 'named' | 'miniboss' | 'unlisted' | ''
//   icraft.bosses.byTier(n, system?)  -> [ids] of that tier, in file order
//   icraft.bosses.ids(system?)        -> [ids] in file order
//   icraft.bosses.enabled(name)       -> a switch of bosses.json ("switches")
//   icraft.bosses.arenas()            -> { arenaKey: record } in file order, a fresh copy
//   icraft.bosses.canon(id)           -> the id of the boss this entity id IS (itself,
//                                        unless the registry says `sameAs`)
//   icraft.bosses.entityIds(id)       -> [the boss's id, then every id that is `sameAs` it]:
//                                        the entity types a rule for that boss has to cover
//
// ONE BOSS, TWO ENTITY IDS (`sameAs`). The game can hand a script a boss under an
// id that is not its roster id: Progressive Bosses cancels the join of every
// minecraft:wither and adds its own progressivebosses:wither, so "the Wither" a
// player fights is never minecraft:wither (measured 2026-10-13). An entry
//     "progressivebosses:wither": { "sameAs": "minecraft:wither" }
// says so, and nothing else: it has no flags, tier or kind of its own.
//   * Every question asked WITH an id (is, has, get, tier, hp, kind) is answered
//     from the boss it is: a script that asks with the id of the entity in front
//     of it needs no change.
//   * Every LIST (ids, byTier, arenas) holds bosses, never a second id of one: a
//     roster keeps its size (the boss-rush percentages are ruled on those sizes).
//   * A script that keeps a table built from ids(), or saves something under a
//     boss id (a first-kill flag, a rush credit), keys it on canon(id). That is
//     how one boss is never paid twice.
//   * A rule registered per entity TYPE (a LootJS entity modifier) is registered
//     for entityIds(id): global.icraftEntityMod does it.
//
//   icraft.dims.tier(id)              -> 1..4, 0 when the dimension has no entry
//   icraft.dims.has(id, system)       -> true | false
//   icraft.dims.get(id, system)       -> the value that system gets, or null
//   icraft.dims.inTier(n, system?)    -> [ids] of that tier, in file order
//   icraft.dims.inTiers([n, m], system?) -> the same for several tiers, joined
//   icraft.dims.ids(system?)          -> [ids] in file order
//
//   icraft.registry.ok() / .problems() / .line() / .systems('bosses' | 'dims')
//
// SYSTEMS (the same table as dev/rosters/rosters.py; suite `registry` of
// dev/engine-tests holds the two to each other, id by id):
//   bosses  isBoss, tierHpExcluded (flag boss) . hp . x3 . x3DamageSkip . perKill .
//           tokensNamed, tokensMiniboss (kind + tier) . rush . phase (phaseOf) .
//           relic . arena . witchInk . abyssBoss . vorpalMelee . vorpalArcane . caster
//   dims    stageGate . exploration . mobEquipment . deathPenalty .
//           classPassives, loot (flag: the value is the dimension's tier)
//
// RULES OF THIS READER
//   * An id is normalised here: String(id). A raw Java string from entity.type
//     works (on this engine `new Set([..]).has(javaString)` is false: that is how
//     per-kill boss scaling never ran).
//   * A registry that could not be read is LOUD and never an empty roster: one
//     ERROR line when this file loads, and every call above THROWS. "Nobody is a
//     boss" must not be the answer to a missing file.
//   * A system name that does not exist throws too (a typo must not read as
//     "no boss is in that system").
//   * The files are checked when they load (kinds, tiers, flag names, key
//     names: a misspelt key would silently drop a boss from a system). A file
//     with a problem is refused whole. Ids are checked against the game's real
//     registries before a push: python .minecraft/dev/rosters/validate.py.
//   * Values come out as plain JavaScript (the text is parsed here with
//     JSON.parse; nothing is a Java Map, List or String).
// =============================================================================

;(function () {
  global.icraft = global.icraft || {}

  var DIR = 'kubejs/config/icraft/registry/'
  var SCHEMA = 1
  // (an id such as 'toString' or 'constructor' must not read as an entry: only own keys count)
  var hasOwn = Object.prototype.hasOwnProperty // CI-ignore: a function reference on purpose, called through .call below
  var own = function (obj, key) { return hasOwn.call(obj, key) }
  var isObject = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }
  var isTier = function (v) { return v === 1 || v === 2 || v === 3 || v === 4 }
  var copy = function (v) { return (v !== null && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v }

  // ---- what a system gets from an entry (null = the entry is not in it) -------
  var flag = function (name) {
    return function (e) { return (e.flags && e.flags.indexOf(name) >= 0) ? true : null }
  }
  var value = function (key) {
    return function (e) { return (e[key] === undefined || e[key] === null) ? null : e[key] }
  }
  var kindTier = function (kind) {
    return function (e) { return (e.kind === kind && e.tier !== undefined) ? e.tier : null }
  }
  var tierIf = function (name) {
    return function (e) { return (e.flags && e.flags.indexOf(name) >= 0) ? e.tier : null }
  }
  var BOSS_SYSTEMS = {
    isBoss: flag('boss'),
    tierHpExcluded: flag('boss'),
    hp: value('hp'),
    x3: flag('x3'),
    x3DamageSkip: flag('x3DamageSkip'),
    perKill: flag('perKill'),
    tokensNamed: kindTier('named'),
    tokensMiniboss: kindTier('miniboss'),
    rush: value('rush'),
    phase: value('phaseOf'),
    relic: value('relic'),
    arena: value('arena'),
    witchInk: flag('witchInk'),
    abyssBoss: flag('abyssBoss'),
    vorpalMelee: flag('vorpalMelee'),
    vorpalArcane: flag('vorpalArcane'),
    caster: flag('caster')
  }
  var DIM_SYSTEMS = {
    stageGate: value('stageGate'),
    exploration: value('exploration'),
    mobEquipment: value('mobEquipment'),
    deathPenalty: value('deathPenalty'),
    classPassives: tierIf('classPassives'),
    loot: tierIf('loot')
  }

  var BOSS_KINDS = ['named', 'miniboss', 'unlisted']
  var BOSS_FLAGS = ['boss', 'x3', 'x3DamageSkip', 'perKill', 'witchInk', 'abyssBoss', 'vorpalMelee', 'vorpalArcane', 'caster']
  var BOSS_KEYS = ['tier', 'kind', 'hp', 'flags', 'rush', 'phaseOf', 'relic', 'arena', 'absent', 'note']
  var ALIAS_KEYS = ['sameAs', 'note']       // an entry with `sameAs` is a second id of another entry and nothing else
  var BOSS_SWITCHES = ['perKill']
  var DIM_FLAGS = ['loot', 'classPassives']
  var DIM_KEYS = ['tier', 'flags', 'stageGate', 'exploration', 'deathPenalty', 'mobEquipment', 'note']

  // ---- reading one file -------------------------------------------------------
  // -> { doc: object | null, problem: '' | why }
  var readDoc = function (file, listKey) {
    var text = null
    var doc = null
    try {
      // JsonIO.readString: the file parsed by the game's own JSON reader and
      // printed again as text; a file that does not exist comes back as null.
      text = JsonIO.readString(DIR + file)
    } catch (e) {
      return { doc: null, problem: 'could not be read (' + e + ')' }
    }
    if (text === null || text === undefined) return { doc: null, problem: 'does not exist (' + DIR + file + ')' }
    text = String(text)
    if (text === '' || text === 'null') return { doc: null, problem: 'does not exist or is empty (' + DIR + file + ')' }
    try {
      doc = JSON.parse(text)
    } catch (e2) {
      return { doc: null, problem: 'is not JSON (' + e2 + ')' }
    }
    if (!isObject(doc)) return { doc: null, problem: 'is not a JSON object' }
    if (doc.schema !== SCHEMA) return { doc: null, problem: 'has schema ' + doc.schema + ', this reader knows ' + SCHEMA }
    if (!isObject(doc[listKey])) return { doc: null, problem: 'has no "' + listKey + '" object' }
    return { doc: doc, problem: '' }
  }

  // every key of an entry is a known one (a misspelt key would drop the entry
  // from a system without a word), every flag is a known one and written once
  var checkKeysAndFlags = function (id, e, keys, flags, bad) {
    var k = ''
    var i = 0
    var seen = {}
    if (!isObject(e)) { bad.push(id + ': not an object'); return false }
    for (k in e) {
      if (keys.indexOf(k) < 0) bad.push(id + ': unknown key "' + k + '"')
    }
    if (e.flags !== undefined) {
      if (!Array.isArray(e.flags)) { bad.push(id + ': flags is not a list'); return false }
      for (i = 0; i < e.flags.length; i++) {
        if (flags.indexOf(e.flags[i]) < 0) bad.push(id + ': unknown flag "' + e.flags[i] + '"')
        if (seen[e.flags[i]] === true) bad.push(id + ': flag "' + e.flags[i] + '" twice')
        seen[e.flags[i]] = true
      }
    }
    return true
  }

  var checkBosses = function (doc) {
    var bad = []
    var id = ''
    var e = null
    var keys = {}
    var s = ''
    for (id in doc.bosses) {
      e = doc.bosses[id]
      if (isObject(e) && e.sameAs !== undefined) {
        // a second id of another entry: it names a real entry (not itself, not another
        // second id, not an `absent` one) and carries nothing of its own
        checkKeysAndFlags(id, e, ALIAS_KEYS, [], bad)
        if (!(typeof e.sameAs === 'string' && e.sameAs !== id && own(doc.bosses, e.sameAs))) bad.push(id + ': sameAs names no other entry')
        else if (!isObject(doc.bosses[e.sameAs]) || doc.bosses[e.sameAs].sameAs !== undefined) bad.push(id + ': sameAs names an entry that is itself a second id')
        else if (doc.bosses[e.sameAs].absent !== undefined) bad.push(id + ': sameAs names an entry marked absent')
        continue
      }
      if (!checkKeysAndFlags(id, e, BOSS_KEYS, BOSS_FLAGS, bad)) continue
      if (BOSS_KINDS.indexOf(e.kind) < 0) bad.push(id + ': kind "' + e.kind + '" is none of ' + BOSS_KINDS.join(' / '))
      if (e.tier === undefined) {
        if (typeof e.absent !== 'string' || e.absent === '') bad.push(id + ': no tier (only an entry with `absent` may have none)')
        if (e.kind !== 'unlisted') bad.push(id + ': kind ' + e.kind + ' needs a tier')
      } else if (!isTier(e.tier)) bad.push(id + ': tier ' + e.tier + ' is not 1-4')
      if (e.hp !== undefined && !(typeof e.hp === 'number' && e.hp > 0)) bad.push(id + ': hp is not a positive number')
      if (e.rush !== undefined && !(e.rush === 1 || e.rush === 2 || e.rush === 3)) bad.push(id + ': rush ' + e.rush + ' is not a roster (1-3)')
      if (e.phaseOf !== undefined && !(typeof e.phaseOf === 'string' && own(doc.bosses, e.phaseOf) &&
          isObject(doc.bosses[e.phaseOf]) && doc.bosses[e.phaseOf].sameAs === undefined)) bad.push(id + ': phaseOf names no entry (or a second id: name the boss)')
      if (e.relic !== undefined && !(isObject(e.relic) && typeof e.relic.item === 'string' &&
          typeof e.relic.chance === 'number' && typeof e.relic.looting === 'number')) bad.push(id + ': relic needs item, chance, looting')
      if (e.arena !== undefined) {
        if (!(isObject(e.arena) && typeof e.arena.key === 'string' && e.arena.key !== '' && typeof e.arena.display === 'string' &&
            isTier(e.arena.tier))) bad.push(id + ': arena needs key, display and a tier 1-4')
        else if (keys[e.arena.key] === true) bad.push(id + ': arena key "' + e.arena.key + '" is used twice')
        else keys[e.arena.key] = true
      }
    }
    if (doc.switches !== undefined && !isObject(doc.switches)) bad.push('"switches" is not an object')
    for (s in (isObject(doc.switches) ? doc.switches : {})) {
      if (BOSS_SWITCHES.indexOf(s) < 0) bad.push('unknown switch "' + s + '"')
      else if (!isObject(doc.switches[s]) || typeof doc.switches[s].on !== 'boolean') bad.push('switch ' + s + ' needs "on": true | false')
    }
    return bad
  }

  var checkDims = function (doc) {
    var bad = []
    var id = ''
    var e = null
    for (id in doc.dimensions) {
      e = doc.dimensions[id]
      if (!checkKeysAndFlags(id, e, DIM_KEYS, DIM_FLAGS, bad)) continue
      if (!isTier(e.tier)) bad.push(id + ': tier ' + e.tier + ' is not 1-4')
      if (e.stageGate !== undefined && !(typeof e.stageGate === 'string' && e.stageGate !== '')) bad.push(id + ': stageGate is not a restriction id')
      if (e.exploration !== undefined && !(typeof e.exploration === 'string' && e.exploration !== '')) bad.push(id + ': exploration is not a key')
      if (e.deathPenalty !== undefined && !(typeof e.deathPenalty === 'number' && e.deathPenalty >= 0 && e.deathPenalty <= 1)) bad.push(id + ': deathPenalty is not a share 0-1')
      if (e.mobEquipment !== undefined && !(isObject(e.mobEquipment) && typeof e.mobEquipment.chance === 'number')) bad.push(id + ': mobEquipment needs a chance')
    }
    return bad
  }

  // system -> { id: value } and system -> [ids], both in file order
  var buildIndex = function (entries, systems) {
    var index = {}
    var order = {}
    var s = ''
    var id = ''
    var v = null
    for (s in systems) { index[s] = {}; order[s] = [] }
    for (id in entries) {
      for (s in systems) {
        v = systems[s](entries[id])
        if (v !== null) { index[s][id] = v; order[s].push(id) }
      }
    }
    return { index: index, order: order }
  }

  var summary = function (problems) {
    var shown = problems.slice(0, 6).join('; ')
    return problems.length + ' problem(s): ' + shown + (problems.length > 6 ? '; ...' : '')
  }

  // ---- load both files --------------------------------------------------------
  var bossEntries = {}      // the bosses: every entry that is not a second id
  var bossIds = []
  var bossIx = null
  var bossAlias = {}        // second id -> the id of the boss it is (`sameAs`)
  var bossAliasOf = {}      // boss id -> [its second ids], in file order
  var bossAliasCount = 0
  var bossSwitches = {}
  var bossProblem = ''
  var dimEntries = {}
  var dimIds = []
  var dimIx = null
  var dimProblem = ''
  var problems = []
  var bootLine = ''

  ;(function () {
    var r = readDoc('bosses.json', 'bosses')
    var bad = []
    var id = ''
    var target = ''
    if (r.problem !== '') bossProblem = r.problem
    else {
      bad = checkBosses(r.doc)
      if (bad.length > 0) bossProblem = summary(bad)
      else {
        for (id in r.doc.bosses) {
          if (r.doc.bosses[id].sameAs === undefined) { bossEntries[id] = r.doc.bosses[id]; continue }
          target = r.doc.bosses[id].sameAs
          bossAlias[id] = target
          if (!own(bossAliasOf, target)) bossAliasOf[target] = []
          bossAliasOf[target].push(id)
          bossAliasCount++
        }
        bossIds = Object.keys(bossEntries)
        bossIx = buildIndex(bossEntries, BOSS_SYSTEMS)
        bossSwitches = isObject(r.doc.switches) ? r.doc.switches : {}
      }
    }
    r = readDoc('dimensions.json', 'dimensions')
    if (r.problem !== '') dimProblem = r.problem
    else {
      bad = checkDims(r.doc)
      if (bad.length > 0) dimProblem = summary(bad)
      else {
        dimEntries = r.doc.dimensions
        dimIds = Object.keys(dimEntries)
        dimIx = buildIndex(dimEntries, DIM_SYSTEMS)
      }
    }
  })()

  var needBosses = function () {
    if (bossProblem !== '') {
      throw new Error('[icraft.registry] bosses.json is not loaded (' + bossProblem + '): this is an error, not an empty boss roster')
    }
  }
  var needDims = function () {
    if (dimProblem !== '') {
      throw new Error('[icraft.registry] dimensions.json is not loaded (' + dimProblem + '): this is an error, not an empty dimension list')
    }
  }
  var systemName = function (systems, system, what) {
    var s = String(system)
    if (!own(systems, s)) {
      throw new Error('[icraft.registry] "' + s + '" is not a ' + what + ' system (' + Object.keys(systems).join(', ') + ')')
    }
    return s
  }
  // [ids] of one tier in file order, optionally only those in a system
  var ofTier = function (ids, entries, ix, systems, what, tier, system) {
    var t = Number(tier)
    var s = (system === undefined || system === null) ? null : systemName(systems, system, what)
    var out = []
    var i = 0
    for (i = 0; i < ids.length; i++) {
      if (entries[ids[i]].tier !== t) continue
      if (s !== null && !own(ix.index[s], ids[i])) continue
      out.push(ids[i])
    }
    return out
  }

  // the id of the boss an entity id is: itself, unless the registry says `sameAs`
  var canonId = function (id) {
    var key = String(id)
    return own(bossAlias, key) ? bossAlias[key] : key
  }

  // ---- icraft.bosses ----------------------------------------------------------
  var bosses = {
    is: function (id) {
      needBosses()
      return own(bossIx.index['isBoss'], canonId(id))
    },
    has: function (id, system) {
      needBosses()
      return own(bossIx.index[systemName(BOSS_SYSTEMS, system, 'boss')], canonId(id))
    },
    get: function (id, system) {
      needBosses()
      var s = systemName(BOSS_SYSTEMS, system, 'boss')
      var key = canonId(id)
      return own(bossIx.index[s], key) ? copy(bossIx.index[s][key]) : null
    },
    tier: function (id) {
      needBosses()
      var key = canonId(id)
      return (own(bossEntries, key) && bossEntries[key].tier !== undefined) ? bossEntries[key].tier : 0
    },
    hp: function (id) {
      needBosses()
      var key = canonId(id)
      return own(bossIx.index.hp, key) ? bossIx.index.hp[key] : null
    },
    kind: function (id) {
      needBosses()
      var key = canonId(id)
      return own(bossEntries, key) ? bossEntries[key].kind : ''
    },
    canon: function (id) {
      needBosses()
      return canonId(id)
    },
    // [the boss's own id, then its second ids]; an id with no entry comes back alone
    entityIds: function (id) {
      needBosses()
      var key = canonId(id)
      return own(bossAliasOf, key) ? [key].concat(bossAliasOf[key]) : [key]
    },
    byTier: function (tier, system) {
      needBosses()
      return ofTier(bossIds, bossEntries, bossIx, BOSS_SYSTEMS, 'boss', tier, system)
    },
    ids: function (system) {
      needBosses()
      if (system === undefined || system === null) return bossIds.slice()
      return bossIx.order[systemName(BOSS_SYSTEMS, system, 'boss')].slice()
    },
    enabled: function (name) {
      needBosses()
      var s = String(name)
      if (BOSS_SWITCHES.indexOf(s) < 0) throw new Error('[icraft.registry] "' + s + '" is not a switch (' + BOSS_SWITCHES.join(', ') + ')')
      return own(bossSwitches, s) && bossSwitches[s].on === true
    },
    // { arenaKey: record } as bonfire/boss_arena_registry.js publishes it: the
    // entry's `arena` without its `key`, in file order, a fresh copy on each call
    arenas: function () {
      needBosses()
      var out = {}
      var ids = bossIx.order.arena
      var i = 0
      var rec = null
      var key = ''
      for (i = 0; i < ids.length; i++) {
        rec = copy(bossIx.index.arena[ids[i]])
        key = rec.key
        delete rec.key
        out[key] = rec
      }
      return out
    }
  }

  // ---- icraft.dims ------------------------------------------------------------
  var dims = {
    tier: function (id) {
      needDims()
      var key = String(id)
      return own(dimEntries, key) ? dimEntries[key].tier : 0
    },
    has: function (id, system) {
      needDims()
      return own(dimIx.index[systemName(DIM_SYSTEMS, system, 'dimension')], String(id))
    },
    get: function (id, system) {
      needDims()
      var s = systemName(DIM_SYSTEMS, system, 'dimension')
      var key = String(id)
      return own(dimIx.index[s], key) ? copy(dimIx.index[s][key]) : null
    },
    inTier: function (tier, system) {
      needDims()
      return ofTier(dimIds, dimEntries, dimIx, DIM_SYSTEMS, 'dimension', tier, system)
    },
    inTiers: function (tiers, system) {
      needDims()
      var out = []
      var i = 0
      for (i = 0; i < tiers.length; i++) out = out.concat(ofTier(dimIds, dimEntries, dimIx, DIM_SYSTEMS, 'dimension', tiers[i], system))
      return out
    },
    ids: function (system) {
      needDims()
      if (system === undefined || system === null) return dimIds.slice()
      return dimIx.order[systemName(DIM_SYSTEMS, system, 'dimension')].slice()
    }
  }

  // ---- the boot line (the same text as dev/rosters/rosters.py boot_line) ------
  ;(function () {
    var kinds = { named: 0, miniboss: 0, unlisted: 0 }
    var absent = 0
    var tiers = [0, 0, 0, 0, 0]
    var i = 0
    var n = function (system) { return bossIx.order[system].length }
    if (bossProblem !== '') problems.push('bosses.json ' + bossProblem)
    if (dimProblem !== '') problems.push('dimensions.json ' + dimProblem)
    if (problems.length > 0) {
      for (i = 0; i < problems.length; i++) {
        console.error('[icraft.registry] NOT LOADED -- ' + problems[i] + '. Every script that asks this registry now FAILS ' +
          '(loudly: a missing registry is never read as an empty roster). Fix the file under ' + DIR + ' and restart or /reload.')
      }
      return
    }
    for (i = 0; i < bossIds.length; i++) {
      kinds[bossEntries[bossIds[i]].kind]++
      if (bossEntries[bossIds[i]].absent !== undefined) absent++
    }
    for (i = 0; i < dimIds.length; i++) tiers[dimEntries[dimIds[i]].tier]++
    bootLine = '[icraft.registry] loaded -- bosses: ' + bossIds.length + ' entries (' + kinds.named + ' named, ' + kinds.miniboss +
      ' miniboss, ' + kinds.unlisted + ' unlisted; ' + n('isBoss') + ' boss, ' + n('hp') + ' designed hp, ' + n('x3') + ' x3, ' +
      n('rush') + ' rush, ' + n('arena') + ' arenas, ' + absent + ' absent, ' + bossAliasCount + ' second id' + (bossAliasCount === 1 ? '' : 's') + '; per-kill scaling ' +
      ((own(bossSwitches, 'perKill') && bossSwitches.perKill.on === true) ? 'ON' : 'off') + '), dimensions: ' + dimIds.length +
      ' entries (tier 1-4: ' + tiers[1] + ' / ' + tiers[2] + ' / ' + tiers[3] + ' / ' + tiers[4] + ')'
    console.log(bootLine)
  })()

  global.icraft.bosses = bosses
  global.icraft.dims = dims
  global.icraft.registry = {
    ok: function () { return problems.length === 0 },
    problems: function () { return problems.slice() },
    line: function () { return bootLine },
    systems: function (which) { return Object.keys(String(which) === 'dims' ? DIM_SYSTEMS : BOSS_SYSTEMS) }
  }
})()
