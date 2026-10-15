// Scenarios for the saved spawn buffs. `join` runs the NEW scripts, `oldJoin` the scripts as committed
// at HEAD (loaded in a previous scope). A '*' after a modifier name = NOT saved with the entity.
var oldJoin = __host.stash.get('oldJoin')
var oldSetAscension = __host.stash.get('oldSetAscension')
var HP = 'minecraft:generic.max_health'
var DMG = 'minecraft:generic.attack_damage'
var SPD = 'minecraft:generic.movement_speed'
var passed = 0
var failed = 0
function r(x) { return Math.round(Number(x) * 1000) / 1000 }
function line(label, e) {
  var text = label + ': max=' + r(e.rawMax()) + ' health=' + r(e.rawHealth()) + ' dmg=' + r(e.value(DMG)) + ' spd=' + r(e.value(SPD)) +
    ' | hp[' + e.mods(HP) + '] dmg[' + e.mods(DMG) + '] spd[' + e.mods(SPD) + '] | ' + e.flags()
  __host.print('     ' + text)
  __host.snap('     ' + text)
}
function check(name, cond, detail) {
  __host.snap((cond ? '  ok   ' : '  FAIL ') + name)
  if (cond) { passed++; __host.print('  ok   ' + name) }
  else { failed++; __host.fail(); __host.print('  FAIL ' + name + (detail ? ' -- ' + detail : '')) }
}
function near(a, b) { return Math.abs(Number(a) - Number(b)) < 0.01 }
function has(text, piece) { return String(text).indexOf(piece) >= 0 }
function flagIs(e, flag, n) { return new RegExp('(^| )' + flag + '=' + n + '( |$)').test(String(e.flags())) }
function harbinger(level) { return __host.living('cataclysm:the_harbinger', 350, level).attr(DMG, 10).attr(SPD, 0.3) }
function zombie(level) { return __host.living('minecraft:zombie', 20, level).attr(DMG, 3) }
function same(x, y) { x = Number(x); y = Number(y); return x === y || (x !== x && y !== y) }   // NaN = no such attribute
function sameNumbers(a, b) {
  return same(a.rawMax(), b.rawMax()) && same(a.rawHealth(), b.rawHealth()) && same(a.value(DMG), b.value(DMG)) && same(a.value(SPD), b.value(SPD))
}
var oldForceScalable = __host.stash.get('oldForceScalable')
var L = __host.level()
__host.print('new scope: ' + __spawned.length + ' spawned handlers')

__host.print('S1  fresh boss (Harbinger stand-in: base 350, designed 800, x3, difficulty x1.5)')
var a = join(harbinger(L), 1.5)
var b = oldJoin(harbinger(L), 1.5)
line('new', a); line('old', b)
check('S1 max is (800 + 350*0.5) * 3 = 2925', near(a.rawMax(), 2925), 'max=' + a.rawMax())
check('S1 max / health / damage / speed are bit-identical to the old scripts', sameNumbers(a, b))
check('S1 spawns at full health', a.rawHealth() === a.rawMax())
check('S1 every script modifier is saved', !has(a.mods(HP), '*') && !has(a.mods(DMG), '*'))
check('S1 old scripts: none of them is saved', has(b.mods(HP), 'icraft_boss_hp_override*') && has(b.mods(HP), 'icraft_boss_3x_hp*') && has(b.mods(DMG), 'icraft_boss_3x_dmg*'))
check('S1 flags are 2', flagIs(a, 'icraft_boss_hp', 2) && flagIs(a, 'icraft_boss_3x', 2))

__host.print('S2  the same boss saved and loaded again')
var a2 = join(a.reload(), 1.5)
line('new, reloaded', a2)
check('S2 max and health unchanged', sameNumbers(a2, a))
a2.damageTo(1000)
var a3 = join(a2.reload(), 1.5)
check('S2 a boss at 1000 health is still at exactly 1000 after a reload (no heal)', a3.rawHealth() === 1000 && a3.rawMax() === a.rawMax(), 'health=' + a3.rawHealth())

__host.print('S5  the bug, on the old scripts')
var b2 = b.reload()
line('old, reloaded, before join', b2)
check('S5 the stand-ins reproduce it: max falls to 350*1.5 = 525, Health clamped, flags stay', near(b2.rawMax(), 525) && near(b2.rawHealth(), 525) && has(b2.flags(), 'icraft_boss_hp=1b') && has(b2.flags(), 'icraft_boss_3x=1b'))
var b2old = oldJoin(b.reload(), 1.5)
check('S5 the old scripts never put it back', near(b2old.rawMax(), 525))

__host.print('S3  a boss left by the old scripts (flag 1, modifiers gone) loads under the new scripts')
join(b2, 1.5)
line('repaired', b2)
check('S3 max is back at the fresh value', b2.rawMax() === a.rawMax(), 'max=' + b2.rawMax())
check('S3 damage and speed are back at the fresh values', b2.value(DMG) === a.value(DMG) && b2.value(SPD) === a.value(SPD))
check('S3 an untouched boss ends at full health', b2.rawHealth() === b2.rawMax(), 'health=' + b2.rawHealth())
check('S3 modifiers saved, flags 2', !has(b2.mods(HP), '*') && !has(b2.mods(DMG), '*') && flagIs(b2, 'icraft_boss_hp', 2) && flagIs(b2, 'icraft_boss_3x', 2))
var b3 = join(b2.reload(), 1.5)
check('S3 and it stays that way over the next reload', sameNumbers(b3, a))

__host.print('S4  a legacy boss that is at half health when it loads')
var c = oldJoin(harbinger(L), 1.5).reload()
c.damageTo(262.5)
c = c.reload()
join(c, 1.5)
line('repaired', c)
check('S4 keeps its share: 1462.5 of 2925, not a full heal', near(c.rawHealth(), 1462.5) && near(c.rawMax(), 2925), 'health=' + c.rawHealth())
var c0 = oldJoin(zombie(L), 1.5).reload()
c0.damageTo(0)
c0 = c0.reload()
join(c0, 1.5)
check('S4 a dying mob (Health 0) is not revived', c0.rawHealth() === 0)

__host.print('S6  no stacking')
var d = join(harbinger(L), 1.5)
join(d, 1.5); join(d, 1.5)
check('S6 three joins of one boss = one buff', sameNumbers(d, a))
var d2 = oldJoin(harbinger(L), 1.5)
join(d2, 1.5)
line('old transient modifiers still live, then new join', d2)
check('S6 new scripts over live transient modifiers replace them', d2.rawMax() === a.rawMax() && !has(d2.mods(HP), '*') && !has(d2.mods(DMG), '*'), 'max=' + d2.rawMax())

__host.print('S7  per-kill scaling acts at the first exchange of a boss with a player, never at its spawn')
// Since 2026-10-15 (ruling 23) per-kill scaling is per player and is fixed the first time the boss trades a hit with
// a player (suite per-kill). Until then it was a world-wide counter applied at spawn, and it never ran: the OLD
// scripts asked new Set([...]).has(<Java String>), false on this engine. So a boss joins exactly as under the old
// scripts, also with kills on the old world-wide counter (which nothing reads any more).
var L5 = __host.level()
L5.setKills('cataclysm_the_harbinger', 5)
var p0 = join(harbinger(L5), 1.5)
var q0 = oldJoin(harbinger(L5), 1.5)
check('S7 a boss joins bit-identical to the old scripts, with 5 kills on the old counter: no per-kill scaling at spawn', near(p0.rawMax(), 2925) && sameNumbers(p0, q0) &&
  !has(p0.flags(), 'icraft_prog_scaled') && !has(p0.flags(), 'icraft_pk_scaled') && !has(q0.flags(), 'icraft_prog_scaled'))
var p1 = join(p0.reload(), 1.5)
check('S7 and after a reload', sameNumbers(p1, p0) && !has(p1.flags(), 'icraft_pk_scaled'))

__host.print('S8  ordinary mobs (tier HP)')
var z = join(zombie(L), 1.5)
var zo = oldJoin(zombie(L), 1.5)
line('zombie new', z)
check('S8 zombie max 20 * (1 + 2 + 0.5) = 70', near(z.rawMax(), 70))
check('S8 bit-identical to the old scripts', sameNumbers(z, zo))
check('S8 saved, flag 2', !has(z.mods(HP), '*') && flagIs(z, 'icraft_scaled', 2))
var zw = zombie(L); zw.damageTo(5); join(zw)
var zwo = zombie(L); zwo.damageTo(5); oldJoin(zwo)
check('S8 a fresh spawn that joins wounded is healed to full, as before', zw.rawHealth() === 60 && sameNumbers(zw, zwo), 'health=' + zw.rawHealth())
var zl = zo.reload()
zl.damageTo(15)
zl = join(zl.reload(), 1.5)
line('legacy zombie at 15/30, repaired', zl)
check('S8 legacy zombie: max back to 70, health keeps its half (35)', near(zl.rawMax(), 70) && near(zl.rawHealth(), 35))
var cow = __host.living('minecraft:cow', 10, L); cow.monster = false; cow.damageTo(5); join(cow)
var cowo = __host.living('minecraft:cow', 10, L); cowo.monster = false; cowo.damageTo(5); oldJoin(cowo)
check('S8 passive mob: no modifier, health untouched, flag 2', cow.rawMax() === 10 && cow.rawHealth() === 5 && String(cow.mods(HP)) === '' && flagIs(cow, 'icraft_scaled', 2) && sameNumbers(cow, cowo))
var cowl = join(cowo.reload())
check('S8 legacy passive mob: left alone, flag 1 -> 2', cowl.rawMax() === 10 && cowl.rawHealth() === 5 && flagIs(cowl, 'icraft_scaled', 2))

__host.print('S9  a boss without an attack_damage attribute')
var nd = join(__host.living('test:no_damage_boss', 100, L))
var ndo = oldJoin(__host.living('test:no_damage_boss', 100, L))
line('new', nd)
check('S9 same numbers as the old scripts (100 * 3 tier * 3 boss = 900), flag 2, nothing thrown', near(nd.rawMax(), 900) && sameNumbers(nd, ndo) && flagIs(nd, 'icraft_boss_3x', 2) && String(nd.mods(DMG)) === '(no attribute)')

__host.print('S10 a modifier that cannot be saved (addPermanentModifier throws)')
var f = harbinger(L)
f.failPermanent(HP, true)
join(f, 1.5)
line('failed save', f)
check('S10 the flag says 1, not 2', flagIs(f, 'icraft_boss_hp', 1) && flagIs(f, 'icraft_boss_3x', 1))
check('S10 the boss is still buffed while it stays loaded (modifiers on, unsaved)', near(f.rawMax(), 2925) && has(f.mods(HP), 'icraft_boss_hp_override*') && has(f.mods(HP), 'icraft_boss_3x_hp*'), 'max=' + f.rawMax())
var f2 = join(f.reload(), 1.5)
line('next load', f2)
check('S10 the next load repairs it', sameNumbers(f2, a) && flagIs(f2, 'icraft_boss_hp', 2) && flagIs(f2, 'icraft_boss_3x', 2), 'max=' + f2.rawMax())

__host.print('S10b the attribute lookup itself is broken (getAttribute returns nothing, even for max_health)')
var hb = harbinger(L)
hb.hideInstances = true
join(hb, 1.5)
line('broken lookup', hb)
check('S10b not recorded as saved: flags 1, and the boss is still buffed while loaded', flagIs(hb, 'icraft_boss_hp', 1) && flagIs(hb, 'icraft_boss_3x', 1) && near(hb.rawMax(), 2925), 'flags=' + hb.flags() + ' max=' + hb.rawMax())
var hb2 = join(hb.reload(), 1.5)
check('S10b repaired on the next load once the lookup works', sameNumbers(hb2, a) && flagIs(hb2, 'icraft_boss_hp', 2) && flagIs(hb2, 'icraft_boss_3x', 2), 'max=' + hb2.rawMax())

__host.print('S11 ascension level 1 (hp x1.5, dmg x1.25) and the excluded ISS casters')
setAscension(1); oldSetAscension(1)
var az = join(zombie(L))
var azo = oldJoin(zombie(L))
line('zombie, ascension 1', az)
check('S11 zombie 20*3*1.5 = 90, dmg 3.75, bit-identical to the old scripts', near(az.rawMax(), 90) && near(az.value(DMG), 3.75) && sameNumbers(az, azo))
check('S11 saved, flag 2', !has(az.mods(HP), '*') && !has(az.mods(DMG), '*') && flagIs(az, 'icraft_asc_scaled', 2))
var az2 = join(azo.reload())
check('S11 legacy ascension mob repaired', sameNumbers(az2, az), 'max=' + az2.rawMax())
var priest = __host.living('irons_spellbooks:priest', 30, L)
priest.untouchable = true     // any attribute / health call on it throws AbstractMethodError
join(priest)
check('S11 an excluded caster is never touched (only the iss-guard flag)', String(priest.flags()) === 'icraft_iss_skip=1b', 'flags=' + priest.flags())
setAscension(0); oldSetAscension(0)

__host.print('S12 core.attrValueWithout against vanilla\'s own calculation')
var core = global.icraft.core
var g = harbinger(L)
g.foreignModifier(HP, 'apoth_flat', 50, 'ADDITION', true)
g.foreignModifier(HP, 'other_base', 0.25, 'MULTIPLY_BASE', true)
g.foreignModifier(HP, 'other_total', 0.1, 'MULTIPLY_TOTAL', false)
check('S12 nothing to leave out -> the caller\'s value comes back untouched', core.attrValueWithout(g, HP, 'icraft_', 123.5) === 123.5)
g.foreignModifier(HP, 'icraft_x_base', 0.5, 'MULTIPLY_BASE', true)
g.foreignModifier(HP, 'icraft_x_total', 2.0, 'MULTIPLY_TOTAL', true)
var got = core.attrValueWithout(g, HP, 'icraft_', g.getMaxHealth())
check('S12 (350 + 50) * 1.25 * 1.1 = 550', near(got, 550) && near(got, g.valueWithout(HP, 'icraft_')), 'got=' + got + ' truth=' + g.valueWithout(HP, 'icraft_'))

__host.print('S13 a boss that carries saved x3 + difficulty modifiers but was never seen by boss_hp.js')
var t = harbinger(L)
core.saveModifier(t, HP, 'icraft_boss_3x_hp', 2.0, 'multiply_total')
core.saveModifier(t, DMG, 'icraft_boss_3x_dmg', 2.0, 'multiply_total')
t.getPersistentData().putInt('icraft_boss_3x', 2)
t.difficultyJoin(1.5)
join(t, 1.5)
line('result', t)
check('S13 the designed HP is not cancelled by the modifiers already on it', t.rawMax() === a.rawMax(), 'max=' + t.rawMax())

__host.print('S14 API')
check('S14 spawnBuff is null once the flag is 2', core.spawnBuff(a, 'icraft_boss_3x') === null)
check('S14 saveModifier: 1 saved, 0 no such attribute', core.saveModifier(zombie(L), HP, 'icraft_t', 0.5, 'multiply_base') === 1 && core.saveModifier(__host.living('test:x', 5, L), DMG, 'icraft_t', 0.5, 'multiply_base') === 0)

__host.print('S15 an entity that became a boss in the registry after it was saved with the mob-tier modifier')
// The exclusion from the mob-tier health is the registry's flag `boss` (system tierHpExcluded), and the same
// test takes a SAVED icraft_mob_tier_hp off again (the mob was no boss when it spawned: 22 named bosses on
// 2026-10-12, the minibosses, the Wilden boss and the Magehunter by the ruling of that day). Asked of the
// registry, so an id that gets the flag later is covered without a line here.
function savedWithTier(id, base) {
  var m = __host.living(id, base, L)
  core.saveModifier(m, HP, 'icraft_mob_tier_hp', 2.0, 'multiply_base')
  m.getPersistentData().putInt('icraft_scaled', 2)
  return m
}
var excluded = global.icraft.bosses.ids('tierHpExcluded')
var kept = []
var asked = 0
for (var xi = 0; xi < excluded.length; xi++) {
  var xid = String(excluded[xi])
  if (xid.indexOf('irons_spellbooks:') === 0) continue    // that namespace leaves the handler before any test (below)
  asked++
  var xm = join(savedWithTier(xid, 100).reload())
  if (has(xm.mods(HP), 'icraft_mob_tier_hp')) kept.push(xid)
}
__host.print('     ' + asked + ' of the ' + excluded.length + ' ids with the flag `boss` asked (the rest: irons_spellbooks:)')
check('S15 every boss of the registry outside irons_spellbooks: loses a saved mob-tier modifier when it loads', asked > 0 && kept.length === 0, 'kept by: ' + kept.join(', '))
var mini = savedWithTier('mowziesmobs:naga', 100)
mini.damageTo(150)
mini = join(mini.reload())
line('miniboss saved at 150/300, loaded', mini)
check('S15 a miniboss (mowziesmobs:naga) saved at 150 of 300 is at 50 of 100: the modifier is gone, its share of health kept', near(mini.rawMax(), 100) && near(mini.rawHealth(), 50) && String(mini.mods(HP)) === '', 'max=' + mini.rawMax() + ' health=' + mini.rawHealth())
var wild = savedWithTier('ars_nouveau:wilden_boss', 100).attr(DMG, 10)
core.saveModifier(wild, HP, 'icraft_boss_3x_hp', 2.0, 'multiply_total')
core.saveModifier(wild, DMG, 'icraft_boss_3x_dmg', 2.0, 'multiply_total')
wild.getPersistentData().putInt('icraft_boss_3x', 2)
wild.damageTo(450)
wild = join(wild.reload())
line('Wilden boss saved at 450/900, loaded', wild)
check('S15 the Wilden boss (mob tier x3 and boss x3 saved: 450 of 900) is at 150 of 300: the boss x3 stays', near(wild.rawMax(), 300) && near(wild.rawHealth(), 150) && has(wild.mods(HP), 'icraft_boss_3x_hp') && !has(wild.mods(HP), 'icraft_mob_tier_hp'), 'max=' + wild.rawMax() + ' health=' + wild.rawHealth())
var freshMini = join(__host.living('mowziesmobs:naga', 100, L))
check('S15 a fresh miniboss gets no mob-tier modifier', freshMini.rawMax() === 100 && String(freshMini.mods(HP)) === '', 'max=' + freshMini.rawMax())
var zk = savedWithTier('minecraft:zombie', 100)
zk.damageTo(150)
zk = join(zk.reload())
check('S15 an ordinary mob saved the same way keeps it (150 of 300)', near(zk.rawMax(), 300) && near(zk.rawHealth(), 150) && has(zk.mods(HP), 'icraft_mob_tier_hp'), 'max=' + zk.rawMax())
// No check for irons_spellbooks:magehunter_vindicator, which has the flag too: the game creates that entity with
// the TYPE minecraft:vindicator (measured on a full-pack boot, 2026-10-12), so no script ever sees its registry id
// and a stand-in built from that id here would test something that cannot happen. The four casters of that
// namespace leave the handler on their `caster` flag before any health test (S11).

__host.print('S16 a boss the game hands out under a second entity id (the Wither is progressivebosses:wither)')
// The boss registry: "progressivebosses:wither": { "sameAs": "minecraft:wither" }. Progressive Bosses replaces every
// vanilla Wither with its own entity (class PBWither, base health 500): measured on a full-pack boot, 2026-10-13.
// Until then that entity was an ordinary monster for every script: mob tier x3, no designed health, no boss x3.
// The numbers are the registry's own for the Wither (hp, flag x3), so the check follows the file.
var witherHp = global.icraft.bosses.hp('minecraft:wither')
var witherX3 = global.icraft.bosses.has('minecraft:wither', 'x3') ? 3 : 1
var pbw = join(__host.living('progressivebosses:wither', 500, L), 1.5)
line('second id, fresh', pbw)
check('S16 the registry answers for the second id as for the Wither', global.icraft.bosses.canon('progressivebosses:wither') === 'minecraft:wither' &&
  global.icraft.bosses.hp('progressivebosses:wither') === witherHp && global.icraft.core.isBoss('progressivebosses:wither') === true)
check('S16 it gets the designed health and the boss buff of the Wither: (' + witherHp + ' + 500*0.5) * ' + witherX3 + ' = ' + ((witherHp + 250) * witherX3) + ', at full health',
  near(pbw.rawMax(), (witherHp + 250) * witherX3) && pbw.rawHealth() === pbw.rawMax(), 'max=' + pbw.rawMax() + ' health=' + pbw.rawHealth())
check('S16 and no mob-tier modifier; the buffs are saved (flags 2)', !has(pbw.mods(HP), 'icraft_mob_tier_hp') && has(pbw.mods(HP), 'icraft_boss_hp_override') &&
  !has(pbw.mods(HP), '*') && flagIs(pbw, 'icraft_boss_hp', 2) && (witherX3 === 1 || flagIs(pbw, 'icraft_boss_3x', 2)), 'hp[' + pbw.mods(HP) + '] ' + pbw.flags())
var pbw2 = join(pbw.reload(), 1.5)
check('S16 unchanged over a reload', sameNumbers(pbw2, pbw), 'max=' + pbw2.rawMax())
// one that was alive before the fix: saved as an ordinary monster (mob tier x3, flag 2), at half health
var pbOld = savedWithTier('progressivebosses:wither', 500)
pbOld.damageTo(750)
pbOld = join(pbOld.reload())
line('second id, saved before the fix at 750/1500, loaded', pbOld)
// It is healed to full, once: for the two boss scripts this is its first spawn (no flag of theirs is on it), and a
// first spawn starts at full health. The same happened to the 22 named bosses that joined the roster on 2026-10-12.
check('S16 one saved before the fix with the mob tier (750 of 1500) loses it and gets the boss buffs: ' + (witherHp * witherX3) + ', healed to full once',
  !has(pbOld.mods(HP), 'icraft_mob_tier_hp') && near(pbOld.rawMax(), witherHp * witherX3) && near(pbOld.rawHealth(), witherHp * witherX3) &&
  flagIs(pbOld, 'icraft_boss_hp', 2), 'max=' + pbOld.rawMax() + ' health=' + pbOld.rawHealth())
pbOld.damageTo(900)
var pbOld2 = join(pbOld.reload())
check('S16 and from then on a reload leaves its health alone (900 of ' + (witherHp * witherX3) + ')', near(pbOld2.rawHealth(), 900) && near(pbOld2.rawMax(), witherHp * witherX3), 'health=' + pbOld2.rawHealth())
var vw = join(__host.living('minecraft:wither', 300, L), 1.5)
check('S16 minecraft:wither itself is answered as before (designed health, x3)', near(vw.rawMax(), (witherHp + 150) * witherX3) && !has(vw.mods(HP), 'icraft_mob_tier_hp'), 'max=' + vw.rawMax())

__host.print('S16b a Progressive Bosses level with a designed health of its own (the Ultimate Wither is level 3)')
// The registry: "minecraft:wither": { "hp": 600, "levelHp": { "3": 1000 } } (ruled 2026-10-14: designed 1,000 x3 for
// level 3, the plain Wither stays 600 x3). The level is the mod's own (PBWither.getLvl), set before the join; a level
// the entry does not list takes hp. The numbers follow the file.
var ultHp = global.icraft.bosses.hp('progressivebosses:wither', 3)
var ult = join(__host.pbWither('progressivebosses:wither', 500, L, 3))
line('level 3, fresh', ult)
check('S16b level 3: the designed health of its level, ' + ultHp + ' x ' + witherX3 + ' = ' + (ultHp * witherX3) + ', at full health',
  near(ult.rawMax(), ultHp * witherX3) && ult.rawHealth() === ult.rawMax() && has(ult.mods(HP), 'icraft_boss_hp_override') && flagIs(ult, 'icraft_boss_hp', 2),
  'max=' + ult.rawMax() + ' health=' + ult.rawHealth() + ' hp[' + ult.mods(HP) + ']')
var ult2 = join(ult.reload())
check('S16b unchanged over a reload (the level comes back with the entity)', sameNumbers(ult2, ult), 'max=' + ult2.rawMax())
var lvl0 = join(__host.pbWither('progressivebosses:wither', 500, L, 0))
var lvl2 = join(__host.pbWither('progressivebosses:wither', 500, L, 2))
check('S16b level 0 (the plain Wither) and a level the entry does not list (2): hp, ' + witherHp + ' x ' + witherX3 + ' = ' + (witherHp * witherX3),
  near(lvl0.rawMax(), witherHp * witherX3) && near(lvl2.rawMax(), witherHp * witherX3), 'level 0 max=' + lvl0.rawMax() + ', level 2 max=' + lvl2.rawMax())
check('S16b the registry has a level-3 value at all (else this block proves nothing)', ultHp !== witherHp && ultHp > 0, 'hp(.., 3)=' + ultHp + ' hp=' + witherHp)

__host.print('S17 a mod sets the base health AFTER the pack\'s handler (the Ender Dragon: Progressive Bosses, 200 -> 500)')
// Measured on a full-pack boot, 2026-10-13: scaling/boss_hp.js sees the vanilla base 200 and saves +4.0 for the
// designed 1000; Progressive Bosses' own join handler then sets the base to 500 and the health to 500: 500 of 7500.
// The numbers below are the registry's (hp, flag x3), so the check follows the file.
var dragonHp = global.icraft.bosses.hp('minecraft:ender_dragon')
var dragonX3 = global.icraft.bosses.has('minecraft:ender_dragon', 'x3') ? 3 : 1
var LD = __host.level()
var dragon = join(__host.living('minecraft:ender_dragon', 200, LD))
check('S17 as the pack\'s handlers leave it: ' + (dragonHp * dragonX3) + ' of ' + (dragonHp * dragonX3) + ' on the vanilla base', near(dragon.rawMax(), dragonHp * dragonX3) && near(dragon.rawHealth(), dragonHp * dragonX3), 'max=' + dragon.rawMax())
dragon.modSetsBase(500)
line('after the mod set its base, before the re-check', dragon)
check('S17 then the mod sets base 500 and health 500: 500 of ' + (500 * (dragonHp / 200) * dragonX3) + ', the state measured in game', near(dragon.rawMax(), 500 * (dragonHp / 200) * dragonX3) && near(dragon.rawHealth(), 500))
ticks(LD, 1)
line('one tick later', dragon)
check('S17 one tick later the designed value holds again: ' + (dragonHp * dragonX3) + ' of ' + (dragonHp * dragonX3) + ', at full health (a first spawn)', near(dragon.rawMax(), dragonHp * dragonX3) && near(dragon.rawHealth(), dragonHp * dragonX3), 'max=' + dragon.rawMax() + ' health=' + dragon.rawHealth())
check('S17 the multiplier is saved, and the base it is for is remembered', !has(dragon.mods(HP), '*') && near(dragon.getPersistentData().getDouble('icraft_boss_hp_base'), 500))
dragon.damageTo(1200)
ticks(LD, 20)
check('S17 the 20-tick pass changes nothing more, and does not heal (1200 stays 1200)', near(dragon.rawMax(), dragonHp * dragonX3) && near(dragon.rawHealth(), 1200), 'health=' + dragon.rawHealth())
var dragon2 = join(dragon.reload())
ticks(LD, 1); ticks(LD, 20)
check('S17 saved and loaded: unchanged, health 1200', near(dragon2.rawMax(), dragonHp * dragonX3) && near(dragon2.rawHealth(), 1200), 'max=' + dragon2.rawMax() + ' health=' + dragon2.rawHealth())
// a dragon that was alive before this date: base 500, the +4.0 worked out on 200, the boss x3, no remembered base
var oldDragon = __host.living('minecraft:ender_dragon', 500, LD)
core.saveModifier(oldDragon, HP, 'icraft_boss_hp_override', dragonHp / 200 - 1, 'multiply_base')
core.saveModifier(oldDragon, HP, 'icraft_boss_3x_hp', 2.0, 'multiply_total')
oldDragon.getPersistentData().putInt('icraft_boss_hp', 2)
oldDragon.getPersistentData().putInt('icraft_boss_3x', 2)
oldDragon.damageTo(3750)
oldDragon = join(oldDragon.reload())
line('a dragon saved before the fix at 3750/7500, loaded', oldDragon)
check('S17 a dragon saved before the fix at half of 7500 loads at half of ' + (dragonHp * dragonX3) + ': corrected at once, its share kept', near(oldDragon.rawMax(), dragonHp * dragonX3) && near(oldDragon.rawHealth(), dragonHp * dragonX3 / 2), 'max=' + oldDragon.rawMax() + ' health=' + oldDragon.rawHealth())
// only a moved BASE does this: a modifier another mod adds later multiplies on top, as before
var LH = __host.level()
var champ = join(__host.living('cataclysm:the_harbinger', 350, LH).attr(DMG, 10).attr(SPD, 0.3), 1.5)
var champMax = champ.rawMax()
champ.foreignModifier(HP, 'another_mod_bonus', 0.5, 'MULTIPLY_TOTAL', true)
ticks(LH, 1); ticks(LH, 20)
check('S17 a health modifier another mod adds after the join is NOT absorbed: ' + champMax + ' x 1.5 stays', near(champ.rawMax(), champMax * 1.5), 'max=' + champ.rawMax())
var champ2 = join(champ.reload(), 1.5)
ticks(LH, 1)
check('S17 nor when that boss loads again', near(champ2.rawMax(), champMax * 1.5), 'max=' + champ2.rawMax())
// a boss saved before this date that carries another mod's health modifier: cannot be judged, left alone
var legacy = __host.living('cataclysm:the_harbinger', 350, LH).attr(DMG, 10).attr(SPD, 0.3)
legacy.foreignModifier(HP, 'another_mod_bonus', 0.5, 'MULTIPLY_TOTAL', true)
core.saveModifier(legacy, HP, 'icraft_boss_hp_override', 0.7, 'multiply_base')
legacy.getPersistentData().putInt('icraft_boss_hp', 2)
var legacyMax = legacy.rawMax()
legacy = join(legacy.reload())
check('S17 a boss saved before this date with another mod\'s modifier on its health is left as it is, and its base remembered', near(legacy.rawMax() / legacyMax, global.icraft.bosses.has('cataclysm:the_harbinger', 'x3') ? 3 : 1) &&
  near(legacy.getPersistentData().getDouble('icraft_boss_hp_base'), 350), 'max=' + legacy.rawMax() + ' was ' + legacyMax)
check('S17 every other scenario of this suite ran with the re-check scheduled and none was changed by it', failed === 0)

__host.print('')
if (T_DISHONEST.length) __host.print('DISHONEST MOCKS (' + T_DISHONEST.length + '):\n   ' + T_DISHONEST.join('\n   '))
// the handlers run behind icraft.guard: one that throws is reported by the guard, and has to fail this suite
var T_guardFailed = (typeof icraft !== 'undefined' && icraft.guard && typeof icraft.guard.failures === 'function') ? icraft.guard.failures() : []
for (var T_gi = 0; T_gi < T_guardFailed.length; T_gi++) __host.print('GUARDED HANDLER FAILED: ' + T_guardFailed[T_gi].name + ' in ' + T_guardFailed[T_gi].event + ': ' + T_guardFailed[T_gi].first)
__host.print('RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + T_DISHONEST.length + ' dishonest mock members, ' + T_guardFailed.length + ' guarded handler failures')
