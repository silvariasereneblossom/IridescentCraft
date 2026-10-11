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
// HOW THE SWEEP RUNS (2026-10-10, cost only -- it removes exactly the entities
// the old command removed):
//   The sweep used to be
//     kill @e[type=item,nbt={Item:{id:"minecraft:paper",tag:{UltrisRandomizerItem:1}}}]
//   every 100 ticks, players online or not. An `nbt=` selector serialises the
//   full NBT of EVERY item entity in EVERY level to compare it, plus a command
//   parse per run. Now:
//     * nothing runs while no player is online (no player = no Ultris fight);
//     * each level is asked for its item entities only
//       (ServerLevel.getEntities(EntityType.ITEM, predicate)), and the stack
//       is tested directly: has NBT -> has the UltrisRandomizerItem tag -> is
//       paper. No serialisation; a dropped item without NBT costs one call.
//   If that typed query ever fails (API drift) the sweep falls back to the old
//   command, and says so once.
//
// HOME: registered through the established periodic-job dispatcher in
//   0_tick_master.js (global.registerServerTick), not a standalone
//   ServerEvents.tick, so it shares the one consolidated tick handler.
//
// Memory: feedback_rhino_scoping.md (var fn = function(){} for reentrant scope),
//         feedback_kubejs_event_scope.md (ServerEvents.tick is server-side).
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var MARKER_TAG = 'UltrisRandomizerItem'
  var LEGACY_COMMAND =
    'kill @e[type=item,nbt={Item:{id:"minecraft:paper",tag:{UltrisRandomizerItem:1}}}]'

  var warned = {}
  var warnOnce = function (key, message) {
    if (warned[key]) return
    warned[key] = true
    try { console.warn('[ultris_randomizer_janitor] ' + message + ' (logged once)') } catch (ignored) {}
  }

  // Typed-query plumbing, resolved on the first sweep with a player online.
  //   false = not tried yet, null = unavailable (use LEGACY_COMMAND)
  var query = false
  var resolveQuery = function () {
    if (query !== false) return query
    try {
      var EntityType = Java.loadClass('net.minecraft.world.entity.EntityType')
      var Predicate = Java.loadClass('java.util.function.Predicate')
      query = {
        itemType: EntityType.ITEM,
        // true for a stranded marker: a paper stack tagged UltrisRandomizerItem:1
        isMarker: new Predicate({
          test: function (entity) {
            try {
              var stack = entity.item
              if (!stack || stack.isEmpty()) return false
              var tag = stack.nbt
              if (!tag || !tag.contains(MARKER_TAG)) return false
              return tag.getInt(MARKER_TAG) === 1 && String(stack.id) === 'minecraft:paper'
            } catch (e) {
              return false
            }
          }
        })
      }
    } catch (e2) {
      query = null
      warnOnce('query', 'typed item-entity query unavailable, using the kill command instead: ' + e2)
    }
    return query
  }

  var legacySweep = function (server) {
    server.runCommandSilent(LEGACY_COMMAND)
  }

  global.tick_ultrisJanitor = function (event) {
    try {
      var server = event.server
      if (!server) return
      // Nobody online: nothing is fighting, nothing can strand a marker.
      if (!(Number(server.getPlayerCount()) > 0)) return

      var q = resolveQuery()
      if (!q) { legacySweep(server); return }

      // Kill stranded Ultris RNG paper markers. Legit markers live < 1 tick, so a
      // 100-tick sweep only ever catches garbage that the datapack failed to clean.
      try {
        var levels = server.getAllLevels().iterator()
        while (levels.hasNext()) {
          var found = levels.next().getEntities(q.itemType, q.isMarker) // CI-ignore: q.isMarker is the Predicate field of the plain JS `query` object built above, passed as a value
          var count = found ? found.size() : 0
          for (var i = 0; i < count; i++) found.get(i).kill()
        }
      } catch (e2) {
        // The typed query does not work on this build: stop using it.
        query = null
        warnOnce('sweep', 'typed item-entity sweep failed, using the kill command from now on: ' + e2)
        legacySweep(server)
      }
    } catch (e) {
      warnOnce('error', 'sweep error: ' + e)
    }
  }

  // Every 100 ticks (5s), offset 7 to spread load away from other periodic jobs.
  global.registerServerTick('tick_ultrisJanitor', 100, 7)
  console.log('[IridescentCraft] ultris_randomizer_janitor loaded (100-tick stranded-marker sweep)')
})()
