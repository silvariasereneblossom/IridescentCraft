// =============================================================================
// ASTAGES TIER INFRASTRUCTURE — first-join grant, creative bypass, stage sync
//
// 2026-06-01: The legacy MILESTONE AUTO-ADVANCE ROUTES were RETIRED — superseded
// by the Iridescent Codex token economy (the locked progression framework). The
// five old bypass routes each granted a FULL TIER INSTANTLY and would short-
// circuit the 500/1000/2000 token thresholds:
//   1. single boss kill -> tier          4. visit all of a tier's dims -> tier
//   2. 10 cumulative boss kills -> tier   5. 1000 token-fragments -> tier
//   3. craft one machine frame -> tier
// Advancement now flows ONLY through:
//   - codex_progression_engine.js              (Engineering/Magic submission -> tokens)
//   - codex_exploration_kills.js / _drops.js   (Exploration tokens)
//   - codex_boss_rush.js                       (Combat: % of a tier's full boss roster)
// This file keeps ONLY the shared tier infrastructure: first-join tier_1,
// creative-mode all-tiers, the lower-tier cascade + Patchouli advancement sync +
// vanilla advancement un-gating on ANY stage grant, and the Dragon End-
// advancement unlocks (cosmetic; the Ender Dragon is the T4 terminal finale,
// gated by the framework, not here). Git history holds the retired routes.
// =============================================================================

// -----------------------------------------------------------------------------
// DRAGON END-ADVANCEMENTS — Dragon kill un-gates the vanilla End advancements
// (NOT a tier grant; the framework handles the Dragon as the T4 finale).
// -----------------------------------------------------------------------------
EntityEvents.death(event => {
  // RHINO-SAFETY: var (not const) — closure-local in a repeatedly-invoked death handler.
  var source = event.source
  if (!source || !source.player) return
  if (event.entity.type.toString() !== 'minecraft:ender_dragon') return
  var player = source.player
  player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/kill_dragon`)
  player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/dragon_egg`)
  player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/respawn_dragon`)
  player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/dragon_breath`)
})

// -----------------------------------------------------------------------------
// FIRST JOIN: grant tier_1 by default (survival players)
// -----------------------------------------------------------------------------
PlayerEvents.loggedIn(event => {
  let player = event.player
  if (!player.creative && !AStages.playerHasStage('tier_1', player)) {
    AStages.addStageToPlayer('tier_1', player)
    console.log(`[IridescentCraft] Granted tier_1 to new player: ${player.username}`)
  }
})

// -----------------------------------------------------------------------------
// PERIODIC: ensure tier_1 always present; creative mode bypasses all tiers
// -----------------------------------------------------------------------------
// 2026-04-20: allTiers hoisted to module scope — Rhino threw a redeclaration
// crash when it was an inner `const` re-evaluated every tick.
const MILESTONE_ALL_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4']

global.tick_milestoneTierEnsure = (event) => {
  event.server.players.forEach(player => {
    if (player.creative) {
      MILESTONE_ALL_TIERS.forEach(t => {
        if (!AStages.playerHasStage(t, player)) AStages.addStageToPlayer(t, player)
      })
    } else if (!AStages.playerHasStage('tier_1', player)) {
      AStages.addStageToPlayer('tier_1', player)
      console.log(`[IridescentCraft] Restored tier_1 for ${player.username}`)
    }
  })
}
global.registerServerTick('tick_milestoneTierEnsure', 100, 50)

// -----------------------------------------------------------------------------
// STAGE SYNC: on ANY stage grant (Codex engine, boss-rush, command, quest),
// cascade lower tiers + grant matching Patchouli advancements + un-gate the
// vanilla diamond/netherite/End advancements. Central hook so every advance
// source gets consistent side-effects (the retired grantTier did this inline;
// it now lives here so the Codex lanes inherit it for free).
// -----------------------------------------------------------------------------
const SYNC_TIERS = ['tier_1', 'tier_2', 'tier_3', 'tier_4']

AStageEvents.added(event => {
  let stageName = event.getStage ? event.getStage() : (event.stage || '')
  let player = event.getPlayer ? event.getPlayer() : event.player
  if (!player || !stageName) return

  let idx = SYNC_TIERS.indexOf(stageName)
  if (idx < 0) return // not a tier stage

  // Cascade: grant all lower tiers automatically.
  for (let i = 0; i < idx; i++) {
    if (!AStages.playerHasStage(SYNC_TIERS[i], player)) {
      AStages.addStageToPlayer(SYNC_TIERS[i], player)
      console.log(`[IridescentCraft] Cascade: granted ${SYNC_TIERS[i]} to ${player.username}`)
    }
  }

  // Patchouli: grant icraft:stage_tierN up to the current tier (tier_1 has no gate).
  // RHINO-SAFETY: var (not const) — closure-local in the AStageEvents.added handler.
  var advTiers = ['tier_2', 'tier_3', 'tier_4']
  let advIdx = advTiers.indexOf(stageName)
  if (advIdx >= 0) {
    advTiers.slice(0, advIdx + 1).forEach(t => {
      player.server.runCommandSilent(`advancement grant ${player.username} only icraft:stage_${t}`)
    })
    console.log(`[IridescentCraft] Synced advancements up to ${stageName} for ${player.username}`)
  }

  // Un-gate vanilla advancements that were blocked by impossible criteria.
  if (idx >= 2) { // tier_3+
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/mine_diamond`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/shiny_gear`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:story/enchant_item`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:nether/obtain_ancient_debris`)
  }
  if (idx >= 3) { // tier_4
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:nether/netherite_armor`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:husbandry/obtain_netherite_hoe`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/root`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/enter_end_gateway`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/find_end_city`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/elytra`)
    player.server.runCommandSilent(`advancement grant ${player.username} only minecraft:end/levitate`)
  }
})

console.log('[IridescentCraft] Tier infrastructure loaded (milestone auto-advance retired -> Codex token economy)')
