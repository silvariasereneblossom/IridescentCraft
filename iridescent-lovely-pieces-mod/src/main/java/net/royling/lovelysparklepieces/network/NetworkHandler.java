package net.royling.lovelysparklepieces.network;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkDirection;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;
import net.royling.lovelysparklepieces.LovelySparklePieces;

import java.util.Optional;

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
        // IRIDESCENT: every message is now bound to its direction. They were registered for both ways, and
        // the "server to client" handlers write the value into the SENDER's player data when they run on
        // the server - so a modified client could send PlayerLavadefPacket(140) and be immune to lava and
        // fire (LavaDefance only checks the stored number), or set its own chips / temperature. A packet
        // arriving from the wrong side now terminates that connection instead of being handled.
        Optional<NetworkDirection> toClient = Optional.of(NetworkDirection.PLAY_TO_CLIENT);
        Optional<NetworkDirection> toServer = Optional.of(NetworkDirection.PLAY_TO_SERVER);
        // 注册所有数据包
        // 服务器到客户端
        INSTANCE.registerMessage(id(), PlayerSoulPacket.class, PlayerSoulPacket::toBytes,
            PlayerSoulPacket::new, PlayerSoulPacket::handle, toClient);
        INSTANCE.registerMessage(id(), PlayerChipPacket.class, PlayerChipPacket::toBytes,
            PlayerChipPacket::new, PlayerChipPacket::handle, toClient);
        INSTANCE.registerMessage(id(), PlayerUsingItemDataPacket.class, PlayerUsingItemDataPacket::toBytes,
            PlayerUsingItemDataPacket::new, PlayerUsingItemDataPacket::handle, toClient);
        INSTANCE.registerMessage(id(), PlayerTemperaturePacket.class, PlayerTemperaturePacket::toBytes,
            PlayerTemperaturePacket::new, PlayerTemperaturePacket::handle, toClient);
        INSTANCE.registerMessage(id(), PlayerLavadefPacket.class, PlayerLavadefPacket::toBytes,
            PlayerLavadefPacket::new, PlayerLavadefPacket::handle, toClient);
        
        // 客户端到服务器
        INSTANCE.registerMessage(id(), OpenChestPacket.class, OpenChestPacket::toBytes,
            OpenChestPacket::new, OpenChestPacket::handle, toServer);
        INSTANCE.registerMessage(id(), DoubleJumpPacket.class, DoubleJumpPacket::toBytes,
            DoubleJumpPacket::new, DoubleJumpPacket::handle, toServer);
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
