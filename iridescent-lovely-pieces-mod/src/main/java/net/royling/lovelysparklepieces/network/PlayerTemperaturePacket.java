package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerTemperaturePacket {
    private final int temperatureCount;
    
    public PlayerTemperaturePacket(int temperatureCount) {
        if(temperatureCount < 0) throw new IllegalArgumentException("Invalid chipCount value");
        this.temperatureCount = temperatureCount;
    }
    
    public PlayerTemperaturePacket(FriendlyByteBuf buf) {
        this.temperatureCount = buf.readVarInt();
    }
    
    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarInt(this.temperatureCount);
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            Player clientplayer = context.getSender();
            if(clientplayer == null && context.getDirection().getReceptionSide().isClient()) {
                clientplayer = net.minecraft.client.Minecraft.getInstance().player;
            }
            if(clientplayer != null){
                clientplayer.getPersistentData().putInt("lsp_temperature_count", this.temperatureCount);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "lsp_temperature_count");
}
