package com.iridescentcraft.reforging.item;

import net.minecraft.world.item.ItemStack;

/**
 * Common (both-dist) access to the reforged-armor skin tag.
 *
 * Lives apart from {@link ItemModularArmorClient} on purpose: that class is
 * client-only (it imports {@code net.minecraft.client.model.HumanoidModel}),
 * while the skin tag is read and written from common / server code -- set
 * bonuses, attribute aggregation, NBT migration, the Tetra replacement hook,
 * the conversion recipe. Keeping these two members there made a dedicated
 * server load a client class just to read a string out of NBT.
 */
public final class SkinNbt {

    public static final String SKIN_NBT_KEY = "Skin";

    private SkinNbt() {}

    /** Read the Skin tag from a stack's NBT. Returns null if absent. */
    public static String readSkinId(ItemStack stack) {
        if (stack == null || stack.isEmpty()) return null;
        if (!stack.hasTag()) return null;
        var tag = stack.getTag();
        if (tag == null || !tag.contains(SKIN_NBT_KEY)) return null;
        String value = tag.getString(SKIN_NBT_KEY);
        return value.isEmpty() ? null : value;
    }
}
