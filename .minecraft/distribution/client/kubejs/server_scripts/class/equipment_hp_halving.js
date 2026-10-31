// @file kubejs/server_scripts/class/equipment_hp_halving.js
// @events ServerEvents.loaded, tick.server
// =============================================================================
// IridescentCraft — Equipment HP Halving (Glass Cannon Classes)
// File: kubejs/server_scripts/class/equipment_hp_halving.js
//
// Design Doc Part III: Class Details
//   Ranger, Archmage, Void Summoner have "equipment HP halved"
//   This means HP bonuses from armor, accessories, and enchantments
//   are reduced by 50% for these classes.
//
// What counts as equipment (since 2026-10-19, decision list 159, on
// recommendation, for review): the max health the worn and held items give
// (the six vanilla slots; armour attributes, Apotheosis affixes and gems come
// through the item's own modifier list), what the Curios slots give (the same,
// through Curios), and the two pack modifiers that stand for gear: Vitality
// (enchantments/enchant_effects.js) and Deeproot (affixes/affix_effects.js).
// Half of that comes off. Nothing else does: race, class, levels, Spice of
// Life, skill trees, Ascension and effects stay whole, as the class pages and
// master-appendix A.6 say.
//
// Until then the script took a fixed base (16; the Void Summoner 18) and
// halved everything above it: a Demi-God's race health, level-up and Spice of
// Life health went with the gear, and a race under 16 (Faefolk) kept its gear
// whole. It also took off less than half: its -E/2 is an addition, which the
// class's -20% scales again, so it removed 0.4 E. The penalty below is divided
// by that scale, so exactly half the gear's health comes off.
//
// The flag: the glass-cannon classes (ranger, archmage, void_summoner,
// elemental) are the ones whose Origins power sets the scoreboard
// icraft_glass_cannon; tick_glassCannonTagCheck (below) turns that score into
// the persistent flag this tick reads.
// =============================================================================

;(function () {
if (!icraft.lib.need('core', 'class/equipment_hp_halving')) return
var core = global.icraft.core

var MAX_HEALTH = 'minecraft:generic.max_health'
var OWN = 'icraft_equip_hp_halving'
// The pack's own gear modifiers, by the name modifyAttribute gives them
var GEAR_NAMES = { icraft_vitality_bonus: true, icraft_deeproot: true }

var ArrayList = Java.loadClass('java.util.ArrayList')
var EquipmentSlot = null
var CuriosApi = null
var SlotContext = null
try { EquipmentSlot = Java.loadClass('net.minecraft.world.entity.EquipmentSlot') } catch (e) {
  core.warnOnce('hp.halving.slots', '[equipment_hp_halving] EquipmentSlot could not be loaded (worn gear is not counted): ' + e)
}
try {
  CuriosApi = Java.loadClass('top.theillusivec4.curios.api.CuriosApi')
  SlotContext = Java.loadClass('top.theillusivec4.curios.api.SlotContext')
} catch (e) {
  CuriosApi = null
  core.warnOnce('hp.halving.curios', '[equipment_hp_halving] the Curios API could not be loaded (curios are not counted): ' + e)
}

var addIds = function (ids, modifiers) {
  if (modifiers) modifiers.forEach(function (m) { ids[String(m.getId())] = true })
}

// The ids of the max-health modifiers the player's gear gives them
var gearIds = function (player, attr) {
  var ids = {}
  if (EquipmentSlot) {
    var slots = EquipmentSlot.values()
    for (var i = 0; i < slots.length; i++) {
      try {
        var stack = player.getItemBySlot(slots[i])
        if (stack && !stack.isEmpty()) addIds(ids, stack.getAttributeModifiers(slots[i]).get(attr))
      } catch (e) {
        core.warnOnce('hp.halving.slot', '[equipment_hp_halving] an equipment slot could not be read: ' + e)
      }
    }
  }
  if (CuriosApi) {
    try {
      var handler = CuriosApi.getCuriosInventory(player).orElse(null)
      if (handler) {
        // getCurios() is an unmodifiable JDK map: iterating its own sets throws
        // IllegalAccessException in Rhino (measured 2026-10-19), so the slot ids
        // are copied into an ArrayList and each slot is asked for by id.
        var slotIds = new ArrayList(handler.getCurios().keySet())
        for (var k = 0; k < slotIds.size(); k++) {
          var slotId = slotIds.get(k)
          var stacksHandler = handler.getStacksHandler(slotId).orElse(null)
          if (!stacksHandler) continue
          var stacks = stacksHandler.getStacks()
          for (var j = 0; j < stacks.getSlots(); j++) {
            var curio = stacks.getStackInSlot(j)
            if (!curio || curio.isEmpty()) continue
            var found = handler.findCurio(slotId, j).orElse(null)
            var ctx = found ? found.slotContext() : new SlotContext(slotId, player, j, false, true)
            addIds(ids, CuriosApi.getAttributeModifiers(ctx, CuriosApi.getSlotUuid(ctx), curio).get(attr))
          }
        }
      }
    } catch (e) {
      core.warnOnce('hp.halving.curio', '[equipment_hp_halving] the curio slots could not be read: ' + e)
    }
  }
  return ids
}

// The addition that takes half the gear's max health off. Vanilla's formula:
// (base + additions) x (1 + sum of multiply_base) x product of (1 + multiply_total),
// worked out once with every modifier and once without the gear's (this
// script's own modifier left out of both).
var halvingPenalty = function (player) {
  var attr = core.attribute(MAX_HEALTH)
  if (!attr) return 0
  var inst = player.getAttribute(attr)
  if (!inst) return 0
  var ids = gearIds(player, attr)
  var all = { add: 0, base: 0, total: 1 }
  var rest = { add: 0, base: 0, total: 1 }
  inst.getModifiers().forEach(function (m) {
    var name = String(m.getName())
    if (name === OWN) return
    var gear = ids[String(m.getId())] === true || GEAR_NAMES[name] === true
    var amount = core.finite(m.getAmount(), 0)
    var op = String(m.getOperation()).toUpperCase()
    var sums = gear ? [all] : [all, rest]
    for (var k = 0; k < sums.length; k++) {
      if (op === 'ADDITION') sums[k].add += amount
      else if (op === 'MULTIPLY_BASE') sums[k].base += amount
      else if (op === 'MULTIPLY_TOTAL') sums[k].total *= (1 + amount)
    }
  })
  var base = core.finite(inst.getBaseValue(), 0)
  var scale = (1 + all.base) * all.total
  var gearHp = (base + all.add) * scale - (base + rest.add) * (1 + rest.base) * rest.total
  if (!(gearHp > 0) || !(scale > 0)) return 0
  return -(gearHp / 2) / scale
}

global.tick_equipmentHpHalving = function (event) {
  event.server.players.forEach(function (player) {
    if (player.spectator || player.creative) return
    var penalty = 0
    try {
      var data = player.persistentData
      if (data.contains('icraft_glass_cannon') && data.getBoolean('icraft_glass_cannon')) penalty = halvingPenalty(player)
    } catch (e) {
      penalty = 0
      core.warnOnce('hp.halving.tick', '[equipment_hp_halving] the halving could not be worked out: ' + e)
    }
    try {
      player.modifyAttribute(MAX_HEALTH, OWN, core.finite(penalty, 0), 'addition')
    } catch (e) {
      core.warnOnce('hp.halving.write', '[equipment_hp_halving] the halving modifier could not be written: ' + e)
    }
  })
}
})()
global.registerServerTick('tick_equipmentHpHalving', 100, 60)


// ═══ Class Tag System ═══
// When a player selects a class (or respec), tag them for equipment HP halving.
// This is triggered by the Origins selection event or by command.

// Manual tag command: /trigger icraft_glass_cannon_tag
// Players set this to 1 when they pick Ranger/Archmage/Void Summoner.
// Automatic: the milestone_detection.js can check class after tier advance.

ServerEvents.loaded(icraft.guard('class/equipment_hp_halving', 'ServerEvents.loaded', event => {
  event.server.runCommandSilent('scoreboard objectives add icraft_glass_cannon trigger')
}))

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
// offset 41 since 2026-10-30: sixteen functions shared offset 0 and ran in one tick (RAM audit F17)
global.registerServerTick('tick_glassCannonTagCheck', 100, 41)


// ═══ Integration Note ═══
// For full automatic detection, the class_respec.js or Origins selection
// should set the scoreboard: /scoreboard players set @s icraft_glass_cannon 1
// This can be added to the Origins class power JSON as a "command" action
// on class selection. For now, manual trigger works as a fallback.
//
// To enable for a player: /trigger icraft_glass_cannon set 1
// To disable: /trigger icraft_glass_cannon set -1

console.log('[IridescentCraft] equipment_hp_halving.js loaded — glass cannon class HP reduction')
