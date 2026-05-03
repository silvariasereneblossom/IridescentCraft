package com.iridescentcraft.difficulty.event;

import com.iridescentcraft.difficulty.config.DifficultyConfig;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-player activity tracker. A player is "active" if they have moved
 * (position delta &gt; 0.1 blocks), dealt damage, or taken damage within
 * the last {@code idleThresholdMinutes}. Used by
 * {@link DimensionTimerTracker} to pause the per-dimension scaling
 * timer when no active player is in that dimension — AFK farms or
 * empty servers don't burn through the cap timer.
 *
 * <p>Activity events tracked:
 * <ul>
 *   <li>Player tick — sets active if position moved &gt; 0.1 blocks since
 *       last tick, or if dimension changed (portal travel)</li>
 *   <li>{@link LivingHurtEvent} — sets attacker active AND target active
 *       if either is a player</li>
 * </ul>
 *
 * <p>Logout removes the entry from the in-memory map. New joins start
 * with no entry → considered active by default (we don't want a player
 * who just logged in to be flagged AFK before their first tick).
 *
 * <p>The map is in-memory only. On server restart, all activity state
 * resets — players default to active until proven idle, which is the
 * right behavior (avoids stalling the timer immediately after restart).
 */
public class PlayerActivityTracker {

    public static final class ActivityState {
        public Vec3 lastPos;
        public long lastActiveTick;
        public net.minecraft.resources.ResourceKey<net.minecraft.world.level.Level> lastDim;
    }

    private static final Map<UUID, ActivityState> STATES = new ConcurrentHashMap<>();

    /** Movement threshold: 0.1 blocks² per tick to count as motion. */
    private static final double MOTION_SQ_EPSILON = 0.01;

    public static boolean isActive(Player player) {
        if (!(player instanceof ServerPlayer sp)) return false;
        if (!DifficultyConfig.COMMON.idleDetectionEnabled.get()) return true;

        ActivityState s = STATES.get(sp.getUUID());
        if (s == null) return true; // newly-joined / pre-tick: default active

        long threshold = thresholdTicks();
        long now = sp.serverLevel().getServer().getTickCount();
        return (now - s.lastActiveTick) < threshold;
    }

    /**
     * @return true if at least one player in {@code level} is currently
     *         considered active. Returns true on empty config-disabled
     *         path so callers don't need to check the toggle separately.
     */
    public static boolean hasActivePlayerInLevel(ServerLevel level) {
        if (!DifficultyConfig.COMMON.idleDetectionEnabled.get()) {
            return !level.players().isEmpty(); // any player in dim = active
        }

        long threshold = thresholdTicks();
        long now = level.getServer().getTickCount();
        for (ServerPlayer p : level.players()) {
            ActivityState s = STATES.get(p.getUUID());
            if (s == null) return true; // new joiner, default active
            if ((now - s.lastActiveTick) < threshold) return true;
        }
        return false;
    }

    /** Convenience for status command. */
    public static long getIdleTicks(ServerPlayer sp) {
        ActivityState s = STATES.get(sp.getUUID());
        if (s == null) return 0L;
        return sp.serverLevel().getServer().getTickCount() - s.lastActiveTick;
    }

    private static long thresholdTicks() {
        return (long) (DifficultyConfig.COMMON.idleThresholdMinutes.get() * 60.0 * 20.0);
    }

    private static void markActive(ServerPlayer sp) {
        ActivityState s = STATES.computeIfAbsent(sp.getUUID(), id -> new ActivityState());
        s.lastActiveTick = sp.serverLevel().getServer().getTickCount();
        s.lastDim = sp.serverLevel().dimension();
        s.lastPos = sp.position();
    }

    // ── Forge events ───────────────────────────────────────────────────

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent e) {
        if (e.phase != TickEvent.Phase.END) return;
        if (!(e.player instanceof ServerPlayer sp)) return;

        ActivityState s = STATES.computeIfAbsent(sp.getUUID(), id -> new ActivityState());
        long now = sp.serverLevel().getServer().getTickCount();
        Vec3 cur = sp.position();

        // First tick after join / first time we see this player
        if (s.lastPos == null) {
            s.lastPos = cur;
            s.lastActiveTick = now;
            s.lastDim = sp.serverLevel().dimension();
            return;
        }

        // Dimension change (portal, /execute in) counts as activity
        if (!sp.serverLevel().dimension().equals(s.lastDim)) {
            s.lastDim = sp.serverLevel().dimension();
            s.lastActiveTick = now;
            s.lastPos = cur;
            return;
        }

        // Position delta — squared dist to avoid sqrt
        if (cur.distanceToSqr(s.lastPos) > MOTION_SQ_EPSILON) {
            s.lastPos = cur;
            s.lastActiveTick = now;
        }
    }

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent e) {
        // Either the attacker or target being a player counts as activity
        if (e.getEntity() instanceof ServerPlayer target) {
            markActive(target);
        }
        if (e.getSource().getEntity() instanceof ServerPlayer attacker) {
            markActive(attacker);
        }
    }

    @SubscribeEvent
    public static void onPlayerLogout(PlayerEvent.PlayerLoggedOutEvent e) {
        STATES.remove(e.getEntity().getUUID());
    }
}
