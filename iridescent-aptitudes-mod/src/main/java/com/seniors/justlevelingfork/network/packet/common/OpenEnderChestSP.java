package com.seniors.justlevelingfork.network.packet.common;

import com.seniors.justlevelingfork.network.ServerNetworking;
import com.seniors.justlevelingfork.registry.RegistrySkills;

import java.util.function.Supplier;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.PlayerEnderChestContainer;
import net.minecraftforge.network.NetworkEvent;


public class OpenEnderChestSP {
    public OpenEnderChestSP() {
    }

    public void handle(Supplier<NetworkEvent.Context> supplier) {
        NetworkEvent.Context context = supplier.get();
        context.enqueueWork(() -> {
            ServerPlayer player = context.getSender();

            // IridescentCraft #76: WORMHOLE_STORAGE is retired (RegistrySkills.WORMHOLE_STORAGE = null). The menu
            // title deref'd .get() under only a player!=null guard -> server NPE if this packet ever arrives while
            // the skill is disabled (the ender-chest-from-inventory feature is gone). No-op when the skill is null.
            if (player != null && RegistrySkills.WORMHOLE_STORAGE != null) {
                PlayerEnderChestContainer enderChest = player.getEnderChestInventory();
                SimpleMenuProvider enderChestContainer = new SimpleMenuProvider((id, pl, b) -> ChestMenu.threeRows(id, pl, enderChest), Component.translatable(RegistrySkills.WORMHOLE_STORAGE.get().getKey()));
                player.openMenu(enderChestContainer);
            }
        });
        context.setPacketHandled(true);
    }

    public OpenEnderChestSP(FriendlyByteBuf buffer) {
    }

    public void toBytes(FriendlyByteBuf buffer) {
    }

    public static void send() {
        ServerNetworking.sendToServer(new OpenEnderChestSP());
    }
}


