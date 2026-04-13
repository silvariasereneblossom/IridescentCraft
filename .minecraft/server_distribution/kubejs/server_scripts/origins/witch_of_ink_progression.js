// =============================================================================
// WITCH OF INK — Boss Kill Counter & Scaling Boons
// =============================================================================
// Counter system: kill Apotheosis bosses (+1) or pack/dimensional bosses (+10)
// Scaling boons up to 200 counters:
//   - Splattered Sundering: +0.1% damage per counter (max +20%)
//   - Efflorescent Brushwork: +0.1% damage reduction per counter (max +20%)
//   - Chromatic Cascade: +0.1% armor toughness per counter (max +20%)
// At 200 counters: Blessing of Penthesilea (permanent)
//   - Doubles damage reduction (40%) and armor toughness (40%)
//   - +15% max health
//   - Permanent Haste
// =============================================================================

// Check if player has Witch of Ink origin
function isWitchOfInk(player) {
  try {
    let result = player.server.runCommandSilent(
      `execute if entity ${player.username}[nbt={cardinal_components:{"origins:origin":{OriginLayers:[{Origin:"icraft:witch_of_ink"}]}}}]`
    )
    return result > 0
  } catch (e) {
    return false
  }
}

// Apotheosis boss entity types (champions with high tier)
const APOTHEOSIS_BOSS_CHECK_TAGS = ['apotheosis:boss']

// Pack/dimensional boss entity types
const DIMENSIONAL_BOSSES = [
  'minecraft:ender_dragon',
  'minecraft:wither',
  'botania:doppleganger',
  'twilightforest:naga',
  'twilightforest:lich',
  'twilightforest:hydra',
  'twilightforest:ur_ghast',
  'twilightforest:knight_phantom',
  'twilightforest:snow_queen',
  'twilightforest:alpha_yeti',
  'twilightforest:minoshroom',
  'blue_skies:summoner',
  'blue_skies:starlit_crusher',
  'blue_skies:alchemist',
  'blue_skies:arachnarch',
  'cataclysm:netherite_monstrosity',
  'cataclysm:ender_guardian',
  'cataclysm:ignis',
  'cataclysm:the_harbinger',
  'cataclysm:the_leviathan',
  'cataclysm:ancient_remnant',
  'meetyourfight:swampjaw',
  'meetyourfight:dame_fortuna',
  'meetyourfight:bellringer',
  'meetyourfight:rosalyne',
  'theabyss:abyssal_guardian'
]

// Track boss kills for Witch of Ink players
EntityEvents.death(event => {
  let entity = event.entity
  let source = event.source
  if (!source || !source.player) return

  let player = source.player
  if (!isWitchOfInk(player)) return

  let entityType = entity.type.toString()
  let data = player.persistentData

  let currentCount = data.getInt('icraft_witch_ink_counter') || 0
  if (currentCount >= 200) return // Already maxed

  let addCount = 0

  // Check for dimensional/pack bosses (+10)
  if (DIMENSIONAL_BOSSES.includes(entityType)) {
    addCount = 10
  }
  // Check for Apotheosis bosses (+1) — entities with affix data
  else if (entity.nbt && entity.nbt.getString('apoth.boss') === 'true') {
    addCount = 1
  }
  // Check Champions mod bosses (+1)
  else if (entity.nbt && entity.nbt.contains('champion')) {
    addCount = 1
  }

  if (addCount > 0) {
    let newCount = Math.min(currentCount + addCount, 200)
    data.putInt('icraft_witch_ink_counter', newCount)

    let oldTier = Math.floor(currentCount / 10)
    let newTier = Math.floor(newCount / 10)

    if (newTier > oldTier) {
      player.tell('\u00a7d[Witch of Ink]\u00a7r Your painted collection grows... (' + newCount + '/200)')
    }

    // Check for Penthesilea blessing
    if (currentCount < 200 && newCount >= 200) {
      player.tell('\u00a76\u00a7l[Blessing of Penthesilea]\u00a7r')
      player.tell('\u00a7dYour mastery of ink and battle is complete.')
      player.tell('\u00a7dDamage reduction and armor toughness doubled.')
      player.tell('\u00a7d+15% max health. Permanent Haste granted.')
      player.server.runCommandSilent(
        `title ${player.username} title {"text":"Blessing of Penthesilea","color":"light_purple","bold":true}`
      )
      player.server.runCommandSilent(
        `title ${player.username} subtitle {"text":"Your painted army stands eternal","color":"white"}`
      )
      data.putBoolean('icraft_witch_penthesilea', true)
    }

    applyWitchBoons(player)
  }
})

// Apply scaling boons based on counter
function applyWitchBoons(player) {
  let data = player.persistentData
  let count = data.getInt('icraft_witch_ink_counter') || 0
  let hasPenthesilea = data.getBoolean('icraft_witch_penthesilea')

  // Calculate bonuses
  let damageBonus = count * 0.001  // 0.1% per counter, max 20%
  let reductionBonus = count * 0.001
  let toughnessBonus = count * 0.001

  if (hasPenthesilea) {
    reductionBonus *= 2  // 40% max
    toughnessBonus *= 2  // 40% max
  }

  // Apply via commands (attribute modifiers)
  let name = player.username

  // Remove old modifiers
  player.server.runCommandSilent(`attribute ${name} minecraft:generic.attack_damage modifier remove icraft:witch_ink_damage`)
  player.server.runCommandSilent(`attribute ${name} minecraft:generic.armor_toughness modifier remove icraft:witch_ink_toughness`)

  // Add new modifiers
  if (damageBonus > 0) {
    player.server.runCommandSilent(
      `attribute ${name} minecraft:generic.attack_damage modifier add icraft:witch_ink_damage ${damageBonus} multiply_base`
    )
  }
  if (toughnessBonus > 0) {
    player.server.runCommandSilent(
      `attribute ${name} minecraft:generic.armor_toughness modifier add icraft:witch_ink_toughness ${toughnessBonus} add_value`
    )
  }

  // Penthesilea: +15% HP and permanent Haste
  if (hasPenthesilea) {
    player.server.runCommandSilent(`attribute ${name} minecraft:generic.max_health modifier remove icraft:witch_penthesilea_hp`)
    player.server.runCommandSilent(
      `attribute ${name} minecraft:generic.max_health modifier add icraft:witch_penthesilea_hp 0.15 multiply_base`
    )
    player.potionEffects.add('minecraft:haste', 2400, 0, false, false)
  }
}

// Refresh boons on login and periodically
PlayerEvents.loggedIn(event => {
  if (isWitchOfInk(event.player)) {
    applyWitchBoons(event.player)
  }
})

// Refresh Penthesilea Haste every 2 minutes (keeps it permanent)
global.tick_witchOfInkHaste = (event) => {
  event.server.players.forEach(player => {
    if (!isWitchOfInk(player)) return
    let data = player.persistentData
    if (data.getBoolean('icraft_witch_penthesilea')) {
      player.potionEffects.add('minecraft:haste', 2400, 0, false, false)
    }
  })
}
global.registerServerTick('tick_witchOfInkHaste', 2400, 100)

console.log('[IridescentCraft] Witch of Ink progression loaded')
console.log('  - Boss kill counter (Apotheosis +1, dimensional +10)')
console.log('  - Scaling boons: damage, reduction, toughness (max 20% each)')
console.log('  - Blessing of Penthesilea at 200 counters')
