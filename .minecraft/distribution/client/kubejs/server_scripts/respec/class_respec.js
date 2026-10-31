// @file kubejs/server_scripts/respec/class_respec.js
// @events ItemEvents.rightClicked, PlayerEvents.loggedOut, ServerEvents.loaded, ServerEvents.recipes, tick.player, tick.server
// =============================================================================
// IridescentCraft — Class Respec Station
// File: kubejs/server_scripts/respec/class_respec.js
//
// Design Doc Part III: Respec Rules
//   Race: Permanent. Cannot be changed.
//   Class: Respec-able. Cost: 1 boss drop (tier-appropriate) + 30 XP levels.
//          Can only respec at a specific crafted station (Class Altar).
//   Skills: no respec (see SKILL-POINT TRIGGER below; Pufferfish Skills 0.17.3
//          resets a tree only by operator command).
//
// HOW THE ALTAR WORKS (icraft:class_altar, an item; hold it in the main hand
// and a boss trophy in the offhand, then right-click):
//   1. Validate -- nothing is consumed yet:
//        a. offhand holds one of TROPHIES
//        b. the player has XP_COST levels
//        c. the player currently HAS a class (nothing to respec otherwise)
//   2. Run `origin gui <player> origins:class`. That one Origins command sets
//      the class layer to origins:empty AND opens the class picker
//      (OriginCommand.openLayerScreen, origins-forge 1.10.0.9).
//   3. Confirm the layer really is empty now (fresh read through
//      global.icraft.origin). If it is not, tell the player and stop: nothing
//      has been consumed.
//   4. Only now take 1 trophy + XP_COST levels.
//   5. Watch the player once a second (fresh read each time) until the new
//      class shows up, so every class system sees it the moment it is picked
//      instead of one resolver TTL (5 s) later.
//
// 2026-10-10 -- what was wrong before (the altar ate the trophy and 30 levels
// and did nothing):
//   * the Origins layer was written `icraft:class` and the empty origin
//     `icraft:empty`. Neither exists: the layer is `origins:class`
//     (iridescent-origins-mod data/origins/origin_layers/class.json) and the
//     empty origin is Origins' own `origins:empty`. Both commands failed to
//     parse, runCommandSilent returned 0, and the cost was taken BEFORE either
//     command ran.
//   * every trophy / recipe ingredient used an `icraft:` namespace. The boss
//     materials are KubeJS items (`kubejs:lich_soul`, ...; see
//     startup_scripts/custom_items.js), so no trophy ever matched and the
//     three altar recipes had an empty ingredient. Only the altar itself is
//     `icraft:class_altar`.
//
// SKILL-POINT TRIGGER (`/trigger icraft_respec_skill`) -- NOT WIRED, on purpose.
//   The old handler took 5 levels and ran `puffish_skills points add <player> 1`.
//   That command needs a category (`points add <players> <category> <count>`;
//   the pack has six trees), so it never parsed: 5 levels for nothing. And had
//   it parsed it would have SOLD a skill point for 5 levels, which the Codex
//   rules out ("No XP-for-points"). Which tree a refund touches, and whether a
//   refund removes a spent point, is a design call nobody has made. Until it is
//   made the trigger answers "not available" and takes nothing. (It was never
//   reachable in play anyway: nothing enables the trigger objective.)
//
// Whole file is one IIFE: server scripts share a single Rhino scope.
// =============================================================================

;(function () {
  var ALTAR = 'icraft:class_altar'
  // Origins layer + origin ids (see header). The picker lists the 13 classes of
  // the layer; `origins:empty` is what a layer holds while nothing is chosen.
  var CLASS_LAYER = 'origins:class'
  var XP_COST = 30
  // How long (in 1 s polls) the new-class watch keeps doing fresh reads.
  var WATCH_POLLS = 600

  // Six boss materials. All `kubejs:` items (startup_scripts/custom_items.js).
  // 2026-10-18 (decision list entry 14 (b), on recommendation): the three
  // legacy progression tokens are no longer accepted (nothing in the pack
  // gives them), and the hint below names the six instead of promising "any".
  var TROPHIES = [
    'kubejs:lich_soul', 'kubejs:harbinger_eye', 'kubejs:dragon_heart',
    'kubejs:dragon_scale', 'kubejs:nether_soul_fragment',
    'kubejs:condensed_blaze_essence'
  ]
  var IS_TROPHY = {}
  TROPHIES.forEach(function (id) { IS_TROPHY[id] = true })

  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnKeyed = function (key, message) {
    global.icraft.core.warnOnce('respec/class_respec:' + key, '[class_respec] ' + message)
  }

  var tell = function (player, message) {
    try { player.tell(message) } catch (e) {}
  }

  var TAG = '§6§lClass Altar: §r'

  // ── Class Altar recipes ─────────────────────────────────────────────────────
  // Anvil + boss material + gold. One recipe per boss-material tier. The T2
  // path uses deepslate instead of obsidian (obsidian needs a T3 diamond
  // pickaxe; T2 players can't mine it).
  ServerEvents.recipes(icraft.guard('respec/class_respec', 'ServerEvents.recipes', function (event) {
    event.shaped(ALTAR, [
      'GBG',
      'GAG',
      'DDD'
    ], {
      G: 'minecraft:gold_ingot',
      B: 'kubejs:lich_soul',       // T2 boss material (Twilight Lich)
      A: 'minecraft:anvil',
      D: 'minecraft:deepslate'
    }).id('icraft:class_altar_recipe')

    event.shaped(ALTAR, [
      'GBG',
      'GAG',
      'OOO'
    ], {
      G: 'minecraft:gold_ingot',
      B: 'kubejs:harbinger_eye',   // T3 boss material (Cataclysm)
      A: 'minecraft:anvil',
      O: 'minecraft:obsidian'
    }).id('icraft:class_altar_recipe_t3')

    event.shaped(ALTAR, [
      'GBG',
      'GAG',
      'OOO'
    ], {
      G: 'minecraft:gold_ingot',
      B: 'kubejs:dragon_heart',    // T4 boss material (Ender Dragon)
      A: 'minecraft:anvil',
      O: 'minecraft:obsidian'
    }).id('icraft:class_altar_recipe_t4')
  }))

  // ── Class lookup ────────────────────────────────────────────────────────────
  // -> { known: <resolver available>, id: 'icraft:archmage' | null }
  // fresh = true drops the resolver's cached answer first (one player.nbt read).
  var readClass = function (player, fresh) {
    var out = { known: false, id: null }
    try {
      var api = global.icraft ? global.icraft.origin : null
      if (!api) return out
      if (fresh) api.invalidate(player)
      var id = api.get(player, 'class')
      out.known = true
      out.id = id ? String(id) : null
    } catch (e) {
      warnKeyed('resolver', 'class lookup failed: ' + e)
    }
    return out
  }

  var invalidateClass = function (player) {
    try {
      if (global.icraft && global.icraft.origin) global.icraft.origin.invalidate(player)
    } catch (e) {}
  }

  // 'icraft:void_summoner' -> 'Void Summoner'
  var prettyClass = function (id) {
    var s = String(id)
    s = s.substring(s.indexOf(':') + 1)
    return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase() })
  }

  // Reset the class layer and open the picker. true only when the reset is
  // confirmed (see header, steps 2-3).
  var resetClassLayer = function (player) {
    var ran = 0
    try {
      ran = Number(player.server.runCommandSilent('origin gui ' + player.username + ' ' + CLASS_LAYER))
    } catch (e) {
      warnKeyed('command', '`origin gui` threw: ' + e)
      return false
    }
    if (!(ran > 0)) {
      warnKeyed('command0', '`origin gui <player> ' + CLASS_LAYER + '` returned 0 (command missing or layer unknown)')
      return false
    }
    var after = readClass(player, true)
    if (after.known && after.id !== null) {
      warnKeyed('noreset', '`origin gui` ran but the class layer still holds ' + after.id)
      return false
    }
    return true
  }

  var takeLevels = function (player, cost, before) {
    try { player.addXPLevels(-cost) } catch (e) { warnKeyed('xp', 'addXPLevels failed: ' + e) }
    var after = before
    try { after = Number(player.xpLevel) } catch (e2) {}
    if (!(after <= before - cost)) {
      // Something vetoed the level change (it is a cancellable Forge event).
      // The respec already happened, so set the level directly.
      try { player.setXpLevel(Math.max(0, before - cost)) } catch (e3) {
        warnKeyed('xpset', 'could not take ' + cost + ' levels: ' + e3)
      }
    }
  }

  // ── Players who are choosing a new class right now ─────────────────────────
  // uuid -> { left: <polls remaining>, from: <old class id or null> }
  var pending = {}
  var pendingCount = 0
  var uuidKey = function (player) { return String(player.uuid) }
  var clearPending = function (key) {
    if (pending.hasOwnProperty(key)) { delete pending[key]; pendingCount-- }
  }

  var useAltar = function (player) {
    var key = uuidKey(player)

    // Already paid and still choosing: just bring the picker back, free.
    if (pending.hasOwnProperty(key)) {
      var again = readClass(player, true)
      if (again.known && again.id === null) {
        try { player.server.runCommandSilent('origin gui ' + player.username + ' ' + CLASS_LAYER) } catch (e) {}
        tell(player, TAG + '§7You are already choosing a class: pick one in the class screen. (No extra cost.)')
        return
      }
      clearPending(key)   // the class arrived between two polls
    }

    // 1a. trophy in the offhand
    var trophy = null
    var trophyId = ''
    try {
      trophy = player.offHandItem
      if (trophy && !trophy.isEmpty()) trophyId = String(trophy.id)
    } catch (e2) { trophyId = '' }
    if (!IS_TROPHY.hasOwnProperty(trophyId)) {
      tell(player, TAG + '§7Hold the altar in your main hand and a boss trophy in your offhand to respec.')
      tell(player, '§7(Lich Soul, Harbinger Eye, Dragon Heart, Dragon Scale, Nether Soul Fragment or Condensed Blaze Essence)')
      return
    }

    // 1b. XP levels
    var levels = 0
    try { levels = Number(player.xpLevel) } catch (e3) { levels = 0 }
    if (!(levels >= XP_COST)) {
      tell(player, TAG + '§7Requires ' + XP_COST + ' XP levels. You have ' + levels + '.')
      return
    }

    // 1c. a class to change
    var current = readClass(player, true)
    if (current.known && current.id === null) {
      tell(player, TAG + '§7You have not chosen a class yet, so there is nothing to respec. Nothing was consumed.')
      return
    }

    // 2-3. reset + confirm. Nothing has been consumed up to here.
    if (!resetClassLayer(player)) {
      tell(player, TAG + '§cThe altar could not reset your class. Nothing was consumed. Please tell an admin.')
      return
    }

    // 4. the respec happened: take the cost.
    try { trophy.shrink(1) } catch (e4) { warnKeyed('trophy', 'could not consume the trophy: ' + e4) }
    takeLevels(player, XP_COST, levels)

    // 5. watch for the new class.
    pending[key] = { left: WATCH_POLLS, from: current.id }
    pendingCount++

    tell(player, '§6§lClass Altar activated! §r§aChoose your new class.')
    tell(player, '§7(Cost: 1 boss trophy + ' + XP_COST + ' XP levels)')
    console.log('[class_respec] ' + player.username + ' respec started (was ' +
      (current.id || 'unknown') + ', paid ' + trophyId + ' + ' + XP_COST + ' levels)')
  }

  // The id filter makes this fire for the altar only (either hand).
  ItemEvents.rightClicked(ALTAR, icraft.guard('respec/class_respec', 'ItemEvents.rightClicked', function (event) {
    var player = event.player
    if (!player) return
    try {
      useAltar(player)
    } catch (e) {
      warnKeyed('use', 'altar use failed: ' + e)
    }
  }))

  // 1 Hz per player, but a no-op unless somebody is choosing a class.
  global.registerPlayerTick('tick_classRespecWatch', 20, 3, function (event) {
    if (pendingCount <= 0) return
    var player = event.player
    if (!player) return
    var key = uuidKey(player)
    if (!pending.hasOwnProperty(key)) return
    var entry = pending[key]
    var now = readClass(player, true)   // leaves the resolver cache fresh
    if (now.known && now.id !== null) {
      clearPending(key)
      tell(player, TAG + '§aYou are now ' + (/^[aeiou]/i.test(prettyClass(now.id)) ? 'an ' : 'a ') +
        prettyClass(now.id) + '.')
      console.log('[class_respec] ' + player.username + ' respec done: ' +
        (entry.from || 'unknown') + ' -> ' + now.id)
      return
    }
    entry.left--
    // Still choosing after WATCH_POLLS: stop the per-second fresh reads. The
    // resolver's own TTL (5 s) picks the new class up from here on.
    if (entry.left <= 0) clearPending(key)
  })

  PlayerEvents.loggedOut(icraft.guard('respec/class_respec', 'PlayerEvents.loggedOut', function (event) {
    try {
      clearPending(uuidKey(event.player))
      invalidateClass(event.player)
    } catch (e) {}
  }))

  // ── Skill-point trigger: not wired (see header) ────────────────────────────
  ServerEvents.loaded(icraft.guard('respec/class_respec', 'ServerEvents.loaded', function (event) {
    event.server.runCommandSilent('scoreboard objectives add icraft_respec_skill trigger')
  }))

  global.tick_skillRespec = function (event) {
    var server = event.server
    var board = null
    var objective = null
    try {
      board = server.scoreboard
      objective = board.getObjective('icraft_respec_skill')
    } catch (e) { return }
    if (!objective) return
    server.players.forEach(function (player) {
      try {
        var name = String(player.username)
        if (!board.hasPlayerScore(name, objective)) return
        var score = board.getOrCreatePlayerScore(name, objective)
        if (!(score.score > 0)) return
        score.score = 0
        // No cost is taken: there is no refund to give yet.
        tell(player, '§e§lSkill respec: §r§7not available yet. No XP levels were taken.')
      } catch (e2) {}
    })
  }
  // offset 34 since 2026-10-30: sixteen functions shared offset 0 and ran in one tick (RAM audit F17)
  global.registerServerTick('tick_skillRespec', 40, 34)

  console.log('[class_respec] loaded — ' + ALTAR + ': 1 trophy (' + TROPHIES.length +
    ' accepted) + ' + XP_COST + ' levels -> `origin gui <player> ' + CLASS_LAYER + '`')
})()
