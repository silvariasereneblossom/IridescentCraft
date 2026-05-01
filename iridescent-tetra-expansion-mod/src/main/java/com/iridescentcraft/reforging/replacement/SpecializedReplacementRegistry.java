package com.iridescentcraft.reforging.replacement;

import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Singleton registry of specialized-armor replacement enrichments.
 * Populated by SpecializedReplacementLoader at data-pack reload.
 * Read by SpecializedReplacementHook during Tetra workbench replacement.
 */
public final class SpecializedReplacementRegistry {
    private static final SpecializedReplacementRegistry INSTANCE = new SpecializedReplacementRegistry();

    private final Map<ResourceLocation, SpecializedReplacementDefinition> bySourceItem =
            new ConcurrentHashMap<>();

    private SpecializedReplacementRegistry() {}

    public static SpecializedReplacementRegistry get() {
        return INSTANCE;
    }

    public void replaceDefinitions(Map<ResourceLocation, SpecializedReplacementDefinition> incoming) {
        bySourceItem.clear();
        bySourceItem.putAll(incoming);
        IridescentReforging.LOGGER.info(
                "[SpecializedReplacementRegistry] loaded {} specialized replacement enrichments",
                bySourceItem.size());
    }

    public Optional<SpecializedReplacementDefinition> getForSourceItem(ResourceLocation sourceItem) {
        return Optional.ofNullable(bySourceItem.get(sourceItem));
    }
}
