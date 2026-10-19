// @file kubejs/server_scripts/scaling/zz_ascension_scaling.js
// @events EntityEvents.spawned
// @registry bosses
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
// ISS CRASH GUARD (bundled — pre-existing latent crash closed during the move)
//   The original handler's hostile set includes the irons_spellbooks: namespace,
//   so at ascension > 0 it would call modifyAttribute on the ISS
//   AbstractSpellCastingMob casters (necromancer / archevoker / cryomancer /
//   pyromancer / priest) — whose abstract slot methods throw AbstractMethodError
//   (UNCATCHABLE by Rhino try/catch) → SERVER CRASH. We skip exactly those 5
//   before any attribute access (same precise exclude as zz_boss_global_3x.js
//   BOSS_3X_EXCLUDES / mob_scaling_unified.js BROKEN_ENTITIES; since 2026-10-13
//   the flag `caster` of the boss registry, one list for all five scripts). The safe ISS
//   bosses (dead_king / fire_boss / citadel_keeper) still scale — modifyAttribute
//   on them is proven safe (zz_boss_global_3x scales them in production). resId
//   is resolved via the shared 0_iss_guard helper (handles entity.type's
//   translation-key-form trap).
//   MEASURED 2026-10-18 (full-pack rig boot, decision list entry 9): the premise is
//   wrong for attribute calls. On all five casters getAttribute, addPermanentModifier,
//   KubeJS modifyAttribute and getAttributeValue work; what throws the uncatchable
//   AbstractMethodError is an item-slot read (ArchevokerEntity.getItemBySlot), and
//   this handler makes none. The skip is KEPT: Ascension has never run (level 0),
//   so dropping it would extend a feature that has never run; it is on the
//   decision list (recommendation: drop it, so the casters scale like every other
//   hostile once Ascension runs, as zz_boss_global_3x already does).
//
// SAVED WITH THE MOB (2026-10-12)
//   Both modifiers go on through core.spawnBuff (0_lib_core.js, "spawn buffs")
//   and are PERMANENT. entity.modifyAttribute adds a transient modifier, so as
//   written before this date the buff would have been lost at the first
//   save/load while the 'icraft_asc_scaled' flag stayed (it never bit: the
//   ascension level has never been above 0). Flag 1 = scaled by the old code,
//   scaled again on load at the level of that moment, share of health kept;
//   flag 2 = saved with the mob, nothing to do. The five casters above are
//   still skipped before anything here touches them.
// =============================================================================

// The five Iron's Spellbooks casters these spawn scripts must not touch are the
// entries of the boss registry (kubejs/config/icraft/registry/bosses.json) with
// the flag `caster`: icraft.bosses.has(id, 'caster'). Until 2026-10-13 the five
// ids stood here, and in four other scripts, each "kept in sync" by hand.
// The reason is unchanged: on these classes an item-slot or NBT access throws a
// java.lang.Error (AbstractMethodError), which no script catch sees, so the
// test has to come BEFORE any such access.

EntityEvents.spawned(icraft.guard('scaling/zz_ascension_scaling', 'EntityEvents.spawned', event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  if (entity.player) return

  // Skip the crash-prone ISS casters BEFORE any attribute access (see header).
  // resId via the shared 0_iss_guard resolver (safe static registry lookup even
  // on the broken entities); fail-open to '' if the helper is somehow absent.
  let resId = global.icraftIssResId ? global.icraftIssResId(entity) : ''
  if (icraft.bosses.has(resId, 'caster')) return

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
// endgame/ascension.js — preserves the original ascension scaling set (the 5
// broken irons_spellbooks: casters are filtered out above, before this runs).
function isHostileModdedAsc(type) {
  return type.startsWith('cataclysm:') ||
         type.startsWith('meetyourfight:') ||
         type.startsWith('stalwart_dungeons:') ||
         type.startsWith('irons_spellbooks:') ||
         type.startsWith('theabyss:') ||
         type.startsWith('ub:') ||
         type.startsWith('majestic_menaces:')
}

console.log('[iridescent/ascension] mob-scaling spawn handler loaded (runs after boss_hp; ISS-caster crash-guarded)')
