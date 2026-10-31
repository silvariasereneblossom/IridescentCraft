package com.iridescentcraft.reforging.mixin;

import com.iridescentcraft.reforging.memory.TetraDataSharing;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import se.mickelus.tetra.module.SchematicRegistry;

/**
 * Brackets Tetra's schematic setup (start and every {@code /reload}, both sides)
 * so {@link TetraDataSharing} logs one line per setup: how many outcomes were
 * expanded and how many share stacks or a tool requirement. That line is the
 * proof in a boot log that the two sharing mixins ran.
 */
@Mixin(value = SchematicRegistry.class, remap = false)
public abstract class SchematicRegistryMemoryMixin {

    @Inject(method = "setupSchematics", at = @At("HEAD"))
    private void icraft$beginSchematics(CallbackInfo ci) {
        TetraDataSharing.beginSchematics();
    }

    @Inject(method = "setupSchematics", at = @At("RETURN"))
    private void icraft$endSchematics(CallbackInfo ci) {
        TetraDataSharing.endSchematics();
    }
}
