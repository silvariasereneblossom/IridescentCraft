package com.iridescentcraft.relics.broker;

import com.iridescentcraft.relics.IridescentRelics;
import javax.annotation.Nullable;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

/**
 * A standalone (non-entity) {@link Merchant} backing the Relic Broker Stand's trade GUI.
 *
 * <p>The catalog itself ({@link MerchantOffers}) is built in KubeJS (data/script per the
 * design guardrail — astages tier-gating, buy-relics via {@code relicEssenceValue}, B2
 * rotation/caps) and passed in; this class only supplies the vanilla {@code MerchantMenu}
 * the minimum it needs to render and run trades. It is deliberately NOT a villager entity,
 * so it sidesteps MCA's {@code overwriteOriginalVillagers} replacement.
 *
 * <p>The {@code default} {@link Merchant#openTradingScreen} does the menu + offer-sync; we
 * only implement the abstract surface. {@link #notifyTrade} increments the offer's use count
 * (vanilla relies on the merchant, not the menu slot, to do this — so stock/{@code maxUses}
 * limits work). The per-purchase hook for the B2 daily cap will attach here.
 */
public class RelicBrokerMerchant implements Merchant {

    @Nullable
    private Player tradingPlayer;
    private MerchantOffers offers;
    /** B2 daily purchase cap (~10/day); 0 = uncapped. The count lives in the player's
     *  persistentData under {@link RelicBroker#TRADES_KEY}; KubeJS resets it on a new world
     *  day (at open), this class only increments + locks. */
    private final int dailyCap;

    public RelicBrokerMerchant(MerchantOffers offers, int dailyCap) {
        this.offers = (offers != null) ? offers : new MerchantOffers();
        this.dailyCap = Math.max(0, dailyCap);
    }

    /** Mark every offer out of stock (greys them out). Vanilla MerchantOffer has no public
     *  setter, so increment uses to maxUses. */
    void lockAllOffers() {
        for (MerchantOffer offer : this.offers) {
            while (!offer.isOutOfStock()) {
                offer.increaseUses();
            }
        }
    }

    @Override
    public void setTradingPlayer(@Nullable Player player) {
        this.tradingPlayer = player;
    }

    @Override
    @Nullable
    public Player getTradingPlayer() {
        return this.tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        return this.offers;
    }

    @Override
    public void overrideOffers(MerchantOffers newOffers) {
        this.offers = (newOffers != null) ? newOffers : new MerchantOffers();
    }

    @Override
    public void notifyTrade(MerchantOffer offer) {
        // Vanilla AbstractVillager increments uses here (NOT in the result slot), which is
        // what makes maxUses / out-of-stock work. Mirror that.
        offer.increaseUses();

        // B2 ~10/day cap: count this trade in persistentData; at the cap, lock the whole
        // catalog (so the player can't trade more today) and tell them once. Selling relics
        // BACK to the Broker (result = essence) is an uncapped sink, so it does NOT count.
        boolean isBuyback = offer.getResult().is(IridescentRelics.RELIC_ESSENCE.get());
        if (this.dailyCap > 0 && this.tradingPlayer != null && !isBuyback) {
            int count = this.tradingPlayer.getPersistentData().getInt(RelicBroker.TRADES_KEY) + 1;
            this.tradingPlayer.getPersistentData().putInt(RelicBroker.TRADES_KEY, count);
            if (count >= this.dailyCap) {
                lockAllOffers();
                this.tradingPlayer.displayClientMessage(Component.literal(
                        "§e[Relic Broker]§7 You've used all " + this.dailyCap
                                + " of today's trades. The Broker restocks at dawn."), false);
            }
        }
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        // no-op: no demand/level progression for the Broker
    }

    @Override
    public int getVillagerXp() {
        return 0;
    }

    @Override
    public void overrideXp(int xp) {
        // no-op: the Broker has no villager XP / level progression
    }

    @Override
    public boolean showProgressBar() {
        return false;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return SoundEvents.VILLAGER_YES;
    }

    @Override
    public boolean isClientSide() {
        return this.tradingPlayer != null && this.tradingPlayer.level().isClientSide();
    }
}
