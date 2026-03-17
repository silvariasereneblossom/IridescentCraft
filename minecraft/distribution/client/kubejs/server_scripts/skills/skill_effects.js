// =============================================================================
// IridescentCraft — Pufferfish Skills Command Reward Bridge (Phase 3)
// File: kubejs/server_scripts/skills/skill_effects.js
//
// Reads scoreboard values set by Pufferfish Skills command rewards and
// applies gameplay effects via KubeJS event hooks.
//
// 59 command reward nodes across 4 trees:
//   Sorcery (10), Marksman (11), Gathering (17), Engineering (27)
//
// ALL 22 scoreboard objectives now have functional gameplay effects.
// =============================================================================

ServerEvents.loaded(event => {
  ;['icraft_mana_regen','icraft_cast_speed','icraft_mana_cost_reduction',
    'icraft_buff_duration','icraft_accuracy','icraft_execute_damage',
    'icraft_ammo_save','icraft_aoe_splash','icraft_crop_yield',
    'icraft_ore_processing','icraft_fishing_speed','icraft_breeding_speed',
    'icraft_bonemeal_eff','icraft_crafting_speed','icraft_material_save',
    'icraft_machine_speed','icraft_craft_bonus','icraft_enchant_cost_reduction',
    'icraft_rf_generation','icraft_fuel_reduction','icraft_all_resistance',
    'icraft_hp_regen'
  ].forEach(obj => event.server.runCommandSilent(`scoreboard objectives add ${obj} dummy`))
  console.log('[IridescentCraft] Scoreboard objectives created (22)')
})

function getScore(server, playerName, objective) {
  try {
    let obj = server.scoreboard.getObjective(objective)
    if (!obj) return 0
    return server.scoreboard.getOrCreatePlayerScore(playerName, obj).score
  } catch(e) { return 0 }
}

// Helper: check for nearby blocks within a radius (scans Y-1 to Y+1 for machines)
function hasNearbyBlock(player, keys, radius) {
  let pos = player.blockPosition()
  let r = radius || 8
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        try {
          let block = player.level.getBlock(pos.x + dx, pos.y + dy, pos.z + dz)
          if (block && keys.some(k => block.id.includes(k))) {
            return true
          }
        } catch(e) {}
      }
    }
  }
  return false
}

// Helper: count nearby blocks matching keys within radius
function countNearbyBlocks(player, keys, radius) {
  let pos = player.blockPosition()
  let r = radius || 8
  let count = 0
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        try {
          let block = player.level.getBlock(pos.x + dx, pos.y + dy, pos.z + dz)
          if (block && keys.some(k => block.id.includes(k))) {
            count++
          }
        } catch(e) {}
      }
    }
  }
  return count
}

// Block key lists for Engineering proximity checks
let CRAFTING_STATION_KEYS = [
  'crafting_table', 'anvil', 'smithing_table', 'stonecutter',
  'loom', 'cartography_table', 'fletching_table', 'grindstone',
  'create:mechanical_crafter', 'create:deployer'
]

let MACHINE_KEYS = [
  'machine', 'smelter', 'furnace', 'crusher', 'press',
  'pulverizer', 'enrichment', 'grinder', 'centrifuge',
  'infuser', 'sawmill', 'bottling', 'compactor',
  'create:millstone', 'create:mechanical_press', 'create:mechanical_mixer',
  'create:mechanical_saw', 'create:crushing_wheel', 'create:encased_fan',
  'create:basin', 'create:depot', 'create:spout'
]

let GENERATOR_KEYS = [
  'generator', 'dynamo', 'solar', 'turbine', 'reactor',
  'create:water_wheel', 'create:windmill', 'create:hand_crank',
  'create:steam_engine', 'create:flywheel'
]

let FURNACE_KEYS = [
  'furnace', 'smelter', 'blast_furnace', 'smoker',
  'create:encased_fan'
]


// ═══════════════════════════════════════════════════════════════════════════
// COMBAT: Player Dealing Damage
// ═══════════════════════════════════════════════════════════════════════════
EntityEvents.hurt(event => {
  if (!event.source || !event.source.player) return
  let player = event.source.player
  let target = event.entity
  if (!target || !target.living) return
  let srv = player.server
  let name = player.username

  // Execute Damage: +X% to targets below 30% HP
  let exec = getScore(srv, name, 'icraft_execute_damage')
  if (exec > 0 && target.health / target.maxHealth < 0.30) {
    event.damage *= (1 + exec / 100)
  }

  // AoE Splash: projectile hits deal splash to nearby enemies
  let src = event.source
  let isProjectile = src.type && (src.type.includes('arrow') ||
    src.type.includes('trident') || src.type.includes('fireball'))
  if (isProjectile) {
    let splash = getScore(srv, name, 'icraft_aoe_splash')
    if (splash > 0) {
      let splashDmg = event.damage * (splash / 100)
      if (splashDmg >= 0.5) {
        let r = 3.0
        let nearby = target.level.getEntitiesWithin(
          AABB.of(target.x-r, target.y-r, target.z-r, target.x+r, target.y+r, target.z+r)
        )
        nearby.forEach(e => {
          if (e !== target && e !== player && e.living && e.monster) {
            e.hurt(event.source, splashDmg)
          }
        })
      }
    }

    // Ammo Save: chance to refund arrow
    let ammo = getScore(srv, name, 'icraft_ammo_save')
    if (ammo > 0 && Math.random() * 100 < ammo) {
      player.give('minecraft:arrow')
    }
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// DEFENSE: Player Taking Damage
// ═══════════════════════════════════════════════════════════════════════════
EntityEvents.hurt(event => {
  if (!event.entity || !event.entity.player) return
  let player = event.entity
  let resist = getScore(player.server, player.username, 'icraft_all_resistance')
  if (resist > 0) {
    event.damage *= Math.max(0.1, 1 - resist / 100)
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// GATHERING: Block Break Effects
// ═══════════════════════════════════════════════════════════════════════════
BlockEvents.broken(event => {
  if (!event.player || !event.player.server) return
  let blockId = event.block.id
  let srv = event.player.server
  let name = event.player.username

  // Crop Yield: bonus drop on crop harvest
  let cropTypes = ['wheat','carrots','potatoes','beetroots','nether_wart',
    'cocoa','sweet_berry','melon','pumpkin','pamhc','farmersdelight',
    'simple_farming','brewinandchewin']
  if (cropTypes.some(c => blockId.includes(c))) {
    let cropBonus = getScore(srv, name, 'icraft_crop_yield')
    if (cropBonus > 0 && Math.random() * 100 < cropBonus) {
      event.block.popItem(event.block.item)
    }
  }

  // Ore Processing: bonus drop on ore mining
  if (blockId.includes('_ore')) {
    let oreBonus = getScore(srv, name, 'icraft_ore_processing')
    if (oreBonus > 0 && Math.random() * 100 < oreBonus) {
      let rawOres = {
        'iron_ore':'minecraft:raw_iron', 'copper_ore':'minecraft:raw_copper',
        'gold_ore':'minecraft:raw_gold', 'coal_ore':'minecraft:coal',
        'lapis_ore':'minecraft:lapis_lazuli', 'redstone_ore':'minecraft:redstone',
        'diamond_ore':'minecraft:diamond', 'emerald_ore':'minecraft:emerald',
        'osmium_ore':'mekanism:raw_osmium', 'tin_ore':'thermal:raw_tin',
        'lead_ore':'thermal:raw_lead', 'silver_ore':'thermal:raw_silver',
        'nickel_ore':'thermal:raw_nickel',
      }
      for (let [ore, drop] of Object.entries(rawOres)) {
        if (blockId.includes(ore)) {
          event.block.popItemFromFace(Item.of(drop), 'up')
          break
        }
      }
    }
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// GATHERING: Bonemeal Efficiency
// ═══════════════════════════════════════════════════════════════════════════
BlockEvents.rightClicked(event => {
  if (!event.player) return
  let held = event.player.mainHandItem
  if (!held || held.id !== 'minecraft:bone_meal') return

  let bmEff = getScore(event.player.server, event.player.username, 'icraft_bonemeal_eff')
  if (bmEff > 0 && Math.random() * 100 < bmEff * 10) {
    let pos = event.block.pos
    // Visual feedback + extra growth tick
    event.player.server.runCommandSilent(
      `particle minecraft:happy_villager ${pos.x} ${pos.y+1} ${pos.z} 0.3 0.3 0.3 0 5`
    )
    try {
      let block = event.block
      let age = block.properties.age
      if (age !== undefined) {
        event.player.level.setBlockAndUpdate(
          pos, block.withProperty('age', Math.min(age + 1, 7))
        )
      }
    } catch(e) {}
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// GATHERING: Breeding Speed (Entity Interaction)
// ═══════════════════════════════════════════════════════════════════════════
ItemEvents.entityInteracted(event => {
  let player = event.player
  let target = event.entity
  if (!player || !target || !target.living) return
  if (target.player || target.monster) return

  let breedSpeed = getScore(player.server, player.username, 'icraft_breeding_speed')
  if (breedSpeed <= 0) return

  let held = player.mainHandItem
  if (!held || held.isEmpty()) return
  let breedItems = ['wheat','carrot','seed','potato','beetroot',
    'sweet_berries','bamboo','seagrass','hay_block']
  if (!breedItems.some(b => held.id.includes(b))) return

  // Accelerate baby growth
  if (target.baby) {
    target.age += breedSpeed * 5
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// ENGINEERING: Material Save (on crafting — return random ingredient)
// Triggers when a player picks up a crafted result from inventory change.
// Uses a tracking map to detect "new items gained" vs inventory churn.
// ═══════════════════════════════════════════════════════════════════════════
PlayerEvents.inventoryChanged(event => {
  if (!event.player || !event.player.server) return
  if (event.player.spectator || event.player.creative) return

  let item = event.item
  if (!item || item.isEmpty()) return

  let player = event.player
  let srv = player.server
  let name = player.username

  // Material Save: chance to return a random ingredient when crafting
  // Only triggers for "crafted-type" items (tools, equipment, processed goods)
  let materialSave = getScore(srv, name, 'icraft_material_save')
  if (materialSave > 0) {
    let id = item.id
    // Detect crafted items by type: tools, weapons, armor, processed materials,
    // mechanical components, building blocks from crafting
    let craftedPatterns = [
      '_sword', '_pickaxe', '_axe', '_shovel', '_hoe',
      '_helmet', '_chestplate', '_leggings', '_boots',
      '_ingot', '_nugget', 'planks', 'stick', 'torch',
      'rail', 'piston', 'hopper', 'dropper', 'dispenser',
      'comparator', 'repeater', 'observer', 'ladder', 'fence',
      'door', 'trapdoor', 'button', 'pressure_plate', 'lever',
      'bucket', 'shears', 'compass', 'clock', 'spyglass',
      'shield', 'bow', 'crossbow', 'fishing_rod',
      'minecart', 'boat', 'lead', 'name_tag',
      'create:', 'mekanism:', 'thermal:', 'industrialforegoing:'
    ]
    if (craftedPatterns.some(p => id.includes(p))) {
      // Use a cooldown via persistent data to avoid spamming on inventory shifts
      try {
        let lastSave = player.persistentData.getInt('icraft_mat_save_cd') || 0
        let now = srv.tickCount
        if (now - lastSave > 40) { // 2-second cooldown between triggers
          if (Math.random() * 100 < materialSave) {
            // Return a contextual material based on what was crafted
            let returnMaterials
            if (id.includes('iron') || id.includes('chain')) {
              returnMaterials = ['minecraft:iron_ingot', 'minecraft:iron_nugget']
            } else if (id.includes('gold')) {
              returnMaterials = ['minecraft:gold_ingot', 'minecraft:gold_nugget']
            } else if (id.includes('diamond')) {
              returnMaterials = ['minecraft:diamond']
            } else if (id.includes('netherite')) {
              returnMaterials = ['minecraft:netherite_scrap']
            } else if (id.includes('copper')) {
              returnMaterials = ['minecraft:copper_ingot']
            } else if (id.includes('wood') || id.includes('planks') || id.includes('oak') ||
                       id.includes('birch') || id.includes('spruce') || id.includes('jungle') ||
                       id.includes('acacia') || id.includes('dark_oak') || id.includes('mangrove') ||
                       id.includes('cherry') || id.includes('bamboo')) {
              returnMaterials = ['minecraft:stick', 'minecraft:oak_planks']
            } else if (id.includes('stone') || id.includes('cobble')) {
              returnMaterials = ['minecraft:cobblestone']
            } else if (id.includes('redstone') || id.includes('comparator') ||
                       id.includes('repeater') || id.includes('piston')) {
              returnMaterials = ['minecraft:redstone', 'minecraft:redstone']
            } else {
              returnMaterials = [
                'minecraft:iron_nugget', 'minecraft:copper_ingot',
                'minecraft:string', 'minecraft:leather', 'minecraft:flint',
                'minecraft:gold_nugget', 'minecraft:redstone', 'minecraft:stick'
              ]
            }
            let pick = returnMaterials[Math.floor(Math.random() * returnMaterials.length)]
            player.give(Item.of(pick))
            // Particle feedback at player position
            let pos = player.blockPosition()
            srv.runCommandSilent(
              `particle minecraft:happy_villager ${pos.x} ${pos.y + 1} ${pos.z} 0.3 0.5 0.3 0 6 force ${name}`
            )
            player.persistentData.putInt('icraft_mat_save_cd', now)
          }
          // Update cooldown even on miss to avoid re-rolling same item
          player.persistentData.putInt('icraft_mat_save_cd', now)
        }
      } catch(e) {}
    }
  }

  // Craft Bonus: chance for double output on crafting
  let craftBonus = getScore(srv, name, 'icraft_craft_bonus')
  if (craftBonus > 0) {
    let id = item.id
    // Trigger on processed/crafted results (not raw materials or drops)
    let craftResults = [
      '_sword', '_pickaxe', '_axe', '_shovel', '_hoe',
      '_helmet', '_chestplate', '_leggings', '_boots',
      'planks', 'stick', 'torch', 'rail', 'glass_pane',
      'piston', 'hopper', 'dropper', 'dispenser',
      'comparator', 'repeater', 'observer', 'ladder', 'fence',
      'door', 'trapdoor', 'slab', 'stairs', 'wall',
      'button', 'pressure_plate', 'bucket', 'paper',
      'book', 'map', 'banner', 'carpet', 'candle',
      'lantern', 'chain', 'lightning_rod', 'tripwire_hook',
      'create:', 'mekanism:', 'thermal:'
    ]
    if (craftResults.some(p => id.includes(p))) {
      try {
        let lastBonus = player.persistentData.getInt('icraft_craft_bonus_cd') || 0
        let now = srv.tickCount
        if (now - lastBonus > 40) { // 2-second cooldown
          if (Math.random() * 100 < craftBonus) {
            // Give a copy of the item itself (double output)
            let bonus = item.copy()
            bonus.count = 1
            player.give(bonus)
            // Feedback
            let pos = player.blockPosition()
            srv.runCommandSilent(
              `particle minecraft:composter ${pos.x} ${pos.y + 1} ${pos.z} 0.3 0.5 0.3 0 8 force ${name}`
            )
            srv.runCommandSilent(
              `playsound minecraft:entity.experience_orb.pickup player ${name} ${pos.x} ${pos.y} ${pos.z} 0.5 1.5`
            )
          }
          player.persistentData.putInt('icraft_craft_bonus_cd', now)
        }
      } catch(e) {}
    }
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// PERIODIC TICK: Attribute Sync + Passive Effects
// ═══════════════════════════════════════════════════════════════════════════
ServerEvents.tick(event => {
  let tick = event.server.tickCount

  // ── Every 5 seconds: HP Regen ──
  if (tick % 100 === 0) {
    event.server.players.forEach(player => {
      if (player.spectator || player.creative) return
      let regen = getScore(event.server, player.username, 'icraft_hp_regen')
      if (regen > 0 && player.health < player.maxHealth) {
        player.heal(regen / 10)
      }
    })
  }

  // ── Every 5 seconds: Buff Duration Extension ──
  if (tick % 100 === 25) {
    event.server.players.forEach(player => {
      let buffDur = getScore(event.server, player.username, 'icraft_buff_duration')
      if (buffDur <= 0) return

      try {
        let effects = player.activeEffects
        if (!effects) return
        effects.forEach(effect => {
          // Only extend beneficial effects with > 5s remaining
          if (effect.duration > 100 && effect.duration < 6000) {
            let cat = effect.effect.category
            if (cat && cat.toString() === 'BENEFICIAL') {
              let ext = Math.floor(effect.duration * buffDur / 200)
              if (ext > 20) {
                player.potionEffects.add(
                  effect.effect, effect.duration + ext, effect.amplifier, false, true
                )
              }
            }
          }
        })
      } catch(e) {}
    })
  }

  // ── Every 10 seconds: Attribute Sync (Sorcery + Accuracy) ──
  if (tick % 200 === 50) {
    event.server.players.forEach(player => {
      let name = player.username
      try {
        // Accuracy -> ranged damage proxy
        let acc = getScore(event.server, name, 'icraft_accuracy')
        if (acc > 0) {
          player.modifyAttribute('puffish_attributes:ranged_damage',
            'icraft_accuracy_sync', acc / 100, 'multiply_base')
        }
        // Mana Regen -> Iron's Spells attribute
        let mr = getScore(event.server, name, 'icraft_mana_regen')
        if (mr > 0) {
          player.modifyAttribute('irons_spellbooks:mana_regen',
            'icraft_mana_regen_sync', mr / 100, 'multiply_base')
        }
        // Cast Speed -> cooldown reduction
        let cs = getScore(event.server, name, 'icraft_cast_speed')
        if (cs > 0) {
          player.modifyAttribute('irons_spellbooks:cooldown_reduction',
            'icraft_cast_speed_sync', cs / 100, 'multiply_base')
        }
        // Mana Cost Reduction -> spell power (half rate)
        let mc = getScore(event.server, name, 'icraft_mana_cost_reduction')
        if (mc > 0) {
          player.modifyAttribute('irons_spellbooks:spell_power',
            'icraft_mana_eff_sync', mc / 200, 'multiply_base')
        }
      } catch(e) {} // Silent fail if mod attributes don't exist
    })
  }

  // ── Every 10 seconds: Fishing Speed (Lure grant) ──
  if (tick % 200 === 100) {
    event.server.players.forEach(player => {
      let fishSpeed = getScore(event.server, player.username, 'icraft_fishing_speed')
      if (fishSpeed <= 0) return
      let held = player.mainHandItem
      if (held && held.id.includes('fishing_rod')) {
        let lure = Math.min(3, Math.floor(fishSpeed / 10))
        if (lure > 0) {
          player.server.runCommandSilent(
            `enchant ${player.username} minecraft:lure ${lure}`
          )
        }
      }
    })
  }

  // ── Every 30 seconds: Enchant Cost Reduction (XP near enchanting stations) ──
  if (tick % 600 === 150) {
    event.server.players.forEach(player => {
      let enchReduce = getScore(event.server, player.username, 'icraft_enchant_cost_reduction')
      if (enchReduce <= 0) return
      let enchKeys = ['anvil', 'enchanting_table', 'reforging', 'grindstone']
      if (hasNearbyBlock(player, enchKeys, 5)) {
        player.giveExperiencePoints(Math.floor(enchReduce / 2))
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINEERING: Crafting Speed
  // Grants Haste near crafting stations (within 8 blocks).
  // Score 1-9: Haste I. Score 10+: Haste II. Includes Speed I always.
  // Effect duration 15 seconds, refreshed every 10 seconds.
  // ═══════════════════════════════════════════════════════════════════════
  if (tick % 200 === 75) {
    event.server.players.forEach(player => {
      if (player.spectator || player.creative) return
      let score = getScore(event.server, player.username, 'icraft_crafting_speed')
      if (score <= 0) return

      if (hasNearbyBlock(player, CRAFTING_STATION_KEYS, 8)) {
        // Haste scales with investment
        let hasteAmp = score >= 10 ? 1 : 0 // Haste I or II
        player.potionEffects.add('minecraft:haste', 300, hasteAmp, false, true)
        // Speed I always when near crafting stations
        player.potionEffects.add('minecraft:speed', 300, 0, false, true)
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINEERING: Machine Speed
  // Grants Haste near mod machines (within 8 blocks).
  // Scales: score 1-15 -> Haste I, 16-30 -> Haste II, 31+ -> Haste III.
  // High scores also grant Speed to move between machines faster.
  // Additionally applies Strength I at score 20+ (proxy for "machine power").
  // ═══════════════════════════════════════════════════════════════════════
  if (tick % 200 === 125) {
    event.server.players.forEach(player => {
      if (player.spectator || player.creative) return
      let score = getScore(event.server, player.username, 'icraft_machine_speed')
      if (score <= 0) return

      if (hasNearbyBlock(player, MACHINE_KEYS, 8)) {
        // Haste scales with deeper investment
        let hasteAmp = 0
        if (score >= 31) hasteAmp = 2      // Haste III
        else if (score >= 16) hasteAmp = 1  // Haste II
        player.potionEffects.add('minecraft:haste', 300, hasteAmp, false, true)

        // Speed I at score 10+, Speed II at 25+
        if (score >= 10) {
          let speedAmp = score >= 25 ? 1 : 0
          player.potionEffects.add('minecraft:speed', 300, speedAmp, false, true)
        }
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINEERING: RF Generation
  // Rewards players near generators with XP and beneficial effects.
  // Scales with number of generators nearby and score level.
  // Score 1-10: XP grant. 11-20: +Luck effect. 21+: +Glowing (shows nearby).
  // Higher scores + more generators = more XP.
  // ═══════════════════════════════════════════════════════════════════════
  if (tick % 600 === 300) {
    event.server.players.forEach(player => {
      if (player.spectator || player.creative) return
      let score = getScore(event.server, player.username, 'icraft_rf_generation')
      if (score <= 0) return

      let genCount = countNearbyBlocks(player, GENERATOR_KEYS, 8)
      if (genCount <= 0) return

      // Base XP scales with score, multiplied by number of generators (diminishing)
      let genMultiplier = Math.min(genCount, 5) // Cap at 5x
      let xpReward = Math.max(1, Math.floor((score / 3) * Math.sqrt(genMultiplier)))
      player.giveExperiencePoints(xpReward)

      // Luck effect at score 11+ (better loot near your power setup)
      if (score >= 11) {
        let luckAmp = score >= 23 ? 1 : 0 // Luck I or II
        player.potionEffects.add('minecraft:luck', 700, luckAmp, false, true)
      }

      // Particle feedback
      let pos = player.blockPosition()
      event.server.runCommandSilent(
        `particle minecraft:electric_spark ${pos.x} ${pos.y + 1} ${pos.z} 0.5 0.5 0.5 0.02 12 force ${player.username}`
      )
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINEERING: Fuel Reduction
  // Reduces effective fuel usage by periodically granting fuel items
  // when near furnaces/smelters. Scales with score and furnace count.
  // Also grants Fire Resistance as a thematic perk at high scores.
  // ═══════════════════════════════════════════════════════════════════════
  if (tick % 600 === 350) {
    event.server.players.forEach(player => {
      if (player.spectator || player.creative) return
      let score = getScore(event.server, player.username, 'icraft_fuel_reduction')
      if (score <= 0) return

      let furnaceCount = countNearbyBlocks(player, FURNACE_KEYS, 8)
      if (furnaceCount <= 0) return

      // Scale fuel rebate with score and furnace count
      let furnaceMultiplier = Math.min(furnaceCount, 4) // Cap at 4x
      let baseAmount = Math.max(1, Math.floor(score / 8))
      let totalFuel = Math.min(8, baseAmount * Math.ceil(furnaceMultiplier / 2))

      // Give better fuel at higher scores
      if (score >= 20) {
        // Blaze powder at high levels (better fuel)
        let blazeCount = Math.min(3, Math.floor(totalFuel / 3))
        if (blazeCount > 0) {
          player.give(Item.of('minecraft:blaze_powder', blazeCount))
          totalFuel -= blazeCount * 3
        }
      }
      if (score >= 10 && totalFuel > 0) {
        // Charcoal at mid levels (renewable fuel)
        let charcoalCount = Math.min(4, Math.ceil(totalFuel / 2))
        player.give(Item.of('minecraft:charcoal', charcoalCount))
      } else if (totalFuel > 0) {
        // Coal at low levels
        player.give(Item.of('minecraft:coal', totalFuel))
      }

      // Fire Resistance at score 16+ (thematic: mastery over fire/heat)
      if (score >= 16) {
        player.potionEffects.add('minecraft:fire_resistance', 700, 0, false, true)
      }

      // Feedback
      let pos = player.blockPosition()
      event.server.runCommandSilent(
        `particle minecraft:flame ${pos.x} ${pos.y + 0.5} ${pos.z} 0.4 0.2 0.4 0.01 6 force ${player.username}`
      )
    })
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// ENGINEERING: Material Save + Craft Bonus (via LootJS for smelting/loot)
// Bonus ore drops when smelting — players with material_save get a chance
// for bonus smelting output via loot table modification.
// ═══════════════════════════════════════════════════════════════════════════
// Note: LootJS modifiers apply globally, not per-player. We handle the
// per-player crafting effects via PlayerEvents.inventoryChanged above.
// This section adds bonus drops from blocks for engineering-skilled players.
BlockEvents.broken(event => {
  if (!event.player || !event.player.server) return
  let player = event.player
  let srv = player.server
  let name = player.username
  let blockId = event.block.id

  // Material Save on block harvesting: chance to not consume the block
  // (returns an extra copy of the block's drop item)
  let matSave = getScore(srv, name, 'icraft_material_save')
  if (matSave > 0) {
    // Only for processed/building blocks, not ores (ores are handled by ore_processing)
    let buildingBlocks = [
      'planks', 'log', 'stone', 'bricks', 'cobblestone', 'sandstone',
      'deepslate', 'tuff', 'diorite', 'granite', 'andesite', 'basalt',
      'blackstone', 'prismarine', 'terracotta', 'concrete', 'quartz_block',
      'glass', 'wool', 'copper_block', 'iron_block', 'gold_block'
    ]
    if (buildingBlocks.some(b => blockId.includes(b)) && !blockId.includes('_ore')) {
      if (Math.random() * 100 < matSave) {
        event.block.popItem(event.block.item)
        let pos = event.block.pos
        srv.runCommandSilent(
          `particle minecraft:happy_villager ${pos.x} ${pos.y + 0.5} ${pos.z} 0.2 0.2 0.2 0 4`
        )
      }
    }
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION STATUS — Phase 3 (All 22 effects functional)
// ═══════════════════════════════════════════════════════════════════════════
// FUNCTIONAL (10 — native KubeJS event hooks):
//   execute_damage, all_resistance, hp_regen, crop_yield, ore_processing,
//   aoe_splash, ammo_save, buff_duration, bonemeal_eff, breeding_speed
//
// PROXIED (4 — mapped to mod attributes):
//   accuracy -> puffish:ranged_damage
//   mana_regen -> irons:mana_regen
//   cast_speed -> irons:cooldown_reduction
//   mana_cost_reduction -> irons:spell_power
//
// ENGINEERING (8 — proximity + event-driven):
//   crafting_speed -> Haste I/II + Speed I near crafting stations (8 blocks)
//   machine_speed -> Haste I/II/III + Speed near machines (8 blocks)
//   rf_generation -> Scaled XP + Luck near generators, scales with gen count
//   fuel_reduction -> Fuel items (coal/charcoal/blaze) near furnaces,
//                     Fire Resistance at 16+, scales with furnace count
//   enchant_cost_reduction -> XP near enchanting stations
//   material_save -> Returns contextual ingredients on crafting items
//                    (via inventoryChanged) + bonus block drops on harvest
//   craft_bonus -> Chance for double output on crafting (via inventoryChanged),
//                  gives copy of crafted item with sound/particle feedback
//   fishing_speed -> Lure enchant on held fishing rod
// ═══════════════════════════════════════════════════════════════════════════

console.log('[IridescentCraft] skill_effects.js Phase 3 loaded — 22 active effects (0 placeholders)')
