// =============================================================================
// DAMAGE_VS_UNDEAD ATTRIBUTE BONUS
// Place in: kubejs/startup_scripts/deathskin_undead_bonus.js
// =============================================================================
//
// Multiplies outgoing damage to undead targets by (1 + attacker's
// iridescent_reforging:damage_vs_undead attribute value). The attribute
// is registered in Java (com.iridescentcraft.reforging.attribute.
// IcraftAttributes) so it shows in the standard "When equipped: +X.X
// Damage vs Undead" tooltip line automatically -- no mixin needed.
//
// Material sources of the attribute (as of 2026-05-13):
//   tetra:skin/deathskin (rotten_flesh) +0.05 = +5% damage vs undead
// Future materials/items can grant this attribute via their material
// JSON `attributes` map (key `iridescent_reforging:damage_vs_undead`).
//
// Stacking: standard Forge attribute math. ADDITION ops sum, MULTIPLY_BASE
// scales, MULTIPLY_TOTAL multiplies the running total. For a player
// wearing 4 deathskin pieces, the attribute sums to 0.20 = +20% (each
// piece contributes the variant primaryAttributes + material attributes).
//
// Why event-driven and not pure attribute: vanilla doesn't have a
// "damage vs mob-type" attribute system. The attribute stores the
// bonus value (visible in tooltip), the LivingHurtEvent applies it.

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var DamageModifierRegistry_ds = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var LivingEntity_ds = Java.loadClass('net.minecraft.world.entity.LivingEntity')
  var MobType_ds = Java.loadClass('net.minecraft.world.entity.MobType')
  var ResourceLocation_ds = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_ds = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  // Resolve the attribute lazily (Forge registry is populated by the time
  // server events fire, but the script bootstraps at KubeJS load time).
  var damageVsUndeadAttr = null
  var resolveAttr = function() {
    if (damageVsUndeadAttr) return damageVsUndeadAttr
    try {
      damageVsUndeadAttr = ForgeRegistries_ds.ATTRIBUTES.getValue(
        new ResourceLocation_ds('iridescent_reforging', 'damage_vs_undead'))
    } catch (e) {}
    return damageVsUndeadAttr
  }

  var handlerWarned = false
  var handler = function(event) {
      try {
        // Secondary damage (splash / chain / reflect dealt through
        // icraft.core.dealDamage) lands as-is: it is not multiplied a second
        // time. Same rule as every onHurt handler (0_lib_core.js) and the same
        // first line as the two Vorpal handlers. Ruling 13, 2026-10-14
        // (decision list entry 68): until that day this bonus was the one that
        // multiplied it (a secondary hit of 9 on a zombie became 10.8).
        try {
          var coreLib = global.icraft ? global.icraft.core : null
          if (coreLib && typeof coreLib.secondary === 'function' && coreLib.secondary(event.getEntity())) return
        } catch (eSecondary) { /* swallow-ok: the core library could not be asked (it is a server-script library, absent while a startup script loads and on a client); the hit is then taken as a primary one, as every hit was before this test */ }
        var target = event.getEntity()
        if (!target || !(target instanceof LivingEntity_ds)) return
        if (target.getMobType() !== MobType_ds.UNDEAD) return

        // [2026-10-11] KubeJS exposes DamageSource.getEntity() to scripts as
        // getActual() (@RemapForJS on its DamageSourceMixin). `source.getEntity()`
        // does not exist here: it threw on every hit against an undead target,
        // inside the catch below, so the bonus had never been applied.
        var source = event.getSource()
        var attacker = source ? source.getActual() : null
        if (!attacker || !(attacker instanceof LivingEntity_ds)) return

        var attr = resolveAttr()
        if (!attr) return

        var bonus = attacker.getAttributeValue(attr)
        if (bonus <= 0) return

        var amount = event.getAmount()
        event.setAmount(amount * (1.0 + bonus))

        if (!global._deathskin_seen) {
          global._deathskin_seen = true
          console.log('[deathskin] damage_vs_undead=+' + (bonus * 100).toFixed(1) +
                      '% applied (logging once; target=' + target.getType().toString() +
                      ' damage=' + amount.toFixed(2) +
                      ' -> ' + (amount * (1.0 + bonus)).toFixed(2) + ')')
        }
      } catch (e) {
        // Fail-soft, but not silent: say so once per load.
        if (!handlerWarned) {
          handlerWarned = true
          console.warn('[deathskin] damage_vs_undead handler threw (logged once): ' + e)
        }
      }
  }

  DamageModifierRegistry_ds.register('icraft.deathskin_undead_bonus', icraft.handler('deathskin_undead_bonus', 'DamageModifierRegistry.register', handler))
  console.log('[IridescentCraft] deathskin_undead_bonus loaded (attribute-driven)')
} catch (e) {
  console.warn('[IridescentCraft] deathskin_undead_bonus bootstrap FAILED: ' + e)
}
})()
