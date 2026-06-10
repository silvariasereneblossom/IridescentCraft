package com.iridescentcraft.grandcompass.client;

import com.chaosthedude.explorerscompass.ExplorersCompass;
import com.chaosthedude.naturescompass.NaturesCompass;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * Client-only GUI opener. We open Nature's / Explorer's REAL search Screen, but
 * pass a freshly-synthesized stack of THEIR compass item — not our Grand Compass
 * — because their {@code GuiWrapper.openGUI} casts the stack to their item type
 * ({@code (NaturesCompassItem) stack.getItem()}). The synthesized stack is a
 * display vehicle only; the biome/structure list comes from the static synced
 * list their server-side {@code use()} just populated, and when the player picks
 * a target the search packet is rerouted to our native search by the mixins
 * (keyed on the Grand Compass actually in the player's hand).
 *
 * Class is only ever classloaded via DistExecutor on the physical client, so the
 * client-only GuiWrapper/Screen refs can never reach a dedicated server.
 */
public final class GrandCompassGui {

    private GrandCompassGui() {}

    public static void openBiomes(Level level, Player player) {
        if (NaturesCompass.naturesCompass == null) return;
        com.chaosthedude.naturescompass.gui.GuiWrapper.openGUI(
                level, player, new ItemStack(NaturesCompass.naturesCompass));
    }

    public static void openStructures(Level level, Player player) {
        if (ExplorersCompass.explorersCompass == null) return;
        com.chaosthedude.explorerscompass.gui.GuiWrapper.openGUI(
                level, player, new ItemStack(ExplorersCompass.explorersCompass));
    }
}
