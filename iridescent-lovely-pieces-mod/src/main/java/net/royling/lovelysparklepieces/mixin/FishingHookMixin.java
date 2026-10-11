package net.royling.lovelysparklepieces.mixin;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.FishingHook;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * High-Quality Fishing Line: 20% of the ticks a hook spends waiting count double ("speeds up the bite
 * count by 20%").
 *
 * IRIDESCENT rewrite of the upstream 1.21 port:
 *  - no local capture. It captured seven locals of {@code tick()} with CAPTURE_FAILSOFT while the config
 *    demanded every injector succeed, so any local-table difference would have been a crash; the owner is
 *    read through {@code getPlayerOwner()} instead and the injector is {@code require = 0}.
 *  - never counts a timer down to 0 itself. {@code catchingFish} (the call this runs in front of) only
 *    fires the bite / starts the approach when IT takes the timer from 1 to 0; a timer already at 0 falls
 *    through to "pick a new 5-30 s wait". The upstream decrement could land on 0 first, so one bite in
 *    five was thrown away and the wait restarted - the line made fishing slower, not faster.
 *
 * Works for Aquaculture rods too: its bobber extends FishingHook, calls {@code super.tick()} for water
 * fishing and uses these same two timers.
 */
@Mixin(FishingHook.class)
public abstract class FishingHookMixin {
    @Shadow
    private int timeUntilHooked;
    @Shadow
    private int timeUntilLured;

    @Shadow
    @Nullable
    public abstract Player getPlayerOwner();

    @Inject(
            method = "tick()V",
            at = @At(
                    value = "INVOKE",
                    target = "Lnet/minecraft/world/entity/projectile/FishingHook;catchingFish(Lnet/minecraft/core/BlockPos;)V"),
            require = 0
    )
    private void lspFishingLine(CallbackInfo ci) {
        Player player = this.getPlayerOwner();
        if (player == null || player.level().isClientSide) {
            return;
        }
        // cheap roll first, curio lookup only on the ticks that can do something
        if (player.getRandom().nextFloat() >= 0.2F) {
            return;
        }
        if (this.timeUntilHooked > 1) {
            if (ModCurios.hasCurio(player, ModCurios.HIGH_QUALITY_FISHING_LINE.get())) {
                this.timeUntilHooked--;
            }
        } else if (this.timeUntilHooked <= 0 && this.timeUntilLured > 1) {
            if (ModCurios.hasCurio(player, ModCurios.HIGH_QUALITY_FISHING_LINE.get())) {
                this.timeUntilLured--;
            }
        }
    }
}
