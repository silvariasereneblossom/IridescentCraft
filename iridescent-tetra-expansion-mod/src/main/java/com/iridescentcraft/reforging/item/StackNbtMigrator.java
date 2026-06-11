package com.iridescentcraft.reforging.item;

import com.iridescentcraft.reforging.replacement.SpecializedReplacementDefinition;
import com.iridescentcraft.reforging.replacement.SpecializedReplacementRegistry;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Idempotent unmangler for ItemModularArmor stacks with doubled-suffix
 * variant keys. Tetra's MaterialOutcomeDefinition.combine() always
 * appends the matched material key to outcome.moduleVariant. Earlier
 * schematic shapes had explicit per-material outcomes
 * (`moduleVariant: "<slot>/iron"`) which then got combine()'d with `iron`
 * again → `<slot>/ironiron` in NBT. Newer schematics use trailing-slash
 * moduleVariant so the combine produces single-suffix, but stacks
 * written during a mid-session schematic version mix can still carry
 * doubled NBT.
 *
 * Variant lookup against current module files fails for mangled keys →
 * workbench renders "Empty" or raw lang text for those slots. This
 * migrator detects the doubled-suffix pattern and rewrites NBT in place
 * to single-suffix form.
 *
 * NBT layout (Tetra):
 *   tag.<slotPath>            = moduleKey (e.g. "chestplate/chest_plate")
 *   tag.<slotPath>_material   = variantKey (e.g. "chestplate/chest_plate/ironiron")
 *
 * Idempotent. Always scans every armor stack on inventoryTick. The work
 * is a HashMap iteration over the stack's tag keys plus a string-split
 * check on values ending in `_material` — sub-microsecond per call. Cost
 * is dominated by the no-op short-circuit on stacks whose tags are
 * already clean (most ticks, post first cleanup).
 *
 * The `iridescent_nbt_migration_v1` sentinel still gets written for
 * telemetry / future migration ordering, but does NOT gate re-runs.
 */
public final class StackNbtMigrator {

    private static final String MIGRATION_TAG = "iridescent_nbt_migration_v1";
    private static final String MATERIAL_SUFFIX = "_material";

    /**
     * Map from old slot-keyed module identity to the new (moduleKey,
     * moduleShortName) pair after the multi-module-per-slot rewrite.
     *
     * Old NBT pattern (Phase A predecessor):
     *   tag["leggings/leg_plate"]            = "leggings/leg_plate"
     *   tag["leggings/leg_plate_material"]   = "leggings/leg_plate/iron"
     *
     * New NBT pattern (Phase A):
     *   tag["leggings/leg_plate"]            = "leggings/full_leg_plate"
     *   tag["leggings/leg_plate_material"]   = "full_leg_plate/iron"
     *
     * For each pre-Phase-A stack, we map the slot to the new default
     * module so the variant lookup hits a real entry. Players can
     * upgrade to a different module via the workbench.
     */
    /**
     * Map from old module short-name to new module short-name for the
     * 2026-05-28 Mage archetype rename:
     *   circlet          -> vestment_crown
     *   robe_chest       -> vestment_chest
     *   robed_leg_plate  -> vestment_leg_plate
     *   robed_boot_sole  -> vestment_boot_sole
     *
     * The split is part of the Vestment + Runed Mage archetype design --
     * vestment_* takes the spot the old robe/circlet modules held (lighter
     * mage cloth focus, max_mana + mana_regen), and Runed will land as a
     * sibling archetype later (heavier mage focus, spell_power + cooldown).
     *
     * Both still bucket as the conceptual ROBE weight class in
     * ItemModularArmor -- the rename only touches module identity, not
     * armor-weight bookkeeping.
     *
     * NBT touch points per slot:
     *   tag["<slot_path>"]            = "<slot_path>/<old_short>"   -> "<slot_path>/<new_short>"
     *   tag["<slot_path>_material"]   = "<old_short>/<material>"    -> "<new_short>/<material>"
     */
    private static final Map<String, String> RENAMED_MODULE_SHORTS = new HashMap<>();
    static {
        RENAMED_MODULE_SHORTS.put("circlet",         "vestment_crown");
        RENAMED_MODULE_SHORTS.put("robe_chest",      "vestment_chest");
        RENAMED_MODULE_SHORTS.put("robed_leg_plate", "vestment_leg_plate");
        RENAMED_MODULE_SHORTS.put("robed_boot_sole", "vestment_boot_sole");
    }

    private static final Map<String, String[]> SLOT_TO_DEFAULT = new HashMap<>();
    static {
        // helmet
        SLOT_TO_DEFAULT.put("helmet/crown",          new String[] {"helmet/basic_crown",     "basic_crown"});
        SLOT_TO_DEFAULT.put("helmet/visor",          new String[] {"helmet/slit_visor",      "slit_visor"});
        SLOT_TO_DEFAULT.put("helmet/crest",          new String[] {"helmet/plain_crest",     "plain_crest"});
        SLOT_TO_DEFAULT.put("helmet/strap",          new String[] {"helmet/leather_strap",   "leather_strap"});
        // chestplate
        SLOT_TO_DEFAULT.put("chestplate/chest_plate",   new String[] {"chestplate/breastplate",     "breastplate"});
        SLOT_TO_DEFAULT.put("chestplate/chest_lining",  new String[] {"chestplate/padded_lining",   "padded_lining"});
        SLOT_TO_DEFAULT.put("chestplate/trim",          new String[] {"chestplate/simple_trim",     "simple_trim"});
        SLOT_TO_DEFAULT.put("chestplate/pauldrons",     new String[] {"chestplate/light_pauldrons", "light_pauldrons"});
        // leggings
        SLOT_TO_DEFAULT.put("leggings/leg_plate",  new String[] {"leggings/full_leg_plate",    "full_leg_plate"});
        SLOT_TO_DEFAULT.put("leggings/belt",       new String[] {"leggings/leather_belt",      "leather_belt"});
        SLOT_TO_DEFAULT.put("leggings/greaves",    new String[] {"leggings/standard_greaves",  "standard_greaves"});
        SLOT_TO_DEFAULT.put("leggings/cuisses",    new String[] {"leggings/padded_cuisses",    "padded_cuisses"});
        // boots
        SLOT_TO_DEFAULT.put("boots/boot_sole",     new String[] {"boots/basic_boot_sole",      "basic_boot_sole"});
        SLOT_TO_DEFAULT.put("boots/boot_lining",   new String[] {"boots/padded_boot_lining",   "padded_boot_lining"});
        SLOT_TO_DEFAULT.put("boots/heel",          new String[] {"boots/standard_heel",        "standard_heel"});
        SLOT_TO_DEFAULT.put("boots/lacing",        new String[] {"boots/leather_lacing",       "leather_lacing"});
    }

    private StackNbtMigrator() {}

    /** @return true if the stack's NBT was modified. */
    public static boolean migrate(ItemStack stack) {
        if (stack.isEmpty()) return false;
        CompoundTag tag = stack.getTag();
        if (tag == null) return false;

        boolean changed = false;
        // Snapshot keys to avoid CME during iteration.
        List<String> keys = new ArrayList<>(tag.getAllKeys());
        for (String key : keys) {
            if (!key.endsWith(MATERIAL_SUFFIX)) continue;
            if (tag.getTagType(key) != net.minecraft.nbt.Tag.TAG_STRING) continue;
            String slotKey = key.substring(0, key.length() - MATERIAL_SUFFIX.length());

            String value = tag.getString(key);
            // Step 1: unmangle doubled suffixes inherited from the
            // schematic-doubling era.
            String fixed = unmangleDoubledSuffix(value);
            // Step 2: if the variant key is 3-segment using the slot path
            // as the prefix (Phase A predecessor), rewrite it to use the
            // new default module's 2-segment shape.
            String[] defaults = SLOT_TO_DEFAULT.get(slotKey);
            if (defaults != null) {
                fixed = mapToNewModule(fixed, slotKey, defaults[1]);
                // Also update the slot tag itself if it still names the
                // old module (which was identical to the slot key).
                String slotValue = tag.getString(slotKey);
                if (slotKey.equals(slotValue)) {
                    tag.putString(slotKey, defaults[0]);
                    changed = true;
                }
            }
            // Step 3: apply the 2026-05-28 Mage archetype rename. Both the
            // slot tag (if it names an old module) and the variant key (if
            // its leading segment names an old module) get rewritten to the
            // new vestment_* short name. Idempotent on already-renamed NBT.
            fixed = applyRenameToVariantKey(fixed);
            String slotValueForRename = tag.getString(slotKey);
            if (!slotValueForRename.isEmpty()) {
                String renamedSlotValue = applyRenameToSlotValue(slotValueForRename);
                if (!renamedSlotValue.equals(slotValueForRename)) {
                    tag.putString(slotKey, renamedSlotValue);
                    changed = true;
                }
            }
            if (!value.equals(fixed)) {
                tag.putString(key, fixed);
                changed = true;
            }
        }
        // Source-armor carryover backfill (2026-06-11): pre-2026-05-30
        // conversions never captured the source set's armor, so they fall
        // back to module-only armor and the ROBE/LIGHT/etc. weight-class
        // carryover never fires. Re-derive it from the skin.
        changed |= backfillSourceArmor(stack, tag);

        // Sentinel bumped to v4 with the Mage archetype rename
        // (robe/circlet -> vestment_*). Existing stacks marked v1/v2/v3 still
        // get scanned at next tick.
        if (tag.getInt(MIGRATION_TAG) < 4) {
            tag.putInt(MIGRATION_TAG, 4);
        }
        return changed;
    }

    /**
     * Backfill {@code icraft_source_armor} / {@code icraft_source_toughness}
     * onto a converted ItemModularArmor stack that predates the source-armor
     * capture ({@link com.iridescentcraft.reforging.replacement.SpecializedReplacementHook}).
     * Without these, {@code InheritedAttributeHandler} has nothing to carry
     * forward, so the piece keeps only its (tiny) module armor — e.g. a robe
     * reforged from an 8-armor set reads ~0.5 instead of ~half.
     *
     * <p>The original source item is gone, but the converted stack still
     * carries its {@code Skin} id. We reverse-map skin + slot -> source item
     * via {@link SpecializedReplacementRegistry}, read that item's vanilla
     * armor/toughness ADDITION (same as the hook does at conversion time),
     * and stamp the raw values. {@code InheritedAttributeHandler} then applies
     * the weight-class fraction (ROBE 50% / LIGHT 65% / ...).
     *
     * <p>One-shot: guarded by {@code icraft_source_armor_checked} so it doesn't
     * re-resolve every tick (and is a no-op once {@code icraft_source_armor}
     * exists, incl. on freshly-converted or back-compat {@code icraft_baseline_armor} stacks).
     */
    private static boolean backfillSourceArmor(ItemStack stack, CompoundTag tag) {
        if (tag.contains("icraft_source_armor") || tag.contains("icraft_baseline_armor")) return false;
        if (tag.getBoolean("icraft_source_armor_checked")) return false;
        if (!(stack.getItem() instanceof ItemModularArmor armor)) return false;

        tag.putBoolean("icraft_source_armor_checked", true);  // attempt once regardless of outcome
        String skinId = ItemModularArmorClient.readSkinId(stack);
        if (skinId == null) return true;  // crafted-from-scratch modular armor has no source — leave it

        EquipmentSlot slot = armor.getEquipmentSlot();
        Item sourceItem = null;
        for (SpecializedReplacementDefinition def : SpecializedReplacementRegistry.get().all()) {
            if (!skinId.equals(def.skinId())) continue;
            ResourceLocation rl = ResourceLocation.tryParse(def.sourceItem());
            if (rl == null) continue;
            Item it = ForgeRegistries.ITEMS.getValue(rl);
            if (it instanceof ArmorItem ai && ai.getEquipmentSlot() == slot) {
                sourceItem = it;
                break;
            }
        }
        if (sourceItem == null) return true;  // skin not in the registry (mod removed?) — give up cleanly

        double armorAdd = 0.0, toughAdd = 0.0;
        try {
            ItemStack src = new ItemStack(sourceItem);
            for (Map.Entry<Attribute, AttributeModifier> e : src.getAttributeModifiers(slot).entries()) {
                AttributeModifier m = e.getValue();
                if (m.getOperation() != AttributeModifier.Operation.ADDITION) continue;
                if (e.getKey() == Attributes.ARMOR) armorAdd += m.getAmount();
                else if (e.getKey() == Attributes.ARMOR_TOUGHNESS) toughAdd += m.getAmount();
            }
        } catch (Exception e) {
            return true;
        }
        if (armorAdd > 0) tag.putDouble("icraft_source_armor", armorAdd);
        if (toughAdd > 0) tag.putDouble("icraft_source_toughness", toughAdd);
        return true;
    }

    /**
     * Rewrite the slot tag value when it names a renamed module.
     * Example: "chestplate/robe_chest" -> "chestplate/vestment_chest".
     * Returns input unchanged for unrelated modules, malformed values, or
     * already-renamed NBT (idempotent).
     */
    static String applyRenameToSlotValue(String slotValue) {
        if (slotValue == null || slotValue.isEmpty()) return slotValue;
        int lastSlash = slotValue.lastIndexOf('/');
        if (lastSlash < 0) return slotValue;
        String moduleShort = slotValue.substring(lastSlash + 1);
        String renamed = RENAMED_MODULE_SHORTS.get(moduleShort);
        if (renamed == null) return slotValue;
        return slotValue.substring(0, lastSlash + 1) + renamed;
    }

    /**
     * Rewrite the leading segment of a variant key when it names a
     * renamed module short.
     * Examples:
     *   "robe_chest/wool"        -> "vestment_chest/wool"
     *   "robed_leg_plate/iron"   -> "vestment_leg_plate/iron"
     *   "circlet/"               -> "vestment_crown/"
     *   "vestment_chest/wool"    -> unchanged (idempotent)
     *   "basic_crown/iron"       -> unchanged (unrelated module)
     */
    static String applyRenameToVariantKey(String variantKey) {
        if (variantKey == null || variantKey.isEmpty()) return variantKey;
        int firstSlash = variantKey.indexOf('/');
        if (firstSlash < 0) return variantKey;
        String shortName = variantKey.substring(0, firstSlash);
        String renamed = RENAMED_MODULE_SHORTS.get(shortName);
        if (renamed == null) return variantKey;
        return renamed + variantKey.substring(firstSlash);
    }

    /**
     * If {@code variantKey} starts with {@code slotKey + "/"} and contains a
     * trailing material segment, rewrite the prefix to the new module's
     * short name. Returns the input unchanged if the pattern doesn't match
     * (already-new keys, empty material, malformed values).
     *
     * Examples (slotKey = "leggings/leg_plate", newModuleShort = "full_leg_plate"):
     *   "leggings/leg_plate/iron"  -> "full_leg_plate/iron"
     *   "leggings/leg_plate/"      -> "full_leg_plate/"
     *   "full_leg_plate/iron"      -> unchanged (already new shape)
     *   ""                         -> unchanged
     */
    static String mapToNewModule(String variantKey, String slotKey, String newModuleShort) {
        if (variantKey == null || variantKey.isEmpty()) return variantKey;
        String prefix = slotKey + "/";
        if (!variantKey.startsWith(prefix)) return variantKey;
        String tail = variantKey.substring(prefix.length()); // "iron" or ""
        return newModuleShort + "/" + tail;
    }

    /**
     * Detect a doubled trailing segment: "<base>/<X><X>" where X is
     * non-empty. Returns "<base>/<X>" if the trailing segment splits
     * cleanly into two equal halves, otherwise the original string.
     *
     * Examples:
     *   chestplate/chest_plate/ironiron      -> chestplate/chest_plate/iron
     *   boots/heel/wool_magentawool_magenta  -> boots/heel/wool_magenta
     *   helmet/crown/aethersteelaethersteel  -> helmet/crown/aethersteel
     *   helmet/visor/                        (no trailing segment) unchanged
     *   helmet/crown/iron                    (single suffix already) unchanged
     */
    static String unmangleDoubledSuffix(String variantKey) {
        if (variantKey == null) return variantKey;
        int lastSlash = variantKey.lastIndexOf('/');
        if (lastSlash < 0) return variantKey;
        String suffix = variantKey.substring(lastSlash + 1);
        int len = suffix.length();
        if (len < 2 || (len & 1) != 0) return variantKey;
        int half = len / 2;
        String first = suffix.substring(0, half);
        String second = suffix.substring(half);
        if (!first.equals(second)) return variantKey;
        return variantKey.substring(0, lastSlash + 1) + first;
    }
}
