// =============================================================================
// RELIC BROKER -- the trading layer (Phase B1)
// File: kubejs/server_scripts/economy/relic_broker.js  (mirrored to all 3 distros)
//
// Design: draft-relic-sink-trading + design-evolution 2026-06-14 (later).
// Embodiment: a custom BLOCK (iridescent_relics:relic_broker_stand) that opens a
// vanilla MerchantMenu -- chosen over a vanilla villager because MCA
// (overwriteOriginalVillagers) replaces villagers. The jar provides only the
// Merchant/menu plumbing (com.iridescentcraft.relics.broker.RelicBroker.open);
// THIS file owns the whole catalog (astages tier-gating, buy-relics via the
// Phase-A relicEssenceValue table, B2 rotation/caps) -- every table in script.
//
// On right-click of the Stand we build the interacting player's tier-gated offers
// and open the GUI. Currency-in = Relic Essence; emeralds only for convenience
// goods (S18 doctrine). The Broker also BUYS the boss-signature relics for essence
// (same table as the /icraft relics submit sweep). The bulk relic sink stays the
// submit-sweep; the Broker buys the marquee boss relics for a satisfying hand-over.
//
// ALL PRICES / STOCK / CATALOG PROVISIONAL -> operator feel pass.
// RELOAD-SAFETY: only BlockEvents + ServerEvents (no Forge bus, no item creation).
//
// 2026-10-10 -- the Stand never opened a GUI. Three faults, all fixed here:
//   * `event.cancel()` was the first thing the right-click handler did. On this
//     KubeJS cancel() works by THROWING (EventJS.cancel() throws EventExit), so
//     nothing after it ever ran. The handler now does its work first and
//     cancels as its very last statement, outside the try.
//   * the handler's locals were `const`s inside a `try`, which this Rhino
//     rejects with "redeclaration of var" on every call (same for the restock
//     tick, whose catch swallowed it: the dawn broadcast never fired).
//   * the daily counter lived in two different compounds. The jar's merchant
//     counts trades in the player's FORGE persistent data
//     (ServerPlayer.getPersistentData(), key RelicBroker.TRADES_KEY) and locks
//     the catalog from it; this file reset and displayed
//     `player.persistentData`, which is KubeJS's own compound. So the reset
//     never reached the jar's counter: after 10 purchases the Broker stayed
//     locked for good, and "Purchases left today" always read 10/10. The jar
//     now owns both keys (RelicBroker.beginDay) and keeps them in the
//     player's PlayerPersisted data, so the cap also survives death.
// Whole file is one IIFE (body left at column 0): server scripts share a single
// Rhino scope.
// =============================================================================

;(function () {
// ---- Java plumbing (jar opener + vanilla trade types) ----
var $RelicBroker = Java.loadClass('com.iridescentcraft.relics.broker.RelicBroker')
var $MerchantOffers = Java.loadClass('net.minecraft.world.item.trading.MerchantOffers')
var $MerchantOffer = Java.loadClass('net.minecraft.world.item.trading.MerchantOffer')

var BROKER_BLOCK = 'iridescent_relics:relic_broker_stand'
var ESSENCE = 'iridescent_relics:relic_essence'

// ---- B2: daily cap + rotation -------------------------------------------------
// ~10 purchases/day (operator decision 5). Enforced jar-side in the Merchant's
// notifyTrade (the only place individual Broker trades are observable); THIS file
// resets the counter on a new world day (at open) + shows the player their budget.
// Selling relics back to the Broker is an UNCAPPED sink (does not count).
var BROKER_DAILY_CAP = 10
// Rotating goods (materials + scrolls) show in daily groups: an item with rot:g
// shows on days where (worldDay % BROKER_ROT_GROUPS) === g. Enchant books,
// convenience, and buy-relics always show. PROVISIONAL.
var BROKER_ROT_GROUPS = 2

// ---- Catalog: tier-gated enchant BOOKS (cost in Relic Essence) ---------------
// astages tier unlocks which rows show (T1 utility -> T3 chase -> T4 exclusives
// that are normally untradeable). Levels kept vanilla-valid for v1; Apotheosis
// over-max books can be added in the feel pass. {tier, ench, lvl, cost, stock}.
var BROKER_ENCHANTS = [
  // T1 -- utility
  { tier: 1, ench: 'minecraft:unbreaking',             lvl: 3, cost: 40, stock: 3 },
  { tier: 1, ench: 'minecraft:efficiency',             lvl: 3, cost: 45, stock: 3 },
  { tier: 1, ench: 'minecraft:feather_falling',        lvl: 4, cost: 45, stock: 3 },
  { tier: 1, ench: 'minecraft:respiration',            lvl: 3, cost: 35, stock: 2 },
  { tier: 1, ench: 'minecraft:aqua_affinity',          lvl: 1, cost: 30, stock: 2 },
  { tier: 1, ench: 'minecraft:projectile_protection',  lvl: 3, cost: 40, stock: 2 },
  // T2 -- mid combat / tools
  { tier: 2, ench: 'minecraft:sharpness',              lvl: 4, cost: 90,  stock: 2 },
  { tier: 2, ench: 'minecraft:protection',             lvl: 3, cost: 90,  stock: 2 },
  { tier: 2, ench: 'minecraft:power',                  lvl: 4, cost: 80,  stock: 2 },
  { tier: 2, ench: 'minecraft:looting',                lvl: 2, cost: 110, stock: 2 },
  { tier: 2, ench: 'minecraft:fortune',                lvl: 2, cost: 130, stock: 2 },
  { tier: 2, ench: 'minecraft:fire_aspect',            lvl: 2, cost: 90,  stock: 2 },
  { tier: 2, ench: 'minecraft:depth_strider',          lvl: 3, cost: 70,  stock: 2 },
  // T3 -- chase
  { tier: 3, ench: 'minecraft:sharpness',              lvl: 5, cost: 200, stock: 1 },
  { tier: 3, ench: 'minecraft:protection',             lvl: 4, cost: 200, stock: 1 },
  { tier: 3, ench: 'minecraft:looting',                lvl: 3, cost: 260, stock: 1 },
  { tier: 3, ench: 'minecraft:fortune',                lvl: 3, cost: 300, stock: 1 },
  { tier: 3, ench: 'minecraft:infinity',               lvl: 1, cost: 220, stock: 1 },
  { tier: 3, ench: 'minecraft:silk_touch',             lvl: 1, cost: 200, stock: 1 },
  { tier: 3, ench: 'minecraft:sweeping',               lvl: 3, cost: 150, stock: 1 },
  // T4 -- endgame exclusives (normally untradeable enchants)
  { tier: 4, ench: 'minecraft:mending',                lvl: 1, cost: 350, stock: 1 },
  { tier: 4, ench: 'minecraft:soul_speed',             lvl: 3, cost: 250, stock: 1 },
  { tier: 4, ench: 'minecraft:swift_sneak',            lvl: 3, cost: 250, stock: 1 },
]

// ---- Catalog: useful materials (cost in Relic Essence) -----------------------
// {tier, id, count, cost, stock}. Tetra incl. a boss-ish mat (dragon_sinew) +
// a Warden boss material (kubejs:void_essence) at steep prices; gem dust; arcane
// essence; ISS scrolls are a separate family below.
var BROKER_MATERIALS = [
  { tier: 1, id: 'apotheosis:gem_dust',             count: 4, cost: 25,  stock: 8, rot: 0 },
  { tier: 1, id: 'irons_spellbooks:arcane_essence', count: 8, cost: 30,  stock: 8, rot: 1 },
  { tier: 2, id: 'tetra:geode',                     count: 2, cost: 60,  stock: 4, rot: 0 },
  { tier: 2, id: 'tetra:metal_scrap',               count: 4, cost: 40,  stock: 6, rot: 1 },
  { tier: 3, id: 'tetra:dragon_sinew',              count: 1, cost: 150, stock: 2, rot: 0 }, // boss-tier Tetra mat
  { tier: 3, id: 'kubejs:void_essence',             count: 1, cost: 200, stock: 2, rot: 1 }, // Warden boss material
]

// ---- Catalog: ISS spell scrolls (cost in Relic Essence) ----------------------
// A blank irons_spellbooks:scroll is auto-bound to a random T1 spell the instant
// it enters the player's inventory (server_scripts/randomize_blank_scrolls.js), so
// selling the blank scroll == selling a random spell scroll. {tier,count,cost,stock}.
var BROKER_SCROLLS = [
  { tier: 1, count: 1, cost: 70,  stock: 4, rot: 0 },
  { tier: 2, count: 2, cost: 120, stock: 3, rot: 1 },
]

// ---- Catalog: convenience goods (cost in EMERALDS, S18 doctrine) -------------
// Emeralds are the convenience currency, never progression. {tier, emerald, id, count, stock}.
var BROKER_CONVENIENCE = [
  { tier: 1, emerald: 1, id: 'minecraft:torch',              count: 16, stock: 16 },
  { tier: 1, emerald: 1, id: 'minecraft:bread',              count: 6,  stock: 16 },
  { tier: 1, emerald: 6, id: 'minecraft:experience_bottle',  count: 4,  stock: 8 },
]

// ---- Catalog: the Broker BUYS the boss-signature relics (relic -> essence) ----
// Prices come from the SAME Phase-A table (global.icraftRelicEssenceValue), so the
// Broker and the submit-sweep never diverge. Common artifacts go via the sweep.
var BROKER_BUYS = [
  'iridescent_relics:frostmaw_heart',
  'iridescent_relics:ironheart_cog',
  'iridescent_relics:remnant_relic',
  'iridescent_relics:sunfeather_charm',
  'iridescent_relics:phylactery_shard',
  'iridescent_relics:leviathans_pearl',
  'iridescent_relics:cursed_sigil_pride',
  'iridescent_relics:dragons_eye',
]

// ---- Helpers ----
// astages tier: tier_1 is the baseline everyone sees; 2/3/4 gated by the stage.
// (global.icraft.core.playerTier since 2026-10-13: the same highest-stage read.
// One difference, in a failure only: when AStages cannot be asked it answers
// tier 1 with one warning, where the four calls that stood here threw.)

function brokerEssence(n) { return Item.of(ESSENCE, n) }

function brokerEnchBook(ench, lvl) {
  // lvl carries the 's' short suffix -- vanilla StoredEnchantments expects a ShortTag
  // (matches the proven loot/planetary_loot.js pattern; a bare int can read as blank).
  return Item.of('minecraft:enchanted_book',
    '{StoredEnchantments:[{id:"' + ench + '",lvl:' + lvl + 's}]}')
}

// MerchantOffer(costA, result, maxUses, xp=0, priceMultiplier=0) -- single cost,
// fixed price (no demand/reputation scaling).
function brokerOffer(costStack, resultStack, maxUses) {
  return new $MerchantOffer(costStack, resultStack, maxUses, 0, 0.0)
}

// World-day number (overworld), the daily rotation + cap-reset key.
function brokerDay(server) {
  return Math.floor(Number(server.overworld().getDayTime()) / 24000)
}

// Show predicate: tier-gated, and rotating goods (rot defined) only on their day group.
function brokerShows(entry, tier, day) {
  if (entry.tier > tier) return false
  if (typeof entry.rot === 'number' && (day % BROKER_ROT_GROUPS) !== (entry.rot % BROKER_ROT_GROUPS)) return false
  return true
}

// Build the player's tier-filtered, daily-rotated MerchantOffers.
function brokerBuildOffers(player, day) {
  var tier = global.icraft.core.playerTier(player)
  var offers = new $MerchantOffers()

  BROKER_ENCHANTS.forEach(e => {
    if (brokerShows(e, tier, day)) offers.add(brokerOffer(brokerEssence(e.cost), brokerEnchBook(e.ench, e.lvl), e.stock))
  })
  BROKER_MATERIALS.forEach(m => {
    if (brokerShows(m, tier, day)) offers.add(brokerOffer(brokerEssence(m.cost), Item.of(m.id, m.count), m.stock))
  })
  BROKER_SCROLLS.forEach(s => {
    if (brokerShows(s, tier, day)) offers.add(brokerOffer(brokerEssence(s.cost), Item.of('irons_spellbooks:scroll', s.count), s.stock))
  })
  BROKER_CONVENIENCE.forEach(c => {
    if (brokerShows(c, tier, day)) offers.add(brokerOffer(Item.of('minecraft:emerald', c.emerald), Item.of(c.id, c.count), c.stock))
  })

  // Buy-relics: relic -> essence, priced by the shared Phase-A table. Always shown,
  // UNCAPPED (a sink) -- the jar's notifyTrade does not count buy-backs.
  var valueOf = global.icraftRelicEssenceValue
  if (typeof valueOf === 'function') {
    BROKER_BUYS.forEach(id => {
      var v = 0
      try { v = Number(valueOf(id)) } catch (_) { v = 0 }
      if (v > 0) offers.add(brokerOffer(Item.of(id, 1), brokerEssence(v), 8))
    })
  }

  return offers
}

// ---- Open the Broker GUI on right-click of the Stand --------------------------
// A right-click arrives once per hand. The menu is opened for the MAIN hand
// only, and BOTH hands' events are cancelled (the Stand has no interaction of
// its own, and the held item must not be used / placed against it).
//
// event.cancel() exits the handler by throwing: it is the LAST statement, and
// it is outside the try (inside, the catch would swallow the cancel).
var brokerOpenWarned = false
function brokerOpen(player) {
  // RHINO: plain `var`s -- a `const` inside the try below throws on every call.
  try {
    var day = brokerDay(player.server)
    // Daily reset of the purchase counter. The jar owns both the counter and
    // its day stamp (RelicBroker.beginDay; they live in the player's
    // PlayerPersisted data so that dying does not hand out a fresh cap) and
    // returns the trades already used today.
    var used
    if ($RelicBroker.beginDay) {
      used = Number($RelicBroker.beginDay(player, day))
    } else {
      // Jar older than 2026-10-10: counters at the root of the Forge data.
      var pd = player.forgePersistentData
      // Number() the Java long so the comparison is number-to-number.
      if (Number(pd.getLong('icraft_broker_day')) !== day) {
        pd.putLong('icraft_broker_day', day)
        pd.putInt('icraft_broker_trades', 0)
      }
      used = Number(pd.getInt('icraft_broker_trades'))
    }
    var remaining = Math.max(0, BROKER_DAILY_CAP - used)
    player.tell(Text.gold('[Relic Broker] ').append(Text.gray('Purchases left today: '))
      .append(remaining > 0
        ? Text.aqua(remaining + '/' + BROKER_DAILY_CAP)
        : Text.red('0/' + BROKER_DAILY_CAP + ' (restocks at dawn)')))
    var offers = brokerBuildOffers(player, day)
    $RelicBroker.open(player, offers, null, BROKER_DAILY_CAP) // null title -> jar default "Relic Broker"
  } catch (e) {
    if (!brokerOpenWarned) {
      brokerOpenWarned = true
      console.warn('[RelicBroker] open failed for ' + player.username + ' (logged once): ' + e)
    }
    try { player.tell(Text.red('[Relic Broker] failed to open: ' + e)) } catch (e2) {}
  }
}

// Registered WITH the block id, so the handler only runs for the Stand instead
// of for every block right-click on the server (the id test below stays as a
// belt-and-braces check).
BlockEvents.rightClicked(BROKER_BLOCK, icraft.guard('economy/relic_broker', 'BlockEvents.rightClicked', event => {
  var block = event.block
  if (!block || String(block.id) !== BROKER_BLOCK) return
  var player = event.player
  if (!player) return
  var mainHand = true
  try { mainHand = String(event.hand) !== 'OFF_HAND' } catch (e) { mainHand = true }
  if (mainHand) brokerOpen(player)
  event.cancel()
}))

// ---- B2: daily restock broadcast (via the 0_tick_master registry) -------------
// Detects the world-day rollover and announces a restock once (new rotating stock
// + everyone's daily purchase budget refreshed). global.* persists across /reload,
// so a restart re-seeds the day silently (no spurious broadcast).
global.icraftBrokerRestockTick = function (event) {
  // RHINO: `var`s (the old `const`s inside this try threw on every run and the
  // empty catch hid it, so the broadcast never fired).
  try {
    var server = event.server
    if (!server) return
    var day = brokerDay(server)
    if (global.icraftBrokerLastDay === undefined) { global.icraftBrokerLastDay = day; return }
    if (day !== global.icraftBrokerLastDay) {
      global.icraftBrokerLastDay = day
      server.tell(Text.gold('☼ The Relic Broker has restocked: new rotating stock, and your daily trades are refreshed.'))
    }
  } catch (e) {
    if (!global.icraftBrokerRestockWarned) {
      global.icraftBrokerRestockWarned = true
      console.warn('[RelicBroker] restock tick failed (logged once): ' + e)
    }
  }
}
global.registerServerTick('icraftBrokerRestockTick', 200, 13)

// ---- Recipes: essence block <-> 9 essence, + the T2 Relic Broker Stand --------
ServerEvents.recipes(icraft.guard('economy/relic_broker', 'ServerEvents.recipes', event => {
  // 9 essence -> 1 block (the substantial-cost denominator)
  event.shaped('iridescent_relics:relic_essence_block', ['EEE', 'EEE', 'EEE'], { E: ESSENCE })
    .id('icraft:relic_essence_block_pack')
  // 1 block -> 9 essence
  event.shapeless('9x ' + ESSENCE, ['iridescent_relics:relic_essence_block'])
    .id('icraft:relic_essence_block_unpack')

  // T2 Relic Broker Stand: substantial essence (6 blocks = 54 essence) + steel
  // (the pack's T2 material marker) + an anvil core. PROVISIONAL cost -> feel pass.
  // NOTE: this is a SOFT T2 gate (steel = T2 material); a hard astages USE-restriction
  // on the block can be layered later if the operator wants it strictly locked.
  event.shaped('iridescent_relics:relic_broker_stand', ['ESE', 'EAE', 'ESE'], {
    E: 'iridescent_relics:relic_essence_block',
    S: 'thermal:steel_ingot',
    A: 'minecraft:anvil',
  }).id('icraft:relic_broker_stand_t2')
}))

console.log('[IridescentCraft] Relic Broker loaded (block ' + BROKER_BLOCK + ' -> tier-gated MerchantMenu)')
console.log('  catalog: ' + BROKER_ENCHANTS.length + ' enchant books, ' + BROKER_MATERIALS.length
  + ' materials, ' + BROKER_SCROLLS.length + ' scroll tiers, ' + BROKER_CONVENIENCE.length
  + ' convenience, buys ' + BROKER_BUYS.length + ' boss relics. ALL PROVISIONAL.')
})()
