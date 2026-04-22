package com.iridescentcraft.biomes;

import com.mojang.datafixers.util.Pair;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.Climate;
import terrablender.api.Region;
import terrablender.api.RegionType;

import java.util.function.Consumer;

/**
 * Adds the two icraft:cherry_* biomes to the overworld parameter-point pool by
 * piggybacking the parameter points of vanilla biomes we consider thematically
 * close to each:
 *   icraft:cherry_river_meadow  -> vanilla minecraft:cherry_grove points
 *   icraft:cherry_mountains     -> vanilla minecraft:windswept_hills points
 *
 * addBiomeSimilar copies the full set of parameter points of the reference
 * biome and assigns them to our biome instead, so wherever the vanilla source
 * would have placed cherry_grove or windswept_hills, there's now some chance
 * our biome appears instead (weighted against other registered regions).
 */
public class IcraftCherryRegion extends Region {
    public static final ResourceKey<Biome> CHERRY_RIVER_MEADOW = ResourceKey.create(
            Registries.BIOME,
            new ResourceLocation(IridescentBiomes.ICRAFT, "cherry_river_meadow")
    );
    public static final ResourceKey<Biome> CHERRY_MOUNTAINS = ResourceKey.create(
            Registries.BIOME,
            new ResourceLocation(IridescentBiomes.ICRAFT, "cherry_mountains")
    );

    public IcraftCherryRegion(ResourceLocation name, int weight) {
        super(name, RegionType.OVERWORLD, weight);
    }

    @Override
    public void addBiomes(Registry<Biome> registry,
                          Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> mapper) {
        this.addBiomeSimilar(mapper, Biomes.CHERRY_GROVE,     CHERRY_RIVER_MEADOW);
        this.addBiomeSimilar(mapper, Biomes.WINDSWEPT_HILLS,  CHERRY_MOUNTAINS);
    }
}
