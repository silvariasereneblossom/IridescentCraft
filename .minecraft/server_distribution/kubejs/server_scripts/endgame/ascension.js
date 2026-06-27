// =============================================================================
// IridescentCraft — Ascension (Prestige) System
// File: kubejs/server_scripts/endgame/ascension.js
//
// Design Doc: "Ascension" — New Game+ Challenge Modifiers
//
// 5 Ascension levels. Permanent and irreversible per world.
// Stored as world-level persistent data on the Overworld ServerLevel.
//
// Mob scaling multipliers (applied ON TOP of dimension scaling, multiplicative):
//   Level 0: HP 1.0x,  DMG 1.0x
//   Level 1: HP 1.25x, DMG 1.2x
//   Level 2: HP 1.5x,  DMG 1.4x
//   Level 3: HP 1.75x, DMG 1.6x
//   Level 4: HP 2.0x,  DMG 1.8x
//   Level 5: HP 2.5x,  DMG 2.0x
//
// Player stat bonuses per level: [+3%, +6%, +9%, +12%, +15%] all stats
//
// Ascension Beacon recipe: Rift Core + Dragon Heart + Gaia Ingot + Nether Star
//
// Chat commands:
//   !ascension        — Check current ascension level and modifiers
//   !ascend           — Activate ascension (requires beacon in hand + 50 levels)
//   !ascension-set N  — (OP only) Force set ascension level to N
//   !ascension-reset  — (OP only) Reset ascension to 0
// =============================================================================

// ─── Constants ───

const ASCENSION_KEY = 'icraft_ascension_level'
const ASCENSION_MAX = 5

const ASCENSION_HP_MULT  = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5]
const ASCENSION_DMG_MULT = [1.0, 1.2,  1.4, 1.6,  1.8, 2.0]

// Player stat bonus per ascension level (percentage as decimal)
// Level 0 = no bonus, Level 1 = +3%, Level 2 = +6%, etc.
const ASCENSION_STAT_BONUS = [0.0, 0.03, 0.06, 0.09, 0.12, 0.15]

const ASCENSION_NAMES = [
  'Base',
  'I \u2014 The Awakening',
  'II \u2014 Corruption Spreads',
  'III \u2014 World Fracture',
  'IV \u2014 The Gauntlet',
  'V \u2014 Oblivion'
]

// ─── Ascension Level Storage ───
// Uses the Overworld's persistentData as the canonical global store
// (same pattern as boss_progressive.js kill counts)

function getAscensionLevel(level) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return 0

  let data = overworld.persistentData
  if (!data.contains(ASCENSION_KEY)) return 0
  return Math.min(data.getInt(ASCENSION_KEY), ASCENSION_MAX)
}

function setAscensionLevel(level, newLevel) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return false

  let clamped = Math.max(0, Math.min(newLevel, ASCENSION_MAX))
  overworld.persistentData.putInt(ASCENSION_KEY, clamped)
  return true
}

// =============================================================================
// 1. MOB SCALING — handler RELOCATED to scaling/zz_ascension_scaling.js
// =============================================================================
// The on-spawn HP/DMG multiplier moved to scaling/zz_ascension_scaling.js so it
// loads AFTER scaling/boss_hp.js (KubeJS fires EntityEvents.spawned handlers in
// alphabetical script-LOAD order; endgame/ sorts before scaling/). Running here,
// ascension's multiply_total was already on the entity when boss_hp read
// maxHealth to compute its multiply_base ratio, so boss_hp back-computed a ratio
// that SILENTLY CANCELLED ascension's HP buff for every BOSS_HP-table boss (at
// ascension level > 0 only). Full write-up + the fix live in that file's header
// and internal dev/failure-modes.md §2.
//
// Layering: dimension scaling = 'icraft_dim_*' (multiply_base); ascension =
// 'icraft_asc_*' (multiply_total), which vanilla applies AFTER all multiply_base
// → multiplicative: (base * (1 + dim)) * (1 + asc). e.g. Nether zombie @ Asc 5:
// 20 → x4.0 dim = 80 → x2.5 asc = 200.
// =============================================================================

// The on-spawn HP/DMG scaling handler that lived here was RELOCATED to
// scaling/zz_ascension_scaling.js so it loads AFTER scaling/boss_hp.js (see the
// section header above + that file for the load-order bug it fixes). Only the
// shared state the relocated handler needs is exposed here:

// Shared with scaling/zz_ascension_scaling.js (the relocated mob-scaling spawn
// handler) AND used locally by the chat/activation displays below. endgame/
// loads before scaling/, so this global is set before that handler can fire.
global.ICRAFT_ASCENSION = {
  getLevel: getAscensionLevel,
  HP_MULT:  ASCENSION_HP_MULT,
  DMG_MULT: ASCENSION_DMG_MULT,
}

// =============================================================================
// 2. PLAYER STAT BONUSES — Applied on login + periodic refresh
// =============================================================================
// Ascension grants a percentage bonus to: max_health, attack_damage,
// movement_speed, and armor. Applied as multiply_base on the player.
//
// Refreshed every 5 minutes to handle respawn/dimension-change edge cases
// (PlayerEvents.death and PlayerEvents.changeDimension don't exist in KubeJS 6).
// =============================================================================

PlayerEvents.loggedIn(event => {
  applyAscensionPlayerBonuses(event.player)
})

// Periodic refresh every 5 minutes
global.tick_ascensionRefresh = (event) => {
  event.server.players.forEach(player => {
    applyAscensionPlayerBonuses(player)
  })
}
global.registerServerTick('tick_ascensionRefresh', 6000, 0)

function applyAscensionPlayerBonuses(player) {
  let ascension = getAscensionLevel(player.level)
  let bonus = ASCENSION_STAT_BONUS[ascension]

  // Remove old modifiers first, then reapply.
  // This handles both level 0 (remove all) and mid-session level changes.

  let attributes = [
    { attr: 'minecraft:generic.max_health',     name: 'icraft_asc_player_hp'    },
    { attr: 'minecraft:generic.attack_damage',  name: 'icraft_asc_player_dmg'   },
    { attr: 'minecraft:generic.movement_speed', name: 'icraft_asc_player_spd'   },
    { attr: 'minecraft:generic.armor',          name: 'icraft_asc_player_armor' }
  ]

  attributes.forEach(a => {
    removeModifierSafe(player, a.attr, a.name)
    if (bonus > 0) {
      player.modifyAttribute(a.attr, a.name, bonus, 'multiply_base')
    }
  })
}

// Safely remove an attribute modifier (no-op if it doesn't exist)
function removeModifierSafe(entity, attribute, modifierName) {
  try {
    entity.getAttribute(attribute).removeModifier(modifierName)
  } catch (e) {
    // Modifier didn't exist — that's fine
  }
}

// =============================================================================
// 3. CHAT COMMANDS — All ascension commands in one handler
// =============================================================================

PlayerEvents.chat(event => {
  let message = event.message.trim()
  let lower = message.toLowerCase()
  let player = event.player

  // ── !ascension — Check current level ──
  if (lower === '!ascension') {
    event.cancel()
    let level = getAscensionLevel(player.level)
    if (level === 0) {
      player.tell(Text.gold('[Ascension] ').append(
        Text.white('This world is at base difficulty (Ascension 0).')
      ))
    } else {
      let hpPct = Math.round((ASCENSION_HP_MULT[level] - 1.0) * 100)
      let dmgPct = Math.round((ASCENSION_DMG_MULT[level] - 1.0) * 100)
      let statPct = Math.round(ASCENSION_STAT_BONUS[level] * 100)
      player.tell(Text.gold('[Ascension] ').append(
        Text.white('Level ' + level + ': ' + ASCENSION_NAMES[level])
      ))
      player.tell(Text.gray(
        '  Mob HP: +' + hpPct + '% | Mob Damage: +' + dmgPct + '% | Your Stats: +' + statPct + '%'
      ))
    }
    return
  }

  // ── !ascend — Activate ascension ──
  if (lower === '!ascend') {
    event.cancel()
    handleAscensionActivation(player)
    return
  }

  // ── !ascension-set N — (OP) Force set level ──
  if (lower.startsWith('!ascension-set ')) {
    event.cancel()
    if (!isOperator(player)) {
      player.tell(Text.red('You must be a server operator to use this command.'))
      return
    }
    let parts = lower.split(' ')
    let targetLevel = parseInt(parts[1])
    if (isNaN(targetLevel) || targetLevel < 0 || targetLevel > ASCENSION_MAX) {
      player.tell(Text.red('Invalid level. Must be 0-' + ASCENSION_MAX + '.'))
      return
    }
    setAscensionLevel(player.level, targetLevel)
    player.level.server.players.forEach(p => applyAscensionPlayerBonuses(p))
    player.tell(Text.gold('[Ascension] ').append(
      Text.white('Level set to ' + targetLevel + '.')
    ))
    console.log('[IridescentCraft] Ascension level set to ' + targetLevel + ' by operator ' + player.username)
    return
  }

  // ── !ascension-reset — (OP) Reset to 0 ──
  if (lower === '!ascension-reset') {
    event.cancel()
    if (!isOperator(player)) {
      player.tell(Text.red('You must be a server operator to use this command.'))
      return
    }
    setAscensionLevel(player.level, 0)
    player.level.server.players.forEach(p => applyAscensionPlayerBonuses(p))
    player.tell(Text.gold('[Ascension] ').append(
      Text.white('Ascension reset to 0.')
    ))
    console.log('[IridescentCraft] Ascension level reset to 0 by operator ' + player.username)
    return
  }
})

// =============================================================================
// 4. ASCENSION ACTIVATION LOGIC
// =============================================================================

function handleAscensionActivation(player) {
  let currentLevel = getAscensionLevel(player.level)

  if (currentLevel >= ASCENSION_MAX) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.red('You have already reached the maximum Ascension level (5).')
    ))
    return
  }

  // Check the player is holding the Ascension Beacon (NBT-tagged nether star)
  let mainHand = player.mainHandItem
  if (!mainHand || mainHand.id !== 'minecraft:nether_star' ||
      !mainHand.nbt || !mainHand.nbt.contains('icraft_ascension_beacon')) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.red('You must hold an Ascension Beacon in your main hand.')
    ))
    player.tell(Text.gray(
      '  Craft one: Void Core + Monstrous Horn + Gaia Ingot + Nether Star.'
    ))
    return
  }

  // Check XP level requirement (50 levels per ascension)
  if (player.experienceLevel < 50) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.red('You need at least 50 experience levels. You have ' + player.experienceLevel + '.')
    ))
    return
  }

  // ── All checks passed — perform ascension ──
  let newLevel = currentLevel + 1

  // Consume the beacon (1 from stack)
  mainHand.count--

  // Consume 50 levels
  player.experienceLevel = player.experienceLevel - 50

  // Set the new ascension level (world-wide, permanent)
  setAscensionLevel(player.level, newLevel)

  // Reapply player bonuses to all online players immediately
  let server = player.level.server
  server.players.forEach(p => {
    applyAscensionPlayerBonuses(p)
  })

  // ── Announce to all players ──
  server.players.forEach(p => {
    p.tell(Text.gold('[Ascension] ').append(
      Text.yellow(player.username + ' has activated Ascension ' + ASCENSION_NAMES[newLevel] + '!')
    ))
    p.tell(Text.red('The world grows more dangerous. This cannot be undone.'))

    // Dramatic sound effects
    server.runCommandSilent(
      'playsound minecraft:entity.wither.spawn master ' + p.username + ' ~ ~ ~ 1 0.5'
    )
    server.runCommandSilent(
      'playsound minecraft:entity.ender_dragon.growl master ' + p.username + ' ~ ~ ~ 1 0.8'
    )
  })

  // Show new modifiers
  let hpPct = Math.round((ASCENSION_HP_MULT[newLevel] - 1.0) * 100)
  let dmgPct = Math.round((ASCENSION_DMG_MULT[newLevel] - 1.0) * 100)
  let statPct = Math.round(ASCENSION_STAT_BONUS[newLevel] * 100)

  server.players.forEach(p => {
    p.tell(Text.gray('  Mob HP: +' + hpPct + '% | Mob Damage: +' + dmgPct + '%'))
    p.tell(Text.green('  All player stats: +' + statPct + '%'))
  })

  console.log('[IridescentCraft] Ascension level increased to ' + newLevel + ' by ' + player.username)
}

// =============================================================================
// 5. ASCENSION BEACON RECIPE
// =============================================================================
// Shaped recipe producing an NBT-tagged nether star.
// Components:
//   R = cataclysm:void_core (Rift Core proxy)
//   H = cataclysm:monstrous_horn (Dragon Heart proxy)
//   G = botania:gaia_ingot
//   N = minecraft:nether_star
// =============================================================================

ServerEvents.recipes(event => {
  event.shaped(
    Item.of('minecraft:nether_star', {
      icraft_ascension_beacon: true,
      display: {
        Name: '{"text":"Ascension Beacon","color":"gold","bold":true,"italic":false}',
        Lore: [
          '{"text":"Hold in main hand and type !ascend","color":"gray","italic":false}',
          '{"text":"to permanently increase world difficulty.","color":"gray","italic":false}',
          '{"text":"Requires 50 experience levels.","color":"red","italic":false}',
          '{"text":"This cannot be undone.","color":"dark_red","italic":false}'
        ]
      }
    }),
    [
      ' R ',
      'GNH',
      ' R '
    ],
    {
      R: 'cataclysm:void_core',
      H: 'cataclysm:monstrous_horn',
      G: 'botania:gaia_ingot',
      N: 'minecraft:nether_star'
    }
  ).id('iridescent:ascension_beacon')
})

// =============================================================================
// 6. UTILITY
// =============================================================================

function isOperator(player) {
  try {
    return player.hasPermissions(2)
  } catch (e) {
    return false
  }
}
