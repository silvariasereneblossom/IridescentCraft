package net.royling.lovelysparklepieces.ModItem.ModCurios.boot;

import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.util.ArrayDeque;
import java.util.List;
import java.util.Queue;
import org.jetbrains.annotations.Nullable;

public class WaterwalkBootItem extends UniversalCurio {
    private static final int RADIUS = 3;
    private final Queue<BlockPos> workQueue = new ArrayDeque<>();

    public WaterwalkBootItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player && !player.level().isClientSide) {
            Level level = player.level();
            BlockPos below = player.blockPosition().below();
            if (workQueue.isEmpty()) {
                for (int x = -RADIUS; x <= RADIUS; x++) {
                    for (int z = -RADIUS; z <= RADIUS; z++) {
                        workQueue.offer(below.offset(x, 0, z));
                    }
                }
            }
            for (int i = 0; i < 10 && !workQueue.isEmpty(); i++) {
                BlockPos pos = workQueue.poll();
                if (level.getBlockState(pos).is(Blocks.WATER)&&level.getBlockState(pos).getValue(LiquidBlock.LEVEL)==0) {
                    level.setBlock(pos, ModBlocks.FLAT_ICE.get().defaultBlockState(), 3);
                    level.scheduleTick(pos, ModBlocks.FLAT_ICE.get(), 100); // 5秒恢复
                }
            }
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level1"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.waterwalk.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.waterwalk.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.waterwalk.des2").withStyle(ChatFormatting.GOLD));
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
    }

    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }

}
