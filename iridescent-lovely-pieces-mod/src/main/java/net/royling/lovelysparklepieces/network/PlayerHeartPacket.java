package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerHeartPacket {
    private final int heartCount;
    
    public PlayerHeartPacket(int heartCount) {
        if(heartCount < 0) throw new IllegalArgumentException("Invalid soulCount value");
        this.heartCount = heartCount;
    }
    
    public PlayerHeartPacket(FriendlyByteBuf buf) {
        this.heartCount = buf.readVarInt();
    }
    
    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarInt(this.heartCount);
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            Player clientplayer = context.getSender();
            if(clientplayer == null && context.getDirection().getReceptionSide().isClient()) {
                clientplayer = net.minecraft.client.Minecraft.getInstance().player;
            }
            if(clientplayer != null){
                clientplayer.getPersistentData().putInt("lsp_heart_state", this.heartCount);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "lsp_heart_state");
}
