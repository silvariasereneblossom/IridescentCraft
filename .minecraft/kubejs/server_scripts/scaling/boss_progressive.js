// =============================================================================
// IridescentCraft — Per-Kill Boss Scaling (Modded Bosses)
// File: kubejs/server_scripts/scaling/boss_progressive.js
//
// Design Doc Part II: Progressive Bosses Configuration
//
// Progressive Bosses mod only handles Wither/Dragon/Elder Guardian.
// This script provides the same per-kill scaling for ALL modded bosses.
//
// Scaling is PER-WORLD (global kill counter, not per-player).
// Uses level.persistentData to track kill counts.
//
// Per-Kill Table (Design Doc):
//   Kill 1:   Base
//   Kill 2:   +15% HP, +10% DMG, +3% SPD
//   Kill 3:   +30% HP, +20% DMG, +5% SPD
//   Kill 5:   +50% HP, +35% DMG, +8% SPD
//   Kill 10:  +100% HP, +60% DMG, +12% SPD
//   Kill 15+: +150% HP (cap), +80% DMG (cap), +15% SPD (cap)
//
// SAVED WITH THE BOSS (2026-10-12)
//   The three modifiers go on through core.spawnBuff (0_lib_core.js, "spawn
//   buffs") and are PERMANENT. Until this date they were transient
//   (entity.modifyAttribute) and lost at the first save/load while the
//   'icraft_prog_scaled' flag stayed. A boss in that state (flag 1) is scaled
//   again when it loads, by the kill count of THAT moment (the count it
//   spawned under was never stored), and keeps its share of health; flag 2 =
//   saved with the boss, nothing to do.
// =============================================================================

// ─── Spawn: Apply scaling based on current kill count ───
EntityEvents.spawned(icraft.guard('scaling/boss_progressive', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = global.icraft.core.entityId(entity)
  if (!isScalableBoss(type)) return

  let core = global.icraft && global.icraft.core
  if (!core) return

  // null = the scaling is already saved with this boss
  let buff = core.spawnBuff(entity, 'icraft_prog_scaled')
  if (!buff) return

  let kills = getKillCount(event.level, type)
  if (kills <= 0) return  // First encounter — base stats (already set by boss_hp.js)

  let scale = getProgressiveScale(kills)

  if (scale.hp > 0) {
    buff.modifier('minecraft:generic.max_health', 'icraft_prog_hp', scale.hp, 'multiply_base')
    buff.health()
  }
  if (scale.dmg > 0) {
    buff.modifier('minecraft:generic.attack_damage', 'icraft_prog_dmg', scale.dmg, 'multiply_base')
  }
  if (scale.spd > 0) {
    buff.modifier('minecraft:generic.movement_speed', 'icraft_prog_spd', scale.spd, 'multiply_base')
  }

  buff.done()
}))

// ─── Kill: Increment kill counter ───
EntityEvents.death(icraft.guard('scaling/boss_progressive', 'EntityEvents.death', event => {
  let entity = event.entity
  if (!entity || !entity.living) return

  let type = global.icraft.core.entityId(entity)
  if (!isScalableBoss(type)) return

  incrementKillCount(event.level, type)
}))

// ─── Progressive Scale Lookup ───
function getProgressiveScale(kills) {
  // Interpolated from design doc table
  if (kills >= 15) return { hp: 1.50, dmg: 0.80, spd: 0.15 }
  if (kills >= 10) return { hp: 1.00, dmg: 0.60, spd: 0.12 }
  if (kills >= 7)  return { hp: 0.75, dmg: 0.48, spd: 0.10 }
  if (kills >= 5)  return { hp: 0.50, dmg: 0.35, spd: 0.08 }
  if (kills >= 3)  return { hp: 0.30, dmg: 0.20, spd: 0.05 }
  if (kills >= 2)  return { hp: 0.15, dmg: 0.10, spd: 0.03 }
  return { hp: 0, dmg: 0, spd: 0 }
}

// ─── Kill Count Storage ───
// Uses overworld's persistentData as the global store
function getKillCount(level, entityType) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return 0

  let data = overworld.persistentData
  let key = 'icraft_boss_kills'
  if (!data.contains(key)) return 0

  let kills = data.getCompound(key)
  let safeType = entityType.replace(':', '_')
  return kills.contains(safeType) ? kills.getInt(safeType) : 0
}

function incrementKillCount(level, entityType) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return

  let data = overworld.persistentData
  let key = 'icraft_boss_kills'
  if (!data.contains(key)) {
    data.put(key, {})
  }

  let kills = data.getCompound(key)
  let safeType = entityType.replace(':', '_')
  let current = kills.contains(safeType) ? kills.getInt(safeType) : 0
  kills.putInt(safeType, current + 1)

  // Log for server operators
  console.log(`[IridescentCraft] Boss killed: ${entityType} (total: ${current + 1})`)
}

// ─── Scalable Boss Registry ───
// The roster is the flag `perKill` of the boss registry (kubejs/config/icraft/
// registry/bosses.json); it excludes Wither/Dragon/Elder Guardian (handled by
// the Progressive Bosses mod).
//
// PER-KILL SCALING IS OFF, and has never run. Until 2026-10-13 this function
// asked `new Set([...]).has(entity.type)`: entity.type is a Java string, which
// a Set never matches on this engine, so no boss was ever scaled and no kill
// was ever counted. The registry reader normalises ids, so asking it would
// have switched the feature ON (a world-wide counter per boss type: +15% health
// from the second kill, up to +150%). That is an operator decision, not a
// refactor: the registry carries the switch ("switches": { "perKill" }), it is
// off, and this function answers false exactly as before. To switch it on,
// set "on": true there.
function isScalableBoss(type) {
  if (!icraft.bosses.enabled('perKill')) return false
  return icraft.bosses.has(type, 'perKill')
}
