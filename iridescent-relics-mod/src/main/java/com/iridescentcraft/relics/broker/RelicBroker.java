package com.iridescentcraft.relics.broker;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
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

    /** Key for the player's trades-used-today count (B2 ~10/day cap), inside {@link #data}. */
    public static final String TRADES_KEY = "icraft_broker_trades";

    /** Key for the world day that count belongs to, inside {@link #data}. */
    public static final String DAY_KEY = "icraft_broker_day";

    private RelicBroker() {
    }

    /**
     * Home of the Broker's per-player counters: the {@code PlayerPersisted} sub-compound of
     * the player's Forge data. That is the only part Forge carries over to the new player
     * object on death and on returning from the End ({@code ServerPlayer.restoreFrom} copies
     * nothing else). Both keys used to sit at the ROOT, so dying wiped the day stamp and the
     * count and handed the player a fresh daily cap. Values an older jar/script left at the
     * root are moved here on first use.
     */
    static CompoundTag data(Player player) {
        CompoundTag root = player.getPersistentData();
        CompoundTag persisted = root.getCompound(Player.PERSISTED_NBT_TAG);
        if (!root.contains(Player.PERSISTED_NBT_TAG, Tag.TAG_COMPOUND)) {
            root.put(Player.PERSISTED_NBT_TAG, persisted);
        }
        if (root.contains(TRADES_KEY)) {
            if (!persisted.contains(TRADES_KEY)) {
                persisted.putInt(TRADES_KEY, root.getInt(TRADES_KEY));
            }
            root.remove(TRADES_KEY);
        }
        if (root.contains(DAY_KEY)) {
            if (!persisted.contains(DAY_KEY)) {
                persisted.putLong(DAY_KEY, root.getLong(DAY_KEY));
            }
            root.remove(DAY_KEY);
        }
        return persisted;
    }

    /**
     * KubeJS calls this when the Stand is opened, with the current world day: a new day
     * clears the count. Returns the trades already used today. Keeping the reset here means
     * the script never has to know where the counters are stored.
     */
    public static int beginDay(Player player, long day) {
        CompoundTag data = data(player);
        if (!data.contains(DAY_KEY) || data.getLong(DAY_KEY) != day) {
            data.putLong(DAY_KEY, day);
            data.putInt(TRADES_KEY, 0);
        }
        return data.getInt(TRADES_KEY);
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
        if (dailyCap > 0 && data(serverPlayer).getInt(TRADES_KEY) >= dailyCap) {
            merchant.lockAllOffers();
        }
        // Merchant's default openTradingScreen opens a MerchantMenu and sends the offers.
        merchant.openTradingScreen(serverPlayer,
                (title != null) ? title : Component.literal("Relic Broker"), 1);
    }
}
