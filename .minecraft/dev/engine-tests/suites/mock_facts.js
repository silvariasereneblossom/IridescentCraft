// =============================================================================
// MOCK FACTS -- the engine facts (real-engine/0_engine_facts.js), asked of the mocks.
// The REAL engine's answers are in truth/engine-facts.txt (recorded on a Forge server).
// Rule: where a mock answers at all, it gives the engine's answer. A mock may lack a
// member (the fact is then "not mocked" and listed), it may not answer differently:
// that is how a mock inventory with `size`, or a mock that hands out JS strings
// where the engine hands out Java strings, made dead code look alive.
// =============================================================================
;(function () {
  var player = T_newPlayer('ProbePlayer')
  T.slot(player, 0, new MStack('minecraft:diamond', 3))
  T.slot(player, 40, new MStack('minecraft:diamond', 2))
  var objects = {
    player: player, inv: player.inventory, stack: player.inventory.getStackInSlot(0), mob: T_mob('minecraft:zombie'),
    level: T_OW, server: T_server, source: T.source('minecraft:generic', null, null),
    psource: T.source('minecraft:player_attack', player, player)
  }
  var clean = function (s) { return String(s).replace(/@[0-9a-f]{4,}/g, '@#').replace(/[\r\n\t]+/g, ' ') }
  var notMocked = []
  var asked = 0

  T_run('the mocks answer the engine facts as the engine does', function () {
    for (var i = 0; i < ENGINE_FACTS.length; i++) {
      var fact = ENGINE_FACTS[i]
      if (fact[2].indexOf('M') < 0) continue
      asked++
      var label = fact[0]
      var engine = __host.fact(label)
      if (engine === null || engine === undefined) { ok(false, label + ': no recorded engine answer (run `run.py real-engine record`)'); continue }
      engine = String(engine)
      var got
      try { var v = fact[3](objects); got = 'typeof=' + (typeof v) + ' value=' + clean(v) } catch (e) { got = 'THROWS ' + clean(e) }
      if (got === engine) { ok(true, label + ' :: ' + got); continue }
      // a mock that lacks the member: calling it is a TypeError, or a `typeof` fact says undefined.
      // Any other throw is a different ANSWER, and fails.
      var missing = got.indexOf('THROWS ') === 0 && /Cannot find function|Cannot call method|Cannot read property|is not a function|is undefined/.test(got)
      var lacks = missing || (label.indexOf('typeof ') === 0 && got === 'typeof=string value=undefined')
      if (lacks) { notMocked.push(label + '  (engine: ' + engine + ')'); continue }
      ok(false, label + ': the mock says "' + got + '", the engine says "' + engine + '"')
    }
  })
  __host.print('   ' + asked + ' facts asked, ' + notMocked.length + ' not mocked' + (notMocked.length ? ':' : ''))
  for (var n = 0; n < notMocked.length; n++) __host.print('      - ' + notMocked[n])
})()
