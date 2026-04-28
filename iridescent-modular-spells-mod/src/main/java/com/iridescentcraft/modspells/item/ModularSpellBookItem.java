package com.iridescentcraft.modspells.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;
import io.redspace.ironsspellbooks.item.SpellBook;
import net.minecraft.ChatFormatting;
import net.minecraft.core.registries.Registries;
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
import se.mickelus.tetra.gui.GuiModuleOffsets;
import se.mickelus.tetra.items.modular.IModularItem;
import se.mickelus.tetra.module.SchematicRegistry;
import se.mickelus.tetra.module.data.EffectData;
import se.mickelus.tetra.module.data.ItemProperties;
import se.mickelus.tetra.module.data.SynergyData;
import se.mickelus.tetra.module.data.ToolData;
import se.mickelus.tetra.module.schematic.RepairSchematic;
import top.theillusivec4.curios.api.SlotContext;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Modular ISS spell book base — extends ISS's {@link SpellBook}, implements
 * Tetra's {@link IModularItem}, and adds a per-book intrinsic stat buff
 * pass on top.
 *
 * <p><b>Stacking model</b> for {@code getAttributeModifiers(curios)}:
 * <ol>
 *   <li>{@code super.getAttributeModifiers(...)} — preserves ISS's vanilla
 *       book-specific modifiers (dragonskin's +10% Ender, gold's +15%
 *       cast time, etc.)</li>
 *   <li>{@link BookKind#intrinsicModifiers()} — our tier-buff overlay,
 *       e.g. dragonskin gets bumped to +25% Ender + +50 max_mana on top
 *       of the ISS baseline.</li>
 *   <li>{@code getAttributeModifiersCached(stack)} — Tetra slot/lining
 *       attrs from installed modules.</li>
 * </ol>
 * Result: vanilla ISS intent + our Phase 6F buff + slot/lining bonuses
 * all stack additively. Mage power curve is uncapped per design (see
 * memory: feedback_mage_power_curve.md).
 *
 * <p>Tetra slot layout (5 majors): {@code core}, {@code front_cover},
 * {@code back_cover}, {@code spine}, {@code pages}. The {@code core} slot
 * carries the spellbook's identity (iron / diamond / archmage / ...) via
 * its installed material — see {@code data/tetra/materials/icraft_iss_books/}.
 * The 4-major layout was changed to 5 in Phase 6G; {@link #getMajorGuiOffsets}
 * is overridden with explicit 5-slot coordinates to avoid the
 * ArrayIndexOutOfBoundsException that Tetra throws when a 5th slot is
 * registered without matching offsets.
 */
public class ModularSpellBookItem extends SpellBook implements IModularItem {

    public static final String TETRA_IDENTIFIER = "iridescent_iss_book";

    public static final String TETRA_SLOT_CORE = "iss_book/core";
    public static final String TETRA_SLOT_FRONT_COVER = "iss_book/front_cover";
    public static final String TETRA_SLOT_BACK_COVER = "iss_book/back_cover";
    public static final String TETRA_SLOT_SPINE = "iss_book/spine";
    public static final String TETRA_SLOT_PAGES = "iss_book/pages";

    /** Major slots — the identity-defining trio. Tetra renders these full-size. */
    private static final String[] MAJOR_KEYS = {
            TETRA_SLOT_CORE, TETRA_SLOT_FRONT_COVER, TETRA_SLOT_BACK_COVER
    };
    /** Minor slots — secondary functional modules. Tetra renders these compact. */
    private static final String[] MINOR_KEYS = {
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
    private final BookKind kind;

    // ===== Legacy Phase 1-5 imodspells_slots NBT system (retired in 6D) =====

    public static final String SLOTS_NBT_KEY = "imodspells_slots";
    public static final String SLOT_COVER = "cover";
    public static final String SLOT_PAGES = "pages";

    public static final Map<String, Map<AttributeKey, Double>> COVER_BONUSES = new HashMap<>();
    public static final Map<String, Map<AttributeKey, Double>> PAGES_BONUSES = new HashMap<>();

    static {
        COVER_BONUSES.put("leather",   Map.of(AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("copper",    Map.of(AttributeKey.MAX_MANA, 0.05, AttributeKey.MANA_REGEN, 0.03));
        COVER_BONUSES.put("iron",      Map.of(AttributeKey.SPELL_POWER, 0.05, AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("gold",      Map.of(AttributeKey.MANA_REGEN, 0.10, AttributeKey.MAX_MANA, 0.05));
        COVER_BONUSES.put("diamond",   Map.of(AttributeKey.SPELL_POWER, 0.15));
        COVER_BONUSES.put("netherite", Map.of(AttributeKey.SPELL_POWER, 0.20, AttributeKey.MAX_MANA, 0.10));

        PAGES_BONUSES.put("leather",   Map.of(AttributeKey.SPELL_POWER, 0.02));
        PAGES_BONUSES.put("copper",    Map.of(AttributeKey.MANA_REGEN, 0.03));
        PAGES_BONUSES.put("iron",      Map.of(AttributeKey.MANA_REGEN, 0.05));
        PAGES_BONUSES.put("gold",      Map.of(AttributeKey.MANA_REGEN, 0.10, AttributeKey.COOLDOWN_REDUCTION, 0.05));
        PAGES_BONUSES.put("diamond",   Map.of(AttributeKey.SPELL_POWER, 0.10, AttributeKey.COOLDOWN_REDUCTION, 0.05));
        PAGES_BONUSES.put("netherite", Map.of(AttributeKey.SPELL_POWER, 0.15, AttributeKey.COOLDOWN_REDUCTION, 0.10));
    }

    public ModularSpellBookItem(BookKind kind, int maxSpellSlots, Properties properties) {
        super(maxSpellSlots, properties);
        this.kind = kind;
        DataManager.instance.moduleData.onReload(this::clearCaches);
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, TETRA_IDENTIFIER));
    }

    public BookKind getBookKind() {
        return kind;
    }

    // ===== IModularItem contract =====

    @Override
    public Item getItem() { return this; }

    @Override
    public void clearCaches() {
        attributeCache.invalidateAll();
        toolCache.invalidateAll();
        effectCache.invalidateAll();
        propertyCache.invalidateAll();
    }

    @Override
    public String[] getMajorModuleKeys(ItemStack itemStack) { return MAJOR_KEYS; }

    @Override
    public String[] getMinorModuleKeys(ItemStack itemStack) { return MINOR_KEYS; }

    @Override
    public String[] getRequiredModules(ItemStack itemStack) { return new String[0]; }

    // GUI offsets — wider X spacing than Tetra's defaults to accommodate our
    // longer labels ("Iron-lined cover" vs vanilla sword's "Iron blade").
    // Reference, from decompiled IModularItem.<clinit>:
    //   defaultMajorOffsets[3] = (4,0), (4,18), (-4,0)
    //   defaultMinorOffsets[2] = (-18,5), (-18,18)
    // We keep the same structure (majors form a triangle, minors stack)
    // but spread the X coords outward so 15–25 char labels don't collide
    // across the central glyph.
    public GuiModuleOffsets getMajorGuiOffsets(ItemStack itemStack) {
        return new GuiModuleOffsets(new int[]{
                  0, -22,   // core   (top center, above glyph)
                 24,   5,   // front_cover (right)
                -24,   5    // back_cover  (left)
        });
    }

    public GuiModuleOffsets getMinorGuiOffsets(ItemStack itemStack) {
        return new GuiModuleOffsets(new int[]{
                -16,  22,   // spine
                 16,  22    // pages
        });
    }

    @Override
    public int getHoneBase(ItemStack itemStack) { return 450; }

    @Override
    public int getHoneIntegrityMultiplier(ItemStack itemStack) { return 200; }

    @Override
    public boolean canGainHoneProgress(ItemStack itemStack) { return false; }

    @Override
    public SynergyData[] getAllSynergyData(ItemStack itemStack) { return synergies; }

    @Override
    public Cache<String, Multimap<Attribute, AttributeModifier>> getAttributeModifierCache() { return attributeCache; }

    @Override
    public Cache<String, EffectData> getEffectDataCache() { return effectCache; }

    @Override
    public Cache<String, ItemProperties> getPropertyCache() { return propertyCache; }

    // ===== Curios attribute pipeline — the stacking entry point =====

    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(SlotContext slotContext, UUID uuid, ItemStack stack) {
        ArrayListMultimap<Attribute, AttributeModifier> result = ArrayListMultimap.create();
        // Layer 1: ISS vanilla intrinsics (max_mana, spell_power, etc. set by parent SpellBook)
        result.putAll(super.getAttributeModifiers(slotContext, uuid, stack));
        // Layer 2: our per-BookKind buff overlay (Phase 6F intrinsic buffs)
        if (kind != null) {
            kind.intrinsicModifiers(uuid).forEach(result::put);
        }
        // Layer 3: Tetra slot + lining attrs (Phase 6C). Skip if isBroken.
        if (!isBroken(stack)) {
            try {
                Multimap<Attribute, AttributeModifier> tetraAttrs = getAttributeModifiersCached(stack);
                if (tetraAttrs != null) result.putAll(tetraAttrs);
            } catch (Throwable t) {
                // Tetra cache miss / data not loaded yet — skip silently
            }
        }
        return result;
    }

    // ===== Legacy NBT slot accessors (used by AttributeApplier through 6C) =====

    public static String getSlotMaterial(ItemStack stack, String slotName) {
        if (stack.isEmpty() || stack.getTag() == null) return null;
        CompoundTag slots = stack.getTag().getCompound(SLOTS_NBT_KEY);
        if (slots.isEmpty() || !slots.contains(slotName)) return null;
        String material = slots.getString(slotName);
        return material.isEmpty() ? null : material;
    }

    public static void setSlotMaterial(ItemStack stack, String slotName, String material) {
        CompoundTag tag = stack.getOrCreateTag();
        CompoundTag slots = tag.getCompound(SLOTS_NBT_KEY);
        if (material == null || material.isEmpty()) slots.remove(slotName);
        else slots.putString(slotName, material);
        tag.put(SLOTS_NBT_KEY, slots);
    }

    public static double getTotalBonus(ItemStack stack, AttributeKey key) {
        if (!(stack.getItem() instanceof ModularSpellBookItem)) return 0.0;
        double total = 0.0;
        String cover = getSlotMaterial(stack, SLOT_COVER);
        if (cover != null && COVER_BONUSES.containsKey(cover)) total += COVER_BONUSES.get(cover).getOrDefault(key, 0.0);
        String pages = getSlotMaterial(stack, SLOT_PAGES);
        if (pages != null && PAGES_BONUSES.containsKey(pages)) total += PAGES_BONUSES.get(pages).getOrDefault(key, 0.0);
        return total;
    }

    @Override
    public void appendHoverText(ItemStack stack, Level level, List<Component> tooltip, TooltipFlag flag) {
        super.appendHoverText(stack, level, tooltip, flag);
        // Tetra's standard tooltip — module list, integrity, etc.
        tooltip.addAll(this.getTooltip(stack, level, flag));
        // Magic stats summary derived from the assembled item's actual attribute modifiers
        appendMagicStatsTooltip(stack, tooltip);
    }

    /** Magic-stat lines we render in the tooltip, in display order. */
    private static final Map<String, String> MAGIC_STAT_LABELS = new LinkedHashMap<>();
    static {
        MAGIC_STAT_LABELS.put("irons_spellbooks:max_mana",              "Max Mana");
        MAGIC_STAT_LABELS.put("irons_spellbooks:mana_regen",            "Mana Regen");
        MAGIC_STAT_LABELS.put("irons_spellbooks:spell_power",           "Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:cooldown_reduction",    "Cooldown Reduction");
        MAGIC_STAT_LABELS.put("irons_spellbooks:cast_time_reduction",   "Cast Time Reduction");
        MAGIC_STAT_LABELS.put("irons_spellbooks:fire_spell_power",      "Fire Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:ice_spell_power",       "Ice Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:lightning_spell_power", "Lightning Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:holy_spell_power",      "Holy Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:ender_spell_power",     "Ender Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:nature_spell_power",    "Nature Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:blood_spell_power",     "Blood Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:eldritch_spell_power",  "Eldritch Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:evocation_spell_power", "Evocation Spell Power");
        MAGIC_STAT_LABELS.put("irons_spellbooks:summon_damage",         "Summon Damage");
    }
    /** Attributes rendered as flat numbers (rather than percentages). */
    private static final java.util.Set<String> FLAT_STATS = java.util.Set.of(
            "irons_spellbooks:max_mana"
    );

    /**
     * Compute the assembled magic stats from Tetra modules + materials and append
     * them as a tooltip section. Reads from {@link IModularItem#getAttributeModifiersCached}
     * so we don't need a valid {@code SlotContext} or UUID.
     */
    private void appendMagicStatsTooltip(ItemStack stack, List<Component> tooltip) {
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
            if (!MAGIC_STAT_LABELS.containsKey(key)) return;
            totals.merge(key, mod.getAmount(), Double::sum);
        });
        if (totals.isEmpty()) return;

        tooltip.add(Component.literal("Magic Stats:").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD));
        for (Map.Entry<String, String> entry : MAGIC_STAT_LABELS.entrySet()) {
            Double v = totals.get(entry.getKey());
            if (v == null || v == 0.0) continue;
            String formatted = FLAT_STATS.contains(entry.getKey())
                    ? String.format("%+.0f", v)
                    : String.format("%+.1f%%", v * 100.0);
            tooltip.add(Component.literal("  " + formatted + " " + entry.getValue()).withStyle(ChatFormatting.AQUA));
        }
    }

    private static void appendSlotLine(List<Component> tooltip, ItemStack stack, String slotKey, String displayName) {
        String material = getSlotMaterial(stack, slotKey);
        MutableComponent line = Component.literal("  " + displayName + ": ");
        if (material == null) line.append(Component.literal("(empty)").withStyle(ChatFormatting.DARK_GRAY));
        else line.append(Component.literal(material).withStyle(ChatFormatting.YELLOW));
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

    /**
     * Per-book intrinsic stat overlay. Stacks ON TOP of ISS vanilla
     * book-specific modifiers (so dragonskin keeps its +10% Ender from
     * ISS AND gets our +25% buff overlay → net +35% Ender at the book
     * level alone, before slot/lining/class bonuses).
     *
     * <p>UUIDs are stable per attribute-name so re-equipping the same
     * book doesn't pile up duplicate modifiers — the Curios attribute
     * pipeline upserts by UUID.
     */
    public enum BookKind {
        // T1 — entry, no intrinsic
        COPPER(),

        // T2 — generic mid-tier baseline
        IRON(
                e("**irons_spellbooks:spell_power", 0.05),
                e("irons_spellbooks:max_mana", 25.0)
        ),
        GOLD(
                e("irons_spellbooks:max_mana", 25.0)
                // ISS already adds +15% cast_time — preserve, don't double
        ),
        DRUIDIC(
                e("**irons_spellbooks:nature_spell_power", 0.20),
                e("irons_spellbooks:max_mana", 25.0)
        ),
        VILLAGER(
                e("**irons_spellbooks:cast_time_reduction", 0.15),
                e("**irons_spellbooks:holy_spell_power", 0.15),
                e("irons_spellbooks:max_mana", 25.0)
        ),
        ROTTEN(
                e("**irons_spellbooks:spell_power", 0.15)
                // ISS already applies -15% spell_resist as the trade-off; preserve
        ),

        // T3 — themed power
        DIAMOND(
                e("**irons_spellbooks:spell_power", 0.10),
                e("irons_spellbooks:max_mana", 50.0),
                e("**irons_spellbooks:cooldown_reduction", 0.05)
        ),
        DRAGONSKIN(
                e("**irons_spellbooks:ender_spell_power", 0.25),
                e("irons_spellbooks:max_mana", 50.0)
        ),
        BLAZE(
                e("**irons_spellbooks:fire_spell_power", 0.25),
                e("irons_spellbooks:max_mana", 50.0)
        ),
        EVOKER(
                e("**irons_spellbooks:evocation_spell_power", 0.25),
                e("**irons_spellbooks:summon_damage", 0.10),
                e("irons_spellbooks:max_mana", 50.0)
        ),

        // T4 — endgame
        NETHERITE(
                e("**irons_spellbooks:spell_power", 0.15),
                e("irons_spellbooks:max_mana", 100.0)
                // ISS already adds +20% cdr — preserve
        ),
        NECRONOMICON(
                e("**irons_spellbooks:blood_spell_power", 0.30),
                e("**irons_spellbooks:eldritch_spell_power", 0.30),
                e("**irons_spellbooks:cooldown_reduction", 0.10),
                e("irons_spellbooks:max_mana", 100.0)
        );

        private final IntrinsicEntry[] entries;
        private static final String MOD_NAME = "iridescent_book_intrinsic";

        BookKind(IntrinsicEntry... entries) {
            this.entries = entries;
        }

        /** Build the (Attribute → Modifier) map for this book kind. UUIDs derived from kind+attribute so they're stable per item. */
        public Map<Attribute, AttributeModifier> intrinsicModifiers(UUID slotUuid) {
            Map<Attribute, AttributeModifier> out = new LinkedHashMap<>();
            for (IntrinsicEntry entry : entries) {
                Attribute attr = ForgeRegistries.ATTRIBUTES.getValue(ResourceLocation.tryParse(entry.attributeId));
                if (attr == null) continue;          // missing attribute (mod absent / typo); skip silently
                UUID stableUuid = UUID.nameUUIDFromBytes((this.name() + "/" + entry.attributeId).getBytes());
                out.put(attr, new AttributeModifier(stableUuid, MOD_NAME, entry.amount, entry.operation));
            }
            return out;
        }
    }

    private static IntrinsicEntry e(String attributeId, double amount) {
        boolean multiplicative = attributeId.startsWith("**");
        String id = multiplicative ? attributeId.substring(2) : attributeId;
        return new IntrinsicEntry(id, amount,
                multiplicative ? AttributeModifier.Operation.MULTIPLY_BASE : AttributeModifier.Operation.ADDITION);
    }

    private record IntrinsicEntry(String attributeId, double amount, AttributeModifier.Operation operation) {}
}
