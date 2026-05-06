package com.iridescentcraft.modspells.client;

import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.item.ModularItemRegistry;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;
import se.mickelus.tetra.items.modular.IModularItem;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Source-aware inventory-icon dispatch for modular spell books.
 *
 * The replacement JSON stamps the core module's variant key as
 * `iss_core/<source_path>` (ISS) or `ars_core/<source_path>` (Ars) at
 * conversion time. We read that suffix at render time, look up a
 * deterministic numeric index, and Minecraft's model-predicate system
 * picks the right per-source override out of the modular_spell_book.json
 * / modular_ars_spell_book.json overrides array.
 *
 * Mirrors the armor side's {@code ClientSkinIcon}; same pattern, different
 * NBT key + slot name.
 *
 * Build-time companion: {@code tools/gen_spellbook_icons.py} reads the same
 * source list, generates per-source model JSONs that point at the source
 * mod's actual texture, and writes the overrides array into the main
 * modular spell book model files.
 */
@OnlyIn(Dist.CLIENT)
public final class ClientSpellbookIcon {

    private static final ResourceLocation PROPERTY_ID =
            new ResourceLocation(IridescentModularSpells.MODID, "source_index");

    /** Sorted ISS source book paths (also used by gen_spellbook_icons.py). */
    public static final List<String> ISS_SOURCES = Collections.unmodifiableList(Arrays.asList(
            "blaze_spell_book",
            "copper_spell_book",
            "diamond_spell_book",
            "dragonskin_spell_book",
            "druidic_spell_book",
            "evoker_spell_book",
            "gold_spell_book",
            "iron_spell_book",
            "necronomicon_spell_book",
            "netherite_spell_book",
            "rotten_spell_book",
            "villager_spell_book"
    ));

    /** Sorted Ars source book paths. */
    public static final List<String> ARS_SOURCES = Collections.unmodifiableList(Arrays.asList(
            "apprentice_spell_book",
            "archmage_spell_book",
            "novice_spell_book"
    ));

    private static final Map<String, Integer> ISS_INDEX = buildIndex(ISS_SOURCES);
    private static final Map<String, Integer> ARS_INDEX = buildIndex(ARS_SOURCES);

    private ClientSpellbookIcon() {}

    private static Map<String, Integer> buildIndex(List<String> sources) {
        Map<String, Integer> m = new HashMap<>();
        int i = 1;
        for (String s : new ArrayList<>(sources)) {
            m.put(s, i++);
        }
        return m;
    }

    /**
     * Register the source_index ItemProperty on both modular spell book
     * items. Call from FMLClientSetupEvent after registry deferred items
     * have resolved (via enqueueWork).
     */
    public static void register() {
        ItemProperties.register(
                ModularItemRegistry.MODULAR_SPELL_BOOK.get(),
                PROPERTY_ID,
                (stack, level, entity, seed) -> resolveIndex(stack, "iss_book/core", ISS_INDEX)
        );
        ItemProperties.register(
                ModularItemRegistry.MODULAR_ARS_SPELL_BOOK.get(),
                PROPERTY_ID,
                (stack, level, entity, seed) -> resolveIndex(stack, "ars_book/core", ARS_INDEX)
        );
        IridescentModularSpells.LOGGER.info(
                "[ClientSpellbookIcon] registered source_index on modular_spell_book + modular_ars_spell_book ({} ISS + {} Ars sources)",
                ISS_SOURCES.size(), ARS_SOURCES.size());
    }

    private static float resolveIndex(ItemStack stack, String slotName, Map<String, Integer> index) {
        if (!(stack.getItem() instanceof IModularItem item)) return 0f;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = item.getMajorModules(stack);
            if (majors == null) return 0f;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                if (!slotName.equals(m.getSlot())) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String suffix = v.key.substring(slash + 1);
                Integer idx = index.get(suffix);
                if (idx != null) return idx.floatValue();
            }
        } catch (Throwable t) {
            // Defensive: never crash item-property resolution.
        }
        return 0f;
    }
}
