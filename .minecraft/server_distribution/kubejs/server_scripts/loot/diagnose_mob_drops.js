// =============================================================================
// DIAGNOSTIC — log every LivingDropsEvent to trace mystery injections
// =============================================================================
// Tester saw minecraft:diamond + minecraft:ender_eye drop from a vanilla
// spider. Exhaustive static analysis (JSON grep of every mod's loot tables,
// GLMs, and bytecode) couldn't find the injector. This script subscribes
// to Forge's LivingDropsEvent at LOWEST priority (so it runs AFTER every
// mod handler has contributed) and logs the final drops Collection. With
// that log in hand we can see the exact items present and correlate with
// the mod event-bus registration order to identify the culprit.
//
// Remove this script once the root cause is identified.
// =============================================================================

try {
  const MinecraftForge = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  const LivingDropsEvent = Java.loadClass('net.minecraftforge.event.entity.living.LivingDropsEvent')
  const EventPriority = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  const Consumer = Java.loadClass('java.util.function.Consumer')

  function isInteresting(entityType) {
    return /spider|zombie|skeleton|creeper|husk|drowned|witch|phantom/i.test(entityType)
  }

  function logSnapshot(phase, event) {
    try {
      const entity = event.getEntity()
      const entityType = String(entity.getType().toString())
      if (!isInteresting(entityType)) return

      const drops = event.getDrops()
      const count = drops ? drops.size() : 0

      const source = event.getSource()
      const killer = source ? source.getEntity() : null
      const killerName = killer ? String(killer.getType().toString()) : 'null'

      console.log('[dropdiag:' + phase + '] ' + entityType + ' killed by ' + killerName +
                  ' at ' + Math.round(entity.getX()) + ',' +
                  Math.round(entity.getY()) + ',' + Math.round(entity.getZ()) +
                  ' has ' + count + ' drop(s)')
      if (count === 0) return
      const it = drops.iterator()
      while (it.hasNext()) {
        const itemEntity = it.next()
        const stack = itemEntity.getItem()
        const itemId = String(stack.getItem().getDescriptionId())
        const itemCount = stack.getCount()
        const nbt = stack.getTag()
        const nbtStr = nbt ? String(nbt) : '<none>'
        console.log('[dropdiag:' + phase + ']   - ' + itemId + ' x' + itemCount +
                    ' NBT=' + (nbtStr.length > 200 ? nbtStr.substring(0, 200) + '...' : nbtStr))
      }
    } catch (e) {
      console.warn('[dropdiag:' + phase + '] threw: ' + e)
    }
  }

  const highestHandler = new Consumer({
    accept: function(event) { logSnapshot('HIGHEST', event) }
  })
  const lowestHandler = new Consumer({
    accept: function(event) { logSnapshot('LOWEST', event) }
  })

  // HIGHEST runs first — snapshot vanilla-only drops (before any mod handler
  // has contributed). LOWEST runs last — snapshot after all mods have added
  // their drops. Diffing the two tells us which priority band added each item.
  MinecraftForge.EVENT_BUS.addListener(EventPriority.HIGHEST, false, LivingDropsEvent, highestHandler)
  MinecraftForge.EVENT_BUS.addListener(EventPriority.LOWEST, false, LivingDropsEvent, lowestHandler)
  console.log('[IridescentCraft] diagnose_mob_drops: registered LivingDropsEvent listeners at HIGHEST + LOWEST priority')
} catch (e) {
  console.warn('[IridescentCraft] diagnose_mob_drops: bootstrap FAILED: ' + e)
}
