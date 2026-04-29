package com.iridescentcraft.reforging.skin;

import com.iridescentcraft.reforging.IridescentReforging;
import io.redspace.ironsspellbooks.entity.armor.CryomancerArmorModel;
import io.redspace.ironsspellbooks.entity.armor.CultistArmorModel;
import io.redspace.ironsspellbooks.entity.armor.GenericCustomArmorRenderer;
import io.redspace.ironsspellbooks.entity.armor.PyromancerArmorModel;
import net.minecraftforge.fml.ModList;

/**
 * Registers GeoArmorRenderer factories for Iron's Spellbooks armor sets.
 *
 * Each factory constructs the same renderer pipeline ISS itself uses
 * (see ExtendedArmorItem.supplyRenderer in irons_spellbooks.jar):
 * GenericCustomArmorRenderer wrapping a per-armor-set GeoModel subclass.
 *
 * Phase 6 v0.1: register 3 sets * 4 slots = 12 skins for end-to-end
 * validation. Phase 7 (skin authoring) extends this to full ISS coverage
 * (~50 skins) and adds Aether/TF/Cataclysm factory classes.
 *
 * One GeoModel instance is shared across all four slots within a set —
 * matches ISS's pattern, where Cultist hood/chestplate/leggings/boots
 * all return new GenericCustomArmorRenderer(new CultistArmorModel()) and
 * the slot-specific bones are toggled by prepForRender at render time.
 *
 * Gated behind ModList.isLoaded("irons_spellbooks") at the call site
 * (ClientSetup) so a pack without ISS doesn't pull in these classes.
 */
public final class IssRendererFactories {

    public static void register(SkinRegistry reg) {
        if (!ModList.get().isLoaded("irons_spellbooks")) {
            IridescentReforging.LOGGER.info(
                    "[IssRendererFactories] ISS not loaded — skipping registration");
            return;
        }

        // Cultist set — all 4 slots use one CultistArmorModel.
        registerSet(reg, "cultist", CultistArmorModel::new);
        // Pyromancer set
        registerSet(reg, "pyromancer", PyromancerArmorModel::new);
        // Cryomancer set
        registerSet(reg, "cryomancer", CryomancerArmorModel::new);

        IridescentReforging.LOGGER.info(
                "[IssRendererFactories] registered ISS skin renderers (phase 6 v0.1: 3 sets, 12 skins)");
    }

    private static void registerSet(SkinRegistry reg,
                                    String setName,
                                    java.util.function.Supplier<software.bernie.geckolib.model.GeoModel<?>> modelFactory) {
        for (String slot : new String[]{"helmet", "chestplate", "leggings", "boots"}) {
            String skinId = "iridescent_reforging:" + setName + "_" + slot;
            reg.registerFactory(skinId, () -> {
                @SuppressWarnings({"unchecked","rawtypes"})
                GenericCustomArmorRenderer renderer = new GenericCustomArmorRenderer(modelFactory.get());
                return renderer;
            });
        }
    }

    private IssRendererFactories() {}
}
