package net.royling.lovelysparklepieces.ModEvents.belt;

import net.minecraft.util.Mth;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.player.ItemFishedEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModUsingItem.ModItems;

@Mod.EventBusSubscriber(modid = LovelySparklePieces.MODID,bus = Mod.EventBusSubscriber.Bus.FORGE)
public class HookEvent {
    @SubscribeEvent
    public static void onFishingCatch(ItemFishedEvent event){
        Player player = event.getEntity();
        Level level= player.level();
        if(level.isClientSide)return;
        if(!ModCurios.hasCurio(player,ModCurios.GOLDEN_HOOK.get()))return;
        if(player.getRandom().nextDouble()<0.05+player.getAttributeValue(Attributes.LUCK)*0.01){
            FishingHook fishingHook = event.getHookEntity();
            ItemStack treasure = new ItemStack(ModItems.FISHING_TREASURE.get());
            ItemEntity itemEntity = new ItemEntity(level,fishingHook.getX(),fishingHook.getY(),fishingHook.getZ(),treasure);
            double deltaX = player.getX() - fishingHook.getX();
            double deltaY = player.getY() - fishingHook.getY();
            double deltaZ = player.getZ() - fishingHook.getZ();
            double distance = Mth.sqrt((float)(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ));
            double velocityMultiplier = 0.8;
            double upwardBias = 0.25;
            itemEntity.setDeltaMovement(
                    deltaX / distance * velocityMultiplier,
                    deltaY / distance * velocityMultiplier + upwardBias,
                    deltaZ / distance * velocityMultiplier
            );
            level.addFreshEntity(itemEntity);
        }
    }
}
