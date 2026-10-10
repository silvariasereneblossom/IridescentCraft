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
 *
 * CLIENT-ONLY class (imports net.minecraft.client.*). Nothing common may
 * live here: the skin-tag key + reader that used to are in {@link SkinNbt}.
 */
public class ItemModularArmorClient implements IClientItemExtensions {

    public static final ItemModularArmorClient INSTANCE = new ItemModularArmorClient();

    private ItemModularArmorClient() {}

    @Override
    public HumanoidModel<?> getHumanoidArmorModel(LivingEntity living,
                                                  ItemStack stack,
                                                  EquipmentSlot slot,
                                                  HumanoidModel<?> original) {
        String skinId = SkinNbt.readSkinId(stack);
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
}
