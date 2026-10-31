// @file kubejs/server_scripts/compat/ultris_player_checks.js
// @events tick.server
// @live ultris-clock-work, ultris-player-checks
// =============================================================================
// Ultris' charm, Ominous Pearl advancements, conqueror music and helmet
// conversion work as before, without saving every online player's NBT several
// times a tick to look at their inventory.
// =============================================================================
// RAM and lag audit 2026-10-30, Ultris option A1-lite of
// reports/datapack-bosses-scope.md (internal repo, dev/ram-audit-2026-10-30).
// Ultris 5.6.9c (All Rights Reserved) tests inventories with `nbt=` selectors,
// and such a selector saves the whole NBT of what it tests (a player carries the
// capabilities of about 450 mods): about 2.8 saves per online player per tick.
// Our copies of three of its functions are empty (kubejs/data/1_splatus/
// functions/ultris/completed_advancement, clocks/5_tick and clocks/20_tick).
// This file does their work at the end of the tick, reads slots and stacks
// directly, and calls Ultris' own function ids for everything that acts:
//
//   every tick Ultris' clock ran (its score count_hourly moved):
//     - grant 1_splatus:ultris/root to a player without it;
//     - an Ominous Pearl (an ender eye, or a command block, named so with
//       Unbreaking I) anywhere in the inventory grants
//       1_splatus:ultris/sanctum/eye_of_ender, or 1_splatus:ultris/command;
//     - on the tick its 5-tick clock reads 1: function
//       1_splatus:ultris/other/check_advancement;
//     - 1_splatus:ultris/completed done and no tag ultris_completed_all_bosses:
//       Ultris' two conqueror music functions as and at the player, then the
//       tag; a player who no longer has it done loses the tag. The same for
//       completed_ultra, which no Ultris file defines: as in a selector, a
//       missing advancement is neither done nor not done, so nothing happens;
//   the tick its 5-tick clock reached 5:
//     - the charm (an enchanted book with UltrisEnchantedCharm:1) in the
//       inventory and no tag ultris_hascharm: 1_splatus:ultris/wither/has_charm
//       as and at the player; no charm and the tag: has_charm_lol_not as the
//       player;
//     - a netherite helmet item with ShulkerShellHelmet:1 whose block below
//       (0.05 under it) is not in #1_splatus:ultris/permeable:
//       1_splatus:ultris/other/misc/convert_netherite as and at the item;
//     - the clock back to 0;
//   the tick its 1-second clock reached 20:
//     - the mobGriefing game rule into gamerule_mobGriefing (datasettings);
//     - every player's UUID into ultris_uuid1..4;
//     - the clock back to 0.
//
// Why that is the same (every Ultris line on the way read, 2026-10-30):
//   - a match is the selector's own: the item id, then NbtUtils.compareNbt(..,
//     partial), the comparison an `nbt=` selector makes, over all 41 slots (a
//     player's Inventory NBT lists the armour and the off hand too);
//   - the clocks: until the end of the tick the 5-tick clock reads 5 where
//     Ultris read 0, and the 1-second clock 20 where it read 0. Every Ultris
//     line that reads them tests 1, 2, 3 or 1..2 (5tick) and 1 (1sec);
//   - Ultris' tick not running (taken out of the tick tag) does none of this,
//     as before: the work follows Ultris' own clock.
// What moves: the work runs at the end of the tick, not inside Ultris' tick
// function. A charm picked up, a pearl or a kill shows up to one tick earlier or
// later, and the conqueror music starts one tick (50 ms) later.
// What is gone: a fail-open. If this file stops, the charm, the pearl
// advancements, the music and Ultris' 5-tick and 1-second clocks stop with it
// (the tick master logs the failing function once a minute). A fallback would
// restate Ultris' lines in our files, and that is an open licensing decision.
// The interop facts named above (item ids, NBT keys, the pearl's name, the
// block tag) are written here; Ultris' function text is not.
// =============================================================================
;(function () {
  if (!icraft.lib.need('core', 'compat/ultris_player_checks') ||
      !icraft.lib.need('ticks', 'compat/ultris_player_checks')) return
  var core = global.icraft.core

  var NbtUtils = Java.loadClass('net.minecraft.nbt.NbtUtils')
  var CompoundTag = Java.loadClass('net.minecraft.nbt.CompoundTag')
  var ListTag = Java.loadClass('net.minecraft.nbt.ListTag')
  var EntityType = Java.loadClass('net.minecraft.world.entity.EntityType')
  var GameRules = Java.loadClass('net.minecraft.world.level.GameRules')
  var UUIDUtil = Java.loadClass('net.minecraft.core.UUIDUtil')
  var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var Items = Java.loadClass('net.minecraft.world.item.Items')
  var HashSet = Java.loadClass('java.util.HashSet')
  var Predicate = Java.loadClass('java.util.function.Predicate')

  var CLOCK = 'ultris_clock'
  var id = function (path) { return new ResourceLocation('1_splatus', path) }
  var ROOT = id('ultris/root')
  var EYE = id('ultris/sanctum/eye_of_ender')
  var COMMAND = id('ultris/command')
  var COMPLETED = id('ultris/completed')
  var COMPLETED_ULTRA = id('ultris/completed_ultra')
  var PERMEABLE = id('ultris/permeable')
  var TAG_CHARM = 'ultris_hascharm'
  var TAG_ALL = 'ultris_completed_all_bosses'
  var TAG_ULTRA = 'ultris_completed_all_bosses_ultra'

  // what the selectors look for in a stack's NBT (compared partially, as `nbt=` does)
  var intFlag = function (key) {
    var t = new CompoundTag()
    t.putInt(key, 1)
    return t
  }
  var CHARM = intFlag('UltrisEnchantedCharm')
  var SHULKER_HELMET = intFlag('ShulkerShellHelmet')
  var PEARL = (function () {
    var t = new CompoundTag()
    var display = new CompoundTag()
    display.putString('Name', '{"translate":"Ominous Pearl","color":"light_purple","italic":true}')
    t.put('display', display)
    var unbreaking = new CompoundTag()
    unbreaking.putString('id', 'minecraft:unbreaking')
    unbreaking.putShort('lvl', 1)
    var list = new ListTag()
    list.add(unbreaking)
    t.put('Enchantments', list)
    return t
  })()
  var itemSet = function (items) {
    var s = new HashSet()
    for (var i = 0; i < items.length; i++) s.add(items[i])
    return s
  }
  var BOOKS = itemSet([Items.ENCHANTED_BOOK])
  var PEARL_ITEMS = itemSet([Items.ENDER_EYE, Items.COMMAND_BLOCK])

  // Container.hasAnyOf runs over the slots in Java: a quick no before the slot loop
  var prefilter = true
  var mayHold = function (inv, items) {
    if (!prefilter) return true
    try {
      return inv.hasAnyOf(items) === true
    } catch (e) {
      prefilter = false
      core.warnOnce('ultris_player_checks:hasAnyOf', '[ultris_player_checks] Container.hasAnyOf() is not reachable, every slot is read instead: ' + e)
      return true
    }
  }
  // a slot of the 41 holding `itemId` whose NBT holds `expected`
  var holds = function (inv, itemId, expected) {
    var n = inv.getSlots()
    for (var i = 0; i < n; i++) {
      var stack = inv.getStackInSlot(i)
      if (stack.isEmpty() || String(stack.id) !== itemId) continue
      if (NbtUtils.compareNbt(expected, stack.nbt, true)) return true
    }
    return false
  }

  // a score's value, or null when the holder has none (never creates one)
  var scoreOf = function (board, obj, holder) {
    if (obj === null || !board.hasPlayerScore(holder, obj)) return null
    return Number(board.getOrCreatePlayerScore(holder, obj).getScore())
  }
  var setScore = function (board, obj, holder, value) {
    board.getOrCreatePlayerScore(holder, obj).setScore(value)
  }

  // 1 done, 0 not done, -1 no such advancement (a selector then matches neither)
  var advState = function (server, player, adv) {
    var a = server.getAdvancements().getAdvancement(adv)
    if (a === null) return -1
    return player.getAdvancements().getOrStartProgress(a).isDone() ? 1 : 0
  }
  // the command Ultris uses, so the grant takes the same path (criteria, toasts, events)
  var grant = function (server, player, adv) {
    server.runCommandSilent('advancement grant ' + String(player.uuid) + ' only ' + adv)
  }
  var runAs = function (server, entity, at, fn) {
    server.runCommandSilent('execute as ' + String(entity.uuid) + (at ? ' at @s' : '') + ' run function ' + fn)
  }
  var conquerorMusic = function (server, player) {
    runAs(server, player, true, '1_splatus:ultris/music/play_ultrisconqueror')
    runAs(server, player, true, '1_splatus:ultris/music/play_ultrisconqueror2')
  }

  var isShulkerHelmet = new Predicate({
    test: function (entity) {
      try {
        var stack = entity.item
        if (!stack || stack.isEmpty() || String(stack.id) !== 'minecraft:netherite_helmet') return false
        return NbtUtils.compareNbt(SHULKER_HELMET, stack.nbt, true)
      } catch (e) {
        core.warnOnce('ultris_player_checks:item', '[ultris_player_checks] an item entity could not be read (it is not converted): ' + e)
        return false
      }
    }
  })

  // set by the clock function each tick, read by the three after it
  var state = { five: false, second: false, ran: false, lastHourly: null }

  // 1. Ultris' clocks: the two resets its empty 5_tick and 20_tick no longer make
  global.registerServerTick('tick_ultrisClocks', 1, 0, function (event) {
    state.five = state.second = state.ran = false
    var board = event.server.getScoreboard()
    var clock = board.getObjective(CLOCK)
    if (clock === null) return  // Ultris' clock has never run in this world
    var five = scoreOf(board, clock, '5tick')
    if (five !== null && five >= 5) { setScore(board, clock, '5tick', 0); state.five = true }
    var sec = scoreOf(board, clock, '1sec')
    if (sec !== null && sec >= 20) { setScore(board, clock, '1sec', 0); state.second = true }
    var hourly = scoreOf(board, clock, 'count_hourly')
    state.ran = hourly !== null && hourly !== state.lastHourly
    state.lastHourly = hourly
    if (state.five || state.second) icraft.live.fired('ultris-clock-work')
  })

  // 2. clocks/5_tick: the charm, then the netherite Shulker Shell helmets on the ground
  global.registerServerTick('tick_ultrisFiveTick', 1, 0, function (event) {
    if (!state.five) return
    var server = event.server
    var players = server.getPlayerList().getPlayers()
    for (var i = 0; i < players.size(); i++) {
      var player = players.get(i)
      var inv = player.getInventory()
      var charm = mayHold(inv, BOOKS) && holds(inv, 'minecraft:enchanted_book', CHARM)
      var tagged = player.getTags().contains(TAG_CHARM)
      if (charm && !tagged) runAs(server, player, true, '1_splatus:ultris/wither/has_charm')
      else if (!charm && tagged) runAs(server, player, false, '1_splatus:ultris/wither/has_charm_lol_not')
    }
    var levels = server.getAllLevels().iterator()
    while (levels.hasNext()) {
      var level = levels.next()
      var found = level.getEntities(EntityType.ITEM, isShulkerHelmet) // CI-ignore: isShulkerHelmet is a java.util.function.Predicate built above, passed as a value
      for (var j = 0; j < found.size(); j++) {
        var item = found.get(j)
        var below = core.blockIfLoaded(level, item.getX(), item.getY() - 0.05, item.getZ())
        if (below === null || below.hasTag(PERMEABLE)) continue
        runAs(server, item, true, '1_splatus:ultris/other/misc/convert_netherite')
      }
    }
  })

  // 3. clocks/20_tick: the game rule and the UUID scores
  global.registerServerTick('tick_ultrisOneSecond', 1, 0, function (event) {
    if (!state.second) return
    var server = event.server
    var board = server.getScoreboard()
    var settings = board.getObjective('datasettings')
    if (settings !== null) {
      setScore(board, settings, 'gamerule_mobGriefing', server.getGameRules().getBoolean(GameRules.RULE_MOBGRIEFING) ? 1 : 0)
    }
    var objs = []
    for (var k = 1; k <= 4; k++) objs.push(board.getObjective('ultris_uuid' + k))
    var players = server.getPlayerList().getPlayers()
    for (var i = 0; i < players.size(); i++) {
      var player = players.get(i)
      var ints = UUIDUtil.uuidToIntArray(player.getUuid())
      var name = String(player.username)  // a player's score holder is its profile name
      for (var j = 0; j < 4; j++) if (objs[j] !== null) setScore(board, objs[j], name, ints[j])
    }
  })

  // 4. completed_advancement, in its order: root, the pearls, check_advancement, the music
  global.registerServerTick('tick_ultrisEveryTick', 1, 0, function (event) {
    if (!state.ran) return
    var server = event.server
    var players = server.getPlayerList().getPlayers()
    for (var i = 0; i < players.size(); i++) {
      var player = players.get(i)
      if (advState(server, player, ROOT) === 0) grant(server, player, ROOT)
      var needEye = advState(server, player, EYE) === 0
      var needCommand = advState(server, player, COMMAND) === 0
      if (!needEye && !needCommand) continue
      var inv = player.getInventory()
      if (!mayHold(inv, PEARL_ITEMS)) continue
      if (needEye && holds(inv, 'minecraft:ender_eye', PEARL)) grant(server, player, EYE)
      if (needCommand && holds(inv, 'minecraft:command_block', PEARL)) grant(server, player, COMMAND)
    }
    var board = server.getScoreboard()
    if (scoreOf(board, board.getObjective(CLOCK), '5tick') === 1) {
      server.runCommandSilent('function 1_splatus:ultris/other/check_advancement')
    }
    for (var p = 0; p < players.size(); p++) {
      var who = players.get(p)
      var tags = who.getTags()
      var all = advState(server, who, COMPLETED)
      var ultra = advState(server, who, COMPLETED_ULTRA)
      if (all === 1 && !tags.contains(TAG_ALL)) { conquerorMusic(server, who); who.addTag(TAG_ALL) }
      if (ultra === 1 && !tags.contains(TAG_ULTRA)) { conquerorMusic(server, who); who.addTag(TAG_ULTRA) }
      if (ultra === 0 && tags.contains(TAG_ULTRA)) who.removeTag(TAG_ULTRA)
      if (all === 0 && tags.contains(TAG_ALL)) who.removeTag(TAG_ALL)
    }
    if (players.size() > 0) icraft.live.fired('ultris-player-checks')
  })
})()
