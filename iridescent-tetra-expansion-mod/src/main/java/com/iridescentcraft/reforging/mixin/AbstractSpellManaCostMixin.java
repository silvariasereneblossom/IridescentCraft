package com.iridescentcraft.reforging.mixin;

import com.iridescentcraft.reforging.event.IssRebalanceHandler;
import io.redspace.ironsspellbooks.api.spells.AbstractSpell;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Change 1 of the ISS rebalance: scale every spell's mana cost 5x (level 1) ->
 * 15x (level 10+) at the single method ISS reads cost from —
 * {@link AbstractSpell#getManaCost(int)}.
 *
 * <p>Scaling here (rather than only in the {@code SpellOnCastEvent} deduction,
 * as the first cut did) is what makes the spell <b>tooltips</b> match the real
 * cost: the spellbook / inscription-table / spell-wheel tooltips, ISS's own
 * {@code canBeCastedBy} affordability gate, the instant-cast deduction, and the
 * continuous-cast per-tick drain ({@code ServerPlayerEvents}) ALL call
 * {@code getManaCost}, so one hook keeps them mutually consistent and lets us
 * drop the separate {@code SpellPreCastEvent} gate (ISS's native check now
 * fires on the scaled cost, with ISS's native "not enough mana" feedback).
 *
 * <p>Blast radius is intended and safe: every {@code getManaCost} caller is a
 * display, the player affordability gate, or a mana deduction — there is no
 * mob-AI caller (enemies cast via {@code CastSource.MOB}, which consumes no
 * mana), so enemy spellcasters are unaffected. {@code remap = false}:
 * {@code getManaCost} is ISS's own method, not a remapped Minecraft method.
 * Common (both-dist) mixin: the server needs the gate/deduction, the client
 * needs the tooltip. Spell Echo (a {@code SpellOnCastEvent} handler in
 * {@code ProcEnchantHandler}) still zeroes the already-scaled deduction.
 */
@Mixin(value = AbstractSpell.class, remap = false)
public abstract class AbstractSpellManaCostMixin {

    @Inject(method = "getManaCost(I)I", at = @At("RETURN"), cancellable = true)
    private void icraft_scaleManaCost(int level, CallbackInfoReturnable<Integer> cir) {
        cir.setReturnValue(IssRebalanceHandler.scaledManaCost(cir.getReturnValueI(), level));
    }
}
