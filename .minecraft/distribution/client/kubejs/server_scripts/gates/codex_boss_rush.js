// =============================================================================
// IRIDESCENT CODEX — COMBAT / BOSS-RUSH ADVANCE TRACKER (Route C)
// File: kubejs/server_scripts/gates/codex_boss_rush.js
//
// Implements progression-framework.md §4 (Route C — Combat / Boss Rush):
//
//   • Per player, track which of a tier's bosses they have killed.
//   • When they clear a PERCENT of that tier's FULL boss roster, auto-advance:
//        T1 → T2 at  80%  of every T1 boss
//        T2 → T3 at  90%  of every T2 boss   (only with tier_2 held)
//        T3 → T4 at 100%  of every T3 boss   (only with tier_3 held; the
//                                            roster INCLUDES Lucifer)
//     The ladder is strict, as for the Codex tokens (decision entry 91,
//     2026-10-15): see brStageBelow.
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
//
// 2026-10-10 -- two Rhino faults fixed (verified on the production rhino jar):
//   * brReadKilled(): `const arr = JSON.parse(raw)` sat inside a `try`. This
//     engine throws "redeclaration of var arr" for that on every call, so the
//     catch reported a "corrupt kill set" and returned []. Every kill after a
//     character's first therefore started from an empty list: the stored set
//     was overwritten with just the newest boss and no tier could ever count
//     past 1. (Kill sets written while this was live hold at most one id per
//     tier; earlier kills cannot be recovered.)
//   * brReport(): its per-tier values were loop-body `const`s, which keep the
//     FIRST iteration's value here -- `/icraft codex bosses` printed the T1 line
//     three times.
// Whole file is one IIFE (body left at column 0): server scripts share a single
// Rhino scope.
// =============================================================================

;(function () {
// ---- Advance thresholds per transition (framework §1 boss-rush column) ------
// pct = fraction of the FULL tier roster that must be cleared to auto-advance.
var BOSS_RUSH_TIERS = {
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
//     below (`phaseOf` in the boss registry), so killing any phase credits the
//     one roster slot.
//   • Cardinal Sins folded into T3 (7 sins + Drakara) and T3-roster Lucifer per
//     the 2026-05-31 ladder — boss-catalog.md predates that integration.
//
// NOTE on T1 reachability (historical): the catalog flagged Brutal Bosses as a
// placeholder set pending a mod-swap. Its 13 ids were never entity types and
// left the roster on 2026-10-12 (see below).

// ROSTERS HOLD REGISTERED ENTITY TYPES ONLY (2026-10-12, operator ruling "Drop
// the dead ids, rescale targets" and, with the numbers in front of them,
// "Ship 9 / 18 / 43"). A kill is credited by entity type id, and 31 of the 104
// ids listed here until that date were not entity types on the pack's mod set
// (checked against a registry dump of a full-pack boot, 815 living types): the
// required count was higher than the number of bosses that exist, at every
// tier, so nobody could ever advance by this route.
//     T1  28 listed, 11 real, needed 23   ->  11 listed, need 9  (80%)
//     T2  23 listed, 19 real, needed 21   ->  20 listed, need 18 (90%)
//     T3  53 listed, 43 real, needed 53   ->  43 listed, need 43 (100%)
// 2026-10-16 (the Aether to tier 4, scope R3): the Slider, the Valkyrie Queen and
// the Sun Spirit left the T2 roster (tier 4 has no rush), Frostmaw moved from
// T1 to T2. The percentages stand, the counts follow the registry by themselves:
//     T1  10 listed, need 8 (80%)   T2  18 listed, need 17 (90%)   T3  43 / 43
// The same day (on recommendation, for review): the Chthonic Cathedral's
// Enchanter Merlin left T1 and he and Sorceress Circe joined T3:
//     T1  9 listed, need 8 (80%)    T2  18 listed, need 17 (90%)   T3  45 / 45
// Removed, with the reason, so that each can come back when it is real:
//   * brutalbosses: zombieboss, skeletonshieldboss, cavespiderboss, huskboss,
//     strayboss, drownedboss, phantomboss, witchboss, irongolemboss, rabbitboss,
//     madcowboss, evilchickenboss, snowgolemboss (T1) -- Brutal Bosses is
//     installed and registers no entity type; its bosses cannot be told from
//     ordinary mobs by type id.
//   * soulsweapons: draugr_boss, returning_knight, night_shade, moonknight (T1),
//     accursed_lord_boss, chaos_monarch, day_stalker, night_prowler (T3), and
//     the moonknight_phase_2 alias -- Marium's Soulslike Weaponry is not in the
//     mod set.
//   * ultris_mr: corrupted_enderman, giant, phantom_swarm (T2), blaze_king,
//     ultra_wither, sanctum_keeper (T3) -- Ultris is installed and registers no
//     entity type under any namespace.
//   * undergarden:masticator, mutantmonsters:mutant_zombie_villager,
//     irons_spellbooks:magehunter (T3) -- not entity types in the installed
//     versions (`magehunter` is the sword; the mob is
//     irons_spellbooks:magehunter_vindicator, NOT added: adding a boss changes
//     the ruled count).
// Corrected, not removed: Teikoku Senshi is majestic_menaces:teikoku_senshi
// (it was listed under `crazybossfights:`, which registers nothing).
// Before adding an id, check that it is a registered entity type.

// The rosters are read from the boss registry (kubejs/config/icraft/registry/
// bosses.json, through icraft.bosses): an entry's `rush` is the roster (tier)
// it counts for. Until 2026-10-13 the three lists stood here, 11 / 20 / 43 ids.
// To add a boss to a roster: its registry entry. Mind that the roster SIZE is
// the denominator of the percentage: the sizes above are a ruling.
var BOSS_RUSH_ROSTERS = (function () {
  var out = { 1: [], 2: [], 3: [] }
  var ids = icraft.bosses.ids('rush')
  for (var i = 0; i < ids.length; i++) out[icraft.bosses.get(ids[i], 'rush')].push(ids[i])
  return out
})()

// =============================================================================
// PHASE / VARIANT ALIASES
// Killing one of these intermediate-phase or variant entity IDs credits the
// canonical roster entity (the value). Keeps multi-phase bosses = ONE slot.
// =============================================================================
// = `phaseOf` in the boss registry: the entry of the phase entity names the
// boss a kill is credited to (four Cardinal Sins phase_1 entities today).
var BOSS_PHASE_ALIASES = (function () {
  var out = {}
  var ids = icraft.bosses.ids('phase')
  for (var i = 0; i < ids.length; i++) out[ids[i]] = icraft.bosses.get(ids[i], 'phase')
  return out
})()

// Resolve an entity ID to its canonical roster ID: first the boss this entity
// id IS (boss registry, `sameAs`: progressivebosses:wither is the Wither), then
// the phase aliases.
function brCanonical(entityId) {
  var id = icraft.bosses.canon(entityId)
  return BOSS_PHASE_ALIASES[id] || id
}

// =============================================================================
// PERSISTENT KILL SET — per tier, a deduped set of canonical killed boss IDs.
// Stored as a JSON array string in player.persistentData under one key per tier.
// (NBT has no native set; a JSON string is reload-safe + trivially deduped.)
// =============================================================================
function brKey(tier) { return 'icraft_boss_rush_t' + tier }

function brReadKilled(player, tier) {
  // String(...): getString hands back a java.lang.String (truthiness and
  // JSON.parse both work on it, but a JS string is the safe currency).
  var raw = String(player.persistentData.getString(brKey(tier)) || '')
  if (raw === '') return []
  // RHINO: `arr` is declared OUT here. As a `const` inside the try it threw on
  // every call and every read looked "corrupt" (see the 2026-10-10 header note).
  var arr = null
  try {
    arr = JSON.parse(raw)
  } catch (e) {
    console.warn('[Codex][BossRush] corrupt kill set for ' + player.username + ' T' + tier + '; resetting. (' + e + ')')
    return []
  }
  if (!Array.isArray(arr)) return []
  // plain JS strings only (indexOf / roster matching use ===)
  var out = []
  for (var i = 0; i < arr.length; i++) out.push(String(arr[i]))
  return out
}

function brWriteKilled(player, tier, arr) {
  player.persistentData.putString(brKey(tier), JSON.stringify(arr))
}

// Record a kill of `canonId` in tier `tier`. Returns the NEW killed count if it
// was a first-time (newly-added) kill of a roster boss, or -1 if it was a
// duplicate / not on the roster.
function brRecordKill(player, tier, canonId) {
  var roster = BOSS_RUSH_ROSTERS[tier]
  if (!roster || roster.indexOf(canonId) < 0) return -1   // not a roster boss for this tier

  var killed = brReadKilled(player, tier)
  if (killed.indexOf(canonId) >= 0) return -1             // already counted (dedupe)

  killed.push(canonId)
  brWriteKilled(player, tier, killed)
  return killed.length
}

// How many DISTINCT roster bosses of `tier` the player has cleared (intersection
// of the stored kill set with the current roster — self-heals if the roster
// shrinks between versions).
function brClearedCount(player, tier) {
  var roster = BOSS_RUSH_ROSTERS[tier]
  if (!roster) return 0
  var killed = brReadKilled(player, tier)
  var n = 0
  for (var i = 0; i < killed.length; i++) {
    if (roster.indexOf(killed[i]) >= 0) n++
  }
  return n
}

// Bosses needed to hit the tier's threshold (ceil of pct * roster size).
function brNeeded(tier) {
  var cfg = BOSS_RUSH_TIERS[tier]
  var roster = BOSS_RUSH_ROSTERS[tier]
  if (!cfg || !roster) return 0
  return Math.ceil(cfg.pct * roster.length)
}

// The stage a player must hold before tier t's roster buys the next one: the
// same strict ladder as the Codex tokens (ruling 8 of 2026-10-14, carried to
// the boss rush by planning 2026-10-15, decision list entry 91). tier_2 before
// 90 % of the tier-2 bosses buy tier_3, tier_3 before 100 % of the tier-3
// bosses buy tier_4. Tier 1's roster asks for nothing: tier_1 is the stage
// every survival player starts with (gates/milestone_detection.js). Until then
// 18 tier-2 bosses killed by a player who never held tier_2 gave tier_3. Kills
// are still recorded without the stage below: they count once it is held.
function brStageBelow(tier) {
  return tier > 1 ? 'tier_' + tier : null
}

// =============================================================================
// ADVANCE — if a tier's cleared-count meets its threshold, its stage isn't
// granted yet and the stage below IS held, auto-advance (grant the stage via
// brGrantTier). Returns true when it granted.
// =============================================================================
function brCheckAdvance(player, tier) {
  var cfg = BOSS_RUSH_TIERS[tier]
  if (!cfg) return false
  if (AStages.playerHasStage(cfg.grantsStage, player)) return false
  var below = brStageBelow(tier)
  if (below && !AStages.playerHasStage(below, player)) return false

  var cleared = brClearedCount(player, tier)
  var need = brNeeded(tier)
  if (cleared < need) return false

  var total = BOSS_RUSH_ROSTERS[tier].length
  var pctTxt = Math.round(cfg.pct * 100)
  brGrantTier(player, cfg.grantsStage,
    'Boss Rush: cleared ' + cleared + '/' + total + ' Tier ' + tier + ' bosses (' + pctTxt + '%)')
  return true
}

// Every tier in order, as the Codex's codexCheckAdvance takes its tokens: a
// player whose tier-2 threshold was met while tier_2 was missing climbs two
// rungs on the kill that buys tier_2.
function brClimb(player) {
  for (var t = 1; t <= 3; t++) brCheckAdvance(player, t)
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
  var tiers = ['tier_1', 'tier_2', 'tier_3', 'tier_4']
  var targetIdx = tiers.indexOf(tier)
  for (var i = 0; i <= targetIdx; i++) {
    if (!AStages.playerHasStage(tiers[i], player)) AStages.addStageToPlayer(tiers[i], player)
  }

  // Patchouli codex advancements up to + including this tier (tier_1 has no gate).
  var advTiers = ['tier_2', 'tier_3', 'tier_4']
  advTiers.slice(0, advTiers.indexOf(tier) + 1).forEach(adv => {
    player.server.runCommandSilent('advancement grant ' + player.username + ' only icraft:stage_' + adv)
  })

  var tierNum = tier.replace('tier_', '')

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
EntityEvents.death(icraft.guard('gates/codex_boss_rush', 'EntityEvents.death', event => {
  // RHINO-SAFETY: `var` only. A loop-body `const` keeps its first iteration's
  // value on this engine, and a `var` is scoped to the block that declares it,
  // so everything read across the loop is declared up here.
  var source = event.source
  if (!source || !source.player) return   // only player kills
  var player = source.player

  // The registry id through the METHOD: getType() is KubeJS's id string, while
  // the `type` property is shadowed on entity classes that have a public
  // `type` field of their own.
  var entityId = ''
  try { entityId = String(event.entity.getType()) } catch (e) { return }
  if (entityId === '') return
  var canonId = brCanonical(entityId)
  var met = false

  for (var tier = 1; tier <= 3; tier++) {
    // Skip tiers the player has already advanced past (cleared-count is moot once
    // the stage is owned — but still record kills below the cap for /bosses display
    // only if not yet granted, to avoid pointless NBT writes after advancement).
    if (AStages.playerHasStage(BOSS_RUSH_TIERS[tier].grantsStage, player)) continue

    var newCount = brRecordKill(player, tier, canonId)
    if (newCount < 0) continue   // not a roster boss for this tier, or duplicate

    var total = BOSS_RUSH_ROSTERS[tier].length
    var need = brNeeded(tier)
    var pctTxt = Math.round(BOSS_RUSH_TIERS[tier].pct * 100)
    var below = brStageBelow(tier)
    var bossName = entityId
    try { bossName = String(event.entity.name.string) } catch (e2) { bossName = entityId }

    if (newCount >= need && below && !AStages.playerHasStage(below, player)) {
      // Threshold met without the stage below: nothing is granted (the strict
      // ladder); the kills stay counted for when the stage is held.
      player.tell(Text.gold('[Boss Rush] ')
        .append(Text.white(bossName))
        .append(Text.gray(' defeated. Tier ' + tier + ': '))
        .append(Text.aqua(newCount + '/' + total))
        .append(Text.yellow('  ✖ unlock ' + below + ' first, then /icraft codex bosses')))
    } else if (newCount >= need) {
      met = true
    } else {
      // Progress nudge (mirrors milestone_detection.js's per-kill tell style).
      player.tell(Text.gold('[Boss Rush] ')
        .append(Text.white(bossName))
        .append(Text.gray(' defeated. Tier ' + tier + ': '))
        .append(Text.aqua(newCount + '/' + total))
        .append(Text.gray(' (need ' + need + ' = ' + pctTxt + '%)')))
    }
  }
  if (met) brClimb(player)
}))

// =============================================================================
// /icraft codex bosses — per-tier boss-rush progress (killed / total, %).
// Merges into the existing `icraft codex` literal (Brigadier unions literals
// across commandRegistry calls — same pattern as submit|balance).
// =============================================================================
function brReport(player) {
  player.tell(Text.gold('═══ Codex Boss Rush ═══'))
  // RHINO: `var`s. As loop-body `const`s every value below kept the Tier 1
  // reading and the report printed the T1 line three times.
  for (var tier = 1; tier <= 3; tier++) {
    var cfg = BOSS_RUSH_TIERS[tier]
    var roster = BOSS_RUSH_ROSTERS[tier]
    var total = roster.length
    var cleared = brClearedCount(player, tier)
    var need = brNeeded(tier)
    var pctHave = total > 0 ? Math.floor((cleared / total) * 100) : 0
    var pctNeed = Math.round(cfg.pct * 100)
    var has = AStages.playerHasStage(cfg.grantsStage, player)
    var below = brStageBelow(tier)
    var blocked = below && !AStages.playerHasStage(below, player)

    var colour = has ? Text.green : (cleared >= need ? Text.aqua : Text.white)
    var line = Text.gray('  ' + cfg.label + ' (need ' + pctNeed + '%): ')
      .append(colour(cleared + ' / ' + total))
      .append(Text.gray('  ' + pctHave + '%'))
    if (has) line = line.append(Text.green('  ✔ ' + cfg.grantsStage + ' unlocked'))
    else if (cleared >= need && blocked) line = line.append(Text.yellow('  ✖ unlock ' + below + ' first'))
    else if (cleared >= need) line = line.append(Text.aqua('  ★ threshold met!'))
    else line = line.append(Text.gray('  (' + (need - cleared) + ' more)'))
    player.tell(line)
  }
  player.tell(Text.gray('  T3 100% includes ').append(Text.red('Lucifer')).append(Text.gray(' (the combat T3→T4 route).')))
  player.tell(Text.gold('═══════════════════════'))

  // A pure-display call may reveal the player already qualifies (e.g. roster
  // shrank, kills predate this file, or the stage below arrived by another
  // route since the threshold was met) — opportunistically advance.
  brClimb(player)
  return 1
}

ServerEvents.commandRegistry(icraft.guard('gates/codex_boss_rush', 'ServerEvents.commandRegistry', event => {
  var Commands = event.commands

  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('codex')
        .then(Commands.literal('bosses')
          .requires(src => src.hasPermission(0))
          .executes(ctx => {
            var sp = null
            try { sp = ctx.source.getPlayerOrException() } catch (e) {
              ctx.source.sendFailure(Text.of('Must be run as a player'))
              return 0
            }
            try { return brReport(sp) } catch (e2) {
              console.warn('[Codex][BossRush] bosses threw for ' + sp.username + ': ' + e2)
              sp.tell(Text.red('[Codex] bosses failed: ' + e2))
              return 0
            }
          })
        )
      )
  )
}))

console.log('[IridescentCraft] Codex boss-rush tracker loaded (/icraft codex bosses)')
console.log('  T1→T2 ' + Math.round(BOSS_RUSH_TIERS[1].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[1].length +
            ' | T2→T3 ' + Math.round(BOSS_RUSH_TIERS[2].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[2].length +
            ' | T3→T4 ' + Math.round(BOSS_RUSH_TIERS[3].pct * 100) + '% of ' + BOSS_RUSH_ROSTERS[3].length +
            ' (incl. Lucifer)')
})()
