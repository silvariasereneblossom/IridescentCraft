// =============================================================================
// /icraft despawn <radius> -- clear hostile mobs around the player
// =============================================================================
// Tester convenience: nuke the loaded hostiles in a sphere around you to
// reset a test scenario without killing villagers, pets, dropped items,
// armor stands, or active bosses.
//
// Filter chain:
//   1. AABB pre-filter via Level.getEntitiesOfClass(Mob.class, ...)
//   2. Spherical refine via distanceToSqr (radius is true distance, not box)
//   3. Skip if entity == player
//   4. Skip if MobCategory != MONSTER (passives, animals, villagers, golems)
//   5. Skip if entity type is in #forge:bosses (don't despawn fight-bosses)
//   6. Skip if entity is owned/tamed (your summons + pets stay)
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
  var MobCategory_dsp = Java.loadClass('net.minecraft.world.entity.MobCategory')
  var Registries_dsp = Java.loadClass('net.minecraft.core.registries.Registries')
  var TagKey_dsp = Java.loadClass('net.minecraft.tags.TagKey')
  var ResourceLocation_dsp = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var IntegerArgumentType_dsp = Java.loadClass('com.mojang.brigadier.arguments.IntegerArgumentType')
  var OwnableEntity_dsp = Java.loadClass('net.minecraft.world.entity.OwnableEntity')

  var BOSSES_TAG = TagKey_dsp.create(
    Registries_dsp.ENTITY_TYPE,
    ResourceLocation_dsp.tryParse('forge:bosses')
  )

  var doDespawn = function(sp, radius) {
    var level = sp.level
    var aabb = sp.getBoundingBox().inflate(radius)
    var radiusSq = radius * radius

    var killed = 0
    var iter = level.getEntitiesOfClass(Mob_dsp, aabb).iterator()
    while (iter.hasNext()) {
      var e = iter.next()
      try {
        if (e === sp) continue
        if (e.distanceToSqr(sp) > radiusSq) continue
        var type = e.getType()
        if (type.getCategory() != MobCategory_dsp.MONSTER) continue
        try { if (type.is(BOSSES_TAG)) continue } catch (_) {}
        // Skip tamed/owned entities (player summons, pets the player owns)
        try {
          if (e instanceof OwnableEntity_dsp && e.getOwnerUUID() != null) continue
        } catch (_) {}
        e.discard()
        killed++
      } catch (ee) {
        // Per-entity isolation -- one weird entity shouldn't abort the sweep
      }
    }
    return killed
  }

  ServerEvents.commandRegistry(event => {
    const { commands: Commands } = event

    event.register(
      Commands.literal('icraft')
        .then(Commands.literal('despawn')
          .requires(src => src.hasPermission(2))
          .then(Commands.argument('radius', IntegerArgumentType_dsp.integer(1, 200))
            .executes(ctx => {
              var sp
              try { sp = ctx.source.getPlayerOrException() } catch (e) {
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
  })

  console.log('[IridescentCraft] /icraft despawn <radius> command registered')
} catch (e) {
  console.warn('[IridescentCraft] icraft_despawn_command bootstrap FAILED: ' + e)
}
