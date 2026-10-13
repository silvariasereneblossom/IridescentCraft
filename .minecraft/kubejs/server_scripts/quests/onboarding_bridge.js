// @file kubejs/server_scripts/quests/onboarding_bridge.js
// @events PlayerEvents.loggedOut, tick.player
// @live quest-bridge
// =============================================================================
// kubejs/server_scripts/quests/onboarding_bridge.js
//
// Bridges the two Heracles chapter-0 (Onboarding) quests whose only task is a
// `heracles:dummy` to the real game state. Without this script they can never
// complete, and the capstone gates the whole Combat chapter.
//
//   quest                         dummy value                          fires when
//   onboarding_first_level        jlf_level_5_reached                  any aptitude is at level 2 or more
//   onboarding_survivor_capstone  onboarding_survivor_capstone_check   its 11 dependencies are complete
//
// (The three "read a codex page" quests were removed 2026-06-03, #45 read-fix B:
// Patchouli is client-side and the server cannot see which page was opened.)
//
// HOW A DUMMY TASK IS COMPLETED
//   `/heracles dummy <id>` (op level 2) progresses every `heracles:dummy` task
//   with that id FOR THE COMMAND SOURCE -- it takes no player argument, so it is
//   run as `execute as <player> run heracles dummy <id>`. Heracles only looks at
//   COMPLETABLE quests (all dependencies complete, not yet complete itself): a
//   dummy fired while the quest is still locked is dropped without a trace.
//
// 2026-10-10 -- why neither quest ever completed, and what changed:
//   * The level was read from player.persistentData.PlayerPersisted.PlayerLevel.
//     JustLevelingFork has no such field. It keeps eight aptitude levels (each
//     starts at 1) in the player capability "justlevelingfork:aptitudes"; the
//     read here is the mod's own static accessor, AptitudeCapability.get(player)
//     (no NBT serialisation).
//       The quest reads the player's HIGHEST aptitude. The sum of all eight
//       (JLF's "global level") starts at 8, so it cannot be what the quest
//       means: it would be complete before the player did anything.
//   * Quest completion was read from player.persistentData.heracles.quests.
//     Heracles keeps progress in its own SavedData; that compound never
//     existed. Completion and dependencies are now asked of Heracles
//     (global.icraft.heracles, exported by quests/heracles_reconcile.js).
//   * The command was `heracles dummy <id> <player>`, which does not parse.
//   * The "already fired" list made each dummy a one-shot. A dummy that arrived
//     before the quest unlocked was lost AND never retried. There is no
//     one-shot and no flag of our own any more: a bridge is done when Heracles
//     says the quest is complete (so an admin `/heracles reset` re-arms it by
//     itself), and until then the dummy is fired on every pass in which the
//     quest is completable and the condition holds.
//
// 2026-10-11 -- the bar is one aptitude at level 2, not 5 (operator ruling):
//   The 10-10 fix made the quest completable at "highest aptitude >= 5", the
//   first skill milestone. Under the level-cost curve that is four purchases,
//   about 55 experience levels -- far too much for an onboarding quest that the
//   capstone (and through it the whole Combat chapter) waits on. The quest
//   teaches "open the screen and buy a level": one purchase, level 1 -> 2.
//   The dummy value and the task key still say "level_5". They are ids, never
//   shown to a player, and the quest JSON and this script must agree on them;
//   renaming them buys nothing and risks the two going out of step.
//
// COST: one pass per player per POLL_TICKS (5 s) on the player's own age, via
// the master tick dispatcher. Per bridge: one Heracles map lookup; for an
// unfinished onboarding_first_level also one capability lookup. A dummy command
// is only run when it can land (quest completable + condition met).
//
// Cross-refs:
//   - .minecraft/config/heracles/quests/onboarding/onboarding_*.json (consumers)
//   - .minecraft/wiki/design/heracles-json-shape.md §2.8 (dummy task semantics)
//
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var POLL_TICKS = 100
  // Without the Heracles API completion cannot be read; then a met condition
  // re-fires its dummy at most this often (ticks) instead of every pass.
  var BLIND_REFIRE_TICKS = 1200

  // Aptitude level that completes onboarding_first_level: any one aptitude at
  // this level or above (see header). The quest text states the same number.
  var APTITUDE_LEVEL = 2

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnKeyed = function (key, message) {
    global.icraft.core.warnOnce('quests/onboarding_bridge:' + key, '[onboarding_bridge] ' + message)
  }

  // ---- JustLevelingFork ------------------------------------------------------
  var aptitudeClass = null
  var aptitudeTried = false
  var getAptitudeClass = function () {
    if (!aptitudeTried) {
      aptitudeTried = true
      try {
        aptitudeClass = Java.loadClass('com.seniors.justlevelingfork.common.capability.AptitudeCapability')
      } catch (e) {
        aptitudeClass = null
        warnKeyed('jlf', 'JustLevelingFork AptitudeCapability not loadable -- onboarding_first_level cannot complete: ' + e)
      }
    }
    return aptitudeClass
  }

  // Highest of the player's aptitude levels, or 0 when it cannot be read (the
  // capability is not attached yet, JLF missing).
  var topAptitude = function (player) {
    var cls = getAptitudeClass()
    if (!cls) return 0
    var top = 0
    try {
      var cap = cls.get(player)
      if (!cap) return 0
      var it = cap.aptitudeLevel.values().iterator()
      while (it.hasNext()) {
        var level = Number(it.next())
        if (level > top) top = level
      }
    } catch (e) {
      warnKeyed('jlfread', 'reading the aptitude capability failed: ' + e)
      return 0
    }
    return top
  }

  // ---- the bridges ----------------------------------------------------------
  // ready(player): the game-side condition. The Heracles-side condition
  // ("every dependency complete") is checked for all of them.
  var BRIDGES = [
    {
      quest: 'onboarding_first_level',
      dummy: 'jlf_level_5_reached',
      ready: function (player) { return topAptitude(player) >= APTITUDE_LEVEL }
    },
    {
      quest: 'onboarding_survivor_capstone',
      dummy: 'onboarding_survivor_capstone_check',
      ready: function (player) { return true }
    }
  ]

  var heracles = function () {
    try {
      var api = global.icraft ? global.icraft.heracles : null
      if (api && api.available()) return api
    } catch (e) {}
    warnKeyed('heracles', 'global.icraft.heracles unavailable -- firing dummies blind (no completion check)')
    return null
  }

  // uuid|quest -> player.age of the last blind fire (Heracles API unavailable)
  var blindLast = {}

  var runBridge = function (player, bridge, api) {
    if (!api) {
      // Degraded: no completion / dependency information.
      if (!bridge.ready(player)) return
      var key = String(player.uuid) + '|' + bridge.quest
      var age = Number(player.age)
      if (blindLast.hasOwnProperty(key) && age >= blindLast[key] && (age - blindLast[key]) < BLIND_REFIRE_TICKS) return
      blindLast[key] = age
      player.server.runCommandSilent('execute as ' + player.username + ' run heracles dummy ' + bridge.dummy)
      return
    }

    // true = done, null = unreadable this pass (try again next pass)
    if (api.isComplete(player, bridge.quest) !== false) return
    if (!bridge.ready(player)) return
    // Locked quests ignore the dummy; wait until every dependency is complete.
    if (api.depsComplete(player, bridge.quest) !== true) return

    api.fireDummy(player, bridge.dummy)
    if (api.isComplete(player, bridge.quest) === true) {
      // liveness: the dummy completed its quest (the Level Up bridge among them)
      icraft.live.fired('quest-bridge')
      console.log('[onboarding_bridge] ' + player.username + ' completed ' + bridge.quest +
        ' (dummy ' + bridge.dummy + ')')
    } else {
      warnKeyed('nofire:' + bridge.quest, '`heracles dummy ' + bridge.dummy + '` ran for ' + player.username +
        ' but ' + bridge.quest + ' is still incomplete -- is the dummy value still in the quest JSON? Retrying every pass')
    }
  }

  // Offset 37 keeps it off the other 100-tick jobs' slots.
  global.registerPlayerTick('tick_onboardingBridge', POLL_TICKS, 37, function (event) {
    var player = event.player
    if (!player) return
    var api = heracles()
    for (var i = 0; i < BRIDGES.length; i++) {
      try {
        runBridge(player, BRIDGES[i], api)
      } catch (e) {
        warnKeyed('bridge:' + BRIDGES[i].quest, BRIDGES[i].quest + ' bridge failed: ' + e)
      }
    }
  })

  PlayerEvents.loggedOut(icraft.guard('quests/onboarding_bridge', 'PlayerEvents.loggedOut', function (event) {
    try {
      var prefix = String(event.player.uuid) + '|'
      for (var i = 0; i < BRIDGES.length; i++) delete blindLast[prefix + BRIDGES[i].quest]
    } catch (e) {}
  }))

  console.log('[iridescent/onboarding_bridge] loaded; bridging ' + BRIDGES.length +
    ' dummy quests (any aptitude at level ' + APTITUDE_LEVEL + '+, onboarding capstone), ' + POLL_TICKS + '-tick pass per player')
})()
