// =============================================================================
// IridescentCraft — Equipment HP Halving (Glass Cannon Classes)
// File: kubejs/server_scripts/class/equipment_hp_halving.js
//
// Design Doc Part III: Class Details
//   Ranger, Archmage, Void Summoner have "equipment HP halved"
//   This means HP bonuses from armor, accessories, and enchantments
//   are reduced by 50% for these classes.
//
// Implementation:
//   Origins class powers already apply -20% base HP (Ranger/Archmage)
//   and -10% (Void Summoner). Equipment HP halving is a SEPARATE
//   mechanic that reduces the HP gained from equipment.
//
//   Approach: Every 5 seconds, check if player has a glass cannon class.
//   If so, calculate their equipment HP bonus and apply a -50% modifier.
//
//   Detection: Check the player's Origins class via persistent data or
//   by checking for the class-specific power (hp_modifier with negative value).
// =============================================================================

// Glass cannon classes that get equipment HP halving
const GLASS_CANNON_CLASSES = new Set([
  'icraft:ranger',
  'icraft:archmage',
  'icraft:void_summoner'
])

ServerEvents.tick(event => {
  if (event.server.tickCount % 100 !== 60) return // Every 5 seconds, offset

  event.server.players.forEach(player => {
    if (player.spectator || player.creative) return

    // Check if player has a glass cannon class
    // Origins stores the selected origin in player data
    // We detect it by checking for the class-specific HP modifier power
    let isGlassCannon = false

    try {
      // Method 1: Check Origins persistent data
      // Origins stores origin selection in the player's capability data
      // KubeJS can access it via command output or persistent data tags
      let data = player.persistentData

      // Check if we've already cached the class check
      if (data.contains('icraft_glass_cannon')) {
        isGlassCannon = data.getBoolean('icraft_glass_cannon')
      } else {
        // First-time check: use the Origins command to query
        // This is expensive, so we cache the result
        // For now, check if player has the ranger/archmage/voidsummoner
        // HP modifier attribute (negative max_health from class power)

        // Alternative detection: check the player's max health base
        // Glass cannons have -20% or -10% base HP from Origins powers
        // A player with base 20 HP * 0.8 = 16 HP base (ranger/archmage)
        // or 20 * 0.9 = 18 HP base (void summoner)
        // This is imprecise but functional for Phase 1

        // Better: tag players when they select a class
        // For now, skip auto-detection and use a scoreboard tag system
        isGlassCannon = false
      }
    } catch(e) {}

    if (!isGlassCannon) return

    // Calculate equipment HP contribution and halve it
    // Equipment HP comes from:
    //   - Armor with HP attributes (Apotheosis affixes)
    //   - Vitality enchantment
    //   - Curio/accessory HP bonuses
    //   - Apothic Attributes on gear
    //
    // We can't easily isolate "equipment HP" from "base HP + class HP + food HP"
    // So we apply a flat negative modifier proportional to total bonus HP above base
    //
    // Base HP for glass cannons (after Origins modifier):
    //   Ranger:         20 * 0.80 = 16 HP base
    //   Archmage:       20 * 0.80 = 16 HP base
    //   Void Summoner:  20 * 0.90 = 18 HP base
    //
    // Any HP above that base is "equipment HP" and gets halved

    let baseHP = 16 // Default for ranger/archmage
    // TODO: Check specific class for void summoner (18 base)

    let currentMax = player.maxHealth
    let equipmentHP = currentMax - baseHP
    if (equipmentHP > 0) {
      // Remove half of equipment HP contribution
      let penalty = -(equipmentHP * 0.5)
      player.modifyAttribute(
        'minecraft:generic.max_health',
        'icraft_equip_hp_halving',
        penalty,
        'addition'
      )
    }
  })
})


// ═══ Class Tag System ═══
// When a player selects a class (or respec), tag them for equipment HP halving.
// This is triggered by the Origins selection event or by command.

// Manual tag command: /trigger icraft_glass_cannon_tag
// Players set this to 1 when they pick Ranger/Archmage/Void Summoner.
// Automatic: the milestone_detection.js can check class after tier advance.

ServerEvents.loaded(event => {
  event.server.runCommandSilent('scoreboard objectives add icraft_glass_cannon trigger')
})

ServerEvents.tick(event => {
  if (event.server.tickCount % 20 !== 0) return
  event.server.players.forEach(player => {
    try {
      let obj = event.server.scoreboard.getObjective('icraft_glass_cannon')
      if (!obj) return
      let score = event.server.scoreboard.getOrCreatePlayerScore(player.username, obj)

      if (score.score === 1) {
        // Player tagged as glass cannon
        player.persistentData.putBoolean('icraft_glass_cannon', true)
        player.tell('§e§lGlass Cannon class detected. §r§7Equipment HP bonuses halved.')
        score.score = 0
      } else if (score.score === -1) {
        // Player untagged (respecced away from glass cannon)
        player.persistentData.putBoolean('icraft_glass_cannon', false)
        // Remove the HP penalty
        try {
          player.modifyAttribute('minecraft:generic.max_health',
            'icraft_equip_hp_halving', 0, 'addition')
        } catch(e) {}
        player.tell('§a§lEquipment HP halving removed.')
        score.score = 0
      }
    } catch(e) {}
  })
})


// ═══ Integration Note ═══
// For full automatic detection, the class_respec.js or Origins selection
// should set the scoreboard: /scoreboard players set @s icraft_glass_cannon 1
// This can be added to the Origins class power JSON as a "command" action
// on class selection. For now, manual trigger works as a fallback.
//
// To enable for a player: /trigger icraft_glass_cannon set 1
// To disable: /trigger icraft_glass_cannon set -1

console.log('[IridescentCraft] equipment_hp_halving.js loaded — glass cannon class HP reduction')
