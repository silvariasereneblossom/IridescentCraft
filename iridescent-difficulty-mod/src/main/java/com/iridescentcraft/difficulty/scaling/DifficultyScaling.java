package com.iridescentcraft.difficulty.scaling;

import com.iridescentcraft.difficulty.config.DifficultyConfig;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;

/**
 * Pure-function multiplier computation. No state of its own; reads the
 * per-dimension {@link DimensionDifficultyData} and config values.
 */
public final class DifficultyScaling {

    private DifficultyScaling() {}

    /** Tier identifier — wiki tier 1..4, mapped from the dimension's resource id. */
    public enum Tier { T1, T2, T3, T4 }

    /**
     * Look up the tier for a dimension by checking each tier's dimension list
     * in config order. Anything not listed defaults to T1 (Overworld-like).
     */
    public static Tier getTier(ResourceLocation dimId) {
        String s = dimId.toString();
        if (DifficultyConfig.COMMON.t4Dimensions.get().contains(s)) return Tier.T4;
        if (DifficultyConfig.COMMON.t3Dimensions.get().contains(s)) return Tier.T3;
        if (DifficultyConfig.COMMON.t2Dimensions.get().contains(s)) return Tier.T2;
        if (DifficultyConfig.COMMON.t1Dimensions.get().contains(s)) return Tier.T1;
        return Tier.T1;
    }

    public static DifficultyConfig.TierCurve getCurve(Tier t) {
        return switch (t) {
            case T1 -> DifficultyConfig.COMMON.t1;
            case T2 -> DifficultyConfig.COMMON.t2;
            case T3 -> DifficultyConfig.COMMON.t3;
            case T4 -> DifficultyConfig.COMMON.t4;
        };
    }

    /**
     * Current scaling multiplier for the given dimension at its current
     * timer state. Returns a raw multiplier (1.5 = 150% = +50% over vanilla).
     *
     * <p>Formula: linear interp from start% at t=0 to cap% at t=capHours.
     * Beyond capHours: clamped to cap, UNLESS the dimension is in the
     * uncap list AND the Ender Dragon has been killed (in any dimension's
     * data — we check the End's). When uncapped, the formula keeps
     * extrapolating past cap with no upper bound.
     */
    public static double getCurrentMultiplier(ServerLevel level) {
        if (!DifficultyConfig.COMMON.enabled.get()) return 1.0;

        DimensionDifficultyData data = DimensionDifficultyData.get(level);
        ResourceLocation dimId = level.dimension().location();
        Tier tier = getTier(dimId);
        DifficultyConfig.TierCurve curve = getCurve(tier);

        double start = curve.start.get() / 100.0;
        double cap = curve.cap.get() / 100.0;
        double capHours = curve.capHours.get();
        double hours = data.getHours();

        boolean dimAllowsUncap =
            DifficultyConfig.COMMON.uncapAfterEnderDragonDimensions.get().contains(dimId.toString());
        boolean uncapped = dimAllowsUncap && data.isEnderDragonKilled();

        double progress = hours / capHours;
        if (!uncapped) progress = Math.min(progress, 1.0);

        double mult = start + (cap - start) * progress;
        // Defensive lower bound: never go below start% even with weird config
        return Math.max(mult, start);
    }

    /**
     * Damage-specific multiplier for the dimension: the base curve multiplier
     * times the tier's {@code damageMultiplierPct} (applied to attack_damage
     * ONLY — health/armor/speed use {@link #getCurrentMultiplier}). At the
     * default 100% this equals the base curve; at 130% mobs hit +30% harder
     * than the curve alone. Multiplicative, so the +30% holds at every point
     * on the time curve.
     */
    public static double getDamageMultiplier(ServerLevel level) {
        double base = getCurrentMultiplier(level);
        if (!DifficultyConfig.COMMON.enabled.get()) return base; // already 1.0
        Tier tier = getTier(level.dimension().location());
        double dmgFactor = getCurve(tier).damageMultiplierPct.get() / 100.0;
        return base * dmgFactor;
    }
}
