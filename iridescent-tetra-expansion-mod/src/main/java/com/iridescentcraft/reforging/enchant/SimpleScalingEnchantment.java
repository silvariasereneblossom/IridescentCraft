package com.iridescentcraft.reforging.enchant;

import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentCategory;

/**
 * Data-only enchantment shell. All effect logic lives in KubeJS handlers
 * that read the enchant level from stack NBT and apply the appropriate
 * modifier / proc. This class exists to make the enchant addressable
 * (registered in ForgeRegistries.ENCHANTMENTS) so EnchantmentHelper
 * lookups + enchanting-table availability + book obtainability work.
 *
 * <p>Configurable: max level + min/max enchant cost (the level needed
 * to roll the enchant in the enchanting table). Defaults are reasonable
 * for an UNCOMMON-rarity enchant; per-enchant overrides via the
 * fluent {@code maxLevel} / {@code cost} setters.
 */
public class SimpleScalingEnchantment extends Enchantment {

    private int maxLevel = 3;
    private int minCost = 10;
    private int costPerLevel = 8;

    public SimpleScalingEnchantment(Rarity rarity, EnchantmentCategory category,
                                     EquipmentSlot... slots) {
        super(rarity, category, slots);
    }

    public SimpleScalingEnchantment maxLevel(int level) {
        this.maxLevel = level;
        return this;
    }

    /**
     * Set the enchanting-table cost scaling.
     * @param min  cost at level 1 (book-level on the enchant table slider)
     * @param perLevel  cost increase per level
     */
    public SimpleScalingEnchantment cost(int min, int perLevel) {
        this.minCost = min;
        this.costPerLevel = perLevel;
        return this;
    }

    @Override
    public int getMaxLevel() {
        return maxLevel;
    }

    @Override
    public int getMinCost(int level) {
        return minCost + (level - 1) * costPerLevel;
    }

    @Override
    public int getMaxCost(int level) {
        return getMinCost(level) + 30;
    }
}
