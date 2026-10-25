// @file kubejs/startup_scripts/loot/lootr_convert_on_open.js
// @events ForgeEvents.onEvent
// @live lootr-converted-on-open
// =============================================================================
// A generated loot chest, barrel or shulker box that a player opens is always a
// Lootr container (loot of its own for every player), also where Lootr's own
// conversion missed it.
// =============================================================================
// WHY (lootr-forge-1.20-0.7.35.94, read from its bytecode; counts from the live
// world's region files, 2026-10-25)
//   Lootr converts a generated container on a server tick once all 25 chunks of
//   the 5x5 around it are loaded FULL at the same time (TileTicker), forgets the
//   entry after max_age (15 min) or at a restart, and queues it again whenever
//   its chunk loads (MixinLevelChunk). On this server (view distance 6, chunk
//   generation slow enough that a pregeneration runs at ~1.4 chunks/s) the 5x5
//   is seldom complete around a player who walks up to a structure, and a player
//   who opens the chest first unpacks the vanilla loot: it is never converted
//   after that. Counted: chunks a player came within 4 chunks of after the 10-25
//   regeneration 70 Lootr containers vs 143 never converted; the long-lived-in
//   base 181 vs 9; the old world's chunks 2,333 vs 51,556.
//
// WHAT THIS DOES
//   A right click by a player (never a FakePlayer: a Create deployer keeps the
//   vanilla behaviour) on a container that still carries its loot table, that
//   Lootr would replace (its own config decides: ConfigManager.replacement,
//   isBlacklisted, isDimensionBlocked, DISABLE), converts it first with the
//   steps of Lootr's TileTicker (the loot table and seed moved over, persistent
//   data and lock code copied, the old container's table cleared first so its
//   removal spills nothing), then opens the Lootr container for that click. A
//   sneaking click with an item in hand converts it and lets the click go on
//   (placing a block against the chest works as before).
//   A container nobody opens is left to Lootr.
//
// NOT COVERED: a container emptied without a right click (a hopper below it, a
// mod pulling its items, breaking it) takes the vanilla loot, as before. The
// seed passes through a JavaScript number (a double): a 64-bit seed can lose its
// last bits, which only changes which random loot is rolled.
//
// ForgeEvents exists in startup scripts only and registers at the first startup
// load: a change to this file needs a restart, not a /reload.
// =============================================================================

;(function () {
  var load = function (name) {
    try {
      return Java.loadClass(name)
    } catch (e) {
      console.error('[lootr_convert_on_open] ' + name + ' does not load (' + e + '): opened chests are left to Lootr alone')
      return null
    }
  }
  var RCBE = load('net.minecraft.world.level.block.entity.RandomizableContainerBlockEntity')
  var LootBE = load('noobanidus.mods.lootr.api.blockentity.ILootBlockEntity')
  var Config = load('noobanidus.mods.lootr.config.ConfigManager')
  var FakePlayer = load('net.minecraftforge.common.util.FakePlayer')
  var ResourceKey = load('net.minecraft.resources.ResourceKey')
  var Registries = load('net.minecraft.core.registries.Registries')
  if (!RCBE || !LootBE || !Config || !FakePlayer || !ResourceKey || !Registries) return

  // The level's dimension key. KubeJS turns its own Level.getDimension() (an id)
  // into the property `dimension`, which hides Minecraft's Level.dimension():
  // calling level.dimension() throws on this engine (seen on the rig).
  var dimensionKey = function (level) {
    return ResourceKey.create(Registries.DIMENSION, level.dimension)
  }

  // The container at `pos` as a Lootr one, if it still carries a loot table and
  // Lootr would replace it. Returns 'converted', or why it was left.
  var convert = function (level, pos) {
    // A right click is always in a loaded chunk; another caller may not be: never load one from here.
    if (!level.hasChunkAt(pos)) return 'its chunk is not loaded'
    var old = level.getBlockEntity(pos)
    if (!old || !(old instanceof RCBE) || old instanceof LootBE) return 'not a container Lootr converts'
    var table = old.lootTable
    if (table == null) return 'no loot table (opened before, or a player chest)'
    if (Config.DISABLE.get() || Config.isDimensionBlocked(dimensionKey(level)) || Config.isBlacklisted(table)) return 'Lootr is off for it'
    var replacement = Config.replacement(level.getBlockState(pos))
    if (replacement == null) return 'Lootr has no replacement for this block'

    var seed = old.lootTableSeed
    old.lootTable = null
    var data = old.getPersistentData()
    var lock = old.lockKey
    level.removeBlock(pos, false)
    level.setBlock(pos, replacement, 2)
    var fresh = level.getBlockEntity(pos)
    if (!fresh || !(fresh instanceof RCBE) || !(fresh instanceof LootBE)) {
      console.error('[lootr_convert_on_open] the replacement ' + replacement + ' at ' + pos + ' is not a Lootr container: the loot table ' + table + ' is lost')
      return 'replacement is not a Lootr container'
    }
    fresh.getPersistentData().merge(data)
    fresh.lockKey = lock
    fresh.setLootTable(table, seed)
    return 'converted'
  }
  // For the offline rig's probe (a server script calls it); nothing else uses it.
  global.icraftLootrConvert = convert

  ForgeEvents.onEvent('net.minecraftforge.event.entity.player.PlayerInteractEvent$RightClickBlock', icraft.guard('loot/lootr_convert_on_open', 'ForgeEvents.onEvent', function (event) {
    if (event.isCanceled()) return
    var level = event.getLevel()
    if (level.isClientSide()) return
    var player = event.getEntity()
    if (!player || player instanceof FakePlayer) return
    var pos = event.getPos()
    if (!level.hasChunkAt(pos) || convert(level, pos) !== 'converted') return
    icraft.live.fired('lootr-converted-on-open')
    // A sneaking click with an item is the item's: vanilla goes on with it.
    if (player.isSecondaryUseActive() && !(player.getMainHandItem().isEmpty() && player.getOffhandItem().isEmpty())) return
    // The click was aimed at the old block: open the new one for it instead.
    var result = level.getBlockState(pos).use(level, player, event.getHand(), event.getHitVec())
    event.setCanceled(true)
    event.setCancellationResult(result)
  }))
})()
