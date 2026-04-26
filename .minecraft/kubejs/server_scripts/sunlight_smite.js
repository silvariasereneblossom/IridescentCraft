// =============================================================================
// SUNLIGHT SMITE -- accelerated daytime clear for undead mobs
// =============================================================================
// Design intent (Silvaria 2026-04-24): venturing outside at night is
// dangerous, well-lit bases should be safe, daytime outside should
// aggressively clear leftover undead. Vanilla's 1 HP per ~20-tick sunlight
// burn is too slow to deliver on that promise -- a zombie that chased the
// player all night can stand in the morning sun for ~15 seconds before
// dying, which is plenty of time to get one more hit in on a base.
//
// What this script does:
//   - Every 10 ticks (2 Hz), scan #minecraft:undead-tagged entities within
//     48 blocks of each overworld player
//   - For each, require: level is day AND entity has direct sky above
//     (canSeeSky false = base/cave/overhang, skipped -- that's the "well-lit
//     base = safe" guarantee the design calls for)
//   - Apply 2 HP magic damage per tick (stacks on vanilla fire burn)
//   - Set fire visual if not already burning
//
// Why magic damage, not fire damage:
//   - fire damage is already being applied by vanilla's aiStep; layering
//     more fire damage on top gets partially absorbed by fire resistance,
//     protection-4 armor, and some modded armor
//   - magic damage bypasses fire resistance and armor, which matches the
//     "sun-burn is thematic purging, not physical combat" frame
//
// Why the #minecraft:undead tag:
//   - Most mods (Born-in-Chaos, Undead Revamped, Cataclysm draugr, stalwart
//     dungeons, Aether undead, etc.) opt into minecraft:undead. A few exotic
//     mods opt into forge:undead; we include both.
//   - Skips hostile-but-living mobs (spiders, creepers, witches, pillagers)
//     which keeps their daytime behavior vanilla -- those are the threats
//     the user encounters while exploring during the day.
//   - Skips bosses by default (boss entities generally aren't in the
//     undead tag even if they're thematically undead; e.g. the Wither
//     itself is untagged even though wither_skeletons are).
//
// Memory: feedback_wiki_reference.md (Rhino: use var in reentrant scopes).
// =============================================================================

try {
  var ResourceLocation_ss = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var EntityTypeTags_ss = Java.loadClass('net.minecraft.tags.EntityTypeTags')
  var TagKey_ss = Java.loadClass('net.minecraft.tags.TagKey')
  var Registries_ss = Java.loadClass('net.minecraft.core.registries.Registries')
  var DamageTypes_ss = Java.loadClass('net.minecraft.world.damagesource.DamageTypes')

  // Undead tag: minecraft:undead covers the vast majority, forge:undead
  // catches a few outliers. Both resolve via TagKey at damage time.
  var UNDEAD_TAG_MC = TagKey_ss.create(Registries_ss.ENTITY_TYPE,
    new ResourceLocation_ss('minecraft', 'undead'))
  var UNDEAD_TAG_FORGE = TagKey_ss.create(Registries_ss.ENTITY_TYPE,
    new ResourceLocation_ss('forge', 'undead'))

  // 2026-04-26: user directive "sunlight should flat out clear out entities".
  // Bumped from 2.0 (4 HP/sec; ~5s to kill a vanilla zombie) to 100.0 which
  // one-shots any non-boss undead in a single tick. Drops still spawn on death
  // (so loot economy unaffected); mobs simply don't survive their first
  // direct-sky frame after our 10-tick cadence catches them.
  var DAMAGE_PER_TICK = 100.0

  var isUndead = function(entity) {
    try {
      var type = entity.getType()
      if (type.is(UNDEAD_TAG_MC)) return true
      if (type.is(UNDEAD_TAG_FORGE)) return true
    } catch (e) {}
    return false
  }

  global.tick_sunlightSmite = function(event) {
    var server = event.server
    if (!server) return
    var ow = server.overworld()
    if (!ow.isDay()) return

    server.players.forEach(function(player) {
      try {
        if (String(player.level.dimension) !== 'minecraft:overworld') return
        var level = player.level
        var aabb = player.boundingBox.inflate(48.0, 32.0, 48.0)
        var nearby = level.getEntities(null, aabb)
        if (!nearby || nearby.size() === 0) return
        var it = nearby.iterator()
        while (it.hasNext()) {
          var entity = it.next()
          if (!entity.isAlive()) continue
          if (!isUndead(entity)) continue
          var pos = entity.blockPosition()
          if (!level.canSeeSky(pos)) continue
          // Direct magic damage via vanilla damage sources. Bypasses fire
          // resistance + armor; thematic sunlight-purge hit.
          try {
            var src = level.damageSources().magic()
            entity.hurt(src, DAMAGE_PER_TICK)
            if (entity.getRemainingFireTicks() < 40) {
              entity.setRemainingFireTicks(40)
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn('[sunlight_smite] player-loop threw for ' +
                     player.username + ': ' + e)
      }
    })
  }
  global.registerServerTick('tick_sunlightSmite', 10, 3)
  console.log('[IridescentCraft] sunlight_smite loaded: +' + DAMAGE_PER_TICK +
              ' HP/tick(10) to #minecraft:undead + #forge:undead in direct sky')
} catch (e) {
  console.warn('[IridescentCraft] sunlight_smite bootstrap FAILED: ' + e)
}
