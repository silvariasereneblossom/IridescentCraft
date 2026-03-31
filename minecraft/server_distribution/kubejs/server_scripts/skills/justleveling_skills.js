// =============================================================================
// IridescentCraft — JustLeveling Aptitude Skills
// File: kubejs/server_scripts/skills/justleveling_skills.js
//
// Passive and triggered skills that unlock at aptitude milestones (10, 20, 30).
// JustLeveling Fork stores aptitude levels in player NBT at:
//   ForgeData.justlevelingfork.aptitude.<name>
// Default aptitude level is 1 (not 0).
//
// ┌──────────────┬─────┬──────────────────────────────────────────────────────┐
// │ Skill        │ Req │ Effect                                              │
// ├──────────────┼─────┼──────────────────────────────────────────────────────┤
// │ Fleet of Foot│DEX10│ +15% movement speed (attribute modifier)            │
// │ Hearty Meals │CON10│ Regen I when food >= 18 (well-fed bonus)            │
// │ Second Wind  │DEF10│ Regen III for 5s when HP < 30% (60s cooldown)       │
// │ Hemorrhage   │STR20│ Wither I for 4s on melee hit (bleed DoT)            │
// │ Overflow     │CON20│ Absorption I when at full HP (overshield)           │
// │ Turtle Shield│DEF20│ +4 armor toughness when not blocking                │
// │ Spell Attune │MAG20│ +25% spell power (attribute modifier)               │
// │ Rapid Fire   │DEX20│ TODO: +15% bow draw speed (no standard attribute)   │
// │ True Strength│STR30│ Execute targets at <= 5% HP on melee hit            │
// │ Excitement   │DEX30│ Speed III + Haste II for 10s on kill                │
// │ Iron Stomach │CON30│ Saturation effect every 5s (slows hunger drain)     │
// │ Lion Heart   │DEF30│ DR scales with missing HP (up to 30%)               │
// │ Mystic Ward  │MAG30│ 15% flat damage reduction (magic ward)              │
// │ Enlightenment│INT30│ +50% XP gain (attribute modifier)                   │
// │ Motherlode   │LCK30│ TODO: 0.01% chance to 5x mining (needs LootJS)     │
// │ Arcane Effic.│MAG10│ TODO: -25% enchant XP cost (no clean hook)          │
// │ Resourceful  │BLD20│ TODO: Craft refund (no crafting event)              │
// │ Master Craft │BLD30│ TODO: Craft bonus (no crafting event)               │
// └──────────────┴─────┴──────────────────────────────────────────────────────┘
// =============================================================================

const APTITUDE_LIST = [
  'strength', 'constitution', 'dexterity', 'defense',
  'intelligence', 'building', 'magic', 'luck'
]

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read a single aptitude level from player NBT.
 * runCommandSilent returns the integer value for `data get entity`.
 * Falls back to 1 (default starting level).
 */
function getAptitude(server, player, aptitudeName) {
  try {
    return server.runCommandSilent(
      `data get entity ${player.username} ForgeData.justlevelingfork.aptitude.${aptitudeName}`
    )
  } catch (e) { return 1 }
}

// ═══════════════════════════════════════════════════════════════════════════════
// APTITUDE CACHE — reads all 8 aptitudes every 100 ticks per player
// ═══════════════════════════════════════════════════════════════════════════════
// Key: player UUID string -> { str, con, dex, def, int, bld, mag, lck, tick }
let aptitudeCache = {}

function getCachedAptitudes(server, player) {
  let uuid = player.uuid.toString()
  let cached = aptitudeCache[uuid]
  let now = server.tickCount
  if (cached && (now - cached.tick) < 100) return cached
  let data = {
    str: getAptitude(server, player, 'strength'),
    con: getAptitude(server, player, 'constitution'),
    dex: getAptitude(server, player, 'dexterity'),
    def: getAptitude(server, player, 'defense'),
    int: getAptitude(server, player, 'intelligence'),
    bld: getAptitude(server, player, 'building'),
    mag: getAptitude(server, player, 'magic'),
    lck: getAptitude(server, player, 'luck'),
    tick: now
  }
  aptitudeCache[uuid] = data
  return data
}

// Per-player cooldown tracking for Second Wind
// Key: UUID -> tick when cooldown expires
let secondWindCooldowns = {}

// Per-player tracking for Excitement kill detection
// Key: UUID -> tick when buff was last applied
let excitementTimers = {}


// ═══════════════════════════════════════════════════════════════════════════════
// CACHE CLEANUP — remove stale entries on login/logout
// ═══════════════════════════════════════════════════════════════════════════════
PlayerEvents.loggedIn(event => {
  let uuid = event.player.uuid.toString()
  delete aptitudeCache[uuid]
  delete secondWindCooldowns[uuid]
  delete excitementTimers[uuid]
})


// ═══════════════════════════════════════════════════════════════════════════════
// TICK-BASED PASSIVES — check every 100 ticks (5 seconds)
// Offset by 37 ticks to avoid stacking with other tick scripts
// ═══════════════════════════════════════════════════════════════════════════════
ServerEvents.tick(event => {
  let server = event.server
  let tick = server.tickCount
  if (tick % 100 !== 37) return

  server.players.forEach(player => {
    if (player.spectator || player.creative) return
    let apt = getCachedAptitudes(server, player)
    let uuid = player.uuid.toString()
    let name = player.username

    // ── Fleet of Foot (DEX >= 10): +15% movement speed ──
    try {
      if (apt.dex >= 10) {
        player.modifyAttribute('minecraft:generic.movement_speed',
          'icraft_fleet_of_foot', 0.15, 'multiply_base')
      } else {
        // Remove modifier if player doesn't qualify (respec scenario)
        player.modifyAttribute('minecraft:generic.movement_speed',
          'icraft_fleet_of_foot', 0, 'multiply_base')
      }
    } catch (e) {}

    // ── Hearty Meals (CON >= 10): Regen I when food >= 18 ──
    try {
      if (apt.con >= 10 && player.foodData.foodLevel >= 18) {
        player.potionEffects.add('minecraft:regeneration', 120, 0, false, false)
      }
    } catch (e) {}

    // ── Second Wind (DEF >= 10): Regen III when HP < 30%, 60s cooldown ──
    try {
      if (apt.def >= 10) {
        let hpPercent = player.health / player.maxHealth
        let cooldownExpires = secondWindCooldowns[uuid] || 0
        if (hpPercent < 0.30 && tick >= cooldownExpires) {
          // Grant Regeneration III for 5 seconds (100 ticks)
          player.potionEffects.add('minecraft:regeneration', 100, 2, false, true)
          // Set 60-second cooldown (1200 ticks)
          secondWindCooldowns[uuid] = tick + 1200
          // Notify player
          player.tell('\u00a77[\u00a7cSecond Wind\u00a77] \u00a7fRegeneration III activated!')
        }
      }
    } catch (e) {}

    // ── Turtle Shield (DEF >= 20): +4 armor toughness when not blocking ──
    try {
      if (apt.def >= 20) {
        if (!player.isBlocking()) {
          player.modifyAttribute('minecraft:generic.armor_toughness',
            'icraft_turtle_shield', 4, 'addition')
        } else {
          player.modifyAttribute('minecraft:generic.armor_toughness',
            'icraft_turtle_shield', 0, 'addition')
        }
      } else {
        player.modifyAttribute('minecraft:generic.armor_toughness',
          'icraft_turtle_shield', 0, 'addition')
      }
    } catch (e) {}

    // ── Spell Attunement (MAG >= 20): +25% spell power ──
    try {
      if (apt.mag >= 20) {
        player.modifyAttribute('irons_spellbooks:spell_power',
          'icraft_spell_attunement', 0.25, 'multiply_base')
        player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
          'icraft_spell_attunement', 0.25, 'multiply_base')
      } else {
        player.modifyAttribute('irons_spellbooks:spell_power',
          'icraft_spell_attunement', 0, 'multiply_base')
        player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
          'icraft_spell_attunement', 0, 'multiply_base')
      }
    } catch (e) {}

    // ── Overflow (CON >= 20): Absorption I when at full HP ──
    try {
      if (apt.con >= 20 && player.health >= player.maxHealth) {
        // Absorption I gives 4 HP (2 hearts) of overshield, refreshed every 5s
        player.potionEffects.add('minecraft:absorption', 120, 0, false, false)
      }
    } catch (e) {}

    // ── Iron Stomach (CON >= 30): Saturation to slow hunger drain ──
    try {
      if (apt.con >= 30) {
        server.runCommandSilent(
          `effect give ${name} minecraft:saturation 6 0 true`
        )
      }
    } catch (e) {}

    // ── Enlightenment (INT >= 30): +50% XP gain ──
    try {
      if (apt.int >= 30) {
        player.modifyAttribute('puffish_attributes:experience',
          'icraft_enlightenment', 0.50, 'multiply_base')
      } else {
        player.modifyAttribute('puffish_attributes:experience',
          'icraft_enlightenment', 0, 'multiply_base')
      }
    } catch (e) {}

    // ── Mystic Ward (MAG >= 30): Resistance I (applied as effect, DR in hurt event) ──
    // Handled in EntityEvents.hurt below. No tick action needed here.
    // The hurt event reads aptitude cache directly.
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// COMBAT: DEALING DAMAGE
// Hemorrhage (STR 20), True Strength (STR 30), Excitement kill tracking (DEX 30)
// ═══════════════════════════════════════════════════════════════════════════════
EntityEvents.hurt(event => {
  if (!event.source || !event.source.player) return
  let player = event.source.player
  let target = event.entity
  if (!target || !target.living) return
  // Don't trigger on players (PvP protection for bleed/execute)
  if (target.player) return

  let server = player.server
  let apt = getCachedAptitudes(server, player)

  // Check melee: source type should be 'player' or 'mob' (not arrow/trident/etc.)
  let srcType = ''
  try { srcType = event.source.type.toString() } catch (e) {}
  let isMelee = (srcType === 'player' || srcType === 'mob' || srcType === 'generic')
  // Also exclude indirect damage types
  let isProjectile = srcType.includes('arrow') || srcType.includes('trident') ||
                     srcType.includes('fireball') || srcType.includes('thrown')

  if (isMelee && !isProjectile) {
    // ── Hemorrhage (STR >= 20): Wither I for 4 seconds on melee hit ──
    if (apt.str >= 20) {
      try {
        target.potionEffects.add('minecraft:wither', 80, 0, false, false)
      } catch (e) {}
    }

    // ── True Strength (STR >= 30): Execute at <= 5% HP ──
    if (apt.str >= 30) {
      try {
        let remainingHp = target.health - event.damage
        let threshold = target.maxHealth * 0.05
        if (remainingHp > 0 && remainingHp <= threshold) {
          // Don't execute boss-type entities
          let type = target.type.toString()
          let isBoss = type.includes('dragon') || type.includes('wither') ||
                       type.includes('warden') || type.includes('elder_guardian') ||
                       type.includes('evoker') || type.includes('ravager') ||
                       type.includes('champion')
          if (!isBoss) {
            target.kill()
            // Visual feedback
            let pos = target.blockPosition()
            server.runCommandSilent(
              `particle minecraft:sweep_attack ${pos.x} ${pos.y + 1} ${pos.z} 0.5 0.5 0.5 0 3 force`
            )
          }
        }
      } catch (e) {}
    }
  }

  // ── Excitement kill tracking (DEX >= 30): buff on kill ──
  // Check if this hit would kill the target
  if (apt.dex >= 30) {
    try {
      let remainingHp = target.health - event.damage
      if (remainingHp <= 0 && !target.player) {
        // Target will die from this hit — grant speed + attack speed buff
        player.potionEffects.add('minecraft:speed', 200, 2, false, true)      // Speed III, 10s
        player.potionEffects.add('minecraft:haste', 200, 1, false, true)      // Haste II, 10s
        // Visual feedback
        let pos = player.blockPosition()
        server.runCommandSilent(
          `particle minecraft:happy_villager ${pos.x} ${pos.y + 1} ${pos.z} 0.5 0.5 0.5 0 8 force`
        )
      }
    } catch (e) {}
  }
})


// ═══════════════════════════════════════════════════════════════════════════════
// COMBAT: TAKING DAMAGE
// Lion Heart (DEF 30), Mystic Ward (MAG 30)
// ═══════════════════════════════════════════════════════════════════════════════
EntityEvents.hurt(event => {
  if (!event.entity || !event.entity.player) return
  let player = event.entity
  let server = player.server
  let apt = getCachedAptitudes(server, player)

  // ── Lion Heart (DEF >= 30): DR scales with missing HP (up to 30%) ──
  if (apt.def >= 30) {
    try {
      // Linear: 0% DR at full HP, 30% DR at 1 HP
      let missingPercent = 1 - (player.health / player.maxHealth)
      let dr = missingPercent * 0.30
      if (dr > 0.01) {
        event.damage *= (1 - dr)
      }
    } catch (e) {}
  }

  // ── Mystic Ward (MAG >= 30): 15% flat damage reduction ──
  if (apt.mag >= 30) {
    try {
      event.damage *= 0.85
    } catch (e) {}
  }
})


// ═══════════════════════════════════════════════════════════════════════════════
// COMBAT: KILL TRACKING via EntityEvents.death
// Excitement (DEX 30): additional kill detection for cases where damage
// doesn't immediately register as lethal in the hurt event
// ═══════════════════════════════════════════════════════════════════════════════
EntityEvents.death(event => {
  if (!event.entity || event.entity.player) return
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  let server = player.server

  let apt = getCachedAptitudes(server, player)

  // ── Excitement (DEX >= 30): Speed III + Haste II for 10s on kill ──
  if (apt.dex >= 30) {
    try {
      player.potionEffects.add('minecraft:speed', 200, 2, false, true)
      player.potionEffects.add('minecraft:haste', 200, 1, false, true)
      let pos = player.blockPosition()
      server.runCommandSilent(
        `particle minecraft:happy_villager ${pos.x} ${pos.y + 1} ${pos.z} 0.5 0.5 0.5 0 8 force`
      )
    } catch (e) {}
  }
})


// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP LOG
// ═══════════════════════════════════════════════════════════════════════════════
ServerEvents.loaded(event => {
  console.log('[IridescentCraft] JustLeveling Aptitude Skills loaded')
  console.log('  Implemented skills:')
  console.log('    DEX 10: Fleet of Foot (+15% speed)')
  console.log('    CON 10: Hearty Meals (Regen I when well-fed)')
  console.log('    DEF 10: Second Wind (Regen III at low HP, 60s CD)')
  console.log('    STR 20: Hemorrhage (Wither I on melee hit)')
  console.log('    CON 20: Overflow (Absorption at full HP)')
  console.log('    DEF 20: Turtle Shield (+4 armor toughness when not blocking)')
  console.log('    MAG 20: Spell Attunement (+25% spell power)')
  console.log('    STR 30: True Strength (execute at <= 5% HP)')
  console.log('    DEX 30: Excitement (Speed III + Haste II on kill)')
  console.log('    CON 30: Iron Stomach (Saturation, slows hunger)')
  console.log('    DEF 30: Lion Heart (DR scales with missing HP, up to 30%)')
  console.log('    MAG 30: Mystic Ward (15% flat DR)')
  console.log('    INT 30: Enlightenment (+50% XP gain)')
  console.log('  TODO: Rapid Fire (DEX 20), Arcane Efficiency (MAG 10),')
  console.log('    Resourceful (BLD 20), Master Craftsman (BLD 30), Motherlode (LCK 30)')
})
