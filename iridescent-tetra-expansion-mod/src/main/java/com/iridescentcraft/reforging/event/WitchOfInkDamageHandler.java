package com.iridescentcraft.reforging.event;

import com.iridescentcraft.reforging.IridescentReforging;
import io.redspace.ironsspellbooks.api.registry.AttributeRegistry;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Witch of Ink damage handler: outgoing total-damage multiplier (attacker)
 * AND incoming % damage reduction (victim).
 *
 * Replaces the prior {@code witch_of_ink_progression.js} KubeJS handler:
 * KubeJS's {@code EntityEvents.hurt} wrapper exposes {@code getDamage()}
 * but no settable damage. {@code event.damage = X} from JS throws
 * EvaluatorException at runtime. Forge's {@code LivingHurtEvent} has
 * {@code setAmount(float)} and is the canonical mutable-damage hook.
 *
 * Both sides read the same persistent NBT KubeJS writes:
 * {@code icraft_witch_ink_counter} (int, 0-200) and
 * {@code icraft_witch_penthesilea} (boolean).
 *
 * Outgoing -- {@link #onLivingHurt}, attacker is a Witch:
 * <ul>
 *   <li>Per-counter scaling: +0.1% TOTAL damage per counter, cap +20% at 200.</li>
 *   <li>Penthesilea capstone (at counter=200):
 *       <ul>
 *         <li>+10% additive damage (so cap+capstone = 1.30x).</li>
 *         <li>+15% Spell-Power-to-Attack-Damage conversion:
 *             {@code (spell_power - 1.0) * 0.15} added to the multiplier.</li>
 *       </ul></li>
 *   <li>Applies to ALL outgoing damage from the player: melee, ranged,
 *       ISS spells, Ars spells -- whatever passes through LivingHurtEvent.</li>
 * </ul>
 *
 * Incoming -- {@link #onWitchHurt}, victim is a Witch:
 * <ul>
 *   <li>Per-counter scaling: -0.1% incoming damage per counter, cap -20% at 200.
 *       A flat multiplicative cut: the "% protection" defense, mirroring the
 *       outgoing side (PROVISIONAL magnitude, flagged for a feel-pass).</li>
 *   <li>Restores the ORIGINAL intent. A prior version tracked a "reduction"
 *       stat that never landed as a modifier; the interim build instead gave
 *       +armor_toughness, which the ApothicAttributes {@code armor/(armor+10)}
 *       curve devalues. A flat % cut is independent of that curve.</li>
 *   <li>Applied at the LivingHurtEvent stage (before armor / Protection /
 *       Resistance absorb), so it composes multiplicatively with armor, the
 *       vanilla Protection enchant, and the Penthesilea Resistance I. Reduces
 *       all incoming damage, like the generic Protection enchant.</li>
 * </ul>
 *
 * Non-Witch entities have counter=0 / no flag set; both handlers resolve to
 * a no-op and the event passes through unmodified.
 */
@Mod.EventBusSubscriber(modid = IridescentReforging.MODID, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class WitchOfInkDamageHandler {

    private WitchOfInkDamageHandler() {}

    private static final String KEY_COUNTER     = "icraft_witch_ink_counter";
    private static final String KEY_PENTHESILEA = "icraft_witch_penthesilea";
    private static final int    COUNTER_MAX     = 200;
    private static final float  PER_COUNTER_PCT = 0.001f;  // 0.1% per counter
    private static final float  CAP_PCT         = 0.20f;   // cap +20% at 200
    private static final float  CAPSTONE_PCT    = 0.10f;   // +10% additive at Penthesilea
    private static final float  SP_TO_AD_RATIO  = 0.15f;   // capstone conversion

    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event) {
        Entity attackerEntity = event.getSource().getEntity();
        if (!(attackerEntity instanceof Player attacker)) return;

        CompoundTag pdata;
        try {
            pdata = attacker.getPersistentData();
        } catch (Throwable t) { return; }
        if (pdata == null) return;

        int counter = pdata.getInt(KEY_COUNTER);
        boolean penthesilea = pdata.getBoolean(KEY_PENTHESILEA);

        // Non-Witch (or fresh-counter Witch) -> no flag set -> short-circuit.
        if (counter <= 0 && !penthesilea) return;

        float pct = Math.min(CAP_PCT, counter * PER_COUNTER_PCT);
        if (penthesilea) {
            pct += CAPSTONE_PCT;
            pct += spellPowerBonus(attacker);
        }

        if (pct <= 0f) return;
        float originalAmount = event.getAmount();
        if (originalAmount <= 0f) return;

        event.setAmount(originalAmount * (1f + pct));
    }

    /**
     * Incoming % damage reduction for a Witch-of-Ink victim (the "% protection"
     * defense). Mirrors the outgoing side: -0.1% per counter, cap -20% at 200.
     * Reuses {@link #PER_COUNTER_PCT} / {@link #CAP_PCT} -- same magnitude.
     *
     * A flat multiplicative cut applied here, before the armor / Protection /
     * Resistance absorb steps, so it stacks multiplicatively with all of them
     * and is independent of the armor/toughness curve. No Penthesilea term:
     * the reduction is already at its cap by counter=200, and the capstone's
     * Resistance I composes on top.
     */
    @SubscribeEvent
    public static void onWitchHurt(LivingHurtEvent event) {
        if (!(event.getEntity() instanceof Player victim)) return;

        CompoundTag pdata;
        try {
            pdata = victim.getPersistentData();
        } catch (Throwable t) { return; }
        if (pdata == null) return;

        int counter = pdata.getInt(KEY_COUNTER);
        if (counter <= 0) return;  // non-Witch (or fresh-counter Witch) -> no reduction

        float reduction = Math.min(CAP_PCT, counter * PER_COUNTER_PCT);
        if (reduction <= 0f) return;

        float amount = event.getAmount();
        if (amount <= 0f) return;

        event.setAmount(amount * (1f - reduction));
    }

    /** Capstone SP-to-AD conversion: 15% of (spell_power - 1.0) added to the multiplier. */
    private static float spellPowerBonus(Player attacker) {
        try {
            Attribute spAttr = AttributeRegistry.SPELL_POWER.get();
            float sp = (float) attacker.getAttributeValue(spAttr);
            return Math.max(0f, sp - 1f) * SP_TO_AD_RATIO;
        } catch (Throwable t) {
            return 0f;
        }
    }
}
