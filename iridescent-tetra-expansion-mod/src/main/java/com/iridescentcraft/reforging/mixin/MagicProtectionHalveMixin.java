package com.iridescentcraft.reforging.mixin;

import cofh.ensorcellation.common.enchantment.ProtectionEnchantmentMagic;
import net.minecraft.world.damagesource.DamageSource;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Halve Magic Protection ({@code ensorcellation:magic_protection}).
 *
 * <p>Design (Silvaria, 2026-06-19): CoFH's {@code ProtectionEnchantmentMagic}
 * returns {@code level * 2} EPF for {@code witch_resistant_to}-tagged (magic)
 * damage — ~4% reduction per level under ApothicAttributes' Protection Formula.
 * Operator balance pass: halve it to ~2%/level. There is no CoFH config for the
 * factor (it's hardcoded in the jar), so a mixin is the only knob.
 *
 * <p>Injecting at every RETURN and halving the value covers all branches with
 * one hook: the {@code return 0} paths stay 0, and {@code level * 2} (always
 * even) halves exactly to {@code level}. This flows through the same
 * {@code EnchantmentHelper.getDamageProtection} sum as everything else, so the
 * effect is a clean ~50% cut to Magic Protection's contribution.
 *
 * <p>remap = TRUE (default): {@code getDamageProtection} is a vanilla
 * {@code Enchantment} override, so the method reference is SRG-remapped even
 * though the target class is a (non-remapped) CoFH class. This differs from the
 * sibling {@code CropBlockCoFHReplantMixin} / {@code ArsManaCapMixin}, which
 * target mod-OWN methods and therefore use {@code remap = false}.
 */
@Mixin(ProtectionEnchantmentMagic.class)
public abstract class MagicProtectionHalveMixin {

    @Inject(method = "getDamageProtection", at = @At("RETURN"), cancellable = true)
    private void icraft$halveMagicProtection(int level, DamageSource source, CallbackInfoReturnable<Integer> cir) {
        cir.setReturnValue(cir.getReturnValueI() / 2);
    }
}
