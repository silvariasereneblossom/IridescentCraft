package com.iridescentcraft.reforging.mixin;

import com.iridescentcraft.reforging.memory.SlotCopyVariants;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import se.mickelus.tetra.module.ModuleRegistry;
import se.mickelus.tetra.module.data.ModuleData;
import se.mickelus.tetra.module.data.VariantData;

/**
 * The left and right (or other slot-suffix) copies of a Tetra module share their
 * expanded variants: about 4 MB on each side (RAM audit 2026-10-30, scope T4).
 * See {@link SlotCopyVariants}.
 *
 * <p>Tetra is All Rights Reserved: nothing of it is copied here; its own
 * expansion still does all the work, once per template.
 */
@Mixin(value = ModuleRegistry.class, remap = false)
public abstract class ModuleRegistryShareMixin {

    @Unique
    private final SlotCopyVariants icraft$slotCopies = new SlotCopyVariants();

    @Shadow
    private void expandMaterialVariants(ModuleData moduleData) {
        throw new AssertionError();
    }

    @Inject(method = "setupModules", at = @At("HEAD"))
    private void icraft$beginModules(CallbackInfo ci) {
        icraft$slotCopies.begin();
    }

    @Inject(method = "setupModules", at = @At("RETURN"))
    private void icraft$endModules(CallbackInfo ci) {
        icraft$slotCopies.end();
    }

    @Redirect(method = "setupModule",
            at = @At(value = "INVOKE",
                    target = "Lse/mickelus/tetra/module/ModuleRegistry;expandMaterialVariants(Lse/mickelus/tetra/module/data/ModuleData;)V"))
    private void icraft$expandOncePerTemplate(ModuleRegistry registry, ModuleData data) {
        VariantData[] templates = data.variants;
        VariantData[] done = icraft$slotCopies.find(templates);
        if (done != null) {
            data.variants = done;
            return;
        }
        expandMaterialVariants(data);
        icraft$slotCopies.remember(templates, data.variants);
    }
}
