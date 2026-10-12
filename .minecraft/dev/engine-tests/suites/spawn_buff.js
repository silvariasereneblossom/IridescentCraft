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

__host.print('S7  per-kill scaling (5 kills: +50% hp, +35% dmg, +8% speed)')
var L5 = __host.level()
L5.setKills('cataclysm_the_harbinger', 5)
// As the file is: isScalableBoss(entity.type) is new Set([...]).has(<Java String>). A String that comes
// back from a Java method is a wrapped object on this engine (WrapFactory.javaPrimitiveWrap defaults to
// true and nothing in KubeJS turns it off), and Set.has() does not match it against a JS string.
var e5 = __host.living('cataclysm:the_harbinger', 350, L5)
__host.print('     typeof entity.type = ' + (typeof e5.type) + ', new Set([id]).has(entity.type) = ' + new Set(['cataclysm:the_harbinger']).has(e5.type) +
  ', isScalableBoss(entity.type) = ' + isScalableBoss(e5.type))
var p0 = join(harbinger(L5), 1.5)
var q0 = oldJoin(harbinger(L5), 1.5)
check('S7 as shipped, old AND new: a boss with 5 kills on record gets NO per-kill scaling (the lookup never matches)', near(p0.rawMax(), 2925) && sameNumbers(p0, q0) && !has(p0.flags(), 'icraft_prog_scaled') && !has(q0.flags(), 'icraft_prog_scaled'))
// The rest of the handler, with the lookup forced to work (String(type)) in both versions:
forceScalable(true); oldForceScalable(true)
var p = join(harbinger(L5), 1.5)
var q = oldJoin(harbinger(L5), 1.5)
line('new (lookup forced)', p)
check('S7 max (800 + 350*(0.5+0.5)) * 3 = 3450, dmg 10*1.35*3 = 40.5, speed 0.324', near(p.rawMax(), 3450) && near(p.value(DMG), 40.5) && near(p.value(SPD), 0.324))
check('S7 bit-identical to the old scripts', sameNumbers(p, q))
check('S7 saved, flag 2', !has(p.mods(HP), '*') && !has(p.mods(DMG), '*') && !has(p.mods(SPD), '*') && flagIs(p, 'icraft_prog_scaled', 2))
var q2 = join(q.reload(), 1.5)
check('S7 legacy boss gets the same back', sameNumbers(q2, p), 'max=' + q2.rawMax())
var p2 = join(p.reload(), 1.5)
check('S7 survives a reload', sameNumbers(p2, p))
forceScalable(false); oldForceScalable(false)

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

__host.print('')
if (T_DISHONEST.length) __host.print('DISHONEST MOCKS (' + T_DISHONEST.length + '):\n   ' + T_DISHONEST.join('\n   '))
// the handlers run behind icraft.guard: one that throws is reported by the guard, and has to fail this suite
var T_guardFailed = (typeof icraft !== 'undefined' && icraft.guard && typeof icraft.guard.failures === 'function') ? icraft.guard.failures() : []
for (var T_gi = 0; T_gi < T_guardFailed.length; T_gi++) __host.print('GUARDED HANDLER FAILED: ' + T_guardFailed[T_gi].name + ' in ' + T_guardFailed[T_gi].event + ': ' + T_guardFailed[T_gi].first)
__host.print('RESULT: ' + passed + ' passed, ' + failed + ' failed, ' + T_DISHONEST.length + ' dishonest mock members, ' + T_guardFailed.length + ' guarded handler failures')
