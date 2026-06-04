// =============================================================================
// IRIDESCENT CODEX — COMBAT / BOSS-RUSH ADVANCE TRACKER (Route C)
// File: kubejs/server_scripts/gates/codex_boss_rush.js
//
// Implements progression-framework.md §4 (Route C — Combat / Boss Rush):
//
//   • Per player, track which of a tier's bosses they have killed.
//   • When they clear a PERCENT of that tier's FULL boss roster, auto-advance:
//        T1 → T2 at  80%  of every T1 boss
//        T2 → T3 at  90%  of every T2 boss
//        T3 → T4 at 100%  of every T3 boss   (the roster INCLUDES Lucifer)
//     "auto-advance" == grant the next AStages stage, mirroring
//     milestone_detection.js's grantTier (cascade lower tiers + Patchouli
//     icraft:stage_tierN advancement + the gold banner + challenge sound).
//
//   • The roster = EVERY boss in the tier per wiki/design/boss-catalog.md
//     (the full boss-catalog set, NOT the curated 20-boss TIER_N_BOSSES lists
//     in milestone_detection.js). Built below as BOSS_RUSH_ROSTERS.
//
//   • Lucifer's role (framework §5): clearing 100% of T3 — which includes the
//     Cardinal Sins finale `cardinal_sins:lucifer` — IS the combat T3→T4 route.
//     (milestone_detection.js also lets a single Lucifer kill grant tier_4; this
//     file's 100%-of-T3 clear is the boss-RUSH expression of the same gate.)
//
//   • Kills are tracked in player.persistentData as a per-tier SET of killed
//     boss IDs (deduped). A boss only counts once toward its tier's %.
//
//   • `/icraft codex bosses` — per-tier progress (killed / total, %).
//
// COEXISTENCE: This is ADDITIVE. milestone_detection.js keeps its single-kill,
// cumulative-10, craft, dimension, and token-fragment paths; codex_progression_
// engine.js keeps the token-bank path. This file adds the %-of-full-roster path.
// All routes may grant the same stage; AStages.addStageToPlayer + the
// has-stage guards make repeat grants harmless. (Foundational design law:
// "Multi-path tier gating" — new boss content adds to the boss path, never
// replaces the other routes — design-evolution.md.)
//
// RELOAD-SAFETY: registers ONLY EntityEvents.death + ServerEvents.commandRegistry
// (Brigadier unions the `icraft` literal across files, so `/icraft codex bosses`
// merges with the engine's submit|balance). No item creation, no Forge bus
// listener, no global tick registration — nothing that the #60 durability-clamp
// reload-crash lesson warns against.
//
// SOURCES: rosters derived from wiki/design/boss-catalog.md (T1/T2/T3 tables) +
// the Cardinal Sins ladder (design-evolution.md 2026-05-31; entity IDs jar-
// verified against `Cardinal Sins 1.0.3.jar` assets/cardinal_sins/lang/en_us.json).
// 2026-06-01: folded in Mowzie's Mobs (T1: frostmaw/ferrous_wroughtnaut/umvuthi/
// sculptor/naga — all overworld) + Marium's Soulslike Weaponry (T1: draugr_boss/
// returning_knight/night_shade/moonknight; T3: accursed_lord_boss/chaos_monarch/
// day_stalker/night_prowler — Nether-anchored). Boss IDs jar-verified against
// `mowziesmobs-1.8.2.jar` + `soulslike-weaponry-1.4.6-1.20.1-forge.jar`
// data/forge/tags/entity_type(s)/bosses.json + worldgen/structure dimension targets.
// Build-report notes the boss-catalog reconciliation + the balance flags.
// =============================================================================

// ---- Advance thresholds per transition (framework §1 boss-rush column) ------
// pct = fraction of the FULL tier roster that must be cleared to auto-advance.
const BOSS_RUSH_TIERS = {
  1: { pct: 0.80, grantsStage: 'tier_2', label: 'T1→T2' },
  2: { pct: 0.90, grantsStage: 'tier_3', label: 'T2→T3' },
  3: { pct: 1.00, grantsStage: 'tier_4', label: 'T3→T4' },
}

// =============================================================================
// PER-TIER FULL BOSS ROSTERS (the boss-rush DENOMINATOR)
// =============================================================================
// Derived from wiki/design/boss-catalog.md "EVERY boss in the tier" (NOT the
// curated TIER_N_BOSSES 20). Construction rules (documented in the build report):
//   • Real boss-tier entities from each tier's catalog table.
//   • EXCLUDED: legacy / phantom entities the catalog footnotes as "ignore"
//     (e.g. the Old Netherite Monstrosity), dev test entities (Brutal Bosses
//     `dummyboss`), and entries the catalog confirms are NOT in the pack
//     (Void Blossom, LuMoreBosses End Dwellee, Multiplayer-Bosses no-entity row,
//     procedural postgame Rift bosses).
//   • Cross-tier catalog entries (e.g. "T2-T3", "T3-T4") are placed at their
//     LOCATION tier per the "location-based tiering" design law: Ur-Ghast → T2,
//     Harbinger/Leviathan → T3, etc. (catalog's first/lower tier number).
//   • Multi-phase bosses count ONCE. Phase aliases (e.g. cardinal_sins:
//     luciferphase_1) map to the canonical final entity via BOSS_PHASE_ALIASES
//     below, so killing any phase credits the one roster slot.
//   • Cardinal Sins folded into T3 (7 sins + Drakara) and T3-roster Lucifer per
//     the 2026-05-31 ladder — boss-catalog.md predates that integration.
//
// NOTE on T1 reachability: the catalog flags Brutal Bosses as a placeholder set
// pending a mod-swap, and several entries are biome-random (Mad Cow / Evil
// Chicken / Killer Rabbit / Snow Golem) that a player may never encounter. With
// 80% required, T1 boss-rush is the hardest pure route by design; the other
// (non-combat / cumulative / token) routes remain open. Flagged in the report.

const BOSS_RUSH_ROSTERS = {

  // ===== T1 — Overworld (entry tier) — 80% to advance =====
  1: [
    // Brutal Bosses — structure-locked overworld variants (catalog T1).
    'brutalbosses:zombieboss',
    'brutalbosses:skeletonshieldboss',
    'brutalbosses:cavespiderboss',
    'brutalbosses:huskboss',
    'brutalbosses:strayboss',
    'brutalbosses:drownedboss',
    'brutalbosses:phantomboss',
    'brutalbosses:witchboss',
    'brutalbosses:irongolemboss',
    // Brutal Bosses — biome-conditional-random variants (catalog T1, Discovery 4).
    'brutalbosses:rabbitboss',
    'brutalbosses:madcowboss',
    'brutalbosses:evilchickenboss',
    'brutalbosses:snowgolemboss',
    // Mutant Monsters — Skull-Spirit / random T1 variants.
    'mutantmonsters:mutant_zombie',
    'mutantmonsters:mutant_skeleton',
    'mutantmonsters:mutant_creeper',
    // Terramity — confirmed-T1 structure bosses (Virtue + Circe relocated to T4;
    // Ultra Sniffer / Gundalf / Trial Guardian are T2 below).
    'terramity:gob',
    'terramity:enchanter_merlin',
    'terramity:super_sniffer',
    // Mowzie's Mobs — all 4 boss-tag bosses + Naga mini-boss generate in OVERWORLD
    // structures/biomes (jar-verified: frostmaw=#forge:is_snowy, wrought_chamber=
    // underground OW, umvuthi=is_savanna, sculptor=#forge:is_peak, naga=is_beach/
    // is_mountain). Location law → T1.
    'mowziesmobs:frostmaw',
    'mowziesmobs:ferrous_wroughtnaut',
    'mowziesmobs:umvuthi',
    'mowziesmobs:sculptor',
    'mowziesmobs:naga',
    // Marium's Soulslike Weaponry — early chain (overworld structures/altars). The
    // Nether-anchored 4 (Decaying King, Chaos Monarch, Day Stalker, Night Prowler)
    // are in T3 below. Draugr pre-placed in champions_graves (taiga); Moonknight
    // summoned at cathedral_of_resurrection (hills); Returning Knight + Night Shade
    // are Old-Moon-Altar / ambush summons. Location law → T1. (HP runs hot for T1 —
    // see build-report balance flags; difficulty is independent of tier.)
    'soulsweapons:draugr_boss',
    'soulsweapons:returning_knight',
    'soulsweapons:night_shade',
    'soulsweapons:moonknight',
  ],

  // ===== T2 — First-dimensional (Twilight / Aether / Blue Skies) — 90% =====
  2: [
    // Twilight Forest (8 — includes alpha_yeti, which the curated-20 omits).
    'twilightforest:naga',
    'twilightforest:lich',
    'twilightforest:hydra',
    'twilightforest:ur_ghast',          // catalog "T2-T3" → located T2
    'twilightforest:knight_phantom',
    'twilightforest:snow_queen',
    'twilightforest:minoshroom',
    'twilightforest:alpha_yeti',
    // Blue Skies (4).
    'blue_skies:summoner',
    'blue_skies:alchemist',
    'blue_skies:starlit_crusher',
    'blue_skies:arachnarch',
    // Aether (3).
    'aether:slider',
    'aether:valkyrie_queen',
    'aether:sun_spirit',
    // Meet Your Fight — T2 summon bosses (2).
    'meetyourfight:bellringer',
    'meetyourfight:swampjaw',
    // Mutant Monsters — Mutant Enderman (T2 summon context; T4 natural is the
    // same entity ID — deduped to ONE roster slot, placed at T2 per catalog).
    'mutantmonsters:mutant_enderman',
    // Majestic Menaces — ships under modid `crazybossfights` (catalog footnote).
    'crazybossfights:teikoku_senshi',   // catalog "T2-T3" → located T2
    // Ars Nouveau — Wilden Chimera ritual boss.
    'ars_nouveau:wilden_boss',          // catalog "T2-T3" → located T2
    // Ultris (3).
    'ultris_mr:corrupted_enderman',
    'ultris_mr:giant',
    'ultris_mr:phantom_swarm',
  ],

  // ===== T3 — Nether / Undergarden / Deeper Darker — 100% (includes Lucifer) =====
  3: [
    // L_Ender's Cataclysm (9).
    'cataclysm:netherite_monstrosity',  // the current T3 entity (NOT the legacy "Old")
    'cataclysm:ignis',
    'cataclysm:ignited_revenant',       // catalog T3 (scripted post-Ignis)
    'cataclysm:maledictus',
    'cataclysm:the_harbinger',          // catalog "T3-T4" → located T3
    'cataclysm:the_leviathan',          // catalog "T3-T4" → located T3
    'cataclysm:the_baby_leviathan',
    'cataclysm:coralssus',
    'cataclysm:scylla',
    // Iron's Spellbooks (8 — bosses + boss-tier mobs the catalog assigns T3).
    'irons_spellbooks:dead_king',
    'irons_spellbooks:fire_boss',
    'irons_spellbooks:citadel_keeper',
    'irons_spellbooks:archevoker',
    'irons_spellbooks:cryomancer',      // catalog "T2-T3" → located T3 (mob)
    'irons_spellbooks:pyromancer',      // catalog "T2-T3" → located T3 (mob)
    'irons_spellbooks:necromancer',
    'irons_spellbooks:magehunter',
    'irons_spellbooks:priest',
    // Undergarden (4).
    'undergarden:forgotten_guardian',
    'undergarden:masticator',
    'undergarden:forgotten',
    'undergarden:rotbeast',
    // Deeper Darker (2).
    'deeperdarker:stalker',
    'deeperdarker:shattered',
    // Stalwart Dungeons (7).
    'stalwart_dungeons:awful_ghast',
    'stalwart_dungeons:nether_keeper',
    'stalwart_dungeons:shelterer',
    'stalwart_dungeons:shelterer_without_armor',
    'stalwart_dungeons:incomplete_wither',
    'stalwart_dungeons:reinforced_blaze',
    'stalwart_dungeons:giddy_blaze',
    // Meet Your Fight — T3 (2).
    'meetyourfight:dame_fortuna',
    'meetyourfight:rosalyne',
    // Vanilla (Nether).
    'minecraft:wither',
    // Alex's Mobs — Warped Mosco.
    'alexsmobs:warped_mosco',
    // Ultris — T3 (3; Ultra Wither + Sanctum Keeper are catalog "T3-T4" → T3).
    'ultris_mr:blaze_king',
    'ultris_mr:ultra_wither',
    'ultris_mr:sanctum_keeper',
    // Terramity — Gatmancer.
    'terramity:gatmancer',
    // Mutant Monsters — Mutant Zombie Villager.
    'mutantmonsters:mutant_zombie_villager',
    // ----- Cardinal Sins ladder (folded in; boss-catalog.md predates it) -----
    // The 7 sins + Drakara are T3 (relocated to Nether/Undergarden); Lucifer is
    // the T3 capstone whose 100% clear IS the combat T3→T4 route (framework §5).
    'cardinal_sins:linneausofsloth',
    'cardinal_sins:sinofgluttony',
    'cardinal_sins:sinofgreed',
    'cardinal_sins:sinofenvy',
    'cardinal_sins:sinoflust',
    'cardinal_sins:sinofpride',
    'cardinal_sins:sinofwrath',
    'cardinal_sins:drakara',
    'cardinal_sins:lucifer',            // ← Lucifer: T3 100%-clear gate to T4
    // ----- Marium's Soulslike Weaponry — Nether-anchored endgame (4) -----------
    // Decaying King (Accursed Lord) is PRE-PLACED in `decaying_kingdom` which
    // generates in `#minecraft:is_nether` → unambiguous T3. Chaos Monarch (Blackstone
    // Pedestal, Nether-material-gated) + the Day Stalker / Night Prowler Chaos-Orb
    // duo finale (gated behind Moonknight + Chaos Monarch + Decaying-King mats) ride
    // its progression depth → T3. (The early 4 — Draugr/Returning Knight/Night Shade/
    // Moonknight — are in the T1 roster above.)
    'soulsweapons:accursed_lord_boss',  // "The Decaying King" — Nether decaying_kingdom
    'soulsweapons:chaos_monarch',
    'soulsweapons:day_stalker',
    'soulsweapons:night_prowler',
  ],
}

// =============================================================================
// PHASE / VARIANT ALIASES
// Killing one of these intermediate-phase or variant entity IDs credits the
// canonical roster entity (the value). Keeps multi-phase bosses = ONE slot.
// =============================================================================
const BOSS_PHASE_ALIASES = {
  // Cardinal Sins multi-phase finales (jar-verified phase_1 → True/final entity).
  'cardinal_sins:luciferphase_1':   'cardinal_sins:lucifer',
  'cardinal_sins:sinofenvyphase_1': 'cardinal_sins:sinofenvy',
  'cardinal_sins:sinofpridephase_1':'cardinal_sins:sinofpride',
  'cardinal_sins:sinofwrathphase_1':'cardinal_sins:sinofwrath',
  // Marium's Soulslike Weaponry — Moonknight 2nd phase ("Harbinger of Moonlight")
  // is a distinct entity ID; credit the canonical moonknight slot (counts once).
  'soulsweapons:moonknight_phase_2': 'soulsweapons:moonknight',
}

// Resolve an entity ID to its canonical roster ID (apply phase aliases).
function brCanonical(entityId) {
  return BOSS_PHASE_ALIASES[entityId] || entityId
}

// =============================================================================
// PERSISTENT KILL SET — per tier, a deduped set of canonical killed boss IDs.
// Stored as a JSON array string in player.persistentData under one key per tier.
// (NBT has no native set; a JSON string is reload-safe + trivially deduped.)
// =============================================================================
function brKey(tier) { return 'icraft_boss_rush_t' + tier }

function brReadKilled(player, tier) {
  const raw = player.persistentData.getString(brKey(tier))
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.warn('[Codex][BossRush] corrupt kill set for ' + player.username + ' T' + tier + '; resetting. (' + e + ')')
    return []
  }
}

function brWriteKilled(player, tier, arr) {
  player.persistentData.putString(brKey(tier), JSON.stringify(arr))
}

// Record a kill of `canonId` in tier `tier`. Returns the NEW killed count if it
// was a first-time (newly-added) kill of a roster boss, or -1 if it was a
// duplicate / not on the roster.
function brRecordKill(player, tier, canonId) {
  const roster = BOSS_RUSH_ROSTERS[tier]
  if (!roster || roster.indexOf(canonId) < 0) return -1   // not a roster boss for this tier

  const killed = brReadKilled(player, tier)
  if (killed.indexOf(canonId) >= 0) return -1             // already counted (dedupe)

  killed.push(canonId)
  brWriteKilled(player, tier, killed)
  return killed.length
}

// How many DISTINCT roster bosses of `tier` the player has cleared (intersection
// of the stored kill set with the current roster — self-heals if the roster
// shrinks between versions).
function brClearedCount(player, tier) {
  const roster = BOSS_RUSH_ROSTERS[tier]
  if (!roster) return 0
  const killed = brReadKilled(player, tier)
  let n = 0
  for (let i = 0; i < killed.length; i++) {
    if (roster.indexOf(killed[i]) >= 0) n++
  }
  return n
}

// Bosses needed to hit the tier's threshold (ceil of pct * roster size).
function brNeeded(tier) {
  const cfg = BOSS_RUSH_TIERS[tier]
  const roster = BOSS_RUSH_ROSTERS[tier]
  if (!cfg || !roster) return 0
  return Math.ceil(cfg.pct * roster.length)
}

// =============================================================================
// ADVANCE — if a tier's cleared-count meets its threshold and its stage isn't
// granted yet, auto-advance (grant the stage via brGrantTier).
// =============================================================================
function brCheckAdvance(player, tier) {
  const cfg = BOSS_RUSH_TIERS[tier]
  if (!cfg) return
  if (AStages.playerHasStage(cfg.grantsStage, player)) return

  const cleared = brClearedCount(player, tier)
  const need = brNeeded(tier)
  if (cleared < need) return

  const total = BOSS_RUSH_ROSTERS[tier].length
  const pctTxt = Math.round(cfg.pct * 100)
  brGrantTier(player, cfg.grantsStage,
    'Boss Rush: cleared ' + cleared + '/' + total + ' Tier ' + tier + ' bosses (' + pctTxt + '%)')
}

// =============================================================================
// GRANT — mirrors milestone_detection.js grantTier: AStages grant + lower-tier
// cascade + Patchouli icraft:stage_tierN advancement(s) + gold banner +
// server broadcast + challenge-complete sound. Self-contained (AStageEvents.added
// in milestone_detection.js also fires → belt-and-suspenders, not conflicting).
// =============================================================================
function brGrantTier(player, tier, triggerName) {
  if (AStages.playerHasStage(tier, player)) return

  AStages.addStageToPlayer(tier, player)

  // Safety-net: grant all lower tiers too (mirrors milestone_detection.js).
  const tiers = ['tier_1', 'tier_2', 'tier_3', 'tier_4']
  const targetIdx = tiers.indexOf(tier)
  for (let i = 0; i <= targetIdx; i++) {
    if (!AStages.playerHasStage(tiers[i], player)) AStages.addStageToPlayer(tiers[i], player)
  }

  // Patchouli codex advancements up to + including this tier (tier_1 has no gate).
  const advTiers = ['tier_2', 'tier_3', 'tier_4']
  advTiers.slice(0, advTiers.indexOf(tier) + 1).forEach(adv => {
    player.server.runCommandSilent('advancement grant ' + player.username + ' only icraft:stage_' + adv)
  })

  const tierNum = tier.replace('tier_', '')

  player.tell(Text.gold('═══════════════════════════════════════'))
  player.tell(Text.gold('  ★ TIER ' + tierNum + ' UNLOCKED ★'))
  player.tell(Text.white('  Triggered by: ' + triggerName))
  player.tell(Text.gray('  New items, dimensions, and recipes are now available!'))
  player.tell(Text.gold('═══════════════════════════════════════'))

  player.server.tell(Text.yellow('★ ' + player.username + ' has reached Tier ' + tierNum + ' via Boss Rush!'))
  player.server.runCommandSilent('playsound minecraft:ui.toast.challenge_complete player ' + player.username)

  console.log('[IridescentCraft][Codex][BossRush] ' + player.username + ' granted ' + tier + ' via: ' + triggerName)
}

// =============================================================================
// KILL DETECTION — on any player boss kill, credit each tier whose roster
// contains the (phase-resolved) entity, then check that tier for advance.
// A single entity can legitimately belong to only one tier's roster here, but
// we loop all tiers defensively (cheap; indexOf on small arrays).
// =============================================================================
EntityEvents.death(event => {
  // RHINO-SAFETY: var (not const) — closure-local in a repeatedly-invoked death
  // handler; the in-loop consts below also re-declare per tier iteration.
  var source = event.source
  if (!source || !source.player) return   // only player kills
  var player = source.player

  let entityId
  try { entityId = event.entity.type.toString() } catch (e) { return }
  var canonId = brCanonical(entityId)

  for (let tier = 1; tier <= 3; tier++) {
    // Skip tiers the player has already advanced past (cleared-count is moot once
    // the stage is owned — but still record kills below the cap for /bosses display
    // only if not yet granted, to avoid pointless NBT writes after advancement).
    if (AStages.playerHasStage(BOSS_RUSH_TIERS[tier].grantsStage, player)) continue

    var newCount = brRecordKill(player, tier, canonId)
    if (newCount < 0) continue   // not a roster boss for this tier, or duplicate

    var total = BOSS_RUSH_ROSTERS[tier].length
    var need = brNeeded(tier)
    var pctTxt = Math.round(BOSS_RUSH_TIERS[tier].pct * 100)

    if (newCount >= need) {
      brCheckAdvance(player, tier)
    } else {
      // Progress nudge (mirrors milestone_detection.js's per-kill tell style).
      let bossName = entityId
      try { bossName = event.entity.name.string } catch (e) {}
      player.tell(Text.gold('[Boss Rush] ')
        .append(Text.white(bossName))
        .append(Text.gray(' defeated — Tier ' + tier + ': '))
        .append(Text.aqua(newCount + '/' + total))
        .append(Text.gray(' (need ' + need + ' = ' + pctTxt + '%)')))
    }
  }
})

// =============================================================================
// /icraft codex bosses — per-tier boss-rush progress (killed / total, %).
// Merges into the existing `icraft codex` literal (Brigadier unions literals
// across commandRegistry calls — same pattern as submit|balance).
// =============================================================================
function brReport(player) {
  player.tell(Text.gold('═══ Codex Boss Rush ═══'))
  for (let tier = 1; tier <= 3; tier++) {
    const cfg = BOSS_RUSH_TIERS[tier]
    const roster = BOSS_RUSH_ROSTERS[tier]
    const total = roster.length
    const cleared = brClearedCount(player, tier)
    const need = brNeeded(tier)
    const pctHave = total > 0 ? Math.floor((cleared / total) * 100) : 0
    const pctNeed = Math.round(cfg.pct * 100)
    const has = AStages.playerHasStage(cfg.grantsStage, player)

    const colour = has ? Text.green : (cleared >= need ? Text.aqua : Text.white)
    let line = Text.gray('  ' + cfg.label + ' (need ' + pctNeed + '%): ')
      .append(colour(cleared + ' / ' + total))
      .append(Text.gray('  ' + pctHave + '%'))
    if (has) line = line.append(Text.green('  ✔ ' + cfg.grantsStage + ' unlocked'))
    else if (cleared >= need) line = line.append(Text.aqua('  ★ threshold met!'))
    else line = line.append(Text.gray('  (' + (need - cleared) + ' more)'))
    player.tell(line)
  }
  player.tell(Text.gray('  T3 100% includes ').append(Text.red('Lucifer')).append(Text.gray(' — the combat T3→T4 route.')))
  player.tell(Text.gold('═══════════════════════'))

  // A pure-display call may reveal the player already qualifies (e.g. roster
  // shrank, or kills predate this file) — opportunistically advance.
  for (let tier = 1; tier <= 3; tier++) brCheckAdvance(player, tier)
  return 1
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands } = event

  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('codex')
        .then(Commands.literal('bosses')
          .requires(src => src.hasPermission(0))
          .executes(ctx => {
            let sp
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            try { return brReport(sp) } catch (e) {
              console.warn('[Codex][BossRush] bosses threw for ' + sp.username + ': ' + e)
              sp.tell(Text.red('[Codex] bosses failed: ' + e))
              return 0
            }
          })
        )
      )
  )
})

console.log('[IridescentCraft] Codex boss-rush tracker loaded (/icraft codex bosses)')
console.log('  T1→T2 ' + Math.round(BOSS_RUSH_TIERS[1].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[1].length +
            ' | T2→T3 ' + Math.round(BOSS_RUSH_TIERS[2].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[2].length +
            ' | T3→T4 ' + Math.round(BOSS_RUSH_TIERS[3].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[3].length +
            ' (incl. Lucifer)')
