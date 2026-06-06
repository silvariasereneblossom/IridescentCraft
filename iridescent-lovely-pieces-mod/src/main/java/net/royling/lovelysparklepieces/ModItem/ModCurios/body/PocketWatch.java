package net.royling.lovelysparklepieces.ModItem.ModCurios.body;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class PocketWatch extends UniversalCurio {
    public PocketWatch(Properties properties) {
        super(properties.stacksTo(1));
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level2"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.pocket_watch.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.pocket_watch.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.pocket_watch.des3").withStyle(ChatFormatting.GOLD));
    }
}
