package com.iridescentcraft.difficulty.scaling;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.saveddata.SavedData;

/**
 * Per-dimension persistent data: cumulative tick count the dimension has
 * been loaded, plus the Ender-Dragon-killed flag (set on End for the
 * uncap mechanic).
 *
 * <p>Stored via {@link ServerLevel#getDataStorage()} keyed by mod id, so
 * each ServerLevel (= each dimension) gets its own instance and saves
 * with the world.
 */
public class DimensionDifficultyData extends SavedData {

    public static final String DATA_NAME = "iridescent_difficulty";
    public static final long TICKS_PER_HOUR = 20L * 60L * 60L; // 72,000

    private long tickCount = 0L;
    private boolean enderDragonKilled = false;

    /**
     * Sub-tick remainder for fractional rate ticking. When the active-player
     * ratio is &lt; 1.0 (e.g., 2 of 4 players active = 0.5), the timer ticks
     * at that fractional rate. Each call adds {@code rate} to this accumulator,
     * and we floor whole ticks out into {@link #tickCount}. Non-persistent —
     * worst-case loss on restart is &lt;1 tick (~0.05s of timer progress).
     */
    private transient double tickAccumulator = 0.0;

    public static DimensionDifficultyData get(ServerLevel level) {
        return level.getDataStorage().computeIfAbsent(
            DimensionDifficultyData::load,
            DimensionDifficultyData::new,
            DATA_NAME
        );
    }

    public static DimensionDifficultyData load(CompoundTag tag) {
        DimensionDifficultyData d = new DimensionDifficultyData();
        d.tickCount = tag.getLong("tickCount");
        d.enderDragonKilled = tag.getBoolean("enderDragonKilled");
        return d;
    }

    @Override
    public CompoundTag save(CompoundTag tag) {
        tag.putLong("tickCount", tickCount);
        tag.putBoolean("enderDragonKilled", enderDragonKilled);
        return tag;
    }

    public long getTickCount()           { return tickCount; }
    public double getHours()             { return tickCount / (double) TICKS_PER_HOUR; }
    public boolean isEnderDragonKilled() { return enderDragonKilled; }

    public void incrementTick() {
        incrementTick(1.0);
    }

    /**
     * Increment the timer by a fractional amount per game tick. With
     * {@code rate=1.0} this is equivalent to a full tick (the no-arg
     * version). With {@code rate=0.5}, two calls accumulate one tick.
     * With {@code rate=0.0}, no progress.
     */
    public void incrementTick(double rate) {
        if (rate <= 0.0) return;
        tickAccumulator += rate;
        boolean changed = false;
        while (tickAccumulator >= 1.0) {
            tickCount++;
            tickAccumulator -= 1.0;
            changed = true;
        }
        // Mark dirty every 100 whole ticks (5s) — saving every tick would
        // be wasteful; worst-case loss on crash is 5s of timer progress.
        if (changed && tickCount % 100L == 0L) setDirty();
    }

    public void setTickCount(long ticks) {
        this.tickCount = Math.max(0L, ticks);
        setDirty();
    }

    public void markEnderDragonKilled() {
        if (this.enderDragonKilled) return;
        this.enderDragonKilled = true;
        setDirty();
    }
}
