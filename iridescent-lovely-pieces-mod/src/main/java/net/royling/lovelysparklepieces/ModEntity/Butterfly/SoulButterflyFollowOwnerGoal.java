package net.royling.lovelysparklepieces.ModEntity.Butterfly;

import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

public class SoulButterflyFollowOwnerGoal extends Goal {
    private final SoulButterflyEntity butterfly;
    private final double speed;
    private float currentAngle;

    public SoulButterflyFollowOwnerGoal(SoulButterflyEntity butterfly, double speed) {
        this.butterfly = butterfly;
        this.speed = speed;
        this.currentAngle = butterfly.getRandom().nextFloat() * 360;
    }
    @Override
    public boolean canUse() {
        return butterfly.getOwner() != null;
    }
    @Override
    public boolean canContinueToUse() {
        return this.canUse();
    }
    @Override
    public void tick() {
        LivingEntity owner = butterfly.getOwner();
        if (owner == null) return;
        double distanceSq = butterfly.distanceToSqr(owner);
        if (distanceSq > 24 * 24) {
            // 瞬移到玩家周围1格范围内
            Vec3 teleportPos = owner.position()
                    .add(
                            butterfly.getRandom().nextDouble() * 2 - 1, // X: -1~1
                            0.5, // Y: 玩家腰部高度
                            butterfly.getRandom().nextDouble() * 2 - 1  // Z: -1~1
                    );
            butterfly.teleportTo(teleportPos.x, teleportPos.y, teleportPos.z);
            butterfly.getNavigation().stop(); // 停止当前路径
            return; // 瞬移后跳过后续逻辑
        }
        // === 动态计算目标位置 ===
        double radius = 3.0;
        double verticalOffset = 1.5 + Math.sin(butterfly.tickCount * 0.2); // 增大垂直波动
        currentAngle += 6.0; // 更快的角度变化
        double radian = Math.toRadians(currentAngle % 360);
        Vec3 targetPos = owner.position().add(
                Math.cos(radian) * radius,
                verticalOffset,
                Math.sin(radian) * radius
        );

        // === 混合导航和直接运动 ===
        butterfly.getNavigation().moveTo(
                targetPos.x,
                targetPos.y,
                targetPos.z,
                speed * 2 // 导航系统用更高速度
        );

        // === 直接施加运动力 ===
        Vec3 toTarget = targetPos.subtract(butterfly.position()).normalize();
        butterfly.setDeltaMovement(
                butterfly.getDeltaMovement().add(
                        toTarget.x * 0.1,
                        toTarget.y * 0.1,
                        toTarget.z * 0.1
                )
        );
        // === 限制最大速度 ===
        Vec3 currentMotion = butterfly.getDeltaMovement();
        if (currentMotion.length() > speed) {
            butterfly.setDeltaMovement(currentMotion.normalize().scale(speed));
        }
        // === 面向目标 ===
        butterfly.lookAt(EntityAnchorArgument.Anchor.EYES, targetPos);
    }

    @Override
    public void stop() {
        butterfly.getNavigation().stop();
    }
}
