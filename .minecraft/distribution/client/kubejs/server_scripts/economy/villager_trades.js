// @file kubejs/server_scripts/economy/villager_trades.js
// @events ServerEvents.loaded
// @live villager-trades-filtered
// =============================================================================
// Villagers sell convenience for emeralds: no villager or wandering trader
// sells an enchanted book, diamond or netherite gear, or an item a tier holds back.
// =============================================================================
// The villager rework ("S18" of the design doc, planned 2026-06-14, RULED by
// the operator 2026-10-19: "Go, after tonight's chips"). Emeralds are a
// convenience currency (food, building, light, utility, a little XP), never a
// way past a tier: enchanting is Apotheosis's job and the Relic Broker's, gear
// is the tier ladder's. The June script (`villager_trades.js.disabled`, deleted
// 2026-10-10) never ran: it called ForgeEvents, which KubeJS binds in startup
// scripts only, and it cleared whole levels.
//
// HOW. Forge builds the final trade table at server start
// (VillagerTradingManager, on ServerAboutToStartEvent: the vanilla table, the
// trades MCA put in at common setup, then every mod's VillagerTradesEvent) and
// stores it in VillagerTrades.TRADES / WANDERING_TRADER_TRADES. Villagers read
// that table each time they level up (Villager.updateTrades, which MCA's
// villager does not override). This handler runs once that table is final
// (ServerEvents.loaded), so it sees what every mod added whatever the order of
// their listeners. For each listing it asks the listing for a few offers with a
// stand-in villager (never added to the world) and drops the listing when an
// offer's result is banned (BANNED below). It does not clear a level: the
// other trades of the level stay, MCA's included. ADD puts a convenience
// trade into each smith level that sold diamond gear and the master mason's
// (quartz), and two XP bottle trades on the cleric. Map listings and Iron's
// Spellbooks' random curio are not asked (below); Apotheosis's affix trades
// are judged by the items of their loot entries.
//
// WHAT IT NEVER TOUCHES. A villager keeps the offers it already has: they are
// saved with it and restock as before. Only an offer a villager gets from now on
// (a new villager's first trades, a level-up) comes from the filtered table. So
// a librarian that already sells a Mending book keeps selling it.
//
// Choices made on recommendation, for review (decision list, internal
// design-evolution 2026-10-19): what is banned; the refills in ADD and their
// prices; the cleric's two XP bottle trades (capped at 8 uses); quartz, the
// beacon, the eye of ender and the enchanted golden apple on the ban list;
// enchanted iron tools, bows, crossbows and fishing rods stay (their enchants
// are not treasure; no Mending).
// =============================================================================

;(function () {
  if (!icraft.lib.need('core', 'economy/villager_trades')) return
  var core = global.icraft.core

  // ---- what a villager may not sell (the result of an offer) ----
  // Any enchanted book, from any profession or the wandering trader.
  var BOOK = 'minecraft:enchanted_book'
  // Diamond and netherite gear, and the materials themselves: tier 3 and 4
  // items (gates/astages_restrictions.js). The other tier-gated items the rig
  // found on sale (every result of every table checked against that file on
  // 2026-10-19): quartz blocks (the master mason; quartz is tier 3), a beacon
  // (the wandering trader, 25 emeralds; tier 3) and eyes of ender (the
  // wandering trader, 2 emeralds; tier 4). The enchanted golden apple: the loot
  // overhaul strips it from tier-1 chests with the diamond gear (MCA's
  // adventurer sells one for 32 emeralds). A diamond a player SELLS to a
  // villager (a cost) is not touched.
  var BANNED = core.idSet([
    'minecraft:diamond', 'minecraft:diamond_block',
    'minecraft:diamond_sword', 'minecraft:diamond_pickaxe', 'minecraft:diamond_axe',
    'minecraft:diamond_shovel', 'minecraft:diamond_hoe',
    'minecraft:diamond_helmet', 'minecraft:diamond_chestplate',
    'minecraft:diamond_leggings', 'minecraft:diamond_boots', 'minecraft:diamond_horse_armor',
    'minecraft:netherite_ingot', 'minecraft:netherite_scrap', 'minecraft:netherite_block',
    'minecraft:netherite_sword', 'minecraft:netherite_pickaxe', 'minecraft:netherite_axe',
    'minecraft:netherite_shovel', 'minecraft:netherite_hoe',
    'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
    'minecraft:netherite_leggings', 'minecraft:netherite_boots',
    'minecraft:quartz', 'minecraft:quartz_block', 'minecraft:smooth_quartz', 'minecraft:chiseled_quartz_block',
    'minecraft:quartz_pillar', 'minecraft:quartz_bricks', 'minecraft:quartz_stairs', 'minecraft:quartz_slab',
    'minecraft:smooth_quartz_stairs', 'minecraft:smooth_quartz_slab',
    'minecraft:beacon', 'minecraft:ender_eye',
    'minecraft:enchanted_golden_apple'
  ])

  // ---- convenience trades added: the levels that sold diamond gear or quartz, the cleric's XP ----
  // profession -> level -> [emeralds, item, count, max uses, villager xp]
  var ADD = {
    'minecraft:armorer': {
      4: [[6, 'minecraft:iron_horse_armor', 1, 12, 15]],
      5: [[9, 'minecraft:golden_horse_armor', 1, 12, 30]]
    },
    'minecraft:toolsmith': {
      5: [[12, 'minecraft:anvil', 1, 3, 30]]
    },
    'minecraft:weaponsmith': {
      5: [[5, 'minecraft:shield', 1, 12, 30]]
    },
    // the master mason sold quartz blocks and pillars (tier 3): a white
    // Overworld stone in their place
    'minecraft:mason': {
      5: [[1, 'minecraft:calcite', 4, 12, 30]]
    },
    // XP for emeralds before the master level (vanilla's master cleric sells
    // a bottle for 3); dearer, and 8 a restock.
    'minecraft:cleric': {
      3: [[6, 'minecraft:experience_bottle', 1, 8, 10]],
      4: [[4, 'minecraft:experience_bottle', 1, 8, 15]]
    }
  }

  var SAMPLES = 32          // offers asked of each listing
  var SEED = 1019           // the same answers every boot
  // Listings never asked for an offer (kept, neither is ever banned): a
  // treasure map searches the world for a structure; Iron's Spellbooks' random
  // curio makes Apotheosis roll affixes on it, which logs an ERROR line a
  // curio (a rig boot, 2026-10-19: eight new log signatures).
  var NOT_ASKED = /TreasureMap|AdditionalWanderingTrades\$RandomCurioTrade/
  // Apotheosis's affix trade answers no offer without a player near the
  // trader (so never at server start): it is judged by the items of its loot
  // entries ('diamond_epic' sells epic diamond gear).
  var AFFIX_TRADE = 'dev.shadowsoffire.apotheosis.adventure.affix.trades.AffixTrade'

  var VillagerTrades = Java.loadClass('net.minecraft.world.entity.npc.VillagerTrades')
  var VillagerData = Java.loadClass('net.minecraft.world.entity.npc.VillagerData')
  var VillagerType = Java.loadClass('net.minecraft.world.entity.npc.VillagerType')
  var RandomSource = Java.loadClass('net.minecraft.util.RandomSource')
  var BuiltInRegistries = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')
  var ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var BasicItemListing = Java.loadClass('net.minecraftforge.common.BasicItemListing')
  var ItemStack = Java.loadClass('net.minecraft.world.item.ItemStack')
  var Arrays = Java.loadClass('java.util.Arrays')
  // A fastutil Int2ObjectMap (the per-level table) must never be touched from a
  // script: Rhino wraps it as a JS map, looks every method name up as a key, and
  // its containsKey(String) throws a ClassCastException that no try / catch and
  // no icraft.guard stops (it aborted the probe of this chip). Walk it through
  // fastutil's static helper instead; its entries are plain objects.
  var Int2ObjectMaps = Java.loadClass('it.unimi.dsi.fastutil.ints.Int2ObjectMaps')

  var judge = function (id) {
    if (id === BOOK) return 'book'
    if (BANNED.has(id)) return 'item'
    return null
  }

  // an affix trade: the item of each of its loot entries
  var affixVerdict = function (listing, profId) {
    try {
      var field = listing.getClass().getDeclaredField('entries')
      field.setAccessible(true)
      var entries = field.get(listing)
      for (var i = 0; i < entries.size(); i++) {
        var holder = entries.get(i)
        if (!holder.isBound()) continue
        var v = judge(String(BuiltInRegistries.ITEM.getKey(holder.get().getStack().getItem())))
        if (v) return v
      }
    } catch (e) {
      core.warnOnce('villager_trades:affix', '[villager_trades] an Apotheosis affix trade of ' + profId + ' could not be read and is kept: ' + e)
    }
    return null
  }

  // 'book', 'item' (a banned result) or null (kept); a listing that cannot be asked is kept
  var verdict = function (listing, trader, profId) {
    var cls = String(listing.getClass().getName())
    if (NOT_ASKED.test(cls)) return null
    if (cls === AFFIX_TRADE) return affixVerdict(listing, profId)
    for (var i = 0; i < SAMPLES; i++) {
      var offer = null
      try {
        offer = listing.getOffer(trader, RandomSource.create(SEED + i))
      } catch (e) {
        core.warnOnce('villager_trades:' + cls, '[villager_trades] a ' + profId + ' listing (' + cls + ') could not be asked for an offer and is kept: ' + e)
        return null
      }
      if (!offer) continue
      var v = judge(String(BuiltInRegistries.ITEM.getKey(offer.getResult().getItem())))
      if (v) return v
    }
    return null
  }

  var listingsFor = function (rows) {
    return rows.map(function (r) {
      return new BasicItemListing(Item.of('minecraft:emerald', r[0]), ItemStack.EMPTY, Item.of(r[1], r[2]), r[3], r[4], 0.05)
    })
  }

  // one level of one table: filter, add, write back
  var filterLevel = function (entry, trader, profId, adds, totals) {
    var arr = entry.getValue()
    if (arr == null) return
    var keep = []
    var removed = 0
    for (var i = 0; i < arr.length; i++) {
      var v = verdict(arr[i], trader, profId)
      if (v) { removed++; totals[v]++ } else keep.push(arr[i])
    }
    var extra = adds ? listingsFor(adds) : []
    if (!removed && !extra.length) return
    var all = keep.concat(extra)
    var out = Arrays.copyOf(arr, all.length)
    for (var j = 0; j < all.length; j++) out[j] = all[j]
    entry.setValue(out)
    totals.added += extra.length
    totals.lines.push(profId + ' L' + entry.getIntKey() + ': ' + arr.length + ' -> ' + all.length)
  }

  ServerEvents.loaded(icraft.guard('economy/villager_trades', 'ServerEvents.loaded', function (event) {
    var started = Date.now()
    var level = event.server.overworld()
    // the stand-in a listing may read (its level, its villager type); never added to the world
    var trader = BuiltInRegistries.ENTITY_TYPE.get(new ResourceLocation('minecraft:villager')).create(level)
    var totals = { book: 0, item: 0, added: 0, lines: [] }
    var it = VillagerTrades.TRADES.entrySet().iterator()
    while (it.hasNext()) {
      var e = it.next()
      var prof = e.getKey()
      var profId = String(BuiltInRegistries.VILLAGER_PROFESSION.getKey(prof))
      trader.setVillagerData(new VillagerData(VillagerType.PLAINS, prof, 5))
      var levels = Int2ObjectMaps.fastIterator(e.getValue())
      while (levels.hasNext()) {
        var lv = levels.next()
        filterLevel(lv, trader, profId, ADD[profId] && ADD[profId][lv.getIntKey()], totals)
      }
    }
    var wander = Int2ObjectMaps.fastIterator(VillagerTrades.WANDERING_TRADER_TRADES)
    while (wander.hasNext()) filterLevel(wander.next(), trader, 'minecraft:wandering_trader', null, totals)
    trader.discard()
    console.info('[villager_trades] removed ' + (totals.book + totals.item) + ' listings (' + totals.book + ' enchanted books, ' +
      totals.item + ' tier items: diamond, netherite, quartz, beacon, eye of ender, notch apple), added ' + totals.added + ', in ' + (Date.now() - started) + ' ms: ' + totals.lines.join('; '))
    icraft.live.fired('villager-trades-filtered')
  }))
})()
