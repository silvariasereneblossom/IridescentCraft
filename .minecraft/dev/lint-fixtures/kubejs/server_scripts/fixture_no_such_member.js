// Fixture for NO-SUCH-MEMBER: members the failure ledger knows are not there on this engine
// (each one an entry of dev/engine-tests/truth/known-false.json).
function sweep(player, level, entity, stack, source) {
  var inv = player.inventory
  for (var i = 0; i < inv.size; i++) {}                         // EXPECT NO-SUCH-MEMBER
  for (var k = 0; k < player.inventory.size; k++) {}            // EXPECT NO-SUCH-MEMBER
  var n = inv.getSize()                                         // EXPECT NO-SUCH-MEMBER
  var phase = Math.floor(level.dayTime / 24000) % 8             // EXPECT NO-SUCH-MEMBER
  var t = player.level.dayTime                                  // EXPECT NO-SUCH-MEMBER
  level.dropItem(stack)                                         // EXPECT NO-SUCH-MEMBER
  entity.hurt(source, 4)                                        // EXPECT NO-SUCH-MEMBER
  var id = entity.getUUID()                                     // EXPECT NO-SUCH-MEMBER
  stack.setTag(null)                                            // EXPECT NO-SUCH-MEMBER
  if (stack.hasTag()) {}                                        // EXPECT NO-SUCH-MEMBER
  var made = Item.of('minecraft:stick').itemStack               // EXPECT NO-SUCH-MEMBER
  var msg = source.getMsgId()                                   // EXPECT NO-SUCH-MEMBER
  if (source.isCritical()) {}                                   // EXPECT NO-SUCH-MEMBER
  var lvl = stack.enchantments.getLevel('minecraft:sharpness')  // EXPECT NO-SUCH-MEMBER
}
EntityEvents.hurt(icraft.guard('fixture_no_such_member', 'EntityEvents.hurt', function (event) {
  if (event.amount > 10) event.amount = 10                      // EXPECT NO-SUCH-MEMBER NO-SUCH-MEMBER
}))

// Not flagged: the real names, and the same words on other things
function fine(player, level, entity, stack, source, list, event) {
  var inv = player.inventory
  var slots = inv.slots + inv.containerSize + global.icraft.core.mainSlotCount()
  var now = level.dayTime()
  var size = list.size()
  var count = new Array(3).size
  entity.attack(source, 4)
  var id = entity.uuid
  stack.nbt = null
  if (stack.hasTag('forge:ingots')) {}
  var made = Item.of('minecraft:stick')
  var amount = event.amount
}
EntityEvents.hurt(icraft.guard('fixture_no_such_member#2', 'EntityEvents.hurt', function (event) {
  event.damage = 1
}))
