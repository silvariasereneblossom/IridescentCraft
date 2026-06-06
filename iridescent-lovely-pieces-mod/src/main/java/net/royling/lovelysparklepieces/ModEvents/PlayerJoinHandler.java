package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.royling.lovelysparklepieces.network.NetworkHandler;
import net.royling.lovelysparklepieces.network.PlayerChipPacket;
import net.royling.lovelysparklepieces.network.PlayerLavadefPacket;
import net.royling.lovelysparklepieces.network.PlayerSoulPacket;
import net.royling.lovelysparklepieces.network.PlayerTemperaturePacket;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModConfigs.LSPConfig;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;
import net.royling.lovelysparklepieces.PlayerData.ChipsData;
import net.royling.lovelysparklepieces.PlayerData.SoulData;
import net.royling.lovelysparklepieces.PlayerData.TemperatureData;

public class PlayerJoinHandler {
    private static final ResourceLocation START_ITEM = new ResourceLocation(LovelySparklePieces.MODID, "start_item");
    @SubscribeEvent
    public static void onPlayerJoin(PlayerEvent.PlayerLoggedInEvent event){
        Player player = event.getEntity();
        if (!player.level().isClientSide) {
            player.sendSystemMessage(Component.translatable("message.lsp.welcome").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome1").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome2").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome3").withStyle(ChatFormatting.GOLD));
            NetworkHandler.sendToPlayer(new PlayerSoulPacket(SoulData.getSouls(player)), (ServerPlayer) player);
            NetworkHandler.sendToPlayer(new PlayerChipPacket(ChipsData.getChips(player)), (ServerPlayer) player);
            NetworkHandler.sendToPlayer(new PlayerTemperaturePacket(TemperatureData.gettemperatures(player)), (ServerPlayer) player);
            NetworkHandler.sendToPlayer(new PlayerLavadefPacket(player.getPersistentData().getInt("lsp_lava_def")), (ServerPlayer) player);

            if(LSPConfig.IS_START_ITEM.get()){
                if(!player.getPersistentData().getBoolean("lsp_startitem")){
                    player.addItem(ModCurios.BLASPHEMOUS_CONTRACT.get().getDefaultInstance());
                    player.getPersistentData().putBoolean("lsp_startitem",true);
                }
            }
        }
    }
}
