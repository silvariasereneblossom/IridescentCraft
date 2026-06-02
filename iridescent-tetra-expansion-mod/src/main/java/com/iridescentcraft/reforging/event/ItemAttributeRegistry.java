package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraftforge.event.ItemAttributeModifierEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Java-side ItemAttributeModifierEvent dispatcher for KubeJS scripts --
 * the attribute-modifier analogue of {@link DamageModifierRegistry}.
 *
 * <p><b>Problem this solves (reload-safety).</b> A KubeJS script that calls
 * {@code MinecraftForge.EVENT_BUS.addListener(..., ItemAttributeModifierEvent, jsConsumer)}
 * puts the JS closure ITSELF onto the Forge bus. When KubeJS disposes a
 * script context -- which happens on a CLIENT resource reload for startup
 * scripts, and on every {@code /reload} for server scripts -- it only clears
 * its own {@code EventGroup} handlers (see {@code ScriptType.unload()}); it
 * has no way to remove an arbitrary Forge-bus listener a script registered
 * directly. The stale closure therefore stays on the bus pointing at a
 * disposed Rhino scope. The next {@code ItemAttributeModifierEvent} -- fired
 * every time {@code ItemStack.getAttributeModifiers} runs (held-item stat
 * recompute AND tooltip render in a container screen) -- invokes it and
 * crashes at {@code ScriptRuntime.enterActivationFunction}
 * ({@code IllegalStateException: null}, the Rhino "no top-call / dead-scope"
 * error). This is the chest-open render crash.
 *
 * <p><b>Why this registry survives the reload.</b> The {@code @SubscribeEvent}
 * method below is registered on the Forge bus by Forge at mod construction
 * via {@code @Mod.EventBusSubscriber}. That subscription is owned by the
 * mod's classloader and is completely independent of any Rhino context --
 * KubeJS's {@code unload()} never touches it. The JS callbacks live only as
 * DATA in a static map keyed by a stable string id. When a (re)loaded script
 * runs again it calls {@code register(sameId, fn)}, which REPLACES the prior
 * entry, so a disposed-scope callback is never invoked. Stable-id
 * re-registration is the reload-safe contract.
 *
 * <p>KubeJS scripts use it like:
 * <pre>
 *   var IAR = Java.loadClass('com.iridescentcraft.reforging.event.ItemAttributeRegistry')
 *   IAR.register('icraft.my_item_attrs', function(event) {
 *     if (event.getSlotType() !== EquipmentSlot.MAINHAND) return
 *     // event.removeAttribute(...) / event.addModifier(...) as usual
 *   })
 * </pre>
 *
 * <p>The handler receives the RAW Forge {@link ItemAttributeModifierEvent},
 * so every method scripts already use ({@code getSlotType}, {@code getItemStack},
 * {@code removeAttribute}, {@code addModifier}) works unchanged. Handlers run
 * in {@link ConcurrentHashMap} iteration order; modifiers added by one handler
 * are visible to later handlers, which is correct for layered overrides.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class ItemAttributeRegistry {

    private static final Logger LOG = LogManager.getLogger("item_attribute_registry");

    @FunctionalInterface
    public interface Handler {
        void accept(ItemAttributeModifierEvent event);
    }

    private static final Map<String, Handler> HANDLERS = new ConcurrentHashMap<>();

    /** Register or replace a handler by key. Re-registering the same key is reload-safe. */
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
    public static void onItemAttribute(ItemAttributeModifierEvent event) {
        if (HANDLERS.isEmpty()) return;
        for (Map.Entry<String, Handler> entry : HANDLERS.entrySet()) {
            try {
                entry.getValue().accept(event);
            } catch (Throwable t) {
                LOG.warn("[item_attribute_registry] handler '{}' threw {}: {}",
                        entry.getKey(), t.getClass().getSimpleName(), t.getMessage());
            }
        }
    }
}
