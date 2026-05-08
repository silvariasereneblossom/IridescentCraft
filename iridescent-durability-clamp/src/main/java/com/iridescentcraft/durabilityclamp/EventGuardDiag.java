package com.iridescentcraft.durabilityclamp;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Diagnostic + reporting backend for {@link com.iridescentcraft.durabilityclamp.mixin.EventBusInvokeMixin}.
 *
 * The mixin wraps every Forge event listener invocation in a
 * {@code try { ... } catch (ClassCastException) { ... }}. When a CCE
 * fires, control lands here so the failure is recorded, logged with
 * useful context, and the offending listener is suppressed for the
 * remainder of this server lifetime (each (listener, event) pair only
 * crashes once before we stop trying it -- preventing log spam from a
 * mob whose tick fires the same listener every gametick).
 *
 * Throttling: per (listener-class, event-type) tuple, log a warn at
 * most once every 60 seconds AND increment a session-wide counter so
 * a final summary on graceful shutdown shows everything caught.
 *
 * Diagnostics surfaced:
 *  - first-occurrence WARN: mod jar that owns the listener, listener
 *    class FQN, event type, exception message
 *  - subsequent occurrences within 60s: silent (counter still ticks)
 *  - summary: TOTAL_GUARDED_EXCEPTIONS counter readable via
 *    {@link #totalGuardedExceptions()}
 *
 * Why ClassCastException specifically: that's the class of bug we're
 * targeting (listener does an unchecked cast to a concrete type when
 * the event might be carrying a subclass-by-interface). Other
 * exceptions (NPE, IllegalState, ArithmeticException) usually indicate
 * real bugs we WANT to crash on -- swallowing those would hide them.
 */
public final class EventGuardDiag {
    private static final Logger LOG = LogManager.getLogger("icraft-event-guard");
    private static final ConcurrentMap<String, Long> LAST_REPORT_MS = new ConcurrentHashMap<>();
    private static final long REPORT_THROTTLE_MS = 60_000L;
    private static final AtomicLong TOTAL_GUARDED = new AtomicLong();

    private EventGuardDiag() {}

    /**
     * Called by the mixin every time a wrapped listener throws CCE.
     * Records, throttles, and logs.
     */
    public static void report(Object handler, Object event, Throwable t) {
        TOTAL_GUARDED.incrementAndGet();
        String handlerName = handler == null ? "<null>" : handler.getClass().getName();
        String eventName = event == null ? "<null>" : event.getClass().getName();
        String key = handlerName + "::" + eventName;

        long now = System.currentTimeMillis();
        Long prev = LAST_REPORT_MS.get(key);
        if (prev != null && now - prev <= REPORT_THROTTLE_MS) {
            return; // already reported recently; don't spam
        }
        LAST_REPORT_MS.put(key, now);

        // Resolve which mod owns the listener class so the operator
        // can file an issue with the right project.
        String ownerHint = describeOwner(handler);

        LOG.warn(
            "[event-guard] caught {} from listener {} on event {} -- swallowing & continuing other listeners. {}{}message: {}",
            t.getClass().getSimpleName(),
            handlerName,
            eventName,
            ownerHint,
            ownerHint.isEmpty() ? "" : " ",
            t.getMessage()
        );
    }

    /**
     * Best-effort identification of the mod that owns a listener
     * class, by inspecting its package prefix. The package usually
     * matches the modId or a recognizable mod-author domain.
     */
    private static String describeOwner(Object handler) {
        if (handler == null) return "";
        String cls = handler.getClass().getName();
        // Generated event handler classnames look like
        //   com.foo.bar.__SomeListener_methodName_EventType
        // Trim the synthetic prefix to recover the real package.
        int firstDoubleUnderscore = cls.indexOf("__");
        if (firstDoubleUnderscore >= 0) {
            String pkg = cls.substring(0, firstDoubleUnderscore);
            // Strip trailing dot if present
            if (pkg.endsWith(".")) pkg = pkg.substring(0, pkg.length() - 1);
            if (!pkg.isEmpty()) return "(owned by " + pkg + ")";
        }
        // Fallback: take the top three package components
        String[] parts = cls.split("\\.");
        if (parts.length >= 3) {
            return "(owned by " + parts[0] + "." + parts[1] + "." + parts[2] + ")";
        }
        return "";
    }

    public static long totalGuardedExceptions() {
        return TOTAL_GUARDED.get();
    }

    /**
     * Called from the mod entrypoint at FMLCommonSetupEvent so the
     * server log shows the guard is active. Operators reading
     * latest.log can grep for this single line to confirm the mixin
     * applied (otherwise crashes return + the cause is unclear).
     */
    public static void announceActive() {
        LOG.info(
            "[event-guard] active -- Forge event listeners that throw ClassCastException will be logged + suppressed instead of crashing the server. " +
            "Real bugs (NPE, IllegalState, etc.) still propagate and crash. Configure log level 'icraft-event-guard' to debug for verbose tracing."
        );
    }
}
