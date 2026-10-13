// @file kubejs/server_scripts/origins/class_passives_phase6h.js
// @events EntityEvents.death, PlayerEvents.loggedIn, PlayerEvents.respawned, ServerEvents.tick, hurt
// =============================================================================
// CLASS PASSIVES — Phase 6H additions
// =============================================================================
// Implements the Origins powers that previously lived as `origins:simple`
// (description-only) tooltips with no actual gameplay enforcement:
//
//   - Berserker  / Battle Trance     — combat-duration toggle: +5% damage / +1 armor after 10s combat, lost 5s after
//   - Samurai    / Bushido           — full-HP-bonus + post-kill speed boost
//   - Wanderer   / Adaptable         — recent-weapon-types tracker -> +10% damage 30s
//   - Artificer  / Resourceful       — Speed I near crafting tables (+10% bonus ore drops handled separately by LootJS)
//
// Pattern: tracker state lives in player.persistentData with prefix
// `icraft_<feature>_*`; attribute modifiers go through player.modifyAttribute
// (a TRANSIENT upsert keyed by the id string -- gone on relog/respawn, so the
// "active" flags are cleared on login + respawn below).
//
// Class detection: global.icraft.origin (0_lib_origins.js) -- cached, so the
// per-hit handler costs a map lookup. The old `execute if entity <name>[nbt=]`
// probe never parsed; none of this ran before 2026-10.
//
// Clocks: every stamp written to persistentData is `player.level.time`
// (world clock, survives restarts). `server.tickCount` only phases the tick.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks),
// feedback_wiki_reference.md (consult wiki/classes/overview.md while reasoning).
// =============================================================================

;(function () {
  try {
    // Bare class name ('berserker') or null.
    var classOf = function (player) {
      try {
        var id = global.icraft.origin.get(player, 'class')
        return id ? id.substring(id.indexOf(':') + 1) : null
      } catch (e) {
        return null
      }
    }

    // once per failing block per script load: the table and the wording of "once" are
    // global.icraft.core.warnOnce's (0_lib_core.js); this only adds the script's name
    var warnThrew = function (where, e) {
      global.icraft.core.warnOnce('origins/class_passives_phase6h:' + where, '[class_passives_phase6h] ' + where + ' threw: ' + e)
    }

    var eachPlayer = function (server, where, fn) {
      server.players.forEach(function (player) {
        try { fn(player) } catch (e) { warnThrew(where, e) }
      })
    }

    // KubeJS renames DamageSource.getEntity() to getActual() for scripts
    // (@RemapForJS on DamageSourceMixin), so `source.entity` is undefined here.
    var attackerOf = function (source) {
      if (!source) return null
      var a = source.actual
      if (a === undefined) a = source.entity
      return a || null
    }

    ServerEvents.tick(icraft.guard('origins/class_passives_phase6h', 'ServerEvents.tick', function (event) {
      var server = event.server
      var tick = server.tickCount

      // ── BERSERKER — Battle Trance (every second) ───────────────────────────
      // After 10s of continuous combat: +5% attack damage and +1 armor.
      // 5s without combat clears it.
      if (tick % 20 === 5) {
        eachPlayer(server, 'berserker battle trance', function (player) {
          if (classOf(player) !== 'berserker') return
          var data = player.persistentData
          var now = player.level.time
          var lastHit = data.getLong('icraft_berserker_lastHitTick') || 0
          var combatStart = data.getLong('icraft_berserker_combatStartTick') || 0
          var tranceActive = data.getInt('icraft_berserker_tranceActive') === 1

          var inCombat = lastHit > 0 && lastHit <= now && (now - lastHit) <= 100  // 5s
          if (!inCombat) {
            // Combat ended
            if (combatStart !== 0) data.putLong('icraft_berserker_combatStartTick', 0)
            if (tranceActive) {
              player.modifyAttribute('minecraft:generic.attack_damage', 'icraft_berserker_trance', 0, 'multiply_base')
              player.modifyAttribute('minecraft:generic.armor', 'icraft_berserker_trance', 0, 'addition')
              data.putInt('icraft_berserker_tranceActive', 0)
            }
            return
          }

          // In combat
          if (combatStart === 0 || combatStart > now) {
            data.putLong('icraft_berserker_combatStartTick', now)
            return
          }

          var combatDuration = now - combatStart
          if (combatDuration >= 200 && !tranceActive) {  // 10s
            // Activate trance (modifyAttribute -- old /attribute commands were
            // 1.21 syntax and never parsed on 1.20.1)
            player.modifyAttribute('minecraft:generic.attack_damage', 'icraft_berserker_trance', 0.05, 'multiply_base')
            player.modifyAttribute('minecraft:generic.armor', 'icraft_berserker_trance', 1, 'addition')
            data.putInt('icraft_berserker_tranceActive', 1)
          }
        })
      }

      // ── WANDERER — Adaptable (every 2s) ─────────────────────────────────────
      // Used 3+ different weapon TYPES within last 60s -> +10% attack_damage 30s.
      // Stamps weapon-type usage in persistentData on every hit (see the damage
      // handler below).
      if (tick % 40 === 10) {
        eachPlayer(server, 'wanderer adaptable', function (player) {
          if (classOf(player) !== 'wanderer') return
          var data = player.persistentData
          if (data.getInt('icraft_wanderer_adaptActive') !== 1) return
          var bonusUntil = data.getLong('icraft_wanderer_adaptUntil') || 0

          if (player.level.time >= bonusUntil) {
            player.modifyAttribute('minecraft:generic.attack_damage', 'icraft_wanderer_adapt', 0, 'multiply_base')
            data.putInt('icraft_wanderer_adaptActive', 0)
          }
        })
      }

      // ── ARTIFICER — Resourceful (every 2s) ──────────────────────────────────
      // Speed I (movement +20%) when within 4 blocks of a crafting_table.
      // The scan stays inside a 9x5x9 box around the player -- always loaded
      // chunks, so getBlock cannot force-load anything.
      if (tick % 40 === 25) {
        eachPlayer(server, 'artificer resourceful', function (player) {
          if (classOf(player) !== 'artificer') return
          var x = Math.floor(player.x), y = Math.floor(player.y), z = Math.floor(player.z)
          var level = player.level
          var found = false
          for (var dx = -4; dx <= 4 && !found; dx++) {
            for (var dy = -2; dy <= 2 && !found; dy++) {
              for (var dz = -4; dz <= 4 && !found; dz++) {
                var b = level.getBlock(x + dx, y + dy, z + dz)
                if (b && b.id === 'minecraft:crafting_table') found = true
              }
            }
          }
          if (found) {
            // Speed I for 4 seconds (re-applied each cycle = effectively continuous)
            player.potionEffects.add('minecraft:speed', 80, 0, false, false)
          }
        })
      }
    }))

    // The trance / adaptable attribute modifiers are transient (lost with the
    // player entity) while their "active" flags persist -- clear the flags when
    // the entity is rebuilt so the bonuses can re-arm instead of sitting in a
    // "flag says on, modifier is gone" state.
    var resetTransientFlags = function (event) {
      try {
        var data = event.player.persistentData
        data.putInt('icraft_berserker_tranceActive', 0)
        data.putInt('icraft_wanderer_adaptActive', 0)
      } catch (e) {
        warnThrew('flag reset', e)
      }
    }
    PlayerEvents.loggedIn(icraft.guard('origins/class_passives_phase6h', 'PlayerEvents.loggedIn', resetTransientFlags))
    PlayerEvents.respawned(icraft.guard('origins/class_passives_phase6h', 'PlayerEvents.respawned', resetTransientFlags))

    // ── BERSERKER Battle Trance + SAMURAI Bushido + WANDERER Adaptable ──
    // On the raw Forge LivingHurtEvent, through the shared dispatcher of 0_lib_core.js.
    // Runs on every hit by anything: bail before any work unless the attacker
    // is a player with one of the three classes (one cached lookup).
    //
    // Until 2026-10-13 the handler sat straight on the Java damage registry, which runs
    // its entries in the HASH order of their keys: this one ran after the dispatcher's
    // handlers, after the startup script's deathskin bonus, the Blazeborn bonus, the
    // armour clamp, Arcane Cleave and the unique-weapon multiplier, and before the
    // Enderian bonus. `place: 'last'` holds that place (the order inside it is the
    // library's list PLACED). `cancelled`: it is still called for a hit an earlier
    // handler cancelled, as it was (measured: a Berserker's hit with a broken weapon
    // deals nothing and still counts as combat for Battle Trance). `unchecked`: the
    // amount it hands on is left as it is. `who` is 'any' because of the one-per-boot
    // line below, which is printed on the first hurt event of any kind.
    // An option taken off, or added, changes behaviour: decision list entry 45; the hit
    // table that holds this handler is dev/engine-tests, suite `hit-table`.
    var WEAPON_TYPES = ['sword', 'axe', 'bow', 'crossbow', 'trident', 'hammer', 'mace', 'magic']
    var PlayerClass_h6 = Java.loadClass('net.minecraft.world.entity.player.Player')
    var sourceShapeLogged = false
    if (icraft.lib.need('core', 'origins/class_passives_phase6h')) global.icraft.core.onHurt('icraft.class_passives_h6', function (event) {
      try {
        // Secondary damage (splash / chain / reflect dealt through icraft.core.dealDamage)
        // lands as-is: it must not proc or be multiplied a second time. Same rule the
        // shared dispatcher applies to every onHurt handler (0_lib_core.js, RE-ENTRANCY).
        if (global.icraft && global.icraft.core && global.icraft.core.secondary && global.icraft.core.secondary(event.entity)) return
        // One line per boot, on the first damage event: how a DamageSource looks
        // to a script on this server. Expected: type=function entity=undefined
        // actual=object. (Several other scripts still read source.entity /
        // String(source.type); this line is the in-production proof either way.)
        if (!sourceShapeLogged) {
          sourceShapeLogged = true
          try {
            var probe = event.source
            console.log('[class_passives_phase6h] DamageSource as scripts see it: typeof source.type=' +
              (typeof probe.type) + ', typeof source.entity=' + (typeof probe.entity) +
              ', typeof source.actual=' + (typeof probe.actual) + ', source.getType()=' + String(probe.getType()))
          } catch (probeError) {
            console.log('[class_passives_phase6h] DamageSource probe failed: ' + probeError)
          }
        }

        var attacker = attackerOf(event.source)
        if (!(attacker instanceof PlayerClass_h6)) return
        var cls = classOf(attacker)
        if (cls !== 'berserker' && cls !== 'samurai' && cls !== 'wanderer') return

        var data = attacker.persistentData
        var now = attacker.level.time

        if (cls === 'berserker') {
          data.putLong('icraft_berserker_lastHitTick', now)
          return
        }

        if (cls === 'samurai') {
          var target = event.entity
          if (target && target.maxHealth && target.health >= target.maxHealth - 0.01) {
            event.amount = event.amount * 1.15
            data.putLong('icraft_samurai_firstStrikeTick', now)
          }
          return
        }

        // Wanderer Adaptable: track weapon type used for this hit
        var wpn = attacker.mainHandItem
        var wpnId = wpn && wpn.id ? String(wpn.id) : ''
        var wpnType = 'fist'
        if (wpnId.indexOf('sword') >= 0)         wpnType = 'sword'
        else if (wpnId.indexOf('axe') >= 0)      wpnType = 'axe'
        else if (wpnId.indexOf('crossbow') >= 0) wpnType = 'crossbow'  // before 'bow': 'crossbow' contains it
        else if (wpnId.indexOf('bow') >= 0)      wpnType = 'bow'
        else if (wpnId.indexOf('trident') >= 0)  wpnType = 'trident'
        else if (wpnId.indexOf('hammer') >= 0)   wpnType = 'hammer'
        else if (wpnId.indexOf('mace') >= 0)     wpnType = 'mace'
        else if (wpnId.indexOf('staff') >= 0 || wpnId.indexOf('wand') >= 0 || wpnId.indexOf('spell_book') >= 0) wpnType = 'magic'

        data.putLong('icraft_wanderer_wpn_' + wpnType, now)

        // Count distinct weapon types used in last 60s (1200 ticks)
        var distinct = 0
        for (var i = 0; i < WEAPON_TYPES.length; i++) {
          var t = data.getLong('icraft_wanderer_wpn_' + WEAPON_TYPES[i]) || 0
          if (t > 0 && t <= now && (now - t) <= 1200) distinct++
        }

        if (distinct >= 3) {
          // Activate / refresh adaptable
          data.putLong('icraft_wanderer_adaptUntil', now + 600) // 30s
          if (data.getInt('icraft_wanderer_adaptActive') !== 1) {
            attacker.modifyAttribute('minecraft:generic.attack_damage', 'icraft_wanderer_adapt', 0.10, 'multiply_base')
            data.putInt('icraft_wanderer_adaptActive', 1)
          }
        }
      } catch (e) {
        warnThrew('damage handler', e)
      }
    }, 'any', { place: 'last', cancelled: true, unchecked: true })

    // ── SAMURAI Bushido — kill within 3s of first strike grants Speed II for 3s ──
    EntityEvents.death(icraft.guard('origins/class_passives_phase6h', 'EntityEvents.death', function (event) {
      try {
        var killer = event.source && event.source.player
        if (!killer) return
        if (classOf(killer) !== 'samurai') return

        var data = killer.persistentData
        var firstStrike = data.getLong('icraft_samurai_firstStrikeTick') || 0
        if (firstStrike === 0) return
        var now = killer.level.time
        if (firstStrike <= now && (now - firstStrike) <= 60) {  // 3s
          // Speed II for 3s
          killer.potionEffects.add('minecraft:speed', 60, 1, false, false)
        }
        data.putLong('icraft_samurai_firstStrikeTick', 0)
      } catch (e) {
        warnThrew('bushido death handler', e)
      }
    }))

    console.log('[IridescentCraft] class_passives_phase6h loaded (Berserker Battle Trance, Samurai Bushido, Wanderer Adaptable, Artificer Resourceful)')
  } catch (e) {
    console.warn('[IridescentCraft] class_passives_phase6h bootstrap FAILED: ' + e)
  }
})()
