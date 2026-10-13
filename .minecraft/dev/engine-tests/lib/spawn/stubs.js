// Globals other scripts of the pack provide (codex_exploration_kills.js, endgame/ascension.js).
// The OLD scripts (fixtures/spawn-buff-old) take the x3 set from this global. The scripts of the pack take it
// from the boss registry (icraft.bosses.has(id, 'x3')) since 2026-10-13; see the wrapper below.
global.ICRAFT_NAMED_BOSS_IDS = [
  'cataclysm:the_harbinger', 'mowziesmobs:ferrous_wroughtnaut', 'irons_spellbooks:dead_king',
  'irons_spellbooks:archevoker', 'test:no_damage_boss'
]
var __ascLevel = 0
global.ICRAFT_ASCENSION = {
  getLevel: function (level) { return __ascLevel },
  HP_MULT: [1.0, 1.5, 2.0],
  DMG_MULT: [1.0, 1.25, 1.5]
}
// One boss of the list above is not in the pack: test:no_damage_boss, an x3 boss with no attack_damage
// attribute (S9). In the scope that has the registry it is added as a named boss with the flag x3 (so not
// `boss`: it gets the mob-tier health too, as under the old stub list), through a wrapper around the real
// reader: everything else the scripts ask is the pack's own registry file.
if (global.icraft && global.icraft.bosses) {
  ;(function () {
    var real = global.icraft.bosses
    var TEST_BOSS = 'test:no_damage_boss'
    var wrapped = Object.create(real)
    wrapped.ids = function (system) {
      var out = real.ids(system)
      if (system === 'x3' || system === 'tokensNamed') out.push(TEST_BOSS)
      return out
    }
    wrapped.has = function (id, system) { return (String(id) === TEST_BOSS && system === 'x3') ? true : real.has(id, system) }
    wrapped.kind = function (id) { return String(id) === TEST_BOSS ? 'named' : real.kind(id) }
    global.icraft.bosses = wrapped
  })()
}
