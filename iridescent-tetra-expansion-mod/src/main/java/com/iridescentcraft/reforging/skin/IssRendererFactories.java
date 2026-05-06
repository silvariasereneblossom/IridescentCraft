package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import io.redspace.ironsspellbooks.entity.armor.GenericCustomArmorRenderer;
import net.minecraftforge.fml.ModList;

/**
 * Registers GeoArmorRenderer factories for Iron's Spellbooks armor sets.
 *
 * 2026-05-05 design: every ISS unique-armor renderer historically used a
 * per-set Geckolib model class (CultistArmorModel, WanderingMagicianModel,
 * etc.) whose synthetic bridge method casts the rendered item to a specific
 * ISS armor item type. That cast crashes when our {@code ItemModularArmor}
 * (with skin tag set) is rendered through this dispatch path.
 *
 * Fix: replace ALL per-set models with {@link IcraftIssArmorModel}, a generic
 * {@code GeoModel<GeoAnimatable>} that takes path strings via constructor.
 * Same texture + .geo.json + animation files ISS ships (extracted from the
 * ISS jar bytecode below) but with no item-class cast in the bridge method.
 *
 * Result: unique 3D geometry, unique texture, unique animations -- no crash.
 *
 * Wizard set previously used GenericArmorModel("wizard"); also moves to
 * IcraftIssArmorModel since GenericArmorModel had the same cast bug
 * (T extends ExtendedArmorItem, our class doesn't extend that).
 */
public final class IssRendererFactories {

    /** Universal animation file used by all ISS armor sets. */
    private static final String UNIVERSAL_ANIM = "animations/wizard_armor_animation.json";

    public static void register(SkinRegistry reg) {
        if (!ModList.get().isLoaded("irons_spellbooks")) {
            IridescentReforging.LOGGER.info(
                    "[IssRendererFactories] ISS not loaded -- skipping registration");
            return;
        }

        // 12 main sets (4 slots each) -- texture + geo paths follow setName.
        // Convention: textures/models/armor/<setName>.png
        //             geo/<setName>_armor.geo.json
        // Confirmed by decompiling each ISS *Model class.
        registerSet(reg, "cultist",            "cultist_armor",            "cultist");
        registerSet(reg, "pyromancer",         "pyromancer_armor",         "pyromancer");
        registerSet(reg, "cryomancer",         "cryomancer_armor",         "cryomancer");
        registerSet(reg, "electromancer",      "electromancer_armor",      "electromancer");
        registerSet(reg, "plagued",            "plagued_armor",            "plagued");
        registerSet(reg, "priest",             "priest_armor",             "priest");
        registerSet(reg, "pumpkin",            "pumpkin_armor",            "pumpkin");
        registerSet(reg, "shadowwalker",       "shadowwalker_armor",       "shadowwalker");
        registerSet(reg, "wandering_magician", "wandering_magician_armor", "wandering_magician");
        registerSet(reg, "archevoker",         "archevoker_armor",         "archevoker");
        registerSet(reg, "wizard",             "wizard_armor",             "wizard");

        // netherite_battlemage uses geo/netherite_armor.geo.json + textures/.../netherite.png
        // (decompiled from NetheriteMageArmorModel.class)
        registerSet(reg, "netherite_battlemage", "netherite_armor", "netherite");

        // 5 single-slot specials. Non-uniform paths -- enumerated from
        // PaladinArmorModel/InfernalSorcererArmorModel/BootsOfSpeedArmorModel/
        // GoldCrownModel/TarnishedCrownModel decompilation.
        registerSingleSlot(reg, "infernal_sorcerer_chestplate",
                "infernal_sorcerer", "infernal_sorcerer");
        registerSingleSlot(reg, "paladin_chestplate",
                "paladin_chestplate", "paladin_chestplate");
        registerSingleSlot(reg, "boots_of_speed_boots",
                "boots_of_speed", "boots_of_speed");
        registerSingleSlot(reg, "gold_crown_helmet",
                "tarnished_armor", "gold_crown");
        registerSingleSlot(reg, "tarnished_crown_helmet",
                "tarnished_armor", "tarnished");

        IridescentReforging.LOGGER.info(
                "[IssRendererFactories] registered ISS skin renderers (12 sets + 5 specials, IcraftIssArmorModel -- crash-safe + unique geometry)");
    }

    /**
     * Register a 4-slot set (helmet/chestplate/leggings/boots all use the
     * same model + texture file). 11 of the 12 main sets fit this pattern.
     *
     * @param setName       skin set name (e.g. "wandering_magician")
     * @param geoBasename   filename stem under irons_spellbooks/geo/ (with no extension)
     *                      e.g. "wandering_magician_armor" -> resolves to
     *                      geo/wandering_magician_armor.geo.json
     * @param texBasename   filename stem under irons_spellbooks/textures/models/armor/
     *                      e.g. "wandering_magician" -> resolves to
     *                      textures/models/armor/wandering_magician.png
     */
    private static void registerSet(SkinRegistry reg,
                                    String setName,
                                    String geoBasename,
                                    String texBasename) {
        String geoPath     = "geo/" + geoBasename + ".geo.json";
        String texturePath = "textures/models/armor/" + texBasename + ".png";
        for (String slot : new String[]{"helmet", "chestplate", "leggings", "boots"}) {
            String skinId = "iridescent_reforging:" + setName + "_" + slot;
            reg.registerFactory(skinId, () -> {
                @SuppressWarnings({"unchecked","rawtypes"})
                GenericCustomArmorRenderer renderer = new GenericCustomArmorRenderer(
                        new IcraftIssArmorModel(geoPath, texturePath, UNIVERSAL_ANIM));
                return renderer;
            });
        }
    }

    /**
     * Register a single-slot special. Used for partial sets (paladin chestplate
     * only, gold_crown helmet only, etc.) where the geometry doesn't extend to
     * the whole 4-piece set.
     *
     * @param skinSuffix    full slot-suffixed skin id, e.g. "paladin_chestplate"
     */
    private static void registerSingleSlot(SkinRegistry reg,
                                           String skinSuffix,
                                           String geoBasename,
                                           String texBasename) {
        String skinId      = "iridescent_reforging:" + skinSuffix;
        String geoPath     = "geo/" + geoBasename + ".geo.json";
        String texturePath = "textures/models/armor/" + texBasename + ".png";
        reg.registerFactory(skinId, () -> {
            @SuppressWarnings({"unchecked","rawtypes"})
            GenericCustomArmorRenderer renderer = new GenericCustomArmorRenderer(
                    new IcraftIssArmorModel(geoPath, texturePath, UNIVERSAL_ANIM));
            return renderer;
        });
    }

    private IssRendererFactories() {}
}
