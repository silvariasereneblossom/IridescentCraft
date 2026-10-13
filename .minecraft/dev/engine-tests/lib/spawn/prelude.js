// What KubeJS provides to server scripts, as far as 0_lib_core.js, 0_iss_guard.js and scaling/* use it.
var global = {}
var console = {
  log: function (s) { __host.print('    [log] ' + s); __host.snap('[log] ' + s) },
  info: function (s) { __host.print('    [log] ' + s); __host.snap('[log] ' + s) },
  warn: function (s) { __host.print('    [WARN] ' + s); __host.snap('[WARN] ' + s) },
  error: function (s) { __host.print('    [ERROR] ' + s); __host.snap('[ERROR] ' + s) }
}
// the two classes these scripts load, as stand-ins; any other name is a ClassNotFoundException, as for a missing mod
__host.alias('net.minecraft.resources.ResourceLocation', 'mk.M$RL')
__host.alias('net.minecraftforge.registries.ForgeRegistries', 'mk.M$ForgeRegistries')
var Java = { loadClass: function (name) { return __host.loadClass(String(name)) } }
var __spawned = []
var __death = []
var EntityEvents = {
  spawned: function (fn) { __spawned.push(fn) },
  death: function (fn) { __death.push(fn) }
}
// script-side mocks, held to the engine's tables (lib/honest.js)
T_honestEvent('EntityEvents.spawned')
T_honestEvent('EntityEvents.death')
T_honestKeys('console', console, 'dev.latvian.mods.kubejs.util.ConsoleJS', false)
// JsonIO.readString(path): how 0_lib_registry.js reads kubejs/config/icraft/registry/*.json. The Host reads the file of the
// pack under test with the engine's own two calls (H.java readJsonText); suite mock-facts compares the answers.
var JsonIO = { readString: function (path) { return __host.readJsonText(String(path)) } }
T_honestKeys('JsonIO', JsonIO, 'dev.latvian.mods.kubejs.util.JsonIO', true)
T_honestKeys('Java', Java, 'dev.latvian.mods.kubejs.bindings.JavaWrapper', false)
