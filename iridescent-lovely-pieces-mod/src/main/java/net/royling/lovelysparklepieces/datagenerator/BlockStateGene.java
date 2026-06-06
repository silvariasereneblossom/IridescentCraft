package net.royling.lovelysparklepieces.datagenerator;

import net.minecraft.data.PackOutput;
import net.minecraftforge.client.model.generators.BlockStateProvider;
import net.minecraftforge.client.model.generators.ConfiguredModel;
import net.minecraftforge.common.data.ExistingFileHelper;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;

public class BlockStateGene extends BlockStateProvider {
    public BlockStateGene(PackOutput output, ExistingFileHelper existingFileHelper) {
        super(output, LovelySparklePieces.MODID, existingFileHelper);
    }
    @Override
    protected void registerStatesAndModels() {
        getVariantBuilder(ModBlocks.SOUL_LIGHT.get())
                .partialState().setModels(new ConfiguredModel(models().getExistingFile(modLoc("block/soul_light"))));
        simpleBlock(ModBlocks.FLAT_ICE.get(),cubeAll(ModBlocks.FLAT_ICE.get()));
        simpleBlockItem(ModBlocks.FLAT_ICE.get(),models().getExistingFile(mcLoc("lovely_sparkle_pieces:block/flat_ice")));
        simpleBlock(ModBlocks.SOLID_ICE.get(),cubeAll(ModBlocks.SOLID_ICE.get()));
        simpleBlockItem(ModBlocks.SOLID_ICE.get(),models().getExistingFile(mcLoc("lovely_sparkle_pieces:block/solid_ice")));
        simpleBlock(ModBlocks.MOLTEN_DIRT.get(),cubeAll(ModBlocks.MOLTEN_DIRT.get()));
        simpleBlockItem(ModBlocks.MOLTEN_DIRT.get(),models().getExistingFile(mcLoc("lovely_sparkle_pieces:block/molten_dirt")));
        simpleBlock(ModBlocks.MOLTEN_STONE.get(),cubeAll(ModBlocks.MOLTEN_STONE.get()));
        simpleBlockItem(ModBlocks.MOLTEN_STONE.get(),models().getExistingFile(mcLoc("lovely_sparkle_pieces:block/molten_stone")));
    }
}
