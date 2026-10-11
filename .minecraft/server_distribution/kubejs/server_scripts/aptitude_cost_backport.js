// =============================================================================
// IridescentCraft #76 — one-time aptitude level-cost BACKPORT
// File: kubejs/server_scripts/aptitude_cost_backport.js
//
// THE RULE (operator decision, 2026-06-04: credit aptitude investment as XP)
//   Characters that existed BEFORE #76 bought their aptitude levels under the old
//   ~linear per-aptitude cost. #76 swapped in the cumulative tree-doubling curve,
//   which makes their NEXT level far more expensive. Each such character is
//   granted, ONCE, the vanilla levels its aptitude total AT THE CUTOVER would
//   cost under the new curve:
//
//     C0      = cumulative aptitude level (sum of the 8, each starts at 1) on 2026-06-04
//     credit  = BACKPORT_MULT * Σ_{L=8}^{C0-1} requiredExperienceLevels(L)   [levels]
//
//   A character created after the cutover has C0 = 8 -> credit 0: every level it
//   holds was bought at the new price. The real fork formula is called through
//   Java.loadClass, so the curve cannot drift from the live config. Granted with
//   giveExperienceLevels (no PlayerXpEvent.XpChange, so LinearXP #77 does not
//   rescale it; 1 level = 75 XP).
//
// WHY IT NEEDS A TABLE NOW (2026-10-10)
//   This script never credited anyone: it read the aptitudes from
//   ForgeData.justlevelingfork.aptitude.<name>, which the fork never writes, so
//   "8 clean reads" never happened and no character was ever flagged. As
//   written it used the character's CURRENT total as C0 -- correct only on the
//   day #76 shipped. Four months on, the current total includes every level
//   bought since at the NEW price; crediting those would hand the whole payment
//   back (cumulative 30 -> ~417 levels, 60 -> ~1,417, 90 -> ~3,417, 120 -> ~7,417).
//   And per the docket (#86-#88, "worldgen reset" / "fresh world") the server
//   world was reset on 2026-06-06, two days after the cutover: if that reset
//   took the player data with it, no character on it predates #76 at all.
//   The script cannot see the past, so C0 comes from CUTOVER_TOTALS below
//   (uuid -> cumulative level on 2026-06-04, e.g. from a pre-cutover playerdata
//   backup). A character that is not listed is a post-cutover character:
//   credit 0. The table ships EMPTY -- today nobody is owed anything -- and the
//   log line each character gets shows what the 2026-06-04 rule would have paid
//   on its current total, for the operator's eyes.
//
// IDEMPOTENT, AND CANNOT PAY TWICE
//   * per-character flag in persistentData (survives death: KubeJS copies it to
//     the respawned player); set only after a clean read of all 8 aptitudes;
//   * a per-character LEDGER of levels already granted: a re-run (flag suffix
//     bumped, table or multiplier edited) pays only what is still missing and
//     never claws back;
//   * a grant is booked in the ledger BEFORE it is made and measured after
//     (level before / after): a failure in between can only under-pay; a
//     vetoed level change is un-booked and retried (3 tries a session), not
//     flagged;
//   * levels the character holds beyond C0, or no longer holds, are never
//     credited (C0 is capped at the current total).
//
// Runs from the tick master every 2s; a flagged character costs one map lookup.
// SAFE TO DELETE once CUTOVER_TOTALS is known to be final (it is, while empty).
// =============================================================================

;(function () {
  // Credit multiplier — 1.0 = the full new-curve cost of the cutover total.
  var BACKPORT_MULT = 1.0
  // Bump the suffix (…_v2) to re-evaluate everyone after editing the table or the
  // multiplier; the ledger makes that pay differences only.
  var BACKPORT_FLAG = 'icraft_apt_cost_backport_v1'
  var BACKPORT_LEDGER = 'icraft_apt_cost_backport_levels'

  // '<player uuid>': <cumulative aptitude level on 2026-06-04>
  // (the uuid as `/data get entity <player> UUID` / the playerdata file name shows it)
  var CUTOVER_TOTALS = {
  }

  var BASELINE = 8                 // 8 aptitudes at level 1
  var MAX_CREDIT = 2000000000      // experienceLevel is an int
  var MAX_ATTEMPTS = 3             // per session, when a level grant does not stick

  var warned = {}
  var warnOnce = function (where, e) {
    if (warned[where]) return
    warned[where] = true
    try { console.warn('[IridescentCraft] #76 backport: ' + where + ' (logged once per script load): ' + e) } catch (ignored) {}
  }

  // Real fork cost formula (cumulative-level tree-doubling, config-driven). If
  // the fork is absent the migration is inert.
  var CostClass = null
  try {
    CostClass = Java.loadClass('com.seniors.justlevelingfork.network.packet.common.AptitudeLevelUpSP')
  } catch (e) {
    CostClass = null
    console.log('[IridescentCraft] #76 backport: AptitudeLevelUpSP not found — migration inert')
  }

  // Σ_{L=8}^{cumulative-1} requiredExperienceLevels(L), times the multiplier
  var creditFor = function (cumulative) {
    var sum = 0
    for (var level = BASELINE; level < cumulative; level++) {
      var cost = Number(CostClass.requiredExperienceLevels(level))
      if (cost > 0 && cost !== Infinity) sum += cost
    }
    var credit = Math.round(sum * BACKPORT_MULT)
    if (!(credit > 0)) return 0
    return credit > MAX_CREDIT ? MAX_CREDIT : credit
  }

  var keyOf = function (player) { return String(player.uuid.toString()) }
  var done = {}        // uuid -> true: settled (or given up on) for this session
  var attempts = {}    // uuid -> grant attempts this session

  var settle = function (player) {
    var key = keyOf(player)
    if (done[key] === true) return
    var pd = player.persistentData
    if (pd.getBoolean(BACKPORT_FLAG)) { done[key] = true; return }

    // All 8 aptitudes must read cleanly (>= 1); otherwise retry next pass and
    // flag nothing -- never settle off a partial read.
    var all = global.icraft.aptitude.all(player)
    if (!all) return
    var names = global.icraft.aptitude.names
    for (var i = 0; i < names.length; i++) {
      if (!(all[names[i]] >= 1)) return
    }
    var current = Number(all.total)

    var listed = CUTOVER_TOTALS.hasOwnProperty(key) ? Number(CUTOVER_TOTALS[key]) : BASELINE
    if (!(listed >= BASELINE)) listed = BASELINE
    var cutover = Math.min(Math.floor(listed), current)
    var target = creditFor(cutover)

    var already = Number(pd.getInt(BACKPORT_LEDGER))
    if (!(already > 0)) already = 0
    var owed = target - already

    if (owed > 0) {
      var tries = (attempts[key] || 0) + 1
      attempts[key] = tries
      if (tries > MAX_ATTEMPTS) {
        done[key] = true
        warnOnce('a level grant did not stick', player.username + ' is still owed ' + owed +
          ' levels after ' + MAX_ATTEMPTS + ' attempts -- will retry on the next login')
        return
      }
      var before = Math.floor(Number(player.xpLevel))
      if (!(before >= 0)) return                       // cannot measure a grant: do not make one
      // Book FIRST, then grant: whatever fails after this line can only leave
      // the character under-paid (and retried), never paid twice.
      pd.putInt(BACKPORT_LEDGER, already + owed)
      player.addXPLevels(owed)
      var granted = Math.floor(Number(player.xpLevel)) - before
      if (!(granted > 0)) granted = 0
      if (granted < owed) {
        // Something cancelled / cut the level change. Not flagged: the ledger
        // is corrected to what arrived, the rest is retried on a later pass.
        pd.putInt(BACKPORT_LEDGER, already + granted)
        return
      }
      try {
        player.tell('§b[Aptitudes] §fLevel-cost rework: credited §a' + granted +
          ' levels§f for the aptitude levels you held before the change (cumulative ' + cutover + ').')
      } catch (e2) {}
    }

    pd.putBoolean(BACKPORT_FLAG, true)
    done[key] = true
    console.log('[IridescentCraft] #76 backport: ' + player.username + ' settled -- cumulative now ' + current +
      ', cutover total ' + cutover + (CUTOVER_TOTALS.hasOwnProperty(key) ? ' (listed)' : ' (not listed: post-cutover character)') +
      ', credited ' + (owed > 0 ? owed : 0) + ' levels (ledger ' + (owed > 0 ? already + owed : already) + ')' +
      (cutover < current ? '; the 2026-06-04 rule on the current total would have been ' + creditFor(current) + ' levels' : ''))
  }

  if (CostClass) {
    global.registerServerTick('tick_aptitudeCostBackport', 40, 17, function (event) {
      event.server.players.forEach(function (player) {
        try {
          settle(player)
        } catch (e) { warnOnce('settling a player failed', e) }
      })
    })
  }

  PlayerEvents.loggedOut(function (event) {
    try {
      var key = keyOf(event.player)
      delete done[key]
      delete attempts[key]
    } catch (e) {}
  })
})()
