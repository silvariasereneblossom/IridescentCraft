// =============================================================================
// kubejs/server_scripts/quests/heracles_reconcile.js
//
// HERACLES STATE RECONCILIATION — "skip quests you already earned."
//
// THE PROBLEM: Heracles evaluates tasks on EVENTS, not on existing state —
// `heracles:advancement` completes when the advancement is newly GRANTED,
// `heracles:item` AUTOMATIC ticks on an inventory-CHANGE, kills fire on the
// death EVENT. A character that earned those things BEFORE Heracles (or before
// a given quest) existed has already fired every event, so the quest never
// ticks. Result: existing characters are permanently stuck at the start of the
// chain and would have to re-roll to use the quest system at all.
//
// THE FIX: on login (+ one delayed re-pass), for each quest below, check whether
// the player's CURRENT persistent state already satisfies its real-world
// condition; if so, force-complete it with `/heracles complete <quest> <player>`
// (OP command — runCommandSilent runs as the server). Conditions are read from
// the authoritative ledgers the game already keeps:
//   • vanilla ADVANCEMENTS  (story/mine_stone, end/kill_dragon, ...)   via /execute if entity
//   • AStages TIER stages   (tier_2/3/4)                               via AStages.playerHasStage
//   • the codex delivery flag icraft_codex_given                       (codex_delivery.js)
//   • the codex engine's first-kill / dimension-entry flags            (codex_exploration_kills.js)
//   • plain inventory possession                                       via /clear <item> 0 (count, no-remove)
//
// A new character meets NONE of these → nothing is reconciled → it plays the
// chain normally. So this is safe to run for everyone, every login.
//
// IDEMPOTENT: each (player, quest) is reconciled at most once (a persistent
// guard flag icraft_recon_<quest>). Quests already complete via the normal
// event path are detected (player.persistentData.heracles.quests.<id>.complete,
// same read the onboarding bridge uses) and skipped without re-completing, so
// rewards are never re-issued. `/heracles complete` only marks the quest done;
// the player still claims rewards manually.
//
// RELOAD-SAFETY: registers ONLY PlayerEvents.loggedIn + one global server tick
// (no item creation, no Forge bus listener) — the reload-safe shape per the
// #60 durability-clamp lesson.
//
// Cross-refs: onboarding_bridge.js (dummy/JLF/capstone bridge — complementary),
// codex_delivery.js (icraft_codex_given), exploration/codex_exploration_kills.js
// (icraft_codex_firstkill_* / icraft_codex_dimentry_* flags),
// gates/codex_progression_engine.js (AStages tier stages).
// =============================================================================

// ---- condition probes (all defensive; never throw out) ---------------------

// Vanilla advancement check via the proven `execute if entity <name>[...]`
// pattern (codex_delivery.js origindump uses the same shape). Returns 1/0.
function reconHasAdv(player, advId) {
  try {
    return player.server.runCommandSilent(
      'execute if entity ' + player.username + '[advancements={' + advId + '=true}]') > 0
  } catch (e) { return false }
}

// AStages tier stage (tier_2 / tier_3 / tier_4).
function reconHasStage(player, stage) {
  try { return AStages.playerHasStage(stage, player) } catch (e) { return false }
}

// A flat persistentData boolean flag (codex delivery / engine kill+dim flags).
function reconHasFlag(player, key) {
  try { return player.persistentData.getBoolean(key) } catch (e) { return false }
}

// Inventory possession without removal: `/clear <player> <item|#tag> 0` returns
// the matching count (vanilla test mode). codex_delivery.js uses this idiom.
function reconHasItem(player, itemPredicate) {
  try {
    return player.server.runCommandSilent(
      'clear ' + player.username + ' ' + itemPredicate + ' 0') > 0
  } catch (e) { return false }
}

// ---- reconciliation table (deps-first order) -------------------------------
// q   = quest ID (= filename); met(player) = "already satisfied?" predicate.
const RECONCILE = [
  // === Onboarding (vanilla-advancement gated; item/no-adv beats use the
  // nearest advancement that PROVES the beat was passed) ===
  { q: 'onboarding_first_log',            met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },     // wood -> wooden pick -> stone
  { q: 'onboarding_first_tool',           met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },     // needed a pickaxe
  { q: 'onboarding_first_stone',          met: p => reconHasAdv(p, 'minecraft:story/mine_stone') },
  { q: 'onboarding_first_food',           met: p => reconHasAdv(p, 'minecraft:story/smelt_iron') },     // no "ate once" adv -> established proxy
  { q: 'onboarding_first_shelter',        met: p => reconHasAdv(p, 'minecraft:adventure/sleep_in_bed') },
  { q: 'onboarding_first_kill',           met: p => reconHasAdv(p, 'minecraft:adventure/kill_a_mob') },
  { q: 'onboarding_first_iron',           met: p => reconHasAdv(p, 'minecraft:story/smelt_iron') },
  { q: 'onboarding_first_iron_pick',      met: p => reconHasAdv(p, 'minecraft:story/iron_tools') },
  { q: 'onboarding_first_villager_trade', met: p => reconHasAdv(p, 'minecraft:adventure/trade') },
  // onboarding_first_level -> handled by onboarding_bridge.js (JLF level poll).
  // onboarding_survivor_capstone -> cascades via onboarding_bridge once the
  // prereqs above show complete (it polls heracles.quests).

  // === Iridescent Codex intro (you have / were handed the codex) ===
  { q: 'onboarding_first_codex_open', met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  { q: 'codex_root',        met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  { q: 'codex_two_routes',  met: p => reconHasFlag(p, 'icraft_codex_given') || reconHasItem(p, 'patchouli:guide_book{"patchouli:book":"icraft:iridescent_codex"}') },
  // Lane signposts: "hold the lane's starter item" — only fires if actually held.
  { q: 'codex_lane_engineering', met: p => reconHasItem(p, 'minecraft:iron_ingot') },
  { q: 'codex_lane_magic',       met: p => reconHasItem(p, 'botania:manasteel_ingot') },
  { q: 'codex_lane_exploration', met: p => reconHasItem(p, 'minecraft:map') || reconHasItem(p, 'minecraft:filled_map') },
  { q: 'codex_lane_combat',      met: p => reconHasItem(p, '#minecraft:swords') },

  // === Tier Milestones (you already hold the AStages tier stage) ===
  { q: 'reach_tier_2', met: p => reconHasStage(p, 'tier_2') },
  { q: 'reach_tier_3', met: p => reconHasStage(p, 'tier_3') },
  { q: 'reach_tier_4', met: p => reconHasStage(p, 'tier_4') },

  // === Exploration dimension trackers (engine dim-entry flags; only exist for
  // post-engine arrivals — pre-engine explorers just re-visit, harmless) ===
  { q: 'exp_t2_dimensions', met: p => reconHasFlag(p, 'icraft_codex_dimentry_twilight') && reconHasFlag(p, 'icraft_codex_dimentry_aether') && (reconHasFlag(p, 'icraft_codex_dimentry_everbright') || reconHasFlag(p, 'icraft_codex_dimentry_everdawn')) },
  { q: 'exp_t3_deep_dimensions', met: p => reconHasFlag(p, 'icraft_codex_dimentry_nether') && reconHasFlag(p, 'icraft_codex_dimentry_undergarden') && reconHasFlag(p, 'icraft_codex_dimentry_deeperdarker') },
  { q: 'exp_t4_final_frontiers', met: p => reconHasFlag(p, 'icraft_codex_dimentry_deep_aether') && (reconHasFlag(p, 'icraft_codex_dimentry_the_end') || reconHasAdv(p, 'minecraft:story/enter_the_end')) },

  // === Capstones ===
  { q: 'capstone_lucifer',     met: p => reconHasFlag(p, 'icraft_codex_firstkill_cardinal_sins_lucifer') },
  { q: 'capstone_end_compass', met: p => reconHasFlag(p, 'icraft_codex_dimentry_deep_aether') || reconHasAdv(p, 'minecraft:end/kill_dragon') },
  { q: 'capstone_end_bastion', met: p => reconHasFlag(p, 'icraft_codex_dimentry_the_end') || reconHasAdv(p, 'minecraft:story/enter_the_end') || reconHasAdv(p, 'minecraft:end/kill_dragon') },
  { q: 'capstone_ender_dragon', met: p => reconHasAdv(p, 'minecraft:end/kill_dragon') },
]

// ---- idempotency -----------------------------------------------------------
function reconGuardKey(quest) { return 'icraft_recon_' + quest }

function reconIsGuarded(player, quest) {
  try { return player.persistentData.getBoolean(reconGuardKey(quest)) } catch (e) { return false }
}
function reconMarkGuarded(player, quest) {
  try { player.persistentData.putBoolean(reconGuardKey(quest), true) } catch (e) {}
}

// Already complete via the normal Heracles event path? (same read the
// onboarding bridge uses — player.persistentData.heracles.quests.<id>.complete)
function reconHeraclesComplete(player, quest) {
  try {
    const pd = player.persistentData
    if (!pd.contains('heracles')) return false
    const h = pd.getCompound('heracles')
    if (!h.contains('quests')) return false
    const qs = h.getCompound('quests')
    if (!qs.contains(quest)) return false
    const q = qs.getCompound(quest)
    return q.contains('complete') && q.getBoolean('complete')
  } catch (e) { return false }
}

function reconComplete(player, quest) {
  try { player.server.runCommandSilent('heracles complete ' + quest + ' ' + player.username) } catch (e) {
    console.warn('[heracles_reconcile] complete failed for ' + quest + '/' + player.username + ': ' + e)
  }
}

// ---- one reconciliation pass -----------------------------------------------
function reconcileAll(player) {
  if (!player || player.level.isClientSide()) return
  let did = 0
  for (let i = 0; i < RECONCILE.length; i++) {
    const e = RECONCILE[i]
    if (reconIsGuarded(player, e.q)) continue            // already handled this char
    if (reconHeraclesComplete(player, e.q)) {            // finished the normal way -> just guard
      reconMarkGuarded(player, e.q)
      continue
    }
    let ok = false
    try { ok = !!e.met(player) } catch (err) { ok = false }
    if (ok) {
      reconComplete(player, e.q)
      reconMarkGuarded(player, e.q)
      did++
    }
  }
  if (did > 0) {
    player.tell(Text.gold('[Quests] ').append(Text.gray(
      'Synced ' + did + ' quest' + (did === 1 ? '' : 's') + ' you had already earned — claim their rewards in the book.')))
    console.log('[heracles_reconcile] reconciled ' + did + ' quest(s) for ' + player.username)
  }
}

// ---- triggers: login + one delayed re-pass ---------------------------------
// Immediate pass on login catches advancements / AStages / engine flags (all
// available at loggedIn). The delayed pass (~5s) catches the codex delivery
// flag, which codex_delivery.js sets in its OWN loggedIn handler (order between
// the two handlers isn't guaranteed), plus any late-loading capability data.
PlayerEvents.loggedIn(event => {
  try { reconcileAll(event.player) } catch (e) {
    console.warn('[heracles_reconcile] login pass threw: ' + e)
  }
  try { event.player.persistentData.putInt('icraft_recon_recheck_ticks', 100) } catch (e) {}  // ~5s
})

global.tick_heraclesReconcileRecheck = function(event) {
  event.server.players.forEach(function(player) {
    let left = 0
    try { left = player.persistentData.getInt('icraft_recon_recheck_ticks') } catch (e) { return }
    if (!left || left <= 0) return
    left -= 20
    try { player.persistentData.putInt('icraft_recon_recheck_ticks', Math.max(0, left)) } catch (e) {}
    if (left <= 0) {
      try { reconcileAll(player) } catch (e) {
        console.warn('[heracles_reconcile] recheck pass threw for ' + player.username + ': ' + e)
      }
    }
  })
}
global.registerServerTick('tick_heraclesReconcileRecheck', 20, 9)

console.log('[heracles_reconcile] loaded — ' + RECONCILE.length +
  ' quests reconcile from existing advancements / tiers / codex flags on login')
