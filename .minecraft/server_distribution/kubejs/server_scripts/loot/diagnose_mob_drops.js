// =============================================================================
// DIAGNOSTIC — log every LivingDropsEvent to trace mystery injections
// =============================================================================
// Tester saw minecraft:diamond + minecraft:ender_eye drop from a vanilla
// spider. Exhaustive static analysis (JSON grep of every mod's loot tables,
// GLMs, and bytecode) couldn't find the injector. This script subscribes
// to Forge's LivingDropsEvent at HIGHEST + LOWEST priority; diffing the
// two snapshots tells us which priority band added each item.
//
// Rhino scoping: KubeJS 6 on this Forge build rejects `const`/`let` inside
// try blocks and function bodies as "redeclaration of var X" on the second
// invocation. Use `var` everywhere except truly one-shot module-scope names.
// (See memory: feedback_wiki_reference.md, project_biome_cycle_audit.md.)
//
// Remove this script once the root cause is identified.
// =============================================================================

try {
  var MinecraftForge = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var LivingDropsEvent_cls = Java.loadClass('net.minecraftforge.event.entity.living.LivingDropsEvent')
  var EventPriority = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer = Java.loadClass('java.util.function.Consumer')

  var isInteresting = function(entityType) {
    return /spider|zombie|skeleton|creeper|husk|drowned|witch|phantom/i.test(entityType)
  }

  var logSnapshot = function(phase, event) {
    try {
      var entity = event.getEntity()
      var entityType = String(entity.getType().toString())
      if (!isInteresting(entityType)) return

      var drops = event.getDrops()
      var count = drops ? drops.size() : 0

      // DamageSource exposes getEntity() but KubeJS's wrapper doesn't always
      // expose it via Rhino reflection (seen: "Cannot find function getEntity
      // in object DamageSource"). Best-effort -- wrap in its own try/catch so
      // the main drops-logging still runs on DamageSource edge cases. Try SRG
      // name first (Forge 1.20.1 retains SRG at runtime), fall back to the
      // direct-entity JS property name.
      var killerName = 'unknown'
      try {
        var source = event.getSource()
        if (source) {
          var killer = null
          try { killer = source.m_7639_() } catch (e) {}       // SRG for getEntity
          if (!killer) {
            try { killer = source.getEntity() } catch (e) {}
          }
          if (!killer) {
            try { killer = source.entity } catch (e) {}         // JS property
          }
          if (killer) killerName = String(killer.getType().toString())
          else killerName = 'via ' + String(source.m_19385_ ? source.m_19385_() : source.type || source.msgId || 'unknown')
        }
      } catch (e) {}

      console.log('[dropdiag:' + phase + '] ' + entityType + ' killed by ' + killerName +
                  ' at ' + Math.round(entity.getX()) + ',' +
                  Math.round(entity.getY()) + ',' + Math.round(entity.getZ()) +
                  ' has ' + count + ' drop(s)')
      if (count === 0) return
      var it = drops.iterator()
      while (it.hasNext()) {
        var itemEntity = it.next()
        var stack = itemEntity.getItem()
        var itemId = String(stack.getItem().getDescriptionId())
        var itemCount = stack.getCount()
        var nbt = stack.getTag()
        var nbtStr = nbt ? String(nbt) : '<none>'
        console.log('[dropdiag:' + phase + ']   - ' + itemId + ' x' + itemCount +
                    ' NBT=' + (nbtStr.length > 200 ? nbtStr.substring(0, 200) + '...' : nbtStr))
      }
    } catch (e) {
      console.warn('[dropdiag:' + phase + '] threw: ' + e)
    }
  }

  var highestHandler = new Consumer({
    accept: function(event) { logSnapshot('HIGHEST', event) }
  })
  var lowestHandler = new Consumer({
    accept: function(event) { logSnapshot('LOWEST', event) }
  })

  // HIGHEST runs first — snapshot vanilla-only drops (before any mod handler
  // has contributed). LOWEST runs last — snapshot after all mods have added
  // their drops. Diffing the two tells us which priority band added each item.
  MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGHEST, false, LivingDropsEvent_cls, highestHandler)
  MinecraftForge.EVENT_BUS.addListener(EventPriority.LOWEST, false, LivingDropsEvent_cls, lowestHandler)
  console.log('[IridescentCraft] diagnose_mob_drops: registered LivingDropsEvent listeners at HIGHEST + LOWEST priority')
} catch (e) {
  console.warn('[IridescentCraft] diagnose_mob_drops: bootstrap FAILED: ' + e)
}
