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
// `icraft_<feature>_*`. Attribute modifiers applied/removed via /attribute
// commands (NOT player.modifyAttribute) — testing shows the command path
// is more reliable across Forge/Connector/AttributeFix variations.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks),
// feedback_wiki_reference.md (consult wiki/classes/overview.md while reasoning).
// =============================================================================

try {
  // Helper from existing class_passives.js — duplicated here to avoid load-order assumption
  var hasClassH6 = function(player, className) {
    try {
      var result = player.server.runCommandSilent(
        'execute if entity ' + player.username +
        '[nbt={ForgeCaps:{"origins:origins":{Origins:{"origins:class":"icraft:' + className + '"}}}}]'
      )
      return result > 0
    } catch (e) { return false }
  }

  ServerEvents.tick(function(event) {
    var tick = event.server.tickCount

    // ── BERSERKER — Battle Trance (every second) ───────────────────────────
    // After 10s of continuous combat: +5% attack damage and +1 armor.
    // 5s without combat clears it.
    if (tick % 20 === 5) {
      event.server.players.forEach(function(player) {
        if (!hasClassH6(player, 'berserker')) return
        var name = player.username
        var data = player.persistentData
        var lastHit = data.getLong('icraft_berserker_lastHitTick') || 0
        var combatStart = data.getLong('icraft_berserker_combatStartTick') || 0
        var traceActive = data.getInt('icraft_berserker_tranceActive') === 1
        var now = tick

        var inCombat = (now - lastHit) <= 100  // 5s
        if (!inCombat) {
          // Combat ended
          data.putLong('icraft_berserker_combatStartTick', 0)
          if (traceActive) {
            player.server.runCommandSilent('attribute ' + name + ' minecraft:generic.attack_damage modifier remove icraft:berserker_trance')
            player.server.runCommandSilent('attribute ' + name + ' minecraft:generic.armor modifier remove icraft:berserker_trance')
            data.putInt('icraft_berserker_tranceActive', 0)
          }
          return
        }

        // In combat
        if (combatStart === 0) {
          data.putLong('icraft_berserker_combatStartTick', now)
          return
        }

        var combatDuration = now - combatStart
        if (combatDuration >= 200 && !traceActive) {  // 10s
          // Activate trance
          player.server.runCommandSilent('attribute ' + name + ' minecraft:generic.attack_damage modifier add icraft:berserker_trance 0.05 multiply_base')
          player.server.runCommandSilent('attribute ' + name + ' minecraft:generic.armor modifier add icraft:berserker_trance 1 add_value')
          data.putInt('icraft_berserker_tranceActive', 1)
        }
      })
    }

    // ── WANDERER — Adaptable (every 2s) ─────────────────────────────────────
    // Used 3+ different weapon TYPES within last 60s -> +10% attack_damage 30s.
    // Stamps weapon-type usage in persistentData on every melee hit (see EntityEvents.hurt below).
    if (tick % 40 === 10) {
      event.server.players.forEach(function(player) {
        if (!hasClassH6(player, 'wanderer')) return
        var name = player.username
        var data = player.persistentData
        var bonusUntil = data.getLong('icraft_wanderer_adaptUntil') || 0
        var bonusActive = data.getInt('icraft_wanderer_adaptActive') === 1

        if (tick >= bonusUntil && bonusActive) {
          player.server.runCommandSilent('attribute ' + name + ' minecraft:generic.attack_damage modifier remove icraft:wanderer_adapt')
          data.putInt('icraft_wanderer_adaptActive', 0)
        }
      })
    }

    // ── ARTIFICER — Resourceful (every 2s) ──────────────────────────────────
    // Speed I (movement +20%) when within 4 blocks of a crafting_table.
    if (tick % 40 === 25) {
      event.server.players.forEach(function(player) {
        if (!hasClassH6(player, 'artificer')) return
        var x = Math.floor(player.x), y = Math.floor(player.y), z = Math.floor(player.z)
        var name = player.username
        // Check 4-block cube around player for crafting_table
        var found = false
        for (var dx = -4; dx <= 4 && !found; dx++) {
          for (var dy = -2; dy <= 2 && !found; dy++) {
            for (var dz = -4; dz <= 4 && !found; dz++) {
              try {
                var b = player.level.getBlock(x + dx, y + dy, z + dz)
                if (b && b.id === 'minecraft:crafting_table') found = true
              } catch (e) {}
            }
          }
        }
        if (found) {
          // Apply Speed I for 4 seconds (re-applied each cycle = effectively continuous)
          player.server.runCommandSilent('effect give ' + name + ' minecraft:speed 4 0 true')
        }
      })
    }
  })

  // ── BERSERKER Battle Trance + SAMURAI Bushido + WANDERER Adaptable ──
  // 2026-05-15: migrated to DamageModifierRegistry (raw LivingHurtEvent).
  var DR_h6 = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
  var PlayerClass_h6 = Java.loadClass('net.minecraft.world.entity.player.Player')
  DR_h6.register('icraft.class_passives_h6', function(event) {
    try {
      var attacker = event.source.entity
      if (!(attacker instanceof PlayerClass_h6)) return
      if (!attacker.username) return
      var name = attacker.username
      var data = attacker.persistentData
      var server = attacker.server

      if (hasClassH6(attacker, 'berserker')) {
        data.putLong('icraft_berserker_lastHitTick', server.tickCount)
      }

      if (hasClassH6(attacker, 'samurai')) {
        var target = event.entity
        if (target && target.maxHealth && target.health >= target.maxHealth - 0.01) {
          event.amount = event.amount * 1.15
          data.putLong('icraft_samurai_firstStrikeTick', server.tickCount)
        }
      }

      // Wanderer Adaptable: track weapon type used for this hit
      if (hasClassH6(attacker, 'wanderer')) {
        var wpn = attacker.mainHandItem
        var wpnId = wpn && wpn.id ? String(wpn.id) : ''
        var wpnType = 'fist'
        if (wpnId.indexOf('sword') >= 0)         wpnType = 'sword'
        else if (wpnId.indexOf('axe') >= 0)      wpnType = 'axe'
        else if (wpnId.indexOf('bow') >= 0)      wpnType = 'bow'
        else if (wpnId.indexOf('crossbow') >= 0) wpnType = 'crossbow'
        else if (wpnId.indexOf('trident') >= 0)  wpnType = 'trident'
        else if (wpnId.indexOf('hammer') >= 0)   wpnType = 'hammer'
        else if (wpnId.indexOf('mace') >= 0)     wpnType = 'mace'
        else if (wpnId.indexOf('staff') >= 0 || wpnId.indexOf('wand') >= 0 || wpnId.indexOf('spell_book') >= 0) wpnType = 'magic'

        var now = server.tickCount
        var key = 'icraft_wanderer_wpn_' + wpnType
        data.putLong(key, now)

        // Count distinct weapon types used in last 60s (1200 ticks)
        var types = ['sword','axe','bow','crossbow','trident','hammer','mace','magic']
        var distinct = 0
        for (var i = 0; i < types.length; i++) {
          var t = data.getLong('icraft_wanderer_wpn_' + types[i]) || 0
          if (t > 0 && (now - t) <= 1200) distinct++
        }

        if (distinct >= 3) {
          // Activate / refresh adaptable
          data.putLong('icraft_wanderer_adaptUntil', now + 600) // 30s
          if (data.getInt('icraft_wanderer_adaptActive') !== 1) {
            server.runCommandSilent('attribute ' + name + ' minecraft:generic.attack_damage modifier add icraft:wanderer_adapt 0.10 multiply_base')
            data.putInt('icraft_wanderer_adaptActive', 1)
          }
        }
      }
    } catch (e) {
      console.warn('[class_passives_phase6h.hurt] threw: ' + e)
    }
  })

  // ── SAMURAI Bushido — kill within 3s of first strike grants Speed II for 3s ──
  EntityEvents.death(function(event) {
    try {
      var killer = event.source && event.source.player
      if (!killer || !killer.username) return
      if (!hasClassH6(killer, 'samurai')) return

      var data = killer.persistentData
      var firstStrike = data.getLong('icraft_samurai_firstStrikeTick') || 0
      var now = killer.server.tickCount
      if (firstStrike > 0 && (now - firstStrike) <= 60) {  // 3s
        // Grant Speed II for 3s
        killer.server.runCommandSilent('effect give ' + killer.username + ' minecraft:speed 3 1 true')
      }
      data.putLong('icraft_samurai_firstStrikeTick', 0)
    } catch (e) {
      console.warn('[class_passives_phase6h.death] threw: ' + e)
    }
  })

  console.log('[IridescentCraft] class_passives_phase6h loaded (Berserker Battle Trance, Samurai Bushido, Wanderer Adaptable, Artificer Resourceful)')
} catch (e) {
  console.warn('[IridescentCraft] class_passives_phase6h bootstrap FAILED: ' + e)
}
