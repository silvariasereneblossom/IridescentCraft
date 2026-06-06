package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.LargeFireball;
import net.minecraft.world.entity.projectile.SmallFireball;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

public class FireballStaffItem extends Item {
    public FireballStaffItem(Properties properties) {
        super(properties.stacksTo(1).durability(250));
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand usedHand) {
        ItemStack stack = player.getItemInHand(usedHand);
        if(!level.isClientSide){
            Vec3 lookVec = player.getLookAngle();
            double x = player.getX() + lookVec.x;
            double y = player.getY() + player.getEyeHeight() - 0.1D + lookVec.y; // 稍微调整y轴，让火球从眼睛高度发出
            double z = player.getZ() + lookVec.z;
           SmallFireball fireball = new SmallFireball(level, player, lookVec.x, lookVec.y, lookVec.z);
            fireball.setPos(x,y,z);
            fireball.setDeltaMovement(lookVec.scale(1.5));
            level.addFreshEntity(fireball);
            level.playSound(null, player.getX(), player.getY(), player.getZ(),
                    SoundEvents.BLAZE_SHOOT, SoundSource.PLAYERS, 1.0F, 1.0F / (level.getRandom().nextFloat() * 0.4F + 1.2F) + 0.5F);

        }
        return InteractionResultHolder.consume(stack);
    }
}
