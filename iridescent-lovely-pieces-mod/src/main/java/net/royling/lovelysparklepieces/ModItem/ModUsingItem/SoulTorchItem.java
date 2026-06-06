package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;
import net.minecraft.world.level.block.Block;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModBlock.ModBlocks;
import net.royling.lovelysparklepieces.PlayerData.SoulData;

import java.util.List;

public class SoulTorchItem extends Item {
    private final Block block;
    public SoulTorchItem(Properties properties) {
        super(properties.stacksTo(1));
        block= ModBlocks.SOUL_LIGHT.get();
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        if(context.getLevel().isClientSide)return InteractionResult.SUCCESS;
        Player player = context.getPlayer();
        Level world = context.getLevel();
        BlockPos clickedPos = context.getClickedPos();
        Direction face = context.getClickedFace();
        BlockPos placePos = clickedPos.relative(face);
        if (!world.getBlockState(placePos).isAir()) {
            return InteractionResult.FAIL;
        }
        if(SoulData.getSouls(player)>0){
            SoulData.removeSoul(player,1);
            world.setBlockAndUpdate(placePos, block.defaultBlockState());
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.SUCCESS;
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.soul_torch.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.soul_torch.basic1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.soul_torch.basic2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.soul_torch.basic3").withStyle(ChatFormatting.GOLD));
    }
}
