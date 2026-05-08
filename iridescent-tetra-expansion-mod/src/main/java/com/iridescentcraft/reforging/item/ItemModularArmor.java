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
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;
import se.mickelus.tetra.data.DataManager;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.SchematicRegistry;
import se.mickelus.tetra.module.data.EffectData;
import se.mickelus.tetra.module.data.ItemProperties;
import se.mickelus.tetra.module.data.SynergyData;
import se.mickelus.tetra.module.schematic.RepairSchematic;
import software.bernie.geckolib.animatable.GeoItem;
import software.bernie.geckolib.core.animatable.instance.AnimatableInstanceCache;
import software.bernie.geckolib.core.animatable.instance.SingletonAnimatableInstanceCache;
import software.bernie.geckolib.core.animation.AnimatableManager;

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
public class ItemModularArmor extends ArmorItem implements IModularItem, GeoItem {

    // ── GeoItem (Geckolib) implementation ──────────────────────────────
    // Required so ISS's GenericCustomArmorRenderer + GeoArmorRenderer can
    // render skinned armor without ClassCastException at line 320 of
    // GeoArmorRenderer.actuallyRender (geckolib-forge 4.8.3). The renderer
    // does (GeoItem) item.getAnimatableInstanceCache(); without this
    // interface implementation we crash at the cast.
    //
    // We don't ship custom Geckolib animations on these armor pieces -- the
    // animation file referenced by IcraftIssArmorModel is ISS's universal
    // wizard_armor_animation.json, which is sufficient. registerControllers
    // can be empty; the renderer will use the default keyframe path.
    private final AnimatableInstanceCache geoCache =
            new SingletonAnimatableInstanceCache(this);

    @Override
    public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
        // No custom animation controllers; ISS's animation file drives bone
        // resets via the default Geckolib path.
    }

    @Override
    public AnimatableInstanceCache getAnimatableInstanceCache() {
        return geoCache;
    }


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

    /** Tetra item identifier for schematic registration. Mirrors the
     *  per-piece identifier the spell book items pass (TETRA_IDENTIFIER).
     *  Each armor piece (helmet/chestplate/leggings/boots) registers a
     *  distinct RepairSchematic via this field. Required for the
     *  workbench Repair button to appear on the item. */
    private final String tetraIdentifier;

    public ItemModularArmor(ArmorMaterial baseMaterial,
                            Type slotType,
                            Properties props,
                            String[] majorModuleKeys,
                            String[] minorModuleKeys,
                            String[] requiredModules,
                            String tetraIdentifier) {
        super(baseMaterial, slotType, props);
        this.majorModuleKeys = majorModuleKeys;
        this.minorModuleKeys = minorModuleKeys;
        this.requiredModules = requiredModules;
        this.tetraIdentifier = tetraIdentifier;

        // Two registrations both spell book items already do but armor
        // missed -- adding here so workbench Repair shows up + caches
        // flush on /reload:
        //
        //   1. RepairSchematic -- without this, Tetra's workbench has
        //      no repair option for the item. Matching tetraIdentifier
        //      lets Tetra cycle through installed modules and use each
        //      module's material as the repair input.
        //   2. DataManager onReload hook -- clears the per-stack
        //      attribute / property / effect caches when data packs
        //      reload, so workbench changes take effect without a
        //      relog.
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, tetraIdentifier));
        DataManager.instance.moduleData.onReload(this::clearCaches);
    }

    /**
     * Tetra-native durability clamp. Vanilla ItemStack.hurtAndBreak calls
     * Item.damageItem(stack, amount, entity, onBroken) BEFORE running the
     * destruction check. Tetra's `ModularItem` (the concrete base most
     * Tetra items extend) overrides damageItem to delegate to
     * IModularItem.damageItemImpl, which clamps via
     *   Math.min(maxDamage - currentDamage - 1, amount)
     * and posts ModularItemDamageEvent + applies BloodboundEffect.
     *
     * Our ItemModularArmor extends ArmorItem directly (not ModularItem)
     * so without this override we inherit vanilla's no-op default and
     * the clamp never fires. Result: items destroyed at maxDamage.
     *
     * History: an earlier revision inlined the clamp here to avoid
     * posting ModularItemDamageEvent, because Aetheric Tetranomicon's
     * VeridiumInfusionEffect listener does an unchecked cast to the
     * concrete ModularItem class and crashed when it received our
     * subclass (real session, 2026-05-08 14:12). That workaround
     * lost BloodboundEffect + third-party damage-modifier integration
     * on our items. Restored to the proper damageItemImpl call now
     * that iridescent_durability_clamp's EventBusInvokeMixin guards
     * every Forge listener in a try/catch ClassCastException -- the
     * bad cast still throws inside the addon listener but the guard
     * swallows it, logs once via [event-guard], and continues. Our
     * post-event chain (BloodboundEffect, the maxDamage-1 clamp)
     * runs normally.
     */
    @Override
    public <T extends LivingEntity> int damageItem(ItemStack stack, int amount, T entity, Consumer<T> onBroken) {
        return damageItemImpl(stack, amount, entity, onBroken);
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

    // ── Workbench module-icon layout ───────────────────────────────────
    //
    // Modeled on Tetra's ModularSingleHeadedItem (sword/axe):
    //   sword majorOffsets = (1, -3, -11, 21)   2 majors: NE inner + SW outer
    //   sword minorOffsets = (-14, 0)            1 minor:  W outer
    //
    // Our armor is 1-major + 3-minors. We use sword's 3 positions plus an
    // SE-mirror of the SW position for a fourth slot. Diamond is the same
    // size across all Tetra items, so coordinates transfer verbatim.
    //
    //   Major:    (1, -3)     NE inner   text right
    //   Minor 0:  (-14, 0)    W outer    text left   (sword's minor)
    //   Minor 1:  (-11, 21)   SW outer   text left   (sword's 2nd major)
    //   Minor 2:  (3, 21)     SE outer   text right  (new — mirror of SW)
    @Override
    public se.mickelus.tetra.gui.GuiModuleOffsets getMajorGuiOffsets(ItemStack stack) {
        return new se.mickelus.tetra.gui.GuiModuleOffsets(1, -3);
    }

    @Override
    public se.mickelus.tetra.gui.GuiModuleOffsets getMinorGuiOffsets(ItemStack stack) {
        return new se.mickelus.tetra.gui.GuiModuleOffsets(
                -14, 0,
                -11, 21,
                3, 21);
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

    // ── Attribute aggregation ──────────────────────────────────────────
    //
    // CRITICAL: do NOT delegate to super.getAttributeModifiers. Vanilla
    // ArmorItem bakes its baseMaterial defenses (armor / toughness /
    // knockback resistance) into a static `defaultModifiers` multimap at
    // construction time and returns it here. Tetra's module pipeline
    // independently produces those same attributes from variant data, with
    // a different deterministic UUID — so calling super double-counts:
    // iron chestplate = 6 (Tetra modules) + 6 (vanilla material default)
    // = 12 armor on the equipped player. Same mechanism inflated
    // movement_speed past −100% with heavy armor.
    //
    // Pattern modeled on Tetra's own ItemModularHandheld.getAttribute-
    // Modifiers (tetra jar `se/mickelus/tetra/items/modular/
    // ItemModularHandheld.class`): module data is the sole source of
    // truth for the equipped slot, empty for non-matching slots.
    //
    // Sources composed:
    //   1. Tetra IModularItem cache (variant attribute data)
    //   2. Skin base attributes (read from tag.Skin if present)
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(EquipmentSlot slot, ItemStack stack) {
        if (slot != getEquipmentSlot()) {
            return HashMultimap.create();
        }

        Multimap<Attribute, AttributeModifier> combined = HashMultimap.create();

        // (1) Module-driven modifiers via Tetra's cache layer. Returns an
        // empty multimap if the stack has no module NBT yet.
        try {
            combined.putAll(getAttributeModifiersCached(stack));
        } catch (Exception e) {
            // Fail open — modules contribute nothing this frame.
        }

        // (2) Skin base attributes — read tag.Skin, look up the
        // SkinDefinition, and merge in its baseAttributes.
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

    // ── Stack NBT migration (one-time) ─────────────────────────────────
    //
    // Fixup for stacks whose NBT was written before the schematic
    // doubling fix (commit 9db85e12). Runs once per stack via
    // inventoryTick; subsequent ticks short-circuit on the migration tag.
    // Server-side only — NBT changes need to sync to the client via
    // existing slot-update packets, which they do automatically when
    // ItemStack#setTag is called from inventoryTick.
    @Override
    public void inventoryTick(ItemStack stack, net.minecraft.world.level.Level level,
                              net.minecraft.world.entity.Entity entity, int slotId, boolean isSelected) {
        super.inventoryTick(stack, level, entity, slotId, isSelected);
        if (level == null || level.isClientSide) return;
        StackNbtMigrator.migrate(stack);
    }

    // ── Anvil repair ────────────────────────────────────────────────────
    //
    // Lets players repair reforged armor at a vanilla anvil using the
    // matching ingot/material. Tetra's workbench repair (RepairAction)
    // is wired separately via per-variant repair JSONs in
    // data/tetra/repairs/<slot>/<variant>.json — that path enables the
    // workbench's Repair button. This override gives the anvil path as a
    // universal fallback that works for any installed major variant.
    @Override
    public boolean isValidRepairItem(ItemStack toRepair, ItemStack repairItem) {
        if (!(toRepair.getItem() instanceof ItemModularArmor)) return false;
        String mat = readMajorMaterial(toRepair);
        if (mat == null) return false;
        net.minecraft.resources.ResourceLocation rl =
                net.minecraftforge.registries.ForgeRegistries.ITEMS.getKey(repairItem.getItem());
        if (rl == null) return false;
        // Accept the exact ingot for the major material. e.g. iron major
        // accepts iron_ingot (vanilla), gold accepts gold_ingot, manasteel
        // accepts botania:manasteel_ingot, etc.
        String path = rl.getPath();
        if (path.equals(mat + "_ingot") || path.equals(mat + "_nugget")) return true;
        // Vanilla "golden_ingot" doesn't exist; vanilla uses "gold_ingot"
        // for major key "gold". Map our key -> vanilla path.
        if (mat.equals("gold")    && path.equals("gold_ingot")) return true;
        if (mat.equals("diamond") && path.equals("diamond"))    return true;
        if (mat.equals("netherite") && path.equals("netherite_ingot")) return true;
        return false;
    }

    // ── Tier indicator in tooltip ──────────────────────────────────────
    //
    // Tetra weapons display a T1/T2/T3 tier next to the durability bar
    // based on hone level reached. Our armor reads the highest hone level
    // across the four module slots and prints a Component like "Tier II"
    // at the top of the tooltip below the display name.
    private int computeTier(ItemStack stack) {
        try {
            int max = 0;
            se.mickelus.tetra.module.ItemModuleMajor[] majors = getMajorModules(stack);
            if (majors != null) {
                for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                    if (m == null) continue;
                    max = Math.max(max, m.getImprovementLevel(stack, "settled"));
                }
            }
            // Approximate: tier 1 = no settled, tier 2 = at least one
            // settled, tier 3 = all majors settled. Honing levels can
            // refine this later.
            int honedCount = getHonedCount(stack);
            if (honedCount >= 9) return 3;
            if (honedCount >= 4) return 2;
            return 1;
        } catch (Throwable t) {
            return 1;
        }
    }

    // ── Shift-hover module tooltip ──────────────────────────────────────
    //
    // Tetra's ModularItem.appendHoverText calls `getTooltip(stack, level,
    // flag)` (default method on IModularItem) which produces the module
    // breakdown shown when shift is held over a modular item. ArmorItem's
    // own appendHoverText doesn't call that path, so we wire it manually
    // through the inherited interface default.
    @Override
    public void appendHoverText(ItemStack stack,
                                @org.jetbrains.annotations.Nullable net.minecraft.world.level.Level level,
                                java.util.List<net.minecraft.network.chat.Component> tooltip,
                                net.minecraft.world.item.TooltipFlag flag) {
        try {
            // Tier line (T1/T2/T3) at top, styled like Tetra's tier display
            int tier = computeTier(stack);
            String roman = tier == 3 ? "III" : (tier == 2 ? "II" : "I");
            tooltip.add(net.minecraft.network.chat.Component.translatable(
                    "tooltip.iridescent_reforging.tier", roman)
                    .withStyle(net.minecraft.ChatFormatting.GRAY));
            // Armor weight class (Light / Medium / Heavy) — gates how
            // much armor a player can stack while still wearing magic-
            // friendly gear. Determined by the major module's archetype:
            //   Heavy: heavy_* major  → max armor
            //   Medium: basic / breastplate / full_leg_plate / basic_boot_sole
            //   Light: light_* + mage majors (circlet, robe, robed_*, scaled_chest)
            ArmorWeight weight = getArmorWeight(stack);
            if (weight != null) {
                String langKey = "tooltip.iridescent_reforging.weight." + weight.langSuffix;
                net.minecraft.ChatFormatting color = switch (weight) {
                    case HEAVY  -> net.minecraft.ChatFormatting.GOLD;
                    case MEDIUM -> net.minecraft.ChatFormatting.YELLOW;
                    case LIGHT  -> net.minecraft.ChatFormatting.AQUA;
                    case ROBE   -> net.minecraft.ChatFormatting.LIGHT_PURPLE;
                };
                tooltip.add(net.minecraft.network.chat.Component.translatable(langKey)
                        .withStyle(color));
            }
            // Tetra's installed-modules breakdown
            tooltip.addAll(IModularItem.super.getTooltip(stack, level, flag));
        } catch (Throwable t) {
            // Tooltip composition mustn't crash the inventory render; if
            // Tetra's getTooltip throws, fall through to vanilla behavior.
            super.appendHoverText(stack, level, tooltip, flag);
        }
    }

    // ── Armor weight class (visible to players) ────────────────────────
    //
    // Light/Medium/Heavy classification by armor VALUE (not mobility), so
    // mage majors (circlet/robe/robed_*) bucket as Light alongside rogue
    // light_*. The point is to limit how tanky a mage build can get —
    // robed armor is light-class regardless of its magical properties.
    //
    // Mapping derived from each major module's armor multiplier vs the
    // basic/medium baseline (1.0×):
    //   Heavy:   1.4× armor      (heavy_crown, cuirass, heavy_leg_plate,
    //                             heavy_boot_sole)
    //   Medium:  1.0× armor      (basic_crown, breastplate, full_leg_plate,
    //                             basic_boot_sole)
    //   Light:   0.5-0.83× armor (light_crown, scaled_chest, light_leg_plate,
    //                             light_boot_sole, circlet, robe_chest,
    //                             robed_leg_plate, robed_boot_sole)
    //
    // To find the player's weight class, read the major module's
    // moduleKey (e.g. "leggings/heavy_leg_plate" → HEAVY).
    public enum ArmorWeight {
        ROBE("robe"),     // mage gear: less armor than light, +mana regen, full-set bonus
        LIGHT("light"),
        MEDIUM("medium"),
        HEAVY("heavy");
        public final String langSuffix;
        ArmorWeight(String suffix) { this.langSuffix = suffix; }
    }

    private static final java.util.Map<String, ArmorWeight> MAJOR_WEIGHT;
    static {
        java.util.Map<String, ArmorWeight> m = new java.util.HashMap<>();
        // helmet
        m.put("helmet/heavy_crown",        ArmorWeight.HEAVY);
        m.put("helmet/basic_crown",        ArmorWeight.MEDIUM);
        m.put("helmet/light_crown",        ArmorWeight.LIGHT);
        m.put("helmet/circlet",            ArmorWeight.ROBE);
        // chestplate
        m.put("chestplate/cuirass",        ArmorWeight.HEAVY);
        m.put("chestplate/breastplate",    ArmorWeight.MEDIUM);
        m.put("chestplate/scaled_chest",   ArmorWeight.LIGHT);
        m.put("chestplate/robe_chest",     ArmorWeight.ROBE);
        // leggings
        m.put("leggings/heavy_leg_plate",  ArmorWeight.HEAVY);
        m.put("leggings/full_leg_plate",   ArmorWeight.MEDIUM);
        m.put("leggings/light_leg_plate",  ArmorWeight.LIGHT);
        m.put("leggings/robed_leg_plate",  ArmorWeight.ROBE);
        // boots
        m.put("boots/heavy_boot_sole",     ArmorWeight.HEAVY);
        m.put("boots/basic_boot_sole",     ArmorWeight.MEDIUM);
        m.put("boots/light_boot_sole",     ArmorWeight.LIGHT);
        m.put("boots/robed_boot_sole",     ArmorWeight.ROBE);
        MAJOR_WEIGHT = java.util.Collections.unmodifiableMap(m);
    }

    /** @return weight class of the installed major, or null if no major
     * is installed yet (catch-all variant only).
     *
     * <p>Public so KubeJS scripts and the {@link ArmorWeightAggregator}
     * can read the per-piece tier without re-implementing the major-key
     * lookup table.
     */
    public ArmorWeight getArmorWeight(ItemStack stack) {
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = getMajorModules(stack);
            if (majors == null || majors.length == 0) return null;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                ArmorWeight w = MAJOR_WEIGHT.get(m.getKey());
                if (w != null) return w;
            }
        } catch (Throwable t) { /* fall through */ }
        return null;
    }

    // ── Display name (material-driven) ──────────────────────────────────
    //
    // Iron crown -> "Iron Helmet", manasteel chest_plate -> "Manasteel
    // Chestplate", etc. Mirrors Tetra's weapon naming. Skin-tagged armor
    // (Wizard, Cultist, etc.) keeps its own display name unchanged.
    //
    // Defensive: any throw or null path falls back to the vanilla item
    // name. We never want this method to crash item rendering.
    @Override
    public net.minecraft.network.chat.Component getName(ItemStack stack) {
        try {
            String skinId = ItemModularArmorClient.readSkinId(stack);
            if (skinId != null) {
                SkinDefinition def = SkinRegistry.get().getDefinition(skinId).orElse(null);
                if (def != null && def.displayName() != null && !def.displayName().isEmpty()) {
                    return net.minecraft.network.chat.Component.literal(def.displayName());
                }
            }
            String mat = readMajorMaterial(stack);
            if (mat == null || mat.isEmpty()) return super.getName(stack);
            return net.minecraft.network.chat.Component.translatable(
                    "item.iridescent_reforging.material_armor",
                    net.minecraft.network.chat.Component.translatable("tetra.material." + mat),
                    net.minecraft.network.chat.Component.translatable(
                            "item.iridescent_reforging.armor_piece." + pieceKey()));
        } catch (Throwable t) {
            return super.getName(stack);
        }
    }

    private String pieceKey() {
        return switch (getType()) {
            case HELMET     -> "helmet";
            case CHESTPLATE -> "chestplate";
            case LEGGINGS   -> "leggings";
            case BOOTS      -> "boots";
        };
    }

    /** The slot name of the MAIN structural module for each armor piece. */
    private static String mainSlotKey(ItemModularArmor armor) {
        return switch (armor.getType()) {
            case HELMET     -> "helmet/crown";
            case CHESTPLATE -> "chestplate/chest_plate";
            case LEGGINGS   -> "leggings/leg_plate";
            case BOOTS      -> "boots/boot_sole";
        };
    }

    private static String readMajorMaterial(ItemStack stack) {
        if (!(stack.getItem() instanceof ItemModularArmor armor)) return null;
        // Target the MAIN slot specifically so the displayed material always
        // reflects the chest_plate / crown / leg_plate / boot_sole's material,
        // not whichever lining/trim/pauldron iteration happens to return first.
        // Bug fix 2026-05-06: pre-fix converted breastplates with emerald
        // pauldrons would display as "Emerald Plate" even after the chest_plate
        // was changed to leather, because the loop returned the pauldron variant.
        String mainSlotName = mainSlotKey(armor);
        if (mainSlotName == null) return null;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = armor.getMajorModules(stack);
            if (majors == null) return null;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                String slot = m.getSlot();
                if (slot == null || !slot.equals(mainSlotName)) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                return v.key.substring(slash + 1);
            }
        } catch (Throwable t) { /* fall through */ }
        return null;
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
        if (skinId == null) {
            // No skin (vanilla-armor-replacement path) — derive from the
            // equipped major-slot module's material.
            return deriveTextureFromMajorMaterial(stack, slot);
        }

        SkinDefinition def = SkinRegistry.get().getDefinition(skinId).orElse(null);
        if (def == null) {
            return deriveTextureFromMajorMaterial(stack, slot);
        }

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
            // Fall through to module-material derivation below.
            return deriveTextureFromMajorMaterial(stack, slot);
        }
        int layer = isLegs ? 2 : 1;
        String overlay = type == null ? "" : "_" + type;
        return ns + ":textures/models/armor/" + name + "_layer_" + layer + overlay + ".png";
    }

    /**
     * Derive vanilla armor texture from the equipped major-slot module's
     * material when no skin tag is present.
     *
     * The variant key looks like "helmet/crown/iron" — we extract the trailing
     * "iron" segment and return the matching texture path. Vanilla materials
     * (iron/gold/diamond/netherite) use minecraft: convention; modded materials
     * with a verified standard `_layer_N.png` format use the entry from
     * MATERIAL_TEXTURE_TEMPLATES; everything else falls back to the iron
     * texture so the player never sees the missing-texture checkerboard.
     */
    public static String deriveTextureFromMajorMaterial(ItemStack stack,
                                                        net.minecraft.world.entity.EquipmentSlot slot) {
        if (!(stack.getItem() instanceof ItemModularArmor armor)) return null;
        int layer = (slot == net.minecraft.world.entity.EquipmentSlot.LEGS) ? 2 : 1;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = armor.getMajorModules(stack);
            if (majors == null || majors.length == 0) return ironFallback(layer);
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                String mat = v.key.substring(slash + 1);
                if (mat.isEmpty()) continue;
                String tmpl = MATERIAL_TEXTURE_TEMPLATES.get(mat);
                if (tmpl != null) {
                    return tmpl.replace("{layer}", String.valueOf(layer));
                }
                if (VANILLA_MATERIALS.contains(mat)) {
                    return "minecraft:textures/models/armor/" + mat + "_layer_" + layer + ".png";
                }
                return ironFallback(layer);
            }
        } catch (Throwable t) {
            // Fail safe to iron rather than the missing-texture checkerboard.
        }
        return ironFallback(layer);
    }

    private static String ironFallback(int layer) {
        return "minecraft:textures/models/armor/iron_layer_" + layer + ".png";
    }

    // Material → vanilla-layer-compatible texture template. Each mapped value
    // is a ResourceLocation string with a "{layer}" placeholder (1 or 2). Only
    // mods whose layer_1 + layer_2 textures both exist in their assets land
    // here; mods using Geckolib-only renderers (Botania, Twilight Forest) or
    // single-texture armor are intentionally absent and fall back to iron.
    private static final java.util.Map<String, String> MATERIAL_TEXTURE_TEMPLATES = java.util.Map.of(
            "aethersteel",            "aethersteel:textures/models/armor/aethersteel__layer_{layer}.png",
            "undergarden_cloggrum",   "undergarden:textures/armor/cloggrum_layer_{layer}.png",
            "undergarden_froststeel", "undergarden:textures/armor/froststeel_layer_{layer}.png",
            "undergarden_utherium",   "undergarden:textures/armor/utherium_layer_{layer}.png",
            "charoite",               "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/charoite_layer_{layer}.png",
            "diopside",               "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/diopside_layer_{layer}.png",
            "horizonite",             "blue_skies:legacy_pack/assets/blue_skies/textures/models/armor/horizonite_layer_{layer}.png"
    );

    private static final java.util.Set<String> VANILLA_MATERIALS = java.util.Set.of(
            "iron", "gold", "diamond", "netherite", "leather", "chainmail", "turtle"
    );
}
