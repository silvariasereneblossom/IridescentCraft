// =============================================================================
// icraft.aptitude -- the ONE resolver for "what are this player's aptitude levels"
// (and the one place that knows how the pack's XP wallet really works)
// File: kubejs/server_scripts/0_lib_aptitudes.js   (0_ prefix: loads before consumers)
// =============================================================================
// API (exported through `global`, never through top-level names):
//
//   global.icraft.aptitude.get(player, name)   -> level (integer); 0 = not readable
//   global.icraft.aptitude.all(player)         -> { strength, constitution, dexterity, defense,
//                                                   intelligence, building, magic, luck, total }
//                                                 (frozen, shared: read-only) or null = not readable
//   global.icraft.aptitude.invalidate(player)  -> forget the cached answer
//   global.icraft.aptitude.names               -> the 8 aptitude names
//
//   name : 'strength' | 'constitution' | 'dexterity' | 'defense' | 'intelligence' |
//          'building' | 'magic' | 'luck'   (or str/con/dex/def/int/bld/mag/lck)
//
//   global.icraft.aptitude.xp.levels(player)          -> XP wallet in levels (level + progress), or null
//   global.icraft.aptitude.xp.rawPerLevel(player)     -> raw XP points one level is worth (75 here), 0 = unknown
//   global.icraft.aptitude.xp.give(player, levels)    -> add (fractional) levels; returns levels added
//   global.icraft.aptitude.xp.take(player, levels)    -> remove up to that many; returns levels removed
//   global.icraft.aptitude.xp.takePoints(player, raw) -> remove raw XP points; returns points removed
//   global.icraft.aptitude.xp.pollSpend(player)       -> whole levels the player LOST since the last
//                                                        poll, by anything except the calls above
//
// WHY THIS EXISTS
//   Every aptitude read in the pack used
//       data get entity <player> ForgeData.justlevelingfork.aptitude.<name>
//   JustLevelingFork has never written there. Levels live in its CAPABILITY
//   (AptitudeCapability.aptitudeLevel, a Map<String,Integer> defaulting to 1), attached as
//   "justlevelingfork:aptitudes" and serialised as
//       ForgeCaps."justlevelingfork:aptitudes"."aptitude.<name>" = <int>
//   so the command returned 0 for the lifetime of the pack: all the aptitude skills, the
//   mastery tax and the cost backport (deleted 2026-10-11) never did anything. (And each "read" was 8 commands,
//   every one of them serialising the whole player.)
//
// HOW IT READS
//   1. Direct (preferred): AptitudeCapability.get(player).getAptitudeLevel(name)
//      -- public static get(Player) + public int getAptitudeLevel(String), javap-checked
//      against justlevelingfork-1.2.1-iridescent.1.jar. No NBT, no command, microseconds.
//   2. Fallback, only if the class cannot be loaded or the direct read keeps failing:
//      player.nbt.ForgeCaps."justlevelingfork:aptitudes" -- the same proven route
//      0_lib_origins.js uses, ONE whole-player serialisation per player per 100 ticks.
//   Either way: one read per player per TTL (20 ticks direct / 100 ticks NBT, counted on the
//   server tick counter), everything in between is a map lookup. Refreshed on login, dropped
//   on logout and on respawn.
//   The fork posts no event when a level is bought (its KubeJS bridge is stripped), so a
//   level-up is seen when the TTL runs out: within one second.
//
//   Respawn only DROPS the entry (no read): PlayerEvents.respawned fires from inside Forge's
//   PlayerEvent.Clone, and the fork copies the old capability onto the new player in its own
//   Clone listener -- which may not have run yet. A read at that moment could see the fresh
//   entity's defaults (all 1s). The next lookup, after the clone finished, reads the truth.
//
// THE XP WALLET (LinearXP, #77)
//   A player's XP is NOT vanilla `totalExperience` here. LinearXP keeps it as
//       experienceLevel (the vanilla int)  +  capability "accurated_exp" / (need(level) * 1000)
//   and rewrites the vanilla progress bar from that capability every 10 ticks. Consequences:
//     * totalExperience is a counter of raw XP earned; spends in LEVELS (aptitude level-ups)
//       and the progress-bar charges Tax Free Levels makes for anvils / enchanting never
//       move it;
//     * a spend in POINTS (`xp add <p> -N points`, or those Tax Free Levels charges) lands on
//       the vanilla progress bar, which LinearXP then overwrites: only the whole levels it
//       happened to knock off stick -- at level 1000 a 1600-point charge is usually free.
//   So spending is measured as a drop in experienceLevel, and XP is given/taken as
//   levels + a capability fraction. One level = rawPerLevel raw XP points (75, STATIC mode).
//   Without LinearXP the calls fall back to plain vanilla levels/points.
//
// CONTRACT
//   * never throws into the caller (0 / null instead)
//   * logs at most once per failure site per script load
//   * off the server thread (PlayerEvents.chat runs on a worker): cached answer only
//   * returned numbers are finite, non-negative JS numbers
//
// Rhino notes: boxed Java numbers (Map.get -> Integer) are objects here, not JS numbers, so
// everything read from Java is Number()-coerced; `var` in a block is block-scoped.
// =============================================================================

;(function () {
  var NAMES = ['strength', 'constitution', 'dexterity', 'defense', 'intelligence', 'building', 'magic', 'luck']
  var ALIASES = {
    str: 'strength', con: 'constitution', dex: 'dexterity', def: 'defense',
    'int': 'intelligence', bld: 'building', mag: 'magic', lck: 'luck'
  }
  var CAP_ID = 'justlevelingfork:aptitudes'
  var TTL_DIRECT = 20          // direct capability read: cheap, so level-ups show within a second
  var TTL_NBT = 100            // NBT fallback: serialises the whole player, keep it rare
  var MAX_ENTRIES = 512        // safety valve; real population = online players
  var DIRECT_FAILS_ALLOWED = 3 // consecutive failures before the direct path is abandoned

  var warned = {}
  var warnOnce = function (site, message) {
    if (warned[site]) return
    warned[site] = true
    try { console.warn('[icraft.aptitude] ' + message + ' (logged once per script load)') } catch (ignored) {}
  }

  // ── the fork's capability class ───────────────────────────────────────────
  var CapClass = null
  try {
    CapClass = Java.loadClass('com.seniors.justlevelingfork.common.capability.AptitudeCapability')
  } catch (e) {
    CapClass = null
  }
  var direct = !!CapClass
  var directFails = 0
  if (!direct) {
    warnOnce('load', 'AptitudeCapability could not be loaded -- reading aptitudes from player NBT instead, once per ' + TTL_NBT + ' ticks')
  }

  // getter(name) -> raw level; result: frozen { <8 names>, total }
  var build = function (levelOf) {
    var out = {}
    var total = 0
    for (var i = 0; i < NAMES.length; i++) {
      var n = Number(levelOf(NAMES[i]))
      if (!(n >= 0) || n === Infinity) n = 0     // NaN / negative / infinite
      n = Math.floor(n)
      out[NAMES[i]] = n
      total += n
    }
    out.total = total
    return Object.freeze(out)
  }

  // -> levels, or null when the player carries no aptitude capability (FakePlayer)
  var readDirect = function (player) {
    var cap = CapClass.get(player)
    if (!cap) return null
    return build(function (name) { return cap.getAptitudeLevel(name) })
  }

  // The route 0_lib_origins.js runs in production, pointed at the aptitude capability.
  var readNbt = function (player) {
    var nbt = player.nbt
    if (!nbt) return null
    var fc = nbt.ForgeCaps
    if (!fc) return null
    var c = fc.get ? fc.get(CAP_ID) : null
    if (!c || !c.getInt) return null
    return build(function (name) { return c.getInt('aptitude.' + name) })
  }

  var read = function (player) {
    if (direct) {
      try {
        var v = readDirect(player)
        directFails = 0
        return v
      } catch (e) {
        directFails++
        if (directFails >= DIRECT_FAILS_ALLOWED) {
          direct = false
          warnOnce('direct', 'direct capability read failed ' + directFails + ' times in a row (' + e +
            ') -- switching to one NBT read per player per ' + TTL_NBT + ' ticks')
        }
      }
    }
    return readNbt(player)
  }

  // ── cache ─────────────────────────────────────────────────────────────────
  // uuid -> { t: <server tick of the last read>, v: <levels | null> }
  var cache = {}
  var cacheSize = 0

  var keyOf = function (player) { return String(player.uuid.toString()) }
  // Cache clock = the server tick counter (the accessor the tick master runs
  // on; nothing here is persisted, so a counter that restarts with the server
  // is exactly right). NOT `level.gameTime`: KubeJS exposes Level.getGameTime()
  // as getTime() (@RemapForJS on LevelMixin), so `level.gameTime` is undefined
  // -> NaN -> a TTL test that is never true -> a fresh read on every lookup.
  // `level.time` is the spare; NaN from both = no usable clock (see resolve()).
  var clockOf = function (player) {
    var t = Number(player.server.tickCount)
    if (t !== t) t = Number(player.level.time)
    return t
  }
  var onServerThread = function (player) {
    try { return player.server.isSameThread() !== false } catch (e) { return true }
  }

  var store = function (key, t, v) {
    if (!cache.hasOwnProperty(key)) {
      if (cacheSize >= MAX_ENTRIES) { cache = {}; cacheSize = 0 }
      cacheSize++
    }
    cache[key] = { t: t, v: v }
  }

  var refresh = function (player, key, t) {
    var prev = cache.hasOwnProperty(key) ? cache[key] : null
    try {
      var v = read(player)
      store(key, t, v)
      return v
    } catch (e) {
      warnOnce('read', 'reading the aptitudes of ' + key + ' failed: ' + e +
        ' -- the last good answer (or "not readable") is served until a read succeeds')
      // Keep the last good answer and stamp it: a failing read is retried once
      // per TTL, not on every call.
      var keep = prev ? prev.v : null
      store(key, t, keep)
      return keep
    }
  }

  // -> levels for this player, or null when nothing can be said
  var resolve = function (player) {
    if (!player) return null
    var key, t
    try {
      key = keyOf(player)
      t = clockOf(player)
    } catch (e) {
      warnOnce('identify', 'identifying a player failed: ' + e)
      return null
    }
    var entry = cache.hasOwnProperty(key) ? cache[key] : null
    if (t !== t) {
      // No clock at all. The direct read is cheap enough to run uncached; the
      // NBT read is not, so that path keeps serving what it has.
      warnOnce('clock', 'no usable tick clock (server.tickCount and level.time are both NaN) -- direct reads run uncached, NBT answers are kept as they are')
      if (entry && !direct) return entry.v
      t = 0
    } else if (entry && t >= entry.t && (t - entry.t) < (direct ? TTL_DIRECT : TTL_NBT)) {
      // (`t >= entry.t` also covers a clock that stepped backwards: re-read)
      return entry.v
    }
    if (!onServerThread(player)) return entry ? entry.v : null
    return refresh(player, key, t)
  }

  var nameOf = function (name) {
    var n = String(name).toLowerCase()
    if (ALIASES.hasOwnProperty(n)) n = ALIASES[n]
    return NAMES.indexOf(n) >= 0 ? n : null
  }

  var all = function (player) {
    try {
      return resolve(player)
    } catch (e) {
      warnOnce('all', 'all() failed: ' + e)
      return null
    }
  }

  var get = function (player, name) {
    try {
      var n = nameOf(name)
      if (!n) return 0
      var v = resolve(player)
      return v ? v[n] : 0
    } catch (e) {
      warnOnce('get', 'get() failed: ' + e)
      return 0
    }
  }

  var invalidate = function (player) {
    try {
      var key = keyOf(player)
      if (cache.hasOwnProperty(key)) { delete cache[key]; cacheSize-- }
    } catch (e) {}
  }

  var forceRefresh = function (player) {
    try {
      if (!player) return
      refresh(player, keyOf(player), clockOf(player))
    } catch (e) {
      warnOnce('login', 'refresh on login failed: ' + e)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // XP wallet
  // ══════════════════════════════════════════════════════════════════════════
  var ExpUtils = null
  var ExpCalc = null
  var ExpDisplay = null
  try {
    ExpUtils = Java.loadClass('celia.adwadg.linearxp.Utils.ExpUtils')
    ExpCalc = Java.loadClass('celia.adwadg.linearxp.Utils.ExperienceCalculator')
  } catch (e) {
    ExpUtils = null
    ExpCalc = null
  }
  try {
    ExpDisplay = Java.loadClass('celia.adwadg.linearxp.Handler.ExpDisplayHandler')
  } catch (e) {
    ExpDisplay = null
  }
  var linear = !!(ExpUtils && ExpCalc)
  var MAX_LEVELS = 2000000000

  // LinearXP: fold a pending level-up into experienceLevel and rewrite the
  // progress bar from the capability (what its own 10-tick pass does).
  var settle = function (player) {
    if (!ExpDisplay) return
    try { ExpDisplay.updatePlayerExpBar(player) } catch (e) { warnOnce('settle', 'ExpDisplayHandler.updatePlayerExpBar failed: ' + e) }
  }

  // -> { level, acc, need }: acc / need in LinearXP's 1/1000-point units, need = one whole level here
  var linearState = function (player) {
    settle(player)
    var level = Math.floor(Number(player.xpLevel))
    if (!(level >= 0) || level > MAX_LEVELS) return null
    var need = Number(ExpCalc.calculateAccuratedExperience(level))
    var acc = Number(ExpUtils.getAccuratedExpValue(player))
    if (!(need > 0) || !(acc >= 0) || need === Infinity || acc === Infinity) return null
    if (acc >= need) acc = need - 1       // a level-up nothing has converted yet
    return { level: level, acc: acc, need: need }
  }

  // uuid -> experienceLevel at the last pollSpend()
  var lastLevel = {}
  var lastLevelSize = 0
  var dropBaseline = function (player) {
    try {
      var key = keyOf(player)
      if (lastLevel.hasOwnProperty(key)) { delete lastLevel[key]; lastLevelSize-- }
    } catch (e) {}
  }
  // After this library moved the wallet itself: not a "spend", re-sync.
  var rebase = function (player) {
    try {
      var key = keyOf(player)
      if (lastLevel.hasOwnProperty(key)) lastLevel[key] = Math.floor(Number(player.xpLevel))
    } catch (e) {}
  }

  // Move the wallet to `target` levels (>= 0). Returns the change in levels that
  // actually happened (a listener may veto the level change).
  var moveWallet = function (player, st, target) {
    var before = st.level + st.acc / st.need
    if (!(target >= 0)) target = 0
    if (target > MAX_LEVELS) target = MAX_LEVELS
    var newLevel = Math.floor(target)
    var newNeed = Number(ExpCalc.calculateAccuratedExperience(newLevel))
    var newAcc = Math.floor((target - newLevel) * newNeed)
    if (!(newAcc >= 0)) newAcc = 0
    if (newNeed > 0 && newAcc >= newNeed) newAcc = newNeed - 1
    // Always called, even with 0: ServerPlayer.giveExperienceLevels is what
    // makes the server re-send the XP bar to the client.
    player.addXPLevels(newLevel - st.level)
    var levelNow = Math.floor(Number(player.xpLevel))
    if (levelNow !== newLevel) return levelNow - st.level
    ExpUtils.addAccuratedExp(player, newAcc - Number(ExpUtils.getAccuratedExpValue(player)))
    settle(player)
    return (newLevel + (newNeed > 0 ? newAcc / newNeed : 0)) - before
  }

  var xpLevels = function (player) {
    try {
      if (!player) return null
      if (linear) {
        var st = linearState(player)
        return st ? (st.level + st.acc / st.need) : null
      }
      var lv = Math.floor(Number(player.xpLevel))
      return (lv >= 0) ? lv : null
    } catch (e) {
      warnOnce('xp.levels', 'xp.levels() failed: ' + e)
      return null
    }
  }

  var rawPerLevelAt = function (player, level) {
    var r = 0
    if (linear) {
      // MultiplyXpDouble(1, level) = what one raw point is worth, in the units
      // calculateExperience(level) prices a level in (mode-independent).
      r = Number(ExpCalc.calculateExperience(level)) / Number(ExpCalc.MultiplyXpDouble(1, level))
    } else {
      r = Number(player.xpNeededForNextLevel)
    }
    return (r > 0 && r !== Infinity) ? r : 0
  }

  var xpRawPerLevel = function (player) {
    try {
      if (!player) return 0
      var lv = Math.floor(Number(player.xpLevel))
      if (!(lv >= 0)) return 0
      return rawPerLevelAt(player, lv)
    } catch (e) {
      warnOnce('xp.rawPerLevel', 'xp.rawPerLevel() failed: ' + e)
      return 0
    }
  }

  var xpGive = function (player, levels) {
    try {
      var n = Number(levels)
      if (!player || !(n > 0) || n === Infinity) return 0
      var delta = 0
      if (linear) {
        var st = linearState(player)
        if (!st) return 0
        delta = moveWallet(player, st, st.level + st.acc / st.need + n)
      } else {
        // vanilla: whole levels, the rest as points on the vanilla curve
        var whole = Math.floor(n)
        var lvBefore = Math.floor(Number(player.xpLevel))
        if (whole > 0) player.addXPLevels(whole)
        var pts = Math.floor((n - whole) * Number(player.xpNeededForNextLevel))
        if (pts > 0) player.addXP(pts)
        delta = (Math.floor(Number(player.xpLevel)) - lvBefore) + (pts > 0 ? (n - whole) : 0)
      }
      rebase(player)
      return delta > 0 ? delta : 0
    } catch (e) {
      warnOnce('xp.give', 'xp.give() failed: ' + e)
      return 0
    }
  }

  var xpTake = function (player, levels) {
    try {
      var n = Number(levels)
      if (!player || !(n > 0) || n === Infinity) return 0
      var delta = 0
      if (linear) {
        var st = linearState(player)
        if (!st) return 0
        var have = st.level + st.acc / st.need
        delta = moveWallet(player, st, have - Math.min(n, have))
      } else {
        // vanilla: whole levels only (points go through takePoints)
        var lvBefore = Math.floor(Number(player.xpLevel))
        var whole = Math.min(Math.round(n), lvBefore)
        if (whole > 0) player.addXPLevels(-whole)
        delta = Math.floor(Number(player.xpLevel)) - lvBefore
      }
      rebase(player)
      return delta < 0 ? -delta : 0
    } catch (e) {
      warnOnce('xp.take', 'xp.take() failed: ' + e)
      return 0
    }
  }

  var xpTakePoints = function (player, raw) {
    try {
      var n = Number(raw)
      if (!player || !(n > 0) || n === Infinity) return 0
      if (!linear) {
        // vanilla points are exact as they are
        var pts = Math.floor(n)
        if (pts > 0) player.addXP(-pts)
        rebase(player)
        return pts
      }
      var lv = Math.floor(Number(player.xpLevel))
      if (!(lv >= 0)) return 0
      var per = rawPerLevelAt(player, lv)
      if (!(per > 0)) return 0
      return xpTake(player, n / per) * per
    } catch (e) {
      warnOnce('xp.takePoints', 'xp.takePoints() failed: ' + e)
      return 0
    }
  }

  var xpPollSpend = function (player) {
    try {
      if (!player) return 0
      var key = keyOf(player)
      var cur = Math.floor(Number(player.xpLevel))
      if (!(cur >= 0)) return 0
      if (!lastLevel.hasOwnProperty(key)) {
        if (lastLevelSize >= MAX_ENTRIES) { lastLevel = {}; lastLevelSize = 0 }
        lastLevelSize++
        lastLevel[key] = cur
        return 0
      }
      var last = lastLevel[key]
      if (cur === last) return 0
      lastLevel[key] = cur
      return cur < last ? (last - cur) : 0
    } catch (e) {
      warnOnce('xp.pollSpend', 'xp.pollSpend() failed: ' + e)
      return 0
    }
  }

  // ── export ────────────────────────────────────────────────────────────────
  global.icraft = global.icraft || {}
  global.icraft.aptitude = {
    get: get,
    all: all,
    invalidate: invalidate,
    names: NAMES.slice(),
    xp: {
      levels: xpLevels,
      rawPerLevel: xpRawPerLevel,
      give: xpGive,
      take: xpTake,
      takePoints: xpTakePoints,
      pollSpend: xpPollSpend
    }
  }

  // Registered first (this file loads before every consumer), so consumers'
  // own loggedIn / respawned handlers already see a fresh / dropped entry.
  PlayerEvents.loggedIn(function (event) {
    dropBaseline(event.player)
    forceRefresh(event.player)
  })
  // New player entity: its level restarts (death) or carries over; either way
  // the old baseline says nothing about spending. See the header for why this
  // drops instead of reading.
  PlayerEvents.respawned(function (event) {
    dropBaseline(event.player)
    invalidate(event.player)
  })
  PlayerEvents.loggedOut(function (event) {
    dropBaseline(event.player)
    invalidate(event.player)
  })

  console.log('[IridescentCraft] 0_lib_aptitudes loaded -- global.icraft.aptitude {get,all,invalidate,xp}: ' +
    (direct ? 'direct AptitudeCapability read, ' + TTL_DIRECT + '-tick' : 'NBT read (ForgeCaps."' + CAP_ID + '"), ' + TTL_NBT + '-tick') +
    ' per-player cache; XP wallet: ' + (linear ? 'LinearXP (level + capability)' : 'vanilla (LinearXP not found)'))
})()
