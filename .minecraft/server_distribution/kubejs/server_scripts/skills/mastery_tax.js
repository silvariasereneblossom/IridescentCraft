// =============================================================================
// MASTERY TAX — Escalating XP cost for JustLeveling aptitude breadth
// =============================================================================
// JustLeveling's base cost formula is linear (level + firstCost - 1).
// This script adds a quadratic "mastery tax" that drains bonus XP when a
// player's total aptitude levels exceed thresholds, making it:
//   - 1st aptitude (levels 8-32): Free, natural T1-T2 progression
//   - 2nd aptitude (levels 33-64): Moderate tax, mid-late T3
//   - 3rd aptitude (levels 65-96): Heavy tax, early-mid T4
//   - 4th+ aptitude (levels 97+): Brutal, deep T4 / RF Dimensions
//
// Checks every 2 seconds. When total aptitude levels increase, drains
// bonus XP based on the new total. Base aptitude levels start at 1 each
// (8 aptitudes × 1 = 8 baseline), so effective investment = total - 8.
// =============================================================================

const APTITUDE_NAMES = [
  'strength', 'constitution', 'dexterity', 'defense',
  'intelligence', 'building', 'magic', 'luck'
]

// Baseline: all aptitudes start at level 1 = 8 total
const BASELINE = 8

// Tax curve: XP points drained PER LEVEL based on total invested levels
// Uses a piecewise function:
//   0-32 invested (1st aptitude): no tax
//   33-64 invested (2nd aptitude): 50 * (invested - 32) XP points per level
//   65-96 invested (3rd aptitude): 200 * (invested - 64) + 1600 XP points per level
//   97+ invested (4th+ aptitude): 800 * (invested - 96) + 8000 XP points per level
function getMasteryTax(investedLevels) {
  if (investedLevels <= 32) return 0
  if (investedLevels <= 64) {
    // Ramps from 0 to 1,600 XP across the 2nd aptitude
    return Math.floor(50 * (investedLevels - 32))
  }
  if (investedLevels <= 96) {
    // Ramps from 1,600 to 8,000 XP across the 3rd aptitude
    return Math.floor(200 * (investedLevels - 64) + 1600)
  }
  // 97+: Ramps from 8,000+ XP per level — brutal
  return Math.floor(800 * (investedLevels - 96) + 8000)
}

// Track previous total per player to detect level-ups
let playerPrevTotals = {}

global.tick_masteryTax = (event) => {
  let server = event.server

  server.players.forEach(player => {
    let uuid = player.uuid.toString()

    // Read total aptitude levels via command
    let total = 0
    APTITUDE_NAMES.forEach(apt => {
      try {
        // JustLeveling stores aptitude levels in player capability NBT
        // We can read them via the data command
        let result = server.runCommandSilent(
          `data get entity ${player.username} ForgeData.justlevelingfork.aptitude.${apt}`
        )
        // runCommandSilent returns the value for data get
        total += result
      } catch (e) {
        // If command fails, assume level 1 (default)
        total += 1
      }
    })

    let prevTotal = playerPrevTotals[uuid] || total

    if (total > prevTotal) {
      // Player leveled up! Calculate tax for each new level gained
      let levelsGained = total - prevTotal
      let invested = total - BASELINE

      // Calculate cumulative tax for the levels gained
      let totalTax = 0
      for (let i = 0; i < levelsGained; i++) {
        let levelAt = invested - levelsGained + i + 1
        totalTax += getMasteryTax(levelAt)
      }

      if (totalTax > 0) {
        // Drain the tax XP from the player
        // Use negative levels via xp command (drains XP points)
        server.runCommandSilent(`xp add ${player.username} -${totalTax} points`)

        // Notify the player
        let investedNow = total - BASELINE
        let tierLabel = investedNow <= 32 ? '' :
                        investedNow <= 64 ? ' §e(Mastery Tax: moderate)' :
                        investedNow <= 96 ? ' §6(Mastery Tax: heavy)' :
                        ' §c(Mastery Tax: extreme)'
        player.tell(`§7[Mastery] §fAptitude level ${investedNow}/${256 - BASELINE}${tierLabel} §7— §f${totalTax} bonus XP drained`)
      }
    }

    playerPrevTotals[uuid] = total
  })
}
global.registerServerTick('tick_masteryTax', 40, 0)

// Reset tracking on player login
PlayerEvents.loggedIn(event => {
  let uuid = event.player.uuid.toString()
  delete playerPrevTotals[uuid]
})

// Log the tax curve on load
ServerEvents.loaded(event => {
  console.log('[IridescentCraft] Mastery Tax loaded')
  console.log('  Tax curve (XP per level-up):')
  console.log('    Levels 1-32 (1st aptitude): 0 tax')
  console.log('    Level 33: ' + getMasteryTax(33) + ' XP')
  console.log('    Level 48: ' + getMasteryTax(48) + ' XP')
  console.log('    Level 64: ' + getMasteryTax(64) + ' XP')
  console.log('    Level 65: ' + getMasteryTax(65) + ' XP')
  console.log('    Level 80: ' + getMasteryTax(80) + ' XP')
  console.log('    Level 96: ' + getMasteryTax(96) + ' XP')
  console.log('    Level 97: ' + getMasteryTax(97) + ' XP')
  console.log('    Level 112: ' + getMasteryTax(112) + ' XP')
  console.log('    Level 128: ' + getMasteryTax(128) + ' XP')
  console.log('    Level 200: ' + getMasteryTax(200) + ' XP')
  console.log('    Level 248: ' + getMasteryTax(248) + ' XP')
})
