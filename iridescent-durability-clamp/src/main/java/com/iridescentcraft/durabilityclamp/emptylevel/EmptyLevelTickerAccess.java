package com.iridescentcraft.durabilityclamp.emptylevel;

/**
 * Implemented on {@code net.minecraft.world.level.Level} by
 * {@code LevelEmptyTickerPruneMixin}. A level that is not an instance of this
 * interface did not get the mixin, and {@link EmptyLevelPruneBackstop} reports
 * the backstop as absent instead of acting.
 *
 * <p>Lives outside the mixin package on purpose: classes inside a mixin
 * package cannot be referenced by ordinary code.
 */
public interface EmptyLevelTickerAccess {

    /**
     * Whether {@code Level.tickBlockEntities()} ran on this level since the
     * last call. Reading clears the mark.
     */
    boolean iridescent$takeBlockEntityTickRan();

    /**
     * Drops every ticker whose {@code isRemoved()} is true from the level's
     * two ticker lists. Ticks nothing.
     *
     * @return how many were dropped, or -1 if the lists are in use by
     *         {@code tickBlockEntities()} and were left alone
     */
    int iridescent$pruneRemovedTickers();

    /** Tickers currently held by the level (both lists). For the log line only. */
    int iridescent$tickerCount();
}
