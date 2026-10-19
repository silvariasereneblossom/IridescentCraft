// =============================================================================
// BOSS RUSH -- gates/codex_boss_rush.js: which kills count, when a tier is granted,
// and that it is granted only with the stage below held (the strict ladder of the
// Codex, ruling 8 of 2026-10-14, carried to the boss rush: decision list entry 91,
// 2026-10-15). Written 2026-10-15 with that change; no suite covered the rush before.
//
// The script is one IIFE: nothing of it is reachable from here but its two handlers.
// A kill is EntityEvents.death with a player source; `/icraft codex bosses` is the
// Brigadier tree the script registers, built here from a small stand-in of
// Commands.literal (then / requires / executes) and run through its own `executes`.
// The rosters are the boss registry's (kubejs/config/icraft/registry/bosses.json,
// key `rush`): 9 / 18 / 44 bosses, 8 / 17 / 44 needed (45 at tier 3 until 2026-10-19, when the
// Baby Leviathan, a pet, left it; 11 / 20 / 43 and 9 / 18 / 43
// until 2026-10-16: the Aether's three bosses left the tier-2 roster, Frostmaw moved
// from tier 1 to tier 2; then 10 / 18 / 43 and 8 / 17 / 43 until the Chthonic Cathedral's
// Merlin left tier 1 and he and Sorceress Circe joined the tier-3 roster, the same day).
//
// What is pinned:
//   * a player kill of a roster boss is counted once (a second kill of the same boss,
//     a kill by no player and a boss of no roster count nothing); a phase entity
//     (`phaseOf`) counts for its boss;
//   * tier 1's threshold grants tier_2 (and the tier-2 advancement) with nothing more;
//   * tier 2's and tier 3's thresholds grant nothing without tier_2 / tier_3 held:
//     the kills are kept, the player is told to unlock the stage first, and the
//     report says so ("Jumper", "Summit");
//   * the kill that buys the stage below climbs on: tier_2 then tier_3 at once when
//     the tier-2 threshold was met before ("Climber");
//   * a stage below that arrives by another route is honoured at the next
//     `/icraft codex bosses` ("Banker").
// =============================================================================
var BR = { 1: [], 2: [], 3: [] }
;(function () {
  var ids = icraft.bosses.ids('rush')
  for (var i = 0; i < ids.length; i++) BR[Number(icraft.bosses.get(ids[i], 'rush'))].push(String(ids[i]))
})()
var br_has = function (p, stage) { return AStages.playerHasStage(stage, p) === true }
var br_told = function (p, part) { return String(A.told(p)).indexOf(part) >= 0 }
var br_saved = function (p, tier) {
  var raw = String(p.persistentData.getString('icraft_boss_rush_t' + tier) || '')
  return raw === '' ? [] : JSON.parse(raw)
}
// a player kill of `type` (one mob, killed by `p`)
var br_kill = function (p, type) {
  var mob = T_mob(type)
  return T_fire('E.death', { entity: mob, source: new MSource('minecraft:player_attack', p, p), level: T_OW, server: T_server })
}
// the first n bosses of a tier's roster, killed in order
var br_killN = function (p, tier, n) { for (var i = 0; i < n; i++) br_kill(p, BR[tier][i]) }

// `/icraft codex bosses`: the tree the script registers, run through its own executes
var br_trees = []
var br_literal = function (name) {
  var n = { name: String(name), kids: {}, exec: null, req: null }
  n.then = function (c) { n.kids[c.name] = c; return n }
  n.requires = function (f) { n.req = f; return n }
  n.executes = function (f) { n.exec = f; return n }
  return n
}
T_fire('S.commandRegistry', { commands: { literal: br_literal }, register: function (n) { br_trees.push(n) } })
var br_bossesNode = function () {
  for (var i = 0; i < br_trees.length; i++) {
    var t = br_trees[i]
    if (t.name === 'icraft' && t.kids.codex && t.kids.codex.kids.bosses) return t.kids.codex.kids.bosses
  }
  return null
}
var br_report = function (p) {
  var node = br_bossesNode()
  return Number(node.exec({ source: { getPlayerOrException: function () { return p }, sendFailure: function (m) {} } }))
}

T_run('boss rush: loads', function () {
  ok(T_LOAD_ERRORS.length === 0, 'the libraries and the rush load: ' + T_LOAD_ERRORS.join(' / '))
  ok(BR[1].length === 9 && BR[2].length === 18 && BR[3].length === 44, 'the rosters from the registry: 9 / 18 / 44 (' + BR[1].length + ' / ' + BR[2].length + ' / ' + BR[3].length + ')')
  var line = T_LOG.info.join('\n')
  ok(line.indexOf('T1→T2 80% of 9 | T2→T3 90% of 18 | T3→T4 100% of 44') >= 0, 'the load line names the three thresholds')
  var node = br_bossesNode()
  ok(node !== null && typeof node.exec === 'function' && node.req({ hasPermission: function (n) { return n === 0 } }) === true,
    '/icraft codex bosses is registered for every player (permission 0)')
})

T_run('boss rush: what counts', function () {
  var p = T_newPlayer('Counter').t_stage('tier_1')
  br_kill(p, BR[1][0])
  br_kill(p, BR[1][0])
  ok(br_saved(p, 1).join(',') === BR[1][0], 'a boss killed twice counts once (' + br_saved(p, 1).join(',') + ')')
  ok(br_told(p, 'Tier 1: ') && br_told(p, '1/9') && br_told(p, '(need 8 = 80%)'), 'the kill is told: 1/9, need 8')
  var mob = T_mob(BR[1][1])
  T_fire('E.death', { entity: mob, source: new MSource('minecraft:generic', null, null), level: T_OW, server: T_server })
  br_kill(p, 'minecraft:zombie')
  ok(br_saved(p, 1).length === 1 && br_saved(p, 2).length === 0 && br_saved(p, 3).length === 0,
    'a kill by no player and a mob of no roster count nothing')
  br_kill(p, 'cardinal_sins:luciferphase_1')
  ok(br_saved(p, 3).join(',') === 'cardinal_sins:lucifer', 'Lucifer\'s first phase counts for Lucifer, tier 3 (' + br_saved(p, 3).join(',') + ')')
  br_kill(p, 'cardinal_sins:lucifer')
  ok(br_saved(p, 3).length === 1, 'and Lucifer himself is the same slot')
})

T_run('boss rush: tier 1 grants tier 2 with nothing more', function () {
  var p = T_newPlayer('Rookie').t_stage('tier_1')
  br_killN(p, 1, 7)
  ok(!br_has(p, 'tier_2') && br_saved(p, 1).length === 7 && br_told(p, '7/9'), '7 of 9: no tier yet')
  A.clearCommands(T_server)
  br_kill(p, BR[1][7])
  ok(br_has(p, 'tier_2') && !br_has(p, 'tier_3'), 'the 8th tier-1 boss grants tier_2, nothing above it')
  var commands = String(A.commands(T_server))
  ok(commands.indexOf('advancement grant Rookie only icraft:stage_tier_2') >= 0 && commands.indexOf('playsound minecraft:ui.toast.challenge_complete player Rookie') >= 0,
    'the advancement and the sound are sent: ' + commands)
  ok(br_told(p, 'TIER 2 UNLOCKED') && br_told(p, 'Boss Rush: cleared 8/9 Tier 1 bosses (80%)'), 'the banner names the route')
  br_kill(p, BR[1][8])
  ok(br_saved(p, 1).length === 8, 'with tier_2 held, a later tier-1 kill is not recorded any more')
})

T_run('boss rush: no tier 3 without tier 2 (the strict ladder)', function () {
  // until 2026-10-15 this player got tier_3 (and tier_2 marked) on the 18th kill (decision list entry 91)
  var p = T_newPlayer('Jumper').t_stage('tier_1')
  A.clearCommands(T_server)
  br_killN(p, 2, 17)
  ok(!br_has(p, 'tier_3') && !br_has(p, 'tier_2'), '17 of 18 tier-2 bosses and no tier_2: no tier is granted')
  ok(br_saved(p, 2).length === 17, 'the 17 kills are kept (' + br_saved(p, 2).length + ')')
  ok(String(A.commands(T_server)).indexOf('only icraft:stage_tier_') < 0, 'no advancement is granted (' + A.commands(T_server) + ')')
  ok(br_told(p, '17/18') && br_told(p, 'unlock tier_2 first, then /icraft codex bosses'), 'the 17th kill tells the player to unlock tier_2 first')
  A.clearTold(p)
  br_report(p)
  ok(br_told(p, 'T2→T3 (need 90%): ') && br_told(p, '17 / 18') && br_told(p, 'unlock tier_2 first') && !br_has(p, 'tier_3'),
    '/icraft codex bosses shows 17 / 18, says tier_2 comes first, and grants nothing')
})

T_run('boss rush: the kill that buys tier 2 climbs on to tier 3', function () {
  var p = T_newPlayer('Climber').t_stage('tier_1')
  br_killN(p, 2, 17)
  br_killN(p, 1, 7)
  ok(!br_has(p, 'tier_2') && !br_has(p, 'tier_3'), 'tier-2 threshold met, 7 of 9 tier-1: nothing yet')
  A.clearCommands(T_server)
  br_kill(p, BR[1][7])
  ok(br_has(p, 'tier_2') && br_has(p, 'tier_3') && !br_has(p, 'tier_4'), 'the 8th tier-1 boss grants tier_2, then tier_3, in one kill')
  var commands = String(A.commands(T_server))
  ok(commands.indexOf('only icraft:stage_tier_2') >= 0 && commands.indexOf('only icraft:stage_tier_3') >= 0, 'both advancements are sent')
  ok(br_told(p, 'Boss Rush: cleared 17/18 Tier 2 bosses (90%)'), 'the tier-3 banner names the tier-2 clear')
})

T_run('boss rush: a stage below from another route is honoured at the next report', function () {
  var p = T_newPlayer('Banker').t_stage('tier_1')
  br_killN(p, 2, 18)
  ok(!br_has(p, 'tier_3') && br_saved(p, 2).length === 18, 'all 18 tier-2 bosses without tier_2: nothing granted, 18 kept')
  p.t_stage('tier_2')                                      // bought with Codex tokens, say
  A.clearTold(p)
  br_report(p)
  ok(br_has(p, 'tier_3') && br_told(p, 'TIER 3 UNLOCKED') && br_told(p, 'Boss Rush: cleared 18/18 Tier 2 bosses (90%)'),
    'with tier_2 held, /icraft codex bosses grants tier_3')
})

T_run('boss rush: no tier 4 without tier 3', function () {
  // until 2026-10-15 a tier-2 player who killed all 43 tier-3 bosses got tier_4 (tier_3 marked; 45 since 2026-10-16, 44 since 2026-10-19: the Baby Leviathan, a pet, is off)
  var p = T_newPlayer('Summit').t_stage('tier_1').t_stage('tier_2')
  br_killN(p, 3, 44)
  ok(!br_has(p, 'tier_4') && !br_has(p, 'tier_3') && br_saved(p, 3).length === 44, 'all 44 tier-3 bosses and no tier_3: no tier_4, the 44 kept')
  ok(br_told(p, '44/44') && br_told(p, 'unlock tier_3 first'), 'the 44th kill tells the player to unlock tier_3 first')
  var q = T_newPlayer('Summit2').t_stage('tier_1').t_stage('tier_2').t_stage('tier_3')
  br_killN(q, 3, 43)
  ok(!br_has(q, 'tier_4') && br_told(q, '43/44'), 'with tier_3 held: 43 of 44 is not enough (100 %)')
  br_kill(q, BR[3][43])
  ok(br_has(q, 'tier_4') && br_told(q, 'TIER 4 UNLOCKED'), 'the 44th grants tier_4')
})

T_run('boss rush: the report and the handlers ran clean', function () {
  ok(T_UNCAUGHT.length === 0, 'no handler threw past its guard: ' + T_UNCAUGHT.join(' / '))
  var guardLines = T_LOG.error.concat(T_LOG.warn).filter(function (l) { return l.indexOf('codex_boss_rush') >= 0 || l.indexOf('BossRush') >= 0 })
  ok(guardLines.length === 0, 'no error or warning from the rush: ' + guardLines.join(' / '))
})
