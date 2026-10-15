// One EntityJoinLevelEvent: the KubeJS spawned handlers (Architectury, priority HIGH) in script load
// order, then the iridescent_difficulty mod's handler (NORMAL priority) when `diff` is given.
function join(entity, diff) {
  var ev = { entity: entity, level: entity.getLevel() }
  T_honestEventObject('EntityEvents.spawned', ev)
  for (var i = 0; i < __spawned.length; i++) __spawned[i](ev)
  if (diff) entity.difficultyJoin(diff)
  return entity
}
function setAscension(n) { __ascLevel = n }
// boss_progressive.js (the OLD scripts of fixtures/): per-kill scaling never runs. isScalableBoss(entity.type) is
// `new Set([...]).has(<Java String>)`, which is false on this engine. To exercise the rest of that old handler the
// lookup can be forced (the old list with the id as a JS string). The pack's script is per player since 2026-10-15
// and acts at a boss's first exchange with a player, not at spawn: suite per-kill.
var __realScalable = null
function forceScalable(on) {
  if (on) {
    if (__realScalable === null) __realScalable = isScalableBoss
    isScalableBoss = function (type) { return __realScalable(String(type)) }
  } else if (__realScalable !== null) {
    isScalableBoss = __realScalable
  }
}
// `n` server ticks pass on that level's server: what a script scheduled with server.scheduleInTicks runs
function ticks(level, n) {
  var due = level.getServer().advance(n)
  for (var i = 0; i < due.size(); i++) due.get(i)()
}
