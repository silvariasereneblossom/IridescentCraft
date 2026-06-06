package net.royling.lovelysparklepieces.ModItem.ModCurios.boot;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class StrawSandalsItem extends Item {
    public StrawSandalsItem(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level1").withStyle(ChatFormatting.GRAY));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.straw_sandals.des").withStyle(ChatFormatting.GOLD));
    }

}
