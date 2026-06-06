package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.TickEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerHeartPacket;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;

import java.util.Random;

public class HeartSystem {
    private static final String HEART_RATE_KEY = "heart_rate";
    private static final String HEART_STATE_KEY = "lsp_heart_state";
    private static final Random RAND = new Random();
    private enum HeartState {
        CREEPER_PANIC,   // 苦力怕爆炸（最高）
        LOW_HEALTH,      // 低生命值（第二）
        BOSS_COMBAT,
        COMBAT,
        MOVING,
        CALM
    }

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event){
        if(event.phase != TickEvent.Phase.START) return;
        Player player = event.player;
        if(player.level().isClientSide)return;
        if(player.tickCount%20!=0)return;

        CompoundTag data = player.getPersistentData();
        HeartState state = determineHeartState(player);
        int newRate = calculateHeartRate(state);

        data.putInt(HEART_RATE_KEY, newRate);
        data.putString(HEART_STATE_KEY, state.name());
        NetworkHandler.sendToPlayer(new PlayerHeartPacket(newRate), (ServerPlayer) player);
    }
    private static HeartState determineHeartState(Player player) {
        // 严格优先级顺序
        if (hasExplodingCreeper(player)) return HeartState.CREEPER_PANIC;
        if (isLowHealth(player)) return HeartState.LOW_HEALTH;
        if (hasNearbyBoss(player)) return HeartState.BOSS_COMBAT;
        if (inCombat(player)) return HeartState.COMBAT;
        if (isMoving(player)) return HeartState.MOVING;
        return HeartState.CALM;
    }
    private static int calculateHeartRate(HeartState state) {
        return switch (state) {
            case CREEPER_PANIC -> 200 + RAND.nextInt(21); // 200-220
            case LOW_HEALTH -> 160 + RAND.nextInt(41);    // 160-200
            case BOSS_COMBAT -> 110 + RAND.nextInt(21);
            case COMBAT -> 90 + RAND.nextInt(31);
            case MOVING -> 70 + RAND.nextInt(21);
            case CALM -> 60 + RAND.nextInt(21);
        };
    }
    // 新增低生命检测
    private static boolean isLowHealth(Player player) {
        return player.getHealth() <= (player.getMaxHealth() * 0.2f);
    }

    // 保持原有苦力怕检测
    private static boolean hasExplodingCreeper(Player player) {
        return !player.level().getEntitiesOfClass(
                Creeper.class,
                new AABB(player.blockPosition()).inflate(8),
                creeper -> creeper.getSwellDir() > 0
        ).isEmpty();
    }

    private static boolean isMoving(Player player) {
        Vec3 speed = player.getDeltaMovement();
        return Math.round((Math.sqrt(speed.x * speed.x + speed.z*speed.z)*20)*10)/10  >0;
    }
    private static boolean inCombat(Player player) {
        return !player.level().getEntitiesOfClass(
                Mob.class,
                new AABB(player.blockPosition()).inflate(24),
                e -> e.getTarget() == player && e.isAlive()
        ).isEmpty();
    }
    private static boolean hasNearbyBoss(Player player) {
        return !player.level().getEntitiesOfClass(
                Mob.class,
                new AABB(player.blockPosition()).inflate(64),
                e -> e.getMaxHealth() > 100 && e.isAlive()
        ).isEmpty();
    }
    public static int getHeartRate(Player player) {
        return player.getPersistentData().getInt(HEART_RATE_KEY);
    }
}
