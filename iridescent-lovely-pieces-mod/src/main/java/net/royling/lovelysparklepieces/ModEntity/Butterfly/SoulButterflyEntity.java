package net.royling.lovelysparklepieces.ModEntity.Butterfly;

import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

import org.jetbrains.annotations.Nullable;

import java.util.UUID;

public class SoulButterflyEntity extends PathfinderMob {
    // IRIDESCENT: the owner is identified by UUID. The entity reference below is only a cache that is
    // re-validated on every read - upstream kept a hard reference forever, so a butterfly held a dead or
    // logged-out player's whole object alive and kept circling the spot where they died.
    @Nullable
    private UUID ownerUUID;
    @Nullable
    private LivingEntity cachedOwner;
    private final AnimationState flyAnimationState = new AnimationState();
    private final AnimationState idleAnimationState = new AnimationState();
    /** Ticks between two attempts to find a missing owner. */
    private static final int RETRY_INTERVAL = 20;
    /** Attempts in a row that may fail before the butterfly gives up (~30 s without its owner in this level). */
    private static final int MAX_FAILED_RETRIES = 30;
    private int retryTimer = 0;
    private int failedRetries = 0;
    public SoulButterflyEntity(EntityType<? extends PathfinderMob> entityType, Level level) {
        super(entityType, level);
    }
    public void setOwner(@Nullable LivingEntity owner) {
        this.ownerUUID = owner == null ? null : owner.getUUID();
        this.cachedOwner = owner;
    }

    @Nullable
    public UUID getOwnerUUID() {
        return ownerUUID;
    }

    /**
     * The owner, only while it is alive and in this butterfly's level. Anything else (dead, removed, logged
     * out, another dimension) drops the cached reference; {@link #tick()} looks the owner up again by UUID.
     */
    @Nullable
    public LivingEntity getOwner() {
        LivingEntity owner = this.cachedOwner;
        if (owner != null && (owner.isRemoved() || !owner.isAlive() || owner.level() != this.level())) {
            this.cachedOwner = null;
            return null;
        }
        return owner;
    }

    @Nullable
    private LivingEntity findOwner() {
        if (this.ownerUUID == null) return null;
        // the level's player list first (the owner is a player), then any entity of this level
        LivingEntity found = this.level().getPlayerByUUID(this.ownerUUID);
        if (found == null && this.level() instanceof ServerLevel serverLevel
                && serverLevel.getEntity(this.ownerUUID) instanceof LivingEntity living) {
            found = living;
        }
        return found != null && found.isAlive() && !found.isRemoved() ? found : null;
    }

    @Override
    protected PathNavigation createNavigation(Level level) {
        FlyingPathNavigation navigation1 = new FlyingPathNavigation(this,level);
        navigation1.setCanOpenDoors(false);
        navigation1.setCanFloat(true);
        navigation1.setCanPassDoors(true);
        navigation1.setSpeedModifier(1.5f);
        return navigation1;
    }

    @Override
    public void travel(Vec3 travelVector) {
            this.setNoGravity(true);
        this.fallDistance = 0.0F;
            super.travel(travelVector);
    }

    @Override
    public boolean isNoGravity() {
        return true;
    }

    @Override
    protected void registerGoals() {
        this.goalSelector.addGoal(1,new SoulButterflyFollowOwnerGoal(this,5d));
    }
    public void teleportTo(double x, double y, double z) {
        // 强制设置位置并重置运动
        this.setPos(x, y, z);
        this.setDeltaMovement(Vec3.ZERO);
        this.getNavigation().stop();

        // 粒子效果（可选）
        if (!this.level().isClientSide) {
            ((ServerLevel) this.level()).sendParticles(
                    ParticleTypes.PORTAL,
                    this.getX(), this.getY(), this.getZ(),
                    10, 0.5, 0.5, 0.5, 0.1
            );
        }
    }

    @Override
    protected void defineSynchedData() {
        super.defineSynchedData();
    }

    @Override
    public void addAdditionalSaveData(CompoundTag compound) {
        super.addAdditionalSaveData(compound);
        // IRIDESCENT: was saved only while the owner ENTITY was known - a butterfly reloaded without its
        // owner nearby lost the UUID on its next save.
        if (ownerUUID != null) {
            compound.putUUID("OwnerUUID", ownerUUID);
        }
    }

    @Override
    public void readAdditionalSaveData(CompoundTag compound) {
        super.readAdditionalSaveData(compound);
        if (compound.hasUUID("OwnerUUID")) {
            ownerUUID = compound.getUUID("OwnerUUID");
        }
    }

    @Override
    public void tick() {
        super.tick();
        LivingEntity butterfly = this;
        if (butterfly.level().isClientSide) {
            if (this.isFlying()) {
                this.idleAnimationState.stop();
                this.flyAnimationState.startIfStopped(this.tickCount);
            } else {
                this.flyAnimationState.stop();
                this.idleAnimationState.startIfStopped(this.tickCount);
            }
            butterfly.level().addParticle(
                    ParticleTypes.SOUL_FIRE_FLAME,
                    butterfly.getX(),
                    butterfly.getY() + 0.1,
                    butterfly.getZ(),
                    (butterfly.getDeltaMovement().x * 0.1),
                    (butterfly.getDeltaMovement().y * 0.1),
                    (butterfly.getDeltaMovement().z * 0.1)
            );
        }
        if(level().isClientSide)return;
        if (ownerUUID == null) {
            // never had an owner (e.g. /summon): nothing to follow
            this.discard();
            return;
        }
        // IRIDESCENT: upstream's retry could never run - the line after it discarded the butterfly on the
        // same tick the owner was missing. Now: look the owner up every RETRY_INTERVAL ticks and give up
        // only after MAX_FAILED_RETRIES misses in a row, so a respawn or a quick trip through a portal
        // gets the butterfly back.
        if (getOwner() == null) {
            if (retryTimer <= 0) {
                retryTimer = RETRY_INTERVAL;
                LivingEntity found = findOwner();
                if (found != null) {
                    cachedOwner = found; // 找到后设置owner
                    failedRetries = 0;
                } else if (++failedRetries >= MAX_FAILED_RETRIES) {
                    this.discard();
                    return;
                }
            } else {
                retryTimer--;
            }
        } else {
            failedRetries = 0;
            retryTimer = 0;
        }
        if (this.horizontalCollision || this.verticalCollision) {
            this.setDeltaMovement(this.getDeltaMovement().scale(0.2));
        }
    }
    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 10.0) // 设置最大生命值
                .add(Attributes.MOVEMENT_SPEED, 2.2)
                .add(Attributes.FLYING_SPEED,3); // 设置移动速度

    }
    public boolean isFlying() {
        return !this.onGround(); // 简单状态判断
    }
    public AnimationState getAnimationState() {
        return this.isFlying() ? flyAnimationState : idleAnimationState;
    }
}
