// @file kubejs/server_scripts/enchantments/enchant_effects.js
// @events BlockEvents.broken, hurt, tick.server
// =============================================================================
// IridescentCraft — Custom Enchantment Effects
// File: kubejs/server_scripts/enchantments/enchant_effects.js
//
// Design Doc Part VI: 24 Custom Enchantments (+5 planetary)
// Registration in startup_scripts/custom_enchantments.js
//
// Effects are applied via the DamageModifierRegistry (hurt), the tick master
// and BlockEvents.
//
// 2026-10-10 revival. NONE of the 29 enchantments had ever done anything:
//   * every level lookup returned 0 -- `entity.getItemSlot(slot)` does not
//     exist (LivingEntity has getItemBySlot) and `item.enchantments` is a
//     java.util.Map with no getLevel(); both threw inside a catch-all. Levels
//     now come from EnchantmentHelper via global.icraft.core.
//   * the weapon handler also returned on its first line
//     (`event.source.entity`), Boss Ward read `source.entity`, Adaptive keyed
//     on `source.type` (a function object).
// First-run defects fixed while reviving (none of this could be seen before):
//   * Lumberjack passed a plain {x,y,z} object to destroyBlock(): KubeJS turns
//     that into BlockPos.ZERO, so it would have broken the block at 0,0,0 once
//     per log while duplicating the logs it left standing. It now destroys the
//     real positions and lets the blocks drop themselves.
//   * Prospector popped the ORE BLOCK (place it, mine it again, repeat). It
//     now repeats the block's real drops and never the block itself.
//   * Magnetism called setDeltaMovement(x, y, z); scripts have setMotion().
//   * Vitality / Steadfast / Quick Draw / Convergence / Momentum added an
//     attribute modifier and never took it off again (unequip = kept bonus).
//   * Adaptive's decay removed keys from the set it was iterating.
//   * RF Capacitance looped to `inventory.size` (undefined) and read
//     `inventory.get(i)` (no such method).
//   * isBoss() matched substrings ('golem', 'guardian', 'ghast', 'storm', ...)
//     and so counted iron golems, guardians and ghasts; it is the pack's boss
//     id list now (global.icraft.core.isBoss).
//
// Whole file is one IIFE (body left at column 0); nothing here is used by
// another script.
// =============================================================================

;(function () {
// Nothing below works without the core library. A missing one is said ONCE, for
// every script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
if (!icraft.lib.need('core', 'enchantments/enchant_effects')) return
var core = global.icraft.core

// ─── Helpers ───

// Highest level across armor + both hands
var getEnchLevel = function (entity, enchId) { return core.gearEnchMax(entity, enchId) }
// Level on the main-hand item
var getWeaponEnchLevel = function (entity, enchId) { return core.heldEnchLevel(entity, enchId) }
// Sum of the levels across all armor pieces
var getArmorEnchTotal = function (entity, enchId) { return core.armorEnchTotal(entity, enchId) }
// entity or registry id: the core's own function (the boss registry), not a wrapper around it
var isBoss = core.isBoss

var PLANETS = {
  'ad_astra:moon': true, 'ad_astra:mars': true, 'ad_astra:mercury': true,
  'ad_astra:venus': true, 'ad_astra:glacio': true
}
var dimOf = function (entity) {
  try { return String(entity.level.dimension) } catch (e) { return '' }
}

// Set (value != 0) or remove (value == 0) one keyed attribute modifier.
var setMod = function (player, attribute, key, value, operation) {
  try {
    if (value) player.modifyAttribute(attribute, key, value, operation)
    else player.removeAttribute(attribute, key)
  } catch (e) {
    core.warnOnce('ench.mod:' + key, '[enchant_effects] attribute modifier ' + key + ' on ' + attribute + ' failed: ' + e)
  }
}

var countHostilesNear = function (player, r) {
  var count = 0
  try {
    player.level.getEntitiesWithin(
      AABB.of(player.x - r, player.y - r, player.z - r, player.x + r, player.y + r, player.z + r)
    ).forEach(function (e) {
      if (e !== player && e.living && e.monster) count++
    })
  } catch (e) {}
  return count
}

var bossNear = function (player, r) {
  var found = false
  try {
    player.level.getEntitiesWithin(
      AABB.of(player.x - r, player.y - r, player.z - r, player.x + r, player.y + r, player.z + r)
    ).forEach(function (e) {
      if (!found && e.living && isBoss(e)) found = true
    })
  } catch (e) {}
  return found
}


// ==========================================================================
// ███ DAMAGE DEALT BY PLAYER (weapon enchants) — DamageModifierRegistry ███
// ==========================================================================
core.onHurt('icraft.enchants.weapon', function (event, ctx) {
  var player = ctx.attacker
  var target = ctx.victim
  if (!target) return
  // Every enchant below sits on the main-hand item: no enchanted weapon, no work.
  var weapon = player.mainHandItem
  if (!weapon || weapon.isEmpty() || !weapon.isEnchanted()) return
  var data = player.persistentData
  var targetMax = core.finite(target.maxHealth, 0)

  // ── Titan Slayer: +4%/level per 100 max HP of the target (cap +20%/level) ──
  var titan = core.enchLevel(weapon, 'icraft:titan_slayer')
  if (titan > 0 && targetMax > 100) {
    var bonus = 1 + (titan * 0.04) * (targetMax / 100)
    event.amount = event.amount * Math.min(bonus, 1 + titan * 0.20)
  }

  // ── Adrenaline: +6%/level below 30% HP ──
  var adren = core.enchLevel(weapon, 'icraft:adrenaline')
  if (adren > 0 && player.maxHealth > 0 && player.health / player.maxHealth < 0.30) {
    event.amount = event.amount * (1 + adren * 0.06)
  }

  // ── Crowd Control: +5%/level per extra hostile within 3 blocks (max 5) ──
  var crowd = core.enchLevel(weapon, 'icraft:crowd_control')
  if (crowd > 0) {
    var nearbyCount = countHostilesNear(player, 3.0)
    if (nearbyCount > 1) {
      event.amount = event.amount * (1 + Math.min(nearbyCount - 1, 5) * crowd * 0.05)
    }
  }

  // ── Nemesis: stacking +3% per hit against the same boss type ──
  var nemesis = core.enchLevel(weapon, 'icraft:nemesis')
  if (nemesis > 0 && isBoss(target)) {
    var nemesisKey = 'icraft_nemesis_' + core.entityId(target).replace(':', '_')
    var stacks = data.contains(nemesisKey) ? data.getInt(nemesisKey) : 0
    stacks = Math.min(stacks + 1, 10 * nemesis)
    data.putInt(nemesisKey, stacks)
    event.amount = event.amount * (1 + stacks * 0.03)
  }

  // ── Momentum: +2% attack speed per stack (5 stacks/level, decays after 5 s) ──
  var momentum = core.enchLevel(weapon, 'icraft:momentum')
  if (momentum > 0) {
    var momStacks = data.contains('icraft_momentum') ? data.getInt('icraft_momentum') : 0
    momStacks = Math.min(momStacks + 1, 5 * momentum)
    data.putInt('icraft_momentum', momStacks)
    data.putLong('icraft_momentum_time', core.now(player))
    setMod(player, 'minecraft:generic.attack_speed', 'icraft_momentum_bonus', momStacks * 0.02, 'multiply_base')
  }

  // ── Primal Force: +3%/level per 5 saturation (cap +15%/level) ──
  var primal = core.enchLevel(weapon, 'icraft:primal_force')
  if (primal > 0) {
    var saturation = 0
    try { saturation = core.finite(player.foodData.saturationLevel, 0) } catch (e) {}
    var pbonus = primal * 0.03 * (saturation / 5.0)
    event.amount = event.amount * (1 + Math.min(pbonus, primal * 0.15))
  }

  // ── Mana Temper: +8%/level with a magic item in the off hand ──
  var manaTemp = core.enchLevel(weapon, 'icraft:mana_temper')
  if (manaTemp > 0) {
    var offhand = player.offHandItem
    if (offhand && !offhand.isEmpty()) {
      var offId = String(offhand.id)
      if (offId.indexOf('spell') >= 0 || offId.indexOf('staff') >= 0 || offId.indexOf('wand') >= 0 ||
          offId.indexOf('source') >= 0 || offId.indexOf('mana') >= 0) {
        event.amount = event.amount * (1 + manaTemp * 0.08)
      }
    }
  }
}, 'attackerPlayer')


// ==========================================================================
// ███ DAMAGE TAKEN BY PLAYER (armor enchants) — DamageModifierRegistry ███
// ==========================================================================
var ENERGY_WORDS = ['energy_cube', 'flux', 'capacitor', 'battery', 'cell']
var carriesEnergyItem = function (player) {
  try {
    var inv = player.inventory
    var size = inv.containerSize
    for (var i = 0; i < size; i++) {
      var item = inv.getStackInSlot(i)
      if (!item || item.isEmpty()) continue
      var id = String(item.id)
      for (var w = 0; w < ENERGY_WORDS.length; w++) {
        if (id.indexOf(ENERGY_WORDS[w]) >= 0) return true
      }
    }
  } catch (e) {}
  return false
}

var ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet']
// the ENCHANTED armour pieces of an entity (unenchanted ones cannot matter here)
var enchantedArmor = function (entity) {
  var out = []
  for (var i = 0; i < ARMOR_SLOTS.length; i++) {
    try {
      var stack = entity.getEquipment(ARMOR_SLOTS[i])
      if (stack && !stack.isEmpty() && stack.isEnchanted()) out.push(stack)
    } catch (e) {}
  }
  return out
}
var totalOn = function (stacks, enchId) {
  var total = 0
  for (var i = 0; i < stacks.length; i++) total += core.enchLevel(stacks[i], enchId)
  return total
}

core.onHurt('icraft.enchants.armor', function (event, ctx) {
  var player = ctx.victim
  var source = ctx.source
  // The armour is read once per hit; with no enchanted piece and no block in
  // progress (Phalanx may sit on a held shield) there is nothing to do.
  var armor = enchantedArmor(player)
  var blocking = player.isBlocking()
  if (armor.length === 0 && !blocking) return
  var data = player.persistentData

  // ── Heatward: -8% fire damage per level ──
  if (core.isFire(source)) {
    var heat = totalOn(armor, 'icraft:heatward')
    if (heat > 0) event.amount = event.amount * Math.max(0.1, 1 - heat * 0.08)
  }

  // ── Voidward: -8% void / wither damage per level ──
  if (core.isVoid(source) || core.isWither(source)) {
    var voidw = totalOn(armor, 'icraft:voidward')
    if (voidw > 0) event.amount = event.amount * Math.max(0.1, 1 - voidw * 0.08)
  }

  // ── Depth Strider (custom): -10% damage per level below Y=0 ──
  if (player.y < 0) {
    var depth = totalOn(armor, 'icraft:depthstrider_custom')
    if (depth > 0) event.amount = event.amount * Math.max(0.2, 1 - depth * 0.10)
  }

  // ── Boss Ward: -5% boss damage per level ──
  var attacker = ctx.attacker
  if (attacker && isBoss(attacker)) {
    var ward = totalOn(armor, 'icraft:boss_ward')
    if (ward > 0) event.amount = event.amount * Math.max(0.2, 1 - ward * 0.05)
  }

  // ── Adaptive: from the 3rd hit of one damage type, -3%/level per hit (cap 30%) ──
  var adaptive = totalOn(armor, 'icraft:adaptive')
  if (adaptive > 0 && source) {
    var dmgType = core.dmgId(source) || 'generic'
    var adaptKey = 'icraft_adapt_' + dmgType.replace(':', '_')
    var hits = data.contains(adaptKey) ? data.getInt(adaptKey) : 0
    hits++
    data.putInt(adaptKey, Math.min(hits, 10))
    if (hits >= 3) {
      event.amount = event.amount * (1 - Math.min((hits - 2) * adaptive * 0.03, 0.30))
    }
  }

  // ── Phalanx: -6% per level while blocking ──
  if (blocking) {
    var phalanx = getEnchLevel(player, 'icraft:phalanx')
    if (phalanx > 0) event.amount = event.amount * Math.max(0.1, 1 - phalanx * 0.06)
  }

  // ── Last Stand: survive a lethal hit at 1 HP (5 min cooldown) ──
  if (event.amount >= player.health) {
    var lastStand = totalOn(armor, 'icraft:last_stand')
    if (lastStand > 0) {
      var now = core.now(player)
      var lastUsed = data.contains('icraft_last_stand_time') ? Number(data.getLong('icraft_last_stand_time')) : -1
      if (lastUsed < 0 || now - lastUsed > 6000 || now < lastUsed) {
        event.amount = Math.max(0, player.health - 1.0)
        data.putLong('icraft_last_stand_time', now)
        player.potionEffects.add('minecraft:absorption', 100, 1, false, true)
        player.potionEffects.add('minecraft:resistance', 40, 2, false, true)
        player.tell('§6§lLast Stand activated! §r§7(5 min cooldown)')
      }
    }
  }

  // ── RF Capacitance: -4% per level while carrying an energy item ──
  var rfCap = totalOn(armor, 'icraft:rf_capacitance')
  if (rfCap > 0 && carriesEnergyItem(player)) {
    event.amount = event.amount * Math.max(0.3, 1 - rfCap * 0.04)
  }
}, 'victimPlayer')


// ==========================================================================
// ███ BLOCK BREAK EFFECTS (tool enchants) ███
// ==========================================================================
var isLogId = function (id) { return id.indexOf('log') >= 0 || id.indexOf('stem') >= 0 }
// 6 directions minus straight down, plus the 4 diagonals up
var FELL_OFFSETS = [
  [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]
]

BlockEvents.broken(icraft.guard('enchantments/enchant_effects', 'BlockEvents.broken', function (event) {
  var player = event.player
  if (!player) return
  var held = player.mainHandItem
  if (!held || held.isEmpty() || !held.isEnchanted()) return
  var block = event.block
  var blockId = String(block.id)

  // ── Prospector: Bonus ore drops (stacks with Fortune) ──
  if (blockId.indexOf('_ore') >= 0) {
    var prosp = core.enchLevel(held, 'icraft:prospector')
    if (prosp > 0 && Math.random() < prosp * 0.10) { // 10% per level
      // Double the normal drop: the block's own loot for this tool, once more.
      // Never the ore block itself (a Silk Touch drop would be a re-minable dupe).
      try {
        var drops = block.getDrops(player, held)
        if (drops) {
          drops.forEach(function (drop) {
            if (drop && !drop.isEmpty() && String(drop.id) !== blockId) block.popItem(drop)
          })
        }
      } catch (e) {
        core.warnOnce('ench.prospector', '[enchant_effects] Prospector bonus drop threw: ' + e)
      }
    }
  }

  // ── Lumberjack: Fell connected logs (up to level * 16 blocks) ──
  if (isLogId(blockId)) {
    var lj = core.enchLevel(held, 'icraft:lumberjack')
    if (lj > 0) {
      try {
        var maxBlocks = lj * 16
        var level = player.level
        var origin = block.pos
        var ox = origin.x, oy = origin.y, oz = origin.z
        var toBreak = []          // BlockContainerJS of every connected log but the origin
        var checked = {}
        var queue = [[ox, oy, oz]]
        var head = 0
        while (head < queue.length && toBreak.length < maxBlocks) {
          var cur = queue[head++]
          var key = cur[0] + ',' + cur[1] + ',' + cur[2]
          if (checked[key]) continue
          checked[key] = true
          var isOrigin = (cur[0] === ox && cur[1] === oy && cur[2] === oz)
          var here = isOrigin ? block : level.getBlock(cur[0], cur[1], cur[2])
          if (!here || !isLogId(String(here.id))) continue
          if (!isOrigin) toBreak.push(here)
          for (var d = 0; d < FELL_OFFSETS.length; d++) {
            queue.push([cur[0] + FELL_OFFSETS[d][0], cur[1] + FELL_OFFSETS[d][1], cur[2] + FELL_OFFSETS[d][2]])
          }
        }
        // Break them for real (each drops its own loot once). destroyBlock does
        // not post a block-break event, so this cannot re-enter this handler.
        for (var b = 0; b < toBreak.length; b++) {
          level.destroyBlock(toBreak[b].pos, true, player)
        }
      } catch (e) {
        core.warnOnce('ench.lumberjack', '[enchant_effects] Lumberjack threw: ' + e)
      }
    }
  }
}))


// ==========================================================================
// ███ PERIODIC TICK EFFECTS ███
// ==========================================================================
var eachPlayer = function (event, label, fn) {
  event.server.players.forEach(function (player) {
    try { fn(player) } catch (e) {
      core.warnOnce('ench.tick:' + label, '[enchant_effects] ' + label + ' tick threw: ' + e)
    }
  })
}

global.tick_enchantPeriodicEffects = function (event) {
  var tick = event.server.tickCount

  // ── Every 2 seconds: Vitality HP bonus (+2 HP per total level across armor) ──
  if (tick % 40 === 0) {
    eachPlayer(event, 'vitality', function (player) {
      var vit = getArmorEnchTotal(player, 'icraft:vitality')
      setMod(player, 'minecraft:generic.max_health', 'icraft_vitality_bonus', vit * 2, 'addition')
    })
  }

  // ── Every 2 seconds: Magnetism pickup range ──
  if (tick % 40 === 10) {
    eachPlayer(event, 'magnetism', function (player) {
      var mag = getArmorEnchTotal(player, 'icraft:magnetism')
      if (mag <= 0) return

      var range = 2.0 + mag * 1.5 // Base 2 + 1.5 per level
      player.level.getEntitiesWithin(
        AABB.of(player.x - range, player.y - range, player.z - range,
                player.x + range, player.y + range, player.z + range)
      ).forEach(function (e) {
        if (core.entityId(e) !== 'minecraft:item' || !(e.age > 10)) return
        // Pull item toward player
        var dx = player.x - e.x
        var dy = player.y - e.y
        var dz = player.z - e.z
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (dist > 0.5 && dist < range) {
          e.setMotion(dx / dist * 0.3, dy / dist * 0.3 + 0.05, dz / dist * 0.3)
        }
      })
    })
  }

  // ── Every 5 seconds: Momentum decay (5 s without a hit) ──
  if (tick % 100 === 0) {
    eachPlayer(event, 'momentum', function (player) {
      var data = player.persistentData
      if (!data.contains('icraft_momentum') || data.getInt('icraft_momentum') <= 0) return
      var lastHit = data.contains('icraft_momentum_time') ? Number(data.getLong('icraft_momentum_time')) : 0
      var now = core.now(player)
      if (now - lastHit > 100 || now < lastHit) {
        data.putInt('icraft_momentum', 0)
        setMod(player, 'minecraft:generic.attack_speed', 'icraft_momentum_bonus', 0, 'multiply_base')
      }
    })
  }

  // ── Every 5 seconds: Steadfast knockback resistance near bosses (32 blocks) ──
  if (tick % 100 === 20) {
    eachPlayer(event, 'steadfast', function (player) {
      var stead = getArmorEnchTotal(player, 'icraft:steadfast')
      var value = (stead > 0 && bossNear(player, 32)) ? stead * 0.15 : 0
      setMod(player, 'minecraft:generic.knockback_resistance', 'icraft_steadfast_bonus', value, 'addition')
    })
  }

  // ── Every 2 seconds: Aether Acclimation (remove thin air debuffs) ──
  if (tick % 40 === 30) {
    eachPlayer(event, 'aether_acclimation', function (player) {
      var aether = getArmorEnchTotal(player, 'icraft:aether_acclimation')
      if (aether <= 0) return

      var dim = dimOf(player)
      // (Deep Aether's biomes are inside aether:the_aether; it has no dimension)
      if (dim === 'aether:the_aether') {
        // Remove Slowness and Mining Fatigue from thin air
        if (player.y > 192 + (aether * 32)) return // Still too high even for enchant
        player.removeEffect('minecraft:slowness')
        player.removeEffect('minecraft:mining_fatigue')
      }
    })
  }

  // ── Every 2 seconds: Quick Draw (bow draw speed) ──
  if (tick % 40 === 35) {
    eachPlayer(event, 'quick_draw', function (player) {
      // Apothic's draw speed while a bow or crossbow is held. Until 2026-10-19 this
      // gave attack speed "as a proxy", which does not change how fast a bow draws
      // (design-gaps chip, measured on the rig). Apothic's handler reaches every
      // ProjectileWeaponItem and the trident, not Tetra's modular bows.
      var value = 0
      var held = player.mainHandItem
      if (held && !held.isEmpty() && String(held.id).indexOf('bow') >= 0) {
        value = core.enchLevel(held, 'icraft:quick_draw') * 0.15
      }
      setMod(player, 'attributeslib:draw_speed', 'icraft_quick_draw', value, 'multiply_base')
    })
  }

  // ── Every 10 seconds: Adaptive decay (reduce tracked damage type stacks) ──
  if (tick % 200 === 0) {
    eachPlayer(event, 'adaptive_decay', function (player) {
      var data = player.persistentData
      // Copy the keys first: removing from the tag while walking its live key
      // set throws ConcurrentModificationException.
      var keys = []
      data.getAllKeys().forEach(function (k) {
        var name = String(k)
        if (name.indexOf('icraft_adapt_') === 0 && name !== 'icraft_adapt_type') keys.push(name)
      })
      for (var i = 0; i < keys.length; i++) {
        var val = data.getInt(keys[i])
        if (val <= 1) data.remove(keys[i])
        else data.putInt(keys[i], val - 1)
      }
    })
  }
}
global.registerServerTick('tick_enchantPeriodicEffects', 5, 0)


// ==========================================================================
// ███ CONVERGENCE: Spell power scales with weapon tier ███
// Applied via attribute sync — checks mainhand weapon material tier
// ==========================================================================
global.tick_enchantConvergence = function (event) {
  eachPlayer(event, 'convergence', function (player) {
    var value = 0
    var weapon = player.mainHandItem
    if (weapon && !weapon.isEmpty()) {
      var conv = core.enchLevel(weapon, 'icraft:convergence')
      if (conv > 0) {
        var id = String(weapon.id)
        var tierBonus = 0
        if (id.indexOf('netherite') >= 0) tierBonus = 0.20
        else if (id.indexOf('diamond') >= 0 || id.indexOf('terrasteel') >= 0) tierBonus = 0.15
        else if (id.indexOf('steel') >= 0 || id.indexOf('manasteel') >= 0) tierBonus = 0.10
        else if (id.indexOf('iron') >= 0) tierBonus = 0.05
        value = conv * tierBonus
      }
    }
    setMod(player, 'irons_spellbooks:spell_power', 'icraft_convergence_sync', value, 'multiply_base')
  })
}
global.registerServerTick('tick_enchantConvergence', 200, 75)


// ==========================================================================
// ███ PLANETARY HAZARD ENCHANTMENT EFFECTS ███
// Lunar Stride, Thermal Regulation, Pressure Shell, Void Adaptation, Stellar Shield
// Most hazard negation is handled in dimension_mechanics.js (checks enchant before
// applying damage). These handlers cover supplemental effects like jump boost.
// ==========================================================================

// ── Lunar Stride: Jump Boost + fall damage reduction on Ad Astra planets ──
global.tick_enchantLunarStride = function (event) {
  eachPlayer(event, 'lunar_stride', function (player) {
    if (!PLANETS[dimOf(player)]) return
    var lunar = getArmorEnchTotal(player, 'icraft:lunar_stride')
    if (lunar <= 0) return
    player.potionEffects.add('minecraft:jump_boost', 100, Math.min(lunar - 1, 2), false, false)
  })
}
global.registerServerTick('tick_enchantLunarStride', 40, 15)

// ── Lunar Stride + Stellar Shield (DamageModifierRegistry) ─────────────

// Lunar Stride: a third less fall damage per level, the armour pieces added up
// (three levels stop it; 0.33 a level until 2026-10-19 left 1%)
core.onHurt('icraft.enchants.lunar_stride', function (event, ctx) {
  var player = ctx.victim
  if (!core.isFall(ctx.source)) return
  if (!PLANETS[dimOf(player)]) return
  var lunar = getArmorEnchTotal(player, 'icraft:lunar_stride')
  if (lunar > 0) event.amount = event.amount * (1.0 - Math.min(lunar / 3, 1.0))
}, 'victimPlayer')

// Stellar Shield: a third less fire damage on planets per level, the armour
// pieces added up (three levels stop it; 0.33 a level until 2026-10-19 left 1%)
core.onHurt('icraft.enchants.stellar_shield', function (event, ctx) {
  var player = ctx.victim
  if (!PLANETS[dimOf(player)]) return
  if (!core.isFire(ctx.source)) return
  var stellar = getArmorEnchTotal(player, 'icraft:stellar_shield')
  if (stellar > 0) event.amount = event.amount * (1.0 - Math.min(stellar / 3, 1.0))
}, 'victimPlayer')

console.log('[IridescentCraft] enchant_effects.js loaded — 29 custom enchantment effects')
})()
