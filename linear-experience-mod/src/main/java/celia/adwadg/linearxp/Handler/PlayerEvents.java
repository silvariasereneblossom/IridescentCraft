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

    // IridescentCraft patch: upstream also subscribed an onPlayerRespawn handler here
    // whose body was an empty ifPresent (a placeholder "add respawn logic here"). It
    // did nothing but resolve the capability on every respawn, so it was removed.
}
