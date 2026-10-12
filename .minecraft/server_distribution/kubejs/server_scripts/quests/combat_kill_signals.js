// =============================================================================
// kubejs/server_scripts/quests/combat_kill_signals.js
//
// Bridges Apotheosis boss + champion kills to the Combat Heracles quests
// (com_apotheosis_boss / com_champion). Heracles has no "kill an affixed mob"
// task type (the mob is an ordinary entity carrying Apotheosis data, not a
// distinct entity type), so the kill is detected here and turned into a
// `heracles:dummy` task plus a persistent flag. heracles_reconcile.js reads
// the flag and force-completes the quest if the dummy arrived while the quest
// was still locked (Heracles drops a dummy for a quest whose dependencies are
// not complete yet).
//
// WHAT IS DETECTED (both read from the victim's FORGE persistent data, where
// Apotheosis writes them -- `victim.forgePersistentData`; no NBT serialisation):
//   * Apotheosis boss      `apoth.boss` = 1b          (ApothBoss.initBoss)
//   * Apotheosis champion  `apoth.miniboss` present   (BossEvents.minibosses writes the
//                          miniboss id, ApothMiniboss then replaces it with 1b)
//     "Champion" is the quest's name for Apotheosis' elite tier, which the mod
//     itself calls a miniboss (Undead Knight, Honeyed Archer, Withering
//     Archer, ...): tougher versions of common mobs, one step below a boss.
//     The Champions mod the old `champion` tag came from is not installed.
//
// 2026-10-10 -- why neither quest ever completed:
//   * the check was `victim.nbt.getString('apoth.boss') === 'true'`: a root-level
//     string. Apotheosis writes a BOOLEAN into the Forge persistent data (saved
//     under ForgeData), so it never matched.
//   * nothing in the pack writes a `champion` tag.
//   * the command was `heracles dummy <id> <player>`. The dummy command takes
//     no player argument (it acts on the command source), so it did not parse.
//     It is now `execute as <player> run heracles dummy <id>`.
//
// COST: the killer's two flags are checked FIRST. Each signal is one-shot per
// character, so once both are set the handler returns after two boolean reads,
// before it touches the victim.
//
// RELOAD-SAFE: one EntityEvents.death listener; no item reg / Forge bus.
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var FLAG_BOSS = 'icraft_killed_apoth_boss'
  var FLAG_CHAMPION = 'icraft_killed_champion'

  var warned = false

  var fireDummy = function (killer, dummyId) {
    killer.server.runCommandSilent('execute as ' + killer.username + ' run heracles dummy ' + dummyId)
  }

  EntityEvents.death(icraft.guard('quests/combat_kill_signals', 'EntityEvents.death', function (event) {
    try {
      var src = event.source
      if (!src) return
      var killer = src.player
      if (!killer) return
      var pd = killer.persistentData
      // Already-recorded signals need no work (see COST in the header).
      var needBoss = !pd.getBoolean(FLAG_BOSS)
      var needChampion = !pd.getBoolean(FLAG_CHAMPION)
      if (!needBoss && !needChampion) return

      var victim = event.entity
      if (!victim) return
      var forgeData = victim.forgePersistentData
      if (!forgeData) return

      // --- Apotheosis boss ---
      if (needBoss && forgeData.getBoolean('apoth.boss')) {
        pd.putBoolean(FLAG_BOSS, true)
        fireDummy(killer, 'killed_apoth_boss')
      }

      // --- Apotheosis champion (= miniboss, see header) ---
      if (needChampion && forgeData.contains('apoth.miniboss')) {
        pd.putBoolean(FLAG_CHAMPION, true)
        fireDummy(killer, 'killed_champion')
      }
    } catch (err) {
      // This fires on every kill: log a failure once, not once per kill.
      if (!warned) {
        warned = true
        console.warn('[combat_kill_signals] death handler threw (logging once): ' + err)
      }
    }
  }))

  console.log('[combat_kill_signals] loaded — Apotheosis boss (apoth.boss) + champion (apoth.miniboss) kill -> Heracles dummy bridges')
})()
