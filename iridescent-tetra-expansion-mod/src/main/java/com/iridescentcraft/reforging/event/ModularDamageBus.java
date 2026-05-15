package com.iridescentcraft.reforging.event;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import net.minecraftforge.common.MinecraftForge;
import se.mickelus.tetra.event.ModularItemDamageEvent;

/**
 * Shared post() wrapper for ModularItemDamageEvent.
 *
 * Third-party listeners (notably Aetheric Tetranomicon's
 * VeridiumInfusionEffect) do an unchecked cast to the concrete
 * se.mickelus.tetra.items.modular.ModularItem class. Our modular
 * items implement IModularItem but do not extend ModularItem, so
 * those listeners throw ClassCastException on every damage tick.
 *
 * The mitigation is a try/catch around EVENT_BUS.post(). That's
 * non-crashing but used to log one WARN + one Forge-bus ERROR per
 * hit, which is on the order of every melee swing or armor hit.
 *
 * This helper de-dupes: the first occurrence per (context, cce
 * message) pair logs at WARN; subsequent occurrences drop to DEBUG.
 * The cce message embeds source+target class names, so a different
 * misbehaving listener with a different cast still gets a first
 * WARN without flooding.
 */
public final class ModularDamageBus {

    private static final Set<String> LOGGED_KEYS = ConcurrentHashMap.newKeySet();

    private ModularDamageBus() {}

    public static void safePost(ModularItemDamageEvent event, String contextLabel, String loggerName) {
        try {
            MinecraftForge.EVENT_BUS.post(event);
        } catch (ClassCastException cce) {
            Logger log = LogManager.getLogger(loggerName);
            String key = contextLabel + "|" + cce.getMessage();
            if (LOGGED_KEYS.add(key)) {
                log.warn(
                        "[icraft] ModularItemDamageEvent listener threw CCE on {} ({}). Subsequent occurrences of this exact CCE will be suppressed to DEBUG.",
                        contextLabel, cce.toString());
            } else {
                log.debug("[icraft] (suppressed) ModularItemDamageEvent CCE on {} ({})", contextLabel, cce.toString());
            }
        }
    }
}
