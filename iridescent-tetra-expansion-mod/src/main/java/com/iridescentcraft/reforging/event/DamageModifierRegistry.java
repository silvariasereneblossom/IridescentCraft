package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Java-side LivingHurtEvent dispatcher for KubeJS scripts.
 *
 * Problem this solves: KubeJS's {@code EntityEvents.hurt} wraps the event
 * in {@code LivingEntityHurtEventJS}, which exposes {@code getDamage()}
 * but no settable damage field. Scripts using
 * {@code event.damage = newValue} throw EvaluatorException at runtime,
 * spamming the server log on every hit. The intended damage modification
 * silently never lands.
 *
 * This registry holds JS callbacks (one per script-keyed slot) and
 * dispatches the RAW Forge {@link LivingHurtEvent} to each callback. JS
 * code calls {@code event.setAmount(value)} or assigns {@code event.amount}
 * (Rhino resolves to {@code setAmount}) -- both work on the raw Forge
 * event.
 *
 * KubeJS scripts use the registry like:
 * <pre>
 *   var DR = Java.loadClass('com.iridescentcraft.reforging.event.DamageModifierRegistry')
 *   DR.register('icraft.my_handler', function(event) {
 *     var src = event.source.entity
 *     if (!src) return
 *     event.amount = event.amount * 1.25
 *   })
 * </pre>
 *
 * Re-registering the same key replaces the previous handler -- safe under
 * KubeJS script reloads. Handlers run in iteration order of the underlying
 * {@link ConcurrentHashMap} (i.e., insertion-ish; not guaranteed). If
 * multiple handlers need to compose, they all see the partially-modified
 * amount from earlier handlers, which is correct for layered multipliers.
 *
 * <p><b>Two phases (ordering).</b> All {@code register(..)} handlers run
 * first (the NORMAL phase), then all {@code registerLate(..)} handlers (the
 * LATE phase). This preserves an ordering that previously relied on raw-Forge
 * {@code EventPriority}: e.g. {@code attribute_sync.js} stamps
 * {@code icraft_last_crit_tick} during its NORMAL handler, and the
 * {@code icraft_magic_enchants.js} Arcane-Vorpal decap handler must read that
 * stamp afterwards -- so it registers LATE. Within a phase order is still
 * unspecified.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class DamageModifierRegistry {

    private static final Logger LOG = LogManager.getLogger("damage_registry");

    @FunctionalInterface
    public interface Handler {
        void accept(LivingHurtEvent event);
    }

    private static final Map<String, Handler> HANDLERS = new ConcurrentHashMap<>();
    private static final Map<String, Handler> LATE_HANDLERS = new ConcurrentHashMap<>();

    /** Register or replace a NORMAL-phase handler by key. */
    public static void register(String key, Handler handler) {
        if (key == null || handler == null) return;
        HANDLERS.put(key, handler);
    }

    /**
     * Register or replace a LATE-phase handler by key. LATE handlers run after
     * all NORMAL handlers, replacing the old raw-Forge {@code EventPriority.LOW}
     * "run after the crit roll" ordering. A key registered LATE is removed from
     * the NORMAL map (and vice-versa) so a handler lives in exactly one phase.
     */
    public static void registerLate(String key, Handler handler) {
        if (key == null || handler == null) return;
        HANDLERS.remove(key);
        LATE_HANDLERS.put(key, handler);
    }

    /** Remove a handler from whichever phase holds it. Returns true if one existed. */
    public static boolean unregister(String key) {
        if (key == null) return false;
        boolean a = HANDLERS.remove(key) != null;
        boolean b = LATE_HANDLERS.remove(key) != null;
        return a || b;
    }

    /** Number of currently-registered handlers (both phases). Diagnostic. */
    public static int size() { return HANDLERS.size() + LATE_HANDLERS.size(); }

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event) {
        dispatch(HANDLERS, event);
        dispatch(LATE_HANDLERS, event);
    }

    private static void dispatch(Map<String, Handler> map, LivingHurtEvent event) {
        if (map.isEmpty()) return;
        for (Map.Entry<String, Handler> entry : map.entrySet()) {
            try {
                entry.getValue().accept(event);
            } catch (Throwable t) {
                LOG.warn("[damage_registry] handler '{}' threw {}: {}",
                        entry.getKey(), t.getClass().getSimpleName(), t.getMessage());
            }
        }
    }
}
