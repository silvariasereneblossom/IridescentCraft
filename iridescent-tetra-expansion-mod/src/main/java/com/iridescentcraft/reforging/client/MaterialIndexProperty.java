package com.iridescentcraft.reforging.client;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.ItemModularWand;
import com.iridescentcraft.reforging.registry.ModItems;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import se.mickelus.tetra.items.modular.IModularItem;

import java.util.Map;

/**
 * Registers a client-side `iridescent_reforging:material_index` item property
 * on each reforged armor piece AND the reforged wand. The property reads the
 * equipped major-slot module's material name (last segment of the variant key,
 * e.g. "iron" from "helmet/crown/iron" or "gold" from "wand/basic_handle/gold")
 * and returns a float index used by the model JSON's overrides list.
 *
 * Armor and wand use DIFFERENT index spaces because their model JSONs ship
 * different override ladders — armor covers 18 materials (vanilla 4 + Botania
 * + Twilight Forest + Aether + Undergarden + aethersteel), wand only covers
 * the 6 simple_staves tier materials (wood as default + stone/iron/gold/
 * diamond/netherite/aethersteel). Looking up a wand material in the armor
 * map (or vice versa) would land on the wrong icon.
 *
 * Float ordering matters: overrides match `>=` so we order high-to-low in
 * each model JSON.
 */
public final class MaterialIndexProperty {

    public static final ResourceLocation ID = new ResourceLocation(
            IridescentReforging.MODID, "material_index");

    // Armor material -> index. 0 = "use base layer0" (iron-fallback).
    // Anything else maps to a per-material model override in
    // reforged_<piece>.json.
    public static final Map<String, Integer> ARMOR_MATERIAL_INDEX = Map.ofEntries(
            Map.entry("iron",                   0),  // base case
            Map.entry("gold",                   1),
            Map.entry("diamond",                2),
            Map.entry("netherite",              3),
            Map.entry("manasteel",              4),
            Map.entry("terrasteel",             5),
            Map.entry("elementium",             6),
            Map.entry("knightmetal",            7),
            Map.entry("steeleaf",               8),
            Map.entry("ironwood",               9),
            Map.entry("fiery",                 10),
            Map.entry("charoite",              11),
            Map.entry("diopside",              12),
            Map.entry("horizonite",            13),
            Map.entry("undergarden_cloggrum",  14),
            Map.entry("undergarden_froststeel",15),
            Map.entry("undergarden_utherium",  16),
            Map.entry("aethersteel",           17)
    );

    // Wand material -> index. 0 = wooden_wand base (the layer0 in
    // reforged_wand.json). Indices match the override ladder in that file.
    // 2026-05-18: added to make the reforged_wand inventory icon track the
    // handle major-module's material the same way armor tracks its major
    // module. Without this map, all wand variants rendered as the wooden
    // base regardless of upgrade.
    public static final Map<String, Integer> WAND_MATERIAL_INDEX = Map.ofEntries(
            Map.entry("wood",       0),  // base layer0 (simple_staves:item/wooden_wand)
            Map.entry("stone",      1),
            Map.entry("iron",       2),
            Map.entry("gold",       3),
            Map.entry("diamond",    4),
            Map.entry("netherite",  5),
            Map.entry("aethersteel",6)
    );

    private MaterialIndexProperty() {}

    public static void register() {
        // Armor pieces
        for (var ro : new net.minecraftforge.registries.RegistryObject[]{
                ModItems.REFORGED_HELMET, ModItems.REFORGED_CHESTPLATE,
                ModItems.REFORGED_LEGGINGS, ModItems.REFORGED_BOOTS}) {
            ItemProperties.register(
                    (net.minecraft.world.item.Item) ro.get(),
                    ID,
                    (stack, level, entity, seed) -> indexFor(stack));
        }
        // Wand
        ItemProperties.register(
                ModItems.REFORGED_WAND.get(),
                ID,
                (stack, level, entity, seed) -> indexFor(stack));
    }

    private static float indexFor(ItemStack stack) {
        if (!(stack.getItem() instanceof IModularItem modular)) return 0f;
        Map<String, Integer> indexMap;
        if (stack.getItem() instanceof ItemModularArmor) {
            indexMap = ARMOR_MATERIAL_INDEX;
        } else if (stack.getItem() instanceof ItemModularWand) {
            indexMap = WAND_MATERIAL_INDEX;
        } else {
            return 0f;
        }
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = modular.getMajorModules(stack);
            if (majors == null) return 0f;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String mat = v.key.substring(slash + 1);
                Integer idx = indexMap.get(mat);
                return idx == null ? 0f : idx.floatValue();
            }
        } catch (Throwable t) {
            // Fail silently to base-model fallback rather than crashing the renderer.
        }
        return 0f;
    }
}
