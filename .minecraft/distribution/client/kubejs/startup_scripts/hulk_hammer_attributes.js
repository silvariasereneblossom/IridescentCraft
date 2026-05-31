// =============================================================================
// [#60 / 2026-05-31] MOVED from server_scripts/ to startup_scripts/.
// Registering a raw MinecraftForge.EVENT_BUS listener from a SERVER script re-runs on
// every reload (world entry, /reload, datapack reload), stacking duplicate listeners
// whose captured Rhino scope is discarded on the next reload. A stale listener then
// fails at enterActivationFunction (IllegalStateException: null) the next time an entity
// recomputes equipment attribute modifiers -> 'Ticking entity' crash. Startup scripts
// run ONCE and keep their context for the game's lifetime, so the listener registers
// exactly once with a living scope. Logic below is unchanged.
// =============================================================================

// =============================================================================
// HULK HAMMER ATTRIBUTE OVERRIDE
// Place in: kubejs/startup_scripts/hulk_hammer_attributes.js
// =============================================================================
//
// 2026-05-14: Override mutantmonsters:hulk_hammer in-hand stats to:
//   - Attack Damage: 20  (native +8 -> our +19 ADDITION, base 1.0)
//   - Attack Speed:  0.5 (native -3 -> our -3.5 ADDITION, base 4.0)
//   - Damage vs Undead: +50% (iridescent_reforging:damage_vs_undead +0.5)
//
// Design: slow, high-damage T1 melee drop from mutant_zombie. The 0.5
// attack speed is the balance lever -- one big windup every two seconds.
//
// Approach: Forge ItemAttributeModifierEvent subscription. Same pattern
// the iridescent-tetra-expansion WandTierAttributes class uses for SS/
// DM/ISS wand items. ItemAttributeModifierEvent fires every time
// Item.getAttributeModifiers is queried (tick recompute, tooltip render),
// so attributes appear in the tooltip via the standard "When in Main Hand:"
// line AND get applied to the holder by vanilla equipment-slot logic.
//
// Strips the native +8 damage / -3 speed via event.removeAttribute so the
// tooltip shows a single clean line instead of two stacking modifiers.
//
// Pairs with:
//   startup_scripts/hulk_hammer_durability.js -- 64 -> 640 durability
//   datapack_sources/icraft_mm_overrides/data/mutantmonsters/loot_tables/
//     entities/mutant_zombie.json -- 25% drop on player kill + innate Kb II
//   server_scripts/deathskin_undead_bonus.js -- the LivingHurtEvent handler
//     that READS damage_vs_undead and multiplies outgoing damage to UNDEAD
//     targets by (1 + attr_value). Hulk Hammer benefits from this.
// =============================================================================

try {
  var MinecraftForge_hh = Java.loadClass('net.minecraftforge.common.MinecraftForge')
  var ItemAttributeModifierEvent_hh = Java.loadClass('net.minecraftforge.event.ItemAttributeModifierEvent')
  var EventPriority_hh = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority')
  var Consumer_hh = Java.loadClass('java.util.function.Consumer')
  var EquipmentSlot_hh = Java.loadClass('net.minecraft.world.entity.EquipmentSlot')
  var Attributes_hh = Java.loadClass('net.minecraft.world.entity.ai.attributes.Attributes')
  var AttributeModifier_hh = Java.loadClass('net.minecraft.world.entity.ai.attributes.AttributeModifier')
  var ForgeRegistries_hh = Java.loadClass('net.minecraftforge.registries.ForgeRegistries')
  var ResourceLocation_hh = Java.loadClass('net.minecraft.resources.ResourceLocation')
  var UUID_hh = Java.loadClass('java.util.UUID')

  // Deterministic UUIDs so vanilla de-dupes our modifiers across queries.
  var HH_DMG_UUID    = UUID_hh.fromString('a1c9e201-0000-0000-0000-000000000001')
  var HH_SPD_UUID    = UUID_hh.fromString('a1c9e201-0000-0000-0000-000000000002')
  var HH_UNDEAD_UUID = UUID_hh.fromString('a1c9e201-0000-0000-0000-000000000003')

  var HH_ITEM_ID = 'mutantmonsters:hulk_hammer'
  var UNDEAD_ATTR_ID = new ResourceLocation_hh('iridescent_reforging', 'damage_vs_undead')

  // Resolve undead attribute lazily (attributes registry populated by
  // iridescent-tetra-expansion-mod during common setup).
  var undeadAttr = null
  var resolveUndeadAttr = function() {
    if (undeadAttr !== null) return undeadAttr
    try { undeadAttr = ForgeRegistries_hh.ATTRIBUTES.getValue(UNDEAD_ATTR_ID) } catch (e) {}
    return undeadAttr
  }

  var handler = new Consumer_hh({
    accept: function(event) {
      try {
        if (event.getSlotType() !== EquipmentSlot_hh.MAINHAND) return
        var stack = event.getItemStack()
        if (!stack || stack.isEmpty()) return
        var id = ForgeRegistries_hh.ITEMS.getKey(stack.getItem())
        if (!id || id.toString() !== HH_ITEM_ID) return

        // Strip native +8 dmg / -3 spd so the tooltip shows just our values.
        event.removeAttribute(Attributes_hh.ATTACK_DAMAGE)
        event.removeAttribute(Attributes_hh.ATTACK_SPEED)

        // Our overrides
        event.addModifier(Attributes_hh.ATTACK_DAMAGE,
          new AttributeModifier_hh(HH_DMG_UUID, 'icraft_hh_damage',
                                   19.0, AttributeModifier_hh.Operation.ADDITION))
        event.addModifier(Attributes_hh.ATTACK_SPEED,
          new AttributeModifier_hh(HH_SPD_UUID, 'icraft_hh_speed',
                                   -3.5, AttributeModifier_hh.Operation.ADDITION))

        // Damage vs Undead (custom attribute applied by deathskin_undead_bonus.js)
        var attrU = resolveUndeadAttr()
        if (attrU !== null) {
          event.addModifier(attrU,
            new AttributeModifier_hh(HH_UNDEAD_UUID, 'icraft_hh_undead',
                                     0.5, AttributeModifier_hh.Operation.ADDITION))
        }
      } catch (e) {
        // Fail-soft: never let an attribute query crash item rendering
      }
    }
  })

  MinecraftForge_hh.EVENT_BUS.addListener(EventPriority_hh.NORMAL, false,
                                          ItemAttributeModifierEvent_hh, handler)
  console.log('[IridescentCraft] hulk_hammer_attributes loaded (20 dmg / 0.5 aspd / +50% vs undead)')
} catch (e) {
  console.warn('[IridescentCraft] hulk_hammer_attributes bootstrap FAILED: ' + e)
}
