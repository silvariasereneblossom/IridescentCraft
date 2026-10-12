// =============================================================================
// The event guard on a REAL running server (bare Forge + the pack's KubeJS, Rhino and Architectury jars):
// real EntityEvents.spawned chains, real /summon, the real class filter behind Java.loadClass.
// File: .minecraft/dev/engine-tests/guard/real_engine_probe.js   (dev tool, never in a distro)
//
// What the offline suite (GuardChain.java) cannot show: that the two classes the guard loads pass KubeJS's
// class filter on a live engine, that its self-test passes there, that `// priority: 1000` puts it first on a
// file system that lists scripts in another order, and that a cancel raised behind the guard really stops an
// entity from joining a world.
//
// Run (WSL; about 40 s; a Forge server install as for real-engine/run_real_engine.sh, which is reused as it is):
//   mkdir p && cp <pack>/kubejs/server_scripts/00_icraft_guard.js .minecraft/dev/engine-tests/guard/real_engine_probe.js p/
//   bash .minecraft/dev/engine-tests/real-engine/run_real_engine.sh p out <instance mods> ~/icraft-backstop/server 25594 \
//        kubejs-forge-<v>.jar rhino-forge-<v>.jar architectury-<v>-forge.jar
//   grep 'engine-probe\|icraft.guard\|Loaded script' out/kubejs-server.log
// Expected lines (2026-10-12, kubejs-forge 2001.6.5-build.16):
//   Loaded script server_scripts:00_icraft_guard.js ...          FIRST, whatever the directory listing order
//   [icraft.guard] armed ... (self-test ok)
//   GUARD chicken  seen_by_last_handler=1 in_world=1             nothing touches it (the control)
//   GUARD cow      seen_by_last_handler=1 in_world=1             the FIRST handler throws for it: reported, the rest ran
//   GUARD pig      seen_by_last_handler=0 in_world=0             a guarded handler cancels it
//   GUARD sheep    seen_by_last_handler=0 in_world=0             a section inside a guarded handler cancels it
//   [icraft.guard] FAILED real_engine_probe in EntityEvents.spawned: TypeError ...      exactly once
// =============================================================================
;(function () {
  var TAG = '[engine-probe] '
  var out = function (s) { console.log(TAG + s) }
  var MARK = 'icraft_guard_probe'
  var seen = {}
  var marked = function (entity) {
    return entity.getTags().contains(MARK)
  }

  // four handlers on one real chain, in this order
  EntityEvents.spawned(icraft.guard('real_engine_probe', 'EntityEvents.spawned', function (event) {
    if (!marked(event.entity)) return
    var nothing
    if (String(event.entity.type) === 'minecraft:cow') nothing.boom()
  }))
  EntityEvents.spawned(icraft.guard('real_engine_probe#2', 'EntityEvents.spawned', function (event) {
    if (!marked(event.entity)) return
    if (String(event.entity.type) === 'minecraft:pig') event.cancel()
  }))
  EntityEvents.spawned(icraft.guard('real_engine_probe#3', 'EntityEvents.spawned', function (event) {
    if (!marked(event.entity)) return
    icraft.section('real_engine_probe/sheep', function () {
      if (String(event.entity.type) === 'minecraft:sheep') event.cancel()
    })
  }))
  EntityEvents.spawned(icraft.guard('real_engine_probe#4', 'EntityEvents.spawned', function (event) {
    if (!marked(event.entity)) return
    var t = String(event.entity.type)
    seen[t] = (seen[t] || 0) + 1
  }))

  ServerEvents.loaded(icraft.guard('real_engine_probe', 'ServerEvents.loaded', function (event) {
    out('BEGIN')
    var server = event.server
    var types = ['minecraft:chicken', 'minecraft:cow', 'minecraft:pig', 'minecraft:sheep']
    var summoned = 0
    var inWorld = 0
    for (var i = 0; i < types.length; i++) {
      // a server-source command runs at the world spawn, whose chunks a bare server keeps loaded
      summoned = server.runCommandSilent('summon ' + types[i] + ' ~ ~ ~ {Tags:["' + MARK + '"],NoAI:1b}')
      inWorld = server.runCommandSilent('execute if entity @e[type=' + types[i] + ',tag=' + MARK + ']')
      out('GUARD ' + types[i].substring(10) + ' summon_result=' + summoned + ' seen_by_last_handler=' + (seen[types[i]] || 0) + ' in_world=' + inWorld)
    }
    var f = icraft.guard.failures()
    for (var j = 0; j < f.length; j++) out('GUARD failure ' + f[j].name + ' in ' + f[j].event + ' x' + f[j].count)
    out('GUARD armed=' + icraft.guard.armed() + ' guarded=' + icraft.guard.guarded() + ' failures=' + icraft.guard.failureCount())
    out('END')
  }))
})()
