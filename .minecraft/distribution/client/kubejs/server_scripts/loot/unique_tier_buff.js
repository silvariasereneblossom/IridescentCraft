// @file kubejs/server_scripts/loot/unique_tier_buff.js
// @events EntityEvents.spawned, hurt
// @live unique-tier-buff
// =============================================================================
// UNIQUE TIER BUFF — Simply Swords + Too Many Bows tier-scaled damage
// =============================================================================
// Operator (2026-06-03): buff both unique itemsets, scaled by tier —
//   T1 +10%  T2 +20%  T3 +30%  T4 +40%   (global.ICRAFT_TIER_DMG_MULT)
//
// Mechanism = the raw Forge LivingHurtEvent, through the shared hurt dispatcher of
// 0_lib_core.js (the same lever ss_unique_spellsword_scaling.js uses). One handler
// covers BOTH:
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

  EntityEvents.spawned(icraft.guard('loot/unique_tier_buff', 'EntityEvents.spawned', function (event) {
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
  }))
  console.log('[unique_tier_buff] arrow tagger armed (Projectile spawn -> bow-id tag)')
} catch (e) {
  console.error('[unique_tier_buff] arrow tagger init failed: ' + e)
}

// ---- Damage handler: apply the tier multiplier (melee sword OR tagged arrow) ----
// Until 2026-10-13 it sat straight on the Java damage registry, which runs its entries
// in the HASH order of their keys: this one ran after the dispatcher's handlers, after
// the startup script's deathskin bonus, the Blazeborn bonus, the armour clamp and
// Arcane Cleave (an ADDITION: the multiplier applies to it), and before the class
// passives and the Enderian bonus. `place: 'last'` holds that place (the order inside
// it is the library's list PLACED). `cancelled`: it is still called for a hit an earlier
// handler cancelled, as it was. `unchecked`: the amount it hands on is left as it is.
// `who` is 'any': a tagged arrow whose shooter is gone has no attacker, and a MOB that
// holds one of these swords gets the multiplier too (both measured).
// An option taken off, or added, changes damage numbers: decision list entry 45; the
// hit table that holds this handler is dev/engine-tests, suite `hit-table`.
try {
  if (icraft.lib.need('core', 'loot/unique_tier_buff')) global.icraft.core.onHurt('icraft.unique_tier_buff', function (event) {
    try {
      // Secondary damage (splash / chain / reflect dealt through icraft.core.dealDamage)
      // lands as-is: it must not proc or be multiplied a second time. Same rule the
      // shared dispatcher applies to every onHurt handler (0_lib_core.js, RE-ENTRANCY).
      if (global.icraft && global.icraft.core && global.icraft.core.secondary && global.icraft.core.secondary(event.entity)) return
      var items = global.ICRAFT_UNIQUE_ITEMS
      var mult = global.ICRAFT_TIER_DMG_MULT
      if (!items || !mult) return
      var src = event.source
      if (!src) return
      // KubeJS renames DamageSource.getEntity() -> getActual() and getDirectEntity() ->
      // getImmediate() for scripts (@RemapForJS; javap on kubejs 2001.6.5): `src.entity` and
      // `src.directEntity` are undefined, which kept this handler inert until 2026-10-11.
      var core = global.icraft && global.icraft.core
      var attacker = core ? core.attacker(src) : src.actual   // shooter (ranged) / attacker (melee)
      var direct = core ? core.direct(src) : src.immediate    // arrow (ranged) / attacker (melee)
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
        // liveness: a hit with a unique weapon (or its tagged arrow) was multiplied
        icraft.live.fired('unique-tier-buff')
      }
    } catch (e) {
      console.warn('[unique_tier_buff] damage handler threw: ' + e)
    }
  }, 'any', { place: 'last', cancelled: true, unchecked: true })
  console.log('[unique_tier_buff] tier-scaled damage handler registered (T1..T4 = 10/20/30/40%)')
} catch (e) {
  console.error('[unique_tier_buff] damage handler init failed: ' + e)
}
