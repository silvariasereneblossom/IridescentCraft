// onboarding_bridge.js: the "Level Up" dummy fires at any aptitude >= T_WANT (2 new, 5 on main).
// Heracles is mocked at the pack's own API (global.icraft.heracles, exported by quests/heracles_reconcile.js).
var H_done = {}        // 'player|quest' -> true
var H_deps = {}        // 'player|quest' -> true when every dependency is complete
var H_fired = []
var hk = function (p, q) { return String(p.username) + '|' + q }
global.icraft = global.icraft || {}
global.icraft.heracles = {
  available: function () { return true },
  isComplete: function (p, q) { return H_done[hk(p, q)] === true },
  depsComplete: function (p, q) { return H_deps[hk(p, q)] === true },
  fireDummy: function (p, dummy) {
    H_fired.push(String(p.username) + ':' + dummy)
    if (dummy === 'jlf_level_5_reached') H_done[hk(p, 'onboarding_first_level')] = true
    if (dummy === 'onboarding_survivor_capstone_check') H_done[hk(p, 'onboarding_survivor_capstone')] = true
  }
}
T_CLASS_MAP['com.seniors.justlevelingfork.common.capability.AptitudeCapability'] = 'mk.A$AptitudeCapability'
T_loadAll([T_BRIDGE])

var pass = function () { T_tick(100) }       // one full poll interval: every player's age hits offset 37 once
var fired = function (name) { return H_fired.filter(function (x) { return x === name + ':jlf_level_5_reached' }).length }

T_run('bridge: loads and says its bar', function () {
  ok(T_LOAD_ERRORS.length === 0, 'loads')
  ok(T_LOG.info.join('\n').indexOf(T_WANT_LOG) >= 0, 'load line states the bar: ' + T_LOG.info.filter(function (l) { return l.indexOf('onboarding_bridge') >= 0 }).join(' / '))
})

T_run('bridge: threshold', function () {
  var p = T_newPlayer('Nova'); A.cap(p)
  H_deps[hk(p, 'onboarding_first_level')] = true
  pass()
  ok(fired('Nova') === 0, 'all aptitudes at 1: not fired')
  for (var lvl = 2; lvl < T_WANT; lvl++) {
    A.apt(p, 'strength', lvl); pass()
    ok(fired('Nova') === 0, 'highest aptitude ' + lvl + ' (< ' + T_WANT + '): not fired')
  }
  A.apt(p, 'luck', T_WANT); pass()
  ok(fired('Nova') === 1, 'one aptitude at ' + T_WANT + ': fired (' + H_fired.join(', ') + ')')
  ok(T_LOG.info.join('\n').indexOf('Nova completed onboarding_first_level') >= 0, 'completion logged')
  pass(); pass()
  ok(fired('Nova') === 1, 'not fired again once Heracles says complete')
})

T_run('bridge: waits for the dependency, then lands', function () {
  var p = T_newPlayer('Wren'); A.cap(p); A.apt(p, 'magic', 7)
  pass(); pass()
  ok(fired('Wren') === 0, 'quest still locked: dummy held back (it would be dropped)')
  H_deps[hk(p, 'onboarding_first_level')] = true
  pass()
  ok(fired('Wren') === 1, 'fires on the first pass after the quest unlocks')
})

T_run('bridge: unreadable capability never completes it', function () {
  var p = T_newPlayer('Ghost')       // no capability attached
  H_deps[hk(p, 'onboarding_first_level')] = true
  pass()
  ok(fired('Ghost') === 0, 'no capability: not fired')
})
