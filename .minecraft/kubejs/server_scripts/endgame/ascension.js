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
// Ascension Beacon recipe: 2 Void Core + Monstrous Horn + Gaia Ingot + Nether Star
// (registered only while ASCEND_PLAYER_COMMAND_OPEN is true, see below)
//
// Chat commands:
//   !ascension        — Check current ascension level and modifiers
//   !ascend           — Activate ascension (requires beacon in hand + 50 levels)
//                       SWITCHED OFF: see ASCEND_PLAYER_COMMAND_OPEN
//   !ascension-set N  — (OP only) Force set ascension level to N
//   !ascension-reset  — (OP only) Reset ascension to 0
//
// 2026-10-11 — none of the four commands had ever done anything:
//   * every branch called event.cancel() FIRST. cancel() leaves the handler by
//     throwing, so the message was hidden and nothing after it ran;
//   * PlayerEvents.chat runs on a worker thread, and the handler changed world
//     data, attributes, inventory and XP right there. It now only records the
//     command; tick_ascensionChat carries it out on the server thread (the
//     codex_delivery.js pattern), and the cancel comes last, outside the try;
//   * the "remove old modifier" helper called AttributeInstance.removeModifier
//     with a NAME (it takes a UUID), inside a try: a silent no-op, so a reset
//     to 0 left every online player's bonus in place until they logged out.
//     player.modifyAttribute replaces its own modifier and player.removeAttribute
//     removes it (both key the UUID off the name);
//   * the two announcement sounds were played from the server's position, not
//     the player's, so nobody away from world spawn could hear them;
//   * the 50 levels were written straight into experienceLevel: the client's
//     bar would not have updated, and the XP-refund skill would have treated
//     it as an aptitude purchase. They are now taken through the pack's XP
//     wallet (global.icraft.aptitude.xp.take).
//   The status and operator commands work now. The player command does not,
//   on purpose (operator ruling 2026-10-11): see the switch below.
// =============================================================================

// ─── The switch ───
// !ascend is a permanent, irreversible, world-wide difficulty change that has
// never once run. It stays OFF until Ascension has been run on a scratch copy
// of the world and looked at (mob HP / damage at level 1+, the player bonuses,
// the announcement, the beacon and the 50 levels being taken).
// While false: !ascend answers "not open" and takes nothing, and the Ascension
// Beacon recipe is not registered (no point crafting a key to a locked door).
// To rehearse: set this to true IN THE SCRATCH COPY ONLY and /reload.
// To open it for players: set it to true here, in a commit of its own.
const ASCEND_PLAYER_COMMAND_OPEN = false

// ─── Constants ───

const ASCENSION_KEY = 'icraft_ascension_level'
const ASCENSION_MAX = 5

const ASCENSION_HP_MULT  = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5]
const ASCENSION_DMG_MULT = [1.0, 1.2,  1.4, 1.6,  1.8, 2.0]

// Player stat bonus per ascension level (percentage as decimal)
// Level 0 = no bonus, Level 1 = +3%, Level 2 = +6%, etc.
const ASCENSION_STAT_BONUS = [0.0, 0.03, 0.06, 0.09, 0.12, 0.15]

// Experience levels one ascension costs
const ASCENSION_LEVEL_COST = 50

const ASCENSION_NAMES = [
  'Base',
  'I — The Awakening',
  'II — Corruption Spreads',
  'III — World Fracture',
  'IV — The Gauntlet',
  'V — Oblivion'
]

// One warning per site per script load
const ascensionWarned = {}
function ascensionWarnOnce(site, error) {
  if (ascensionWarned[site]) return
  ascensionWarned[site] = true
  console.warn('[IridescentCraft] Ascension: ' + site + ' (logged once per script load): ' + error)
}

// ─── Ascension Level Storage ───
// Uses the Overworld's persistentData as the canonical global store
// (same pattern as boss_progressive.js kill counts)

function getAscensionLevel(level) {
  let server = level.server
  let overworld = server.getLevel('minecraft:overworld')
  if (!overworld) return 0

  let data = overworld.persistentData
  if (!data.contains(ASCENSION_KEY)) return 0
  return Math.max(0, Math.min(Number(data.getInt(ASCENSION_KEY)), ASCENSION_MAX))
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

// Shared with scaling/zz_ascension_scaling.js (the relocated mob-scaling spawn
// handler) AND used locally by the chat/activation displays below. endgame/
// loads before scaling/, so this global is set before that handler can fire.
global.ICRAFT_ASCENSION = {
  getLevel: getAscensionLevel,
  HP_MULT:  ASCENSION_HP_MULT,
  DMG_MULT: ASCENSION_DMG_MULT,
}

// =============================================================================
// 2. PLAYER STAT BONUSES — Applied on login, respawn + periodic refresh
// =============================================================================
// Ascension grants a percentage bonus to: max_health, attack_damage,
// movement_speed, and armor. Applied as multiply_base on the player.
//
// player.modifyAttribute adds a modifier that is NOT saved with the player
// (AttributeInstance.addTransientModifier), so it has to be put back on every
// new player entity: login, and respawn (death or leaving the End). The
// 5-minute refresh is the safety net for anything else.
// =============================================================================

const ASCENSION_PLAYER_ATTRIBUTES = [
  { attr: 'minecraft:generic.max_health',     name: 'icraft_asc_player_hp'    },
  { attr: 'minecraft:generic.attack_damage',  name: 'icraft_asc_player_dmg'   },
  { attr: 'minecraft:generic.movement_speed', name: 'icraft_asc_player_spd'   },
  { attr: 'minecraft:generic.armor',          name: 'icraft_asc_player_armor' }
]

function applyAscensionPlayerBonuses(player) {
  let ascension = getAscensionLevel(player.level)
  let bonus = ASCENSION_STAT_BONUS[ascension]

  // modifyAttribute replaces a modifier of the same name, so a level change
  // needs no separate removal; at level 0 the modifier is taken off.
  ASCENSION_PLAYER_ATTRIBUTES.forEach(a => {
    if (bonus > 0) {
      player.modifyAttribute(a.attr, a.name, bonus, 'multiply_base')
    } else {
      player.removeAttribute(a.attr, a.name)
    }
  })

  // A lowered max health leaves the old health above it until the next hit.
  if (player.health > player.maxHealth) player.health = player.maxHealth
}

function refreshAscensionPlayerBonuses(player) {
  try {
    applyAscensionPlayerBonuses(player)
  } catch (e) {
    ascensionWarnOnce('applying the player bonuses failed', e)
  }
}

PlayerEvents.loggedIn(event => {
  refreshAscensionPlayerBonuses(event.player)
})

PlayerEvents.respawned(event => {
  refreshAscensionPlayerBonuses(event.player)
})

// Periodic refresh every 5 minutes
global.tick_ascensionRefresh = (event) => {
  event.server.players.forEach(player => {
    refreshAscensionPlayerBonuses(player)
  })
}
global.registerServerTick('tick_ascensionRefresh', 6000, 0)

// =============================================================================
// 3. CHAT COMMANDS
// =============================================================================
// The chat handler runs on a worker thread: it recognises the command, leaves
// it in the player's persistentData and hides the message. tick_ascensionChat
// picks it up on the server thread within half a second and does the work.
// =============================================================================

const ASCENSION_PENDING_KEY = 'icraft_ascension_chat_pending'

// '!ascension' -> 'status', '!ascend' -> 'ascend', '!ascension-reset' -> 'reset',
// '!ascension-set 3' -> 'set 3'; anything else -> null (ordinary chat).
function parseAscensionCommand(lower) {
  if (lower === '!ascension') return 'status'
  if (lower === '!ascend') return 'ascend'
  if (lower === '!ascension-reset') return 'reset'
  if (lower === '!ascension-set' || lower.indexOf('!ascension-set ') === 0) {
    return 'set ' + lower.substring('!ascension-set'.length).trim()
  }
  return null
}

PlayerEvents.chat(event => {
  let handled = false
  try {
    let lower = String(event.message || '').trim().toLowerCase()
    let command = lower.charAt(0) === '!' ? parseAscensionCommand(lower) : null
    if (command !== null) {
      event.player.persistentData.putString(ASCENSION_PENDING_KEY, command)
      handled = true
    }
  } catch (e) {
    ascensionWarnOnce('reading a chat message failed', e)
  }
  // Last, and outside the try: cancel() works by throwing.
  if (handled) event.cancel()
})

global.registerServerTick('tick_ascensionChat', 10, 3, (event) => {
  event.server.players.forEach(player => {
    let data = player.persistentData
    if (!data.contains(ASCENSION_PENDING_KEY)) return
    let command = String(data.getString(ASCENSION_PENDING_KEY))
    data.remove(ASCENSION_PENDING_KEY)
    try {
      runAscensionCommand(player, command)
    } catch (e) {
      ascensionWarnOnce('running "' + command + '" failed', e)
      player.tell(Text.gold('[Ascension] ').append(
        Text.red('That command failed. Nothing was changed.')
      ))
    }
  })
})

function runAscensionCommand(player, command) {
  if (command === 'status') {
    tellAscensionStatus(player)
    return
  }

  if (command === 'ascend') {
    if (!ASCEND_PLAYER_COMMAND_OPEN) {
      player.tell(Text.gold('[Ascension] ').append(
        Text.red('Ascending is not open on this server yet.')
      ))
      player.tell(Text.gray('  Nothing was used up. !ascension shows the current level.'))
      return
    }
    handleAscensionActivation(player)
    return
  }

  // ── operator commands ──
  if (!isOperator(player)) {
    player.tell(Text.red('You must be a server operator to use this command.'))
    return
  }

  let targetLevel = 0
  if (command !== 'reset') {
    // 'set <N>'
    let argument = command.substring(3).trim()
    targetLevel = /^[0-9]+$/.test(argument) ? parseInt(argument, 10) : -1
    if (!(targetLevel >= 0 && targetLevel <= ASCENSION_MAX)) {
      player.tell(Text.red('Usage: !ascension-set <0-' + ASCENSION_MAX + '>'))
      return
    }
  }

  let before = getAscensionLevel(player.level)
  if (!setAscensionLevel(player.level, targetLevel)) {
    player.tell(Text.red('The Overworld is not loaded; the level was not changed.'))
    return
  }
  player.level.server.players.forEach(p => refreshAscensionPlayerBonuses(p))

  player.tell(Text.gold('[Ascension] ').append(
    Text.white(command === 'reset'
      ? 'Ascension reset to 0 (was ' + before + ').'
      : 'Level set to ' + targetLevel + ' (was ' + before + ').')
  ))
  player.tell(Text.gray(
    '  Player bonuses are updated now. Mobs take the new level as they spawn; mobs already in the world keep what they have.'
  ))
  console.log('[IridescentCraft] Ascension level ' + before + ' -> ' + targetLevel +
    ' (' + (command === 'reset' ? '!ascension-reset' : '!ascension-set') + ') by operator ' + player.username)
}

function tellAscensionStatus(player) {
  let level = getAscensionLevel(player.level)
  if (level === 0) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.white('This world is at base difficulty (Ascension 0).')
    ))
    return
  }
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

// =============================================================================
// 4. ASCENSION ACTIVATION LOGIC  (reached only while ASCEND_PLAYER_COMMAND_OPEN)
// =============================================================================
// Runs on the server thread (from tick_ascensionChat).

function handleAscensionActivation(player) {
  let currentLevel = getAscensionLevel(player.level)

  if (currentLevel >= ASCENSION_MAX) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.red('You have already reached the maximum Ascension level (' + ASCENSION_MAX + ').')
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
      '  Craft one: 2 Void Cores + Monstrous Horn + Gaia Ingot + Nether Star.'
    ))
    return
  }

  // Check XP level requirement (50 levels per ascension)
  let haveLevels = Math.floor(Number(player.xpLevel))
  if (!(haveLevels >= ASCENSION_LEVEL_COST)) {
    player.tell(Text.gold('[Ascension] ').append(
      Text.red('You need at least ' + ASCENSION_LEVEL_COST + ' experience levels. You have ' + haveLevels + '.')
    ))
    return
  }

  // ── All checks passed — perform ascension ──
  let newLevel = currentLevel + 1

  // Take the levels first, through the pack's XP wallet (LinearXP-aware, and
  // not counted as an aptitude purchase by the refund skill). If they do not
  // all come off, give back what did and stop: the beacon is still in hand.
  let wallet = (global.icraft && global.icraft.aptitude) ? global.icraft.aptitude.xp : null
  if (wallet) {
    let taken = Number(wallet.take(player, ASCENSION_LEVEL_COST))
    if (!(taken >= ASCENSION_LEVEL_COST)) {
      if (taken > 0) wallet.give(player, taken)
      player.tell(Text.gold('[Ascension] ').append(
        Text.red('The ' + ASCENSION_LEVEL_COST + ' levels could not be taken. Nothing was used up.')
      ))
      return
    }
  } else {
    player.addXPLevels(-ASCENSION_LEVEL_COST)
  }

  // Consume the beacon (1 from stack)
  mainHand.shrink(1)

  // Set the new ascension level (world-wide, permanent)
  setAscensionLevel(player.level, newLevel)

  // Reapply player bonuses to all online players immediately
  let server = player.level.server
  server.players.forEach(p => {
    refreshAscensionPlayerBonuses(p)
  })

  // ── Announce to all players ──
  let hpPct = Math.round((ASCENSION_HP_MULT[newLevel] - 1.0) * 100)
  let dmgPct = Math.round((ASCENSION_DMG_MULT[newLevel] - 1.0) * 100)
  let statPct = Math.round(ASCENSION_STAT_BONUS[newLevel] * 100)

  server.players.forEach(p => {
    p.tell(Text.gold('[Ascension] ').append(
      Text.yellow(player.username + ' has activated Ascension ' + ASCENSION_NAMES[newLevel] + '!')
    ))
    p.tell(Text.red('The world grows more dangerous. This cannot be undone.'))
    p.tell(Text.gray('  Mob HP: +' + hpPct + '% | Mob Damage: +' + dmgPct + '%'))
    p.tell(Text.green('  All player stats: +' + statPct + '%'))

    // Dramatic sound effects, played where the listener stands
    server.runCommandSilent(
      'execute at ' + p.username + ' run playsound minecraft:entity.wither.spawn master ' + p.username + ' ~ ~ ~ 1 0.5'
    )
    server.runCommandSilent(
      'execute at ' + p.username + ' run playsound minecraft:entity.ender_dragon.growl master ' + p.username + ' ~ ~ ~ 1 0.8'
    )
  })

  console.log('[IridescentCraft] Ascension level increased to ' + newLevel + ' by ' + player.username)
}

// =============================================================================
// 5. ASCENSION BEACON RECIPE  (only while ASCEND_PLAYER_COMMAND_OPEN)
// =============================================================================
// Shaped recipe producing an NBT-tagged nether star.
// Components:
//   R = cataclysm:void_core (Rift Core proxy)
//   H = cataclysm:monstrous_horn (Dragon Heart proxy)
//   G = botania:gaia_ingot
//   N = minecraft:nether_star
// =============================================================================

ServerEvents.recipes(event => {
  if (!ASCEND_PLAYER_COMMAND_OPEN) return

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

// Permission level 2 (ops.json, or the owner of a world with cheats on).
function isOperator(player) {
  try {
    return player.hasPermissions(2) === true
  } catch (e) {
    ascensionWarnOnce('the operator check failed, so operator commands are refused', e)
    return false
  }
}

console.log('[IridescentCraft] Ascension loaded: !ascension, !ascension-set <0-' + ASCENSION_MAX +
  '> and !ascension-reset (operators); player !ascend is ' + (ASCEND_PLAYER_COMMAND_OPEN ? 'OPEN' : 'OFF'))
