package net.royling.lovelysparklepieces.ModEntity.Client;

import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.client.event.EntityRenderersEvent;
import net.minecraftforge.event.entity.EntityAttributeCreationEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModEntity.Butterfly.SoulButterfly;
import net.royling.lovelysparklepieces.ModEntity.ModEntities;
import net.royling.lovelysparklepieces.ModEntity.Butterfly.SoulButterflyEntity;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID, bus = Mod.EventBusSubscriber.Bus.MOD)
public class ModEntityClientEvent {
    @SubscribeEvent
    public static void registerAttributes(EntityAttributeCreationEvent event){
        event.put(ModEntities.BUTTERFLY.get(), SoulButterflyEntity.createAttributes().build());
    }
    @SubscribeEvent
    public static void registerLayerDefinitions(EntityRenderersEvent.RegisterLayerDefinitions event) {
        event.registerLayerDefinition(SoulButterfly.LAYER_LOCATION, SoulButterfly::createBodyLayer);
    }
}
