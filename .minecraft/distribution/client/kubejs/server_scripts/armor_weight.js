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

const TAG_LIGHT  = 'icraft:armor_light'
const TAG_HEAVY  = 'icraft:armor_heavy'

// Stable UUIDs per axis. Layout: -2030<axis>NN
//   axis 1 = mana_regen, 2 = movement_speed, 3 = armor,
//   axis 5 = light-armor toughness penalty (universal, any race)
//   axis 4 = faefolk-conditional toughness (Ethereal Form)
const UUID_MANA_REGEN       = 'icraft_armor_weight_mana_regen'
const UUID_MOVE_SPEED       = 'icraft_armor_weight_speed'
const UUID_ARMOR            = 'icraft_armor_weight_armor'
const UUID_LIGHT_TOUGHNESS  = 'icraft_armor_weight_toughness'
const UUID_FAEFOLK_TOUGHNESS = 'icraft_faefolk_armor_weakness'

// Per-piece magnitudes
const PER_PIECE_MANA_REGEN = 0.05    // ADD on irons_spellbooks:mana_regen
const PER_PIECE_SPEED      = 0.0125  // MULTIPLY_BASE on generic.movement_speed
const PER_PIECE_ARMOR      = 0.05    // MULTIPLY_BASE on generic.armor
const PER_PIECE_TOUGHNESS  = 0.075   // MULTIPLY_BASE on generic.armor_toughness (light only)

// Faefolk armor toughness penalty (Ethereal Form): -50% multiply_base.
// Applied only when player is Faefolk AND not wearing 4/4 light armor.
// Wearing full robes bypasses the penalty entirely (caster identity payoff).
const FAEFOLK_TOUGHNESS_PENALTY = -0.5

const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']

// Classify a single equipped slot.
//   1  = light
//   0  = medium (default — untagged or explicitly tagged medium)
//  -1  = heavy
function classifyArmor(stack) {
  if (!stack || stack.isEmpty()) return 0
  try {
    if (stack.hasTag(TAG_LIGHT)) return 1
    if (stack.hasTag(TAG_HEAVY)) return -1
  } catch (e) {}
  return 0
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

global.tick_armorWeight = function(event) {
  let server = event.server
  server.players.forEach(function(player) {
    try {
      if (player.spectator || player.creative) {
        // Strip any stale modifier in case the player toggled mode
        try {
          player.modifyAttribute('irons_spellbooks:mana_regen', UUID_MANA_REGEN, 0, 'addition')
          player.modifyAttribute('minecraft:generic.movement_speed', UUID_MOVE_SPEED, 0, 'multiply_base')
          player.modifyAttribute('minecraft:generic.armor', UUID_ARMOR, 0, 'multiply_base')
          player.modifyAttribute('minecraft:generic.armor_toughness', UUID_LIGHT_TOUGHNESS, 0, 'multiply_base')
        } catch (e) {}
        return
      }

      let lightCount = 0
      let heavyCount = 0
      ARMOR_SLOTS.forEach(function(slot) {
        let item = player.getEquipment(slot)
        let c = classifyArmor(item)
        if (c > 0) lightCount++
        else if (c < 0) heavyCount++
      })

      // net = light - heavy. Positive = lighter overall, negative = heavier.
      let netLight = lightCount - heavyCount

      // Apply attribute modifiers (modifyAttribute is upsert — calling with 0
      // value functionally clears, so this is safe to call every tick).
      player.modifyAttribute('irons_spellbooks:mana_regen',
        UUID_MANA_REGEN, netLight * PER_PIECE_MANA_REGEN, 'addition')

      player.modifyAttribute('minecraft:generic.movement_speed',
        UUID_MOVE_SPEED, netLight * PER_PIECE_SPEED, 'multiply_base')

      // Armor is INVERSE of netLight (heavy adds armor, light removes).
      player.modifyAttribute('minecraft:generic.armor',
        UUID_ARMOR, -netLight * PER_PIECE_ARMOR, 'multiply_base')

      // Universal light-armor toughness penalty (-7.5% per light piece).
      // Heavy does not contribute — asymmetric on purpose.
      player.modifyAttribute('minecraft:generic.armor_toughness',
        UUID_LIGHT_TOUGHNESS, -lightCount * PER_PIECE_TOUGHNESS, 'multiply_base')

      // Faefolk Ethereal Form (conditional). The Origins-side power is now
      // a stub (origins:simple, no native modifier — see
      // iridescent-origins-mod/.../faefolk/armor_weakness.json). Apply the
      // -50% toughness here ONLY if the player is wearing any non-light
      // armor; full robes (4/4 light) bypass the penalty.
      let faefolkPenalty = 0
      if (isFaefolk(player) && lightCount < 4) {
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
  // Just fire the same compute for this player. Cheap because it's only one
  // player at a time and runs only on a real inventory change.
  try {
    let player = event.player
    if (!player || player.spectator || player.creative) return
    let lightCount = 0
    let heavyCount = 0
    ARMOR_SLOTS.forEach(function(slot) {
      let item = player.getEquipment(slot)
      let c = classifyArmor(item)
      if (c > 0) lightCount++
      else if (c < 0) heavyCount++
    })
    let netLight = lightCount - heavyCount
    player.modifyAttribute('irons_spellbooks:mana_regen',
      UUID_MANA_REGEN, netLight * PER_PIECE_MANA_REGEN, 'addition')
    player.modifyAttribute('minecraft:generic.movement_speed',
      UUID_MOVE_SPEED, netLight * PER_PIECE_SPEED, 'multiply_base')
    player.modifyAttribute('minecraft:generic.armor',
      UUID_ARMOR, -netLight * PER_PIECE_ARMOR, 'multiply_base')

    // Universal light-armor toughness penalty refresh
    player.modifyAttribute('minecraft:generic.armor_toughness',
      UUID_LIGHT_TOUGHNESS, -lightCount * PER_PIECE_TOUGHNESS, 'multiply_base')

    // Faefolk Ethereal Form refresh
    let faefolkPenalty = 0
    if (isFaefolk(player) && lightCount < 4) {
      faefolkPenalty = FAEFOLK_TOUGHNESS_PENALTY
    }
    player.modifyAttribute('minecraft:generic.armor_toughness',
      UUID_FAEFOLK_TOUGHNESS, faefolkPenalty, 'multiply_base')
  } catch (e) {}
})

console.log('[IridescentCraft] armor_weight loaded — light/medium/heavy per-piece scaling')
console.log('  light  +5% mana regen, +1.25% speed, -5% armor, -7.5% toughness (per piece)')
console.log('  medium  no effect (default for untagged armor)')
console.log('  heavy  -5% mana regen, -1.25% speed, +5% armor (per piece)')
