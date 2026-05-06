package com.iridescentcraft.modspells.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.Multimap;
import com.hollingsworth.arsnouveau.api.spell.SpellTier;
import com.hollingsworth.arsnouveau.client.renderer.item.SpellBookRenderer;
import com.hollingsworth.arsnouveau.common.items.SpellBook;
import com.iridescentcraft.modspells.IridescentModularSpells;
import net.minecraft.client.renderer.BlockEntityWithoutLevelRenderer;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;
import java.util.function.Consumer;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraftforge.registries.ForgeRegistries;
import se.mickelus.tetra.data.DataManager;
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
 * Modular Ars Nouveau spell book. Subclasses Ars's {@link SpellBook} to
 * inherit glyph-casting, tier semantics, and the standard book lifecycle;
 * implements Tetra's {@link IModularItem} so the book is recognized by
 * the Tetra workbench.
 *
 * <p>Phase 6B: skeleton only. {@code getMajorModuleKeys} reports a
 * 4-slot layout. Stat bonuses still come from the legacy
 * {@code imodspells_slots} NBT system via
 * {@link com.iridescentcraft.modspells.event.AttributeApplier}.
 *
 * <p>Tetra slot layout (5 majors, no minors): {@code core}, {@code front_cover},
 * {@code back_cover}, {@code spine}, {@code dye}. The {@code core} slot
 * carries the tome's identity (novice / apprentice / archmage) via its
 * installed material — see {@code data/tetra/materials/icraft_ars_books/}.
 * Phase 6G collapsed three per-tier item registrations into this single
 * tome; the SpellTier param is fixed at SpellTier.THREE so the item allows
 * any spell level, and the apparent tier is derived from the core material.
 */
public class ModularArsSpellBookItem extends SpellBook implements IModularItem {

    /** Tetra item identifier — RL-path-safe (no ':'). See ModularSpellBookItem. */
    public static final String TETRA_IDENTIFIER = "iridescent_ars_book";

    public static final String TETRA_SLOT_CORE = "ars_book/core";
    public static final String TETRA_SLOT_FRONT_COVER = "ars_book/front_cover";
    public static final String TETRA_SLOT_BACK_COVER = "ars_book/back_cover";
    public static final String TETRA_SLOT_DYE = "ars_book/dye";
    public static final String TETRA_SLOT_SPINE = "ars_book/spine";

    /** Major slots (2) — matches vanilla sword's 2-major + 3-minor split. */
    private static final String[] MAJOR_KEYS = {
            TETRA_SLOT_CORE, TETRA_SLOT_FRONT_COVER
    };
    /** Minor slots (3) — back cover + spine + dye. */
    private static final String[] MINOR_KEYS = {
            TETRA_SLOT_BACK_COVER, TETRA_SLOT_SPINE, TETRA_SLOT_DYE
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

    public static final String SLOTS_NBT_KEY = ModularSpellBookItem.SLOTS_NBT_KEY;
    public static final String SLOT_COVER = ModularSpellBookItem.SLOT_COVER;
    public static final String SLOT_PAGES = ModularSpellBookItem.SLOT_PAGES;

    public static final Map<String, Map<ModularSpellBookItem.AttributeKey, Double>> COVER_BONUSES = new HashMap<>();
    public static final Map<String, Map<ModularSpellBookItem.AttributeKey, Double>> PAGES_BONUSES = new HashMap<>();

    static {
        COVER_BONUSES.put("white_wool",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_MAX_MANA, 0.05));
        COVER_BONUSES.put("manaweave_cloth",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_MAX_MANA, 0.10,
                       ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.05));
        COVER_BONUSES.put("sorcerer_robes",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_MAX_MANA, 0.15,
                       ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.10));
        COVER_BONUSES.put("spell_cloth",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_MAX_MANA, 0.20,
                       ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.15));

        PAGES_BONUSES.put("white_wool",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.02));
        PAGES_BONUSES.put("manaweave_cloth",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.05));
        PAGES_BONUSES.put("sorcerer_robes",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.10,
                       ModularSpellBookItem.AttributeKey.SPELL_POWER, 0.05));
        PAGES_BONUSES.put("spell_cloth",
                Map.of(ModularSpellBookItem.AttributeKey.ARS_SPELL_DAMAGE, 0.15,
                       ModularSpellBookItem.AttributeKey.SPELL_POWER, 0.10));
    }

    public ModularArsSpellBookItem(Properties properties, SpellTier tier) {
        super(properties, tier);
        DataManager.instance.moduleData.onReload(this::clearCaches);
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, TETRA_IDENTIFIER));
    }

    /**
     * Explicitly hook the Ars SpellBookRenderer for this item so that the
     * `parent: "builtin/entity"` model JSON resolves to a 3D book.
     * SpellBook's superclass implementation does the same thing via an
     * inner class, but inherited registrations have shown signal of not
     * binding for Tetra-DeferredRegister-routed subclasses (pink-and-black
     * mesh = missing-model fallback). Doing it ourselves removes any
     * inheritance-chain ambiguity and gives us a one-shot log line on
     * client init we can grep for.
     */
    @Override
    public void initializeClient(Consumer<IClientItemExtensions> consumer) {
        IridescentModularSpells.LOGGER.info(
                "[ModularArsSpellBookItem] initializeClient firing -- registering SpellBookRenderer for {}",
                this);
        consumer.accept(new IClientItemExtensions() {
            private BlockEntityWithoutLevelRenderer renderer;

            @Override
            public BlockEntityWithoutLevelRenderer getCustomRenderer() {
                if (renderer == null) {
                    renderer = new SpellBookRenderer();
                    IridescentModularSpells.LOGGER.info(
                            "[ModularArsSpellBookItem] lazily instantiated SpellBookRenderer");
                }
                return renderer;
            }
        });
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
        return MINOR_KEYS;
    }

    @Override
    public String[] getRequiredModules(ItemStack itemStack) {
        return new String[0];
    }

    // No GUI offset overrides — defaults to defaultMajorOffsets[2] +
    // defaultMinorOffsets[3]. See ModularSpellBookItem for full rationale.

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

    public static double getTotalBonus(ItemStack stack, ModularSpellBookItem.AttributeKey key) {
        if (!(stack.getItem() instanceof ModularArsSpellBookItem)) return 0.0;
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
        // Tetra's standard tooltip (modules, integrity, etc.)
        tooltip.addAll(this.getTooltip(stack, level, flag));
        // Magic stats summary — reuses the iss-side label table for the few shared
        // attribute keys (max_mana, mana_regen) and adds Ars-specific ones below.
        appendArsMagicStatsTooltip(stack, tooltip);
    }

    /**
     * Display name preservation - return the source Ars spell book's name when
     * the core module's variant key encodes the original item path. Replacement
     * JSON stamps `ars_core/<source_item_path>` (e.g. `ars_core/novice_spell_book`,
     * `ars_core/apprentice_spell_book`, `ars_core/archmage_spell_book`). Extract
     * suffix, look up source item by ResourceLocation `ars_nouveau:<suffix>`,
     * return its display name. Falls back to "Modular Tome" if unresolved.
     */
    @Override
    public Component getName(ItemStack stack) {
        try {
            String sourcePath = readArsCoreMaterialSuffix(stack);
            if (sourcePath != null && !sourcePath.isEmpty()) {
                ResourceLocation sourceId = new ResourceLocation("ars_nouveau", sourcePath);
                Item sourceItem = ForgeRegistries.ITEMS.getValue(sourceId);
                if (sourceItem != null && sourceItem != net.minecraft.world.item.Items.AIR) {
                    return Component.translatable(sourceItem.getDescriptionId());
                }
            }
        } catch (Throwable t) { /* fall through */ }
        return super.getName(stack);
    }

    /** Read the variant-key suffix of the ars_book/core slot's installed module. */
    private static String readArsCoreMaterialSuffix(ItemStack stack) {
        if (!(stack.getItem() instanceof IModularItem item)) return null;
        try {
            se.mickelus.tetra.module.ItemModuleMajor[] majors = item.getMajorModules(stack);
            if (majors == null) return null;
            for (se.mickelus.tetra.module.ItemModuleMajor m : majors) {
                if (m == null) continue;
                if (!"ars_book/core".equals(m.getSlot())) continue;
                se.mickelus.tetra.module.data.VariantData v = m.getVariantData(stack);
                if (v == null || v.key == null) continue;
                int slash = v.key.lastIndexOf('/');
                if (slash < 0 || slash == v.key.length() - 1) continue;
                return v.key.substring(slash + 1);
            }
        } catch (Throwable t) { /* fall through */ }
        return null;
    }

    private static final Map<String, String> ARS_STAT_LABELS = new LinkedHashMap<>();
    static {
        ARS_STAT_LABELS.put("ars_nouveau:ars_nouveau.perk.max_mana",     "Max Mana");
        ARS_STAT_LABELS.put("ars_nouveau:ars_nouveau.perk.mana_regen",   "Mana Regen");
        ARS_STAT_LABELS.put("ars_nouveau:ars_nouveau.perk.spell_damage", "Spell Damage");
        ARS_STAT_LABELS.put("irons_spellbooks:max_mana",                 "ISS Max Mana");
        ARS_STAT_LABELS.put("irons_spellbooks:mana_regen",               "ISS Mana Regen");
    }
    private static final java.util.Set<String> ARS_FLAT_STATS = java.util.Set.of(
            "ars_nouveau:ars_nouveau.perk.max_mana",
            "irons_spellbooks:max_mana"
    );

    private void appendArsMagicStatsTooltip(ItemStack stack, List<Component> tooltip) {
        Multimap<Attribute, AttributeModifier> attrs;
        try {
            attrs = getAttributeModifiersCached(stack);
        } catch (Throwable t) {
            return;
        }
        if (attrs == null || attrs.isEmpty()) return;

        Map<String, Double> totals = new LinkedHashMap<>();
        attrs.forEach((attr, mod) -> {
            if (attr == null || mod == null) return;
            ResourceLocation rl = ForgeRegistries.ATTRIBUTES.getKey(attr);
            if (rl == null) return;
            String key = rl.toString();
            if (!ARS_STAT_LABELS.containsKey(key)) return;
            totals.merge(key, mod.getAmount(), Double::sum);
        });
        if (totals.isEmpty()) return;

        tooltip.add(Component.literal("Magic Stats:").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD));
        for (Map.Entry<String, String> entry : ARS_STAT_LABELS.entrySet()) {
            Double v = totals.get(entry.getKey());
            if (v == null || v == 0.0) continue;
            String formatted = ARS_FLAT_STATS.contains(entry.getKey())
                    ? String.format("%+.0f", v)
                    : String.format("%+.1f%%", v * 100.0);
            tooltip.add(Component.literal("  " + formatted + " " + entry.getValue()).withStyle(ChatFormatting.AQUA));
        }
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
}
