package com.iridescentcraft.biomes;

import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import terrablender.api.Regions;

/**
 * IridescentCraft custom biome registration.
 *
 * TerraBlender 3.x on 1.20.1 does not read datapack-declared regions — custom
 * biomes need Java-side registration to get parameter points in an overworld
 * biome source. This tiny mod registers one region of weight 8 that adds
 * iridescent_biomes:cherry_river_valley and iridescent_biomes:cherry_mountains
 * via explicit Climate ParameterPoints.
 *
 * Biome JSON definitions + is_overworld + is_mountain tags ship inside this
 * jar at data/iridescent_biomes/worldgen/biome/ and data/minecraft/tags/
 * worldgen/biome/. The biome namespace (iridescent_biomes) intentionally
 * matches this mod's @Mod modId — every working TerraBlender biome mod in
 * this pack follows that convention (BoP: biomesoplenty↔biomesoplenty,
 * Quark: quark↔quark, aeroblender: aeroblender↔aeroblender). Earlier
 * attempts used the icraft namespace (owned by a different mod in the
 * pack) and tripped Blueprint's ModdedBiomeSlicesManager FeatureSorter
 * cycle check on server start.
 */
@Mod("iridescent_biomes")
public class IridescentBiomes {
    public static final String MODID = "iridescent_biomes";

    public IridescentBiomes() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        modBus.addListener(this::commonSetup);
    }

    private void commonSetup(final FMLCommonSetupEvent event) {
        // Region registration must run on the main thread — enqueueWork handles it.
        event.enqueueWork(() -> {
            Regions.register(new IcraftCherryRegion(
                    new ResourceLocation(MODID, "cherry_region"),
                    8
            ));
        });
    }
}
