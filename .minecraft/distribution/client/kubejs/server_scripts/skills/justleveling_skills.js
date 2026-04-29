// =============================================================================
// IridescentCraft — JustLeveling Aptitude Skills
// File: kubejs/server_scripts/skills/justleveling_skills.js
//
// Passive and triggered skills that unlock at aptitude milestones (5/10/15/20/30).
// JustLeveling Fork stores aptitude levels in player NBT at:
//   ForgeData.justlevelingfork.aptitude.<name>
// Default aptitude level is 1 (not 0).
//
// Design plan: design/aptitude_skill_plan.md (IridescentCraft-internal repo)
//
// ┌────────────────┬─────┬──────────────────────────────────────────────────────┐
// │ Skill          │ Req │ Effect                                              │
// ├────────────────┼─────┼──────────────────────────────────────────────────────┤
// │ Might          │STR 5│ +1.5 attack damage, +5% max HP                      │
// │ Tough Hide     │CON 5│ +2 max HP flat                                      │
// │ Light Step     │DEX 5│ +5% movement speed                                  │
// │ Padded Frame   │DEF 5│ +1 armor, +1 armor toughness                        │
// │ Mana Spark     │MAG 5│ +20 max mana, +5% spell power                       │
// │ Curious        │INT 5│ +10% XP gain                                        │
// │ Steady Hand    │BLD 5│ +0.5 block reach                                    │
// │ Lucky Charm    │LCK 5│ +1 luck attribute                                   │
// │ Quarryman      │BLD10│ +5% block break speed                               │
// │ Fleet of Foot  │DEX10│ +15% movement speed                                 │
// │ Hearty Meals   │CON10│ Regen I when food >= 18 (well-fed)                  │
// │ Second Wind    │DEF10│ Regen III for 5s when HP < 30% (60s CD)             │
// │ Deadeye        │DEX15│ +10% projectile damage                              │
// │ Bulwark        │DEF15│ +25% knockback resistance                           │
// │ Mana Blaze     │MAG15│ +15% spell power                                    │
// │ Insight        │INT15│ +20% XP gain                                        │
// │ Hemorrhage     │STR20│ Wither I for 4s on melee hit                        │
// │ Overflow       │CON20│ Absorption I when at full HP                        │
// │ Turtle Shield  │DEF20│ +4 armor toughness when not blocking                │
// │ Rapid Fire     │DEX20│ TODO: +15% bow draw speed                           │
// │ True Strength  │STR30│ Execute non-boss mobs at <= 5% HP on melee hit      │
// │ Iron Stomach   │CON30│ Saturation effect every 5s                          │
// │ Lion Heart     │DEF30│ DR scales with missing HP (up to 30%)               │
// │ Excitement     │DEX30│ Speed III + Haste II for 10s on kill                │
// │ Mana Inferno   │MAG30│ +30% spell power (capstone)                         │
// │ Enlightenment  │INT30│ +30% XP gain                                        │
// │ Master Craft   │BLD30│ TODO: Craft bonus                                   │
// │ Motherlode     │LCK30│ TODO: mining 5x roll                                │
// ├────────────────┴─────┴──────────────────────────────────────────────────────┤
// │ Reserved for Batch 2/3:                                                   │
// │ - MAG 20 Mystic Ward (dynamic DR formula tied to spell power)             │
// │ - MAG 10 Conservation of Magic (mana-cost reduction)                      │
// │ - INT 10 Arcane Efficiency, INT 20 Materials Science (XP refund hooks)    │
// │ - STR 10/15, CON 15, BLD 15/20: event-driven, see plan                    │
// └─────────────────────────────────────────────────────────────────────────────┘
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
global.tick_justlevelingSkills = (event) => {
  let server = event.server
  let tick = server.tickCount

  server.players.forEach(player => {
    if (player.spectator || player.creative) return
    let apt = getCachedAptitudes(server, player)
    let uuid = player.uuid.toString()
    let name = player.username

    // ── Might (STR >= 5): +1.5 attack damage, +5% max HP ──
    try {
      let mightDmg = (apt.str >= 5) ? 1.5 : 0
      let mightHp  = (apt.str >= 5) ? 0.05 : 0
      player.modifyAttribute('minecraft:generic.attack_damage',
        'icraft_might_dmg', mightDmg, 'addition')
      player.modifyAttribute('minecraft:generic.max_health',
        'icraft_might_hp', mightHp, 'multiply_base')
    } catch (e) {}

    // ── Tough Hide (CON >= 5): +2 max HP flat ──
    try {
      let toughHp = (apt.con >= 5) ? 2 : 0
      player.modifyAttribute('minecraft:generic.max_health',
        'icraft_tough_hide', toughHp, 'addition')
    } catch (e) {}

    // ── Light Step (DEX >= 5): +5% movement speed ──
    // Note: jump-fall damage immunity will be handled in EntityEvents.hurt (Batch 2)
    try {
      let lsSpeed = (apt.dex >= 5) ? 0.05 : 0
      player.modifyAttribute('minecraft:generic.movement_speed',
        'icraft_light_step', lsSpeed, 'multiply_base')
    } catch (e) {}

    // ── Padded Frame (DEF >= 5): +1 armor, +1 armor toughness ──
    try {
      let padArmor = (apt.def >= 5) ? 1 : 0
      let padTough = (apt.def >= 5) ? 1 : 0
      player.modifyAttribute('minecraft:generic.armor',
        'icraft_padded_frame_a', padArmor, 'addition')
      player.modifyAttribute('minecraft:generic.armor_toughness',
        'icraft_padded_frame_t', padTough, 'addition')
    } catch (e) {}

    // ── Mana Spark (MAG >= 5): +20 max mana, +5% spell power ──
    // Apply to both ISS and Ars max-mana attributes; spell power across all 3
    // damage channels (puffish/ISS/Ars) per existing convention.
    try {
      let mpFlat = (apt.mag >= 5) ? 20 : 0
      let mpDmg  = (apt.mag >= 5) ? 0.05 : 0
      player.modifyAttribute('irons_spellbooks:max_mana',
        'icraft_mana_spark_iss_mp', mpFlat, 'addition')
      player.modifyAttribute('ars_nouveau:ars_nouveau.perk.max_mana',
        'icraft_mana_spark_ars_mp', mpFlat, 'addition')
      player.modifyAttribute('puffish_attributes:magic_damage',
        'icraft_mana_spark_dmg', mpDmg, 'multiply_base')
      player.modifyAttribute('irons_spellbooks:spell_power',
        'icraft_mana_spark_iss_dmg', mpDmg, 'multiply_base')
      player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
        'icraft_mana_spark_ars_dmg', mpDmg, 'multiply_base')
    } catch (e) {}

    // ── Curious (INT >= 5): +10% XP gain ──
    try {
      let curiousXp = (apt.int >= 5) ? 0.10 : 0
      player.modifyAttribute('puffish_attributes:experience',
        'icraft_curious', curiousXp, 'multiply_base')
    } catch (e) {}

    // ── Steady Hand (BLD >= 5): +0.5 block reach ──
    try {
      let reach = (apt.bld >= 5) ? 0.5 : 0
      player.modifyAttribute('forge:block_reach',
        'icraft_steady_hand', reach, 'addition')
    } catch (e) {}

    // ── Lucky Charm (LCK >= 5): +1 luck ──
    try {
      let luck = (apt.lck >= 5) ? 1 : 0
      player.modifyAttribute('minecraft:generic.luck',
        'icraft_lucky_charm', luck, 'addition')
    } catch (e) {}

    // ── Quarryman (BLD >= 10): +5% block break speed ──
    try {
      let qmSpeed = (apt.bld >= 10) ? 0.05 : 0
      player.modifyAttribute('minecraft:player.block_break_speed',
        'icraft_quarryman', qmSpeed, 'multiply_base')
    } catch (e) {}

    // ── Deadeye (DEX >= 15): +10% projectile damage ──
    try {
      let ddDmg = (apt.dex >= 15) ? 0.10 : 0
      player.modifyAttribute('apothic_attributes:projectile_damage',
        'icraft_deadeye', ddDmg, 'multiply_base')
    } catch (e) {}

    // ── Bulwark (DEF >= 15): +25% knockback resistance ──
    try {
      let bwKb = (apt.def >= 15) ? 0.25 : 0
      player.modifyAttribute('minecraft:generic.knockback_resistance',
        'icraft_bulwark', bwKb, 'addition')
    } catch (e) {}

    // ── Mana Blaze (MAG >= 15): +15% spell power ──
    try {
      let mbDmg = (apt.mag >= 15) ? 0.15 : 0
      player.modifyAttribute('puffish_attributes:magic_damage',
        'icraft_mana_blaze', mbDmg, 'multiply_base')
      player.modifyAttribute('irons_spellbooks:spell_power',
        'icraft_mana_blaze_iss', mbDmg, 'multiply_base')
      player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
        'icraft_mana_blaze_ars', mbDmg, 'multiply_base')
    } catch (e) {}

    // ── Insight (INT >= 15): +20% XP gain (stacks additively with Curious/Enlightenment) ──
    try {
      let insightXp = (apt.int >= 15) ? 0.20 : 0
      player.modifyAttribute('puffish_attributes:experience',
        'icraft_insight', insightXp, 'multiply_base')
    } catch (e) {}

    // ── Mana Inferno (MAG >= 30): +30% spell power capstone ──
    try {
      let miDmg = (apt.mag >= 30) ? 0.30 : 0
      player.modifyAttribute('puffish_attributes:magic_damage',
        'icraft_mana_inferno', miDmg, 'multiply_base')
      player.modifyAttribute('irons_spellbooks:spell_power',
        'icraft_mana_inferno_iss', miDmg, 'multiply_base')
      player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
        'icraft_mana_inferno_ars', miDmg, 'multiply_base')
    } catch (e) {}

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

    // ── MAG 20 (reserved): replaced by dynamic Mystic Ward in Batch 2 ──
    // Old Spell Attune (+25% spell power) is superseded by the
    // Mana Spark/Blaze/Inferno line (5+15+30 = 50% at full investment).
    // Strip any leftover modifier from previous installs.
    try {
      player.modifyAttribute('irons_spellbooks:spell_power',
        'icraft_spell_attunement', 0, 'multiply_base')
      player.modifyAttribute('ars_nouveau:ars_nouveau.perk.spell_damage',
        'icraft_spell_attunement', 0, 'multiply_base')
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

    // ── Enlightenment (INT >= 30): +30% XP gain ──
    // Stacks additively with Curious (+10%) and Insight (+20%) → +60% at full INT
    try {
      let entXp = (apt.int >= 30) ? 0.30 : 0
      player.modifyAttribute('puffish_attributes:experience',
        'icraft_enlightenment', entXp, 'multiply_base')
    } catch (e) {}

    // ── MAG 30 capstone is now Mana Inferno (handled above) ──
    // Old flat 15% Mystic Ward DR is removed; the dynamic Mystic Ward
    // formula moves down to MAG 20 and ships in Batch 2.
  })
}
global.registerServerTick('tick_justlevelingSkills', 100, 37)


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

  // ── Mystic Ward (MAG 20): dynamic DR formula — ships in Batch 2 ──
  // Was: flat 15% DR at MAG 30. New design moves DR to MAG 20 with
  // formula min(0.20, 0.05 + 0.01 * (spellPower / 0.20)).
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
  console.log('[IridescentCraft] JustLeveling Aptitude Skills loaded (Batch 1: 5-tier expansion)')
  console.log('  Tier 5 (Batch 1):')
  console.log('    STR 5: Might (+1.5 dmg, +5% HP)')
  console.log('    CON 5: Tough Hide (+2 max HP)')
  console.log('    DEX 5: Light Step (+5% speed; jump-fall in Batch 2)')
  console.log('    DEF 5: Padded Frame (+1 armor, +1 toughness)')
  console.log('    MAG 5: Mana Spark (+20 mana, +5% spell power)')
  console.log('    INT 5: Curious (+10% XP)')
  console.log('    BLD 5: Steady Hand (+0.5 reach)')
  console.log('    LCK 5: Lucky Charm (+1 luck)')
  console.log('  Tier 10:')
  console.log('    DEX 10: Fleet of Foot (+15% speed)')
  console.log('    CON 10: Hearty Meals (Regen I when well-fed)')
  console.log('    DEF 10: Second Wind (Regen III at low HP, 60s CD)')
  console.log('    BLD 10: Quarryman (+5% block break speed) [Batch 1]')
  console.log('  Tier 15 (Batch 1):')
  console.log('    DEX 15: Deadeye (+10% projectile damage)')
  console.log('    DEF 15: Bulwark (+25% knockback resistance)')
  console.log('    MAG 15: Mana Blaze (+15% spell power)')
  console.log('    INT 15: Insight (+20% XP)')
  console.log('  Tier 20:')
  console.log('    STR 20: Hemorrhage (Wither I on melee hit)')
  console.log('    CON 20: Overflow (Absorption at full HP)')
  console.log('    DEF 20: Turtle Shield (+4 toughness when not blocking)')
  console.log('  Tier 30:')
  console.log('    STR 30: True Strength (execute at <= 5% HP)')
  console.log('    DEX 30: Excitement (Speed III + Haste II on kill)')
  console.log('    CON 30: Iron Stomach (Saturation, slows hunger)')
  console.log('    DEF 30: Lion Heart (DR scales with missing HP, up to 30%)')
  console.log('    MAG 30: Mana Inferno (+30% spell power) [Batch 1]')
  console.log('    INT 30: Enlightenment (+30% XP) [rebalanced from +50%]')
  console.log('  Reserved for Batch 2: STR 10/15, CON 15, MAG 20 dynamic Mystic Ward, BLD 15, LCK 20/30')
  console.log('  Reserved for Batch 3: MAG 10 Conservation, INT 10/20 XP refunds, BLD 20/30 craft refund, DEX 20 draw speed')
})
