package net.royling.lovelysparklepieces.ModItem.ModCurios.necklace;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModEffect.ModMobEffects;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import net.royling.lovelysparklepieces.PlayerData.TemperatureData;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class BlazeCoreItem extends UniversalCurio {
    public BlazeCoreItem(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(!slotContext.entity().level().isClientSide&& slotContext.entity()instanceof Player player){
            if(TemperatureData.gettemperatures(player)>=150){
                player.addEffect(new MobEffectInstance(ModMobEffects.OVERHEAT_EFFECT.get(),2147483647,9,true,true));
            }
            if(player.hasEffect(ModMobEffects.OVERHEAT_EFFECT.get())){
                TemperatureData.removeTemperature(player,1);
            }
            if(TemperatureData.gettemperatures(player)<=0){
                player.removeEffect(ModMobEffects.OVERHEAT_EFFECT.get());
            }
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level5"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des4").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des5").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.blaze_core.des6").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
}
