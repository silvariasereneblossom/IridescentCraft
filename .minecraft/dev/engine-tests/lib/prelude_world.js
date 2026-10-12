// World plumbing for the suites (after lib/prelude.js): script loading, two levels, chat, attribute reads.
var A = __host.loadClass('mk.A')
var Text = __host.loadClass('mk.S$Text')          // the TextWrapper mock (append(String) hidden, as in game)
var T_LOAD_ERRORS = []
var T_loadAll = function (files) {
  var n = 0
  for (var i = 0; i < files.length; i++) {
    var err = String(__host.load(files[i]))
    if (err !== '') { T_LOAD_ERRORS.push(files[i] + ': ' + err); __host.print('!! load ' + files[i] + ': ' + err) } else n++
  }
  __host.print('loaded ' + n + '/' + files.length + ' scripts')
}
var T_OW = T_level('minecraft:overworld')
var T_NETHER = T_level('minecraft:the_nether')
// a chat message as KubeJS delivers it (PlayerEvents.chat); returns the event (ev.cancelled)
var chat = function (player, msg) { return T_fire('P.chat', { player: player, message: msg, server: T_server }) }
var worldLevel = function () { var d = T_OW.persistentData; return d.contains('icraft_ascension_level') ? Number(d.getInt('icraft_ascension_level')) : 0 }
var mod = function (e, attr, key) { var v = T.mod(e, attr, key); return v === null ? null : Number(v) }
var P_ATTRS = [
  ['minecraft:generic.max_health', 'icraft_asc_player_hp'], ['minecraft:generic.attack_damage', 'icraft_asc_player_dmg'],
  ['minecraft:generic.movement_speed', 'icraft_asc_player_spd'], ['minecraft:generic.armor', 'icraft_asc_player_armor']
]
// all four player bonuses equal `want` (null = absent)
var bonuses = function (p, want) {
  for (var i = 0; i < P_ATTRS.length; i++) {
    var v = mod(p, P_ATTRS[i][0], P_ATTRS[i][1])
    if (want === null) { if (v !== null) return false }
    else if (v === null || Math.abs(v - want) > 1e-9 || Number(A.op(p, P_ATTRS[i][0], P_ATTRS[i][1])) !== 1) return false
  }
  return true
}
var spawn = function (e) { return T_fire('E.spawned', { entity: e, level: e.level, server: T_server }) }
