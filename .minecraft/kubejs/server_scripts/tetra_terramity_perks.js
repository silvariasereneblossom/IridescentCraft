// @file kubejs/server_scripts/tetra_terramity_perks.js
// @events hurt, tick.server
// =============================================================================
// TETRA TERRAMITY PERKS -- functional perks for the 6 Terramity materials
// =============================================================================
// Companion to icraft_tetra_materials/data/tetra/materials/{gem,metal}/*.json
// (sapphire, topaz, ruby, onyx, dimlite, iridium).
//
// Tetra's native "improvement" system is for additive stat bonuses only --
// it doesn't support functional behaviors like "fire resistance while
// holding". This handler scans the player's mainhand for Tetra items
// whose modules contain one of our 6 materials and applies the perk:
//
//   sapphire -> Fire Resistance passive (refreshed each tick)
//   topaz    -> Sets target on fire 2s on hit
//   ruby     -> +50% damage when dealing fire-typed damage
//   onyx     -> +15% damage from owned/tamed entities (minions) of holder
//   dimlite  -> Night Vision passive (effective self-light source)
//   iridium  -> Increased knockback on melee hit
//
// Material detection: Tetra stores, per module, the VARIANT key under an NBT
// key ending in '_material' -- e.g.  "sword/basic_blade_material":
// "basic_blade/sapphire". The material is the last path segment.
//
// 2026-10-10: none of the six perks had ever applied, for three independent
// reasons (0_lib_core.js header has the accessor list):
//   * the item tag was read with stack.getTag(), which scripts do not have
//     (it is exposed as getNbt() / `stack.nbt`): every scan returned "no
//     materials" -- that also switched off the two passive perks;
//   * the scan compared the whole variant key ("basic_blade/sapphire") to the
//     bare material name ("sapphire");
//   * the hurt handler read `src.entity` (undefined) and stringified
//     `src.type` (a function object) for the ruby fire test.
// Also fixed: iridium pushed the target TOWARD the attacker (knockback(s, x, z)
// pushes against the given direction; vanilla passes attacker - target).
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// Whole file is one IIFE; nothing here is used by another script.
// =============================================================================

;(function () {
try {
  // Nothing below works without the core library. A missing one is said ONCE, for
  // every script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
  if (!icraft.lib.need('core', 'tetra_terramity_perks')) return
  var core = global.icraft.core

  var TERRAMITY_MATS = { sapphire: true, topaz: true, ruby: true, onyx: true, dimlite: true, iridium: true }
  var NO_MATS = { any: false }
  var SUFFIX = '_material'

  // Terramity materials on one stack -> { any: bool, sapphire: true, ... }
  var materialsOf = function (stack) {
    if (!stack) return NO_MATS
    var found = null
    try {
      if (stack.isEmpty()) return NO_MATS
      var tag = stack.nbt
      if (!tag) return NO_MATS
      tag.getAllKeys().forEach(function (k) {
        var key = String(k)
        var at = key.lastIndexOf(SUFFIX)
        if (key !== 'material' && (at < 0 || at !== key.length - SUFFIX.length)) return
        var value = String(tag.getString(key))
        var name = value.substring(value.lastIndexOf('/') + 1)
        if (TERRAMITY_MATS[name] === true) {
          if (!found) found = { any: true }
          found[name] = true
        }
      })
    } catch (e) {
      core.warnOnce('tetra_terramity.scan', '[tetra_terramity_perks] reading an item\'s materials threw: ' + e)
    }
    return found ? found : NO_MATS
  }

  // -- Tick handler: passive perks (sapphire fire-res, dimlite night-vision)
  global.tick_terramityTetraPerks = function (event) {
    event.server.players.forEach(function (player) {
      try {
        var mats = materialsOf(player.mainHandItem)
        if (!mats.any) return

        if (mats.sapphire) {
          // Fire Resistance, 5s refresh, ambient=false visible=false (hidden HUD)
          player.potionEffects.add('minecraft:fire_resistance', 100, 0, false, false)
        }
        if (mats.dimlite) {
          // Night Vision, ~11s refresh (avoids the flashing-end-of-effect screen)
          player.potionEffects.add('minecraft:night_vision', 220, 0, false, false)
        }
      } catch (e) {
        core.warnOnce('tetra_terramity.tick', '[tetra_terramity_perks] tick threw: ' + e)
      }
    })
  }
  // Register at 2s cadence -- light enough to not affect tps
  global.registerServerTick('tick_terramityTetraPerks', 40, 30)

  // The online player who owns this (tamed / owned) entity, or null.
  var ownerOf = function (entity) {
    try {
      if (typeof entity.getOwnerUUID !== 'function') return null
      var ownerUuid = entity.getOwnerUUID()
      if (!ownerUuid) return null
      var owner = entity.server.playerList.getPlayer(ownerUuid)
      return owner ? owner : null
    } catch (e) { return null }
  }

  // -- Hurt handler via DamageModifierRegistry (raw LivingHurtEvent).
  core.onHurt('icraft.tetra_terramity_perks', function (event, ctx) {
    var target = ctx.victim
    var src = ctx.source
    var attacker = ctx.attacker
    if (!target || !src || attacker === target) return

    if (!ctx.attackerIsPlayer) {
      // 1. Owned-minion Onyx bonus: the attacker has an owner -> the owner's mainhand
      var owner = ownerOf(attacker)
      if (owner && materialsOf(owner.mainHandItem).onyx) {
        event.amount = event.amount * 1.15
      }
      return
    }

    // Player-direct perks
    var mats = materialsOf(attacker.mainHandItem)
    if (!mats.any) return

    // 2. Topaz -- set the target on fire for 2 s (never shortens a longer burn)
    if (mats.topaz) {
      try {
        if (target.remainingFireTicks < 40) target.setRemainingFireTicks(40)
      } catch (e) {}
    }

    // 3. Ruby -- +50% when the hit itself is fire-typed
    if (mats.ruby && core.isFire(src)) {
      event.amount = event.amount * 1.5
    }

    // 4. Iridium -- stronger knockback on melee hit.
    // Skip projectile hits (those have ratios from arrow physics)
    if (mats.iridium) {
      var isMelee = false
      try { isMelee = (src.isIndirect() === false) } catch (e) {}
      if (isMelee) {
        try {
          // knockback(strength, x, z) pushes the entity AWAY from (x, z):
          // pass attacker - target, as vanilla does.
          var dx = attacker.x - target.x
          var dz = attacker.z - target.z
          if (Math.sqrt(dx * dx + dz * dz) > 0.01) {
            // Strength 1.5 = strong push but not skyward.
            target.knockback(1.5, dx, dz)
          }
        } catch (e) {}
      }
    }
  }, 'attacker')

  console.log('[IridescentCraft] tetra_terramity_perks loaded')
  console.log('  sapphire->fire_res passive | topaz->fire on hit')
  console.log('  ruby->+50% fire damage | onyx->+15% minion damage')
  console.log('  dimlite->night vision passive | iridium->stronger melee knockback')
} catch (e) {
  console.warn('[IridescentCraft] tetra_terramity_perks bootstrap FAILED: ' + e)
}
})()
