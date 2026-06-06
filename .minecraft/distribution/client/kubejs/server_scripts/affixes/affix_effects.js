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
// Detection: These affixes are identified by checking item NBT for
// Apotheosis affix tags. Format: item.nbt.affix_data or similar.
// Since we can't guarantee the exact Apotheosis NBT format without
// in-game testing, we use item lore/name matching as a fallback.
//
// PHASE 1: Implement effects that work via standard KubeJS events.
// PHASE 2: Integrate with actual Apotheosis affix NBT after testing.
// =============================================================================

// ─── Helper: Check if item has a specific affix by lore text ───
// Apotheosis adds affix names to item lore. We check for our custom names.
function hasAffix(item, affixName) {
  if (!item || item.isEmpty()) return false
  try {
    let lore = item.nbt?.display?.Lore
    if (lore) {
      for (let i = 0; i < lore.size(); i++) {
        if (lore.getString(i).includes(affixName)) return true
      }
    }
    // Also check Apotheosis affix data directly
    let affixes = item.nbt?.affix_data || item.nbt?.Affixes
    if (affixes) {
      let str = affixes.toString()
      if (str.includes(affixName.toLowerCase().replace(/[' ]/g, '_'))) return true
    }
  } catch(e) {}
  return false
}

// Helper: get item from equipment slot name (KubeJS 6 compatible)
function getEquipItem(player, slot) {
  try {
    switch(slot) {
      case 'mainhand': return player.mainHandItem
      case 'offhand': return player.offHandItem
      case 'head': return player.headArmorItem
      case 'chest': return player.chestArmorItem
      case 'legs': return player.legsArmorItem
      case 'feet': return player.feetArmorItem
      default: return null
    }
  } catch(e) { return null }
}

function hasAnyAffix(player, affixName) {
  let slots = ['head','chest','legs','feet','mainhand','offhand']
  for (let slot of slots) {
    let item = getEquipItem(player, slot)
    if (item && hasAffix(item, affixName)) return true
  }
  return false
}

// Helper: get nearby living entities within radius
function getNearbyEntities(entity, radius) {
  let results = []
  try {
    let nearby = entity.level.getEntitiesWithin(
      AABB.of(entity.x-radius, entity.y-radius, entity.z-radius,
              entity.x+radius, entity.y+radius, entity.z+radius)
    )
    nearby.forEach(e => {
      if (e !== entity && e.living) results.push(e)
    })
  } catch(e) {}
  return results
}

// Helper: get nearby hostile entities
function getNearbyHostiles(entity, radius) {
  return getNearbyEntities(entity, radius).filter(e => e.monster)
}


// ==========================================================================
// ███ OFFENSIVE ON-HIT AFFIX EFFECTS (player attacks mob) ███
// ==========================================================================

// 2026-05-15 DamageModifierRegistry wrap (raw LivingHurtEvent).
  ;(function(){
    var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
    var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')
    DR.register('icraft.affixes.offensive', function(event) {
  var player = event.source.entity
    if (!(player instanceof PlayerClass)) return
  let target = event.entity
  if (!target || !target.living) return
  let weapon = player.mainHandItem

  // ── Skyshatter: T4 thematic affix. Vertical launch on hit. ──
  // 20% per qualifying hit, 2s cooldown per attacker, 0.65 upward
  // velocity + 12-tick Levitation amp 0 (~0.6s) + lightning visual.
  // Cooldown stops AoE/sweep edge from spamming the proc on crowds.
  if (hasAffix(weapon, "Skyshatter")) {
    let now = target.level.gameTime
    let lastSkyshatter = player.persistentData.contains('icraft_skyshatter_cd')
        ? player.persistentData.getLong('icraft_skyshatter_cd') : 0
    if (now - lastSkyshatter >= 40 && Math.random() < 0.20) {
      target.setDeltaMovement(0.0, 0.65, 0.0)
      try { target.potionEffects.add('minecraft:levitation', 12, 0, false, false) } catch (e) {}
      // Lightning visual + thunder cue, no real lightning entity (would
      // damage + ignite). Particle column at the target's center plus a
      // subdued thunder so it reads as "shattered skyward" rather than
      // a lightning-strike kill.
      try {
        let lvl = target.level
        lvl.spawnParticles('minecraft:flash', true,
          target.x, target.y + 1.0, target.z, 1, 0, 0, 0, 0)
        lvl.spawnParticles('minecraft:cloud', true,
          target.x, target.y + 0.5, target.z, 20, 0.5, 0.5, 0.5, 0.05)
        lvl.runCommandSilent(
          'playsound minecraft:entity.lightning_bolt.thunder hostile @a ' +
          target.x.toFixed(2) + ' ' + target.y.toFixed(2) + ' ' + target.z.toFixed(2) +
          ' 0.4 1.5'
        )
      } catch (e) {}
      player.persistentData.putLong('icraft_skyshatter_cd', now)
    }
  }

  // ── Harbinger's Mark: target takes +25% from ALL sources for 5s ──
  if (hasAffix(weapon, "Harbinger")) {
    target.potionEffects.add('minecraft:weakness', 100, 0, false, false)
    target.persistentData.putLong('icraft_marked', target.level.gameTime)
    target.persistentData.putInt('icraft_mark_bonus', 25)
  }

  // Check if target is marked (from any player's Harbinger's Mark)
  if (target.persistentData.contains('icraft_marked')) {
    let markTime = target.persistentData.getLong('icraft_marked')
    if (target.level.gameTime - markTime < 100) { // 5 seconds
      let bonus = target.persistentData.getInt('icraft_mark_bonus')
      event.amount *= (1 + bonus / 100)
    }
  }

  // ── Forgotten King's Authority: 3% instant kill below 15% HP ──
  if (hasAffix(weapon, "Authority")) {
    if (!target.type.includes('boss') && !target.type.includes('dragon') &&
        !target.type.includes('wither')) {
      if (target.health / target.maxHealth < 0.15 && Math.random() < 0.03) {
        event.amount = target.health + 10 // Lethal
      }
    }
  }

  // ── Gaia's Judgment: Execute scaling with missing HP ──
  if (hasAffix(weapon, "Judgment")) {
    let missingPct = 1 - (target.health / target.maxHealth)
    event.amount *= (1 + missingPct * 0.50) // Up to +50% at 10% HP
  }

  // ── Primordial Force: Ignore 30% armor ──
  if (hasAffix(weapon, "Primordial")) {
    let targetArmor = target.getAttributeValue('minecraft:generic.armor') || 0
    if (targetArmor > 0) {
      event.amount += targetArmor * 0.15 // Flat bonus based on armor
    }
  }

  // ── Entropic: +5% per consecutive hit on same target ──
  if (hasAffix(weapon, "Entropic")) {
    let lastTarget = player.persistentData.contains('icraft_entropic_target')
      ? player.persistentData.getString('icraft_entropic_target') : ''
    let targetId = target.uuid.toString()
    if (lastTarget === targetId) {
      let stacks = player.persistentData.getInt('icraft_entropic_stacks') + 1
      stacks = Math.min(stacks, 10)
      player.persistentData.putInt('icraft_entropic_stacks', stacks)
      event.amount *= (1 + stacks * 0.05)
    } else {
      player.persistentData.putString('icraft_entropic_target', targetId)
      player.persistentData.putInt('icraft_entropic_stacks', 0)
    }
  }

  // ── Bleeding: Stacking bleed (1 HP/s per stack, max 5) ──
  if (hasAffix(weapon, "Bleeding")) {
    let stacks = target.persistentData.getInt('icraft_bleed_stacks')
    stacks = Math.min(stacks + 1, 5)
    target.persistentData.putInt('icraft_bleed_stacks', stacks)
    target.persistentData.putLong('icraft_bleed_time', target.level.gameTime)
    // Apply poison as bleed proxy — amplifier = stacks - 1
    target.potionEffects.add('minecraft:poison', 60, Math.min(stacks - 1, 4), false, false)
  }

  // ── Electrified: 8-15% chance to chain lightning to 1-3 nearby mobs ──
  if (hasAffix(weapon, "Electrified") && Math.random() < 0.12) {
    let nearby = getNearbyHostiles(target, 4)
    let chains = Math.min(nearby.length, Math.floor(Math.random() * 3) + 1)
    for (let i = 0; i < chains; i++) {
      try {
        nearby[i].hurt('lightning_bolt', 2)
      } catch(e) {}
    }
  }

  // ── Corroding: Reduce target armor by applying Weakness ──
  if (hasAffix(weapon, "Corroding")) {
    let corrosion = target.persistentData.getInt('icraft_corrode_stacks')
    corrosion = Math.min(corrosion + 1, 5)
    target.persistentData.putInt('icraft_corrode_stacks', corrosion)
    // Weakness stacks approximate armor reduction
    target.potionEffects.add('minecraft:weakness', 100, Math.min(corrosion - 1, 2), false, false)
  }

  // ── Silencing: 5-10% chance to prevent mob abilities for 3s ──
  if (hasAffix(weapon, "Silencing") && Math.random() < 0.08) {
    // Apply slowness + weakness to simulate "silencing"
    target.potionEffects.add('minecraft:slowness', 60, 3, false, false)
    target.potionEffects.add('minecraft:weakness', 60, 2, false, false)
  }

  // ── Serpent's Coil: Stacking poison, 3rd stack = Poison II ──
  if (hasAffix(weapon, "Serpent")) {
    let pStacks = target.persistentData.getInt('icraft_serpent_stacks') + 1
    if (pStacks >= 3) {
      target.potionEffects.add('minecraft:poison', 80, 1, false, false) // Poison II
      target.persistentData.putInt('icraft_serpent_stacks', 0)
    } else {
      target.potionEffects.add('minecraft:poison', 60, 0, false, false) // Poison I
      target.persistentData.putInt('icraft_serpent_stacks', pStacks)
    }
  }

  // ── Necrotic Supremacy: Wither damage also heals player ──
  if (hasAffix(weapon, "Necrotic")) {
    target.potionEffects.add('minecraft:wither', 80, 1, false, false)
    player.heal(event.amount * 0.1) // 10% of damage dealt as healing
  }

  // ── Reality Fracture: 5% chance to freeze target in time (stun) ──
  if (hasAffix(weapon, "Fracture") && Math.random() < 0.05) {
    let lastFrac = player.persistentData.contains('icraft_fracture_cd')
      ? player.persistentData.getLong('icraft_fracture_cd') : 0
    if (player.level.gameTime - lastFrac > 300) { // 15s cooldown
      target.potionEffects.add('minecraft:slowness', 30, 127, false, false)
      target.potionEffects.add('minecraft:weakness', 30, 127, false, false)
      target.potionEffects.add('minecraft:mining_fatigue', 30, 127, false, false)
      player.persistentData.putLong('icraft_fracture_cd', player.level.gameTime)
    }
  }

  // ── Worldbreaker: +15% damage to ALL mob types ──
  if (hasAffix(weapon, "Worldbreaker")) {
    event.amount *= 1.15
  }

  // ── Relentless: +10% damage to targets hit in last 3s ──
  if (hasAffix(weapon, "Relentless")) {
    let targetId = target.uuid.toString()
    let lastHitKey = 'icraft_relentless_' + targetId.substring(0, 8)
    let lastHit = player.persistentData.contains(lastHitKey)
      ? player.persistentData.getLong(lastHitKey) : 0
    if (player.level.gameTime - lastHit < 60) { // 3 seconds
      event.amount *= 1.10
    }
    player.persistentData.putLong(lastHitKey, player.level.gameTime)
  }

  // ── Executioner's: +20% damage to targets below 30% HP ──
  if (hasAffix(weapon, "Executioner")) {
    if (target.health / target.maxHealth < 0.30) {
      event.amount *= 1.20
    }
  }

  // ── Hydra's Fury: Small AoE splash on attacks ──
  if (hasAffix(weapon, "Hydra")) {
    let splashTargets = getNearbyHostiles(target, 1.5)
    splashTargets.forEach(e => {
      try {
        e.hurt('player', event.amount * 0.3)
      } catch(ex) {}
    })
  }

  // ── Twilit: +15% damage in dim light ──
  if (hasAffix(weapon, "Twilit")) {
    let lightLevel = target.level.getBrightness(target.blockPosition()) || 7
    if (lightLevel >= 4 && lightLevel <= 10) {
      event.amount *= 1.15
    }
  }

  // ── Abyssal Edge: +20% damage in darkness + apply Darkness ──
  if (hasAffix(weapon, "Abyssal")) {
    let lightLevel = target.level.getBrightness(target.blockPosition()) || 7
    if (lightLevel <= 4) {
      event.amount *= 1.20
    }
    target.potionEffects.add('minecraft:darkness', 60, 0, false, false)
  }

  // ── Soulfire: Attacks apply soul fire (bypasses fire resistance) ──
  if (hasAffix(weapon, "Soulfire")) {
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
  // handler below). Per-rarity values read from the rolled rarity if the
  // affix_data NBT exposes it, else a safe mid-tier default. PROVISIONAL --
  // tune after operator fire-damage delta test.
  // Match on the affix ID "igniting" (hasAffix scans the affix_data NBT,
  // which stores the id apotheosis:igniting) -- robust to the lang rename
  // from "Ignition" to "Scorching" since the display name is no longer the
  // match key.
  if (hasAffix(weapon, "igniting")) {
    // [vulnPct, durationTicks] per rarity tier. Curve mirrors the corpus
    // mob_effect duration ramp (40->160t) + a modest, escalating amplify.
    var IGN_VULN = {
      common:   [0.15,  60],
      uncommon: [0.20,  80],
      rare:     [0.25, 100],
      epic:     [0.30, 120],
      mythic:   [0.40, 140],
      ancient:  [0.50, 160],
    }
    // Detect rolled rarity from affix_data NBT (Apotheosis serializes the
    // tier name into the compound). Substring scan, highest tier wins.
    var ignTier = 'rare' // safe mid-tier fallback
    try {
      var ad = weapon.nbt && weapon.nbt.contains('affix_data')
        ? String(weapon.nbt.getCompound('affix_data').toString()).toLowerCase()
        : ''
      var tiers = ['ancient','mythic','epic','rare','uncommon','common']
      for (var ti = 0; ti < tiers.length; ti++) {
        if (ad.indexOf(tiers[ti]) >= 0) { ignTier = tiers[ti]; break }
      }
    } catch (e) {}
    var ignVals = IGN_VULN[ignTier] || IGN_VULN.rare
    var ignPct = ignVals[0]
    var ignDur = ignVals[1]
    var ignNow = target.level.gameTime
    target.persistentData.putLong('icraft_fire_vuln_until', ignNow + ignDur)
    target.persistentData.putFloat('icraft_fire_vuln_pct', ignPct)
    // Visual feedback: small server-side flame burst (matches the
    // spawnParticles precedent used by Skyshatter above).
    try {
      target.level.spawnParticles('minecraft:flame', true,
        target.x, target.y + 0.8, target.z, 8, 0.25, 0.4, 0.25, 0.02)
    } catch (e) {}
  }

  // ── Permafrost: Attacks build up freeze (5 hits = 2s freeze) ──
  if (hasAffix(weapon, "Permafrost")) {
    let freezeStacks = target.persistentData.getInt('icraft_permafrost') + 1
    if (freezeStacks >= 5) {
      target.potionEffects.add('minecraft:slowness', 40, 127, false, false)
      target.potionEffects.add('minecraft:mining_fatigue', 40, 3, false, false)
      target.persistentData.putInt('icraft_permafrost', 0)
    } else {
      target.persistentData.putInt('icraft_permafrost', freezeStacks)
      target.potionEffects.add('minecraft:slowness', 20, 0, false, false)
    }
  }

  // ── Valkyrie's Strike: +25% damage while airborne/falling ──
  if (hasAffix(weapon, "Valkyrie") && !player.onGround()) {
    event.amount *= 1.25
  }

  // ── Void-Touched: Attacks briefly levitate target (anti-melee, End-themed) ──
  if (hasAffix(weapon, "Void-Touched") || hasAffix(weapon, "Void Touched")) {
    if (Math.random() < 0.15) { // 15% chance per hit
      target.potionEffects.add('minecraft:levitation', 20, 0, false, false) // 1s levitate
    }
  }

  // ── Ender Resonance: +15% damage to End mobs (Endermen, Shulkers, etc.) ──
  if (hasAffix(weapon, "Ender Resonance") || hasAffix(weapon, "Resonance")) {
    let targetType = target.type.toString()
    if (targetType.includes('enderman') || targetType.includes('shulker') ||
        targetType.includes('ender_dragon') || targetType.includes('endermite') ||
        targetType.includes('ender_guardian') || targetType.includes('ender_golem')) {
      event.amount *= 1.15
    }
  }

  // ── Deepwound: Reduce target healing by applying Instant Damage trace ──
  if (hasAffix(weapon, "Deepwound")) {
    target.persistentData.putLong('icraft_deepwound', target.level.gameTime)
    target.potionEffects.add('minecraft:wither', 100, 0, false, false) // Proxy for healing reduction
  }

  // ── End's Dominion: +25% damage to End mobs ──
  if (hasAffix(weapon, "End's Dominion") || hasAffix(weapon, "Dominion")) {
    let targetType = target.type.toString()
    if (targetType.includes('enderman') || targetType.includes('shulker') ||
        targetType.includes('ender_dragon') || targetType.includes('phantom') ||
        targetType.includes('endermite')) {
      event.amount *= 1.25
    }
  }

  // ── Rotbane: Bonus damage to Undergarden mobs ──
  if (hasAffix(weapon, "Rotbane")) {
    let targetType = target.type.toString()
    if (targetType.includes('undergarden')) {
      event.amount *= 1.25
    }
    // Also grant poison immunity proxy — clear poison from player
    player.removeEffect('minecraft:poison')
  }

  // ── Voidwalker: Short teleport toward target on hit (5s cooldown) ──
  if (hasAffix(weapon, "Voidwalker")) {
    let lastVoid = player.persistentData.contains('icraft_voidwalk_cd')
      ? player.persistentData.getLong('icraft_voidwalk_cd') : 0
    if (player.level.gameTime - lastVoid > 100) { // 5s cooldown
      // Teleport 3 blocks toward target
      let dx = target.x - player.x
      let dz = target.z - player.z
      let dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > 3) {
        let ratio = 3 / dist
        player.teleportTo(player.x + dx * ratio, player.y, player.z + dz * ratio)
      }
      player.persistentData.putLong('icraft_voidwalk_cd', player.level.gameTime)
    }
  }

  // ── Nature's Wrath: Every 5th hit triggers AoE (Poison II + knockback) ──
  if (hasAffix(weapon, "Nature's Wrath") || hasAffix(weapon, "Nature")) {
    let nHits = player.persistentData.getInt('icraft_nature_hits') + 1
    if (nHits >= 5) {
      let nearby = getNearbyHostiles(target, 3)
      nearby.forEach(e => {
        try {
          e.potionEffects.add('minecraft:poison', 60, 1, false, false)
          e.hurt('player', 4)
        } catch(ex) {}
      })
      // Also hit the target
      target.potionEffects.add('minecraft:poison', 60, 1, false, false)
      player.persistentData.putInt('icraft_nature_hits', 0)
    } else {
      player.persistentData.putInt('icraft_nature_hits', nHits)
    }
  }

  // ── Apex Predator: +5% per Champion/Boss killed in last 10 min (max +25%) ──
  if (hasAffix(weapon, "Apex")) {
    let apexStacks = player.persistentData.getInt('icraft_apex_stacks')
    let apexTime = player.persistentData.contains('icraft_apex_time')
      ? player.persistentData.getLong('icraft_apex_time') : 0
    if (player.level.gameTime - apexTime > 12000) { // Reset after 10 min
      apexStacks = 0
    }
    if (apexStacks > 0) {
      event.amount *= (1 + Math.min(apexStacks, 5) * 0.05)
    }
  }

  // ── Celestial Radiance: 2x damage to undead + healing light ──
  if (hasAffix(weapon, "Celestial")) {
    let targetType = target.type.toString()
    if (targetType.includes('zombie') || targetType.includes('skeleton') ||
        targetType.includes('wither') || targetType.includes('phantom') ||
        targetType.includes('drowned') || targetType.includes('husk') ||
        targetType.includes('stray') || targetType.includes('zombified')) {
      event.amount *= 2.0
    }
    // Heal nearby allies
    let allies = getNearbyEntities(player, 5)
    allies.forEach(e => {
      if (e.player && e !== player) {
        e.heal(0.5)
      }
    })
  }

  // ── Shockwave: Charged attacks release ground shockwave ──
  // Approximation: full-charge hits (cooldown-based detection)
  if (hasAffix(weapon, "Shockwave")) {
    let lastShock = player.persistentData.contains('icraft_shockwave_cd')
      ? player.persistentData.getLong('icraft_shockwave_cd') : 0
    if (player.level.gameTime - lastShock > 40) { // ~2s minimum between shockwaves
      let nearby = getNearbyHostiles(target, 3)
      nearby.forEach(e => {
        try {
          e.hurt('player', event.amount * 0.4)
        } catch(ex) {}
      })
      player.persistentData.putLong('icraft_shockwave_cd', player.level.gameTime)
    }
  }

  // ── Netherquake: Sprint-attack ground slam AoE (8s cooldown) ──
  if (hasAffix(weapon, "Netherquake") && player.isSprinting()) {
    let lastQuake = player.persistentData.contains('icraft_quake_cd')
      ? player.persistentData.getLong('icraft_quake_cd') : 0
    if (player.level.gameTime - lastQuake > 160) { // 8s cooldown
      let nearby = getNearbyHostiles(target, 4)
      nearby.forEach(e => {
        try {
          e.hurt('player', event.amount * 0.5)
          // Knockback approximation via potion
          e.potionEffects.add('minecraft:slowness', 20, 2, false, false)
        } catch(ex) {}
      })
      player.persistentData.putLong('icraft_quake_cd', player.level.gameTime)
    }
  }

  // ── Stormforged: 8% chance to call lightning on crits ──
  if (hasAffix(weapon, "Stormforged") && Math.random() < 0.08) {
    try {
      target.level.server.runCommandSilent(
        'summon minecraft:lightning_bolt ' + target.x + ' ' + target.y + ' ' + target.z
      )
    } catch(e) {}
  }

  // ── Warden's Echo: Charged sonic boom (15s cooldown) ──
  // Triggers on sprint-attacks as "charged" proxy
  if (hasAffix(weapon, "Warden") && player.isSprinting()) {
    let lastEcho = player.persistentData.contains('icraft_warden_cd')
      ? player.persistentData.getLong('icraft_warden_cd') : 0
    if (player.level.gameTime - lastEcho > 300) { // 15s cooldown
      let nearby = getNearbyHostiles(target, 5)
      nearby.forEach(e => {
        try {
          e.hurt('sonic_boom', 8)
        } catch(ex) {}
      })
      target.hurt('sonic_boom', 8)
      player.persistentData.putLong('icraft_warden_cd', player.level.gameTime)
    }
  }

  // ── Starfall: Charged attacks call delayed AoE from above ──
  if (hasAffix(weapon, "Starfall") && player.isSprinting()) {
    let lastStar = player.persistentData.contains('icraft_starfall_cd')
      ? player.persistentData.getLong('icraft_starfall_cd') : 0
    if (player.level.gameTime - lastStar > 200) { // 10s cooldown
      // Delayed damage to area (immediate for now, marked as "delayed")
      let nearby = getNearbyHostiles(target, 3)
      nearby.forEach(e => {
        try {
          e.hurt('magic', 6)
          e.setSecondsOnFire(2)
        } catch(ex) {}
      })
      target.hurt('magic', 6)
      player.persistentData.putLong('icraft_starfall_cd', player.level.gameTime)
    }
  }
    })
  })()// ==========================================================================
// ███ FIRE-VULNERABILITY DAMAGE AMPLIFY (Igniting mark) ███
// ==========================================================================
// Companion to the Igniting on-hit proc above. Runs for EVERY LivingHurtEvent
// (no player filter on attacker OR victim) because fire damage on a marked
// target most often comes from fire/lava/on-fire ticks and fire-tagged spells,
// NOT directly from the wielder's swing. When a marked target takes fire-type
// damage and the mark is still live, amplify event.amount by the stored pct.
// Fire-type classification reuses the exact srcType.includes('fire'|'lava')
// test used by the Ignis Core defensive branch, plus the target's own
// on-fire flag so on-fire DoT ticks count.
  ;(function(){
    var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
    DR.register('icraft.affixes.fire_vuln', function(event) {
      var victim = event.entity
      if (!victim || !victim.living) return
      var pdata = victim.persistentData
      if (!pdata.contains('icraft_fire_vuln_until')) return
      var until = pdata.getLong('icraft_fire_vuln_until')
      var now = victim.level.gameTime
      if (now > until) {
        // Mark expired -- clean up the stamps so we stop checking.
        pdata.remove('icraft_fire_vuln_until')
        pdata.remove('icraft_fire_vuln_pct')
        return
      }
      // Classify fire-type damage. Mirrors the Ignis Core srcType test;
      // also count the victim's on-fire DoT ticks.
      var srcType = event.source && event.source.type ? String(event.source.type) : ''
      var isFire = (srcType.indexOf('fire') >= 0 || srcType.indexOf('lava') >= 0 ||
                    srcType.indexOf('hot_floor') >= 0 || srcType.indexOf('in_fire') >= 0 ||
                    srcType.indexOf('on_fire') >= 0)
      if (!isFire) {
        // Catch on-fire DoT ticks whose source type string may not include
        // 'fire' on all mappings: if the victim is burning, treat the tick as
        // fire too. Uses the corpus-confirmed remainingFireTicks getter
        // (sunlight_smite.js / abyss_armor_effects.js precedent).
        try { if (victim.remainingFireTicks > 0) isFire = true } catch (e) {}
      }
      if (!isFire) return
      var pct = pdata.getFloat('icraft_fire_vuln_pct')
      if (pct > 0) event.amount = event.amount * (1 + pct)
    })
  })()// ==========================================================================
// ███ ON-KILL AFFIX EFFECTS ███
// ==========================================================================

EntityEvents.death(event => {
  let entity = event.entity
  if (!entity || !entity.living) return
  let source = event.source
  if (!source || !source.player) return
  let player = source.player
  let weapon = player.mainHandItem

  // ── Soulstealer: Kills grant absorption hearts ──
  if (hasAffix(weapon, "Soulstealer")) {
    player.potionEffects.add('minecraft:absorption', 200, 1, false, true)
  }

  // ── Spectral Wail: Kills terrify nearby mobs ──
  if (hasAffix(weapon, "Spectral Wail") || hasAffix(weapon, "Spectral")) {
    let nearby = getNearbyHostiles(entity, 8)
    nearby.forEach(e => {
      e.potionEffects.add('minecraft:slowness', 100, 2, false, false)
      e.potionEffects.add('minecraft:weakness', 100, 1, false, false)
    })
  }

  // ── Invigorating: Kills grant Speed I ──
  if (hasAffix(weapon, "Invigorating")) {
    player.potionEffects.add('minecraft:speed', 100, 0, false, true)
  }

  // ── Harvesting: Kills grant bonus XP ──
  if (hasAffix(weapon, "Harvesting")) {
    player.giveExperiencePoints(Math.floor(Math.random() * 10) + 5)
  }

  // ── Ender Siphon: Kills restore durability ──
  if (hasAffix(weapon, "Siphon")) {
    if (weapon.isDamageable()) {
      let restore = Math.floor(weapon.maxDamage * 0.05)
      weapon.damageValue = Math.max(0, weapon.damageValue - restore)
    }
  }

  // ── Siphoning: Kills restore 1-3 hunger points ──
  if (hasAffix(weapon, "Siphoning")) {
    try {
      let food = player.foodLevel
      player.foodLevel = Math.min(20, food + Math.floor(Math.random() * 3) + 1)
    } catch(e) {}
  }

  // ── Magnetic: Items attracted to player after kill ──
  if (hasAffix(weapon, "Magnetic")) {
    // Give player a brief speed boost so items gravitate (proxy)
    player.potionEffects.add('minecraft:speed', 40, 0, false, false)
  }

  // ── Summoner's Accord: 5% chance to spawn friendly phantom ally ──
  if (hasAffix(weapon, "Summoner") && Math.random() < 0.05) {
    try {
      player.level.server.runCommandSilent(
        'summon minecraft:vex ' + entity.x + ' ' + (entity.y + 1) + ' ' + entity.z +
        ' {Life:600,Tags:["icraft_summoned_ally"],ActiveEffects:[{Id:11,Amplifier:0,Duration:600}]}'
      )
    } catch(e) {}
  }

  // ── Apex Predator: Track Champion/Boss kills ──
  if (hasAffix(weapon, "Apex")) {
    let targetType = entity.type.toString()
    // Champions have champion tags or are bosses
    if (targetType.includes('boss') || targetType.includes('dragon') ||
        targetType.includes('wither') || targetType.includes('guardian') ||
        entity.persistentData.contains('champion')) {
      let stacks = player.persistentData.getInt('icraft_apex_stacks') + 1
      player.persistentData.putInt('icraft_apex_stacks', Math.min(stacks, 5))
      player.persistentData.putLong('icraft_apex_time', player.level.gameTime)
    }
  }
})


// ==========================================================================
// ███ DEFENSIVE AFFIX EFFECTS (player gets hit) ███
// ==========================================================================

// 2026-05-15 DamageModifierRegistry wrap (raw LivingHurtEvent).
  ;(function(){
    var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
    var PlayerClass = Java.loadClass('net.minecraft.world.entity.player.Player')
    DR.register('icraft.affixes.defensive', function(event) {
  var player = event.entity
    if (!(player instanceof PlayerClass)) return

  // ── Second Wind: Regen II at low HP ──
  if (player.health / player.maxHealth < 0.30 && hasAnyAffix(player, "Second Wind")) {
    let lastWind = player.persistentData.contains('icraft_second_wind')
      ? player.persistentData.getLong('icraft_second_wind') : 0
    if (player.level.gameTime - lastWind > 1200) { // 60s cooldown
      player.potionEffects.add('minecraft:regeneration', 100, 1, false, true)
      player.persistentData.putLong('icraft_second_wind', player.level.gameTime)
    }
  }

  // ── Ignis Core: Fire damage heals instead ──
  let srcType = event.source && event.source.type ? String(event.source.type) : ''
  if (srcType && (srcType.includes('fire') || srcType.includes('lava'))) {
    if (hasAnyAffix(player, "Ignis Core") || hasAnyAffix(player, "Ignis")) {
      let healAmount = event.amount * 0.5
      event.amount = 0
      player.heal(healAmount)
    }
  }

  // ── Sculkheart: On hit, sonic pulse damages nearby mobs ──
  if (hasAnyAffix(player, "Sculkheart")) {
    let lastPulse = player.persistentData.contains('icraft_sculk_pulse')
      ? player.persistentData.getLong('icraft_sculk_pulse') : 0
    if (player.level.gameTime - lastPulse > 200) { // 10s cooldown
      let nearby = getNearbyHostiles(player, 4)
      nearby.forEach(e => {
        try { e.hurt('sonic_boom', 6) } catch(ex) {}
      })
      player.persistentData.putLong('icraft_sculk_pulse', player.level.gameTime)
    }
  }

  // ── Challenger's Spirit: -10% dmg taken from bosses ──
  if (event.source && event.source.actual) {
    let attacker = event.source.actual
    if (attacker.living && attacker.type &&
        (attacker.type.includes('boss') || attacker.type.includes('dragon'))) {
      if (hasAnyAffix(player, "Challenger")) {
        event.amount *= 0.90
      }
    }
  }

  // ── Dragon's Dominion: -15% damage from all mobs ──
  if (hasAnyAffix(player, "Dominion")) {
    event.amount *= 0.85
  }

  // ── Chorus Shift: Random teleport when hit below 20% HP ──
  if (player.health / player.maxHealth < 0.20 && hasAnyAffix(player, "Chorus")) {
    let lastShift = player.persistentData.contains('icraft_chorus')
      ? player.persistentData.getLong('icraft_chorus') : 0
    if (player.level.gameTime - lastShift > 600) { // 30s cooldown
      let dx = (Math.random() - 0.5) * 16
      let dz = (Math.random() - 0.5) * 16
      player.teleportTo(player.x + dx, player.y, player.z + dz)
      player.persistentData.putLong('icraft_chorus', player.level.gameTime)
    }
  }

  // ── Undying Flame: Survive lethal hit at 1 HP + fire nova (5 min cooldown) ──
  if (hasAnyAffix(player, "Undying") || hasAnyAffix(player, "Undying Flame")) {
    if (event.amount >= player.health) {
      let lastUndying = player.persistentData.contains('icraft_undying_cd')
        ? player.persistentData.getLong('icraft_undying_cd') : 0
      if (player.level.gameTime - lastUndying > 6000) { // 5 min cooldown
        event.amount = 0
        player.health = 1
        // Fire nova
        let nearby = getNearbyHostiles(player, 5)
        nearby.forEach(e => {
          try {
            e.setSecondsOnFire(5)
            e.hurt('player', 8)
          } catch(ex) {}
        })
        player.persistentData.putLong('icraft_undying_cd', player.level.gameTime)
      }
    }
  }

  // ── Immortal: Negate killing blow (10 min cooldown) ──
  if (hasAnyAffix(player, "Immortal")) {
    if (event.amount >= player.health) {
      let lastImmortal = player.persistentData.contains('icraft_immortal_cd')
        ? player.persistentData.getLong('icraft_immortal_cd') : 0
      if (player.level.gameTime - lastImmortal > 12000) { // 10 min cooldown
        event.amount = 0
        player.health = 1
        player.potionEffects.add('minecraft:resistance', 40, 3, false, true)
        player.persistentData.putLong('icraft_immortal_cd', player.level.gameTime)
      }
    }
  }

  // ── Phantom Dash: Double-tap sprint for invulnerable dash (8s cooldown) ──
  // Approximation: when hit while sprinting, negate damage
  if (hasAnyAffix(player, "Phantom Dash") || hasAnyAffix(player, "Phantom")) {
    if (player.isSprinting()) {
      let lastDash = player.persistentData.contains('icraft_dash_cd')
        ? player.persistentData.getLong('icraft_dash_cd') : 0
      if (player.level.gameTime - lastDash > 160) { // 8s cooldown
        event.amount = 0
        player.potionEffects.add('minecraft:speed', 20, 2, false, true)
        player.persistentData.putLong('icraft_dash_cd', player.level.gameTime)
      }
    }
  }

  // ── Valkyrie Ascension: While airborne -15% damage taken, +15% dealt ──
  if (hasAnyAffix(player, "Valkyrie Ascension") || hasAnyAffix(player, "Ascension")) {
    if (!player.onGround()) {
      event.amount *= 0.85
    }
  }

  // ── Adaptable: +5-10% resistance to last damage type ──
  if (hasAnyAffix(player, "Adaptable")) {
    if (event.source && event.source.type) {
      let lastDmgType = player.persistentData.contains('icraft_adapt_type')
        ? player.persistentData.getString('icraft_adapt_type') : ''
      let currentType = event.source.type.toString()
      if (lastDmgType === currentType) {
        event.amount *= 0.90 // 10% reduction for repeated damage type
      }
      player.persistentData.putString('icraft_adapt_type', currentType)
    }
  }

  // ── Battle Hardened: +3% damage reduction per nearby hostile (max 5) ──
  if (hasAnyAffix(player, "Battle Hardened") || hasAnyAffix(player, "Hardened")) {
    let nearby = getNearbyHostiles(player, 8)
    let stacks = Math.min(nearby.length, 5)
    if (stacks > 0) {
      event.amount *= (1 - stacks * 0.03)
    }
  }

  // ── Berserker's: +1% damage dealt per 5% missing HP ──
  // Defensive component: no reduction, but track for offensive use
  // (offensive part is in tick section)

  // ── Reflective (armor): 5-15% chance to reflect melee damage ──
  if (hasAnyAffix(player, "Reflective")) {
    if (event.source && event.source.actual && Math.random() < 0.10) {
      let attacker = event.source.actual
      if (attacker.living) {
        try {
          attacker.hurt('thorns', event.amount * 0.35)
        } catch(e) {}
      }
    }
  }

  // ── Thorned: Attackers take flat damage ──
  // JSON handles the armor bonus; this adds the retaliatory damage
  if (hasAnyAffix(player, "Thorned")) {
    if (event.source && event.source.actual) {
      let attacker = event.source.actual
      if (attacker.living) {
        try {
          attacker.hurt('thorns', 2)
        } catch(e) {}
      }
    }
  }

  // ── Frostward: Slows melee attackers ──
  if (hasAnyAffix(player, "Frostward")) {
    if (event.source && event.source.actual) {
      let attacker = event.source.actual
      if (attacker.living) {
        attacker.potionEffects.add('minecraft:slowness', 60, 1, false, false)
      }
    }
  }

  // ── Blazeforged: Fire aura when below 30% HP ──
  if (hasAnyAffix(player, "Blazeforged")) {
    if (player.health / player.maxHealth < 0.30) {
      let nearby = getNearbyHostiles(player, 3)
      nearby.forEach(e => {
        try {
          e.setSecondsOnFire(3)
          e.hurt('on_fire', 3)
        } catch(ex) {}
      })
    }
  }

  // ── Shulker's Guard: 10% chance for Resistance I for 3s ──
  if (hasAnyAffix(player, "Shulker")) {
    if (Math.random() < 0.10) {
      player.potionEffects.add('minecraft:resistance', 60, 0, false, true)
      player.removeEffect('minecraft:levitation')
    }
  }

  // ── Gloomward: Chance to blind attackers on block (shield affix) ──
  if (hasAffix(getEquipItem(player, 'offhand'), "Gloomward")) {
    if (event.source && event.source.actual && Math.random() < 0.15) {
      let attacker = event.source.actual
      if (attacker.living) {
        attacker.potionEffects.add('minecraft:blindness', 40, 0, false, false)
      }
    }
  }

  // ── Repulsing: Blocking creates knockback wave ──
  if (hasAffix(getEquipItem(player, 'offhand'), "Repulsing")) {
    let nearby = getNearbyHostiles(player, 2)
    nearby.forEach(e => {
      try {
        e.potionEffects.add('minecraft:slowness', 20, 3, false, false)
      } catch(ex) {}
    })
  }

  // ── Absorbing: Blocking restores HP ──
  if (hasAffix(getEquipItem(player, 'offhand'), "Absorbing")) {
    player.heal(0.5)
  }

  // ── Fortifying: Blocking grants Resistance I ──
  if (hasAffix(getEquipItem(player, 'offhand'), "Fortifying")) {
    player.potionEffects.add('minecraft:resistance', 60, 0, false, true)
  }

  // ── Mending Touch: +10-25% healing received ──
  // Note: Can't directly intercept healing events in KubeJS 1.20.1
  // Proxy: give small regen when damaged
  if (hasAnyAffix(player, "Mending")) {
    player.potionEffects.add('minecraft:regeneration', 40, 0, false, false)
  }

  // ── Empyrean: Additional flat armor bonus on hit ──
  if (hasAnyAffix(player, "Empyrean")) {
    player.potionEffects.add('minecraft:resistance', 40, 0, false, false)
  }
    })
  })()// ==========================================================================
// ███ DIMENSIONAL & PASSIVE AFFIX EFFECTS (tick-based) ███
// ==========================================================================
global.tick_affixEffects = (event) => {
  event.server.players.forEach(player => {
    let dim = player.level.dimension

    // ── Twilight's Embrace: Regen I in forest + speed at night ──
    if (dim === 'twilightforest:twilight_forest' && hasAnyAffix(player, "Embrace")) {
      player.potionEffects.add('minecraft:regeneration', 120, 0, false, false)
      player.potionEffects.add('minecraft:speed', 120, 0, false, false)
    }

    // ── Everdawn: Slow HP regen above Y=128 ──
    if ((dim === 'blue_skies:everbright' || dim === 'blue_skies:everdawn') &&
        player.y > 128 && hasAnyAffix(player, "Everdawn")) {
      if (player.health < player.maxHealth) player.heal(0.5)
    }

    // ── Deeproot: +15% max HP underground ──
    if (player.y < 0 && hasAnyAffix(player, "Deeproot")) {
      player.modifyAttribute('minecraft:generic.max_health',
        'icraft_deeproot', 0.15, 'multiply_base')
    }

    // ── Stratospheric: Speed + Levitation immunity ──
    if ((dim === 'deep_aether:the_aether' || dim === 'aether:the_aether') &&
        hasAnyAffix(player, "Stratospheric")) {
      player.removeEffect('minecraft:levitation')
      player.potionEffects.add('minecraft:speed', 120, 0, false, false)
    }

    // ── Ascendant: Positive potions last 20% longer ──
    // Proxy: refresh beneficial effects with slightly extended duration
    if (hasAnyAffix(player, "Ascendant")) {
      // Handled by buff_duration in skill_effects.js — stacks with that system
    }

    // ── Null Gravity: Permanent Slow Falling ──
    if (hasAnyAffix(player, "Null Gravity") || hasAnyAffix(player, "Null")) {
      player.potionEffects.add('minecraft:slow_falling', 120, 0, false, false)
    }

    // ── Ironwood's Resilience: Slow durability regen in forests ──
    // Proxy: minor regen in Twilight Forest
    if (dim === 'twilightforest:twilight_forest' && hasAnyAffix(player, "Ironwood")) {
      player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
    }

    // ── Sporeguard: Immunity to Undergarden negative effects ──
    if (dim === 'undergarden:undergarden' && hasAnyAffix(player, "Sporeguard")) {
      player.removeEffect('minecraft:poison')
      player.removeEffect('minecraft:nausea')
      player.removeEffect('minecraft:weakness')
    }

    // ── Sculk Resonance: Nearby hostile mobs glow (8-block detection) ──
    if (hasAnyAffix(player, "Sculk Resonance") || hasAnyAffix(player, "Resonance")) {
      let nearby = getNearbyHostiles(player, 8)
      nearby.forEach(e => {
        e.potionEffects.add('minecraft:glowing', 120, 0, false, false)
      })
    }

    // ── Echolocating: Hostile mobs within 16 blocks glow through walls ──
    if (hasAnyAffix(player, "Echolocating")) {
      let nearby = getNearbyHostiles(player, 16)
      nearby.forEach(e => {
        e.potionEffects.add('minecraft:glowing', 120, 0, false, false)
      })
    }

    // ── Void Gaze: See all entities within 32 blocks ──
    if (hasAnyAffix(player, "Void Gaze")) {
      let nearby = getNearbyEntities(player, 32)
      nearby.forEach(e => {
        e.potionEffects.add('minecraft:glowing', 120, 0, false, false)
      })
    }

    // ── Aether-touched: +10% damage to non-Aether mobs in Aether ──
    // This is handled via the on-hit section; passive part: minor speed in Aether
    if ((dim === 'aether:the_aether' || dim === 'deep_aether:the_aether') &&
        hasAnyAffix(player, "Aether-touched") || hasAnyAffix(player, "Aether")) {
      player.potionEffects.add('minecraft:speed', 120, 0, false, false)
    }

    // ── End Walker: Speed boost in The End ──
    if (dim === 'minecraft:the_end' && hasAnyAffix(player, "End Walker")) {
      player.potionEffects.add('minecraft:speed', 120, 1, false, false)
    }

    // ── Chorus Mending: Passive regen in The End ──
    if (dim === 'minecraft:the_end' && hasAnyAffix(player, "Chorus")) {
      if (player.health < player.maxHealth) player.heal(0.5)
    }

    // ── Shulker's Guard: Projectile resistance proxy in The End ──
    if (dim === 'minecraft:the_end' && hasAnyAffix(player, "Shulker Guard")) {
      player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
    }

    // ── Magma Walker: Fire immunity tick on magma/lava ──
    if (hasAnyAffix(player, "Magma Walker") || hasAnyAffix(player, "Magma")) {
      if (dim === 'minecraft:the_nether') {
        player.potionEffects.add('minecraft:fire_resistance', 120, 0, false, false)
      }
    }

    // ── Surefooted: Immunity to Slowness ──
    if (hasAnyAffix(player, "Surefooted")) {
      player.removeEffect('minecraft:slowness')
    }

    // ── Unbreakable: Immune to Levitation + Slowness ──
    if (hasAnyAffix(player, "Unbreakable")) {
      player.removeEffect('minecraft:levitation')
      player.removeEffect('minecraft:slowness')
    }

    // ── Nightvision: Slight brightness boost ──
    if (hasAnyAffix(player, "Nightvision")) {
      player.potionEffects.add('minecraft:night_vision', 320, 0, false, false)
    }

    // ── Warm: Reduced Freezing ──
    if (hasAnyAffix(player, "Warm")) {
      // Remove freezing ticks
      try { player.setTicksFrozen(0) } catch(e) {}
    }

    // ── Repairing: Very slow passive durability regen ──
    if (hasAnyAffix(player, "Repairing")) {
      let slots = ['head','chest','legs','feet','mainhand','offhand']
      for (let slot of slots) {
        try {
          let item = getEquipItem(player, slot)
          if (item && !item.isEmpty() && item.isDamageable() && item.damageValue > 0) {
            if (hasAffix(item, "Repairing")) {
              item.damageValue = Math.max(0, item.damageValue - 1)
            }
          }
        } catch(e) {}
      }
    }

    // ── Convergence: Bonus when wearing mixed tech + magic gear ──
    if (hasAnyAffix(player, "Convergence")) {
      // Check for tech/magic gear mix — proxy: just give a small boost
      player.potionEffects.add('minecraft:strength', 120, 0, false, false)
      player.potionEffects.add('minecraft:resistance', 120, 0, false, false)
    }

    // ── Perfected Form: +2% per Mythic equipped ──
    // Count mythic items (proxy: check for mythic in lore)
    if (hasAnyAffix(player, "Perfected")) {
      let mythicCount = 0
      let slots = ['head','chest','legs','feet','mainhand','offhand']
      for (let slot of slots) {
        try {
          let item = getEquipItem(player, slot)
          if (item && !item.isEmpty()) {
            let lore = item.nbt?.display?.Lore
            if (lore) {
              for (let i = 0; i < lore.size(); i++) {
                if (lore.getString(i).toLowerCase().includes('mythic')) {
                  mythicCount++
                  break
                }
              }
            }
          }
        } catch(e) {}
      }
      if (mythicCount > 0) {
        player.potionEffects.add('minecraft:strength', 120, Math.min(mythicCount - 1, 2), false, false)
      }
    }

    // ── Dimensional Attunement: Passive stat boost ──
    if (hasAnyAffix(player, "Dimensional Attunement") || hasAnyAffix(player, "Attunement")) {
      player.potionEffects.add('minecraft:strength', 120, 0, false, false)
    }

    // ── Berserker's: +1% damage per 5% missing HP ──
    if (hasAnyAffix(player, "Berserker")) {
      let missingPct = 1 - (player.health / player.maxHealth)
      if (missingPct > 0.2) {
        // Strength amplifier scales with missing HP
        let amp = Math.min(Math.floor(missingPct * 4), 3) // 0-3 amplifier
        player.potionEffects.add('minecraft:strength', 120, amp, false, false)
      }
    }

    // ── Hellforged: Melee attackers take fire damage (passive aura) ──
    // Handled via the defensive hurt event above; passive component: fire res
    if (hasAnyAffix(player, "Hellforged")) {
      player.potionEffects.add('minecraft:fire_resistance', 120, 0, false, false)
    }

    // ── Updraft: Taking fall damage creates updraft ──
    // Proxy: slow falling after being above certain height
    if (hasAnyAffix(player, "Updraft") && !player.onGround()) {
      player.potionEffects.add('minecraft:slow_falling', 40, 0, false, false)
    }

    // ── Featherweight + Acrobatic: Fall damage reduction ──
    if (hasAnyAffix(player, "Featherweight") || hasAnyAffix(player, "Acrobatic")) {
      if (!player.onGround() && player.deltaMovement.y < -0.5) {
        player.potionEffects.add('minecraft:slow_falling', 20, 0, false, false)
      }
    }
  })
}
global.registerServerTick('tick_affixEffects', 100, 80)


console.log('[IridescentCraft] affix_effects.js loaded — 65+ boss/dimensional/complex affix effects')
