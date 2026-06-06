package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class SuperPolymerizationItem extends Item {
    public static int MAX_DAMAGE = 12;
    public SuperPolymerizationItem(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.UNCOMMON).durability(MAX_DAMAGE));
    }

    @Override
    public boolean hasCraftingRemainingItem(ItemStack stack) {
        return true;
    }

    @Override
    public ItemStack getCraftingRemainingItem(ItemStack itemStack) {
        return ModItems.SUPERPOLYMERIZATION.get().getDefaultInstance();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.polymerization.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.polymerization.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.polymerization.des3").withStyle(ChatFormatting.GOLD));
    }
}
