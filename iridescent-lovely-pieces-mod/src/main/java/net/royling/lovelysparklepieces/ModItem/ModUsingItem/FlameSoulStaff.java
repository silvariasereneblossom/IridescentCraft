package net.royling.lovelysparklepieces.ModItem.ModUsingItem;

import net.minecraft.ChatFormatting;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.*;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.royling.lovelysparklepieces.ClientEvent.ColorUtil;
import net.royling.lovelysparklepieces.PlayerData.SoulData;

import org.jetbrains.annotations.Nullable;
import java.util.List;

public class FlameSoulStaff extends Item {
    private static final int RANGE = 8;
    private static final float DAMAGE = 5.0f;
    private static final int FIRE_DURATION = 80;

    public FlameSoulStaff(Properties properties) {
        super(properties.stacksTo(1).rarity(Rarity.EPIC));
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        player.startUsingItem(hand);
        return InteractionResultHolder.consume(player.getItemInHand(hand));
    }

    @Override
    public int getUseDuration(ItemStack stack) {
        return 72000;
    }

    @Override
    public UseAnim getUseAnimation(ItemStack stack) {
        return UseAnim.BOW;
    }

    @Override
    public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int remainingUseDuration) {
        if (!(entity instanceof Player player)) return;
        int elapsed = getUseDuration(stack) - remainingUseDuration;
        if (level.isClientSide) {
            if(SoulData.getSouls(player)<=0)return;
            if (elapsed % 2 == 0) {
                Vec3 look = player.getLookAngle();
                Vec3 origin = player.getEyePosition().add(0, -0.2, 0);
                for (int i = 1; i <= RANGE; i++) {
                    Vec3 pos = origin.add(look.scale(i));
                    level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, pos.x, pos.y, pos.z,
                            (level.random.nextDouble() - 0.5) * 0.1, 0.15,
                            (level.random.nextDouble() - 0.5) * 0.1);
                }
            }
        } else {
            if (elapsed % 4 == 0) {
                if (!player.isCreative()) {
                    int soul = SoulData.getSouls(player);
                    if (soul <= 0) {
                        player.stopUsingItem();
                        return;
                    }
                }
                shootFireColumn(player, level);
            }
            if(elapsed%10==0){
                if(player.isCreative())return;
                SoulData.removeSoul(player, 1);
            }
        }
    }

    private void shootFireColumn(Player player, Level level) {
        Vec3 look = player.getLookAngle();
        Vec3 origin = player.getEyePosition().add(0, -0.2, 0);

        for (int i = 1; i <= RANGE; i++) {
            Vec3 pos = origin.add(look.scale(i));
            AABB box = new AABB(pos.x - 0.5, pos.y - 0.5, pos.z - 0.5,
                    pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
            List<LivingEntity> targets = level.getEntitiesOfClass(LivingEntity.class, box,
                    e -> e != player && e.isAlive());
            for (LivingEntity target : targets) {
                DamageSource magicWithPlayer = player.damageSources().indirectMagic(player, null);
                target.setRemainingFireTicks(FIRE_DURATION);
                target.hurt(magicWithPlayer, DAMAGE);
                //target.setDeltaMovement(target.getDeltaMovement().add(look.normalize().scale(0.3)));
            }
        }
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltipComponents, TooltipFlag tooltipFlag) {
        super.appendHoverText(stack, level, tooltipComponents, tooltipFlag);
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.level9"));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.flame_soul_staff.desc1").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.flame_soul_staff.desc2").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.flame_soul_staff.desc3").withStyle(ChatFormatting.GOLD));
        tooltipComponents.add(Component.translatable("tooltip.lovely_sparkle_pieces.flame_soul_staff.desc4").withStyle(ChatFormatting.GOLD));
    }
}
