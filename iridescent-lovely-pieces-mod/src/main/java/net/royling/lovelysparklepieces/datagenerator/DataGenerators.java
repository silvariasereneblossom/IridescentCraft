package net.royling.lovelysparklepieces.datagenerator;

import net.minecraft.core.HolderLookup;
import net.minecraft.data.DataGenerator;
import net.minecraft.data.PackOutput;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.common.data.ExistingFileHelper;
import net.minecraftforge.data.event.GatherDataEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import java.util.concurrent.CompletableFuture;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID, bus = Mod.EventBusSubscriber.Bus.MOD)

public class DataGenerators {
    @SubscribeEvent
    public static void gatherData(GatherDataEvent event) {
        DataGenerator generator = event.getGenerator();
        PackOutput packOutput = generator.getPackOutput();
        ExistingFileHelper existingFileHelper = event.getExistingFileHelper();
        CompletableFuture<HolderLookup.Provider> lookupProvider = event.getLookupProvider();
        generator.addProvider(event.includeClient(), new ModItemModelProvider(packOutput, existingFileHelper));
        generator.addProvider(event.includeClient(),new BlockStateGene(packOutput,existingFileHelper));
        generator.addProvider(event.includeServer(),new ModRecipeProvider(packOutput));
    }
}
