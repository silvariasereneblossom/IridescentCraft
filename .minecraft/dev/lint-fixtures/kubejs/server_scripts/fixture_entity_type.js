// Fixture for ENTITY-TYPE: `<entity>.type` read as a value.
EntityEvents.death(icraft.guard('fixture_entity_type', 'EntityEvents.death', function (event) {
  var entity = event.entity
  if (entity.type === 'minecraft:zombie') {}                    // EXPECT ENTITY-TYPE
  var id = String(event.entity.type)                            // EXPECT ENTITY-TYPE
  var text = entity.type.toString()                             // EXPECT ENTITY-TYPE
  var attacker = event.source.actual
  if (attacker && attacker.type == 'minecraft:player') {}       // EXPECT ENTITY-TYPE
  var victim = event.getEntity().type                           // EXPECT ENTITY-TYPE
  // Not flagged: the helper, the method, and `type` of things that are not entities
  var good = global.icraft.core.entityId(entity)
  var same = entity.getType()
  var task = { type: 'heracles:kill_entity' }
  if (task.type === 'x') {}
  var recipe = event.recipe
  if (recipe && recipe.type) {}
}))
