package net.royling.lovelysparklepieces.ModEvents;

import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
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
import net.royling.lovelysparklepieces.ModItem.ModCurios.Group.Set.SetBonusManager;
import net.royling.lovelysparklepieces.ModItem.ModCurios.ModCurios;

public class PlayerJoinHandler {
    private static final ResourceLocation START_ITEM = new ResourceLocation(LovelySparklePieces.MODID, "start_item");

    private static final String SOULS = "lsp_soul_count";
    private static final String CHIPS = "lsp_chip_count";
    private static final String TEMPERATURE = "lsp_temperature_count";
    private static final String LAVA_DEF = "lsp_lava_def";
    private static final String START_ITEM_GIVEN = "lsp_startitem";

    // IRIDESCENT: the mod keeps its per-player numbers in the ROOT of getPersistentData(). Forge copies only
    // the "PlayerPersisted" sub-compound when a player object is replaced (ServerPlayer.restoreFrom), so
    // every death - and every trip back from the End, which also builds a new player - silently reset
    // souls, chips, temperature, the lava charge and the "starter item given" flag to nothing.
    /** Carried over whenever the player object is replaced. */
    private static final String[] KEEP_ALWAYS = {SOULS, CHIPS, START_ITEM_GIVEN};
    /** Running gauges: carried over when the same life continues (End exit), start from zero after a death. */
    private static final String[] KEEP_UNLESS_DEATH = {TEMPERATURE, LAVA_DEF};

    @SubscribeEvent
    public static void onPlayerJoin(PlayerEvent.PlayerLoggedInEvent event){
        Player player = event.getEntity();
        if (!player.level().isClientSide) {
            player.sendSystemMessage(Component.translatable("message.lsp.welcome").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome1").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome2").withStyle(ChatFormatting.GOLD));
            player.sendSystemMessage(Component.translatable("message.lsp.welcome3").withStyle(ChatFormatting.GOLD));
            // IRIDESCENT: the set manager starts every session from "nothing active" and re-activates what
            // is really worn on the first tick; a flag left over in the save must not outlive that.
            player.getPersistentData().remove("gambler_5effect");
            syncAll((ServerPlayer) player);

            if(LSPConfig.IS_START_ITEM.get()){
                if(!player.getPersistentData().getBoolean(START_ITEM_GIVEN)){
                    player.addItem(ModCurios.BLASPHEMOUS_CONTRACT.get().getDefaultInstance());
                    player.getPersistentData().putBoolean(START_ITEM_GIVEN,true);
                }
            }
        }
    }

    @SubscribeEvent
    public static void onPlayerClone(PlayerEvent.Clone event){
        Player player = event.getEntity();
        if (player.level().isClientSide) return;
        CompoundTag from = event.getOriginal().getPersistentData();
        CompoundTag to = player.getPersistentData();
        copyKeys(from, to, KEEP_ALWAYS);
        if (!event.isWasDeath()) {
            copyKeys(from, to, KEEP_UNLESS_DEATH);
        }
        // New player object: whatever the set manager remembers was activated on the old one (and the
        // gambler_5effect flag it wrote there is deliberately NOT copied). Next tick re-evaluates.
        SetBonusManager.reset(player.getUUID());
    }

    // The client keeps its copy of these values on its own player object, which it rebuilds on every
    // respawn and every dimension change - it was only ever told the values at login. Sent here rather
    // than from Clone: Clone runs before the client has been told to rebuild its player.
    @SubscribeEvent
    public static void onPlayerRespawn(PlayerEvent.PlayerRespawnEvent event){
        if (event.getEntity() instanceof ServerPlayer player) {
            syncAll(player);
        }
    }

    @SubscribeEvent
    public static void onPlayerChangedDimension(PlayerEvent.PlayerChangedDimensionEvent event){
        if (event.getEntity() instanceof ServerPlayer player) {
            syncAll(player);
        }
    }

    @SubscribeEvent
    public static void onPlayerLogout(PlayerEvent.PlayerLoggedOutEvent event){
        if (!event.getEntity().level().isClientSide) {
            SetBonusManager.reset(event.getEntity().getUUID());
        }
    }

    private static void copyKeys(CompoundTag from, CompoundTag to, String[] keys){
        for (String key : keys) {
            Tag value = from.get(key);
            if (value != null) {
                to.put(key, value.copy());
            }
        }
    }

    /** Tells the client every value its HUD reads. */
    public static void syncAll(ServerPlayer player){
        CompoundTag data = player.getPersistentData();
        NetworkHandler.sendToPlayer(new PlayerSoulPacket(clampStored(data, SOULS, 200)), player);
        NetworkHandler.sendToPlayer(new PlayerChipPacket(clampStored(data, CHIPS, 1000)), player);
        NetworkHandler.sendToPlayer(new PlayerTemperaturePacket(clampStored(data, TEMPERATURE, 150)), player);
        NetworkHandler.sendToPlayer(new PlayerLavadefPacket(clampStored(data, LAVA_DEF, 140)), player);
    }

    /**
     * IRIDESCENT: reads a stored counter clamped to its legal range, and repairs the stored value if it was
     * outside. These packets' constructors throw on a negative value; a save written before the Magma
     * Amulet floor fix can hold a negative lsp_lava_def, which would throw out of the login handler on
     * every join.
     */
    private static int clampStored(CompoundTag data, String key, int max){
        int stored = data.getInt(key);
        int clamped = Math.max(0, Math.min(max, stored));
        if (clamped != stored) {
            data.putInt(key, clamped);
        }
        return clamped;
    }
}
