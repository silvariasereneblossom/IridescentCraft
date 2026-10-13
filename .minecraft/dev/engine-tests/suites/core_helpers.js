// =============================================================================
// CORE HELPERS -- the engine-safe helpers of global.icraft.core (0_lib_core.js) on
// mocks that are held to the real classes: idSet, eachMainSlot, playerTier,
// blockIfLoaded, and the two that were there before (warnOnce, now).
// Each helper exists because a name that looks right was wrong on this engine:
//   idSet          a JS Set never matches a Java string        (boss scaling, the relic deny list)
//   eachMainSlot   the vanilla Inventory has no `size`         (the Codex bank, the relic sink)
//   playerTier     five local copies of one question
//   blockIfLoaded  level.getBlock LOADS the chunk              (the nightly out-of-memory)
// What the mocks offer here is what the engine offers (suite mock-honesty):
// Inventory.getStackInSlot(int) and no size, ItemStack.isEmpty(), Level.hasChunkAt
// (BlockPos) / (int,int), Level.getBlock(BlockPos) / (int,int,int), Level.time,
// and the AStages binding's playerHasStage(String, Player) (read from its jar).
// =============================================================================
var CH = global.icraft.core
var ch_p = T_newPlayer('Helper')
var ch_zombie = T_mob('minecraft:zombie')

T_run('core helpers: load', function () {
  ok(T_LOAD_ERRORS.length === 0, 'the libraries load: ' + T_LOAD_ERRORS.join(' / '))
  ok(typeof CH.idSet === 'function' && typeof CH.eachMainSlot === 'function' && typeof CH.playerTier === 'function' &&
     typeof CH.blockIfLoaded === 'function' && typeof CH.warnOnce === 'function' && typeof CH.now === 'function',
    'idSet, eachMainSlot, playerTier, blockIfLoaded, warnOnce and now are exported')
})

T_run('idSet: asked with what the game hands a script', function () {
  var javaId = ch_zombie.getType()
  ok(typeof javaId === 'object' && String(javaId) === 'minecraft:zombie', 'entity.getType() is a Java string here, as in game (typeof ' + (typeof javaId) + ')')
  ok(new Set(['minecraft:zombie']).has(javaId) === false, 'the trap itself: new Set([id]).has(<Java string>) is false')
  var set = CH.idSet(['minecraft:zombie', 'minecraft:wither'])
  ok(set.has(javaId) === true, 'idSet.has(<Java string>) is true')
  ok(set.has('minecraft:zombie') === true && set.has('minecraft:wither') === true, 'idSet.has(<JS string>) is true')
  ok(set.has('minecraft:skeleton') === false && set.has('') === false, 'an id that is not in the set is not in it')
  ok(set.has(null) === false && set.has(undefined) === false, 'null and undefined are never in the set')
  var dims = CH.idSet(['minecraft:overworld'])
  ok(dims.has(ch_p.level.dimension) === true && dims.has(T_NETHER.dimension) === false,
    'a ResourceLocation (level.dimension) can be asked directly')
  ok(set.count() === 2, 'count() is a function and says 2 (got ' + set.count() + ')')
  var list = set.list().slice().sort().join(',')
  ok(list === 'minecraft:wither,minecraft:zombie' && typeof set.list()[0] === 'string', 'list() gives the ids back as JS strings (' + list + ')')
})

T_run('idSet: building and growing it', function () {
  var set = CH.idSet(['a:b', 'a:b', 'a:c'])
  ok(set.count() === 2, 'an id given twice is in the set once')
  var grown = CH.idSet([])
  ok(grown.count() === 0 && grown.has('x:y') === false, 'an empty list is an empty set')
  ok(grown.add(ch_zombie.getType()) === grown && grown.has('minecraft:zombie') === true && grown.count() === 1,
    'add(<Java string>) stores it so that a JS string finds it, and returns the set')
  var names = CH.idSet(['toString', 'hasOwnProperty', '__proto__', 'constructor'])
  ok(names.has('toString') && names.has('hasOwnProperty') && names.has('__proto__') && names.has('constructor') && names.count() === 4,
    'names that are also members of every object are ordinary entries (a player may be called hasOwnProperty)')
  ok(CH.idSet(['x:y']).has('toString') === false && CH.idSet(['x:y']).has('constructor') === false, 'and they are not in a set they were not put in')
  var jl = T.strings(['m:one', 'm:two'])       // a java.util.List<String>, as a Java method would return one
  var fromJava = CH.idSet(jl)
  ok(fromJava.count() === 2 && fromJava.has('m:two') === true && fromJava.has('m:three') === false,
    'a Java List works as the argument (' + fromJava.count() + ' entries; its length reads as ' + (typeof jl.length) + ')')
  var threw = ''
  try { CH.idSet('minecraft:zombie') } catch (e) { threw = String(e) }
  ok(threw.indexOf('not one id') >= 0, 'one id instead of a list THROWS, it does not become a set of its letters (' + threw.slice(0, 60) + ')')
  threw = ''
  try { CH.idSet({ a: 1 }) } catch (e) { threw = String(e) }
  ok(threw.indexOf('not a list') >= 0, 'something that is not a list THROWS, it does not become an empty set')
  ok(CH.idSet().count() === 0 && CH.idSet(null).count() === 0, 'no argument is an empty set to add to')
})

T_run('eachMainSlot: the main inventory, and only it', function () {
  ok(ch_p.inventory.size === undefined, 'the mock inventory has no `size`, as the real one (the loop bound that ran zero times)')
  T.slot(ch_p, 0, new MStack('minecraft:stick', 3))
  T.slot(ch_p, 8, new MStack('minecraft:apple', 1))
  T.slot(ch_p, 35, new MStack('minecraft:diamond', 2))
  T.slot(ch_p, 36, new MStack('minecraft:iron_boots', 1))      // worn armour
  T.slot(ch_p, 40, new MStack('minecraft:shield', 1))          // the off hand
  var seen = []
  var readsBefore = Number(ch_p.t_inventoryReads())
  var n = CH.eachMainSlot(ch_p, function (stack, slot, inv) { seen.push(slot + '=' + String(stack.id) + (inv === ch_p.inventory ? '' : '?')) })
  ok(n === 3, 'it returns how many stacks it handed out: 3 (got ' + n + ')')
  ok(seen.join(' ') === '0=minecraft:stick 8=minecraft:apple 35=minecraft:diamond',
    'hotbar and backpack in slot order, empty slots skipped, with the slot and the inventory (' + seen.join(' ') + ')')
  ok(seen.join(' ').indexOf('iron_boots') < 0 && seen.join(' ').indexOf('shield') < 0, 'the worn armour (36) and the off hand (40) are never visited')
  ok(Number(ch_p.t_inventoryReads()) - readsBefore === 36, 'it reads exactly the 36 main slots (' + (Number(ch_p.t_inventoryReads()) - readsBefore) + ' reads)')
  var first = []
  var m = CH.eachMainSlot(ch_p, function (stack, slot) { first.push(slot); return true })
  ok(m === 1 && first.join(',') === '0', 'returning true stops the walk (visited ' + first.join(',') + ')')
  var count = CH.eachMainSlot(ch_p, function (stack) { return String(stack.id) === 'minecraft:apple' })
  ok(count === 2, 'it stops AT the stack that returned true (2 stacks seen)')
  var thrown = ''
  try { CH.eachMainSlot(ch_p, function () { throw new Error('the caller\'s own error') }) } catch (e) { thrown = String(e) }
  ok(thrown.indexOf('own error') >= 0, 'an error thrown by the callback reaches the caller: it is not swallowed')
  var warnsBefore = T_LOG.warn.length
  ok(CH.eachMainSlot(null, function () {}) === -1 && CH.eachMainSlot({}, function () {}) === -1, 'no player / no inventory is -1, not "0 stacks"')
  ok(T_LOG.warn.length === warnsBefore + 1 && String(T_LOG.warn[T_LOG.warn.length - 1]).indexOf('eachMainSlot') >= 0, 'and says so once (' + (T_LOG.warn.length - warnsBefore) + ' line)')
  ok(CH.eachMainSlot(T_newPlayer('Empty'), function () {}) === 0, 'an empty inventory is 0')
})

T_run('playerTier: the highest tier stage held', function () {
  var p = T_newPlayer('Tiered')
  ok(CH.playerTier(p) === 1, 'no stage is tier 1 (tier_1 is the baseline)')
  p.t_stage('tier_2')
  ok(CH.playerTier(p) === 2, 'tier_2 is 2')
  p.t_stage('tier_3')
  ok(CH.playerTier(p) === 3, 'tier_2 and tier_3 is 3')
  p.t_stage('tier_4')
  ok(CH.playerTier(p) === 4, 'all of them is 4')
  var skipped = T_newPlayer('Skipped').t_stage('tier_3')
  ok(CH.playerTier(skipped) === 3, 'tier_3 without tier_2 is 3: the highest stage held counts')
  var other = T_newPlayer('Other').t_stage('quest_done').t_stage('tier_1')
  ok(CH.playerTier(other) === 1, 'tier_1 and stages that are not tiers are tier 1')
  ok(CH.playerTier(null) === 1 && CH.playerTier(undefined) === 1, 'no player is tier 1')
})

T_run('blockIfLoaded: a block read that never loads a chunk', function () {
  var level = ch_p.level
  var reads = Number(level.t_blockReads())
  var b = CH.blockIfLoaded(level, 10, 64, 10)
  ok(b !== null && Number(level.t_blockReads()) === reads + 1, 'a loaded position is read (one read)')
  level.t_unload(1000, 1000)
  ok(level.hasChunkAt(1000, 1000) === false && level.hasChunkAt(10, 10) === true, 'the test unloads the chunk of (1000, 1000) and no other')
  reads = Number(level.t_blockReads())
  var loads = Number(level.t_chunkLoads())
  ok(CH.blockIfLoaded(level, 1000, 64, 1000) === null && CH.blockIfLoaded(level, 1007, 64, 1001) === null, 'a position in an unloaded chunk is null')
  ok(Number(level.t_blockReads()) === reads && Number(level.t_chunkLoads()) === loads, 'and NOTHING was read: the chunk was not loaded (reads ' + reads + ' -> ' + level.t_blockReads() + ')')
  level.getBlock(1000, 64, 1000)
  ok(Number(level.t_chunkLoads()) === loads + 1, 'the plain level.getBlock on the same position is the read that loads it (the mock counts it)')
  ok(CH.blockIfLoaded(level, 1016, 64, 1000) !== null, 'the next chunk over is loaded and is read')
  var BlockPos = __host.loadClass('mk.W$BlockPos')
  ok(CH.blockIfLoaded(level, new BlockPos(1000, 64, 1000)) === null && CH.blockIfLoaded(level, new BlockPos(10, 64, 10)) !== null, 'a BlockPos works as the position, both ways')
  level.t_unload(-1, -1)
  ok(CH.blockIfLoaded(level, -0.5, 64, -0.5) === null && CH.blockIfLoaded(level, 0.5, 64, 0.5) !== null,
    'a fraction is floored: (-0.5, -0.5) is in block (-1, -1), whose chunk is unloaded; (0.5, 0.5) is in block (0, 0)')
  ok(CH.blockIfLoaded(level, NaN, 64, 0) === null && CH.blockIfLoaded(level, 0, undefined, 0) === null && CH.blockIfLoaded(level, 'x', 64, 0) === null,
    'a coordinate that is not a number is null')
  ok(CH.blockIfLoaded(null, 0, 64, 0) === null && CH.blockIfLoaded(level, null) === null, 'no level / no position is null')
})

T_run('warnOnce and now: the two that were there', function () {
  var before = T_LOG.warn.length
  CH.warnOnce('core-helpers-suite', '[suite] said once')
  CH.warnOnce('core-helpers-suite', '[suite] said once')
  CH.warnOnce('core-helpers-suite', '[suite] another text, the same key')
  ok(T_LOG.warn.length === before + 1, 'warnOnce prints one line per key (' + (T_LOG.warn.length - before) + ')')
  ok(Number(CH.now(ch_p)) === Number(ch_p.level.time) && Number(CH.now(ch_p.level)) === Number(ch_p.level.time), 'now(entity) and now(level) are the level\'s game time (' + CH.now(ch_p) + ')')
  ok(ch_p.level.gameTime === undefined, 'which a script cannot read as level.gameTime (undefined on the engine)')
  var t0 = Number(CH.now(ch_p))
  T_tick(20)
  ok(Number(CH.now(ch_p)) === t0 + 20, 'and it advances with the world (+20 after 20 ticks)')
})
