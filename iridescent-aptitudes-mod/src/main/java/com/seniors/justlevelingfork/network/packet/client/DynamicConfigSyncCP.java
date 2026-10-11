package com.seniors.justlevelingfork.network.packet.client;

import com.seniors.justlevelingfork.JustLevelingClient;
import com.seniors.justlevelingfork.handler.HandlerCommonConfig;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.registry.RegistryPassives;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import com.seniors.justlevelingfork.registry.passive.Passive;
import com.seniors.justlevelingfork.registry.skills.Skill;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraftforge.network.NetworkEvent;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Client packet to update dynamic config options.
 * Can be sent multiple times during a player session.
 *
 * Iridescent fork -- rewritten payload (channel protocol "2", see ServerNetworking):
 *   - the two level caps, plus -- read straight from the registries, so nothing is hand-listed -- the level
 *     ladder of EVERY registered passive and the required level of EVERY registered skill (the fork's 40 design
 *     nodes and spell_power / mana_regen / crit_chance were never synced);
 *   - no longer carries the 24 retired upstream skill levels or the 3 removed passives' ladders (and no longer
 *     encodes the ladders as one "a,b-c,d" string);
 *   - is applied IN MEMORY only. The client used to HANDLER.save() the server's values over the player's own
 *     config file on every login; now the local values are remembered and put back on logout.
 */
public class DynamicConfigSyncCP {

    // CLIENT: this client's own values, captured right before the first remote value is applied.
    private static DynamicConfigSyncCP localSnapshot;

    private final int aptitudeMaxLevel;
    private final int playersMaxGlobalLevel;

    // passive name -> aptitude levels at which each passive level unlocks
    private final Map<String, int[]> passiveLevels = new LinkedHashMap<>();
    // skill name -> aptitude level that unlocks it (only skills registered on the sending side)
    private final Map<String, Integer> skillLevels = new LinkedHashMap<>();

    /**
     * Captures THIS side's effective values: the server's when the packet is sent, the client's own for the
     * logout restore. Ladders / required levels come from the registered passives and skills (what the server
     * really enforces in PassiveLevelUpSP / ToggleSkillSP), not from the config fields they were built from.
     */
    public DynamicConfigSyncCP(){
        HandlerCommonConfig config = HandlerCommonConfig.HANDLER.instance();
        aptitudeMaxLevel = config.aptitudeMaxLevel;
        playersMaxGlobalLevel = config.playersMaxGlobalLevel;
        for (Passive passive : RegistryPassives.PASSIVES_REGISTRY.get().getValues()) {
            passiveLevels.put(passive.getName(), passive.levelsRequired);
        }
        for (Skill skill : RegistrySkills.SKILLS_REGISTRY.get().getValues()) {
            skillLevels.put(skill.getName(), skill.requiredLevel);
        }
    }

    public DynamicConfigSyncCP(FriendlyByteBuf buffer){
        aptitudeMaxLevel = buffer.readInt();
        playersMaxGlobalLevel = buffer.readInt();
        int passiveCount = buffer.readVarInt();
        for (int i = 0; i < passiveCount; i++) {
            String name = buffer.readUtf();
            passiveLevels.put(name, buffer.readVarIntArray());
        }
        int skillCount = buffer.readVarInt();
        for (int i = 0; i < skillCount; i++) {
            String name = buffer.readUtf();
            skillLevels.put(name, buffer.readInt());
        }
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeInt(this.aptitudeMaxLevel);
        buffer.writeInt(this.playersMaxGlobalLevel);
        buffer.writeVarInt(this.passiveLevels.size());
        for (Map.Entry<String, int[]> entry : this.passiveLevels.entrySet()) {
            buffer.writeUtf(entry.getKey());
            buffer.writeVarIntArray(entry.getValue());
        }
        buffer.writeVarInt(this.skillLevels.size());
        for (Map.Entry<String, Integer> entry : this.skillLevels.entrySet()) {
            buffer.writeUtf(entry.getKey());
            buffer.writeInt(entry.getValue());
        }
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            // CLIENT thread. The integrated-server host shares the config + registries with its own server.
            if (JustLevelingClient.hostsIntegratedServer()) return;
            if (localSnapshot == null) localSnapshot = new DynamicConfigSyncCP();
            apply();
        });
        context.setPacketHandled(true);
    }

    /** CLIENT, on logout (JustLevelingClient.onLoggingOut): put this client's own values back. */
    public static void restoreLocal() {
        DynamicConfigSyncCP local = localSnapshot;
        if (local == null) return;
        localSnapshot = null;
        local.apply();
    }

    // In memory only -- never HANDLER.save() from here: that wrote the server's values into the player's file.
    private void apply() {
        HandlerCommonConfig config = HandlerCommonConfig.HANDLER.instance();
        config.aptitudeMaxLevel = this.aptitudeMaxLevel;
        config.playersMaxGlobalLevel = this.playersMaxGlobalLevel;
        // Passives and skills capture their levels at registration, so the config fields alone would not reach
        // the screen (button gating, tooltips).
        for (Passive passive : RegistryPassives.PASSIVES_REGISTRY.get().getValues()) {
            int[] levels = this.passiveLevels.get(passive.getName());
            if (levels != null && levels.length > 0) passive.levelsRequired = levels;
        }
        for (Skill skill : RegistrySkills.SKILLS_REGISTRY.get().getValues()) {
            // Not in the packet = not registered on the sending side (disabled there): show it as off.
            Integer level = this.skillLevels.get(skill.getName());
            skill.requiredLevel = level != null ? level : -1;
        }
    }

    public static void sendToPlayer(Player player) {
        ServerNetworking.sendToPlayer(new DynamicConfigSyncCP(), (ServerPlayer) player);
    }

    public static void sendToAllPlayers(){
        ServerNetworking.sendToAllClients(new DynamicConfigSyncCP());
    }

}
