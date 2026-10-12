package com.iridescentcraft.durabilityclamp.emptylevel;

/**
 * Implemented on {@code net.minecraft.world.level.Level} by
 * {@code LevelEmptyFreshBlockEntityPruneMixin}: access to the two lists Forge
 * adds to {@code Level} for block entities whose {@code onLoad()} is still
 * owed. A level that is not an instance of this interface did not get that
 * mixin; the ticker prune ({@link EmptyLevelTickerAccess}) does not depend on
 * it.
 */
public interface EmptyLevelFreshAccess {

    /**
     * Drops every block entity whose {@code isRemoved()} is true from
     * {@code freshBlockEntities} and {@code pendingFreshBlockEntities}. Calls
     * {@code onLoad()} on nothing and keeps every live block entity.
     *
     * @return how many were dropped, or -1 if the lists are in use by
     *         {@code tickBlockEntities()} and were left alone
     */
    int iridescent$pruneRemovedFreshBlockEntities();

    /** Block entities still waiting for {@code onLoad()} (both lists). For the log line only. */
    int iridescent$freshBlockEntityCount();
}
