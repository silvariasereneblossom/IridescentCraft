// =============================================================================
// kubejs/server_scripts/quests/combat_kill_signals.js
//
// Bridges Apotheosis boss + champion kills to the Combat Heracles quests.
// Heracles has no "kill an affixed boss" task type (the boss is an affixed
// vanilla mob, not a distinct entity), so we detect it on death and fire a
// `heracles:dummy` task + set a persistent flag (so heracles_reconcile.js can
// back-fill it for existing characters).
//
// The detection NBT signals are the SAME ones witch_of_ink_progression.js
// already uses (proven): an Apotheosis boss carries `apoth.boss == "true"`, and
// an Apotheosis champion (affixed elite) carries a `champion` tag.
//
// RHINO-SAFETY: the death handler fires every kill, so it uses `var` (NOT
// const/let — KubeJS's Rhino throws "redeclaration of var" on a const/let in a
// repeatedly-invoked closure) and a SINGLE catch var. NBT getters (getString /
// contains) return ""/false on a missing key — they don't throw — so no nested
// try/catch is needed (multiple catch(e) in one function was the redeclaration
// trigger). RELOAD-SAFE: one EntityEvents.death listener; no item reg / Forge bus.
//
// 2026-10-10 (cost): the killer's two persistent flags are checked FIRST. Each
// signal is one-shot per character (the flag is what heracles_reconcile.js
// reads), so once a flag is set its `heracles dummy` command is not re-run on
// every later boss/champion kill, and once BOTH are set the handler returns
// before serialising the victim: `victim.nbt` writes the entity's ENTIRE NBT,
// which used to happen on every single player kill.
// =============================================================================

EntityEvents.death(event => {
  try {
    var src = event.source
    if (!src || !src.player) return
    var killer = src.player
    var pd = killer.persistentData
    // Already-recorded signals need no work (see the 2026-10-10 header note).
    var needBoss = !pd.getBoolean('icraft_killed_apoth_boss')
    var needChampion = !pd.getBoolean('icraft_killed_champion')
    if (!needBoss && !needChampion) return

    var victim = event.entity
    if (!victim) return
    var nbt = victim.nbt
    if (!nbt) return

    // --- Apotheosis boss (apoth.boss == "true") ---
    if (needBoss && nbt.getString('apoth.boss') === 'true') {
      pd.putBoolean('icraft_killed_apoth_boss', true)
      killer.server.runCommandSilent('heracles dummy killed_apoth_boss ' + killer.username)
    }

    // --- Apotheosis champion (affixed elite; carries a `champion` tag) ---
    if (needChampion && nbt.contains('champion')) {
      pd.putBoolean('icraft_killed_champion', true)
      killer.server.runCommandSilent('heracles dummy killed_champion ' + killer.username)
    }
  } catch (err) {
    // This fires on every kill: log a failure once, not once per kill.
    if (!global._combat_kill_signals_warned) {
      global._combat_kill_signals_warned = true
      console.warn('[combat_kill_signals] death handler threw (logging once): ' + err)
    }
  }
})

console.log('[combat_kill_signals] loaded — Apotheosis boss + champion kill -> Heracles dummy bridges')
