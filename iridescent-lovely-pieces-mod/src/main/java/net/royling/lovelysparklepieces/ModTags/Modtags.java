package net.royling.lovelysparklepieces.ModTags;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.level.block.Block;
import net.royling.lovelysparklepieces.LovelySparklePieces;

public class Modtags {
    public static class Blocks{
        public static final TagKey<Block> MOD_SWORD = BlockTags.create(new ResourceLocation(LovelySparklePieces.MODID, "mod_sword"));
    }
}
