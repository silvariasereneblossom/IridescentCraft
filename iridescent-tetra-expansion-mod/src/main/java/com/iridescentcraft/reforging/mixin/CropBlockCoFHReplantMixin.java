package com.iridescentcraft.reforging.mixin;

import cofh.lib.common.block.CropBlockCoFH;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Override {@link CropBlockCoFH#getPostHarvestAge()} to return 0 instead of -1
 * so right-click harvest on Thermal Cultivation crops auto-replants.
 *
 * <p>Default CoFH behavior: {@code getPostHarvestAge() == -1} -> harvest()
 * follows the "destroy block + drop seeds" path. Tester report: "some
 * Thermal crops don't harvest properly - the crop is removed, it doesn't
 * auto-replant." Confirmed via bytecode of CropBlockCoFH.harvest: the
 * {@code iflt} branch at offset 23 jumps to a destroy-block path when
 * getPostHarvestAge() returns < 0.
 *
 * <p>By returning 0, we route harvest into the alternative branch
 * (offsets 26-83): drop {@code 2 + binomialDist(fortune, 0.5)} crop items
 * and reset block state to age 0 via {@code level.setBlock(pos,
 * getStateForAge(0), 2)}. The crop replants in place; the player can
 * keep right-click harvesting on cooldown.
 *
 * <p>Why a constant 0 instead of {@code MAX_AGE - 1} or similar: matches
 * the {@code CropBlockPerennial} pattern (which IS overridden upstream
 * to return a positive integer). Resetting to age 0 means the player
 * has to wait for full re-growth -- not an instant-yield exploit. If we
 * wanted to skip the first growth tick, returning 1 would shorten the
 * cycle by ~1 tick.
 *
 * <p>Affects all CoFH-based crop blocks across the modpack: Thermal
 * Cultivation's amaranth, barley, bell_pepper, coffee, corn, eggplant,
 * flax, frost_melon, green_bean, hops, onion, peanut, radish, rice,
 * sadiroot, spinach, strawberry, tea, tomato. No other installed mod
 * extends {@code CropBlockCoFH} as of 2026-05-13.
 */
@Mixin(value = CropBlockCoFH.class, remap = false)
public class CropBlockCoFHReplantMixin {

    @Inject(method = "getPostHarvestAge", at = @At("HEAD"), cancellable = true)
    private void icraft_alwaysReplant(CallbackInfoReturnable<Integer> cir) {
        cir.setReturnValue(0);
    }
}
