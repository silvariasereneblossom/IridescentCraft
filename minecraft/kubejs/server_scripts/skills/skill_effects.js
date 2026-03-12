// =============================================================================
// IridescentCraft — Pufferfish Skills Command Reward Bridge (Phase 2)
// File: kubejs/server_scripts/skills/skill_effects.js
//
// Reads scoreboard values set by Pufferfish Skills command rewards and
// applies gameplay effects via KubeJS event hooks.
//
// 59 command reward nodes across 4 trees:
//   Sorcery (10), Marksman (11), Gathering (17), Engineering (27)
// =============================================================================

ServerEvents.loaded(event => {
  ;['icraft_mana_regen','icraft_cast_speed','icraft_mana_cost_reduction',
    'icraft_buff_duration','icraft_accuracy','icraft_execute_damage',
    'icraft_ammo_save','icraft_aoe_splash','icraft_crop_yield',
    'icraft_ore_processing','icraft_fishing_speed','icraft_breeding_speed',
    'icraft_bonemeal_eff','icraft_crafting_speed','icraft_material_save',
    'icraft_machine_speed','icraft_craft_bonus','icraft_enchant_cost_reduction',
    'icraft_rf_generation','icraft_fuel_reduction','icraft_all_resistance',
    'icraft_hp_regen','icraft_healing_power'
  ].forEach(obj => event.server.runCommandSilent(`scoreboard objectives add ${obj} dummy`))
})

function getScore(server, playerName, objective) {
  try {
    let obj = server.scoreboard.getObjective(objective)
    if (!obj) return 0
    return server.scoreboard.getOrCreatePlayerScore(playerName, obj).score
  } catch(e) { return 0 }
}


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
// PERIODIC TICK: Attribute Sync + Passive Effects
// Runs every 10 seconds per player
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
        // Accuracy → ranged damage proxy
        let acc = getScore(event.server, name, 'icraft_accuracy')
        if (acc > 0) {
          player.modifyAttribute('puffish_attributes:ranged_damage',
            'icraft_accuracy_sync', acc / 100, 'multiply_base')
        }
        // Mana Regen → Iron's Spells attribute
        let mr = getScore(event.server, name, 'icraft_mana_regen')
        if (mr > 0) {
          player.modifyAttribute('irons_spellbooks:mana_regen',
            'icraft_mana_regen_sync', mr / 100, 'multiply_base')
        }
        // Cast Speed → cooldown reduction
        let cs = getScore(event.server, name, 'icraft_cast_speed')
        if (cs > 0) {
          player.modifyAttribute('irons_spellbooks:cooldown_reduction',
            'icraft_cast_speed_sync', cs / 100, 'multiply_base')
        }
        // Mana Cost Reduction → spell power (half rate)
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

  // ── Every 30 seconds: Enchant Cost Reduction (XP near stations) ──
  if (tick % 600 === 150) {
    event.server.players.forEach(player => {
      let enchReduce = getScore(event.server, player.username, 'icraft_enchant_cost_reduction')
      if (enchReduce <= 0) return

      let pos = player.blockPosition()
      let nearStation = false
      for (let dx = -3; dx <= 3 && !nearStation; dx++) {
        for (let dz = -3; dz <= 3 && !nearStation; dz++) {
          let block = player.level.getBlock(pos.x + dx, pos.y, pos.z + dz)
          if (block && (block.id.includes('anvil') ||
              block.id === 'minecraft:enchanting_table' ||
              block.id.includes('reforging'))) {
            nearStation = true
          }
        }
      }
      if (nearStation) {
        player.giveExperiencePoints(Math.floor(enchReduce / 2))
      }
    })
  }
})


// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION STATUS
// ═══════════════════════════════════════════════════════════════════════════
// ✅ FUNCTIONAL (10): execute_damage, all_resistance, hp_regen, crop_yield,
//    ore_processing, aoe_splash, ammo_save, buff_duration, bonemeal_eff,
//    breeding_speed
// ⚡ PROXIED (4): accuracy→ranged_damage, mana_regen→irons:mana_regen,
//    cast_speed→irons:cooldown_reduction, mana_cost→irons:spell_power
// 🔶 APPROXIMATED (2): fishing_speed→Lure enchant, enchant_cost→XP grant
// 📊 INFORMATIONAL (6): crafting_speed, machine_speed, rf_generation,
//    fuel_reduction, material_save, craft_bonus
//    (Scoreboard values tracked; actual effect needs per-mod config or
//     Forge events not accessible via KubeJS)
// ═══════════════════════════════════════════════════════════════════════════

console.log('[IridescentCraft] skill_effects.js Phase 2 loaded — 16 active effects, 6 informational')
