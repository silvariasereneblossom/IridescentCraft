package com.iridescentcraft.reforging.setbonus;

import com.google.common.collect.ImmutableList;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.iridescentcraft.reforging.IridescentReforging;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.server.packs.resources.SimpleJsonResourceReloadListener;
import net.minecraft.util.profiling.ProfilerFiller;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraftforge.registries.ForgeRegistries;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Reload listener for set bonus JSONs at data/<ns>/
 * iridescent_reforging_set_bonuses/*.json.
 *
 * Schema:
 * {
 *   "set_id": "iridescent_reforging:phoenix",
 *   "required_pieces": 4,
 *   "attribute_bonuses": [
 *     {"attribute": "minecraft:generic.armor_toughness",
 *      "operation": "addition", "value": 2.0}
 *   ],
 *   "effect_bonuses": [
 *     {"effect": "minecraft:fire_resistance",
 *      "amplifier": 0, "duration_ticks": 200}
 *   ]
 * }
 *
 * Either array can be omitted (defaults to empty). UUIDs for attribute
 * modifiers are deterministic from setId + index, so they're stable
 * across sessions and identifiable for cleanup.
 */
public class SetBonusDataLoader extends SimpleJsonResourceReloadListener {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final String DIRECTORY = "iridescent_reforging_set_bonuses";

    public SetBonusDataLoader() {
        super(GSON, DIRECTORY);
    }

    @Override
    protected void apply(Map<ResourceLocation, JsonElement> jsons,
                         ResourceManager rm,
                         ProfilerFiller profiler) {
        Map<String, SetBonusDefinition> built = new HashMap<>();

        for (Map.Entry<ResourceLocation, JsonElement> entry : jsons.entrySet()) {
            ResourceLocation file = entry.getKey();
            try {
                SetBonusDefinition def = parse(file, entry.getValue().getAsJsonObject());
                if (def != null) {
                    built.put(def.setId(), def);
                }
            } catch (Exception e) {
                IridescentReforging.LOGGER.warn(
                        "[SetBonusDataLoader] failed to parse {}: {}", file, e.toString());
            }
        }

        SetBonusRegistry.get().replaceDefinitions(built);
    }

    private static SetBonusDefinition parse(ResourceLocation file, JsonObject obj) {
        String setId = obj.get("set_id").getAsString();
        int required = obj.has("required_pieces") ? obj.get("required_pieces").getAsInt() : 4;

        List<SetBonusDefinition.AttributeBonusEntry> attrs = new ArrayList<>();
        if (obj.has("attribute_bonuses")) {
            int idx = 0;
            for (JsonElement el : obj.getAsJsonArray("attribute_bonuses")) {
                JsonObject ao = el.getAsJsonObject();
                String attrId = ao.get("attribute").getAsString();
                String opStr = ao.has("operation") ? ao.get("operation").getAsString() : "addition";
                double value = ao.get("value").getAsDouble();

                Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(new ResourceLocation(attrId));
                if (attr == null) {
                    IridescentReforging.LOGGER.warn(
                            "[SetBonusDataLoader] {} references unknown attribute {} -- skipping",
                            setId, attrId);
                    idx++;
                    continue;
                }
                AttributeModifier.Operation op = parseOp(opStr);
                UUID uuid = UUID.nameUUIDFromBytes(
                        ("iridescent_reforging:set_bonus/" + setId + "/" + attrId + "/" + idx)
                                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
                attrs.add(new SetBonusDefinition.AttributeBonusEntry(
                        attr,
                        new AttributeModifier(uuid, "set_bonus:" + setId, value, op)
                ));
                idx++;
            }
        }

        List<SetBonusDefinition.EffectBonusEntry> effects = new ArrayList<>();
        if (obj.has("effect_bonuses")) {
            for (JsonElement el : obj.getAsJsonArray("effect_bonuses")) {
                JsonObject eo = el.getAsJsonObject();
                String effectId = eo.get("effect").getAsString();
                int amp = eo.has("amplifier") ? eo.get("amplifier").getAsInt() : 0;
                int dur = eo.has("duration_ticks") ? eo.get("duration_ticks").getAsInt() : 200;

                MobEffect effect = ForgeRegistries.MOB_EFFECTS.getValue(new ResourceLocation(effectId));
                if (effect == null) {
                    IridescentReforging.LOGGER.warn(
                            "[SetBonusDataLoader] {} references unknown effect {} -- skipping",
                            setId, effectId);
                    continue;
                }
                effects.add(new SetBonusDefinition.EffectBonusEntry(effect, amp, dur));
            }
        }

        return new SetBonusDefinition(setId, required,
                ImmutableList.copyOf(attrs), ImmutableList.copyOf(effects));
    }

    private static AttributeModifier.Operation parseOp(String s) {
        return switch (s) {
            case "multiply_base"  -> AttributeModifier.Operation.MULTIPLY_BASE;
            case "multiply_total" -> AttributeModifier.Operation.MULTIPLY_TOTAL;
            default                -> AttributeModifier.Operation.ADDITION;
        };
    }
}
