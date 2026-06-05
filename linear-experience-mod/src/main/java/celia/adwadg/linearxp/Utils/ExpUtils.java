package celia.adwadg.linearxp.Utils;

import celia.adwadg.linearxp.Capability.AccuratedExpProvider;
import celia.adwadg.linearxp.IAccuratedExp;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.common.util.LazyOptional;

public class ExpUtils {

    /**
     * 获取玩家的精确经验Capability
     */
    public static LazyOptional<IAccuratedExp> getAccuratedExp(Player player) {
        return player.getCapability(AccuratedExpProvider.ACCURATED_EXP);
    }

    /**
     * 安全地增加精确经验值
     */
    public static void addAccuratedExp(Player player, long amount) {
        getAccuratedExp(player).ifPresent(data -> data.addAccuratedExp(amount));
    }

    /**
     * 安全地增加实际经验值（自动乘以100）
     */
    public static void addActualExp(Player player, int exp) {
        getAccuratedExp(player).ifPresent(data -> data.addActualExp(exp));
    }

    /**
     * 获取玩家的实际经验值（取证后）
     */
    public static int getActualExp(Player player) {
        return getAccuratedExp(player).map(IAccuratedExp::getActualExp).orElse(0);
    }

    /**
     * 获取玩家的精确经验值
     */
    public static long getAccuratedExpValue(Player player) {
        return getAccuratedExp(player).map(IAccuratedExp::getAccuratedExp).orElse(0L);
    }
}
