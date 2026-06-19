package com.iridescentcraft.reforging.mixin;

import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.item.enchantment.ProtectionEnchantment;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * General Protection ({@code minecraft:protection}, the TYPE.ALL branch) no
 * longer contributes Enchantment Protection Factor / % damage reduction.
 *
 * <p>Design (Silvaria, 2026-06-19, mage-armor rebalance follow-up): stacked
 * %-reduction sources compound multiplicatively toward immunity — the root
 * cause of old unkillable endgame tanks. We convert general Protection into a
 * FLAT generic.armor source (+0.75 armor/level, granted in
 * {@code kubejs/server_scripts/armor_weight.js}) so it feeds the single
 * diminishing armor curve (ApothicAttributes {@code "Armor Formula"}) instead
 * of stacking. Zeroing the EPF here is the suppress half of that swap; the
 * armor grant is the add half.
 *
 * <p>Vanilla {@code ProtectionEnchantment.getDamageProtection} returns
 * {@code level} for TYPE.ALL and is summed by
 * {@code EnchantmentHelper.getDamageProtection} into the "protPoints" that
 * ApothicAttributes' {@code @Overwrite} of {@code CombatRules.getDamageAfterMagicAbsorb}
 * turns into a % via the configurable Protection Formula. Returning 0 for
 * TYPE.ALL removes that contribution cleanly and upstream of prot pierce/shred.
 *
 * <p>Scope: ONLY the TYPE.ALL instance (= {@code minecraft:protection}).
 * FIRE / FALL (Feather Falling) / EXPLOSION (Blast) / PROJECTILE protection are
 * untouched and keep their typed % reduction. Modded protections that don't
 * extend {@code ProtectionEnchantment} (Origins water-protection, Ensorcellation
 * magic-protection) are unaffected by this mixin.
 *
 * <p>remap = TRUE (default): {@code getDamageProtection} + the {@code type}
 * field are vanilla members and must be SRG-remapped, unlike the mod-own
 * methods the other mixins in this mod target with {@code remap = false}.
 */
@Mixin(ProtectionEnchantment.class)
public abstract class ProtectionFlatArmorMixin {

    @Shadow
    @Final
    ProtectionEnchantment.Type type;

    @Inject(method = "getDamageProtection", at = @At("HEAD"), cancellable = true)
    private void icraft$generalProtectionGrantsNoEpf(int level, DamageSource source, CallbackInfoReturnable<Integer> cir) {
        if (this.type == ProtectionEnchantment.Type.ALL) {
            cir.setReturnValue(0);
        }
    }
}
