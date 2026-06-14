package com.iridescentcraft.relics.broker;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.trading.MerchantOffers;

/**
 * KubeJS-facing entry point for the Relic Broker Stand trade GUI.
 *
 * <p>KubeJS owns the catalog (it has astages, the Phase-A {@code relicEssenceValue} table, and
 * persistentData for B2 rotation/caps). On {@code BlockEvents.rightClicked} of
 * {@code iridescent_relics:relic_broker_stand} it builds the player-specific
 * {@link MerchantOffers} and calls {@link #open} via {@code Java.loadClass(...)}. This jar side
 * only provides the vanilla {@code MerchantMenu} plumbing — keeping every trade table in
 * script, never a jar constant.
 */
public final class RelicBroker {

    private RelicBroker() {
    }

    /**
     * Open the Broker trade GUI for {@code player} with the supplied {@code offers}.
     * Server-side only; silently no-ops off-thread/empty. {@code title} is the GUI header
     * (falls back to "Relic Broker").
     */
    public static void open(Player player, MerchantOffers offers, Component title) {
        if (!(player instanceof ServerPlayer serverPlayer)) {
            return;
        }
        if (offers == null || offers.isEmpty()) {
            serverPlayer.displayClientMessage(
                    Component.literal("The Relic Broker has nothing for you right now."), true);
            return;
        }
        RelicBrokerMerchant merchant = new RelicBrokerMerchant(offers);
        merchant.setTradingPlayer(serverPlayer);
        // Merchant's default openTradingScreen opens a MerchantMenu and sends the offers.
        merchant.openTradingScreen(serverPlayer,
                (title != null) ? title : Component.literal("Relic Broker"), 1);
    }
}
