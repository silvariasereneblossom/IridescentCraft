package com.iridescentcraft.reforging.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import se.mickelus.tetra.event.ModularItemDamageEvent;
import se.mickelus.tetra.items.modular.ModularItem;

/**
 * Type check before Aetheric Tetranomicon's cast in
 * {@code VeridiumInfusionEffect.durabilityEvent}.
 *
 * <p>That listener does {@code (ModularItem) event.getItemStack().getItem()}
 * with no {@code instanceof}. The pack's modular armour, wand and both spell
 * books implement Tetra's {@code IModularItem} but cannot extend the concrete
 * {@code ModularItem} (the armour must extend vanilla {@code ArmorItem}), so
 * every {@link ModularItemDamageEvent} posted for them threw a
 * ClassCastException: the Forge bus logged an ERROR with a full stack trace
 * per armour hit (60 and 84 a boot on the live server, 2026-10-21/22), and
 * every listener after Aetheric's in the bus order was skipped for that post.
 * {@code ModularDamageBus.safePost} kept the throw from reaching the hit.
 *
 * <p>Returning early for a non-{@code ModularItem} keeps the effect as it was
 * on every item: Veridium Infusion (4x durability cost while infused) needs
 * the {@code veridium_infusable} effect, which only Aetheric's own material
 * and its tool / weapon improvements give, and none of the pack's modules
 * takes that material. Tetra's own modular items still reach the listener.
 *
 * <p>{@code @Pseudo} with a string target: no compile dependency on Aetheric,
 * and a pack without it skips this mixin. {@code remap = false}: a mod-own
 * method, same name in dev and at run time.
 */
@Pseudo
@Mixin(targets = "com.syric.aetheric_tetranomicon.effects.VeridiumInfusionEffect", remap = false)
public abstract class VeridiumDurabilityCastMixin {

    @Inject(method = "durabilityEvent(Lse/mickelus/tetra/event/ModularItemDamageEvent;)V",
            at = @At("HEAD"), cancellable = true)
    private void icraft$skipNonModularItem(ModularItemDamageEvent event, CallbackInfo ci) {
        if (!(event.getItemStack().getItem() instanceof ModularItem)) {
            ci.cancel();
        }
    }
}
