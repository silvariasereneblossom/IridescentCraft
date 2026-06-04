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
// RELOAD-SAFE: a single EntityEvents.death listener. No item creation, no Forge
// bus, no global tick.
// =============================================================================

EntityEvents.death(event => {
  try {
    const source = event.source
    if (!source || !source.player) return
    const player = source.player
    const entity = event.entity
    if (!entity || !entity.nbt) return
    const pd = player.persistentData

    // --- Apotheosis boss (apoth.boss == "true") ---
    let isApothBoss = false
    try { isApothBoss = entity.nbt.getString('apoth.boss') === 'true' } catch (e) {}
    if (isApothBoss) {
      pd.putBoolean('icraft_killed_apoth_boss', true)
      player.server.runCommandSilent('heracles dummy killed_apoth_boss ' + player.username)
    }

    // --- Apotheosis champion (affixed elite; carries a `champion` tag) ---
    let isChampion = false
    try { isChampion = entity.nbt.contains('champion') } catch (e) {}
    if (isChampion) {
      pd.putBoolean('icraft_killed_champion', true)
      player.server.runCommandSilent('heracles dummy killed_champion ' + player.username)
    }
  } catch (e) {
    console.warn('[combat_kill_signals] death handler threw: ' + e)
  }
})

console.log('[combat_kill_signals] loaded — Apotheosis boss + champion kill -> Heracles dummy bridges')
