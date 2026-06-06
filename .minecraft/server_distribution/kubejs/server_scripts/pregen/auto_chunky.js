// =============================================================================
// Auto-start Chunky pre-generation on first world load
// =============================================================================
// Fires /chunky start around spawn exactly once per world. The "once" is
// tracked via server.persistentData so subsequent launches don't re-trigger.
// Chunky's continueOnRestart=true handles resume-on-interrupt.
//
// Protocol 7 (wiki/protocols/7-pregen.md) documents why this exists: dense
// structure mods (Dungeon Crawl etc.) stall the main thread when worldgen
// runs under load while players are connected.
//
// [2026-06-06 rework - two verified blockers fixed]
// 1. START RACE: ServerEvents.loaded fires before Chunky's command handler is
//    initialized; all four /chunky commands NPE'd ("this.chunky" null) and -
//    because runCommandSilent reports failure via its RETURN CODE, not an
//    exception - the old try/catch never tripped and the started-flag was set
//    anyway, permanently disabling pregen for that world (boot log 2026-06-05
//    lines 9072-9195). Fix: defer via scheduleInTicks with bounded retries and
//    set the flag ONLY when /chunky start actually succeeds.
// 2. DEAD PAUSE MOD: chunky-player-pause-1.0.0.jar is an empty @Mod stub whose
//    single datapack function fails to parse on Chunky 1.3.x (its minecraft:load
//    tag entry errors every boot). The pause NEVER worked here. This script now
//    owns pause-on-join / continue-on-empty itself; the mod is inert and may be
//    removed from the index at the operator's leisure.
// =============================================================================

(function () {
  var RADIUS = 2500            // blocks; Protocol 7 reconciled to this value
  var DIMENSION = 'minecraft:overworld'
  var RETRY_TICKS = 200        // 10s between attempts (Chunky inits well before)
  var MAX_ATTEMPTS = 5
  var FLAG = 'icraft_chunky_pregen_started'

  var tryStart = function (server, attempt) {
    if (server.persistentData.getBoolean(FLAG)) return

    server.runCommandSilent('chunky world ' + DIMENSION)
    server.runCommandSilent('chunky center 0 0')
    server.runCommandSilent('chunky radius ' + RADIUS)
    var ok = server.runCommandSilent('chunky start')

    if (ok > 0) {
      server.persistentData.putBoolean(FLAG, true)
      console.log('[IridescentCraft] Chunky pre-gen started (attempt ' + attempt + '): '
        + DIMENSION + ' r=' + RADIUS + '. Pause-on-join is script-managed.')
      return
    }

    if (attempt >= MAX_ATTEMPTS) {
      console.error('[IridescentCraft] Chunky pre-gen FAILED after ' + MAX_ATTEMPTS
        + ' attempts - flag NOT set; will retry next boot. Start manually per Protocol 7 if needed.')
      return
    }

    console.log('[IridescentCraft] Chunky not ready (attempt ' + attempt + '), retrying in '
      + RETRY_TICKS + ' ticks')
    server.scheduleInTicks(RETRY_TICKS, function () { tryStart(server, attempt + 1) })
  }

  ServerEvents.loaded(function (event) {
    var server = event.server
    if (server.persistentData.getBoolean(FLAG)) return
    console.log('[IridescentCraft] First world load - scheduling Chunky pre-gen auto-start')
    server.scheduleInTicks(RETRY_TICKS, function () { tryStart(server, 1) })
  })

  // --- Pause/continue (replaces the dead chunky-player-pause mod) -----------
  // Pause whenever a player is online; continue when the server empties.
  // Both commands are no-ops (failed-command return code, no exception) when
  // no pregen task exists, so gating on the started-flag alone is safe.
  PlayerEvents.loggedIn(function (event) {
    var server = event.server
    if (!server.persistentData.getBoolean(FLAG)) return
    server.runCommandSilent('chunky pause')
  })

  PlayerEvents.loggedOut(function (event) {
    var server = event.server
    if (!server.persistentData.getBoolean(FLAG)) return
    // the leaving player may still be in the list this tick - check next tick
    server.scheduleInTicks(2, function () {
      if (server.players.size() === 0) {
        server.runCommandSilent('chunky continue')
      }
    })
  })
})()
