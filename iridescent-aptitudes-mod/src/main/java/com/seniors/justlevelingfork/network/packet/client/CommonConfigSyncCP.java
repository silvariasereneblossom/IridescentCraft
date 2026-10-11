package com.seniors.justlevelingfork.network.packet.client;

import com.seniors.justlevelingfork.JustLevelingClient;
import com.seniors.justlevelingfork.handler.HandlerCommonConfig;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.registry.RegistryPassives;
import com.seniors.justlevelingfork.registry.passive.Passive;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Client packet to update static config options that needs to match server.
 * Must only be sent on player join.
 *
 * Iridescent fork -- rewritten payload (channel protocol "2", see ServerNetworking):
 *   - carries what the client UI actually reads: the #76 aptitude-cost curve (so the level-up button + tooltip
 *     agree with AptitudeLevelUpSP on the server) and the max-level value of EVERY registered passive (incl. the
 *     fork's spell_power / mana_regen / crit_chance) for the passive tooltips;
 *   - no longer carries the 33 dead upstream fields: the unused aptitudeFirstCostLevel, the 3 removed passives'
 *     values and the 29 retired-skill parameters (incl. the Treasure Hunter / Convergence item lists, which were
 *     shipped as Java-serialised blobs and read back with ObjectInputStream);
 *   - is applied IN MEMORY only. The client used to HANDLER.save() the server's values over the player's own
 *     config file on every login; now the local values are remembered and put back on logout.
 */
public class CommonConfigSyncCP {

    // CLIENT: this client's own values, captured right before the first remote value is applied.
    private static CommonConfigSyncCP localSnapshot;

    private final boolean dropLockedItems;
    private final boolean displayTitlesAsPrefix;

    // #76 cumulative-level cost curve (AptitudeLevelUpSP.requiredExperienceLevels / requiredPoints)
    private final int aptitudeCostBaseLevels;
    private final float aptitudeCostDoubling;
    private final int aptitudeCostTreeSize;
    private final float aptitudeCostRampShape;
    private final int aptitudeCostXpPerLevel;

    // passive name -> value at max level, for every passive registered on the sending side
    private final Map<String, Double> passiveValues = new LinkedHashMap<>();

    /**
     * Captures THIS side's effective values: the server's when the packet is sent, the client's own for the
     * logout restore. Passive values come from the registered passives (what the server really applies), not
     * from the config fields they were built from.
     */
    public CommonConfigSyncCP() {
        HandlerCommonConfig config = HandlerCommonConfig.HANDLER.instance();
        dropLockedItems = config.dropLockedItems;
        displayTitlesAsPrefix = config.displayTitlesAsPrefix;
        aptitudeCostBaseLevels = config.aptitudeCostBaseLevels;
        aptitudeCostDoubling = config.aptitudeCostDoubling;
        aptitudeCostTreeSize = config.aptitudeCostTreeSize;
        aptitudeCostRampShape = config.aptitudeCostRampShape;
        aptitudeCostXpPerLevel = config.aptitudeCostXpPerLevel;
        for (Passive passive : RegistryPassives.PASSIVES_REGISTRY.get().getValues()) {
            passiveValues.put(passive.getName(), passive.getValue());
        }
    }

    public CommonConfigSyncCP(FriendlyByteBuf buffer) {
        dropLockedItems = buffer.readBoolean();
        displayTitlesAsPrefix = buffer.readBoolean();
        aptitudeCostBaseLevels = buffer.readInt();
        aptitudeCostDoubling = buffer.readFloat();
        aptitudeCostTreeSize = buffer.readInt();
        aptitudeCostRampShape = buffer.readFloat();
        aptitudeCostXpPerLevel = buffer.readInt();
        int passiveCount = buffer.readVarInt();
        for (int i = 0; i < passiveCount; i++) {
            String name = buffer.readUtf();
            passiveValues.put(name, buffer.readDouble());
        }
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeBoolean(this.dropLockedItems);
        buffer.writeBoolean(this.displayTitlesAsPrefix);
        buffer.writeInt(this.aptitudeCostBaseLevels);
        buffer.writeFloat(this.aptitudeCostDoubling);
        buffer.writeInt(this.aptitudeCostTreeSize);
        buffer.writeFloat(this.aptitudeCostRampShape);
        buffer.writeInt(this.aptitudeCostXpPerLevel);
        buffer.writeVarInt(this.passiveValues.size());
        for (Map.Entry<String, Double> entry : this.passiveValues.entrySet()) {
            buffer.writeUtf(entry.getKey());
            buffer.writeDouble(entry.getValue());
        }
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            // CLIENT thread. The integrated-server host shares the config + registries with its own server.
            if (JustLevelingClient.hostsIntegratedServer()) return;
            if (localSnapshot == null) localSnapshot = new CommonConfigSyncCP();
            apply();
        });
        context.setPacketHandled(true);
    }

    /** CLIENT, on logout (JustLevelingClient.onLoggingOut): put this client's own values back. */
    public static void restoreLocal() {
        CommonConfigSyncCP local = localSnapshot;
        if (local == null) return;
        localSnapshot = null;
        local.apply();
    }

    // In memory only -- never HANDLER.save() from here: that wrote the server's values into the player's file.
    private void apply() {
        HandlerCommonConfig config = HandlerCommonConfig.HANDLER.instance();
        config.dropLockedItems = this.dropLockedItems;
        config.displayTitlesAsPrefix = this.displayTitlesAsPrefix;
        config.aptitudeCostBaseLevels = this.aptitudeCostBaseLevels;
        config.aptitudeCostDoubling = this.aptitudeCostDoubling;
        config.aptitudeCostTreeSize = this.aptitudeCostTreeSize;
        config.aptitudeCostRampShape = this.aptitudeCostRampShape;
        config.aptitudeCostXpPerLevel = this.aptitudeCostXpPerLevel;
        // A Passive captures its value at registration, so the config field alone would not reach the tooltip.
        for (Passive passive : RegistryPassives.PASSIVES_REGISTRY.get().getValues()) {
            Double value = this.passiveValues.get(passive.getName());
            if (value != null) passive.attributeValue = value;
        }
    }

    public static void sendToPlayer(Player player) {
        ServerNetworking.sendToPlayer(new CommonConfigSyncCP(), (ServerPlayer) player);
    }
}
