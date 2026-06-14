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

    /** persistentData key for the player's trades-used-today count (B2 ~10/day cap).
     *  SHARED with KubeJS economy/relic_broker.js, which resets it on a new world day. */
    public static final String TRADES_KEY = "icraft_broker_trades";

    private RelicBroker() {
    }

    /** Uncapped open (B1 compatibility). */
    public static void open(Player player, MerchantOffers offers, Component title) {
        open(player, offers, title, 0);
    }

    /**
     * Open the Broker trade GUI for {@code player} with the supplied {@code offers}.
     * Server-side only; silently no-ops off-thread/empty. {@code title} falls back to
     * "Relic Broker". {@code dailyCap} (&gt;0) caps trades/day via the Merchant's notifyTrade;
     * a same-day reopen after the cap was hit pre-locks the catalog.
     */
    public static void open(Player player, MerchantOffers offers, Component title, int dailyCap) {
        if (!(player instanceof ServerPlayer serverPlayer)) {
            return;
        }
        if (offers == null || offers.isEmpty()) {
            serverPlayer.displayClientMessage(
                    Component.literal("The Relic Broker has nothing for you right now."), true);
            return;
        }
        RelicBrokerMerchant merchant = new RelicBrokerMerchant(offers, dailyCap);
        merchant.setTradingPlayer(serverPlayer);
        if (dailyCap > 0 && serverPlayer.getPersistentData().getInt(TRADES_KEY) >= dailyCap) {
            merchant.lockAllOffers();
        }
        // Merchant's default openTradingScreen opens a MerchantMenu and sends the offers.
        merchant.openTradingScreen(serverPlayer,
                (title != null) ? title : Component.literal("Relic Broker"), 1);
    }
}
