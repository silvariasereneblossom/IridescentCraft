package net.royling.lovelysparklepieces.ModEvents.boot;

import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.living.LivingHurtEvent;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.boot.GoatBootItem;

public class SteelBoot {
    @SubscribeEvent
    public static void onLivingHurt(LivingHurtEvent event){
        if(event.getEntity()instanceof Player player){
        }
        if(event.getEntity()instanceof Player player&&event.getSource().is(DamageTypes.FALL)&&
                (GoatBootItem.hasBoot(player)|| ModCurios.hasCurio(player,ModCurios.SKY_BEAST_SHOES.get()) ||ModCurios.hasCurio(player,ModCurios.JUMPING_FOOTWEAR.get()))){
            event.setCanceled(true);
        }
    }
}
