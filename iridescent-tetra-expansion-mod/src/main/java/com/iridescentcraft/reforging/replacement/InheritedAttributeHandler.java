package com.iridescentcraft.reforging.replacement;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.ItemAttributeModifierEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.UUID;

/**
 * Runtime layer for SpecializedReplacementHook's identity capture. The
 * hook serializes two distinct flavors of inherited state into NBT at
 * replacement time:
 *
 * <ul>
 *   <li><b>{@code icraft_inherited_modifiers}</b> -- mod-specific
 *       attribute modifiers from the source item's class
 *       getDefaultAttributeModifiers(slot). ISS / Mahou / other modded
 *       armor stores its mana, spell_power, cooldown_reduction, etc.
 *       overrides here, NOT in NBT. The hook captures + filters to
 *       non-{@code minecraft:*} attributes (vanilla armor is handled
 *       by Tetra's module aggregation, so double-adding would inflate
 *       defense).</li>
 *   <li><b>{@code icraft_baseline_armor}</b> + <b>{@code
 *       icraft_baseline_toughness}</b> -- a "specialization comfort"
 *       baseline. When the source item's vanilla armor / toughness
 *       attribute exceeds what Tetra's default module variants ship,
 *       a percentage (25% for armor, 25% for toughness, floor) is
 *       carried forward as an additive ADDITION modifier. Avoids
 *       punishing players for converting a unique armor piece into the
 *       modular system, especially early-game before they can hone
 *       modules up.</li>
 * </ul>
 *
 * <p>Companion: {@link com.iridescentcraft.reforging.item.ItemModularArmor#getMaxDamage(ItemStack)}
 * reads {@code icraft_baseline_durability} (the third inherited NBT
 * key) and adds it on top of the module-aggregated max damage.
 * Durability can't go through ItemAttributeModifierEvent because
 * maxDamage isn't an attribute -- it's a per-stack integer override.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID,
        bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class InheritedAttributeHandler {

    /** Deterministic UUID seeds so vanilla de-dupes our modifiers
     *  across query calls. Different from the inherited-modifier UUIDs
     *  (which are copied from the source). */
    private static final UUID BASELINE_ARMOR_UUID    = UUID.fromString("a1c9e204-0000-0000-0000-000000000001");
    private static final UUID BASELINE_TOUGH_UUID    = UUID.fromString("a1c9e204-0000-0000-0000-000000000002");

    @SubscribeEvent
    public static void onItemAttribute(ItemAttributeModifierEvent event) {
        ItemStack stack = event.getItemStack();
        if (stack.isEmpty()) return;
        if (!(stack.getItem() instanceof ItemModularArmor)) return;
        CompoundTag tag = stack.getTag();
        if (tag == null) return;

        EquipmentSlot eventSlot = event.getSlotType();

        // -----------------------------------------------------------------
        // Pass 1: mod-specific inherited modifiers from the source item
        // -----------------------------------------------------------------
        if (tag.contains("icraft_inherited_modifiers", Tag.TAG_LIST)) {
            ListTag list = tag.getList("icraft_inherited_modifiers", Tag.TAG_COMPOUND);
            for (int i = 0; i < list.size(); i++) {
                CompoundTag entry = list.getCompound(i);
                String slotName = entry.getString("slot");
                EquipmentSlot entrySlot;
                try {
                    entrySlot = EquipmentSlot.byName(slotName);
                } catch (Exception e) {
                    continue;
                }
                if (entrySlot != eventSlot) continue;
                ResourceLocation attrId;
                try {
                    attrId = new ResourceLocation(entry.getString("attribute"));
                } catch (Exception e) {
                    continue;
                }
                Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(attrId);
                if (attr == null) continue;
                UUID uuid = entry.getUUID("uuid");
                double amount = entry.getDouble("amount");
                AttributeModifier.Operation op;
                try {
                    op = AttributeModifier.Operation.valueOf(entry.getString("operation"));
                } catch (Exception e) {
                    continue;
                }
                String name = entry.getString("name");
                if (name == null || name.isEmpty()) name = "icraft_inherited";
                event.addModifier(attr, new AttributeModifier(uuid, name, amount, op));
            }
        }

        // -----------------------------------------------------------------
        // Pass 2: specialization-comfort baselines (vanilla armor +
        // toughness ADDITION). Only fires for the armor slot the stack
        // is registered to -- Forge only queries getAttributeModifiers
        // for the equipped slot anyway, so the event slot filter is the
        // natural gate.
        // -----------------------------------------------------------------
        if (tag.contains("icraft_baseline_armor", Tag.TAG_DOUBLE) ||
            tag.contains("icraft_baseline_armor", Tag.TAG_INT)) {
            double armorBaseline = tag.getDouble("icraft_baseline_armor");
            if (armorBaseline > 0 && eventSlot == ((com.iridescentcraft.reforging.item.ItemModularArmor) stack.getItem()).getEquipmentSlot()) {
                event.addModifier(Attributes.ARMOR,
                        new AttributeModifier(BASELINE_ARMOR_UUID, "icraft_baseline_armor",
                                armorBaseline, AttributeModifier.Operation.ADDITION));
            }
        }
        if (tag.contains("icraft_baseline_toughness", Tag.TAG_DOUBLE) ||
            tag.contains("icraft_baseline_toughness", Tag.TAG_INT)) {
            double toughBaseline = tag.getDouble("icraft_baseline_toughness");
            if (toughBaseline > 0 && eventSlot == ((com.iridescentcraft.reforging.item.ItemModularArmor) stack.getItem()).getEquipmentSlot()) {
                event.addModifier(Attributes.ARMOR_TOUGHNESS,
                        new AttributeModifier(BASELINE_TOUGH_UUID, "icraft_baseline_toughness",
                                toughBaseline, AttributeModifier.Operation.ADDITION));
            }
        }
    }

    private InheritedAttributeHandler() {}
}
