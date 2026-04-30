package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import io.redspace.ironsspellbooks.entity.armor.ArchevokerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.BootsOfSpeedArmorModel;
import io.redspace.ironsspellbooks.entity.armor.CryomancerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.CultistArmorModel;
import io.redspace.ironsspellbooks.entity.armor.ElectromancerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.GenericArmorModel;
import io.redspace.ironsspellbooks.entity.armor.GenericCustomArmorRenderer;
import io.redspace.ironsspellbooks.entity.armor.GoldCrownModel;
import io.redspace.ironsspellbooks.entity.armor.InfernalSorcererArmorModel;
import io.redspace.ironsspellbooks.entity.armor.PaladinArmorModel;
import io.redspace.ironsspellbooks.entity.armor.PlaguedArmorModel;
import io.redspace.ironsspellbooks.entity.armor.PyromancerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.ShadowwalkerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.TarnishedCrownModel;
import io.redspace.ironsspellbooks.entity.armor.WanderingMagicianModel;
import io.redspace.ironsspellbooks.entity.armor.netherite.NetheriteMageArmorModel;
import io.redspace.ironsspellbooks.entity.armor.priest.PriestArmorModel;
import io.redspace.ironsspellbooks.entity.armor.pumpkin.PumpkinArmorModel;
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

        // 10 sets (excludes Wizard — see class doc).
        registerSet(reg, "cultist",            CultistArmorModel::new);
        registerSet(reg, "pyromancer",         PyromancerArmorModel::new);
        registerSet(reg, "cryomancer",         CryomancerArmorModel::new);
        registerSet(reg, "electromancer",      ElectromancerArmorModel::new);
        registerSet(reg, "plagued",            PlaguedArmorModel::new);
        registerSet(reg, "priest",             PriestArmorModel::new);
        registerSet(reg, "pumpkin",            PumpkinArmorModel::new);
        registerSet(reg, "shadowwalker",       ShadowwalkerArmorModel::new);
        registerSet(reg, "wandering_magician", WanderingMagicianModel::new);
        registerSet(reg, "archevoker",         ArchevokerArmorModel::new);

        // Wizard fallback — uses GenericArmorModel("wizard") wrapped in
        // GenericCustomArmorRenderer (non-dyeable). Dye color won't carry
        // through but the silhouette renders correctly.
        registerSet(reg, "wizard", () -> new GenericArmorModel("wizard"));

        // v0.2 ISS specials — single-slot or partial sets with unique geometry.
        registerSet(reg, "netherite_battlemage", NetheriteMageArmorModel::new);
        registerSingleSlot(reg, "infernal_sorcerer_chestplate",
                InfernalSorcererArmorModel::new);
        registerSingleSlot(reg, "paladin_chestplate", PaladinArmorModel::new);
        registerSingleSlot(reg, "boots_of_speed_boots", BootsOfSpeedArmorModel::new);
        registerSingleSlot(reg, "gold_crown_helmet", GoldCrownModel::new);
        registerSingleSlot(reg, "tarnished_crown_helmet", TarnishedCrownModel::new);

        IridescentReforging.LOGGER.info(
                "[IssRendererFactories] registered ISS skin renderers (v0.2: 12 sets + 5 specials)");
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
