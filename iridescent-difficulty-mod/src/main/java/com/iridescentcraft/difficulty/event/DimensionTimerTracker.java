package com.iridescentcraft.difficulty.event;

import com.iridescentcraft.difficulty.config.DifficultyConfig;
import com.iridescentcraft.difficulty.scaling.DimensionDifficultyData;
import net.minecraft.server.level.ServerLevel;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

/**
 * Increments each ServerLevel's {@link DimensionDifficultyData#getTickCount()}
 * once per server tick. Only runs while the level is loaded — vanilla
 * {@link TickEvent.LevelTickEvent} fires per loaded level on the server
 * side, so dimensions where no players or chunk-tickers are present
 * (purged levels) don't increment. This implements option (a) from the
 * design discussion: timer is "earned" by the dimension being active.
 */
public class DimensionTimerTracker {

    @SubscribeEvent
    public static void onLevelTick(TickEvent.LevelTickEvent e) {
        if (e.phase != TickEvent.Phase.END) return;
        if (!(e.level instanceof ServerLevel sl)) return;
        if (!DifficultyConfig.COMMON.enabled.get()) return;

        // Proportional ticking: rate = active / total players in this dim.
        //  - 4 players, 2 active → 0.5 (half rate)
        //  - 4 players, 0 active → 0.0 (paused)
        //  - 1 player, 1 active → 1.0 (full rate)
        // PlayerTickEvent.END fires before LevelTickEvent.END (per Forge
        // tick order), so the activity state is up-to-date for this tick
        // before we check it here.
        double rate = PlayerActivityTracker.getActiveRatio(sl);
        if (rate <= 0.0) return;

        DimensionDifficultyData.get(sl).incrementTick(rate);
    }
}
