// @file kubejs/server_scripts/skills/mastery_tax.js
// @events PlayerEvents.loggedIn, PlayerEvents.loggedOut, PlayerEvents.respawned, ServerEvents.loaded, tick.server
// =============================================================================
// MASTERY TAX — Escalating XP cost for JustLeveling aptitude breadth
// =============================================================================
// On top of the fork's own level-up cost, a player whose TOTAL invested
// aptitude levels pass a threshold is drained bonus XP for every further level:
//   - 1st aptitude's worth (invested  1-32): free
//   - 2nd                  (invested 33-64): moderate
//   - 3rd                  (invested 65-96): heavy
//   - 4th+                 (invested 97+)  : brutal
// "Invested" = sum of the 8 aptitudes minus the 8 they start at (1 each).
//
// Checked every 2 seconds against the cached aptitude resolver
// (global.icraft.aptitude, 0_lib_aptitudes.js). When the total has gone UP
// since the last look, the tax for each new level is drained.
//
// 2026-10-10 — this script had never taxed anyone, and would have mis-taxed:
//   * It read `data get entity <p> ForgeData.justlevelingfork.aptitude.<name>`
//     (8 commands per player per pass, each serialising the whole player). The
//     fork stores levels in its capability, so every read was 0.
//   * runCommandSilent returns 0 on failure, it does not throw: the "assume 1"
//     catch never ran, a failed pass summed to 0, and the next good pass would
//     have looked like a level-up of the player's whole total.
//   Now: an unreadable pass changes nothing. A player's FIRST readable pass
//   after login / respawn / server start / script reload only records the
//   baseline -- it can never tax. A total that went down (respec, admin
//   subtract) just lowers the baseline.
//   * The drain was `xp add <p> -N points`. Under LinearXP (#77) vanilla applies
//     that to the progress bar, which LinearXP rewrites from its own capability
//     within 10 ticks: only whole levels knocked off survive, priced on the
//     vanilla curve (at level 1000 a 1600-point tax was usually nothing). The
//     tax is N raw XP -- the XP a player earns, 75 to the level here -- and is
//     taken as levels + fraction through the library's wallet.
//   * Creative / spectator players are not taxed (the fork charges them nothing
//     for the level-up either); their baseline still follows.
// NOTE: this tax predates the #76 cumulative cost curve (which already makes
// breadth expensive) and stacks on top of it.
// =============================================================================

;(function () {
  // Baseline: all aptitudes start at level 1 = 8 total
  var BASELINE = 8
  // 8 aptitudes x aptitudeMaxLevel 32, for the "level N/248" readout
  var MAX_TOTAL = 256

  // Tax curve: XP points drained PER LEVEL, by total invested levels
  //   0-32  (1st aptitude): no tax
  //   33-64 (2nd aptitude): 50 * (invested - 32)            ->    50 ..  1,600
  //   65-96 (3rd aptitude): 200 * (invested - 64) + 1600    -> 1,800 ..  8,000
  //   97+   (4th+ aptitude): 800 * (invested - 96) + 8000   -> 8,800 ..
  var getMasteryTax = function (investedLevels) {
    if (!(investedLevels > 32)) return 0
    if (investedLevels <= 64) return Math.floor(50 * (investedLevels - 32))
    if (investedLevels <= 96) return Math.floor(200 * (investedLevels - 64) + 1600)
    return Math.floor(800 * (investedLevels - 96) + 8000)
  }

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnFailed = function (where, e) {
    global.icraft.core.warnOnce('skills/mastery_tax:' + where, '[mastery_tax] ' + where + ' failed: ' + e)
  }

  // uuid -> cumulative aptitude total at the last readable pass (session memory)
  var prevTotals = {}
  var keyOf = function (player) { return String(player.uuid.toString()) }
  var forget = function (player) {
    try { delete prevTotals[keyOf(player)] } catch (e) {}
  }

  var checkPlayer = function (player) {
    var all = global.icraft.aptitude.all(player)
    if (!all) return                                  // not readable: leave the baseline alone
    var total = Number(all.total)
    if (!(total >= BASELINE) || total > 100000) return // not a clean read (an aptitude below 1)

    var key = keyOf(player)
    if (!prevTotals.hasOwnProperty(key)) {            // first readable pass: baseline only
      prevTotals[key] = total
      return
    }
    var prev = prevTotals[key]
    if (total === prev) return
    prevTotals[key] = total
    if (total < prev) return                          // respec / admin subtract: no refund, new baseline
    if (player.creative || player.spectator) return

    // Tax for each level gained, at the invested count that level brought the player to
    var gained = total - prev
    var invested = total - BASELINE
    var totalTax = 0
    for (var i = 0; i < gained; i++) {
      totalTax += getMasteryTax(invested - gained + i + 1)
    }
    if (!(totalTax > 0)) return

    var drained = Math.round(global.icraft.aptitude.xp.takePoints(player, totalTax))
    var tierLabel = invested <= 64 ? ' §e(Mastery Tax: moderate)'
                  : invested <= 96 ? ' §6(Mastery Tax: heavy)'
                  : ' §c(Mastery Tax: extreme)'
    player.tell('§7[Mastery] §fAptitude level ' + invested + '/' + (MAX_TOTAL - BASELINE) + tierLabel +
      ' §7· §f' + drained + ' bonus XP drained' +
      (drained < totalTax ? ' §7(of ' + totalTax + '; that was all you had)' : ''))
  }

  var onTick = function (event) {
    event.server.players.forEach(function (player) {
      try {
        checkPlayer(player)
      } catch (e) { warnFailed('tax pass', e) }
    })
  }
  global.registerServerTick('tick_masteryTax', 40, 0, onTick)

  // A new session or a new player entity starts from a fresh baseline: the first
  // readable pass afterwards records, never taxes.
  PlayerEvents.loggedIn(icraft.guard('skills/mastery_tax', 'PlayerEvents.loggedIn', function (event) { forget(event.player) }))
  PlayerEvents.respawned(icraft.guard('skills/mastery_tax', 'PlayerEvents.respawned', function (event) { forget(event.player) }))
  PlayerEvents.loggedOut(icraft.guard('skills/mastery_tax', 'PlayerEvents.loggedOut', function (event) { forget(event.player) }))

  // Log the tax curve on load
  ServerEvents.loaded(icraft.guard('skills/mastery_tax', 'ServerEvents.loaded', function (event) {
    console.log('[IridescentCraft] Mastery Tax loaded (aptitudes via global.icraft.aptitude; drained through the XP wallet)')
    console.log('  Tax curve (raw XP per level-up, by invested levels): 1-32 = 0 | 33 = ' + getMasteryTax(33) +
      ' | 48 = ' + getMasteryTax(48) + ' | 64 = ' + getMasteryTax(64) + ' | 65 = ' + getMasteryTax(65) +
      ' | 80 = ' + getMasteryTax(80) + ' | 96 = ' + getMasteryTax(96) + ' | 97 = ' + getMasteryTax(97) +
      ' | 128 = ' + getMasteryTax(128) + ' | 200 = ' + getMasteryTax(200) + ' | 248 = ' + getMasteryTax(248))
  }))
})()
