package com.iridescentcraft.reforging.setbonus;

import com.google.common.collect.ImmutableList;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;

import java.util.List;

/**
 * Server-side data record for a set bonus declaration.
 * Loaded from data/<ns>/iridescent_reforging_set_bonuses/*.json by
 * SetBonusDataLoader.
 *
 * A set bonus fires when a player has at least `requiredPieces` armor
 * slots equipped with reforged pieces all sharing this set's `setId`.
 * The bonus contributes attribute modifiers and/or potion effects.
 *
 * Potion effects are refreshed on a tick cadence (default ~5s) so they
 * appear infinite while the set is worn — the manager re-applies them
 * on each refresh, and they expire naturally when the set is broken.
 */
public record SetBonusDefinition(
        String setId,
        int requiredPieces,
        List<AttributeBonusEntry> attributeBonuses,
        List<EffectBonusEntry> effectBonuses
) {
    public static SetBonusDefinition empty(String setId) {
        return new SetBonusDefinition(setId, 4, ImmutableList.of(), ImmutableList.of());
    }

    /** Attribute modifier applied as long as the set is active. */
    public record AttributeBonusEntry(
            Attribute attribute,
            AttributeModifier modifier
    ) {}

    /** Potion effect applied + refreshed while the set is active. */
    public record EffectBonusEntry(
            MobEffect effect,
            int amplifier,
            int durationTicks
    ) {}
}
