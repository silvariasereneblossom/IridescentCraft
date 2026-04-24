// =============================================================================
// MUTANT MONSTERS — block-break deny via EntityMobGriefingEvent
// =============================================================================
// Mutant Monsters hard-codes block destruction as part of its mobs' signature
// AI (mutant creeper minion-summon, mutant zombie wall-smash, mutant enderman
// teleport-grab). The mod has no per-mob toggle -- it only respects vanilla's
// `mobGriefing` gamerule, which is too broad to flip off (would also disable
// endermen pickup, creeper damage, villager farming, and Cataclysm boss arena
// behaviors that we want to keep).
//
// Solution: subscribe to Forge's EntityMobGriefingEvent and return DENY only
// for mutantmonsters:* entities. Everything else proceeds per the gamerule.
// Pattern mirrors diagnose_mob_drops.js: Java.loadClass the Forge event bus,
// addListener with a Consumer, declare everything `var` so Rhino is happy.
//
// Memory: feedback_wiki_reference.md, feedback_jar_audit.md.
// =============================================================================

try {
  var MinecraftForge_mm = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var EntityMobGriefingEvent = Java.loadClass('net.minecraftforge.event.entity.EntityMobGriefingEvent')
  var EventPriority_mm = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_mm = Java.loadClass('java.util.function.Consumer')
  var Result_mm = Java.loadClass('net.minecraftforge.eventbus.api.Event$Result')

  // Namespaces whose mobs should never mob-grief. Extend if another mod
  // ships griefing behavior the pack wants to suppress.
  var DENY_NAMESPACES = ['mutantmonsters:']

  var shouldDeny = function(entity) {
    if (!entity) return false
    try {
      var typeId = String(entity.getType().toString()) // e.g. "entity.mutantmonsters.mutant_creeper"
      for (var i = 0; i < DENY_NAMESPACES.length; i++) {
        // EntityType.toString returns a translation key path, so detect by
        // checking the readable descriptor for the mod id segment.
        if (typeId.indexOf('.' + DENY_NAMESPACES[i].replace(':', '.')) >= 0) return true
        // Also check the resource-location path in case toString() format changes.
        var key = entity.getType().builtInRegistryHolder
          ? entity.getType().builtInRegistryHolder().key().location().toString()
          : null
        if (key && key.indexOf(DENY_NAMESPACES[i]) === 0) return true
      }
    } catch (e) {}
    return false
  }

  var handler = new Consumer_mm({
    accept: function(event) {
      try {
        var entity = event.getEntity()
        if (shouldDeny(entity)) {
          event.setResult(Result_mm.DENY)
        }
      } catch (e) {
        console.warn('[mutant_no_grief] handler threw: ' + e)
      }
    }
  })

  // HIGHEST priority so our decision takes precedence over any other handler
  // (Cataclysm's per-boss ignore_mobgriefing reads the gamerule directly and
  // bypasses this event, so it's unaffected).
  MinecraftForge_mm.EVENT_BUS.addListener(EventPriority_mm.HIGHEST, false, EntityMobGriefingEvent, handler)
  console.log('[IridescentCraft] mutant_monsters_no_grief: registered EntityMobGriefingEvent DENY for ' + DENY_NAMESPACES.join(', '))
} catch (e) {
  console.warn('[IridescentCraft] mutant_monsters_no_grief: bootstrap FAILED: ' + e)
}
