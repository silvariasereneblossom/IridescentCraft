package com.iridescentcraft.reforging.attribute;

import dev.shadowsoffire.attributeslib.api.IFormattableAttribute;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;

/**
 * RangedAttribute that always renders as a percent in tooltips, regardless
 * of operation. Stores values as decimals (0.05 = 5%); displays via
 * Apothic Attributes' {@code attributeslib.value.percent} lang key which
 * multiplies by 100 and appends "%".
 *
 * <p>Used for {@link IcraftAttributes#DAMAGE_VS_UNDEAD} so the standard
 * "When equipped: +5% Damage vs Undead" line renders cleanly instead of
 * the default flat "+0.05" decimal that RangedAttribute alone produces.
 *
 * <p>Sign + label come from {@link IFormattableAttribute#toComponent}
 * default implementation (handles operation type, "+/-" prefix, and the
 * attribute's display name from lang).
 */
public class PercentRangedAttribute extends RangedAttribute implements IFormattableAttribute {

    public PercentRangedAttribute(String descriptionId, double defaultValue,
                                  double min, double max) {
        super(descriptionId, defaultValue, min, max);
    }

    @Override
    public MutableComponent toValueComponent(AttributeModifier.Operation op,
                                             double value, TooltipFlag flag) {
        return Component.translatable("attributeslib.value.percent",
                ItemStack.ATTRIBUTE_MODIFIER_FORMAT.format(value * 100));
    }
}
