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
// =============================================================================

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
  if (!buff) return

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
}))

// Designed health = `hp` of the boss registry (kubejs/config/icraft/registry/
// bosses.json, read through icraft.bosses, 0_lib_registry.js). Until 2026-10-13
// the 52 values stood here as BOSS_HP. null = no designed health: the boss
// keeps its mod's own.
function getBossHP(type) {
  return icraft.bosses.hp(type)
}
