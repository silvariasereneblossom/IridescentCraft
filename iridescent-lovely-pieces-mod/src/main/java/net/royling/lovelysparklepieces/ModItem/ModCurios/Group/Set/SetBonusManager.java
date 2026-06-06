package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

import java.util.*;

public class SetBonusManager {
    private static final Map<UUID, Map<String, Integer>> activeStages = new HashMap<>();

    public static void tick(Player player, Collection<SetBonus> allBonuses, List<ItemStack> equippedItems) {
        UUID playerId = player.getUUID();
        for (SetBonus bonus : allBonuses) {
            long count = equippedItems.stream().map(ItemStack::getItem).filter(bonus::matches).count();
            Map<String, Integer> playerStages = activeStages.computeIfAbsent(playerId, id -> new HashMap<>());
            int previousStage = playerStages.getOrDefault(bonus.id(), 0);
            // 获取当前应该激活的阶段
            int currentStage = 0;
            for (SetBonusStage stage : bonus.getStages()) {
                if (count >= stage.requiredCount()) {
                    currentStage = stage.requiredCount();
                }
            }
            if (currentStage > previousStage) {
                // 触发新阶段激活
                for (SetBonusStage stage : bonus.getStages()) {
                    if (stage.requiredCount() > previousStage && stage.requiredCount() <= currentStage) {
                        stage.onActivated(player);
                    }
                }
            } else if (currentStage < previousStage) {
                // 触发阶段取消
                for (SetBonusStage stage : bonus.getStages()) {
                    if (stage.requiredCount() > currentStage && stage.requiredCount() <= previousStage) {
                        stage.onDeactivated(player);
                    }
                }
            }
            // 每tick触发
            for (SetBonusStage stage : bonus.getStages()) {
                if (stage.requiredCount() <= currentStage) {
                    stage.onTick(player);
                }
            }
            playerStages.put(bonus.id(), currentStage);
        }
    }
}
