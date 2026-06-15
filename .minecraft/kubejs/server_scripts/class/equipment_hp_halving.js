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
  'icraft:void_summoner',
  'icraft:elemental'
])

// Read the player's Origins class id ("icraft:archmage" etc, or '') via
// direct player.nbt read. The execute-if NBT-matcher does NOT recurse the
// origins compound correctly in this Forge build (see codex_delivery.js
// Route 0 forensics) -- the direct path is the proven-working one.
// Prefixed eqhh_ because KubeJS server scripts share one global scope.
function eqhh_getOriginClass(player) {
  try {
    var nbt = player.nbt
    if (!nbt) return ''
    var fc = nbt.ForgeCaps
    if (!fc) return ''
    var oo = fc.get ? fc.get('origins:origins') : null
    if (!oo) return ''
    var origins = oo.get ? oo.get('Origins') : null
    if (!origins || !origins.getString) return ''
    return String(origins.getString('origins:class') || '')
  } catch (e) { return '' }
}

global.tick_equipmentHpHalving = (event) => {
  event.server.players.forEach(player => {
    if (player.spectator || player.creative) return

    // Check if player has a glass cannon class
    let isGlassCannon = false

    try {
      let data = player.persistentData
      if (data.contains('icraft_glass_cannon')) {
        isGlassCannon = data.getBoolean('icraft_glass_cannon')
      } else {
        isGlassCannon = false
      }
    } catch(e) {}

    // Always zero our modifier BEFORE measuring. Two bugs lived here
    // (fixed 2026-06-12):
    //  1. Feedback loop: maxHealth was read with our previous penalty
    //     still applied, so the penalty fed back into its own input and
    //     converged to -1/3 of equipment HP instead of the designed -1/2
    //     (fixed point of p = -(E + p)/2 is p = -E/3).
    //  2. Stale penalty: the modifier was only written when equipmentHP > 0,
    //     so taking gear off (or losing the glass-cannon flag outside the
    //     -1 trigger path) left the last penalty applied forever.
    try {
      player.modifyAttribute(
        'minecraft:generic.max_health',
        'icraft_equip_hp_halving',
        0,
        'addition'
      )
    } catch(e) {}

    if (!isGlassCannon) return

    // Class base HP after the Origins class power's HP modifier:
    // Ranger/Archmage -20% -> 16, Void Summoner -10% -> 18.
    let baseHP = (eqhh_getOriginClass(player) === 'icraft:void_summoner') ? 18 : 16

    // Penalty-free read now that our modifier is zeroed (the attribute
    // recomputes lazily on read).
    let equipmentHP = player.maxHealth - baseHP
    if (equipmentHP > 0) {
      let penalty = -(equipmentHP * 0.5)
      player.modifyAttribute(
        'minecraft:generic.max_health',
        'icraft_equip_hp_halving',
        penalty,
        'addition'
      )
    }
  })
}
global.registerServerTick('tick_equipmentHpHalving', 100, 60)


// ═══ Class Tag System ═══
// When a player selects a class (or respec), tag them for equipment HP halving.
// This is triggered by the Origins selection event or by command.

// Manual tag command: /trigger icraft_glass_cannon_tag
// Players set this to 1 when they pick Ranger/Archmage/Void Summoner.
// Automatic: the milestone_detection.js can check class after tier advance.

ServerEvents.loaded(event => {
  event.server.runCommandSilent('scoreboard objectives add icraft_glass_cannon trigger')
})

global.tick_glassCannonTagCheck = (event) => {
  event.server.players.forEach(player => {
    try {
      let obj = event.server.scoreboard.getObjective('icraft_glass_cannon')
      if (!obj) return
      let score = event.server.scoreboard.getOrCreatePlayerScore(player.username, obj)

      if (score.score === 1) {
        player.persistentData.putBoolean('icraft_glass_cannon', true)
        player.tell('§e§lGlass Cannon class detected. §r§7Equipment HP bonuses halved.')
        score.score = 0
      } else if (score.score === -1) {
        player.persistentData.putBoolean('icraft_glass_cannon', false)
        try {
          player.modifyAttribute('minecraft:generic.max_health',
            'icraft_equip_hp_halving', 0, 'addition')
        } catch(e) {}
        player.tell('§a§lEquipment HP halving removed.')
        score.score = 0
      }
    } catch(e) {}
  })
}
global.registerServerTick('tick_glassCannonTagCheck', 100, 0)


// ═══ Integration Note ═══
// For full automatic detection, the class_respec.js or Origins selection
// should set the scoreboard: /scoreboard players set @s icraft_glass_cannon 1
// This can be added to the Origins class power JSON as a "command" action
// on class selection. For now, manual trigger works as a fallback.
//
// To enable for a player: /trigger icraft_glass_cannon set 1
// To disable: /trigger icraft_glass_cannon set -1

console.log('[IridescentCraft] equipment_hp_halving.js loaded — glass cannon class HP reduction')
