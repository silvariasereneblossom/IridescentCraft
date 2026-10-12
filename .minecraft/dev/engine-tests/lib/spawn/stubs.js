// Globals other scripts of the pack provide (codex_exploration_kills.js, endgame/ascension.js).
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
