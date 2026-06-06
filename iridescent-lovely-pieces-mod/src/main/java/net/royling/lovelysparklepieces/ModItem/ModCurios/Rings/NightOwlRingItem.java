package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import java.util.UUID;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import org.jetbrains.annotations.NotNull;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import java.time.LocalTime;
import java.util.List;
import java.util.Objects;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class NightOwlRingItem extends UniversalCurio {
    public NightOwlRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    LocalTime now = LocalTime.now();
    int minutes = now.getHour()*60 + now.getMinute();
    UUID ATTID = UUID.fromString("e8c4a5f1-9b3d-4e2a-8c7f-1a2b3c4d5e6f"); // Unique UUID for night owl ring
    private static double getDamageModifierValue(int minutesOfDay) {
        // 确保分钟数在有效范围内
        minutesOfDay = minutesOfDay % 1440;
        if (minutesOfDay >= 120 && minutesOfDay <= 480) { // 凌晨2点到早上8点 (120 to 480)
            // 从 0.75 线性减少到 0.0
            double progress = (minutesOfDay - 120) / 360.0; // 360分钟间隔
            return 0.75 + progress * (0.0 - 0.75);
        } else if (minutesOfDay > 480 && minutesOfDay <= 840) { // 早上8点到下午2点 (480 to 840)
            // 从 0.0 线性减少到 -0.75
            double progress = (minutesOfDay - 480) / 360.0; // 360分钟间隔
            return 0.0 + progress * (-0.75 - 0.0);
        } else if (minutesOfDay > 840 && minutesOfDay <= 1200) { // 下午2点到晚上8点 (840 to 1200)
            // 从 -0.75 线性增加到 0.0
            double progress = (minutesOfDay - 840) / 360.0; // 360分钟间隔
            return -0.75 + progress * (0.0 - (-0.75));
        } else { // 晚上8点到凌晨2点 (1200 to 1440, and 0 to 120)
            // 从 0.0 线性增加到 0.75 (跨越午夜)
            // 计算距离晚上8点 (1200) 的分钟数，考虑跨午夜
            int minutesSince8PM;
            if (minutesOfDay >= 1200) {
                minutesSince8PM = minutesOfDay - 1200;
            } else {
                minutesSince8PM = minutesOfDay + (1440 - 1200); // 加上从午夜到8PM的时间
            }
            double progress = minutesSince8PM / 360.0; // 360分钟间隔
            return 0.0 + progress * (0.75 - 0.0);
        }
    }
    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {

        if(slotContext.entity().tickCount%120!=0)return;
        if(slotContext.entity()instanceof Player player){
            LocalTime now = LocalTime.now();
            int currentMinutes = now.getHour() * 60 + now.getMinute();
            double currentModifierValue = getDamageModifierValue(currentMinutes);
            AttributeModifier newModifier = new AttributeModifier(ATTID, "Night Owl Damage Bonus", currentModifierValue, AttributeModifier.Operation.MULTIPLY_TOTAL);
            Objects.requireNonNull(player.getAttribute(Attributes.ATTACK_DAMAGE)).removeModifier(ATTID);
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
        if (attr != null) {
            attr.removeModifier(ATTID);
            attr.addPermanentModifier(newModifier);
        }
        }
    }
    @Override
    public void onEquip(SlotContext slotContext, ItemStack prevStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            if (attr != null) {
                if(attr.getModifier(ATTID)==null) {
                    LocalTime now = LocalTime.now();
                    int minutes = now.getHour() * 60 + now.getMinute();
                    attr.addPermanentModifier(new AttributeModifier(ATTID, "Night Owl Damage Bonus", getDamageModifierValue(minutes), AttributeModifier.Operation.MULTIPLY_TOTAL));
                }
            }
        }
    }
    @Override
    public void onUnequip(SlotContext slotContext, ItemStack newStack, ItemStack stack) {
        if(slotContext.entity()instanceof Player player){
            AttributeInstance attr = player.getAttribute(Attributes.ATTACK_DAMAGE);
            if (attr != null) {
                attr.removeModifier(ATTID);
            }
        }
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level5"));
        LocalTime now = LocalTime.now();
        int currentMinutes = now.getHour() * 60 + now.getMinute();
        String formattedTime = String.format("%02d:%02d", now.getHour(), now.getMinute());
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.basic").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.time",
                formattedTime).withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.bonus",
                        String.format("%.1f%%", getDamageModifierValue(currentMinutes) * 100))
                .withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.basic2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.night_ring.basic3").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }

}
