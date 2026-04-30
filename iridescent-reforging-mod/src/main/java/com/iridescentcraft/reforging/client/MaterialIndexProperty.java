package com.iridescentcraft.reforging.client;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.registry.ModItems;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;

import java.util.Map;

/**
 * Registers a client-side `iridescent_reforging:material_index` item property
 * on each reforged armor piece. The property reads the equipped major-slot
 * module's material name (last segment of the variant key, e.g. "iron" from
 * "helmet/crown/iron") and returns a float index 0..17.
 *
 * Item model overrides in `models/item/reforged_<piece>.json` switch the
 * inventory icon based on this index — iron-fallback for unknown materials,
 * source-mod sprites where they exist (vanilla 4 + manasteel/terrasteel/
 * elementium + knightmetal/steeleaf/ironwood/fiery + charoite/diopside/
 * horizonite + cloggrum/froststeel/utherium + aethersteel).
 *
 * Float ordering matters: overrides match `>=` so we order high-to-low in
 * the model JSON. Same ordering exposed here.
 */
public final class MaterialIndexProperty {

    public static final ResourceLocation ID = new ResourceLocation(
            IridescentReforging.MODID, "material_index");

    // Index = 0 means "use the base model's iron-fallback layer0".
    // Anything else maps to a per-material model override.
    public static final Map<String, Integer> MATERIAL_INDEX = Map.ofEntries(
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

    private MaterialIndexProperty() {}

    public static void register() {
        for (var ro : new net.minecraftforge.registries.RegistryObject[]{
                ModItems.REFORGED_HELMET, ModItems.REFORGED_CHESTPLATE,
                ModItems.REFORGED_LEGGINGS, ModItems.REFORGED_BOOTS}) {
            ItemProperties.register(
                    (net.minecraft.world.item.Item) ro.get(),
                    ID,
                    (stack, level, entity, seed) -> indexFor(stack));
        }
    }

    private static float indexFor(ItemStack stack) {
        if (!(stack.getItem() instanceof ItemModularArmor armor)) return 0f;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = armor.getMajorModules(stack);
            if (majors == null) return 0f;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String mat = v.key.substring(slash + 1);
                Integer idx = MATERIAL_INDEX.get(mat);
                return idx == null ? 0f : idx.floatValue();
            }
        } catch (Throwable t) {
            // Fail silently to iron-fallback rather than crashing the renderer.
        }
        return 0f;
    }
}
