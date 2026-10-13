// =============================================================================
// IridescentCraft — Boss HP Overrides
// File: kubejs/server_scripts/scaling/boss_hp.js
//
// Design Doc Part II: Boss HP Targets (First Kill)
//
// Sets custom base HP for all designed bosses. Progressive Bosses mod handles
// per-kill scaling ON TOP of these base values.
//
// NOTE: Some bosses have hardcoded HP that may resist attribute modification.
// If a boss ignores the override, it may need a mod-specific config or mixin.
// Test in-game and document any that don't respond.
//
// SAVED WITH THE BOSS (2026-10-12)
//   The override goes on through core.spawnBuff (0_lib_core.js, "spawn
//   buffs"), which adds a PERMANENT modifier. entity.modifyAttribute adds a
//   transient one: until this date the override was lost at the first
//   save/load while the 'icraft_boss_hp' flag stayed, so a boss that had
//   waited in an unloaded chunk or across a restart came back at its mod's own
//   HP. A boss in that state (flag 1) gets the override back when it loads and
//   keeps its share of health; flag 2 = saved with the boss, nothing to do.
//
// THE DESIGNED VALUE HOLDS WHEN A MOD MOVES THE BASE (2026-10-13)
//   The override is a multiplier worked out on the maximum the boss has when
//   this handler sees it. A mod that sets the boss's BASE health after that
//   turns the designed value into something else. Measured on a full-pack boot,
//   the Ender Dragon (designed 1,000; with the boss x3: 3,000): this handler
//   sees the vanilla 200 and saves +4.0; Progressive Bosses' own join handler
//   then sets the base to 500 and the health to 500. Result: 500 of 7,500, a
//   dragon with two and a half times its designed health that starts at a
//   fifteenth of it.
//   So this script remembers the base it worked the multiplier out for
//   (persistentData icraft_boss_hp_base) and looks again (bossHpSettle below):
//     * one tick and twenty ticks after every join, when every mod's join
//       handler and first tick have run;
//     * at every join of a boss whose override is already saved.
//   When the base is no longer the remembered one, the multiplier is worked out
//   again for the boss as it is now. The boss keeps its share of health; on its
//   FIRST spawn it ends at full health instead (the mod set its health to its
//   own maximum after this script had healed it).
//   Only a moved BASE does this. A modifier another mod adds later (a Champion's
//   health, an affix) multiplies on top of the designed value, as it always did.
//   A boss saved before this date has no remembered base: its multiplier is
//   checked once against the base it has (exact when no other mod's modifier is
//   on its health; left alone when one is), and the base is remembered.
// =============================================================================

var BOSS_HP_ATTR = 'minecraft:generic.max_health'
var BOSS_HP_MODIFIER = 'icraft_boss_hp_override'
var BOSS_HP_BASE_KEY = 'icraft_boss_hp_base'

// { base, ratio } of the boss now: its base health, and the amount of this
// script's saved modifier (null when it has none). null when it has no health attribute.
function bossHpState(core, entity) {
  var inst = entity.getAttribute(core.attribute(BOSS_HP_ATTR))
  if (!inst) return null
  var ratio = null
  inst.getModifiers().forEach(function (m) {
    if (ratio === null && String(m.getName()) === BOSS_HP_MODIFIER) ratio = Number(m.getAmount())
  })
  return { base: Number(inst.getBaseValue()), ratio: ratio }
}

function bossHpRememberBase(core, entity) {
  var state = bossHpState(core, entity)
  if (state !== null) entity.persistentData.putDouble(BOSS_HP_BASE_KEY, state.base)
}

// Is the saved multiplier still the one for this boss's base? If not, work it
// out again for the boss as it is now. `fresh` = this is the boss's first spawn.
// Returns what it did (for the tests): 'ok' | 'corrected' | 'gone'.
function bossHpSettle(core, entity, targetHP, fresh) {
  if (!entity || entity.isRemoved() || !entity.isAlive()) return 'gone'
  var state = bossHpState(core, entity)
  if (state === null) return 'ok'
  var data = entity.persistentData
  var max = Number(entity.getMaxHealth())
  // its maximum without the pack's icraft_* modifiers: what its own mod gives it now
  var own = Number(core.attrValueWithout(entity, BOSS_HP_ATTR, 'icraft_', max))
  var have = state.ratio === null ? 0 : state.ratio
  var moved = false
  if (data.contains(BOSS_HP_BASE_KEY)) {
    moved = Math.abs(state.base - Number(data.getDouble(BOSS_HP_BASE_KEY))) > 0.000001
  } else {
    // saved before 2026-10-13. With no other mod's modifier on its health, base x (1 + multiplier) is the designed value or it is wrong.
    if (Math.abs(own - state.base) <= 0.000001) moved = Math.abs(state.base * (1 + have) - targetHP) > 0.01
    if (!moved) data.putDouble(BOSS_HP_BASE_KEY, state.base)
  }
  if (!moved || !(own > 0)) return 'ok'
  var want = (targetHP / own) - 1.0
  var health = Number(entity.getHealth())
  var share = max > 0 ? health / max : 1
  var before = (Math.round(health * 10) / 10) + '/' + (Math.round(max * 10) / 10)
  if (Math.abs(want) <= 0.000001) core.dropModifier(entity, BOSS_HP_ATTR, BOSS_HP_MODIFIER)
  else core.saveModifier(entity, BOSS_HP_ATTR, BOSS_HP_MODIFIER, want, 'multiply_base')
  data.putDouble(BOSS_HP_BASE_KEY, state.base)
  var newMax = Number(entity.getMaxHealth())
  if (fresh) entity.setHealth(newMax)
  else if (share > 0) entity.setHealth((share > 1 ? 1 : share) * newMax)      // dead or dying (share 0): left as it is
  console.log('[boss_hp] designed health corrected on ' + core.entityId(entity) + ': its base health is now ' + (Math.round(state.base * 10) / 10) +
    ', the saved multiplier was ' + (state.ratio === null ? 'none' : '+' + state.ratio) + ', now +' + (Math.round(want * 1000000) / 1000000) + ' for the designed ' + targetHP +
    '; health/max ' + before + ' -> ' + (Math.round(Number(entity.getHealth()) * 10) / 10) + '/' + (Math.round(newMax * 10) / 10) +
    (fresh ? ' (first spawn: full health)' : ' (its share of health kept)'))
  return 'corrected'
}

EntityEvents.spawned(icraft.guard('scaling/boss_hp', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = entity.type
  let targetHP = getBossHP(type)
  if (!targetHP) return

  let core = global.icraft && global.icraft.core
  if (!core) return

  // null = the override is already saved with this boss
  let buff = core.spawnBuff(entity, 'icraft_boss_hp')
  // first spawn: no flag of this script was on the boss (a legacy boss is being repaired, a saved one loads)
  let fresh = !!buff && !buff.legacy
  if (!buff) {
    // Saved, but perhaps for another base: checked now, and again below once the mods have had their turn.
    bossHpSettle(core, entity, targetHP, false)
    bossHpSettleLater(core, entity, targetHP, false)
    return
  }

  // The maximum as this handler sees it on a first spawn, when no icraft_*
  // modifier is on the boss yet: this file loads before the other scaling
  // scripts, and the iridescent_difficulty mod's handler runs after KubeJS's.
  // A boss that is being repaired already carries the mod's saved
  // icraft_diff_hp; counting it would give a different ratio than a fresh
  // spawn gets. With nothing to leave out this is entity.maxHealth itself.
  let currentMax = core.attrValueWithout(entity, 'minecraft:generic.max_health', 'icraft_', entity.maxHealth)

  // Calculate the multiplier needed to reach target HP
  if (currentMax > 0 && currentMax !== targetHP) {
    let ratio = (targetHP / currentMax) - 1.0
    buff.modifier(
      'minecraft:generic.max_health',
      'icraft_boss_hp_override',
      ratio,
      'multiply_base'
    )
    buff.health()
  }

  buff.done()
  bossHpRememberBase(core, entity)
  bossHpSettleLater(core, entity, targetHP, fresh)
}))

// After this join's other handlers: a mod's own join handler runs after
// KubeJS's (1 tick), and some set their numbers on the entity's first tick
// (20 ticks). Only the 1-tick pass may fill a new boss's health: twenty ticks
// in, a player may already have hit it.
function bossHpSettleLater(core, entity, targetHP, fresh) {
  var level = entity.level
  var server = level ? level.server : null
  if (!server) {
    console.warn('[boss_hp] no server to schedule on for ' + core.entityId(entity) + ': the designed health is not re-checked after this join')
    return
  }
  server.scheduleInTicks(1, function () { bossHpSettle(core, entity, targetHP, fresh) })
  server.scheduleInTicks(20, function () { bossHpSettle(core, entity, targetHP, false) })
}

// Designed health = `hp` of the boss registry (kubejs/config/icraft/registry/
// bosses.json, read through icraft.bosses, 0_lib_registry.js). Until 2026-10-13
// the 52 values stood here as BOSS_HP. null = no designed health: the boss
// keeps its mod's own.
function getBossHP(type) {
  return icraft.bosses.hp(type)
}
