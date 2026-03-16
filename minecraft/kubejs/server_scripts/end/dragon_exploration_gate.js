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

EntityEvents.spawned(event => {
  let entity = event.entity
  if (entity.type.toString() !== 'minecraft:ender_dragon') return

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
    // Remove the dragon — exploration not complete
    event.cancel()
    console.log('[IridescentCraft] Dragon spawn blocked — no player has completed End exploration')

    // Notify players in The End
    endPlayers.forEach(p => {
      if (!p.persistentData.getBoolean('icraft_end_notified')) {
        p.tell(Text.darkPurple('═══════════════════════════════════════'))
        p.tell(Text.darkPurple('  ◆ THE END — EXPLORATION REQUIRED ◆'))
        p.tell(Text.gray('  The Dragon senses your presence but will not'))
        p.tell(Text.gray('  manifest until you have proven yourself.'))
        p.tell(Text.white(''))
        p.tell(Text.white('  Explore The End to unlock the Dragon fight:'))
        p.tell(Text.gray('  ○ Reach the outer End islands (500+ blocks out)'))
        p.tell(Text.gray('  ○ Find an End City (1000+ blocks out)'))
        p.tell(Text.gray('  ○ Slay 5 Shulkers'))
        p.tell(Text.gray('  ○ Defeat 50 Endermen in The End'))
        p.tell(Text.white(''))
        p.tell(Text.gray('  Then craft a §5Dragon Summoning Crystal§7 and'))
        p.tell(Text.gray('  use it at the End Portal fountain.'))
        p.tell(Text.darkPurple('═══════════════════════════════════════'))
        p.persistentData.putBoolean('icraft_end_notified', true)
      }
    })
  }
})

// =============================================================================
// END EXPLORATION TRACKING
// Runs every 10 seconds for players in The End
// =============================================================================

PlayerEvents.tick(event => {
  if (event.player.age % 200 !== 100) return // Every 10s, offset from other ticks

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

  // Milestone: End City vicinity (1000+ blocks from 0,0)
  if (!pdata.getBoolean('icraft_end_city') && distSq >= END_EXPLORE_CITY * END_EXPLORE_CITY) {
    pdata.putBoolean('icraft_end_city', true)
    player.tell(Text.lightPurple('  ◆ End Exploration: End City territory discovered!'))
    player.server.runCommandSilent(
      `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
    )
    checkEndExploration(player)
  }
})

// =============================================================================
// KILL TRACKING IN THE END
// =============================================================================

EntityEvents.death(event => {
  let entity = event.entity
  let source = event.source
  if (!source || !source.player) return

  let player = source.player
  if (player.level.dimension.toString() !== 'minecraft:the_end') return

  let pdata = player.persistentData
  if (pdata.getBoolean('icraft_end_explored')) return

  let entityId = entity.type.toString()

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
      player.tell(Text.lightPurple('  ◆ End Exploration: 20 Endermen defeated!'))
      player.server.runCommandSilent(
        `playsound minecraft:block.end_portal.spawn player ${player.username} ~ ~ ~ 0.5`
      )
      checkEndExploration(player)
    } else if (kills % 5 === 0 && kills < END_ENDERMAN_KILLS) {
      player.tell(Text.gray(`  End Endermen: ${kills}/${END_ENDERMAN_KILLS}`))
    }
  }
})

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
    player.tell(Text.gray('  Craft a §5Dragon Summoning Crystal§7 and'))
    player.tell(Text.gray('  use it at the End Portal fountain (0,0)'))
    player.tell(Text.gray('  to summon the Ender Dragon!'))
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

// Detect right-click use of the crystal near 0,0 in The End
// Uses inventoryChanged as a proxy — when the player holds the crystal and
// is near the fountain, consume it and start the dragon fight.
// Alternative: use ServerEvents.tick to check held item near position.

ServerEvents.tick(event => {
  if (event.server.tickCount % 20 !== 10) return // Every 1 second

  event.server.players.forEach(player => {
    if (player.level.dimension.toString() !== 'minecraft:the_end') return

    let held = player.mainHandItem
    if (held.isEmpty() || held.id !== 'kubejs:dragon_summoning_crystal') return

    let pdata = player.persistentData
    if (!pdata.getBoolean('icraft_end_explored')) {
      // Don't consume — player hasn't explored enough
      return
    }

    // Check if player is near 0,0 (the fountain)
    let distSq = player.x * player.x + player.z * player.z
    if (distSq > DRAGON_SUMMON_RADIUS * DRAGON_SUMMON_RADIUS) return

    // Check if player is sneaking (deliberate activation)
    if (!player.crouching) return

    // Consume the crystal and summon the dragon
    held.shrink(1)
    pdata.putBoolean('icraft_dragon_summoned', true)

    player.tell(Text.gold('═══════════════════════════════════════'))
    player.tell(Text.gold('  ★ THE DRAGON AWAKENS ★'))
    player.tell(Text.white('  The End shudders as ancient power stirs...'))
    player.tell(Text.gray('  Prepare yourself for the ultimate battle!'))
    player.tell(Text.gold('═══════════════════════════════════════'))

    // Announce server-wide
    player.server.tell(
      Text.yellow(`★ ${player.username} has summoned the Ender Dragon!`)
    )

    // Place 4 End Crystals on the obsidian pillars to trigger respawn
    // This uses the vanilla dragon respawn mechanic
    player.server.runCommandSilent(
      `summon minecraft:end_crystal 0 64 -3 {ShowBottom:1b}`
    )
    player.server.runCommandSilent(
      `summon minecraft:end_crystal 0 64 3 {ShowBottom:1b}`
    )
    player.server.runCommandSilent(
      `summon minecraft:end_crystal 3 64 0 {ShowBottom:1b}`
    )
    player.server.runCommandSilent(
      `summon minecraft:end_crystal -3 64 0 {ShowBottom:1b}`
    )

    // Sound effects
    player.server.runCommandSilent(
      `playsound minecraft:entity.ender_dragon.growl player ${player.username} 0 64 0 2 0.5`
    )
    player.server.runCommandSilent(
      `playsound minecraft:block.end_portal.spawn player ${player.username} 0 64 0 2 0.8`
    )

    console.log(`[IridescentCraft] ${player.username} summoned the Ender Dragon!`)
  })
})

// =============================================================================
// POST-DRAGON: Mark dragon as killed for future spawns
// =============================================================================

EntityEvents.death(event => {
  let entity = event.entity
  if (entity.type.toString() !== 'minecraft:ender_dragon') return

  let source = event.source
  // Mark ALL players in The End as having killed the dragon at least once
  entity.level.server.players.forEach(p => {
    if (p.level.dimension.toString() === 'minecraft:the_end') {
      p.persistentData.putBoolean('icraft_dragon_killed_once', true)
      p.persistentData.putBoolean('icraft_dragon_summoned', true)
      // Future dragon respawns (via End Crystals) won't be blocked
    }
  })
})

// =============================================================================
// RECIPE: Dragon Summoning Crystal
// =============================================================================

ServerEvents.recipes(event => {
  // Dragon Summoning Crystal: 4x Ender Pearl + 2x End Crystal + 2x T4 Token + 1x Nether Star
  event.shaped('kubejs:dragon_summoning_crystal', [
    'PCP',
    'TNT',
    'PCP'
  ], {
    P: 'minecraft:ender_pearl',
    C: 'minecraft:end_crystal',
    T: 'kubejs:reality_progression_token_t4',
    N: 'minecraft:nether_star'
  }).id('icraft:dragon_summoning_crystal')
})

// =============================================================================
// EXPLORATION PROGRESS COMMAND (check via /trigger or chat)
// Show current progress to the player
// =============================================================================

// Use a simple tick check — when a player holds a compass in The End,
// show exploration progress
PlayerEvents.inventoryChanged(event => {
  if (event.item.id !== 'minecraft:compass') return
  let player = event.player
  if (player.level.dimension.toString() !== 'minecraft:the_end') return

  let pdata = player.persistentData
  if (pdata.getBoolean('icraft_end_explored')) {
    player.tell(Text.lightPurple('  ◆ End Exploration: COMPLETE — Craft and use a Dragon Summoning Crystal!'))
    return
  }

  let outer = pdata.getBoolean('icraft_end_outer')
  let city = pdata.getBoolean('icraft_end_city')
  let shulker = pdata.getBoolean('icraft_end_shulker')
  let kills = pdata.getInt('icraft_end_enderman_kills')
  let endermen = kills >= END_ENDERMAN_KILLS

  player.tell(Text.darkPurple('  ◆ End Exploration Progress:'))
  player.tell(Text.gray(`    ${outer ? '§a✓' : '§c○'} §7Outer Islands (500+ blocks from center)`))
  player.tell(Text.gray(`    ${city ? '§a✓' : '§c○'} §7End City Territory (1000+ blocks)`))
  let shulkerKills = pdata.getInt('icraft_end_shulker_kills')
  player.tell(Text.gray(`    ${shulker ? '§a✓' : '§c○'} §7Slay Shulkers (${Math.min(shulkerKills, END_SHULKER_KILLS)}/${END_SHULKER_KILLS})`))
  player.tell(Text.gray(`    ${endermen ? '§a✓' : '§c○'} §7Defeat Endermen (${Math.min(kills, END_ENDERMAN_KILLS)}/${END_ENDERMAN_KILLS})`))
})

console.log('[IridescentCraft] Dragon exploration gate loaded')
console.log('  - Dragon blocked until End exploration complete')
console.log('  - 4 milestones: outer islands, End City, 5 Shulkers, 50 Endermen')
console.log('  - Dragon Summoning Crystal required to start fight')
