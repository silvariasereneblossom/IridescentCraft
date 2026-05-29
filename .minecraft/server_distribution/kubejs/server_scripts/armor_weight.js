// =============================================================================
// ARMOR WEIGHT SYSTEM — light / medium / heavy per-piece scaling
// =============================================================================
// Tags: data/icraft/tags/items/armor_{light,medium,heavy}.json
//
// Per-piece effects (scale linearly with the count of equipped pieces in
// each category):
//   light  +0.05 mana_regen, +1.25% movement_speed, -5% generic.armor,
//          -7.5% generic.armor_toughness  ← NEW (light-only)
//   medium  no effect (default for untagged items)
//   heavy  -0.05 mana_regen, -1.25% movement_speed, +5% generic.armor
//
// Net (lightCount - heavyCount) determines the sign and magnitude on the
// mana/speed/armor axes. A player wearing 4 light pieces gets +20% mana
// regen / +5% speed / -20% armor; full plate gets the opposite.
//
// Toughness is asymmetric: ONLY light contributes a penalty (-30% at 4/4
// light), heavy does not add toughness back. Design intent: make it
// genuinely hard to be tanky in light armor regardless of race, without
// editing the toughness value on every individual robe item. Heavy armor
// keeps its native material toughness (diamond/netherite high baseline).
//
// Refresh: tick every 100 ticks (5s — matches class_passives + mana_pool
// cadence). PlayerEvents.inventoryChanged also fires the recompute for
// snappy UI feedback when the player swaps a piece mid-combat.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try
// blocks; closures fail with function declarations).
// =============================================================================

const TAG_ROBE   = 'icraft:armor_robe'
const TAG_LIGHT  = 'icraft:armor_light'
const TAG_HEAVY  = 'icraft:armor_heavy'

// Stable UUIDs per axis.
const UUID_MANA_REGEN       = 'icraft_armor_weight_mana_regen'
const UUID_MOVE_SPEED       = 'icraft_armor_weight_speed'
const UUID_ARMOR            = 'icraft_armor_weight_armor'
const UUID_LIGHT_TOUGHNESS  = 'icraft_armor_weight_toughness'
const UUID_FAEFOLK_TOUGHNESS = 'icraft_faefolk_armor_weakness'
const UUID_ROBE_SET_BONUS   = 'icraft_armor_weight_robe_set'

// Per-piece coefficients indexed by tier.
// armor/toughness use MULTIPLY_BASE; mana_regen uses ADDITION; speed uses MULTIPLY_BASE.
//
// Design: ROBE is a 4th tier below LIGHT — mage gear that makes you fragile
// in exchange for mana regen. Full 4-piece robe set adds an extra +0.5
// mana_regen ADDITION on top of per-piece bonuses (the "true mage build"
// payoff). Light keeps its rogue identity (speed + light penalty), heavy
// keeps tank identity, medium stays neutral.
const COEF_ARMOR     = { robe: -0.075, light: -0.05,  medium: 0, heavy:  0.05  }
const COEF_TOUGHNESS = { robe: -0.10,  light: -0.075, medium: 0, heavy:  0     }
const COEF_MANA      = { robe:  0.10,  light:  0.05,  medium: 0, heavy: -0.05  }
const COEF_SPEED     = { robe:  0.015, light:  0.05,  medium: 0, heavy: -0.05  }
const ROBE_SET_BONUS_MANA = 0.5  // ADDITION on irons_spellbooks:mana_regen at 4/4 robe

// Faefolk armor toughness penalty (Ethereal Form): -50% multiply_base.
// Applied only when player is Faefolk AND not wearing 4/4 light armor.
// Wearing full robes bypasses the penalty entirely (caster identity payoff).
const FAEFOLK_TOUGHNESS_PENALTY = -0.5

// var (not const) so death_penalty.js can also declare the same name in
// the shared KubeJS Rhino scope without throwing "redeclaration of const
// ARMOR_SLOTS". See the matching note in death_penalty.js.
var ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']

// Reforged armor (iridescent_reforging:reforged_*) doesn't have a static
// item tag — its weight class is dynamic, decided by the installed major
// module. Detect via class identity and call getArmorWeight() directly.
// The result is a Java enum: ArmorWeight.LIGHT / MEDIUM / HEAVY (or null
// if no major installed yet, in which case fall through to medium).
//
// Class loaded lazily on first use because Rhino evaluates const at
// parse time and the iridescent_reforging mod may not be on the
// classpath yet during the early script-load phase.
var _itemModularArmorClass = null
function _getItemModularArmorClass() {
  if (_itemModularArmorClass === null) {
    try {
      _itemModularArmorClass = Java.loadClass('com.iridescentcraft.reforging.item.ItemModularArmor')
    } catch (e) {
      _itemModularArmorClass = false  // sentinel: class load failed, don't retry
    }
  }
  return _itemModularArmorClass || null
}

// Classify a single equipped slot. Returns the tier-name string used
// to index the COEF_* tables (or null if empty).
//   'robe'   = mage cloth weight class (reforged vestment_*, ISS class robes,
//              Botania manaweave); Runed will sit here too as the heavier
//              mage sibling once it ships
//   'light'  = leather/scaled (rogue gear)
//   'medium' = default — untagged
//   'heavy'  = plate (diamond, netherite, fiery, etc.)
function classifyArmor(stack) {
  if (!stack || stack.isEmpty()) return null
  try {
    // Tetra reforged armor: dynamic weight from the installed major.
    var armorClass = _getItemModularArmorClass()
    if (armorClass !== null) {
      var item = stack.getItem()
      if (armorClass.isInstance(item)) {
        var weight = item.getArmorWeight(stack.getInternal())
        if (weight !== null) {
          var name = weight.name()
          if (name === 'ROBE')   return 'robe'
          if (name === 'LIGHT')  return 'light'
          if (name === 'HEAVY')  return 'heavy'
          return 'medium'
        }
        return 'medium'
      }
    }
    // Static-tagged vanilla / modded armor (robe checked first — most specific).
    if (stack.hasTag(TAG_ROBE))  return 'robe'
    if (stack.hasTag(TAG_LIGHT)) return 'light'
    if (stack.hasTag(TAG_HEAVY)) return 'heavy'
  } catch (e) {}
  return 'medium'
}

// Sum per-piece coefficients across the 4 armor slots, return the
// per-attribute totals + the per-tier counts.
function aggregateArmor(player) {
  var counts = { robe: 0, light: 0, medium: 0, heavy: 0 }
  ARMOR_SLOTS.forEach(function(slot) {
    var item = player.getEquipment(slot)
    var tier = classifyArmor(item)
    if (tier && counts.hasOwnProperty(tier)) counts[tier]++
  })
  return {
    counts: counts,
    armor:     counts.robe * COEF_ARMOR.robe     + counts.light * COEF_ARMOR.light     + counts.heavy * COEF_ARMOR.heavy,
    toughness: counts.robe * COEF_TOUGHNESS.robe + counts.light * COEF_TOUGHNESS.light + counts.heavy * COEF_TOUGHNESS.heavy,
    mana:      counts.robe * COEF_MANA.robe      + counts.light * COEF_MANA.light      + counts.heavy * COEF_MANA.heavy,
    speed:     counts.robe * COEF_SPEED.robe     + counts.light * COEF_SPEED.light     + counts.heavy * COEF_SPEED.heavy,
    robeSetBonus: counts.robe === 4 ? ROBE_SET_BONUS_MANA : 0
  }
}

// Check whether a player has the Faefolk race assigned via Origins NBT.
// Mirrors the same NBT-probe pattern used in battlemage_arcane_cleave.js.
function isFaefolk(player) {
  try {
    var result = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:race":"icraft:faefolk"}}}}]`
    )
    return result > 0
  } catch (e) { return false }
}

function applyArmorMods(player, agg) {
  player.modifyAttribute('irons_spellbooks:mana_regen',
    UUID_MANA_REGEN, agg.mana, 'addition')
  player.modifyAttribute('minecraft:generic.movement_speed',
    UUID_MOVE_SPEED, agg.speed, 'multiply_base')
  player.modifyAttribute('minecraft:generic.armor',
    UUID_ARMOR, agg.armor, 'multiply_base')
  player.modifyAttribute('minecraft:generic.armor_toughness',
    UUID_LIGHT_TOUGHNESS, agg.toughness, 'multiply_base')
  // 4-piece robe set bonus: extra mana regen on top of the per-piece total.
  player.modifyAttribute('irons_spellbooks:mana_regen',
    UUID_ROBE_SET_BONUS, agg.robeSetBonus, 'addition')
}

global.tick_armorWeight = function(event) {
  let server = event.server
  server.players.forEach(function(player) {
    try {
      if (player.spectator || player.creative) {
        // Strip any stale modifier in case the player toggled mode
        try {
          player.modifyAttribute('irons_spellbooks:mana_regen', UUID_MANA_REGEN, 0, 'addition')
          player.modifyAttribute('irons_spellbooks:mana_regen', UUID_ROBE_SET_BONUS, 0, 'addition')
          player.modifyAttribute('minecraft:generic.movement_speed', UUID_MOVE_SPEED, 0, 'multiply_base')
          player.modifyAttribute('minecraft:generic.armor', UUID_ARMOR, 0, 'multiply_base')
          player.modifyAttribute('minecraft:generic.armor_toughness', UUID_LIGHT_TOUGHNESS, 0, 'multiply_base')
        } catch (e) {}
        return
      }

      var agg = aggregateArmor(player)
      applyArmorMods(player, agg)

      // Faefolk Ethereal Form (conditional). Bypass when wearing 4/4 robe
      // OR 4/4 light (full caster/rogue commitment).
      let faefolkPenalty = 0
      if (isFaefolk(player) && agg.counts.robe < 4 && agg.counts.light < 4) {
        faefolkPenalty = FAEFOLK_TOUGHNESS_PENALTY
      }
      player.modifyAttribute('minecraft:generic.armor_toughness',
        UUID_FAEFOLK_TOUGHNESS, faefolkPenalty, 'multiply_base')
    } catch (e) {
      console.warn('[armor_weight] tick failed for ' + player.username + ': ' + e)
    }
  })
}
global.registerServerTick('tick_armorWeight', 100, 17)

// Snappy refresh on equip swap.
PlayerEvents.inventoryChanged(function(event) {
  try {
    let player = event.player
    if (!player || player.spectator || player.creative) return
    var agg = aggregateArmor(player)
    applyArmorMods(player, agg)

    let faefolkPenalty = 0
    if (isFaefolk(player) && agg.counts.robe < 4 && agg.counts.light < 4) {
      faefolkPenalty = FAEFOLK_TOUGHNESS_PENALTY
    }
    player.modifyAttribute('minecraft:generic.armor_toughness',
      UUID_FAEFOLK_TOUGHNESS, faefolkPenalty, 'multiply_base')
  } catch (e) {}
})

console.log('[IridescentCraft] armor_weight loaded — robe / light / medium / heavy per-piece scaling')
console.log('  robe   +0.10 mana regen, +1.5% speed, -7.5% armor, -10% toughness (per piece, +0.5 mana set bonus at 4/4)')
console.log('  light  +0.05 mana regen, +5% speed, -5% armor, -7.5% toughness (per piece)')
console.log('  medium no effect (default for untagged armor)')
console.log('  heavy  -0.05 mana regen, -5% speed, +5% armor (per piece)')
