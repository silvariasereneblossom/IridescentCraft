// Fixture for ID-SET.
var BOSSES = new Set(['minecraft:wither', 'minecraft:ender_dragon'])      // EXPECT ID-SET
var COOLDOWNS = new Map()                                                  // EXPECT ID-SET
var copy = new Set(BOSSES)                                                 // EXPECT ID-SET
function is(entity) { return BOSSES.has(entity.getType()) }
// Not flagged: the helper, a plain object as the table, an array
var BOSS_IDS = global.icraft.core.idSet(['minecraft:wither'])
var TABLE = { 'minecraft:wither': true }
var LIST = ['minecraft:wither']
var notASet = new Date()
