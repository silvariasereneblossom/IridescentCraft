// @file kubejs/server_scripts/magic_crit_hook.js
// @events hurt
// =============================================================================
// MAGIC CRIT HOOK -- enable critical hits on magic-typed damage
// =============================================================================
// Phase 4 of iridescent-modular-spells-mod: vanilla 'critical hit' fires only
// on melee attacks (the falling-attack check). Magic damage (ISS spells, Ars
// glyphs, etc.) doesn't crit. This script extends crit to magic damage:
//
//   1. Subscribe to LivingHurtEvent
//   2. If attacker is a player AND damage source is magic-typed, AND the
//      player holds a modular spell book with the magic_crit_chance enchant,
//      roll the crit chance
//   3. On crit, multiply damage by (1 + magic_crit_damage_bonus)
//
// Crit-chance/damage values come from enchant levels on the held modular
// spell book (ISS or Ars). Per level:
//   magic_crit_chance:  +5% chance per level (max 3 -> +15%)
//   magic_crit_damage:  +25% damage per level (max 3 -> +75%)
//
// We also stack the player's existing attributecore:crit_chance attribute
// (so the same crit_chance attribute that powers melee crits also bumps
// magic crit roll by the same amount). Cross-system synergy.
//
// Memory: feedback_rhino_scoping.md (var X = function() {} inside try blocks).
//
// 2026-10-10: the (stack, ench) level helper is named getBookEnchLevel_mc, not
// getEnchLevel -- enchantments/enchant_effects.js owns the global
// getEnchLevel(entity, enchId) and the two signatures are incompatible.
//
// 2026-10-10 (2): the hook had never fired. It read `src.entity` (undefined
// for scripts) and decided "magic?" from `String(src.type)`, the text of a
// function object (0_lib_core.js header). The attacker and the damage type
// now come from global.icraft.core: magic = a damage type whose registry id
// or msg id contains "magic" (minecraft:magic / indirect_magic and the nine
// irons_spellbooks:<school>_magic types), or any other irons_spellbooks: /
// ars_nouveau: damage type; arrows and plain mob attacks are excluded.
// =============================================================================

// (IIFE - all KubeJS files of one type share a single Rhino scope; see dev/lint_kubejs_scope.py)
;(function () {
try {
  var EnchantmentHelper_mc = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')
  var ResourceLocation_mc = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var ForgeRegistries_mc = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')

  var CRIT_CHANCE_ID = 'iridescent_modular_spells:magic_crit_chance'
  var CRIT_DAMAGE_ID = 'iridescent_modular_spells:magic_crit_damage'

  // Resolve enchant objects once at script load. Cache for fast lookup.
  var resolvedCritChance = null
  var resolvedCritDamage = null
  try {
    resolvedCritChance = ForgeRegistries_mc.ENCHANTMENTS.getValue(
      ResourceLocation_mc.tryParse(CRIT_CHANCE_ID))
    resolvedCritDamage = ForgeRegistries_mc.ENCHANTMENTS.getValue(
      ResourceLocation_mc.tryParse(CRIT_DAMAGE_ID))
  } catch (_) {}

  if (!resolvedCritChance || !resolvedCritDamage) {
    console.log('[magic_crit] enchant ids not yet registered; handler is a no-op')
  } else {
    var getBookEnchLevel_mc = function(stack, ench) {
      try { return EnchantmentHelper_mc.getItemEnchantmentLevel(ench, stack) } catch (_) { return 0 }
    }

    // The hook needs the core library. A missing one is said ONCE, for every
    // script that asks (icraft.lib, 00_icraft_guard.js), not by each script.
    if (!icraft.lib.need('core', 'magic_crit_hook')) return
    var core = global.icraft.core

    var isMagicDamage = function(src) {
      // the registry id ('minecraft:indirect_magic'); the msg id only if there is none
      var srcId = core.dmgId(src)
      if (srcId === '') srcId = core.dmgMsg(src)
      srcId = srcId.toLowerCase()
      if (srcId.indexOf('magic') >= 0) return true       // minecraft:magic, minecraft:indirect_magic, ISS <school>_magic
      if (srcId.indexOf('arrow') >= 0) return false      // exclude arrow
      if (srcId.indexOf('mob') >= 0) return false        // exclude mob attack
      // other ISS damage types (fire_field, poison_cloud, ...)
      if (srcId.indexOf('irons_spellbooks') >= 0) return true
      // Ars glyph damage
      if (srcId.indexOf('ars_nouveau') >= 0) return true
      return false
    }

    // 2026-05-15: migrated to DamageModifierRegistry (raw Forge LivingHurtEvent).
    core.onHurt('icraft.magic_crit', function(event, ctx) {
      var src = ctx.source
      if (!src) return

      // DamageSource.getEntity() (the cause: the caster), not the projectile.
      var attacker = ctx.attacker
      if (attacker === ctx.victim) return

      // Cheapest test first: almost every hit is made without an enchanted book in hand.
      var stack = attacker.mainHandItem
      if (!stack || stack.isEmpty() || !stack.isEnchanted()) return
      var critChanceLvl = getBookEnchLevel_mc(stack, resolvedCritChance)
      if (critChanceLvl <= 0) return

      if (!isMagicDamage(src)) return
      var critDamageLvl = getBookEnchLevel_mc(stack, resolvedCritDamage)

      var enchChance = critChanceLvl * 0.05
      var attrChance = 0.0
      try {
        var pdata = attacker.persistentData
        if (pdata.contains('icraft_crit_chance')) attrChance = core.finite(pdata.getDouble('icraft_crit_chance'), 0)
      } catch (_) {}
      var totalChance = enchChance + attrChance
      if (totalChance <= 0) return
      if (Math.random() >= totalChance) return

      var critDamageBonus = 0.5 + (critDamageLvl > 0 ? critDamageLvl * 0.25 : 0)

      var origDamage = core.finite(event.amount, 0)
      event.amount = origDamage * (1.0 + critDamageBonus)

      if (!global._magic_crit_seen) global._magic_crit_seen = {}
      var name = String(attacker.username)
      if (!global._magic_crit_seen[name]) {
        global._magic_crit_seen[name] = true
        console.log('[magic_crit] ' + name + ' MAGIC CRIT! ' +
                    origDamage.toFixed(2) + ' -> ' + (origDamage * (1.0 + critDamageBonus)).toFixed(2) +
                    ' (chance=' + (totalChance * 100).toFixed(1) + '% damage=+' +
                    (critDamageBonus * 100).toFixed(0) + '%)')
      }
    }, 'attackerPlayer')

    console.log('[IridescentCraft] magic_crit_hook loaded -- magic damage can crit via book enchants')
  }
} catch (e) {
  console.warn('[IridescentCraft] magic_crit_hook bootstrap FAILED: ' + e)
}
})()
