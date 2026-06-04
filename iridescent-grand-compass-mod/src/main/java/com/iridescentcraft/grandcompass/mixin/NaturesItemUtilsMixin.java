package com.iridescentcraft.grandcompass.mixin;

import com.chaosthedude.naturescompass.NaturesCompass;
import com.chaosthedude.naturescompass.util.ItemUtils;
import com.iridescentcraft.grandcompass.GrandCompass;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Nature's Compass mirror of {@link ExplorersItemUtilsMixin}: make
 * {@code ItemUtils.getHeldItem(player, naturesCompass)} also return a held Grand
 * Compass so a biome search opened from the Grand Compass writes its result back
 * onto our stack. Fail-safe (require = 0).
 */
@Mixin(value = ItemUtils.class, remap = false)
public class NaturesItemUtilsMixin {

    @Inject(method = "getHeldItem", at = @At("HEAD"), cancellable = true, require = 0, remap = false)
    private static void grandcompass$redirect(Player player, Item item, CallbackInfoReturnable<ItemStack> cir) {
        Item nc = NaturesCompass.naturesCompass;
        if (item != nc) return;
        if (player.getMainHandItem().getItem() == nc || player.getOffhandItem().getItem() == nc) return;
        Item grand = GrandCompass.GRAND_COMPASS.get();
        if (player.getMainHandItem().getItem() == grand) {
            cir.setReturnValue(player.getMainHandItem());
        } else if (player.getOffhandItem().getItem() == grand) {
            cir.setReturnValue(player.getOffhandItem());
        }
    }
}
