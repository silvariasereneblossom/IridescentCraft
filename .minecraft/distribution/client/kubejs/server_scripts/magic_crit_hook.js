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
// =============================================================================

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
    var getEnchLevel = function(stack, ench) {
      try { return EnchantmentHelper_mc.getItemEnchantmentLevel(ench, stack) } catch (_) { return 0 }
    }

    var isMagicDamage = function(src) {
      try {
        var srcId = String(src.type ? src.type : src.msgId || '')
        if (srcId.indexOf('magic') >= 0) return true       // minecraft:magic, minecraft:indirect_magic
        if (srcId.indexOf('arrow') >= 0) return false      // exclude arrow
        if (srcId.indexOf('mob') >= 0) return false        // exclude mob attack
        // ISS schools (fire, ice, lightning, blood, evocation, etc.)
        if (srcId.indexOf('irons_spellbooks') >= 0) return true
        // Ars glyph damage
        if (srcId.indexOf('ars_nouveau') >= 0) return true
      } catch (_) {}
      return false
    }

    EntityEvents.hurt(function(event) {
      try {
        var src = null
        try { src = event.source } catch (_) { return }
        if (!src) return

        // Resolve attacker — direct player or projectile owner
        var attacker = null
        try { attacker = src.actual } catch (_) {}
        if (!attacker) {
          try { attacker = src.player } catch (_) {}
        }
        if (!attacker || !attacker.player) return

        if (!isMagicDamage(src)) return

        // Read enchant levels from mainhand spell book
        var stack = attacker.getMainHandItem()
        if (!stack || stack.isEmpty()) return
        var critChanceLvl = getEnchLevel(stack, resolvedCritChance)
        var critDamageLvl = getEnchLevel(stack, resolvedCritDamage)
        if (critChanceLvl <= 0) return  // can't crit without chance enchant

        // Total chance: 5% per level, plus the player's attributecore:crit_chance
        // attribute for cross-system synergy with melee crit
        var enchChance = critChanceLvl * 0.05
        var attrChance = 0.0
        try { attrChance = attacker.persistentData.getDouble('icraft_crit_chance') } catch (_) {}
        var totalChance = enchChance + attrChance
        if (totalChance <= 0) return

        if (Math.random() >= totalChance) return  // didn't crit

        // Roll crit damage multiplier: 25% per level, base 1.5x at level 1
        var critDamageBonus = 0.5 + (critDamageLvl * 0.25)  // L0=0.5x, L1=0.75x extra, L3=1.25x extra
        if (critDamageLvl <= 0) critDamageBonus = 0.5  // base crit even without dmg enchant

        var origDamage = event.damage
        event.damage = origDamage * (1.0 + critDamageBonus)

        // Per-attacker one-shot log so it's visible without spam
        if (!global._magic_crit_seen) global._magic_crit_seen = {}
        var name = String(attacker.username)
        if (!global._magic_crit_seen[name]) {
          global._magic_crit_seen[name] = true
          console.log('[magic_crit] ' + name + ' MAGIC CRIT! ' +
                      origDamage.toFixed(2) + ' -> ' + event.damage.toFixed(2) +
                      ' (chance=' + (totalChance * 100).toFixed(1) + '% damage=+' +
                      (critDamageBonus * 100).toFixed(0) + '%)')
        }
      } catch (_) {}
    })

    console.log('[IridescentCraft] magic_crit_hook loaded -- magic damage can crit via book enchants')
  }
} catch (e) {
  console.warn('[IridescentCraft] magic_crit_hook bootstrap FAILED: ' + e)
}
