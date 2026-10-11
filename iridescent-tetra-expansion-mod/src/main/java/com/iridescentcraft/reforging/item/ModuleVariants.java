package com.iridescentcraft.reforging.item;

import net.minecraft.world.item.ItemStack;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.ItemModuleMajor;
import se.mickelus.tetra.module.data.VariantData;

/**
 * Shared reader for "what is installed in this major slot" on the modular
 * items in this jar.
 *
 * <p>Every modular item here derives part of its identity from the variant
 * key of ONE major slot: the armor pieces and the wand read their material
 * from it ({@code "full_leg_plate/iron"} -> {@code "iron"}), the two spell
 * books read their source book ({@code "iss_core/diamond_spell_book"} ->
 * {@code "diamond_spell_book"}). The lookup used to be copy-pasted into each
 * item class; it lives here so the four cannot drift apart.
 */
public final class ModuleVariants {

    private ModuleVariants() {}

    /**
     * The text after the last {@code '/'} of the variant key installed in
     * {@code slotName}, or null when the stack is not modular, the slot is
     * empty, or the key has no (or an empty) trailing segment.
     *
     * <p>Only the named slot is considered, so the result never depends on
     * the iteration order of the other majors. Never throws: a Tetra data
     * miss (modules not loaded yet, unknown variant) reads as null.
     */
    public static String majorVariantSuffix(ItemStack stack, String slotName) {
        if (slotName == null || !(stack.getItem() instanceof IModularItem item)) return null;
        try {
            ItemModuleMajor[] majors = item.getMajorModules(stack);
            if (majors == null) return null;
            for (ItemModuleMajor m : majors) {
                if (m == null) continue;
                if (!slotName.equals(m.getSlot())) continue;
                VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                return v.key.substring(slash + 1);
            }
        } catch (Throwable t) {
            // fall through to null
        }
        return null;
    }
}
