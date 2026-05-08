package com.iridescentcraft.durabilityclamp.mixin;

import com.iridescentcraft.durabilityclamp.EventGuardDiag;
import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.IEventListener;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

/**
 * Generic event-listener fault tolerance.
 *
 * <p><strong>STATUS 2026-05-08: this mixin DOES NOT APPLY at runtime.</strong>
 * Forge's {@code ASMEventHandler} is loaded by the {@code MC-BOOTSTRAP}
 * module layer (visible in stack traces as {@code MC-BOOTSTRAP/
 * net.minecraftforge.eventbus/...}), which is class-loaded BEFORE the
 * regular mod mixin transform stage runs. Mixin registers the config
 * (debug.log shows "Preparing iridescent_durability_clamp.mixins.json
 * (2)") but never emits the "Mixing EventBusInvokeMixin..." application
 * line because the target class is already on the bootstrap classloader
 * and thus uneligible for transformation by mod mixins.
 *
 * <p>Result: the Aetheric Tetranomicon CCE this was originally written
 * for (commit c0472d0d) is NOT caught here. We instead inline-guard
 * the {@code ModularItemDamageEvent} post() at the call-site in
 * {@code ItemModularArmor.damageItem} / {@code ModularSpellBookItem.
 * damageItem} / {@code ModularArsSpellBookItem.damageItem}.
 *
 * <p>This mixin remains in the jar as a no-op safety net for any
 * non-bootstrap CCE pattern that Mixin DOES manage to instrument
 * (rare, but cheap to keep around). A proper fix would require
 * either (a) registering this as a transformation-service-level mixin
 * via FML's services manifest, (b) using Sinytra Connector's
 * {@code pl:connector_pre_launch} hook, or (c) repackaging
 * EventBusInvokeMixin into a coremod-style entrypoint -- all of which
 * are significantly more invasive than the inline-guard approach.
 *
 * <hr>
 *
 * <p>Original design (kept for context):
 *
 * <p>Forge's {@code ASMEventHandler.invoke(Event)} dispatches an event
 * to a single listener via {@code this.handler.invoke(event)} where
 * {@code handler} is an ASM-generated wrapper around the actual {@code
 * @SubscribeEvent} method. If that listener throws, the exception
 * bubbles up through {@code ASMEventHandler.invoke -> EventBus.post}
 * and crashes whatever was posting (entity tick, server tick, etc.).
 *
 * <p>This mixin intercepts the inner {@code handler.invoke(event)}
 * call with a {@link Redirect} and wraps it in a {@code try/catch
 * (ClassCastException)}. Throttled diagnostic via {@link EventGuardDiag}
 * so the operator sees one warn per (listener, event-type) tuple per
 * minute, with a session-wide counter for the post-mortem summary.
 *
 * <p>{@code remap = false} on the {@link Mixin} annotation: the
 * eventbus library lives in {@code net.minecraftforge.eventbus.*}
 * which has no MC mappings, so suppress the remapper.
 */
@Mixin(targets = "net.minecraftforge.eventbus.ASMEventHandler", remap = false)
public class EventBusInvokeMixin {

    @Redirect(
        method = "invoke(Lnet/minecraftforge/eventbus/api/Event;)V",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraftforge/eventbus/api/IEventListener;invoke(Lnet/minecraftforge/eventbus/api/Event;)V"
        )
    )
    private void icraft$guardedListenerInvoke(IEventListener handler, Event event) {
        try {
            handler.invoke(event);
        } catch (ClassCastException cce) {
            EventGuardDiag.report(handler, event, cce);
            // Swallow. The Forge event bus contract is "post all
            // listeners in priority order"; one listener failing is
            // strictly local to that listener -- subsequent listeners
            // for this event still run because EventBus.post()
            // continues iterating after we return normally.
        }
    }
}
