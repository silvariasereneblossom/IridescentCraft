package net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;

import java.util.*;

public class SetBonusManager {
    private static final Map<UUID, Map<String, Integer>> activeStages = new HashMap<>();
    /** IRIDESCENT: the worn pieces are recounted every this many ticks (and on a player's first tick). */
    private static final int RECOUNT_INTERVAL = 10;

    /**
     * IRIDESCENT: forget what this player had active. Called on logout (the map used to grow forever) and
     * whenever the player object is replaced (respawn / return from the End): the stage activations write
     * flags into the player's own data ({@code gambler_5effect}), a new player object starts without them,
     * and with the old entry still saying "stage 5 active" the manager never re-ran onActivated - the
     * five-piece bonus stayed lost until the set was re-equipped. With the entry gone the next tick counts
     * as a fresh evaluation and re-activates whatever is really worn.
     */
    public static void reset(UUID playerId) {
        activeStages.remove(playerId);
    }

    public static void tick(Player player, Collection<SetBonus> allBonuses) {
        UUID playerId = player.getUUID();
        Map<String, Integer> playerStages = activeStages.get(playerId);
        boolean firstTick = playerStages == null;
        if (firstTick) {
            playerStages = new HashMap<>();
            activeStages.put(playerId, playerStages);
        }
        // IRIDESCENT: the piece count only changes when a curio is (un)equipped, so it is recounted a
        // couple of times per second from the shared per-tick curio snapshot instead of from a freshly
        // built list of every equipped stack on every tick. Stage effects still tick every tick.
        Set<Item> worn = (firstTick || player.tickCount % RECOUNT_INTERVAL == 0) ? ModCurios.wornThisTick(player) : null;
        for (SetBonus bonus : allBonuses) {
            int previousStage = playerStages.getOrDefault(bonus.id(), 0);
            int currentStage = previousStage;
            if (worn != null) {
                int count = 0;
                for (Item item : bonus.getItems()) {
                    if (worn.contains(item)) {
                        count++;
                    }
                }
                // 获取当前应该激活的阶段
                currentStage = 0;
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
                playerStages.put(bonus.id(), currentStage);
            }
            // 每tick触发
            for (SetBonusStage stage : bonus.getStages()) {
                if (stage.requiredCount() <= currentStage) {
                    stage.onTick(player);
                }
            }
        }
    }
}
