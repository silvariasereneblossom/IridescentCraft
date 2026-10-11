package com.seniors.justlevelingfork.mixin;

import com.seniors.justlevelingfork.registry.RegistryAttributes;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

// Iridescent fork: NOT LISTED in justlevelingfork.mixins.json any more (kept as source only).
//
// The two upstream `onAddEffect` injects were REMOVED from this class: they cancelled vanilla
// LivingEntity#addEffect for EVERY player and re-implemented it for the retired Lion Heart / Alchemy
// Manipulation skills -- rebuilding each effect with the 3-arg constructor (dropping ambient / visible /
// showIcon, curative items and the hidden effect), passing the player itself as the effect source, and
// calling onEffectUpdated with the INCOMING effect instead of the merged one (a weaker effect applied over a
// stronger one made the attribute bonus + client display use the weaker amplifier). Vanilla handles effects
// again. Do not re-add them.
//
// What is left only serves retired upstream features, so the whole mixin is unlisted:
//   - getDamageAfterArmorAbsorb: scales INDIRECT damage by justlevelingfork:magic_resist. The Magic Resist passive
//     is gone (RegistryPassives) and nothing in the pack grants the attribute, so it never did anything.
//   - getVisibilityPercent: Stealth Mastery (RegistrySkills.STEALTH_MASTERY == null).
@Mixin({LivingEntity.class})
public abstract class MixLivingEntity {
    @Unique
    LivingEntity this$class = (LivingEntity) (Object) this;

    @ModifyVariable(
            method = {"getDamageAfterArmorAbsorb"},
            at = @At("HEAD"),
            argsOnly = true
    )
    private float additionalEntityAttributes$reduceMagicDamage(float damage, DamageSource source) {
        AttributeInstance magicResist = this$class.getAttribute(RegistryAttributes.MAGIC_RESIST.get());
        if (magicResist == null) {
            return damage;
        } else {
            if (source.isIndirect() && magicResist.getValue() > 0.0D) {
                damage = (float)((double)damage - (double)damage * magicResist.getValue());
            }

            return damage;
        }
    }

    @Inject(
            method = {"getVisibilityPercent"},
            at = {@At("TAIL")},
            cancellable = true
    )
    public void getVisibilityPercent(Entity source, CallbackInfoReturnable<Double> cir) {
        double visibilityPercent = cir.getReturnValue();
        LivingEntity var6 = this.this$class;
        if (var6 instanceof ServerPlayer) {
            ServerPlayer player = (ServerPlayer)var6;
            if(RegistrySkills.STEALTH_MASTERY != null){
                double isSneaking = player.isShiftKeyDown() ? RegistrySkills.STEALTH_MASTERY.get().getValue()[0] : RegistrySkills.STEALTH_MASTERY.get().getValue()[1];
                if (RegistrySkills.STEALTH_MASTERY.get().isEnabled(player)) {
                    cir.setReturnValue(visibilityPercent * isSneaking / 100.0D);
                }
            }
        }

    }
}
