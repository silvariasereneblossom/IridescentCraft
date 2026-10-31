package com.iridescentcraft.reforging.mixin;

import com.iridescentcraft.reforging.memory.TetraDataSharing;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import se.mickelus.tetra.module.data.MaterialData;
import se.mickelus.tetra.module.schematic.MaterialOutcomeDefinition;
import se.mickelus.tetra.module.schematic.OutcomeDefinition;

/**
 * Equal tool requirements of Tetra's expanded schematic outcomes become one
 * object: 23,006 down to about 71 on the server, about 5.6 MB (RAM audit
 * 2026-10-30, scope T3). The injected repair definitions take the outcome's
 * requirement object, so they share it too. See {@link TetraDataSharing}.
 *
 * <p>Tetra is All Rights Reserved: nothing of it is copied here.
 */
@Mixin(value = MaterialOutcomeDefinition.class, remap = false)
public abstract class MaterialOutcomeToolsMixin {

    @Inject(method = "combine", at = @At("RETURN"))
    private void icraft$shareTools(MaterialData material, CallbackInfoReturnable<OutcomeDefinition> cir) {
        OutcomeDefinition outcome = cir.getReturnValue();
        outcome.requiredTools = TetraDataSharing.shareTools(outcome.requiredTools);
    }
}
