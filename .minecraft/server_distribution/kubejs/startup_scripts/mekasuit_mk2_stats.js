// =============================================================================
// MEKASUIT Mk2 — PINNACLE STAT LAYER
// File: kubejs/startup_scripts/mekasuit_mk2_stats.js
// =============================================================================
// [2026-06-06 MK2B] Approved architecture (operator 2026-06-06): the MekaSuit
// Mk2 is the REAL mekanism:mekasuit_* piece carrying an icraft Mk2 NBT marker
// (see kubejs/server_scripts/recipes/ad_astra_gating.js SECTION G for the
// in-place upgrade recipe that stamps it). This script ADDS the pinnacle base
// stats on top of the native MekaSuit when, and only when, the worn piece is a
// mekanism:mekasuit_* item AND its stack NBT carries the marker
// `icraft_mekasuit_mk2: 1b`. It NEVER removes a native MekaSuit attribute, so
// nothing native (modules, energy, native armor/toughness, enchants, affixes)
// is nerfed -- the Mk2 layer is purely additive.
//
// PROVISIONAL VALUES (no exact numbers in design/ -- the doc only fixes the
// constraints "Mythic Forge endgame" + "no nerf to native" + "purely additive
// pinnacle"). Per MK2B mission brief the provisional band is, PER PIECE, over
// the native MekaSuit:  +2 armor / +1 toughness / +0.05 knockback resistance.
// These are intentionally modest (the MekaSuit's real power is its module
// ecosystem, not raw armor points) and are flagged here for operator tuning;
// adjust MK2_BONUS below and re-sync. Listed in the session notes.
//
// RELOAD-SAFE: registered via ItemAttributeRegistry (the mod-owned
// @Mod.EventBusSubscriber), NOT a raw MinecraftForge.EVENT_BUS listener -- same
// rationale as virtual_gold_clamp.js (a raw bus listener leaks the JS closure
// across a context dispose and crashes the next ItemAttributeModifierEvent).
// The registry entry is replaceable DATA keyed by a stable id, so re-registry
// on reload overwrites the stale handler.
//
// UUID ALLOCATION: existing ItemAttributeRegistry users claim prefixes
//   a1c9e201 hulk_hammer / a1c9e202 terramity / a1c9e203 virtual_gold /
//   a1c9e205 vorpal / a1c9e206 magic_enchants.
// This script uses a1c9e207 (free, collision-checked 2026-06-06).
//
// Rhino: `var X = function(){}` inside the try block; no `new java.X.Y()`
// (Java.loadClass pattern); `.isEmpty()` WITH parens.
// =============================================================================

try {
  var ItemAttributeRegistry_mk2 = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
  var EquipmentSlot_mk2 = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var Attributes_mk2 = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
  var AttributeModifier_mk2 = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_mk2 = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var UUID_mk2 = Java.loadClass('java.util.UUID')

  // Each Mk2 piece -> its valid equip slot. Keyed by REAL mekanism item id.
  // (mekanism uses _bodyarmor / _pants, not _chestplate / _leggings.)
  var MK2_PIECES = {
    'mekanism:mekasuit_helmet':    { slot: 'HEAD',  idx: 1 },
    'mekanism:mekasuit_bodyarmor': { slot: 'CHEST', idx: 2 },
    'mekanism:mekasuit_pants':     { slot: 'LEGS',  idx: 3 },
    'mekanism:mekasuit_boots':     { slot: 'FEET',  idx: 4 }
  }

  // PROVISIONAL pinnacle bonus, additive PER PIECE over native MekaSuit.
  // (4-piece total = +8 armor / +4 toughness / +0.20 KBR.)
  var MK2_BONUS = { armor: 2.0, tough: 1.0, kbr: 0.05 }

  var slotEnum_mk2 = {
    'HEAD':  EquipmentSlot_mk2.HEAD,
    'CHEST': EquipmentSlot_mk2.CHEST,
    'LEGS':  EquipmentSlot_mk2.LEGS,
    'FEET':  EquipmentSlot_mk2.FEET
  }

  // Deterministic UUIDs (one per piece-attribute pair) so vanilla de-dupes
  // cleanly across getAttributeModifiers queries. Prefix a1c9e207.
  // pattern: a1c9e207-0000-0000-00<pieceIdx>-0000000000<attrIdx>
  //   attrIdx 01 armor / 02 toughness / 03 knockback resistance
  var mkUuid_mk2 = function (pieceIdx, attrIdx) {
    var pp = (pieceIdx < 10 ? '0' : '') + pieceIdx
    var aa = (attrIdx < 10 ? '0' : '') + attrIdx
    return UUID_mk2.fromString('a1c9e207-0000-0000-00' + pp + '-0000000000' + aa)
  }

  var hasMk2Marker = function (stack) {
    try {
      if (!stack.hasTag()) return false
      var tag = stack.getTag()
      return tag.contains('icraft_mekasuit_mk2') && tag.getBoolean('icraft_mekasuit_mk2')
    } catch (e) {
      return false
    }
  }

  var handler = function (event) {
    try {
      var stack = event.getItemStack()
      if (!stack || stack.isEmpty()) return

      var id = ForgeRegistries_mk2.ITEMS.getKey(stack.getItem())
      if (!id) return
      var idStr = String(id.toString())

      var piece = MK2_PIECES[idStr]
      if (!piece) return

      // Gate on the Mk2 NBT marker -- a vanilla (un-upgraded) MekaSuit is
      // untouched. This is the whole point: same item, marker = Mk2.
      if (!hasMk2Marker(stack)) return

      // Only apply when the stack is in its own armor slot (mirrors how
      // ArmorItem attributes are slot-scoped; avoids the bonus leaking into
      // mainhand/offhand tooltip queries).
      var slot = event.getSlotType()
      if (slot !== slotEnum_mk2[piece.slot]) return

      // ADDITIVE ONLY -- we do NOT removeAttribute() anything. Native MekaSuit
      // armor/toughness/KBR + any module/enchant contributions all remain.
      event.addModifier(Attributes_mk2.ARMOR,
        new AttributeModifier_mk2(mkUuid_mk2(piece.idx, 1), 'icraft_mk2_armor',
                                  MK2_BONUS.armor, AttributeModifier_mk2.Operation.ADDITION))
      event.addModifier(Attributes_mk2.ARMOR_TOUGHNESS,
        new AttributeModifier_mk2(mkUuid_mk2(piece.idx, 2), 'icraft_mk2_tough',
                                  MK2_BONUS.tough, AttributeModifier_mk2.Operation.ADDITION))
      event.addModifier(Attributes_mk2.KNOCKBACK_RESISTANCE,
        new AttributeModifier_mk2(mkUuid_mk2(piece.idx, 3), 'icraft_mk2_kbr',
                                  MK2_BONUS.kbr, AttributeModifier_mk2.Operation.ADDITION))
    } catch (e) {
      // Fail-soft -- never let an attribute query crash item rendering.
    }
  }

  ItemAttributeRegistry_mk2.register('icraft.mekasuit_mk2_stats', handler)
  console.log('[IridescentCraft] mekasuit_mk2_stats loaded (pinnacle layer: +' +
              MK2_BONUS.armor + ' armor / +' + MK2_BONUS.tough + ' tough / +' +
              MK2_BONUS.kbr + ' KBR per Mk2-marked MekaSuit piece)')
} catch (e) {
  console.warn('[IridescentCraft] mekasuit_mk2_stats bootstrap FAILED: ' + e)
}
