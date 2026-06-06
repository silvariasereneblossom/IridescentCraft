package net.royling.lovelysparklepieces.ModEffect;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;

public class OverheatEffect extends MobEffect {
    protected OverheatEffect(MobEffectCategory category, int color) {
        super(category, color);
    }

    @Override
    public boolean isInstantenous() {
        return false;
    }

    @Override
    public void applyEffectTick(LivingEntity livingEntity, int amplifier) {
        // Effect applied
    }
}
