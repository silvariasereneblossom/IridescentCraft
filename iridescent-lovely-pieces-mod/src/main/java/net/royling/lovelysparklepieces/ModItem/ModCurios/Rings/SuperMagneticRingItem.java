package net.royling.lovelysparklepieces.ModItem.ModCurios.Rings;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.UniversalCurio;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.type.capability.ICurio;
import top.theillusivec4.curios.api.type.capability.ICurioItem;

import org.jetbrains.annotations.Nullable;
import java.util.List;

public class SuperMagneticRingItem extends UniversalCurio {
    private static final double ATTRACTION_SPEED = 0.1D;  // 吸引速度
    public SuperMagneticRingItem(Properties properties) {
        super(properties.stacksTo(1));
    }
    public boolean isEnabled(ItemStack stack) {
        return true;
    }
    @Override
    public void curioTick(SlotContext slotContext, ItemStack stack) {
        double ATTRACTION_RADIUS = LSPConfig.STRONG_MAGNET_RADIUS.get();
        LivingEntity wearer = slotContext.entity();
        Level level = wearer.level();
        if (!level.isClientSide) {
            // 吸引掉落物
            AABB searchBoxItems = wearer.getBoundingBox().inflate(ATTRACTION_RADIUS);
            List<ItemEntity> itemEntities = level.getEntitiesOfClass(ItemEntity.class, searchBoxItems,
                    itemEntity -> itemEntity.isAlive() && !itemEntity.hasPickUpDelay() && itemEntity.distanceToSqr(wearer) > 0.5 // 防止吸附已在玩家身上的物品
            );
            for (ItemEntity itemEntity : itemEntities) {
                Vec3 directionToPlayer = wearer.position().add(0, wearer.getEyeHeight() / 2.0, 0).subtract(itemEntity.position());
                if (directionToPlayer.lengthSqr() < ATTRACTION_RADIUS * ATTRACTION_RADIUS) { // 再次检查距离，因为AABB是方形的
                    Vec3 motion = directionToPlayer.normalize().scale(ATTRACTION_SPEED);
                    itemEntity.setDeltaMovement(itemEntity.getDeltaMovement().add(motion));
                }
            }
            // 吸引经验球
            AABB searchBoxXp = wearer.getBoundingBox().inflate(ATTRACTION_RADIUS);
            List<ExperienceOrb> xpOrbs = level.getEntitiesOfClass(ExperienceOrb.class, searchBoxXp,
                    xpOrb -> xpOrb.isAlive() && xpOrb.distanceToSqr(wearer) > 0.5
            );
            for (ExperienceOrb xpOrb : xpOrbs) {
                Vec3 directionToPlayer = wearer.position().add(0, wearer.getEyeHeight() / 2.0, 0).subtract(xpOrb.position());
                if (directionToPlayer.lengthSqr() < ATTRACTION_RADIUS * ATTRACTION_RADIUS) {
                    Vec3 motion = directionToPlayer.normalize().scale(ATTRACTION_SPEED * 1.5); // 经验球可以快一点
                    xpOrb.setDeltaMovement(xpOrb.getDeltaMovement().add(motion));
                }
            }
        }
    }
    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level3"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magnetic.des").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magnetic.des2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.magnetic.des4").withStyle(ChatFormatting.GOLD));
    }
    @Override
    public boolean canEquip(SlotContext slotContext, ItemStack stack) {
        if(slotContext.entity() instanceof Player player){
            return !ModCurios.hasCurio(player,this)&&!ModCurios.hasCurio(player,ModCurios.MAGMA_AMULET.get());
        }
        return true;
    }
}
