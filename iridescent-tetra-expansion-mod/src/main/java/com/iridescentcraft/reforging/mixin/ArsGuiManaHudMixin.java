package com.iridescentcraft.reforging.mixin;

import com.hollingsworth.arsnouveau.client.gui.GuiManaHUD;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Hide Ars's mana HUD bar. With ArsManaCapMixin in place, the Ars cap
 * always returns the ISS mana value -- the Ars bar would visually
 * duplicate the ISS bar. ISS is canonical for the unified pool.
 *
 * Inject-cancellable rather than @Overwrite so a future Ars rename of
 * shouldDisplayBar surfaces as a clean mixin-apply warning instead of a
 * fragile method replacement.
 */
@Mixin(value = GuiManaHUD.class, remap = false)
public abstract class ArsGuiManaHudMixin {

    @Inject(method = "shouldDisplayBar", at = @At("HEAD"), cancellable = true, remap = false)
    private static void icraft_unifiedPool_neverShowArsBar(CallbackInfoReturnable<Boolean> cir) {
        cir.setReturnValue(false);
    }
}
