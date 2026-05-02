package com.iridescentcraft.reforging.item;

import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;

/**
 * Player-wide aggregation of {@link ItemModularArmor.ArmorWeight} tiers
 * across the four armor slots. Designed for KubeJS / progression scripts
 * that gate behavior on the player's overall armor build:
 *
 * <ul>
 *   <li><b>Battlemage choice:</b> all-light maximizes spell power;
 *       all-heavy maximizes durability; the mix is the trade-off.</li>
 *   <li><b>Rogue penalty:</b> heaviness score &gt; 4 disables stealth
 *       bonuses.</li>
 *   <li><b>Spell-power gating:</b> spell power scales with the light
 *       count (4 light pieces = full bonus, 0 = no bonus).</li>
 * </ul>
 *
 * <h3>KubeJS usage</h3>
 * <pre>
 * let agg = Java.loadClass('com.iridescentcraft.reforging.item.ArmorWeightAggregator');
 * let counts = agg.countEquipped(player);
 * if (counts.light === 4) {
 *     // full robe build — apply max spell power bonus
 * }
 * </pre>
 *
 * <p>Pieces that aren't {@link ItemModularArmor} (vanilla armor, modded
 * armor we haven't reforged) are counted as <i>unknown</i> — neither
 * light nor medium nor heavy. Battle decisions should usually treat
 * unknown as a 4th category, NOT as a default tier.
 */
public final class ArmorWeightAggregator {

    private ArmorWeightAggregator() {}

    /**
     * Per-tier counts across the four armor slots of an entity. Sums
     * always satisfy {@code light + medium + heavy + unknown == 4} for
     * a player (4 armor slots), unless a slot is empty in which case
     * it counts as unknown.
     */
    public static final class WeightCount {
        public int light;
        public int medium;
        public int heavy;
        public int unknown;

        /** Pieces that ARE reforged armor (excludes empty/non-reforged slots). */
        public int reforgedTotal() { return light + medium + heavy; }

        /** All slots including empty ones. Always 4 for a player. */
        public int total() { return light + medium + heavy + unknown; }

        @Override
        public String toString() {
            return "WeightCount{light=" + light + ", medium=" + medium
                    + ", heavy=" + heavy + ", unknown=" + unknown + "}";
        }
    }

    /**
     * Walk the entity's four armor slots, classify each piece, return
     * the per-tier count. Empty slots and non-reforged armor are
     * counted as unknown.
     */
    public static WeightCount countEquipped(LivingEntity entity) {
        WeightCount c = new WeightCount();
        if (entity == null) return c;
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            if (slot.getType() != EquipmentSlot.Type.ARMOR) continue;
            ItemStack stack = entity.getItemBySlot(slot);
            if (stack.isEmpty() || !(stack.getItem() instanceof ItemModularArmor armor)) {
                c.unknown++;
                continue;
            }
            ItemModularArmor.ArmorWeight w = armor.getArmorWeight(stack);
            if (w == null) {
                c.unknown++;
                continue;
            }
            switch (w) {
                case LIGHT  -> c.light++;
                case MEDIUM -> c.medium++;
                case HEAVY  -> c.heavy++;
            }
        }
        return c;
    }

    /**
     * The dominant weight class — whichever tier has the most equipped
     * pieces. Ties broken in favor of heavier (HEAVY &gt; MEDIUM &gt;
     * LIGHT). Returns null if no reforged pieces are equipped.
     */
    public static ItemModularArmor.ArmorWeight dominant(WeightCount c) {
        if (c.reforgedTotal() == 0) return null;
        if (c.heavy >= c.medium && c.heavy >= c.light)  return ItemModularArmor.ArmorWeight.HEAVY;
        if (c.medium >= c.light)                         return ItemModularArmor.ArmorWeight.MEDIUM;
        return ItemModularArmor.ArmorWeight.LIGHT;
    }

    /**
     * Numeric heaviness score: Light=1, Medium=2, Heavy=3, summed
     * across the player's reforged pieces. Range 0 (no reforged armor)
     * to 12 (all 4 slots heavy). Useful as a continuous metric for
     * stat scaling — e.g., spell power = base * (1.0 - score/12).
     */
    public static int heavinessScore(WeightCount c) {
        return c.light * 1 + c.medium * 2 + c.heavy * 3;
    }

    /** Convenience: counts.heavy from a one-shot call. */
    public static int heavyCount(LivingEntity entity)  { return countEquipped(entity).heavy; }
    public static int mediumCount(LivingEntity entity) { return countEquipped(entity).medium; }
    public static int lightCount(LivingEntity entity)  { return countEquipped(entity).light; }
}
