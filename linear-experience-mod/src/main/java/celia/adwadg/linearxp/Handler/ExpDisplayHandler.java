package celia.adwadg.linearxp.Handler;

import celia.adwadg.linearxp.LinearXp;
import celia.adwadg.linearxp.Utils.ExpUtils;
import celia.adwadg.linearxp.Utils.ExperienceCalculator;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

@Mod.EventBusSubscriber(modid = LinearXp.MODID)
public class ExpDisplayHandler {

    private static final long CHECK_INTERVAL = 10; // 每10tick检查一次
    private static long tickCounter = 0;

    @SubscribeEvent
    public static void onPlayerTick(TickEvent.PlayerTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;

        Player player = event.player;
        if (player.level().isClientSide()) return;

        tickCounter++;
        if (tickCounter % CHECK_INTERVAL != 0) return;

        // 获取玩家的精确经验值
        long accuratedExp = ExpUtils.getAccuratedExpValue(player);
        int actualExp = ExpUtils.getActualExp(player);
        int currentLevel = player.experienceLevel;

        // 检查是否可以升级
        checkLevelUp(player, accuratedExp, currentLevel);

        // 更新玩家的经验条显示
        updateExperienceBar(player, accuratedExp, currentLevel);
    }

    public static void updatePlayerExpBar(Player player){
        long accuratedExp = ExpUtils.getAccuratedExpValue(player);
        int actualExp = ExpUtils.getActualExp(player);
        int currentLevel = player.experienceLevel;

        // 检查是否可以升级
        checkLevelUp(player, accuratedExp, currentLevel);

        // 更新玩家的经验条显示
        updateExperienceBar(player, accuratedExp, currentLevel);
    }

    private static void checkLevelUp(Player player, long accuratedExp, int currentLevel) {
        // 计算当前等级升级所需的精确经验值（原版值乘以1000）
        long requiredExpAccurated = ExperienceCalculator.calculateAccuratedExperience(currentLevel);

        while (accuratedExp >= requiredExpAccurated) {
            // 升级
            accuratedExp -= requiredExpAccurated;
            // IridescentCraft patch (#77): upstream shipped this level-up increment commented out,
            // which froze leveling (XP was intercepted + zeroed but experienceLevel never rose).
            // Increment unconditionally so consumed accurated-exp converts into real vanilla levels.
            player.experienceLevel++;

            // 更新存储的精确经验值
            long finalAccuratedExp = accuratedExp;
            ExpUtils.getAccuratedExp(player).ifPresent(data -> {
                data.setAccuratedExp(finalAccuratedExp);
            });

            // 计算下一等级所需的经验值
            requiredExpAccurated = ExperienceCalculator.calculateAccuratedExperience(player.experienceLevel);

            /*LinearXp.LOGGER.debug("玩家升级! 新等级: {}, 剩余精确经验: {}, 显示经验: {}",
                    player.experienceLevel, accuratedExp, accuratedExp / 1000L);*/
        }
    }
    private static void updateExperienceBar(Player player, long accuratedExp, int currentLevel) {
        if (currentLevel < 0) return;

        // 使用新的精确经验进度计算方法
        float progress = ExperienceCalculator.getExpProgress(accuratedExp, currentLevel);

        // 更新玩家的经验进度
        player.experienceProgress = progress;
        /*LinearXp.LOGGER.debug("Player Progress Updated:{}",progress);*/
    }
}
