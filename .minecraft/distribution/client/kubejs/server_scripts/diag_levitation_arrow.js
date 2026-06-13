// =============================================================================
// TEMPORARY DIAGNOSTIC #104 (v2 -- STACK TRACE) -- name the SOURCE of the
// amp-50 levitation "launch" (the skeleton-kb / skyward-launch bug).
// (filename is legacy "arrow"; v1 PROVED it is NOT an arrow -- see below.)
// =============================================================================
// v1 (arrow-correlation, replaced by this) captured in the live server log:
//     levitation amp=50 dur=10t on enemyexpansion:direwolf  proj=UNKNOWN
//   => NOT a projectile/arrow; a DIRECT/melee/aura/area effect, and it hit a
//      non-player mob (indiscriminate source).
// A full decompile sweep (EnemyExpansion, Majrusz lib+difficulty, Apotheosis,
// + 14 more jars + the whole config/datapack/script tree, 2026-06-13) then
// PROVED amp-50 levitation is hardcoded NOWHERE:
//   - EnemyExpansion: zero vanilla-LEVITATION refs (its launches are velocity).
//   - Majrusz: levitation amplifier hard-clamped to 0..10; amp-50 impossible.
//   - no `new MobEffectInstance(LEVITATION, *, 50)` anywhere; no config amp 50.
// => the amplifier is COMPUTED AT RUNTIME -- almost certainly an UNCLAMPED
//    incrementing reapply (re-adds levitation every few ticks at amp+1, which
//    also explains dur=10t: it refreshes faster than it expires while climbing).
//
// v2 instrument: MobEffectEvent.Applicable fires synchronously INSIDE
// LivingEntity.addEffect, so the Java stack at that moment names the class that
// called addEffect -- the injector. On any levitation with amplifier >= 10
// (normal levitation is 0-3; Majrusz caps at 10; so >=10 is unambiguously the
// bug), dump the top stack frames. Deduped by (amp, top-frames signature) so it
// logs each distinct source ONCE. The culprit's mod package will be in the trace
// (e.g. some_mod.entity.FooMob.tick / AreaEffectCloud.tick / a spell cast / a
// KubeJS script frame). REMOVE THIS FILE after one capture.
//
// Memory: feedback_rhino_scoping (var fns in IIFE), feedback_kubejs_event_scope
// (server-side Forge events), feedback_jar_audit (static exhausted -> instrument).
// =============================================================================

;(function () {
  var ForgeEventRegistry, ThreadClass
  try {
    ForgeEventRegistry = Java.loadClass('com.iridescentcraft.reforging.event.ForgeEventRegistry')
    ThreadClass = Java.loadClass('java.lang.Thread')
  } catch (e) {
    console.error('[diag-lev-src] init failed: ' + e); return
  }

  if (!global._diagLevSrcSeen) global._diagLevSrcSeen = {}

  var typeId = function (e) {
    try { return String(e.getType().builtInRegistryHolder().key().location()) }
    catch (_) { try { return String(e.getType()) } catch (__) { return '?' } }
  }

  // Frames we don't care about (the plumbing between addEffect and our handler).
  var isNoise = function (cn) {
    return cn.indexOf('java.') === 0 ||
           cn.indexOf('jdk.') === 0 ||
           cn.indexOf('sun.') === 0 ||
           cn.indexOf('net.minecraftforge.eventbus') === 0 ||
           cn.indexOf('com.iridescentcraft.reforging.event.ForgeEventRegistry') === 0 ||
           cn.indexOf('diag_levitation') >= 0 ||
           cn.indexOf('dev.latvian.mods') === 0   // KubeJS/Rhino dispatch internals
  }

  ForgeEventRegistry.registerEffectApplicable('icraft.diag_lev_src', function (event) {
    try {
      var inst = event.getEffectInstance(); if (!inst) return
      var eff = inst.getEffect(); if (!eff) return
      if (String(eff.getDescriptionId ? eff.getDescriptionId() : eff) !== 'effect.minecraft.levitation') return
      var amp = 0; try { amp = inst.getAmplifier() } catch (_) {}
      if (amp < 10) return  // ignore normal levitation; >=10 is the bug

      var v = event.getEntity()
      var dur = 0; try { dur = inst.getDuration() } catch (_) {}

      // Capture the call stack: the frame that called addEffect is the injector.
      var frames = ThreadClass.currentThread().getStackTrace()
      var shown = []
      var sig = ''
      for (var i = 0; i < frames.length && shown.length < 22; i++) {
        var cn = String(frames[i].getClassName())
        if (isNoise(cn)) continue
        var line = cn + '.' + String(frames[i].getMethodName()) +
                   '(' + String(frames[i].getFileName()) + ':' + frames[i].getLineNumber() + ')'
        shown.push(line)
        if (sig.length < 240) sig += cn + '.' + String(frames[i].getMethodName()) + '|'
      }

      var key = 'amp' + amp + '|' + sig
      if (global._diagLevSrcSeen[key]) return
      global._diagLevSrcSeen[key] = true

      console.warn('[DIAG-LEV-SRC] ===== levitation amp=' + amp + ' dur=' + dur +
                   't on ' + (v ? typeId(v) : '?') + ' -- INJECTOR STACK: =====')
      for (var j = 0; j < shown.length; j++) {
        console.warn('[DIAG-LEV-SRC]   #' + j + '  ' + shown[j])
      }
      console.warn('[DIAG-LEV-SRC] ===== end stack (paste these lines back) =====')
    } catch (e) { console.warn('[DIAG-LEV-SRC] threw: ' + e) }
  })

  console.log('[diag-lev-src] armed (TEMPORARY #104 v2 -- stack-trace on levitation amp>=10; remove after one capture)')
})()
