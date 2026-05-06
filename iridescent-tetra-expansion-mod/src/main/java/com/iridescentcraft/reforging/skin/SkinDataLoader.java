package com.iridescentcraft.reforging.skin;

import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimpleJsonResourceReloadListener;
import net.minecraft.util.profiling.ProfilerFiller;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Vanilla data-pack reload listener that loads skin definitions from
 * data/iridescent_reforging/skins/*.json into SkinRegistry.
 *
 * Schema (per file):
 * {
 *   "skin_id": "iridescent_reforging:cultist_helmet",
 *   "slot": "helmet",
 *   "source_item": "irons_spellbooks:cultist_helmet",
 *   "display_name": "Reforged Cultist Hood",
 *   "tier": 2,
 *   "base_attributes": [
 *     {
 *       "attribute": "puffish_attributes:magic_damage",
 *       "operation": "multiply_base",   // addition | multiply_base | multiply_total
 *       "value": 0.05
 *     }
 *   ]
 * }
 *
 * Attribute modifier UUIDs are deterministic per (skin_id, attribute_id,
 * index) so skin data is stable across server restarts. Generated via
 * UUID.nameUUIDFromBytes — same input yields same UUID forever.
 *
 * Robustness: a malformed skin file logs a warning and is skipped. The
 * rest of the registry continues to load. No crash on bad data.
 */
public class SkinDataLoader extends SimpleJsonResourceReloadListener {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final String DIRECTORY = "iridescent_reforging_skins";

    public SkinDataLoader() {
        // SimpleJsonResourceReloadListener scans data/<any_ns>/<directory>/*.json
        // across all loaded data packs. We use a verbose subfolder name
        // ("iridescent_reforging_skins") rather than something generic like
        // "skins" so we don't collide with any other mod that happens to use
        // the same path. Files go at:
        //
        //   data/<source_pack_namespace>/iridescent_reforging_skins/<id>.json
        //
        // For our own bundled skins, source_pack_namespace = iridescent_reforging.
        // Any data pack can ship additional skins under their own namespace —
        // see apply() which reads files from any namespace and trusts the
        // skin_id field inside the JSON.
        super(GSON, DIRECTORY);
    }

    @Override
    protected void apply(Map<ResourceLocation, JsonElement> jsons,
                         ResourceManager rm,
                         ProfilerFiller profiler) {
        Map<String, SkinDefinition> built = new HashMap<>();

        for (Map.Entry<ResourceLocation, JsonElement> entry : jsons.entrySet()) {
            ResourceLocation file = entry.getKey();
            // Accept skins from any namespace (data packs can ship them too);
            // the skin_id inside the JSON is the canonical identifier.
            try {
                SkinDefinition def = parseSkin(file, entry.getValue().getAsJsonObject());
                if (def != null) {
                    built.put(def.skinId(), def);
                }
            } catch (Exception e) {
                IridescentReforging.LOGGER.warn(
                        "[SkinDataLoader] failed to parse skin {}: {}", file, e.toString());
            }
        }

        SkinRegistry.get().replaceDefinitions(built);
    }

    public static SkinDefinition parseSkin(ResourceLocation file, JsonObject obj) {
        String skinId       = obj.get("skin_id").getAsString();
        String slot         = obj.get("slot").getAsString();
        String sourceItem   = obj.has("source_item")  ? obj.get("source_item").getAsString()  : "";
        String displayName  = obj.has("display_name") ? obj.get("display_name").getAsString() : skinId;
        int tier            = obj.has("tier")         ? obj.get("tier").getAsInt()            : 1;

        Multimap<Attribute, AttributeModifier> attrs = HashMultimap.create();
        if (obj.has("base_attributes")) {
            int idx = 0;
            for (JsonElement el : obj.getAsJsonArray("base_attributes")) {
                JsonObject ao = el.getAsJsonObject();
                String attrId = ao.get("attribute").getAsString();
                String opStr  = ao.has("operation") ? ao.get("operation").getAsString() : "addition";
                double value  = ao.get("value").getAsDouble();

                Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(new ResourceLocation(attrId));
                if (attr == null) {
                    IridescentReforging.LOGGER.warn(
                            "[SkinDataLoader] {} references unknown attribute {} -- skipping",
                            skinId, attrId);
                    idx++;
                    continue;
                }
                AttributeModifier.Operation op = parseOperation(opStr);
                UUID uuid = UUID.nameUUIDFromBytes(
                        ("iridescent_reforging:skin/" + skinId + "/" + attrId + "/" + idx)
                                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
                attrs.put(attr, new AttributeModifier(uuid, "skin:" + skinId, value, op));
                idx++;
            }
        }

        String setId = obj.has("set_id") ? obj.get("set_id").getAsString() : "";
        String armNs   = obj.has("armor_material_namespace") ? obj.get("armor_material_namespace").getAsString() : "";
        String armName = obj.has("armor_material_name") ? obj.get("armor_material_name").getAsString() : "";
        String tex1    = obj.has("texture_layer_1") ? obj.get("texture_layer_1").getAsString() : "";
        String tex2    = obj.has("texture_layer_2") ? obj.get("texture_layer_2").getAsString() : "";

        return new SkinDefinition(skinId, slot, sourceItem, displayName, attrs, tier, setId, armNs, armName, tex1, tex2);
    }

    private static AttributeModifier.Operation parseOperation(String s) {
        return switch (s) {
            case "multiply_base"  -> AttributeModifier.Operation.MULTIPLY_BASE;
            case "multiply_total" -> AttributeModifier.Operation.MULTIPLY_TOTAL;
            default                -> AttributeModifier.Operation.ADDITION;
        };
    }
}
