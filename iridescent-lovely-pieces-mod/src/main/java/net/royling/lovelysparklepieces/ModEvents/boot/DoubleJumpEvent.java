package net.royling.lovelysparklepieces.ModEvents.boot;

import net.minecraft.network.protocol.game.ClientboundSetEntityMotionPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.TickEvent;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.ModItem.ModCurios.boot.CatBootItem;

import java.util.Objects;

public class DoubleJumpEvent {
    @SubscribeEvent
    public static void DoubleJump(TickEvent.PlayerTickEvent event){
        if(event.phase != TickEvent.Phase.START) return;
        Player player = event.player;
        if (player.level().isClientSide) return;
        if(player.onGround()){
            player.getPersistentData().putBoolean("lsp_double_jump",false);
            player.getPersistentData().putBoolean("has_lsp_double_jump",false);
        };
        if(CatBootItem.hasBoot(player)|| ModCurios.hasCurio(player,ModCurios.JUMPING_FOOTWEAR.get())||ModCurios.hasCurio(player,ModCurios.SKY_BEAST_SHOES.get())){
            if(player.getPersistentData().getBoolean("lsp_double_jump")&&!player.getPersistentData().getBoolean("has_lsp_double_jump")){
                double jumpStr = Objects.requireNonNull(player.getAttribute(Attributes.JUMP_STRENGTH)).getValue();
                int jumpLevel = 0;
                if(player.hasEffect(MobEffects.JUMP))
                    jumpLevel = player.getEffect(MobEffects.JUMP).getAmplifier()+1;
                double newJump = jumpStr + (0.1*jumpLevel);
                player.setDeltaMovement(player.getDeltaMovement().x,newJump,player.getDeltaMovement().z);
                if(player instanceof ServerPlayer serverPlayer){
                    serverPlayer.connection.send(
                            new ClientboundSetEntityMotionPacket(serverPlayer)
                    );
                }
                player.getPersistentData().putBoolean("has_lsp_double_jump",true);
            }
        }
    }
}
