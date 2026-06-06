package net.royling.lovelysparklepieces.ModItem.ModCurios.Heads;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.animal.WaterAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public class JellyfishHelmet extends UniversalCurio {
    private static final Map<Player, Integer> LAST_OXYGEN_LEVELS = new WeakHashMap<>();
    public JellyfishHelmet(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            int currentOxygen = player.getAirSupply();
            int lastOxygen = LAST_OXYGEN_LEVELS.getOrDefault(player, currentOxygen);
            if (currentOxygen < lastOxygen) {
                if (player.level().random.nextFloat() < 0.75f) { // 75%概率阻止减少
                    player.setAirSupply(lastOxygen); // 恢复到前一次的值
                }
            }
            LAST_OXYGEN_LEVELS.put(player, player.getAirSupply());
        }
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this);
        }
        return true;
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.jellyfish.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.jellyfish.des1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.jellyfish.des2").withStyle(ChatFormatting.GOLD));
    }

}
