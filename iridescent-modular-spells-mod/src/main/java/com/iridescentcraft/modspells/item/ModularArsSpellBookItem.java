package com.iridescentcraft.modspells.item;

import com.hollingsworth.arsnouveau.api.spell.SpellTier;
import com.hollingsworth.arsnouveau.common.items.SpellBook;
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
 * Modular Ars Nouveau spell book. Subclasses Ars's {@link SpellBook} to
 * inherit glyph-casting, tier semantics, and the standard book lifecycle.
 *
 * <p>Cover/pages slot mechanics mirror {@link ModularSpellBookItem} (same
 * NBT key {@code imodspells_slots}) but the materials are CLOTH-themed
 * rather than metal/leather, and the bonuses target Ars-side attributes
 * (max mana, spell damage) rather than ISS attributes.
 *
 * <p>Phase 3 cloth materials:
 * <ul>
 *   <li>{@code white_wool}     -- T1 entry (vanilla)</li>
 *   <li>{@code manaweave_cloth} -- T2 (Botania)</li>
 *   <li>{@code sorcerer_robes}  -- T3 (Ars Nouveau native)</li>
 *   <li>{@code spell_cloth}     -- T4 (Botania endgame)</li>
 * </ul>
 *
 * <p>The shared {@link AttributeApplier} discovers both ISS and Ars
 * modular books at scan time and sums per-key totals so cross-system
 * synergy at the player level still works for shared keys (none in the
 * default config; can be extended).
 */
public class ModularArsSpellBookItem extends SpellBook {

    public static final String SLOTS_NBT_KEY = ModularSpellBookItem.SLOTS_NBT_KEY;
    public static final String SLOT_COVER = ModularSpellBookItem.SLOT_COVER;
    public static final String SLOT_PAGES = ModularSpellBookItem.SLOT_PAGES;

    public static final Map<String, Map<ModularSpellBookItem.AttributeKey, Double>> COVER_BONUSES = new HashMap<>();
    public static final Map<String, Map<ModularSpellBookItem.AttributeKey, Double>> PAGES_BONUSES = new HashMap<>();

    static {
        // Cover (cloth) -- "max" bias: Ars max mana + spell damage scaling
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

        // Pages (cloth) -- "rate" bias: spell damage + ISS spell power for cross-mod synergy
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
    }

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

        tooltip.add(Component.literal("Modular Slots:")
                .withStyle(ChatFormatting.LIGHT_PURPLE, ChatFormatting.BOLD));
        appendSlotLine(tooltip, stack, SLOT_COVER, "Cover");
        appendSlotLine(tooltip, stack, SLOT_PAGES, "Pages");

        Map<ModularSpellBookItem.AttributeKey, Double> totals = new LinkedHashMap<>();
        for (ModularSpellBookItem.AttributeKey k : ModularSpellBookItem.AttributeKey.values()) {
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
}
