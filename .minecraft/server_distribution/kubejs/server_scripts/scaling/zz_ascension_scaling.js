// @file kubejs/server_scripts/scaling/zz_ascension_scaling.js
// @events EntityEvents.spawned
// @after scaling/boss_hp.js  boss_hp works out its ratio from the maximum health at spawn: the ascension multiplier must not be on the mob yet
// =============================================================================
// IridescentCraft — Ascension Mob Scaling (relocated on-spawn handler)
// File: kubejs/server_scripts/scaling/zz_ascension_scaling.js
//
// This is Section 1 of endgame/ascension.js (the on-spawn HP/DMG multiplier),
// MOVED here so its EntityEvents.spawned handler loads AFTER scaling/boss_hp.js.
// The rest of the Ascension feature (player bonuses, chat commands, !ascend
// activation, beacon recipe) stays in endgame/ascension.js — only this
// order-sensitive piece relocates. Shared state (the level lookup + multiplier
// tables) is read from global.ICRAFT_ASCENSION, exposed by endgame/ascension.js.
//
// WHY THE MOVE — the bug this fixes (latent; only bites at ascension level > 0)
//   Ascension applies its mob-HP buff as a MULTIPLY_TOTAL modifier
//   (icraft_asc_hp). boss_hp.js's spawn handler reads entity.maxHealth and adds
//   a MULTIPLY_BASE *ratio* = target/maxHealth − 1 to force a designed boss to a
//   target HP. KubeJS fires EntityEvents.spawned handlers in alphabetical
//   script-LOAD order, and endgame/ sorts BEFORE scaling/ — so in its OLD home
//   ascension ran FIRST. boss_hp then read a maxHealth that ALREADY included
//   ascension's ×ascMult and back-computed a ratio that landed the final value
//   at exactly `target`, SILENTLY CANCELLING the ascension HP buff for every
//   BOSS_HP-table boss (twilightforest:*, cataclysm:*, aether:*, …). Regular
//   mobs + non-BOSS_HP bosses were unaffected (nothing back-computes a ratio
//   from their maxHealth). The damage buff was never affected (no handler
//   derives a ratio from attack_damage).
//
//   Fix: the zz_ prefix loads this LAST in scaling/, AFTER boss_hp.js and
//   boss_progressive.js have read maxHealth and applied their multiply_base.
//   boss_hp now reads the clean, un-ascension-scaled base; ascension's
//   multiply_total then sits cleanly ON TOP (the vanilla attribute system
//   applies every multiply_base before any multiply_total, regardless of insert
//   order), so a BOSS_HP boss ends at target × ascMult — the intended
//   "ascension scales everything, multiplicatively" behaviour. Only boss_hp's
//   spawn-time ratio READ was order-sensitive.
//
//   Identical load-order class + fix as scaling/zz_boss_global_3x.js (the ×3
//   boss buff, 2026-06-27). See internal dev/failure-modes.md §2 +
//   dev/lessons-learned.md (2026-06-27, which flagged THIS handler as the next
//   instance of the class to fix).
//
// THE FIVE ISS CASTERS (necromancer / archevoker / cryomancer / pyromancer / priest)
//   Until 2026-10-19 this handler skipped them (the registry flag `caster`): the belief
//   was that any attribute call on these AbstractSpellCastingMob classes throws an
//   AbstractMethodError no script catch sees. Measured on full-pack rig boots, it
//   does not (decision list entry 9, 2026-10-18): attribute calls work on all five;
//   what throws is an item-slot read (ArchevokerEntity.getItemBySlot), and this
//   handler makes none. DECISION 160 (2026-10-19, the operator: "Drop the skip
//   (Recommended)"): the skip is gone, after a probe ran this WHOLE handler on all
//   five at ascension 3 (core.spawnBuff's persistent flag, the two saved modifiers,
//   health(), done(), entity.monster, core.entityId), saved and reloaded each through
//   NBT and through a chunk unload and load: every caster scaled (hp x1.75, damage
//   x1.6, healed to full, flag 2), kept the buff once through both reloads, and the
//   server ran on with no error. The registry flag `caster` and the other four spawn
//   scripts' guards stay: they read equipment.
//
// SAVED WITH THE MOB (2026-10-12)
//   Both modifiers go on through core.spawnBuff (0_lib_core.js, "spawn buffs")
//   and are PERMANENT. entity.modifyAttribute adds a transient modifier, so as
//   written before this date the buff would have been lost at the first
//   save/load while the 'icraft_asc_scaled' flag stayed (it never bit: the
//   ascension level has never been above 0). Flag 1 = scaled by the old code,
//   scaled again on load at the level of that moment, share of health kept;
//   flag 2 = saved with the mob, nothing to do.
// =============================================================================

// (The four other spawn scripts still skip the registry flag `caster` before any
// item-slot access: on these classes that is the java.lang.Error no script catch
// sees. This handler reads no equipment; see the header.)

EntityEvents.spawned(icraft.guard('scaling/zz_ascension_scaling', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.player) return

  // Scale all hostile mobs AND bosses (ascension affects everything).
  // (the id through core.entityId since 2026-10-13: the same text as `entity.type` for every entity type but the 15
  // Creeper Overhaul creepers, which are monsters and never reach the second test)
  if (!entity.monster && !isHostileModdedAsc(global.icraft.core.entityId(entity))) return

  let core = global.icraft && global.icraft.core
  if (!core) return

  // Skip already-ascension-scaled mobs (prevent double-scaling on chunk reload).
  // null = the scaling is saved with this mob.
  let buff = core.spawnBuff(entity, 'icraft_asc_scaled')
  if (!buff) return

  // Shared level lookup + multiplier tables (set by endgame/ascension.js, which
  // loads first). Absent only if ascension.js failed to load — it logs that.
  let asc = global.ICRAFT_ASCENSION
  if (!asc) return

  let ascension = asc.getLevel(entity.level)
  if (ascension <= 0) return

  let hpMult = asc.HP_MULT[ascension]
  let dmgMult = asc.DMG_MULT[ascension]

  // HP ×ascMult (MULTIPLY_TOTAL — sits on top of boss_hp's multiply_base ratio)
  if (hpMult > 1.0) {
    buff.modifier(
      'minecraft:generic.max_health',
      'icraft_asc_hp',
      hpMult - 1.0,
      'multiply_total'
    )
    buff.health()
  }

  // Damage ×ascMult (MULTIPLY_TOTAL)
  if (dmgMult > 1.0) {
    buff.modifier(
      'minecraft:generic.attack_damage',
      'icraft_asc_dmg',
      dmgMult - 1.0,
      'multiply_total'
    )
  }

  buff.done()
}))

// Modded hostile mobs that may not extend Monster class. Moved VERBATIM from
// endgame/ascension.js — preserves the original ascension scaling set (the five
// irons_spellbooks: casters included since decision 160, 2026-10-19).
function isHostileModdedAsc(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:') ||
         type.startsWith('irons_spellbooks:') ||
         type.startsWith('theabyss:') ||
         type.startsWith('ub:') ||
         type.startsWith('majestic_menaces:')
}

console.log('[iridescent/ascension] mob-scaling spawn handler loaded (runs after boss_hp)')
