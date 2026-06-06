// =============================================================================
// DIAGNOSTIC -- trace damage to passive mobs (TEMPORARY, remove after hunt)
// =============================================================================
// 2026-06-06: operator reports summoned pigs taking passive damage from an
// unknown source while standing idle. This handler logs EVERY damage event
// against the four common passives with full source forensics so one summoned
// pig + a minute of waiting names the source in the log (auto-mirrored).
//
// Registered via the mod-owned DamageModifierRegistry (reload-safe; same
// pattern as icraft.affixes.fire_vuln in affixes/affix_effects.js). Read-only:
// never modifies the event. Log prefix [PDMG] - grep the server/client log.
// =============================================================================

;(function () {
  var PASSIVES = {
    'minecraft:pig': 1, 'minecraft:cow': 1,
    'minecraft:sheep': 1, 'minecraft:chicken': 1
  }

  var resId = function (e) {
    try { return String(e.getType().builtInRegistryHolder().key().location()) } catch (err) { return '?' }
  }

  try {
    var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
    DR.register('icraft.diag.passive_damage', function (event) {
      try {
        var victim = event.entity
        if (!victim || !victim.living) return
        var vid = resId(victim)
        if (!PASSIVES[vid]) return

        var src = event.source
        var msgId = '?'
        try { msgId = String(src.getMsgId()) } catch (e1) { try { msgId = String(src.type().msgId()) } catch (e2) {} }
        var direct = null, owner = null
        try { var d = src.getDirectEntity(); if (d) direct = resId(d) } catch (e3) {}
        try { var o = src.getEntity(); if (o) owner = resId(o) } catch (e4) {}

        var pos = victim.blockPosition()
        var fx = []
        try {
          var iter = victim.getActiveEffects().iterator()
          while (iter.hasNext()) fx.push(String(iter.next().getEffect().getDescriptionId()))
        } catch (e5) {}

        console.log('[PDMG] ' + vid
          + ' dmg=' + event.amount
          + ' type=' + msgId
          + ' direct=' + (direct || '-')
          + ' owner=' + (owner || '-')
          + ' fire=' + victim.remainingFireTicks
          + ' fx=' + (fx.length ? fx.join(',') : '-')
          + ' pos=' + pos.x + ',' + pos.y + ',' + pos.z)
      } catch (e) {
        console.error('[PDMG] handler error: ' + e)
      }
    })
    console.log('[PDMG] passive-damage tracer registered (pig/cow/sheep/chicken) - TEMPORARY diagnostic')
  } catch (e) {
    console.error('[PDMG] failed to register tracer: ' + e)
  }
})()
