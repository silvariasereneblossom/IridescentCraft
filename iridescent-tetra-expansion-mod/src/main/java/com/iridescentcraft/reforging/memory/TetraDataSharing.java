package com.iridescentcraft.reforging.memory;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraft.world.item.ItemStack;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import se.mickelus.tetra.module.data.ToolData;

/**
 * Sharing for Tetra's expanded schematic outcomes (RAM audit 2026-10-30, lever
 * 9b, scope options T2 and T3). Used by {@code OutcomeMaterialShareMixin},
 * {@code MaterialOutcomeToolsMixin} and {@code SchematicRegistryMemoryMixin}.
 *
 * <p>A material template in a schematic becomes one outcome per matching
 * material (29,303 on the server). Each outcome got its own copies of the
 * material's item stacks (with every capability already attached) and its own
 * tool requirement object, although there are only 1,479 distinct (material,
 * count) pairs and about 71 distinct tool requirements.
 *
 * <ul>
 *   <li>Stacks: every outcome made from the same material with the same count
 *   now points at one list of stack copies. The outcome objects stay distinct, so
 *   Tetra's de-duplication of outcomes by material object is unchanged. Every
 *   reader of these stacks (workbench and holosphere previews, repair slot
 *   placeholders, the schematic material list, Tetranomicon's debug dump) only
 *   reads them; the stacks never leave as a crafting result.</li>
 *   <li>Tool requirements: equal requirements (same tools, same levels and
 *   efficiencies) become one object. Tetra never changes a requirement after it
 *   is built: every {@code ToolData} helper returns a new object.</li>
 * </ul>
 *
 * Neither changes what a schematic offers, costs or needs.
 */
public final class TetraDataSharing {

    private static final Logger LOG = LogManager.getLogger("tetra_memory");

    /** Source material -> (count -> the first stack list made for it). Weak: a reload drops the old materials. */
    private static final Map<Object, Map<Integer, Collection<ItemStack>>> STACKS = new WeakHashMap<>();
    /** (levels, efficiencies) -> the first requirement seen with them. A few dozen entries. */
    private static final Map<List<Map<?, Float>>, ToolData> TOOLS = new ConcurrentHashMap<>();

    private static int outcomes;
    private static int stacksShared;
    private static int toolsShared;

    private TetraDataSharing() {}

    public static Collection<ItemStack> shareStacks(Object source, int count, Collection<ItemStack> built) {
        synchronized (STACKS) {
            outcomes++;
            Map<Integer, Collection<ItemStack>> byCount = STACKS.computeIfAbsent(source, k -> new HashMap<>());
            Collection<ItemStack> shared = byCount.putIfAbsent(count, built);
            if (shared == null) {
                return built;
            }
            stacksShared++;
            return shared;
        }
    }

    public static ToolData shareTools(ToolData tools) {
        if (tools == null || tools.levelMap == null || tools.efficiencyMap == null) {
            return tools;
        }
        List<Map<?, Float>> key = List.of(new HashMap<>(tools.levelMap), new HashMap<>(tools.efficiencyMap));
        ToolData shared = TOOLS.putIfAbsent(key, tools);
        if (shared == null) {
            return tools;
        }
        if (shared != tools) {
            toolsShared++;
        }
        return shared;
    }

    public static void beginSchematics() {
        outcomes = 0;
        stacksShared = 0;
        toolsShared = 0;
    }

    public static void endSchematics() {
        LOG.info("Tetra schematics: {} material outcomes; {} reuse another outcome's stack copies, "
                + "{} reuse an equal tool requirement ({} distinct requirements known)",
                outcomes, stacksShared, toolsShared, TOOLS.size());
    }
}
