package net.royling.lovelysparklepieces.PlayerData;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;

public class SoulData {
    public static int getSouls(Player player){
        if(player.getPersistentData().contains("lsp_soul_count")){
            return player.getPersistentData().getInt("lsp_soul_count");
        }
        else return  0;
    }
    public static void addSoul(Player player,int count){
        int oricount = getSouls(player);
        player.getPersistentData().putInt("lsp_soul_count",Math.min(200,oricount+count));
        NetworkHandler.sendToPlayer(new PlayerSoulPacket(Math.min(200,oricount+count)), (ServerPlayer) player);
    }
    public static void removeSoul(Player player,int count){
        int oricount = getSouls(player);
        player.getPersistentData().putInt("lsp_soul_count",Math.max(0,oricount-count));
        NetworkHandler.sendToPlayer(new PlayerSoulPacket(Math.max(0,oricount-count)), (ServerPlayer) player);
    }
    public static void setSoul(Player player,int count){
        player.getPersistentData().putInt("lsp_soul_count",Math.max(0, Math.min(200, count)));
        NetworkHandler.sendToPlayer(new PlayerSoulPacket(Math.max(0, Math.min(200, count))), (ServerPlayer) player);
    }
    @SubscribeEvent
    public static void initPlayer(PlayerEvent.PlayerLoggedInEvent event) {
        Player player = event.getEntity();
        if (!player.getPersistentData().contains("lsp_soul_count")) {
            player.getPersistentData().putInt("lsp_soul_count", 0);
        }
    }
}
