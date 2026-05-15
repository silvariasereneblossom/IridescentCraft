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

// ── LivingHurtEvent: total-damage multiplier on outgoing damage ──────────
// MULTIPLY_TOTAL on attack_damage only covers melee, leaving magic and
// projectile damage untouched. Hooking the hurt event multiplies whatever
// the damage source ended up being -- works for melee, bow, ISS spells,
// Ars spells, anything that goes through the standard damage pipeline.
EntityEvents.hurt(event => {
  let src = event.source
  if (!src) return
  let attacker = null
  try { attacker = src.player } catch (e) { return }
  if (!attacker || !isWitchOfInk(attacker)) return

  let data = attacker.persistentData
  let count = data.getInt('icraft_witch_ink_counter') || 0
  let hasPenthesilea = data.getBoolean('icraft_witch_penthesilea')

  // Per-counter scaling (cap 20% at count=200)
  let pct = Math.min(0.20, count * PER_COUNTER_PCT)

  if (hasPenthesilea) {
    pct += PENTHESILEA_BONUS_PCT  // additive +10%
    // Spellpower-to-AD conversion: 15% of (spell_power - 1.0).
    // ISS spell_power has base 1.0 (= 100%, the no-buff baseline). The
    // bonus portion above 1.0 is what counts.
    let sp = 1.0
    try {
      let attr = global._witchSpellPowerAttr
      if (attr) {
        let inst = attacker.getAttribute(attr)
        if (inst) sp = inst.getValue()
      }
    } catch (e) {}
    let bonusFromSP = Math.max(0, sp - 1.0) * SP_TO_AD_RATIO
    pct += bonusFromSP
  }

  if (pct > 0 && event.damage > 0) {
    event.damage = event.damage * (1 + pct)
  }
})

// Cache the ISS spell_power Attribute object once (it's stable across runtime).
try {
  let _RL = Java.loadClass('net.minecraft.resources.ResourceLocation')
  let _FR = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  global._witchSpellPowerAttr = _FR.ATTRIBUTES.getValue(_RL.tryParse(SP_ATTR_ID))
} catch (e) {
  global._witchSpellPowerAttr = null
}

// ── Defense scaling: armor_toughness, capstone HP ────────────────────────
function applyWitchToughness(player) {
  let data = player.persistentData
  let count = data.getInt('icraft_witch_ink_counter') || 0
  let name = player.username
  player.server.runCommandSilent(`attribute ${name} minecraft:generic.armor_toughness modifier remove icraft:witch_ink_toughness`)
  if (count > 0) {
    // +0.1 ADD_VALUE per counter (cap +20 at 200). The prior version
    // applied 0.001 per counter (cap +0.2), which was effectively
    // invisible -- documented intent and wiki entry called for +0.1.
    let toughness = count * 0.1
    player.server.runCommandSilent(
      `attribute ${name} minecraft:generic.armor_toughness modifier add icraft:witch_ink_toughness ${toughness} add_value`
    )
  }
}

function applyPenthesileaHP(player) {
  let data = player.persistentData
  let name = player.username
  player.server.runCommandSilent(`attribute ${name} minecraft:generic.max_health modifier remove icraft:witch_penthesilea_hp`)
  if (data.getBoolean('icraft_witch_penthesilea')) {
    player.server.runCommandSilent(
      `attribute ${name} minecraft:generic.max_health modifier add icraft:witch_penthesilea_hp 0.15 multiply_base`
    )
  }
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
console.log('  - Toughness: +0.001 ADD_VALUE per counter (cap +0.2 at 200)')
console.log('  - Penthesilea (at 200): +10% additive damage, +15% SP-to-AD conv,')
console.log('    +15% HP, permanent Haste I + Resistance I + Fire Resist + Regen I')
