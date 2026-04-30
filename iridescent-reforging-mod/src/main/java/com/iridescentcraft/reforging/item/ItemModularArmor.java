package com.iridescentcraft.reforging.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import com.iridescentcraft.reforging.skin.SkinDefinition;
import com.iridescentcraft.reforging.skin.SkinRegistry;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.data.EffectData;
import se.mickelus.tetra.module.data.ItemProperties;
import se.mickelus.tetra.module.data.SynergyData;

import java.util.Optional;
import java.util.function.Consumer;

import java.util.concurrent.TimeUnit;

/**
 * Base class for modular armor items. Extends vanilla ArmorItem so the engine's
 * hardcoded `instanceof ArmorItem` checks (combat damage, slot determination,
 * armor renderer dispatch, enchantment categories) work without mixin tax.
 *
 * Implements Tetra's IModularItem so our items appear in the Tetra workbench
 * and benefit from the existing module/honing infrastructure.
 *
 * Phase 1 scope: declare the class, provide working stubs for IModularItem's
 * abstract surface, and register four instances (helmet/chestplate/leggings/
 * boots) at the registry layer. Module logic, attribute aggregation, skin
 * dispatch, and honing are deferred to phases 3-6.
 */
public class ItemModularArmor extends ArmorItem implements IModularItem {

    // ── Cache fields required by IModularItem ──────────────────────────
    // Tetra uses Guava caches keyed by stack identifier so repeated reads
    // of attribute/effect/property data don't recompute every tick. The
    // sizes mirror ModularItem's defaults (see Tetra's ModularItem.java).
    private final Cache<String, Multimap<Attribute, AttributeModifier>> attributeCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();
    private final Cache<String, EffectData> effectCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();
    private final Cache<String, ItemProperties> propertyCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();

    // ── Module slot configuration ──────────────────────────────────────
    // Tetra distinguishes "major" (full-stack-defining) from "minor"
    // (small enhancement) modules. Per the design doc:
    //   helmet:    crown (major), visor (minor)
    //   chest:     chest_plate (major), chest_lining (minor)
    //   leggings:  leg_plate (major), belt (minor)
    //   boots:     boot_sole (major), boot_lining (minor)
    // We populate these per-slot at construction time.
    private final String[] majorModuleKeys;
    private final String[] minorModuleKeys;
    private final String[] requiredModules;

    public ItemModularArmor(ArmorMaterial baseMaterial,
                            Type slotType,
                            Properties props,
                            String[] majorModuleKeys,
                            String[] minorModuleKeys,
                            String[] requiredModules) {
        super(baseMaterial, slotType, props);
        this.majorModuleKeys = majorModuleKeys;
        this.minorModuleKeys = minorModuleKeys;
        this.requiredModules = requiredModules;
    }

    // ── IModularItem abstract surface ──────────────────────────────────

    @Override
    public net.minecraft.world.item.Item getItem() {
        return this;
    }

    @Override
    public void clearCaches() {
        attributeCache.invalidateAll();
        effectCache.invalidateAll();
        propertyCache.invalidateAll();
    }

    @Override
    public String[] getMajorModuleKeys(ItemStack stack) {
        return majorModuleKeys;
    }

    @Override
    public String[] getMinorModuleKeys(ItemStack stack) {
        return minorModuleKeys;
    }

    @Override
    public String[] getRequiredModules(ItemStack stack) {
        return requiredModules;
    }

    @Override
    public Cache<String, Multimap<Attribute, AttributeModifier>> getAttributeModifierCache() {
        return attributeCache;
    }

    @Override
    public Cache<String, EffectData> getEffectDataCache() {
        return effectCache;
    }

    @Override
    public Cache<String, ItemProperties> getPropertyCache() {
        return propertyCache;
    }

    // Honing config — placeholders for phase 5. Tetra's ModularItem reads
    // these from a config field set per-tier; we'll make them per-slot
    // configurable when the honing system lands.
    @Override
    public int getHoneBase(ItemStack stack) {
        return 450; // matches Tetra's vanilla weapon default
    }

    @Override
    public int getHoneIntegrityMultiplier(ItemStack stack) {
        return 200;
    }

    @Override
    public boolean canGainHoneProgress(ItemStack stack) {
        // Phase 1: always-on so workbench shows the honing track.
        // Phase 5 will gate this on stage / module presence.
        return true;
    }

    @Override
    public SynergyData[] getAllSynergyData(ItemStack stack) {
        // No synergies in phase 1. Synergy authoring is phase 8 (module catalog).
        return new SynergyData[0];
    }

    // ── Attribute aggregation (phase 4) ────────────────────────────────
    //
    // Forge's per-stack getAttributeModifiers(slot, stack) override. This is
    // what HumanoidArmorLayer + LivingEntity damage calculation consult to
    // determine equipped armor's contributions. We compose three sources:
    //
    //   1. Vanilla armor material defaults (from super.getDefaultAttribute-
    //      Modifiers) — placeholder iron material baseline.
    //   2. Module-driven modifiers from Tetra's IModularItem cache — picked
    //      up automatically once a stack has module data.
    //   3. Skin base attributes — phase 6 will read tag.Skin and look up the
    //      contribution from SkinRegistry. Stub for now.
    //
    // Slot guard: only emit modifiers when the queried slot matches this
    // item's slot type. ArmorItem default does this implicitly via its
    // defaultModifiers being keyed on the item's slot, but our combined
    // multimap needs the explicit check.
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(EquipmentSlot slot, ItemStack stack) {
        if (slot != getEquipmentSlot()) {
            return HashMultimap.create();
        }

        Multimap<Attribute, AttributeModifier> combined = HashMultimap.create();

        // (1) Vanilla material defaults. super.getAttributeModifiers passes
        // through to ArmorItem.defaultModifiers when the slot matches.
        combined.putAll(super.getAttributeModifiers(slot, stack));

        // (2) Module-driven modifiers via Tetra's cache layer. Returns an
        // empty multimap if the stack has no module NBT yet.
        try {
            combined.putAll(getAttributeModifiersCached(stack));
        } catch (Exception e) {
            // Fail open — modules contribute nothing this frame, vanilla
            // baseline still applies. Log once per stack-id ideally; for
            // now silent to avoid spam.
        }

        // (3) Skin base attributes (phase 6) — read tag.Skin, look up the
        // SkinDefinition, and merge in its baseAttributes. Skin lookup is
        // null-safe; absent skin means we just return material+module
        // attributes.
        String skinId = ItemModularArmorClient.readSkinId(stack);
        if (skinId != null) {
            Optional<SkinDefinition> skin = SkinRegistry.get().getDefinition(skinId);
            skin.ifPresent(def -> combined.putAll(def.baseAttributes()));
        }

        return combined;
    }

    // ── Client-side renderer dispatch (phase 6) ────────────────────────
    //
    // Registers ItemModularArmorClient as the IClientItemExtensions for
    // every ItemModularArmor instance. The client extension reads tag.Skin
    // from the rendered stack and dispatches to the appropriate Geckolib
    // renderer via SkinRegistry. Mirrors how ExtendedArmorItem in ISS
    // wires up its inner-class extension at item-init time.
    @Override
    public void initializeClient(Consumer<IClientItemExtensions> consumer) {
        consumer.accept(ItemModularArmorClient.INSTANCE);
    }

    // ── Vanilla armor texture dispatch (v0.2 phase B) ──────────────────
    //
    // For non-Geckolib skins, vanilla armor rendering reads the texture
    // path from this method via Forge's IForgeItem extension. We compute
    // the path from the skin's armor_material_namespace + name fields,
    // routing the texture lookup to the source mod's existing armor
    // textures (e.g. assets/aether/textures/models/armor/zanite_layer_1.png).
    //
    // Returning null falls back to the placeholder iron material's texture
    // — used when no skin is set or when the skin uses a Geckolib renderer
    // (which intercepts before this method is consulted).
    @Override
    public String getArmorTexture(net.minecraft.world.item.ItemStack stack,
                                  net.minecraft.world.entity.Entity entity,
                                  net.minecraft.world.entity.EquipmentSlot slot,
                                  String type) {
        String skinId = ItemModularArmorClient.readSkinId(stack);
        if (skinId == null) return null;

        SkinDefinition def = SkinRegistry.get().getDefinition(skinId).orElse(null);
        if (def == null) return null;

        boolean isLegs = slot == net.minecraft.world.entity.EquipmentSlot.LEGS;

        // Explicit per-skin texture override (preferred — handles mods with
        // non-standard armor texture paths like Aquaculture, Undergarden,
        // Twilight Forest, Blue Skies' legacy_pack). Empty string = no override.
        String explicit = isLegs ? def.textureLayer2() : def.textureLayer1();
        if (explicit != null && !explicit.isEmpty()) {
            return explicit;
        }

        // Default: vanilla convention — <ns>:textures/models/armor/<name>_layer_N.png
        String ns = def.armorMaterialNamespace();
        String name = def.armorMaterialName();
        if (ns == null || ns.isEmpty() || name == null || name.isEmpty()) {
            return null;
        }
        int layer = isLegs ? 2 : 1;
        String overlay = type == null ? "" : "_" + type;
        return ns + ":textures/models/armor/" + name + "_layer_" + layer + overlay + ".png";
    }
}
