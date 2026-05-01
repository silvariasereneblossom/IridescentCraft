package com.iridescentcraft.reforging.item;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;

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
            if (!value.equals(fixed)) {
                tag.putString(key, fixed);
                changed = true;
            }
        }
        // Sentinel bumped to v3 with the multi-module-per-slot rewrite.
        // Existing stacks marked v1/v2 still get scanned at next tick.
        if (tag.getInt(MIGRATION_TAG) < 3) {
            tag.putInt(MIGRATION_TAG, 3);
        }
        return changed;
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
