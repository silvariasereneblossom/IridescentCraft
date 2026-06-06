package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.EntityAttributeCreationEvent;
import net.minecraftforge.event.entity.EntityAttributeModificationEvent;
import net.royling.lovelysparklepieces.ModAttributes.ModAttribute;

@Mod.EventBusSubscriber(modid = "lovely_sparkle_pieces", bus = Mod.EventBusSubscriber.Bus.MOD)
public class createDefaultAttribute {
    @SubscribeEvent
    public static void createDA(EntityAttributeModificationEvent event){
        event.add(EntityType.PLAYER, ModAttribute.CRIT_CHANCE.get());
        event.add(EntityType.PLAYER, ModAttribute.DAMAGE_MODIFIER.get());
    }
}
