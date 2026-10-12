package com.iridescentcraft.durabilityclamp.emptylevel;

import com.mojang.logging.LogUtils;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.TimeUnit;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.entity.TickingBlockEntity;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import org.slf4j.Logger;

/**
 * Empty-level prune backstop (dedicated server).
 *
 * <p><strong>The leak it closes.</strong> {@code ServerLevel.tick} ends with
 * <pre>{@code
 *   boolean flag = !players.isEmpty() || ForgeChunkManager.hasForcedChunks(this);
 *   if (flag) resetEmptyTime();
 *   if (flag || emptyTime++ < 300) { ...entities...; tickBlockEntities(); }
 * }</pre>
 * so a level with no players and no forced chunks stops calling
 * {@code tickBlockEntities()} after 300 ticks. That method is the only place
 * a removed ticker leaves {@code Level.blockEntityTickers}. A chunk's tickers
 * are {@code LevelChunk$RebindableTickingBlockEntityWrapper}s, a non-static
 * inner class, so each one holds its {@code LevelChunk}; unloading the chunk
 * rebinds them to a ticker whose {@code isRemoved()} is true and leaves them
 * in the level's list. Every chunk that loads and unloads in an empty level
 * therefore stays reachable, one full copy per reload, until a player joins
 * that level. On this server that was an out-of-memory every evening
 * (October 2026: one far chunk reloaded twice a second by a script, 112,787
 * copies, 8.65 GB).
 *
 * <p><strong>What this does.</strong> After each server-side level tick (the
 * Forge post-tick event, fired by {@code MinecraftServer.tickChildren} once
 * {@code ServerLevel.tick} has returned) it asks the level whether
 * {@code tickBlockEntities()} ran. If it did, the level is ticking normally
 * and is left alone. If it did not, every {@value #DEFAULT_INTERVAL_TICKS}th
 * such tick it drops the tickers whose {@code isRemoved()} is true, which is
 * the removal half of vanilla's own loop and nothing else: no block entity is
 * ticked and no live ticker is touched.
 *
 * <p><strong>What it leaves alone.</strong> Forge adds two more lists to the
 * same method, {@code freshBlockEntities} / {@code pendingFreshBlockEntities}
 * (block entities waiting for {@code onLoad()}); they also only drain in
 * {@code tickBlockEntities()}. They hold block entities, not chunks, and
 * dropping from them would skip an {@code onLoad()} call, so they are not
 * pruned here.
 *
 * <p><strong>Fail soft.</strong> Nothing here can stop the server. The mixin
 * config is not required; a level without the mixin, or one on which the hook
 * has never been seen to fire, is never pruned; any unexpected error switches
 * the backstop off for the rest of the run. Each of those is logged as
 * {@code [empty-level-prune] ABSENT}. The "active" line is printed only after
 * the hook has actually fired.
 *
 * <p>JVM switches: {@code -Diridescent.emptyLevelPrune=false} turns it off;
 * {@code -Diridescent.emptyLevelPrune.intervalTicks=N} changes the interval
 * ({@value #MIN_INTERVAL_TICKS} to {@value #MAX_INTERVAL_TICKS}).
 */
public final class EmptyLevelPruneBackstop {

    private static final Logger LOGGER = LogUtils.getLogger();
    private static final String TAG = "[empty-level-prune]";

    static final String PROP_ENABLED = "iridescent.emptyLevelPrune";
    static final String PROP_INTERVAL = "iridescent.emptyLevelPrune.intervalTicks";
    static final int DEFAULT_INTERVAL_TICKS = 100;
    static final int MIN_INTERVAL_TICKS = 20;
    static final int MAX_INTERVAL_TICKS = 6000;

    private static final boolean ENABLED = readEnabled();
    private static final int INTERVAL_TICKS = readIntervalTicks();

    /** At most one "dropped" line per level in this long; the counts in between are summed. */
    private static final long LOG_EVERY_NANOS = TimeUnit.MINUTES.toNanos(5);

    /** Server ticks to wait before the one startup line; every level has ticked by then. */
    private static final int REPORT_AFTER_TICKS = 20;

    // Server thread only. Values never reference their key.
    private static final Map<ServerLevel, LevelState> STATES = new WeakHashMap<>();

    private static boolean tripped;
    private static boolean reported;
    private static int serverTicks;

    private EmptyLevelPruneBackstop() {}

    public static void register() {
        MinecraftForge.EVENT_BUS.register(EmptyLevelPruneBackstop.class);
    }

    @SubscribeEvent
    public static void onLevelTick(TickEvent.LevelTickEvent event) {
        if (tripped || event.phase != TickEvent.Phase.END || !(event.level instanceof ServerLevel level)) {
            return;
        }
        try {
            afterLevelTick(level);
        } catch (VirtualMachineError e) {
            throw e;
        } catch (Throwable t) {
            tripped = true;
            LOGGER.error("{} ABSENT from now on: switched itself off after an unexpected error. "
                + "The server keeps running without the backstop.", TAG, t);
        }
    }

    private static void afterLevelTick(ServerLevel level) {
        if (!(level instanceof EmptyLevelTickerAccess access)) {
            return; // the mixin is not on Level; said once in the startup line
        }
        if (!level.getServer().isSameThread()) {
            return;
        }
        LevelState state = STATES.computeIfAbsent(level, l -> new LevelState());
        if (access.iridescent$takeBlockEntityTickRan()) {
            // Block entities ticked, so vanilla's own loop pruned the lists this tick.
            state.hookSeen = true;
            state.skippedTicks = 0;
            return;
        }
        // Until the hook has fired here at least once, "it did not run" proves nothing.
        if (!ENABLED || !state.hookSeen) {
            return;
        }
        if (++state.skippedTicks < INTERVAL_TICKS) {
            return;
        }
        state.skippedTicks = 0;
        int dropped = access.iridescent$pruneRemovedTickers();
        if (dropped > 0) {
            reportDropped(level, access, state, dropped);
        }
    }

    /** Called by the mixin with each of the level's ticker lists. Ticks nothing. */
    public static int dropRemoved(List<TickingBlockEntity> tickers) {
        int before = tickers.size();
        if (before == 0) {
            return 0;
        }
        tickers.removeIf(TickingBlockEntity::isRemoved);
        return before - tickers.size();
    }

    private static void reportDropped(ServerLevel level, EmptyLevelTickerAccess access, LevelState state, int dropped) {
        state.droppedTotal += dropped;
        state.droppedSinceLog += dropped;
        long now = System.nanoTime();
        if (state.logged && now - state.lastLogNanos < LOG_EVERY_NANOS) {
            return;
        }
        LOGGER.info("{} {}: dropped {} removed block-entity tickers ({} since boot, {} still listed). "
                + "Chunks are being loaded in this level while it has no players.",
            TAG, level.dimension().location(), state.droppedSinceLog, state.droppedTotal,
            access.iridescent$tickerCount());
        state.logged = true;
        state.lastLogNanos = now;
        state.droppedSinceLog = 0;
    }

    @SubscribeEvent
    public static void onServerTick(TickEvent.ServerTickEvent event) {
        if (reported || event.phase != TickEvent.Phase.END || ++serverTicks < REPORT_AFTER_TICKS) {
            return;
        }
        reported = true;
        try {
            reportStartup(event.getServer());
        } catch (VirtualMachineError e) {
            throw e;
        } catch (Throwable t) {
            LOGGER.warn("{} ABSENT: could not check whether the backstop applied ({}).", TAG, t.toString());
        }
    }

    private static void reportStartup(MinecraftServer server) {
        int levels = 0;
        int mixed = 0;
        int hooked = 0;
        for (ServerLevel level : server.getAllLevels()) {
            levels++;
            if (level instanceof EmptyLevelTickerAccess) {
                mixed++;
                LevelState state = STATES.get(level);
                if (state != null && state.hookSeen) {
                    hooked++;
                }
            }
        }
        if (tripped) {
            return; // already said why
        }
        if (mixed == 0) {
            LOGGER.warn("{} ABSENT: the mixin is not on Level (0 of {} levels); look for a Mixin warning naming "
                + "LevelEmptyTickerPruneMixin earlier in this log. The server runs without the backstop.", TAG, levels);
        } else if (hooked == 0) {
            LOGGER.warn("{} ABSENT: the mixin is on Level but its hook on tickBlockEntities() did not fire in the "
                + "first {} ticks (0 of {} levels). The server runs without the backstop.", TAG, REPORT_AFTER_TICKS, levels);
        } else if (!ENABLED) {
            LOGGER.warn("{} OFF: the mixin applied (hook seen on {} of {} levels) but -D{}=false is set. "
                + "Nothing will be pruned.", TAG, hooked, levels, PROP_ENABLED);
        } else {
            LOGGER.info("{} active: mixin applied to Level, hook on tickBlockEntities() seen on {} of {} levels. "
                + "Removed block-entity tickers are dropped every {} ticks while a level skips its block-entity tick.",
                TAG, hooked, levels, INTERVAL_TICKS);
        }
    }

    private static boolean readEnabled() {
        String value = System.getProperty(PROP_ENABLED);
        return value == null || !value.trim().equalsIgnoreCase("false");
    }

    private static int readIntervalTicks() {
        int ticks = DEFAULT_INTERVAL_TICKS;
        String value = System.getProperty(PROP_INTERVAL);
        if (value != null) {
            try {
                ticks = Integer.parseInt(value.trim());
            } catch (NumberFormatException e) {
                ticks = DEFAULT_INTERVAL_TICKS;
            }
        }
        return Math.max(MIN_INTERVAL_TICKS, Math.min(MAX_INTERVAL_TICKS, ticks));
    }

    private static final class LevelState {
        boolean hookSeen;
        int skippedTicks;
        boolean logged;
        long lastLogNanos;
        long droppedSinceLog;
        long droppedTotal;
    }
}
