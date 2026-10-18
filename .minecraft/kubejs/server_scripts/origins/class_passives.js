// @file kubejs/server_scripts/origins/class_passives.js
// @events EntityEvents.death, tick.server
// @registry dimensions
// =============================================================================
// CLASS PASSIVES — KubeJS implementations for origin-described mechanics
// =============================================================================
// Class / race detection goes through the shared resolver in 0_lib_origins.js
// (global.icraft.origin): one cached NBT read per player per 5 s. The old
// per-file `execute if entity <name>[nbt=...]` probe never parsed (selector
// brackets need an @-selector), so nothing below ever ran before 2026-10.
//
// Everything lives in one IIFE: server scripts share a single Rhino scope, and
// the old top-level `getPlayerTier` here silently replaced the unrelated
// AStages-based `getPlayerTier` in bonfire/boss_compass_handler.js.
//
// Clocks: `server.tickCount` only PHASES the work (which sub-block runs this
// tick). Anything written to persistentData uses `player.level.time` — the
// world clock survives restarts, tickCount restarts at 0 every boot.
// =============================================================================

;(function () {

  // ── Helper: bare class name ('samurai') or null ──
  var getClass = function (player) {
    try {
      var id = global.icraft.origin.get(player, 'class')
      return id ? id.substring(id.indexOf(':') + 1) : null
    } catch (e) {
      return null
    }
  }

  var isRace = function (player, raceId) {
    try { return global.icraft.origin.is(player, 'race', raceId) } catch (e) { return false }
  }

  // Coordinates alone are not proximity: two players (or a player and a mob)
  // can share x/y/z in different dimensions.
  var sameDimension = function (a, b) {
    try { return String(a.level.dimension) === String(b.level.dimension) } catch (e) { return false }
  }

  // One line per failing block per script load -- console.warn lines are held
  // in memory until /reload, so a tick path must never log repeatedly.
  // once per failing block per script load: the table and the wording of "once" are
  // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
  var warnThrew = function (where, e) {
    global.icraft.core.warnOnce('origins/class_passives:' + where, '[class_passives] ' + where + ' threw: ' + e)
  }

  // Per-player fault isolation: one broken player/block must not take the
  // rest of the tick down (or reach TickMaster, which logs every time).
  var eachPlayer = function (server, where, fn) {
    server.players.forEach(function (player) {
      try { fn(player) } catch (e) { warnThrew(where, e) }
    })
  }

  // ── Helper: progression tier from visited dimensions (only goes up) ──
  // (was the top-level `getPlayerTier`; renamed + scoped, see header)
  //
  // Exact dimension ids, with the tier of each dimension's stage gate in
  // gates/astages_restrictions.js (operator ruling 2026-10-11: the stage gate
  // is the authority for a dimension's tier).
  //   * The Otherside and the Abyss are tier 3. This copy still had them at 4
  //     after the other six were moved (ea83e349). The Abyss's Frost World is
  //     tier 3 as well (same ruling).
  //   * Tier 4 was the End alone; the Aether joined it 2026-10-16.
  //   * Deep Aether has no dimension of its own: its biomes generate inside
  //     aether:the_aether, so it is tier 4 with the Aether (tier 2 until
  //     2026-10-16).
  // No substring tests: `includes('aether')` also "matched" a Deep Aether id
  // that does not exist, and would match any later id that merely contains it.
  // The table is the dimension registry (kubejs/config/icraft/registry/
  // dimensions.json, through icraft.dims): a dimension with the flag
  // `classPassives` counts, with its tier. Until 2026-10-13 the ten entries
  // stood here.

  var detectDimensionTier = function (player) {
    var data = player.persistentData
    var tier = data.getInt('icraft_detected_tier') || 1
    var here = icraft.dims.get(String(player.level.dimension), 'classPassives')
    if (here > tier) tier = here

    data.putInt('icraft_detected_tier', tier)
    return tier
  }


  // ===========================================================================
  // SAMURAI — Focus (Movement Shield + Vorpal Scaling)
  // ===========================================================================
  // Movement builds a shield tracked in persistentData (NOT absorption).
  // Shield displayed as absorption but managed carefully to avoid conflicts.
  // If shield HP depletes, 10s cooldown before it can rebuild.
  // Vorpal I-V via Strength effect, scaling with progression tier.
  // ===========================================================================

  global.tick_classPassives = function (event) {
    var server = event.server
    var tick = server.tickCount

    // ── SAMURAI FOCUS: every 1 second ──
    if (tick % 20 === 0) {
      eachPlayer(server, 'samurai focus', function (player) {
        if (getClass(player) !== 'samurai') return

        var data = player.persistentData
        var now = player.level.time

        // -- Vorpal: Strength based on progression tier --
        // T1 = Strength I (amp 0), T2 = II, T3 = III, T4 = IV, beyond = V
        var tier = detectDimensionTier(player)
        var vorpalAmp = Math.min(tier - 1, 4)
        // 3 s, no particles (same instance `effect give ... 3 <amp> true` built)
        player.potionEffects.add('minecraft:strength', 60, vorpalAmp, false, false)

        // -- Movement Shield --
        // contains(), not `getDouble() || player.x`: a sample taken at exactly
        // x = 0 / z = 0 is a real position, not "no sample yet".
        var lastX = data.contains('icraft_focus_x') ? data.getDouble('icraft_focus_x') : player.x
        var lastZ = data.contains('icraft_focus_z') ? data.getDouble('icraft_focus_z') : player.z
        var dx = player.x - lastX
        var dz = player.z - lastZ
        var dist = Math.sqrt(dx * dx + dz * dz)

        data.putDouble('icraft_focus_x', player.x)
        data.putDouble('icraft_focus_z', player.z)

        // Check cooldown (game-time stamp; a stale small value reads as ready)
        var cdExpires = data.getLong('icraft_focus_cd') || 0
        if (now < cdExpires) return  // Shield on cooldown, don't touch anything

        var shieldHP = data.getDouble('icraft_focus_shield') || 0
        var maxShield = player.maxHealth * 0.10

        // Detect shield damage: if current absorption < our shield, damage was taken
        var currentAbsorption = player.absorptionAmount || 0
        if (shieldHP > 0 && currentAbsorption < shieldHP) {
          // Shield took damage (or golden apple wore off — but if our shield was
          // lower than a golden apple's absorption, this won't trigger)
          shieldHP = Math.max(0, currentAbsorption)
          data.putDouble('icraft_focus_shield', shieldHP)

          if (shieldHP <= 0) {
            // Shield broke — start 10s cooldown
            data.putLong('icraft_focus_cd', now + 200)
            data.putDouble('icraft_focus_shield', 0)
            player.tell('\u00a7e[Focus]\u00a77 Shield shattered. Recharging...')
            return
          }
        }

        // Build shield from movement
        if (dist > 0.1 && shieldHP < maxShield) {
          var gain = Math.min(dist * 0.5, maxShield - shieldHP)
          shieldHP = Math.min(shieldHP + gain, maxShield)
          data.putDouble('icraft_focus_shield', shieldHP)

          // Only set absorption if our shield > current absorption
          // This prevents overwriting golden apple / totem absorption
          if (shieldHP > currentAbsorption) {
            player.absorptionAmount = shieldHP
          }
        }
      })
    }

    // ── WANDERER — Seasoned Traveler: every 5 seconds ──
    if (tick % 100 === 5) {
      eachPlayer(server, 'wanderer seasoned traveler', function (player) {
        if (getClass(player) !== 'wanderer') return

        var data = player.persistentData
        var currentDim = String(player.level.dimension)

        // Track visited dimensions. String(): getString hands back a Java
        // String, whose .split() is the Java one (a fixed Java array — .push
        // throws on it).
        var visited = String(data.getString('icraft_wanderer_dims') || '')
        var dimList = visited !== '' ? visited.split(',') : []

        if (dimList.indexOf(currentDim) < 0) {
          dimList.push(currentDim)
          data.putString('icraft_wanderer_dims', dimList.join(','))
          var found = dimList.length
          player.tell('\u00a7a[Seasoned Traveler]\u00a77 New dimension discovered! (' + found + ' total)')
          player.tell('\u00a77  +' + (found * 5) + '% XP, +' + (found * 2.5).toFixed(1) + '% speed')
        }

        // Apply bonuses based on dimension count
        var count = dimList.length
        if (count > 0) {
          var speedBonus = count * 0.025
          var xpBonus = count * 0.05

          // modifyAttribute, not /attribute (1.21 syntax never parsed on 1.20.1)
          player.modifyAttribute('minecraft:generic.movement_speed',
            'icraft_wanderer_travel_speed', speedBonus, 'multiply_base')

          try {
            player.modifyAttribute('puffish_attributes:experience',
              'icraft_wanderer_travel_xp', xpBonus, 'multiply_base')
          } catch (e) {}
        }
      })
    }

    // ── PALADIN — Healing Aura: every 5 seconds ──
    if (tick % 100 === 10) {
      eachPlayer(server, 'paladin healing aura', function (player) {
        if (getClass(player) !== 'paladin') return

        // Self-heal: 1 HP/5s when above 50% HP
        if (player.health > player.maxHealth * 0.5 && player.health < player.maxHealth) {
          player.heal(1)
        }

        // Heal nearby allies: 0.5 HP/5s within 8 blocks
        var px = player.x, py = player.y, pz = player.z
        server.players.forEach(function (ally) {
          if (ally === player) return
          var dx = ally.x - px, dy = ally.y - py, dz = ally.z - pz
          var distSq = dx * dx + dy * dy + dz * dz
          if (distSq > 64 || !sameDimension(ally, player)) return
          // (heal() is a no-op on a dead entity, so no alive check is needed)
          if (ally.health < ally.maxHealth) {
            ally.heal(0.5)
          }
        })
      })
    }

    // ── ARCHMAGE — Mana Attunement: tier-scaling spell power, every 10 seconds ──
    // Amplifies magic equipment: T1 +0%, T2 +5%, T3 +10%, T4 +15% spell power
    // Weak early (glass cannon with no payoff), devastating late (glass nuke)
    //
    // 2026-10-17: ONE channel, Iron's spell power. Until then the same bonus was
    // also put on puffish_attributes:magic_damage "for the other magic damage
    // channels". That attribute reads NaN (a Pufferfish dynamic attribute), but it
    // is not dead: Pufferfish's mixin multiplies, at the head of LivingEntity.hurt,
    // every hit whose type is minecraft:magic / indirect_magic or tagged
    // #c:is_magic / #neoforge:is_magic, and Iron's Spells tags all nine school
    // damage types #neoforge:is_magic. So an Iron's spell got the bonus twice
    // (tier 4: 1.15 x 1.15 = x1.3225 instead of +15%; measured on the full pack).
    // Spell power is the channel the Codex names, and it also scales an Iron's
    // spell's heals and shields; Ars Nouveau reads neither channel.
    if (tick % 200 === 25) {
      eachPlayer(server, 'archmage mana attunement', function (player) {
        if (getClass(player) !== 'archmage') return

        var tier = detectDimensionTier(player)

        // T1=0%, T2=5%, T3=10%, T4=15%
        var magicBonus = Math.max(0, (tier - 1) * 0.05)

        // (legacy attack_damage cleanup removed -- the old /attribute command
        // never parsed on 1.20.1, so no such modifier ever existed)

        if (magicBonus > 0) {
          try {
            player.modifyAttribute('irons_spellbooks:spell_power',
              'icraft_archmage_attunement', magicBonus, 'multiply_base')
          } catch (e) {}
        }
      })
    }

    // ── ORC — Bloodlust: hunger-scaling damage bonus, every 5 seconds ──
    // Up to +20% bonus damage as food level drops (20 = full, 0 = starving)
    // Linear scale: 0% at full, +20% at 0 food
    if (tick % 100 === 30) {
      eachPlayer(server, 'orc bloodlust', function (player) {
        if (!isRace(player, 'icraft:orc')) return

        var foodLevel = player.foodLevel  // 0-20
        // Scale: 0% at food 20, +20% at food 0
        var hungerBonus = Math.max(0, (20 - foodLevel) / 20) * 0.20

        player.modifyAttribute('minecraft:generic.attack_damage',
          'icraft_orc_bloodlust', hungerBonus > 0.01 ? hungerBonus : 0, 'multiply_base')
      })
    }

    // ── VANGUARD — Guardian's Presence: every 3 seconds ──
    // Weakness only affects melee attack damage, so applying it to passive
    // mobs (cows, pigs, etc.) has zero effect. Safe to target all non-player
    // living entities within range.
    if (tick % 60 === 15) {
      eachPlayer(server, 'vanguard guardian', function (player) {
        if (getClass(player) !== 'vanguard') return

        player.server.runCommandSilent(
          'execute at ' + player.username + ' run effect give @e[distance=..5,type=!player,type=!item,type=!experience_orb,type=!arrow,type=!area_effect_cloud] minecraft:weakness 5 0 true'
        )
      })
    }
  }
  global.registerServerTick('tick_classPassives', 5, 0)

  // ===========================================================================
  // VOID SUMMONER — Soul Tether (lifesteal + bonus XP from nearby deaths)
  // ===========================================================================
  // Fires for every living death in the world, so the body is cache lookups
  // only until a Void Summoner is actually in range.

  EntityEvents.death(icraft.guard('origins/class_passives', 'EntityEvents.death', function (event) {
    try {
      var entity = event.entity
      if (!entity || entity.player) return

      var server = entity.server
      if (!server) return

      server.players.forEach(function (player) {
        if (getClass(player) !== 'void_summoner') return

        var dx = player.x - entity.x
        var dy = player.y - entity.y
        var dz = player.z - entity.z
        var distSq = dx * dx + dy * dy + dz * dz

        if (distSq > 256) return  // 16 blocks
        if (!sameDimension(player, entity)) return

        // 10% bonus XP
        var bonus = Math.max(1, Math.floor(3 * 0.10))
        player.giveExperiencePoints(bonus)

        // 5% lifesteal from mob max HP, capped at 2 HP
        var mobMaxHP = entity.maxHealth || 20
        var heal = Math.min(mobMaxHP * 0.05, 2)
        if (heal > 0 && player.health < player.maxHealth) {
          player.heal(heal)
        }
      })
    } catch (e) {
      warnThrew('void summoner soul tether', e)
    }
  }))

  console.log('[IridescentCraft] Class passives loaded')
  console.log('  - Samurai: Focus (movement shield + Vorpal by tier)')
  console.log('  - Wanderer: Seasoned Traveler (dimension stacking)')
  console.log('  - Paladin: Healing Aura (AoE regen)')
  console.log('  - Archmage: Mana Attunement (magic bonus by tier)')
  console.log('  - Orc: Bloodlust (hunger-scaling damage)')
  console.log('  - Vanguard: Guardian\'s Presence (Weakness to nearby entities)')
  console.log('  - Void Summoner: Soul Tether (5% lifesteal, 10% bonus XP)')
})()
