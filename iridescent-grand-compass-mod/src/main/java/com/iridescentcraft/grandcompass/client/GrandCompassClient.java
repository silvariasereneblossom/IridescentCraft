package com.iridescentcraft.grandcompass.client;

import com.chaosthedude.explorerscompass.ExplorersCompass;
import com.chaosthedude.naturescompass.NaturesCompass;
import com.iridescentcraft.grandcompass.GrandCompass;
import com.iridescentcraft.grandcompass.item.GrandCompassItem;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Client-only directional HUD for the Grand Compass in Structures / Biomes mode.
 * The two compass mods point THEIR item's needle; our item is a static gold
 * model, so we read the search result they wrote onto our stack (via the
 * getHeldItem mixins) and show an action-bar heading + distance. Boss mode's HUD
 * is handled by the KubeJS boss-compass tick (which also recognises this item).
 *
 * Dist.CLIENT EventBusSubscriber — never loaded on a dedicated server, so the
 * client-class refs (Minecraft) can't crash it.
 */
@Mod.EventBusSubscriber(modid = GrandCompass.MODID, value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class GrandCompassClient {

    private static final String[] ARROWS = { "↑", "↗", "→", "↘", "↓", "↙", "←", "↖" };
    private static int ticks = 0;

    @SubscribeEvent
    public static void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (++ticks % 10 != 0) return; // ~2 Hz
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        ItemStack stack = heldGrandCompass(mc.player);
        if (stack == null) return;

        try {
            int mode = GrandCompassItem.getMode(stack);
            if (mode == GrandCompassItem.MODE_STRUCTURES) {
                var ec = ExplorersCompass.explorersCompass;
                if (ec != null && ec.getState(stack) == com.chaosthedude.explorerscompass.util.CompassState.FOUND) {
                    showHeading(mc, ec.getFoundStructureX(stack), ec.getFoundStructureZ(stack));
                }
            } else if (mode == GrandCompassItem.MODE_BIOMES) {
                var nc = NaturesCompass.naturesCompass;
                if (nc != null && nc.getState(stack) == com.chaosthedude.naturescompass.util.CompassState.FOUND) {
                    showHeading(mc, nc.getFoundBiomeX(stack), nc.getFoundBiomeZ(stack));
                }
            }
        } catch (Throwable ignored) {
            // fail-safe: if a mod's API shifts, just skip the HUD line.
        }
    }

    private static ItemStack heldGrandCompass(Player player) {
        if (player.getMainHandItem().getItem() == GrandCompass.GRAND_COMPASS.get()) return player.getMainHandItem();
        if (player.getOffhandItem().getItem() == GrandCompass.GRAND_COMPASS.get()) return player.getOffhandItem();
        return null;
    }

    private static void showHeading(Minecraft mc, int targetX, int targetZ) {
        double dx = targetX - mc.player.getX();
        double dz = targetZ - mc.player.getZ();
        int dist = (int) Math.sqrt(dx * dx + dz * dz);
        double ang = (Math.toDegrees(Math.atan2(-dx, dz)) + 360) % 360;
        String arrow = ARROWS[(int) Math.round(ang / 45.0) % 8];
        mc.player.displayClientMessage(
            Component.literal("§6" + arrow + " §bGrand Compass §7— " + dist + "m"), true);
    }
}
