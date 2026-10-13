// priority: 840
// @file kubejs/server_scripts/0_tick_master.js
// @events PlayerEvents.tick, ServerEvents.loaded, ServerEvents.tick
// =============================================================================
// MASTER TICK HANDLER — Consolidates all ServerEvents.tick and PlayerEvents.tick
// dispatches into TWO event registrations to reduce KubeJS event bus overhead.
//
// Each file registers its tick function via:
//   global.registerServerTick('name', intervalTicks, offsetTicks)
//   global.registerPlayerTick('name', intervalTicks, offsetTicks)
// (the function is looked up as global['name']), or — without creating a
// global — by passing the function itself as an optional 4th argument:
//   global.registerServerTick('name', intervalTicks, offsetTicks, function (event) { ... })
//
// The master handler runs an entry when  tick % interval === offset  (server
// tickCount for server ticks, player.age for player ticks), wrapped in
// try-catch for fault isolation.
//
// offset MUST be < interval: `tick % interval` only yields 0..interval-1, so an
// entry registered with offset >= interval can never fire. Such a registration
// is kept exactly as given (it stays dead — nothing is silently "fixed") but a
// warning naming the function is logged once at registration.
//
// Failure logging is rate-limited: console.warn/error lines are retained in
// memory until /reload, and a function that throws on every run used to log
// every time, forever (7,612 lines in three days, May 2026). Now: the first
// failure of each function is logged in full, then at most one summary line
// (with a count) per function every ~1200 ticks.
//
// Liveness (icraft.live, 00_icraft_guard.js): every function registered here is
// ARMED under '<name>@tick.server' / '<name>@tick.player', and FIRED the first
// time it returns without throwing. With nobody online a server tick function
// still runs (over no players); a player tick function does not.
// =============================================================================

// ─── Registration Arrays ───
global.serverTickFunctions = []
global.playerTickFunctions = []

// (IIFE — every server script shares one Rhino scope; keep the helpers local.)
;(function () {
  // Ticks between repeat-failure summaries for one function (~60 s).
  var ERROR_SUMMARY_TICKS = 1200

  // Server tick counter mirror, so player-tick failures share the same clock
  // for the summary cadence (player.age differs per player).
  var currentTick = 0

  // null with a guard file that has no `live` yet: nothing is recorded, nothing breaks
  var live = (typeof icraft !== 'undefined' && icraft !== null && icraft.live) ? icraft.live : null

  var register = function (list, kind, name, interval, offset, fn) {
    var f = (typeof fn === 'function') ? fn : global[name]
    if (!f) {
      console.warn('[TickMaster] WARNING: global.' + name + ' is not defined at registration time')
      return
    }
    var iv = interval || 1
    var off = offset || 0
    if (off >= iv || off < 0) {
      console.warn('[TickMaster] WARNING: ' + kind + ' tick function "' + name +
        '" is registered with offset ' + off + ' and interval ' + iv +
        ' -- (tick % interval) is never ' + off + ', so it will NEVER run. ' +
        'Fix the registration (offset must be 0..' + (iv - 1) + ').')
    }
    list.push({
      name: name,
      interval: iv,
      offset: off,
      fn: f,
      errors: 0,          // total failures since load
      pending: 0,         // failures since the last log line
      lastLogTick: 0,
      fired: false,       // it has returned at least once
      live: (live !== null) ? live.arm(name, 'tick.' + kind) : null
    })
  }

  /**
   * Register a server tick function.
   * @param {string} name - Descriptive name for logging (and the global to call when fn is omitted)
   * @param {number} interval - How often to run (in ticks). 0 = every tick.
   * @param {number} offset - Offset within the interval cycle (0..interval-1)
   * @param {function} [fn] - Optional: the function itself (no global[name] needed)
   */
  global.registerServerTick = function (name, interval, offset, fn) {
    register(global.serverTickFunctions, 'server', name, interval, offset, fn)
  }

  /**
   * Register a player tick function.
   * @param {string} name - Descriptive name for logging (and the global to call when fn is omitted)
   * @param {number} interval - How often to run (in ticks, based on player.age)
   * @param {number} offset - Offset within the interval cycle (0..interval-1)
   * @param {function} [fn] - Optional: the function itself (no global[name] needed)
   */
  global.registerPlayerTick = function (name, interval, offset, fn) {
    register(global.playerTickFunctions, 'player', name, interval, offset, fn)
  }

  // First failure: full line. Afterwards: one summary per ERROR_SUMMARY_TICKS.
  var reportError = function (kind, entry, e) {
    entry.errors++
    if (entry.errors === 1) {
      entry.lastLogTick = currentTick
      console.error('[TickMaster] Error in ' + kind + ' tick function "' + entry.name + '": ' + e +
        ' (first failure; repeats are summarised at most once per ' + ERROR_SUMMARY_TICKS + ' ticks)')
      return
    }
    entry.pending++
    if (currentTick - entry.lastLogTick < ERROR_SUMMARY_TICKS) return
    console.error('[TickMaster] ' + kind + ' tick function "' + entry.name + '" is still failing: ' +
      entry.pending + ' more failure(s) since the last report (' + entry.errors + ' total); latest: ' + e)
    entry.pending = 0
    entry.lastLogTick = currentTick
  }

  // ─── Master ServerEvents.tick ───
  ServerEvents.tick(icraft.guard('0_tick_master', 'ServerEvents.tick', event => {
    var tick = event.server.tickCount
    currentTick = tick
    var fns = global.serverTickFunctions
    for (var i = 0; i < fns.length; i++) {
      var entry = fns[i]
      if (tick % entry.interval !== entry.offset) continue
      try {
        entry.fn(event)
        if (entry.fired === false) {
          entry.fired = true
          if (live !== null) live.fire(entry.live)
        }
      } catch (e) {
        reportError('server', entry, e)
      }
    }
  }))

  // ─── Master PlayerEvents.tick ───
  PlayerEvents.tick(icraft.guard('0_tick_master', 'PlayerEvents.tick', event => {
    var age = event.player.age
    var fns = global.playerTickFunctions
    for (var i = 0; i < fns.length; i++) {
      var entry = fns[i]
      if (age % entry.interval !== entry.offset) continue
      try {
        entry.fn(event)
        if (entry.fired === false) {
          entry.fired = true
          if (live !== null) live.fire(entry.live)
        }
      } catch (e) {
        reportError('player', entry, e)
      }
    }
  }))
})()

// Log summary after all scripts load
ServerEvents.loaded(icraft.guard('0_tick_master', 'ServerEvents.loaded', event => {
  console.log('[TickMaster] Registered ' + global.serverTickFunctions.length + ' server tick functions')
  console.log('[TickMaster] Registered ' + global.playerTickFunctions.length + ' player tick functions')
}))

// the last statement: this library ran to its end (icraft.lib, 00_icraft_guard.js)
icraft.lib.announce('ticks')
