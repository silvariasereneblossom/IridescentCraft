package net.royling.lovelysparklepieces.ModItem.ModCurios.Heads;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class YellowHeadscarf extends UniversalCurio {
    public YellowHeadscarf(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level3"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.yellow_headscarf.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.yellow_headscarf.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.yellow_headscarf.des2").withStyle(ChatFormatting.GOLD).withStyle(ChatFormatting.STRIKETHROUGH));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.yellow_headscarf.des3").withStyle(ChatFormatting.GOLD));
    }
}
