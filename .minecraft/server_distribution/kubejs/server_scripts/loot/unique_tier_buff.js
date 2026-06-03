// =============================================================================
// UNIQUE TIER BUFF — Simply Swords + Too Many Bows tier-scaled damage
// =============================================================================
// Operator (2026-06-03): buff both unique itemsets, scaled by tier —
//   T1 +10%  T2 +20%  T3 +30%  T4 +40%   (global.ICRAFT_TIER_DMG_MULT)
//
// Mechanism = the pack's DamageModifierRegistry (raw Forge LivingHurtEvent), the
// same lever ss_unique_spellsword_scaling.js uses. One handler covers BOTH:
//   - MELEE (SS swords): the attacker's mainhand item is the weapon at hit time.
//   - RANGED (TMB bows): the bow isn't in hand when the arrow lands, so we tag
//     the arrow with the FIRING BOW'S ID at spawn (EntityEvents.spawned, reading
//     the shooter's drawn bow) and the damage handler reads that id off the
//     source's direct entity (the arrow) and looks the tier up in the registry.
//     Works for vanilla AND TMB custom arrow entities. The same `icraft_uniq_bow`
//     tag also drives tmb_plain_bow_effects.js.
//
// Reads global.ICRAFT_UNIQUE_ITEMS / ICRAFT_TIER_DMG_MULT lazily inside the
// callbacks, so script load order is irrelevant.
// =============================================================================

// ---- Arrow tagging: stamp the firing bow's ID onto its projectile ----
try {
  var ProjectileClass = Java.loadClass('net.minecraft.world.entity.projectile.Projectile')

  EntityEvents.spawned(function (event) {
    try {
      var proj = event.entity
      if (!proj || !(proj instanceof ProjectileClass)) return
      var owner = proj.owner
      if (!owner) return
      var items = global.ICRAFT_UNIQUE_ITEMS
      if (!items) return
      var heldId = null
      try { var m = owner.mainHandItem; if (m && !m.isEmpty() && items[String(m.id)]) heldId = String(m.id) } catch (e) {}
      if (!heldId) { try { var o = owner.offhandItem; if (o && !o.isEmpty() && items[String(o.id)]) heldId = String(o.id) } catch (e) {} }
      if (heldId && items[heldId].kind === 'bow') {
        proj.persistentData.putString('icraft_uniq_bow', heldId)
      }
    } catch (e) {}
  })
  console.log('[unique_tier_buff] arrow tagger armed (Projectile spawn -> bow-id tag)')
} catch (e) {
  console.error('[unique_tier_buff] arrow tagger init failed: ' + e)
}

// ---- Damage handler: apply the tier multiplier (melee sword OR tagged arrow) ----
try {
  var DR_uniq = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')

  DR_uniq.register('icraft.unique_tier_buff', function (event) {
    try {
      var items = global.ICRAFT_UNIQUE_ITEMS
      var mult = global.ICRAFT_TIER_DMG_MULT
      if (!items || !mult) return
      var src = event.source
      if (!src) return
      var attacker = src.entity        // shooter (ranged) / attacker (melee)
      var direct = src.directEntity    // arrow (ranged) / attacker (melee)
      var tier = 0

      // RANGED: the direct entity is a tagged projectile (and not the attacker)
      if (direct && direct !== attacker) {
        try {
          var pd = direct.persistentData
          if (pd && pd.contains('icraft_uniq_bow')) {
            var meta = items[String(pd.getString('icraft_uniq_bow'))]
            if (meta) tier = meta.tier
          }
        } catch (e) {}
      }

      // MELEE: a direct hit (direct == attacker) with an SS sword in mainhand
      if (tier === 0 && attacker && (!direct || direct === attacker)) {
        try {
          var stack = attacker.mainHandItem
          if (stack && !stack.isEmpty()) {
            var sm = items[String(stack.id)]
            if (sm && sm.kind === 'sword') tier = sm.tier
          }
        } catch (e) {}
      }

      if (tier >= 1 && mult[tier]) {
        event.amount = event.amount * mult[tier]
      }
    } catch (e) {
      console.warn('[unique_tier_buff] damage handler threw: ' + e)
    }
  })
  console.log('[unique_tier_buff] tier-scaled damage handler registered (T1..T4 = 10/20/30/40%)')
} catch (e) {
  console.error('[unique_tier_buff] damage handler init failed: ' + e)
}
