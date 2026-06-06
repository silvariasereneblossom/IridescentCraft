package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class EcoRingItem extends UniversalCurio {
    public EcoRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public boolean canUnequip(SlotContext slotContext, ItemStack stack) {
        return !(slotContext.entity() instanceof Player player) || player.isCreative();
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level4"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ecoring.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ecoring.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ecoring.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.ecoring.des3").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
