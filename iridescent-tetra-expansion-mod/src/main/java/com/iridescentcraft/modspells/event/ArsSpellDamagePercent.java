package com.iridescentcraft.modspells.event;

import com.hollingsworth.arsnouveau.api.event.SpellDamageEvent;
import com.hollingsworth.arsnouveau.api.perk.PerkAttributes;
import com.iridescentcraft.modspells.IridescentModularSpells;

import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Makes PERCENT modifiers on Ars Nouveau's spell-damage attribute mean what they say.
 *
 * <p>{@code ars_nouveau:ars_nouveau.perk.spell_damage} is a FLAT bonus with a base of 0: Ars adds
 * the attribute's value to every damaging effect ({@code IDamageEffect.attemptDamage}). A
 * {@code multiply_base} / {@code multiply_total} modifier on it therefore multiplies zero. The
 * modular Ars spell book's front covers grant exactly that ("**" = multiply_total, +0.4% to +1.1%
 * per cover, 68 material variants) as the Ars-side twin of the Iron's book cover's spell power --
 * and did nothing from the day they shipped.
 *
 * <p>Operator decision 2026-10-11: make the multiplier real. On {@link SpellDamageEvent.Pre} the
 * caster's percent modifiers on that attribute are applied to the spell's damage, combined the way
 * vanilla combines them: {@code (1 + sum of multiply_base) * product of (1 + multiply_total)}.
 * Flat (addition) modifiers are left to Ars.
 *
 * <p>Ars has already folded the attribute's own value (flat bonus times the same factor) into the
 * damage it posts, so that part is left out of the scaling here -- a flat bonus is not multiplied
 * twice.
 */
@Mod.EventBusSubscriber(modid = IridescentModularSpells.MODID)
public final class ArsSpellDamagePercent {

    private ArsSpellDamagePercent() {}

    // HIGH: scale before the script-side school bridges (NORMAL) so they see the scaled damage,
    // exactly as they would if Ars itself had applied the percentage.
    @SubscribeEvent(priority = EventPriority.HIGH)
    public static void onSpellDamagePre(SpellDamageEvent.Pre event) {
        LivingEntity caster = event.caster;
        if (caster == null || event.damage <= 0.0F) return;
        Attribute attribute = PerkAttributes.SPELL_DAMAGE_BONUS.get();
        AttributeInstance instance = caster.getAttributes().hasAttribute(attribute)
                ? caster.getAttribute(attribute) : null;
        if (instance == null) return;

        double factor = percentFactor(instance);
        if (!(factor > 0.0D) || factor == 1.0D || Double.isInfinite(factor)) return;

        // instance.getValue() is what Ars already added to the damage: flat * factor.
        double alreadyScaled = Math.max(0.0D, Math.min(event.damage, instance.getValue()));
        double scaled = event.damage + (event.damage - alreadyScaled) * (factor - 1.0D);
        if (Double.isNaN(scaled) || Double.isInfinite(scaled)) return;
        event.damage = (float) Math.max(0.0D, scaled);
    }

    /** {@code (1 + sum multiply_base) * product (1 + multiply_total)} -- vanilla's own combination. */
    static double percentFactor(AttributeInstance instance) {
        double factor = 1.0D;
        for (AttributeModifier modifier : instance.getModifiers(AttributeModifier.Operation.MULTIPLY_BASE)) {
            factor += modifier.getAmount();
        }
        for (AttributeModifier modifier : instance.getModifiers(AttributeModifier.Operation.MULTIPLY_TOTAL)) {
            factor *= 1.0D + modifier.getAmount();
        }
        return factor;
    }
}
