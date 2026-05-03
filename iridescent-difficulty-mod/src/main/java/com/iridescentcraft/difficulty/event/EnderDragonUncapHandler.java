package com.iridescentcraft.difficulty.event;

import com.iridescentcraft.difficulty.IridescentDifficulty;
import com.iridescentcraft.difficulty.scaling.DimensionDifficultyData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

/**
 * Sets the {@code enderDragonKilled} flag on whatever ServerLevel the
 * Ender Dragon dies in (the End, by default). Once set, dimensions in
 * the {@code uncapAfterEnderDragonDimensions} config list ignore their
 * cap%, allowing scaling to extrapolate past the configured cap.
 *
 * <p>Vanilla Ender Dragon respawn is supported: re-killing the dragon
 * after a respawn is a no-op (flag stays true).
 */
public class EnderDragonUncapHandler {

    @SubscribeEvent
    public static void onLivingDeath(LivingDeathEvent e) {
        if (!(e.getEntity() instanceof EnderDragon)) return;
        if (e.getEntity().level().isClientSide) return;
        if (!(e.getEntity().level() instanceof ServerLevel sl)) return;

        DimensionDifficultyData data = DimensionDifficultyData.get(sl);
        if (data.isEnderDragonKilled()) return;

        data.markEnderDragonKilled();
        IridescentDifficulty.LOGGER.info(
            "[icraft-diff] Ender Dragon defeated in {} — scaling cap removed for any dimension in uncapAfterEnderDragon list.",
            sl.dimension().location()
        );
    }
}
