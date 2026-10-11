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

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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

    /** Deterministic PER-SLOT UUID seeds so vanilla de-dupes our modifiers
     *  across query calls. Different from the inherited-modifier UUIDs
     *  (which are copied from the source).
     *
     *  Per-slot matters: a single constant UUID across all four armor
     *  slots collides on the player's AttributeInstance — vanilla's equip
     *  flow is remove-then-add by UUID, so the second converted piece's
     *  carryover silently REPLACED the first instead of stacking (same
     *  collision family as the Tetra fixIdentifiers issue fixed in
     *  ItemModularArmor.slotScopeIdentifiers). Indexed by
     *  EquipmentSlot.ordinal(): FEET=2, LEGS=3, CHEST=4, HEAD=5.
     *
     *  Built once: this handler runs for every attribute query of every
     *  reforged piece (equip, durability change, each tooltip frame), and a
     *  String.format + UUID parse per call allocated every time. The VALUES are
     *  the same ones the per-call version produced -- do not change the
     *  format strings, vanilla matches equip/unequip by these ids. */
    private static final UUID[] BASELINE_ARMOR_UUIDS = slotUuids("a1c9e204-0000-0000-%04x-000000000001");
    private static final UUID[] BASELINE_TOUGH_UUIDS = slotUuids("a1c9e204-0000-0000-%04x-000000000002");

    private static UUID[] slotUuids(String format) {
        EquipmentSlot[] slots = EquipmentSlot.values();
        UUID[] out = new UUID[slots.length];
        for (EquipmentSlot slot : slots) {
            out[slot.ordinal()] = UUID.fromString(String.format(format, slot.ordinal() + 1));
        }
        return out;
    }

    private static UUID baselineArmorUuid(EquipmentSlot slot) {
        return BASELINE_ARMOR_UUIDS[slot.ordinal()];
    }

    private static UUID baselineToughUuid(EquipmentSlot slot) {
        return BASELINE_TOUGH_UUIDS[slot.ordinal()];
    }

    /**
     * Attribute id string (as stored in {@code icraft_inherited_modifiers})
     * -> registry object, so pass 1 does not parse a ResourceLocation and
     * query the registry per entry per call. Only hits are cached; an id
     * that does not resolve (source mod removed) is looked up again and
     * skipped again, exactly as before.
     */
    private static final Map<String, Attribute> INHERITED_ATTRIBUTES = new ConcurrentHashMap<>();

    private static Attribute resolveInheritedAttribute(String id) {
        Attribute cached = INHERITED_ATTRIBUTES.get(id);
        if (cached != null) return cached;
        ResourceLocation attrId = ResourceLocation.tryParse(id);
        if (attrId == null) return null;
        Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(attrId);
        if (attr != null) INHERITED_ATTRIBUTES.put(id, attr);
        return attr;
    }

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
                // Slot names are unique, so comparing the name is the same
                // test as resolving it (an unknown name matches no slot).
                if (!eventSlot.getName().equals(entry.getString("slot"))) continue;
                Attribute attr = resolveInheritedAttribute(entry.getString("attribute"));
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
        // Pass 2: weight-class armor/toughness carryover. The hook stores the
        // RAW source armor + toughness (icraft_source_armor/_toughness); here
        // we carry weightClass% x source based on the CURRENT major's weight
        // class -- so a converted piece keeps MORE armor when built HEAVY
        // (100%) than ROBE (50%). Dynamic: rebuilding the major re-reads it.
        // Additive on top of module armor -- tanks out-armor the source vs
        // fodder, by design. Only fires for the equipped slot.
        //
        // Back-compat: pre-2026-05-30 conversions stored a pre-multiplied flat
        // icraft_baseline_armor (25%). Honor it as-is when the new source key
        // is absent, so old converted items don't lose their baseline.
        // -----------------------------------------------------------------
        ItemModularArmor armorItem = (ItemModularArmor) stack.getItem();
        if (eventSlot == armorItem.getEquipmentSlot()) {
            double pct = carryoverPct(armorItem.getArmorWeight(stack));

            // -- Armor --
            if (tag.contains("icraft_source_armor", Tag.TAG_DOUBLE)
                    || tag.contains("icraft_source_armor", Tag.TAG_INT)) {
                double carried = tag.getDouble("icraft_source_armor") * pct;
                if (carried > 0) {
                    event.addModifier(Attributes.ARMOR, new AttributeModifier(
                            baselineArmorUuid(eventSlot), "icraft_baseline_armor",
                            carried, AttributeModifier.Operation.ADDITION));
                }
            } else if (tag.contains("icraft_baseline_armor", Tag.TAG_DOUBLE)
                    || tag.contains("icraft_baseline_armor", Tag.TAG_INT)) {
                double legacy = tag.getDouble("icraft_baseline_armor");
                if (legacy > 0) {
                    event.addModifier(Attributes.ARMOR, new AttributeModifier(
                            baselineArmorUuid(eventSlot), "icraft_baseline_armor",
                            legacy, AttributeModifier.Operation.ADDITION));
                }
            }

            // -- Toughness --
            if (tag.contains("icraft_source_toughness", Tag.TAG_DOUBLE)
                    || tag.contains("icraft_source_toughness", Tag.TAG_INT)) {
                double carried = tag.getDouble("icraft_source_toughness") * pct;
                if (carried > 0) {
                    event.addModifier(Attributes.ARMOR_TOUGHNESS, new AttributeModifier(
                            baselineToughUuid(eventSlot), "icraft_baseline_toughness",
                            carried, AttributeModifier.Operation.ADDITION));
                }
            } else if (tag.contains("icraft_baseline_toughness", Tag.TAG_DOUBLE)
                    || tag.contains("icraft_baseline_toughness", Tag.TAG_INT)) {
                double legacy = tag.getDouble("icraft_baseline_toughness");
                if (legacy > 0) {
                    event.addModifier(Attributes.ARMOR_TOUGHNESS, new AttributeModifier(
                            baselineToughUuid(eventSlot), "icraft_baseline_toughness",
                            legacy, AttributeModifier.Operation.ADDITION));
                }
            }
        }
    }

    /** Carryover fraction of source armor/toughness by the current major's
     *  weight class. Heavier builds keep more of the converted item's raw
     *  defense; robe builds trade it for magic. Null (no major installed
     *  yet) defaults to MEDIUM. */
    private static double carryoverPct(ItemModularArmor.ArmorWeight weight) {
        if (weight == null) return 0.75;
        return switch (weight) {
            case ROBE   -> 0.50;
            case LIGHT  -> 0.65;
            case MEDIUM -> 0.75;
            case HEAVY  -> 1.00;
        };
    }

    private InheritedAttributeHandler() {}
}
