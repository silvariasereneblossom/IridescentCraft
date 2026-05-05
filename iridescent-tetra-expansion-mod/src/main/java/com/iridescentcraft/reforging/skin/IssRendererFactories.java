package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import io.redspace.ironsspellbooks.entity.armor.GenericArmorModel;
import io.redspace.ironsspellbooks.entity.armor.GenericCustomArmorRenderer;
import net.minecraftforge.fml.ModList;
import software.bernie.geckolib.model.GeoModel;

import java.util.function.Supplier;

/**
 * Registers GeoArmorRenderer factories for Iron's Spellbooks armor sets.
 *
 * Each ISS armor set has one ArmorModel class shared across all four
 * slots — the slot-specific bones get toggled by GeoArmorRenderer.
 * prepForRender at render time, so we pass the same model to all four
 * skins of a set.
 *
 * Phase 7 v0.1: covers 10 ISS robe sets via GenericCustomArmorRenderer.
 * Wizard is deferred — it uses DyeableArmorRenderer with a different
 * constructor signature (color tint, slot-string parameter), which
 * doesn't fit the simple set-level factory shape. A non-dyed Wizard
 * skin via GenericArmorModel("wizard") would render but lose dye color
 * fidelity; full Wizard support comes in a follow-up.
 *
 * Specials (Boots of Speed, Iron's Crown, Tarnished Crown, Infernal
 * Sorcerer, Paladin, Netherite Battlemage) are also deferred — they
 * have unique slot-restricted geometry and require per-skin handling.
 *
 * Gated behind ModList.isLoaded("irons_spellbooks") at the entry to
 * register(); class loading of THIS class still requires ISS to be on
 * the runtime classpath. Acceptable for IridescentCraft (ISS is a hard
 * dep). For standalone-release goal, future cleanup defers class
 * loading via reflection or DistExecutor.
 */
public final class IssRendererFactories {

    public static void register(SkinRegistry reg) {
        if (!ModList.get().isLoaded("irons_spellbooks")) {
            IridescentReforging.LOGGER.info(
                    "[IssRendererFactories] ISS not loaded — skipping registration");
            return;
        }

        // 2026-05-05 CRASH FIX: ISS unique-armor Geckolib models hardcode
        // a cast to their own ISS item class in getTextureResource (e.g.
        // WanderingMagicianModel.java:8 casts to WanderingMagicianArmorItem).
        // When dispatched against our ItemModularArmor, these crash with
        // ClassCastException at first armor render. Fall back to
        // GenericArmorModel(setName) for ALL sets — texture lookup happens
        // by string-based path resolution, not by item-class cast. We lose
        // the unique 3D geometry but the silhouette + textures render
        // correctly without crashing.
        //
        // Companion change: Tetra replacement JSONs for unique ISS armor
        // were deleted in the same commit, so unique armors NO LONGER
        // auto-convert to modular variants. Native ISS items keep their
        // unique geometry, name, sprite, and effects. These factories
        // remain registered so any ALREADY-CONVERTED items in existing
        // player inventories don't crash on render.
        registerSet(reg, "cultist",            () -> new GenericArmorModel("cultist"));
        registerSet(reg, "pyromancer",         () -> new GenericArmorModel("pyromancer"));
        registerSet(reg, "cryomancer",         () -> new GenericArmorModel("cryomancer"));
        registerSet(reg, "electromancer",      () -> new GenericArmorModel("electromancer"));
        registerSet(reg, "plagued",            () -> new GenericArmorModel("plagued"));
        registerSet(reg, "priest",             () -> new GenericArmorModel("priest"));
        registerSet(reg, "pumpkin",            () -> new GenericArmorModel("pumpkin"));
        registerSet(reg, "shadowwalker",       () -> new GenericArmorModel("shadowwalker"));
        registerSet(reg, "wandering_magician", () -> new GenericArmorModel("wandering_magician"));
        registerSet(reg, "archevoker",         () -> new GenericArmorModel("archevoker"));
        registerSet(reg, "wizard",             () -> new GenericArmorModel("wizard"));
        registerSet(reg, "netherite_battlemage", () -> new GenericArmorModel("netherite_battlemage"));

        IridescentReforging.LOGGER.info(
                "[IssRendererFactories] registered ISS skin renderers (12 sets, all GenericArmorModel — crash-safe)");
    }

    private static void registerSet(SkinRegistry reg,
                                    String setName,
                                    Supplier<? extends GeoModel<?>> modelFactory) {
        for (String slot : new String[]{"helmet", "chestplate", "leggings", "boots"}) {
            String skinId = "iridescent_reforging:" + setName + "_" + slot;
            reg.registerFactory(skinId, () -> {
                @SuppressWarnings({"unchecked","rawtypes"})
                GenericCustomArmorRenderer renderer = new GenericCustomArmorRenderer(modelFactory.get());
                return renderer;
            });
        }
    }

    /**
     * Register a renderer for a single skin (used by ISS specials whose
     * data lives in only one slot — Boots of Speed, Iron's Crown, etc.).
     * The skinId is passed as-is rather than built per-slot.
     */
    private static void registerSingleSlot(SkinRegistry reg,
                                           String skinSuffix,
                                           Supplier<? extends GeoModel<?>> modelFactory) {
        String skinId = "iridescent_reforging:" + skinSuffix;
        reg.registerFactory(skinId, () -> {
            @SuppressWarnings({"unchecked","rawtypes"})
            GenericCustomArmorRenderer renderer = new GenericCustomArmorRenderer(modelFactory.get());
            return renderer;
        });
    }

    private IssRendererFactories() {}
}
