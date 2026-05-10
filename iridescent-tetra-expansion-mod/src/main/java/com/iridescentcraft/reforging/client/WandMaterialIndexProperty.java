package com.iridescentcraft.reforging.client;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularWand;
import com.iridescentcraft.reforging.registry.ModItems;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import se.mickelus.tetra.items.modular.IModularItem;

import java.util.Map;

/**
 * Per-material model dispatch for {@link ItemModularWand}. Reads the major
 * handle module's material and returns a float index that the wand's item
 * model overrides on. Mirrors {@link MaterialIndexProperty} (armor's
 * equivalent), but indexes the 7 wand-specific materials only — vanilla 4
 * + wood + stone + aethersteel.
 *
 * Index = 0 means "use the base model" (wooden_wand texture).
 */
public final class WandMaterialIndexProperty {

    public static final ResourceLocation ID = new ResourceLocation(
            IridescentReforging.MODID, "material_index");

    public static final Map<String, Integer> MATERIAL_INDEX = Map.of(
            "wood",        0,
            "stone",       1,
            "iron",        2,
            "gold",        3,
            "diamond",     4,
            "netherite",   5,
            "aethersteel", 6
    );

    private WandMaterialIndexProperty() {}

    public static void register() {
        ItemProperties.register(
                ModItems.REFORGED_WAND.get(),
                ID,
                (stack, level, entity, seed) -> indexFor(stack));
    }

    private static float indexFor(ItemStack stack) {
        if (!(stack.getItem() instanceof ItemModularWand)) return 0f;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors =
                    ((IModularItem) stack.getItem()).getMajorModules(stack);
            if (majors == null) return 0f;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                String slot = m.getSlot();
                if (slot == null || !slot.equals("wand/handle")) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String mat = v.key.substring(slash + 1);
                Integer idx = MATERIAL_INDEX.get(mat);
                return idx == null ? 0f : idx.floatValue();
            }
        } catch (Throwable t) {
            // Fail silently to wood-fallback rather than crashing the renderer.
        }
        return 0f;
    }
}
