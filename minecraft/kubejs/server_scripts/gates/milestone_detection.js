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
  'cataclysm:the_ender_guardian',
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
]

// =============================================================================
// BOSS KILL DETECTION
// =============================================================================

EntityEvents.death(event => {
  const entity = event.entity
  const source = event.source

  // Only care about player kills
  if (!source || !source.player) return
  const player = source.player
  const entityId = entity.type.toString()

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
PlayerEvents.tick(event => {
  if (event.player.age % 200 !== 0) return

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
})

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
  if (!AStages.playerHasStage('tier_1', event.player)) {
    AStages.addStageToPlayer('tier_1', event.player)
    console.log(`[IridescentCraft] Granted tier_1 to new player: ${event.player.username}`)
  }
})

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

console.log('[IridescentCraft] Milestone detection loaded')
console.log('  Tier 2: Boss kill / Thermal Frame / All T2 dims visited')
console.log('  Tier 3: Boss kill / Mekanism Casing / All T3 dims visited')
console.log('  Tier 4: Dragon/Gaia kill / Ultimate Circuit')
