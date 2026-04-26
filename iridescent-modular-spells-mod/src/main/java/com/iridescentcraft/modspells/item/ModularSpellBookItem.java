package com.iridescentcraft.modspells.item;

import io.redspace.ironsspellbooks.item.SpellBook;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Modular ISS spell book base. Subclasses ISS's {@link SpellBook} so we
 * inherit spell-casting, curio behavior, and the standard book item
 * lifecycle for free.
 *
 * <p>Module slots are stored in a single CompoundTag at NBT key
 * {@code imodspells_slots}. Each slot maps a slot name -> material id:
 * <pre>
 *   imodspells_slots: {
 *     cover: "leather",
 *     pages: "iron"
 *   }
 * </pre>
 *
 * <p>Phase 1 ships only two slot names (cover, pages) and three materials
 * (leather, iron, diamond). Bonuses are computed per-stack from this NBT
 * and applied to the holder's attributes by
 * {@link com.iridescentcraft.modspells.event.AttributeApplier} on a
 * server tick.
 *
 * <p>Phase 2 will pivot to Tetra's data-driven module system, but the
 * NBT key stays so existing books migrate without breaking.
 */
public class ModularSpellBookItem extends SpellBook {

    /** NBT root for slot data. */
    public static final String SLOTS_NBT_KEY = "imodspells_slots";

    /** Slot names valid in Phase 1. */
    public static final String SLOT_COVER = "cover";
    public static final String SLOT_PAGES = "pages";

    /**
     * Material registry for Phase 1. Each material declares its stat
     * contributions per slot. Numbers are expressed as multipliers
     * (e.g. 0.05 = +5% of the underlying attribute). The
     * {@link AttributeKey} enumerates which stat is modified.
     *
     * <p>Phase 2 moves these to JSON data so designers can rebalance
     * without recompiling.
     */
    public static final Map<String, Map<AttributeKey, Double>> COVER_BONUSES = new HashMap<>();
    public static final Map<String, Map<AttributeKey, Double>> PAGES_BONUSES = new HashMap<>();

    static {
        // -- Cover slot bonuses (Phase 2: full ISS material progression) --
        // Cover leans toward "max" stats: max mana, spell power.
        // Tiers:  leather/copper (T1)  ->  iron/gold (T2)  ->  diamond (T3)  ->  netherite (T4)
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

        // -- Pages slot bonuses --
        // Pages lean toward "rate" stats: regen, cooldown reduction.
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
    }

    /** Return the material installed in the named slot, or null if empty. */
    public static String getSlotMaterial(ItemStack stack, String slotName) {
        if (stack.isEmpty() || stack.getTag() == null) return null;
        CompoundTag slots = stack.getTag().getCompound(SLOTS_NBT_KEY);
        if (slots.isEmpty()) return null;
        if (!slots.contains(slotName)) return null;
        String material = slots.getString(slotName);
        return material.isEmpty() ? null : material;
    }

    /** Set (or clear with null) the material installed in the named slot. */
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

    /**
     * Compute the total bonus for a given attribute across all slots on
     * the given stack. Returns a multiplier (e.g. 0.10 = +10%) summed
     * additively across slots (no compounding).
     */
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

    /** Tooltip — show installed modules + bonus summary. */
    @Override
    public void appendHoverText(ItemStack stack, Level level,
                                List<Component> tooltip, TooltipFlag flag) {
        super.appendHoverText(stack, level, tooltip, flag);

        tooltip.add(Component.literal("Modular Slots:")
                .withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD));
        appendSlotLine(tooltip, stack, SLOT_COVER, "Cover");
        appendSlotLine(tooltip, stack, SLOT_PAGES, "Pages");

        // Bonus summary
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

    /**
     * Attribute keys our module system can bonus. Each maps to either
     * a vanilla attribute or an ISS / mod attribute resolved at runtime
     * by AttributeApplier (so we don't hard-fail if ISS is absent).
     */
    public enum AttributeKey {
        SPELL_POWER("Spell Power", "irons_spellbooks:spell_power"),
        MAX_MANA("Max Mana", "irons_spellbooks:max_mana"),
        MANA_REGEN("Mana Regen", "irons_spellbooks:mana_regen"),
        COOLDOWN_REDUCTION("Cooldown Reduction", "irons_spellbooks:cooldown_reduction"),
        // Phase 3: Ars Nouveau-side attributes for cloth-cover modular books
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
