package com.iridescentcraft.relics;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Data-driven relic definition: an id plus the attribute modifiers applied while the
 * relic is worn in a curio slot. Adding a relic = one spec here + a model/lang/charm-tag
 * entry. Attributes are referenced by ResourceLocation and resolved from the registry at
 * runtime, so mods like Iron's Spellbooks are SOFT deps -- a missing attribute is skipped.
 */
public class RelicSpec {

    public record AttrMod(ResourceLocation attribute, UUID uuid, double amount, AttributeModifier.Operation op) {}

    public final String id;
    public final List<AttrMod> modifiers = new ArrayList<>();

    public RelicSpec(String id) {
        this.id = id;
    }

    /** Add a worn attribute modifier. attribute = registry id (e.g. "irons_spellbooks:spell_power"). */
    public RelicSpec add(String attribute, String uuid, double amount, AttributeModifier.Operation op) {
        this.modifiers.add(new AttrMod(new ResourceLocation(attribute), UUID.fromString(uuid), amount, op));
        return this;
    }
}
