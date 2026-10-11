package com.seniors.justlevelingfork.network.packet.common;

import com.seniors.justlevelingfork.common.capability.AptitudeCapability;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.network.packet.client.SyncAptitudeCapabilityCP;
import com.seniors.justlevelingfork.registry.RegistryPassives;
import com.seniors.justlevelingfork.registry.passive.Passive;

import java.util.function.Supplier;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

public class PassiveLevelDownSP {
    private final String passive;

    public PassiveLevelDownSP(Passive passive) {
        this.passive = passive.getName();
    }

    public PassiveLevelDownSP(FriendlyByteBuf buffer) {
        this.passive = buffer.readUtf();
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeUtf(this.passive);
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();

            if (player != null) {
                AptitudeCapability capability = AptitudeCapability.get(player);

                Passive passive = RegistryPassives.getPassive(this.passive);
                // Iridescent fork (security): mirror the screen's button gating (JustLevelingScreen.createList only
                // offers "-" above level 0) -- drop unknown passive names instead of NPE-ing the handler, and do
                // not resync for a no-op.
                if (capability == null || passive == null || capability.getPassiveLevel(passive) <= 0) return;
                capability.subPassiveLevel(passive, 1);
                SyncAptitudeCapabilityCP.send(player);
            }
        });
        context.setPacketHandled(true);
    }

    public static void send(Passive passive) {
        ServerNetworking.sendToServer(new PassiveLevelDownSP(passive));
    }
}


