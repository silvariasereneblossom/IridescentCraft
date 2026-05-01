package com.iridescentcraft.reforging.item;

import com.iridescentcraft.reforging.skin.SkinRegistry;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;
import software.bernie.geckolib.renderer.GeoArmorRenderer;

import java.util.Optional;

/**
 * Client-side IClientItemExtensions implementation for ItemModularArmor.
 *
 * Read tag.Skin from the rendered stack, look up the corresponding
 * GeoArmorRenderer in SkinRegistry, prepare it for this frame, and return
 * it. Mirrors Iron's Spellbooks' ExtendedArmorItem$1 pattern but dispatches
 * by NBT skin tag rather than per-item-class.
 *
 * Fallback: if the stack has no Skin tag, or the skin has no registered
 * renderer factory (e.g. ISS not loaded but a player still has a Cultist
 * skin tag from a prior session), return the original vanilla model.
 * Player sees generic iron-look armor instead of crashing.
 */
public class ItemModularArmorClient implements IClientItemExtensions {

    public static final String SKIN_NBT_KEY = "Skin";

    public static final ItemModularArmorClient INSTANCE = new ItemModularArmorClient();

    private ItemModularArmorClient() {}

    @Override
    public HumanoidModel<?> getHumanoidArmorModel(LivingEntity living,
                                                  ItemStack stack,
                                                  EquipmentSlot slot,
                                                  HumanoidModel<?> original) {
        String skinId = readSkinId(stack);
        if (skinId == null) {
            return original;
        }
        Optional<GeoArmorRenderer<?>> rendererOpt = SkinRegistry.get().getRenderer(skinId);
        if (rendererOpt.isEmpty()) {
            return original;
        }
        GeoArmorRenderer<?> renderer = rendererOpt.get();
        renderer.prepForRender(living, stack, slot, original);
        return renderer;
    }

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
