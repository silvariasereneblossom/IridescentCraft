package com.iridescentcraft.modspells.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.Multimap;
import io.redspace.ironsspellbooks.item.SpellBook;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import se.mickelus.tetra.data.DataManager;
import se.mickelus.tetra.gui.GuiModuleOffsets;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.SchematicRegistry;
import se.mickelus.tetra.module.data.EffectData;
import se.mickelus.tetra.module.data.ItemProperties;
import se.mickelus.tetra.module.data.SynergyData;
import se.mickelus.tetra.module.data.ToolData;
import se.mickelus.tetra.module.schematic.RepairSchematic;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Modular ISS spell book base. Subclasses ISS's {@link SpellBook} so we
 * inherit spell-casting, curio behavior, and the standard book item
 * lifecycle for free; implements Tetra's {@link IModularItem} so the book
 * is recognized by the Tetra workbench.
 *
 * <p>Phase 6B: skeleton only. {@code getMajorModuleKeys} reports the slot
 * layout so the book appears in the workbench, but no schemas/modules
 * exist yet, so installed-module set is empty. Stat bonuses still come
 * from the legacy {@code imodspells_slots} NBT system via
 * {@link com.iridescentcraft.modspells.event.AttributeApplier}.
 *
 * <p>Phase 6C registers the slot schemas + per-material variants;
 * Phase 6D migrates legacy NBT into Tetra's Modules NBT and retires
 * AttributeApplier + AnvilModuleInstaller.
 *
 * <p>Tetra slot layout (5 majors, no minors): {@code core},
 * {@code front_cover}, {@code back_cover}, {@code spine}, {@code pages}.
 * The {@code core} slot picks which underlying ISS book the modular
 * variant represents (copper / iron / gold / diamond / netherite); the
 * other four slots accept Tetra material tags.
 */
public class ModularSpellBookItem extends SpellBook implements IModularItem {

    /** Tetra item identifier for repair-schematic + cache namespacing.
     *  Must match [a-z0-9/._-] only — Tetra builds it into a ResourceLocation
     *  path, where ':' is illegal. */
    public static final String TETRA_IDENTIFIER = "iridescent_iss_book";

    /** Tetra slot keys (used by IModularItem; matches `slots` field in modules/<key>.json).
     *  No `core` slot — each ISS modular item is tier-locked at registration (5 separate
     *  items for copper/iron/gold/diamond/netherite). */
    public static final String TETRA_SLOT_FRONT_COVER = "iss_book/front_cover";
    public static final String TETRA_SLOT_BACK_COVER = "iss_book/back_cover";
    public static final String TETRA_SLOT_SPINE = "iss_book/spine";
    public static final String TETRA_SLOT_PAGES = "iss_book/pages";

    private static final String[] MAJOR_KEYS = {
            TETRA_SLOT_FRONT_COVER, TETRA_SLOT_BACK_COVER,
            TETRA_SLOT_SPINE, TETRA_SLOT_PAGES
    };

    private final Cache<String, Multimap<Attribute, AttributeModifier>> attributeCache =
            CacheBuilder.newBuilder().maximumSize(1000L).expireAfterWrite(5L, TimeUnit.MINUTES).build();
    private final Cache<String, ToolData> toolCache =
            CacheBuilder.newBuilder().maximumSize(1000L).expireAfterWrite(5L, TimeUnit.MINUTES).build();
    private final Cache<String, EffectData> effectCache =
            CacheBuilder.newBuilder().maximumSize(1000L).expireAfterWrite(5L, TimeUnit.MINUTES).build();
    private final Cache<String, ItemProperties> propertyCache =
            CacheBuilder.newBuilder().maximumSize(1000L).expireAfterWrite(5L, TimeUnit.MINUTES).build();

    private final SynergyData[] synergies = new SynergyData[0];

    // ===== Legacy Phase 1-5 imodspells_slots NBT system (retired in 6D) =====

    public static final String SLOTS_NBT_KEY = "imodspells_slots";
    public static final String SLOT_COVER = "cover";
    public static final String SLOT_PAGES = "pages";

    public static final Map<String, Map<AttributeKey, Double>> COVER_BONUSES = new HashMap<>();
    public static final Map<String, Map<AttributeKey, Double>> PAGES_BONUSES = new HashMap<>();

    static {
        COVER_BONUSES.put("leather",
                Map.of(AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("copper",
                Map.of(AttributeKey.MAX_MANA, 0.05,
                       AttributeKey.MANA_REGEN, 0.03));
        COVER_BONUSES.put("iron",
                Map.of(AttributeKey.SPELL_POWER, 0.05,
                       AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("gold",
                Map.of(AttributeKey.MANA_REGEN, 0.10,
                       AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("diamond",
                Map.of(AttributeKey.SPELL_POWER, 0.15));
        COVER_BONUSES.put("netherite",
                Map.of(AttributeKey.SPELL_POWER, 0.20,
                       AttributeKey.MAX_MANA, 0.10));

        PAGES_BONUSES.put("leather",
                Map.of(AttributeKey.SPELL_POWER, 0.02));
        PAGES_BONUSES.put("copper",
                Map.of(AttributeKey.MANA_REGEN, 0.03));
        PAGES_BONUSES.put("iron",
                Map.of(AttributeKey.MANA_REGEN, 0.05));
        PAGES_BONUSES.put("gold",
                Map.of(AttributeKey.MANA_REGEN, 0.10,
                       AttributeKey.COOLDOWN_REDUCTION, 0.05));
        PAGES_BONUSES.put("diamond",
                Map.of(AttributeKey.SPELL_POWER, 0.10,
                       AttributeKey.COOLDOWN_REDUCTION, 0.05));
        PAGES_BONUSES.put("netherite",
                Map.of(AttributeKey.SPELL_POWER, 0.15,
                       AttributeKey.COOLDOWN_REDUCTION, 0.10));
    }

    public ModularSpellBookItem(int maxSpellSlots, Properties properties) {
        super(maxSpellSlots, properties);
        DataManager.instance.moduleData.onReload(this::clearCaches);
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, TETRA_IDENTIFIER));
    }

    // ===== IModularItem contract =====

    @Override
    public Item getItem() {
        return this;
    }

    @Override
    public void clearCaches() {
        attributeCache.invalidateAll();
        toolCache.invalidateAll();
        effectCache.invalidateAll();
        propertyCache.invalidateAll();
    }

    @Override
    public String[] getMajorModuleKeys(ItemStack itemStack) {
        return MAJOR_KEYS;
    }

    @Override
    public String[] getMinorModuleKeys(ItemStack itemStack) {
        return new String[0];
    }

    @Override
    public String[] getRequiredModules(ItemStack itemStack) {
        // 6B: nothing required so books work without modules. 6D will lock
        // in all 5 majors once schemas land + migration runs.
        return new String[0];
    }

    public GuiModuleOffsets getMajorGuiOffsets(ItemStack itemStack) {
        // 4-slot layout: front_cover (top-left), back_cover (top-right),
        // spine (bottom-left), pages (bottom-right).
        return new GuiModuleOffsets(new int[]{5, 18, -15, -1, 5, -1, -15, 18});
    }

    public GuiModuleOffsets getMinorGuiOffsets(ItemStack itemStack) {
        return new GuiModuleOffsets(new int[0]);
    }

    @Override
    public int getHoneBase(ItemStack itemStack) {
        return 450;
    }

    @Override
    public int getHoneIntegrityMultiplier(ItemStack itemStack) {
        return 200;
    }

    @Override
    public boolean canGainHoneProgress(ItemStack itemStack) {
        return false;
    }

    @Override
    public SynergyData[] getAllSynergyData(ItemStack itemStack) {
        return synergies;
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

    // ===== Legacy NBT slot accessors (used by AttributeApplier through 6C) =====

    public static String getSlotMaterial(ItemStack stack, String slotName) {
        if (stack.isEmpty() || stack.getTag() == null) return null;
        CompoundTag slots = stack.getTag().getCompound(SLOTS_NBT_KEY);
        if (slots.isEmpty()) return null;
        if (!slots.contains(slotName)) return null;
        String material = slots.getString(slotName);
        return material.isEmpty() ? null : material;
    }

    public static void setSlotMaterial(ItemStack stack, String slotName, String material) {
        CompoundTag tag = stack.getOrCreateTag();
        CompoundTag slots = tag.getCompound(SLOTS_NBT_KEY);
        if (material == null || material.isEmpty()) {
            slots.remove(slotName);
        } else {
            slots.putString(slotName, material);
        }
        tag.put(SLOTS_NBT_KEY, slots);
    }

    public static double getTotalBonus(ItemStack stack, AttributeKey key) {
        if (!(stack.getItem() instanceof ModularSpellBookItem)) return 0.0;
        double total = 0.0;
        String cover = getSlotMaterial(stack, SLOT_COVER);
        if (cover != null && COVER_BONUSES.containsKey(cover)) {
            total += COVER_BONUSES.get(cover).getOrDefault(key, 0.0);
        }
        String pages = getSlotMaterial(stack, SLOT_PAGES);
        if (pages != null && PAGES_BONUSES.containsKey(pages)) {
            total += PAGES_BONUSES.get(pages).getOrDefault(key, 0.0);
        }
        return total;
    }

    @Override
    public void appendHoverText(ItemStack stack, Level level,
                                List<Component> tooltip, TooltipFlag flag) {
        super.appendHoverText(stack, level, tooltip, flag);

        tooltip.add(Component.literal("Modular Slots:")
                .withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD));
        appendSlotLine(tooltip, stack, SLOT_COVER, "Cover");
        appendSlotLine(tooltip, stack, SLOT_PAGES, "Pages");

        Map<AttributeKey, Double> totals = new LinkedHashMap<>();
        for (AttributeKey k : AttributeKey.values()) {
            double v = getTotalBonus(stack, k);
            if (v != 0.0) totals.put(k, v);
        }
        if (!totals.isEmpty()) {
            tooltip.add(Component.literal("Total Bonuses:")
                    .withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD));
            totals.forEach((k, v) -> {
                String pct = String.format("%+.1f%%", v * 100.0);
                tooltip.add(Component.literal("  " + pct + " " + k.displayName)
                        .withStyle(ChatFormatting.AQUA));
            });
        }

        // Tetra module breakdown — empty in 6B, populated once schemas land in 6C.
        tooltip.addAll(this.getTooltip(stack, level, flag));
    }

    private static void appendSlotLine(List<Component> tooltip, ItemStack stack,
                                       String slotKey, String displayName) {
        String material = getSlotMaterial(stack, slotKey);
        MutableComponent line = Component.literal("  " + displayName + ": ");
        if (material == null) {
            line.append(Component.literal("(empty)").withStyle(ChatFormatting.DARK_GRAY));
        } else {
            line.append(Component.literal(material).withStyle(ChatFormatting.YELLOW));
        }
        tooltip.add(line.withStyle(ChatFormatting.GRAY));
    }

    public enum AttributeKey {
        SPELL_POWER("Spell Power", "irons_spellbooks:spell_power"),
        MAX_MANA("Max Mana", "irons_spellbooks:max_mana"),
        MANA_REGEN("Mana Regen", "irons_spellbooks:mana_regen"),
        COOLDOWN_REDUCTION("Cooldown Reduction", "irons_spellbooks:cooldown_reduction"),
        ARS_MAX_MANA("Max Mana (Ars)", "ars_nouveau:ars_nouveau.perk.max_mana"),
        ARS_SPELL_DAMAGE("Spell Damage (Ars)", "ars_nouveau:ars_nouveau.perk.spell_damage");

        public final String displayName;
        public final String attributeId;

        AttributeKey(String displayName, String attributeId) {
            this.displayName = displayName;
            this.attributeId = attributeId;
        }
    }
}
