package net.royling.lovelysparklepieces.mixin;

import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.LocalCapture;

@Mixin(FishingHook.class)
public abstract class FishingHookMixin {
    @Shadow
    private int timeUntilHooked;
    @Shadow
    private int timeUntilLured;

    @Inject(
            method = "tick()V",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/world/entity/projectile/FishingHook;catchingFish(Lnet/minecraft/core/BlockPos;)V"),
            locals = LocalCapture.CAPTURE_FAILSOFT
    )
    private void onFishingTick(CallbackInfo ci, Player player, float f, BlockPos blockpos, FluidState fluidstate, boolean flag, Vec3 vec3, double d0) {
        if (((Entity) (Object) this).level().isClientSide) return;
        if (player != null) {
            if (ModCurios.hasCurio(player, ModCurios.HIGH_QUALITY_FISHING_LINE.get())) {
                if (player.getRandom().nextFloat() < 0.2F) {
                    if (this.timeUntilHooked > 0) {
                        this.timeUntilHooked--;
                    } else if (this.timeUntilLured > 0) {
                        this.timeUntilLured--;
                    }

                }
            }
        }
    }

}
