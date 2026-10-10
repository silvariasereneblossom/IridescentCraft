// =============================================================================
// ARTIFICIAL CONSTRUCT — Iron Eating & Upgrade Progression
// =============================================================================
// Food: Can eat normally but at 25% efficiency (biofuel conversion)
// Iron eating: Iron Ingots (0.5 food), Iron Blocks (4.5 food / 9 ingots)
// Iron healing: Eating iron grants Regeneration III for 10s (400% healing acceleration)
// Iron upgrades: each threshold grants HP, melee, reduction, toughness
//   Thresholds: 1000 → 2000 → 4000 → 8000 → 16000 (5 levels)
//   Bonuses per level: +5%, +5%, +5%, +10%, +10% (max +35% each)
//   Iron Blocks count as 9 ingots
//
// Origin detection: global.icraft.origin (0_lib_origins.js). The old
// `execute if entity <name>[nbt=...]` probe never parsed, so none of this ran
// before 2026-10 (and it ran one command per right-click by ANY player).
// =============================================================================

;(function () {
  // Check if player has Artificial Construct origin
  var isArtificialConstruct = function (player) {
    try {
      return global.icraft.origin.is(player, 'origin', 'icraft:artificial_construct')
    } catch (e) {
      return false
    }
  }

  var IRON_THRESHOLDS = [1000, 2000, 4000, 8000, 16000]
  var BONUS_PER_LEVEL = [0.05, 0.05, 0.05, 0.10, 0.10]  // 5/5/5/10/10%

  // Capstone at level 5: +25% on top of the L5 ladder bonus, on max_health,
  // attack_damage, and armor_toughness. Set via the "Iron Apotheosis" flag
  // (persistent). Triggered automatically when checkIronUpgrade flips the
  // level to 5.
  var CAPSTONE_HP_BONUS = 0.25
  var CAPSTONE_AD_BONUS = 0.25
  var CAPSTONE_TOUGHNESS_BONUS = 1.0  // ADD_VALUE (matches L1-L5 scale of bonus*4)

  var warned = {}
  var warnOnce = function (where, e) {
    if (warned[where]) return
    warned[where] = true
    console.warn('[artificial_construct] ' + where + ' threw (logged once): ' + e)
  }

  var applyConstructBonuses = function (player) {
    var data = player.persistentData
    var level = data.getInt('icraft_construct_level') || 0
    var hasApotheosis = data.getBoolean('icraft_construct_apotheosis')
    var bonus = 0
    for (var i = 0; i < level && i < BONUS_PER_LEVEL.length; i++) bonus += BONUS_PER_LEVEL[i]

    // modifyAttribute, not /attribute commands: the old commands used 1.21
    // syntax (single id, add_value op) which 1.20.1 rejects -- they NEVER
    // applied. Calling with the computed value (0 clears) replaces in place.
    player.modifyAttribute('minecraft:generic.max_health', 'icraft_construct_hp', bonus, 'multiply_base')
    player.modifyAttribute('minecraft:generic.attack_damage', 'icraft_construct_damage', bonus, 'multiply_base')
    player.modifyAttribute('minecraft:generic.armor_toughness', 'icraft_construct_toughness', bonus * 4, 'addition')
    player.modifyAttribute('minecraft:generic.armor', 'icraft_construct_armor', bonus * 4, 'addition')

    // Capstone (Iron Apotheosis at L5): +25% HP + AD MULTIPLY_BASE,
    // +1.0 armor_toughness ADD_VALUE. Stacks ADDITIVELY with the ladder
    // bonus for MULTIPLY_BASE attrs (so L5 + capstone HP = +35% + +25% = +60%
    // multiply_base on a single attribute). For toughness it's a flat
    // additional +1 on top of the L5 +1.4.
    player.modifyAttribute('minecraft:generic.max_health',
      'icraft_construct_apotheosis_hp', hasApotheosis ? CAPSTONE_HP_BONUS : 0, 'multiply_base')
    player.modifyAttribute('minecraft:generic.attack_damage',
      'icraft_construct_apotheosis_ad', hasApotheosis ? CAPSTONE_AD_BONUS : 0, 'multiply_base')
    player.modifyAttribute('minecraft:generic.armor_toughness',
      'icraft_construct_apotheosis_tough', hasApotheosis ? CAPSTONE_TOUGHNESS_BONUS : 0, 'addition')
  }

  var checkIronUpgrade = function (player, totalIron) {
    var data = player.persistentData
    var currentLevel = data.getInt('icraft_construct_level') || 0

    if (currentLevel >= 5) return  // Max level

    var nextThreshold = IRON_THRESHOLDS[currentLevel]
    if (totalIron >= nextThreshold) {
      var newLevel = currentLevel + 1
      data.putInt('icraft_construct_level', newLevel)

      var totalPct = 0
      for (var i = 0; i < newLevel; i++) totalPct += BONUS_PER_LEVEL[i] * 100
      var levelPct = BONUS_PER_LEVEL[newLevel - 1] * 100
      player.tell('\u00a76[Iron Forge Upgrade]\u00a7r Level ' + newLevel + '/5 (+' + Math.round(levelPct) + '%)')
      player.tell('\u00a77  Total: +' + Math.round(totalPct) + '% HP, Melee, Damage Reduction, Armor Toughness')

      if (newLevel < 5) {
        var nextReq = IRON_THRESHOLDS[newLevel]
        player.tell('\u00a77  Next upgrade: ' + nextReq + ' total iron consumed')
      } else {
        // Capstone: L5 unlocks Iron Apotheosis (+25% HP/AD, +1 toughness on top)
        data.putBoolean('icraft_construct_apotheosis', true)
        player.tell('\u00a76\u00a7l[Iron Apotheosis]\u00a7r')
        player.tell('\u00a7eYour body is forged anew in iron and intent.')
        player.tell('\u00a7e+25% HP, +25% melee damage, +1 armor toughness (on top of L5).')
        player.server.runCommandSilent(
          'title ' + player.username + ' title {"text":"Iron Apotheosis","color":"gold","bold":true}'
        )
        player.server.runCommandSilent(
          'title ' + player.username + ' subtitle {"text":"Maximum iron forging achieved","color":"white"}'
        )
      }

      applyConstructBonuses(player)
    }
  }

  // ingots: iron value of one item (ingot = 1, block = 9)
  // food:   hunger points restored
  // sat:    saturation restored (0 = leave it alone)
  var eatIron = function (player, item, ingots, food, sat, volume, pitch) {
    if (player.foodLevel >= 20) return
    item.shrink(1)
    player.foodLevel = Math.min(20, player.foodLevel + food)
    if (sat > 0) player.saturation = Math.min(20, player.saturation + sat)

    // `execute at`: a bare `playsound ... ~ ~ ~` from the server source plays at
    // world spawn, not at the player.
    var name = player.username
    player.server.runCommandSilent(
      'execute at ' + name + ' run playsound minecraft:entity.iron_golem.repair player ' + name +
      ' ~ ~ ~ ' + volume + ' ' + pitch
    )

    // Iron accelerates natural healing by 400% (Regeneration III for 10s)
    player.potionEffects.add('minecraft:regeneration', 200, 2, false, false)

    // Track iron consumed
    var data = player.persistentData
    var totalIron = (data.getInt('icraft_construct_iron') || 0) + ingots
    data.putInt('icraft_construct_iron', totalIron)

    checkIronUpgrade(player, totalIron)
  }

  // Iron eating via custom food mechanic — iron isn't food, so we hook item use.
  // Item id is checked FIRST: this fires for every right-click by every player.
  ItemEvents.rightClicked(function (event) {
    var handled = false
    try {
      var item = event.item
      var itemId = item ? String(item.id) : ''
      var isIngot = itemId === 'minecraft:iron_ingot'
      var isBlock = itemId === 'minecraft:iron_block'
      if (!isIngot && !isBlock) return

      var player = event.player
      if (!player || !isArtificialConstruct(player)) return

      handled = true
      if (isIngot) {
        // 1 ingot: 0.5 food rounded up to 1
        eatIron(player, item, 1, 1, 0, 0.5, 1.2)
      } else {
        // 1 block = 9 ingots worth: 4.5 food + saturation
        eatIron(player, item, 9, 9, 4.5, 0.8, 0.8)
      }
    } catch (e) {
      warnOnce('right-click handler', e)
    }
    // cancel() works by throwing -- it must stay outside the try above
    if (handled) event.cancel()
  })

  // modifyAttribute modifiers are transient: they vanish with the player
  // entity, so re-apply on login AND on respawn (death used to strip every
  // forge bonus until the next relog).
  var reapply = function (event) {
    try {
      if (isArtificialConstruct(event.player)) applyConstructBonuses(event.player)
    } catch (e) {
      warnOnce('bonus re-apply', e)
    }
  }
  PlayerEvents.loggedIn(reapply)
  PlayerEvents.respawned(reapply)

  console.log('[IridescentCraft] Artificial Construct progression loaded')
  console.log('  - 25% food efficiency from normal food')
  console.log('  - Iron Ingot eating (0.5 food), Iron Block eating (4.5 food)')
  console.log('  - Iron eating grants Regen III for 10s (400% healing acceleration)')
  console.log('  - Iron upgrade ladder: 1000/2000/4000/8000/16000')
  console.log('  - +5/5/5/10/10% HP/melee/reduction/toughness per level (max +35%)')
})()
