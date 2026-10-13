// Fixture for HELPER-COPY: a server script's own copy of a helper that lives in global.icraft.core.
var warned = {}
var warnOnce = function (key, msg) { if (warned[key]) return; warned[key] = true; console.warn(msg) }   // EXPECT HELPER-COPY
function entityId(entity) {                                                      // EXPECT HELPER-COPY
  try { return String(entity.getType().builtInRegistryHolder().key().location()) } catch (e) { console.error(e) }   // EXPECT HELPER-COPY
  var m = String(entity.getType()).match(/^entity\.([^.]+)\.(.+)$/)             // EXPECT HELPER-COPY
  return m ? m[1] + ':' + m[2] : ''
}
function getPlayerTier(player) { return player.stages.has('tier_2') ? 2 : 1 }    // EXPECT HELPER-COPY
var isBoss = (id) => id === 'minecraft:wither'                                   // EXPECT HELPER-COPY
var viaHolder = function (e) { return String(e.getEntityType().builtInRegistryHolder().key().location()) }   // EXPECT HELPER-COPY
// Not flagged: an alias of the helper, an item id through the same registry path, another regex
var core = global.icraft.core
var warn = core.warnOnce
var idOf = core.entityId
var playerTier = core.playerTier
function itemId(stack) { return String(stack.getItem().builtInRegistryHolder().key().location()) }
var other = /^item\.([^.]+)\.(.+)$/
