package com.iridescentcraft.reforging.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.HashMultimap;
import com.google.common.collect.Multimap;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import se.mickelus.tetra.data.DataManager;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.SchematicRegistry;
import se.mickelus.tetra.module.data.EffectData;
import se.mickelus.tetra.module.data.ItemProperties;
import se.mickelus.tetra.module.data.SynergyData;
import se.mickelus.tetra.module.schematic.RepairSchematic;

import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Tetra-modular wand item (mage T1-T5 main-hand). One major + three minor
 * slots:
 *   handle  (major)  carries the material identity (wood / stone / iron /
 *                    gold / diamond / netherite / aethersteel). Drives the
 *                    cooldown_reduction primary attribute.
 *   cap     (minor)  mana_regen primary
 *   core    (minor)  max_mana primary
 *   inlay   (minor)  spell_power primary
 *
 * Replaces the Simple Staves material wand ladder via
 * data/tetra/replacements/simple_staves__<material>_wand.json — the player
 * crafts the SS item, drops it on a Tetra workbench, and gets a
 * reforged_wand with the matching major variant pre-installed. Modules can
 * then be upgraded independently per-slot.
 */
public class ItemModularWand extends Item implements IModularItem {

    private final Cache<String, Multimap<Attribute, AttributeModifier>> attributeCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();
    private final Cache<String, EffectData> effectCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();
    private final Cache<String, ItemProperties> propertyCache =
            CacheBuilder.newBuilder().maximumSize(64).expireAfterAccess(5, TimeUnit.MINUTES).build();

    private final String[] majorModuleKeys;
    private final String[] minorModuleKeys;
    private final String[] requiredModules;
    private final String tetraIdentifier;

    public ItemModularWand(Properties props,
                           String[] majorModuleKeys,
                           String[] minorModuleKeys,
                           String[] requiredModules,
                           String tetraIdentifier) {
        super(props);
        this.majorModuleKeys = majorModuleKeys;
        this.minorModuleKeys = minorModuleKeys;
        this.requiredModules = requiredModules;
        this.tetraIdentifier = tetraIdentifier;
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, tetraIdentifier));
        DataManager.instance.moduleData.onReload(this::clearCaches);
    }

    // Mirror ItemModularArmor.damageItem — wraps ModularItemDamageEvent.post()
    // in a try/catch so a third-party listener throwing CCE doesn't crash
    // every wand swing. The Aetheric Tetranomicon failure mode we documented
    // for armor applies to weapon damage too (same event, same dispatcher).
    @Override
    public <T extends LivingEntity> int damageItem(ItemStack stack, int amount, T entity, Consumer<T> onBroken) {
        se.mickelus.tetra.event.ModularItemDamageEvent event =
                new se.mickelus.tetra.event.ModularItemDamageEvent(entity, stack, amount);
        try {
            net.minecraftforge.common.MinecraftForge.EVENT_BUS.post(event);
        } catch (ClassCastException cce) {
            org.apache.logging.log4j.LogManager.getLogger("iridescent_reforging").warn(
                    "[icraft] ModularItemDamageEvent listener threw CCE on wand ({}). Continuing.",
                    cce.toString());
        }
        int actualAmount = event.getAmount();
        try {
            actualAmount = se.mickelus.tetra.effect.BloodboundEffect.reduceDamage(stack, entity, actualAmount);
        } catch (Throwable t) {
            // BloodboundEffect failures must not crash item damage.
        }
        return Math.min(stack.getMaxDamage() - stack.getDamageValue() - 1, actualAmount);
    }

    @Override public Item getItem() { return this; }

    @Override
    public void clearCaches() {
        attributeCache.invalidateAll();
        effectCache.invalidateAll();
        propertyCache.invalidateAll();
    }

    @Override public String[] getMajorModuleKeys(ItemStack stack)    { return majorModuleKeys; }
    @Override public String[] getMinorModuleKeys(ItemStack stack)    { return minorModuleKeys; }
    @Override public String[] getRequiredModules(ItemStack stack)    { return requiredModules; }

    // 1-major + 3-minors workbench layout: same diamond coordinates the
    // armor uses (NE major, W/SW/SE minors).
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

    @Override public Cache<String, Multimap<Attribute, AttributeModifier>> getAttributeModifierCache() { return attributeCache; }
    @Override public Cache<String, EffectData> getEffectDataCache() { return effectCache; }
    @Override public Cache<String, ItemProperties> getPropertyCache() { return propertyCache; }

    @Override public int     getHoneBase(ItemStack stack)              { return 450; }
    @Override public int     getHoneIntegrityMultiplier(ItemStack stack) { return 200; }
    @Override public boolean canGainHoneProgress(ItemStack stack)       { return true; }

    @Override
    public SynergyData[] getAllSynergyData(ItemStack stack) {
        return new SynergyData[0];
    }

    // Module-driven attribute aggregation for the main-hand slot only.
    // Vanilla Item doesn't auto-populate defaultModifiers, so this is the
    // only path that wires module attributes onto the equipped wand.
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(EquipmentSlot slot, ItemStack stack) {
        if (slot != EquipmentSlot.MAINHAND) {
            return HashMultimap.create();
        }
        Multimap<Attribute, AttributeModifier> combined = HashMultimap.create();
        try {
            combined.putAll(getAttributeModifiersCached(stack));
        } catch (Exception e) {
            // Fail open — modules contribute nothing this frame.
        }
        return combined;
    }

    // Anvil repair: accept the matching ingot/material for the major variant.
    @Override
    public boolean isValidRepairItem(ItemStack toRepair, ItemStack repairItem) {
        if (!(toRepair.getItem() instanceof ItemModularWand)) return false;
        String mat = readMajorMaterial(toRepair);
        if (mat == null) return false;
        net.minecraft.resources.ResourceLocation rl =
                net.minecraftforge.registries.ForgeRegistries.ITEMS.getKey(repairItem.getItem());
        if (rl == null) return false;
        String path = rl.getPath();
        if (path.equals(mat + "_ingot") || path.equals(mat + "_nugget")) return true;
        if (mat.equals("gold")        && path.equals("gold_ingot"))        return true;
        if (mat.equals("diamond")     && path.equals("diamond"))           return true;
        if (mat.equals("netherite")   && path.equals("netherite_ingot"))   return true;
        if (mat.equals("aethersteel") && path.equals("aethersteel_ingot")) return true;
        if (mat.equals("wood")        && path.equals("stick"))             return true;
        if (mat.equals("stone")       && path.equals("cobblestone"))       return true;
        return false;
    }

    private int computeTier(ItemStack stack) {
        try {
            int honedCount = getHonedCount(stack);
            if (honedCount >= 9) return 3;
            if (honedCount >= 4) return 2;
            return 1;
        } catch (Throwable t) {
            return 1;
        }
    }

    // Material-driven display name (mirrors ItemModularArmor.getName):
    // "Iron Wand", "Aethersteel Wand", etc.
    @Override
    public net.minecraft.network.chat.Component getName(ItemStack stack) {
        try {
            String mat = readMajorMaterial(stack);
            if (mat == null || mat.isEmpty()) return super.getName(stack);
            return net.minecraft.network.chat.Component.translatable(
                    "item.iridescent_reforging.material_wand",
                    net.minecraft.network.chat.Component.translatable("tetra.material." + mat),
                    net.minecraft.network.chat.Component.translatable(
                            "item.iridescent_reforging.wand_piece"));
        } catch (Throwable t) {
            return super.getName(stack);
        }
    }

    @Override
    public void appendHoverText(ItemStack stack,
                                @org.jetbrains.annotations.Nullable net.minecraft.world.level.Level level,
                                java.util.List<net.minecraft.network.chat.Component> tooltip,
                                net.minecraft.world.item.TooltipFlag flag) {
        try {
            int tier = computeTier(stack);
            String roman = tier == 3 ? "III" : (tier == 2 ? "II" : "I");
            tooltip.add(net.minecraft.network.chat.Component.translatable(
                    "tooltip.iridescent_reforging.tier", roman)
                    .withStyle(net.minecraft.ChatFormatting.GRAY));
            tooltip.addAll(IModularItem.super.getTooltip(stack, level, flag));
        } catch (Throwable t) {
            super.appendHoverText(stack, level, tooltip, flag);
        }
    }

    // Extract the major handle's material suffix from the variant key.
    // "basic_handle/iron" -> "iron". Used by display name + anvil repair.
    private static String readMajorMaterial(ItemStack stack) {
        if (!(stack.getItem() instanceof ItemModularWand)) return null;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors =
                    ((IModularItem) stack.getItem()).getMajorModules(stack);
            if (majors == null) return null;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                String slot = m.getSlot();
                if (slot == null || !slot.equals("wand/handle")) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                return v.key.substring(slash + 1);
            }
        } catch (Throwable t) {
            // fall through to null
        }
        return null;
    }
}
