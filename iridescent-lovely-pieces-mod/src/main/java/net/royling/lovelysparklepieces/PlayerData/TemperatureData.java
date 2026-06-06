package net.royling.lovelysparklepieces.PlayerData;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerTemperaturePacket;

public class TemperatureData {
    public static int gettemperatures(Player player){
        if(player.getPersistentData().contains("lsp_temperature_count")){
            return player.getPersistentData().getInt("lsp_temperature_count");
        }
        else return  0;
    }
    public static void addTemperature(Player player,int count){
        int ori_count = gettemperatures(player);
        player.getPersistentData().putInt("lsp_temperature_count",Math.min(150,ori_count+count));
        NetworkHandler.sendToPlayer(new PlayerTemperaturePacket(Math.min(150,ori_count+count)), (ServerPlayer) player);
    }
    public static void removeTemperature(Player player,int count){
        int ori_count = gettemperatures(player);
        player.getPersistentData().putInt("lsp_temperature_count",Math.max(0,ori_count-count));
        NetworkHandler.sendToPlayer(new PlayerTemperaturePacket(Math.max(0,ori_count-count)), (ServerPlayer) player);
    }
    public static void setTemperature(Player player,int count){
        player.getPersistentData().putInt("lsp_temperature_count",Math.max(0, Math.min(150, count)));
        NetworkHandler.sendToPlayer(new PlayerTemperaturePacket(Math.max(0, Math.min(150, count))), (ServerPlayer) player);
    }
    @SubscribeEvent
    public static void initPlayer(PlayerEvent.PlayerLoggedInEvent event) {
        Player player = event.getEntity();
        if (!player.getPersistentData().contains("lsp_temperature_count")) {
            player.getPersistentData().putInt("lsp_temperature_count", 0);
        }
    }
}
