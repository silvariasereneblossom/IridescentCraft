package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.*;
import net.minecraft.world.level.Level;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;

import org.jetbrains.annotations.Nullable;
import java.util.List;

public class Binoculars extends Item {
    public Binoculars(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.RARE));
    }
    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        player.startUsingItem(hand);
        if(level.isClientSide) {
            player.playSound(SoundEvents.SPYGLASS_USE, 1, 1);
        }
        return InteractionResultHolder.consume(player.getItemInHand(hand));
    }
    @Override
    public int getUseDuration(ItemStack stack) {
        return 72000;
    }
    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.SPYGLASS;
    }

    @Override
    public void releaseUsing(ItemStack stack, Level level, LivingEntity livingEntity, int timeCharged) {
        if (level.isClientSide && livingEntity instanceof Player player) {
            player.playSound(SoundEvents.SPYGLASS_STOP_USING,1,1);
        }
        super.releaseUsing(stack, level, livingEntity, timeCharged);
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.binoculars").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.binoculars2").withStyle(ChatFormatting.GOLD));
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
    }
}
