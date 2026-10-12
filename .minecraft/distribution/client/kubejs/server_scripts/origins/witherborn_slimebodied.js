// =============================================================================
// WITHERBORN & SLIMEBODIED — Custom Origin Mechanics
// =============================================================================
// Origin detection: global.icraft.origin (0_lib_origins.js) -- cached, so the
// per-hit / per-right-click / per-inventory-change handlers below run no
// commands. The old `execute if entity <name>[nbt=...]` probe never parsed, so
// none of this ran before 2026-10 (it did cost one failed command per hit, per
// right-click and per inventory change, for every player).
// =============================================================================

;(function () {
  // ── Helpers ──
  var originOf = function (player) {
    try { return global.icraft.origin.get(player, 'origin') } catch (e) { return null }
  }

  var warned = {}
  var warnOnce = function (where, e) {
    if (warned[where]) return
    warned[where] = true
    console.warn('[witherborn_slimebodied] ' + where + ' threw (logged once): ' + e)
  }

  // ===========================================================================
  // WITHERBORN — Wither on hit
  // ===========================================================================
  // Applied straight to the entity that was hit. (The original ran an
  // `execute at <player> run effect give @e[distance=..3,sort=nearest,limit=1]`
  // command per hit, which withered whatever happened to be nearest the
  // PLAYER -- a dropped item, an arrow, a pet -- not the target.)

  EntityEvents.hurt(icraft.guard('origins/witherborn_slimebodied', 'EntityEvents.hurt', function (event) {
    try {
      var source = event.source
      if (!source) return
      var player = source.player
      if (!player) return
      if (originOf(player) !== 'icraft:witherborn') return

      var target = event.entity
      if (!target || target.player) return  // Don't wither other players... or should we?

      // Wither II for 5 seconds
      target.potionEffects.add('minecraft:wither', 100, 1, false, true)
    } catch (e) {
      warnOnce('wither-on-hit', e)
    }
  }))

  // ===========================================================================
  // TICK-BASED MECHANICS
  // ===========================================================================

  global.tick_witherbornSlimebodied = function (event) {
    event.server.players.forEach(function (player) {
      try {
        var origin = originOf(player)

        // ── WITHERBORN: hunger-scaling damage PENALTY (opposite of Orc) ──
        // Full food = full damage. Starving = -50% damage.
        if (origin === 'icraft:witherborn') {
          var wbFood = player.foodLevel  // 0-20

          // Scale: 0% penalty at food 20, -50% at food 0
          var hungerPenalty = Math.max(0, (20 - wbFood) / 20) * -0.50

          // ported to modifyAttribute (old /attribute = unparseable 1.21 syntax)
          player.modifyAttribute('minecraft:generic.attack_damage',
            'icraft_witherborn_weakness', hungerPenalty < -0.01 ? hungerPenalty : 0, 'multiply_base')
          return
        }

        // ── SLIMEBODIED: satiety-based damage reduction ──
        if (origin === 'icraft:slimebodied') {
          var foodLevel = player.foodLevel  // 0-20

          // Satiety floor: can't go below 25% (food level 5)
          if (foodLevel < 5) {
            player.foodLevel = 5
            foodLevel = 5
          }

          // DR scales: 0% at food 5 (minimum), 25% at food 20 (full)
          // Effective range: 5-20 = 15 levels
          var drLevel = Math.max(0, (foodLevel - 5) / 15) * 0.25

          // Use armor as DR proxy — add flat armor based on satiety
          // 25% DR ≈ +8 armor points at typical damage values
          player.modifyAttribute('minecraft:generic.armor',
            'icraft_slime_dr', drLevel > 0.05 ? drLevel * 32 : 0, 'addition')

          // Slow metabolism: reduce hunger drain
          // The origins:exhaust power handles base drain, but we also
          // need to handle idle drain. Periodically restore a tiny bit
          // of food to counteract idle drain
          if (foodLevel > 5) {
            // The base game drains ~0.005 exhaustion per tick when idle
            // We compensate by occasionally adding saturation
            var sat = player.saturation
            if (sat < 1.0) {
              player.saturation = Math.min(20, sat + 0.2)
            }
          }

          // Keep the food-cooldown baseline honest: the tracker below only
          // samples on inventory changes, so hunger lost in between left the
          // baseline too high and the next meal (e.g. 15 -> 19 against a stale
          // 20) was never seen as "ate something".
          var data = player.persistentData
          if (foodLevel < data.getInt('icraft_slime_last_food')) {
            data.putInt('icraft_slime_last_food', foodLevel)
          }
        }
      } catch (e) {
        warnOnce('tick', e)
      }
    })
  }
  global.registerServerTick('tick_witherbornSlimebodied', 100, 35)

  // ── SLIMEBODIED: Food cooldown (10 seconds) ──
  // In-memory, keyed by username, stamped with server.tickCount: the map and
  // the counter both reset together on a restart, so (unlike a persisted stamp)
  // this one cannot lock up.
  var slimeFoodCooldown = {}
  var slimeLastNotice = {}

  PlayerEvents.loggedOut(icraft.guard('origins/witherborn_slimebodied', 'PlayerEvents.loggedOut', function (event) {
    try {
      var name = String(event.player.username)
      delete slimeFoodCooldown[name]
      delete slimeLastNotice[name]
    } catch (e) {}
  }))

  // Intercept food eating for Slimebodied
  ItemEvents.rightClicked(icraft.guard('origins/witherborn_slimebodied', 'ItemEvents.rightClicked', function (event) {
    var blocked = false
    try {
      var player = event.player
      if (!player || originOf(player) !== 'icraft:slimebodied') return

      var item = event.item
      // Check if item is food (isEdible() is a method on ItemStack — parens required
      // per feedback_kubejs_tooltip_api; bare `.isEdible` is function-ref-truthy
      // and would early-return for every item including non-food).
      if (!item || !item.isEdible()) return

      var name = String(player.username)
      var now = player.server.tickCount
      var lastEat = slimeFoodCooldown.hasOwnProperty(name) ? slimeFoodCooldown[name] : -1000

      if (now - lastEat < 200) {  // 200 ticks = 10 seconds
        blocked = true
        // Holding right-click re-fires this every few ticks: one notice per second.
        var lastNotice = slimeLastNotice.hasOwnProperty(name) ? slimeLastNotice[name] : -1000
        if (now - lastNotice >= 20) {
          slimeLastNotice[name] = now
          var remaining = Math.ceil((200 - (now - lastEat)) / 20)
          player.tell('\u00a7a[Digest]\u00a77 Still digesting... ' + remaining + 's')
        }
      }
    } catch (e) {
      warnOnce('food right-click', e)
    }
    // cancel() works by throwing -- it must stay outside the try above
    if (blocked) event.cancel()
  }))

  // Track when food is actually consumed
  PlayerEvents.inventoryChanged(icraft.guard('origins/witherborn_slimebodied', 'PlayerEvents.inventoryChanged', function (event) {
    try {
      var player = event.player
      if (!player || originOf(player) !== 'icraft:slimebodied') return

      // Detect food consumption by food level increase
      // This is approximate — we update cooldown when food level changes
      var data = player.persistentData
      var lastFood = data.getInt('icraft_slime_last_food') || 0
      var currentFood = player.foodLevel

      if (currentFood > lastFood) {
        slimeFoodCooldown[String(player.username)] = player.server.tickCount
      }
      if (currentFood !== lastFood) data.putInt('icraft_slime_last_food', currentFood)
    } catch (e) {
      warnOnce('food tracker', e)
    }
  }))

  console.log('[IridescentCraft] Witherborn & Slimebodied origins loaded')
  console.log('  Witherborn: Wither on hit, hunger damage penalty')
  console.log('  Slimebodied: satiety DR, food cooldown, satiety floor')
})()
