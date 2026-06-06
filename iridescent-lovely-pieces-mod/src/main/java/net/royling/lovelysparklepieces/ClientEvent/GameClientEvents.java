package net.royling.lovelysparklepieces.ClientEvent;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.client.event.ComputeFovModifierEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID,bus= Mod.EventBusSubscriber.Bus.FORGE,value = Dist.CLIENT)
public class GameClientEvents {
    @SubscribeEvent
    public static void onComputeFovModifier(ComputeFovModifierEvent event){
        if(event.getPlayer().isUsingItem()&&event.getPlayer().getUseItem().getItem() == ModItems.FLAME_STAFF.get()){
            float fovModifier = 1f;
            int tickUsing = event.getPlayer().getTicksUsingItem();
            float deltaTick = (float) tickUsing/20f;
            if(deltaTick>1f){
                deltaTick=1f;
            }else {
                deltaTick *= deltaTick;
            }
            fovModifier *= 1f-deltaTick*0.15f;
            event.setNewFovModifier(fovModifier);
        }
    }
    @SubscribeEvent
    public static void onComputeFovModifierBinoculars(ComputeFovModifierEvent event){
        if(event.getPlayer().isUsingItem()&&event.getPlayer().getUseItem().getItem() == ModItems.BINOCULARS.get()){
            event.setNewFovModifier(0);
        }
    }

}
