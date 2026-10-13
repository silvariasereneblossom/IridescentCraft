// @file kubejs/server_scripts/icraft_despawn_command.js
// @events ServerEvents.commandRegistry
// =============================================================================
// /icraft despawn <radius> -- clear hostile mobs around the player
// =============================================================================
// Tester convenience: nuke the loaded hostiles in a sphere around you to
// reset a test scenario without killing villagers, pets, dropped items,
// armor stands, or active bosses.
//
// Filter chain:
//   1. every entity in the box: Level.getEntities(player, AABB)
//   2. Spherical refine via distanceToSqr (radius is true distance, not box)
//   3. Skip if entity == player
//   4. Skip unless it is a hostile mob: a Mob that is `instanceof Monster` (the
//      vanilla hostile base class) or implements `Enemy` (vanilla's own marker for
//      a hostile mob that is no Monster: ghast, phantom, slime, magma cube,
//      shulker, hoglin, and their relatives in the mods). Since 2026-10-13
//      (decision list entry 63, option c); until then only `instanceof Monster`,
//      so those stayed. NOT the mob category of the entity type: that is whatever
//      a mod registered, and it names villagers, pets and effect entities too
//      (measured on every creatable type: Part 8 of the decision list).
//   5. Skip a boss: the entity type is in #forge:bosses, or it is a boss of the
//      pack's registry (global.icraft.core.isBoss).
//   6. Skip if it has an owner: an OwnableEntity with an owner (tamed pets, the
//      summons of Ars Nouveau), or a summon whose owner the mod keeps itself and
//      answers through getSummoner() (Iron's Spellbooks: the summoned zombie,
//      skeleton and vex). getSummoner() finds the owner only while the owner is
//      in the summon's dimension: a summon whose owner is elsewhere is removed.
// An entity whose tests throw is KEPT and reported once in the log.
//
// Action: entity.discard() -- silent removal, no drops, no XP. Right call
// for "clear test mobs"; for "kill with drops" use vanilla /kill with a
// selector instead.
//
// Op-only (permission level 2). Range capped at 1..200 blocks.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} not function X()
// inside try blocks).
// =============================================================================

try {
  var Mob_dsp = Java.loadClass('net.minecraft.world.entity.Mob')
  var Monster_dsp = Java.loadClass('net.minecraft.world.entity.monster.Monster')
  var Enemy_dsp = Java.loadClass('net.minecraft.world.entity.monster.Enemy')
  var Registries_dsp = Java.loadClass('net.minecraft.core.registries.Registries')
  var TagKey_dsp = Java.loadClass('net.minecraft.tags.TagKey')
  var ResourceLocation_dsp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var IntegerArgumentType_dsp = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType')
  var OwnableEntity_dsp = Java.loadClass('net.minecraft.world.entity.OwnableEntity')

  var BOSSES_TAG = TagKey_dsp.create(
    Registries_dsp.ENTITY_TYPE,
    ResourceLocation_dsp.tryParse('forge:bosses')
  )

  // once per failing place per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnThrew_dsp = function (where, e) {
    global.icraft.core.warnOnce('icraft_despawn_command:' + where, '[icraft_despawn] ' + where + ' threw: ' + e)
  }

  // 2026-04-25: original implementation used
  //   level.getEntitiesOfClass(Java.loadClass('...Mob'), aabb)
  // which returned an empty collection. Likely cause: Rhino doesn't
  // unwrap the JavaClass wrapper to a raw java.lang.Class<T> on the
  // Class<T> generic parameter. Switched to Level.getEntities(Entity
  // except, AABB) which has no Class parameter -- returns ALL entities
  // in the AABB except the given one. The loop below filters them itself
  // (the filter chain of the header).
  var doDespawn = function(sp, radius) {
    var level = sp.level
    if (!level) {
      console.warn('[icraft_despawn] sp.level is null/undefined for ' + sp.username)
      return 0
    }
    var aabb = sp.getBoundingBox().inflate(radius)
    var radiusSq = radius * radius

    var entities = null
    try { entities = level.getEntities(sp, aabb) } catch (ee) {
      console.warn('[icraft_despawn] level.getEntities threw: ' + ee)
      return 0
    }
    if (!entities) {
      console.warn('[icraft_despawn] level.getEntities returned null')
      return 0
    }

    var scanned = 0
    var hostile = 0
    var killed = 0
    var typeBuckets = {}  // entity-type id -> count, for diagnosis
    var iter = entities.iterator()
    while (iter.hasNext()) {
      var e = iter.next()
      scanned++
      try {
        if (e === sp) continue
        if (e.distanceToSqr(sp) > radiusSq) continue
        // Bucket the entity type for the diagnostic line when killed=0: the
        // registry id through global.icraft.core.entityId (0_lib_core.js), the one
        // reader of it. Until 2026-10-13 this asked
        // ForgeRegistries.ENTITY_TYPES.getKey(type); `type` is the id STRING for
        // scripts, the registry answers its default key for it, and every
        // bucket was minecraft:pig (measured on all 1,411 creatable types).
        var typeId = global.icraft.core.entityId(e) || '?'
        typeBuckets[typeId] = (typeBuckets[typeId] || 0) + 1
        // Hostile = a Mob that is a Monster or an Enemy (rule 4 of the header). The two
        // tests of the mob category that stood here threw on every entity (they were
        // called on the id string) and are gone: a working one would remove 29 entity
        // types that are not hostile (decision list Part 8).
        if (!(e instanceof Mob_dsp)) continue
        if (!(e instanceof Monster_dsp) && !(e instanceof Enemy_dsp)) continue
        hostile++
        // Bosses stay: the tag of the entity TYPE (getEntityType(); until 2026-10-13
        // this asked the id string and threw, so the Wither and the Harbinger were
        // removed), then the pack's own roster. isBoss throws when the registry did
        // not load: the entity is then kept, by the catch below.
        if (e.getEntityType().is(BOSSES_TAG)) continue
        if (global.icraft.core.isBoss(e)) continue
        if (e instanceof OwnableEntity_dsp && e.getOwnerUUID() != null) continue
        // a summon whose mod keeps the owner itself (Iron's Spellbooks): rule 6 of the header
        if (typeof e.getSummoner === 'function' && e.getSummoner() != null) continue
        e.discard()
        killed++
      } catch (ee) {
        // Per-entity isolation: one weird entity does not abort the sweep. It is
        // KEPT (a test that cannot be made never removes anything) and said once.
        warnThrew_dsp('a test on an entity (it was kept)', ee)
      }
    }
    console.log('[icraft_despawn] ' + sp.username + ' radius=' + radius +
                ' scanned=' + scanned + ' hostile=' + hostile + ' killed=' + killed)
    // When killed=0 dump the type bucket so we can see what's actually nearby
    // (lets us tell "no hostile mobs in range" from "filter is broken").
    if (killed === 0 && scanned > 0) {
      var bucketStr = ''
      for (var k in typeBuckets) bucketStr += k + ':' + typeBuckets[k] + ' '
      console.log('[icraft_despawn] killed=0; nearby types: ' + bucketStr.trim())
    }
    return killed
  }

  ServerEvents.commandRegistry(icraft.guard('icraft_despawn_command', 'ServerEvents.commandRegistry', event => {
    const { commands: Commands } = event

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('despawn')
          .requires(src => src.hasPermission(2))
          .then(Commands.argument('radius', IntegerArgumentType_dsp.integer(1, 200))
            .executes(ctx => {
              var sp
              try { sp = ctx.source.getPlayerOrException() } catch (e) {
                // swallow-ok: not a player (the console, a command block): the source is told so and the command ends
                ctx.source.sendFailure(Text.of('Must be run as a player'))
                return 0
              }
              var radius = IntegerArgumentType_dsp.getInteger(ctx, 'radius')
              var killed = doDespawn(sp, radius)
              sp.tell('§7[icraft] Despawned §f' + killed +
                      '§7 hostile mob' + (killed === 1 ? '' : 's') +
                      ' within §f' + radius + '§7 blocks.')
              return killed
            })
          )
        )
    )
  }))

  console.log('[IridescentCraft] /icraft despawn <radius> command registered')
} catch (e) {
  console.warn('[IridescentCraft] icraft_despawn_command bootstrap FAILED: ' + e)
}
