package com.iridescentcraft.reforging.mixin;

import com.iridescentcraft.reforging.memory.TetraDataSharing;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import se.mickelus.tetra.module.schematic.OutcomeMaterial;

/**
 * One list of stack copies per (material, count) for Tetra's expanded schematic
 * outcomes, instead of one per outcome: 28,307 lists down to about 1,479 on the
 * server, about 21 MB (RAM audit 2026-10-30, scope T2). See
 * {@link TetraDataSharing}.
 *
 * <p>{@code offsetCount} is called on the material's own {@code OutcomeMaterial}
 * and returns a new one whose stacks are copies with the new count: the copies of
 * two calls with the same source and the same resulting count are equal, so the
 * second one takes the first one's list. The returned object itself stays new.
 *
 * <p>Tetra is All Rights Reserved: nothing of it is copied here.
 */
@Mixin(value = OutcomeMaterial.class, remap = false)
public abstract class OutcomeMaterialShareMixin {

    @Inject(method = "offsetCount", at = @At("RETURN"))
    private void icraft$shareStacks(float multiplier, int offset, CallbackInfoReturnable<OutcomeMaterial> cir) {
        OutcomeMaterial result = cir.getReturnValue();
        OutcomeMaterialAccessor stacks = (OutcomeMaterialAccessor) result;
        stacks.icraft$setItemStacks(TetraDataSharing.shareStacks(this, result.count, stacks.icraft$getItemStacks()));
    }
}
