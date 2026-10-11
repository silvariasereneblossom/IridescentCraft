// =============================================================================
// IridescentCraft — Complex Affix Effects (Event-Driven)
// File: kubejs/server_scripts/affixes/affix_effects.js
//
// Design Doc Part V: Apotheosis Custom Affixes
//
// Simple attribute affixes (damage, HP, speed, etc.) are handled via
// Apotheosis JSON datapacks in icraft_apotheosis_affixes/.
//
// This script handles COMPLEX affixes that need event-driven behavior:
//   - Boss-themed affixes (on-kill/on-hit special effects)
//   - Dimensional affixes with unique mechanics
//   - Tier-gated affixes with conditional triggers
//   - On-hit procs (bleeding, electrified, corroding, etc.)
//
// Detection: an item "has" an affix when the affix's name (lower case, spaces
// and apostrophes as underscores: "Void Touched" -> void_touched) is a
// substring of one of the affix ids in the item's Apotheosis data
// (affix_data.affixes, e.g. apotheosis:skyshatter), or when the name appears
// verbatim in the item's lore (display.Lore) -- the lore route is what makes
// `/give ... {display:{Lore:['"Hydra"']}}` a usable test item.
//
// 2026-10-10 revival. Until now:
//   * the whole OFFENSIVE handler (every on-hit affix, Skyshatter and Igniting
//     included) returned on its first line: `event.source.entity` is not a
//     script-visible member (0_lib_core.js header);
//   * Ignis Core / the fire-vulnerability amplify / Adaptable compared
//     `String(event.source.type)` (a function object) to damage names;
//   * the defensive handler threw at Challenger's Spirit for any attacker
//     class with a public `type` field (seen in production: Creeper Overhaul),
//     which also skipped every affix listed after it;
//   * every cooldown read `level.gameTime` (undefined -> NaN -> never ready,
//     and putLong(key, undefined) throws);
//   * every AoE / chain / reflect called `entity.hurt('player', n)`: scripts
//     have attack(DamageSource, n) and no string -> DamageSource. Those hits
//     go through core.dealDamage now, which also stops them re-entering the
//     hurt handlers (no splash-of-a-splash, no proc from a proc);
//   * hasAffix() stringified the item's affix data on every call (dozens of
//     times per hit, ~270 times per player per tick pass). Each item is read
//     once per handler run now, and a player with no affixed gear costs six
//     slot reads.
// Also fixed on the way (first-run defects of the revived paths):
//   setDeltaMovement(x,y,z) -> setMotion; spawnParticles argument order;
//   getBrightness(pos) (no such overload; and `|| 7` turned light 0 into 7);
//   weapon.isDamageable() (isDamageableItem); teleports that could land the
//   player inside a block (Voidwalker, Chorus Shift) use the vanilla safe
//   teleport; Relentless wrote one persistent key per target forever; Deeproot
//   never took its max-health bonus off again; the Aether-touched speed test
//   had its && / || the wrong way round.
//
// Whole file is one IIFE (body left at column 0); nothing here is used by
// another script.
// =============================================================================

;(function () {
var core = global.icraft && global.icraft.core
if (!core) {
  console.error('[IridescentCraft] affix_effects.js: 0_lib_core.js did not load -- affix effects are OFF')
  return
}

// ─── Affix detection ───

var nameKeys = {}   // "Void Touched" -> "void_touched"
var keyOf = function (affixName) {
  var k = nameKeys[affixName]
  if (k === undefined) {
    k = String(affixName).toLowerCase().replace(/[' ]/g, '_')
    nameKeys[affixName] = k
  }
  return k
}

// Everything the handlers need from one stack, read ONCE:
//   { ids: '|apotheosis:skyshatter|...' (lower case), lore: '\n<line>...', rarity: 'apotheosis:mythic' }
// or null when the item carries neither affix data nor lore.
var readAffixes = function (item) {
  if (!item) return null
  try {
    if (item.isEmpty()) return null
    var nbt = item.nbt
    if (!nbt) return null
    var ids = ''
    var lore = ''
    var rarity = ''
    if (nbt.contains('affix_data')) {
      var data = nbt.getCompound('affix_data')
      if (data.contains('affixes')) {
        data.getCompound('affixes').getAllKeys().forEach(function (k) {
          ids += '|' + String(k).toLowerCase()
        })
      }
      if (data.contains('rarity')) rarity = String(data.getString('rarity')).toLowerCase()
    }
    if (nbt.contains('Affixes')) ids += '|' + String(nbt.get('Affixes')).toLowerCase()
    if (nbt.contains('display')) {
      var display = nbt.getCompound('display')
      if (display.contains('Lore')) {
        var lines = display.getList('Lore', 8)
        for (var i = 0; i < lines.size(); i++) lore += '\n' + String(lines.getString(i))
      }
    }
    if (ids === '' && lore === '') return null
    return { ids: ids, lore: lore, rarity: rarity }
  } catch (e) {
    core.warnOnce('affix.read', '[affix_effects] reading an item\'s affix data threw: ' + e)
    return null
  }
}

// info: readAffixes() result (or null)
var has = function (info, affixName) {
  if (!info) return false
  if (info.lore !== '' && info.lore.indexOf(affixName) >= 0) return true
  return info.ids !== '' && info.ids.indexOf(keyOf(affixName)) >= 0
}

// Helper: get item from equipment slot name (KubeJS 6 compatible)
var getEquipItem = function (player, slot) {
  try {
    switch (slot) {
      case 'mainhand': return player.mainHandItem
      case 'offhand': return player.offHandItem
      case 'head': return player.headArmorItem
      case 'chest': return player.chestArmorItem
      case 'legs': return player.legsArmorItem
      case 'feet': return player.feetArmorItem
      default: return null
    }
  } catch (e) { return null }
}

var GEAR_SLOTS = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand']
// -> { any: bool, list: [info...], offhand: info|null, items: [stack per slot] }
var gearOf = function (player) {
  var gear = { any: false, list: [], offhand: null, items: [] }
  for (var i = 0; i < GEAR_SLOTS.length; i++) {
    var item = getEquipItem(player, GEAR_SLOTS[i])
    var info = readAffixes(item)
    gear.items.push(item)
    if (!info) continue
    gear.any = true
    gear.list.push(info)
    if (GEAR_SLOTS[i] === 'offhand') gear.offhand = info
  }
  return gear
}
var anyHas = function (gear, affixName) {
  for (var i = 0; i < gear.list.length; i++) {
    if (has(gear.list[i], affixName)) return true
  }
  return false
}

// Helper: get nearby living entities within radius
var getNearbyEntities = function (entity, radius) {
  var results = []
  try {
    entity.level.getEntitiesWithin(
      AABB.of(entity.x - radius, entity.y - radius, entity.z - radius,
              entity.x + radius, entity.y + radius, entity.z + radius)
    ).forEach(function (e) {
      if (e !== entity && e.living) results.push(e)
    })
  } catch (e) {}
  return results
}

// Helper: get nearby hostile entities
var getNearbyHostiles = function (entity, radius) {
  return getNearbyEntities(entity, radius).filter(function (e) { return e.monster })
}

// persisted game-time stamp -> ticks since (a huge number when never stamped
// or when the stamp is ahead of the clock)
var NEVER = 1e15
var since = function (data, key, now) {
  if (!data.contains(key)) return NEVER
  var last = Number(data.getLong(key))
  return (now >= last) ? (now - last) : NEVER
}

var healthFraction = function (entity) {
  var max = core.finite(entity.maxHealth, 0)
  if (!(max > 0)) return 1
  return core.finite(entity.health, max) / max
}

var idHasAny = function (id, words) {
  for (var i = 0; i < words.length; i++) {
    if (id.indexOf(words[i]) >= 0) return true
  }
  return false
}

// Same 2 s life as the vanilla chorus fruit hop: finds the ground at the
// target column and refuses a spot that would put the player in a block.
var safeTeleport = function (player, x, y, z) {
  try { return player.randomTeleport(x, y, z, false) === true } catch (e) { return false }
}

// Cosmetic only; switched off for the session the first time it fails.
var particlesOk = true
var puff = function (entity, particle, dy, dx, spreadY, dz, count, speed) {
  if (!particlesOk) return
  try {
    entity.level.spawnParticles(particle, true,
      entity.x, entity.y + dy, entity.z, dx, spreadY, dz, count, speed)
  } catch (e) {
    particlesOk = false
  }
}

// Relentless: attacker uuid -> { '<target uuid>': game time of the last hit }.
// In memory (a 3 s window does not need to survive a restart); it used to be
// one persistentData key per target, never removed.
var relentlessHits = {}
PlayerEvents.loggedOut(function (event) {
  try { delete relentlessHits[String(event.player.uuid)] } catch (e) {}
})


// ==========================================================================
// ███ OFFENSIVE ON-HIT AFFIX EFFECTS (player attacks mob) ███
// ==========================================================================

// [vulnPct, durationTicks] per rarity tier for the Igniting mark. Curve mirrors
// the corpus mob_effect duration ramp (40->160t) + a modest, escalating amplify.
var IGN_VULN = {
  common:   [0.15,  60],
  uncommon: [0.20,  80],
  rare:     [0.25, 100],
  epic:     [0.30, 120],
  mythic:   [0.40, 140],
  ancient:  [0.50, 160]
}
var IGN_TIERS = ['ancient', 'mythic', 'epic', 'uncommon', 'rare', 'common']
// Game time at which the latest Igniting mark stamped since this script loaded
// runs out (-1: none live). Lets the fire-vulnerability handler leave at once
// on the ~100% of hurt events that happen while nothing is marked.
var fireVulnLatest = -1

var END_MOBS = ['enderman', 'shulker', 'ender_dragon', 'endermite']
var UNDEAD_WORDS = ['zombie', 'skeleton', 'wither', 'phantom', 'drowned', 'husk', 'stray', 'zombified']

// 2026-05-15 DamageModifierRegistry wrap (raw LivingHurtEvent).
core.onHurt('icraft.affixes.offensive', function (event, ctx) {
  var player = ctx.attacker
  var target = ctx.victim
  if (!target || !target.living) return
  var now = core.now(target)
  var tdata = target.persistentData

  // Check if target is marked (from any player's Harbinger's Mark). Applies to
  // every player hit, whatever the attacker's own weapon carries.
  if (tdata.contains('icraft_marked')) {
    if (since(tdata, 'icraft_marked', now) < 100) { // 5 seconds
      event.amount = event.amount * (1 + tdata.getInt('icraft_mark_bonus') / 100)
    }
  }

  var weapon = player.mainHandItem
  var w = readAffixes(weapon)
  if (!w) return
  var pdata = player.persistentData
  var targetType = core.entityId(target)

  // ── Skyshatter: T4 thematic affix. Vertical launch on hit. ──
  // 20% per qualifying hit, 2s cooldown per attacker, 0.65 upward
  // velocity + 12-tick Levitation amp 0 (~0.6s) + lightning visual.
  // Cooldown stops AoE/sweep edge from spamming the proc on crowds.
  if (has(w, 'Skyshatter')) {
    if (since(pdata, 'icraft_skyshatter_cd', now) >= 40 && Math.random() < 0.20) {
      target.setMotion(0.0, 0.65, 0.0)
      try { target.potionEffects.add('minecraft:levitation', 12, 0, false, false) } catch (e) {}
      // Lightning visual + thunder cue, no real lightning entity (would
      // damage + ignite). Particle column at the target's center plus a
      // subdued thunder so it reads as "shattered skyward" rather than
      // a lightning-strike kill.
      puff(target, 'minecraft:flash', 1.0, 0, 0, 0, 1, 0)
      puff(target, 'minecraft:cloud', 0.5, 0.5, 0.5, 0.5, 20, 0.05)
      try { target.playSound('minecraft:entity.lightning_bolt.thunder', 0.4, 1.5) } catch (e) {}
      pdata.putLong('icraft_skyshatter_cd', now)
    }
  }

  // ── Harbinger's Mark: target takes +25% from ALL sources for 5s ──
  if (has(w, 'Harbinger')) {
    target.potionEffects.add('minecraft:weakness', 100, 0, false, false)
    tdata.putLong('icraft_marked', now)
    tdata.putInt('icraft_mark_bonus', 25)
  }

  // ── Forgotten King's Authority: 3% instant kill below 15% HP (not bosses) ──
  if (has(w, 'Authority')) {
    if (!core.isBoss(targetType)) {
      if (healthFraction(target) < 0.15 && Math.random() < 0.03) {
        event.amount = target.health + 10 // Lethal
      }
    }
  }

  // ── Gaia's Judgment: Execute scaling with missing HP ──
  if (has(w, 'Judgment')) {
    event.amount = event.amount * (1 + (1 - healthFraction(target)) * 0.50) // Up to +50% at 0 HP
  }

  // ── Primordial Force: Ignore 30% armor ──
  if (has(w, 'Primordial')) {
    var targetArmor = core.finite(target.getArmorValue(), 0)
    if (targetArmor > 0) {
      event.amount = event.amount + targetArmor * 0.15 // Flat bonus based on armor
    }
  }

  // ── Entropic: +5% per consecutive hit on same target ──
  if (has(w, 'Entropic')) {
    var entropicTarget = String(target.uuid)
    var lastTarget = pdata.contains('icraft_entropic_target')
      ? String(pdata.getString('icraft_entropic_target')) : ''
    if (lastTarget === entropicTarget) {
      var entropicStacks = Math.min(pdata.getInt('icraft_entropic_stacks') + 1, 10)
      pdata.putInt('icraft_entropic_stacks', entropicStacks)
      event.amount = event.amount * (1 + entropicStacks * 0.05)
    } else {
      pdata.putString('icraft_entropic_target', entropicTarget)
      pdata.putInt('icraft_entropic_stacks', 0)
    }
  }

  // ── Bleeding: Stacking bleed (1 HP/s per stack, max 5) ──
  if (has(w, 'Bleeding')) {
    var bleedStacks = Math.min(tdata.getInt('icraft_bleed_stacks') + 1, 5)
    tdata.putInt('icraft_bleed_stacks', bleedStacks)
    tdata.putLong('icraft_bleed_time', now)
    // Apply poison as bleed proxy — amplifier = stacks - 1
    target.potionEffects.add('minecraft:poison', 60, Math.min(bleedStacks - 1, 4), false, false)
  }

  // ── Electrified: 12% chance to chain lightning to 1-3 nearby mobs ──
  if (has(w, 'Electrified') && Math.random() < 0.12) {
    var chainTargets = getNearbyHostiles(target, 4)
    var chains = Math.min(chainTargets.length, Math.floor(Math.random() * 3) + 1)
    for (var c = 0; c < chains; c++) {
      core.dealDamage(chainTargets[c], 'lightning', 2, player)
    }
  }

  // ── Corroding: Reduce target armor by applying Weakness ──
  if (has(w, 'Corroding')) {
    var corrosion = Math.min(tdata.getInt('icraft_corrode_stacks') + 1, 5)
    tdata.putInt('icraft_corrode_stacks', corrosion)
    // Weakness stacks approximate armor reduction
    target.potionEffects.add('minecraft:weakness', 100, Math.min(corrosion - 1, 2), false, false)
  }

  // ── Silencing: 8% chance to prevent mob abilities for 3s ──
  if (has(w, 'Silencing') && Math.random() < 0.08) {
    // Apply slowness + weakness to simulate "silencing"
    target.potionEffects.add('minecraft:slowness', 60, 3, false, false)
    target.potionEffects.add('minecraft:weakness', 60, 2, false, false)
  }

  // ── Serpent's Coil: Stacking poison, 3rd stack = Poison II ──
  if (has(w, 'Serpent')) {
    var pStacks = tdata.getInt('icraft_serpent_stacks') + 1
    if (pStacks >= 3) {
      target.potionEffects.add('minecraft:poison', 80, 1, false, false) // Poison II
      tdata.putInt('icraft_serpent_stacks', 0)
    } else {
      target.potionEffects.add('minecraft:poison', 60, 0, false, false) // Poison I
      tdata.putInt('icraft_serpent_stacks', pStacks)
    }
  }

  // ── Necrotic Supremacy: Wither damage also heals player ──
  if (has(w, 'Necrotic')) {
    target.potionEffects.add('minecraft:wither', 80, 1, false, false)
    var necroticHeal = core.finite(event.amount * 0.1, 0) // 10% of damage dealt as healing
    if (necroticHeal > 0) player.heal(necroticHeal)
  }

  // ── Reality Fracture: 5% chance to freeze target in time (stun) ──
  if (has(w, 'Fracture') && Math.random() < 0.05) {
    if (since(pdata, 'icraft_fracture_cd', now) > 300) { // 15s cooldown
      target.potionEffects.add('minecraft:slowness', 30, 127, false, false)
      target.potionEffects.add('minecraft:weakness', 30, 127, false, false)
      target.potionEffects.add('minecraft:mining_fatigue', 30, 127, false, false)
      pdata.putLong('icraft_fracture_cd', now)
    }
  }

  // ── Worldbreaker: +15% damage to ALL mob types ──
  if (has(w, 'Worldbreaker')) {
    event.amount = event.amount * 1.15
  }

  // ── Relentless: +10% damage to targets hit in last 3s ──
  if (has(w, 'Relentless')) {
    var attackerKey = String(player.uuid)
    var hits = relentlessHits[attackerKey]
    if (!hits) { hits = {}; relentlessHits[attackerKey] = hits }
    var relentlessTarget = String(target.uuid)
    var lastHit = hits[relentlessTarget]
    if (lastHit !== undefined && now >= lastHit && (now - lastHit) < 60) { // 3 seconds
      event.amount = event.amount * 1.10
    }
    // forget targets not hit for 3 s, then stamp this one
    for (var hitKey in hits) {
      if (hits.hasOwnProperty(hitKey) && !(now >= hits[hitKey] && (now - hits[hitKey]) < 60)) delete hits[hitKey]
    }
    hits[relentlessTarget] = now
  }

  // ── Executioner's: +20% damage to targets below 30% HP ──
  if (has(w, 'Executioner')) {
    if (healthFraction(target) < 0.30) {
      event.amount = event.amount * 1.20
    }
  }

  // ── Hydra's Fury: Small AoE splash on attacks ──
  if (has(w, 'Hydra')) {
    var hydraSplash = core.finite(event.amount * 0.3, 0)
    getNearbyHostiles(target, 1.5).forEach(function (e) {
      core.dealDamage(e, 'player', hydraSplash, player)
    })
  }

  // ── Twilit: +15% damage in dim light ──
  if (has(w, 'Twilit')) {
    var twilitLight = core.light(target)
    if (twilitLight >= 4 && twilitLight <= 10) {
      event.amount = event.amount * 1.15
    }
  }

  // ── Abyssal Edge: +20% damage in darkness + apply Darkness ──
  if (has(w, 'Abyssal')) {
    if (core.light(target) <= 4) {
      event.amount = event.amount * 1.20
    }
    target.potionEffects.add('minecraft:darkness', 60, 0, false, false)
  }

  // ── Soulfire: Attacks apply soul fire (bypasses fire resistance) ──
  if (has(w, 'Soulfire')) {
    // Remove fire resistance then apply fire
    target.removeEffect('minecraft:fire_resistance')
    target.setSecondsOnFire(3)
  }

  // ── Igniting: mark target with timed FIRE VULNERABILITY (IGN- rework) ──
  // Reworked 2026-06-06 from the old buggy carrier that GRANTED the target
  // minecraft:fire_resistance (helped the enemy). The carrier is now a thin
  // attack_damage attribute (igniting.json, Skyshatter precedent); the real
  // payoff is this proc: on hit, stamp the target with an expiry tick +
  // a vuln pct, and while the stamp is live the target takes +pct% from any
  // fire-type damage source (amplified in the icraft.affixes.fire_vuln
  // handler below). Per-rarity values come from the item's rolled rarity
  // (affix_data.rarity), else a safe mid-tier default. PROVISIONAL --
  // tune after operator fire-damage delta test.
  // Match on the affix ID "igniting" (the affix_data NBT stores the id
  // apotheosis:igniting) -- robust to the lang rename from "Ignition" to
  // "Scorching" since the display name is no longer the match key.
  if (has(w, 'igniting')) {
    var ignTier = 'rare' // safe mid-tier fallback
    for (var ti = 0; ti < IGN_TIERS.length; ti++) {
      if (w.rarity.indexOf(IGN_TIERS[ti]) >= 0) { ignTier = IGN_TIERS[ti]; break }
    }
    var ignVals = IGN_VULN[ignTier] || IGN_VULN.rare
    tdata.putLong('icraft_fire_vuln_until', now + ignVals[1])
    if (now + ignVals[1] > fireVulnLatest) fireVulnLatest = now + ignVals[1]
    tdata.putFloat('icraft_fire_vuln_pct', ignVals[0])
    // Visual feedback: small server-side flame burst.
    puff(target, 'minecraft:flame', 0.8, 0.25, 0.4, 0.25, 8, 0.02)
  }

  // ── Permafrost: Attacks build up freeze (5 hits = 2s freeze) ──
  if (has(w, 'Permafrost')) {
    var freezeStacks = tdata.getInt('icraft_permafrost') + 1
    if (freezeStacks >= 5) {
      target.potionEffects.add('minecraft:slowness', 40, 127, false, false)
      target.potionEffects.add('minecraft:mining_fatigue', 40, 3, false, false)
      tdata.putInt('icraft_permafrost', 0)
    } else {
      tdata.putInt('icraft_permafrost', freezeStacks)
      target.potionEffects.add('minecraft:slowness', 20, 0, false, false)
    }
  }

  // ── Valkyrie's Strike: +25% damage while airborne/falling ──
  if (has(w, 'Valkyrie') && !player.onGround()) {
    event.amount = event.amount * 1.25
  }

  // ── Void-Touched: Attacks briefly levitate target (anti-melee, End-themed) ──
  if (has(w, 'Void-Touched') || has(w, 'Void Touched')) {
    if (Math.random() < 0.15) { // 15% chance per hit
      target.potionEffects.add('minecraft:levitation', 20, 0, false, false) // 1s levitate
    }
  }

  // ── Ender Resonance: +15% damage to End mobs (Endermen, Shulkers, etc.) ──
  if (has(w, 'Ender Resonance') || has(w, 'Resonance')) {
    if (idHasAny(targetType, END_MOBS) || targetType.indexOf('ender_guardian') >= 0 ||
        targetType.indexOf('ender_golem') >= 0) {
      event.amount = event.amount * 1.15
    }
  }

  // ── Deepwound: Reduce target healing by applying Instant Damage trace ──
  if (has(w, 'Deepwound')) {
    tdata.putLong('icraft_deepwound', now)
    target.potionEffects.add('minecraft:wither', 100, 0, false, false) // Proxy for healing reduction
  }

  // ── End's Dominion: +25% damage to End mobs ──
  if (has(w, "End's Dominion") || has(w, 'Dominion')) {
    if (idHasAny(targetType, END_MOBS) || targetType.indexOf('phantom') >= 0) {
      event.amount = event.amount * 1.25
    }
  }

  // ── Rotbane: Bonus damage to Undergarden mobs ──
  if (has(w, 'Rotbane')) {
    if (targetType.indexOf('undergarden') >= 0) {
      event.amount = event.amount * 1.25
    }
    // Also grant poison immunity proxy — clear poison from player
    player.removeEffect('minecraft:poison')
  }

  // ── Voidwalker: Short teleport toward target on hit (5s cooldown) ──
  if (has(w, 'Voidwalker')) {
    if (since(pdata, 'icraft_voidwalk_cd', now) > 100) { // 5s cooldown
      // Teleport 3 blocks toward target
      var vdx = target.x - player.x
      var vdz = target.z - player.z
      var vdist = Math.sqrt(vdx * vdx + vdz * vdz)
      if (vdist > 3) {
        var ratio = 3 / vdist
        safeTeleport(player, player.x + vdx * ratio, player.y, player.z + vdz * ratio)
      }
      pdata.putLong('icraft_voidwalk_cd', now)
    }
  }

  // ── Nature's Wrath: Every 5th hit triggers AoE (Poison II + knockback) ──
  if (has(w, "Nature's Wrath") || has(w, 'Nature')) {
    var nHits = pdata.getInt('icraft_nature_hits') + 1
    if (nHits >= 5) {
      getNearbyHostiles(target, 3).forEach(function (e) {
        try { e.potionEffects.add('minecraft:poison', 60, 1, false, false) } catch (ex) {}
        core.dealDamage(e, 'player', 4, player)
      })
      // Also hit the target
      target.potionEffects.add('minecraft:poison', 60, 1, false, false)
      pdata.putInt('icraft_nature_hits', 0)
    } else {
      pdata.putInt('icraft_nature_hits', nHits)
    }
  }

  // ── Apex Predator: +5% per Champion/Boss killed in last 10 min (max +25%) ──
  if (has(w, 'Apex')) {
    var apexStacks = pdata.getInt('icraft_apex_stacks')
    if (since(pdata, 'icraft_apex_time', now) > 12000) { // Reset after 10 min
      apexStacks = 0
    }
    if (apexStacks > 0) {
      event.amount = event.amount * (1 + Math.min(apexStacks, 5) * 0.05)
    }
  }

  // ── Celestial Radiance: 2x damage to undead + healing light ──
  if (has(w, 'Celestial')) {
    if (idHasAny(targetType, UNDEAD_WORDS)) {
      event.amount = event.amount * 2.0
    }
    // Heal nearby allies
    getNearbyEntities(player, 5).forEach(function (e) {
      if (e.player && e !== player) {
        try { e.heal(0.5) } catch (ex) {}
      }
    })
  }

  // ── Shockwave: Charged attacks release ground shockwave ──
  // Approximation: full-charge hits (cooldown-based detection)
  if (has(w, 'Shockwave')) {
    if (since(pdata, 'icraft_shockwave_cd', now) > 40) { // ~2s minimum between shockwaves
      var shockDamage = core.finite(event.amount * 0.4, 0)
      getNearbyHostiles(target, 3).forEach(function (e) {
        core.dealDamage(e, 'player', shockDamage, player)
      })
      pdata.putLong('icraft_shockwave_cd', now)
    }
  }

  // ── Netherquake: Sprint-attack ground slam AoE (8s cooldown) ──
  if (has(w, 'Netherquake') && player.isSprinting()) {
    if (since(pdata, 'icraft_quake_cd', now) > 160) { // 8s cooldown
      var quakeDamage = core.finite(event.amount * 0.5, 0)
      getNearbyHostiles(target, 4).forEach(function (e) {
        core.dealDamage(e, 'player', quakeDamage, player)
        // Knockback approximation via potion
        try { e.potionEffects.add('minecraft:slowness', 20, 2, false, false) } catch (ex) {}
      })
      pdata.putLong('icraft_quake_cd', now)
    }
  }

  // ── Stormforged: 8% chance to call lightning on crits ──
  if (has(w, 'Stormforged') && Math.random() < 0.08) {
    try {
      target.level.spawnLightning(target.x, target.y, target.z, false, player)
    } catch (e) {
      core.warnOnce('affix.stormforged', '[affix_effects] Stormforged lightning threw: ' + e)
    }
  }

  // ── Warden's Echo: Charged sonic boom (15s cooldown) ──
  // Triggers on sprint-attacks as "charged" proxy
  if (has(w, 'Warden') && player.isSprinting()) {
    if (since(pdata, 'icraft_warden_cd', now) > 300) { // 15s cooldown
      getNearbyHostiles(target, 5).forEach(function (e) {
        core.dealDamage(e, 'sonic_boom', 8, player)
      })
      // The struck target takes its 8 as part of this hit: a second hurt()
      // on an entity that is mid-hurt is swallowed by its own damage immunity.
      event.amount = event.amount + 8
      pdata.putLong('icraft_warden_cd', now)
    }
  }

  // ── Starfall: Charged attacks call delayed AoE from above ──
  if (has(w, 'Starfall') && player.isSprinting()) {
    if (since(pdata, 'icraft_starfall_cd', now) > 200) { // 10s cooldown
      // Delayed damage to area (immediate for now, marked as "delayed")
      getNearbyHostiles(target, 3).forEach(function (e) {
        core.dealDamage(e, 'magic', 6, player)
        try { e.setSecondsOnFire(2) } catch (ex) {}
      })
      event.amount = event.amount + 6 // the struck target (see Warden's Echo)
      pdata.putLong('icraft_starfall_cd', now)
    }
  }
}, 'attackerPlayer')


// ==========================================================================
// ███ FIRE-VULNERABILITY DAMAGE AMPLIFY (Igniting mark) ███
// ==========================================================================
// Companion to the Igniting on-hit proc above. Runs for EVERY LivingHurtEvent
// (no player filter on attacker OR victim) because fire damage on a marked
// target most often comes from fire/lava/on-fire ticks and fire-tagged spells,
// NOT directly from the wielder's swing. When a marked target takes fire-type
// damage and the mark is still live, amplify event.amount by the stored pct.
// Fire-type = the minecraft:is_fire damage-type tag or a fire/lava/hot_floor
// damage id (core.isFire), plus the victim's own on-fire flag so that any hit
// landing on a burning, marked target counts.
core.onHurt('icraft.affixes.fire_vuln', function (event, ctx) {
  // (The gate at the bottom keeps this handler from being called at all while
  // no Igniting mark is live anywhere.) The 10 s of grace after the last
  // expiry is what lets the clean-up below still reach a marked entity that
  // keeps taking damage.
  var victim = ctx.victim
  if (!victim || !victim.living) return
  var vulnNow = core.now(victim)
  if (vulnNow > fireVulnLatest + 200) { fireVulnLatest = -1; return }
  var pdata = victim.persistentData
  if (!pdata.contains('icraft_fire_vuln_until')) return
  var until = Number(pdata.getLong('icraft_fire_vuln_until'))
  if (vulnNow > until) {
    // Mark expired -- clean up the stamps so we stop checking.
    pdata.remove('icraft_fire_vuln_until')
    pdata.remove('icraft_fire_vuln_pct')
    return
  }
  var isFire = core.isFire(ctx.source)
  if (!isFire) {
    try { if (victim.remainingFireTicks > 0) isFire = true } catch (e) {}
  }
  if (!isFire) return
  var pct = core.finite(pdata.getFloat('icraft_fire_vuln_pct'), 0)
  if (pct > 0) event.amount = event.amount * (1 + pct)
}, 'any', function () { return fireVulnLatest >= 0 })


// ==========================================================================
// ███ ON-KILL AFFIX EFFECTS ███
// ==========================================================================

EntityEvents.death(function (event) {
  var entity = event.entity
  if (!entity || !entity.living) return
  var source = event.source
  if (!source || !source.player) return
  var player = source.player
  var weapon = player.mainHandItem
  var w = readAffixes(weapon)
  if (!w) return

  // ── Soulstealer: Kills grant absorption hearts ──
  if (has(w, 'Soulstealer')) {
    player.potionEffects.add('minecraft:absorption', 200, 1, false, true)
  }

  // ── Spectral Wail: Kills terrify nearby mobs ──
  if (has(w, 'Spectral Wail') || has(w, 'Spectral')) {
    getNearbyHostiles(entity, 8).forEach(function (e) {
      try {
        e.potionEffects.add('minecraft:slowness', 100, 2, false, false)
        e.potionEffects.add('minecraft:weakness', 100, 1, false, false)
      } catch (ex) {}
    })
  }

  // ── Invigorating: Kills grant Speed I ──
  if (has(w, 'Invigorating')) {
    player.potionEffects.add('minecraft:speed', 100, 0, false, true)
  }

  // ── Harvesting: Kills grant bonus XP ──
  if (has(w, 'Harvesting')) {
    player.giveExperiencePoints(Math.floor(Math.random() * 10) + 5)
  }

  // ── Ender Siphon: Kills restore durability ──
  if (has(w, 'Siphon')) {
    if (weapon.isDamageableItem()) {
      var restore = Math.floor(weapon.maxDamage * 0.05)
      weapon.damageValue = Math.max(0, weapon.damageValue - restore)
    }
  }

  // ── Siphoning: Kills restore 1-3 hunger points ──
  if (has(w, 'Siphoning')) {
    try {
      player.foodLevel = Math.min(20, player.foodLevel + Math.floor(Math.random() * 3) + 1)
    } catch (e) {}
  }

  // ── Magnetic: Items attracted to player after kill ──
  if (has(w, 'Magnetic')) {
    // Give player a brief speed boost so items gravitate (proxy)
    player.potionEffects.add('minecraft:speed', 40, 0, false, false)
  }

  // ── Summoner's Accord: 5% chance to spawn friendly phantom ally ──
  if (has(w, 'Summoner') && Math.random() < 0.05) {
    try {
      player.level.server.runCommandSilent(
        'summon minecraft:vex ' + entity.x + ' ' + (entity.y + 1) + ' ' + entity.z +
        ' {Life:600,Tags:["icraft_summoned_ally"],ActiveEffects:[{Id:11,Amplifier:0,Duration:600}]}'
      )
    } catch (e) {}
  }

  // ── Apex Predator: Track Champion/Boss kills ──
  if (has(w, 'Apex')) {
    // Champions have champion tags or are bosses
    if (core.isBoss(entity) || entity.persistentData.contains('champion')) {
      var pdata = player.persistentData
      pdata.putInt('icraft_apex_stacks', Math.min(pdata.getInt('icraft_apex_stacks') + 1, 5))
      pdata.putLong('icraft_apex_time', core.now(player))
    }
  }
})


// ==========================================================================
// ███ DEFENSIVE AFFIX EFFECTS (player gets hit) ███
// ==========================================================================

// 2026-05-15 DamageModifierRegistry wrap (raw LivingHurtEvent).
core.onHurt('icraft.affixes.defensive', function (event, ctx) {
  var player = ctx.victim
  var gear = gearOf(player)
  if (!gear.any) return
  var source = ctx.source
  var now = core.now(player)
  var pdata = player.persistentData
  var hpFraction = healthFraction(player)
  // The living thing that dealt the hit (never the player themself).
  var attacker = ctx.attacker
  if (attacker && (attacker === player || !attacker.living)) attacker = null

  // ── Second Wind: Regen II at low HP ──
  if (hpFraction < 0.30 && anyHas(gear, 'Second Wind')) {
    if (since(pdata, 'icraft_second_wind', now) > 1200) { // 60s cooldown
      player.potionEffects.add('minecraft:regeneration', 100, 1, false, true)
      pdata.putLong('icraft_second_wind', now)
    }
  }

  // ── Ignis Core: Fire damage heals instead ──
  if (core.isFire(source)) {
    if (anyHas(gear, 'Ignis Core') || anyHas(gear, 'Ignis')) {
      var ignisHeal = core.finite(event.amount * 0.5, 0)
      event.amount = 0
      if (ignisHeal > 0) player.heal(ignisHeal)
    }
  }

  // ── Sculkheart: On hit, sonic pulse damages nearby mobs ──
  if (anyHas(gear, 'Sculkheart')) {
    if (since(pdata, 'icraft_sculk_pulse', now) > 200) { // 10s cooldown
      getNearbyHostiles(player, 4).forEach(function (e) {
        core.dealDamage(e, 'sonic_boom', 6, player)
      })
      pdata.putLong('icraft_sculk_pulse', now)
    }
  }

  // ── Challenger's Spirit: -10% dmg taken from bosses ──
  if (attacker && core.isBoss(attacker)) {
    if (anyHas(gear, 'Challenger')) {
      event.amount = event.amount * 0.90
    }
  }

  // ── Dragon's Dominion: -15% damage from all mobs ──
  if (anyHas(gear, 'Dominion')) {
    event.amount = event.amount * 0.85
  }

  // ── Chorus Shift: Random teleport when hit below 20% HP ──
  if (hpFraction < 0.20 && anyHas(gear, 'Chorus')) {
    if (since(pdata, 'icraft_chorus', now) > 600) { // 30s cooldown
      var cdx = (Math.random() - 0.5) * 16
      var cdz = (Math.random() - 0.5) * 16
      safeTeleport(player, player.x + cdx, player.y, player.z + cdz)
      pdata.putLong('icraft_chorus', now)
    }
  }

  // ── Undying Flame: Survive lethal hit at 1 HP + fire nova (5 min cooldown) ──
  if (anyHas(gear, 'Undying') || anyHas(gear, 'Undying Flame')) {
    if (event.amount >= player.health) {
      if (since(pdata, 'icraft_undying_cd', now) > 6000) { // 5 min cooldown
        event.amount = 0
        player.health = 1
        // Fire nova
        getNearbyHostiles(player, 5).forEach(function (e) {
          try { e.setSecondsOnFire(5) } catch (ex) {}
          core.dealDamage(e, 'player', 8, player)
        })
        pdata.putLong('icraft_undying_cd', now)
      }
    }
  }

  // ── Immortal: Negate killing blow (10 min cooldown) ──
  if (anyHas(gear, 'Immortal')) {
    if (event.amount >= player.health) {
      if (since(pdata, 'icraft_immortal_cd', now) > 12000) { // 10 min cooldown
        event.amount = 0
        player.health = 1
        player.potionEffects.add('minecraft:resistance', 40, 3, false, true)
        pdata.putLong('icraft_immortal_cd', now)
      }
    }
  }

  // ── Phantom Dash: Double-tap sprint for invulnerable dash (8s cooldown) ──
  // Approximation: when hit while sprinting, negate damage
  if (anyHas(gear, 'Phantom Dash') || anyHas(gear, 'Phantom')) {
    if (player.isSprinting()) {
      if (since(pdata, 'icraft_dash_cd', now) > 160) { // 8s cooldown
        event.amount = 0
        player.potionEffects.add('minecraft:speed', 20, 2, false, true)
        pdata.putLong('icraft_dash_cd', now)
      }
    }
  }

  // ── Valkyrie Ascension: While airborne -15% damage taken, +15% dealt ──
  if (anyHas(gear, 'Valkyrie Ascension') || anyHas(gear, 'Ascension')) {
    if (!player.onGround()) {
      event.amount = event.amount * 0.85
    }
  }

  // ── Adaptable: +10% resistance to a repeat of the last damage type ──
  if (anyHas(gear, 'Adaptable')) {
    var currentType = core.dmgId(source) || core.dmgMsg(source)
    if (currentType !== '') {
      var lastDmgType = pdata.contains('icraft_adapt_type')
        ? String(pdata.getString('icraft_adapt_type')) : ''
      if (lastDmgType === currentType) {
        event.amount = event.amount * 0.90 // 10% reduction for repeated damage type
      }
      pdata.putString('icraft_adapt_type', currentType)
    }
  }

  // ── Battle Hardened: +3% damage reduction per nearby hostile (max 5) ──
  if (anyHas(gear, 'Battle Hardened') || anyHas(gear, 'Hardened')) {
    var hardenedStacks = Math.min(getNearbyHostiles(player, 8).length, 5)
    if (hardenedStacks > 0) {
      event.amount = event.amount * (1 - hardenedStacks * 0.03)
    }
  }

  // ── Berserker's: +1% damage dealt per 5% missing HP ──
  // Defensive component: no reduction, but track for offensive use
  // (offensive part is in tick section)

  // ── Reflective (armor): 10% chance to reflect 35% of the damage ──
  if (attacker && anyHas(gear, 'Reflective')) {
    if (Math.random() < 0.10) {
      core.dealDamage(attacker, 'thorns', core.finite(event.amount * 0.35, 0), player)
    }
  }

  // ── Thorned: Attackers take flat damage ──
  // JSON handles the armor bonus; this adds the retaliatory damage
  if (attacker && anyHas(gear, 'Thorned')) {
    core.dealDamage(attacker, 'thorns', 2, player)
  }

  // ── Frostward: Slows melee attackers ──
  if (attacker && anyHas(gear, 'Frostward')) {
    try { attacker.potionEffects.add('minecraft:slowness', 60, 1, false, false) } catch (e) {}
  }

  // ── Blazeforged: Fire aura when below 30% HP ──
  if (hpFraction < 0.30 && anyHas(gear, 'Blazeforged')) {
    getNearbyHostiles(player, 3).forEach(function (e) {
      try { e.setSecondsOnFire(3) } catch (ex) {}
      core.dealDamage(e, 'on_fire', 3, player)
    })
  }

  // ── Shulker's Guard: 10% chance for Resistance I for 3s ──
  if (anyHas(gear, 'Shulker')) {
    if (Math.random() < 0.10) {
      player.potionEffects.add('minecraft:resistance', 60, 0, false, true)
      player.removeEffect('minecraft:levitation')
    }
  }

  // ── Gloomward: Chance to blind attackers on block (shield affix) ──
  if (attacker && has(gear.offhand, 'Gloomward')) {
    if (Math.random() < 0.15) {
      try { attacker.potionEffects.add('minecraft:blindness', 40, 0, false, false) } catch (e) {}
    }
  }

  // ── Repulsing: Blocking creates knockback wave ──
  if (has(gear.offhand, 'Repulsing')) {
    getNearbyHostiles(player, 2).forEach(function (e) {
      try { e.potionEffects.add('minecraft:slowness', 20, 3, false, false) } catch (ex) {}
    })
  }

  // ── Absorbing: Blocking restores HP ──
  if (has(gear.offhand, 'Absorbing')) {
    player.heal(0.5)
  }

  // ── Fortifying: Blocking grants Resistance I ──
  if (has(gear.offhand, 'Fortifying')) {
    player.potionEffects.add('minecraft:resistance', 60, 0, false, true)
  }

  // ── Mending Touch: +10-25% healing received ──
  // Note: Can't directly intercept healing events in KubeJS 1.20.1
  // Proxy: give small regen when damaged
  if (anyHas(gear, 'Mending')) {
    player.potionEffects.add('minecraft:regeneration', 40, 0, false, false)
  }

  // ── Empyrean: Additional flat armor bonus on hit ──
  if (anyHas(gear, 'Empyrean')) {
    player.potionEffects.add('minecraft:resistance', 40, 0, false, false)
  }
}, 'victimPlayer')


// ==========================================================================
// ███ DIMENSIONAL & PASSIVE AFFIX EFFECTS (tick-based) ███
// ==========================================================================
var tickPlayer = function (player) {
  var pdata = player.persistentData
  var gear = gearOf(player)

  // ── Deeproot: +15% max HP underground ──
  // (the bonus comes off again above Y=0 / without the item; it used to stay)
  var deeproot = gear.any && player.y < 0 && anyHas(gear, 'Deeproot')
  if (deeproot) {
    player.modifyAttribute('minecraft:generic.max_health', 'icraft_deeproot', 0.15, 'multiply_base')
    if (!pdata.getBoolean('icraft_deeproot_on')) pdata.putBoolean('icraft_deeproot_on', true)
  } else if (pdata.getBoolean('icraft_deeproot_on')) {
    player.removeAttribute('minecraft:generic.max_health', 'icraft_deeproot')
    pdata.remove('icraft_deeproot_on')
  }

  if (!gear.any) return
  var dim = String(player.level.dimension)
  var inAether = (dim === 'aether:the_aether' || dim === 'deep_aether:the_aether')
  var hurt = player.health < player.maxHealth

  // ── Twilight's Embrace: Regen I in forest + speed at night ──
  if (dim === 'twilightforest:twilight_forest' && anyHas(gear, 'Embrace')) {
    player.potionEffects.add('minecraft:regeneration', 120, 0, false, false)
    player.potionEffects.add('minecraft:speed', 120, 0, false, false)
  }

  // ── Everdawn: Slow HP regen above Y=128 ──
  if ((dim === 'blue_skies:everbright' || dim === 'blue_skies:everdawn') &&
      player.y > 128 && anyHas(gear, 'Everdawn')) {
    if (hurt) player.heal(0.5)
  }

  // ── Stratospheric: Speed + Levitation immunity ──
  if (inAether && anyHas(gear, 'Stratospheric')) {
    player.removeEffect('minecraft:levitation')
    player.potionEffects.add('minecraft:speed', 120, 0, false, false)
  }

  // ── Ascendant: Positive potions last 20% longer ──
  // Handled by buff_duration in skill_effects.js — stacks with that system

  // ── Null Gravity: Permanent Slow Falling ──
  if (anyHas(gear, 'Null Gravity') || anyHas(gear, 'Null')) {
    player.potionEffects.add('minecraft:slow_falling', 120, 0, false, false)
  }

  // ── Ironwood's Resilience: Slow durability regen in forests ──
  // Proxy: minor regen in Twilight Forest
  if (dim === 'twilightforest:twilight_forest' && anyHas(gear, 'Ironwood')) {
    player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
  }

  // ── Sporeguard: Immunity to Undergarden negative effects ──
  if (dim === 'undergarden:undergarden' && anyHas(gear, 'Sporeguard')) {
    player.removeEffect('minecraft:poison')
    player.removeEffect('minecraft:nausea')
    player.removeEffect('minecraft:weakness')
  }

  // ── Sculk Resonance: Nearby hostile mobs glow (8-block detection) ──
  if (anyHas(gear, 'Sculk Resonance') || anyHas(gear, 'Resonance')) {
    getNearbyHostiles(player, 8).forEach(function (e) {
      try { e.potionEffects.add('minecraft:glowing', 120, 0, false, false) } catch (ex) {}
    })
  }

  // ── Echolocating: Hostile mobs within 16 blocks glow through walls ──
  if (anyHas(gear, 'Echolocating')) {
    getNearbyHostiles(player, 16).forEach(function (e) {
      try { e.potionEffects.add('minecraft:glowing', 120, 0, false, false) } catch (ex) {}
    })
  }

  // ── Void Gaze: See all entities within 32 blocks ──
  if (anyHas(gear, 'Void Gaze')) {
    getNearbyEntities(player, 32).forEach(function (e) {
      try { e.potionEffects.add('minecraft:glowing', 120, 0, false, false) } catch (ex) {}
    })
  }

  // ── Aether-touched: +10% damage to non-Aether mobs in Aether ──
  // Passive part: minor speed in the Aether
  if (inAether && (anyHas(gear, 'Aether-touched') || anyHas(gear, 'Aether'))) {
    player.potionEffects.add('minecraft:speed', 120, 0, false, false)
  }

  // ── End Walker: Speed boost in The End ──
  if (dim === 'minecraft:the_end' && anyHas(gear, 'End Walker')) {
    player.potionEffects.add('minecraft:speed', 120, 1, false, false)
  }

  // ── Chorus Mending: Passive regen in The End ──
  if (dim === 'minecraft:the_end' && anyHas(gear, 'Chorus')) {
    if (hurt) player.heal(0.5)
  }

  // ── Shulker's Guard: Projectile resistance proxy in The End ──
  if (dim === 'minecraft:the_end' && anyHas(gear, 'Shulker Guard')) {
    player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
  }

  // ── Magma Walker: Fire immunity tick on magma/lava ──
  if (dim === 'minecraft:the_nether' && (anyHas(gear, 'Magma Walker') || anyHas(gear, 'Magma'))) {
    player.potionEffects.add('minecraft:fire_resistance', 120, 0, false, false)
  }

  // ── Surefooted: Immunity to Slowness ──
  if (anyHas(gear, 'Surefooted')) {
    player.removeEffect('minecraft:slowness')
  }

  // ── Unbreakable: Immune to Levitation + Slowness ──
  if (anyHas(gear, 'Unbreakable')) {
    player.removeEffect('minecraft:levitation')
    player.removeEffect('minecraft:slowness')
  }

  // ── Nightvision: Slight brightness boost ──
  if (anyHas(gear, 'Nightvision')) {
    player.potionEffects.add('minecraft:night_vision', 320, 0, false, false)
  }

  // ── Warm: Reduced Freezing ──
  if (anyHas(gear, 'Warm')) {
    // Remove freezing ticks
    try { player.setTicksFrozen(0) } catch (e) {}
  }

  // ── Repairing: Very slow passive durability regen ──
  if (anyHas(gear, 'Repairing')) {
    for (var r = 0; r < gear.items.length; r++) {
      try {
        var item = gear.items[r]
        if (item && !item.isEmpty() && item.isDamageableItem() && item.damageValue > 0) {
          if (has(readAffixes(item), 'Repairing')) {
            item.damageValue = Math.max(0, item.damageValue - 1)
          }
        }
      } catch (e) {}
    }
  }

  // ── Convergence: Bonus when wearing mixed tech + magic gear ──
  if (anyHas(gear, 'Convergence')) {
    // Check for tech/magic gear mix — proxy: just give a small boost
    player.potionEffects.add('minecraft:strength', 120, 0, false, false)
    player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
  }

  // ── Perfected Form: +2% per Mythic equipped ──
  // Count mythic items (rolled rarity, or "mythic" in the lore)
  if (anyHas(gear, 'Perfected')) {
    var mythicCount = 0
    for (var m = 0; m < gear.list.length; m++) {
      if (gear.list[m].rarity.indexOf('mythic') >= 0 ||
          gear.list[m].lore.toLowerCase().indexOf('mythic') >= 0) mythicCount++
    }
    if (mythicCount > 0) {
      player.potionEffects.add('minecraft:strength', 120, Math.min(mythicCount - 1, 2), false, false)
    }
  }

  // ── Dimensional Attunement: Passive stat boost ──
  if (anyHas(gear, 'Dimensional Attunement') || anyHas(gear, 'Attunement')) {
    player.potionEffects.add('minecraft:strength', 120, 0, false, false)
  }

  // ── Berserker's: +1% damage per 5% missing HP ──
  if (anyHas(gear, 'Berserker')) {
    var missingPct = 1 - healthFraction(player)
    if (missingPct > 0.2) {
      // Strength amplifier scales with missing HP
      var amp = Math.min(Math.floor(missingPct * 4), 3) // 0-3 amplifier
      player.potionEffects.add('minecraft:strength', 120, amp, false, false)
    }
  }

  // ── Hellforged: Melee attackers take fire damage (passive aura) ──
  // Passive component: fire res
  if (anyHas(gear, 'Hellforged')) {
    player.potionEffects.add('minecraft:fire_resistance', 120, 0, false, false)
  }

  // ── Updraft: Taking fall damage creates updraft ──
  // Proxy: slow falling after being above certain height
  var airborne = !player.onGround()
  if (airborne && anyHas(gear, 'Updraft')) {
    player.potionEffects.add('minecraft:slow_falling', 40, 0, false, false)
  }

  // ── Featherweight + Acrobatic: Fall damage reduction ──
  if (airborne && (anyHas(gear, 'Featherweight') || anyHas(gear, 'Acrobatic'))) {
    // `motionY` (KubeJS kjs$getMotionY), not `deltaMovement.y`: a Vec3 `.y` read
    // throws an uncatchable NullPointerException (failure-modes, 2026-10-11).
    if (player.motionY < -0.5) {
      player.potionEffects.add('minecraft:slow_falling', 20, 0, false, false)
    }
  }
}

global.tick_affixEffects = function (event) {
  event.server.players.forEach(function (player) {
    // One player's failure (seen in production: a NullPointerException from
    // one player's pass, 93 times in a day) must not skip everyone after them.
    try { tickPlayer(player) } catch (e) {
      core.warnOnce('affix.tick', '[affix_effects] tick threw: ' + e)
    }
  })
}
global.registerServerTick('tick_affixEffects', 100, 80)


console.log('[IridescentCraft] affix_effects.js loaded — 65+ boss/dimensional/complex affix effects')
})()
