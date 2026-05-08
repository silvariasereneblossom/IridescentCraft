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
 * Forge's {@code ASMEventHandler.invoke(Event)} dispatches an event to
 * a single listener via {@code this.handler.invoke(event)} where
 * {@code handler} is an ASM-generated wrapper around the actual {@code
 * @SubscribeEvent} method. If that listener throws, the exception
 * bubbles up through {@code ASMEventHandler.invoke -> EventBus.post}
 * and crashes whatever was posting (entity tick, server tick, etc.).
 *
 * This mixin intercepts the inner {@code handler.invoke(event)} call
 * with a {@link Redirect} and wraps it in a {@code try/catch
 * (ClassCastException)}. CCE is the specific failure mode for
 * "third-party listener does an unchecked cast to a concrete class
 * we only implement-the-interface-of" -- the bug pattern that took
 * down our server on 2026-05-08 when Aetheric Tetranomicon's
 * {@code VeridiumInfusionEffect} listener cast {@code event.getItem()}
 * to {@code se.mickelus.tetra.items.modular.ModularItem} and our
 * {@code ItemModularArmor} (which extends {@code ArmorItem} and only
 * implements {@code IModularItem}) failed the cast.
 *
 * Other exception types still propagate -- those usually indicate
 * real bugs we want surfaced, not silently swallowed.
 *
 * Throttled diagnostic via {@link EventGuardDiag} so the operator
 * sees one warn per (listener, event-type) tuple per minute, with a
 * session-wide counter for the post-mortem summary.
 *
 * <p><strong>Coexistence with other mods that mixin EventBus:</strong>
 * Neruina's {@code errorable} mixins wrap entity-tick exceptions one
 * level higher (in the entity tick loop, not at the per-listener
 * granularity). Our redirect targets a different instruction so the
 * two coexist. If a future mod adds another redirect on the same
 * {@code IEventListener.invoke} call, MixinSquared's chain support
 * is the resolution path -- we'd switch our annotation to one of
 * MixinExtras's {@code @WrapOperation} variants and let MixinSquared
 * stack the wrappers.
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
