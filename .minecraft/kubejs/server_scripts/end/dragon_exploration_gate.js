// =============================================================================
// DRAGON EXPLORATION GATE — Players must explore The End before fighting Dragon
// File: kubejs/server_scripts/end/dragon_exploration_gate.js
//
// Design: When a player first enters The End, the Dragon fight does NOT start
// immediately. Instead, the dragon is removed on spawn until the player has
// completed End exploration milestones and uses a Dragon Summoning Crystal
// at the End Portal fountain (0,0).
//
// Exploration Requirements (tracked in persistentData):
//   1. Visited the outer End islands (>500 blocks from 0,0)
//   2. Visited an End City (>1000 blocks from 0,0)
//   3. Killed 5 Shulkers
//   4. Killed at least 50 Endermen in The End
//   5. (Implicit) Surviving and navigating The End
//
// Once all 4 milestones are met, the player can craft and use a
// kubejs:dragon_summoning_crystal at the fountain to start the fight.
//
// Dragon Fight Remastered config does NOT have a disable-initial-spawn
// option, so we use EntityEvents.spawned to remove the dragon until ready.
// =============================================================================

// ---- Constants ----
const END_EXPLORE_OUTER = 500     // Blocks from 0,0 for "outer islands"
const END_EXPLORE_CITY = 1000     // Blocks from 0,0 for "End City vicinity"
const END_ENDERMAN_KILLS = 50     // Required Enderman kills in The End
const END_SHULKER_KILLS = 5       // Required Shulker kills in The End
const DRAGON_SUMMON_RADIUS = 10   // Max distance from 0,0 to use crystal

// =============================================================================
// PREVENT NATURAL DRAGON SPAWN
// Remove the dragon if the player hasn't earned the fight yet.
// Only blocks the INITIAL spawn — respawned dragons (via End Crystals or
// Dragon Summoning Crystal) are allowed.
// =============================================================================

// Registry id of an entity. Through 0_lib_core.js when it loaded (the `type`
// property is shadowed on some mod entity classes); getType() is KubeJS's
// id-string accessor either way.
function endGateEntityId(entity) {
  try {
    if (global.icraft && global.icraft.core) return global.icraft.core.entityId(entity)
    return String(entity.getType())
  } catch (e) {
    return ''
  }
}

// One "why is there no dragon" notice per player, ever. Never throws: it runs
// right before the cancel below and must not be able to stop it.
function endGateNotify(endPlayers) {
  try {
    endPlayers.forEach(p => {
      if (!p.persistentData.getBoolean('icraft_end_notified')) {
        p.tell(Text.darkPurple('═══════════════════════════════════════'))
        p.tell(Text.darkPurple('  ◆ THE END: EXPLORATION REQUIRED ◆'))
        p.tell(Text.gray('  The Dragon senses your presence but will not'))
        p.tell(Text.gray('  appear until you have proven yourself.'))
        p.tell(Text.white(''))
        p.tell(Text.white('  Explore The End to unlock the Dragon fight:'))
        p.tell(Text.gray('  ○ Reach the outer End islands (500+ blocks out)'))
        p.tell(Text.gray('  ○ Travel 1000+ blocks out, where End Cities stand'))
        p.tell(Text.gray(`  ○ Slay ${END_SHULKER_KILLS} Shulkers`))
        p.tell(Text.gray(`  ○ Defeat ${END_ENDERMAN_KILLS} Endermen in The End`))
        p.tell(Text.white(''))
        p.tell(Text.gray('  Then craft a §5Dragon Summoning Crystal§7, hold it'))
        p.tell(Text.gray('  and sneak at the End Portal fountain (0,0).'))
        p.tell(Text.darkPurple('═══════════════════════════════════════'))
        p.persistentData.putBoolean('icraft_end_notified', true)
      }
    })
  } catch (e) {}
}

// The dragon fight retries the spawn about once a minute for as long as a
// player stands in the arena, so the "blocked" line is logged once per load.
var endGateBlockLogged = false

EntityEvents.spawned(icraft.guard('end/dragon_exploration_gate', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (endGateEntityId(entity) !== 'minecraft:ender_dragon') return

  // Check if ANY player in The End has the exploration flag set
  let server = entity.level.server
  let endPlayers = []
  server.players.forEach(p => {
    if (p.level.dimension.toString() === 'minecraft:the_end') {
      endPlayers.push(p)
    }
  })

  if (endPlayers.length === 0) return

  // If ANY player in The End has completed exploration OR has the
  // dragon_summoned flag, allow the dragon to spawn
  let anyReady = false
  for (let p of endPlayers) {
    if (p.persistentData.getBoolean('icraft_dragon_summoned') ||
        p.persistentData.getBoolean('icraft_dragon_killed_once')) {
      anyReady = true
      break
    }
  }

  if (!anyReady) {
    // Remove the dragon — exploration not complete.
    // Notice and log FIRST: cancel() leaves the handler by throwing, so the
    // code that used to follow it (this notice) never ran -- until 2026-10-10
    // the dragon was silently missing and nobody was told why.
    endGateNotify(endPlayers)
    if (!endGateBlockLogged) {
      endGateBlockLogged = true
      console.log('[IridescentCraft] Dragon spawn blocked — no player in The End has summoned it yet (logged once per load)')
    }
    event.cancel()
  }
}))

// =============================================================================
// END EXPLORATION TRACKING
// Runs every 10 seconds for players in The End
// =============================================================================

global.tick_endExplorationTracking = (event) => {
  let player = event.player
  let dim = player.level.dimension.toString()
  if (dim !== 'minecraft:the_end') return

  let pdata = player.persistentData

  // Skip if already fully explored
  if (pdata.getBoolean('icraft_end_explored')) return

  // Initialize exploration data on first End entry
  if (!pdata.contains('icraft_end_enderman_kills')) {
    pdata.putInt('icraft_end_enderman_kills', 0)
    pdata.putBoolean('icraft_end_outer', false)
    pdata.putBoolean('icraft_end_city', false)
    pdata.putBoolean('icraft_end_shulker', false)
  }

  // Track distance from 0,0 (X/Z only)
  let distSq = player.x * player.x + player.z * player.z

  // Milestone: Outer islands (500+ blocks from 0,0)
  if (!pdata.getBoolean('icraft_end_outer') && distSq >= END_EXPLORE_OUTER * END_EXPLORE_OUTER) {
    pdata.putBoolean('icraft_end_outer', true)
    player.tell(Text.lightPurple('  ◆ End Exploration: Outer Islands reached!'))
    player.server.runCommandSilent(
      `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
    )
    checkEndExploration(player)
  }

  // Milestone: End City territory (1000+ blocks from 0,0; distance only, no structure check)
  if (!pdata.getBoolean('icraft_end_city') && distSq >= END_EXPLORE_CITY * END_EXPLORE_CITY) {
    pdata.putBoolean('icraft_end_city', true)
    player.tell(Text.lightPurple('  ◆ End Exploration: End City territory reached (1000 blocks out)!'))
    player.server.runCommandSilent(
      `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
    )
    checkEndExploration(player)
  }
}
global.registerPlayerTick('tick_endExplorationTracking', 200, 100)

// =============================================================================
// KILL TRACKING IN THE END
// =============================================================================

EntityEvents.death(icraft.guard('end/dragon_exploration_gate', 'EntityEvents.death', event => {
  let entity = event.entity
  let source = event.source
  if (!source || !source.player) return

  let player = source.player
  if (player.level.dimension.toString() !== 'minecraft:the_end') return

  let pdata = player.persistentData
  if (pdata.getBoolean('icraft_end_explored')) return

  let entityId = endGateEntityId(entity)

  // Shulker kills (need 5)
  if (entityId === 'minecraft:shulker') {
    let shulkerKills = pdata.getInt('icraft_end_shulker_kills') + 1
    pdata.putInt('icraft_end_shulker_kills', shulkerKills)

    if (shulkerKills === END_SHULKER_KILLS) {
      pdata.putBoolean('icraft_end_shulker', true)
      player.tell(Text.lightPurple(`  ◆ End Exploration: ${END_SHULKER_KILLS} Shulkers slain!`))
      player.server.runCommandSilent(
        `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
      )
      checkEndExploration(player)
    } else if (shulkerKills < END_SHULKER_KILLS) {
      player.tell(Text.gray(`  End Shulkers: ${shulkerKills}/${END_SHULKER_KILLS}`))
    }
  }

  // Enderman kills
  if (entityId === 'minecraft:enderman') {
    let kills = pdata.getInt('icraft_end_enderman_kills') + 1
    pdata.putInt('icraft_end_enderman_kills', kills)

    if (kills === END_ENDERMAN_KILLS) {
      player.tell(Text.lightPurple(`  ◆ End Exploration: ${END_ENDERMAN_KILLS} Endermen defeated!`))
      player.server.runCommandSilent(
        `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
      )
      checkEndExploration(player)
    } else if (kills % 5 === 0 && kills < END_ENDERMAN_KILLS) {
      player.tell(Text.gray(`  End Endermen: ${kills}/${END_ENDERMAN_KILLS}`))
    }
  }
}))

// =============================================================================
// CHECK IF ALL EXPLORATION MILESTONES MET
// =============================================================================

function checkEndExploration(player) {
  let pdata = player.persistentData
  let outer = pdata.getBoolean('icraft_end_outer')
  let city = pdata.getBoolean('icraft_end_city')
  let shulker = pdata.getBoolean('icraft_end_shulker')
  let endermen = pdata.getInt('icraft_end_enderman_kills') >= END_ENDERMAN_KILLS

  if (outer && city && shulker && endermen) {
    pdata.putBoolean('icraft_end_explored', true)

    player.tell(Text.gold('═══════════════════════════════════════'))
    player.tell(Text.gold('  ★ END EXPLORATION COMPLETE ★'))
    player.tell(Text.white('  You have proven yourself worthy.'))
    player.tell(Text.gray('  Craft a §5Dragon Summoning Crystal§7, hold it in'))
    player.tell(Text.gray('  your main hand and sneak at the End Portal'))
    player.tell(Text.gray('  fountain (0,0) to summon the Ender Dragon!'))
    player.tell(Text.gold('═══════════════════════════════════════'))

    player.server.runCommandSilent(
      `playsound minecraft:ui.toast.challenge_complete player ${player.username}`
    )

    console.log(`[IridescentCraft] ${player.username} completed End exploration`)
  } else {
    // Progress report
    let done = (outer ? 1 : 0) + (city ? 1 : 0) + (shulker ? 1 : 0) + (endermen ? 1 : 0)
    player.tell(Text.gray(`  End Exploration: ${done}/4 milestones complete`))
  }
}

// =============================================================================
// DRAGON SUMMONING CRYSTAL — USE AT FOUNTAIN
// =============================================================================

// No right-click handler: a server poll every 40 ticks. A player in The End
// who has finished exploration, holds the crystal in the MAIN hand, stands
// within DRAGON_SUMMON_RADIUS of the fountain and is SNEAKING at the poll uses
// it up and starts the fight. The texts say "hold it and sneak" for that reason.

global.tick_dragonSummonCrystal = (event) => {
  event.server.players.forEach(player => {
    if (player.level.dimension.toString() !== 'minecraft:the_end') return

    let held = player.mainHandItem
    if (held.isEmpty() || held.id !== 'kubejs:dragon_summoning_crystal') return

    let pdata = player.persistentData
    if (!pdata.getBoolean('icraft_end_explored')) {
      return
    }

    let distSq = player.x * player.x + player.z * player.z
    if (distSq > DRAGON_SUMMON_RADIUS * DRAGON_SUMMON_RADIUS) return

    if (!player.crouching) return

    held.shrink(1)
    pdata.putBoolean('icraft_dragon_summoned', true)

    player.tell(Text.gold('═══════════════════════════════════════'))
    player.tell(Text.gold('  ★ THE DRAGON AWAKENS ★'))
    player.tell(Text.white('  The End shudders as ancient power stirs...'))
    player.tell(Text.gray('  Prepare yourself for the fight!'))
    player.tell(Text.gold('═══════════════════════════════════════'))

    player.server.tell(
      Text.yellow(`★ ${player.username} has summoned the Ender Dragon!`)
    )

    // `execute in minecraft:the_end`: a bare server command runs in the
    // OVERWORLD, so these four crystals used to be summoned at 0 64 +-3 there.
    ;[[0, -3], [0, 3], [3, 0], [-3, 0]].forEach(xz => {
      player.server.runCommandSilent(
        `execute in minecraft:the_end run summon minecraft:end_crystal ${xz[0]} 64 ${xz[1]} {ShowBottom:1b}`
      )
    })

    player.server.runCommandSilent(
      `playsound minecraft:entity.ender_dragon.growl player ${player.username} 0 64 0 2 0.5`
    )
    player.server.runCommandSilent(
      `playsound minecraft:block.end_portal.spawn player ${player.username} 0 64 0 2 0.8`
    )

    console.log(`[IridescentCraft] ${player.username} summoned the Ender Dragon!`)
  })
}
global.registerServerTick('tick_dragonSummonCrystal', 40, 10)

// =============================================================================
// POST-DRAGON: Mark dragon as killed for future spawns
// =============================================================================

EntityEvents.death(icraft.guard('end/dragon_exploration_gate#2', 'EntityEvents.death', event => {
  let entity = event.entity
  if (endGateEntityId(entity) !== 'minecraft:ender_dragon') return

  // Mark ALL players in The End as having killed the dragon at least once
  entity.level.server.players.forEach(p => {
    if (p.level.dimension.toString() === 'minecraft:the_end') {
      p.persistentData.putBoolean('icraft_dragon_killed_once', true)
      p.persistentData.putBoolean('icraft_dragon_summoned', true)
      // Future dragon respawns (via End Crystals) won't be blocked
    }
  })
}))

// =============================================================================
// RECIPE: Dragon Summoning Crystal
// =============================================================================

ServerEvents.recipes(icraft.guard('end/dragon_exploration_gate', 'ServerEvents.recipes', event => {
  // Dragon Summoning Crystal: 4x Ender Pearl + 2x End Crystal + 1x Nether Star.
  //
  // 2026-10-10: this used to need 2x kubejs:reality_progression_token_t4 as
  // well. That legacy token has had no source since the token currency was
  // retired (2026-06-01), and the End Crystal recipe was removed outright in
  // recipes/tier_gated_recipes.js, so the crystal -- the ONLY way to start the
  // dragon fight (see the spawn block above) -- could not be crafted at all.
  // The tier gate is now the player's stage: this recipe and the restored
  // vanilla End Crystal recipe are both locked to tier_4 in
  // gates/astages_restrictions.js (STAGE-GATED RECIPES).
  event.shaped('kubejs:dragon_summoning_crystal', [
    'PCP',
    ' N ',
    'PCP'
  ], {
    P: 'minecraft:ender_pearl',
    C: 'minecraft:end_crystal',
    N: 'minecraft:nether_star'
  }).id('icraft:dragon_summoning_crystal')
}))

// =============================================================================
// EXPLORATION PROGRESS COMMAND (check via /trigger or chat)
// Show current progress to the player
// =============================================================================

// Use a simple tick check — when a player holds a compass in The End,
// show exploration progress
PlayerEvents.inventoryChanged(icraft.guard('end/dragon_exploration_gate', 'PlayerEvents.inventoryChanged', event => {
  if (event.item.id !== 'minecraft:compass') return
  let player = event.player
  if (player.level.dimension.toString() !== 'minecraft:the_end') return

  let pdata = player.persistentData
  if (pdata.getBoolean('icraft_end_explored')) {
    player.tell(Text.lightPurple('  ◆ End Exploration: COMPLETE. Hold a Dragon Summoning Crystal and sneak at the fountain (0,0)!'))
    return
  }

  let outer = pdata.getBoolean('icraft_end_outer')
  let city = pdata.getBoolean('icraft_end_city')
  let shulker = pdata.getBoolean('icraft_end_shulker')
  let kills = pdata.getInt('icraft_end_enderman_kills')
  let endermen = kills >= END_ENDERMAN_KILLS

  player.tell(Text.darkPurple('  ◆ End Exploration Progress:'))
  player.tell(Text.gray(`    ${outer ? '§a✓' : '§c○'} §7Outer Islands (500+ blocks from center)`))
  player.tell(Text.gray(`    ${city ? '§a✓' : '§c○'} §7End City Territory (1000+ blocks from center)`))
  let shulkerKills = pdata.getInt('icraft_end_shulker_kills')
  player.tell(Text.gray(`    ${shulker ? '§a✓' : '§c○'} §7Slay Shulkers (${Math.min(shulkerKills, END_SHULKER_KILLS)}/${END_SHULKER_KILLS})`))
  player.tell(Text.gray(`    ${endermen ? '§a✓' : '§c○'} §7Defeat Endermen (${Math.min(kills, END_ENDERMAN_KILLS)}/${END_ENDERMAN_KILLS})`))
}))

console.log('[IridescentCraft] Dragon exploration gate loaded')
console.log('  - Dragon blocked until End exploration complete')
console.log('  - 4 milestones: outer islands, End City, 5 Shulkers, 50 Endermen')
console.log('  - Dragon Summoning Crystal required to start fight')
