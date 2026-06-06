// =============================================================================
// MEAT DROP DOUBLING (operator directive 2026-06-06)
// =============================================================================
// Food and cooking are central to the pack's framework - double all BASE meat
// drops from the standard meat animals so the cooking economy has headroom.
// Mechanism: LootJS modifyLoot on each animal's own entity table, doubling
// only the meat stacks (raw + cooked variant - cooked drops when the animal
// dies burning). Leather/feathers/wool/etc are untouched. Looting still
// applies on top of the doubled base.
//
// Precedent: majrusz_skeleton_punch_strip.js (modifyLoot filter+callback).
// SCOPE: vanilla meat animals + nether hoglin. Modded meat animals (alexsmobs
// etc.) deliberately excluded this pass - extend the map after a meat audit.
// =============================================================================

LootJS.modifiers(function (event) {
  var MEAT_ANIMALS = {
    'minecraft:pig':       ['minecraft:porkchop', 'minecraft:cooked_porkchop'],
    'minecraft:cow':       ['minecraft:beef', 'minecraft:cooked_beef'],
    'minecraft:mooshroom': ['minecraft:beef', 'minecraft:cooked_beef'],
    'minecraft:chicken':   ['minecraft:chicken', 'minecraft:cooked_chicken'],
    'minecraft:sheep':     ['minecraft:mutton', 'minecraft:cooked_mutton'],
    'minecraft:rabbit':    ['minecraft:rabbit', 'minecraft:cooked_rabbit'],
    'minecraft:cod':       ['minecraft:cod', 'minecraft:cooked_cod'],
    'minecraft:salmon':    ['minecraft:salmon', 'minecraft:cooked_salmon'],
    'minecraft:hoglin':    ['minecraft:porkchop', 'minecraft:cooked_porkchop']
  }

  var doubleStack = function (stack) {
    stack.setCount(stack.getCount() * 2)
    return stack
  }

  var count = 0
  for (var entityId in MEAT_ANIMALS) {
    var meats = MEAT_ANIMALS[entityId]
    for (var i = 0; i < meats.length; i++) {
      event.addEntityLootModifier(entityId).modifyLoot(meats[i], doubleStack)
    }
    count++
  }
  console.log('[meat-doubling] base meat drops doubled for ' + count + ' animals')
})
