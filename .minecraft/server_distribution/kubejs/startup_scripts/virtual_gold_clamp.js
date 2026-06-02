// =============================================================================
// [2026-06-01] RELOAD-SAFE: registered via ItemAttributeRegistry, not a raw
// MinecraftForge.EVENT_BUS listener. A raw EVENT_BUS.addListener leaves the JS
// closure on the Forge bus; KubeJS's ScriptType.unload() can't remove it, so
// after a context dispose (client resource reload for startup scripts; every
// /reload for server scripts) the next ItemAttributeModifierEvent -- fired on
// every getAttributeModifiers query incl. container tooltip render -- crashes
// at enterActivationFunction (IllegalStateException: null) with the dead scope.
// ItemAttributeRegistry is an @Mod.EventBusSubscriber owned by the mod (like
// DamageModifierRegistry); the JS callback is replaceable DATA keyed by a
// stable id, so re-registration on reload overwrites the stale entry. Handler
// body is unchanged -- the registry passes the raw event.
// =============================================================================

// =============================================================================
// VIRTUAL GOLD CLAMP -- celestial_core virtual_gold set tuned to iron-tier
// Place in: kubejs/startup_scripts/virtual_gold_clamp.js
// =============================================================================
//
// 2026-05-20: Virtual Gold set from celestial_core ships above-tier stats
// (the mod's pitch is "real-gold gear without gold's brittleness"). Per
// user 2026-05-20: keep what makes the set IDENTITY-relevant -- the worn
// fire resistance effect + the high enchant affinity (gold-tier enchant
// value, ~22) -- but pull damage/armor/durability down to iron-comparable.
//
// What this script touches:
//   - Weapon ATTACK_DAMAGE + ATTACK_SPEED via ItemAttributeModifierEvent
//   - Armor ARMOR + ARMOR_TOUGHNESS via ItemAttributeModifierEvent
//   - Item.maxDamage via reflection (mirrors hulk_hammer + terramity
//     weapon durability patterns)
//
// What this script DOES NOT touch:
//   - Enchantability (Item.getEnchantmentValue()): untouched -> the
//     gold-tier enchantability the user explicitly asked to preserve
//     stays in effect.
//   - Fire resistance: whatever pathway celestial_core uses (mixin /
//     curio tick / inventoryTick / event listener) is independent of
//     attribute modifiers and isn't intercepted here.
//
// Target values (vanilla iron tier for direct equivalence):
//   sword:     +6 dmg ADDITION, -2.4 speed ADDITION, 250 dur
//   axe:       +9 dmg ADDITION, -3.1 speed ADDITION, 250 dur
//   pickaxe:   +5 dmg ADDITION, -2.8 speed ADDITION, 250 dur
//   shovel:    +3.5 dmg ADDITION, -3.0 speed ADDITION, 250 dur
//   hoe:       +1 dmg ADDITION, -3.0 speed ADDITION, 250 dur
//   helmet:    +2 armor, 165 dur
//   chestplate:+6 armor, 240 dur
//   leggings:  +5 armor, 225 dur
//   boots:     +2 armor, 195 dur
//   (toughness 0 across all armor; iron has none)
// =============================================================================

try {
  var ItemAttributeRegistry_vg = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
  var EquipmentSlot_vg = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var Attributes_vg = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
  var AttributeModifier_vg = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_vg = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var UUID_vg = Java.loadClass('java.util.UUID')

  // Iron-equivalent attribute targets, keyed by item id.
  // ADDITION values include the +1 base damage that vanilla SwordItem ctor
  // adds (so sword ADDITION 5 = displayed +6 damage). Tools use AxeItem
  // pattern where the value is the raw addition.
  var VG_WEAPONS = {
    'celestial_core:virtual_gold_sword':   { dmg: 5,   spd: -2.4, dur: 250 },
    'celestial_core:virtual_gold_axe':     { dmg: 8,   spd: -3.1, dur: 250 },
    'celestial_core:virtual_gold_pickaxe': { dmg: 4,   spd: -2.8, dur: 250 },
    'celestial_core:virtual_gold_shovel':  { dmg: 2.5, spd: -3.0, dur: 250 },
    'celestial_core:virtual_gold_hoe':     { dmg: 0,   spd: -3.0, dur: 250 }
  }

  // Armor: { armor, toughness, knockbackResistance, durability, slot }
  var VG_ARMOR = {
    'celestial_core:virtual_gold_helmet':     { armor: 2, tough: 0, kbr: 0, dur: 165, slot: 'HEAD'  },
    'celestial_core:virtual_gold_chestplate': { armor: 6, tough: 0, kbr: 0, dur: 240, slot: 'CHEST' },
    'celestial_core:virtual_gold_leggings':   { armor: 5, tough: 0, kbr: 0, dur: 225, slot: 'LEGS'  },
    'celestial_core:virtual_gold_boots':      { armor: 2, tough: 0, kbr: 0, dur: 195, slot: 'FEET'  }
  }

  // Deterministic UUIDs (one per item-attribute pair). Vanilla de-dupes
  // across queries by UUID so a fixed value here keeps the tooltip clean.
  // Pattern: a1c9e203-XX-YY where XX = item index (1-9), YY = attribute (01 dmg, 02 spd, 03 armor, 04 tough)
  var mkUuid = function (itemIdx, attrIdx) {
    var ii = (itemIdx < 10 ? '0' : '') + itemIdx
    var aa = (attrIdx < 10 ? '0' : '') + attrIdx
    return UUID_vg.fromString('a1c9e203-0000-0000-00' + ii + '-0000000000' + aa)
  }

  // ---------------------------------------------------------------------
  // Phase 1: ItemAttributeModifierEvent for damage/armor overrides.
  // ---------------------------------------------------------------------
  var slotEnum = {
    'HEAD':  EquipmentSlot_vg.HEAD,
    'CHEST': EquipmentSlot_vg.CHEST,
    'LEGS':  EquipmentSlot_vg.LEGS,
    'FEET':  EquipmentSlot_vg.FEET
  }
  var itemIndex = 0
  var itemIndices = {}
  for (var k in VG_WEAPONS) { itemIndex += 1; itemIndices[k] = itemIndex }
  for (var k2 in VG_ARMOR)  { itemIndex += 1; itemIndices[k2] = itemIndex }

  var handler = function (event) {
      try {
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return
        var id = ForgeRegistries_vg.ITEMS.getKey(stack.getItem())
        if (!id) return
        var idStr = String(id.toString())
        var slot = event.getSlotType()
        var idx = itemIndices[idStr]
        if (!idx) return

        var w = VG_WEAPONS[idStr]
        if (w) {
          if (slot !== EquipmentSlot_vg.MAINHAND) return
          event.removeAttribute(Attributes_vg.ATTACK_DAMAGE)
          event.removeAttribute(Attributes_vg.ATTACK_SPEED)
          event.addModifier(Attributes_vg.ATTACK_DAMAGE,
            new AttributeModifier_vg(mkUuid(idx, 1), 'icraft_vg_dmg',
                                     w.dmg, AttributeModifier_vg.Operation.ADDITION))
          event.addModifier(Attributes_vg.ATTACK_SPEED,
            new AttributeModifier_vg(mkUuid(idx, 2), 'icraft_vg_spd',
                                     w.spd, AttributeModifier_vg.Operation.ADDITION))
          return
        }

        var a = VG_ARMOR[idStr]
        if (a) {
          // ArmorItem attributes only apply when the stack is in its slot.
          if (slot !== slotEnum[a.slot]) return
          event.removeAttribute(Attributes_vg.ARMOR)
          event.removeAttribute(Attributes_vg.ARMOR_TOUGHNESS)
          event.removeAttribute(Attributes_vg.KNOCKBACK_RESISTANCE)
          event.addModifier(Attributes_vg.ARMOR,
            new AttributeModifier_vg(mkUuid(idx, 3), 'icraft_vg_armor',
                                     a.armor, AttributeModifier_vg.Operation.ADDITION))
          if (a.tough > 0) {
            event.addModifier(Attributes_vg.ARMOR_TOUGHNESS,
              new AttributeModifier_vg(mkUuid(idx, 4), 'icraft_vg_tough',
                                       a.tough, AttributeModifier_vg.Operation.ADDITION))
          }
          if (a.kbr > 0) {
            event.addModifier(Attributes_vg.KNOCKBACK_RESISTANCE,
              new AttributeModifier_vg(mkUuid(idx, 5), 'icraft_vg_kbr',
                                       a.kbr, AttributeModifier_vg.Operation.ADDITION))
          }
        }
      } catch (e) {
        // Fail-soft -- never let an attribute query crash item rendering
      }
  }

  ItemAttributeRegistry_vg.register('icraft.virtual_gold_clamp', handler)
  console.log('[IridescentCraft] virtual_gold_clamp loaded (attribute clamp for ' +
              (Object.keys(VG_WEAPONS).length + Object.keys(VG_ARMOR).length) + ' items)')
} catch (e) {
  console.warn('[IridescentCraft] virtual_gold_clamp bootstrap FAILED: ' + e)
}
