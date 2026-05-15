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
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class DamageModifierRegistry {

    private static final Logger LOG = LogManager.getLogger("damage_registry");

    @FunctionalInterface
    public interface Handler {
        void accept(LivingHurtEvent event);
    }

    private static final Map<String, Handler> HANDLERS = new ConcurrentHashMap<>();

    /** Register or replace a handler by key. */
    public static void register(String key, Handler handler) {
        if (key == null || handler == null) return;
        HANDLERS.put(key, handler);
    }

    /** Remove a handler. Returns true if a handler with that key existed. */
    public static boolean unregister(String key) {
        return key != null && HANDLERS.remove(key) != null;
    }

    /** Number of currently-registered handlers. Diagnostic. */
    public static int size() { return HANDLERS.size(); }

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event) {
        if (HANDLERS.isEmpty()) return;
        for (Map.Entry<String, Handler> entry : HANDLERS.entrySet()) {
            try {
                entry.getValue().accept(event);
            } catch (Throwable t) {
                LOG.warn("[damage_registry] handler '{}' threw {}: {}",
                        entry.getKey(), t.getClass().getSimpleName(), t.getMessage());
            }
        }
    }
}
