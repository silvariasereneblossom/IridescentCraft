// Fixture for BLOCK-READ: a block read in a function that never asks whether the chunk is loaded.
var SAVED = [[100, 64, 100]]
global.tick_fixtureBlockRead = function (event) {
  var level = event.server.overworld()
  for (var i = 0; i < SAVED.length; i++) {
    var b = level.getBlock(SAVED[i][0], SAVED[i][1], SAVED[i][2])                // EXPECT BLOCK-READ
    var s = level.getBlockState(pos(SAVED[i]))                                   // EXPECT BLOCK-READ
    var be = event.server.overworld().getBlockEntity(pos(SAVED[i]))              // EXPECT BLOCK-READ
    var c = level.getChunkAt(pos(SAVED[i]))                                      // EXPECT BLOCK-READ
  }
}
// Not flagged: the function asks first, uses the helper, or reads the block the event hands it
global.tick_fixtureBlockReadGuarded = function (event) {
  var level = event.server.overworld()
  for (var i = 0; i < SAVED.length; i++) {
    if (!level.hasChunkAt(pos(SAVED[i]))) continue
    var b = level.getBlock(SAVED[i][0], SAVED[i][1], SAVED[i][2])
  }
  var viaHelper = global.icraft.core.blockIfLoaded(level, 1, 2, 3)
}
function nested(level, p) {
  if (!level.isLoaded(p)) return null
  return [p].map(function (q) { return level.getBlock(q) })
}
BlockEvents.broken(icraft.guard('fixture_block_read', 'BlockEvents.broken', function (event) {
  var own = event.block
  var below = event.block.down
}))
function pos(a) { return a }
