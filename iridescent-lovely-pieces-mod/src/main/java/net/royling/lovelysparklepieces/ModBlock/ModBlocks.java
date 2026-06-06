package net.royling.lovelysparklepieces.ModBlock;

import net.minecraft.core.BlockPos;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import net.royling.lovelysparklepieces.LovelySparklePieces;

public class ModBlocks {
    public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(
            ForgeRegistries.BLOCKS, LovelySparklePieces.MODID
    );
    
    public static final RegistryObject<Block> SOUL_LIGHT = BLOCKS.register(
            "soul_light", () -> new Block(BlockBehaviour.Properties.of()
                    .strength(0.05f, 0.05f).sound(SoundType.SAND)
                    .lightLevel(state -> 15).noCollission().noOcclusion()) {
                private static final VoxelShape SOULIGHT_SHAPE = Shapes.box(
                        0.375, 0.375, 0.375, 0.625, 0.625, 0.625);
                
                @Override
                @SuppressWarnings("deprecation")
                public VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
                    return SOULIGHT_SHAPE;
                }
            }
    );

    public static final RegistryObject<Block> MOLTEN_STONE = BLOCKS.register("molten_stone",
            () -> new MoltenStone(BlockBehaviour.Properties.copy(Blocks.STONE)));

    public static final RegistryObject<Block> MOLTEN_DIRT = BLOCKS.register("molten_dirt",
            () -> new MoltenDirt(BlockBehaviour.Properties.copy(Blocks.GRASS_BLOCK)));

    public static final RegistryObject<Block> SOLID_ICE = BLOCKS.register(
            "solid_ice",
            () -> new HardIce(Block.Properties.copy(Blocks.ICE)
                    .friction(0.6f) // 与普通方块相同的摩擦系数
            )
    );
    
    public static final RegistryObject<Block> FLAT_ICE = BLOCKS.register(
            "flat_ice",
            () -> new FlatIce(Block.Properties.copy(Blocks.ICE)
                    .friction(0.6f) // 与普通方块相同的摩擦系数
            )
    );

    // 方块物品注册
    public static final DeferredRegister<Item> BLOCK_ITEMS = DeferredRegister.create(
            ForgeRegistries.ITEMS, LovelySparklePieces.MODID
    );
    
    public static final RegistryObject<Item> SOUL_LIGHT_ITEM = BLOCK_ITEMS.register(
            "soul_light", () -> new BlockItem(SOUL_LIGHT.get(), new Item.Properties())
    );
    
    public static final RegistryObject<Item> MOLTEN_STONE_ITEM = BLOCK_ITEMS.register(
            "molten_stone", () -> new BlockItem(MOLTEN_STONE.get(), new Item.Properties())
    );
    
    public static final RegistryObject<Item> MOLTEN_DIRT_ITEM = BLOCK_ITEMS.register(
            "molten_dirt", () -> new BlockItem(MOLTEN_DIRT.get(), new Item.Properties())
    );
    
    public static final RegistryObject<Item> SOLID_ICE_ITEM = BLOCK_ITEMS.register(
            "solid_ice", () -> new BlockItem(SOLID_ICE.get(), new Item.Properties())
    );
    
    public static final RegistryObject<Item> FLAT_ICE_ITEM = BLOCK_ITEMS.register(
            "flat_ice", () -> new BlockItem(FLAT_ICE.get(), new Item.Properties())
    );
}