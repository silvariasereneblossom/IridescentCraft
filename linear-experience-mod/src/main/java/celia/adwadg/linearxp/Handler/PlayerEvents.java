package celia.adwadg.linearxp.Handler;

import celia.adwadg.linearxp.Capability.AccuratedExpProvider;
import celia.adwadg.linearxp.LinearXp;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

@Mod.EventBusSubscriber(modid = LinearXp.MODID)
public class PlayerEvents {

    @SubscribeEvent
    public static void onPlayerClone(PlayerEvent.Clone event) {
        if (event.isWasDeath()) {
            // 玩家死亡时保留精确经验数据
            event.getOriginal().getCapability(AccuratedExpProvider.ACCURATED_EXP).ifPresent(oldData -> {
                event.getEntity().getCapability(AccuratedExpProvider.ACCURATED_EXP).ifPresent(newData -> {
                    newData.setAccuratedExp(oldData.getAccuratedExp());
                });
            });
        }
    }

    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event) {
        // 确保重生后数据正确加载
        event.getEntity().getCapability(AccuratedExpProvider.ACCURATED_EXP).ifPresent(data -> {
            // 可以在这里添加重生后的特殊逻辑
        });
    }
}
