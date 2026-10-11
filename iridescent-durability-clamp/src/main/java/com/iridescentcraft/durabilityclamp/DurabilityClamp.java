package com.iridescentcraft.durabilityclamp;

import net.minecraftforge.fml.common.Mod;

/**
 * Iridescent Durability Clamp — @Mod entrypoint.
 *
 * The mod's entire behavior lives in the two mixins registered through
 * {@code iridescent_durability_clamp.mixins.json}:
 *   - ItemStackHurtAndBreakMixin: clamps the amount at HEAD of
 *     {@code ItemStack.hurtAndBreak} so items stop at maxDamage-1 instead
 *     of being destroyed.
 *   - ItemStackHurtMixin: the same clamp at the leaf {@code ItemStack.hurt},
 *     closing the bypass where another mod boosts the amount after the
 *     HEAD clamp.
 *
 * This class exists only so Forge has a @Mod to load; it registers nothing.
 *
 * History: the jar used to also carry an "event guard" (EventBusInvokeMixin
 * + EventGuardDiag) meant to swallow ClassCastExceptions thrown by Forge
 * event listeners. It never applied: Forge's ASMEventHandler is loaded on
 * the MC-BOOTSTRAP layer before mod mixins can transform it, so the live
 * debug.log only ever showed the config being "Prepared" and never a
 * "Mixing EventBusInvokeMixin" line. Meanwhile every server start logged
 * "[event-guard] active ... will be logged + suppressed" (false) and every
 * stop logged a summary that could only ever be 0. Removed 2026-10-10; the
 * CCE it was written for is guarded inline at the call-site in
 * iridescent-tetra-expansion (ItemModularArmor / ModularSpellBookItem /
 * ModularArsSpellBookItem .damageItem).
 */
@Mod(DurabilityClamp.MODID)
public class DurabilityClamp {
    public static final String MODID = "iridescent_durability_clamp";

    public DurabilityClamp() {
        // Intentionally empty: this class has no @SubscribeEvent methods left, so
        // there is nothing to register on the Forge event bus.
    }
}
