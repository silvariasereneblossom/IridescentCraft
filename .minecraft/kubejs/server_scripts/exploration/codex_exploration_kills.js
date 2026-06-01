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
// The token TIER granted = the boss/miniboss's LOCATION tier (derived from the
// milestone_detection.js TIER_N_BOSSES roster + this file's miniboss sets,
// which mirror wiki/design/boss-catalog.md). Tokens are given as
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
// NAMED (trophy) BOSSES — the one-time-first-kill + repeat-kill roster.
// T2/T3/T4 mirror milestone_detection.js TIER_N_BOSSES verbatim (the canonical
// "main quest" boss line). T1 is NOT curated in milestone_detection.js (per
// boss-catalog.md, T1 has no trophy-boss tracker yet); we seed a small
// jar-confirmed T1 set so T1 has *a* combat token path. Keep T1 conservative —
// these are the structure-locked overworld bosses confirmed T1 in the catalog.
// =============================================================================
const NAMED_BOSSES_BY_TIER = {
  1: [
    // boss-catalog.md T1 — structure-locked overworld, jar-confirmed T1 (#54).
    'terramity:gob',
    'terramity:super_sniffer',
    'terramity:enchanter_merlin',
    // Mowzie's Mobs — 4 boss-bar bosses, all overworld structures (jar bosses.json).
    'mowziesmobs:frostmaw',
    'mowziesmobs:ferrous_wroughtnaut',
    'mowziesmobs:umvuthi',
    'mowziesmobs:sculptor',
    // Marium's Soulslike Weaponry — early-chain boss-bar bosses (overworld
    // structures/altars). Nether-anchored 4 are in tier 3 below.
    'soulsweapons:draugr_boss',
    'soulsweapons:returning_knight',
    'soulsweapons:night_shade',
    'soulsweapons:moonknight',
  ],
  2: [
    // === milestone_detection.js TIER_2_BOSSES ===
    'twilightforest:naga',
    'twilightforest:lich',
    'twilightforest:hydra',
    'twilightforest:ur_ghast',
    'twilightforest:knight_phantom',
    'twilightforest:snow_queen',
    'twilightforest:minoshroom',
    'blue_skies:summoner',
    'blue_skies:alchemist',
    'blue_skies:starlit_crusher',
    'blue_skies:arachnarch',
    'aether:slider',
    'aether:valkyrie_queen',
    'aether:sun_spirit',
    // catalog T2 trophy bosses not in the milestone curation but boss-bar bosses
    'twilightforest:alpha_yeti',
  ],
  3: [
    // === milestone_detection.js TIER_3_BOSSES ===
    'cataclysm:netherite_monstrosity',
    'cataclysm:ignis',
    'cataclysm:the_harbinger',
    'cataclysm:the_leviathan',
    'cataclysm:maledictus',
    'cataclysm:ancient_remnant',
    'cataclysm:the_baby_leviathan',
    'meetyourfight:dame_fortuna',
    'meetyourfight:rosalyne',
    'undergarden:forgotten_guardian',
    'deeperdarker:stalker',
    'deeperdarker:shattered',
    'minecraft:wither',
    // Cardinal Sins (relocated to Nether/Undergarden = T3 in milestone_detection.js)
    'cardinal_sins:linneausofsloth',
    'cardinal_sins:sinofgluttony',
    'cardinal_sins:sinofgreed',
    'cardinal_sins:sinofenvy',
    'cardinal_sins:sinoflust',
    'cardinal_sins:sinofpride',
    'cardinal_sins:sinofwrath',
    'cardinal_sins:drakara',
    // catalog T3 boss-bar bosses (Cataclysm Scylla, ISS structure bosses, Ultris)
    'cataclysm:scylla',
    'irons_spellbooks:dead_king',
    'irons_spellbooks:fire_boss',
    'irons_spellbooks:citadel_keeper',
    'irons_spellbooks:archevoker',
    'ultris_mr:blaze_king',
    // Marium's Soulslike Weaponry — Nether-anchored endgame bosses (boss-bar).
    // Decaying King pre-placed in the Nether `decaying_kingdom`; the Chaos
    // Monarch + Day Stalker/Night Prowler duo ride its progression depth (T3).
    'soulsweapons:accursed_lord_boss',
    'soulsweapons:chaos_monarch',
    'soulsweapons:day_stalker',
    'soulsweapons:night_prowler',
  ],
  4: [
    // === milestone_detection.js TIER_4_BOSSES ===
    'minecraft:ender_dragon',
    'botania:doppleganger',       // Guardian of Gaia
    'cataclysm:ender_guardian',
    'cataclysm:ignited_revenant',
    'cardinal_sins:lucifer',
    'cardinal_sins:luciferphase_1',
    // catalog T4 trophy/endgame bosses
    'cataclysm:ancient_remnant',  // also listed T3 in milestone; T4 in catalog — see note
    'deep_aether:eots_controller',
    'minecraft:warden',
    'terramity:virtue',           // relocated → Deep Aether (T4) per #54
    'terramity:sorceress_circe',  // relocated → The End (T4) per #54
  ],
}

// =============================================================================
// MINIBOSSES — boss-tier MOBS / variants (no one-time gate; every kill pays).
// Curated from boss-catalog.md "mini-boss" / "boss-tier mob" rows. These are
// the high-HP non-trophy spawns players grind for drops. Kept distinct from the
// NAMED roster so the one-time first-kill bonus only applies to true bosses.
// =============================================================================
const MINIBOSSES_BY_TIER = {
  1: [
    // Mutant Monsters overworld variants (catalog T1-T2 → counted T1 here).
    'mutantmonsters:mutant_zombie',
    'mutantmonsters:mutant_skeleton',
    'mutantmonsters:mutant_creeper',
    'mutantmonsters:mutant_zombie_villager',
    // Mowzie's Mobs — Naga is the overworld (beach/mountain) mini-boss; NOT in the
    // jar bosses.json tag (no boss bar) → miniboss, not a named trophy boss.
    'mowziesmobs:naga',
  ],
  2: [
    'twilightforest:adherent',
    'twilightforest:harbinger_cube',
    'mutantmonsters:mutant_enderman',
    'meetyourfight:bellringer',
    'meetyourfight:swampjaw',
    'ultris_mr:corrupted_enderman',
    'ultris_mr:giant',
    'terramity:gundalf',
    'terramity:trial_guardian',
    'terramity:ultra_sniffer',
  ],
  3: [
    // Undergarden / Deeper Darker mini-bosses + ISS boss-tier mobs +
    // Stalwart Dungeons mini-bosses (all catalog T3).
    'undergarden:forgotten',
    'undergarden:rotbeast',
    'undergarden:masticator',
    'deeperdarker:shriek_worm',
    'irons_spellbooks:cryomancer',
    'irons_spellbooks:pyromancer',
    'irons_spellbooks:necromancer',
    'irons_spellbooks:priest',
    'irons_spellbooks:magehunter',
    'stalwart_dungeons:awful_ghast',
    'stalwart_dungeons:nether_keeper',
    'stalwart_dungeons:shelterer',
    'stalwart_dungeons:incomplete_wither',
    'stalwart_dungeons:reinforced_blaze',
    'stalwart_dungeons:giddy_blaze',
    'cataclysm:coralssus',
    'alexsmobs:warped_mosco',
    'terramity:gatmancer',
  ],
  4: [
    // Endgame mini-bosses (catalog T4 boss-tier mobs/spawns).
    'cataclysm:ender_golem',
    'alexsmobs:void_worm',
    'terramity:thunker',
    'terramity:uvogre',
    'terramity:duskrok',
    'terramity:hellrok',
    'ultris_mr:shulker_stone',
  ],
}

// ---- Build O(1) lookup maps: entityId → tier ------------------------------
// NAMED takes precedence over MINIBOSS if an ID somehow appears in both.
function buildTierLookup(byTier) {
  const map = {}
  for (let t = 1; t <= 4; t++) {
    const list = byTier[t]
    for (let i = 0; i < list.length; i++) {
      // First-write-wins: lower tiers listed first stay authoritative for dupes
      // (e.g. ancient_remnant T3 vs T4) — matches its primary milestone tier.
      if (map[list[i]] === undefined) map[list[i]] = t
    }
  }
  return map
}
const NAMED_BOSS_TIER = buildTierLookup(NAMED_BOSSES_BY_TIER)
const MINIBOSS_TIER   = buildTierLookup(MINIBOSSES_BY_TIER)

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
EntityEvents.death(event => {
  try {
    const entity = event.entity
    const source = event.source
    if (!entity || !source || !source.player) return
    const player = source.player
    const entityId = String(entity.type)

    // --- NAMED boss? (one-time first-kill bonus, then repeat value) ---
    const namedTier = NAMED_BOSS_TIER[entityId]
    if (namedTier !== undefined) {
      const pdata = player.persistentData
      const fkKey = exploreFirstKillKey(entityId)
      const bossName = entity.name ? entity.name.string : entityId
      if (!pdata.getBoolean(fkKey)) {
        pdata.putBoolean(fkKey, true)
        const amt = EXPLORE_BOSS_FIRST_TOKENS[namedTier]
        exploreGiveTokens(player, namedTier, amt, bossName + ' (first kill!)')
        player.server.runCommandSilent('playsound minecraft:ui.toast.challenge_complete player ' + player.username + ' ~ ~ ~ 0.5')
      } else {
        const amt = EXPLORE_BOSS_REPEAT_TOKENS[namedTier]
        exploreGiveTokens(player, namedTier, amt, bossName)
      }
      return // a named boss is never also scored as a miniboss
    }

    // --- MINIBOSS? (every kill pays the flat tier value) ---
    const miniTier = MINIBOSS_TIER[entityId]
    if (miniTier !== undefined) {
      const amt = EXPLORE_MINIBOSS_TOKENS[miniTier]
      const name = entity.name ? entity.name.string : entityId
      exploreGiveTokens(player, miniTier, amt, name)
      return
    }
  } catch (e) {
    console.warn('[codex_exploration_kills] death handler threw: ' + e)
  }
})

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
const EXPLORE_DIMENSIONS = {
  // --- T2 dimensions ---
  'twilightforest:twilight_forest': { tier: 2, key: 'twilight' },
  'aether:the_aether':              { tier: 2, key: 'aether' },
  'blue_skies:everbright':          { tier: 2, key: 'everbright' },
  'blue_skies:everdawn':            { tier: 2, key: 'everdawn' },
  // --- T3 dimensions ---
  'minecraft:the_nether':           { tier: 3, key: 'nether' },
  'undergarden:undergarden':        { tier: 3, key: 'undergarden' },
  'deeperdarker:otherside':         { tier: 3, key: 'deeperdarker' },
  // --- T4 dimensions ---
  'deep_aether:the_aether':         { tier: 4, key: 'deep_aether' },
  'minecraft:the_end':              { tier: 4, key: 'the_end' },
  'theabyss:the_abyss':             { tier: 4, key: 'the_abyss' },
}

global.tick_codexDimEntryBonus = (event) => {
  try {
    const player = event.player
    if (!player || player.creative || player.spectator) return
    const dim = String(player.level.dimension)
    const entry = EXPLORE_DIMENSIONS[dim]
    if (!entry) return

    const pdata = player.persistentData
    const flagKey = 'icraft_codex_dimentry_' + entry.key
    if (pdata.getBoolean(flagKey)) return // already claimed this dimension
    pdata.putBoolean(flagKey, true)

    exploreGiveTokens(player, entry.tier, EXPLORE_DIM_ENTRY_BONUS,
      'First arrival in a new dimension')
    player.server.runCommandSilent(
      'playsound minecraft:item.trident.thunder player ' + player.username + ' ~ ~ ~ 0.4')
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
