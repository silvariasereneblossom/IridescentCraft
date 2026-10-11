package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import com.iridescentcraft.reforging.item.ItemModularArmor;
import com.iridescentcraft.reforging.item.SkinNbt;
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

    /**
     * Alphabetical-sort skin_id -> 1..N. Built once, lazily, from SkinRegistry;
     * null until then. Published as an immutable snapshot through a volatile
     * field, so a lookup never sees it half-built.
     */
    private static volatile Map<String, Integer> skinToIndex;

    private ClientSkinIcon() {}

    /**
     * Register the {@code skin_index} ItemProperty on all four reforged
     * armor pieces. Call from FMLClientSetupEvent (single-thread enqueue).
     * Index map is built lazily on first lookup, by which time SkinRegistry
     * holds the bundled skins.
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
                String skinId = SkinNbt.readSkinId(stack);
                if (skinId == null || skinId.isEmpty()) return 0f;
                return (float) lookupIndex(skinId);
            });
        }
        IridescentReforging.LOGGER.info(
                "[ClientSkinIcon] registered skin_index ItemProperty on 4 reforged pieces");
    }

    /**
     * Resolve a skin id to its deterministic 1..N index. Builds the map on
     * first call (the first time a reforged piece is drawn, long after the
     * bundled skins were loaded at common setup). Returns 0 if the skin is
     * unknown — caller falls through to material-based icon.
     */
    public static int lookupIndex(String skinId) {
        Map<String, Integer> index = skinToIndex;
        if (index == null) {
            index = buildIndexMap();
        }
        return index.getOrDefault(skinId, 0);
    }

    /**
     * Build the index map, once. Uses the same alphabetical sort that
     * {@code tools/gen_skin_models.py} uses at build time, so indices match.
     *
     * <p>Deliberately NOT rebuilt on /reload or a resource reload. The
     * indices are baked into the {@code reforged_<piece>.json} model
     * overrides when the jar is built, from the skin files in the jar; a
     * data-pack reload cannot change what those overrides point at. The
     * skins all ship in this jar, so a reload re-reads the same set and a
     * rebuild would produce the same map -- and if a data pack ever did add
     * a skin, re-sorting would shift every later skin off the index its
     * baked override expects, whereas keeping this map leaves the bundled
     * icons right and gives the unknown skin index 0 (the material icon).
     */
    private static synchronized Map<String, Integer> buildIndexMap() {
        Map<String, Integer> existing = skinToIndex;
        if (existing != null) return existing;   // lost the race to another caller
        List<String> sortedIds = new ArrayList<>(SkinRegistry.get().allDefinitions().keySet());
        // Nothing loaded (yet): answer "unknown" for now but do not publish,
        // or one early lookup would pin every skin to the material icon for
        // the rest of the session.
        if (sortedIds.isEmpty()) return Map.of();
        Collections.sort(sortedIds);
        Map<String, Integer> built = new HashMap<>();
        int idx = 1;
        for (String id : sortedIds) {
            built.put(id, idx++);
        }
        IridescentReforging.LOGGER.info(
                "[ClientSkinIcon] built skin index map: {} skins, idx 1..{}",
                built.size(), built.size());
        Map<String, Integer> published = Map.copyOf(built);
        skinToIndex = published;
        return published;
    }
}
