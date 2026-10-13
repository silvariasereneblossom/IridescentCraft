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
// boss_progressive.js: per-kill scaling never runs. In the OLD scripts isScalableBoss(entity.type) is
// `new Set([...]).has(<Java String>)`, which is false on this engine (see the S7 note in the suite); in the
// pack's scripts it asks the boss registry, where the system is switched off ("switches": perKill). To
// exercise the rest of that handler the lookup can be forced: the old list with the id as a JS string, the
// registry's `perKill` flag without its switch.
var __realScalable = null
function forceScalable(on) {
  if (on) {
    if (__realScalable === null) __realScalable = isScalableBoss
    isScalableBoss = (global.icraft && global.icraft.bosses)
      ? function (type) { return global.icraft.bosses.has(type, 'perKill') }
      : function (type) { return __realScalable(String(type)) }
  } else if (__realScalable !== null) {
    isScalableBoss = __realScalable
  }
}
// `n` server ticks pass on that level's server: what a script scheduled with server.scheduleInTicks runs
function ticks(level, n) {
  var due = level.getServer().advance(n)
  for (var i = 0; i < due.size(); i++) due.get(i)()
}
