package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerFpsPacket {
    private final long fps;
    private final double lsp_memory;
    
    public PlayerFpsPacket(long fps, double lsp_memory) {
        if (fps < 0) throw new IllegalArgumentException("Invalid FPS value");
        this.fps = fps;
        this.lsp_memory = lsp_memory;
    }
    
    public PlayerFpsPacket(FriendlyByteBuf buf) {
        this.fps = buf.readVarLong();
        this.lsp_memory = buf.readDouble();
    }
    
    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarLong(this.fps);
        buf.writeDouble(this.lsp_memory);
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();
            if(player != null){
                player.getPersistentData().putLong("lsp_fpsvalue", this.fps);
                player.getPersistentData().putDouble("lsp_memory", this.lsp_memory);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "fps");
}
