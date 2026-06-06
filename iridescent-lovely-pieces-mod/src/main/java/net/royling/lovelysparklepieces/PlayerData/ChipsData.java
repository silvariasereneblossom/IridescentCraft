package net.royling.lovelysparklepieces.PlayerData;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerChipPacket;

public class ChipsData {
    public static int getChips(Player player){
        if(player.getPersistentData().contains("lsp_chip_count")){
            return player.getPersistentData().getInt("lsp_chip_count");
        }
        else return  0;
    }
    public static void addChip(Player player,int count){
        int oricount = getChips(player);
        player.getPersistentData().putInt("lsp_chip_count",Math.min(1000,oricount+count));
        NetworkHandler.sendToPlayer(new PlayerChipPacket(Math.min(1000,oricount+count)), (ServerPlayer) player);
    }
    public static void removeChip(Player player,int count){
        int oricount = getChips(player);
        player.getPersistentData().putInt("lsp_chip_count",Math.max(0,oricount-count));
        NetworkHandler.sendToPlayer(new PlayerChipPacket(Math.max(0,oricount-count)), (ServerPlayer) player);
    }
    public static void setChip(Player player,int count){
        player.getPersistentData().putInt("lsp_chip_count",Math.max(0, Math.min(1000, count)));
        NetworkHandler.sendToPlayer(new PlayerChipPacket(Math.max(0, Math.min(1000, count))), (ServerPlayer) player);
    }
    @SubscribeEvent
    public static void initPlayer(PlayerEvent.PlayerLoggedInEvent event) {
        Player player = event.getEntity();
        if (!player.getPersistentData().contains("lsp_chip_count")) {
            player.getPersistentData().putInt("lsp_chip_count", 0);
        }
    }
}
