// priority: 870
// @file kubejs/server_scripts/0_lib_origins.js
// @events PlayerEvents.loggedIn, PlayerEvents.loggedOut, PlayerEvents.respawned
// =============================================================================
// icraft.origin -- the ONE resolver for "what class / race / origin is this player"
// File: kubejs/server_scripts/0_lib_origins.js   (loads before its consumers: the priority line on top)
// =============================================================================
// API (exported through `global`, never through top-level names):
//
//   global.icraft.origin.get(player, layer)      -> 'icraft:archmage' | null
//   global.icraft.origin.is(player, layer, id)   -> true | false
//   global.icraft.origin.invalidate(player)      -> forget the cached answer
//
//   layer : 'class' | 'race' | 'origin'
//           (the Origins layers origins:class / origins:race / origins:origin;
//            the full layer id is accepted too)
//   id    : full origin id ('icraft:archmage', 'origins:phantom'). A bare name
//           ('archmage') matches on the path part, whatever the namespace.
//
// WHY THIS EXISTS
//   Nineteen class/race/origin checks used
//       execute if entity <username>[nbt={ForgeCaps:{"origins:origins":{...}}}]
//   Selector brackets are only legal after an @-selector, so that command never
//   parsed, runCommandSilent returned 0, and every one of those checks answered
//   "no" for the lifetime of the pack. The data itself was always readable:
//   the Origins capability serialises as
//       ForgeCaps."origins:origins".Origins = { "origins:class": "icraft:archmage",
//                                               "origins:race":  "icraft:faefolk",
//                                               "origins:origin": "icraft:witch_of_ink" }
//   and the direct player.nbt read (codex_delivery.js "Route 0") is proven in
//   production logs. This file reads the same data, ONCE per player per TTL.
//
// HOW IT READS (2026-10-30, RAM audit F9)
//   Straight from the capability: IOriginContainer.get(player) -> getOrigins(),
//   layer key -> origin key. That map is what the NBT above is written from
//   (OriginContainer.serializeNBT), which skips an entry whose layer or origin
//   is not registered; the same test is made here, so the answers are the ones
//   the NBT gave. player.nbt is the fallback only: when the Origins classes
//   cannot be loaded, or the direct read fails DIRECT_FAILS_ALLOWED times in a
//   row. It saved the WHOLE player (inventory, ender chest, recipe book, every
//   capability) to read three strings, once per player every ~5 s.
//
// COST MODEL
//   One read per player per TTL_TICKS; every get()/is() in between is a map
//   lookup. Refreshed on login + respawn, dropped on logout. A class respec
//   (/origin set + the picker GUI) therefore shows up within TTL_TICKS (5 s)
//   with no extra wiring; call invalidate(player) to make it immediate.
//
// CONTRACT
//   * never throws into the caller (null / false instead)
//   * logs at most once per script load when a read fails
//   * never serialises a player off the server thread (PlayerEvents.chat runs
//     on a Worker thread): off-thread callers get the cached answer only
//   * returned ids are JS primitive strings (safe for ===, Set.has, .length)
//
// Rhino notes: Java Strings are NOT JS strings here (typeof 'object', .length
// is a method, Set.has misses) -- everything read from NBT is String()-coerced.
// =============================================================================

;(function () {
  var TTL_TICKS = 100
  var MAX_ENTRIES = 512        // safety valve; real population = online players

  // layer name -> key inside ForgeCaps."origins:origins".Origins
  var LAYER_KEYS = {
    'class':  'origins:class',
    'race':   'origins:race',
    'origin': 'origins:origin'
  }
  var LAYER_NAMES = ['class', 'race', 'origin']
  // the other way round: layer id -> layer name
  var LAYER_OF = { 'origins:class': 'class', 'origins:race': 'race', 'origins:origin': 'origin' }
  var DIRECT_FAILS_ALLOWED = 3 // consecutive failures before the direct read is given up for NBT

  // uuid -> { t: <game time of the last read>, v: { class, race, origin } }
  var cache = {}
  var cacheSize = 0
  var failLogged = false

  var logFailOnce = function (what, e) {
    if (failLogged) return
    failLogged = true
    try {
      console.warn('[icraft.origin] ' + what + ' failed: ' + e +
        ' -- class/race/origin checks answer null/false for the affected player' +
        ' until a read succeeds (logged once per script load)')
    } catch (ignored) { /* swallow-ok: the log call itself failed; there is nowhere left to say so, and a log line must never throw into its caller */ }
  }

  var layerName = function (layer) {
    var l = String(layer)
    if (LAYER_KEYS.hasOwnProperty(l)) return l
    if (l.indexOf('origins:') === 0 && LAYER_KEYS.hasOwnProperty(l.substring(8))) return l.substring(8)
    return null
  }

  var emptyLayers = function () {
    return { 'class': null, 'race': null, 'origin': null }
  }

  // Cache clock = world game time: monotonic across restarts, shared by every
  // dimension. To scripts that is `level.time` -- KubeJS renames
  // Level.getGameTime() to getTime() (@RemapForJS on LevelMixin), so the
  // obvious `level.gameTime` is undefined. This line read it until
  // 2026-10-10: the clock was NaN, the TTL test was never true, and every
  // get()/is() call did a full player-NBT read.
  var keyOf = function (player) { return String(player.uuid.toString()) }
  var clockOf = function (player) { return Number(player.level.time) }

  var onServerThread = function (player) {
    try { return player.server.isSameThread() !== false } catch (e) { return true }
  }

  // ── the Origins capability, read directly ────────────────────────────────
  var OriginCap = null, OriginsApi = null, capWhy = ''
  try {
    OriginCap = Java.loadClass('io.github.edwinmindcraft.origins.api.capabilities.IOriginContainer')
    OriginsApi = Java.loadClass('io.github.edwinmindcraft.origins.api.OriginsAPI')
  } catch (e) {
    OriginCap = null
    capWhy = ' (' + e + ')'
  }
  var direct = !!OriginCap
  var directFails = 0
  if (!direct) {
    try {
      console.warn('[icraft.origin] the Origins capability classes could not be loaded' + capWhy +
        ' -- reading class/race/origin from player NBT instead, once per player per ' + TTL_TICKS + ' ticks (logged once per script load)')
    } catch (ignored) { /* swallow-ok: the log call itself failed; there is nowhere left to say so, and a log line must never throw into its caller */ }
  }

  // The map the NBT is written from, with serializeNBT's own filter: a layer or
  // an origin that is not registered is left out. A layer that was never chosen
  // is absent (or "origins:empty") -> null.
  // Registered = in the registry's registryKeySet(), the byKey test serializeNBT
  // makes with containsKey(ResourceKey). containsKey itself cannot be called from
  // a script: with a ResourceKey it is "ambiguous" on this engine (its
  // ResourceLocation overload takes one too), measured on a full-pack boot 2026-10-30.
  var readLayersDirect = function (player) {
    var out = emptyLayers()
    var opt = OriginCap.get(player).resolve()
    if (!opt.isPresent()) return out
    var server = player.server
    var layers = OriginsApi.getLayersRegistry(server).registryKeySet()
    var origins = OriginsApi.getOriginsRegistry(server).registryKeySet()
    var it = opt.get().getOrigins().entrySet().iterator()
    while (it.hasNext()) {
      var en = it.next()
      var layerKey = en.getKey(), originKey = en.getValue()
      if (!layers.contains(layerKey) || !origins.contains(originKey)) continue
      var name = LAYER_OF[String(layerKey.location())]
      if (!name) continue
      var id = String(originKey.location())
      out[name] = (id !== '' && id !== 'origins:empty') ? id : null
    }
    return out
  }

  // The fallback, the proven read path verbatim from codex_delivery.js Route 0:
  //   player.nbt.ForgeCaps."origins:origins".Origins.<layer key>
  // A layer that was never chosen is absent (or "origins:empty") -> null.
  var readLayersNbt = function (player) {
    var out = emptyLayers()
    var nbt = player.nbt
    if (!nbt) return out
    var fc = nbt.ForgeCaps
    if (!fc) return out
    var oo = fc.get ? fc.get('origins:origins') : null
    if (!oo) return out
    var origins = oo.get ? oo.get('Origins') : null
    if (!origins || !origins.getString) return out
    for (var i = 0; i < LAYER_NAMES.length; i++) {
      var name = LAYER_NAMES[i]
      var id = String(origins.getString(LAYER_KEYS[name]) || '')
      out[name] = (id !== '' && id !== 'origins:empty') ? id : null
    }
    return out
  }

  var readLayers = function (player) {
    if (direct) {
      try {
        var v = readLayersDirect(player)
        directFails = 0
        return v
      } catch (e) {
        // this read falls back to NBT below; a third failure in a row says so and stays on NBT
        directFails++
        if (directFails >= DIRECT_FAILS_ALLOWED) {
          direct = false
          try {
            console.warn('[icraft.origin] the direct capability read failed ' + directFails + ' times in a row (' + e +
              ') -- reading class/race/origin from player NBT from now on, once per player per ' + TTL_TICKS + ' ticks (logged once per script load)')
          } catch (ignored) { /* swallow-ok: the log call itself failed; there is nowhere left to say so, and a log line must never throw into its caller */ }
        }
      }
    }
    return readLayersNbt(player)
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
      var v = readLayers(player)
      store(key, t, v)
      return v
    } catch (e) {
      logFailOnce('reading the Origins capability of ' + key, e)
      // Keep the last good answer and stamp it, so a failing read is retried
      // once per TTL rather than on every call.
      var keep = prev ? prev.v : emptyLayers()
      store(key, t, keep)
      return keep
    }
  }

  // -> layer map for this player, or null when nothing can be said
  var resolve = function (player) {
    if (!player) return null
    var key, t
    try {
      key = keyOf(player)
      t = clockOf(player)
    } catch (e) {
      logFailOnce('identifying the player', e)
      return null
    }
    var entry = cache.hasOwnProperty(key) ? cache[key] : null
    // `t >= entry.t` also covers a clock that stepped backwards: re-read.
    if (entry && t >= entry.t && (t - entry.t) < TTL_TICKS) return entry.v
    if (!onServerThread(player)) return entry ? entry.v : null
    return refresh(player, key, t)
  }

  var get = function (player, layer) {
    try {
      var name = layerName(layer)
      if (!name) return null
      var v = resolve(player)
      return v ? v[name] : null
    } catch (e) {
      logFailOnce('get()', e)
      return null
    }
  }

  var is = function (player, layer, id) {
    try {
      if (id === null || id === undefined) return false
      var cur = get(player, layer)
      if (!cur) return false
      var want = String(id)
      if (cur === want) return true
      // bare name: 'archmage' matches '<namespace>:archmage'
      return want.indexOf(':') < 0 && cur.substring(cur.indexOf(':') + 1) === want
    } catch (e) {
      logFailOnce('is()', e)
      return false
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
      logFailOnce('refresh on login/respawn', e)
    }
  }

  global.icraft = global.icraft || {}
  global.icraft.origin = {
    get: get,
    is: is,
    invalidate: invalidate
  }

  // Registered first (this file loads before every consumer), so the cache is
  // already fresh when the consumers' own loggedIn / respawned handlers run.
  PlayerEvents.loggedIn(icraft.guard('0_lib_origins', 'PlayerEvents.loggedIn', function (event) { forceRefresh(event.player) }))
  PlayerEvents.respawned(icraft.guard('0_lib_origins', 'PlayerEvents.respawned', function (event) { forceRefresh(event.player) }))
  PlayerEvents.loggedOut(icraft.guard('0_lib_origins', 'PlayerEvents.loggedOut', function (event) { invalidate(event.player) }))

  console.log('[IridescentCraft] 0_lib_origins loaded -- global.icraft.origin {get,is,invalidate}, ' +
    TTL_TICKS + '-tick per-player cache over ForgeCaps."origins:origins".Origins')
})()

// the last statement: this library ran to its end (icraft.lib, 00_icraft_guard.js)
icraft.lib.announce('origins')
