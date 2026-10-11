package com.seniors.justlevelingfork.network.packet.common;

import com.seniors.justlevelingfork.common.capability.AptitudeCapability;
import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.network.packet.client.SyncAptitudeCapabilityCP;
import com.seniors.justlevelingfork.registry.RegistrySkills;
import com.seniors.justlevelingfork.registry.skills.Skill;

import java.util.function.Supplier;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent;

public class ToggleSkillSP {
    private final String skill;
    private final boolean toggle;

    public ToggleSkillSP(Skill skill, boolean toggle) {
        this.skill = skill.getName();
        this.toggle = toggle;
    }

    public ToggleSkillSP(FriendlyByteBuf buffer) {
        this.skill = buffer.readUtf();
        this.toggle = buffer.readBoolean();
    }

    public void toBytes(FriendlyByteBuf buffer) {
        buffer.writeUtf(this.skill);
        buffer.writeBoolean(this.toggle);
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();

            if (player != null) {
                AptitudeCapability capability = AptitudeCapability.get(player);

                Skill skill = RegistrySkills.getSkill(this.skill);
                // Iridescent fork (security): mirror the screen's gating (JustLevelingScreen.createList only sends
                // this for skill.getToggle()) -- a hand-crafted packet must not arm a skill the player has not
                // unlocked, and an unknown skill name must be dropped instead of NPE-ing the handler.
                if (capability == null || skill == null || !skill.getToggle(player)) return;
                boolean setToggleSkills = capability.getToggleSkill(skill);
                capability.setToggleSkill(skill, !setToggleSkills);
                SyncAptitudeCapabilityCP.send(player);
            }
        });
        context.setPacketHandled(true);
    }

    public static void send(Skill skill, boolean toggle) {
        ServerNetworking.sendToServer(new ToggleSkillSP(skill, toggle));
    }
}


