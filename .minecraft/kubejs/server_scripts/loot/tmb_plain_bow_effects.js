// =============================================================================
// TMB PLAIN-BOW THEME EFFECTS — wire effects onto the bare ModBowItem bows
// =============================================================================
// Audit (tmb-ss-unique-effect-audit.md): ~30 TMB bows ship a dedicated *Bow/*Arrow
// class with a mod-native theme effect; a few fall back to the generic ModBowItem
// with NO behavior. Operator (2026-06-03): "buff/wire effects that match the
// item's theme." These five get a modest, theme-matched on-hit effect.
// (Was six: `arcforge` — Glowing 6s + Weakness 4s — was dropped 2026-10-10
// because Too Many Bows 4.0.1 never registers that item; see
// unique_itemset_registry.js.)
//
// Keyed off the `icraft_uniq_bow` arrow tag set in unique_tier_buff.js (the same
// spawn tag the buff uses), read off the LivingHurtEvent's direct entity (arrow).
// registerLate so it runs after the damage multiplier. Effects are deliberately
// modest (short debuffs / small self-heal) — flavor, not power spikes.
//
//   dark_bow        (shadow)  -> Blindness 4s + Weakness 5s
//   cyroheart_bow   (cryo)    -> Slowness II 5s + freeze ramp (+120 frozen ticks)
//   necro_flame_bow (necro)   -> Wither 4s + ignite 4s
//   aethers_call    (sky/holy)-> Levitation 2s on target + heal shooter 1 heart
//   demons_grasp    (demon)   -> Weakness 5s + yank the target toward the shooter
// =============================================================================

try {
  var MobEffectInstance = Java.loadClass('net.minecraft.world.effect.MobEffectInstance')
  var MobEffects = Java.loadClass('net.minecraft.world.effect.MobEffects')
  var LivingEntityClass = Java.loadClass('net.minecraft.world.entity.LivingEntity')
  var DR_eff = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')

  var eff = function (target, effect, secs, amp) {
    try { target.addEffect(new MobEffectInstance(effect, Math.round(secs * 20), amp)) } catch (e) {}
  }

  DR_eff.registerLate('icraft.tmb_plain_bow_effects', function (event) {
    try {
      var src = event.source; if (!src) return
      // In scripts DamageSource.getDirectEntity() is `immediate` and getEntity() is `actual`
      // (KubeJS @RemapForJS); `src.directEntity` was undefined, so this returned on every hit
      // and no bow effect ever fired until 2026-10-11.
      var core = global.icraft && global.icraft.core
      var direct = core ? core.direct(src) : src.immediate; if (!direct) return
      var pd
      try { pd = direct.persistentData } catch (e) { return }
      if (!pd || !pd.contains('icraft_uniq_bow')) return
      var bow = String(pd.getString('icraft_uniq_bow'))
      var victim = event.entity
      if (!victim || !(victim instanceof LivingEntityClass)) return
      var attacker = core ? core.attacker(src) : src.actual

      if (bow === 'too_many_bows:dark_bow') {
        eff(victim, MobEffects.BLINDNESS, 4, 0); eff(victim, MobEffects.WEAKNESS, 5, 0)

      } else if (bow === 'too_many_bows:cyroheart_bow') {
        eff(victim, MobEffects.MOVEMENT_SLOWDOWN, 5, 1)
        try { victim.setTicksFrozen((victim.getTicksFrozen ? victim.getTicksFrozen() : 0) + 120) } catch (e) {}

      } else if (bow === 'too_many_bows:necro_flame_bow') {
        eff(victim, MobEffects.WITHER, 4, 0)
        try { victim.setRemainingFireTicks(80) } catch (e) {}

      } else if (bow === 'too_many_bows:aethers_call') {
        eff(victim, MobEffects.LEVITATION, 2, 0)
        try { if (attacker && (attacker instanceof LivingEntityClass)) attacker.heal(2.0) } catch (e) {}

      } else if (bow === 'too_many_bows:demons_grasp') {
        eff(victim, MobEffects.WEAKNESS, 5, 0)
        try {
          if (attacker) {
            var dx = attacker.getX() - victim.getX()
            var dy = attacker.getY() - victim.getY()
            var dz = attacker.getZ() - victim.getZ()
            var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
            var s = 0.55
            // setMotion: Entity.setDeltaMovement(x, y, z) is renamed for scripts (KubeJS
            // @RemapForJS), so the old call threw into the empty catch and the pull
            // never happened (2026-10-11).
            victim.setMotion(dx / len * s, dy / len * s + 0.1, dz / len * s)
            victim.hurtMarked = true
          }
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[tmb_plain_bow_effects] handler threw: ' + e)
    }
  })
  console.log('[tmb_plain_bow_effects] wired theme effects for 5 plain TMB bows')
} catch (e) {
  console.error('[tmb_plain_bow_effects] init failed: ' + e)
}
