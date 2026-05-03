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
        tickCount++;
        // Mark dirty every 100 ticks (5s) — saving every tick would be wasteful;
        // worst-case loss on crash is 5s of timer progress.
        if (tickCount % 100L == 0L) setDirty();
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
