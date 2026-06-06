package net.royling.lovelysparklepieces.network;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkDirection;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;
import net.royling.lovelysparklepieces.LovelySparklePieces;

public class NetworkHandler {
    private static final String PROTOCOL_VERSION = "1";
    public static final SimpleChannel INSTANCE = NetworkRegistry.newSimpleChannel(
            new ResourceLocation(LovelySparklePieces.MODID, "main"),
            () -> PROTOCOL_VERSION,
            PROTOCOL_VERSION::equals,
            PROTOCOL_VERSION::equals
    );

    private static int packetId = 0;
    private static int id() {
        return packetId++;
    }

    public static void register() {
        // 注册所有数据包
        // 服务器到客户端
        INSTANCE.registerMessage(id(), DamageParticlePacket.class, DamageParticlePacket::toBytes, 
            DamageParticlePacket::new, DamageParticlePacket::handle);
        INSTANCE.registerMessage(id(), PlayerSoulPacket.class, PlayerSoulPacket::toBytes,
            PlayerSoulPacket::new, PlayerSoulPacket::handle);
        INSTANCE.registerMessage(id(), PlayerChipPacket.class, PlayerChipPacket::toBytes,
            PlayerChipPacket::new, PlayerChipPacket::handle);
        INSTANCE.registerMessage(id(), PlayerHeartPacket.class, PlayerHeartPacket::toBytes,
            PlayerHeartPacket::new, PlayerHeartPacket::handle);
        INSTANCE.registerMessage(id(), PlayerUsingItemDataPacket.class, PlayerUsingItemDataPacket::toBytes,
            PlayerUsingItemDataPacket::new, PlayerUsingItemDataPacket::handle);
        INSTANCE.registerMessage(id(), PlayerTemperaturePacket.class, PlayerTemperaturePacket::toBytes,
            PlayerTemperaturePacket::new, PlayerTemperaturePacket::handle);
        INSTANCE.registerMessage(id(), PlayerLavadefPacket.class, PlayerLavadefPacket::toBytes,
            PlayerLavadefPacket::new, PlayerLavadefPacket::handle);
        
        // 客户端到服务器
        INSTANCE.registerMessage(id(), OpenChestPacket.class, OpenChestPacket::toBytes,
            OpenChestPacket::new, OpenChestPacket::handle);
        INSTANCE.registerMessage(id(), DoubleJumpPacket.class, DoubleJumpPacket::toBytes,
            DoubleJumpPacket::new, DoubleJumpPacket::handle);
        INSTANCE.registerMessage(id(), PlayerFpsPacket.class, PlayerFpsPacket::toBytes,
            PlayerFpsPacket::new, PlayerFpsPacket::handle);
    }

    public static <MSG> void sendToPlayer(MSG message, ServerPlayer player) {
        INSTANCE.send(PacketDistributor.PLAYER.with(() -> player), message);
    }

    public static <MSG> void sendToServer(MSG message) {
        INSTANCE.sendToServer(message);
    }

    public static <MSG> void sendToAllClients(MSG message) {
        INSTANCE.send(PacketDistributor.ALL.noArg(), message);
    }
}
