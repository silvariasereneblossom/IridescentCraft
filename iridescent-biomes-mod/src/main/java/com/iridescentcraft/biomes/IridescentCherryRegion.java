package com.iridescentcraft.biomes;

import com.mojang.datafixers.util.Pair;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import terrablender.api.Region;
import terrablender.api.RegionType;

import java.util.function.Consumer;

/**
 * Adds the two iridescent_biomes:cherry_* biomes to the overworld parameter-point
 * pool using explicit Climate.ParameterPoint values via addBiome (not
 * addBiomeSimilar).
 *
 * Why explicit ParameterPoints instead of addBiomeSimilar:
 * An audit of the pack's 444 mods (2026-04-23) showed that every other
 * TerraBlender-based biome mod (BoP, Quark, aeroblender, etc.) uses either
 * addBiome with explicit ParameterPoints, modifyVanillaOverworldPreset, or
 * a custom BiomeBuilder. Our earlier addBiomeSimilar(CHERRY_GROVE, ...)
 * approach piggybacked on vanilla cherry_grove's parameter points and, in
 * this pack's mod combination, reproducibly triggered a FeatureSorter cycle
 * crash inside Blueprint's ModdedBiomeSlicesManager. No other mod used the
 * addBiomeSimilar pattern, which strongly implicated it as the trigger.
 * Explicit ParameterPoints avoid that.
 *
 * Parameter space notes (1.20.1 Climate uses signed quantised ranges):
 *   temperature  : -1.0 (frozen) ... 1.0 (hot)
 *   humidity     : -1.0 (arid)   ... 1.0 (wet)
 *   continentalness: -1.2 (deep ocean) ... 1.0 (far inland)
 *   erosion      : -1.0 (high/mountain) ... 1.0 (flat/eroded)
 *   depth        : 0.0 (surface) ... 1.0 (deep cave)
 *   weirdness    : -1.0 ... 1.0 (valley vs plateau ridge position)
 *
 * cherry_river_valley — temperate-warm, humid lowlands, flat-to-rolling
 *   temp 0.05..0.35, hum 0.25..0.6, cont -0.1..0.3, erosion 0.15..0.55
 *   (widened 2026-04-24 for "more common, flatter than mountain valley")
 * cherry_mountains — cool, modestly humid, inland high terrain (rare):
 *   temp -0.2..0.1, hum 0.1..0.3, cont 0.25..0.55, erosion -1.0..-0.375
 *
 * These don't overlap vanilla cherry_grove's parameter cluster (which sits
 * around temp 0.5, hum 0.7, erosion 0-0.05). The two icraft biomes have
 * disjoint erosion ranges, so they never compete at the same climate point.
 */
public class IridescentCherryRegion extends Region {
    public static final ResourceKey<Biome> CHERRY_RIVER_VALLEY = ResourceKey.create(
            Registries.BIOME,
            new ResourceLocation(IridescentBiomes.MODID, "cherry_river_valley")
    );
    public static final ResourceKey<Biome> CHERRY_MOUNTAINS = ResourceKey.create(
            Registries.BIOME,
            new ResourceLocation(IridescentBiomes.MODID, "cherry_mountains")
    );

    public IridescentCherryRegion(ResourceLocation name, int weight) {
        super(name, RegionType.OVERWORLD, weight);
    }

    @Override
    public void addBiomes(Registry<Biome> registry,
                          Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> mapper) {
        // cherry_river_valley — warm temperate humid lowlands, flat-to-rolling
        // Widened from the initial ship-spec (2026-04-24) to make this the
        // common cherry biome in the world:
        //   temperature:    0.1..0.3  -> 0.05..0.35 (covers temperate-warm)
        //   humidity:       0.3..0.55 -> 0.25..0.6  (moderate-humid swath)
        //   continentalness: -0.1..0.2 -> -0.1..0.3 (coast to mid-inland)
        //   erosion:       0.05..0.45 -> 0.15..0.55 (shifted flatter; now spans
        //                              rolling-to-near-flat instead of pure rolling)
        // Parameter-space coverage ~2.8x vs initial. Erosion range disjoint
        // from cherry_mountains (-1.0..-0.375), so the two don't compete at
        // shared climate points. "Hills nearby, no sharp mountain walls."
        // [2026-06-07 RIVER FIX] The original single point spanned weirdness
        // -0.3..0.3, which SWALLOWS the vanilla river band (~ -0.05..0.05):
        // rivers are placed where weirdness crosses 0, and a region point
        // claiming that band replaces minecraft:river with this biome -- the
        // river valley was paving over its own rivers. Split into two points
        // that leave -0.05..0.05 unclaimed; TerraBlender falls back to
        // vanilla there, so rivers carve through the valley again.
        // Continentalness also nudged coastward (-0.1 -> -0.15) so a share of
        // valleys generate touching coast/beach water (operator: "near
        // water"). Area lost to the river band ~ area gained coastward.
        this.addBiome(mapper, Climate.parameters(
                Climate.Parameter.span(0.05f, 0.35f),  // temperature
                Climate.Parameter.span(0.25f, 0.6f),   // humidity
                Climate.Parameter.span(-0.15f, 0.3f),  // continentalness (coast-midinland)
                Climate.Parameter.span(0.15f, 0.55f),  // erosion (flatter rolling)
                Climate.Parameter.point(0.0f),         // depth (surface)
                Climate.Parameter.span(-0.3f, -0.05f), // weirdness (below river band)
                0.0f                                    // offset
        ), CHERRY_RIVER_VALLEY);
        this.addBiome(mapper, Climate.parameters(
                Climate.Parameter.span(0.05f, 0.35f),  // temperature
                Climate.Parameter.span(0.25f, 0.6f),   // humidity
                Climate.Parameter.span(-0.15f, 0.3f),  // continentalness (coast-midinland)
                Climate.Parameter.span(0.15f, 0.55f),  // erosion (flatter rolling)
                Climate.Parameter.point(0.0f),         // depth (surface)
                Climate.Parameter.span(0.05f, 0.3f),   // weirdness (above river band)
                0.0f                                    // offset
        ), CHERRY_RIVER_VALLEY);

        // cherry_mountains — cool, modestly humid, inland high terrain
        // [2026-06-07 RIVER FIX] same band-split as the valley (fix-the-five):
        // -0.1..0.1 claimed the river band, so mountain valleys had no rivers.
        this.addBiome(mapper, Climate.parameters(
                Climate.Parameter.span(-0.2f, 0.1f),  // temperature
                Climate.Parameter.span(0.1f, 0.3f),   // humidity
                Climate.Parameter.span(0.25f, 0.55f), // continentalness (inland)
                Climate.Parameter.span(-1.0f, -0.375f), // erosion (mountainy)
                Climate.Parameter.point(0.0f),        // depth (surface)
                Climate.Parameter.span(-0.1f, -0.05f), // weirdness (below river band)
                0.0f                                   // offset
        ), CHERRY_MOUNTAINS);
        this.addBiome(mapper, Climate.parameters(
                Climate.Parameter.span(-0.2f, 0.1f),  // temperature
                Climate.Parameter.span(0.1f, 0.3f),   // humidity
                Climate.Parameter.span(0.25f, 0.55f), // continentalness (inland)
                Climate.Parameter.span(-1.0f, -0.375f), // erosion (mountainy)
                Climate.Parameter.point(0.0f),        // depth (surface)
                Climate.Parameter.span(0.05f, 0.1f),  // weirdness (above river band)
                0.0f                                   // offset
        ), CHERRY_MOUNTAINS);
    }
}
