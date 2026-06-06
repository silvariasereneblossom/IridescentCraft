package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerLavadefPacket {
    private final int lavadefCount;
    
    public PlayerLavadefPacket(int lavadefCount) {
        if(lavadefCount < 0) throw new IllegalArgumentException("Invalid soulCount value");
        this.lavadefCount = lavadefCount;
    }
    
    public PlayerLavadefPacket(FriendlyByteBuf buf) {
        this.lavadefCount = buf.readVarInt();
    }
    
    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarInt(this.lavadefCount);
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            Player clientplayer = context.getSender();
            if(clientplayer == null && context.getDirection().getReceptionSide().isClient()) {
                clientplayer = net.minecraft.client.Minecraft.getInstance().player;
            }
            if(clientplayer != null) {
                clientplayer.getPersistentData().putInt("lsp_lava_def", this.lavadefCount);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "lsp_lava_def");
}
