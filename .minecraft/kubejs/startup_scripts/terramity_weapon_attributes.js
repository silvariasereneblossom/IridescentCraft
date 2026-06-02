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
// TERRAMITY WEAPON ATTRIBUTE CLAMP
// Place in: kubejs/startup_scripts/terramity_weapon_attributes.js
// =============================================================================
//
// 2026-05-19: Clamp damage of exodium_waraxe + reverium_axe to +8 tier
// bonus (matches netherite-tier axes). Decompile showed:
//   exodium_waraxe -- Tier.getAttackDamageBonus() = 14.0f (vs netherite axe 7.0f)
//                     AxeItem damage = 1 (passed) + 14 (tier) = 15 raw,
//                     displayed +20 in tooltip (vs netherite axe +9). 2.2x.
//   reverium_axe   -- Tier.getAttackDamageBonus() = 12.0f
//                     displayed +18. 2x.
// Both are stage-skipping outliers; the swords (tier_bonus 7 / 9.5) are
// within balance. See master-appendix.md sec M.10.
//
// Approach: ItemAttributeModifierEvent, same pattern as hulk_hammer_attributes.
// Strip native ATTACK_DAMAGE + ATTACK_SPEED so the tooltip shows our values
// cleanly. Net displayed damage targets:
//   exodium_waraxe: +14 (tier 8 + base 1 + player 1 + 4 attack-damage display
//                        offset from AxeItem) -- aligned with netherite axe
//                        path but slightly above (8 vs 7 tier).
//   reverium_axe:   +14 (same)
// Speed values from native: waraxe -3.4, axe -3.0. Kept unchanged.
// =============================================================================

try {
  var ItemAttributeRegistry_tw = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
  var EquipmentSlot_tw = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var Attributes_tw = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
  var AttributeModifier_tw = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_tw = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var UUID_tw = Java.loadClass('java.util.UUID')

  // Deterministic UUIDs so vanilla de-dupes across queries.
  var EXODIUM_DMG_UUID  = UUID_tw.fromString('a1c9e202-0000-0000-0000-000000000001')
  var EXODIUM_SPD_UUID  = UUID_tw.fromString('a1c9e202-0000-0000-0000-000000000002')
  var REVERIUM_DMG_UUID = UUID_tw.fromString('a1c9e202-0000-0000-0000-000000000003')
  var REVERIUM_SPD_UUID = UUID_tw.fromString('a1c9e202-0000-0000-0000-000000000004')

  // Final attack-damage attribute value AFTER vanilla's player-base 1.0.
  // Vanilla AxeItem ctor passes pAttackDamageModifier + tier.getAttackDamageBonus()
  // as the ADDITION value. Target: 8 tier bonus + 4 axe-extra + 1 base = 13.
  // We use ADDITION so the affixes can multiply on top.
  var EXODIUM_DMG  = 13.0  // was 20.0 (14 tier + 1 ctor + 4 axe + 1 base)
  var REVERIUM_DMG = 13.0  // was 18.0 (12 tier + 1 ctor + 4 axe + 1 base)
  var EXODIUM_SPD  = -3.4  // unchanged
  var REVERIUM_SPD = -3.0  // unchanged

  var handler = function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_tw.MAINHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return
        var id = ForgeRegistries_tw.ITEMS.getKey(stack.getItem())
        if (!id) return
        var idStr = id.toString()

        if (idStr === 'terramity:exodium_waraxe') {
          event.removeAttribute(Attributes_tw.ATTACK_DAMAGE)
          event.removeAttribute(Attributes_tw.ATTACK_SPEED)
          event.addModifier(Attributes_tw.ATTACK_DAMAGE,
            new AttributeModifier_tw(EXODIUM_DMG_UUID, 'icraft_exodium_waraxe_dmg',
                                     EXODIUM_DMG, AttributeModifier_tw.Operation.ADDITION))
          event.addModifier(Attributes_tw.ATTACK_SPEED,
            new AttributeModifier_tw(EXODIUM_SPD_UUID, 'icraft_exodium_waraxe_spd',
                                     EXODIUM_SPD, AttributeModifier_tw.Operation.ADDITION))
        } else if (idStr === 'terramity:reverium_axe') {
          event.removeAttribute(Attributes_tw.ATTACK_DAMAGE)
          event.removeAttribute(Attributes_tw.ATTACK_SPEED)
          event.addModifier(Attributes_tw.ATTACK_DAMAGE,
            new AttributeModifier_tw(REVERIUM_DMG_UUID, 'icraft_reverium_axe_dmg',
                                     REVERIUM_DMG, AttributeModifier_tw.Operation.ADDITION))
          event.addModifier(Attributes_tw.ATTACK_SPEED,
            new AttributeModifier_tw(REVERIUM_SPD_UUID, 'icraft_reverium_axe_spd',
                                     REVERIUM_SPD, AttributeModifier_tw.Operation.ADDITION))
        }
      } catch (e) {
        // Fail-soft: never let an attribute query crash item rendering
      }
  }

  ItemAttributeRegistry_tw.register('icraft.terramity_weapon_attributes', handler)
  console.log('[IridescentCraft] terramity_weapon_attributes loaded (exodium_waraxe + reverium_axe damage clamp)')
} catch (e) {
  console.warn('[IridescentCraft] terramity_weapon_attributes bootstrap FAILED: ' + e)
}
