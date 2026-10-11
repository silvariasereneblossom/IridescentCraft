package com.iridescentcraft.modspells.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;
import com.iridescentcraft.reforging.item.ModuleVariants;
import io.redspace.ironsspellbooks.item.SpellBook;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EquipmentSlot;
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
import top.theillusivec4.curios.api.SlotContext;

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

    /**
     * Major slots — 2 entries to match vanilla sword's <b>2-major + 3-minor</b>
     * distribution. Tetra ships canonical {@code defaultMajorOffsets[2]} +
     * {@code defaultMinorOffsets[3]} pre-tuned for this exact split, which is
     * what the workbench panel renders most compactly.
     */
    private static final String[] MAJOR_KEYS = {
            TETRA_SLOT_CORE, TETRA_SLOT_FRONT_COVER
    };
    /** Minor slots (3) — back cover + spine + pages. */
    private static final String[] MINOR_KEYS = {
            TETRA_SLOT_BACK_COVER, TETRA_SLOT_SPINE, TETRA_SLOT_PAGES
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

    // The Phase 1-5 "imodspells_slots" cover / pages NBT system (anvil-installed
    // leather / iron / diamond covers granting flat % bonuses through
    // AttributeApplier) was retired in 6D when the Tetra modules below took
    // over, and its code -- bonus tables, slot accessors, the anvil installer --
    // was removed 2026-10. A stack that still carries the old "imodspells_slots"
    // tag is harmless: nothing reads it any more, so it grants nothing.

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

    // No GUI offset overrides — IModularItem.getMajorGuiOffsets falls through
    // to defaultMajorOffsets[majorCount] and same for minor. With our 2-major +
    // 3-minor split (cont. 26), Tetra serves up the canonical sword layout —
    // exactly what gives vanilla the compact module box arrangement.
    //
    // For reference (decompiled from IModularItem.<clinit>):
    //   defaultMajorOffsets[2] = (4,0), (4,18)              — right-side vertical pair
    //   defaultMinorOffsets[3] = (-12,-1), (-21,12), (-12,25) — left-side stack

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

    /**
     * IModularItem.damageItemImpl with a guard around the
     * ModularItemDamageEvent post() -- the body is shared with the armor,
     * the wand and the Ars book in ModularDamageBus.damageItem. See
     * ItemModularArmor.damageItem for the rationale: ASMEventHandler is in
     * the MC-BOOTSTRAP layer so iridescent_durability_clamp's
     * EventBusInvokeMixin can never apply, and Aetheric Tetranomicon's
     * listener crashes on our subclass. The guard preserves BloodboundEffect
     * + the maxDamage-1 clamp at the cost of any later listener's
     * contribution on impacted stacks.
     */
    @Override
    public <T extends net.minecraft.world.entity.LivingEntity> int damageItem(
            ItemStack stack, int amount, T entity, java.util.function.Consumer<T> onBroken) {
        return com.iridescentcraft.reforging.event.ModularDamageBus.damageItem(
                stack, amount, entity, "spellbook_iss", "iridescent_modular_spells");
    }

    // ===== Held/offhand attribute pipeline (vanilla slot path) =====

    /**
     * Apply Tetra's material/module/improvement attrs when the book is held
     * in mainhand or offhand. Mirrors the Ars-side override so behavior is
     * symmetric across ecosystems. The Curios entry point below already
     * covers the spellbook Curios slot; this fills the held-in-hand gap.
     */
    @Override
    public Multimap<Attribute, AttributeModifier> getAttributeModifiers(EquipmentSlot slot, ItemStack stack) {
        ArrayListMultimap<Attribute, AttributeModifier> result = ArrayListMultimap.create();
        result.putAll(super.getAttributeModifiers(slot, stack));
        if (slot == EquipmentSlot.MAINHAND || slot == EquipmentSlot.OFFHAND) {
            try {
                Multimap<Attribute, AttributeModifier> tetra = getAttributeModifiersCached(stack);
                if (tetra != null && !tetra.isEmpty()) result.putAll(tetra);
            } catch (Throwable t) { /* Tetra cache miss / data not loaded -- skip */ }
        }
        return result;
    }

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

    @Override
    public void appendHoverText(ItemStack stack, Level level, List<Component> tooltip, TooltipFlag flag) {
        super.appendHoverText(stack, level, tooltip, flag);
        // Tetra's standard tooltip — module list, integrity, etc.
        tooltip.addAll(this.getTooltip(stack, level, flag));
        // Magic stats summary derived from the assembled item's actual attribute modifiers
        appendMagicStatsTooltip(stack, tooltip);
    }

    // [2026-06-08] Hide the vanilla "When in Main Hand: +0.05 ..." attribute
    // modifier section. This book exposes its Tetra modifiers via
    // getAttributeModifiers (for APPLICATION), but it extends ISS SpellBook
    // (not Tetra's ModularItem base), so it never inherits Tetra's
    // vanilla-modifier hiding -> vanilla rendered those modifiers as RAW
    // decimals, duplicating (and contradicting) our percent-formatted "Magic
    // Stats" section. HideFlags bit 2 (MODIFIERS) suppresses only that section;
    // application is unaffected (it reads getAttributeModifiers regardless).
    // Idempotent: writes NBT once, then the bit-check short-circuits.
    @Override
    public void inventoryTick(ItemStack stack, Level level, net.minecraft.world.entity.Entity entity,
                              int slotId, boolean isSelected) {
        super.inventoryTick(stack, level, entity, slotId, isSelected);
        if (level != null && !level.isClientSide) {
            var tag = stack.getOrCreateTag();
            int flags = tag.getInt("HideFlags");
            if ((flags & 2) == 0) tag.putInt("HideFlags", flags | 2);
        }
    }

    /**
     * Display name preservation - return the source ISS spell book's name when
     * the core module's variant key encodes the original item path. Mirrors
     * the armor identity pattern: the replacement JSON stamps the core
     * variant key as `iss_core/<source_item_path>` (e.g. `iss_core/diamond_spell_book`,
     * `iss_core/necronomicon_spell_book`). We extract the suffix and look up
     * the source item by ResourceLocation `irons_spellbooks:<suffix>` to get
     * its display name. Falls back to "Modular Spell Book" if no source can
     * be resolved.
     *
     * Defensive try/catch: any reflection or registry-lookup failure must
     * fall through to vanilla behavior. Never crash item rendering.
     */
    @Override
    public Component getName(ItemStack stack) {
        try {
            String sourcePath = readCoreMaterialSuffix(stack);
            if (sourcePath != null && !sourcePath.isEmpty()) {
                ResourceLocation sourceId = new ResourceLocation("irons_spellbooks", sourcePath);
                Item sourceItem = ForgeRegistries.ITEMS.getValue(sourceId);
                if (sourceItem != null && sourceItem != net.minecraft.world.item.Items.AIR) {
                    return Component.translatable(sourceItem.getDescriptionId());
                }
            }
        } catch (Throwable t) { /* fall through */ }
        return super.getName(stack);
    }

    /** Read the variant-key suffix of the iss_book/core slot's installed module. */
    private static String readCoreMaterialSuffix(ItemStack stack) {
        return ModuleVariants.majorVariantSuffix(stack, TETRA_SLOT_CORE);
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
