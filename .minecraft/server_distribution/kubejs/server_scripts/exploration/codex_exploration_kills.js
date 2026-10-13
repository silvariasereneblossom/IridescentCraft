// =============================================================================
// IRIDESCENT CODEX — EXPLORATION LANE: KILL DROPS + DIMENSION ENTRY BONUS
// File: kubejs/server_scripts/exploration/codex_exploration_kills.js
//
// Implements §3 (Route B — Exploration) of
// IridescentCraft-internal/design/progression-framework.md, the COMBAT/kill
// half of the Exploration lane. Feeds the Codex token pool minted by
// startup_scripts/codex_progression_tokens.js
// (icraft:progression_token_t1 / _t2 / _t3) and advanced by
// server_scripts/gates/codex_progression_engine.js.
//
//   §3 table          T1   T2   T3   T4
//   Miniboss kill      2    4    6    8     (every kill)
//   Boss FIRST kill   10   15   20   25*    (one-time per named boss, per player)
//   Boss repeat kill   4    8   12   16*    (every subsequent kill)
//   * = design ⚠OPEN  (T4 boss values + see report) — defaults chosen here.
//
// The token TIER granted = the boss/miniboss's LOCATION tier: the `tier` of its
// entry in the boss registry (kubejs/config/icraft/registry/bosses.json). Tokens are given as
// progression_token_t{tier}. There is NO progression_token_t4 (T4 is terminal —
// the Ender Dragon is the finale, no token gate), so T4 sources grant the
// highest accumulation token, progression_token_t3, instead. (See report.)
//
// RELOAD-SAFETY: registers ONLY KubeJS event-API listeners (EntityEvents.death
// + a player-tick via the 0_tick_master.js dispatcher) — no item creation, no
// raw MinecraftForge.EVENT_BUS. Items already exist (startup_scripts). This is
// the same reload-safe shape as milestone_detection.js / iss_boss_first_kill.js.
//
// COEXISTENCE: milestone_detection.js still runs its own boss-KILL-COUNTER
// (icraft_tN_boss_kills). The legacy kubejs:tN_token_fragment loot seeding (the
// OLD fragment → auto-consume 1000 → instant tier currency) was RETIRED and its
// seeding removed from loot_overhaul.js + lootjs_overhaul.js (2026-06-01). This
// file mints the NEW icraft:progression_token_tN accumulation currency, which is
// now the sole combat-kill progression-token source.
//
// Memory: feedback_rhino_scoping.md — declare top-level consts at module scope
// (Rhino re-`const` inside a repeatedly-invoked closure throws). All the sets +
// helpers below are module scope; the listeners reference them.
// =============================================================================

// ---- §3 token values, indexed by location tier (1-4) -----------------------
const EXPLORE_MINIBOSS_TOKENS   = { 1: 2,  2: 4,  3: 6,  4: 8  }
const EXPLORE_BOSS_FIRST_TOKENS = { 1: 10, 2: 15, 3: 20, 4: 25 } // T4 = 25 (⚠OPEN default)
const EXPLORE_BOSS_REPEAT_TOKENS= { 1: 4,  2: 8,  3: 12, 4: 16 } // T4 = 16 (⚠OPEN default)

// Tier → the token ITEM granted. T4 has no token of its own → fold to t3.
const EXPLORE_TOKEN_ITEM = {
  1: 'icraft:progression_token_t1',
  2: 'icraft:progression_token_t2',
  3: 'icraft:progression_token_t3',
  4: 'icraft:progression_token_t3', // T4 terminal — no _t4 item exists
}

// =============================================================================
// THE TWO KILL ROSTERS -- read from the boss registry
// (kubejs/config/icraft/registry/bosses.json, through icraft.bosses,
// 0_lib_registry.js). Until 2026-10-13 the two tables stood here
// (NAMED_BOSSES_BY_TIER, MINIBOSSES_BY_TIER), copied by hand beside five other
// boss lists that did not agree with them.
//   kind "named"     trophy bosses: a one-time first-kill bonus, then the
//                    repeat value, of the entry's tier
//   kind "miniboss"  boss-tier mobs and variants: the flat value of the
//                    entry's tier on every kill
// An entry has ONE kind, so a named boss is never also paid as a miniboss.
// To add a boss to a roster, or to move it to another tier: its registry entry.
// (What the old tables recorded in comments: Marium's Soulslike Weaponry
// bosses, the Ultris ids, undergarden:masticator,
// mutantmonsters:mutant_zombie_villager and irons_spellbooks:magehunter left
// on 2026-10-12, not being entity types on the pack's mod set. The Magehunter
// mob is irons_spellbooks:magehunter_vindicator; it is in the registry as
// `unlisted`: paying tokens for it has not been ruled on.)
// The x3 boss buff (scaling/zz_boss_global_3x.js) used to take the named
// roster from global.ICRAFT_NAMED_BOSS_IDS, set here; it reads the registry's
// flag `x3` now and the global is gone.
// =============================================================================
// entityId -> tier, for one kill roster
function exploreTierLookup(system) {
  var map = {}
  var ids = icraft.bosses.ids(system)
  for (var i = 0; i < ids.length; i++) map[ids[i]] = icraft.bosses.get(ids[i], system)
  return map
}
const NAMED_BOSS_TIER = exploreTierLookup('tokensNamed')
const MINIBOSS_TIER   = exploreTierLookup('tokensMiniboss')

// persistentData flag: this player has claimed the one-time first-kill bonus
// for this named boss. NBT-safe key from the entity ID.
function exploreFirstKillKey(entityId) {
  return 'icraft_codex_firstkill_' + entityId.replace(/[:\/]/g, '_')
}

// Give tokens of the right tier + a concise chat line.
function exploreGiveTokens(player, tier, amount, label) {
  if (amount <= 0) return
  const itemId = EXPLORE_TOKEN_ITEM[tier]
  player.give(Item.of(itemId, amount))
  // Token-tier number for display: t1/t2/t3 (T4 folds to t3).
  const tokTier = (tier === 4) ? 3 : tier
  player.tell(
    Text.gold('[Codex] ').append(Text.white(label))
      .append(Text.gray(' → ')).append(Text.aqua('+' + amount + ' T' + tokTier + ' token' + (amount === 1 ? '' : 's')))
  )
}

// =============================================================================
// KILL HANDLER — minibosses pay every kill; named bosses pay a one-time
// first-kill bonus then a repeat-kill value thereafter.
// =============================================================================
// RHINO-SAFETY: this closure fires on every kill, so it uses `var` (NOT const/
// let — KubeJS's Rhino throws "redeclaration of var" on a const/let in a
// repeatedly-invoked closure; the triple `amt` made it certain). Module-scope
// consts above are fine — they're declared once.
EntityEvents.death(icraft.guard('exploration/codex_exploration_kills', 'EntityEvents.death', event => {
  try {
    var entity = event.entity
    var source = event.source
    if (!entity || !source || !source.player) return
    var player = source.player
    var entityId = String(entity.type)

    // --- NAMED boss? (one-time first-kill bonus, then repeat value) ---
    var namedTier = NAMED_BOSS_TIER[entityId]
    if (namedTier !== undefined) {
      var pdata = player.persistentData
      var fkKey = exploreFirstKillKey(entityId)
      var bossName = entity.name ? entity.name.string : entityId
      var amt
      if (!pdata.getBoolean(fkKey)) {
        pdata.putBoolean(fkKey, true)
        amt = EXPLORE_BOSS_FIRST_TOKENS[namedTier]
        exploreGiveTokens(player, namedTier, amt, bossName + ' (first kill!)')
        // `execute at`: a server-source command runs at world spawn in the
        // Overworld, so a bare `~ ~ ~` put the sound out of the player's earshot.
        player.server.runCommandSilent('execute at ' + player.username +
          ' run playsound minecraft:ui.toast.challenge_complete player ' + player.username + ' ~ ~ ~ 0.5')
      } else {
        amt = EXPLORE_BOSS_REPEAT_TOKENS[namedTier]
        exploreGiveTokens(player, namedTier, amt, bossName)
      }
      return // a named boss is never also scored as a miniboss
    }

    // --- MINIBOSS? (every kill pays the flat tier value) ---
    var miniTier = MINIBOSS_TIER[entityId]
    if (miniTier !== undefined) {
      var miniAmt = EXPLORE_MINIBOSS_TOKENS[miniTier]
      var name = entity.name ? entity.name.string : entityId
      exploreGiveTokens(player, miniTier, miniAmt, name)
      return
    }
  } catch (e) {
    console.warn('[codex_exploration_kills] death handler threw: ' + e)
  }
}))

// =============================================================================
// NON-OVERWORLD DIMENSION ENTRY BONUS — §3: "Non-overworld dimension (per tier)
// — 20". Semantics were ⚠OPEN; implemented as 20 tokens on FIRST entry to each
// non-overworld progression dimension, tracked per-player per-dimension (see
// report). Tokens are of the dimension's tier. Polled on the player tick (the
// pack has no changedDimension event wired anywhere; milestone_detection.js
// uses the same poll pattern for dim-visit tracking).
// =============================================================================
const EXPLORE_DIM_ENTRY_BONUS = 20 // ⚠OPEN default (per dimension, first entry)

// dimension ID → { tier, key }. Tier = the dimension's location tier; token
// granted = progression_token_t{tier} (T4 dims fold to t3 per EXPLORE_TOKEN_ITEM).
// Overworld is intentionally excluded (the §3 table marks it n/a).
// Built from the dimension registry (kubejs/config/icraft/registry/dimensions.json,
// through icraft.dims): every dimension with an `exploration` key pays the
// bonus, in tokens of the dimension's tier. The key is part of the saved flag
// (icraft_codex_dimentry_<key>): never rename one. Until 2026-10-13 the nine
// entries stood here.
// (There is no Deep Aether entry: it registers no dimension, its biomes
//  generate inside aether:the_aether. Two quests still wait for the flag
//  icraft_codex_dimentry_deep_aether (quests/heracles_reconcile.js); how
//  "reached the Deep Aether" should be detected is an operator decision.)
const EXPLORE_DIMENSIONS = (function () {
  var out = {}
  var ids = icraft.dims.ids('exploration')
  for (var i = 0; i < ids.length; i++) {
    out[ids[i]] = { tier: icraft.dims.tier(ids[i]), key: icraft.dims.get(ids[i], 'exploration') }
  }
  return out
})()

global.tick_codexDimEntryBonus = (event) => {
  try {
    // `var` (not const/let): this poll fires repeatedly — Rhino throws
    // "redeclaration of var player" on a const/let in a re-invoked closure.
    var player = event.player
    if (!player || player.creative || player.spectator) return
    var dim = String(player.level.dimension)
    var entry = EXPLORE_DIMENSIONS[dim]
    if (!entry) return

    var pdata = player.persistentData
    var flagKey = 'icraft_codex_dimentry_' + entry.key
    if (pdata.getBoolean(flagKey)) return // already claimed this dimension
    pdata.putBoolean(flagKey, true)

    exploreGiveTokens(player, entry.tier, EXPLORE_DIM_ENTRY_BONUS,
      'First arrival in a new dimension')
    // `execute at`: see the first-kill jingle above.
    player.server.runCommandSilent('execute at ' + player.username +
      ' run playsound minecraft:item.trident.thunder player ' + player.username + ' ~ ~ ~ 0.4')
  } catch (e) {
    console.warn('[codex_exploration_kills] dim-entry tick threw: ' + e)
  }
}
// Poll roughly every 2s (offset to spread load vs the other dim poll at +0).
global.registerPlayerTick('tick_codexDimEntryBonus', 40, 11)

console.log('[IridescentCraft] Codex exploration KILL drops loaded')
console.log('  Minibosses: ' + Object.keys(MINIBOSS_TIER).length +
            ' | Named bosses: ' + Object.keys(NAMED_BOSS_TIER).length +
            ' | Dimension-entry bonuses: ' + Object.keys(EXPLORE_DIMENSIONS).length +
            ' (' + EXPLORE_DIM_ENTRY_BONUS + ' tokens, first entry)')
