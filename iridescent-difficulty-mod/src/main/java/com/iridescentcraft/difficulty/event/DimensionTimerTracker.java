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

        // Idle gate: pause timer when no active player is in this dim.
        // PlayerTickEvent.END fires before LevelTickEvent.END (per Forge tick
        // order), so the activity state is up-to-date for this tick before
        // we check it here.
        if (!PlayerActivityTracker.hasActivePlayerInLevel(sl)) return;

        DimensionDifficultyData.get(sl).incrementTick();
    }
}
