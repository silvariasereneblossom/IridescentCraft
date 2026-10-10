// =============================================================================
// ENEMY EXPANSION -- block explosive_launch mob effect on ALL living entities
// =============================================================================
// 2026-04-26 EnemyExpansion audit: the `enemyexpansion:explosive_launch` mob
// effect is a 40-tick fuse (applied by the Crawler / Faller / Intruder collide
// procedure). When it ends, ExplosiveLaunchHappensProcedure:
//   1. Sets a random vertical/diagonal velocity on the entity
//   2. Summons an `invisicreeper` (radius 1-4 explosion) at the entity's
//      position — THIS explosion launches nearby arrows + mobs skyward
//      (chain reaction the user observed: "arrows from these mobs launch
//      each other into the air")
//   3. Applies a CARDIAC effect (DoT) if entity survives
//
// 2026-05-03 EXTENDED to all living entities (players, hostiles, passives):
// mob-on-mob applications otherwise still detonate and launch everything nearby.
//
// 2026-10-10 REWRITE — event-driven DENY (this replaces a 4 Hz scan that never ran).
// The old strategy registered a tick that walked every loaded entity in every
// level and called removeEffect(). Two things were wrong with it:
//   * it was registered as registerServerTick(..., 5, 5): `tick % 5` is never
//     5, so it never fired once in production; and
//   * it would have made things WORSE. The mod runs the launch procedure from
//     MobEffect.removeAttributeModifiers (jar-verified:
//     ExplosiveLaunchMobEffect.m_6386_ -> ExplosiveLaunchHappensProcedure),
//     which vanilla calls on ANY removal — expiry AND removeEffect(). Stripping
//     the effect therefore detonates it immediately instead of defusing it.
// So the effect must never be ADDED. Forge fires MobEffectEvent.Applicable from
// LivingEntity.canBeAffected(), which addEffect() consults first; returning
// Result.DENY there means the instance never enters the entity's effect map,
// so neither the "started" nor the "happens" procedure can run. Zero per-tick
// cost: the handler only runs when some effect is being applied, and compares
// one object reference.
//
// Same hook + DENY idiom as startup_scripts/cap_player_levitation.js (proven in
// production). Registered through the mod-owned ForgeEventRegistry, so a
// /reload replaces the callback instead of stacking a stale listener.
//
// Not covered (by design, negligible): an entity that already carries the
// effect in its saved NBT when this ships finishes that one fuse.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var ResourceLocation_eel = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_eel = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ForgeEventRegistry_eel = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
  var Result_eel = Java.loadClass('net.minecraftforge.eventbus.api.Event$Result')

  var EFFECT_ID = 'enemyexpansion:explosive_launch'
  var HANDLER_ID = 'icraft.explosive_launch_blocker'
  var blockedEffect = null
  try {
    var rl = ResourceLocation_eel.tryParse(EFFECT_ID)
    if (rl) blockedEffect = ForgeRegistries_eel.MOB_EFFECTS.getValue(rl)
  } catch (_) {}

  if (!blockedEffect) {
    // Drop a callback left by an earlier load, if any (mod removed + /reload).
    try { ForgeEventRegistry_eel.unregisterEffectApplicable(HANDLER_ID) } catch (_) {}
    console.log('[explosive_launch_blocker] effect ' + EFFECT_ID +
                ' not registered (mod absent or renamed); handler is a no-op')
  } else {
    ForgeEventRegistry_eel.registerEffectApplicable(HANDLER_ID, function (event) {
      try {
        var inst = event.getEffectInstance()
        if (!inst) return
        // Identity test on the registered MobEffect singleton.
        if (!blockedEffect.equals(inst.getEffect())) return
        event.setResult(Result_eel.DENY)
        // One-time log per session that the blocker is firing — confirms the
        // chain is being broken without spamming on every denial.
        if (!global._exp_launch_blocker_logged) {
          global._exp_launch_blocker_logged = true
          console.log('[explosive_launch_blocker] denied ' + EFFECT_ID +
                      ' on ' + event.getEntity().getType() + ' (first occurrence, logging once)')
        }
      } catch (e) {
        if (!global._exp_launch_blocker_err) {
          global._exp_launch_blocker_err = true
          console.warn('[explosive_launch_blocker] handler threw (logging once): ' + e)
        }
      }
    })
    console.log('[IridescentCraft] enemyexpansion_explosive_launch_blocker loaded (event-driven: ' +
                EFFECT_ID + ' is denied at MobEffectEvent.Applicable for all living entities)')
  }
} catch (e) {
  console.warn('[IridescentCraft] enemyexpansion_explosive_launch_blocker bootstrap FAILED: ' + e)
}
})()
