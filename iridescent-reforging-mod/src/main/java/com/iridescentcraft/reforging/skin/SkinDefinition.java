package com.iridescentcraft.reforging.skin;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;

/**
 * Server-side data record for a single armor skin. Loaded from
 * data/iridescent_reforging/skins/*.json by SkinDataLoader.
 *
 * Holds everything the modular item needs to behave like the source
 * armor: display name, base attribute modifiers, slot type, and a
 * tier marker. The renderer side (GeoArmorRenderer factory) is
 * registered separately via SkinRendererFactory in client init.
 */
public record SkinDefinition(
        String skinId,
        String slot,                  // "helmet" / "chestplate" / "leggings" / "boots"
        String sourceItem,            // e.g. "irons_spellbooks:cultist_helmet" — for tooltip + conversion
        String displayName,           // localized display name
        Multimap<Attribute, AttributeModifier> baseAttributes,
        int tier,
        String setId,                 // optional set identifier for set bonuses (e.g. "iridescent_reforging:phoenix")
        String armorMaterialNamespace, // optional source mod namespace for vanilla armor texture lookup
        String armorMaterialName       // optional source material name (e.g. "phoenix")
) {
    public static SkinDefinition empty(String skinId, String slot) {
        return new SkinDefinition(skinId, slot, "", skinId, HashMultimap.create(), 1, "", "", "");
    }
}
