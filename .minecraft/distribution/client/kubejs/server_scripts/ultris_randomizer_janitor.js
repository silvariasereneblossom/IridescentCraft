// =============================================================================
// ULTRIS RANDOMIZER JANITOR -- sweep stranded Ultris RNG paper markers
// File: kubejs/server_scripts/ultris_randomizer_janitor.js  (canonical only;
//        sync-distros mirrors server_scripts/ to the two distro copies)
// =============================================================================
//
// WHY THIS EXISTS:
//   The Ultris datapack drives some of its combat RNG by briefly summoning an
//   invisible "paper" marker item carrying tag {UltrisRandomizerItem:1}, reading
//   it back via a same-tick entity selector, then killing it. The marker is
//   meant to live for well under one tick -- legitimate markers are created and
//   consumed inside the same datapack tick.
//
//   When the same-tick selector visibility breaks (entity not yet visible to
//   the read selector, e.g. under load / cross-tick scheduling hiccups), the
//   datapack never reads-then-kills the marker, so it is STRANDED in the world
//   as a live paper item. These leak into the player's loot stream as stray
//   blank-tagged paper. (A7.)
//
// THE SWEEP:
//   Every 100 server ticks (5s), kill any paper item carrying the
//   UltrisRandomizerItem tag. Because legitimate markers live for << 1 tick, a
//   100-tick sweep can ONLY ever catch garbage -- a real marker is always gone
//   long before the next sweep window. Worst case: a concurrent Ultris RNG read
//   lands on the exact tick the sweep fires and the marker is killed a fraction
//   of a tick early; that read then misreads once and no-ops, which is an
//   acceptable, self-correcting outcome (the next RNG attempt re-rolls).
//
// HOME: registered through the established periodic-job dispatcher in
//   0_tick_master.js (global.registerServerTick), not a standalone
//   ServerEvents.tick, so it shares the one consolidated tick handler.
//
// Memory: feedback_rhino_scoping.md (var fn = function(){} for reentrant scope),
//         feedback_kubejs_event_scope.md (ServerEvents.tick is server-side).
// =============================================================================

global.tick_ultrisJanitor = function (event) {
  try {
    var server = event.server
    if (!server) return
    // Kill stranded Ultris RNG paper markers. Legit markers live < 1 tick, so a
    // 100-tick sweep only ever catches garbage that the datapack failed to clean.
    server.runCommandSilent(
      'kill @e[type=item,nbt={Item:{id:"minecraft:paper",tag:{UltrisRandomizerItem:1}}}]'
    )
  } catch (e) {
    console.warn('[ultris_randomizer_janitor] sweep error: ' + e)
  }
}

// Every 100 ticks (5s), offset 7 to spread load away from other periodic jobs.
global.registerServerTick('tick_ultrisJanitor', 100, 7)
console.log('[IridescentCraft] ultris_randomizer_janitor loaded (100-tick stranded-marker sweep)')
