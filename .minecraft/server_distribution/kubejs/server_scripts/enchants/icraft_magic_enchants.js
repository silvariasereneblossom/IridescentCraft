// =============================================================================
// ICRAFT MAGIC ENCHANTS -- attribute effects for the iridescent_reforging
// enchant set (icraft:mana_boost / mana_regen / arcane_focus)
// Place in: kubejs/server_scripts/enchants/icraft_magic_enchants.js
// =============================================================================
//
// 2026-05-21: Companion to the Java-side enchant registration in
// iridescent_tetra_expansion-1.0.0.jar (IcraftEnchantments). The Java
// side makes the enchants registerable + applicable to the
// #icraft:magic_weapon tag; the actual effect mechanics live here so
// tuning iterations don't require a mod rebuild.
//
// Three "static" enchants implemented here (effects active while held):
//   mana_boost   -- +max_mana per level. Levels 1-7 scale linearly.
//   mana_regen   -- +mana_regen per level. Levels 1-7 scale linearly.
//   arcane_focus -- +spell_power per level. Levels 1-5 scale linearly.
//
// Four "proc" enchants (spell_echo / mana_siphon / resonance /
// vorpal_arcane) need event hooks into Ars + ISS spell-cast events;
// scoped for follow-up (see design/magic_enchant_scope_2026-05-21.md).
//
// Each effect uses ItemAttributeModifierEvent so the bonus appears in
// the tooltip via the standard "When in Main Hand:" line AND gets
// applied to the holder by vanilla equipment-slot logic. Same pattern
// the existing WandTierAttributes class (Java side) uses for wand
// tier bonuses.
//
// Why the disabled ars_nouveau:mana_boost / ars_nouveau:mana_regen
// (apoth/enchantments.cfg, 2026-05-21): they were category-restricted
// to Ars items via the enchant's canEnchant. ISS books, simple staves,
// Dan's Magic wands couldn't pick them up. icraft:mana_boost +
// icraft:mana_regen replace them with a tag-based category covering
// the whole #icraft:magic_weapon roster.
// =============================================================================

try {
  var MinecraftForge_ime = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var ItemAttributeModifierEvent_ime = Java.loadClass('net.minecraftforge.event.ItemAttributeModifierEvent')
  var EventPriority_ime = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_ime = Java.loadClass('java.util.function.Consumer')
  var EquipmentSlot_ime = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var AttributeModifier_ime = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_ime = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_ime = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var UUID_ime = Java.loadClass('java.util.UUID')
  var EnchantmentHelper_ime = Java.loadClass('net.minecraft.world.item.enchantment.EnchantmentHelper')

  // Enchant + attribute resource locations
  var MANA_BOOST_ENCHANT_ID    = new ResourceLocation_ime('iridescent_reforging', 'mana_boost')
  var MANA_REGEN_ENCHANT_ID    = new ResourceLocation_ime('iridescent_reforging', 'mana_regen')
  var ARCANE_FOCUS_ENCHANT_ID  = new ResourceLocation_ime('iridescent_reforging', 'arcane_focus')
  var VORPAL_ARCANE_ENCHANT_ID = new ResourceLocation_ime('iridescent_reforging', 'vorpal_arcane')

  // We target the unified player attributes so both ISS + Ars mage paths
  // benefit. attribute_sync.js handles the cross-system pipe; we just add
  // to the unified attribute and let the sync propagate.
  var MAX_MANA_ATTR_ID    = new ResourceLocation_ime('irons_spellbooks', 'max_mana')
  var MANA_REGEN_ATTR_ID  = new ResourceLocation_ime('irons_spellbooks', 'mana_regen')
  var SPELL_POWER_ATTR_ID = new ResourceLocation_ime('irons_spellbooks', 'spell_power')
  // Arcane Vorpal targets attributeslib crit attributes -- same as melee
  // Vorpal -- so they share the same all-additive crit model.
  var CRIT_CHANCE_ATTR_ID = new ResourceLocation_ime('attributeslib', 'crit_chance')
  var CRIT_DAMAGE_ATTR_ID = new ResourceLocation_ime('attributeslib', 'crit_damage')

  // Lazy attribute resolution -- ISS registers its attributes at common
  // setup, which fires AFTER this script loads but BEFORE the first
  // ItemAttributeModifierEvent. Cache once and reuse.
  var attrCache = {}
  var resolveAttr = function(rl) {
    var key = rl.toString()
    if (attrCache[key] !== undefined) return attrCache[key]
    var a = null
    try { a = ForgeRegistries_ime.ATTRIBUTES.getValue(rl) } catch (e) {}
    attrCache[key] = a
    return a
  }

  // Enchant + attribute resolution (same lazy pattern)
  var enchCache = {}
  var resolveEnch = function(rl) {
    var key = rl.toString()
    if (enchCache[key] !== undefined) return enchCache[key]
    var e = null
    try { e = ForgeRegistries_ime.ENCHANTMENTS.getValue(rl) } catch (ex) {}
    enchCache[key] = e
    return e
  }

  // Deterministic UUIDs so vanilla de-dups across queries.
  // Pattern: a1c9e206-XX (enchant index)-YY (level)
  var mkUuid = function(enchIdx, level) {
    var ei = (enchIdx < 16 ? '0' : '') + Number(enchIdx).toString(16)
    var lv = (level < 16 ? '0' : '') + Number(level).toString(16)
    return UUID_ime.fromString('a1c9e206-0000-0000-00' + ei + '-0000000000' + lv)
  }

  // Scaling tables -- linear by level, tuned for "feel" at max level.
  // Mana baseline is 100 mana in ISS. +30 mana at L7 mana_boost is +30%
  // pool. +20% mana_regen at L7 mana_regen feels meaningful but not
  // game-breaking. +20% spell_power at L5 arcane_focus matches the +25%
  // Archmage class bonus -- significant but stackable with affixes.
  var MANA_BOOST_PER_LEVEL          = 4.0    // +4 max mana per level (so L7 = +28)
  var MANA_REGEN_PER_LEVEL          = 0.03   // +3% mana_regen per level (L7 = +21%)
  var ARCANE_FOCUS_PER_LEVEL        = 0.04   // +4% spell_power per level (L5 = +20%)
  // Arcane Vorpal mirrors melee Vorpal's mixed shape (vorpal_rework.js):
  // +3% crit_chance + +5% crit_damage per level. L5 max = +15% chance + +25%
  // damage. Naturally lower max than melee Vorpal (L5 vs L8) since magic
  // weapons typically have higher base damage / spell scaling already.
  // No decapitation roll -- beheading from a spell hit doesn't fit the
  // identity. The melee Vorpal keeps that signature.
  var VORPAL_ARCANE_CHANCE_PER_LEVEL = 0.03
  var VORPAL_ARCANE_DAMAGE_PER_LEVEL = 0.05

  var handler = new Consumer_ime({
    accept: function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_ime.MAINHAND &&
            event.getSlotType() !== EquipmentSlot_ime.OFFHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return

        // Mana Boost
        var manaBoostEnch = resolveEnch(MANA_BOOST_ENCHANT_ID)
        if (manaBoostEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(manaBoostEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(MAX_MANA_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(1, lvl), 'icraft_mana_boost',
                  MANA_BOOST_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
          }
        }

        // Mana Regen
        var manaRegenEnch = resolveEnch(MANA_REGEN_ENCHANT_ID)
        if (manaRegenEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(manaRegenEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(MANA_REGEN_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(2, lvl), 'icraft_mana_regen',
                  MANA_REGEN_PER_LEVEL * lvl, AttributeModifier_ime.Operation.MULTIPLY_BASE))
            }
          }
        }

        // Arcane Focus
        var arcaneFocusEnch = resolveEnch(ARCANE_FOCUS_ENCHANT_ID)
        if (arcaneFocusEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(arcaneFocusEnch, stack)
          if (lvl > 0) {
            var attr = resolveAttr(SPELL_POWER_ATTR_ID)
            if (attr != null) {
              event.addModifier(attr,
                new AttributeModifier_ime(mkUuid(3, lvl), 'icraft_arcane_focus',
                  ARCANE_FOCUS_PER_LEVEL * lvl, AttributeModifier_ime.Operation.MULTIPLY_BASE))
            }
          }
        }

        // Arcane Vorpal -- mixed crit_chance + crit_damage, spell-routed.
        // The custom KubeJS crit roll (attribute_sync.js) reads
        // attributeslib:crit_chance + attributeslib:crit_damage post the
        // 2026-05-21 bridge, so these modifiers contribute to spell-source
        // damage automatically (spells go through LivingHurtEvent same as
        // melee). No proc handler needed beyond the attribute add here.
        var vorpalArcaneEnch = resolveEnch(VORPAL_ARCANE_ENCHANT_ID)
        if (vorpalArcaneEnch != null) {
          var lvl = EnchantmentHelper_ime.getItemEnchantmentLevel(vorpalArcaneEnch, stack)
          if (lvl > 0) {
            var chAttr = resolveAttr(CRIT_CHANCE_ATTR_ID)
            if (chAttr != null) {
              event.addModifier(chAttr,
                new AttributeModifier_ime(mkUuid(4, lvl), 'icraft_vorpal_arcane_chance',
                  VORPAL_ARCANE_CHANCE_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
            var dmgAttr = resolveAttr(CRIT_DAMAGE_ATTR_ID)
            if (dmgAttr != null) {
              event.addModifier(dmgAttr,
                new AttributeModifier_ime(mkUuid(5, lvl), 'icraft_vorpal_arcane_damage',
                  VORPAL_ARCANE_DAMAGE_PER_LEVEL * lvl, AttributeModifier_ime.Operation.ADDITION))
            }
          }
        }
      } catch (e) {
        // Fail-soft -- never crash an attribute query on enchant lookup failure
      }
    }
  })

  MinecraftForge_ime.EVENT_BUS.addListener(EventPriority_ime.NORMAL, false,
                                            ItemAttributeModifierEvent_ime, handler)
  console.log('[IridescentCraft] icraft_magic_enchants loaded (mana_boost + mana_regen + arcane_focus stat hooks)')
} catch (e) {
  console.warn('[IridescentCraft] icraft_magic_enchants bootstrap FAILED: ' + e)
}
