package com.iridescentcraft.durabilityclamp;

import com.iridescentcraft.durabilityclamp.emptylevel.EmptyLevelPruneBackstop;
import com.mojang.logging.LogUtils;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLEnvironment;
import org.slf4j.Logger;

/**
 * Iridescent Durability Clamp — @Mod entrypoint.
 *
 * The clamp's entire behavior lives in the two mixins registered through
 * {@code iridescent_durability_clamp.mixins.json}:
 *   - ItemStackHurtAndBreakMixin: clamps the amount at HEAD of
 *     {@code ItemStack.hurtAndBreak} so items stop at maxDamage-1 instead
 *     of being destroyed.
 *   - ItemStackHurtMixin: the same clamp at the leaf {@code ItemStack.hurt},
 *     closing the bypass where another mod boosts the amount after the
 *     HEAD clamp.
 *
 * For the clamp this class exists only so Forge has a @Mod to load.
 *
 * Since 2026-10-12 the jar also hosts the empty-level prune backstop
 * ({@link EmptyLevelPruneBackstop}): chosen as host because it ships on the
 * dedicated server, already builds mixins, and depends on nothing but Forge.
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
    private static final Logger LOGGER = LogUtils.getLogger();

    public DurabilityClamp() {
        // The clamp itself registers nothing. The jar also hosts the empty-level
        // prune backstop (emptylevel/, its own not-required mixin config), which
        // runs on the dedicated server only. A failure here must never take the
        // clamp, or the boot, down with it.
        if (FMLEnvironment.dist == Dist.DEDICATED_SERVER) {
            try {
                EmptyLevelPruneBackstop.register();
            } catch (Throwable t) {
                LOGGER.warn("[empty-level-prune] ABSENT: could not register ({}). "
                    + "The server runs without the backstop.", t.toString());
            }
        }
    }
}
