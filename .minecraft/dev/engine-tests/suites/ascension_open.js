// With the switch ON (the scratch-copy rehearsal variant): the activation path.
var steve = T_newPlayer('Steve'), alex = T_newPlayer('Alex')
var quiet = function () { A.clearTold(steve); A.clearTold(alex); A.clearCommands(T_server) }

T_run('open: recipe', function () {
  ok(T_LOAD_ERRORS.length === 0, 'every script loads')
  var made = []
  T_fire('S.recipes', { shaped: function (out, pattern, keys) { var r = { rid: null, id: function (x) { r.rid = String(x); return r }, keys: keys, pattern: pattern }; made.push(r); return r } })
  ok(made.length === 1 && made[0].rid === 'iridescent:ascension_beacon', 'beacon recipe registered once with its id')
  ok(made.length === 1 && made[0].pattern.join('/') === ' R /GNH/ R ' && String(made[0].keys.R) === 'cataclysm:void_core', 'pattern and keys intact')
})

T_run('open: !ascend refusals take nothing', function () {
  quiet(); steve.t_xp(120)
  chat(steve, '!ascend'); T_tick(10)
  ok(String(A.told(steve)).indexOf('must hold an Ascension Beacon') >= 0, 'no beacon: ' + A.told(steve))
  ok(worldLevel() === 0 && Number(steve.xpLevel) === 120, 'nothing taken')
  quiet(); steve.t_hold(new MStack('minecraft:nether_star', 1))
  chat(steve, '!ascend'); T_tick(10)
  ok(String(A.told(steve)).indexOf('must hold an Ascension Beacon') >= 0 && worldLevel() === 0, 'a plain nether star is not a beacon')
  quiet(); steve.t_hold(A.beacon()); steve.t_xp(49)
  chat(steve, '!ascend'); T_tick(10)
  ok(String(A.told(steve)).indexOf('need at least 50 experience levels. You have 49') >= 0, '49 levels: ' + A.told(steve))
  ok(worldLevel() === 0 && Number(steve.xpLevel) === 49 && Number(A.count(steve.mainHandItem)) === 1, 'nothing taken')
})

T_run('open: !ascend', function () {
  quiet(); steve.t_hold(A.beacon()); steve.t_xp(60)
  var ev = chat(steve, '!ascend')
  ok(ev.cancelled === true && worldLevel() === 0 && Number(steve.xpLevel) === 60, 'hidden; nothing happens on the chat thread')
  T_tick(10)
  ok(worldLevel() === 1, 'world level 1')
  ok(Number(steve.xpLevel) === 10, '50 levels taken (60 -> ' + steve.xpLevel + ')')
  ok(Number(A.count(steve.mainHandItem)) === 0, 'beacon consumed')
  ok(bonuses(steve, 0.03) && bonuses(alex, 0.03), 'everyone online gets +3%')
  var a = String(A.told(alex))
  ok(a.indexOf('Steve has activated Ascension I') >= 0 && a.indexOf('cannot be undone') >= 0 &&
     a.indexOf('Mob HP: +25% | Mob Damage: +20%') >= 0 && a.indexOf('All player stats: +3%') >= 0, 'announced to others: ' + a)
  ok(Number(A.toldCount(alex)) === 4 && Number(A.toldCount(steve)) === 4, 'four lines each')
  var c = String(A.commands(T_server))
  ok(c.split('execute at Alex run playsound ').length - 1 === 2 && c.split('execute at Steve run playsound ').length - 1 === 2, 'two sounds per player, at the player: ' + c)
  ok(c.indexOf(' master Alex ~ ~ ~ 1 0.5') >= 0, 'sound targets the listener')
  quiet(); T_tick(20)
  ok(worldLevel() === 1 && Number(A.toldCount(steve)) === 0, 'runs once')
})

T_run('open: failed charge is refunded, beacon kept', function () {
  quiet(); steve.t_hold(A.beacon()); steve.t_xp(80)
  var real = global.icraft.aptitude.xp
  var given = 0
  global.icraft.aptitude.xp = { take: function (p, n) { p.addXPLevels(-20); return 20 }, give: function (p, n) { given += n; p.addXPLevels(n); return n } }
  chat(steve, '!ascend'); T_tick(10)
  global.icraft.aptitude.xp = real
  ok(worldLevel() === 1, 'level unchanged')
  ok(given === 20 && Number(steve.xpLevel) === 80, 'the 20 levels that came off are given back')
  ok(Number(A.count(steve.mainHandItem)) === 1, 'beacon kept')
  ok(String(A.told(steve)).indexOf('could not be taken. Nothing was used up.') >= 0, 'told: ' + A.told(steve))
})

T_run('open: cap', function () {
  T_OW.persistentData.putInt('icraft_ascension_level', 5)
  quiet(); steve.t_hold(A.beacon()); steve.t_xp(500)
  chat(steve, '!ascend'); T_tick(10)
  ok(String(A.told(steve)).indexOf('already reached the maximum Ascension level (5)') >= 0, 'max: ' + A.told(steve))
  ok(Number(steve.xpLevel) === 500 && Number(A.count(steve.mainHandItem)) === 1 && worldLevel() === 5, 'nothing taken')
  T_OW.persistentData.putInt('icraft_ascension_level', 99)
  ok(Number(global.ICRAFT_ASCENSION.getLevel(T_OW)) === 5, 'a stored level above 5 reads as 5')
})
