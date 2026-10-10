package com.seniors.justlevelingfork.network.packet.common;

import com.seniors.justlevelingfork.common.capability.AptitudeCapability;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.network.packet.client.SyncAptitudeCapabilityCP;
import com.seniors.justlevelingfork.registry.RegistryAttributes;
import com.seniors.justlevelingfork.registry.RegistrySkills;

import java.util.UUID;
import java.util.function.Supplier;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraftforge.network.NetworkEvent;

public class CounterAttackSP {
    private final boolean isCounterAttack;
    private final float modifier;

    public CounterAttackSP(boolean isCounterAttack, float modifier) {
        this.isCounterAttack = isCounterAttack;
        this.modifier = modifier;
    }

    public CounterAttackSP(FriendlyByteBuf buffer) {
        this.isCounterAttack = buffer.readBoolean();
        this.modifier = buffer.readFloat();
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeBoolean(this.isCounterAttack);
        buffer.writeFloat(this.modifier);
    }

    private static final UUID COUNTER_ATTACK_MODIFIER = UUID.fromString("55550aa2-eff2-4a81-b92b-a1cb95f15590");

    public static void handle(CounterAttackSP msg, Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        // Iridescent fork (security): Counter Attack is retired (RegistrySkills.COUNTER_ATTACK == null), so this
        // packet has nothing to do. The old body applied the CLIENT-supplied msg.modifier as a permanent
        // attack-damage modifier -> any client could grant itself arbitrary damage with one crafted packet.
        if (RegistrySkills.COUNTER_ATTACK == null) {
            context.setPacketHandled(true);
            return;
        }
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();
            // Never trust a client-supplied activation/amount: a client may only END its counter attack.
            if (player != null && !msg.isCounterAttack) {
                resetServerSide(player);
            }
        });
        context.setPacketHandled(true);
    }

    /**
     * Iridescent fork: server-authoritative end of a counter attack. Replaces the server-thread calls to
     * {@link #send} (a CLIENT send: sendToServer -> Minecraft.getInstance(), NoClassDefFoundError on a dedicated
     * server). Also sweeps a leftover modifier, so it is safe (and a no-op) to call on a clean player.
     */
    public static void resetServerSide(ServerPlayer player) {
        new RegistryAttributes.registerAttribute(player, Attributes.ATTACK_DAMAGE, 0.0D, COUNTER_ATTACK_MODIFIER).amplifyAttribute(false);
        AptitudeCapability aptitude = AptitudeCapability.get(player);
        if (aptitude == null || (!aptitude.getCounterAttack() && aptitude.getCounterAttackTimer() == 0)) return;
        aptitude.setCounterAttack(false);
        aptitude.setCounterAttackTimer(0);
        SyncAptitudeCapabilityCP.send(player);
    }

    // CLIENT-ONLY (sendToServer). Never call from a server path -- use resetServerSide.
    public static void send(boolean isCounterAttack, float modifier) {
        ServerNetworking.sendToServer(new CounterAttackSP(isCounterAttack, modifier));
    }

    public static void sendToPlayer(boolean isCounterAttack, float modifier, ServerPlayer serverPlayer){
        ServerNetworking.sendToPlayer(new CounterAttackSP(isCounterAttack, modifier), serverPlayer);
    }
}


