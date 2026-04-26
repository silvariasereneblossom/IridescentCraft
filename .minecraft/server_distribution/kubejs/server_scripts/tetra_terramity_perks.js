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
//   iridium  -> Increased knockback on melee hit (+50% impulse)
//
// Material detection: Tetra stores per-module material as NBT keys ending
// in '_material' on the item stack. We scan getAllKeys() for those and
// read the string values. Cheap; no Tetra API dependency.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
// =============================================================================

try {
  var TERRAMITY_MATS = ['sapphire', 'topaz', 'ruby', 'onyx', 'dimlite', 'iridium']

  // Read all material values from a stack's NBT. Returns array of strings
  // (e.g. ['sapphire', 'iron']) or empty array.
  var getTetraMaterials = function(stack) {
    if (!stack) return []
    try { if (stack.isEmpty()) return [] } catch (_) {}
    var tag = null
    try { tag = stack.getTag() } catch (_) { return [] }
    if (!tag) return []
    var keys = null
    try { keys = tag.getAllKeys() } catch (_) { return [] }
    if (!keys) return []
    var found = []
    var iter = keys.iterator()
    while (iter.hasNext()) {
      var k = String(iter.next())
      if (k.endsWith('_material') || k === 'material') {
        try {
          var v = String(tag.getString(k))
          if (v && v.length > 0) found.push(v)
        } catch (_) {}
      }
    }
    return found
  }

  var hasMat = function(mats, name) {
    if (!mats || mats.length === 0) return false
    for (var i = 0; i < mats.length; i++) {
      if (mats[i] === name) return true
    }
    return false
  }

  // -- Tick handler: passive perks (sapphire fire-res, dimlite night-vision)
  global.tick_terramityTetraPerks = function(event) {
    event.server.players.forEach(function(player) {
      try {
        var stack = player.getMainHandItem()
        var mats = getTetraMaterials(stack)
        if (mats.length === 0) return

        if (hasMat(mats, 'sapphire')) {
          // Fire Resistance, 5s refresh, ambient=false visible=false (hidden HUD)
          try { player.potionEffects.add('minecraft:fire_resistance', 100, 0, false, false) } catch (_) {}
        }
        if (hasMat(mats, 'dimlite')) {
          // Night Vision, ~11s refresh (avoids the flashing-end-of-effect screen)
          try { player.potionEffects.add('minecraft:night_vision', 220, 0, false, false) } catch (_) {}
        }
      } catch (_) {}
    })
  }
  // Register at 2s cadence -- light enough to not affect tps
  global.registerServerTick('tick_terramityTetraPerks', 40, 30)

  // -- Hurt handler: on-hit perks (topaz, ruby, onyx, iridium)
  EntityEvents.hurt(function(event) {
    try {
      var target = event.entity
      if (!target) return

      var src = null
      try { src = event.source } catch (_) { return }
      if (!src) return

      // Determine the player attacker (direct or via projectile owner)
      var attacker = null
      try { attacker = src.actual } catch (_) {}      // KubeJS shortcut
      if (!attacker) {
        try { attacker = src.player } catch (_) {}
      }

      // 1. Owned-minion damage boost (Onyx) -- check if attacker has owner UUID
      // and that owner's mainhand has Onyx tetra
      try {
        if (attacker && attacker.getOwnerUUID && attacker.getOwnerUUID()) {
          var ownerUuid = attacker.getOwnerUUID()
          var owner = event.server.getPlayer(ownerUuid)
          if (owner) {
            var ownerMats = getTetraMaterials(owner.getMainHandItem())
            if (hasMat(ownerMats, 'onyx')) {
              event.damage = event.damage * 1.15
            }
          }
        }
      } catch (_) {}

      // For player-direct perks, we need a player attacker
      if (!attacker || !attacker.player) return
      var aMats = getTetraMaterials(attacker.getMainHandItem())
      if (aMats.length === 0) return

      // 2. Topaz -- set target on fire 2s
      if (hasMat(aMats, 'topaz')) {
        try { target.setRemainingFireTicks(40) } catch (_) {}
      }

      // 3. Ruby -- +50% damage when source is fire-typed
      if (hasMat(aMats, 'ruby')) {
        var srcId = ''
        try { srcId = String(src.type ? src.type : src.msgId || '') } catch (_) {}
        if (srcId.indexOf('fire') >= 0 || srcId.indexOf('lava') >= 0 ||
            srcId.indexOf('hot_floor') >= 0 || srcId.indexOf('on_fire') >= 0) {
          event.damage = event.damage * 1.5
        }
      }

      // 4. Iridium -- stronger knockback on melee hit (+50% impulse)
      // Skip projectile hits (those have ratios from arrow physics)
      if (hasMat(aMats, 'iridium')) {
        var isMelee = false
        try { isMelee = !src.indirect } catch (_) {}
        if (isMelee) {
          try {
            var dx = target.getX() - attacker.getX()
            var dz = target.getZ() - attacker.getZ()
            var dist = Math.sqrt(dx*dx + dz*dz)
            if (dist > 0.01) {
              // Apply additional knockback (vanilla normalizes, so unit dir).
              // Strength 1.5 = strong push but not skyward.
              target.knockback(1.5, dx/dist, dz/dist)
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  })

  console.log('[IridescentCraft] tetra_terramity_perks loaded')
  console.log('  sapphire->fire_res passive | topaz->fire on hit')
  console.log('  ruby->+50% fire damage | onyx->+15% minion damage')
  console.log('  dimlite->night vision passive | iridium->+50% melee knockback')
} catch (e) {
  console.warn('[IridescentCraft] tetra_terramity_perks bootstrap FAILED: ' + e)
}
