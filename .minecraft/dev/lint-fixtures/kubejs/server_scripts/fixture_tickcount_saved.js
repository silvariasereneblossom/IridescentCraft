// Fixture for TICKCOUNT-SAVED: a value read from .tickCount written to persistent data.
PlayerEvents.loggedIn(icraft.guard('fixture_tickcount_saved', 'PlayerEvents.loggedIn', function (event) {
  var player = event.player
  var server = event.server
  player.persistentData.putLong('icraft_last_seen', server.tickCount)            // EXPECT TICKCOUNT-SAVED
  var now = server.tickCount
  var until = now + 200
  player.persistentData.putInt('icraft_cooldown_until', until)                   // EXPECT TICKCOUNT-SAVED
  var pd = player.persistentData
  pd.putDouble('icraft_stamp', now)                                              // EXPECT TICKCOUNT-SAVED
  player.persistentData.icraft_stamp2 = server.tickCount                         // EXPECT TICKCOUNT-SAVED
  // Not flagged: the world game time; tickCount as a clock that is not saved; a put of something else
  player.persistentData.putLong('icraft_seen_at', global.icraft.core.now(player))
  var lastTick = {}
  lastTick[player.username] = server.tickCount
  if (server.tickCount % 20 === 0) {}
  player.persistentData.putInt('icraft_count', 3)
}))
