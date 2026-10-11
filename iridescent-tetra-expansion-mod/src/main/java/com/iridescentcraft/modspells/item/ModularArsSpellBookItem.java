package com.iridescentcraft.modspells.item;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;
import com.hollingsworth.arsnouveau.api.spell.SpellTier;
import com.hollingsworth.arsnouveau.common.items.SpellBook;
import com.iridescentcraft.modspells.IridescentModularSpells;
import com.iridescentcraft.modspells.client.IcraftArsSpellBookRenderer;
import com.iridescentcraft.reforging.item.ModuleVariants;
import net.minecraft.client.renderer.BlockEntityWithoutLevelRenderer;
import net.minecraftforge.client.extensions.common.IClientItemExtensions;
import java.util.function.Consumer;
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
 * <p>Stats come from the installed Tetra modules (material / lining /
 * improvement attributes, surfaced through {@code getAttributeModifiers}
 * while the book is held) plus the enchant-driven bonuses summed by
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

    // The Phase 1-5 "imodspells_slots" cover / pages NBT system was retired in
    // 6D and its code removed 2026-10 -- see the note in ModularSpellBookItem.
    // A stack still carrying that tag is harmless; nothing reads it.

    public ModularArsSpellBookItem(Properties properties, SpellTier tier) {
        super(properties, tier);
        DataManager.instance.moduleData.onReload(this::clearCaches);
        SchematicRegistry.instance.registerSchematic(new RepairSchematic(this, TETRA_IDENTIFIER));
    }

    /**
     * IModularItem.damageItemImpl with a guard around the
     * ModularItemDamageEvent post() -- the body is shared with the armor,
     * the wand and the ISS book in ModularDamageBus.damageItem. See
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
                stack, amount, entity, "spellbook_ars", "iridescent_modular_spells");
    }

    /**
     * Apply Tetra's material/module/improvement attributes when the book is
     * held in mainhand or offhand (the "shield slot"). Without this, vanilla
     * never queries the modular pipeline for spell book stacks (the parent
     * SpellBook isn't a Tetra item; only our modular subclass is) and the
     * material/lining/hone attributes silently never reach the player.
     *
     * <p>Curios slots are handled separately via the Curios-specific
     * {@code getAttributeModifiers(SlotContext, UUID, ItemStack)} signature
     * (mirrors what {@link ModularSpellBookItem} does for ISS books). Ars
     * books don't typically inhabit Curios slots, but we cover both paths
     * for parity.
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
        IridescentModularSpells.LOGGER.debug(
                "[ModularArsSpellBookItem] initializeClient firing -- registering SpellBookRenderer for {}",
                this);
        consumer.accept(new IClientItemExtensions() {
            private BlockEntityWithoutLevelRenderer renderer;

            @Override
            public BlockEntityWithoutLevelRenderer getCustomRenderer() {
                if (renderer == null) {
                    renderer = new IcraftArsSpellBookRenderer();
                    IridescentModularSpells.LOGGER.debug(
                            "[ModularArsSpellBookItem] lazily instantiated IcraftArsSpellBookRenderer (per-stack tier)");
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

    @Override
    public void appendHoverText(ItemStack stack, Level level,
                                List<Component> tooltip, TooltipFlag flag) {
        // Mirror the renderer trick: SpellBook.appendHoverText reads
        // this.tier directly to print "Can cast tier N glyphs or lower",
        // and our Item is hardcoded to THREE so it accepts any spell
        // level. Resolve per-stack tier and swap for the duration of
        // super.appendHoverText so the tooltip matches the source book.
        // Tooltip-build runs on the render thread; single-threaded.
        SpellTier original = this.tier;
        SpellTier resolved = resolveTierFromStack(stack);
        if (resolved != null && resolved != original) this.tier = resolved;
        try {
            super.appendHoverText(stack, level, tooltip, flag);
        } finally {
            this.tier = original;
        }
        // Tetra's standard tooltip (modules, integrity, etc.)
        tooltip.addAll(this.getTooltip(stack, level, flag));
        // Magic stats summary — reuses the iss-side label table for the few shared
        // attribute keys (max_mana, mana_regen) and adds Ars-specific ones below.
        appendArsMagicStatsTooltip(stack, tooltip);
    }

    // [2026-06-08] Hide the redundant vanilla raw-decimal attribute modifier
    // section (see ModularSpellBookItem.inventoryTick for the rationale): our
    // percent-formatted Ars magic-stats section already shows every stat.
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

    /** Per-stack SpellTier resolved from the ars_book/core variant key
     *  suffix. Shared between {@code appendHoverText} (tooltip) and the
     *  client-side {@code IcraftArsSpellBookRenderer} (3D bone toggle).
     *  Returns null if the suffix doesn't map (treat as no override). */
    public static SpellTier resolveTierFromStack(ItemStack stack) {
        String suffix = readArsCoreMaterialSuffix(stack);
        if (suffix == null) return null;
        switch (suffix) {
            case "novice_spell_book":     return SpellTier.ONE;
            case "apprentice_spell_book": return SpellTier.TWO;
            case "archmage_spell_book":   return SpellTier.THREE;
            default: return null;
        }
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
        return ModuleVariants.majorVariantSuffix(stack, TETRA_SLOT_CORE);
    }

    // 2026-05-15: unified mana pool migration collapsed Ars perk attrs into
    // their ISS equivalents. The original 5-entry table had ars_max_mana +
    // ars_mana_regen + ars_spell_damage + iss_max_mana + iss_mana_regen --
    // post-migration the first three collide with the last two on key, so
    // the table is the de-duplicated 3-entry ISS-canonical form.
    private static final Map<String, String> ARS_STAT_LABELS = new LinkedHashMap<>();
    static {
        ARS_STAT_LABELS.put("irons_spellbooks:max_mana",    "Max Mana");
        ARS_STAT_LABELS.put("irons_spellbooks:mana_regen",  "Mana Regen");
        ARS_STAT_LABELS.put("irons_spellbooks:spell_power", "Spell Power");
    }
    private static final java.util.Set<String> ARS_FLAT_STATS = java.util.Set.of(
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
}
