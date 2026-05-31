// =============================================================================
// ASTAGES MILESTONE DETECTION — Auto-advance tiers on key achievements
// Design Doc Section 24: Quest System Structure — "Tier Advancement: Dual System"
//
// Primary path: FTB Quests gate quest → /astages add <player> tier_X
// Backup path: KubeJS detects milestones → grants tier access (NO skill points)
//
// Tier 2 triggers (ANY ONE):
//   - Kill any T2 boss (Naga, Lich, Summoner, Slider, etc.)
//   - Craft a Thermal Machine Frame
//   - Enter Twilight Forest + Blue Skies + Aether (all three)
//
// Tier 3 triggers (ANY ONE):
//   - Kill any T3 boss (Harbinger, Ignis, Forgotten Guardian, etc.)
//   - Craft a Mekanism Steel Casing
//   - Enter Undergarden + Deeper Darker + Nether (all three)
//
// Tier 4 triggers (ANY ONE):
//   - Kill Ender Dragon OR Gaia Guardian
//   - Craft Mekanism Ultimate Control Circuit
//
// NOTE: Milestones grant TIER ACCESS ONLY. No skill points, no loot boxes.
// Those are quest-book-exclusive rewards.
//
// Uses AStages API:
//   AStages.playerHasStage('stage', player) — check stage
//   AStages.addStageToPlayer('stage', player) — grant stage
// =============================================================================

// ---- TIER 2 BOSS KILLS ----
const TIER_2_BOSSES = [
  // Twilight Forest
  'twilightforest:naga',
  'twilightforest:lich',
  'twilightforest:hydra',
  'twilightforest:ur_ghast',
  'twilightforest:knight_phantom',
  'twilightforest:snow_queen',
  'twilightforest:minoshroom',
  // Blue Skies
  'blue_skies:summoner',
  'blue_skies:alchemist',
  'blue_skies:starlit_crusher',
  'blue_skies:arachnarch',
  // Aether
  'aether:slider',
  'aether:valkyrie_queen',
  'aether:sun_spirit',
]

// ---- TIER 3 BOSS KILLS ----
const TIER_3_BOSSES = [
  // Cataclysm
  'cataclysm:netherite_monstrosity',
  'cataclysm:ignis',
  'cataclysm:the_harbinger',
  'cataclysm:the_leviathan',
  'cataclysm:maledictus',
  'cataclysm:ancient_remnant',
  'cataclysm:the_baby_leviathan',
  // Meet Your Fight
  'meetyourfight:dame_fortuna',
  'meetyourfight:rosalyne',
  // Undergarden
  'undergarden:forgotten_guardian',
  // Deeper Darker
  'deeperdarker:stalker',
  'deeperdarker:shattered',
  // Vanilla (Nether)
  'minecraft:wither',
]

// ---- TIER 4 BOSS KILLS ----
const TIER_4_BOSSES = [
  'minecraft:ender_dragon',
  'botania:doppleganger',  // Gaia Guardian
  'cataclysm:ender_guardian',  // Ender Guardian (End boss, T4)
  'cataclysm:ignited_revenant',  // Ignited Revenant (1000 HP, T4)
  'cardinal_sins:lucifer',  // Lucifer, The Atrocity -- Cardinal Sins finale (Nether arena), a T4 gate (#56)
  'cardinal_sins:luciferphase_1',  // phase entity -- included in case it is the killable final phase
]

// =============================================================================
// BOSS KILL DETECTION
// =============================================================================
// Two boss-kill paths:
//   1. Kill ANY single boss of the appropriate tier → instant unlock (existing)
//   2. Kill 10 bosses of the appropriate tier cumulatively → unlock
// Both coexist — path 1 is for "defeat the gatekeeper" players,
// path 2 is for "grind bosses" players who keep re-fighting the same ones.

const BOSS_KILL_THRESHOLD = 10

EntityEvents.death(event => {
  const entity = event.entity
  const source = event.source

  // Only care about player kills
  if (!source || !source.player) return
  const player = source.player
  const entityId = entity.type.toString()
  const pdata = player.persistentData

  // --- Path 1: Single boss kill instant unlock (existing behavior) ---

  // Check Tier 2
  if (!AStages.playerHasStage('tier_2', player) && TIER_2_BOSSES.includes(entityId)) {
    grantTier(player, 'tier_2', entity.name.string)
  }

  // Check Tier 3
  if (!AStages.playerHasStage('tier_3', player) && TIER_3_BOSSES.includes(entityId)) {
    grantTier(player, 'tier_3', entity.name.string)
  }

  // Check Tier 4
  if (!AStages.playerHasStage('tier_4', player) && TIER_4_BOSSES.includes(entityId)) {
    grantTier(player, 'tier_4', entity.name.string)
  }

  // --- Path 2: Cumulative 10 boss kills per tier ---

  if (!AStages.playerHasStage('tier_2', player) && TIER_2_BOSSES.includes(entityId)) {
    let kills = pdata.getInt('icraft_t2_boss_kills') + 1
    pdata.putInt('icraft_t2_boss_kills', kills)
    if (kills >= BOSS_KILL_THRESHOLD) {
      grantTier(player, 'tier_2', kills + ' Tier 2 boss kills')
    } else {
      player.tell(Text.gold('[IridescentCraft] ').append(Text.white('Tier 2 boss kills: ' + kills + '/' + BOSS_KILL_THRESHOLD)))
    }
  }

  if (!AStages.playerHasStage('tier_3', player) && TIER_3_BOSSES.includes(entityId)) {
    let kills = pdata.getInt('icraft_t3_boss_kills') + 1
    pdata.putInt('icraft_t3_boss_kills', kills)
    if (kills >= BOSS_KILL_THRESHOLD) {
      grantTier(player, 'tier_3', kills + ' Tier 3 boss kills')
    } else {
      player.tell(Text.gold('[IridescentCraft] ').append(Text.white('Tier 3 boss kills: ' + kills + '/' + BOSS_KILL_THRESHOLD)))
    }
  }

  if (!AStages.playerHasStage('tier_4', player) && TIER_4_BOSSES.includes(entityId)) {
    let kills = pdata.getInt('icraft_t4_boss_kills') + 1
    pdata.putInt('icraft_t4_boss_kills', kills)
    if (kills >= BOSS_KILL_THRESHOLD) {
      grantTier(player, 'tier_4', kills + ' Tier 4 boss kills')
    } else {
      player.tell(Text.gold('[IridescentCraft] ').append(Text.white('Tier 4 boss kills: ' + kills + '/' + BOSS_KILL_THRESHOLD)))
    }
  }

  // Dragon-specific End advancements (granted even if player already has T4)
  if (entityId === 'minecraft:ender_dragon') {
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/kill_dragon`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/dragon_egg`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/respawn_dragon`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/dragon_breath`)
  }
})

// =============================================================================
// CRAFTING DETECTION
// =============================================================================

const TIER_CRAFT_TRIGGERS = {
  'thermal:machine_frame':             'tier_2',
  'mekanism:steel_casing':             'tier_3',
  'mekanism:ultimate_control_circuit': 'tier_4',
}

PlayerEvents.inventoryChanged(event => {
  const itemId = event.item.id
  const requiredTier = TIER_CRAFT_TRIGGERS[itemId]

  if (requiredTier && !AStages.playerHasStage(requiredTier, event.player)) {
    grantTier(event.player, requiredTier, event.item.hoverName.string)
  }
})

// =============================================================================
// DIMENSION VISIT TRACKING
// Track visits to all T2 dims → grant T2. Same for T3.
// Uses persistent player data (scoreboard or NBT).
// =============================================================================

// Track dimension visits via scoreboard objectives
ServerEvents.loaded(event => {
  const server = event.server
  // Create tracking scoreboards if they don't exist
  server.runCommandSilent('scoreboard objectives add icraft_visited_twilight dummy')
  server.runCommandSilent('scoreboard objectives add icraft_visited_blueskies dummy')
  server.runCommandSilent('scoreboard objectives add icraft_visited_aether dummy')
  server.runCommandSilent('scoreboard objectives add icraft_visited_undergarden dummy')
  server.runCommandSilent('scoreboard objectives add icraft_visited_deeperdarker dummy')
  server.runCommandSilent('scoreboard objectives add icraft_visited_nether dummy')
})

// Check dimension on tick (infrequent — every 10 seconds)
global.tick_milestoneDimVisit = (event) => {
  const player = event.player
  const dim = player.level.dimension.toString()

  // Track T2 dimension visits
  if (!AStages.playerHasStage('tier_2', player)) {
    if (dim === 'twilightforest:twilight_forest') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_twilight 1`)
    }
    if (dim === 'blue_skies:everbright' || dim === 'blue_skies:everdawn') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_blueskies 1`)
    }
    if (dim === 'aether:the_aether') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_aether 1`)
    }

    // Check if all three T2 dimensions visited
    // (This is a simplified check — scoreboard queries in KubeJS)
    // We use persistent data instead for reliability
    checkAllDimensionsVisited(player, 'tier_2', [
      'icraft_visited_twilight',
      'icraft_visited_blueskies',
      'icraft_visited_aether'
    ])
  }

  // Track T3 dimension visits
  if (!AStages.playerHasStage('tier_3', player)) {
    if (dim === 'undergarden:undergarden') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_undergarden 1`)
    }
    if (dim === 'deeperdarker:otherside') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_deeperdarker 1`)
    }
    if (dim === 'minecraft:the_nether') {
      player.server.runCommandSilent(`scoreboard players set ${player.username} icraft_visited_nether 1`)
    }

    checkAllDimensionsVisited(player, 'tier_3', [
      'icraft_visited_undergarden',
      'icraft_visited_deeperdarker',
      'icraft_visited_nether'
    ])
  }
}
global.registerPlayerTick('tick_milestoneDimVisit', 200, 0)

function checkAllDimensionsVisited(player, tier, scoreboards) {
  // Use persistent player data for reliability
  let pdata = player.persistentData
  let allVisited = true

  for (let sb of scoreboards) {
    // Set persistent data when scoreboard is set
    let dimKey = sb.replace('icraft_visited_', '')

    // Check if this specific dimension was visited
    if (!pdata.getBoolean(`icraft_dim_${dimKey}`)) {
      // Try to read from scoreboard
      // For simplicity, we use persistent data as primary tracker
      allVisited = false
    }
  }

  // Update persistent data based on current dimension
  let currentDim = player.level.dimension.toString()
  if (currentDim.includes('twilight'))    pdata.putBoolean('icraft_dim_twilight', true)
  if (currentDim.includes('blue_skies'))  pdata.putBoolean('icraft_dim_blueskies', true)
  if (currentDim.includes('aether') && !currentDim.includes('deep_aether'))
                                          pdata.putBoolean('icraft_dim_aether', true)
  if (currentDim.includes('undergarden')) pdata.putBoolean('icraft_dim_undergarden', true)
  if (currentDim.includes('deeperdarker'))pdata.putBoolean('icraft_dim_deeperdarker', true)
  if (currentDim === 'minecraft:the_nether') pdata.putBoolean('icraft_dim_nether', true)

  // Re-check with persistent data
  if (tier === 'tier_2') {
    if (pdata.getBoolean('icraft_dim_twilight') &&
        pdata.getBoolean('icraft_dim_blueskies') &&
        pdata.getBoolean('icraft_dim_aether')) {
      grantTier(player, tier, 'exploring all Tier 2 dimensions')
    }
  }
  if (tier === 'tier_3') {
    if (pdata.getBoolean('icraft_dim_undergarden') &&
        pdata.getBoolean('icraft_dim_deeperdarker') &&
        pdata.getBoolean('icraft_dim_nether')) {
      grantTier(player, tier, 'exploring all Tier 3 dimensions')
    }
  }
}

// =============================================================================
// TIER GRANT FUNCTION
// =============================================================================

function grantTier(player, tier, triggerName) {
  // Prevent double-granting
  if (AStages.playerHasStage(tier, player)) return

  // Grant via AStages
  AStages.addStageToPlayer(tier, player)

  // Also grant all lower tiers (safety net)
  const tiers = ['tier_1', 'tier_2', 'tier_3', 'tier_4']
  const targetIdx = tiers.indexOf(tier)
  for (let i = 0; i <= targetIdx; i++) {
    if (!AStages.playerHasStage(tiers[i], player)) {
      AStages.addStageToPlayer(tiers[i], player)
    }
  }

  // Grant matching Patchouli advancement so the Iridescent Codex unlocks
  // the correct chapters. tier_1 has no Codex gate so skip it.
  // Grants all advancements up to and including the current tier
  // (mirrors the AStages lower-tier safety net above).
  const advTiers = ['tier_2', 'tier_3', 'tier_4']
  advTiers.slice(0, advTiers.indexOf(tier) + 1).forEach(t => {
    player.server.runCommandSilent(
      `advancement grant ${player.username} only icraft:stage_${t}`
    )
  })

  // Un-gate vanilla advancements that were blocked by impossible criteria.
  // T3 unlocks diamond-related advancements, T4 unlocks netherite.
  if (targetIdx >= 2) { // tier_3 or higher
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/mine_diamond`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/shiny_gear`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/enchant_item`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:nether/obtain_ancient_debris`)
  }
  if (targetIdx >= 3) { // tier_4
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:nether/netherite_armor`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:husbandry/obtain_netherite_hoe`)
    // End advancements — grant root + exploration advancements on T4 unlock
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/root`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/enter_end_gateway`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/find_end_city`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/elytra`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/levitate`)
  }

  const tierNum = tier.replace('tier_', '')

  // Announce
  player.tell(Text.gold('═══════════════════════════════════════'))
  player.tell(Text.gold(`  ★ TIER ${tierNum} UNLOCKED ★`))
  player.tell(Text.white(`  Triggered by: ${triggerName}`))
  player.tell(Text.gray('  New items, dimensions, and recipes are now available!'))
  player.tell(Text.gray('  Check the Quest Book for skill points and rewards.'))
  player.tell(Text.gold('═══════════════════════════════════════'))

  // Server-wide announcement
  player.server.tell(
    Text.yellow(`★ ${player.username} has reached Tier ${tierNum}!`)
  )

  // Play sound
  player.server.runCommandSilent(
    `playsound minecraft:ui.toast.challenge_complete player ${player.username}`
  )

  console.log(`[IridescentCraft] ${player.username} granted ${tier} via: ${triggerName}`)
}

// =============================================================================
// FIRST JOIN: Grant tier_1 by default
// =============================================================================

PlayerEvents.loggedIn(event => {
  let player = event.player
  if (!player.creative && !AStages.playerHasStage('tier_1', player)) {
    AStages.addStageToPlayer('tier_1', player)
    console.log(`[IridescentCraft] Granted tier_1 to new player: ${player.username}`)
  }
})

// =============================================================================
// PERIODIC: Ensure tier_1 always present + creative mode bypasses tiers
// Runs every 5 seconds
// =============================================================================

// 2026-04-20: hoisted `allTiers` to module scope as MILESTONE_ALL_TIERS.
// Previously declared inside the tick with `const`; Rhino threw
// 'TypeError: redeclaration of var allTiers' on EVERY tick (every 5s).
// KubeJS/Rhino doesn't garbage-collect the inner const binding between
// tick invocations the way standard JS does.
const MILESTONE_ALL_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4']

global.tick_milestoneTierEnsure = (event) => {
  event.server.players.forEach(player => {
    let isCreative = player.creative

    if (isCreative) {
      MILESTONE_ALL_TIERS.forEach(t => {
        if (!AStages.playerHasStage(t, player)) {
          AStages.addStageToPlayer(t, player)
        }
      })
    } else {
      if (!AStages.playerHasStage('tier_1', player)) {
        AStages.addStageToPlayer('tier_1', player)
        console.log(`[IridescentCraft] Restored tier_1 for ${player.username}`)
      }
    }
  })
}
global.registerServerTick('tick_milestoneTierEnsure', 100, 50)

// =============================================================================
// SYNC: When any stage is added (by command, script, or quest), grant matching
// Patchouli advancements so codex categories unlock automatically.
// =============================================================================

AStageEvents.added(event => {
  let stageName = event.getStage ? event.getStage() : (event.stage || '')
  let player = event.getPlayer ? event.getPlayer() : event.player
  if (!player || !stageName) return

  // Cascade: grant all lower tiers automatically
  const tiers = ['tier_1', 'tier_2', 'tier_3', 'tier_4']
  let idx = tiers.indexOf(stageName)
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
      if (!AStages.playerHasStage(tiers[i], player)) {
        AStages.addStageToPlayer(tiers[i], player)
        console.log(`[IridescentCraft] Cascade: granted ${tiers[i]} to ${player.username}`)
      }
    }
  }

  // Sync Patchouli advancements
  const tierMap = { 'tier_2': 'stage_tier_2', 'tier_3': 'stage_tier_3', 'tier_4': 'stage_tier_4' }
  let adv = tierMap[stageName]
  if (adv) {
    player.server.runCommandSilent(
      `advancement grant ${player.username} only icraft:${adv}`
    )
    // Also grant lower tier advancements
    const advTiers = ['tier_2', 'tier_3', 'tier_4']
    let advIdx = advTiers.indexOf(stageName)
    for (let i = 0; i < advIdx; i++) {
      player.server.runCommandSilent(
        `advancement grant ${player.username} only icraft:stage_${advTiers[i]}`
      )
    }
    console.log(`[IridescentCraft] Synced advancements up to ${stageName} for ${player.username}`)
  }
})

// =============================================================================
// TOKEN FRAGMENT AUTO-CONSUME — 1000 fragments = instant tier unlock
// =============================================================================
// Checks player inventory every 5 seconds. When a player accumulates 1000+
// token fragments of a tier they haven't unlocked yet, auto-consumes 1000
// and grants the tier. The fragments disappear, the tier unlocks, done.
//
// Fragment item IDs follow the pattern: kubejs:t{N}_token_fragment

const TOKEN_THRESHOLD = 1000
const TOKEN_TIERS = [
  { tier: 'tier_2', fragment: 'kubejs:t2_token_fragment' },
  { tier: 'tier_3', fragment: 'kubejs:t3_token_fragment' },
  { tier: 'tier_4', fragment: 'kubejs:t4_token_fragment' },
]

global.tick_tokenAutoConsume = (event) => {
  const player = event.player

  TOKEN_TIERS.forEach(function(entry) {
    var tier = entry.tier
    var fragment = entry.fragment
    if (AStages.playerHasStage(tier, player)) return

    // Count fragments across entire inventory
    var total = 0
    for (var i = 0; i < player.inventory.size; i++) {
      var stack = player.inventory.getStackInSlot(i)
      if (!stack.isEmpty() && stack.id === fragment) {
        total += stack.count
      }
    }

    if (total >= TOKEN_THRESHOLD) {
      // Consume exactly TOKEN_THRESHOLD fragments
      var toRemove = TOKEN_THRESHOLD
      for (var j = 0; j < player.inventory.size && toRemove > 0; j++) {
        var stack2 = player.inventory.getStackInSlot(j)
        if (!stack2.isEmpty() && stack2.id === fragment) {
          var take = Math.min(stack2.count, toRemove)
          stack2.count -= take
          toRemove -= take
          if (stack2.count <= 0) {
            player.inventory.setStackInSlot(j, Item.empty)
          }
        }
      }

      grantTier(player, tier, TOKEN_THRESHOLD + ' token fragments consumed')
    }
  })
}
global.registerPlayerTick('tick_tokenAutoConsume', 100, 50)

console.log('[IridescentCraft] Milestone detection loaded')
console.log('  Tier 2: Boss kill / 10 T2 boss kills / 1000 T2 fragments / Thermal Frame / All T2 dims')
console.log('  Tier 3: Boss kill / 10 T3 boss kills / 1000 T3 fragments / Mekanism Casing / All T3 dims')
console.log('  Tier 4: Dragon/Gaia kill / 10 T4 boss kills / 1000 T4 fragments / Ultimate Circuit')
