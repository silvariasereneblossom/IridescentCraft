// =============================================================================
// WITHERBORN & SLIMEBODIED — Custom Origin Mechanics
// =============================================================================

// ── Helpers ──
function hasOrigin(player, originId) {
  try {
    let r = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:origin":"${originId}"}}}}]`
    )
    return r > 0
  } catch (e) { return false }
}

// =============================================================================
// WITHERBORN — Wither on hit
// =============================================================================

EntityEvents.hurt(event => {
  let source = event.source
  if (!source || !source.player) return
  let player = source.player

  if (!hasOrigin(player, 'icraft:witherborn')) return

  let target = event.entity
  if (!target || target.player) return  // Don't wither other players... or should we?

  let name = target.stringUuid || ''

  // Apply Wither II for 5 seconds
  player.server.runCommandSilent(
    `execute at ${player.username} run effect give @e[distance=..3,sort=nearest,limit=1,type=!player] minecraft:wither 5 1 false`
  )
})

// =============================================================================
// TICK-BASED MECHANICS
// =============================================================================

global.tick_witherbornSlimebodied = (event) => {
  event.server.players.forEach(player => {

    // ── WITHERBORN: hunger-scaling damage PENALTY (opposite of Orc) ──
    // Full food = full damage. Starving = -50% damage.
    if (hasOrigin(player, 'icraft:witherborn')) {
      let name = player.username
      let foodLevel = player.foodLevel  // 0-20

      // Scale: 0% penalty at food 20, -50% at food 0
      let hungerPenalty = Math.max(0, (20 - foodLevel) / 20) * -0.50

      player.server.runCommandSilent(
        `attribute ${name} minecraft:generic.attack_damage modifier remove icraft:witherborn_weakness`
      )
      if (hungerPenalty < -0.01) {
        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.attack_damage modifier add icraft:witherborn_weakness ${hungerPenalty} multiply_base`
        )
      }
    }

    // ── SLIMEBODIED: satiety-based damage reduction ──
    if (hasOrigin(player, 'icraft:slimebodied')) {
      let name = player.username
      let foodLevel = player.foodLevel  // 0-20

      // Satiety floor: can't go below 25% (food level 5)
      if (foodLevel < 5) {
        player.foodLevel = 5
      }

      // DR scales: 0% at food 5 (minimum), 25% at food 20 (full)
      // Effective range: 5-20 = 15 levels
      let drLevel = Math.max(0, (foodLevel - 5) / 15) * 0.25

      // Apply as Resistance effect (approximate)
      // Resistance I = 20%, so we scale between 0 and Resistance I
      player.server.runCommandSilent(
        `attribute ${name} minecraft:generic.armor modifier remove icraft:slime_dr`
      )
      if (drLevel > 0.05) {
        // Use armor as DR proxy — add flat armor based on satiety
        // 25% DR ≈ +8 armor points at typical damage values
        let armorBonus = drLevel * 32  // up to +8 armor
        player.server.runCommandSilent(
          `attribute ${name} minecraft:generic.armor modifier add icraft:slime_dr ${armorBonus} add_value`
        )
      }

      // Slow metabolism: reduce hunger drain
      // The origins:exhaust power handles base drain, but we also
      // need to handle idle drain. Periodically restore a tiny bit
      // of food to counteract idle drain
      if (player.foodLevel > 5) {
        // The base game drains ~0.005 exhaustion per tick when idle
        // We compensate by occasionally adding saturation
        let sat = player.saturation
        if (sat < 1.0) {
          player.saturation = Math.min(20, sat + 0.2)
        }
      }
    }
  })
}
global.registerServerTick('tick_witherbornSlimebodied', 100, 35)

// ── SLIMEBODIED: Food cooldown (10 seconds) ──
let slimeFoodCooldown = {}

PlayerEvents.loggedIn(event => {
  delete slimeFoodCooldown[event.player.username]
})

// Intercept food eating for Slimebodied
ItemEvents.rightClicked(event => {
  let player = event.player
  if (!hasOrigin(player, 'icraft:slimebodied')) return

  let item = event.item
  // Check if item is food
  if (!item.isEdible) return

  let name = player.username
  let now = player.server.tickCount
  let lastEat = slimeFoodCooldown[name] || 0

  if (now - lastEat < 200) {  // 200 ticks = 10 seconds
    let remaining = Math.ceil((200 - (now - lastEat)) / 20)
    player.tell('\u00a7a[Digest]\u00a77 Still digesting... ' + remaining + 's')
    event.cancel()
    return
  }
})

// Track when food is actually consumed
PlayerEvents.inventoryChanged(event => {
  let player = event.player
  if (!hasOrigin(player, 'icraft:slimebodied')) return

  // Detect food consumption by food level increase
  // This is approximate — we update cooldown when food level changes
  let data = player.persistentData
  let lastFood = data.getInt('icraft_slime_last_food') || 0
  let currentFood = player.foodLevel

  if (currentFood > lastFood) {
    slimeFoodCooldown[player.username] = player.server.tickCount
  }
  data.putInt('icraft_slime_last_food', currentFood)
})

console.log('[IridescentCraft] Witherborn & Slimebodied origins loaded')
console.log('  Witherborn: Wither on hit, hunger damage penalty')
console.log('  Slimebodied: satiety DR, food cooldown, satiety floor')
