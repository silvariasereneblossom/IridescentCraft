package net.royling.lovelysparklepieces.ModItem.ModCurios.Heads;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;

import java.util.List;
import org.jetbrains.annotations.Nullable;

public class CapitalistHeat extends UniversalCurio {
    private static final int INTERVAL = 80; // 4秒 = 80 tick
    private static final double RADIUS = 8.0; // 作用半径8格
    public CapitalistHeat(Properties properties) {
        super(properties.stacksTo(1));
    }

    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        LivingEntity entity = slotContext.entity();
        Level level = entity.level();
        if (!level.isClientSide && entity.tickCount % INTERVAL == 0) {
            // 获取范围内所有铁傀儡
            double x = entity.getX();
            double y = entity.getY();
            double z = entity.getZ();
            List<IronGolem> golems = level.getEntitiesOfClass(
                    IronGolem.class,
                    new AABB(x - RADIUS, y - RADIUS, z - RADIUS,
                            x + RADIUS, y + RADIUS, z + RADIUS)
            );
            for (IronGolem golem : golems) {
                // 直接扣除生命值
                float newHealth = golem.getHealth() - 25.0f;

                if (newHealth > 0) {
                    golem.setHealth(newHealth); // 不会触发死亡
                } else {
                    golem.setHealth(0); // 直接死亡
                    golem.die(level.damageSources().generic());
                }

                // 强制掉落铁锭（每次必掉）
                level.addFreshEntity(new ItemEntity(
                        level,
                        golem.getX(),
                        golem.getY() + 0.5,
                        golem.getZ(),
                        new ItemStack(Items.IRON_INGOT)
                )
                );
            }
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.capitalist_heat.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.capitalist_heat.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.capitalist_heat.des3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.capitalist_heat.des4").withStyle(ChatFormatting.GOLD));
    }
}
