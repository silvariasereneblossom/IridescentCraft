package net.royling.lovelysparklepieces.network;

import net.minecraft.client.Minecraft;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;

import net.minecraftforge.registries.RegistryObject;
import java.util.function.Supplier;

public class PlayerSoulPacket {
    private final int soulCount;

    public PlayerSoulPacket(int soulCount) {
        if (soulCount < 0) throw new IllegalArgumentException("Invalid soulCount value");
        this.soulCount = soulCount;
    }

    public PlayerSoulPacket(FriendlyByteBuf buf) {
        this.soulCount = buf.readVarInt();
    }

    public void toBytes(FriendlyByteBuf buf) {
        buf.writeVarInt(this.soulCount);
    }

    public boolean handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context ctx = supplier.get();
        ctx.enqueueWork(() -> {
            // 确保在客户端执行
            if (ctx.getDirection().getReceptionSide().isClient()) {
                Player clientPlayer = Minecraft.getInstance().player;
                if (clientPlayer != null) {
                    clientPlayer.getPersistentData().putInt("lsp_soul_count", this.soulCount);
                }
            }
        });
        return true;
    }
}
