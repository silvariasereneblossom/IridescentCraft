package com.iridescentcraft.reforging.attribute;

import net.minecraft.world.entity.ai.attributes.AttributeModifier;

/**
 * The one place the data-pack JSON spelling of an attribute-modifier
 * operation is decoded. Shared by the skin and set-bonus loaders, which
 * accept the same {@code "operation"} field.
 */
public final class AttributeOperations {

    private AttributeOperations() {}

    /**
     * {@code "multiply_base"} / {@code "multiply_total"}; anything else
     * (including {@code "addition"} and an absent / misspelled value) is
     * {@link AttributeModifier.Operation#ADDITION}.
     */
    public static AttributeModifier.Operation parse(String s) {
        return switch (s) {
            case "multiply_base"  -> AttributeModifier.Operation.MULTIPLY_BASE;
            case "multiply_total" -> AttributeModifier.Operation.MULTIPLY_TOTAL;
            default                -> AttributeModifier.Operation.ADDITION;
        };
    }
}
