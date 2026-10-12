// =============================================================================
// ENGINE FACTS -- what the pack's scripts assume about the engine, as expressions.
// File: .minecraft/dev/engine-tests/real-engine/0_engine_facts.js  (dev tool, never in a distro)
//
// One list, evaluated in two places:
//   1. on a REAL Forge server with the pack's KubeJS / Rhino / Architectury jars
//      (zz_engine_probe.js, run by `run.py real-engine`); the answers are committed
//      as truth/engine-facts.txt, so an engine update that changes one shows as a diff;
//   2. on the mocks of the hook suites (suite `mock-facts`): where a mock answers at
//      all, it must give the engine's answer.
//
// A fact is [label, why, flags, fn(o)]. `o` holds: player (holding 3 diamonds in slot 0
// and 2 in slot 40), inv, stack (slot 0), mob (a zombie), level, server, source
// (generic damage), psource (player attack by `player`), event (the event object a
// handler is given).
// flags: 'M' = also asked of the mocks. Return a primitive or a string: an object's
// own toString may carry an address.
//
// Rhino dialect: no arrow functions needed, no const in loops.
// =============================================================================
var ENGINE_FACTS = []
function EF(label, why, flags, fn) { ENGINE_FACTS.push([label, why, flags, fn]) }

// ---- inventory: slot count and stack in slot --------------------------------
EF('typeof inv.size', 'not a member: a loop bound of inv.size runs zero times', 'M', function (o) { return typeof o.inv.size })
EF("'size' in inv", 'not a member', 'M', function (o) { return 'size' in o.inv })
EF('typeof inv.getSize', 'not a member', 'M', function (o) { return typeof o.inv.getSize })
EF('inv.size() throws', 'calling it is a TypeError', 'M', function (o) { try { o.inv.size(); return 'no throw' } catch (e) { return 'throws ' + String(e).split(':')[0] } })
EF('loop to inv.size iterations', 'the seven loops of codex_progression_engine.js / relic_sink.js before the fix', 'M', function (o) { var n = 0; var size = o.inv.size; for (var i = 0; i < size; i++) n++; return n })
EF('inv.slots', 'slot count (KubeJS): 36 main + 4 armor + 1 offhand', 'M', function (o) { return o.inv.slots })
EF('inv.getSlots()', 'slot count (KubeJS)', 'M', function (o) { return o.inv.getSlots() })
EF('inv.containerSize', 'slot count (vanilla)', 'M', function (o) { return o.inv.containerSize })
EF('inv.getContainerSize()', 'slot count (vanilla)', 'M', function (o) { return o.inv.getContainerSize() })
EF('inv.items.size()', 'main inventory only (slots 0-35)', '', function (o) { return o.inv.items.size() })
EF('inv.getStackInSlot(0).count', 'stack in slot i', 'M', function (o) { return o.inv.getStackInSlot(0).count })
EF('inv.getItem(0).count', 'stack in slot i (vanilla)', 'M', function (o) { return o.inv.getItem(0).count })
EF('inv.getStackInSlot(40).count', 'slot 40 is the off hand', 'M', function (o) { return o.inv.getStackInSlot(40).count })
EF('inv.getStackInSlot(41).isEmpty()', 'past the end: air, no throw', '', function (o) { return o.inv.getStackInSlot(41).isEmpty() })
EF('diamonds found by a loop to inv.slots', 'a full-inventory scan sees main + armor + off hand', 'M', function (o) {
  var n = 0
  for (var i = 0; i < o.inv.slots; i++) { var st = o.inv.getStackInSlot(i); if (!st.isEmpty() && st.id === 'minecraft:diamond') n += st.count }
  return n
})
EF('diamonds found by a loop over slots 0-35', 'the main-inventory scan (backpack + hotbar)', 'M', function (o) {
  var n = 0
  for (var i = 0; i < 36; i++) { var st = o.inv.getStackInSlot(i); if (!st.isEmpty() && st.id === 'minecraft:diamond') n += st.count }
  return n
})
EF("inv.count('minecraft:diamond')", 'KubeJS count by ingredient', '', function (o) { return o.inv.count('minecraft:diamond') })
EF("inv.find('minecraft:diamond')", 'KubeJS first slot by ingredient', '', function (o) { return o.inv.find('minecraft:diamond') })
EF('typeof inv.get', 'no get(i)', 'M', function (o) { return typeof o.inv.get })

// ---- item id: a Java String, and what matches it ----------------------------
EF('typeof stack.id', "a String from Java is typeof 'object'", 'M', function (o) { return typeof o.stack.id })
EF('String(stack.id)', 'the id', 'M', function (o) { return String(o.stack.id) })
EF("stack.id === 'minecraft:diamond'", 'strict equality works on the raw value', 'M', function (o) { return o.stack.id === 'minecraft:diamond' })
EF("stack.id == 'minecraft:diamond'", 'loose equality works', 'M', function (o) { return o.stack.id == 'minecraft:diamond' })
EF('new Set([id]).has(stack.id)', 'FALSE: relic_sink.js deny list, boss_progressive.js', 'M', function (o) { return new Set(['minecraft:diamond']).has(o.stack.id) })
EF('new Set([id]).has(String(stack.id))', 'convert first', 'M', function (o) { return new Set(['minecraft:diamond']).has(String(o.stack.id)) })
EF("new Set([id]).has('' + stack.id)", 'convert first', 'M', function (o) { return new Set(['minecraft:diamond']).has('' + o.stack.id) })
EF('typeof new Map([[id, 7]]).get(stack.id)', 'undefined: a Map keyed by ids never matches a raw Java string', 'M', function (o) { return typeof new Map([['minecraft:diamond', 7]]).get(o.stack.id) })
EF('new Set([stack.id]).has(stack.id)', 'two wrappers of the same text do not match each other', 'M', function (o) { return new Set([o.stack.id]).has(o.stack.id) })
EF('({id: 5})[stack.id]', 'a plain object as the table works', 'M', function (o) { return ({ 'minecraft:diamond': 5 })[o.stack.id] })
EF('[id].indexOf(stack.id)', 'Array.indexOf works', 'M', function (o) { return ['minecraft:diamond'].indexOf(o.stack.id) })
EF('[id].includes(stack.id)', 'Array.includes works', 'M', function (o) { return ['minecraft:diamond'].includes(o.stack.id) })
EF('switch (stack.id)', 'switch works', 'M', function (o) { switch (o.stack.id) { case 'minecraft:diamond': return 'matched'; default: return 'NOT matched' } })
EF("typeof stack.id.split(':')[0]", 'String methods return Java strings again', 'M', function (o) { return typeof o.stack.id.split(':')[0] })
EF("({minecraft: 9})[stack.id.split(':')[0]]", 'the namespace as an object key works', 'M', function (o) { return ({ 'minecraft': 9 })[o.stack.id.split(':')[0]] })
EF('typeof stack.id.length', "Java's length() is a function: `id.length > 0` is false", 'M', function (o) { return typeof o.stack.id.length })
EF("stack.id.replace(/[:\/]/g, '_')", "UNCHANGED: Java's replace(CharSequence, CharSequence) takes the regex as literal text (relic_sink cap key)", 'M', function (o) { return String(o.stack.id.replace(/[:\/]/g, '_')) })
EF("String(stack.id).replace(/[:\/]/g, '_')", 'convert first, then the regex replace works', 'M', function (o) { return String(o.stack.id).replace(/[:\/]/g, '_') })
EF('JSON.stringify({a: stack.id})', 'serialises as a string', 'M', function (o) { return JSON.stringify({ a: o.stack.id }) })

// ---- item stack --------------------------------------------------------------
EF('stack.count', 'count', 'M', function (o) { return o.stack.count })
EF('stack.isEmpty()', 'the method', 'M', function (o) { return o.stack.isEmpty() })
EF('typeof stack.isEmpty', 'without parens it is a function reference (always truthy)', 'M', function (o) { return typeof o.stack.isEmpty })
EF('typeof stack.getTag', 'renamed by KubeJS: use stack.nbt', 'M', function (o) { return typeof o.stack.getTag })
EF('typeof stack.setTag', 'renamed by KubeJS: stack.nbt = tag', 'M', function (o) { return typeof o.stack.setTag })
EF('typeof stack.getNbt', 'the real accessor', 'M', function (o) { return typeof o.stack.getNbt })
EF('typeof stack.hasNBT', 'the real test', 'M', function (o) { return typeof o.stack.hasNBT })
EF('typeof stack.hasTag', 'exists, but it is the item-TAG test and takes one argument', 'M', function (o) { return typeof o.stack.hasTag })
EF('stack.hasNBT()', 'a plain stack has no nbt', 'M', function (o) { return o.stack.hasNBT() })
EF('typeof stack.getInternal', 'not a member', 'M', function (o) { return typeof o.stack.getInternal })
EF('typeof stack.itemStack', 'not a member (Item.of(id).itemStack)', 'M', function (o) { return typeof o.stack.itemStack })
EF('typeof stack.enchantments.getLevel', 'not a member (item.enchantments.getLevel)', '', function (o) { return typeof o.stack.enchantments.getLevel })
EF('typeof stack.item.id', "the item's id is a Java String too", 'M', function (o) { return typeof o.stack.item.id })

// ---- entity ------------------------------------------------------------------
EF('typeof mob.type', "the id string, typeof 'object'", 'M', function (o) { return typeof o.mob.type })
EF('String(mob.type)', 'entity.type is the id', 'M', function (o) { return String(o.mob.type) })
EF('typeof mob.getType()', 'getType() is the id STRING too (the vanilla type is getEntityType())', 'M', function (o) { return typeof o.mob.getType() })
EF('typeof mob.getEntityType', 'the vanilla EntityType', 'M', function (o) { return typeof o.mob.getEntityType })
EF('typeof mob.hurt', 'renamed by KubeJS: attack(source, amount)', 'M', function (o) { return typeof o.mob.hurt })
EF('typeof mob.attack', 'the real name', 'M', function (o) { return typeof o.mob.attack })
EF('typeof mob.tickCount', 'renamed by KubeJS: age', 'M', function (o) { return typeof o.mob.tickCount })
EF('typeof mob.age', 'the real name', 'M', function (o) { return typeof o.mob.age })
EF('typeof mob.level', 'a property (level() is hidden)', 'M', function (o) { return typeof o.mob.level })
EF('typeof mob.getItemSlot', 'not a member (getItemBySlot)', 'M', function (o) { return typeof o.mob.getItemSlot })
EF('typeof mob.getItemBySlot', 'the real name', 'M', function (o) { return typeof o.mob.getItemBySlot })
EF('typeof mob.setDeltaMovement', 'still there (the Vec3 overload); the x,y,z overload is setMotion', 'M', function (o) { return typeof o.mob.setDeltaMovement })
EF('typeof mob.setMotion', 'the x,y,z overload', 'M', function (o) { return typeof o.mob.setMotion })
EF('typeof mob.uuid', 'getUUID is renamed getUuid', 'M', function (o) { return typeof o.mob.uuid })
EF('typeof mob.getUUID', 'renamed', 'M', function (o) { return typeof o.mob.getUUID })
EF('typeof mob.persistentData', "KubeJS's own compound", 'M', function (o) { return typeof o.mob.persistentData })
EF('typeof mob.forgePersistentData', "Forge's compound (what jars write)", 'M', function (o) { return typeof o.mob.forgePersistentData })
EF('mob.isLiving()', 'living test', 'M', function (o) { return o.mob.isLiving() })
EF('mob.isPlayer()', 'player test', 'M', function (o) { return o.mob.isPlayer() })
EF('player.isPlayer()', 'player test', 'M', function (o) { return o.player.isPlayer() })
EF('mob.isMonster()', 'category test', 'M', function (o) { return o.mob.isMonster() })
EF('typeof mob.maxHealth', 'bean of getMaxHealth()', 'M', function (o) { return typeof o.mob.maxHealth })
EF('typeof mob.modifyAttribute', 'KubeJS: transient modifier', 'M', function (o) { return typeof o.mob.modifyAttribute })
EF('typeof mob.getAttribute', 'vanilla AttributeInstance lookup', '', function (o) { return typeof o.mob.getAttribute })
EF('typeof mob.position', 'a method returning a Vec3 (whose .x/.y/.z value read throws: use getX())', '', function (o) { return typeof o.mob.position })
EF('typeof mob.getX', 'the safe coordinate read', 'M', function (o) { return typeof o.mob.getX })
EF('typeof player.inventory', 'the vanilla Inventory', 'M', function (o) { return typeof o.player.inventory })
EF('typeof player.getInventory', 'same object', 'M', function (o) { return typeof o.player.getInventory })
EF('typeof player.username', 'getScoreboardName is renamed getUsername', 'M', function (o) { return typeof o.player.username })
EF('typeof player.give', 'KubeJS give', 'M', function (o) { return typeof o.player.give })
EF('typeof player.tell', 'KubeJS tell', 'M', function (o) { return typeof o.player.tell })

// ---- level and server --------------------------------------------------------
EF('typeof level.time', 'the world clock (getGameTime renamed getTime)', 'M', function (o) { return typeof o.level.time })
EF('typeof level.gameTime', 'renamed: undefined, so a clock built on it is NaN', 'M', function (o) { return typeof o.level.gameTime })
EF('typeof level.getGameTime', 'renamed', 'M', function (o) { return typeof o.level.getGameTime })
EF('typeof level.dayTime', "a function (dayTime() shadows the bean): not a number", 'M', function (o) { return typeof o.level.dayTime })
EF('String(level.dimension)', 'a ResourceLocation that prints as the id', 'M', function (o) { return String(o.level.dimension) })
EF('typeof level.dimension', 'an object, not a string', 'M', function (o) { return typeof o.level.dimension })
EF("level.dimension == 'minecraft:overworld'", 'compares equal to the id string', 'M', function (o) { return o.level.dimension == 'minecraft:overworld' })
EF('typeof level.dropItem', 'not a member (entity.spawnAtLocation(stack))', 'M', function (o) { return typeof o.level.dropItem })
EF('typeof level.getBlock', 'KubeJS block container (LOADS the chunk)', 'M', function (o) { return typeof o.level.getBlock })
EF('typeof level.hasChunkAt', 'the loaded-chunk guard', '', function (o) { return typeof o.level.hasChunkAt })
EF('typeof level.persistentData', 'KubeJS level data', '', function (o) { return typeof o.level.persistentData })
EF('typeof server.tickCount', 'restarts at 0 on every boot: never persist it', 'M', function (o) { return typeof o.server.tickCount })
EF('typeof server.runCommandSilent', 'returns 0 instead of throwing', 'M', function (o) { return typeof o.server.runCommandSilent })
EF('typeof server.persistentData', 'KubeJS server data', 'M', function (o) { return typeof o.server.persistentData })
EF('typeof server.players', 'KubeJS player list', 'M', function (o) { return typeof o.server.players })

// ---- damage source -----------------------------------------------------------
EF('typeof source.entity', 'renamed by KubeJS: actual', 'M', function (o) { return typeof o.source.entity })
EF('typeof source.getEntity', 'renamed', 'M', function (o) { return typeof o.source.getEntity })
EF('typeof source.directEntity', 'renamed by KubeJS: immediate', 'M', function (o) { return typeof o.source.directEntity })
EF('typeof source.getDirectEntity', 'renamed', 'M', function (o) { return typeof o.source.getDirectEntity })
EF('typeof source.getActual', 'the real name', 'M', function (o) { return typeof o.source.getActual })
EF('typeof source.getImmediate', 'the real name', 'M', function (o) { return typeof o.source.getImmediate })
EF('typeof source.type', 'a FUNCTION (the vanilla type() method), never an id', 'M', function (o) { return typeof o.source.type })
EF('String(source.getType())', 'getType() is the message id (getMsgId renamed)', 'M', function (o) { return String(o.source.getType()) })
EF('typeof source.isCritical', 'not a member', 'M', function (o) { return typeof o.source.isCritical })
EF('psource.actual === player', 'the attacker', 'M', function (o) { return o.psource.actual === o.player })
EF('typeof psource.player', 'KubeJS: the attacking player', 'M', function (o) { return typeof o.psource.player })

// ---- event.cancel() ------------------------------------------------------------
EF('event.cancel() inside try/catch: what the catch receives', 'cancel() leaves the handler by THROWING: a try/catch around it swallows the exit, and an event guard must let it through', 'M',
  function (o) { try { o.event.cancel(); return 'no throw' } catch (e) { return String(e) } })
EF('event.cancel(): e.name', 'how a guard can tell the exit from a real error', 'M',
  function (o) { try { o.event.cancel(); return 'no throw' } catch (e) { return String(e.name) } })
EF('event.cancel(): e.javaException class', 'the Java exception behind it', 'M',
  function (o) { try { o.event.cancel(); return 'no throw' } catch (e) { return String(e.javaException.getClass().getName()) } })
EF('event.cancel(): the statement after it runs', 'nothing after cancel() runs', 'M',
  function (o) { var after = false; try { o.event.cancel(); after = true } catch (e) { } return after })
