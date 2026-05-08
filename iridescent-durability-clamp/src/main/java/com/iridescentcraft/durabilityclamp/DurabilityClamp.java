package com.iridescentcraft.durabilityclamp;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.server.ServerStartingEvent;
import net.minecraftforge.event.server.ServerStoppedEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Iridescent Durability Clamp + Event Guard — combined @Mod entrypoint.
 *
 * Hosts two mixin behaviors registered via the jar's MixinConfigs:
 *   - ItemStackHurtAndBreakMixin: clamps damage so items stop at
 *     maxDamage-1 instead of being destroyed.
 *   - EventBusInvokeMixin: wraps every Forge event listener in a
 *     try/catch ClassCastException so one buggy listener can't take
 *     down the whole server.
 *
 * This @Mod class also subscribes to the Forge server lifecycle so
 * each server start announces the event guard is active and each
 * stop prints a summary count of guarded exceptions during the run.
 * Operators reading latest.log can grep [event-guard] to see what
 * the mixin caught for the session.
 */
@Mod(DurabilityClamp.MODID)
public class DurabilityClamp {
    public static final String MODID = "iridescent_durability_clamp";
    private static final Logger LOG = LogManager.getLogger(MODID);

    public DurabilityClamp() {
        MinecraftForge.EVENT_BUS.register(this);
    }

    @SubscribeEvent
    public void onServerStarting(ServerStartingEvent ev) {
        EventGuardDiag.announceActive();
    }

    @SubscribeEvent
    public void onServerStopped(ServerStoppedEvent ev) {
        long total = EventGuardDiag.totalGuardedExceptions();
        if (total > 0) {
            LOG.info("[event-guard] session summary: caught + suppressed {} ClassCastException(s) from event listeners. Grep [event-guard] for the per-listener detail.", total);
        } else {
            LOG.info("[event-guard] session summary: no guarded exceptions this session.");
        }
    }
}
