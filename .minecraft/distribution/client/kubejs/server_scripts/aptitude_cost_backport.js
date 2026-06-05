// =============================================================================
// IridescentCraft #76 — one-time aptitude level-cost BACKPORT
// File: kubejs/server_scripts/aptitude_cost_backport.js
//
// Existing characters leveled their aptitudes CHEAPLY under the old ~linear
// per-aptitude cost. #76 swapped to the cumulative-level tree-doubling curve,
// which makes the *next* level much more expensive — so a long-time character
// can be stranded (can't afford the next aptitude level under the new curve).
//
// Operator decision (credit aptitude investment as XP): grant each existing
// character, ONCE, the vanilla XP-LEVELS their current aptitude total would
// cost under the NEW curve, so their XP wallet reflects their investment.
//
//   C       = cumulative aptitude level = getGlobalLevel() = raw sum of the 8
//             aptitudes (each defaults to 1, so a brand-new char = 8).
//   credit  = Σ_{L=8}^{C-1} requiredExperienceLevels(L)   [vanilla levels]
//
// A fresh character (C=8) gets credit 0. The real JLF formula is called via
// Java.loadClass so the curve can't drift from the live config. Granted as
// vanilla LEVELS via `/xp add … levels` (giveExperienceLevels does NOT fire
// PlayerXpEvent.XpChange, so linearxp #77 does NOT rescale it; 1 level = 75 XP).
//
// Idempotent per character via persistentData flag. Tick-driven (not loggedIn)
// so the aptitude NBT is guaranteed loaded; a character is only flagged once its
// 8 aptitudes read cleanly, so a wrong/early read can never mis-credit.
//
// ⚠ MAGNITUDE (BACKPORT_MULT = 1.0): cumulative 30 → ~417 levels, 60 → ~1,417,
//   90 → ~3,417, 120 → ~7,417, 256 (all maxed) → ~179,000 levels. If that reads
//   too generous, lower BACKPORT_MULT (e.g. 0.5 / 0.25) and bump BACKPORT_FLAG
//   to re-run, or just delete this file.
//
// SAFE TO DELETE once every existing character has logged in at least once.
// =============================================================================

// Credit multiplier — 1.0 = the full new-curve cost of the character's aptitude
// total. Lower it if the full credit is too generous.
const BACKPORT_MULT = 1.0
// Bump the suffix (…_v2) to force a re-run after changing BACKPORT_MULT.
const BACKPORT_FLAG = 'icraft_apt_cost_backport_v1'

const BACKPORT_APTITUDES = [
  'strength', 'constitution', 'dexterity', 'defense',
  'intelligence', 'building', 'magic', 'luck'
]

// Real JLF cost formula (cumulative-level tree-doubling, config-driven). Loaded
// once; if JLF is absent the migration is inert.
let BackportCostClass = null
try {
  BackportCostClass = Java.loadClass('com.seniors.justlevelingfork.network.packet.common.AptitudeLevelUpSP')
} catch (e) {
  console.log('[IridescentCraft] #76 backport: AptitudeLevelUpSP not found — migration inert')
}

ServerEvents.tick(event => {
  if (!BackportCostClass) return
  let server = event.server
  // ~every 2s, offset to avoid stacking with other tick scripts.
  if ((server.tickCount % 40) !== 17) return

  server.players.forEach(function (player) {
    try {
      if (player.persistentData.getBoolean(BACKPORT_FLAG)) return

      // Cumulative aptitude level = raw sum of the 8 aptitudes (getGlobalLevel).
      // If any aptitude isn't readable yet (NBT not loaded), bail WITHOUT
      // flagging so we retry next pass — never credit off a partial read.
      let cumulative = 0
      let readOk = true
      for (let i = 0; i < BACKPORT_APTITUDES.length; i++) {
        let v = server.runCommandSilent(
          'data get entity ' + player.username +
          ' ForgeData.justlevelingfork.aptitude.' + BACKPORT_APTITUDES[i]
        )
        if (v && v > 0) { cumulative += v } else { readOk = false; break }
      }
      if (!readOk) return

      // credit = Σ_{L=8}^{C-1} requiredExperienceLevels(L)
      let credit = 0
      for (let L = 8; L < cumulative; L++) {
        credit += BackportCostClass.requiredExperienceLevels(L)
      }
      credit = Math.round(credit * BACKPORT_MULT)

      if (credit > 0) {
        server.runCommandSilent('xp add ' + player.username + ' ' + credit + ' levels')
        try {
          player.tell(
            '§b[Aptitudes] §fLevel-cost rework: credited §a' + credit +
            ' levels§f (≈' + (credit * 75) + ' XP) for your existing aptitude ' +
            'investment (cumulative ' + cumulative + ').'
          )
        } catch (e2) {}
        console.log('[IridescentCraft] #76 backport: ' + player.username +
          ' cumulative=' + cumulative + ' -> credited ' + credit + ' levels')
      }

      player.persistentData.putBoolean(BACKPORT_FLAG, true)
    } catch (e) {
      console.log('[IridescentCraft] #76 backport error for a player: ' + e)
    }
  })
})
