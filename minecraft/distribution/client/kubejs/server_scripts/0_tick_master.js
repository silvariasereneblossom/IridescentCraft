// =============================================================================
// MASTER TICK HANDLER — Consolidates all ServerEvents.tick and PlayerEvents.tick
// dispatches into TWO event registrations to reduce KubeJS event bus overhead.
//
// Each file registers its tick function via:
//   global.registerServerTick('name', intervalTicks, offsetTicks)
//   global.registerPlayerTick('name', intervalTicks, offsetTicks)
//
// The master handler calls (tick + offset) % interval === 0 for each,
// wrapped in try-catch for fault isolation.
// =============================================================================

// ─── Registration Arrays ───
global.serverTickFunctions = []
global.playerTickFunctions = []

/**
 * Register a server tick function.
 * @param {string} name - Descriptive name for logging
 * @param {number} interval - How often to run (in ticks). 0 = every tick.
 * @param {number} offset - Offset within the interval cycle
 */
global.registerServerTick = function(name, interval, offset) {
  if (!global[name]) {
    console.warn('[TickMaster] WARNING: global.' + name + ' is not defined at registration time')
    return
  }
  global.serverTickFunctions.push({
    name: name,
    interval: interval || 1,
    offset: offset || 0,
    fn: global[name]
  })
}

/**
 * Register a player tick function.
 * @param {string} name - Descriptive name for logging
 * @param {number} interval - How often to run (in ticks, based on player.age)
 * @param {number} offset - Offset within the interval cycle
 */
global.registerPlayerTick = function(name, interval, offset) {
  if (!global[name]) {
    console.warn('[TickMaster] WARNING: global.' + name + ' is not defined at registration time')
    return
  }
  global.playerTickFunctions.push({
    name: name,
    interval: interval || 1,
    offset: offset || 0,
    fn: global[name]
  })
}

// ─── Master ServerEvents.tick ───
ServerEvents.tick(event => {
  let tick = event.server.tickCount
  let fns = global.serverTickFunctions
  for (let i = 0; i < fns.length; i++) {
    let entry = fns[i]
    if (tick % entry.interval !== entry.offset) continue
    try {
      entry.fn(event)
    } catch (e) {
      console.error('[TickMaster] Error in server tick function "' + entry.name + '": ' + e)
    }
  }
})

// ─── Master PlayerEvents.tick ───
PlayerEvents.tick(event => {
  let age = event.player.age
  let fns = global.playerTickFunctions
  for (let i = 0; i < fns.length; i++) {
    let entry = fns[i]
    if (age % entry.interval !== entry.offset) continue
    try {
      entry.fn(event)
    } catch (e) {
      console.error('[TickMaster] Error in player tick function "' + entry.name + '": ' + e)
    }
  }
})

// Log summary after all scripts load
ServerEvents.loaded(event => {
  console.log('[TickMaster] Registered ' + global.serverTickFunctions.length + ' server tick functions')
  console.log('[TickMaster] Registered ' + global.playerTickFunctions.length + ' player tick functions')
})
