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

        DimensionDifficultyData.get(sl).incrementTick();
    }
}
