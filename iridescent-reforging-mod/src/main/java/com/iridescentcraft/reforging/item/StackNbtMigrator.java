package com.iridescentcraft.reforging.item;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.List;

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
            String value = tag.getString(key);
            String fixed = unmangleDoubledSuffix(value);
            if (!value.equals(fixed)) {
                tag.putString(key, fixed);
                changed = true;
            }
        }
        // Sentinel bumped to v2 so older stacks already marked v1 still
        // get scanned once at next tick (in case they slipped through
        // when the gate was enforced). Subsequent ticks are no-ops on
        // already-clean stacks.
        if (tag.getInt(MIGRATION_TAG) < 2) {
            tag.putInt(MIGRATION_TAG, 2);
        }
        return changed;
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
