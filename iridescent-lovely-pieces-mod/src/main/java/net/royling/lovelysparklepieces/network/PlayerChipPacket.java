package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerChipPacket {
    private final int chipCount;
    
    public PlayerChipPacket(int chipCount) {
        if(chipCount < 0) throw new IllegalArgumentException("Invalid chipCount value");
        this.chipCount = chipCount;
    }
    
    public PlayerChipPacket(FriendlyByteBuf buf) {
        this.chipCount = buf.readVarInt();
    }
    
    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarInt(this.chipCount);
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            Player clientplayer = context.getSender();
            if(clientplayer == null && context.getDirection().getReceptionSide().isClient()) {
                clientplayer = net.minecraft.client.Minecraft.getInstance().player;
            }
            if(clientplayer != null){
                clientplayer.getPersistentData().putInt("lsp_chip_count", this.chipCount);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "splsp_chip_count");
}
