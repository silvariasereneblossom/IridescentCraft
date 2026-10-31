// @file kubejs/server_scripts/origins/phantom_undeath.js
// @events EntityEvents.death, tick.server
// =============================================================================
// PHANTOM — Spectral Undeath
// =============================================================================
// Phantoms never truly die. When they would reach 0 HP:
//   - Health locks to 0.5 hearts (1 HP)
//   - 50% damage reduction (Weakness II equivalent via Resistance)
//   - Slowness II for 5 minutes
//   - Mining Fatigue I for 5 minutes
//   - Visual: Wither particle effect (darkness closing in)
// After 5 minutes the debuffs expire and they recover naturally.
// Cannot trigger again while debuffs are active (no infinite immortality loop).
//
// Origin detection: global.icraft.origin (0_lib_origins.js). The old
// `execute if entity <name>[nbt=...]` probe never parsed, so this never ran
// before 2026-10.
//
// ORDER MATTERS in the death handler. event.cancel() works by THROWING, so
// nothing written after it runs and a try/catch around it swallows the cancel.
// The original called cancel() first: had the origin check ever passed, the
// death would have been cancelled with the player still at 0 HP and none of
// the revive below applied. Revive first, decide, cancel last and outside the
// try -- and once health is back at 1 the death MUST be cancelled.
// =============================================================================

;(function () {
  var isPhantom = function (player) {
    try {
      return global.icraft.origin.is(player, 'origin', 'origins:phantom')
    } catch (e) {
      return false
    }
  }

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnThrew = function (where, e) {
    global.icraft.core.warnOnce('origins/phantom_undeath:' + where, '[phantom_undeath] ' + where + ' threw: ' + e)
  }

  var COLLAPSE_TICKS = 6000  // 5 minutes

  // Intercept death for Phantom players
  EntityEvents.death(icraft.guard('origins/phantom_undeath', 'EntityEvents.death', function (event) {
    var revived = false
    try {
      var player = event.entity
      if (!player || !player.player) return
      if (!isPhantom(player)) return

      // Already in spectral collapse: this death is real.
      var data = player.persistentData
      if (data.getBoolean('icraft_phantom_collapsed')) return

      // Set to half a heart. From here on the death has to be cancelled.
      player.setHealth(1)
      revived = true

      // Mark as collapsed
      data.putBoolean('icraft_phantom_collapsed', true)

      try {
        // 5-minute debuffs (same instances `effect give <name> <id> 300 <amp> false` built)
        // Weakness II = 50% less melee damage
        player.potionEffects.add('minecraft:weakness', COLLAPSE_TICKS, 1, false, true)
        // Slowness II
        player.potionEffects.add('minecraft:slowness', COLLAPSE_TICKS, 1, false, true)
        // Mining Fatigue I
        player.potionEffects.add('minecraft:mining_fatigue', COLLAPSE_TICKS, 0, false, true)
        // Resistance II — 36% damage reduction to help survive the collapse state
        player.potionEffects.add('minecraft:resistance', COLLAPSE_TICKS, 1, false, true)

        // Notify player
        var name = player.username
        player.tell('\u00a78\u00a7l[Spectral Collapse]\u00a7r')
        player.tell('\u00a77Your phantom form wavers at the edge of death.')
        player.tell('\u00a77You are severely weakened for 5 minutes.')
        player.server.runCommandSilent(
          'title ' + name + ' title {"text":"Spectral Collapse","color":"gray","bold":true}'
        )
        player.server.runCommandSilent(
          'title ' + name + ' subtitle {"text":"Your form holds... barely.","color":"dark_gray"}'
        )
      } catch (e) {
        warnThrew('collapse effects', e)
      }
    } catch (e) {
      warnThrew('death handler', e)
    }
    if (revived) event.cancel()
  }))

  // Clear the collapse flag when debuffs expire (check every 10 seconds)
  global.tick_phantomUndeath = function (event) {
    event.server.players.forEach(function (player) {
      try {
        // Cheap flag first: only a collapsed player needs the origin lookup.
        var data = player.persistentData
        if (!data.getBoolean('icraft_phantom_collapsed')) return
        if (!isPhantom(player)) return

        if (!player.potionEffects.isActive('minecraft:weakness')) {
          data.putBoolean('icraft_phantom_collapsed', false)
          player.tell('\u00a77Your spectral form stabilizes. You feel whole again.')
        }
      } catch (e) {
        warnThrew('collapse tick', e)
      }
    })
  }
  // offset 147 since 2026-10-30: sixteen functions shared offset 0 and ran in one tick (RAM audit F17)
  global.registerServerTick('tick_phantomUndeath', 200, 147)

  console.log('[IridescentCraft] Phantom Undeath loaded')
  console.log('  - Phantoms cannot die — health locks to 0.5 hearts')
  console.log('  - Spectral Collapse: Weakness II, Slowness II, Mining Fatigue I for 5 min')
  console.log('  - Resistance II during collapse to prevent instant re-collapse')
})()
