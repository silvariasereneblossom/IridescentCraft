package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.ItemModularArmorClient;
import com.iridescentcraft.reforging.registry.ModItems;
import net.minecraft.client.renderer.item.ItemProperties;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.api.distmarker.OnlyIn;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Skin-aware inventory-icon dispatch for ItemModularArmor.
 *
 * Tetra's reforged_<piece>.json model JSONs only have material_index
 * predicates — they pick an iron/diamond/etc. icon based on the modular
 * item's MAJOR material. Skin-tagged armor (Wandering Magician, Cultist,
 * etc.) inherits a generic material icon, losing visual identity.
 *
 * Fix: register a custom ItemProperty `iridescent_reforging:skin_index`
 * that reads `tag.Skin` and returns a deterministic numeric ID per skin
 * (alphabetical sort, 1..N). The reforged_<piece>.json overrides array
 * appends per-skin entries that point at custom textures derived from
 * the source mod's inventory icon.
 *
 * Build-time companion: `tools/gen_skin_models.py` reads the same skin
 * definitions, sorts them the same way, and generates:
 *   - `assets/iridescent_reforging/models/item/skin/<short_id>.json`
 *     pointing to the source mod's texture
 *   - `assets/iridescent_reforging/models/item/reforged_<piece>.json`
 *     overrides array entries
 *
 * Both sides use alphabetical sort over `SkinRegistry.allDefinitions().keySet()`
 * so indices are stable and matched.
 *
 * Index 0 = no skin (falls through to material_index overrides).
 */
@OnlyIn(Dist.CLIENT)
public final class ClientSkinIcon {

    private static final ResourceLocation PROPERTY_ID =
            new ResourceLocation("iridescent_reforging", "skin_index");

    /** Alphabetical-sort skin_id -> 1..N. Computed lazily from SkinRegistry. */
    private static final Map<String, Integer> SKIN_TO_INDEX = new HashMap<>();
    private static volatile boolean indexBuilt = false;

    private ClientSkinIcon() {}

    /**
     * Register the {@code skin_index} ItemProperty on all four reforged
     * armor pieces. Call from FMLClientSetupEvent (single-thread enqueue).
     * Index map is built lazily on first lookup so SkinRegistry can finish
     * loading datapacks first.
     */
    public static void register() {
        Item[] armorItems = new Item[]{
                ModItems.REFORGED_HELMET.get(),
                ModItems.REFORGED_CHESTPLATE.get(),
                ModItems.REFORGED_LEGGINGS.get(),
                ModItems.REFORGED_BOOTS.get(),
        };
        for (Item item : armorItems) {
            ItemProperties.register(item, PROPERTY_ID, (stack, level, entity, seed) -> {
                String skinId = ItemModularArmorClient.readSkinId(stack);
                if (skinId == null || skinId.isEmpty()) return 0f;
                return (float) lookupIndex(skinId);
            });
        }
        IridescentReforging.LOGGER.info(
                "[ClientSkinIcon] registered skin_index ItemProperty on 4 reforged pieces");
    }

    /**
     * Resolve a skin id to its deterministic 1..N index. Builds the map on
     * first call (after SkinRegistry has loaded datapack skins). Returns 0
     * if the skin is unknown — caller falls through to material-based icon.
     */
    public static int lookupIndex(String skinId) {
        if (!indexBuilt) {
            buildIndexMap();
        }
        return SKIN_TO_INDEX.getOrDefault(skinId, 0);
    }

    /**
     * Reset + rebuild the index map. Called on first lookup AND must be
     * called manually if datapacks reload at runtime (e.g. /reload). Uses
     * the same alphabetical sort that {@code tools/gen_skin_models.py}
     * uses at build time, so indices match.
     */
    public static synchronized void buildIndexMap() {
        SKIN_TO_INDEX.clear();
        List<String> sortedIds = new ArrayList<>(SkinRegistry.get().allDefinitions().keySet());
        Collections.sort(sortedIds);
        int idx = 1;
        for (String id : sortedIds) {
            SKIN_TO_INDEX.put(id, idx++);
        }
        indexBuilt = true;
        IridescentReforging.LOGGER.info(
                "[ClientSkinIcon] built skin index map: {} skins, idx 1..{}",
                SKIN_TO_INDEX.size(), SKIN_TO_INDEX.size());
    }
}
