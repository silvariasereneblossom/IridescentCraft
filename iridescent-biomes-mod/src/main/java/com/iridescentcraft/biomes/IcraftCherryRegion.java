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
 * Adds the two icraft:cherry_* biomes to the overworld parameter-point pool
 * using addBiomeSimilar. Reference biomes picked by comparing climate +
 * foliage/grass colors across candidates (2026-04-22 jar audit of BoP
 * 19.0.0.96):
 *
 *   icraft:cherry_river_meadow (temp=0.7, downfall=0.8)
 *     -> biomesoplenty:jacaranda_glade (temp=0.7, downfall=0.8)   exact match
 *     -> minecraft:cherry_grove                                   vanilla fallback
 *
 *   icraft:cherry_mountains (temp=0.5, downfall=0.6)
 *     -> biomesoplenty:highland (temp=0.6, downfall=0.6)          near-match
 *     -> minecraft:cherry_grove                                   shared cherry theme
 *
 * Calling addBiomeSimilar twice per biome gives our biomes parameter points
 * from both references, doubling their spawn opportunity. BoP is a required
 * dep of this mod, so jacaranda_glade and highland are always registered.
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

    private static final ResourceKey<Biome> BOP_JACARANDA_GLADE = ResourceKey.create(
            Registries.BIOME, new ResourceLocation("biomesoplenty", "jacaranda_glade"));
    private static final ResourceKey<Biome> BOP_HIGHLAND = ResourceKey.create(
            Registries.BIOME, new ResourceLocation("biomesoplenty", "highland"));

    public IcraftCherryRegion(ResourceLocation name, int weight) {
        super(name, RegionType.OVERWORLD, weight);
    }

    @Override
    public void addBiomes(Registry<Biome> registry,
                          Consumer<Pair<Climate.ParameterPoint, ResourceKey<Biome>>> mapper) {
        this.addBiomeSimilar(mapper, BOP_JACARANDA_GLADE,  CHERRY_RIVER_MEADOW);
        this.addBiomeSimilar(mapper, Biomes.CHERRY_GROVE,  CHERRY_RIVER_MEADOW);
        this.addBiomeSimilar(mapper, BOP_HIGHLAND,         CHERRY_MOUNTAINS);
        this.addBiomeSimilar(mapper, Biomes.CHERRY_GROVE,  CHERRY_MOUNTAINS);
    }
}
