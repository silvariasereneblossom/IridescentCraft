package net.royling.lovelysparklepieces.network;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;
import net.royling.lovelysparklepieces.LovelySparklePieces;
import net.royling.lovelysparklepieces.ModItem.ModCurios.Rings.EnderRingItem;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class OpenChestPacket {
    
    public OpenChestPacket() {
    }
    
    public OpenChestPacket(FriendlyByteBuf buf) {
    }
    
    public void toBytes(FriendlyByteBuf buf) {
    }
    
    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();
            if (player != null){
                EnderRingItem.openEnderChest(player);
            }
        });
        return true;
    }
    
    public static final ResourceLocation ID = new ResourceLocation(LovelySparklePieces.MODID, "open_chest");
}
