package com.iridescentcraft.grandcompass.mixin;

import com.chaosthedude.explorerscompass.ExplorersCompass;
import com.chaosthedude.explorerscompass.util.ItemUtils;
import com.iridescentcraft.grandcompass.GrandCompass;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Explorer's Compass resolves the compass to write a search result onto via
 * {@code ItemUtils.getHeldItem(player, explorersCompass)} — i.e. it only works
 * if the player holds THEIR item. This makes that lookup also return a held
 * Grand Compass, so a structure search opened from the Grand Compass writes its
 * result back onto our stack. Fail-safe (require = 0): a miss just means the
 * Grand Compass won't receive the result, never a crash.
 */
@Mixin(value = ItemUtils.class, remap = false)
public class ExplorersItemUtilsMixin {

    @Inject(method = "getHeldItem", at = @At("HEAD"), cancellable = true, require = 0, remap = false)
    private static void grandcompass$redirect(Player player, Item item, CallbackInfoReturnable<ItemStack> cir) {
        Item ec = ExplorersCompass.explorersCompass;
        if (item != ec) return;
        // Real Explorer's Compass in hand -> let native behaviour run.
        if (player.getMainHandItem().getItem() == ec || player.getOffhandItem().getItem() == ec) return;
        Item grand = GrandCompass.GRAND_COMPASS.get();
        if (player.getMainHandItem().getItem() == grand) {
            cir.setReturnValue(player.getMainHandItem());
        } else if (player.getOffhandItem().getItem() == grand) {
            cir.setReturnValue(player.getOffhandItem());
        }
    }
}
