// =============================================================================
// WITCH OF INK — Boss Kill Counter, Hyperscaling Damage, Penthesilea Capstone
// =============================================================================
// Counter (persistent NBT, max 200):
//   - Apotheosis bosses (apoth.boss NBT)        : +1
//   - Champions mod bosses (champion NBT)       : +1
//   - Dimensional bosses (hardcoded list)       : +10
//
// Per-counter scaling (applied to ALL outgoing damage, melee + magic):
//   - +0.1% TOTAL damage per counter (multiplicative on final damage)
//   - Caps at +20% (=1.20x) at 200 counters
//
// Per-counter passive defense:
//   - +0.1 armor_toughness ADD_VALUE per counter, cap +20 at 200
//     (vanilla toughness is flat-additive; no "damage_reduction" attribute
//     exists. Prior versions tracked a "reduction" stat that never landed
//     as a modifier -- intent was preserved here via the toughness path.)
//
// Capstone (Blessing of Penthesilea) at counter = 200:
//   - +15% max_health (MULTIPLY_BASE)
//   - +10% additive total damage (so cap+capstone = 1.30x damage)
//   - +15% Spellpower-to-Attack-Damage conversion: 15% of the player's
//     ISS spell_power "bonus" (above the 1.0 base) is added as a
//     MULTIPLY_BASE damage modifier. Refreshed once per second.
//   - Permanent buffs (re-applied every 2 min): Haste I, Resistance I,
//     Fire Resistance, Regeneration I.
//
// =============================================================================

// ── Helpers ──────────────────────────────────────────────────────────────
function isWitchOfInk(player) {
  try {
    let result = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:origin":"icraft:witch_of_ink"}}}}]`
    )
    return result > 0
  } catch (e) {
    return false
  }
}

const DIMENSIONAL_BOSSES = [
  'minecraft:ender_dragon', 'minecraft:wither',
  'botania:doppleganger',
  'twilightforest:naga', 'twilightforest:lich', 'twilightforest:hydra',
  'twilightforest:ur_ghast', 'twilightforest:knight_phantom',
  'twilightforest:snow_queen', 'twilightforest:alpha_yeti',
  'twilightforest:minoshroom',
  'blue_skies:summoner', 'blue_skies:starlit_crusher',
  'blue_skies:alchemist', 'blue_skies:arachnarch',
  'cataclysm:netherite_monstrosity', 'cataclysm:ender_guardian',
  'cataclysm:ignis', 'cataclysm:the_harbinger',
  'cataclysm:the_leviathan', 'cataclysm:ancient_remnant',
  'meetyourfight:swampjaw', 'meetyourfight:dame_fortuna',
  'meetyourfight:bellringer', 'meetyourfight:rosalyne',
  'theabyss:abyssal_guardian',
]

const SP_ATTR_ID = 'irons_spellbooks:spell_power'
const PENTHESILEA_BONUS_PCT = 0.10                  // additive at cap
const PER_COUNTER_PCT = 0.001                        // 0.1% per counter
const COUNTER_MAX = 200
const SP_TO_AD_RATIO = 0.15                          // capstone conversion

// ── Counter increment on boss kill ───────────────────────────────────────
EntityEvents.death(event => {
  let entity = event.entity
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  if (!isWitchOfInk(player)) return

  let entityType = entity.type.toString()
  let data = player.persistentData

  let currentCount = data.getInt('icraft_witch_ink_counter') || 0
  if (currentCount >= COUNTER_MAX) return

  let addCount = 0
  if (DIMENSIONAL_BOSSES.includes(entityType)) {
    addCount = 10
  } else if (entity.nbt && entity.nbt.getString('apoth.boss') === 'true') {
    addCount = 1
  } else if (entity.nbt && entity.nbt.contains('champion')) {
    addCount = 1
  }
  if (addCount <= 0) return

  let newCount = Math.min(currentCount + addCount, COUNTER_MAX)
  data.putInt('icraft_witch_ink_counter', newCount)

  let oldTier = Math.floor(currentCount / 10)
  let newTier = Math.floor(newCount / 10)
  if (newTier > oldTier) {
    player.tell('§d[Witch of Ink]§r Your painted collection grows... (' + newCount + '/' + COUNTER_MAX + ')')
  }

  if (currentCount < COUNTER_MAX && newCount >= COUNTER_MAX) {
    player.tell('§6§l[Blessing of Penthesilea]§r')
    player.tell('§dYour mastery of ink and battle is complete.')
    player.tell('§d+10% damage, +15% SP-to-AD conversion, +15% max HP.')
    player.tell('§dPermanent: Haste I, Resistance I, Fire Resistance, Regen I.')
    player.server.runCommandSilent(
      `title ${player.username} title {"text":"Blessing of Penthesilea","color":"light_purple","bold":true}`
    )
    player.server.runCommandSilent(
      `title ${player.username} subtitle {"text":"Your painted army stands eternal","color":"white"}`
    )
    data.putBoolean('icraft_witch_penthesilea', true)
  }

  applyWitchToughness(player)
  applyPenthesileaHP(player)
})

// ── Damage multiplier moved to Java (iridescent_tetra_expansion mod) ─────
// KubeJS's EntityEvents.hurt wrapper exposes getDamage() but no settable
// damage -- `event.damage = X` throws EvaluatorException at runtime on
// this KubeJS version. The Witch's per-counter + Penthesilea total-damage
// multiplier is now applied by `WitchOfInkDamageHandler` in the mod jar,
// subscribed directly to Forge's LivingHurtEvent (which has setAmount).
// Same NBT keys (icraft_witch_ink_counter / icraft_witch_penthesilea)
// drive both sides; this JS file just writes them.

// ── Defense scaling: armor_toughness, capstone HP ────────────────────────
function applyWitchToughness(player) {
  let data = player.persistentData
  let count = data.getInt('icraft_witch_ink_counter') || 0
  // KubeJS modifyAttribute, NOT /attribute commands: the prior version used
  // 1.21 command syntax (single id, add_value op) which 1.20.1's command
  // parser rejects -- runCommandSilent swallowed the error, so this modifier
  // NEVER applied (confirmed in-game 2026-06-13 via /icraft armormods).
  // +0.1 addition per counter, cap +20 at 200.
  player.modifyAttribute('minecraft:generic.armor_toughness',
    'icraft_witch_ink_toughness', count * 0.1, 'addition')
}

function applyPenthesileaHP(player) {
  let data = player.persistentData
  let hp = data.getBoolean('icraft_witch_penthesilea') ? 0.15 : 0
  player.modifyAttribute('minecraft:generic.max_health',
    'icraft_witch_penthesilea_hp', hp, 'multiply_base')
}

// ── Penthesilea permanent buffs (renewed every 2 minutes) ────────────────
global.tick_witchOfInkBuffs = (event) => {
  event.server.players.forEach(player => {
    if (!isWitchOfInk(player)) return
    let data = player.persistentData
    if (!data.getBoolean('icraft_witch_penthesilea')) return
    // 2400 ticks = 2 minutes. Renew slightly faster than expiry to avoid blink.
    player.potionEffects.add('minecraft:haste',            2400, 0, false, false)
    player.potionEffects.add('minecraft:damage_resistance', 2400, 0, false, false)
    player.potionEffects.add('minecraft:fire_resistance',  2400, 0, false, false)
    player.potionEffects.add('minecraft:regeneration',     2400, 0, false, false)
  })
}
global.registerServerTick('tick_witchOfInkBuffs', 2200, 100)

// ── Login + initial state ────────────────────────────────────────────────
PlayerEvents.loggedIn(event => {
  if (!isWitchOfInk(event.player)) return
  applyWitchToughness(event.player)
  applyPenthesileaHP(event.player)
})

console.log('[IridescentCraft] Witch of Ink progression loaded')
console.log('  - Boss kill counter (Apotheosis/Champions +1, dimensional +10, cap 200)')
console.log('  - LivingHurtEvent: +0.1% total damage per counter (cap +20% at 200)')
console.log('  - Toughness: +0.1 addition per counter (cap +20 at 200)')
console.log('  - Penthesilea (at 200): +10% additive damage, +15% SP-to-AD conv,')
console.log('    +15% HP, permanent Haste I + Resistance I + Fire Resist + Regen I')
