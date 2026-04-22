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
 * biome source. This tiny mod registers one region of weight 5 that adds
 * icraft:cherry_river_meadow and icraft:cherry_mountains as parameter-point
 * neighbors of vanilla cherry_grove and windswept_hills respectively, using
 * TerraBlender's addBiomeSimilar helper.
 *
 * Biome JSON definitions + is_overworld tag ship inside this jar at
 * data/icraft/worldgen/biome/ and data/minecraft/tags/worldgen/biome/.
 */
@Mod("iridescent_biomes")
public class IridescentBiomes {
    public static final String MODID = "iridescent_biomes";
    public static final String ICRAFT = "icraft";

    public IridescentBiomes() {
        IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
        modBus.addListener(this::commonSetup);
    }

    private void commonSetup(final FMLCommonSetupEvent event) {
        // Region registration must run on the main thread — enqueueWork handles it.
        event.enqueueWork(() -> {
            Regions.register(new IcraftCherryRegion(
                    new ResourceLocation(ICRAFT, "cherry_region"),
                    8
            ));
        });
    }
}
