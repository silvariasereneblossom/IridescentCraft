// Ascension: status + operator commands, the !ascend switch, player bonuses, mob scaling.
var steve = T_newPlayer('Steve'), alex = T_newPlayer('Alex')
var oper = T_newPlayer('Oper'); oper.t_op(true)
var quiet = function () { A.clearTold(steve); A.clearTold(alex); A.clearTold(oper); A.clearCommands(T_server) }

T_run('load', function () {
  ok(T_LOAD_ERRORS.length === 0, 'every script loads')
  ok(typeof global.ICRAFT_ASCENSION === 'object' && typeof global.ICRAFT_ASCENSION.getLevel === 'function', 'global.ICRAFT_ASCENSION exported')
  ok(Number(global.ICRAFT_ASCENSION.getLevel(T_NETHER)) === 0, 'level reads 0 from another dimension on a fresh world')
  var regs = global.serverTickFunctions.filter(function (f) { return String(f.name).toLowerCase().indexOf('ascension') >= 0 })
  ok(regs.length >= 1, 'tick functions registered: ' + regs.map(function (f) { return f.name + '@' + f.interval + '+' + f.offset }).join(', '))
  ok(regs.every(function (f) { return f.offset < f.interval }), 'every offset < interval')
})

T_run('ordinary chat is left alone', function () {
  var msgs = ['hello', '!stats', '!ascensionx', '!ascend now', 'i typed !ascension in a sentence', '!ascension-setx 3']
  for (var i = 0; i < msgs.length; i++) {
    var ev = chat(steve, msgs[i])
    ok(ev.cancelled !== true, '"' + msgs[i] + '" is not swallowed')
  }
  T_tick(20)
  ok(Number(A.toldCount(steve)) === 0, 'and gets no reply (' + A.told(steve) + ')')
  ok(!steve.persistentData.contains('icraft_ascension_chat_pending'), 'nothing left pending')
})

T_run('!ascension (status), level 0', function () {
  quiet()
  var ev = chat(steve, '  !Ascension ')
  ok(ev.cancelled === true, 'message hidden from chat')
  ok(Number(A.toldCount(steve)) === 0, 'the chat thread itself replies nothing (work is handed to the server thread)')
  T_tick(10)
  ok(String(A.told(steve)).indexOf('base difficulty (Ascension 0)') >= 0, 'reply within 10 ticks: ' + A.told(steve))
  ok(!steve.persistentData.contains('icraft_ascension_chat_pending'), 'pending flag cleared')
  ok(Number(A.toldCount(alex)) === 0, 'only the asker is told')
  quiet(); T_tick(20)
  ok(Number(A.toldCount(steve)) === 0, 'answered once')
})

T_run('!ascend is OFF', function () {
  quiet()
  steve.t_hold(A.beacon()); steve.t_xp(120)
  var ev = chat(steve, '!ascend')
  ok(ev.cancelled === true, 'message hidden from chat')
  T_tick(10)
  ok(String(A.told(steve)).indexOf('not open on this server yet') >= 0, 'clear reply: ' + A.told(steve))
  ok(Number(A.count(steve.mainHandItem)) === 1, 'beacon not consumed')
  ok(Number(steve.xpLevel) === 120, 'levels not taken')
  ok(worldLevel() === 0, 'world level unchanged')
  ok(Number(A.toldCount(alex)) === 0 && String(A.commands(T_server)) === '', 'no announcement, no sound')
  // an operator typing !ascend gets the same answer: the switch is the only way in
  quiet(); oper.t_hold(A.beacon()); oper.t_xp(120)
  chat(oper, '!ascend'); T_tick(10)
  ok(worldLevel() === 0 && String(A.told(oper)).indexOf('not open') >= 0, 'operators too')
  var shaped = 0
  T_fire('S.recipes', { shaped: function () { shaped++; return { id: function () {} } } })
  ok(shaped === 0, 'Ascension Beacon recipe not registered while off')
})

T_run('operator commands refused for a non-operator', function () {
  quiet()
  var cmds = ['!ascension-set 3', '!ascension-reset', '!ascension-set']
  for (var i = 0; i < cmds.length; i++) {
    var ev = chat(steve, cmds[i]); T_tick(10)
    ok(ev.cancelled === true, cmds[i] + ': hidden')
    ok(worldLevel() === 0, cmds[i] + ': level unchanged')
  }
  ok(String(A.told(steve)).split('server operator').length - 1 === 3, 'told why, each time: ' + A.told(steve))
  ok(bonuses(steve, null) && bonuses(alex, null), 'no bonuses applied')
})

T_run('!ascension-set N (operator)', function () {
  quiet()
  var ev = chat(oper, '!ascension-set 3')
  ok(ev.cancelled === true && worldLevel() === 0, 'hidden; nothing changes on the chat thread')
  T_tick(10)
  ok(worldLevel() === 3, 'world level is 3')
  ok(Number(global.ICRAFT_ASCENSION.getLevel(T_NETHER)) === 3, 'and reads 3 from another dimension')
  ok(bonuses(steve, 0.09) && bonuses(alex, 0.09) && bonuses(oper, 0.09), 'all online players: 4 x +9% multiply_base')
  ok(String(A.told(oper)).indexOf('Level set to 3 (was 0)') >= 0, 'operator told: ' + A.told(oper))
  ok(Number(A.toldCount(steve)) === 0, 'no broadcast')
  ok(T_LOG.info.join('\n').indexOf('Ascension level 0 -> 3 (!ascension-set) by operator Oper') >= 0, 'logged')
  quiet(); chat(steve, '!ascension'); T_tick(10)
  var s = String(A.told(steve))
  ok(s.indexOf('Level 3: III') >= 0 && s.indexOf('Mob HP: +75% | Mob Damage: +60% | Your Stats: +9%') >= 0, 'status at 3: ' + s)
  // bad arguments
  var bad = ['!ascension-set 9', '!ascension-set abc', '!ascension-set', '!ascension-set -1', '!ascension-set 2.5', '!ascension-set 1 2']
  for (var i = 0; i < bad.length; i++) {
    quiet(); chat(oper, bad[i]); T_tick(10)
    ok(worldLevel() === 3 && String(A.told(oper)).indexOf('Usage: !ascension-set <0-5>') >= 0, bad[i] + ' -> usage, level stays 3 (' + A.told(oper) + ')')
  }
  quiet(); chat(oper, '!ASCENSION-SET 5'); T_tick(10)
  ok(worldLevel() === 5 && bonuses(steve, 0.15), 'case-insensitive; 5 -> +15%')
  quiet(); chat(oper, '!ascension-set 1'); T_tick(10)
  ok(worldLevel() === 1 && bonuses(steve, 0.03) && bonuses(oper, 0.03), 'lowering replaces the modifier (no stacking): +3%')
})

T_run('login / respawn / refresh carry the bonus', function () {
  var late = T_newPlayer('Late')
  ok(bonuses(late, 0.03), 'a player logging in at level 1 gets +3%')
  // respawn = a new player entity: no modifiers until the handler runs
  var reborn = new MPlayer('Reborn', T_OW, 0, 64, 0)
  ok(bonuses(reborn, null), '(new entity starts bare)')
  T_fire('P.respawned', { player: reborn, server: T_server })
  ok(bonuses(reborn, 0.03), 'respawn re-applies')
  var bare = new MPlayer('Bare', T_OW, 0, 64, 0)
  var t = T.num(T_server, 'tick'); T.set(T_server, 'tick', Math.ceil((t + 1) / 6000) * 6000)
  T_tick(1)
  ok(bonuses(bare, 0.03), 'the 5-minute refresh re-applies')
  A.unlist(T_server, late); A.unlist(T_server, reborn); A.unlist(T_server, bare)
})

T_run('mob scaling at level 3', function () {
  quiet(); chat(oper, '!ascension-set 3'); T_tick(10)
  var z = T_mob('minecraft:zombie', 'minecraft:the_nether', 0, 64, 0, 80)
  T.set(z, 'health', 50)
  spawn(z)
  near(mod(z, 'minecraft:generic.max_health', 'icraft_asc_hp'), 0.75, 'zombie HP modifier')
  ok(Number(A.op(z, 'minecraft:generic.max_health', 'icraft_asc_hp')) === 2, 'multiply_total')
  near(mod(z, 'minecraft:generic.attack_damage', 'icraft_asc_dmg'), 0.6, 'zombie damage modifier')
  near(z.maxHealth, 140, 'max health 80 x 1.75')
  near(A.health(z), 140, 'healed to the new maximum')
  ok(z.persistentData.contains('icraft_asc_scaled'), 'flagged')
  spawn(z)
  near(z.maxHealth, 140, 'a second join does not stack')
  var cow = new MLiving('minecraft:cow', T_OW, 0, 64, 0)
  spawn(cow)
  ok(mod(cow, 'minecraft:generic.max_health', 'icraft_asc_hp') === null, 'a cow is not scaled')
  var boss = new MLiving('cataclysm:ignis', T_OW, 0, 64, 0)
  spawn(boss)
  near(mod(boss, 'minecraft:generic.max_health', 'icraft_asc_hp'), 0.75, 'a non-Monster cataclysm mob is scaled by namespace')
  var necro = T_mob('irons_spellbooks:necromancer', 'minecraft:overworld', 0, 64, 0, 40)
  spawn(necro)
  ok(mod(necro, 'minecraft:generic.max_health', 'icraft_asc_hp') === null, 'the crash-prone ISS casters are skipped')
  spawn(steve)
  ok(mod(steve, 'minecraft:generic.max_health', 'icraft_asc_hp') === null, 'players are not mob-scaled')
})

T_run('!ascension-reset (operator)', function () {
  quiet()
  A.setHealthRaw(steve, steve.maxHealth)
  var boosted = Number(A.health(steve))
  ok(boosted > 20, '(steve is at his boosted maximum: ' + boosted + ')')
  chat(oper, '!ascension-reset'); T_tick(10)
  ok(worldLevel() === 0, 'world level 0')
  ok(bonuses(steve, null) && bonuses(alex, null) && bonuses(oper, null), 'every online player loses the bonus at once')
  near(A.health(steve), 20, 'health clamped to the lowered maximum')
  ok(String(A.told(oper)).indexOf('Ascension reset to 0 (was 3)') >= 0, 'operator told: ' + A.told(oper))
  var fresh = T_mob('minecraft:zombie', 'minecraft:overworld', 0, 64, 0, 20)
  spawn(fresh)
  ok(mod(fresh, 'minecraft:generic.max_health', 'icraft_asc_hp') === null && !fresh.persistentData.contains('icraft_asc_scaled'), 'new mobs are plain again and not flagged')
  quiet(); chat(steve, '!ascension'); T_tick(10)
  ok(String(A.told(steve)).indexOf('base difficulty') >= 0, 'status says base')
})
