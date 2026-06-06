package net.royling.lovelysparklepieces.ModEvents.necklace;

import net.minecraft.world.damagesource.DamageSources;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.living.LivingDamageEvent;
import net.minecraftforge.event.entity.living.LivingHurtEvent;

public class LavaDefance {
    @SubscribeEvent
    public static void onPlayerInLava(LivingHurtEvent event){
        if(event.getEntity() instanceof Player player &&
                player.getPersistentData().get("lsp_lava_def")!=null &&
                player.getPersistentData().getInt("lsp_lava_def")>0){
            if(event.getSource().is(DamageTypes.LAVA)||event.getSource().is(DamageTypes.IN_FIRE)||event.getSource().is(DamageTypes.ON_FIRE)){
                event.setCanceled(true);
            }
        }
    }
}
