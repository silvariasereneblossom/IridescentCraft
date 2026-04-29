// =============================================================================
// ARMOR WEIGHT SYSTEM — light / medium / heavy per-piece scaling
// =============================================================================
// Tags: data/icraft/tags/items/armor_{light,medium,heavy}.json
//
// Per-piece effects (scale linearly with the count of equipped pieces in
// each category):
//   light  +0.05 mana_regen, +1.25% movement_speed, -5% generic.armor
//   medium  no effect (default for untagged items)
//   heavy  -0.05 mana_regen, -1.25% movement_speed, +5% generic.armor
//
// Net (lightCount - heavyCount) determines the sign and magnitude. A
// player wearing 4 light pieces gets +20% mana regen / +5% speed / -20%
// armor; full plate gets the opposite.
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
//   axis 1 = mana_regen, 2 = movement_speed, 3 = armor
const UUID_MANA_REGEN       = 'icraft_armor_weight_mana_regen'
const UUID_MOVE_SPEED       = 'icraft_armor_weight_speed'
const UUID_ARMOR            = 'icraft_armor_weight_armor'

// Migration cleanup: prior cycle applied a -50% toughness modifier under
// this UUID for Faefolk players in non-light armor (Ethereal Form). The
// power was removed when robes' built-in -20% generic.armor (4 light
// pieces) became the sole frail-caster malus. We still re-zero this UUID
// every tick so existing characters with the stale modifier get cleaned
// up the moment they log in. Safe to drop after a release cycle.
const UUID_FAEFOLK_TOUGHNESS_LEGACY = 'icraft_faefolk_armor_weakness'

// Per-piece magnitudes
const PER_PIECE_MANA_REGEN = 0.05    // ADD on irons_spellbooks:mana_regen
const PER_PIECE_SPEED      = 0.0125  // MULTIPLY_BASE on generic.movement_speed
const PER_PIECE_ARMOR      = 0.05    // MULTIPLY_BASE on generic.armor

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
          player.modifyAttribute('minecraft:generic.armor_toughness', UUID_FAEFOLK_TOUGHNESS_LEGACY, 0, 'multiply_base')
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

      // One-cycle migration cleanup — see UUID_FAEFOLK_TOUGHNESS_LEGACY.
      player.modifyAttribute('minecraft:generic.armor_toughness',
        UUID_FAEFOLK_TOUGHNESS_LEGACY, 0, 'multiply_base')
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
    player.modifyAttribute('minecraft:generic.armor_toughness',
      UUID_FAEFOLK_TOUGHNESS_LEGACY, 0, 'multiply_base')
  } catch (e) {}
})

console.log('[IridescentCraft] armor_weight loaded — light/medium/heavy per-piece scaling')
console.log('  light  +5% mana regen, +1.25% speed, -5% armor (per piece)')
console.log('  medium  no effect (default for untagged armor)')
console.log('  heavy  -5% mana regen, -1.25% speed, +5% armor (per piece)')
