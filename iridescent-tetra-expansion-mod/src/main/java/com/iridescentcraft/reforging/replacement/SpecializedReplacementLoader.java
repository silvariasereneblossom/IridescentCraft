package com.iridescentcraft.reforging.replacement;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimpleJsonResourceReloadListener;
import net.minecraft.util.profiling.ProfilerFiller;

import java.util.HashMap;
import java.util.Map;

/**
 * Reload listener for specialized-replacement JSONs.
 * Files at data/<ns>/specialized_replacements/*.json populate
 * SpecializedReplacementRegistry, keyed by source_item ResourceLocation
 * for fast lookup during the Tetra replacement hook.
 */
public class SpecializedReplacementLoader extends SimpleJsonResourceReloadListener {
    private static final Gson GSON = new GsonBuilder().create();
    private static final String DIRECTORY = "specialized_replacements";

    public SpecializedReplacementLoader() {
        super(GSON, DIRECTORY);
    }

    @Override
    protected void apply(Map<ResourceLocation, JsonElement> jsons,
                         ResourceManager rm,
                         ProfilerFiller profiler) {
        Map<ResourceLocation, SpecializedReplacementDefinition> built = new HashMap<>();

        for (Map.Entry<ResourceLocation, JsonElement> entry : jsons.entrySet()) {
            try {
                JsonObject obj = entry.getValue().getAsJsonObject();
                String sourceItem = obj.get("source_item").getAsString();
                String skinId     = obj.get("skin_id").getAsString();
                SpecializedReplacementDefinition def =
                        new SpecializedReplacementDefinition(sourceItem, skinId);
                built.put(new ResourceLocation(sourceItem), def);
            } catch (Exception e) {
                IridescentReforging.LOGGER.warn(
                        "[SpecializedReplacementLoader] failed to parse {}: {}",
                        entry.getKey(), e.toString());
            }
        }

        SpecializedReplacementRegistry.get().replaceDefinitions(built);
    }
}
