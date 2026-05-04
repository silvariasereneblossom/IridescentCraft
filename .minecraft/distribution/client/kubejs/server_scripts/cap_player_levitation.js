// =============================================================================
// CAP PLAYER LEVITATION -- block skyward launches via effect amplifier
// =============================================================================
// 2026-05-04: diag_player_launch's effect monitor caught the smoking gun:
//   [01:18:36] [player_effect] effect=minecraft.levitation amp=50 dur=10t
//
// At amp=50 vanilla LivingEntity.travel() targets dy = 0.05 * 51 = 2.55
// blocks/tick (51 blocks/sec UP), lerped over the 10-tick duration. The
// player gets flung out of the world in half a second. Source is almost
// certainly a weapon affix on a mob - only SOME skeletons (etc.) trigger
// it, not all - which means a per-spawn Apotheosis affix / Champions
// modifier / Mahou Tsukai-flavored proc applying the effect on hit.
//
// Knockback ratio cap (cap_player_knockback.js) saved the horizontal
// portion of the same hit (mag 6.00 -> 1.0), but the Levitation effect
// goes through MobEffectEvent, not LivingKnockBackEvent, so it bypassed
// that defense entirely.
//
// Defensive fix: cancel `minecraft:levitation` effect application on
// Players when amplifier exceeds MAX_AMP. Vanilla Shulker applies amp 0
// for 10s, Shulker Bullet's max is amp 1; anything above MAX_AMP is a
// mod proc. Cancelling at the Applicable stage prevents the effect from
// ever entering the player's active-effects list, so the per-tick
// LivingEntity.travel() never sees it.
//
// Per-attacker dedup on logging so a barrage doesn't spam.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} in try blocks),
// feedback_kubejs_event_scope.md (server_scripts only for Forge events).
// =============================================================================

try {
  var MinecraftForge_lev = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var MobEffectEventApplicable = Java.loadClass('net.minecraftforge.event.entity.living.MobEffectEvent$Applicable')
  var EventPriority_lev = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_lev = Java.loadClass('java.util.function.Consumer')
  var Player_lev = Java.loadClass('net.minecraft.world.entity.player.Player')

  // Vanilla max we know of: Shulker Bullet applies amp 1. Some custom
  // KubeJS effects may use higher amps for legitimate gameplay (rare),
  // so 5 leaves headroom while still blocking the amp=50 launch by a
  // factor of 10. If a real use case for amp >= 6 exists, raise this.
  var MAX_AMP = 5

  var handler = new Consumer_lev({
    accept: function(event) {
      try {
        var v = event.getEntity()
        if (!(v instanceof Player_lev)) return

        var inst = event.getEffectInstance()
        if (!inst) return

        var effect = inst.getEffect()
        if (!effect) return

        // getDescriptionId returns "effect.minecraft.levitation".
        var rawId = String(effect.getDescriptionId ? effect.getDescriptionId() : effect)
        if (rawId !== 'effect.minecraft.levitation') return

        var amp = 0
        try { amp = inst.getAmplifier() } catch (_) {}

        if (amp <= MAX_AMP) return

        // Block it. MobEffectEvent.Applicable is a Result-style event in
        // Forge - setResult(DENY) is the canonical "don't apply".
        try {
          var Result = Java.loadClass('net.minecraftforge.eventbus.api.Event$Result')
          event.setResult(Result.DENY)
        } catch (_) {
          // Fall back to setCanceled if Result enum isn't reachable in
          // this KubeJS class filter. Some Forge events accept either.
          try { event.setCanceled(true) } catch (_) {}
        }

        // Per-amp-bucket dedup so a single fight doesn't spam logs.
        var bucket = amp >= 50 ? '50+' : (amp >= 10 ? '10-49' : '6-9')
        if (!global._lev_cap_seen) global._lev_cap_seen = {}
        if (!global._lev_cap_seen[bucket]) {
          global._lev_cap_seen[bucket] = true
          var dur = 0
          try { dur = inst.getDuration() } catch (_) {}
          console.log('[levitation_cap] BLOCKED levitation amp=' + amp +
                      ' dur=' + dur + 't (bucket=' + bucket +
                      ', max allowed=' + MAX_AMP + ')')
        }
      } catch (e) {
        try { console.warn('[levitation_cap] handler threw: ' + e) } catch (_) {}
      }
    }
  })

  // NORMAL priority -- run after handlers that compute the amp, before
  // handlers that consume it.
  MinecraftForge_lev.EVENT_BUS.addListener(EventPriority_lev.NORMAL, false,
                                           MobEffectEventApplicable, handler)
  console.log('[IridescentCraft] cap_player_levitation loaded (max amp=' +
              MAX_AMP + ')')
} catch (e) {
  console.warn('[IridescentCraft] cap_player_levitation bootstrap FAILED: ' + e)
}
