package com.iridescentcraft.reforging.skin;

import net.minecraft.resources.ResourceLocation;
import software.bernie.geckolib.core.animatable.GeoAnimatable;
import software.bernie.geckolib.model.GeoModel;

/**
 * Drop-in replacement for the per-set ISS Geckolib models (CultistArmorModel,
 * WanderingMagicianModel, etc.) that bypasses ISS's broken type-bound dispatch.
 *
 * Each ISS unique armor model declares {@code GeoModel<T extends ISSItemType>}
 * and overrides {@code getTextureResource(T)} with a body that just returns a
 * hardcoded ResourceLocation -- the item parameter is unused. But Java's
 * compiler-generated bridge method does
 * {@code (ISSItemType) obj} before calling the typed override, which crashes
 * when {@code obj} is our {@link com.iridescentcraft.reforging.item.ItemModularArmor}
 * (extends ArmorItem, NOT ExtendedArmorItem -> not assignable to any of ISS's
 * specific types).
 *
 * This class extends {@code GeoModel<GeoAnimatable>} directly. Same texture +
 * model + animation paths ISS uses (extracted from the ISS jar bytecode), but
 * the cast is to {@code GeoAnimatable} which our ItemModularArmor satisfies
 * via Geckolib's {@code GeoItem} contract on its parent ArmorItem path.
 *
 * Construction: pass the 3 path strings extracted from the ISS class. See
 * {@link IssRendererFactories} for the full table of (skinId -> paths) entries.
 *
 * No item-class casting. No crash. Unique 3D geometry + texture + animations
 * preserved from ISS's resource pack.
 */
public class IcraftIssArmorModel extends GeoModel<GeoAnimatable> {

    private final ResourceLocation modelPath;
    private final ResourceLocation texturePath;
    private final ResourceLocation animationPath;

    /**
     * @param geoPath e.g. "geo/wandering_magician_armor.geo.json"
     * @param texturePath e.g. "textures/models/armor/wandering_magician.png"
     * @param animationPath e.g. "animations/wizard_armor_animation.json"
     */
    public IcraftIssArmorModel(String geoPath, String texturePath, String animationPath) {
        this.modelPath     = new ResourceLocation("irons_spellbooks", geoPath);
        this.texturePath   = new ResourceLocation("irons_spellbooks", texturePath);
        this.animationPath = new ResourceLocation("irons_spellbooks", animationPath);
    }

    @Override
    public ResourceLocation getModelResource(GeoAnimatable obj) {
        return modelPath;
    }

    @Override
    public ResourceLocation getTextureResource(GeoAnimatable obj) {
        return texturePath;
    }

    @Override
    public ResourceLocation getAnimationResource(GeoAnimatable obj) {
        return animationPath;
    }
}
