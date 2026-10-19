// =============================================================================
// PER-KILL -- scaling/boss_progressive.js, per-kill boss scaling PER PLAYER (ruling 23, 2026-10-14; the design
// answered by the operator 2026-10-15: internal design/per-kill-scaling-per-player-2026-10-15.md).
// On the production script engine, with the spawn harness's ports of the 1.20.1 attribute classes (so the
// multiply_total arithmetic, the boss x3, the designed health and a save/load are the game's own) and the pack's
// scaling scripts and registry. What is pinned:
//   * which bosses: the registry flag perKill under its switch; the Wither, the Dragon and a zombie are not;
//   * the curve: fight n = the row "kill n" (fight 2 +15 / +10 / +3 % ... fight 15 and on +150 / +80 / +15 %),
//     as multiply_total on health, attack damage and speed: a share of the boss as the pack builds it;
//   * the first hit a boss trades with a player (either way round) fixes it, at the HIGHEST count among the
//     players within 64 blocks; later hits, and players who arrive later, change nothing; it keeps its share of
//     health; the players within 64 blocks are told one line;
//   * a hit with no player on either side fixes nothing;
//   * a death adds one kill to every player within 64 blocks (not further, not a spectator), per boss id;
//   * a boss fixed at base stays at base; a fixed boss is the same after a save and load; one whose modifiers
//     could not be saved gets the SAME count back when it loads, whoever is near then;
//   * /icraft bosskills lists a player's counts and the next fight of each;
//   * the switch off: nothing is fixed and nothing is counted.
// The players are spawn-harness entities with player = true in the boss's level (KubeJS: level.players); the hurt
// event is the Forge event as the dispatcher of 0_lib_core.js reads it, run through core.hurtHandlers().
// =============================================================================
var HP = 'minecraft:generic.max_health'
var DMG = 'minecraft:generic.attack_damage'
var SPD = 'minecraft:generic.movement_speed'
var passed = 0
var failed = 0
function check(name, cond, detail) {
  __host.snap((cond ? '  ok   ' : '  FAIL ') + name)
  if (cond) { passed++; __host.print('  ok   ' + name) }
  else { failed++; __host.fail(); __host.print('  FAIL ' + name + (detail ? ' -- ' + detail : '')) }
}
function near(a, b) { return Math.abs(Number(a) - Number(b)) < 0.01 }
function has(text, piece) { return String(text).indexOf(piece) >= 0 }
function flagIs(e, flag, n) { return new RegExp('(^| )' + flag + '=' + n + '( |$)').test(String(e.flags())) }
function harbinger(level) { return __host.living('cataclysm:the_harbinger', 350, level).attr(DMG, 10).attr(SPD, 0.3) }
function naga(level) { return __host.living('twilightforest:naga', 120, level).attr(DMG, 5).attr(SPD, 0.5) }
// the Forge LivingHurtEvent as the dispatcher reads it: isCanceled, getEntity, getSource (.actual), getAmount, setAmount
function hurtEvent(victim, attacker, amount) {
  var ev = { amount: amount, cancelled: false }
  ev.isCanceled = function () { return ev.cancelled }
  ev.getEntity = function () { return victim }
  ev.getSource = function () { return { actual: attacker, immediate: attacker } }
  ev.getAmount = function () { return ev.amount }
  ev.setAmount = function (a) { ev.amount = a }
  return ev
}
var HIT = global.icraft.core.hurtHandlers()['scaling/boss_progressive']
function hit(victim, attacker) { HIT(hurtEvent(victim, attacker, 4)) }
function die(entity) {
  var ev = { entity: entity, level: entity.getLevel(), source: null }
  for (var i = 0; i < __death.length; i++) __death[i](ev)
}
function kills(p, id) { return pkKills(p, id) }
function setKills(p, id, n) {
  var data = p.getPersistentData()
  if (!data.contains('icraft_boss_kills')) data.put('icraft_boss_kills', {})
  data.getCompound('icraft_boss_kills').putInt(id, n)
}
var HARB = 'cataclysm:the_harbinger'

__host.print('P1  which bosses scale')
check('P1 the switch is on and the hurt handler is registered', global.icraft.bosses.enabled('perKill') === true && typeof HIT === 'function')
var L0 = __host.level()
check('P1 a flagged boss (the Harbinger), one of the 22 named bosses of 10-12 (Gob, Lucifer) are scalable',
  pkBossId(harbinger(L0)) === HARB && pkBossId(__host.living('terramity:gob', 450, L0)) === 'terramity:gob' &&
  pkBossId(__host.living('cardinal_sins:lucifer', 400, L0)) === 'cardinal_sins:lucifer')
check('P1 the Wither (both ids), the Ender Dragon, the Warden and a zombie are not',
  pkBossId(__host.living('minecraft:wither', 300, L0)) === null && pkBossId(__host.living('progressivebosses:wither', 300, L0)) === null &&
  pkBossId(__host.living('minecraft:ender_dragon', 200, L0)) === null && pkBossId(__host.living('minecraft:warden', 500, L0)) === null &&
  pkBossId(__host.living('minecraft:zombie', 20, L0)) === null)
check('P1 78 registered bosses carry the flag (the 53 of April, the 22 named, the 3 Cardinal Sins first phases), 80 entries with the 2 absent ones that stay (ub:sorcerer, ub:storm: the Codex reads them)', global.icraft.bosses.ids('perKill').length === 80)

__host.print('P2  the curve: fight n is the row "kill n"')
function row(f) { var s = pkScale(f); return s.hp + '/' + s.dmg + '/' + s.spd }
check('P2 fight 1 is base, fight 2 +15/+10/+3 %', row(1) === '0/0/0' && row(2) === '0.15/0.1/0.03')
check('P2 fights 3-4 +30/+20/+5, 5-6 +50/+35/+8, 7-9 +75/+48/+10',
  row(3) === '0.3/0.2/0.05' && row(4) === '0.3/0.2/0.05' && row(5) === '0.5/0.35/0.08' && row(6) === '0.5/0.35/0.08' &&
  row(7) === '0.75/0.48/0.1' && row(9) === '0.75/0.48/0.1')
check('P2 fights 10-14 +100/+60/+12, from fight 15 the cap +150/+80/+15', row(10) === '1/0.6/0.12' && row(14) === '1/0.6/0.12' &&
  row(15) === '1.5/0.8/0.15' && row(40) === '1.5/0.8/0.15')

__host.print('P3  the first exchange fixes the boss at the highest count within 64 blocks')
var L = __host.level()
var A = L.t_player('A', 10, 0, 0)
var B = L.t_player('B', 0, 0, 30)
var C = L.t_player('C', 70, 0, 0)
setKills(A, HARB, 4); setKills(B, HARB, 1); setKills(C, HARB, 9)
var h = join(harbinger(L), 1.5)
var max0 = h.rawMax(), dmg0 = h.value(DMG), spd0 = h.value(SPD)
check('P3 at its join the boss is as the pack builds it: (800 + 350*0.5) * 3 = 2925, no per-kill flag', near(max0, 2925) && !has(h.flags(), 'icraft_pk_scaled'))
hit(h, A)
__host.print('     after the first hit: max=' + h.rawMax() + ' health=' + h.rawHealth() + ' dmg=' + h.value(DMG) + ' spd=' + h.value(SPD) + ' | ' + h.mods(HP) + ' | ' + h.flags())
check('P3 the highest count within 64 blocks is A\'s 4 (C\'s 9 is 70 blocks away): fight 5', flagIs(h, 'icraft_pk_kills', 4) && flagIs(h, 'icraft_pk_scaled', 2))
check('P3 +50 % of the built boss: 2925 * 1.5 = 4387.5 health, full; damage x1.35, speed x1.08',
  near(h.rawMax(), 4387.5) && near(h.rawHealth(), 4387.5) && near(h.value(DMG), dmg0 * 1.35) && near(h.value(SPD), spd0 * 1.08),
  'max=' + h.rawMax() + ' dmg=' + h.value(DMG) + ' was ' + dmg0)
check('P3 the three modifiers are saved with the boss', has(h.mods(HP), 'icraft_pk_hp') && !has(h.mods(HP), '*') && !has(h.mods(DMG), '*') && !has(h.mods(SPD), '*'))
check('P3 A and B are told one line (fight 5, +50 % health, +35 % damage, +8 % speed); C is not',
  has(A.t_told(), 'fight 5') && has(A.t_told(), '+50 % health, +35 % damage, +8 % speed') && has(A.t_told(), 'entity.cataclysm.the_harbinger') &&
  has(B.t_told(), 'fight 5') && C.t_told() === '', 'A: ' + A.t_told())
C.t_at(5, 0, 5)
var fixedMax = h.rawMax()
hit(h, C); hit(h, A)
check('P3 later hits, also by C (9 kills) who came close, change nothing', near(h.rawMax(), fixedMax) && flagIs(h, 'icraft_pk_kills', 4) &&
  String(A.t_told()).split(' | ').length === 1, 'max ' + h.rawMax() + ' / ' + fixedMax + ', ' + h.flags() + ', A told: ' + A.t_told())

__host.print('P4  a boss hit at half health keeps its share')
var L4 = __host.level()
var D = L4.t_player('D', 0, 0, 0)
setKills(D, HARB, 1)
var h4 = join(harbinger(L4), 1.5)
h4.damageTo(h4.rawMax() / 2)
hit(h4, D)
check('P4 fight 2: max 2925 * 1.15 = 3363.75, health half of it', near(h4.rawMax(), 3363.75) && near(h4.rawHealth(), 3363.75 / 2), 'health=' + h4.rawHealth())

__host.print('P5  the boss hits a player first')
var L5 = __host.level()
var E = L5.t_player('E', 3, 0, 0)
setKills(E, HARB, 15)
var h5 = join(harbinger(L5), 1.5)
hit(E, h5)
check('P5 the boss is the attacker: fixed the same way, fight 16 at the cap: 2925 * 2.5 = 7312.5', flagIs(h5, 'icraft_pk_kills', 15) && near(h5.rawMax(), 7312.5))

__host.print('P6  hits that fix nothing')
var L6 = __host.level()
var F = L6.t_player('F', 0, 0, 0)
setKills(F, HARB, 3)
var h6 = join(harbinger(L6), 1.5)
var mob = __host.living('minecraft:zombie', 20, L6)
hit(h6, mob); hit(mob, h6)
check('P6 a mob and the boss trade hits, no player on either side: not fixed', !has(h6.flags(), 'icraft_pk_scaled') && near(h6.rawMax(), 2925))
var w = join(__host.living('progressivebosses:wither', 300, L6), 1.5)
var wMax = w.rawMax()
hit(w, F)
check('P6 a player hits the Wither: nothing', !has(w.flags(), 'icraft_pk_scaled') && near(w.rawMax(), wMax))

__host.print('P7  a death counts for every player within 64 blocks')
var L7 = __host.level()
var G = L7.t_player('G', 10, 0, 10)
var Hh = L7.t_player('H', 40, 6, 0)
var I = L7.t_player('I', 65, 0, 0)
var S = L7.t_player('S', 5, 0, 0).t_spectator(true)
setKills(G, HARB, 2)
var h7 = join(harbinger(L7), 1.5)
die(h7)
check('P7 G (2 -> 3) and H (0 -> 1) are credited; I at 65 blocks and the spectator are not',
  kills(G, HARB) === 3 && kills(Hh, HARB) === 1 && kills(I, HARB) === 0 && kills(S, HARB) === 0,
  'G ' + kills(G, HARB) + ' H ' + kills(Hh, HARB) + ' I ' + kills(I, HARB) + ' S ' + kills(S, HARB))
var n7 = join(naga(L7), 1.5)
die(n7)
check('P7 counts are per boss: the Naga\'s kill is its own, the Harbinger\'s count stays', kills(G, 'twilightforest:naga') === 1 && kills(G, HARB) === 3)
die(join(__host.living('progressivebosses:wither', 300, L7), 1.5))
die(__host.living('minecraft:zombie', 20, L7))
check('P7 the Wither and a zombie count for nobody', kills(G, 'minecraft:wither') === 0 && kills(G, 'progressivebosses:wither') === 0 && kills(G, 'minecraft:zombie') === 0)

__host.print('P8  nobody near has a kill: fixed at base, for good')
var L8 = __host.level()
var J = L8.t_player('J', 0, 0, 0)
var h8 = join(harbinger(L8), 1.5)
hit(h8, J)
check('P8 fight 1: no modifier, flag 2, count 0, nobody told', flagIs(h8, 'icraft_pk_scaled', 2) && flagIs(h8, 'icraft_pk_kills', 0) &&
  !has(h8.mods(HP), 'icraft_pk') && near(h8.rawMax(), 2925) && J.t_told() === '')
var K = L8.t_player('K', 2, 0, 0)
setKills(K, HARB, 12)
hit(h8, K)
check('P8 a veteran (12 kills) who hits it later changes nothing', near(h8.rawMax(), 2925) && flagIs(h8, 'icraft_pk_kills', 0))

__host.print('P9  save and load')
var h9 = join(h.reload(), 1.5)
check('P9 the boss of P3 after a save and load: the same numbers, nothing applied again', near(h9.rawMax(), 4387.5) && near(h9.value(DMG), h.value(DMG)) && flagIs(h9, 'icraft_pk_kills', 4))
var L9 = __host.level()
var M = L9.t_player('M', 0, 0, 0)
setKills(M, HARB, 6)
var h9b = join(harbinger(L9), 1.5)
h9b.failPermanent(HP, true)
hit(h9b, M)
check('P9 a modifier that cannot be saved: flag 1, the count 6 stays on the boss', flagIs(h9b, 'icraft_pk_scaled', 1) && flagIs(h9b, 'icraft_pk_kills', 6))
h9b.failPermanent(HP, false)
setKills(M, HARB, 14)
var h9c = join(h9b.reload(), 1.5)
check('P9 when it loads it gets the SAME count back (fight 7: 2925 * 1.75 = 5118.75), not the player\'s 14 of now; flag 2',
  near(h9c.rawMax(), 5118.75) && flagIs(h9c, 'icraft_pk_scaled', 2) && flagIs(h9c, 'icraft_pk_kills', 6), 'max=' + h9c.rawMax() + ' ' + h9c.flags())

__host.print('P10 /icraft bosskills')
G.t_clearTold()
pkReport(G)
check('P10 a player with kills sees each boss, the count and the next fight',
  has(G.t_told(), 'entity.cataclysm.the_harbinger') && has(G.t_told(), ': 3 kills, next fight') && has(G.t_told(), '+30 % health, +20 % damage, +5 % speed') &&
  has(G.t_told(), 'entity.twilightforest.naga') && has(G.t_told(), ': 1 kill, next fight') && has(G.t_told(), '+15 % health'), G.t_told())
var N = L.t_player('N', 500, 0, 500)
pkReport(N)
check('P10 a player with none is told so', has(N.t_told(), 'No boss kills counted yet'))

__host.print('P11 the switch off')
var realBosses = global.icraft.bosses
var off = Object.create(realBosses)
off.enabled = function (name) { return String(name) === 'perKill' ? false : realBosses.enabled(name) }
global.icraft.bosses = off
icraft.bosses = off
var L11 = __host.level()
var O = L11.t_player('O', 0, 0, 0)
setKills(O, HARB, 5)
var h11 = join(harbinger(L11), 1.5)
hit(h11, O)
die(h11)
global.icraft.bosses = realBosses
icraft.bosses = realBosses
check('P11 with the switch off a boss is not fixed and its death counts for nobody', !has(h11.flags(), 'icraft_pk_scaled') && near(h11.rawMax(), 2925) && kills(O, HARB) === 5)

__host.print('P13 the Cardinal Sins first phases (decision entry 92): flagged like Lucifer\'s, each counts its own kills')
var L13 = __host.level()
var PHASES = ['cardinal_sins:sinofenvyphase_1', 'cardinal_sins:sinofpridephase_1', 'cardinal_sins:sinofwrathphase_1', 'cardinal_sins:luciferphase_1']
var phaseIds = PHASES.map(function (id) { return String(pkBossId(__host.living(id, 350, L13))) }).join(',')
check('P13 the three first phases and Lucifer\'s are scalable under their own ids', phaseIds === PHASES.join(','), phaseIds)
var Q = L13.t_player('Q', 10, 0, 0)
var WRATH1 = 'cardinal_sins:sinofwrathphase_1'
setKills(Q, WRATH1, 4)
var wr = join(__host.living(WRATH1, 350, L13).attr(DMG, 3).attr(SPD, 0.45), 1.5)
var wMax0 = wr.rawMax(), wDmg0 = wr.value(DMG), wSpd0 = wr.value(SPD)
hit(wr, Q)
check('P13 the Sin of Wrath\'s first phase, 4 kills of it: fight 5, health x1.5, damage x1.35, speed x1.08 of what the pack builds',
  flagIs(wr, 'icraft_pk_kills', 4) && near(wr.rawMax(), wMax0 * 1.5) && near(wr.value(DMG), wDmg0 * 1.35) && near(wr.value(SPD), wSpd0 * 1.08),
  'max ' + wMax0 + ' -> ' + wr.rawMax() + ' dmg ' + wDmg0 + ' -> ' + wr.value(DMG))
die(wr)
check('P13 its death counts for the first phase (4 -> 5), not for the Sin of Wrath', kills(Q, WRATH1) === 5 && kills(Q, 'cardinal_sins:sinofwrath') === 0,
  'phase ' + kills(Q, WRATH1) + ' sin ' + kills(Q, 'cardinal_sins:sinofwrath'))

__host.print('P12 liveness')
var fired = icraft.live.report('feature').features.fired.join(',')
check('P12 per-kill-scaled and per-kill-counted are FIRED', has(fired, 'per-kill-scaled') && has(fired, 'per-kill-counted'), fired)

__host.print('')
if (T_DISHONEST.length) __host.print('DISHONEST MOCKS (' + T_DISHONEST.length + '):\n   ' + T_DISHONEST.join('\n   '))
var T_guardFailed = (typeof icraft !== 'undefined' && icraft.guard && typeof icraft.guard.failures === 'function') ? icraft.guard.failures() : []
for (var T_gi = 0; T_gi < T_guardFailed.length; T_gi++) __host.print('GUARDED HANDLER FAILED: ' + T_guardFailed[T_gi].name + ' in ' + T_guardFailed[T_gi].event + ': ' + T_guardFailed[T_gi].first)
__host.print('RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + T_DISHONEST.length + ' dishonest mock members, ' + T_guardFailed.length + ' guarded handler failures')
