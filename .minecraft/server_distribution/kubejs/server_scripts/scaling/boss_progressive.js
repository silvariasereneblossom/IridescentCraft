// @file kubejs/server_scripts/scaling/boss_progressive.js
// @events EntityEvents.death, EntityEvents.spawned, ServerEvents.commandRegistry, hurt
// @registry bosses
// @live per-kill-counted, per-kill-scaled
// =============================================================================
// Per-kill boss scaling, PER PLAYER: the more often the players at a fight
// have killed that kind of boss, the stronger it is.
// =============================================================================
// Ruled by the operator (ruling 23, 2026-10-14; the design questions answered
// in the world-rules chip, 2026-10-15; internal design note
// design/per-kill-scaling-per-player-2026-10-15.md):
//   * WHOSE COUNT: the highest count among the players within 64 blocks, fixed
//     the first time the boss trades a hit with a player (either way round).
//     From then on the boss keeps it: a veteran arriving later changes nothing,
//     and a structure boss waits for whoever actually fights it.
//   * KILL CREDIT: every player within 64 blocks when the boss dies.
//   * THE CURVE (fight n = the row "kill n"; fight 1 is the first one):
//       fight 1          base
//       fight 2          +15 % health, +10 % damage, +3 % speed
//       fight 3-4        +30 / +20 / +5
//       fight 5-6        +50 / +35 / +8
//       fight 7-9        +75 / +48 / +10
//       fight 10-14      +100 / +60 / +12
//       fight 15 and on  +150 / +80 / +15 (the cap)
//     As multiply_total: a percentage of the boss as the pack builds it (its
//     designed health, the boss x3, the difficulty curve), so +15 % is +15 % of
//     what was fought last time. The damage is the attack-damage attribute
//     only: melee and the attacks that read it. Many bosses' spells and
//     projectiles deal their own numbers and are not scaled (ruled so).
//   * WHICH BOSSES: the registry's flag `perKill` (kubejs/config/icraft/
//     registry/bosses.json), switched on by `switches.perKill`. The Wither is
//     not on it (ruled out, 12:35 EDT 10-14), nor the Ender Dragon, the Warden
//     and the Elder Guardian.
//   * WHERE THE COUNT LIVES: the player's own saved data, compound
//     `icraft_boss_kills`, one key per boss id (the registry's id). It survives
//     death and is never shared. Everyone started at 0 the day this shipped.
//   * WHAT A PLAYER SEES: one chat line to the players within 64 blocks when a
//     boss is fixed above base, and `/icraft bosskills`.
//
// THE BOSS REMEMBERS (saved with it)
//   The three modifiers go on through core.spawnBuff (0_lib_core.js, "spawn
//   buffs"), flag `icraft_pk_scaled`, and are saved with the boss. The count it
//   was fixed at is `icraft_pk_kills` on the boss. A boss whose modifiers could
//   not be saved (flag 1) gets the SAME count back when it loads, never a new
//   one. A boss fixed at base has flag 2 and no modifier.
//
// UNTIL 2026-10-15 this script kept ONE counter per boss type for the whole
// world and scaled at spawn, with multiply_base (a share of the mod's own base
// health: +150 % at the cap was +15 % for a Knight Phantom and +219 % for a
// Nightblade) and one fight late. It never ran: its id lookup asked a Set with
// a Java string, and then the registry switch was off.
// =============================================================================

var PK_RADIUS_SQ = 64 * 64
var PK_COUNTS = 'icraft_boss_kills'   // player persistentData: { "<boss id>": kills }
var PK_FLAG = 'icraft_pk_scaled'      // boss: core.spawnBuff flag
var PK_AT = 'icraft_pk_kills'         // boss: the count it was fixed at
var PK_HP = 'minecraft:generic.max_health'
var PK_DMG = 'minecraft:generic.attack_damage'
var PK_SPD = 'minecraft:generic.movement_speed'
// [first fight of the row, health, damage, speed], highest row first
var PK_ROWS = [[15, 1.50, 0.80, 0.15], [10, 1.00, 0.60, 0.12], [7, 0.75, 0.48, 0.10],
               [5, 0.50, 0.35, 0.08], [3, 0.30, 0.20, 0.05], [2, 0.15, 0.10, 0.03]]

var pkWarn = function (where, e) {
  global.icraft.core.warnOnce('scaling/boss_progressive:' + where, '[per-kill] ' + where + ' threw: ' + e)
}

// the scaling of fight number `fight` (1 = the first fight: base)
function pkScale(fight) {
  for (var i = 0; i < PK_ROWS.length; i++) {
    if (fight >= PK_ROWS[i][0]) return { hp: PK_ROWS[i][1], dmg: PK_ROWS[i][2], spd: PK_ROWS[i][3] }
  }
  return { hp: 0, dmg: 0, spd: 0 }
}

// the registry's id of a scalable boss, or null (switch off, not flagged, not a boss)
function pkBossId(entity) {
  if (!entity || !icraft.bosses.enabled('perKill')) return null
  var id = global.icraft.core.entityId(entity)
  if (!id || !icraft.bosses.has(id, 'perKill')) return null
  return String(icraft.bosses.canon(id))
}

// how many of boss `id` this player has killed
function pkKills(player, id) {
  var data = player.persistentData
  if (!data.contains(PK_COUNTS)) return 0
  return Number(data.getCompound(PK_COUNTS).getInt(String(id)))
}

// the players within 64 blocks of `entity`, in its level (spectators do not count). getPlayers() as a
// call: ServerLevel also inherits a players() method, and a bean of that name is not guaranteed
function pkPlayersNear(entity) {
  var out = []
  var list = entity.level.getPlayers()
  for (var i = 0; i < list.size(); i++) {
    var p = list.get(i)
    if (p.isSpectator()) continue
    if (Number(p.distanceToEntitySqr(entity)) <= PK_RADIUS_SQ) out.push(p)
  }
  return out
}

function pkPercent(x) { return Math.round(x * 100) + ' %' }

// Fix a boss's scaling now, once: -> { kills, fight, scale } | null (already fixed, or not scalable)
function pkFix(boss) {
  var id = pkBossId(boss)
  if (id === null) return null
  var core = global.icraft.core
  var buff = core.spawnBuff(boss, PK_FLAG)
  if (!buff) return null
  var data = boss.persistentData
  var near = []
  var kills = 0
  if (buff.legacy && data.contains(PK_AT)) {
    // fixed before, its modifiers were not saved: the same count again
    kills = Number(data.getInt(PK_AT))
  } else {
    near = pkPlayersNear(boss)
    for (var i = 0; i < near.length; i++) kills = Math.max(kills, pkKills(near[i], id))
    data.putInt(PK_AT, kills)
  }
  var fight = kills + 1
  var scale = pkScale(fight)
  var share = 1
  try {
    var max = Number(boss.getMaxHealth())
    if (max > 0) share = Math.max(0, Math.min(1, Number(boss.getHealth()) / max))
  } catch (e) { pkWarn('health share', e) }
  if (scale.hp > 0) buff.modifier(PK_HP, 'icraft_pk_hp', scale.hp, 'multiply_total')
  if (scale.dmg > 0) buff.modifier(PK_DMG, 'icraft_pk_dmg', scale.dmg, 'multiply_total')
  if (scale.spd > 0) buff.modifier(PK_SPD, 'icraft_pk_spd', scale.spd, 'multiply_total')
  // the boss keeps its share of health (a boss hit at full health stays full)
  if (scale.hp > 0 && share > 0) boss.setHealth(share * Number(boss.getMaxHealth()))
  buff.done()
  if (scale.hp > 0 && near.length > 0) {
    var line = Text.gold('[Per-kill] ').append(Text.translate(pkNameKey(id)))
      .append(Text.gray(', fight ' + fight + ' (the most kills among you): '))
      .append(Text.yellow('+' + pkPercent(scale.hp) + ' health, +' + pkPercent(scale.dmg) + ' damage, +' + pkPercent(scale.spd) + ' speed'))
    for (var j = 0; j < near.length; j++) near[j].tell(line)
    icraft.live.fired('per-kill-scaled')
  }
  return { kills: kills, fight: fight, scale: scale }
}

// a boss id's translation key: entity.<namespace>.<path>
function pkNameKey(id) {
  var s = String(id)
  var at = s.indexOf(':')
  return 'entity.' + s.substring(0, at) + '.' + s.substring(at + 1).replace(/\//g, '.')
}

// a scalable boss died: +1 for every player within 64 blocks -> how many were credited
function pkCredit(boss) {
  var id = pkBossId(boss)
  if (id === null) return 0
  var near = pkPlayersNear(boss)
  for (var i = 0; i < near.length; i++) {
    var data = near[i].persistentData
    if (!data.contains(PK_COUNTS)) data.put(PK_COUNTS, {})
    var counts = data.getCompound(PK_COUNTS)
    counts.putInt(id, Number(counts.getInt(id)) + 1)
  }
  if (near.length > 0) icraft.live.fired('per-kill-counted')
  console.log('[per-kill] ' + id + ' died: ' + near.length + ' player(s) within 64 blocks credited')
  return near.length
}

// /icraft bosskills: this player's counts and what the next fight of each would be
function pkReport(player) {
  player.tell(Text.gold('═══ Boss kills (per-kill scaling) ═══'))
  var shown = 0
  var data = player.persistentData
  if (data.contains(PK_COUNTS)) {
    var counts = data.getCompound(PK_COUNTS)
    var keys = []
    counts.getAllKeys().forEach(function (k) { keys.push(String(k)) })
    keys.sort()
    for (var i = 0; i < keys.length; i++) {
      var n = Number(counts.getInt(keys[i]))
      if (!(n > 0)) continue
      var next = pkScale(n + 1)
      player.tell(Text.gray('  ').append(Text.translate(pkNameKey(keys[i])))
        .append(Text.gray(': ' + n + (n === 1 ? ' kill' : ' kills') + ', next fight '))
        .append(Text.yellow('+' + pkPercent(next.hp) + ' health, +' + pkPercent(next.dmg) + ' damage, +' + pkPercent(next.spd) + ' speed')))
      shown++
    }
  }
  if (shown === 0) player.tell(Text.gray('  No boss kills counted yet. Every boss you help kill counts, within 64 blocks.'))
  player.tell(Text.gray('  The most kills among the players near a boss sets it, the first time it trades a hit.'))
  return 1
}

// ─── the first hit a scalable boss trades with a player fixes it ───
global.icraft.core.onHurt('scaling/boss_progressive', function (event, ctx) {
  var boss = null
  if (ctx.attackerIsPlayer && !ctx.victimIsPlayer) boss = ctx.victim
  else if (ctx.victimIsPlayer && ctx.attacker !== null && !ctx.attackerIsPlayer) boss = ctx.attacker
  if (boss === null) return
  pkFix(boss)
}, 'player')

// ─── a boss whose modifiers were not saved gets the same count back when it loads ───
EntityEvents.spawned(icraft.guard('scaling/boss_progressive', 'EntityEvents.spawned', function (event) {
  var entity = event.entity
  if (!entity || !entity.living || pkBossId(entity) === null) return
  if (Number(entity.persistentData.getInt(PK_FLAG)) !== 1) return
  pkFix(entity)
}))

// ─── a kill counts for every player within 64 blocks ───
EntityEvents.death(icraft.guard('scaling/boss_progressive', 'EntityEvents.death', function (event) {
  var entity = event.entity
  if (!entity || !entity.living) return
  pkCredit(entity)
}))

ServerEvents.commandRegistry(icraft.guard('scaling/boss_progressive', 'ServerEvents.commandRegistry', function (event) {
  var Commands = event.commands
  event.register(
    Commands.literal('icraft')
      .then(Commands.literal('bosskills')
        .requires(function (src) { return src.hasPermission(0) })
        .executes(function (ctx) {
          var sp = null
          try { sp = ctx.source.getPlayerOrException() } catch (e) {
            // swallow-ok: not a player (the console, a command block): the source is told so and the command ends
            ctx.source.sendFailure(Text.of('Must be run as a player'))
            return 0
          }
          return pkReport(sp)
        }))
  )
}))
