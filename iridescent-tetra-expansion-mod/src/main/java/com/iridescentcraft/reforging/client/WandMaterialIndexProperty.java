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
 * Per-material model dispatch for {@link ItemModularWand}. Iterates all 4
 * module variants (handle/cap/core/inlay) and returns the float index of
 * the highest-tier material found. The wand's item model overrides on this
 * index. Mirrors {@link MaterialIndexProperty} (armor's equivalent), but
 * indexes the 7 wand-specific materials only — wood (base) + vanilla
 * stone/iron/gold/diamond/netherite + aethersteel.
 *
 * Highest-tier-wins (not handle-only): the user upgrades modules one at a
 * time at the Tetra workbench. If we only read the handle major, upgrading
 * cap/core/inlay independently leaves the icon stuck at the handle's
 * material, which violates the "wand looks more advanced as you upgrade"
 * intent. Reading all modules and taking the max means any upgrade nudges
 * the icon forward (2026-05-18 fix per tester report — user upgraded a
 * minor slot to gold, icon stayed stone).
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
            java.util.Collection<se.mickelus.tetra.module.ItemModule> modules =
                    ((IModularItem) stack.getItem()).getAllModules(stack);
            if (modules == null || modules.isEmpty()) return 0f;
            int best = 0;
            for (se.mickelus.tetra.module.ItemModule m : modules) {
                if (m == null) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String mat = v.key.substring(slash + 1);
                Integer idx = MATERIAL_INDEX.get(mat);
                if (idx != null && idx > best) best = idx;
            }
            return (float) best;
        } catch (Throwable t) {
            // Fail silently to wood-fallback rather than crashing the renderer.
        }
        return 0f;
    }
}
